// PNH runtime event core. Pure: hash is injected. Defines the content of one
// append-only Runtime event payload; sequencing and hash-chain linking are
// evidence.ts's concern, not this module's. A validated event describes a
// fact that occurred, not an authorization to transition the Runtime.
//
// The event discriminant is named `type`, not `kind` -- the sandbox test
// harness's own top-level argument protocol reserves `kind` to select
// hostile-object fixtures (see harness/sandbox/core-loader-preload.mjs's
// `materialize`), so any top-level record under test must avoid that key.
import { DIGEST_RE, type Sha256Hex } from "./grant.ts";
import { parseUtcMs } from "./timestamp.ts";

export const RUNTIME_EVENT_VERSION = "pnh-runtime-event-v1";

export const RUNTIME_EVENT_TYPES = [
  "task-admitted",
  "plugin-set-resolved",
  "plugin-grant-issued",
  "task-completed",
  "task-rejected",
] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export interface RuntimeEvent {
  type: RuntimeEventType;
  taskDigest: string;
  subjectDigest: string;
  occurredAt: string;
}

export type RuntimeEventRejectCode =
  | "shape"
  | "unknown-key"
  | "type"
  | "digest-format"
  | "timestamp"
  | "hash-output";

const EVENT_KEYS = ["type", "taskDigest", "subjectDigest", "occurredAt"] as const;

function digestOf(bytes: string, hash: Sha256Hex): string | null {
  const digest = hash(bytes);
  return DIGEST_RE.test(digest) ? digest : null;
}

export function canonicalRuntimeEventBytes(event: RuntimeEvent): string {
  return JSON.stringify([
    RUNTIME_EVENT_VERSION,
    event.type,
    event.taskDigest,
    event.subjectDigest,
    event.occurredAt,
  ]);
}

type Ok = { ok: true; event: RuntimeEvent; digest: string };
type Fail = { ok: false; code: RuntimeEventRejectCode };

export function deriveRuntimeEvent(value: unknown, hash: Sha256Hex): Ok | Fail {
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
  if (own.some((key) => !(EVENT_KEYS as readonly string[]).includes(key))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of EVENT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) return { ok: false, code: "shape" };
  }

  const { type, taskDigest, subjectDigest, occurredAt } = rec;
  if (typeof type !== "string" || !(RUNTIME_EVENT_TYPES as readonly string[]).includes(type)) {
    return { ok: false, code: "type" };
  }
  if (typeof taskDigest !== "string" || !DIGEST_RE.test(taskDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof subjectDigest !== "string" || !DIGEST_RE.test(subjectDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof occurredAt !== "string" || parseUtcMs(occurredAt) === null) {
    return { ok: false, code: "timestamp" };
  }

  const event: RuntimeEvent = {
    type: type as RuntimeEventType,
    taskDigest,
    subjectDigest,
    occurredAt,
  };
  const digest = digestOf(canonicalRuntimeEventBytes(event), hash);
  if (digest === null) return { ok: false, code: "hash-output" };
  return { ok: true, event, digest };
}
