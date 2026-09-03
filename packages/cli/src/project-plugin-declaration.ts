import { randomUUID } from "node:crypto";
import { lstat, open, realpath, rename, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { writeJsonAtomically } from "./atomic-json.ts";
import { parsePrismConfig } from "./config.ts";

export const PROJECT_TOOL_PLUGIN_VERSION = "prism-project-tool-plugin-v1" as const;
export const PROJECT_TOOL_PLUGIN_RELATIVE_PATH = ".prism/tool-plugin.json";

export const MAX_PROJECT_TOOL_PLUGIN_BYTES = 8 * 1024;
const MAX_PROJECT_CONFIG_BYTES = 64 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")?.get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;

export interface ProjectToolPluginDeclaration {
  readonly version: typeof PROJECT_TOOL_PLUGIN_VERSION;
  readonly path: string;
  readonly operation: "slugify";
}

export interface ReadProjectToolPluginDeclaration {
  readonly workspace: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly declaration: ProjectToolPluginDeclaration;
  readonly canonicalPluginPath: string;
  readonly identity: {
    readonly workspace: FileIdentity;
    readonly projectDirectory: FileIdentity;
    readonly declaration: FileIdentity;
  };
}

export type ProjectToolPluginDeclarationErrorCode =
  | "declaration-too-large"
  | "declaration-invalid-utf8"
  | "declaration-invalid-json"
  | "declaration-duplicate-member"
  | "declaration-invalid"
  | "project-workspace-invalid"
  | "project-config-missing"
  | "project-config-unsafe"
  | "project-config-invalid"
  | "declaration-path-unsafe"
  | "declaration-missing"
  | "plugin-path-missing"
  | "plugin-path-symlink"
  | "plugin-path-unsafe"
  | "plugin-path-escapes-workspace"
  | "declaration-cleanup-failed";

export class ProjectToolPluginDeclarationError extends Error {
  readonly code: ProjectToolPluginDeclarationErrorCode;

  constructor(code: ProjectToolPluginDeclarationErrorCode) {
    super(code);
    this.name = "ProjectToolPluginDeclarationError";
    this.code = code;
  }
}

export interface UndeclareProjectToolPluginDependencies {
  readonly renameFile?: typeof rename;
  readonly removeFile?: (path: string) => Promise<void>;
  readonly randomId?: () => string;
}

interface FileIdentity {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number | bigint;
  readonly size: number | bigint;
  readonly mtimeMs: number | bigint;
  readonly ctimeMs: number | bigint;
}

type BoundedFileRead =
  | { readonly status: "ok"; readonly bytes: Uint8Array; readonly identity: FileIdentity }
  | { readonly status: "missing" | "unsafe" | "too-large" };

function failure(code: ProjectToolPluginDeclarationErrorCode): never {
  throw new ProjectToolPluginDeclarationError(code);
}

function identityOf(stat: Awaited<ReturnType<typeof lstat>>): FileIdentity {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  });
}

function sameObjectIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return sameObjectIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function copyDeclarationBytes(value: unknown): Uint8Array {
  if (
    typedArrayByteLength === undefined
    || typedArrayByteOffset === undefined
    || typedArrayBuffer === undefined
    || typedArrayTag === undefined
  ) failure("declaration-invalid");

  let byteLength: number;
  let byteOffset: number;
  let buffer: ArrayBufferLike;
  try {
    if (Reflect.apply(typedArrayTag, value, []) !== "Uint8Array") failure("declaration-invalid");
    byteLength = Reflect.apply(typedArrayByteLength, value, []) as number;
    byteOffset = Reflect.apply(typedArrayByteOffset, value, []) as number;
    buffer = Reflect.apply(typedArrayBuffer, value, []) as ArrayBufferLike;
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) throw error;
    failure("declaration-invalid");
  }
  if (byteLength > MAX_PROJECT_TOOL_PLUGIN_BYTES) failure("declaration-too-large");
  if (!(buffer instanceof ArrayBuffer)) failure("declaration-invalid");
  try {
    const copy = new Uint8Array(byteLength);
    copy.set(new Uint8Array(buffer, byteOffset, byteLength));
    return copy;
  } catch {
    failure("declaration-invalid");
  }
}

