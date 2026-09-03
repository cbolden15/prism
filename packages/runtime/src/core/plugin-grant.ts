// PNH plugin-scoped derived grant core. Pure: hash is injected. A plugin
// grant is derived from the parent grant digest, the task digest, the plugin
// ID, the plugin-set digest, the task's capability-catalog digest, and the
// manifest-requested capability subset -- never issued directly, and never a
// self-authorizing decision: it only proves the requested subset is provably
// no broader than the catalog it derives from.
import { DIGEST_RE, SLUG_RE, type Sha256Hex } from "./grant.ts";
import {
  canonicalCapabilityCatalogBytes,
  capabilityLimitTuple,
  isCapabilitySubset,
  validateCapabilityCatalog,
  validateCapabilityLimit,
  type CapabilityLimit,
} from "./capability-catalog.ts";

export const PLUGIN_GRANT_VERSION = "pnh-plugin-grant-v1";

export interface PluginCapabilityGrant {
  id: string;
  limit: CapabilityLimit;
}

export interface PluginGrant {
  parentGrantDigest: string;
  taskDigest: string;
  pluginId: string;
  pluginSetDigest: string;
  catalogDigest: string;
  capabilities: PluginCapabilityGrant[];
}

export type PluginGrantRejectCode =
  | "digest-format"
  | "slug"
  | "catalog"
  | "requested-shape"
  | "capability-shape"
  | "unknown-capability"
  | "duplicate-capability"
  | "incomparable-capability"
  | "capability-not-narrower"
  | "hash-output";

const REQUESTED_ENTRY_KEYS = ["id", "limit"] as const;

function isNestedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(rec: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(rec);
  if (own.some((key) => !keys.includes(key))) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(rec, key));
}

function digestOf(bytes: string, hash: Sha256Hex): string | null {
  const digest = hash(bytes);
  return DIGEST_RE.test(digest) ? digest : null;
}

export function canonicalPluginGrantBytes(grant: PluginGrant): string {
  return JSON.stringify([
    PLUGIN_GRANT_VERSION,
    grant.parentGrantDigest,
    grant.taskDigest,
    grant.pluginId,
    grant.pluginSetDigest,
    grant.catalogDigest,
    grant.capabilities.map((entry) => [entry.id, capabilityLimitTuple(entry.limit)]),
  ]);
}

type Ok = { ok: true; grant: PluginGrant; digest: string };
type Fail = { ok: false; code: PluginGrantRejectCode };

export function deriveCapabilityGrant(
  parentGrantDigest: unknown,
  taskDigest: unknown,
  pluginId: unknown,
  pluginSetDigest: unknown,
  catalogValue: unknown,
  requestedValue: unknown,
  hash: Sha256Hex,
): Ok | Fail {
  if (typeof parentGrantDigest !== "string" || !DIGEST_RE.test(parentGrantDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof taskDigest !== "string" || !DIGEST_RE.test(taskDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof pluginSetDigest !== "string" || !DIGEST_RE.test(pluginSetDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof pluginId !== "string" || !SLUG_RE.test(pluginId)) {
    return { ok: false, code: "slug" };
  }

  const catalogResult = validateCapabilityCatalog(catalogValue);
  if (!catalogResult.ok) return { ok: false, code: "catalog" };

  if (!Array.isArray(requestedValue)) return { ok: false, code: "requested-shape" };

  const catalogById = new Map(catalogResult.catalog.capabilities.map((entry) => [entry.id, entry.limit]));
  const seen = new Set<string>();
  const capabilities: PluginCapabilityGrant[] = [];
  for (const rawEntry of requestedValue) {
    if (!isNestedRecord(rawEntry) || !hasExactKeys(rawEntry, REQUESTED_ENTRY_KEYS)) {
      return { ok: false, code: "capability-shape" };
    }
    const { id, limit: rawLimit } = rawEntry;
    if (typeof id !== "string" || !SLUG_RE.test(id)) return { ok: false, code: "capability-shape" };
    const limit = validateCapabilityLimit(rawLimit);
    if (limit === null) return { ok: false, code: "capability-shape" };
    if (seen.has(id)) return { ok: false, code: "duplicate-capability" };
    seen.add(id);

    const parentLimit = catalogById.get(id);
    if (parentLimit === undefined) return { ok: false, code: "unknown-capability" };
    if (parentLimit.schema !== limit.schema || parentLimit.version !== limit.version) {
      return { ok: false, code: "incomparable-capability" };
    }
    if (!isCapabilitySubset(parentLimit, limit)) return { ok: false, code: "capability-not-narrower" };

    capabilities.push({ id, limit });
  }

  const catalogDigest = digestOf(canonicalCapabilityCatalogBytes(catalogResult.catalog), hash);
  const grant: PluginGrant = {
    parentGrantDigest,
    taskDigest,
    pluginId,
    pluginSetDigest,
    catalogDigest: String(catalogDigest),
    capabilities,
  };
  const grantDigest = digestOf(canonicalPluginGrantBytes(grant), hash);
  if (catalogDigest === null || grantDigest === null) return { ok: false, code: "hash-output" };

  return { ok: true, grant, digest: grantDigest };
}
