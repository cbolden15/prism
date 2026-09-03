import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeJsonAtomically } from "./atomic-json.ts";

export const MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES = 16 * 1024;

export type ProjectPluginPrivateStateErrorCode =
  | "project-plugin-unsupported-platform"
  | "project-plugin-private-state-unsafe";

export class ProjectPluginPrivateStateError extends Error {
  readonly code: ProjectPluginPrivateStateErrorCode;

  constructor(code: ProjectPluginPrivateStateErrorCode) {
    super(code);
    this.name = "ProjectPluginPrivateStateError";
    this.code = code;
  }
}

export interface ProjectPluginPrivateStatePaths {
  readonly base: string;
  readonly prism: string;
  readonly approvals: string;
  readonly version: string;
  readonly record: string;
}

export interface PrivateStateStat {
  readonly uid: number;
  readonly mode: number;
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly size: number | bigint;
  readonly mtimeMs: number | bigint;
  readonly ctimeMs: number | bigint;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface ProjectPluginPrivateStateFilesystem {
  readonly lstat?: (path: string) => Promise<PrivateStateStat>;
  readonly mkdir?: (path: string, options?: { readonly recursive?: boolean; readonly mode?: number }) => Promise<unknown>;
  readonly chmod?: (path: string, mode: number) => Promise<void>;
  readonly open?: typeof open;
}

export interface ProjectPluginPrivateStateDependencies extends ProjectPluginPrivateStateFilesystem {
  readonly platform?: string;
  readonly uid?: number;
  readonly beforeFileOpen?: (path: string) => Promise<void> | void;
}

function fail(code: ProjectPluginPrivateStateErrorCode): never {
  throw new ProjectPluginPrivateStateError(code);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function currentPlatform(dependencies: ProjectPluginPrivateStateDependencies): string {
  return dependencies.platform ?? process.platform;
}

function currentUid(dependencies: ProjectPluginPrivateStateDependencies): number {
  return dependencies.uid ?? process.getuid?.() ?? fail("project-plugin-private-state-unsafe");
}

export function projectPluginPrivateStatePaths(input: {
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform?: string;
}): ProjectPluginPrivateStatePaths {
  if ((input.platform ?? process.platform) === "win32") fail("project-plugin-unsupported-platform");
  const xdgConfigHome = input.environment.XDG_CONFIG_HOME?.trim()
    || (input.environment.HOME?.trim() ? join(input.environment.HOME.trim(), ".config") : undefined);
  if (xdgConfigHome === undefined) fail("project-plugin-private-state-unsafe");
  const base = resolve(xdgConfigHome);
  const prism = join(base, "prism");
  const approvals = join(prism, "plugin-approvals");
  const version = join(approvals, "v1");
  return Object.freeze({
    base,
    prism,
    approvals,
    version,
    record: join(version, `${workspaceKey(input.workspace)}.json`),
  });
}

export function workspaceKey(workspace: string): string {
  return createHash("sha256").update(workspace).digest("hex");
}

async function checkedStat(path: string, dependencies: ProjectPluginPrivateStateDependencies): Promise<PrivateStateStat> {
  try {
    return await (dependencies.lstat ?? lstat)(path);
  } catch (error) {
    if (isMissing(error)) fail("project-plugin-private-state-unsafe");
    throw error;
  }
}

function isPrivate(stat: PrivateStateStat, uid: number): boolean {
  return stat.uid === uid && (stat.mode & 0o077) === 0;
}

function sameFileIdentity(left: PrivateStateStat, right: PrivateStateStat): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

export async function validateProjectPluginPrivateState(input: {
  readonly paths: ProjectPluginPrivateStatePaths;
  readonly includeRecord: boolean;
  readonly dependencies?: ProjectPluginPrivateStateDependencies;
}): Promise<void> {
  const dependencies = input.dependencies ?? {};
  if (currentPlatform(dependencies) === "win32") fail("project-plugin-unsupported-platform");
  const uid = currentUid(dependencies);
  const base = await checkedStat(input.paths.base, dependencies);
  if (base.isSymbolicLink() || !base.isDirectory()) fail("project-plugin-private-state-unsafe");
  for (const path of [input.paths.prism, input.paths.approvals, input.paths.version]) {
    const stat = await checkedStat(path, dependencies);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !isPrivate(stat, uid)) {
      fail("project-plugin-private-state-unsafe");
    }
  }
  if (input.includeRecord) {
    const stat = await checkedStat(input.paths.record, dependencies);
    if (stat.isSymbolicLink() || !stat.isFile() || !isPrivate(stat, uid)) {
      fail("project-plugin-private-state-unsafe");
    }
  }
}

export async function ensureProjectPluginPrivateStateDirectories(input: {
  readonly paths: ProjectPluginPrivateStatePaths;
  readonly dependencies?: ProjectPluginPrivateStateDependencies;
}): Promise<void> {
  const dependencies = input.dependencies ?? {};
  if (currentPlatform(dependencies) === "win32") fail("project-plugin-unsupported-platform");
  const makeDirectory = dependencies.mkdir ?? mkdir;
  const changeMode = dependencies.chmod ?? chmod;
  const createDirectory = async (path: string, recursive = false): Promise<boolean> => {
    try {
      await makeDirectory(path, { recursive, mode: 0o700 });
      return true;
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) throw error;
      return false;
    }
  };
  await createDirectory(input.paths.base, true);
  const base = await checkedStat(input.paths.base, dependencies);
  if (base.isSymbolicLink() || !base.isDirectory()) fail("project-plugin-private-state-unsafe");
  const uid = currentUid(dependencies);
  for (const path of [input.paths.prism, input.paths.approvals, input.paths.version]) {
    const created = await createDirectory(path);
    let stat = await checkedStat(path, dependencies);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== uid || (!created && !isPrivate(stat, uid))) {
      fail("project-plugin-private-state-unsafe");
    }
    if (created) {
      await changeMode(path, 0o700);
      stat = await checkedStat(path, dependencies);
      if (stat.isSymbolicLink() || !stat.isDirectory() || !isPrivate(stat, uid)) {
        fail("project-plugin-private-state-unsafe");
      }
    }
  }
  await validateProjectPluginPrivateState({ paths: input.paths, includeRecord: false, dependencies });
}

