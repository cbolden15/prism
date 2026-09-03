import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { MAX_STRING_BYTES, type JsonValue } from "@useprism/sdk/protocol";
import type { Tool, ToolCallContext, ToolRequest } from "@useprism/sdk/tool";

export interface RepositoryToolLimits {
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxFiles: number;
  readonly maxResults: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_REPOSITORY_TOOL_LIMITS: RepositoryToolLimits = Object.freeze({
  maxEntries: 10_000,
  maxFileBytes: MAX_STRING_BYTES,
  maxFiles: 1_000,
  maxResults: 100,
  maxTotalBytes: 1_024 * 1024,
});

export type RepositoryToolErrorCode =
  | "aborted"
  | "binary-file"
  | "changed-entry"
  | "deadline"
  | "excluded-path"
  | "file-too-large"
  | "filesystem-error"
  | "invalid-input"
  | "invalid-limits"
  | "invalid-path"
  | "not-directory"
  | "not-file"
  | "not-found"
  | "symlink"
  | "unsupported-operation"
  | "workspace-not-canonical";

export class RepositoryToolError extends Error {
  readonly code: RepositoryToolErrorCode;

  constructor(code: RepositoryToolErrorCode) {
    super(`repository-tool:${code}`);
    this.name = "RepositoryToolError";
    this.code = code;
  }
}

export interface CreateRepositoryToolOptions {
  readonly workspaceRoot: string;
  readonly limits?: Partial<RepositoryToolLimits>;
}

interface ResolvedPath {
  readonly absolute: string;
  readonly relative: string;
  readonly stat: Awaited<ReturnType<typeof lstat>>;
}

interface DirectoryEntries {
  readonly entries: readonly { readonly name: string }[];
  readonly truncated: boolean;
}

const DEFINITION = Object.freeze({
  id: "repository",
  description: "Read and search files below the admitted workspace without modifying them.",
  operations: Object.freeze([
    Object.freeze({ name: "list", description: "List one directory. Input: {path:string}." }),
    Object.freeze({ name: "read", description: "Read one UTF-8 text file. Input: {path:string}." }),
    Object.freeze({ name: "search", description: "Search UTF-8 files recursively. Input: {path:string,query:string}." }),
  ]),
});

const CONTROL_CHARACTER = /\p{Cc}/u;
const BINARY_CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:/u;
const EXCLUDED_NAME = /^(?:\.git|\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|(?:credential|credentials|secret|secrets|password|passwd|token|tokens|api[_-]?key|private[_-]?key)(?:[._-].*)?)$/iu;
const EXCLUDED_EXTENSION = /\.(?:key|pem|p12|pfx|kdbx)$/iu;
const MAX_QUERY_BYTES = 4_096;
const READ_CHUNK_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function reject(code: RepositoryToolErrorCode): never {
  throw new RepositoryToolError(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function checkedContext(context: ToolCallContext): void {
  if (context.signal.aborted) reject("aborted");
  if (!Number.isFinite(context.deadlineAtMs) || Date.now() >= context.deadlineAtMs) reject("deadline");
}

function normalizeLimits(overrides: Partial<RepositoryToolLimits> | undefined): RepositoryToolLimits {
  const limits = { ...DEFAULT_REPOSITORY_TOOL_LIMITS, ...overrides };
  if (
    Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0)
    || limits.maxFileBytes > MAX_STRING_BYTES
  ) {
    reject("invalid-limits");
  }
  return Object.freeze(limits);
}

function filesystemCode(error: unknown): RepositoryToolErrorCode {
  if (error instanceof RepositoryToolError) return error.code;
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "ENOENT") return "not-found";
  if (code === "ELOOP") return "symlink";
  return "filesystem-error";
}

async function checkedLstat(path: string, context?: ToolCallContext): Promise<Awaited<ReturnType<typeof lstat>>> {
  context && checkedContext(context);
  try {
    const stat = await lstat(path);
    context && checkedContext(context);
    return stat;
  } catch (error) {
    reject(filesystemCode(error));
  }
}

async function checkedRealpath(path: string, context?: ToolCallContext): Promise<string> {
  context && checkedContext(context);
  try {
    const canonical = await realpath(path);
    context && checkedContext(context);
    return canonical;
  } catch (error) {
    reject(filesystemCode(error));
  }
}

function isExcludedName(name: string): boolean {
  return EXCLUDED_NAME.test(name) || EXCLUDED_EXTENSION.test(name);
}

function statSize(stat: Awaited<ReturnType<typeof lstat>>): number {
  if (typeof stat.size !== "number" || !Number.isSafeInteger(stat.size) || stat.size < 0) {
    reject("filesystem-error");
  }
  return stat.size;
}

function normalizeRelativePath(value: unknown): string {
  if (
    typeof value !== "string"
    || value === ""
    || CONTROL_CHARACTER.test(value)
    || value.includes("\\")
    || isAbsolute(value)
    || DRIVE_ABSOLUTE_PATH.test(value)
  ) {
    reject("invalid-path");
  }
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") reject("invalid-path");
    if (isExcludedName(segment)) reject("excluded-path");
    segments.push(segment);
  }
  return segments.length === 0 ? "." : segments.join("/");
}

function pathInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function admitWorkspace(workspaceRoot: unknown): Promise<string> {
  if (typeof workspaceRoot !== "string" || workspaceRoot === "" || CONTROL_CHARACTER.test(workspaceRoot)) {
    reject("workspace-not-canonical");
  }
  const direct = resolve(workspaceRoot);
  let stat: Awaited<ReturnType<typeof lstat>>;
  try {
    stat = await lstat(direct);
    if (stat.isSymbolicLink() || !stat.isDirectory()) reject("workspace-not-canonical");
    const canonical = await realpath(direct);
    const canonicalStat = await lstat(canonical);
    if (canonicalStat.isSymbolicLink() || !canonicalStat.isDirectory()) reject("workspace-not-canonical");
    return canonical;
  } catch (error) {
    if (error instanceof RepositoryToolError) throw error;
    reject("workspace-not-canonical");
  }
}

async function resolvePath(root: string, rawPath: unknown, context: ToolCallContext): Promise<ResolvedPath> {
  const relative = normalizeRelativePath(rawPath);
  const rootStat = await checkedLstat(root, context);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) reject("symlink");

  let absolute = root;
  let stat = rootStat;
  if (relative !== ".") {
    for (const segment of relative.split("/")) {
      absolute = join(absolute, segment);
      stat = await checkedLstat(absolute, context);
      if (stat.isSymbolicLink()) reject("symlink");
      if (absolute !== join(root, ...relative.split("/")) && !stat.isDirectory()) reject("not-directory");
    }
  }
  if (!pathInside(root, absolute)) reject("invalid-path");
  const canonical = await checkedRealpath(absolute, context);
  if (canonical !== absolute || !pathInside(root, canonical)) reject("symlink");
  return { absolute, relative, stat };
}

async function assertDirectoryIdentity(
  directory: ResolvedPath,
  handle: Awaited<ReturnType<typeof open>>,
  context: ToolCallContext,
): Promise<void> {
  checkedContext(context);
  let opened: Awaited<ReturnType<typeof handle.stat>>;
  try {
    opened = await handle.stat();
  } catch (error) {
    reject(filesystemCode(error));
  }
  const current = await checkedLstat(directory.absolute, context);
  if (
    !opened.isDirectory()
    || current.isSymbolicLink()
    || !current.isDirectory()
    || opened.dev !== directory.stat.dev
    || opened.ino !== directory.stat.ino
    || opened.dev !== current.dev
    || opened.ino !== current.ino
  ) {
    reject("changed-entry");
  }
  const canonical = await checkedRealpath(directory.absolute, context);
  if (canonical !== directory.absolute) reject("symlink");
}

