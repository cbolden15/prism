import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, parse, relative, resolve, sep } from "node:path";
import {
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  parseToolPluginManifest,
} from "@useprism/sdk/authoring";

type ToolPluginManifest = NonNullable<ReturnType<typeof parseToolPluginManifest>>;

export type PluginCheckStaticError =
  | "plugin-path"
  | "path-symlink"
  | "path-changed"
  | "manifest-invalid"
  | "unsupported-kind"
  | "plugin-id-mismatch"
  | "source-tree";

interface FileIdentity {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number | bigint;
  readonly size: number | bigint;
  readonly mtimeMs: number | bigint;
  readonly ctimeMs: number | bigint;
}

interface IdentityEntry {
  readonly path: string;
  readonly kind: "directory" | "file";
  readonly identity: FileIdentity;
}

export interface StaticPluginFile {
  readonly path: string;
  readonly contents: string;
  readonly bytes: Uint8Array;
}

export interface StaticPluginCheck {
  readonly pluginRoot: string;
  readonly manifest: ToolPluginManifest;
  readonly entrypointPath: string;
  readonly identities: readonly IdentityEntry[];
  readonly files: readonly StaticPluginFile[];
}

export interface PluginCheckStaticDependencies {
  readonly beforeFileOpen?: (path: string) => Promise<void> | void;
  readonly afterFileOpen?: (path: string) => Promise<void> | void;
}

type StaticResult =
  | { readonly ok: true; readonly value: StaticPluginCheck }
  | { readonly ok: false; readonly code: PluginCheckStaticError };

const decoder = new TextDecoder("utf-8", { fatal: true });
const AUTHORING_SIDECARS = ["README.md", "index.test.mjs"] as const;

function hasDuplicateJsonObjectMembers(source: string): boolean {
  let offset = 0;
  const whitespace = /[\t\n\r ]/u;
  const skipWhitespace = () => {
    while (whitespace.test(source[offset] ?? "")) offset += 1;
  };
  const readString = (): string => {
    if (source[offset] !== "\"") throw new Error("json-string");
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset] as string;
      if (character === "\"") {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        if (source[offset] === "u") offset += 5;
        else offset += 1;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) throw new Error("json-string");
      offset += 1;
    }
    throw new Error("json-string");
  };
  const readValue = (): boolean => {
    skipWhitespace();
    const character = source[offset];
    if (character === "{") return readObject();
    if (character === "[") {
      offset += 1;
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return false;
      }
      while (true) {
        if (readValue()) return true;
        skipWhitespace();
        if (source[offset] === "]") {
          offset += 1;
          return false;
        }
        if (source[offset] !== ",") throw new Error("json-array");
        offset += 1;
      }
    }
    if (character === "\"") {
      readString();
      return false;
    }
    const start = offset;
    while (offset < source.length && !/[\t\n\r ,\]\}]/u.test(source[offset] as string)) offset += 1;
    if (start === offset) throw new Error("json-value");
    JSON.parse(source.slice(start, offset));
    return false;
  };
  const readObject = (): boolean => {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "}") {
      offset += 1;
      return false;
    }
    const keys = new Set<string>();
    while (true) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) return true;
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") throw new Error("json-object");
      offset += 1;
      if (readValue()) return true;
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return false;
      }
      if (source[offset] !== ",") throw new Error("json-object");
      offset += 1;
    }
  };
  try {
    const duplicate = readValue();
    skipWhitespace();
    return duplicate || offset !== source.length;
  } catch {
    return false;
  }
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
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode;
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return sameObjectIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function isWithin(path: string, parent: string): boolean {
  const pathRelative = relative(parent, path);
  return pathRelative === "" || (!pathRelative.startsWith(`..${sep}`) && pathRelative !== "..");
}

function trustedAnchor(pluginPath: string, currentWorkingDirectory: string): string {
  const current = resolve(currentWorkingDirectory);
  if (isWithin(pluginPath, current)) return current;

  const temporary = resolve(tmpdir());
  if (isWithin(pluginPath, temporary)) return temporary;

  return parse(pluginPath).root;
}

