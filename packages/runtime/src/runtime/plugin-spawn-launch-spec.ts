/**
 * Spawn-executor artifact digest model.
 *
 * `plugin-launch-spec.ts`'s `computePluginArtifactCommitments` pins a
 * Docker-launched plugin with an `imageDigest`: the build step
 * (`buildPluginImage` in
 * `packages/runtime/test/support/build-plugin-image.ts`) already folds a
 * plugin's `manifest.json` and entrypoint file into a built container
 * image layer, and `docker image inspect` hands back a content-addressed
 * digest of that whole built artifact for free.
 *
 * A spawn-executor plugin has no build step -- it runs as a bare Node
 * subprocess directly against its on-disk files. On disk a plugin is just
 * a flat directory: `manifest.json` plus the entrypoint file it names (see
 * `packages/runtime/test/support/build-plugin-image.ts`'s manifest validation
 * and the `pnh/host-tests/fixtures/registration-plugins/<plugin-id>/` fixtures).
 * There is no build artifact to ask Docker for a digest of, so this module
 * defines the equivalent commitment by hand instead: hash the plugin's two
 * identity-bearing files -- `manifest.json` and the entrypoint file named
 * inside it -- and combine those hashes the same way
 * `computeRunnerDigest` (in `plugin-launch-spec.ts`) combines its own
 * named file hashes: sha256 each file's raw bytes under a fixed label,
 * then sha256 the JSON-encoded `["version tag", [[label, hash], ...]]`
 * array. Same algorithm (sha256), same encoding (lowercase hex), same
 * combining shape, so this digest composes with the rest of the plugin
 * commitment model instead of inventing a parallel one.
 *
 * The entrypoint's *filename* is not used as its label -- the label is the
 * fixed string `"entrypoint"`. The filename itself is already committed by
 * hashing `manifest.json` (which names it), so re-keying by the literal
 * filename would only make the digest sensitive to a cosmetic rename
 * without adding any real identity information.
 *
 * Layered on top of that digest, this module also builds the spawn
 * executor's digest-gated launch specification -- see
 * `createAdmittedPluginSpawnLaunchSpec` below. It still does not validate
 * the rest of the manifest schema (the registry generator already did that
 * before the descriptor was admitted) and it does not spawn anything: the
 * supervisor that actually calls `child_process.spawn` is a separate
 * component and is NOT part of this module.
 *
 * How the three descriptor commitment slots are filled for spawn plugins
 * ---------------------------------------------------------------------
 * `PluginArtifactCommitments` (declared in
 * `packages/sdk/src/node/generate-plugin-registry.ts`) has three slots --
 * `runnerDigest`, `imageDigest`, `profileDigest` -- and they are an *input* to
 * `generatePluginRegistry`, supplied by whichever
 * executor is publishing the registry. They are not Docker-specific
 * storage; only the Docker executor's *values* are. The spawn executor
 * fills all three with spawn-computed values:
 *
 * - `imageDigest`   <- `computeSpawnArtifactDigest` (this module). The
 *                      artifact-identity slot. Spawn has no build step and
 *                      therefore no container image digest, so the on-disk
 *                      artifact digest is that slot's spawn equivalent.
 * - `profileDigest` <- sha256 over
 *                      `packages/runtime/src/kernel/plugin-runner/spawn-profile.json`,
 *                      mirroring `loadProfile` in `plugin-launch-spec.ts` minus
 *                      the seccomp file (a bare subprocess has no seccomp
 *                      profile to commit to).
 * - `runnerDigest`  <- sha256 over the complete executable source closure of
 *                      the spawn supervisor and plugin runner: SDK protocol
 *                      plus resource bounds, the shared supervisor/fault-cell/
 *                      arbiter modules, the spawn adapter, and the plugin-runner
 *                      entrypoint. The container path's `Containerfile` and
 *                      `image.lock.json` have no spawn equivalent.
 *
 * Consequence: unlike the Docker path -- which takes `imageDigest` from the
 * descriptor on trust and only re-derives `runnerDigest`/`profileDigest` --
 * the spawn path re-derives and checks all three, because the artifact it
 * launches is readable right there on disk. Editing a plugin file after
 * admission therefore invalidates its launch spec.
 */
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

