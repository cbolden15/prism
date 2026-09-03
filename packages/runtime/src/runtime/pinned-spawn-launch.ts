/**
 * Spawn-launch construction for owner-approved tickets.
 *
 * A caller may choose any plugin root, but its normalized manifest and every
 * declared source file must re-derive to the identity admitted through the
 * owner's pin record. A second exported check repeats that derivation against
 * the returned spec's cwd immediately before the caller hands it to the spawn
 * supervisor, narrowing the remaining check-to-use window.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAdmittedPlugin } from "./admission-ticket.ts";
import {
  hasExactListing,
  isOwnerApprovedAdmissionTicket,
  type OwnerApprovedAdmissionTicket,
} from "./pinned-admission.ts";
import {
  createAdmittedPluginSpawnLaunchSpec,
  type PluginSpawnLaunchSpec,
} from "./plugin-spawn-launch-spec.ts";
import {
  computeManifestDigest,
  normalizeManifest,
  sourceDigest,
} from "@useprism/sdk/node/registry";
import type { RuntimeArtifactPathOverrides } from "./artifact-paths.ts";

const TREE_CHANGED = "owner-approved plugin tree changed after launch spec creation";

function assertRootMatchesAdmitted(
  ticket: OwnerApprovedAdmissionTicket,
  pluginId: string,
  pluginRoot: string,
): void {
  if (!isOwnerApprovedAdmissionTicket(ticket)) {
    throw new TypeError("unverified owner-approved admission ticket");
  }
  const descriptor = resolveAdmittedPlugin(ticket.ticket, pluginId);
  if (descriptor === undefined || !ticket.pinnedPluginIds.includes(pluginId)) {
    throw new Error("admitted plugin not found");
  }

  const root = resolve(pluginRoot);
  if (!hasExactListing(root, descriptor.files)) throw new Error(TREE_CHANGED);

  let manifestDigest: string;
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    const normalized = normalizeManifest(parsed);
    if (normalized === null) throw new Error(TREE_CHANGED);
    manifestDigest = computeManifestDigest(normalized);
  } catch {
    throw new Error(TREE_CHANGED);
  }

  const recomputedSource = sourceDigest(root, descriptor.id, descriptor.files);
  if (
    manifestDigest !== descriptor.manifestDigest ||
    !recomputedSource.ok ||
    recomputedSource.digest !== descriptor.sourceDigest
  ) {
    throw new Error(TREE_CHANGED);
  }
}

/**
 * Rechecks the exact directory the supervisor will use as cwd. Call this as
 * the final operation before handing the spec to the spawn supervisor.
 */
export function assertOwnerApprovedLaunchSpecUnchanged(options: {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly spec: PluginSpawnLaunchSpec;
}): void {
  assertRootMatchesAdmitted(options.ticket, options.pluginId, options.spec.cwd);
}

export function createOwnerApprovedPluginSpawnLaunchSpec(options: RuntimeArtifactPathOverrides & {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly pluginRoot: string;
}): PluginSpawnLaunchSpec {
  assertRootMatchesAdmitted(options.ticket, options.pluginId, options.pluginRoot);
  return createAdmittedPluginSpawnLaunchSpec({
    ticket: options.ticket.ticket,
    pluginId: options.pluginId,
    pluginRoot: resolve(options.pluginRoot),
    runtimeRoot: options.runtimeRoot,
    sdkProtocolPath: options.sdkProtocolPath,
    sdkResourceBoundsPath: options.sdkResourceBoundsPath,
  });
}
