import type { PluginContainerPort, PluginLifecycleReceipt } from "./plugin-container-port.ts";
import { deepFreeze } from "./deep-freeze.ts";
import { sandboxCall, type JsonValue as SandboxJsonValue, type SandboxArgument } from "../harness/sandbox.ts";
import type {
  PluginDescriptor,
  RegistryCapability,
  RegistryCapabilityCatalog,
} from "@useprism/sdk/manifest";
import {
  isAdmissionTicket,
  resolveAdmittedPluginOrder,
  type AdmissionTicket,
} from "../runtime/admission-ticket.ts";
import { runPolicyAdmission } from "../runtime/internal/plugin-session.ts";
import {
  POLICY_ADMISSION_VERSION,
  type PolicyCapabilityCatalog,
} from "@useprism/sdk/policy";
import type { JsonValue } from "@useprism/sdk/protocol";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const issuedAuthorities = new WeakMap<object, AdmissionTicket>();

export interface DeriveGrantInput {
  readonly parentGrantDigest: string;
  readonly taskDigest: string;
  readonly pluginId: string;
  readonly pluginSetDigest: string;
  readonly catalog: RegistryCapabilityCatalog;
  readonly requested: readonly RegistryCapability[];
}

export interface PluginGrantValue {
  readonly parentGrantDigest: string;
  readonly taskDigest: string;
  readonly pluginId: string;
  readonly pluginSetDigest: string;
  readonly catalogDigest: string;
  readonly capabilities: readonly RegistryCapability[];
}

export type DeriveGrantResult =
  | { readonly ok: true; readonly grant: PluginGrantValue; readonly digest: string }
  | { readonly ok: false; readonly code: string };

export interface CoreAdmissionPort {
  deriveCapabilityGrant(input: DeriveGrantInput): Promise<DeriveGrantResult>;
}

type WireGrantResult =
  | { [key: string]: SandboxJsonValue; ok: true; grant: Record<string, SandboxJsonValue>; digest: string }
  | { [key: string]: SandboxJsonValue; ok: false; code: string };

export function createSandboxCoreAdmissionPort(): CoreAdmissionPort {
  return {
    async deriveCapabilityGrant(input) {
      const result = await sandboxCall<WireGrantResult>({
        args: [
          input.parentGrantDigest,
          input.taskDigest,
          input.pluginId,
          input.pluginSetDigest,
          input.catalog as unknown as SandboxArgument,
          input.requested as unknown as SandboxArgument,
        ],
        entry: "plugin-grant.ts",
        exportName: "deriveCapabilityGrant",
        port: { argumentIndex: 6, fixture: "valid", name: "sha256" },
      });
      if (!result.ok) return { ok: false, code: result.code };
      return {
        ok: true,
        grant: result.grant as unknown as PluginGrantValue,
        digest: result.digest,
      };
    },
  };
}

export interface AdmitPluginAuthorityInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly parentGrantDigest: string;
  readonly taskDigest: string;
  readonly deadlineMs: number;
  readonly clock?: { now(): number };
  readonly corePort?: CoreAdmissionPort;
}

export interface AdmittedPluginAuthority {
  readonly pluginSetDigest: string;
  readonly ceilingCatalog: RegistryCapabilityCatalog;
  readonly effectiveCatalog: RegistryCapabilityCatalog;
  readonly plugins: readonly {
    readonly descriptor: PluginDescriptor;
    readonly grant: PluginGrantValue;
    readonly grantDigest: string;
  }[];
  readonly policyReceipts: readonly PluginLifecycleReceipt[];
}

export type AdmitPluginAuthorityRejectCode =
  | "admission"
  | "deadline"
  | "grant-derivation"
  | "policy-ceiling"
  | "policy-denied"
  | "policy-failure"
  | "policy-not-monotonic";

export type AdmitPluginAuthorityResult =
  | { readonly ok: true; readonly authority: AdmittedPluginAuthority }
  | {
      readonly ok: false;
      readonly code: AdmitPluginAuthorityRejectCode;
      readonly pluginId?: string;
      readonly detail?: string;
    };

export function isAdmittedPluginAuthority(value: unknown): value is AdmittedPluginAuthority {
  return typeof value === "object" && value !== null && issuedAuthorities.has(value);
}

export function isAuthorityForAdmissionTicket(
  authority: unknown,
  ticket: AdmissionTicket,
): authority is AdmittedPluginAuthority {
  return isAdmissionTicket(ticket) && typeof authority === "object" && authority !== null &&
    issuedAuthorities.get(authority) === ticket;
}

function cloneLimit(limit: RegistryCapability["limit"]): RegistryCapability["limit"] {
  if (limit.schema === "integer-max") return { ...limit };
  if (limit.schema === "string-set") return { ...limit, values: [...limit.values] };
  return { ...limit };
}

function cloneCatalog(catalog: RegistryCapabilityCatalog | PolicyCapabilityCatalog): RegistryCapabilityCatalog {
  return {
    version: "pnh-capability-catalog-v1",
    capabilities: catalog.capabilities.map((entry) => ({ id: entry.id, limit: cloneLimit(entry.limit) })),
  };
}

function cloneDescriptor(descriptor: PluginDescriptor): PluginDescriptor {
  return {
    ...descriptor,
    compatibility: { ...descriptor.compatibility },
    files: [...descriptor.files],
    dependencies: descriptor.dependencies.map((dependency) => ({ ...dependency })),
    requestedCapabilities: descriptor.requestedCapabilities.map((entry) => ({
      id: entry.id,
      limit: cloneLimit(entry.limit),
    })),
    license: { ...descriptor.license },
  };
}

