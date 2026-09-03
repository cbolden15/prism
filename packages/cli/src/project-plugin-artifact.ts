import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { admitPinnedRegistryBytes } from "@useprism/runtime";
import type { PreparedProjectPluginApproval, ProjectPluginApprovalProposal } from "./project-plugin-approval-preview.ts";
import {
  projectPluginApprovalRecordMatchesProposal,
  readProjectPluginApprovalState,
} from "./project-plugin-approval-state.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOCK_TIMEOUT_MS = 1_000;
const LOCK_RETRY_MS = 10;

export type ProjectPluginArtifactErrorCode =
  | "project-plugin-unsupported-platform"
  | "project-plugin-artifact-unsafe"
  | "project-plugin-artifact-invalid"
  | "project-plugin-artifact-lock-timeout"
  | "project-plugin-approval-digest-mismatch"
  | "project-plugin-approval-missing"
  | "project-plugin-approval-mismatch";

export class ProjectPluginArtifactError extends Error {
  readonly code: ProjectPluginArtifactErrorCode;

  constructor(code: ProjectPluginArtifactErrorCode) {
    super(code);
    this.name = "ProjectPluginArtifactError";
    this.code = code;
  }
}

export interface ProjectPluginArtifactPaths {
  readonly base: string;
  readonly prism: string;
  readonly artifacts: string;
  readonly version: string;
  readonly root: string;
  readonly registryPath: string;
  readonly pinPath: string;
  readonly pluginsRoot: string;
  readonly pluginRoot: string;
  readonly lockPath: string;
}

export interface ProjectPluginArtifact {
  readonly registryDigest: string;
  readonly root: string;
  readonly registryPath: string;
  readonly pinPath: string;
  readonly pluginsRoot: string;
  readonly pluginRoot: string;
  readonly reused: boolean;
}

export interface ProjectPluginArtifactDependencies {
  readonly platform?: string;
  readonly uid?: number;
  readonly lockTimeoutMs?: number;
  readonly lockRetryMs?: number;
  readonly randomId?: () => string;
  readonly afterLockAcquired?: () => Promise<void> | void;
  readonly afterLockIdentityCaptured?: (input: { readonly lockPath: string }) => Promise<void> | void;
  readonly afterStageValidated?: (input: { readonly attempt: number; readonly stage: string }) => Promise<void> | void;
  readonly afterQuarantineRenamed?: (input: { readonly quarantine: string }) => Promise<void> | void;
  readonly afterPublished?: (input: { readonly attempt: number; readonly root: string }) => Promise<void> | void;
  readonly lstat?: typeof lstat;
  readonly rm?: typeof rm;
}

interface FileIdentity {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number;
  readonly size: number | bigint;
  readonly mtimeMs: number | bigint;
  readonly ctimeMs: number | bigint;
}

function failure(code: ProjectPluginArtifactErrorCode): never {
  throw new ProjectPluginArtifactError(code);
}

function platform(dependencies: ProjectPluginArtifactDependencies): string {
  return dependencies.platform ?? process.platform;
}

