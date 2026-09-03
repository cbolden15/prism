import { normalizeJsonValue } from "./json-value.js";
import {
  isFlatPluginFile,
  isPluginId,
  normalizeManifest,
  type NormalizedManifest,
} from "./manifest/plugin-manifest.js";
import {
  CAPABILITY_LIMIT_VERSION,
  PLUGIN_KERNEL_API_VERSION,
} from "./manifest/registry.js";
import type { JsonValue } from "./protocol.js";

export const TOOL_AUTHORING_FIXTURE_VERSION = "prism-tool-authoring-fixture-v1" as const;
export const MAX_PLUGIN_ID_BYTES = 64;
export const MAX_PLUGIN_MANIFEST_BYTES = 65_536;
export const MAX_DECLARED_PLUGIN_FILES = 16;
export const MAX_PLUGIN_FILE_BYTES = 262_144;
export const MAX_PLUGIN_SCAFFOLD_BYTES = 1_000_000;
export const MAX_TOOL_AUTHORING_JSON_BYTES = 65_536;

const FIXTURE_KEYS = ["version", "operation", "input", "expected"] as const;
const FILE_KEYS = ["path", "contents"] as const;
const AUTHORING_SIDECARS = ["README.md", "index.test.mjs"] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface ToolAuthoringFixture {
  readonly version: typeof TOOL_AUTHORING_FIXTURE_VERSION;
  readonly operation: string;
  readonly input: JsonValue;
  readonly expected: JsonValue;
}

export interface ToolPluginScaffoldFile {
  readonly path: string;
  readonly contents: string;
}

export type ToolPluginScaffold = readonly ToolPluginScaffoldFile[];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function jsonBytes(value: JsonValue): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function validateToolAuthoringFixture(value: unknown): ToolAuthoringFixture | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, FIXTURE_KEYS)) return null;
  if (value.version !== TOOL_AUTHORING_FIXTURE_VERSION || !isPluginId(value.operation)) return null;
  const input = normalizeJsonValue(value.input);
  const expected = normalizeJsonValue(value.expected);
  if (
    input === undefined
    || expected === undefined
    || jsonBytes(input) > MAX_TOOL_AUTHORING_JSON_BYTES
    || jsonBytes(expected) > MAX_TOOL_AUTHORING_JSON_BYTES
  ) {
    return null;
  }
  return Object.freeze({
    version: TOOL_AUTHORING_FIXTURE_VERSION,
    operation: value.operation,
    input,
    expected,
  });
}

export function parseToolPluginManifest(bytes: Uint8Array): NormalizedManifest | null {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PLUGIN_MANIFEST_BYTES) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  const manifest = normalizeManifest(parsed);
  if (manifest === null || manifest.kind !== "tool" || manifest.files.length > MAX_DECLARED_PLUGIN_FILES) return null;
  return manifest;
}

export function validateToolPluginScaffold(value: unknown): ToolPluginScaffold | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_DECLARED_PLUGIN_FILES + 1 + AUTHORING_SIDECARS.length) return null;
  const files: ToolPluginScaffoldFile[] = [];
  let previousPath = "";
  let totalBytes = 0;
  for (const raw of value) {
    if (!isPlainRecord(raw) || !hasExactDataKeys(raw, FILE_KEYS)) return null;
    if (
      typeof raw.path !== "string"
      || (raw.path !== "manifest.json" && !isFlatPluginFile(raw.path))
      || raw.path <= previousPath
      || typeof raw.contents !== "string"
    ) {
      return null;
    }
    const byteLength = encoder.encode(raw.contents).byteLength;
    if (byteLength > MAX_PLUGIN_FILE_BYTES) return null;
    totalBytes += byteLength;
    if (totalBytes > MAX_PLUGIN_SCAFFOLD_BYTES) return null;
    files.push(Object.freeze({ path: raw.path, contents: raw.contents }));
    previousPath = raw.path;
  }

  const manifestFile = files.find(({ path }) => path === "manifest.json");
  if (manifestFile === undefined) return null;
  const manifestBytes = encoder.encode(manifestFile.contents);
  const manifest = parseToolPluginManifest(manifestBytes);
  if (manifest === null) return null;
  const requiredPaths = ["manifest.json", ...manifest.files];
  const permittedPaths = new Set([...requiredPaths, ...AUTHORING_SIDECARS]);
  if (
    requiredPaths.some((path) => !files.some((file) => file.path === path))
    || files.some((file) => !permittedPaths.has(file.path))
  ) return null;
  return Object.freeze(files);
}

function toolManifest(pluginId: string): NormalizedManifest {
  const manifest = normalizeManifest({
    id: pluginId,
    version: "1.0.0",
    apiVersion: 1,
    kind: "tool",
    compatibility: { kernelApiVersion: PLUGIN_KERNEL_API_VERSION },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: [
      {
        id: "tool-operation",
        limit: {
          schema: "boolean-gate",
          version: CAPABILITY_LIMIT_VERSION,
          enabled: true,
        },
      },
    ],
    license: { spdxId: "MIT", holder: "Prism plugin author" },
  });
  if (manifest === null) throw new Error("invalid built-in tool manifest");
  return manifest;
}

function entrypoint(pluginId: string): string {
  return `export const prismToolAuthoringFixture = Object.freeze({
  version: "${TOOL_AUTHORING_FIXTURE_VERSION}",
  operation: "echo",
  input: Object.freeze({ message: "Hello from Prism." }),
  expected: Object.freeze({ echoed: "Hello from Prism." }),
});

export async function handle(request) {
  if (request?.phase === "register") {
    return { kind: "tool", pluginId: "${pluginId}", operations: ["echo"] };
  }
  if (request?.phase === "operate" && request.payload?.operation === "echo") {
    const input = request.payload.input;
    if (typeof input !== "object" || input === null || typeof input.message !== "string") {
      throw new Error("echo requires a message string");
    }
    return { echoed: input.message };
  }
  throw new Error("unsupported tool request");
}
`;
}

function generatedTest(pluginId: string): string {
  return `import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, prismToolAuthoringFixture } from "./index.mjs";

test("generated tool registers and runs its authoring fixture", async () => {
  assert.deepEqual(await handle({ phase: "register" }), {
    kind: "tool",
    pluginId: "${pluginId}",
    operations: [prismToolAuthoringFixture.operation],
  });
  assert.deepEqual(await handle({
    phase: "operate",
    payload: {
      operation: prismToolAuthoringFixture.operation,
      input: prismToolAuthoringFixture.input,
    },
  }), prismToolAuthoringFixture.expected);
});
`;
}

function readme(pluginId: string): string {
  return `# ${pluginId}

This is a Prism tool-plugin scaffold with one echo operation.

Run its generated test:

\`\`\`sh
node --test index.test.mjs
\`\`\`

Check its manifest, registration, and fixture:

\`\`\`sh
prism plugin check .
\`\`\`

The check command executes this plugin in a subprocess with ambient host authority. It is not a sandbox.
`;
}

export function createToolPluginScaffold(pluginId: string): ToolPluginScaffold | null {
  if (!isPluginId(pluginId) || encoder.encode(pluginId).byteLength > MAX_PLUGIN_ID_BYTES) return null;
  const manifest = `${JSON.stringify(toolManifest(pluginId), null, 2)}\n`;
  return validateToolPluginScaffold([
    { path: "README.md", contents: readme(pluginId) },
    { path: "index.mjs", contents: entrypoint(pluginId) },
    { path: "index.test.mjs", contents: generatedTest(pluginId) },
    { path: "manifest.json", contents: manifest },
  ]);
}
