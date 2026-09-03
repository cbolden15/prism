import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { writeJsonAtomically } from "./atomic-json.ts";
import { normalizeOrigin } from "./origin.ts";

export const CONFIG_VERSION = "prism-config-v1" as const;

export type ProviderName = "deterministic" | "ollama";

export type PrismConfig =
  | {
      readonly version: typeof CONFIG_VERSION;
      readonly provider: "deterministic";
    }
  | {
      readonly version: typeof CONFIG_VERSION;
      readonly provider: "ollama";
      readonly model: string;
      readonly endpoint: string;
    };

export interface ConfigEnvironment {
  readonly HOME?: string;
  readonly XDG_CONFIG_HOME?: string;
}

export interface ExplicitConfig {
  readonly provider?: ProviderName;
  readonly model?: string;
  readonly endpoint?: string;
}

export interface ResolvedPrismConfig {
  readonly config: PrismConfig;
  readonly source: "explicit" | "project" | "user" | "default";
  readonly endpointSource: "explicit" | "project" | "user" | null;
  readonly paths: ReturnType<typeof prismConfigPaths>;
}

const DEFAULT_CONFIG: PrismConfig = Object.freeze({
  version: CONFIG_VERSION,
  provider: "deterministic",
});

function nonEmptyEnvironmentPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function prismConfigPaths(input: {
  readonly workspace: string;
  readonly environment: ConfigEnvironment;
}): { readonly project: string; readonly user: string } {
  const xdgConfigHome = nonEmptyEnvironmentPath(input.environment.XDG_CONFIG_HOME);
  const home = nonEmptyEnvironmentPath(input.environment.HOME);
  if (xdgConfigHome === undefined && home === undefined) {
    throw new Error("XDG_CONFIG_HOME or HOME is required to resolve Prism user config.");
  }
  return {
    project: join(resolve(input.workspace), ".prism", "config.json"),
    user: join(resolve(xdgConfigHome ?? join(home as string, ".config")), "prism", "config.json"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  const unknown = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unknown !== undefined) throw new Error(`unknown config field: ${unknown}`);
}

function normalizeModel(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Ollama model must be a non-empty string without control characters.");
  }
  return value;
}

export function normalizeEndpoint(value: unknown): string {
  if (typeof value !== "string") throw new Error("Ollama endpoint must be an HTTP(S) origin.");
  try {
    return normalizeOrigin(value);
  } catch {
    throw new Error("Ollama endpoint must be an HTTP(S) origin.");
  }
}

export function parsePrismConfig(serialized: string): PrismConfig {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Prism config contains malformed JSON.");
  }
  if (!isRecord(value)) throw new Error("Prism config must be a JSON object.");
  if (value.version !== CONFIG_VERSION) {
    throw new Error(`unsupported config version: ${String(value.version)}`);
  }
  if (value.provider === "deterministic") {
    assertOnlyFields(value, ["version", "provider"]);
    return DEFAULT_CONFIG;
  }
  if (value.provider === "ollama") {
    assertOnlyFields(value, ["version", "provider", "model", "endpoint"]);
    return {
      version: CONFIG_VERSION,
      provider: "ollama",
      model: normalizeModel(value.model),
      endpoint: normalizeEndpoint(value.endpoint),
    };
  }
  throw new Error(`unsupported provider: ${String(value.provider)}`);
}

async function readConfigIfPresent(path: string): Promise<PrismConfig | undefined> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Prism config path is unsafe: ${path}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  let serialized: string;
  try {
    serialized = await readFile(path, "utf8");
  } catch (error) {
    throw error;
  }
  try {
    return parsePrismConfig(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid config";
    throw new Error(`Invalid Prism config at ${path}: ${message}`);
  }
}

function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

export async function assertProjectConfigPathSafe(input: {
  readonly workspace: string;
  readonly path: string;
}): Promise<void> {
  const expectedInputPath = join(resolve(input.workspace), ".prism", "config.json");
  if (resolve(input.path) !== expectedInputPath) throw new Error("project config path is invalid");
  const workspace = await realpath(input.workspace);
  const expectedCanonicalDirectory = join(workspace, ".prism");
  const directory = dirname(input.path);
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("project config directory is unsafe");
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== expectedCanonicalDirectory || !isWithin(workspace, canonicalDirectory)) {
    throw new Error("project config directory escapes the workspace");
  }
}

async function readProjectConfigIfPresent(input: {
  readonly workspace: string;
  readonly path: string;
}): Promise<PrismConfig | undefined> {
  try {
    await assertProjectConfigPathSafe(input);
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") return undefined;
    throw error;
  }
  return readConfigIfPresent(input.path);
}

function explicitWasProvided(explicit: ExplicitConfig | undefined): boolean {
  return explicit !== undefined && Object.values(explicit).some((value) => value !== undefined);
}

function applyExplicit(base: PrismConfig, explicit: ExplicitConfig | undefined): PrismConfig {
  if (!explicitWasProvided(explicit)) return base;
  const provider = explicit?.provider ?? base.provider;
  if (provider === "deterministic") {
    if (explicit?.model !== undefined || explicit?.endpoint !== undefined) {
      throw new Error("--model and --endpoint require provider ollama.");
    }
    return DEFAULT_CONFIG;
  }

  const model = explicit?.model ?? (base.provider === "ollama" ? base.model : undefined);
  const endpoint = explicit?.endpoint ?? (base.provider === "ollama" ? base.endpoint : undefined);
  return {
    version: CONFIG_VERSION,
    provider: "ollama",
    model: normalizeModel(model),
    endpoint: normalizeEndpoint(endpoint),
  };
}

export async function resolvePrismConfig(input: {
  readonly workspace: string;
  readonly environment: ConfigEnvironment;
  readonly explicit?: ExplicitConfig;
}): Promise<ResolvedPrismConfig> {
  const paths = prismConfigPaths(input);
  if (input.explicit?.provider === "deterministic") {
    return {
      config: applyExplicit(DEFAULT_CONFIG, input.explicit),
      source: "explicit",
      endpointSource: null,
      paths,
    };
  }

  const project = await readProjectConfigIfPresent({ workspace: input.workspace, path: paths.project });
  const user = project === undefined ? await readConfigIfPresent(paths.user) : undefined;
  const base = project ?? user ?? DEFAULT_CONFIG;
  const baseSource = project !== undefined ? "project" : user !== undefined ? "user" : null;
  const config = applyExplicit(base, input.explicit);
  return {
    config,
    source: explicitWasProvided(input.explicit)
      ? "explicit"
      : project !== undefined
        ? "project"
        : user !== undefined
          ? "user"
          : "default",
    endpointSource: config.provider === "ollama"
      ? input.explicit?.endpoint !== undefined
        ? "explicit"
        : base.provider === "ollama"
          ? baseSource
          : null
      : null,
    paths,
  };
}

export async function writePrismConfig(input: {
  readonly workspace: string;
  readonly environment: ConfigEnvironment;
  readonly scope: "project" | "user";
  readonly config: PrismConfig;
}): Promise<string> {
  const workspace = input.scope === "project" ? await realpath(input.workspace) : input.workspace;
  const paths = prismConfigPaths({ workspace, environment: input.environment });
  const path = paths[input.scope];
  const config = parsePrismConfig(JSON.stringify(input.config));
  await writeJsonAtomically({
    path,
    value: config,
    directoryMode: input.scope === "user" ? 0o700 : 0o755,
    fileMode: input.scope === "user" ? 0o600 : 0o644,
  });
  return path;
}