const SPAWN_ARTIFACT_DIGEST_VERSION = "pnh-spawn-plugin-artifact-v1";
const SPAWN_PROFILE_DIGEST_VERSION = "pnh-spawn-launch-profile-v1";
const SPAWN_RUNNER_DIGEST_VERSION = "pnh-spawn-plugin-runner-v1";
const SPAWN_PROFILE_KEYS = [
  "version",
  "entrypointFrom",
  "cwd",
  "envAllowlist",
  "environment",
  "uid",
  "gid",
  "uidGidEnforcement",
] as const;

interface PluginSpawnProfile {
  readonly version: "pnh-plugin-spawn-profile-v1";
  readonly entrypointFrom: "manifest.entrypoint";
  readonly cwd: "plugin-root";
  readonly envAllowlist: readonly ["HOME", "PATH"];
  readonly environment: { readonly NODE_OPTIONS: "--disable-proto=throw" };
  readonly uid: 10101;
  readonly gid: 10101;
  readonly uidGidEnforcement: "best-effort-typically-inert";
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function read(path: string): Uint8Array {
  return readFileSync(path);
}

/**
 * Computes the spawn artifact digest from the raw bytes of the two
 * identity-bearing files. The fixed labels, version tag, SHA-256 encoding,
 * and JSON tuple are the `pnh-spawn-plugin-artifact-v1` compatibility
 * contract.
 */
export function computeSpawnArtifactDigestFromBytes(options: {
  readonly manifestBytes: Uint8Array;
  readonly entrypointBytes: Uint8Array;
}): string {
  const entries: Array<readonly [string, string]> = [
    ["manifest.json", sha256(options.manifestBytes)],
    ["entrypoint", sha256(options.entrypointBytes)],
  ];
  return sha256(JSON.stringify([SPAWN_ARTIFACT_DIGEST_VERSION, entries]));
}

/**
 * Computes the artifact digest for a spawn-executor plugin: the content
 * identity of its `manifest.json` plus its entrypoint file, read directly
 * off disk from `pluginRoot` (the plugin's flat directory, e.g.
 * `pnh/host-tests/fixtures/registration-plugins/tool-golden/`).
 *
 * Pure: the only I/O is reading those two named files. Deterministic: the
 * same two files' bytes always produce the same digest, and any change to
 * either file's bytes changes the digest.
 *
 * The entrypoint's filename is read out of `manifest.json`'s own
 * `entrypoint` field. This function performs no other manifest schema
 * validation -- that belongs to whichever caller builds a full launch spec
 * on top of this digest.
 */
function readSpawnArtifactBytes(pluginRoot: string): {
  readonly manifestBytes: Uint8Array;
  readonly entrypointBytes: Uint8Array;
} {
  const manifestBytes = read(resolve(pluginRoot, "manifest.json"));
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch {
    throw new Error("invalid plugin manifest JSON");
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest) ||
    typeof (manifest as Record<string, unknown>).entrypoint !== "string"
  ) {
    throw new Error("plugin manifest is missing a string entrypoint field");
  }
  const entrypointFile = (manifest as { entrypoint: string }).entrypoint;
  return { manifestBytes, entrypointBytes: read(resolve(pluginRoot, entrypointFile)) };
}