async function inspectPathComponents(
  pluginPath: string,
  currentWorkingDirectory: string,
): Promise<{ readonly ok: true; readonly identities: readonly IdentityEntry[] } | { readonly ok: false; readonly code: PluginCheckStaticError }> {
  const anchor = trustedAnchor(pluginPath, currentWorkingDirectory);
  const paths = [anchor];
  const suffix = relative(anchor, pluginPath);
  if (suffix !== "") {
    let current = anchor;
    for (const part of suffix.split(sep)) {
      if (part === "" || part === "." || part === "..") return { ok: false, code: "plugin-path" };
      current = resolve(current, part);
      paths.push(current);
    }
  }

  const identities: IdentityEntry[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index] as string;
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(path);
    } catch {
      return { ok: false, code: "plugin-path" };
    }
    if (stat.isSymbolicLink()) return { ok: false, code: "path-symlink" };
    if (!stat.isDirectory()) return { ok: false, code: "plugin-path" };
    identities.push(Object.freeze({ path, kind: "directory", identity: identityOf(stat) }));
  }
  return { ok: true, identities: Object.freeze(identities) };
}

function requiredEntries(manifest: ToolPluginManifest): readonly string[] {
  return Object.freeze(["manifest.json", ...manifest.files].sort());
}

function hasAdmissibleEntries(entries: readonly string[], manifest: ToolPluginManifest): boolean {
  const required = requiredEntries(manifest);
  const permitted = new Set([...required, ...AUTHORING_SIDECARS]);
  return required.every((entry) => entries.includes(entry)) && entries.every((entry) => permitted.has(entry));
}

function inspectedEntries(plugin: StaticPluginCheck): readonly string[] {
  return Object.freeze(plugin.identities
    .filter((entry) => entry.kind === "file" && resolve(plugin.pluginRoot, basename(entry.path)) === entry.path)
    .map((entry) => basename(entry.path))
    .sort());
}

interface BoundedRead {
  readonly bytes: Uint8Array;
  readonly identity: FileIdentity;
}

async function readBounded(
  path: string,
  maximumBytes: number,
  dependencies: PluginCheckStaticDependencies,
): Promise<BoundedRead | null> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    await dependencies.beforeFileOpen?.(path);
    handle = await open(
      path,
      process.platform !== "win32" && typeof constants.O_NOFOLLOW === "number"
        ? constants.O_RDONLY | constants.O_NOFOLLOW
        : "r",
    );
    await dependencies.afterFileOpen?.(path);
  } catch {
    return null;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximumBytes) return null;
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return offset > maximumBytes
      ? null
      : Object.freeze({ bytes: new Uint8Array(buffer.subarray(0, offset)), identity: identityOf(stat) });
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function readManifest(
  pluginRoot: string,
  dependencies: PluginCheckStaticDependencies,
): Promise<
  | {
    readonly ok: true;
    readonly manifest: ToolPluginManifest;
    readonly identity: IdentityEntry;
    readonly byteLength: number;
    readonly file: StaticPluginFile;
  }
  | { readonly ok: false; readonly code: PluginCheckStaticError }
> {
  const manifestPath = resolve(pluginRoot, "manifest.json");
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(manifestPath);
    if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > MAX_PLUGIN_MANIFEST_BYTES) {
      return { ok: false, code: "manifest-invalid" };
    }
  } catch {
    return { ok: false, code: "manifest-invalid" };
  }

  const opened = await readBounded(manifestPath, MAX_PLUGIN_MANIFEST_BYTES, dependencies);
  if (opened === null) return { ok: false, code: "manifest-invalid" };
  if (!sameFileIdentity(identityOf(before), opened.identity)) return { ok: false, code: "path-changed" };
  let contents: string;
  try {
    contents = decoder.decode(opened.bytes);
  } catch {
    return { ok: false, code: "manifest-invalid" };
  }
  if (hasDuplicateJsonObjectMembers(contents)) return { ok: false, code: "manifest-invalid" };
  const manifest = parseToolPluginManifest(opened.bytes);
  if (manifest === null) {
    let raw: unknown;
    try {
      raw = JSON.parse(contents);
    } catch {
      return { ok: false, code: "manifest-invalid" };
    }
    const kind = typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? Reflect.get(raw, "kind")
      : undefined;
    if (["policy", "memory", "provider", "renderer"].includes(String(kind))) {
      return { ok: false, code: "unsupported-kind" };
    }
    return { ok: false, code: "manifest-invalid" };
  }

  let after: Awaited<ReturnType<typeof lstat>>;
  try {
    after = await lstat(manifestPath);
  } catch {
    return { ok: false, code: "path-changed" };
  }
  if (!sameFileIdentity(opened.identity, identityOf(after))) return { ok: false, code: "path-changed" };
  return {
    ok: true,
    manifest,
    identity: Object.freeze({ path: manifestPath, kind: "file", identity: identityOf(after) }),
    byteLength: opened.bytes.byteLength,
    file: Object.freeze({ path: "manifest.json", contents, bytes: new Uint8Array(opened.bytes) }),
  };
}