async function readEntries(
  directory: ResolvedPath,
  maxEntries: number,
  context: ToolCallContext,
): Promise<DirectoryEntries> {
  checkedContext(context);
  if (maxEntries <= 0) return { entries: [], truncated: true };
  let guard: Awaited<ReturnType<typeof open>>;
  try {
    guard = await open(directory.absolute, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  } catch (error) {
    reject(filesystemCode(error));
  }
  try {
    await assertDirectoryIdentity(directory, guard, context);
    let opened: Awaited<ReturnType<typeof opendir>>;
    try {
      opened = await opendir(directory.absolute);
    } catch (error) {
      reject(filesystemCode(error));
    }
    const entries: Array<{ readonly name: string }> = [];
    let truncated = false;
    try {
      for await (const entry of opened) {
        await assertDirectoryIdentity(directory, guard, context);
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }
        entries.push(entry);
      }
    } finally {
      await opened.close().catch(() => undefined);
    }
    await assertDirectoryIdentity(directory, guard, context);
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    return { entries, truncated };
  } finally {
    await guard.close().catch(() => undefined);
  }
}

function assertInput(value: JsonValue, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainRecord(value) || !hasExactKeys(value, keys)) reject("invalid-input");
  return value;
}

function textFromBytes(bytes: Uint8Array): string {
  try {
    const text = decoder.decode(bytes);
    if (BINARY_CONTROL_CHARACTER.test(text)) reject("binary-file");
    return text;
  } catch (error) {
    if (error instanceof RepositoryToolError) throw error;
    reject("binary-file");
  }
}

async function readTextFile(
  root: string,
  path: ResolvedPath,
  limits: RepositoryToolLimits,
  context: ToolCallContext,
): Promise<{ readonly bytes: number; readonly content: string }> {
  const pathBefore = await checkedLstat(path.absolute, context);
  if (pathBefore.isSymbolicLink()) reject("symlink");
  if (!pathBefore.isFile()) reject("not-file");
  if (statSize(pathBefore) > limits.maxFileBytes) reject("file-too-large");
  const canonical = await checkedRealpath(path.absolute, context);
  if (canonical !== path.absolute || !pathInside(root, canonical)) reject("symlink");

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    reject(filesystemCode(error));
  }
  try {
    checkedContext(context);
    const before = await handle.stat();
    if (
      !before.isFile()
      || before.dev !== pathBefore.dev
      || before.ino !== pathBefore.ino
    ) {
      reject("changed-entry");
    }
    if (statSize(before) > limits.maxFileBytes) reject("file-too-large");

    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    let position = 0;
    while (byteLength <= limits.maxFileBytes) {
      checkedContext(context);
      const remaining = limits.maxFileBytes + 1 - byteLength;
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining));
      let bytesRead: number;
      try {
        ({ bytesRead } = await handle.read(buffer, 0, buffer.byteLength, position));
      } catch (error) {
        reject(filesystemCode(error));
      }
      checkedContext(context);
      if (bytesRead === 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      byteLength += bytesRead;
      position += bytesRead;
    }
    if (byteLength > limits.maxFileBytes) reject("file-too-large");

    const after = await handle.stat();
    let pathAfter: Awaited<ReturnType<typeof lstat>>;
    try {
      pathAfter = await lstat(path.absolute);
    } catch {
      reject("changed-entry");
    }
    checkedContext(context);
    if (
      !after.isFile()
      || pathAfter.isSymbolicLink()
      || !pathAfter.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || statSize(before) !== statSize(after)
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || after.dev !== pathAfter.dev
      || after.ino !== pathAfter.ino
      || statSize(after) !== statSize(pathAfter)
    ) {
      reject("changed-entry");
    }
    const bytes = Buffer.concat(chunks, byteLength);
    return { bytes: byteLength, content: textFromBytes(bytes) };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function list(
  root: string,
  input: JsonValue,
  limits: RepositoryToolLimits,
  context: ToolCallContext,
): Promise<JsonValue> {
  const record = assertInput(input, ["path"]);
  const directory = await resolvePath(root, record.path, context);
  if (!directory.stat.isDirectory()) reject("not-directory");
  const source = await readEntries(directory, limits.maxEntries, context);
  const entries: Array<{ path: string; type: string; bytes?: number }> = [];
  let truncated = source.truncated;

  for (const entry of source.entries) {
    checkedContext(context);
    if (isExcludedName(entry.name)) continue;
    const relative = directory.relative === "." ? entry.name : `${directory.relative}/${entry.name}`;
    const direct = await checkedLstat(join(directory.absolute, entry.name), context);
    if (direct.isSymbolicLink() || (!direct.isDirectory() && !direct.isFile())) continue;
    const resolved = await resolvePath(root, relative, context);
    const stat = resolved.stat;
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) continue;
    if (entries.length >= limits.maxResults) {
      truncated = true;
      break;
    }
    entries.push(stat.isDirectory() ? { path: relative, type: "directory" } : {
      path: relative,
      type: "file",
      bytes: statSize(stat),
    });
  }
  return { path: directory.relative, entries, truncated };
}

