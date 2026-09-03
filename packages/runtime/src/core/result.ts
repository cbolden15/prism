// PNH terminal result core. Pure: hash is injected, timestamp parsing reuses
// the shared UTC rules. A terminal result records the outcome of one task
// attempt and binds it to the evidence chain it was produced from; it does
// not itself authorize a Runtime transition.
import { DIGEST_RE, type Sha256Hex } from "./grant.ts";
import { parseUtcMs } from "./timestamp.ts";

export const RESULT_VERSION = "pnh-result-v1";

export const RESULT_OUTCOMES = ["completed", "failed", "rejected"] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export interface TerminalResult {
  taskDigest: string;
  attempt: number;
  outcome: ResultOutcome;
  evidenceLength: number;
  evidenceFinalHash: string;
  completedAt: string;
}

export type ResultRejectCode =
  | "shape"
  | "unknown-key"
  | "digest-format"
  | "limit-range"
  | "outcome"
  | "timestamp"
  | "hash-output";

const RESULT_KEYS = [
  "taskDigest",
  "attempt",
  "outcome",
  "evidenceLength",
  "evidenceFinalHash",
  "completedAt",
] as const;

function positiveSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

function nonNegativeSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

function digestOf(bytes: string, hash: Sha256Hex): string | null {
  const digest = hash(bytes);
  return DIGEST_RE.test(digest) ? digest : null;
}

export function canonicalResultBytes(result: TerminalResult): string {
  return JSON.stringify([
    RESULT_VERSION,
    result.taskDigest,
    result.attempt,
    result.outcome,
    result.evidenceLength,
    result.evidenceFinalHash,
    result.completedAt,
  ]);
}

type Ok = { ok: true; result: TerminalResult; digest: string };
type Fail = { ok: false; code: ResultRejectCode };

export function deriveTerminalResult(value: unknown, hash: Sha256Hex): Ok | Fail {
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
  if (own.some((key) => !(RESULT_KEYS as readonly string[]).includes(key))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of RESULT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) return { ok: false, code: "shape" };
  }

  const { taskDigest, attempt, outcome, evidenceLength, evidenceFinalHash, completedAt } = rec;
  if (typeof taskDigest !== "string" || !DIGEST_RE.test(taskDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof evidenceFinalHash !== "string" || !DIGEST_RE.test(evidenceFinalHash)) {
    return { ok: false, code: "digest-format" };
  }
  if (!positiveSafeInt(attempt)) return { ok: false, code: "limit-range" };
  if (!nonNegativeSafeInt(evidenceLength)) return { ok: false, code: "limit-range" };
  if (typeof outcome !== "string" || !(RESULT_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, code: "outcome" };
  }
  if (typeof completedAt !== "string" || parseUtcMs(completedAt) === null) {
    return { ok: false, code: "timestamp" };
  }

  const result: TerminalResult = {
    taskDigest,
    attempt,
    outcome: outcome as ResultOutcome,
    evidenceLength,
    evidenceFinalHash,
    completedAt,
  };
  const digest = digestOf(canonicalResultBytes(result), hash);
  if (digest === null) return { ok: false, code: "hash-output" };
  return { ok: true, result, digest };
}
