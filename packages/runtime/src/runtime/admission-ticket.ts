import { createHash } from "node:crypto";
import {
  validateRegistryDocument,
  type PluginDescriptor,
  type PluginRegistry,
  type RegistryCapabilityCatalog,
} from "@useprism/sdk/manifest";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const issuedTickets = new WeakSet<object>();

export interface AdmissionTicket {
  readonly registryDigest: string;
  readonly pluginSetDigest: string;
  readonly environment: "production";
  readonly capabilityCatalog: RegistryCapabilityCatalog;
  readonly plugins: readonly PluginDescriptor[];
}

export type RegistryAdmissionResult =
  | { ok: true; ticket: AdmissionTicket }
  | {
      ok: false;
      code:
        | "digest-format"
        | "digest-mismatch"
        | "invalid-utf8"
        | "invalid-json"
        | "registry-schema"
        | "environment";
    };

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveDependencyOrder(plugins: readonly PluginDescriptor[]): readonly PluginDescriptor[] {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin] as const));
  const successors = new Map(plugins.map((plugin) => [plugin.id, [] as string[]] as const));
  const remainingDependencies = new Map(plugins.map((plugin) => [plugin.id, plugin.dependencies.length] as const));
  for (const plugin of plugins) {
    for (const dependency of plugin.dependencies) successors.get(dependency.pluginId)?.push(plugin.id);
  }

  const ready = plugins.filter((plugin) => plugin.dependencies.length === 0).map((plugin) => plugin.id).sort();
  const order: PluginDescriptor[] = [];
  while (ready.length > 0) {
    const pluginId = ready.shift() as string;
    order.push(byId.get(pluginId) as PluginDescriptor);
    for (const successorId of successors.get(pluginId) ?? []) {
      const remaining = (remainingDependencies.get(successorId) as number) - 1;
      remainingDependencies.set(successorId, remaining);
      if (remaining === 0) {
        ready.push(successorId);
        ready.sort();
      }
    }
  }
  if (order.length !== plugins.length) throw new TypeError("invalid admitted dependency graph");
  return Object.freeze(order);
}

function issueTicket(registry: PluginRegistry, registryDigest: string): AdmissionTicket {
  const plugins = resolveDependencyOrder(registry.plugins);
  const pluginSetBytes = JSON.stringify([
    "pnh-plugin-set-v1",
    plugins.map((plugin) => [plugin.id, plugin.versionDigest]),
  ]);
  const ticket: AdmissionTicket = Object.freeze({
    registryDigest,
    pluginSetDigest: sha256(pluginSetBytes),
    environment: "production",
    capabilityCatalog: registry.capabilityCatalog,
    plugins,
  });
  issuedTickets.add(ticket);
  return ticket;
}

export function admitRegistryBytes(
  bytes: Uint8Array,
  expectedRegistryDigest: string,
): RegistryAdmissionResult {
  if (!(bytes instanceof Uint8Array) || !DIGEST_RE.test(expectedRegistryDigest)) {
    return { ok: false, code: "digest-format" };
  }
  const actualDigest = sha256(bytes);
  if (actualDigest !== expectedRegistryDigest) return { ok: false, code: "digest-mismatch" };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, code: "invalid-utf8" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid-json" };
  }
  const registry = validateRegistryDocument(raw);
  if (registry === null) return { ok: false, code: "registry-schema" };
  if (registry.environment !== "production") return { ok: false, code: "environment" };
  return { ok: true, ticket: issueTicket(registry, actualDigest) };
}

export function isAdmissionTicket(value: unknown): value is AdmissionTicket {
  return typeof value === "object" && value !== null && issuedTickets.has(value);
}

export function resolveAdmittedPluginOrder(ticket: AdmissionTicket): readonly PluginDescriptor[] {
  if (!isAdmissionTicket(ticket)) throw new TypeError("unverified admission ticket");
  return ticket.plugins;
}

export function resolveAdmittedPlugin(
  ticket: AdmissionTicket,
  pluginId: string,
): PluginDescriptor | undefined {
  if (!isAdmissionTicket(ticket)) throw new TypeError("unverified admission ticket");
  return ticket.plugins.find((plugin) => plugin.id === pluginId);
}
