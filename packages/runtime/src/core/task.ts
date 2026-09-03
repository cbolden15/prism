// PNH task admission core. Pure: hash is injected. Binds a task's capability
// catalog into the task digest and requires the parent grant's inputDigest to
// equal that digest, so a grant can only authorize the catalog it was issued
// against.
import { DIGEST_RE, SLUG_RE, type Sha256Hex } from "./grant.ts";
import {
  canonicalCapabilityCatalogBytes,
  validateCapabilityCatalog,
  type CapabilityCatalog,
} from "./capability-catalog.ts";

export const TASK_VERSION = "pnh-task-v1";

export interface TaskAdmission {
  programId: string;
  taskId: string;
  attempt: number;
  audience: string;
  operation: string;
}

export type TaskRejectCode =
  | "shape"
  | "unknown-key"
  | "slug"
  | "limit-range"
  | "catalog"
  | "grant-digest-format"
  | "grant-binding"
  | "hash-output";

const TASK_KEYS = ["programId", "taskId", "attempt", "audience", "operation"] as const;

function positiveSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

function digestOf(bytes: string, hash: Sha256Hex): string | null {
  const digest = hash(bytes);
  return DIGEST_RE.test(digest) ? digest : null;
}

export function canonicalTaskBytes(task: TaskAdmission, capabilityCatalogDigest: string): string {
  return JSON.stringify([
    TASK_VERSION,
    task.programId,
    task.taskId,
    task.attempt,
    task.audience,
    task.operation,
    capabilityCatalogDigest,
  ]);
}

type Ok = {
  ok: true;
  task: TaskAdmission;
  catalog: CapabilityCatalog;
  catalogDigest: string;
  taskDigest: string;
};
type Fail = { ok: false; code: TaskRejectCode };

export function admitTask(
  value: unknown,
  catalogValue: unknown,
  grantInputDigest: unknown,
  hash: Sha256Hex,
): Ok | Fail {
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
  if (own.some((key) => !(TASK_KEYS as readonly string[]).includes(key))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of TASK_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) return { ok: false, code: "shape" };
  }

  const { programId, taskId, attempt, audience, operation } = rec;
  for (const slug of [programId, taskId, audience, operation]) {
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, code: "slug" };
  }
  if (!positiveSafeInt(attempt)) return { ok: false, code: "limit-range" };

  const catalogResult = validateCapabilityCatalog(catalogValue);
  if (!catalogResult.ok) return { ok: false, code: "catalog" };

  if (typeof grantInputDigest !== "string" || !DIGEST_RE.test(grantInputDigest)) {
    return { ok: false, code: "grant-digest-format" };
  }

  const task: TaskAdmission = {
    programId: programId as string,
    taskId: taskId as string,
    attempt: attempt as number,
    audience: audience as string,
    operation: operation as string,
  };

  const catalogDigest = digestOf(canonicalCapabilityCatalogBytes(catalogResult.catalog), hash);
  const taskDigest = digestOf(canonicalTaskBytes(task, String(catalogDigest)), hash);
  if (catalogDigest === null || taskDigest === null) return { ok: false, code: "hash-output" };
  if (grantInputDigest !== taskDigest) return { ok: false, code: "grant-binding" };

  return { ok: true, task, catalog: catalogResult.catalog, catalogDigest, taskDigest };
}
