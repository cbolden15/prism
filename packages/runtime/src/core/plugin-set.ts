// PNH plugin-set core. Pure: hash is injected. The caller supplies the
// already-resolved dependency order; this module validates member identities
// and canonicalizes that exact order into a stable digest. It does not
// resolve dependencies or reorder members.
import { DIGEST_RE, SLUG_RE, type Sha256Hex } from "./grant.ts";

export const PLUGIN_SET_VERSION = "pnh-plugin-set-v1";

export interface PluginSetMember {
  pluginId: string;
  versionDigest: string;
}

export type PluginSetRejectCode =
  | "shape"
  | "member-shape"
  | "slug"
  | "digest-format"
  | "duplicate-member"
  | "hash-output";

const MEMBER_KEYS = ["pluginId", "versionDigest"] as const;

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

export function canonicalPluginSetBytes(orderedMembers: readonly PluginSetMember[]): string {
  return JSON.stringify([
    PLUGIN_SET_VERSION,
    orderedMembers.map((member) => [member.pluginId, member.versionDigest]),
  ]);
}

type ValidateOk = { ok: true; members: PluginSetMember[] };
type ValidateFail = { ok: false; code: PluginSetRejectCode };

export function validatePluginSet(value: unknown): ValidateOk | ValidateFail {
  if (!Array.isArray(value)) return { ok: false, code: "shape" };

  const seen = new Set<string>();
  const members: PluginSetMember[] = [];
  for (const rawMember of value) {
    if (!isNestedRecord(rawMember) || !hasExactKeys(rawMember, MEMBER_KEYS)) {
      return { ok: false, code: "member-shape" };
    }
    const { pluginId, versionDigest } = rawMember;
    if (typeof pluginId !== "string" || !SLUG_RE.test(pluginId)) {
      return { ok: false, code: "slug" };
    }
    if (typeof versionDigest !== "string" || !DIGEST_RE.test(versionDigest)) {
      return { ok: false, code: "digest-format" };
    }
    if (seen.has(pluginId)) return { ok: false, code: "duplicate-member" };
    seen.add(pluginId);
    members.push({ pluginId, versionDigest });
  }

  return { ok: true, members };
}

export type PluginSetDigestResult =
  | { ok: true; members: PluginSetMember[]; digest: string }
  | { ok: false; code: PluginSetRejectCode };

export function derivePluginSetDigest(value: unknown, hash: Sha256Hex): PluginSetDigestResult {
  const result = validatePluginSet(value);
  if (!result.ok) return result;
  const digest = digestOf(canonicalPluginSetBytes(result.members), hash);
  if (digest === null) return { ok: false, code: "hash-output" };
  return { ok: true, members: result.members, digest };
}
