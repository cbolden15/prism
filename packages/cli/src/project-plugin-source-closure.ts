import { parse, type Node } from "acorn";
import { base } from "acorn-walk";
import {
  MAX_DECLARED_PLUGIN_FILES,
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  parseToolPluginManifest,
} from "@useprism/sdk/authoring";
import type { CapturedPluginBytes } from "@useprism/sdk/node/registry";

export type ProjectPluginSourceClosureInput = CapturedPluginBytes;

export interface ProjectPluginSourceClosureEdge {
  readonly from: string;
  readonly specifier: string;
  readonly to: string;
}

export interface ProjectPluginSourceClosureGraph {
  readonly pluginId: string;
  readonly entrypoint: string;
  readonly files: readonly string[];
  readonly edges: readonly ProjectPluginSourceClosureEdge[];
}

export type ProjectPluginSourceClosureError =
  | { readonly code: "input-invalid" }
  | { readonly code: "manifest-invalid" }
  | { readonly code: "manifest-dependencies" }
  | { readonly code: "plugin-id-mismatch" }
  | { readonly code: "runtime-files-invalid" }
  | { readonly code: "encoding-invalid"; readonly file: string }
  | { readonly code: "parse-invalid"; readonly file: string }
  | { readonly code: "specifier-unsupported"; readonly file: string; readonly specifier: string }
  | { readonly code: "path-escape"; readonly file: string; readonly specifier: string }
  | { readonly code: "unresolved-import"; readonly file: string; readonly specifier: string }
  | { readonly code: "dynamic-import"; readonly file: string }
  | { readonly code: "require-call"; readonly file: string }
  | { readonly code: "import-meta"; readonly file: string }
  | { readonly code: "unreachable-file"; readonly file: string };

export type ProjectPluginSourceClosureResult =
  | { readonly ok: true; readonly graph: ProjectPluginSourceClosureGraph }
  | { readonly ok: false; readonly error: ProjectPluginSourceClosureError };

interface CapturedRuntimeFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

interface ValidatedInput extends ProjectPluginSourceClosureInput {
  readonly runtimeFiles: readonly CapturedRuntimeFile[];
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")?.get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;

type BaseWalker = (
  node: Node,
  state: undefined,
  callback: (child: Node, state: undefined, override?: string) => void,
) => void;

interface WalkFrame {
  readonly node: Node;
  readonly override?: string;
  readonly exit: boolean;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length
    && keys.every((key) => expected.includes(key))
    && Reflect.ownKeys(record).every((key) => typeof key === "string" && keys.includes(key))
    && expected.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor !== undefined
        && descriptor.enumerable
        && descriptor.get === undefined
        && descriptor.set === undefined;
    });
}

function isDenseDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[value.length] !== "length") return false;
  for (let index = 0; index < value.length; index += 1) {
    if (keys[index] !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      return false;
    }
  }
  const length = Object.getOwnPropertyDescriptor(value, "length");
  return length !== undefined && !length.enumerable && length.get === undefined && length.set === undefined;
}

function copyBoundedUint8Array(value: unknown, maxBytes: number): Uint8Array | null {
  if (
    typedArrayByteLength === undefined
    || typedArrayByteOffset === undefined
    || typedArrayBuffer === undefined
    || typedArrayTag === undefined
  ) return null;
  try {
    if (Reflect.apply(typedArrayTag, value, []) !== "Uint8Array") return null;
    const byteLength = Reflect.apply(typedArrayByteLength, value, []) as number;
    if (byteLength > maxBytes) return null;
    const byteOffset = Reflect.apply(typedArrayByteOffset, value, []) as number;
    const buffer = Reflect.apply(typedArrayBuffer, value, []) as ArrayBufferLike;
    if (!(buffer instanceof ArrayBuffer)) return null;
    const copy = new Uint8Array(byteLength);
    copy.set(new Uint8Array(buffer, byteOffset, byteLength));
    return copy;
  } catch {
    return null;
  }
}

