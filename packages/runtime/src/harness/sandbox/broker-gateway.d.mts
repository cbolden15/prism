import type { Readable, Writable } from "node:stream";
import type { BrokerAction, BrokerRequest, BrokerTimerPort, SupervisorCommandResult } from "../plugin-container-broker.mjs";
import type { LaunchSpec, SupervisorEvent } from "../plugin-container-supervisor.mjs";

export type GatewayRequest = BrokerRequest;

export interface GatewayChild extends NodeJS.EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stdio: [Writable, Readable, unknown, Writable, ...unknown[]];
  exitCode?: number | null;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface BrokerGatewayRouter {
  request(request: GatewayRequest): Promise<SupervisorCommandResult>;
  receiveBroker(frame: unknown): Promise<void>;
  receiveSupervisor(frame: unknown): Promise<void>;
  brokerClosed(error?: Error): void;
  supervisorClosed(error?: Error): void;
  close(error?: Error): void;
}

export function createBrokerGatewayRouter(options: {
  readonly brokerToken: string;
  readonly supervisorToken: string;
  readonly writeBroker: (frame: unknown) => void | Promise<void>;
  readonly writeSupervisor: (frame: unknown) => void | Promise<void>;
  readonly clock: { now(): number };
  readonly timers: BrokerTimerPort;
  readonly emitEvent?: (event: SupervisorEvent) => void | Promise<void>;
}): BrokerGatewayRouter;

export function parseGatewayStartupConfig(text: string): {
  readonly token: string;
  readonly plugins: readonly ({ readonly pluginId: string } & LaunchSpec)[];
};

export function spawnGatewayChildren(options: {
  readonly brokerToken: string;
  readonly supervisorToken: string;
  readonly plugins: readonly ({ readonly pluginId: string } & LaunchSpec)[];
  readonly executable?: string;
  readonly spawnProcess?: (
    executable: string,
    args: readonly string[],
    options: { readonly stdio: readonly ["pipe", "pipe", "inherit", "pipe"] },
  ) => GatewayChild;
  readonly supervisorPath?: string;
}): { readonly broker: GatewayChild; readonly supervisor: GatewayChild };

export function runGatewayProcess(options: {
  readonly input: AsyncIterable<Uint8Array>;
  readonly output: NodeJS.WritableStream;
  readonly token: string;
  readonly children: { readonly broker: GatewayChild; readonly supervisor: GatewayChild };
  readonly brokerToken: string;
  readonly supervisorToken: string;
}): Promise<void>;
