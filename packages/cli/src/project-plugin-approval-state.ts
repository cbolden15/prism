import { randomUUID } from "node:crypto";
import { lstat, open, rename, rm, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  computeProjectPluginApprovalDigest,
  type ProjectPluginApprovalProposal,
} from "./project-plugin-approval-preview.ts";
import {
  ProjectPluginPrivateStateError,
  ensureProjectPluginPrivateStateDirectories,
  type PrivateStateStat,
  type ProjectPluginPrivateStateDependencies,
  projectPluginPrivateStatePaths,
  readProjectPluginPrivateStateBytes,
  validateProjectPluginPrivateState,
  writeProjectPluginPrivateStateJson,
} from "./project-plugin-private-state.ts";

export const PROJECT_PLUGIN_APPROVAL_RECORD_VERSION = "prism-project-plugin-approval-v1" as const;
const DIGEST = /^[0-9a-f]{64}$/;
const APPROVAL_LOCK_MODE = 0o600;
const APPROVAL_LOCK_TIMEOUT_MS = 1_000;
const APPROVAL_LOCK_RETRY_MS = 10;

export interface ProjectPluginApprovalRecord {
  readonly version: typeof PROJECT_PLUGIN_APPROVAL_RECORD_VERSION;
  readonly workspace: string;
  readonly projectConfigDigest: string;
  readonly declaredPath: string;
  readonly canonicalPluginPath: string;
  readonly operation: "slugify";
  readonly plugin: {
    readonly id: string;
    readonly manifestDigest: string;
    readonly sourceDigest: string;
    readonly registryDigest: string;
    readonly versionDigest: string;
    readonly runnerDigest: string;
    readonly imageDigest: string;
    readonly profileDigest: string;
  };
  readonly approvalDigest: string;
}

export type ProjectPluginApprovalStateErrorCode =
  | "project-plugin-approval-record-invalid"
  | "project-plugin-approval-record-mismatch"
  | "project-plugin-approval-changed"
  | "project-plugin-approval-cleanup-failed"
  | "project-plugin-approval-lock-timeout"
  | "project-plugin-approval-lock-unsafe";

export class ProjectPluginApprovalStateError extends Error {
  readonly code: ProjectPluginApprovalStateErrorCode;

  constructor(code: ProjectPluginApprovalStateErrorCode) {
    super(code);
    this.name = "ProjectPluginApprovalStateError";
    this.code = code;
  }
}

export interface ProjectPluginApprovalStateDependencies extends ProjectPluginPrivateStateDependencies {
  readonly rename?: typeof rename;
  readonly rm?: typeof rm;
  readonly unlinkLock?: typeof unlink;
  readonly lockTimeoutMs?: number;
  readonly lockRetryMs?: number;
  readonly randomId?: () => string;
}

interface ApprovalLockIdentity {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}

function fail(code: ProjectPluginApprovalStateErrorCode): never {
  throw new ProjectPluginApprovalStateError(code);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function parseJsonWithoutDuplicateMembers(text: string): unknown {
  let offset = 0;
  const whitespace = /[\t\n\r ]/y;
  const string = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const skip = (): void => {
    while (true) {
      whitespace.lastIndex = offset;
      if (whitespace.exec(text) === null) return;
      offset = whitespace.lastIndex;
    }
  };
  const value = (): unknown => {
    skip();
    if (text[offset] === "{") {
      offset += 1;
      skip();
      const object: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset += 1;
        return object;
      }
      while (true) {
        string.lastIndex = offset;
        const keyToken = string.exec(text);
        if (keyToken === null) throw new SyntaxError("invalid JSON object key");
        offset = string.lastIndex;
        const key = JSON.parse(keyToken[0]) as string;
        if (keys.has(key)) throw new SyntaxError("duplicate JSON object key");
        keys.add(key);
        skip();
        if (text[offset] !== ":") throw new SyntaxError("invalid JSON object");
        offset += 1;
        object[key] = value();
        skip();
        if (text[offset] === "}") {
          offset += 1;
          return object;
        }
        if (text[offset] !== ",") throw new SyntaxError("invalid JSON object");
        offset += 1;
        skip();
      }
    }
    if (text[offset] === "[") {
      offset += 1;
      const result: unknown[] = [];
      skip();
      if (text[offset] === "]") {
        offset += 1;
        return result;
      }
      while (true) {
        result.push(value());
        skip();
        if (text[offset] === "]") {
          offset += 1;
          return result;
        }
        if (text[offset] !== ",") throw new SyntaxError("invalid JSON array");
        offset += 1;
      }
    }
    string.lastIndex = offset;
    const stringToken = string.exec(text);
    if (stringToken !== null) {
      offset = string.lastIndex;
      return JSON.parse(stringToken[0]);
    }
    number.lastIndex = offset;
    const numberToken = number.exec(text);
    if (numberToken !== null) {
      offset = number.lastIndex;
      return JSON.parse(numberToken[0]);
    }
    for (const literal of ["true", "false", "null"] as const) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return JSON.parse(literal);
      }
    }
    throw new SyntaxError("invalid JSON value");
  };
  const parsed = value();
  skip();
  if (offset !== text.length) throw new SyntaxError("invalid trailing JSON");
  return parsed;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  const actual = Object.keys(object);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(object, key)) ? object : undefined;
}

