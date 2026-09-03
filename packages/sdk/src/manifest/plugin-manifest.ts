import {
  CAPABILITY_CATALOG_VERSION,
  CAPABILITY_LIMIT_VERSION,
  PLUGIN_KERNEL_API_VERSION,
  type CapabilityLimit,
  type PluginCompatibility,
  type PluginKind,
  type PluginLicense,
  type RegistryCapability,
  type RegistryCapabilityCatalog,
  type RegistryDependency,
} from "./registry.js";

const MANIFEST_KEYS = [
  "id",
  "version",
  "apiVersion",
  "kind",
  "compatibility",
  "entrypoint",
  "files",
  "dependencies",
  "requestedCapabilities",
  "license",
] as const;
const CAPABILITY_KEYS = ["id", "limit"] as const;
const INTEGER_LIMIT_KEYS = ["schema", "version", "max"] as const;
const STRING_SET_LIMIT_KEYS = ["schema", "version", "values"] as const;
const BOOLEAN_LIMIT_KEYS = ["schema", "version", "enabled"] as const;
const DEPENDENCY_KEYS = ["pluginId", "version"] as const;
const COMPATIBILITY_KEYS = ["kernelApiVersion"] as const;
const LICENSE_KEYS = ["spdxId", "holder"] as const;
const PLUGIN_KINDS = new Set<PluginKind>(["policy", "memory", "tool", "provider", "renderer"]);
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const FLAT_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const SPDX_ID_RE = /^[A-Za-z0-9.+-]{1,64}$/;
const LICENSE_HOLDER_RE = /^[^\x00-\x1f\x7f]{1,200}$/;

export interface NormalizedManifest {
  readonly id: string;
  readonly version: string;
  readonly apiVersion: 1;
  readonly kind: PluginKind;
  readonly compatibility: PluginCompatibility;
  readonly entrypoint: string;
  readonly files: readonly string[];
  readonly dependencies: readonly RegistryDependency[];
  readonly requestedCapabilities: readonly RegistryCapability[];
  readonly license: PluginLicense;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return (
    keys.length === expected.length
    && keys.every((key) => expected.includes(key))
    && Reflect.ownKeys(record).every((key) => typeof key === "string" && keys.includes(key))
    && expected.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable;
    })
  );
}

function sortedUniqueStrings(value: unknown, validate: (entry: string) => boolean): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !validate(entry))) return null;
  const strings = value as string[];
  if (new Set(strings).size !== strings.length) return null;
  return Object.freeze([...strings].sort());
}

function normalizeLimit(value: unknown): CapabilityLimit | null {
  if (!isPlainRecord(value) || value.version !== CAPABILITY_LIMIT_VERSION) return null;
  if (value.schema === "integer-max") {
    if (!hasExactKeys(value, INTEGER_LIMIT_KEYS)) return null;
    if (typeof value.max !== "number" || !Number.isSafeInteger(value.max) || value.max < 0) return null;
    return Object.freeze({ schema: "integer-max", version: CAPABILITY_LIMIT_VERSION, max: value.max });
  }
  if (value.schema === "string-set") {
    if (!hasExactKeys(value, STRING_SET_LIMIT_KEYS)) return null;
    const values = sortedUniqueStrings(value.values, (entry) => isPluginId(entry));
    if (values === null) return null;
    return Object.freeze({ schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values });
  }
  if (value.schema === "boolean-gate") {
    if (!hasExactKeys(value, BOOLEAN_LIMIT_KEYS) || typeof value.enabled !== "boolean") return null;
    return Object.freeze({ schema: "boolean-gate", version: CAPABILITY_LIMIT_VERSION, enabled: value.enabled });
  }
  return null;
}