export async function inspectToolPlugin(
  path: string,
  currentWorkingDirectory: string,
  dependencies: PluginCheckStaticDependencies = {},
): Promise<StaticResult> {
  const pluginRoot = resolve(currentWorkingDirectory, path);
  const pathComponents = await inspectPathComponents(pluginRoot, currentWorkingDirectory);
  if (!pathComponents.ok) return pathComponents;

  const pluginIdentity = pathComponents.identities.at(-1);
  if (pluginIdentity === undefined) return { ok: false, code: "plugin-path" };
  const manifest = await readManifest(pluginRoot, dependencies);
  if (!manifest.ok) return manifest;
  if (basename(pluginRoot) !== manifest.manifest.id) return { ok: false, code: "plugin-id-mismatch" };

  let entries: string[];
  try {
    entries = (await readdir(pluginRoot, { encoding: "utf8" })).sort();
  } catch {
    return { ok: false, code: "source-tree" };
  }
  if (!hasAdmissibleEntries(entries, manifest.manifest)) {
    return { ok: false, code: "source-tree" };
  }

  const identities: IdentityEntry[] = [...pathComponents.identities, manifest.identity];
  const files: StaticPluginFile[] = [manifest.file];
  let totalBytes = manifest.byteLength;
  for (const entry of entries) {
    if (entry === "manifest.json") continue;
    const entryPath = resolve(pluginRoot, entry);
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(entryPath);
    } catch {
      return { ok: false, code: "source-tree" };
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PLUGIN_FILE_BYTES) {
      return { ok: false, code: "source-tree" };
    }
    const opened = await readBounded(entryPath, MAX_PLUGIN_FILE_BYTES, dependencies);
    if (opened === null) return { ok: false, code: "source-tree" };
    if (!sameFileIdentity(identityOf(stat), opened.identity)) return { ok: false, code: "path-changed" };
    totalBytes += opened.bytes.byteLength;
    if (totalBytes > MAX_PLUGIN_SCAFFOLD_BYTES) return { ok: false, code: "source-tree" };
    let contents: string;
    try {
      contents = decoder.decode(opened.bytes);
    } catch {
      return { ok: false, code: "source-tree" };
    }
    let after: Awaited<ReturnType<typeof lstat>>;
    try {
      after = await lstat(entryPath);
    } catch {
      return { ok: false, code: "path-changed" };
    }
    if (!sameFileIdentity(opened.identity, identityOf(after))) return { ok: false, code: "path-changed" };
    identities.push(Object.freeze({ path: entryPath, kind: "file", identity: identityOf(after) }));
    if (manifest.manifest.files.includes(entry)) {
      files.push(Object.freeze({ path: entry, contents, bytes: new Uint8Array(opened.bytes) }));
    }
  }

  let rootAfter: Awaited<ReturnType<typeof lstat>>;
  try {
    rootAfter = await lstat(pluginRoot);
  } catch {
    return { ok: false, code: "path-changed" };
  }
  if (!sameObjectIdentity(pluginIdentity.identity, identityOf(rootAfter))) return { ok: false, code: "path-changed" };
  return {
    ok: true,
    value: Object.freeze({
      pluginRoot,
      manifest: manifest.manifest,
      entrypointPath: resolve(pluginRoot, manifest.manifest.entrypoint),
      identities: Object.freeze(identities),
      files: Object.freeze(files.sort((left, right) => left.path.localeCompare(right.path))),
    }),
  };
}

export async function staticIdentityUnchanged(plugin: StaticPluginCheck, requireClosedTree = true): Promise<boolean> {
  for (const entry of plugin.identities) {
    if (!requireClosedTree && entry.kind === "directory") continue;
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(entry.path);
    } catch {
      return false;
    }
    const unchanged = entry.kind === "directory"
      ? sameObjectIdentity(entry.identity, identityOf(stat))
      : sameFileIdentity(entry.identity, identityOf(stat));
    if (!unchanged) return false;
  }
  if (!requireClosedTree) return true;
  let entries: string[];
  try {
    entries = (await readdir(plugin.pluginRoot, { encoding: "utf8" })).sort();
  } catch {
    return false;
  }
  const expected = inspectedEntries(plugin);
  return entries.length === expected.length && entries.every((entry, index) => entry === expected[index]);
}