export function computeSpawnArtifactDigest(options: { readonly pluginRoot: string }): string {
  return computeSpawnArtifactDigestFromBytes(readSpawnArtifactBytes(options.pluginRoot));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

/**
 * Reads and validates the runtime-root-relative
 * `kernel/plugin-runner/spawn-profile.json`, the spawn executor's sibling to
 * the container path's `launch-profile.json`.
 *
 * Validation is exact-key AND exact-value, matching `loadProfile` in
 * `plugin-launch-spec.ts`: the profile is a committed constant, so any
 * deviation is tampering or drift rather than configuration, and is
 * rejected outright.
 *
 * The profile deliberately carries NO network, filesystem, or resource
 * limit fields. The spawn executor is a bare `child_process.spawn` and
 * enforces none of those, so claiming them here would describe isolation
 * that does not exist.
 *
 * `uid`/`gid` caveat: these are passed through to `child_process.spawn`'s
 * `uid`/`gid` options by the supervisor, but that only takes effect when
 * the calling process already holds the privilege to change user -- i.e.
 * when the harness runs as root. Under the ordinary unprivileged
 * invocation the values are typically inert (and `spawn` may reject them
 * with `EPERM`). Treat them as best effort, NOT as reliable privilege
 * dropping; the committed `uidGidEnforcement` field records that in the
 * profile itself so the honesty survives a copy of the file.
 */
function loadSpawnProfile(runtimeRoot: string): { profile: PluginSpawnProfile; profileDigest: string } {
  const profilePath = resolve(runtimeRoot, "kernel", "plugin-runner", "spawn-profile.json");
  const profileBytes = read(profilePath);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(profileBytes));
  } catch {
    throw new Error("invalid committed plugin spawn profile");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value as Record<string, unknown>, SPAWN_PROFILE_KEYS)
  ) {
    throw new Error("invalid committed plugin spawn profile");
  }
  const profile = value as Partial<PluginSpawnProfile>;
  if (
    profile.version !== "pnh-plugin-spawn-profile-v1" ||
    profile.entrypointFrom !== "manifest.entrypoint" ||
    profile.cwd !== "plugin-root" ||
    JSON.stringify(profile.envAllowlist) !== '["HOME","PATH"]' ||
    JSON.stringify(profile.environment) !== '{"NODE_OPTIONS":"--disable-proto=throw"}' ||
    profile.uid !== 10101 ||
    profile.gid !== 10101 ||
    profile.uidGidEnforcement !== "best-effort-typically-inert"
  ) {
    throw new Error("invalid committed plugin spawn profile");
  }
  return {
    profile: Object.freeze(value) as PluginSpawnProfile,
    profileDigest: sha256(JSON.stringify([SPAWN_PROFILE_DIGEST_VERSION, sha256(profileBytes)])),
  };
}

/**
 * Digest of the complete executable runner-side source closure a spawned
 * plugin is bound to. This includes the SDK protocol and resource limits, the
 * shared custody/fault/resource modules imported by the spawn adapter, the
 * adapter itself, and the plugin-runner entrypoint that executes the protocol
 * loop. The container path's `Containerfile` and `image.lock.json` have no
 * spawn equivalent.
 *
 * The supervisor's `.d.mts` is deliberately excluded -- it carries types only
 * and is erased before anything runs, so it cannot change runtime behaviour.
 */
function computeSpawnRunnerDigest(paths: RuntimeArtifactPaths): string {
  const sources: Array<readonly [string, string]> = [
    ["protocol", paths.sdkProtocolPath],
    ["resource-bounds", paths.sdkResourceBoundsPath],
    ["plugin-fault-cell.mjs", resolve(paths.runtimeRoot, "harness", "plugin-fault-cell.mjs")],
    ["plugin-resource-arbiter.mjs", resolve(paths.runtimeRoot, "harness", "plugin-resource-arbiter.mjs")],
    ["plugin-container-supervisor.mjs", resolve(paths.runtimeRoot, "harness", "plugin-container-supervisor.mjs")],
    ["plugin-spawn-supervisor.mjs", resolve(paths.runtimeRoot, "harness", "plugin-spawn-supervisor.mjs")],
    ["entrypoint.mjs", resolve(paths.runtimeRoot, "kernel", "plugin-runner", "entrypoint.mjs")],
  ];
  const entries = sources.map(([name, path]) => [name, sha256(read(path))] as const);
  return sha256(JSON.stringify([SPAWN_RUNNER_DIGEST_VERSION, entries]));
}

/**
 * The spawn executor's launch specification.
 *
 * Intentionally carries no `createArgs`-shaped field: container-create
 * arguments are Docker's vocabulary, and a bare subprocess has no
 * equivalent. It also carries no `imageDigest` -- `artifactDigest` is the
 * spawn path's artifact identity, and naming it after a container image
 * would imply a build step that does not exist.
 *
 * `env` is the fixed environment the plugin process must receive.
 * `envAllowlist` names the variables that may be forwarded from the host
 * environment. This module does NOT read `process.env` and does not
 * perform that filtering: doing so would make spec construction
 * environment-dependent and therefore non-deterministic. Applying the
 * allowlist is the spawning supervisor's job.
 *
 * `uid`/`gid` are best effort and typically inert -- see `loadSpawnProfile`.
 */