async function readBoundedRegularFile(path: string, maximumBytes: number): Promise<BoundedFileRead> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path);
  } catch (error) {
    return isNotFound(error) ? { status: "missing" } : { status: "unsafe" };
  }
  if (before.isSymbolicLink() || !before.isFile()) return { status: "unsafe" };
  if (before.size > maximumBytes) return { status: "too-large" };

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "r");
  } catch (error) {
    return isNotFound(error) ? { status: "missing" } : { status: "unsafe" };
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFileIdentity(identityOf(before), identityOf(opened))) return { status: "unsafe" };
    const buffer = new Uint8Array(maximumBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximumBytes) return { status: "too-large" };
    let after: Awaited<ReturnType<typeof lstat>>;
    try {
      after = await lstat(path);
    } catch {
      return { status: "unsafe" };
    }
    if (!sameFileIdentity(identityOf(opened), identityOf(after))) return { status: "unsafe" };
    return { status: "ok", bytes: buffer.slice(0, offset), identity: identityOf(after) };
  } catch {
    return { status: "unsafe" };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function skipWhitespace(serialized: string, start: number): number {
  let index = start;
  while (index < serialized.length && /[\u0009\u000a\u000d\u0020]/u.test(serialized[index] as string)) index += 1;
  return index;
}

function stringEnd(serialized: string, start: number): number {
  let index = start + 1;
  while (index < serialized.length) {
    const character = serialized[index] as string;
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === '"') return index + 1;
    index += 1;
  }
  return serialized.length;
}

function assertNoDuplicateMembers(serialized: string): void {
  const parseValue = (initial: number): number => {
    let index = skipWhitespace(serialized, initial);
    const character = serialized[index];
    if (character === "{") {
      index = skipWhitespace(serialized, index + 1);
      const names = new Set<string>();
      if (serialized[index] === "}") return index + 1;
      while (true) {
        if (serialized[index] !== '"') return serialized.length;
        const end = stringEnd(serialized, index);
        const name = JSON.parse(serialized.slice(index, end)) as string;
        if (names.has(name)) failure("declaration-duplicate-member");
        names.add(name);
        index = skipWhitespace(serialized, end);
        if (serialized[index] !== ":") return serialized.length;
        index = parseValue(index + 1);
        index = skipWhitespace(serialized, index);
        if (serialized[index] === "}") return index + 1;
        if (serialized[index] !== ",") return serialized.length;
        index = skipWhitespace(serialized, index + 1);
      }
    }
    if (character === "[") {
      index = skipWhitespace(serialized, index + 1);
      if (serialized[index] === "]") return index + 1;
      while (true) {
        index = parseValue(index);
        index = skipWhitespace(serialized, index);
        if (serialized[index] === "]") return index + 1;
        if (serialized[index] !== ",") return serialized.length;
        index = skipWhitespace(serialized, index + 1);
      }
    }
    if (character === '"') return stringEnd(serialized, index);
    while (index < serialized.length && !/[\u0009\u000a\u000d\u0020,}\]]/u.test(serialized[index] as string)) index += 1;
    return index;
  };
  parseValue(0);
}

function validRelativePluginPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function parseProjectToolPluginDeclarationBytes(input: unknown): ProjectToolPluginDeclaration {
  const bytes = copyDeclarationBytes(input);
  let serialized: string;
  try {
    serialized = decoder.decode(bytes);
  } catch {
    failure("declaration-invalid-utf8");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    failure("declaration-invalid-json");
  }
  try {
    assertNoDuplicateMembers(serialized);
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) throw error;
    failure("declaration-invalid-json");
  }
  if (!isRecord(value)) failure("declaration-invalid");
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "operation" || keys[1] !== "path" || keys[2] !== "version") failure("declaration-invalid");
  if (value.version !== PROJECT_TOOL_PLUGIN_VERSION || value.operation !== "slugify" || !validRelativePluginPath(value.path)) {
    failure("declaration-invalid");
  }
  return Object.freeze({ version: PROJECT_TOOL_PLUGIN_VERSION, path: value.path, operation: "slugify" });
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT";
}

function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

async function canonicalWorkspace(workspace: string): Promise<{ readonly path: string; readonly identity: FileIdentity }> {
  const absolute = resolve(workspace);
  try {
    const before = await lstat(absolute);
    if (!before.isDirectory() || before.isSymbolicLink()) failure("project-workspace-invalid");
    const canonical = await realpath(absolute);
    const after = await lstat(absolute);
    if (!sameObjectIdentity(identityOf(before), identityOf(after))) failure("project-workspace-invalid");
    return { path: canonical, identity: identityOf(after) };
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) throw error;
    failure("project-workspace-invalid");
  }
}

