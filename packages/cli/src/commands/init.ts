import { realpath } from "node:fs/promises";
import {
  CONFIG_VERSION,
  normalizeEndpoint,
  parsePrismConfig,
  type ConfigEnvironment,
  type PrismConfig,
  writePrismConfig,
} from "../config.ts";
import { isLoopbackOrigin, normalizeOrigin } from "../origin.ts";
import { grantEndpointTrust } from "../trust.ts";
import type { CliWriter } from "./run.ts";

export const INIT_USAGE = "Usage: prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--allow-remote-endpoint <origin>] [--yes]\n";

type InitScope = "project" | "user";

interface ParsedInitArguments {
  readonly provider: "deterministic" | "ollama";
  readonly model?: string;
  readonly endpoint?: string;
  readonly scope: InitScope;
  readonly allowRemoteEndpoint?: string;
  readonly yes: boolean;
}

type ParseResult =
  | { readonly ok: true; readonly value: ParsedInitArguments }
  | { readonly ok: false; readonly message: string };

function parseInitArguments(arguments_: readonly string[]): ParseResult {
  let provider: "deterministic" | "ollama" = "deterministic";
  let model: string | undefined;
  let endpoint: string | undefined;
  let scope: InitScope = "project";
  let allowRemoteEndpoint: string | undefined;
  let yes = false;
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (argument === "--yes") {
      if (seen.has(argument)) return { ok: false, message: `Option --yes may only be specified once.\n${INIT_USAGE}` };
      seen.add(argument);
      yes = true;
      continue;
    }
    if (argument === "--") {
      const extra = arguments_[index + 1];
      return { ok: false, message: `${extra === undefined ? "Unexpected --." : `Unexpected argument: ${extra}`}\n${INIT_USAGE}` };
    }
    if (argument !== "--provider" && argument !== "--model" && argument !== "--endpoint" && argument !== "--scope" && argument !== "--allow-remote-endpoint") {
      return { ok: false, message: `${argument.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${INIT_USAGE}` };
    }
    if (seen.has(argument)) return { ok: false, message: `Option ${argument} may only be specified once.\n${INIT_USAGE}` };
    seen.add(argument);
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("-")) {
      return { ok: false, message: `Option ${argument} requires a value.\n${INIT_USAGE}` };
    }
    index += 1;
    if (argument === "--provider") {
      if (value !== "deterministic" && value !== "ollama") {
        return { ok: false, message: `Unsupported provider: ${value}\n${INIT_USAGE}` };
      }
      provider = value;
    } else if (argument === "--model") {
      model = value;
    } else if (argument === "--endpoint") {
      endpoint = value;
    } else if (argument === "--scope") {
      if (value !== "project" && value !== "user") {
        return { ok: false, message: `Unsupported scope: ${value}\n${INIT_USAGE}` };
      }
      scope = value;
    } else {
      allowRemoteEndpoint = value;
    }
  }

  if (provider === "deterministic" && (model !== undefined || endpoint !== undefined)) {
    return { ok: false, message: `--model and --endpoint require provider ollama.\n${INIT_USAGE}` };
  }
  if (provider === "ollama" && model === undefined) {
    return { ok: false, message: `Provider ollama requires --model.\n${INIT_USAGE}` };
  }
  if (provider === "deterministic" && allowRemoteEndpoint !== undefined) {
    return { ok: false, message: `--allow-remote-endpoint requires provider ollama.\n${INIT_USAGE}` };
  }
  if (provider === "ollama") {
    let normalizedEndpoint: string;
    try {
      normalizedEndpoint = normalizeEndpoint(endpoint ?? "http://127.0.0.1:11434");
    } catch (error) {
      return { ok: false, message: `${error instanceof Error ? error.message : "Invalid endpoint."}\n${INIT_USAGE}` };
    }
    if (!isLoopbackOrigin(normalizedEndpoint)) {
      if (!yes || allowRemoteEndpoint === undefined) {
        return { ok: false, message: `Remote init requires --yes and --allow-remote-endpoint ${normalizedEndpoint}.\n${INIT_USAGE}` };
      }
      let normalizedAllowed: string;
      try {
        normalizedAllowed = normalizeOrigin(allowRemoteEndpoint);
      } catch (error) {
        return { ok: false, message: `${error instanceof Error ? error.message : "Invalid origin."}\n${INIT_USAGE}` };
      }
      if (normalizedAllowed !== allowRemoteEndpoint) {
        return { ok: false, message: `--allow-remote-endpoint must equal the normalized origin: ${normalizedAllowed}\n${INIT_USAGE}` };
      }
      if (normalizedAllowed !== normalizedEndpoint) {
        return { ok: false, message: `--allow-remote-endpoint must equal ${normalizedEndpoint}.\n${INIT_USAGE}` };
      }
    } else if (allowRemoteEndpoint !== undefined) {
      return { ok: false, message: `--allow-remote-endpoint is not used for loopback endpoints.\n${INIT_USAGE}` };
    }
    try {
      const validated = parsePrismConfig(JSON.stringify({
        version: CONFIG_VERSION,
        provider: "ollama",
        model,
        endpoint: normalizedEndpoint,
      }));
      if (validated.provider !== "ollama") throw new Error("Provider ollama config is invalid.");
      model = validated.model;
      endpoint = validated.endpoint;
    } catch (error) {
      return { ok: false, message: `${error instanceof Error ? error.message : "Invalid Ollama config."}\n${INIT_USAGE}` };
    }
  }
  return { ok: true, value: { provider, model, endpoint, scope, allowRemoteEndpoint, yes } };
}

function buildConfig(parsed: ParsedInitArguments): PrismConfig {
  if (parsed.provider === "deterministic") {
    return { version: CONFIG_VERSION, provider: "deterministic" };
  }
  return {
    version: CONFIG_VERSION,
    provider: "ollama",
    model: parsed.model as string,
    endpoint: normalizeEndpoint(parsed.endpoint ?? "http://127.0.0.1:11434"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}

export async function initCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
  readonly environment: ConfigEnvironment;
}): Promise<number> {
  const parsed = parseInitArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  try {
    const workspace = await realpath(input.workspace);
    const config = buildConfig(parsed.value);
    const path = await writePrismConfig({
      workspace,
      environment: input.environment,
      scope: parsed.value.scope,
      config,
    });
    if (config.provider === "ollama" && !isLoopbackOrigin(config.endpoint)) {
      if (parsed.value.scope === "user") {
        await grantEndpointTrust({
          environment: input.environment,
          scope: "user",
          origin: config.endpoint,
        });
      } else {
        await grantEndpointTrust({
          environment: input.environment,
          scope: "project",
          origin: config.endpoint,
          workspace,
          projectConfigPath: path,
        });
      }
    }
    input.stdout.write(`Initialized ${parsed.value.scope} config for ${config.provider}.\n${path}\n`);
    return 0;
  } catch (error) {
    input.stderr.write(`Prism init failed: ${errorMessage(error)}\n`);
    return 1;
  }
}
