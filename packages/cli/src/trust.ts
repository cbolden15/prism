import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { writeJsonAtomically } from "./atomic-json.ts";
import {
  assertProjectConfigPathSafe,
  parsePrismConfig,
  prismConfigPaths,
  type ConfigEnvironment,
} from "./config.ts";
import { isLoopbackOrigin, normalizeOrigin } from "./origin.ts";

export const TRUST_VERSION = "prism-trust-v1" as const;

interface ProjectTrust {
  readonly origin: string;
  readonly workspace: string;
  readonly configSha256: string;
}

interface TrustRecord {
  readonly version: typeof TRUST_VERSION;
  readonly origins: readonly string[];
  readonly projects: readonly ProjectTrust[];
}

export type EndpointSource = "explicit" | "project" | "user";

export interface EndpointAuthorization {
  readonly origin: string;
  readonly method: "loopback" | "flag" | "user-trust" | "project-trust";
}

const DIGEST_RE = /^[0-9a-f]{64}$/;
const EMPTY_TRUST: TrustRecord = Object.freeze({
  version: TRUST_VERSION,
  origins: Object.freeze([]),
  projects: Object.freeze([]),
});

function environmentPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function prismTrustPath(input: { readonly environment: ConfigEnvironment }): string {
  const xdgConfigHome = environmentPath(input.environment.XDG_CONFIG_HOME);
  const home = environmentPath(input.environment.HOME);
  if (xdgConfigHome === undefined && home === undefined) {
    throw new Error("XDG_CONFIG_HOME or HOME is required to resolve Prism trust.");
  }
  return join(resolve(xdgConfigHome ?? join(home as string, ".config")), "prism", "trust.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value).find((key) => !expectedSet.has(key));
  if (unknown !== undefined) throw new Error(`unknown ${label} field: ${unknown}`);
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`invalid ${label} fields`);
  }
}

function parseTrustRecord(serialized: string): TrustRecord {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Prism trust contains malformed JSON.");
  }
  if (!isRecord(value)) throw new Error("Prism trust must be a JSON object.");
  if (value.version !== TRUST_VERSION) throw new Error(`unsupported trust version: ${String(value.version)}`);
  exactKeys(value, ["version", "origins", "projects"], "trust");
  if (!Array.isArray(value.origins) || !Array.isArray(value.projects)) throw new Error("Prism trust entries must be arrays.");
  const origins = value.origins.map((origin) => {
    if (typeof origin !== "string" || normalizeOrigin(origin) !== origin || isLoopbackOrigin(origin)) {
      throw new Error("trusted origin must be a normalized remote origin");
    }
    return origin;
  });
  if (new Set(origins).size !== origins.length) throw new Error("trusted origins must be unique");
  const projects = value.projects.map((project) => {
    if (!isRecord(project)) throw new Error("project trust entry must be an object");
    exactKeys(project, ["origin", "workspace", "configSha256"], "project trust");
    if (
      typeof project.origin !== "string"
      || normalizeOrigin(project.origin) !== project.origin
      || isLoopbackOrigin(project.origin)
      || typeof project.workspace !== "string"
      || !isAbsolute(project.workspace)
      || typeof project.configSha256 !== "string"
      || !DIGEST_RE.test(project.configSha256)
    ) {
      throw new Error("project trust entry is invalid");
    }
    return {
      origin: project.origin,
      workspace: project.workspace,
      configSha256: project.configSha256,
    };
  });
  const projectKeys = projects.map((project) => `${project.workspace}\0${project.origin}\0${project.configSha256}`);
  if (new Set(projectKeys).size !== projectKeys.length) throw new Error("project trust entries must be unique");
  return { version: TRUST_VERSION, origins, projects };
}

