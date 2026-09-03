// Exact schema for owner-approved generated plugin registries. This module
// intentionally has no Runtime core import so integration tests do not
// create a test-to-core authority path.

export const REGISTRY_VERSION = "pnh-plugin-registry-v3" as const;
export const CAPABILITY_CATALOG_VERSION = "pnh-capability-catalog-v1" as const;
export const CAPABILITY_LIMIT_VERSION = "pnh-capability-limit-v1" as const;
export const PLUGIN_KERNEL_API_VERSION = "pnh-kernel-v1" as const;

export type RegistryEnvironment = "production" | "development";
export type PluginKind = "policy" | "memory" | "tool" | "provider" | "renderer";

export type CapabilityLimit =
  | { schema: "integer-max"; version: typeof CAPABILITY_LIMIT_VERSION; max: number }
  | { schema: "string-set"; version: typeof CAPABILITY_LIMIT_VERSION; values: readonly string[] }
  | { schema: "boolean-gate"; version: typeof CAPABILITY_LIMIT_VERSION; enabled: boolean };

export interface RegistryCapability {
  readonly id: string;
  readonly limit: CapabilityLimit;
}

export interface RegistryCapabilityCatalog {
  readonly version: typeof CAPABILITY_CATALOG_VERSION;
  readonly capabilities: readonly RegistryCapability[];
}

export interface RegistryDependency {
  readonly pluginId: string;
  readonly version: string;
}

export interface PluginCompatibility {
  readonly kernelApiVersion: typeof PLUGIN_KERNEL_API_VERSION;
}

export interface PluginLicense {
  readonly spdxId: string;
  readonly holder: string;
}

export interface PluginDescriptor {
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
  readonly manifestDigest: string;
  readonly sourceDigest: string;
  readonly versionDigest: string;
  readonly runnerDigest: string;
  readonly imageDigest: string;
  readonly profileDigest: string;
}

export interface PluginRegistry {
  readonly version: typeof REGISTRY_VERSION;
  readonly environment: RegistryEnvironment;
  readonly capabilityCatalog: RegistryCapabilityCatalog;
  readonly plugins: readonly PluginDescriptor[];
}

const REGISTRY_KEYS = ["version", "environment", "capabilityCatalog", "plugins"] as const;
const CATALOG_KEYS = ["version", "capabilities"] as const;
const CAPABILITY_KEYS = ["id", "limit"] as const;
const INTEGER_KEYS = ["schema", "version", "max"] as const;
const SET_KEYS = ["schema", "version", "values"] as const;
const BOOLEAN_KEYS = ["schema", "version", "enabled"] as const;
const DEPENDENCY_KEYS = ["pluginId", "version"] as const;
const COMPATIBILITY_KEYS = ["kernelApiVersion"] as const;
const LICENSE_KEYS = ["spdxId", "holder"] as const;
const PLUGIN_KEYS = [
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
  "manifestDigest",
  "sourceDigest",
  "versionDigest",
  "runnerDigest",
  "imageDigest",
  "profileDigest",
] as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const SPDX_ID_RE = /^[A-Za-z0-9.+-]{1,64}$/;
const LICENSE_HOLDER_RE = /^[^\x00-\x1f\x7f]{1,200}$/;
const PLUGIN_KINDS = new Set<PluginKind>(["policy", "memory", "tool", "provider", "renderer"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return (
      descriptor !== undefined &&
      descriptor.get === undefined &&
      descriptor.set === undefined &&
      descriptor.enumerable
    );
  });
}

function sortedUniqueStrings(value: unknown, validate: (entry: string) => boolean): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !validate(entry))) return null;
  const entries = value as string[];
  if (new Set(entries).size !== entries.length) return null;
  const sorted = [...entries].sort();
  if (entries.some((entry, index) => entry !== sorted[index])) return null;
  return Object.freeze(sorted);
}