function walkFullIterative(root: Node, visit: (node: Node) => void): boolean {
  const walkers = base as unknown as Readonly<Record<string, BaseWalker | undefined>>;
  const pending: WalkFrame[] = [{ node: root, exit: false }];
  let lastVisited: Node | undefined;

  while (pending.length > 0) {
    const frame = pending.pop() as WalkFrame;
    if (frame.exit) {
      if (lastVisited !== frame.node) {
        visit(frame.node);
        lastVisited = frame.node;
      }
      continue;
    }

    const walker = walkers[frame.override ?? frame.node.type];
    if (walker === undefined) return false;
    const children: WalkFrame[] = [];
    try {
      walker(frame.node, undefined, (child, _state, override) => {
        children.push(override === undefined
          ? { node: child, exit: false }
          : { node: child, override, exit: false });
      });
    } catch {
      return false;
    }
    pending.push({ node: frame.node, exit: true });
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index] as WalkFrame);
  }
  return true;
}

function validateInput(value: unknown): ValidatedInput | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, ["pluginId", "manifestBytes", "runtimeFiles"])) return null;
  if (typeof value.pluginId !== "string" || !isDenseDataArray(value.runtimeFiles)) return null;
  const manifestBytes = copyBoundedUint8Array(value.manifestBytes, MAX_PLUGIN_MANIFEST_BYTES);
  if (manifestBytes === null) return null;
  if (
    manifestBytes.byteLength === 0
    || value.runtimeFiles.length === 0
    || value.runtimeFiles.length > MAX_DECLARED_PLUGIN_FILES
  ) return null;

  let totalBytes = manifestBytes.byteLength;
  const runtimeFiles: CapturedRuntimeFile[] = [];
  for (const file of value.runtimeFiles) {
    if (!isPlainRecord(file) || !hasExactDataKeys(file, ["name", "bytes"])) return null;
    if (typeof file.name !== "string") return null;
    const bytes = copyBoundedUint8Array(file.bytes, MAX_PLUGIN_FILE_BYTES);
    if (bytes === null) return null;
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_PLUGIN_SCAFFOLD_BYTES) return null;
    runtimeFiles.push({ name: file.name, bytes });
  }
  return { pluginId: value.pluginId, manifestBytes, runtimeFiles };
}

function failure(error: ProjectPluginSourceClosureError): ProjectPluginSourceClosureResult {
  return Object.freeze({ ok: false as const, error: Object.freeze(error) });
}

function sourceSpecifier(node: Node): string | null {
  const source = (node as unknown as { source?: unknown }).source;
  if (typeof source !== "object" || source === null) return null;
  const value = (source as { value?: unknown }).value;
  return typeof value === "string" ? value : null;
}

function resolveSpecifier(
  from: string,
  specifier: string,
  declaredFiles: ReadonlySet<string>,
): ProjectPluginSourceClosureError | ProjectPluginSourceClosureEdge {
  if (specifier.startsWith("../") || specifier.startsWith("./../")) {
    return { code: "path-escape", file: from, specifier };
  }
  if (!specifier.startsWith("./")) return { code: "specifier-unsupported", file: from, specifier };

  const target = specifier.slice(2);
  if (
    !target.endsWith(".mjs")
    || target.length === 4
    || target.includes("/")
    || target.includes("\\")
    || target.includes("?")
    || target.includes("#")
    || target.includes("%")
  ) {
    return { code: "specifier-unsupported", file: from, specifier };
  }
  if (!declaredFiles.has(target)) return { code: "unresolved-import", file: from, specifier };
  return { from, specifier, to: target };
}

function isClosureError(value: ProjectPluginSourceClosureError | ProjectPluginSourceClosureEdge): value is ProjectPluginSourceClosureError {
  return "code" in value;
}

