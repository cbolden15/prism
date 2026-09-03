export const PLUGIN_STREAM_CHUNK_BYTES = 256_000;
export const PLUGIN_STREAM_CUMULATIVE_BYTES = 8_000_000;

export interface PluginLifecycleReceipt {
  readonly v: 1;
  readonly requestId: string;
  readonly pluginId: string;
  readonly containerId: string | null;
  readonly trigger:
    | "broker-stop"
    | "deadline"
    | "launch-failed"
    | "supervisor-shutdown"
    | "process-exit"
    | "stream-overflow";
  readonly hardDeadlineAtMs: number;
  readonly daemonState: string;
  readonly exitCode: number | null;
  readonly oomKilled: boolean | null;
  readonly confirmedAbsent: boolean;
  readonly cleanupErrors: readonly string[];
  readonly settledAtMs: number;
}

export interface PluginLaunchRequest {
  readonly requestId: string;
  readonly pluginId: string;
  readonly deadlineMs: number;
}

export interface PluginContainerHandle {
  readonly requestId: string;
  readonly pluginId: string;
  readonly hardDeadlineAtMs: number;
  writeStdin(bytes: Uint8Array): Promise<void>;
  closeStdin(): Promise<void>;
  onStdout(listener: (bytes: Uint8Array) => void): void;
  onStderr(listener: (bytes: Uint8Array) => void): void;
  waitForExit(): Promise<PluginLifecycleReceipt>;
  stop(): Promise<PluginLifecycleReceipt>;
  acknowledge(deadlineMs: number): Promise<void>;
}

export interface PluginContainerPort {
  launch(request: PluginLaunchRequest): Promise<PluginContainerHandle>;
}
