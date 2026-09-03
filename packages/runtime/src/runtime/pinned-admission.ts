/**
 * Owner-approved registry admission for spawn-executor plugins.
 *
 * Ordinary admission proves that registry bytes match their supplied digest.
 * This seam additionally requires exact owner-pin membership and independently
 * re-derives manifest, source, runner, artifact, profile, and version identity
 * from the descriptor and on-disk trees before issuing a second runtime brand.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  admitRegistryBytes,
  type AdmissionTicket,
  type RegistryAdmissionResult,
} from "./admission-ticket.ts";
import {
  hasDuplicateMembers,
  loadPluginPinRecord,
  type PluginPinRecord,
} from "./plugin-pins.ts";
import { computeSpawnPluginArtifactCommitments } from "./plugin-spawn-launch-spec.ts";
import type { RuntimeArtifactPathOverrides } from "./artifact-paths.ts";
import {
  computeManifestDigest,
  computeVersionDigest,
  normalizeManifest,
  sourceDigest,
} from "@useprism/sdk/node/registry";

const approvedTickets = new WeakSet<object>();

export interface OwnerApprovedAdmissionTicket {
  readonly ticket: AdmissionTicket;
  readonly pinnedPluginIds: readonly string[];
}

export type PinnedRegistryAdmissionFailureCode =
  | Extract<RegistryAdmissionResult, { ok: false }>["code"]
  | "pin-record"
  | "unpinned-plugin"
  | "pinned-plugin-missing"
  | "pin-digest-mismatch"
  | "manifest-file"
  | "manifest-digest-derivation"
  | "version-digest-derivation"
  | "source-digest-derivation"
  | "commitment-mismatch";

export type PinnedRegistryAdmissionResult =
  | { ok: true; ticket: OwnerApprovedAdmissionTicket }
  | { ok: false; code: PinnedRegistryAdmissionFailureCode };

/**
 * Checks the full directory listing because sourceDigest covers only declared
 * files. Exported so the launch seam can enforce the identical rule.
 */
export function hasExactListing(directory: string, files: readonly string[]): boolean {
  const expected = ["manifest.json", ...files].sort();
  let entries: string[];
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return false;
  }
  return entries.length === expected.length && entries.every((entry, index) => entry === expected[index]);
}

export function isOwnerApprovedAdmissionTicket(
  value: unknown,
): value is OwnerApprovedAdmissionTicket {
  return typeof value === "object" && value !== null && approvedTickets.has(value);
}

export function admitPinnedRegistryBytes(options: RuntimeArtifactPathOverrides & {
  readonly bytes: Uint8Array;
  readonly pinPath: string;
  readonly pluginsRoot: string;
}): PinnedRegistryAdmissionResult {
  const { bytes, pinPath, pluginsRoot } = options;
  let pins: PluginPinRecord;
  try {
    pins = loadPluginPinRecord(pinPath);
  } catch {
    return { ok: false, code: "pin-record" };
  }
  if (!(bytes instanceof Uint8Array)) return { ok: false, code: "digest-format" };

  const digest = createHash("sha256").update(bytes).digest("hex");
  const admitted = admitRegistryBytes(bytes, digest);
  if (!admitted.ok) return admitted;

  const pinned = new Map(pins.plugins.map((entry) => [entry.id, entry] as const));
  const approvedIds: string[] = [];

  for (const plugin of admitted.ticket.plugins) {
    const pin = pinned.get(plugin.id);
    if (pin === undefined) return { ok: false, code: "unpinned-plugin" };
    if (pin.manifestDigest !== plugin.manifestDigest || pin.sourceDigest !== plugin.sourceDigest) {
      return { ok: false, code: "pin-digest-mismatch" };
    }

    const normalized = normalizeManifest({
      id: plugin.id,
      version: plugin.version,
      apiVersion: plugin.apiVersion,
      kind: plugin.kind,
      compatibility: plugin.compatibility,
      entrypoint: plugin.entrypoint,
      files: plugin.files,
      dependencies: plugin.dependencies,
      requestedCapabilities: plugin.requestedCapabilities,
      license: plugin.license,
    });
    if (normalized === null || computeManifestDigest(normalized) !== plugin.manifestDigest) {
      return { ok: false, code: "manifest-digest-derivation" };
    }

    const pluginRoot = resolve(pluginsRoot, plugin.id);
    if (!hasExactListing(pluginRoot, plugin.files)) {
      return { ok: false, code: "source-digest-derivation" };
    }
    const recomputedSource = sourceDigest(pluginRoot, plugin.id, plugin.files);
    if (!recomputedSource.ok || recomputedSource.digest !== plugin.sourceDigest) {
      return { ok: false, code: "source-digest-derivation" };
    }

    let onDiskManifest: unknown;
    try {
      const manifestText = readFileSync(resolve(pluginRoot, "manifest.json"), "utf8");
      onDiskManifest = JSON.parse(manifestText);
      if (hasDuplicateMembers(manifestText)) return { ok: false, code: "manifest-file" };
    } catch {
      return { ok: false, code: "manifest-file" };
    }
    const normalizedOnDisk = normalizeManifest(onDiskManifest);
    if (normalizedOnDisk === null || computeManifestDigest(normalizedOnDisk) !== plugin.manifestDigest) {
      return { ok: false, code: "manifest-file" };
    }

    let commitments;
    try {
      commitments = computeSpawnPluginArtifactCommitments({ ...options, pluginRoot });
    } catch {
      return { ok: false, code: "commitment-mismatch" };
    }
    if (
      commitments.runnerDigest !== plugin.runnerDigest ||
      commitments.imageDigest !== plugin.imageDigest ||
      commitments.profileDigest !== plugin.profileDigest
    ) {
      return { ok: false, code: "commitment-mismatch" };
    }

    const expectedVersionDigest = computeVersionDigest(pin.manifestDigest, pin.sourceDigest, commitments);
    if (expectedVersionDigest !== plugin.versionDigest) {
      return { ok: false, code: "version-digest-derivation" };
    }

    approvedIds.push(plugin.id);
    pinned.delete(plugin.id);
  }

  if (pinned.size > 0) return { ok: false, code: "pinned-plugin-missing" };

  const approved: OwnerApprovedAdmissionTicket = Object.freeze({
    ticket: admitted.ticket,
    pinnedPluginIds: Object.freeze([...approvedIds]),
  });
  approvedTickets.add(approved);
  return { ok: true, ticket: approved };
}