function stringValue(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function digestValue(object: Record<string, unknown>, key: string): string | undefined {
  const value = stringValue(object, key);
  return value !== undefined && DIGEST.test(value) ? value : undefined;
}

function isNormalizedAbsolutePath(value: string): boolean {
  return isAbsolute(value) && resolve(value) === value && value.length <= 4096;
}

function isDeclaredPath(value: string): boolean {
  if (value.length > 1024 || value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/u.test(value)) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  const segments = value.split("/");
  return segments.length > 0 && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isPluginId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
}

function parseRecord(value: unknown): ProjectPluginApprovalRecord | undefined {
  const root = exactObject(value, [
    "version", "workspace", "projectConfigDigest", "declaredPath", "canonicalPluginPath", "operation", "plugin", "approvalDigest",
  ]);
  if (root === undefined || root.version !== PROJECT_PLUGIN_APPROVAL_RECORD_VERSION || root.operation !== "slugify") return undefined;
  const plugin = exactObject(root.plugin, [
    "id", "manifestDigest", "sourceDigest", "registryDigest", "versionDigest", "runnerDigest", "imageDigest", "profileDigest",
  ]);
  const workspace = stringValue(root, "workspace");
  const projectConfigDigest = digestValue(root, "projectConfigDigest");
  const declaredPath = stringValue(root, "declaredPath");
  const canonicalPluginPath = stringValue(root, "canonicalPluginPath");
  const approvalDigest = digestValue(root, "approvalDigest");
  const id = plugin === undefined ? undefined : stringValue(plugin, "id");
  const manifestDigest = plugin === undefined ? undefined : digestValue(plugin, "manifestDigest");
  const sourceDigest = plugin === undefined ? undefined : digestValue(plugin, "sourceDigest");
  const registryDigest = plugin === undefined ? undefined : digestValue(plugin, "registryDigest");
  const versionDigest = plugin === undefined ? undefined : digestValue(plugin, "versionDigest");
  const runnerDigest = plugin === undefined ? undefined : digestValue(plugin, "runnerDigest");
  const imageDigest = plugin === undefined ? undefined : digestValue(plugin, "imageDigest");
  const profileDigest = plugin === undefined ? undefined : digestValue(plugin, "profileDigest");
  if (
    workspace === undefined || projectConfigDigest === undefined || declaredPath === undefined || canonicalPluginPath === undefined
    || approvalDigest === undefined || id === undefined || manifestDigest === undefined || sourceDigest === undefined
    || registryDigest === undefined || versionDigest === undefined || runnerDigest === undefined || imageDigest === undefined
    || profileDigest === undefined || !isNormalizedAbsolutePath(workspace) || !isDeclaredPath(declaredPath)
    || !isNormalizedAbsolutePath(canonicalPluginPath) || canonicalPluginPath !== resolve(workspace, declaredPath)
    || !isPluginId(id)
  ) {
    return undefined;
  }
  const record: ProjectPluginApprovalRecord = Object.freeze({
    version: PROJECT_PLUGIN_APPROVAL_RECORD_VERSION,
    workspace,
    projectConfigDigest,
    declaredPath,
    canonicalPluginPath,
    operation: "slugify",
    plugin: Object.freeze({ id, manifestDigest, sourceDigest, registryDigest, versionDigest, runnerDigest, imageDigest, profileDigest }),
    approvalDigest,
  });
  return record.approvalDigest === computeProjectPluginApprovalDigest(record) ? record : undefined;
}

export function parseProjectPluginApprovalRecord(text: string): ProjectPluginApprovalRecord {
  try {
    const record = parseRecord(parseJsonWithoutDuplicateMembers(text));
    return record ?? fail("project-plugin-approval-record-invalid");
  } catch {
    return fail("project-plugin-approval-record-invalid");
  }
}

export function approvalRecordFromProposal(proposal: ProjectPluginApprovalProposal): ProjectPluginApprovalRecord {
  const record: ProjectPluginApprovalRecord = Object.freeze({
    version: PROJECT_PLUGIN_APPROVAL_RECORD_VERSION,
    workspace: proposal.workspace,
    projectConfigDigest: proposal.projectConfigDigest,
    declaredPath: proposal.declaredPath,
    canonicalPluginPath: proposal.canonicalPluginPath,
    operation: proposal.operation,
    plugin: Object.freeze({ ...proposal.plugin }),
    approvalDigest: proposal.approvalDigest,
  });
  return parseRecord(record) ?? fail("project-plugin-approval-record-invalid");
}

export function projectPluginApprovalRecordMatchesProposal(
  record: ProjectPluginApprovalRecord,
  proposal: ProjectPluginApprovalProposal,
): boolean {
  try {
    const expected = approvalRecordFromProposal(proposal);
    return JSON.stringify(record) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function pathsFor(workspace: string, environment: Readonly<Record<string, string | undefined>>, dependencies: ProjectPluginApprovalStateDependencies) {
  return projectPluginPrivateStatePaths({ workspace, environment, platform: dependencies.platform });
}

function lockPath(paths: ReturnType<typeof pathsFor>): string {
  return join(paths.version, `.${basename(paths.record)}.lock`);
}

function lockIdentity(stat: PrivateStateStat): ApprovalLockIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function sameLock(left: ApprovalLockIdentity, right: ApprovalLockIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function validLock(stat: PrivateStateStat, uid: number): boolean {
  return !stat.isSymbolicLink()
    && stat.isFile()
    && stat.uid === uid
    && (stat.mode & 0o777) === APPROVAL_LOCK_MODE;
}

async function removeLockIfUnchanged(
  path: string,
  expected: ApprovalLockIdentity,
  dependencies: ProjectPluginApprovalStateDependencies,
): Promise<boolean> {
  let current: PrivateStateStat;
  try {
    current = await (dependencies.lstat ?? lstat)(path);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (!sameLock(expected, lockIdentity(current))) return false;
  try {
    await (dependencies.unlinkLock ?? unlink)(path);
    return true;
  } catch {
    return false;
  }
}

async function acquireApprovalLock(
  paths: ReturnType<typeof pathsFor>,
  dependencies: ProjectPluginApprovalStateDependencies,
): Promise<{
  readonly path: string;
  readonly identity: ApprovalLockIdentity;
  readonly handle: Awaited<ReturnType<typeof open>>;
}> {
  const timeout = dependencies.lockTimeoutMs ?? APPROVAL_LOCK_TIMEOUT_MS;
  const retry = dependencies.lockRetryMs ?? APPROVAL_LOCK_RETRY_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || !Number.isSafeInteger(retry) || retry < 0) {
    fail("project-plugin-approval-lock-unsafe");
  }
  const uid = dependencies.uid ?? process.getuid?.();
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) fail("project-plugin-approval-lock-unsafe");
  await validateProjectPluginPrivateState({ paths, includeRecord: false, dependencies });
  const path = lockPath(paths);
  const deadline = Date.now() + timeout;
  while (true) {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await (dependencies.open ?? open)(path, "wx", APPROVAL_LOCK_MODE);
    } catch (error) {
      if (!isExists(error)) throw error;
      let existing: PrivateStateStat;
      try {
        existing = await (dependencies.lstat ?? lstat)(path);
      } catch (statError) {
        if (isMissing(statError)) continue;
        throw statError;
      }
      if (!validLock(existing, uid)) fail("project-plugin-approval-lock-unsafe");
      if (Date.now() >= deadline) fail("project-plugin-approval-lock-timeout");
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, retry));
      continue;
    }

    let identity: ApprovalLockIdentity | undefined;
    let keepHandleOpen = false;
    try {
      await handle.chmod(APPROVAL_LOCK_MODE);
      const opened = await handle.stat() as PrivateStateStat;
      identity = lockIdentity(opened);
      const linked = await (dependencies.lstat ?? lstat)(path);
      if (!validLock(opened, uid) || !validLock(linked, uid) || !sameLock(identity, lockIdentity(linked))) {
        fail("project-plugin-approval-lock-unsafe");
      }
      keepHandleOpen = true;
      return { path, identity, handle };
    } catch (error) {
      if (identity === undefined || !await removeLockIfUnchanged(path, identity, dependencies)) {
        fail("project-plugin-approval-lock-unsafe");
      }
      throw error;
    } finally {
      if (!keepHandleOpen) await handle.close().catch(() => undefined);
    }
  }
}