export function validateProjectPluginSourceClosure(input: unknown): ProjectPluginSourceClosureResult {
  const captured = validateInput(input);
  if (captured === null) return failure({ code: "input-invalid" });

  const manifest = parseToolPluginManifest(captured.manifestBytes);
  if (manifest === null || !manifest.entrypoint.endsWith(".mjs")) return failure({ code: "manifest-invalid" });
  if (manifest.dependencies.length !== 0) return failure({ code: "manifest-dependencies" });
  if (manifest.id !== captured.pluginId) return failure({ code: "plugin-id-mismatch" });
  if (manifest.files.some((file) => !file.endsWith(".mjs") || file === "index.test.mjs")) {
    return failure({ code: "runtime-files-invalid" });
  }
  if (
    captured.runtimeFiles.length !== manifest.files.length
    || captured.runtimeFiles.some((file, index) => file.name !== manifest.files[index])
  ) {
    return failure({ code: "runtime-files-invalid" });
  }

  const files = [...manifest.files].sort(compareStrings);
  const declaredFiles = new Set(files);
  const parsedFiles = new Map<string, Node>();
  for (const file of captured.runtimeFiles) {
    let text: string;
    try {
      text = decoder.decode(file.bytes);
    } catch {
      return failure({ code: "encoding-invalid", file: file.name });
    }
    try {
      parsedFiles.set(file.name, parse(text, { ecmaVersion: 2025, sourceType: "module" }));
    } catch {
      return failure({ code: "parse-invalid", file: file.name });
    }
  }

  const edges: ProjectPluginSourceClosureEdge[] = [];
  for (const file of files) {
    const ast = parsedFiles.get(file);
    if (ast === undefined) return failure({ code: "runtime-files-invalid" });
    let encountered: ProjectPluginSourceClosureError | null = null;
    const walked = walkFullIterative(ast, (node) => {
      if (encountered !== null) return;
      if (node.type === "ImportExpression") {
        encountered = { code: "dynamic-import", file };
        return;
      }
      if (node.type === "MetaProperty") {
        const meta = (node as unknown as { meta?: { name?: unknown }; property?: { name?: unknown } });
        if (meta.meta?.name === "import" && meta.property?.name === "meta") {
          encountered = { code: "import-meta", file };
        }
        return;
      }
      if (node.type === "CallExpression" || node.type === "NewExpression") {
        const callee = (node as unknown as { callee?: { type?: unknown; name?: unknown } }).callee;
        if (callee?.type === "Identifier" && callee.name === "require") {
          encountered = { code: "require-call", file };
        }
        return;
      }
      if (
        node.type === "ImportDeclaration"
        || node.type === "ExportNamedDeclaration"
        || node.type === "ExportAllDeclaration"
      ) {
        const specifier = sourceSpecifier(node);
        if (specifier === null) return;
        const resolved = resolveSpecifier(file, specifier, declaredFiles);
        if (isClosureError(resolved)) {
          encountered = resolved;
        } else {
          edges.push(resolved);
        }
      }
    });
    if (!walked) return failure({ code: "parse-invalid", file });
    if (encountered !== null) return failure(encountered);
  }

  const edgeKeys = new Set<string>();
  const uniqueEdges = edges.filter((edge) => {
    const key = `${edge.from}\u0000${edge.specifier}\u0000${edge.to}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  }).sort((left, right) => (
    compareStrings(left.from, right.from)
    || compareStrings(left.specifier, right.specifier)
    || compareStrings(left.to, right.to)
  ));

  const reachable = new Set<string>([manifest.entrypoint]);
  const pending = [manifest.entrypoint];
  while (pending.length > 0) {
    const from = pending.pop() as string;
    for (const edge of uniqueEdges) {
      if (edge.from !== from || reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      pending.push(edge.to);
    }
  }
  const unreachable = files.find((file) => !reachable.has(file));
  if (unreachable !== undefined) return failure({ code: "unreachable-file", file: unreachable });

  const graph = Object.freeze({
    pluginId: manifest.id,
    entrypoint: manifest.entrypoint,
    files: Object.freeze(files),
    edges: Object.freeze(uniqueEdges.map((edge) => Object.freeze({ ...edge }))),
  });
  return Object.freeze({ ok: true as const, graph });
}