function isLimitSubset(
  parent: RegistryCapability["limit"],
  child: RegistryCapability["limit"],
): boolean {
  if (parent.schema !== child.schema || parent.version !== child.version) return false;
  if (parent.schema === "integer-max" && child.schema === "integer-max") return child.max <= parent.max;
  if (parent.schema === "string-set" && child.schema === "string-set") {
    return child.values.every((value) => parent.values.includes(value));
  }
  return !(child as { enabled: boolean }).enabled || (parent as { enabled: boolean }).enabled;
}

function isCatalogSubset(parent: RegistryCapabilityCatalog, child: RegistryCapabilityCatalog): boolean {
  const parentById = new Map(parent.capabilities.map((entry) => [entry.id, entry.limit] as const));
  return child.capabilities.every((entry) => {
    const parentLimit = parentById.get(entry.id);
    return parentLimit !== undefined && isLimitSubset(parentLimit, entry.limit);
  });
}

function policyAdmissionData(
  ticket: AdmissionTicket,
  ceilingCatalog: RegistryCapabilityCatalog,
  effectiveCatalog: RegistryCapabilityCatalog,
): JsonValue {
  return deepFreeze({
    version: POLICY_ADMISSION_VERSION,
    pluginSetDigest: ticket.pluginSetDigest,
    ceilingCatalog: cloneCatalog(ceilingCatalog),
    effectiveCatalog: cloneCatalog(effectiveCatalog),
    plugins: ticket.plugins.map((descriptor) => ({
      id: descriptor.id,
      kind: descriptor.kind,
      versionDigest: descriptor.versionDigest,
      requestedCapabilities: descriptor.requestedCapabilities.map((entry) => ({
        id: entry.id,
        limit: cloneLimit(entry.limit),
      })),
    })),
  }) as unknown as JsonValue;
}

export async function admitPluginAuthority(
  input: AdmitPluginAuthorityInput,
): Promise<AdmitPluginAuthorityResult> {
  const clock = input.clock ?? { now: () => Date.now() };
  if (
    !isAdmissionTicket(input.ticket) ||
    !DIGEST_RE.test(input.parentGrantDigest) ||
    !DIGEST_RE.test(input.taskDigest)
  ) {
    return { ok: false, code: "admission" };
  }
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs <= clock.now()) {
    return { ok: false, code: "deadline" };
  }

  const corePort = input.corePort ?? createSandboxCoreAdmissionPort();
  const order = resolveAdmittedPluginOrder(input.ticket);
  const ceilingCatalog = deepFreeze(cloneCatalog(input.ticket.capabilityCatalog));
  let effectiveCatalog = deepFreeze(cloneCatalog(ceilingCatalog));
  const grantsByPlugin = new Map<string, {
    descriptor: PluginDescriptor;
    grant: PluginGrantValue;
    grantDigest: string;
  }>();
  const policyReceipts: PluginLifecycleReceipt[] = [];

  async function deriveGrant(descriptor: PluginDescriptor): Promise<DeriveGrantResult> {
    return corePort.deriveCapabilityGrant({
      parentGrantDigest: input.parentGrantDigest,
      taskDigest: input.taskDigest,
      pluginId: descriptor.id,
      pluginSetDigest: input.ticket.pluginSetDigest,
      catalog: effectiveCatalog,
      requested: descriptor.requestedCapabilities,
    });
  }

  for (const descriptor of order.filter((candidate) => candidate.kind === "policy")) {
    const policyResult = await runPolicyAdmission({
      ticket: input.ticket,
      containerPort: input.containerPort,
      pluginId: descriptor.id,
      admission: policyAdmissionData(input.ticket, ceilingCatalog, effectiveCatalog),
      deadlineMs: input.deadlineMs,
      clock,
    });
    if (!policyResult.ok) {
      return { ok: false, code: "policy-failure", pluginId: descriptor.id, detail: policyResult.code };
    }
    policyReceipts.push(policyResult.receipt);
    if (policyResult.outcome.decision === "deny") {
      return { ok: false, code: "policy-denied", pluginId: descriptor.id };
    }

    const candidate = cloneCatalog(policyResult.outcome.catalog);
    if (!isCatalogSubset(ceilingCatalog, candidate)) {
      return { ok: false, code: "policy-ceiling", pluginId: descriptor.id };
    }
    if (!isCatalogSubset(effectiveCatalog, candidate)) {
      return { ok: false, code: "policy-not-monotonic", pluginId: descriptor.id };
    }
    effectiveCatalog = deepFreeze(candidate);
  }

  for (const descriptor of order) {
    const grantResult = await deriveGrant(descriptor);
    if (!grantResult.ok) {
      return { ok: false, code: "grant-derivation", pluginId: descriptor.id, detail: grantResult.code };
    }
    grantsByPlugin.set(descriptor.id, {
      descriptor: cloneDescriptor(descriptor),
      grant: grantResult.grant,
      grantDigest: grantResult.digest,
    });
  }

  const plugins = order.map((descriptor) => grantsByPlugin.get(descriptor.id));
  if (plugins.some((plugin) => plugin === undefined)) return { ok: false, code: "admission" };
  const authority = deepFreeze({
    pluginSetDigest: input.ticket.pluginSetDigest,
    ceilingCatalog,
    effectiveCatalog,
    plugins: plugins as Array<NonNullable<(typeof plugins)[number]>>,
    policyReceipts,
  });
  issuedAuthorities.set(authority, input.ticket);
  return { ok: true, authority };
}
