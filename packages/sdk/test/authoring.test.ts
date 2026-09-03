import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  MAX_DECLARED_PLUGIN_FILES,
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_ID_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  MAX_TOOL_AUTHORING_JSON_BYTES,
  TOOL_AUTHORING_FIXTURE_VERSION,
  createToolPluginScaffold,
  parseToolPluginManifest,
  validateToolAuthoringFixture,
  validateToolPluginScaffold,
} from "@useprism/sdk/authoring";
import { MAX_JSON_DEPTH } from "@useprism/sdk";
import {
  CAPABILITY_LIMIT_VERSION,
  PLUGIN_KERNEL_API_VERSION,
} from "@useprism/sdk/manifest";

const encoder = new TextEncoder();

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "my-tool",
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
    ...overrides,
  };
}

function manifestText(value = manifest()): string {
  return `${JSON.stringify(value)}\n`;
}

function filesFor(value = manifest(), contents: Readonly<Record<string, string>> = {}): Array<{
  path: string;
  contents: string;
}> {
  const declared = value.files as string[];
  return [
    ...declared.map((path) => ({ path, contents: contents[path] ?? "export const value = true;\n" })),
    { path: "manifest.json", contents: manifestText(value) },
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function filesWithAuthoringSidecars(
  value = manifest(),
  contents: Readonly<Record<string, string>> = {},
): Array<{ path: string; contents: string }> {
  return [
    ...filesFor(value, contents),
    ...(value.files as string[]).includes("README.md") ? [] : [
      { path: "README.md", contents: contents["README.md"] ?? "# my-tool\n" },
    ],
    ...(value.files as string[]).includes("index.test.mjs") ? [] : [
      { path: "index.test.mjs", contents: contents["index.test.mjs"] ?? "export {};\n" },
    ],
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nestedJson(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

test("the deterministic tool scaffold freezes the exact four generated files", () => {
  const first = createToolPluginScaffold("my-tool");
  const second = createToolPluginScaffold("my-tool");
  assert.notEqual(first, null);
  assert.deepEqual(first, second);
  assert.deepEqual(first?.map(({ path, contents }) => ({
    path,
    bytes: encoder.encode(contents).byteLength,
    sha256: digest(contents),
  })), [
    {
      path: "README.md",
      bytes: 322,
      sha256: "7ac86ec3f44482adaba089a5e40376236a21af1681d10e2426bd637c0d2a95c5",
    },
    {
      path: "index.mjs",
      bytes: 768,
      sha256: "ae807476801e9a790dfb00ec00e88d70fe85b7f3cd4cb51a7360b29e82957faa",
    },
    {
      path: "index.test.mjs",
      bytes: 606,
      sha256: "a9dd38258bc6793fa24429ae3897d4930b5c79e358473e96a7cffe508c67b1cb",
    },
    {
      path: "manifest.json",
      bytes: 514,
      sha256: "ec430289e6834e468465a31c97a2953f216f47bb446d98cadf586f537a9ed66c",
    },
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first?.every(Object.isFrozen), true);

  const manifestFile = first?.find(({ path }) => path === "manifest.json");
  assert.ok(manifestFile);
  assert.deepEqual(JSON.parse(manifestFile.contents), manifest({
    files: ["index.mjs"],
  }));
  assert.match(first?.find(({ path }) => path === "index.mjs")?.contents ?? "", /prismToolAuthoringFixture/);
  assert.match(first?.find(({ path }) => path === "README.md")?.contents ?? "", /ambient host authority/);
});

test("plugin IDs accept the exact SDK boundary and reject invalid package-like forms", () => {
  assert.equal(MAX_PLUGIN_ID_BYTES, 64);
  assert.notEqual(createToolPluginScaffold("a".repeat(MAX_PLUGIN_ID_BYTES)), null);
  assert.equal(createToolPluginScaffold("a".repeat(MAX_PLUGIN_ID_BYTES + 1)), null);
  for (const invalid of ["", "-tool", "Tool", "my.tool", "my_tool", "@scope/tool", "../tool", "a/b"]) {
    assert.equal(createToolPluginScaffold(invalid), null, invalid);
  }
});

test("authoring fixtures are exact, deeply normalized, immutable, and byte-bounded", () => {
  const source = {
    version: TOOL_AUTHORING_FIXTURE_VERSION,
    operation: "echo",
    input: { z: [null, true], a: "value" },
    expected: { echoed: "value" },
  };
  const validated = validateToolAuthoringFixture(source);
  assert.deepEqual(validated, {
    version: "prism-tool-authoring-fixture-v1",
    operation: "echo",
    input: { a: "value", z: [null, true] },
    expected: { echoed: "value" },
  });
  assert.ok(validated);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.input), true);
  assert.equal(Object.isFrozen((validated.input as { z: unknown }).z), true);
  (source.input as { a: string }).a = "changed";
  assert.equal((validated.input as { a: string }).a, "value");

  const exact = "x".repeat(MAX_TOOL_AUTHORING_JSON_BYTES - 2);
  const oneBeyond = `${exact}x`;
  for (const field of ["input", "expected"] as const) {
    assert.notEqual(validateToolAuthoringFixture({
      version: TOOL_AUTHORING_FIXTURE_VERSION,
      operation: "echo",
      input: null,
      expected: null,
      [field]: exact,
    }), null, `${field} boundary`);
    assert.equal(validateToolAuthoringFixture({
      version: TOOL_AUTHORING_FIXTURE_VERSION,
      operation: "echo",
      input: null,
      expected: null,
      [field]: oneBeyond,
    }), null, `${field} one beyond`);
    assert.notEqual(validateToolAuthoringFixture({
      version: TOOL_AUTHORING_FIXTURE_VERSION,
      operation: "echo",
      input: null,
      expected: null,
      [field]: nestedJson(MAX_JSON_DEPTH),
    }), null, `${field} depth boundary`);
    assert.equal(validateToolAuthoringFixture({
      version: TOOL_AUTHORING_FIXTURE_VERSION,
      operation: "echo",
      input: null,
      expected: null,
      [field]: nestedJson(MAX_JSON_DEPTH + 1),
    }), null, `${field} depth one beyond`);
  }
  assert.equal(validateToolAuthoringFixture({ ...source, extra: true }), null);
  assert.equal(validateToolAuthoringFixture({ ...source, version: "future" }), null);
  assert.equal(validateToolAuthoringFixture({ ...source, operation: "Echo" }), null);

  const accessor = { ...source };
  Object.defineProperty(accessor, "input", { enumerable: true, get: () => ({ secret: true }) });
  assert.equal(validateToolAuthoringFixture(accessor), null);
  assert.equal(validateToolAuthoringFixture(Object.assign(Object.create({ inherited: true }), source)), null);
});

test("tool manifests accept their byte and declared-file boundaries and reject one beyond", () => {
  const base = manifestText();
  const exactBytes = encoder.encode(`${base}${" ".repeat(MAX_PLUGIN_MANIFEST_BYTES - encoder.encode(base).byteLength)}`);
  assert.equal(exactBytes.byteLength, MAX_PLUGIN_MANIFEST_BYTES);
  assert.notEqual(parseToolPluginManifest(exactBytes), null);
  assert.equal(parseToolPluginManifest(new Uint8Array([...exactBytes, 0x20])), null);
  assert.equal(parseToolPluginManifest(new Uint8Array([0xff])), null);
  assert.equal(parseToolPluginManifest(encoder.encode(manifestText(manifest({ kind: "provider" })))), null);

  const boundedFiles = Array.from(
    { length: MAX_DECLARED_PLUGIN_FILES },
    (_unused, index) => index === 0 ? "index.mjs" : `file-${String(index).padStart(2, "0")}.mjs`,
  ).sort();
  assert.notEqual(parseToolPluginManifest(encoder.encode(manifestText(manifest({ files: boundedFiles })))), null);
  assert.equal(parseToolPluginManifest(encoder.encode(manifestText(manifest({
    files: [...boundedFiles, "overflow.mjs"].sort(),
  })))), null);
});

test("scaffold maps enforce sorting, closed paths, per-file bytes, total bytes, and immutability", () => {
  const source = filesFor();
  const validated = validateToolPluginScaffold(source);
  assert.deepEqual(validated, source);
  assert.ok(validated);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(validated.every(Object.isFrozen), true);
  source[0]!.contents = "changed";
  assert.notEqual(validated[0]!.contents, "changed");

  assert.equal(validateToolPluginScaffold([...filesFor()].reverse()), null);
  assert.equal(validateToolPluginScaffold([
    ...filesFor(),
    { path: "manifest.json", contents: manifestText() },
  ].sort((left, right) => left.path.localeCompare(right.path))), null);

  const newScaffold = filesWithAuthoringSidecars();
  assert.notEqual(validateToolPluginScaffold(newScaffold), null);
  assert.notEqual(validateToolPluginScaffold(filesFor()), null);
  assert.notEqual(validateToolPluginScaffold(filesWithAuthoringSidecars(manifest({
    files: ["README.md", "index.mjs", "index.test.mjs"],
  }))), null);
  assert.equal(validateToolPluginScaffold(filesFor(manifest({ files: ["../index.mjs"] }))), null);
  assert.equal(validateToolPluginScaffold([
    ...filesFor(),
    { path: "undeclared.mjs", contents: "export {};\n" },
  ].sort((left, right) => left.path.localeCompare(right.path))), null);

  const exactFile = filesFor(manifest(), { "index.mjs": "x".repeat(MAX_PLUGIN_FILE_BYTES) });
  assert.notEqual(validateToolPluginScaffold(exactFile), null);
  const oversizedFile = filesFor(manifest(), { "index.mjs": "x".repeat(MAX_PLUGIN_FILE_BYTES + 1) });
  assert.equal(validateToolPluginScaffold(oversizedFile), null);
  assert.equal(validateToolPluginScaffold(filesWithAuthoringSidecars(manifest(), {
    "README.md": "x".repeat(MAX_PLUGIN_FILE_BYTES + 1),
  })), null);

  const paths = ["a.mjs", "b.mjs", "c.mjs", "index.mjs"];
  const totalManifest = manifest({ files: paths });
  const totalManifestText = manifestText(totalManifest);
  const remaining = MAX_PLUGIN_SCAFFOLD_BYTES
    - encoder.encode(totalManifestText).byteLength
    - (MAX_PLUGIN_FILE_BYTES * 3);
  const exactTotal = filesFor(totalManifest, {
    "a.mjs": "a".repeat(MAX_PLUGIN_FILE_BYTES),
    "b.mjs": "b".repeat(MAX_PLUGIN_FILE_BYTES),
    "c.mjs": "c".repeat(MAX_PLUGIN_FILE_BYTES),
    "index.mjs": "i".repeat(remaining),
  });
  assert.notEqual(validateToolPluginScaffold(exactTotal), null);
  const oneBeyondTotal = exactTotal.map((file) => (
    file.path === "index.mjs" ? { ...file, contents: `${file.contents}i` } : file
  ));
  assert.equal(validateToolPluginScaffold(oneBeyondTotal), null);

  const accessor = filesFor();
  Object.defineProperty(accessor[0], "contents", { enumerable: true, get: () => "secret" });
  assert.equal(validateToolPluginScaffold(accessor), null);
});