export interface PluginSpawnLaunchSpec {
  readonly pluginId: string;
  readonly artifactDigest: string;
  readonly entrypointPath: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly envAllowlist: readonly string[];
  readonly uid: number;
  readonly gid: number;
}

/**
 * Computes the three commitment slots a spawn-executor plugin's registry
 * descriptor must carry. Feed the result to `generatePluginRegistry`'s
 * `artifactCommitments` input when publishing a registry for the spawn
 * executor; `createAdmittedPluginSpawnLaunchSpec` re-derives the same three
 * values at launch time and refuses to launch if any of them has moved.
 */
export function computeSpawnPluginArtifactCommitments(options: RuntimeArtifactPathOverrides & {
  readonly pluginRoot: string;
}): PluginArtifactCommitments {
  return computeSpawnPluginArtifactCommitmentsFromBytes({
    ...options,
    ...readSpawnArtifactBytes(options.pluginRoot),
  });
}

/**
 * Computes the three spawn-executor registry commitment slots from captured
 * plugin bytes and trusted installed runner/profile assets. This path never
 * reads the plugin tree.
 */
export function computeSpawnPluginArtifactCommitmentsFromBytes(options: RuntimeArtifactPathOverrides & {
  readonly manifestBytes: Uint8Array;
  readonly entrypointBytes: Uint8Array;
}): PluginArtifactCommitments {
  const paths = resolveRuntimeArtifactPaths(options);
  return Object.freeze({
    runnerDigest: computeSpawnRunnerDigest(paths),
    imageDigest: computeSpawnArtifactDigestFromBytes(options),
    profileDigest: loadSpawnProfile(paths.runtimeRoot).profileDigest,
  });
}

/**
 * Builds a frozen `PluginSpawnLaunchSpec` for one admitted plugin, gated on
 * every commitment in that plugin's admitted descriptor still matching the
 * artifacts on disk. Mirrors `createAdmittedPluginLaunchSpec`'s
 * check-then-build shape in `plugin-launch-spec.ts`.
 *
 * Throws:
 * - `TypeError("unverified admission ticket")` if the ticket was not issued
 *   by `admitRegistryBytes` (a forged plain object fails here).
 * - `Error("admitted plugin not found")` if the ticket admitted no plugin
 *   with this id.
 * - `Error("plugin spawn launch commitment mismatch")` if the runner,
 *   artifact, or profile digest re-derived from disk differs from the one
 *   the descriptor committed to.
 */
export function createAdmittedPluginSpawnLaunchSpec(options: RuntimeArtifactPathOverrides & {
  readonly ticket: AdmissionTicket;
  readonly pluginId: string;
  readonly pluginRoot: string;
}): PluginSpawnLaunchSpec {
  if (!isAdmissionTicket(options.ticket)) throw new TypeError("unverified admission ticket");
  const descriptor = resolveAdmittedPlugin(options.ticket, options.pluginId);
  if (descriptor === undefined) throw new Error("admitted plugin not found");
  const commitments = computeSpawnPluginArtifactCommitments({
    ...options,
    pluginRoot: options.pluginRoot,
  });
  if (
    descriptor.runnerDigest !== commitments.runnerDigest ||
    descriptor.imageDigest !== commitments.imageDigest ||
    descriptor.profileDigest !== commitments.profileDigest
  ) {
    throw new Error("plugin spawn launch commitment mismatch");
  }
  const { runtimeRoot } = resolveRuntimeArtifactPaths(options);
  const { profile } = loadSpawnProfile(runtimeRoot);
  return Object.freeze({
    pluginId: descriptor.id,
    artifactDigest: commitments.imageDigest,
    entrypointPath: resolve(options.pluginRoot, descriptor.entrypoint),
    cwd: resolve(options.pluginRoot),
    env: Object.freeze({ ...profile.environment }),
    envAllowlist: Object.freeze([...profile.envAllowlist]),
    uid: profile.uid,
    gid: profile.gid,
  });
}