export async function canonicalizeProjectPluginWorkspace(input: { readonly workspace: string }): Promise<string> {
  return (await canonicalWorkspace(input.workspace)).path;
}

async function safeProjectDirectory(
  workspace: string,
  missingCode: ProjectToolPluginDeclarationErrorCode,
): Promise<{ readonly path: string; readonly identity: FileIdentity }> {
  const prism = join(workspace, ".prism");
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(prism);
  } catch (error) {
    if (isNotFound(error)) failure(missingCode);
    failure("project-config-unsafe");
  }
  if (before.isSymbolicLink() || !before.isDirectory()) failure("project-config-unsafe");
  try {
    const canonicalPrism = await realpath(prism);
    if (canonicalPrism !== prism || !isWithin(workspace, canonicalPrism)) failure("project-config-unsafe");
    const after = await lstat(prism);
    if (!sameObjectIdentity(identityOf(before), identityOf(after))) failure("project-config-unsafe");
    return { path: prism, identity: identityOf(after) };
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) throw error;
    failure("project-config-unsafe");
  }
}

async function safeProjectConfig(workspace: string): Promise<{ readonly prism: string; readonly identity: FileIdentity }> {
  const projectDirectory = await safeProjectDirectory(workspace, "project-config-missing");
  const prism = projectDirectory.path;
  const config = await readBoundedRegularFile(join(prism, "config.json"), MAX_PROJECT_CONFIG_BYTES);
  if (config.status !== "ok") {
    if (config.status === "missing") failure("project-config-missing");
    if (config.status === "unsafe") failure("project-config-unsafe");
    failure("project-config-invalid");
  }
  try {
    parsePrismConfig(decoder.decode(config.bytes));
  } catch {
    failure("project-config-invalid");
  }
  return { prism, identity: projectDirectory.identity };
}

async function resolvePluginPath(workspace: string, declaration: ProjectToolPluginDeclaration): Promise<string> {
  const components = declaration.path.split("/");
  let current = workspace;
  let finalIdentity: FileIdentity | undefined;
  for (const component of components) {
    current = join(current, component);
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (isNotFound(error)) failure("plugin-path-missing");
      failure("plugin-path-unsafe");
    }
    if (stat.isSymbolicLink()) failure("plugin-path-symlink");
    if (!stat.isDirectory()) failure("plugin-path-unsafe");
    finalIdentity = identityOf(stat);
  }
  try {
    const canonical = await realpath(current);
    if (!isWithin(workspace, canonical)) failure("plugin-path-escapes-workspace");
    if (canonical !== current) failure("plugin-path-symlink");
    const after = await lstat(current);
    if (
      after.isSymbolicLink()
      || !after.isDirectory()
      || finalIdentity === undefined
      || !sameObjectIdentity(finalIdentity, identityOf(after))
    ) failure("plugin-path-unsafe");
    return canonical;
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) throw error;
    failure("plugin-path-unsafe");
  }
}

async function declarationPath(workspace: string): Promise<{
  readonly workspace: string;
  readonly workspaceIdentity: FileIdentity;
  readonly prism: string;
  readonly prismIdentity: FileIdentity;
  readonly path: string;
}> {
  const canonical = await canonicalWorkspace(workspace);
  const { prism, identity } = await safeProjectConfig(canonical.path);
  return {
    workspace: canonical.path,
    workspaceIdentity: canonical.identity,
    prism,
    prismIdentity: identity,
    path: join(prism, "tool-plugin.json"),
  };
}

async function undeclarationPath(workspace: string): Promise<{ readonly workspace: string; readonly prism: string; readonly path: string }> {
  const canonical = await canonicalWorkspace(workspace);
  const projectDirectory = await safeProjectDirectory(canonical.path, "declaration-missing");
  return { workspace: canonical.path, prism: projectDirectory.path, path: join(projectDirectory.path, "tool-plugin.json") };
}

async function readDeclarationFile(path: string): Promise<Extract<BoundedFileRead, { readonly status: "ok" }> | undefined> {
  const result = await readBoundedRegularFile(path, MAX_PROJECT_TOOL_PLUGIN_BYTES);
  if (result.status === "missing") return undefined;
  if (result.status !== "ok") {
    if (result.status === "unsafe") failure("declaration-path-unsafe");
    failure("declaration-too-large");
  }
  return result;
}

