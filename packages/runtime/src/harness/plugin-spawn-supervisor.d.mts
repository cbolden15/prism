import type { DockerLifecyclePort, LaunchSpec } from "./plugin-container-supervisor.d.mts";
import type { PluginSpawnLaunchSpec } from "../runtime/plugin-spawn-launch-spec.ts";

export const SPAWN_LAUNCH_ARGS_VERSION: "pnh-spawn-launch-v1";

/**
 * A privilege drop that could not be performed. Emitted through the same event
 * channel the supervisor writes its stream and terminal events to, so a
 * fallback to the invoking user is always visible in the frame stream.
 */
export interface SpawnPrivilegeWarningEvent {
  readonly v: 1;
  readonly type: "warning";
  readonly code: "spawn-privilege-drop-failed";
  readonly requestId: string;
  readonly pluginId: string;
  readonly requestedUid: number;
  readonly requestedGid: number;
  readonly actualUid: number | null;
  readonly actualGid: number | null;
  readonly errorCode: string;
}

export type SpawnLifecycleEvent = SpawnPrivilegeWarningEvent;

/** Structural subset of `ChildProcess` this port depends on. */
export interface SpawnChildProcess {
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  readonly stdin: NodeJS.WritableStream | null;
  /** Process-group leader id, since every child is spawned `detached`. */
  readonly pid?: number | undefined;
  kill(signal?: string | number): boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  once(event: string, listener: (...args: never[]) => void): unknown;
}

export interface SpawnProcessOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdio: readonly string[];
  readonly detached?: boolean;
  readonly uid?: number;
  readonly gid?: number;
}

export interface SpawnLifecyclePortOptions {
  readonly emitEvent?: (event: SpawnLifecycleEvent) => unknown;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnProcessOptions,
  ) => SpawnChildProcess;
  /**
   * Seam over `process.kill(-pid, signal)`. Inject alongside `spawnProcess`
   * whenever a fake child is supplied, so a synthetic pid cannot reach a real
   * host process group.
   */
  readonly signalGroup?: (pid: number, signal: number | string) => void;
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  readonly stopGraceMs?: number;
  readonly killGraceMs?: number;
  readonly drainGraceMs?: number;
}

/**
 * Encode a spawn launch specification into the two-element `createArgs`
 * envelope the container supervisor's validator accepts.
 */
export function encodeSpawnLaunchSpec(spec: PluginSpawnLaunchSpec): readonly string[];

/**
 * Adapt a spawn launch specification to the supervisor's admitted launch-spec
 * shape. `imageDigest` carries the spawn artifact digest verbatim; it has no
 * Docker meaning.
 */
export function toSupervisorStartupPlugin(
  spec: PluginSpawnLaunchSpec,
): LaunchSpec & { readonly pluginId: string };

/** A lifecycle port that runs plugins as bare subprocesses. */
export function createSpawnLifecyclePort(options?: SpawnLifecyclePortOptions): DockerLifecyclePort;
