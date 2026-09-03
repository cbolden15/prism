export const POLICY_ADMISSION_VERSION = "pnh-policy-admission-v1" as const;
export const CAPABILITY_CATALOG_VERSION = "pnh-capability-catalog-v1" as const;
export const CAPABILITY_LIMIT_VERSION = "pnh-capability-limit-v1" as const;

export type PolicyCapabilityLimit =
  | { readonly schema: "integer-max"; readonly version: typeof CAPABILITY_LIMIT_VERSION; readonly max: number }
  | { readonly schema: "string-set"; readonly version: typeof CAPABILITY_LIMIT_VERSION; readonly values: readonly string[] }
  | { readonly schema: "boolean-gate"; readonly version: typeof CAPABILITY_LIMIT_VERSION; readonly enabled: boolean };

export interface PolicyCapability {
  readonly id: string;
  readonly limit: PolicyCapabilityLimit;
}

export interface PolicyCapabilityCatalog {
  readonly version: typeof CAPABILITY_CATALOG_VERSION;
  readonly capabilities: readonly PolicyCapability[];
}

export type PolicyAdmissionOutcome =
  | { readonly decision: "deny" }
  | { readonly decision: "restrict"; readonly catalog: PolicyCapabilityCatalog };

const DENY_KEYS = ["decision"] as const;
const RESTRICT_KEYS = ["decision", "catalog"] as const;
const CATALOG_KEYS = ["version", "capabilities"] as const;
const CAPABILITY_KEYS = ["id", "limit"] as const;
const INTEGER_KEYS = ["schema", "version", "max"] as const;
const SET_KEYS = ["schema", "version", "values"] as const;
const BOOLEAN_KEYS = ["schema", "version", "enabled"] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable;
  });
}

function validateLimit(value: unknown): PolicyCapabilityLimit | null {
  if (!isPlainRecord(value) || value.version !== CAPABILITY_LIMIT_VERSION) return null;
  if (value.schema === "integer-max") {
    if (!hasExactDataKeys(value, INTEGER_KEYS)) return null;
    if (typeof value.max !== "number" || !Number.isSafeInteger(value.max) || value.max < 0) return null;
    return Object.freeze({ schema: "integer-max", version: CAPABILITY_LIMIT_VERSION, max: value.max });
  }
  if (value.schema === "string-set") {
    if (!hasExactDataKeys(value, SET_KEYS) || !Array.isArray(value.values)) return null;
    if (value.values.some((entry) => typeof entry !== "string" || !SLUG_RE.test(entry))) return null;
    const values = value.values as string[];
    if (new Set(values).size !== values.length) return null;
    const sorted = [...values].sort();
    if (values.some((entry, index) => entry !== sorted[index])) return null;
    return Object.freeze({ schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values: Object.freeze(sorted) });
  }
  if (value.schema !== "boolean-gate" || !hasExactDataKeys(value, BOOLEAN_KEYS)) return null;
  if (typeof value.enabled !== "boolean") return null;
  return Object.freeze({ schema: "boolean-gate", version: CAPABILITY_LIMIT_VERSION, enabled: value.enabled });
}

function validateCatalog(value: unknown): PolicyCapabilityCatalog | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, CATALOG_KEYS)) return null;
  if (value.version !== CAPABILITY_CATALOG_VERSION || !Array.isArray(value.capabilities)) return null;
  const capabilities: PolicyCapability[] = [];
  let previousId = "";
  for (const raw of value.capabilities) {
    if (!isPlainRecord(raw) || !hasExactDataKeys(raw, CAPABILITY_KEYS)) return null;
    if (typeof raw.id !== "string" || !SLUG_RE.test(raw.id) || raw.id <= previousId) return null;
    const limit = validateLimit(raw.limit);
    if (limit === null) return null;
    capabilities.push(Object.freeze({ id: raw.id, limit }));
    previousId = raw.id;
  }
  return Object.freeze({ version: CAPABILITY_CATALOG_VERSION, capabilities: Object.freeze(capabilities) });
}

export function validatePolicyAdmissionOutcome(value: unknown): PolicyAdmissionOutcome | null {
  if (!isPlainRecord(value)) return null;
  if (value.decision === "deny") {
    return hasExactDataKeys(value, DENY_KEYS) ? Object.freeze({ decision: "deny" }) : null;
  }
  if (value.decision !== "restrict" || !hasExactDataKeys(value, RESTRICT_KEYS)) return null;
  const catalog = validateCatalog(value.catalog);
  return catalog === null ? null : Object.freeze({ decision: "restrict", catalog });
}
