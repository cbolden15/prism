import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  resolvePrismConfig,
  type ConfigEnvironment,
} from "../config.ts";
import { prismStatePaths, type StateEnvironment } from "../run-store.ts";
import { authorizeEndpoint } from "../trust.ts";
import type { CliWriter } from "./run.ts";

export const DOCTOR_USAGE = "Usage: prism doctor [--allow-remote-endpoint <origin>] [--json]\n";

const MAX_OLLAMA_RESPONSE_BYTES = 1_048_576;
const OLLAMA_TIMEOUT_MS = 3_000;

type DoctorEnvironment = ConfigEnvironment & StateEnvironment;

export interface DoctorCommandDependencies {
  readonly nodeVersion?: string;
  readonly resolveConfig?: typeof resolvePrismConfig;
  readonly authorizeEndpoint?: typeof authorizeEndpoint;
  readonly inspectOllama?: (input: {
    readonly origin: string;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
  }) => Promise<{ readonly models: readonly string[] }>;
  readonly checkWritableDirectory?: (path: string, privateDirectory: boolean) => Promise<void>;
}

interface DoctorCheck {
  readonly name: string;
  readonly status: "ok";
  readonly detail: string;
}

type ParseDoctorResult =
  | { readonly ok: true; readonly json: boolean; readonly allowRemoteEndpoint?: string }
  | { readonly ok: false; readonly message: string };

function parseDoctorArguments(arguments_: readonly string[]): ParseDoctorResult {
  let json = false;
  let allowRemoteEndpoint: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (argument === "--json") {
      if (json) return { ok: false, message: `Option --json may only be specified once.\n${DOCTOR_USAGE}` };
      json = true;
      continue;
    }
    if (argument === "--allow-remote-endpoint") {
      if (allowRemoteEndpoint !== undefined) {
        return { ok: false, message: `Option --allow-remote-endpoint may only be specified once.\n${DOCTOR_USAGE}` };
      }
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ok: false, message: `Option --allow-remote-endpoint requires a value.\n${DOCTOR_USAGE}` };
      }
      allowRemoteEndpoint = value;
      index += 1;
      continue;
    }
    return {
      ok: false,
      message: `${argument.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${DOCTOR_USAGE}`,
    };
  }
  return { ok: true, json, ...(allowRemoteEndpoint === undefined ? {} : { allowRemoteEndpoint }) };
}

function nodeVersionSupported(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version);
  if (match === null) return false;
  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  return major === 26 && (minor > 8 || (minor === 8 && patch >= 1));
}

async function probeWritableDirectory(path: string, privateDirectory: boolean): Promise<void> {
  await mkdir(path, { recursive: true, mode: privateDirectory ? 0o700 : 0o755 });
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${path} is not a safe directory`);
  if (privateDirectory) await chmod(path, 0o700);
  const probe = join(path, `.prism-doctor-${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(probe, "wx", 0o600);
    await handle.writeFile("writable\n", "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(probe, { force: true }).catch(() => undefined);
  }
}

function uniqueModelNames(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Ollama returned malformed JSON");
  }
  const models = Reflect.get(value, "models");
  if (!Array.isArray(models) || models.length > 10_000) throw new Error("Ollama returned malformed JSON");
  const names = models.map((model) => {
    if (typeof model !== "object" || model === null || Array.isArray(model)) throw new Error("Ollama returned malformed JSON");
    const name = Reflect.get(model, "name") ?? Reflect.get(model, "model");
    if (typeof name !== "string" || name === "" || name.length > 512) throw new Error("Ollama returned malformed JSON");
    return name;
  });
  return [...new Set(names)];
}

async function inspectOllama(input: {
  readonly origin: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}): Promise<{ readonly models: readonly string[] }> {
  let response: Response;
  try {
    response = await fetch(`${input.origin}/api/tags`, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    throw new Error(`Ollama unreachable at ${input.origin}`);
  }
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status} at ${input.origin}`);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > input.maxResponseBytes) {
    throw new Error(`Ollama response exceeded ${input.maxResponseBytes} bytes`);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("Ollama returned an empty response");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > input.maxResponseBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Ollama response exceeded ${input.maxResponseBytes} bytes`);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Ollama returned malformed JSON");
  }
  return { models: uniqueModelNames(parsed) };
}