function uid(dependencies: ProjectPluginArtifactDependencies): number {
  return dependencies.uid ?? process.getuid?.() ?? failure("project-plugin-artifact-unsafe");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function identity(stat: Awaited<ReturnType<typeof lstat>>): FileIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: Number(stat.mode),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameNode(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function isPrivate(stat: Awaited<ReturnType<typeof lstat>>, expectedUid: number): boolean {
  return Number(stat.uid) === expectedUid && (Number(stat.mode) & 0o077) === 0;
}

function stateBase(environment: Readonly<Record<string, string | undefined>>): string {
  const xdgStateHome = environment.XDG_STATE_HOME?.trim()
    || (environment.HOME?.trim() ? join(environment.HOME.trim(), ".local", "state") : undefined);
  if (xdgStateHome === undefined) failure("project-plugin-artifact-unsafe");
  return resolve(xdgStateHome);
}

export function projectPluginArtifactPaths(input: {
  readonly registryDigest: string;
  readonly pluginId: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform?: string;
}): ProjectPluginArtifactPaths {
  if ((input.platform ?? process.platform) === "win32") failure("project-plugin-unsupported-platform");
  if (!/^[0-9a-f]{64}$/u.test(input.registryDigest) || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(input.pluginId)) {
    failure("project-plugin-artifact-invalid");
  }
  const base = stateBase(input.environment);
  const prism = join(base, "prism");
  const artifacts = join(prism, "plugin-artifacts");
  const version = join(artifacts, "v1");
  const root = join(version, input.registryDigest);
  const pluginsRoot = join(root, "plugins");
  return Object.freeze({
    base,
    prism,
    artifacts,
    version,
    root,
    registryPath: join(root, "registry.json"),
    pinPath: join(root, "plugin-pins.json"),
    pluginsRoot,
    pluginRoot: join(pluginsRoot, input.pluginId),
    lockPath: join(version, `${input.registryDigest}.lock`),
  });
}

async function checkedStat(
  path: string,
  dependencies: ProjectPluginArtifactDependencies = {},
): Promise<Awaited<ReturnType<typeof lstat>>> {
  try {
    return await (dependencies.lstat ?? lstat)(path);
  } catch (error) {
    if (isMissing(error)) failure("project-plugin-artifact-invalid");
    throw error;
  }
}

async function ensureDirectory(
  path: string,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
  isBase = false,
): Promise<void> {
  try {
    await mkdir(path, { mode: DIRECTORY_MODE });
  } catch (error) {
    if (!isExists(error)) throw error;
  }
  const stat = await checkedStat(path, dependencies);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (!isBase && !isPrivate(stat, expectedUid))) {
    failure("project-plugin-artifact-unsafe");
  }
  if (!isBase) {
    await chmod(path, DIRECTORY_MODE);
    const after = await checkedStat(path, dependencies);
    if (after.isSymbolicLink() || !after.isDirectory() || !isPrivate(after, expectedUid)) {
      failure("project-plugin-artifact-unsafe");
    }
  }
}

async function ensureArtifactState(
  paths: ProjectPluginArtifactPaths,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
): Promise<void> {
  await mkdir(paths.base, { recursive: true, mode: DIRECTORY_MODE });
  await ensureDirectory(paths.base, expectedUid, dependencies, true);
  await ensureDirectory(paths.prism, expectedUid, dependencies);
  await ensureDirectory(paths.artifacts, expectedUid, dependencies);
  await ensureDirectory(paths.version, expectedUid, dependencies);
}

async function writePrivateFile(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes, { mode: FILE_MODE, flag: "wx" });
  await chmod(path, FILE_MODE);
}

