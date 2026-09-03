/**
 * Advisory capability disclosure over genuine admission tickets.
 *
 * This reports broker-requested capabilities and owner-pin provenance. It
 * enforces nothing and deliberately does not claim to describe ambient host
 * authority inherited by a spawn-executor subprocess.
 */
import type { RegistryCapability } from "@useprism/sdk/manifest";
import { isAdmissionTicket, type AdmissionTicket } from "./admission-ticket.ts";
import {
  isOwnerApprovedAdmissionTicket,
  type OwnerApprovedAdmissionTicket,
} from "./pinned-admission.ts";

export interface PluginDisclosureRecord {
  readonly pluginId: string;
  readonly version: string;
  readonly kind: string;
  readonly manifestDigest: string;
  readonly sourceDigest: string;
  readonly ownerApproved: boolean;
  readonly requestedBrokerCapabilities: readonly RegistryCapability[];
}

function resolveDisclosureTicket(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): { readonly inner: AdmissionTicket; readonly ownerApproved: boolean } {
  if (isOwnerApprovedAdmissionTicket(ticket)) {
    return { inner: ticket.ticket, ownerApproved: true };
  }
  if (isAdmissionTicket(ticket)) {
    return { inner: ticket, ownerApproved: false };
  }
  throw new TypeError("unverified admission ticket");
}

export function describeAdmittedPluginSet(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): readonly PluginDisclosureRecord[] {
  const { inner, ownerApproved } = resolveDisclosureTicket(ticket);
  const records = [...inner.plugins]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((plugin) => Object.freeze({
      pluginId: plugin.id,
      version: plugin.version,
      kind: plugin.kind,
      manifestDigest: plugin.manifestDigest,
      sourceDigest: plugin.sourceDigest,
      ownerApproved,
      requestedBrokerCapabilities: Object.freeze(
        plugin.requestedCapabilities.map((capability) => Object.freeze({ ...capability })),
      ),
    }));
  return Object.freeze(records);
}

function renderCapabilities(capabilities: readonly RegistryCapability[]): string {
  if (capabilities.length === 0) return "none";
  return capabilities
    .map((capability) => `${capability.id}(${JSON.stringify(capability.limit)})`)
    .join(",");
}

const AMBIENT_AUTHORITY_CAVEAT =
  "plugin disclosure: broker-requested capabilities only; ambient executor authority " +
  "(e.g. spawn-path host filesystem/network access) is not reflected here -- see the " +
  "README plugin runtime trust model";

export function renderPluginDisclosureLines(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): readonly string[] {
  const { ownerApproved } = resolveDisclosureTicket(ticket);
  const records = describeAdmittedPluginSet(ticket);
  return Object.freeze([
    `plugin disclosure: ${records.length} plugin(s) admitted; ownerApproved=${ownerApproved}; ` +
      "this disclosure is advisory and enforces nothing",
    AMBIENT_AUTHORITY_CAVEAT,
    ...records.map(
      (record) =>
        `plugin disclosure: ${record.pluginId}@${record.version} kind=${record.kind} ` +
        `manifest=${record.manifestDigest} source=${record.sourceDigest} ` +
        `ownerApproved=${record.ownerApproved} ` +
        `brokerCapabilities=${renderCapabilities(record.requestedBrokerCapabilities)}`,
    ),
  ]);
}
