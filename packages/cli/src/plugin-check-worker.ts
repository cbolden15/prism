import { closeSync, readSync, writeSync } from "node:fs";
import {
  MAX_TOOL_AUTHORING_JSON_BYTES,
  validateToolAuthoringFixture,
} from "@useprism/sdk/authoring";
import { normalizeJsonValue } from "@useprism/sdk/json";
import { validatePluginRegistration } from "@useprism/sdk/registration";

const WORKER_RESULT_VERSION = "prism-plugin-check-worker-v1";
const NONCE_RE = /^[0-9a-f]{64}$/u;
const NONCE_BYTES = 64;
const encoder = new TextEncoder();
const stringify = JSON.stringify;

type WorkerFailureCode = "registration-invalid" | "fixture-invalid" | "result-invalid" | "execution";

type WorkerResult =
  | {
    readonly version: typeof WORKER_RESULT_VERSION;
    readonly status: "ok";
    readonly nonce: string;
    readonly fixture: unknown;
    readonly registration: unknown;
    readonly result: unknown;
  }
  | {
    readonly version: typeof WORKER_RESULT_VERSION;
    readonly status: "error";
    readonly nonce: string;
    readonly code: WorkerFailureCode;
  };

type PluginHandle = (request: unknown) => unknown | Promise<unknown>;

function failure(nonce: string, code: WorkerFailureCode): WorkerResult {
  return { version: WORKER_RESULT_VERSION, status: "error", nonce, code };
}

function jsonByteLength(value: unknown): number | null {
  try {
    return encoder.encode(stringify(value)).byteLength;
  } catch {
    return null;
  }
}

async function evaluate(entrypoint: string, nonce: string): Promise<WorkerResult> {
  let imported: Record<string, unknown>;
  try {
    imported = await import(entrypoint) as Record<string, unknown>;
  } catch {
    return failure(nonce, "execution");
  }

  const fixture = validateToolAuthoringFixture(imported.prismToolAuthoringFixture);
  if (fixture === null) return failure(nonce, "fixture-invalid");
  if (typeof imported.handle !== "function") return failure(nonce, "registration-invalid");
  const handle = imported.handle as PluginHandle;

  let registration: ReturnType<typeof validatePluginRegistration>;
  try {
    registration = validatePluginRegistration(await handle({ phase: "register" }));
  } catch {
    return failure(nonce, "registration-invalid");
  }
  if (registration === null) return failure(nonce, "registration-invalid");

  let rawResult: unknown;
  try {
    rawResult = await handle({
      phase: "operate",
      payload: { operation: fixture.operation, input: fixture.input },
    });
  } catch {
    return failure(nonce, "execution");
  }
  const result = normalizeJsonValue(rawResult);
  const resultBytes = result === undefined ? null : jsonByteLength(result);
  if (result === undefined || resultBytes === null || resultBytes > MAX_TOOL_AUTHORING_JSON_BYTES) {
    return failure(nonce, "result-invalid");
  }
  return {
    version: WORKER_RESULT_VERSION,
    status: "ok",
    nonce,
    fixture,
    registration,
    result,
  };
}

function send(result: WorkerResult): void {
  const frame = Buffer.from(`${stringify(result)}\n`, "utf8");
  let offset = 0;
  while (offset < frame.byteLength) {
    offset += writeSync(3, frame, offset, frame.byteLength - offset);
  }
}

function readNonce(): string | null {
  const bytes = Buffer.alloc(NONCE_BYTES + 1);
  let offset = 0;
  try {
    while (offset < bytes.byteLength) {
      const count = readSync(4, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) break;
      offset += count;
    }
  } catch {
    return null;
  } finally {
    try { closeSync(4); } catch {}
  }
  if (offset !== NONCE_BYTES) return null;
  const nonce = bytes.subarray(0, NONCE_BYTES).toString("utf8");
  return NONCE_RE.test(nonce) ? nonce : null;
}

const [entrypoint, ...extra] = process.argv.slice(2);
const nonce = readNonce();
if (
  typeof entrypoint !== "string"
  || nonce === null
  || extra.length !== 0
) {
  process.exitCode = 1;
} else {
  try {
    send(await evaluate(entrypoint, nonce));
  } catch {
    process.exitCode = 1;
  }
}