function validRelativeFile(value: string): boolean {
  if (!FILE_RE.test(value) || value.startsWith("/") || value.endsWith("/")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validateDependencies(value: unknown, pluginId: string): readonly RegistryDependency[] | null {
  if (!Array.isArray(value)) return null;
  const dependencies: RegistryDependency[] = [];
  let previousId = "";
  for (const raw of value) {
    if (!isPlainRecord(raw) || !exactDataKeys(raw, DEPENDENCY_KEYS)) return null;
    if (typeof raw.pluginId !== "string" || !SLUG_RE.test(raw.pluginId) || raw.pluginId <= previousId) return null;
    if (raw.pluginId === pluginId || typeof raw.version !== "string" || !SEMVER_RE.test(raw.version)) return null;
    dependencies.push(Object.freeze({ pluginId: raw.pluginId, version: raw.version }));
    previousId = raw.pluginId;
  }
  return Object.freeze(dependencies);
}

function validateCompatibility(value: unknown): PluginCompatibility | null {
  if (!isPlainRecord(value) || !exactDataKeys(value, COMPATIBILITY_KEYS)) return null;
  if (value.kernelApiVersion !== PLUGIN_KERNEL_API_VERSION) return null;
  return Object.freeze({ kernelApiVersion: PLUGIN_KERNEL_API_VERSION });
}

function validateLicense(value: unknown): PluginLicense | null {
  if (!isPlainRecord(value) || !exactDataKeys(value, LICENSE_KEYS)) return null;
  if (typeof value.spdxId !== "string" || !SPDX_ID_RE.test(value.spdxId)) return null;
  if (typeof value.holder !== "string" || !LICENSE_HOLDER_RE.test(value.holder)) return null;
  return Object.freeze({ spdxId: value.spdxId, holder: value.holder });
}

function validateLimit(value: unknown): CapabilityLimit | null {
  if (!isPlainRecord(value) || value.version !== CAPABILITY_LIMIT_VERSION) return null;
  if (value.schema === "integer-max") {
    if (!exactDataKeys(value, INTEGER_KEYS)) return null;
    if (typeof value.max !== "number" || !Number.isSafeInteger(value.max) || value.max < 0) return null;
    return Object.freeze({ schema: "integer-max", version: CAPABILITY_LIMIT_VERSION, max: value.max });
  }
  if (value.schema === "string-set") {
    if (!exactDataKeys(value, SET_KEYS)) return null;
    const values = sortedUniqueStrings(value.values, (entry) => SLUG_RE.test(entry));
    if (values === null) return null;
    return Object.freeze({ schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values });
  }
  if (value.schema === "boolean-gate") {
    if (!exactDataKeys(value, BOOLEAN_KEYS) || typeof value.enabled !== "boolean") return null;
    return Object.freeze({ schema: "boolean-gate", version: CAPABILITY_LIMIT_VERSION, enabled: value.enabled });
  }
  return null;
}

function validateCatalog(value: unknown): RegistryCapabilityCatalog | null {
  if (!isPlainRecord(value) || !exactDataKeys(value, CATALOG_KEYS)) return null;
  if (value.version !== CAPABILITY_CATALOG_VERSION || !Array.isArray(value.capabilities)) return null;

  const capabilities: RegistryCapability[] = [];
  let previousId = "";
  for (const raw of value.capabilities) {
    if (!isPlainRecord(raw) || !exactDataKeys(raw, CAPABILITY_KEYS)) return null;
    if (typeof raw.id !== "string" || !SLUG_RE.test(raw.id) || raw.id <= previousId) return null;
    const limit = validateLimit(raw.limit);
    if (limit === null) return null;
    capabilities.push(Object.freeze({ id: raw.id, limit }));
    previousId = raw.id;
  }
  return Object.freeze({
    version: CAPABILITY_CATALOG_VERSION,
    capabilities: Object.freeze(capabilities),
  });
}

function isLimitSubset(parent: CapabilityLimit, child: CapabilityLimit): boolean {
  if (parent.schema !== child.schema || parent.version !== child.version) return false;
  if (parent.schema === "integer-max" && child.schema === "integer-max") {
    return child.max <= parent.max;
  }
  if (parent.schema === "string-set" && child.schema === "string-set") {
    return child.values.every((entry) => parent.values.includes(entry));
  }
  return (
    parent.schema === "boolean-gate" &&
    child.schema === "boolean-gate" &&
    (!child.enabled || parent.enabled)
  );
}

function validateRequestedCapabilities(
  value: unknown,
  catalog: ReadonlyMap<string, CapabilityLimit>,
): readonly RegistryCapability[] | null {
  if (!Array.isArray(value)) return null;
  const capabilities: RegistryCapability[] = [];
  let previousId = "";
  for (const raw of value) {
    if (!isPlainRecord(raw) || !exactDataKeys(raw, CAPABILITY_KEYS)) return null;
    if (typeof raw.id !== "string" || !SLUG_RE.test(raw.id) || raw.id <= previousId) return null;
    const parent = catalog.get(raw.id);
    const limit = validateLimit(raw.limit);
    if (parent === undefined || limit === null || !isLimitSubset(parent, limit)) return null;
    capabilities.push(Object.freeze({ id: raw.id, limit }));
    previousId = raw.id;
  }
  return Object.freeze(capabilities);
}

function validatePlugin(
  value: unknown,
  capabilityCatalog: ReadonlyMap<string, CapabilityLimit>,
): PluginDescriptor | null {
  if (!isPlainRecord(value) || !exactDataKeys(value, PLUGIN_KEYS)) return null;
  if (typeof value.id !== "string" || !SLUG_RE.test(value.id)) return null;
  if (typeof value.version !== "string" || !SEMVER_RE.test(value.version)) return null;
  if (value.apiVersion !== 1 || typeof value.kind !== "string" || !PLUGIN_KINDS.has(value.kind as PluginKind)) {
    return null;
  }
  if (typeof value.entrypoint !== "string" || !validRelativeFile(value.entrypoint)) return null;

  const files = sortedUniqueStrings(value.files, validRelativeFile);
  const compatibility = validateCompatibility(value.compatibility);
  const dependencies = validateDependencies(value.dependencies, value.id);
  const requestedCapabilities = validateRequestedCapabilities(value.requestedCapabilities, capabilityCatalog);
  const license = validateLicense(value.license);
  if (files === null || files.length === 0 || !files.includes(value.entrypoint)) return null;
  if (compatibility === null || dependencies === null || requestedCapabilities === null || license === null) return null;

  for (const key of [
    "manifestDigest",
    "sourceDigest",
    "versionDigest",
    "runnerDigest",
    "imageDigest",
    "profileDigest",
  ] as const) {
    if (typeof value[key] !== "string" || !DIGEST_RE.test(value[key])) return null;
  }

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
    manifestDigest: value.manifestDigest as string,
    sourceDigest: value.sourceDigest as string,
    versionDigest: value.versionDigest as string,
    runnerDigest: value.runnerDigest as string,
    imageDigest: value.imageDigest as string,
    profileDigest: value.profileDigest as string,
  });
}

