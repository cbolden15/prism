import type { LifecycleResult } from "./plugin-container-supervisor.mjs";

export type BrokerAction = "launch" | "cleanup" | "status" | "acknowledge" | "write" | "close-input";

export interface BrokerRequestBase {
  readonly operationId: string;
  readonly action: BrokerAction;
  readonly requestId: string;
  readonly pluginId: string;
  readonly deadlineMs: number;
}

export type BrokerRequest =
  | (BrokerRequestBase & { readonly action: Exclude<BrokerAction, "write"> })
  | (BrokerRequestBase & { readonly action: "write"; readonly seq: number; readonly dataBase64: string });

export type SupervisorCommand =
  | {
      readonly type: "launch";
      readonly commandId: string;
      readonly requestId: string;
      readonly pluginId: string;
      readonly deadlineMs: number;
    }
  | {
      readonly type: "cleanup" | "status" | "acknowledge" | "close-input";
      readonly commandId: string;
      readonly requestId: string;
      readonly pluginId: string;
    }
  | {
      readonly type: "write";
      readonly commandId: string;
      readonly requestId: string;
      readonly pluginId: string;
      readonly seq: number;
      readonly dataBase64: string;
    };

export type SupervisorCommandResult = LifecycleResult;

export interface BrokerTimerPort {
  set(callback: () => void, delayMs: number): object;
  clear(handle: object): void;
}

export interface PluginContainerBroker {
  request(request: BrokerRequest): Promise<SupervisorCommandResult>;
  close(error?: Error): void;
}

export function createPluginContainerBroker(options: {
  readonly sendSupervisor: (command: SupervisorCommand) => Promise<SupervisorCommandResult>;
  readonly clock: { now(): number };
  readonly timers: BrokerTimerPort;
}): PluginContainerBroker;

export function parseBrokerStartupConfig(text: string): { readonly token: string };

export function runBrokerCommandLoop(options: {
  readonly input: AsyncIterable<Uint8Array>;
  readonly output: NodeJS.WritableStream;
  readonly token: string;
  readonly clock?: { now(): number };
  readonly timers?: BrokerTimerPort;
}): Promise<void>;