function normalizeCapabilities(value: unknown): readonly RegistryCapability[] | null {
  if (!Array.isArray(value)) return null;
  const capabilities: RegistryCapability[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isPlainRecord(raw) || !hasExactKeys(raw, CAPABILITY_KEYS)) return null;
    if (typeof raw.id !== "string" || !isPluginId(raw.id) || ids.has(raw.id)) return null;
    const limit = normalizeLimit(raw.limit);
    if (limit === null) return null;
    ids.add(raw.id);
    capabilities.push(Object.freeze({ id: raw.id, limit }));
  }
  capabilities.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(capabilities);
}

export function normalizeCapabilityCatalog(value: unknown): RegistryCapabilityCatalog | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["version", "capabilities"])) return null;
  if (value.version !== CAPABILITY_CATALOG_VERSION) return null;
  const capabilities = normalizeCapabilities(value.capabilities);
  if (capabilities === null) return null;
  return Object.freeze({ version: CAPABILITY_CATALOG_VERSION, capabilities });
}

function normalizeDependencies(value: unknown, pluginId: string): readonly RegistryDependency[] | null {
  if (!Array.isArray(value)) return null;
  const dependencies: RegistryDependency[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isPlainRecord(raw) || !hasExactKeys(raw, DEPENDENCY_KEYS)) return null;
    if (
      typeof raw.pluginId !== "string"
      || !isPluginId(raw.pluginId)
      || raw.pluginId === pluginId
      || ids.has(raw.pluginId)
    ) {
      return null;
    }
    if (typeof raw.version !== "string" || !SEMVER_RE.test(raw.version)) return null;
    ids.add(raw.pluginId);
    dependencies.push(Object.freeze({ pluginId: raw.pluginId, version: raw.version }));
  }
  dependencies.sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  return Object.freeze(dependencies);
}

function normalizeCompatibility(value: unknown): PluginCompatibility | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, COMPATIBILITY_KEYS)) return null;
  if (value.kernelApiVersion !== PLUGIN_KERNEL_API_VERSION) return null;
  return Object.freeze({ kernelApiVersion: PLUGIN_KERNEL_API_VERSION });
}

function normalizeLicense(value: unknown): PluginLicense | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, LICENSE_KEYS)) return null;
  if (typeof value.spdxId !== "string" || !SPDX_ID_RE.test(value.spdxId)) return null;
  if (typeof value.holder !== "string" || !LICENSE_HOLDER_RE.test(value.holder)) return null;
  return Object.freeze({ spdxId: value.spdxId, holder: value.holder });
}

export function isPluginId(value: unknown): value is string {
  return typeof value === "string" && PLUGIN_ID_RE.test(value);
}

export function isFlatPluginFile(value: unknown): value is string {
  return typeof value === "string" && value !== "manifest.json" && FLAT_FILE_RE.test(value);
}

export function normalizeManifest(value: unknown): NormalizedManifest | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, MANIFEST_KEYS)) return null;
  if (!isPluginId(value.id)) return null;
  if (typeof value.version !== "string" || !SEMVER_RE.test(value.version)) return null;
  if (value.apiVersion !== 1 || typeof value.kind !== "string" || !PLUGIN_KINDS.has(value.kind as PluginKind)) {
    return null;
  }
  if (!isFlatPluginFile(value.entrypoint)) return null;

  const files = sortedUniqueStrings(value.files, isFlatPluginFile);
  const compatibility = normalizeCompatibility(value.compatibility);
  const dependencies = normalizeDependencies(value.dependencies, value.id);
  const requestedCapabilities = normalizeCapabilities(value.requestedCapabilities);
  const license = normalizeLicense(value.license);
  if (files === null || files.length === 0 || !files.includes(value.entrypoint)) return null;
  if (compatibility === null || dependencies === null || requestedCapabilities === null || license === null) return null;

  return Object.freeze({
    id: value.id,
    version: value.version,
    apiVersion: 1,
    kind: value.kind as PluginKind,
    compatibility,
    entrypoint: value.entrypoint,
    files,
    dependencies,
    requestedCapabilities,
    license,
  });
}