function hasAcyclicDependencies(plugins: readonly PluginDescriptor[]): boolean {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin] as const));
  const state = new Map<string, "visiting" | "done">();

  function visit(pluginId: string): boolean {
    const current = state.get(pluginId);
    if (current === "done") return true;
    if (current === "visiting") return false;
    state.set(pluginId, "visiting");
    const plugin = byId.get(pluginId);
    if (plugin === undefined || plugin.dependencies.some((dependency) => !visit(dependency.pluginId))) return false;
    state.set(pluginId, "done");
    return true;
  }

  return plugins.every((plugin) => visit(plugin.id));
}

export function validateRegistryDocument(value: unknown): PluginRegistry | null {
  if (!isPlainRecord(value) || !exactDataKeys(value, REGISTRY_KEYS)) return null;
  if (value.version !== REGISTRY_VERSION) return null;
  if (value.environment !== "production" && value.environment !== "development") return null;

  const capabilityCatalog = validateCatalog(value.capabilityCatalog);
  if (capabilityCatalog === null || !Array.isArray(value.plugins)) return null;
  const capabilityLimits = new Map(
    capabilityCatalog.capabilities.map((entry) => [entry.id, entry.limit] as const),
  );

  const plugins: PluginDescriptor[] = [];
  let previousPluginId = "";
  for (const raw of value.plugins) {
    const plugin = validatePlugin(raw, capabilityLimits);
    if (plugin === null || plugin.id <= previousPluginId) return null;
    plugins.push(plugin);
    previousPluginId = plugin.id;
  }

  const versions = new Map(plugins.map((plugin) => [plugin.id, plugin.version] as const));
  for (const plugin of plugins) {
    for (const dependency of plugin.dependencies) {
      if (versions.get(dependency.pluginId) !== dependency.version) return null;
    }
  }
  if (!hasAcyclicDependencies(plugins)) return null;

  return Object.freeze({
    version: REGISTRY_VERSION,
    environment: value.environment,
    capabilityCatalog,
    plugins: Object.freeze(plugins),
  });
}
