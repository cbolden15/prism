// PNH capability grant core. Pure: clock, policy, and hash are injected.
// Fixed-arity canonical bytes, pinned timestamps with integer math, exact
// plain-record validation, and neutral vocabulary are enforced here.
import { parseUtcMs } from "./timestamp.ts";

export type Sha256Hex = (utf8: string) => string;

export interface GrantValidationPolicy {
  maxTtlMs: number;
  maxClockSkewMs: number;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const DIGEST_RE = /^[0-9a-f]{64}$/;

export interface CapabilityGrant {
  programId: string;
  taskId: string;
  attempt: number;
  audience: string;
  inputDigest: string;
  operation: string;
  maxModelCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface GrantClaim {
  key: string;
  digest: string;
}

export type GrantRejectCode =
  | "shape"
  | "unknown-key"
  | "slug"
  | "digest-format"
  | "nonce-format"
  | "timestamp"
  | "expiry-order"
  | "ttl-exceeded"
  | "expired"
  | "clock-skew"
  | "clock-input"
  | "policy"
  | "limit-range"
  | "hash-output";

const GRANT_KEYS = [
  "programId",
  "taskId",
  "attempt",
  "audience",
  "inputDigest",
  "operation",
  "maxModelCalls",
  "maxInputTokens",
  "maxOutputTokens",
  "issuedAt",
  "expiresAt",
  "nonce",
] as const;

const POLICY_KEYS = ["maxTtlMs", "maxClockSkewMs"] as const;

export function canonicalGrantBytes(g: CapabilityGrant): string {
  // Fixed arity (13), fixed order, version-tagged. Slugs cannot contain
  // JSON-significant characters and integers are safe ints, so no two
  // distinct valid grants share bytes.
  return JSON.stringify([
    "pnh-grant-v1",
    g.programId,
    g.taskId,
    g.attempt,
    g.audience,
    g.inputDigest,
    g.operation,
    g.maxModelCalls,
    g.maxInputTokens,
    g.maxOutputTokens,
    g.issuedAt,
    g.expiresAt,
    g.nonce,
  ]);
}

type Ok = { ok: true; grant: CapabilityGrant; claim: GrantClaim };
type Fail = { ok: false; code: GrantRejectCode };

function positiveSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

export function validateGrantPolicy(value: unknown): GrantValidationPolicy | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(rec);
  if (Reflect.ownKeys(rec).some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  if (keys.some((key) => !(POLICY_KEYS as readonly string[]).includes(key))) return null;
  for (const key of POLICY_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return null;
  }
  if (!positiveSafeInt(rec.maxTtlMs)) return null;
  if (typeof rec.maxClockSkewMs !== "number" || !Number.isSafeInteger(rec.maxClockSkewMs) || rec.maxClockSkewMs < 0) {
    return null;
  }
  return { maxTtlMs: rec.maxTtlMs, maxClockSkewMs: rec.maxClockSkewMs };
}

export function validateGrant(
  value: unknown,
  nowMs: number,
  policyValue: unknown,
  hash: Sha256Hex,
): Ok | Fail {
  const policy = validateGrantPolicy(policyValue);
  if (policy === null) return { ok: false, code: "policy" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "shape" };
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) {
    return { ok: false, code: "shape" };
  }
  if (Reflect.ownKeys(rec).some((k) => typeof k !== "string" || !keys.includes(k))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      return { ok: false, code: "shape" };
    }
  }
  for (const k of keys) {
    if (!(GRANT_KEYS as readonly string[]).includes(k)) {
      return { ok: false, code: "unknown-key" };
    }
  }
  for (const k of GRANT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return { ok: false, code: "shape" };
  }
  const {
    programId, taskId, attempt, audience, inputDigest, operation,
    maxModelCalls, maxInputTokens, maxOutputTokens, issuedAt, expiresAt, nonce,
  } = rec;

  for (const s of [programId, taskId, audience, operation]) {
    if (typeof s !== "string" || !SLUG_RE.test(s)) {
      return { ok: false, code: "slug" };
    }
  }
  if (typeof inputDigest !== "string" || !DIGEST_RE.test(inputDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof nonce !== "string" || !NONCE_RE.test(nonce)) {
    return { ok: false, code: "nonce-format" };
  }
  if (
    !positiveSafeInt(attempt) ||
    !positiveSafeInt(maxModelCalls) ||
    !positiveSafeInt(maxInputTokens) ||
    !positiveSafeInt(maxOutputTokens)
  ) {
    return { ok: false, code: "limit-range" };
  }
  if (typeof issuedAt !== "string" || typeof expiresAt !== "string") {
    return { ok: false, code: "timestamp" };
  }
  const issuedMs = parseUtcMs(issuedAt);
  const expiresMs = parseUtcMs(expiresAt);
  if (issuedMs === null || expiresMs === null) {
    return { ok: false, code: "timestamp" };
  }
  if (expiresMs <= issuedMs) return { ok: false, code: "expiry-order" };
  if (!Number.isSafeInteger(nowMs)) return { ok: false, code: "clock-input" };
  if (expiresMs - issuedMs > policy.maxTtlMs) {
    return { ok: false, code: "ttl-exceeded" };
  }
  if (nowMs >= expiresMs) return { ok: false, code: "expired" };
  if (nowMs + policy.maxClockSkewMs < issuedMs) {
    return { ok: false, code: "clock-skew" };
  }

  const grant: CapabilityGrant = {
    programId: programId as string,
    taskId: taskId as string,
    attempt: attempt as number,
    audience: audience as string,
    inputDigest: inputDigest as string,
    operation: operation as string,
    maxModelCalls: maxModelCalls as number,
    maxInputTokens: maxInputTokens as number,
    maxOutputTokens: maxOutputTokens as number,
    issuedAt: issuedAt as string,
    expiresAt: expiresAt as string,
    nonce: nonce as string,
  };
  const digest = hash(canonicalGrantBytes(grant));
  if (!DIGEST_RE.test(digest)) return { ok: false, code: "hash-output" };
  // Slugs cannot contain '/', so this join is injective.
  const key = `${grant.audience}/${grant.programId}/${grant.taskId}/${grant.attempt}`;
  return { ok: true, grant, claim: { key, digest } };
}
