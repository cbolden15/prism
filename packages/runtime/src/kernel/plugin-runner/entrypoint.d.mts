import type { PluginRequestFrame } from "@useprism/sdk/protocol";

export interface PluginModule {
  handle(request: PluginRequestFrame): unknown | Promise<unknown>;
}

export interface PluginLoopOptions {
  input: AsyncIterable<Uint8Array>;
  output: NodeJS.WritableStream;
  plugin: PluginModule;
}

export function runPluginLoop(options: PluginLoopOptions): Promise<void>;