async function validateOptionalRecord(
  paths: ProjectPluginPrivateStatePaths,
  dependencies: ProjectPluginPrivateStateDependencies,
): Promise<PrivateStateStat | undefined> {
  const uid = currentUid(dependencies);
  try {
    const stat = await (dependencies.lstat ?? lstat)(paths.record);
    if (stat.isSymbolicLink() || !stat.isFile() || !isPrivate(stat, uid)) {
      fail("project-plugin-private-state-unsafe");
    }
    return stat;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export async function readProjectPluginPrivateStateBytes(input: {
  readonly paths: ProjectPluginPrivateStatePaths;
  readonly dependencies?: ProjectPluginPrivateStateDependencies;
}): Promise<Uint8Array | undefined> {
  const dependencies = input.dependencies ?? {};
  if (currentPlatform(dependencies) === "win32") fail("project-plugin-unsupported-platform");
  const uid = currentUid(dependencies);
  for (const [index, path] of [input.paths.base, input.paths.prism, input.paths.approvals, input.paths.version].entries()) {
    let stat: PrivateStateStat;
    try {
      stat = await (dependencies.lstat ?? lstat)(path);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (
      stat.isSymbolicLink()
      || !stat.isDirectory()
      || (index > 0 && !isPrivate(stat, uid))
    ) {
      fail("project-plugin-private-state-unsafe");
    }
  }

  const before = await validateOptionalRecord(input.paths, dependencies);
  if (before === undefined) return undefined;
  const openFile = dependencies.open ?? open;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    await dependencies.beforeFileOpen?.(input.paths.record);
    handle = await openFile(
      input.paths.record,
      currentPlatform(dependencies) !== "win32" && typeof constants.O_NOFOLLOW === "number"
        ? constants.O_RDONLY | constants.O_NOFOLLOW
        : "r",
    );
  } catch {
    fail("project-plugin-private-state-unsafe");
  }
  try {
    const opened = await handle.stat() as PrivateStateStat;
    if (!opened.isFile() || !isPrivate(opened, uid) || !sameFileIdentity(before, opened)) {
      fail("project-plugin-private-state-unsafe");
    }
    const buffer = Buffer.allocUnsafe(MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES) fail("project-plugin-private-state-unsafe");
    const after = await validateOptionalRecord(input.paths, dependencies);
    if (after === undefined || !sameFileIdentity(opened, after)) fail("project-plugin-private-state-unsafe");
    return new Uint8Array(buffer.subarray(0, offset));
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function writeProjectPluginPrivateStateJson(input: {
  readonly paths: ProjectPluginPrivateStatePaths;
  readonly value: unknown;
  readonly dependencies?: ProjectPluginPrivateStateDependencies;
}): Promise<void> {
  const dependencies = input.dependencies ?? {};
  if (currentPlatform(dependencies) === "win32") fail("project-plugin-unsupported-platform");
  let serialized: string;
  try {
    const encoded = JSON.stringify(input.value, null, 2);
    if (encoded === undefined) fail("project-plugin-private-state-unsafe");
    serialized = `${encoded}\n`;
  } catch {
    fail("project-plugin-private-state-unsafe");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES) {
    fail("project-plugin-private-state-unsafe");
  }
  await ensureProjectPluginPrivateStateDirectories({ paths: input.paths, dependencies });
  await validateOptionalRecord(input.paths, dependencies);
  await writeJsonAtomically({
    path: input.paths.record,
    value: input.value,
    directoryMode: 0o700,
    fileMode: 0o600,
  });
  await validateProjectPluginPrivateState({ paths: input.paths, includeRecord: true, dependencies });
}