export async function readProjectToolPluginDeclaration(input: {
  readonly workspace: string;
}): Promise<ReadProjectToolPluginDeclaration | undefined> {
  const paths = await declarationPath(input.workspace);
  const captured = await readDeclarationFile(paths.path);
  if (captured === undefined) return undefined;
  const declaration = parseProjectToolPluginDeclarationBytes(captured.bytes);
  return Object.freeze({
    workspace: paths.workspace,
    path: paths.path,
    bytes: captured.bytes,
    declaration,
    canonicalPluginPath: await resolvePluginPath(paths.workspace, declaration),
    identity: Object.freeze({
      workspace: paths.workspaceIdentity,
      projectDirectory: paths.prismIdentity,
      declaration: captured.identity,
    }),
  });
}

export async function projectToolPluginDeclarationUnchanged(
  captured: ReadProjectToolPluginDeclaration,
): Promise<boolean> {
  if (captured.path !== join(captured.workspace, PROJECT_TOOL_PLUGIN_RELATIVE_PATH)) return false;
  try {
    const [workspace, projectDirectory, declaration] = await Promise.all([
      lstat(captured.workspace),
      lstat(join(captured.workspace, ".prism")),
      readBoundedRegularFile(captured.path, MAX_PROJECT_TOOL_PLUGIN_BYTES),
    ]);
    if (
      workspace.isSymbolicLink()
      || !workspace.isDirectory()
      || projectDirectory.isSymbolicLink()
      || !projectDirectory.isDirectory()
      || declaration.status !== "ok"
      || !sameObjectIdentity(captured.identity.workspace, identityOf(workspace))
      || !sameObjectIdentity(captured.identity.projectDirectory, identityOf(projectDirectory))
      || !sameFileIdentity(captured.identity.declaration, declaration.identity)
    ) return false;
    const expected = copyDeclarationBytes(captured.bytes);
    return expected.byteLength === declaration.bytes.byteLength
      && expected.every((byte, index) => byte === declaration.bytes[index]);
  } catch {
    return false;
  }
}

export async function declareProjectToolPlugin(input: {
  readonly workspace: string;
  readonly path: string;
  readonly operation: "slugify";
}): Promise<ReadProjectToolPluginDeclaration> {
  const declaration = parseProjectToolPluginDeclarationBytes(encoder.encode(JSON.stringify({
    version: PROJECT_TOOL_PLUGIN_VERSION,
    path: input.path,
    operation: input.operation,
  })));
  const paths = await declarationPath(input.workspace);
  const canonicalPluginPath = await resolvePluginPath(paths.workspace, declaration);
  await readDeclarationFile(paths.path);
  await writeJsonAtomically({
    path: paths.path,
    value: declaration,
    directoryMode: 0o755,
    fileMode: 0o644,
  });
  const captured = await readDeclarationFile(paths.path);
  if (captured === undefined) failure("declaration-path-unsafe");
  const persisted = parseProjectToolPluginDeclarationBytes(captured.bytes);
  if (JSON.stringify(persisted) !== JSON.stringify(declaration)) failure("declaration-path-unsafe");
  const result = Object.freeze({
    workspace: paths.workspace,
    path: paths.path,
    bytes: captured.bytes,
    declaration: persisted,
    canonicalPluginPath,
    identity: Object.freeze({
      workspace: paths.workspaceIdentity,
      projectDirectory: paths.prismIdentity,
      declaration: captured.identity,
    }),
  });
  if (!await projectToolPluginDeclarationUnchanged(result)) failure("declaration-path-unsafe");
  return result;
}

export async function undeclareProjectToolPlugin(
  input: { readonly workspace: string },
  dependencies: UndeclareProjectToolPluginDependencies = {},
): Promise<void> {
  const paths = await undeclarationPath(input.workspace);
  const declaration = await readDeclarationFile(paths.path);
  if (declaration === undefined) failure("declaration-missing");
  const removedPath = join(
    paths.prism,
    `.${basename(paths.path)}.removed.${process.pid}.${dependencies.randomId?.() ?? randomUUID()}`,
  );
  try {
    await (dependencies.renameFile ?? rename)(paths.path, removedPath);
  } catch (error) {
    if (isNotFound(error)) failure("declaration-missing");
    throw error;
  }
  try {
    if (dependencies.removeFile !== undefined) {
      await dependencies.removeFile(removedPath);
    } else {
      await rm(removedPath, { force: true, maxRetries: 1, retryDelay: 10 });
    }
  } catch {
    failure("declaration-cleanup-failed");
  }
}
