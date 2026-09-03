// PNH capability catalog core. Pure: no ports, no ambient state. Defines the
// closed versioned set of capability limit schemas and the narrowing rule
// used to bound every plugin grant derived from a catalog.
import { DIGEST_RE, SLUG_RE, type Sha256Hex } from "./grant.ts";

export const CAPABILITY_CATALOG_VERSION = "pnh-capability-catalog-v1";
export const CAPABILITY_LIMIT_SCHEMA_VERSION = "pnh-capability-limit-v1";

export const CAPABILITY_LIMIT_SCHEMAS = ["integer-max", "string-set", "boolean-gate"] as const;
export type CapabilityLimitSchema = (typeof CAPABILITY_LIMIT_SCHEMAS)[number];

export interface IntegerMaxLimit {
  schema: "integer-max";
  version: typeof CAPABILITY_LIMIT_SCHEMA_VERSION;
  max: number;
}

export interface StringSetLimit {
  schema: "string-set";
  version: typeof CAPABILITY_LIMIT_SCHEMA_VERSION;
  values: string[];
}

export interface BooleanGateLimit {
  schema: "boolean-gate";
  version: typeof CAPABILITY_LIMIT_SCHEMA_VERSION;
  enabled: boolean;
}

export type CapabilityLimit = IntegerMaxLimit | StringSetLimit | BooleanGateLimit;

export interface CapabilityEntry {
  id: string;
  limit: CapabilityLimit;
}

export interface CapabilityCatalog {
  version: typeof CAPABILITY_CATALOG_VERSION;
  capabilities: CapabilityEntry[];
}

export type CapabilityCatalogRejectCode =
  | "shape"
  | "unknown-key"
  | "version"
  | "capabilities-shape"
  | "capability-shape"
  | "slug"
  | "limit-schema"
  | "limit-shape"
  | "duplicate-id"
  | "hash-output";

const CATALOG_KEYS = ["version", "capabilities"] as const;
const ENTRY_KEYS = ["id", "limit"] as const;
const INTEGER_MAX_KEYS = ["schema", "version", "max"] as const;
const STRING_SET_KEYS = ["schema", "version", "values"] as const;
const BOOLEAN_GATE_KEYS = ["schema", "version", "enabled"] as const;

type CanonicalTuple = readonly (string | number | boolean | readonly string[])[];

function nonNegativeSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

function isNestedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(rec: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(rec);
  if (own.some((key) => !keys.includes(key))) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(rec, key));
}

type TopLevelShape =
  | { ok: true; rec: Record<string, unknown> }
  | { ok: false; code: "shape" | "unknown-key" };

function checkTopLevelShape(value: unknown, keys: readonly string[]): TopLevelShape {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "shape" };
  }
  const rec = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) return { ok: false, code: "shape" };
  const own = Object.keys(rec);
  if (Reflect.ownKeys(rec).some((key) => typeof key !== "string" || !own.includes(key))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      return { ok: false, code: "shape" };
    }
  }
  if (own.some((key) => !keys.includes(key))) return { ok: false, code: "unknown-key" };
  if (!keys.every((key) => Object.prototype.hasOwnProperty.call(rec, key))) {
    return { ok: false, code: "shape" };
  }
  return { ok: true, rec };
}

export function validateCapabilityLimit(value: unknown): CapabilityLimit | null {
  if (!isNestedRecord(value)) return null;
  if (typeof value.schema !== "string" || !(CAPABILITY_LIMIT_SCHEMAS as readonly string[]).includes(value.schema)) {
    return null;
  }
  if (value.version !== CAPABILITY_LIMIT_SCHEMA_VERSION) return null;
  if (value.schema === "integer-max") {
    if (!hasExactKeys(value, INTEGER_MAX_KEYS)) return null;
    if (!nonNegativeSafeInt(value.max)) return null;
    return { schema: "integer-max", version: CAPABILITY_LIMIT_SCHEMA_VERSION, max: value.max };
  }
  if (value.schema === "string-set") {
    if (!hasExactKeys(value, STRING_SET_KEYS)) return null;
    if (!Array.isArray(value.values)) return null;
    if (value.values.some((entry) => typeof entry !== "string" || !SLUG_RE.test(entry))) return null;
    const unique = new Set(value.values as string[]);
    if (unique.size !== value.values.length) return null;
    return { schema: "string-set", version: CAPABILITY_LIMIT_SCHEMA_VERSION, values: [...unique].sort() };
  }
  if (!hasExactKeys(value, BOOLEAN_GATE_KEYS)) return null;
  if (typeof value.enabled !== "boolean") return null;
  return { schema: "boolean-gate", version: CAPABILITY_LIMIT_SCHEMA_VERSION, enabled: value.enabled };
}