function renderSuccess(provider: "deterministic" | "ollama", nodeVersion: string): string {
  return [
    "Prism doctor: ok",
    `Node: ${nodeVersion}`,
    `Provider: ${provider}`,
    "Config: writable",
    "State: writable",
    "",
  ].join("\n");
}

function emitFailure(input: {
  readonly json: boolean;
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly provider?: "deterministic" | "ollama";
  readonly checks: readonly DoctorCheck[];
  readonly error: string;
}): number {
  if (input.json) {
    input.stdout.write(`${JSON.stringify({
      status: "failed",
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      checks: input.checks,
      error: input.error,
    })}\n`);
  } else {
    input.stderr.write(`${input.error}\n`);
  }
  return 1;
}

function message(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}

export async function doctorCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
  readonly environment: DoctorEnvironment;
  readonly dependencies?: DoctorCommandDependencies;
}): Promise<number> {
  const parsed = parseDoctorArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  const dependencies = input.dependencies ?? {};
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  const checks: DoctorCheck[] = [];
  if (!nodeVersionSupported(nodeVersion)) {
    return emitFailure({
      json: parsed.json,
      stdout: input.stdout,
      stderr: input.stderr,
      checks,
      error: "Node 26.8.1 or newer within major 26 is required",
    });
  }
  checks.push({ name: "node", status: "ok", detail: nodeVersion });

  let workspace: string;
  let resolved: Awaited<ReturnType<typeof resolvePrismConfig>>;
  try {
    workspace = await realpath(input.workspace);
    resolved = await (dependencies.resolveConfig ?? resolvePrismConfig)({
      workspace,
      environment: input.environment,
    });
    if (parsed.allowRemoteEndpoint !== undefined && resolved.config.provider !== "ollama") {
      input.stderr.write(`--allow-remote-endpoint requires provider ollama.\n${DOCTOR_USAGE}`);
      return 2;
    }
    checks.push({ name: "config", status: "ok", detail: resolved.source });
    const writable = dependencies.checkWritableDirectory ?? probeWritableDirectory;
    const configDirectory = dirname(resolved.source === "user" ? resolved.paths.user : resolved.paths.project);
    await writable(configDirectory, resolved.source === "user");
    const state = prismStatePaths({ environment: input.environment });
    await writable(state.prism, true);
    await writable(state.runs, true);
    checks.push({ name: "locations", status: "ok", detail: "config and state writable" });
  } catch (error) {
    return emitFailure({
      json: parsed.json,
      stdout: input.stdout,
      stderr: input.stderr,
      checks,
      error: message(error),
    });
  }

  if (resolved.config.provider === "ollama") {
    try {
      if (resolved.endpointSource === null) throw new Error("remote endpoint not authorized");
      const authorization = await (dependencies.authorizeEndpoint ?? authorizeEndpoint)({
        environment: input.environment,
        endpoint: resolved.config.endpoint,
        workspace,
        endpointSource: resolved.endpointSource,
        projectConfigPath: resolved.endpointSource === "project" ? resolved.paths.project : undefined,
        allowRemoteEndpoint: parsed.allowRemoteEndpoint,
      });
      checks.push({ name: "authorization", status: "ok", detail: authorization.method });
      const diagnostic = await (dependencies.inspectOllama ?? inspectOllama)({
        origin: authorization.origin,
        timeoutMs: OLLAMA_TIMEOUT_MS,
        maxResponseBytes: MAX_OLLAMA_RESPONSE_BYTES,
      });
      checks.push({ name: "ollama", status: "ok", detail: authorization.origin });
      if (!diagnostic.models.includes(resolved.config.model)) {
        throw new Error(`model not found; run ollama pull ${resolved.config.model}`);
      }
      checks.push({ name: "model", status: "ok", detail: resolved.config.model });
    } catch (error) {
      return emitFailure({
        json: parsed.json,
        stdout: input.stdout,
        stderr: input.stderr,
        provider: "ollama",
        checks,
        error: message(error),
      });
    }
  }

  if (parsed.json) {
    input.stdout.write(`${JSON.stringify({
      status: "ok",
      provider: resolved.config.provider,
      checks,
    })}\n`);
  } else {
    input.stdout.write(renderSuccess(resolved.config.provider, nodeVersion));
  }
  return 0;
}