async function readTrust(environment: ConfigEnvironment): Promise<TrustRecord> {
  const path = prismTrustPath({ environment });
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Prism trust path is unsafe: ${path}`);
    return parseTrustRecord(await readFile(path, "utf8"));
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") return EMPTY_TRUST;
    throw error;
  }
}

function digest(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

async function projectBinding(input: {
  readonly environment: ConfigEnvironment;
  readonly origin: string;
  readonly workspace: string;
  readonly projectConfigPath: string;
}): Promise<ProjectTrust> {
  const workspace = await realpath(input.workspace);
  const expectedPath = prismConfigPaths({ workspace, environment: input.environment }).project;
  if (resolve(input.projectConfigPath) !== expectedPath) throw new Error("project trust config path is invalid");
  await assertProjectConfigPathSafe({ workspace, path: expectedPath });
  const stat = await lstat(expectedPath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("project trust config path is unsafe");
  const serialized = await readFile(expectedPath, "utf8");
  const config = parsePrismConfig(serialized);
  if (config.provider !== "ollama" || config.endpoint !== input.origin) {
    throw new Error("project trust config does not select the requested origin");
  }
  return { origin: input.origin, workspace, configSha256: digest(serialized) };
}

export async function grantEndpointTrust(input:
  | {
      readonly environment: ConfigEnvironment;
      readonly scope: "user";
      readonly origin: string;
    }
  | {
      readonly environment: ConfigEnvironment;
      readonly scope: "project";
      readonly origin: string;
      readonly workspace: string;
      readonly projectConfigPath: string;
    }): Promise<void> {
  const origin = normalizeOrigin(input.origin);
  if (origin !== input.origin || isLoopbackOrigin(origin)) {
    throw new Error("only exact normalized remote origins may be trusted");
  }
  const current = await readTrust(input.environment);
  const origins = [...current.origins];
  const projects = [...current.projects];
  if (input.scope === "user") {
    if (!origins.includes(origin)) origins.push(origin);
  } else {
    const binding = await projectBinding({ ...input, origin });
    if (!projects.some((entry) => (
      entry.origin === binding.origin
      && entry.workspace === binding.workspace
      && entry.configSha256 === binding.configSha256
    ))) projects.push(binding);
  }
  origins.sort();
  projects.sort((left, right) => (
    left.workspace.localeCompare(right.workspace)
    || left.origin.localeCompare(right.origin)
    || left.configSha256.localeCompare(right.configSha256)
  ));
  await writeJsonAtomically({
    path: prismTrustPath({ environment: input.environment }),
    value: { version: TRUST_VERSION, origins, projects },
    directoryMode: 0o700,
    fileMode: 0o600,
  });
}

export async function authorizeEndpoint(input: {
  readonly environment: ConfigEnvironment;
  readonly endpoint: string;
  readonly workspace: string;
  readonly endpointSource: EndpointSource;
  readonly projectConfigPath?: string;
  readonly allowRemoteEndpoint?: string;
}): Promise<EndpointAuthorization> {
  const origin = normalizeOrigin(input.endpoint);
  if (isLoopbackOrigin(origin)) return { origin, method: "loopback" };

  if (input.allowRemoteEndpoint !== undefined) {
    const allowed = normalizeOrigin(input.allowRemoteEndpoint);
    if (allowed !== input.allowRemoteEndpoint) {
      throw new Error(`--allow-remote-endpoint must equal the normalized origin: ${allowed}`);
    }
    if (allowed !== origin) throw new Error("remote endpoint not authorized");
    return { origin, method: "flag" };
  }

  const trust = await readTrust(input.environment);
  if (trust.origins.includes(origin)) return { origin, method: "user-trust" };
  if (input.endpointSource === "project" && input.projectConfigPath !== undefined) {
    const binding = await projectBinding({
      environment: input.environment,
      origin,
      workspace: input.workspace,
      projectConfigPath: input.projectConfigPath,
    });
    if (trust.projects.some((entry) => (
      entry.origin === binding.origin
      && entry.workspace === binding.workspace
      && entry.configSha256 === binding.configSha256
    ))) return { origin, method: "project-trust" };
  }
  throw new Error("remote endpoint not authorized");
}