async function search(
  root: string,
  input: JsonValue,
  limits: RepositoryToolLimits,
  context: ToolCallContext,
): Promise<JsonValue> {
  const record = assertInput(input, ["path", "query"]);
  const query = record.query;
  if (typeof query !== "string" || query === "" || encoder.encode(query).byteLength > MAX_QUERY_BYTES) {
    reject("invalid-input");
  }
  const start = await resolvePath(root, record.path, context);
  if (!start.stat.isDirectory()) reject("not-directory");

  const matches: Array<{ path: string; line: number; text: string }> = [];
  let filesSearched = 0;
  let searchedBytes = 0;
  let entriesVisited = 0;
  let truncated = false;

  const visit = async (directory: ResolvedPath): Promise<void> => {
    if (truncated) return;
    const source = await readEntries(directory, limits.maxEntries - entriesVisited, context);
    entriesVisited += source.entries.length;
    for (const entry of source.entries) {
      if (truncated) return;
      checkedContext(context);
      if (isExcludedName(entry.name)) continue;
      const relative = directory.relative === "." ? entry.name : `${directory.relative}/${entry.name}`;
      const direct = await checkedLstat(join(directory.absolute, entry.name), context);
      if (direct.isSymbolicLink() || (!direct.isDirectory() && !direct.isFile())) continue;
      const resolved = await resolvePath(root, relative, context);
      const { absolute, stat } = resolved;
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) continue;
      if (stat.isDirectory()) {
        await visit(resolved);
        continue;
      }
      if (filesSearched >= limits.maxFiles || searchedBytes + statSize(stat) > limits.maxTotalBytes) {
        truncated = true;
        return;
      }
      let file: { readonly bytes: number; readonly content: string };
      try {
        file = await readTextFile(root, { absolute, relative, stat }, limits, context);
      } catch (error) {
        if (error instanceof RepositoryToolError && (error.code === "binary-file" || error.code === "file-too-large")) continue;
        throw error;
      }
      if (searchedBytes + file.bytes > limits.maxTotalBytes) {
        truncated = true;
        return;
      }
      filesSearched += 1;
      searchedBytes += file.bytes;
      const lines = file.content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const text = lines[index];
        if (text === undefined || !text.includes(query)) continue;
        if (matches.length >= limits.maxResults) {
          truncated = true;
          return;
        }
        matches.push({ path: relative, line: index + 1, text: text.endsWith("\r") ? text.slice(0, -1) : text });
      }
    }
    if (source.truncated) truncated = true;
  };

  await visit(start);
  return { path: start.relative, matches, filesSearched, truncated };
}

export async function createRepositoryTool(input: CreateRepositoryToolOptions): Promise<Tool> {
  const workspaceRoot = await admitWorkspace(input?.workspaceRoot);
  const limits = normalizeLimits(input?.limits);
  return Object.freeze({
    definition: DEFINITION,
    async invoke(request: ToolRequest, context: ToolCallContext): Promise<JsonValue> {
      checkedContext(context);
      switch (request.operation) {
        case "list":
          return list(workspaceRoot, request.input, limits, context);
        case "read": {
          const record = assertInput(request.input, ["path"]);
          const path = await resolvePath(workspaceRoot, record.path, context);
          if (!path.stat.isFile()) reject("not-file");
          const file = await readTextFile(workspaceRoot, path, limits, context);
          return { path: path.relative, content: file.content, bytes: file.bytes };
        }
        case "search":
          return search(workspaceRoot, request.input, limits, context);
        default:
          reject("unsupported-operation");
      }
    },
  });
}
