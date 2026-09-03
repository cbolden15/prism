import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginArtifactCommitments } from "@useprism/sdk/node/registry";
import {
  isAdmissionTicket,
  resolveAdmittedPlugin,
  type AdmissionTicket,
} from "./admission-ticket.ts";
import {
  resolveRuntimeArtifactPaths,
  type RuntimeArtifactPathOverrides,
  type RuntimeArtifactPaths,
} from "./artifact-paths.ts";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const PROFILE_KEYS = [
  "version",
  "pull",
  "logDriver",
  "interactive",
  "ipc",
  "network",
  "readOnly",
  "capDrop",
  "securityOptions",
  "seccomp",
  "pidsLimit",
  "memory",
  "cpus",
  "user",
  "workdir",
  "tmpfs",
  "environment",
] as const;

interface PluginLaunchProfile {
  readonly version: "pnh-plugin-launch-profile-v1";
  readonly pull: "never";
  readonly logDriver: "none";
  readonly interactive: true;
  readonly ipc: "private";
  readonly network: "none";
  readonly readOnly: true;
  readonly capDrop: readonly ["ALL"];
  readonly securityOptions: readonly ["no-new-privileges:true"];
  readonly seccomp: "seccomp.json";
  readonly pidsLimit: 64;
  readonly memory: "128m";
  readonly cpus: "0.5";
  readonly user: "10101:10101";
  readonly workdir: "/pnh/kernel/plugin-runner";
  readonly tmpfs: readonly ["/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777"];
  readonly environment: { readonly HOME: "/tmp"; readonly NODE_OPTIONS: "--disable-proto=throw" };
}

export interface PluginLaunchSpec {
  readonly pluginId: string;
  readonly imageDigest: string;
  readonly createArgs: readonly string[];
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function read(path: string): Uint8Array {
  return readFileSync(path);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function loadProfile(runtimeRoot: string): { profile: PluginLaunchProfile; profileDigest: string; seccompPath: string } {
  const runnerRoot = resolve(runtimeRoot, "kernel", "plugin-runner");
  const profileBytes = read(resolve(runnerRoot, "launch-profile.json"));
  const seccompPath = resolve(runnerRoot, "seccomp.json");
  const seccompBytes = read(seccompPath);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(profileBytes));
  } catch {
    throw new Error("invalid committed plugin launch profile");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || !exactKeys(value as Record<string, unknown>, PROFILE_KEYS)) {
    throw new Error("invalid committed plugin launch profile");
  }
  const profile = value as Partial<PluginLaunchProfile>;
  if (
    profile.version !== "pnh-plugin-launch-profile-v1" ||
    profile.pull !== "never" ||
    profile.logDriver !== "none" ||
    profile.interactive !== true ||
    profile.ipc !== "private" ||
    profile.network !== "none" ||
    profile.readOnly !== true ||
    JSON.stringify(profile.capDrop) !== '["ALL"]' ||
    JSON.stringify(profile.securityOptions) !== '["no-new-privileges:true"]' ||
    profile.seccomp !== "seccomp.json" ||
    profile.pidsLimit !== 64 ||
    profile.memory !== "128m" ||
    profile.cpus !== "0.5" ||
    profile.user !== "10101:10101" ||
    profile.workdir !== "/pnh/kernel/plugin-runner" ||
    JSON.stringify(profile.tmpfs) !== '["/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777"]' ||
    JSON.stringify(profile.environment) !== '{"HOME":"/tmp","NODE_OPTIONS":"--disable-proto=throw"}'
  ) {
    throw new Error("invalid committed plugin launch profile");
  }
  return {
    profile: Object.freeze(value) as PluginLaunchProfile,
    profileDigest: sha256(JSON.stringify([
      "pnh-plugin-launch-profile-v1",
      sha256(profileBytes),
      sha256(seccompBytes),
    ])),
    seccompPath,
  };
}

function computeRunnerDigest(paths: RuntimeArtifactPaths): string {
  const runnerRoot = resolve(paths.runtimeRoot, "kernel", "plugin-runner");
  const sources: Array<readonly [string, string]> = [
    ["Containerfile", resolve(runnerRoot, "Containerfile")],
    ["image.lock.json", resolve(runnerRoot, "image.lock.json")],
    ["entrypoint.mjs", resolve(runnerRoot, "entrypoint.mjs")],
    ["protocol", paths.sdkProtocolPath],
    ["resource-bounds", paths.sdkResourceBoundsPath],
  ];
  const entries = sources.map(([name, path]) => [name, sha256(read(path))] as const);
  return sha256(JSON.stringify(["pnh-plugin-runner-v1", entries]));
}

export function computePluginArtifactCommitments(options: RuntimeArtifactPathOverrides & {
  readonly imageDigest: string;
}): PluginArtifactCommitments {
  if (!DIGEST_RE.test(options.imageDigest)) throw new TypeError("invalid plugin image digest");
  const paths = resolveRuntimeArtifactPaths(options);
  return Object.freeze({
    runnerDigest: computeRunnerDigest(paths),
    imageDigest: options.imageDigest,
    profileDigest: loadProfile(paths.runtimeRoot).profileDigest,
  });
}

export function createAdmittedPluginLaunchSpec(options: RuntimeArtifactPathOverrides & {
  readonly ticket: AdmissionTicket;
  readonly pluginId: string;
}): PluginLaunchSpec {
  if (!isAdmissionTicket(options.ticket)) throw new TypeError("unverified admission ticket");
  const descriptor = resolveAdmittedPlugin(options.ticket, options.pluginId);
  if (descriptor === undefined) throw new Error("admitted plugin not found");
  const commitments = computePluginArtifactCommitments({ ...options, imageDigest: descriptor.imageDigest });
  if (
    descriptor.runnerDigest !== commitments.runnerDigest ||
    descriptor.profileDigest !== commitments.profileDigest
  ) {
    throw new Error("plugin launch commitment mismatch");
  }
  const { runtimeRoot } = resolveRuntimeArtifactPaths(options);
  const { profile, seccompPath } = loadProfile(runtimeRoot);
  return Object.freeze({
    pluginId: descriptor.id,
    imageDigest: descriptor.imageDigest,
    createArgs: Object.freeze([
      `--pull=${profile.pull}`,
      `--log-driver=${profile.logDriver}`,
      "--interactive",
      `--ipc=${profile.ipc}`,
      `--network=${profile.network}`,
      "--read-only",
      `--cap-drop=${profile.capDrop[0]}`,
      `--security-opt=${profile.securityOptions[0]}`,
      `--security-opt=seccomp=${seccompPath}`,
      `--pids-limit=${profile.pidsLimit}`,
      `--memory=${profile.memory}`,
      `--cpus=${profile.cpus}`,
      `--user=${profile.user}`,
      `--workdir=${profile.workdir}`,
      `--tmpfs=${profile.tmpfs[0]}`,
      `--env=HOME=${profile.environment.HOME}`,
      `--env=NODE_OPTIONS=${profile.environment.NODE_OPTIONS}`,
      `sha256:${descriptor.imageDigest}`,
    ]),
  });
}