export async function withProjectPluginApprovalLock<T>(input: {
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly run: () => Promise<T>;
  readonly dependencies?: ProjectPluginApprovalStateDependencies;
}): Promise<T> {
  const dependencies = input.dependencies ?? {};
  const paths = pathsFor(input.workspace, input.environment, dependencies);
  const lock = await acquireApprovalLock(paths, dependencies);
  try {
    return await input.run();
  } finally {
    try {
      if (!await removeLockIfUnchanged(lock.path, lock.identity, dependencies)) {
        fail("project-plugin-approval-lock-unsafe");
      }
    } finally {
      await lock.handle.close().catch(() => undefined);
    }
  }
}

export async function readProjectPluginApprovalState(input: {
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectPluginApprovalStateDependencies;
}): Promise<ProjectPluginApprovalRecord | undefined> {
  const dependencies = input.dependencies ?? {};
  const paths = pathsFor(input.workspace, input.environment, dependencies);
  const bytes = await readProjectPluginPrivateStateBytes({ paths, dependencies });
  if (bytes === undefined) return undefined;
  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("project-plugin-approval-record-invalid");
  }
  const record = parseProjectPluginApprovalRecord(serialized);
  if (record.workspace !== input.workspace) fail("project-plugin-approval-record-mismatch");
  return record;
}