export function isCapabilitySubset(parent: CapabilityLimit, child: CapabilityLimit): boolean {
  if (parent.schema !== child.schema || parent.version !== child.version) return false;
  if (parent.schema === "integer-max" && child.schema === "integer-max") {
    return child.max <= parent.max;
  }
  if (parent.schema === "string-set" && child.schema === "string-set") {
    return child.values.every((entry) => parent.values.includes(entry));
  }
  return !(child as BooleanGateLimit).enabled || (parent as BooleanGateLimit).enabled;
}

export function capabilityLimitTuple(limit: CapabilityLimit): CanonicalTuple {
  if (limit.schema === "integer-max") return [limit.schema, limit.version, limit.max];
  if (limit.schema === "string-set") return [limit.schema, limit.version, limit.values];
  return [limit.schema, limit.version, limit.enabled];
}

export function canonicalCapabilityCatalogBytes(catalog: CapabilityCatalog): string {
  return JSON.stringify([
    CAPABILITY_CATALOG_VERSION,
    catalog.capabilities.map((entry) => [entry.id, capabilityLimitTuple(entry.limit)]),
  ]);
}

type CatalogOk = { ok: true; catalog: CapabilityCatalog };
type CatalogFail = { ok: false; code: CapabilityCatalogRejectCode };

export function validateCapabilityCatalog(value: unknown): CatalogOk | CatalogFail {
  const top = checkTopLevelShape(value, CATALOG_KEYS);
  if (!top.ok) return top;
  const { version, capabilities } = top.rec;
  if (version !== CAPABILITY_CATALOG_VERSION) return { ok: false, code: "version" };
  if (!Array.isArray(capabilities)) return { ok: false, code: "capabilities-shape" };

  const seen = new Set<string>();
  const entries: CapabilityEntry[] = [];
  for (const rawEntry of capabilities) {
    if (!isNestedRecord(rawEntry) || !hasExactKeys(rawEntry, ENTRY_KEYS)) {
      return { ok: false, code: "capability-shape" };
    }
    if (typeof rawEntry.id !== "string" || !SLUG_RE.test(rawEntry.id)) {
      return { ok: false, code: "slug" };
    }
    const limit = validateCapabilityLimit(rawEntry.limit);
    if (limit === null) {
      const nested = rawEntry.limit;
      if (
        isNestedRecord(nested) &&
        typeof nested.schema === "string" &&
        (CAPABILITY_LIMIT_SCHEMAS as readonly string[]).includes(nested.schema) &&
        nested.version === CAPABILITY_LIMIT_SCHEMA_VERSION
      ) {
        return { ok: false, code: "limit-shape" };
      }
      return { ok: false, code: "limit-schema" };
    }
    if (seen.has(rawEntry.id)) return { ok: false, code: "duplicate-id" };
    seen.add(rawEntry.id);
    entries.push({ id: rawEntry.id, limit });
  }

  return { ok: true, catalog: { version: CAPABILITY_CATALOG_VERSION, capabilities: entries } };
}

export type CapabilityCatalogDigestResult =
  | { ok: true; catalog: CapabilityCatalog; digest: string }
  | { ok: false; code: CapabilityCatalogRejectCode };

export function deriveCapabilityCatalogDigest(value: unknown, hash: Sha256Hex): CapabilityCatalogDigestResult {
  const result = validateCapabilityCatalog(value);
  if (!result.ok) return result;
  const digest = hash(canonicalCapabilityCatalogBytes(result.catalog));
  if (!DIGEST_RE.test(digest)) return { ok: false, code: "hash-output" };
  return { ok: true, catalog: result.catalog, digest };
}