function pinBytes(proposal: ProjectPluginApprovalProposal): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({
    version: "pnh-plugin-pins-v1",
    environment: "production",
    plugins: [{
      id: proposal.plugin.id,
      manifestDigest: proposal.plugin.manifestDigest,
      sourceDigest: proposal.plugin.sourceDigest,
    }],
  })}\n`);
}

async function readPrivateExact(
  path: string,
  bytes: Uint8Array,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
): Promise<boolean> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await (dependencies.lstat ?? lstat)(path);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile() || !isPrivate(before, expectedUid) || (before.mode & 0o777) !== FILE_MODE) {
    failure("project-plugin-artifact-unsafe");
  }
  if (before.size !== bytes.byteLength) return false;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, typeof constants.O_NOFOLLOW === "number" ? constants.O_RDONLY | constants.O_NOFOLLOW : "r");
  } catch {
    failure("project-plugin-artifact-unsafe");
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !isPrivate(opened, expectedUid) || !sameIdentity(identity(before), identity(opened))) {
      failure("project-plugin-artifact-unsafe");
    }
    const buffer = Buffer.allocUnsafe(bytes.byteLength + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await (dependencies.lstat ?? lstat)(path);
    if (!sameIdentity(identity(opened), identity(after))) failure("project-plugin-artifact-unsafe");
    return offset === bytes.byteLength
      && buffer.subarray(0, offset).every((value, index) => value === bytes[index]);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function requirePrivateDirectory(
  path: string,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
): Promise<void> {
  const stat = await checkedStat(path, dependencies);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !isPrivate(stat, expectedUid) || (Number(stat.mode) & 0o777) !== DIRECTORY_MODE) {
    failure("project-plugin-artifact-unsafe");
  }
}

async function exactListing(path: string, expected: readonly string[]): Promise<boolean> {
  try {
    const actual = (await readdir(path)).sort();
    const sortedExpected = [...expected].sort();
    return actual.length === sortedExpected.length && actual.every((entry, index) => entry === sortedExpected[index]);
  } catch {
    return false;
  }
}

async function validateArtifact(
  paths: ProjectPluginArtifactPaths,
  prepared: PreparedProjectPluginApproval,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
): Promise<boolean> {
  const captured = prepared.capturedBytes();
  const proposal = prepared.proposal;
  await requirePrivateDirectory(paths.root, expectedUid, dependencies);
  if (!await exactListing(paths.root, ["plugin-pins.json", "plugins", "registry.json"])) return false;
  await requirePrivateDirectory(paths.pluginsRoot, expectedUid, dependencies);
  if (!await exactListing(paths.pluginsRoot, [proposal.plugin.id])) return false;
  await requirePrivateDirectory(paths.pluginRoot, expectedUid, dependencies);
  if (!await exactListing(paths.pluginRoot, ["manifest.json", ...captured.runtimeFiles.map((file) => file.name)])) return false;
  const exactFiles = async (): Promise<boolean> => {
    if (!await readPrivateExact(paths.registryPath, captured.registryBytes, expectedUid, dependencies)) return false;
    if (!await readPrivateExact(paths.pinPath, pinBytes(proposal), expectedUid, dependencies)) return false;
    if (!await readPrivateExact(join(paths.pluginRoot, "manifest.json"), captured.manifestBytes, expectedUid, dependencies)) return false;
    for (const file of captured.runtimeFiles) {
      if (!await readPrivateExact(join(paths.pluginRoot, file.name), file.bytes, expectedUid, dependencies)) return false;
    }
    return true;
  };
  if (!await exactFiles()) return false;

  const admitted = admitPinnedRegistryBytes({
    bytes: captured.registryBytes,
    pinPath: paths.pinPath,
    pluginsRoot: paths.pluginsRoot,
  });
  if (!admitted.ok || admitted.ticket.ticket.plugins.length !== 1) return false;
  const plugin = admitted.ticket.ticket.plugins[0];
  if (plugin === undefined || plugin.id !== proposal.plugin.id
    || plugin.manifestDigest !== proposal.plugin.manifestDigest
    || plugin.sourceDigest !== proposal.plugin.sourceDigest
    || plugin.versionDigest !== proposal.plugin.versionDigest
    || plugin.runnerDigest !== proposal.plugin.runnerDigest
    || plugin.imageDigest !== proposal.plugin.imageDigest
    || plugin.profileDigest !== proposal.plugin.profileDigest
    || admitted.ticket.ticket.registryDigest !== proposal.plugin.registryDigest) return false;

  await requirePrivateDirectory(paths.root, expectedUid, dependencies);
  await requirePrivateDirectory(paths.pluginsRoot, expectedUid, dependencies);
  await requirePrivateDirectory(paths.pluginRoot, expectedUid, dependencies);
  return exactFiles();
}

async function makeStage(
  paths: ProjectPluginArtifactPaths,
  prepared: PreparedProjectPluginApproval,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
  attempt: number,
): Promise<{ readonly path: string; readonly file: FileIdentity }> {
  const captured = prepared.capturedBytes();
  const stage = join(paths.version, `.stage-${paths.root.slice(-64)}-${dependencies.randomId?.() ?? randomUUID()}`);
  await mkdir(stage, { mode: DIRECTORY_MODE });
  let staged: { readonly path: string; readonly file: FileIdentity } | undefined;
  let completed = false;
  try {
    let stageStat: Awaited<ReturnType<typeof lstat>>;
    try {
      stageStat = await checkedStat(stage, dependencies);
    } catch {
      failure("project-plugin-artifact-unsafe");
    }
    staged = { path: stage, file: identity(stageStat) };
    if (stageStat.isSymbolicLink() || !stageStat.isDirectory() || !isPrivate(stageStat, expectedUid)) {
      failure("project-plugin-artifact-unsafe");
    }
    await chmod(stage, DIRECTORY_MODE);
    await mkdir(join(stage, "plugins"), { mode: DIRECTORY_MODE });
    await chmod(join(stage, "plugins"), DIRECTORY_MODE);
    await mkdir(join(stage, "plugins", prepared.proposal.plugin.id), { mode: DIRECTORY_MODE });
    await chmod(join(stage, "plugins", prepared.proposal.plugin.id), DIRECTORY_MODE);
    await writePrivateFile(join(stage, "registry.json"), captured.registryBytes);
    await writePrivateFile(join(stage, "plugin-pins.json"), pinBytes(prepared.proposal));
    await writePrivateFile(join(stage, "plugins", prepared.proposal.plugin.id, "manifest.json"), captured.manifestBytes);
    for (const file of captured.runtimeFiles) {
      await writePrivateFile(join(stage, "plugins", prepared.proposal.plugin.id, file.name), file.bytes);
    }
    const stagedPaths = { ...paths, root: stage, registryPath: join(stage, "registry.json"), pinPath: join(stage, "plugin-pins.json"), pluginsRoot: join(stage, "plugins"), pluginRoot: join(stage, "plugins", prepared.proposal.plugin.id) };
    if (!await validateArtifact(stagedPaths, prepared, expectedUid, dependencies)) failure("project-plugin-artifact-invalid");
    await dependencies.afterStageValidated?.({ attempt, stage });
    completed = true;
    return staged;
  } finally {
    if (!completed) {
      let cleanupTarget = staged;
      if (cleanupTarget === undefined) {
        try {
          const recovered = await (dependencies.lstat ?? lstat)(stage);
          if (recovered.isSymbolicLink() || !recovered.isDirectory() || !isPrivate(recovered, expectedUid)) {
            failure("project-plugin-artifact-unsafe");
          }
          cleanupTarget = { path: stage, file: identity(recovered) };
        } catch (error) {
          if (!isMissing(error)) failure("project-plugin-artifact-unsafe");
        }
      }
      if (cleanupTarget !== undefined && !await removeIfUnchanged(cleanupTarget.path, cleanupTarget.file, dependencies)) {
        failure("project-plugin-artifact-unsafe");
      }
    }
  }
}

async function removeIfUnchanged(
  path: string,
  expected: FileIdentity,
  dependencies: ProjectPluginArtifactDependencies,
): Promise<boolean> {
  try {
    const current = await (dependencies.lstat ?? lstat)(path);
    if (!sameNode(identity(current), expected)) return false;
    await (dependencies.rm ?? rm)(path, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return true;
    failure("project-plugin-artifact-unsafe");
  }
}

async function acquireLock(paths: ProjectPluginArtifactPaths, expectedUid: number, dependencies: ProjectPluginArtifactDependencies): Promise<{ readonly file: FileIdentity }> {
  const timeout = dependencies.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  const retry = dependencies.lockRetryMs ?? LOCK_RETRY_MS;
  const deadline = Date.now() + timeout;
  while (true) {
    try {
      const handle = await open(paths.lockPath, "wx", FILE_MODE);
      let lock: FileIdentity | undefined;
      try {
        const stat = await handle.stat();
        lock = identity(stat);
        await dependencies.afterLockIdentityCaptured?.({ lockPath: paths.lockPath });
        if (!stat.isFile() || !isPrivate(stat, expectedUid) || (stat.mode & 0o777) !== FILE_MODE) {
          failure("project-plugin-artifact-unsafe");
        }
        await handle.chmod(FILE_MODE);
        const after = await handle.stat();
        if (!after.isFile() || !isPrivate(after, expectedUid) || !sameNode(lock, identity(after)) || (after.mode & 0o777) !== FILE_MODE) {
          failure("project-plugin-artifact-unsafe");
        }
        return { file: lock };
      } catch (error) {
        if (lock !== undefined && !await removeIfUnchanged(paths.lockPath, lock, dependencies)) {
          failure("project-plugin-artifact-unsafe");
        }
        throw error;
      } finally {
        await handle.close().catch(() => undefined);
      }
    } catch (error) {
      if (!isExists(error)) throw error;
      let stat: Awaited<ReturnType<typeof lstat>>;
      try {
        stat = await lstat(paths.lockPath);
      } catch (statError) {
        if (isMissing(statError)) continue;
        throw statError;
      }
      if (stat.isSymbolicLink() || !stat.isFile() || !isPrivate(stat, expectedUid) || (stat.mode & 0o777) !== FILE_MODE) {
        failure("project-plugin-artifact-unsafe");
      }
      if (Date.now() >= deadline) failure("project-plugin-artifact-lock-timeout");
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, retry));
    }
  }
}

async function replaceInvalidDestination(
  paths: ProjectPluginArtifactPaths,
  expectedUid: number,
  dependencies: ProjectPluginArtifactDependencies,
  quarantines: Array<{ readonly path: string; readonly file: FileIdentity }>,
): Promise<void> {
  let destination: Awaited<ReturnType<typeof lstat>>;
  try {
    destination = await lstat(paths.root);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (destination.isSymbolicLink() || !destination.isDirectory() || !isPrivate(destination, expectedUid) || (destination.mode & 0o777) !== DIRECTORY_MODE) {
    failure("project-plugin-artifact-unsafe");
  }
  const quarantine = join(paths.version, `.quarantine-${paths.root.slice(-64)}-${dependencies.randomId?.() ?? randomUUID()}`);
  await rename(paths.root, quarantine);
  const moved = { path: quarantine, file: identity(destination) };
  quarantines.push(moved);
  await dependencies.afterQuarantineRenamed?.({ quarantine });
  const movedStat = await checkedStat(quarantine, dependencies);
  if (!sameNode(moved.file, identity(movedStat))) failure("project-plugin-artifact-unsafe");
}

function artifactResult(
  paths: ProjectPluginArtifactPaths,
  registryDigest: string,
  reused: boolean,
): ProjectPluginArtifact {
  return Object.freeze({
    registryDigest,
    root: paths.root,
    registryPath: paths.registryPath,
    pinPath: paths.pinPath,
    pluginsRoot: paths.pluginsRoot,
    pluginRoot: paths.pluginRoot,
    reused,
  });
}

async function materializeProjectPluginArtifact(input: {
  readonly prepared: PreparedProjectPluginApproval;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectPluginArtifactDependencies;
}): Promise<ProjectPluginArtifact> {
  const dependencies = input.dependencies ?? {};
  if (platform(dependencies) === "win32") failure("project-plugin-unsupported-platform");
  const proposal = input.prepared.proposal;
  const paths = projectPluginArtifactPaths({
    registryDigest: proposal.plugin.registryDigest,
    pluginId: proposal.plugin.id,
    environment: input.environment,
    platform: platform(dependencies),
  });
  const expectedUid = uid(dependencies);
  await ensureArtifactState(paths, expectedUid, dependencies);
  const lock = await acquireLock(paths, expectedUid, dependencies);
  const quarantines: Array<{ readonly path: string; readonly file: FileIdentity }> = [];
  const cleanupQuarantines = async (): Promise<void> => {
    while (quarantines.length > 0) {
      const quarantine = quarantines[0] as { readonly path: string; readonly file: FileIdentity };
      if (!await removeIfUnchanged(quarantine.path, quarantine.file, dependencies)) {
        failure("project-plugin-artifact-unsafe");
      }
      quarantines.shift();
    }
  };
  try {
    await dependencies.afterLockAcquired?.();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let valid = false;
      try {
        valid = await validateArtifact(paths, input.prepared, expectedUid, dependencies);
      } catch (error) {
        if (!(error instanceof ProjectPluginArtifactError) || error.code !== "project-plugin-artifact-invalid") throw error;
      }
      if (valid) {
        await cleanupQuarantines();
        return artifactResult(paths, proposal.plugin.registryDigest, true);
      }

      await replaceInvalidDestination(paths, expectedUid, dependencies, quarantines);
      let stage: { readonly path: string; readonly file: FileIdentity } | undefined;
      let published = false;
      try {
        stage = await makeStage(paths, input.prepared, expectedUid, dependencies, attempt);
        await rename(stage.path, paths.root);
        published = true;
        await dependencies.afterPublished?.({ attempt, root: paths.root });
        if (!await validateArtifact(paths, input.prepared, expectedUid, dependencies)) failure("project-plugin-artifact-invalid");
        await cleanupQuarantines();
        return artifactResult(paths, proposal.plugin.registryDigest, false);
      } catch (error) {
        lastError = error;
        if (stage !== undefined && !published && !await removeIfUnchanged(stage.path, stage.file, dependencies)) {
          failure("project-plugin-artifact-unsafe");
        }
        if (published && attempt === 1) {
          await replaceInvalidDestination(paths, expectedUid, dependencies, quarantines);
        }
      }
    }
    throw lastError ?? new ProjectPluginArtifactError("project-plugin-artifact-invalid");
  } finally {
    let cleanupError: unknown;
    try {
      await cleanupQuarantines();
    } catch (error) {
      cleanupError = error;
    }
    try {
      if (!await removeIfUnchanged(paths.lockPath, lock.file, dependencies)) failure("project-plugin-artifact-unsafe");
    } catch (error) {
      cleanupError ??= error;
    }
    if (cleanupError !== undefined) throw cleanupError;
  }
}

export async function publishFirstProjectPluginArtifact(input: {
  readonly prepared: PreparedProjectPluginApproval;
  readonly confirmedApprovalDigest?: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectPluginArtifactDependencies;
}): Promise<ProjectPluginArtifact> {
  if (input.confirmedApprovalDigest !== input.prepared.proposal.approvalDigest) {
    failure("project-plugin-approval-digest-mismatch");
  }
  return materializeProjectPluginArtifact(input);
}

export async function validateOrRepairActiveProjectPluginArtifact(input: {
  readonly prepared: PreparedProjectPluginApproval;
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectPluginArtifactDependencies;
}): Promise<ProjectPluginArtifact> {
  const dependencies = input.dependencies ?? {};
  if (platform(dependencies) === "win32") failure("project-plugin-unsupported-platform");
  const approval = await readProjectPluginApprovalState({
    workspace: input.workspace,
    environment: input.environment,
    dependencies: { platform: platform(dependencies) },
  });
  if (approval === undefined) failure("project-plugin-approval-missing");
  if (!projectPluginApprovalRecordMatchesProposal(approval, input.prepared.proposal)) {
    failure("project-plugin-approval-mismatch");
  }
  if (!await input.prepared.isFresh()) failure("project-plugin-approval-mismatch");
  const artifact = await materializeProjectPluginArtifact(input);
  if (!await input.prepared.isFresh()) failure("project-plugin-approval-mismatch");
  return artifact;
}
