export const CLEANUP_GRACE_MS: 2000;
export const MAX_STREAM_CHUNK_BYTES: 256000;
export const MAX_CUMULATIVE_STREAM_BYTES: 8000000;

export interface DockerObservation {
  readonly containerId: string;
  readonly requestId: string;
  readonly pluginId: string;
  readonly imageDigest: string;
  readonly state: string;
  readonly running: boolean;
  readonly exitCode: number | null;
  readonly oomKilled: boolean | null;
}

export interface DockerCreateInput {
  readonly containerName: string;
  readonly requestId: string;
  readonly pluginId: string;
  readonly imageDigest: string;
  readonly createArgs: readonly string[];
}

export interface DockerLifecyclePort {
  create(input: DockerCreateInput): Promise<string>;
  startAttached(containerId: string, handlers: DockerAttachedHandlers): Promise<DockerAttachedStream>;
  inspect(containerRef: string): Promise<DockerObservation | null>;
  stop(containerId: string): Promise<void>;
  kill(containerId: string): Promise<void>;
  remove(containerId: string): Promise<void>;
}

export interface DockerAttachedHandlers {
  onStdout(bytes: Uint8Array): void;
  onStderr(bytes: Uint8Array): void;
  onClose(): void;
}

export interface DockerAttachedStream {
  write(bytes: Uint8Array): Promise<void>;
  closeInput(): Promise<void>;
}

export interface SupervisorTimerPort {
  set(callback: () => void, delayMs: number): object;
  clear(handle: object): void;
}

export interface AllocationIdentity {
  readonly requestId: string;
  readonly pluginId: string;
}

export interface LaunchRequest extends AllocationIdentity {
  readonly deadlineMs: number;
}

export type CleanupTrigger =
  | "broker-stop"
  | "deadline"
  | "launch-failed"
  | "supervisor-shutdown"
  | "process-exit"
  | "stream-overflow";

export interface CleanupRequest extends AllocationIdentity {
  readonly trigger: CleanupTrigger;
}

export interface LaunchSpec {
  readonly imageDigest: string;
  readonly createArgs: readonly string[];
}

export interface LifecycleReceipt {
  readonly v: 1;
  readonly requestId: string;
  readonly pluginId: string;
  readonly containerId: string | null;
  readonly trigger: CleanupTrigger;
  readonly hardDeadlineAtMs: number;
  readonly daemonState: string;
  readonly exitCode: number | null;
  readonly oomKilled: boolean | null;
  readonly confirmedAbsent: boolean;
  readonly cleanupErrors: readonly string[];
  readonly settledAtMs: number;
}

export type LifecycleResult =
  | {
      readonly status: "running";
      readonly requestId: string;
      readonly pluginId: string;
      readonly containerId: string | null;
      readonly hardDeadlineAtMs: number;
    }
  | { readonly status: "terminal"; readonly receipt: LifecycleReceipt }
  | { readonly status: "acknowledged"; readonly requestId: string; readonly pluginId: string }
  | { readonly status: "input-written"; readonly requestId: string; readonly pluginId: string; readonly seq: number }
  | { readonly status: "input-closed"; readonly requestId: string; readonly pluginId: string };

export type SupervisorEvent =
  | {
      readonly v: 1;
      readonly type: "stream";
      readonly requestId: string;
      readonly pluginId: string;
      readonly channel: "stdout" | "stderr";
      readonly seq: number;
      readonly dataBase64: string;
    }
  | { readonly v: 1; readonly type: "terminal"; readonly receipt: LifecycleReceipt };

export interface PluginContainerSupervisor {
  launch(request: LaunchRequest): Promise<LifecycleResult>;
  cleanup(request: CleanupRequest): Promise<LifecycleResult>;
  writeInput(request: AllocationIdentity & { readonly seq: number; readonly bytes: Uint8Array }): Promise<LifecycleResult>;
  closeInput(request: AllocationIdentity): Promise<LifecycleResult>;
  status(request: AllocationIdentity): Promise<LifecycleResult>;
  acknowledge(request: AllocationIdentity): Promise<LifecycleResult>;
  shutdown(): Promise<readonly LifecycleReceipt[]>;
  idle(): Promise<void>;
}

export interface SupervisorOptions {
  readonly docker: DockerLifecyclePort;
  readonly clock: { now(): number };
  readonly timers: SupervisorTimerPort;
  readonly resolveLaunchSpec: (pluginId: string) => LaunchSpec | undefined;
  readonly emitEvent?: (event: SupervisorEvent) => void | Promise<void>;
  readonly resourceArbiter?: PluginResourceArbiter;
}

export function createPluginContainerSupervisor(options: SupervisorOptions): PluginContainerSupervisor;

export interface DockerCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function createDockerCliLifecyclePort(options?: {
  runDocker?: (args: readonly string[]) => Promise<DockerCommandResult>;
  spawnAttached?: (
    args: readonly string[],
    handlers: DockerAttachedHandlers,
  ) => DockerAttachedStream | Promise<DockerAttachedStream>;
}): DockerLifecyclePort;

export function systemClock(): { now(): number };
export function systemTimers(): SupervisorTimerPort;

export interface SupervisorStartupConfig {
  readonly token: string;
  resolveLaunchSpec(pluginId: string): LaunchSpec | undefined;
}

export function parseSupervisorStartupConfig(text: string): SupervisorStartupConfig;

export function runSupervisorCommandLoop(options: {
  input: AsyncIterable<Uint8Array>;
  output: NodeJS.WritableStream;
  supervisor: PluginContainerSupervisor;
  token: string;
  frameWriter?: {
    write(value: unknown): Promise<void>;
    idle(): Promise<void>;
  };
}): Promise<void>;
import type { PluginResourceArbiter } from "./plugin-resource-arbiter.mjs";