export async function writeProjectPluginApprovalState(input: {
  readonly proposal: ProjectPluginApprovalProposal;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly isFresh?: () => Promise<boolean>;
  readonly dependencies?: ProjectPluginApprovalStateDependencies;
}): Promise<ProjectPluginApprovalRecord> {
  const dependencies = input.dependencies ?? {};
  const record = approvalRecordFromProposal(input.proposal);
  const paths = pathsFor(record.workspace, input.environment, dependencies);
  await ensureProjectPluginPrivateStateDirectories({ paths, dependencies });
  return withProjectPluginApprovalLock({
    workspace: record.workspace,
    environment: input.environment,
    dependencies,
    async run() {
      if (input.isFresh !== undefined) {
        let fresh = false;
        try {
          fresh = await input.isFresh();
        } catch {
          fresh = false;
        }
        if (!fresh) fail("project-plugin-approval-changed");
      }
      await writeProjectPluginPrivateStateJson({ paths, value: record, dependencies });
      return record;
    },
  });
}

export async function revokeProjectPluginApprovalState(input: {
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectPluginApprovalStateDependencies;
}): Promise<boolean> {
  const dependencies = input.dependencies ?? {};
  const paths = pathsFor(input.workspace, input.environment, dependencies);
  const record = await readProjectPluginApprovalState(input);
  if (record === undefined) return false;
  return withProjectPluginApprovalLock({
    workspace: input.workspace,
    environment: input.environment,
    dependencies,
    async run() {
      if (await readProjectPluginApprovalState(input) === undefined) return false;
      await validateProjectPluginPrivateState({ paths, includeRecord: true, dependencies });
      const tombstone = join(paths.version, `.${basename(paths.record)}.revoked.${process.pid}.${dependencies.randomId?.() ?? randomUUID()}`);
      await (dependencies.rename ?? rename)(paths.record, tombstone);
      try {
        await (dependencies.rm ?? rm)(tombstone, { force: true });
      } catch {
        fail("project-plugin-approval-cleanup-failed");
      }
      return true;
    },
  });
}

export { ProjectPluginPrivateStateError };
