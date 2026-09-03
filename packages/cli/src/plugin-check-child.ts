import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  MAX_TOOL_AUTHORING_JSON_BYTES,
  validateToolAuthoringFixture,
} from "@useprism/sdk/authoring";
import { normalizeJsonValue } from "@useprism/sdk/json";
import { validatePluginRegistration } from "@useprism/sdk/registration";

const CHILD_RESULT_VERSION = "prism-plugin-check-child-v1";
const WORKER_RESULT_VERSION = "prism-plugin-check-worker-v1";
const WORKER_PROTOCOL_LIMIT_BYTES = 262_144;
const NONCE_RE = /^[0-9a-f]{64}$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

type ChildFailureCode =
  | "registration-invalid"
  | "fixture-invalid"
  | "fixture-mismatch"
  | "result-invalid"
  | "protocol"
  | "protocol-limit"
  | "execution";

type ChildResult =
  | {
    readonly version: typeof CHILD_RESULT_VERSION;
    readonly status: "ok";
    readonly pluginId: string;
    readonly operation: string;
  }
  | {
    readonly version: typeof CHILD_RESULT_VERSION;
    readonly status: "error";
    readonly code: ChildFailureCode;
  };

type WorkerFailureCode = "registration-invalid" | "fixture-invalid" | "result-invalid" | "execution";

type WorkerMessage =
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

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length
    && actual.every((key) => keys.includes(key))
    && Reflect.ownKeys(value).every((key) => typeof key === "string" && actual.includes(key));
}

function parseWorkerMessage(value: unknown, nonce: string): WorkerMessage | null {
  if (isExactRecord(value, ["version", "status", "nonce", "code"])) {
    if (
      value.version !== WORKER_RESULT_VERSION
      || value.status !== "error"
      || value.nonce !== nonce
      || typeof value.code !== "string"
      || !["registration-invalid", "fixture-invalid", "result-invalid", "execution"].includes(value.code)
    ) {
      return null;
    }
    return Object.freeze({
      version: WORKER_RESULT_VERSION,
      status: "error",
      nonce,
      code: value.code as WorkerFailureCode,
    });
  }
  if (!isExactRecord(value, ["version", "status", "nonce", "fixture", "registration", "result"])) {
    return null;
  }
  if (value.version !== WORKER_RESULT_VERSION || value.status !== "ok" || value.nonce !== nonce) return null;
  return Object.freeze({
    version: WORKER_RESULT_VERSION,
    status: "ok",
    nonce,
    fixture: value.fixture,
    registration: value.registration,
    result: value.result,
  });
}

function parseWorkerFrame(bytes: Uint8Array, nonce: string): WorkerMessage | null {
  if (bytes.byteLength === 0 || bytes.at(-1) !== 0x0a) return null;
  let frame: string;
  try {
    frame = decoder.decode(bytes);
  } catch {
    return null;
  }
  if (frame.indexOf("\n") !== frame.length - 1) return null;
  try {
    return parseWorkerMessage(JSON.parse(frame.slice(0, -1)), nonce);
  } catch {
    return null;
  }
}

function jsonByteLength(value: unknown): number | null {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function workerModulePath(): string {
  return fileURLToPath(new URL("./plugin-check-worker.js", import.meta.url));
}

async function receiveWorkerMessage(entrypoint: string, nonce: string): Promise<WorkerMessage | ChildFailureCode> {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [workerModulePath(), entrypoint], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit", "pipe", "pipe"],
    });
  } catch {
    return "execution";
  }

  const protocol = child.stdio[3] as Readable | null;
  const challenge = child.stdio[4] as Writable | null;
  if (protocol === null || challenge === null) {
    try { child.kill("SIGKILL"); } catch {}
    return "protocol";
  }

  let challengeError = false;
  challenge.once("error", () => {
    challengeError = true;
    try { child.kill("SIGKILL"); } catch {}
  });
  challenge.end(nonce);

  let protocolBytes = 0;
  let protocolLimit = false;
  let protocolEnded = false;
  let protocolError = false;
  const chunks: Buffer[] = [];
  protocol.on("data", (chunk: string | Buffer) => {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    const available = Math.max(0, WORKER_PROTOCOL_LIMIT_BYTES - protocolBytes);
    if (available > 0) chunks.push(bytes.subarray(0, available));
    protocolBytes += bytes.byteLength;
    if (protocolBytes > WORKER_PROTOCOL_LIMIT_BYTES && !protocolLimit) {
      protocolLimit = true;
      try { child.kill("SIGKILL"); } catch {}
    }
  });
  protocol.once("end", () => { protocolEnded = true; });
  protocol.once("error", () => {
    protocolError = true;
    try { child.kill("SIGKILL"); } catch {}
  });

  const completion = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly errored: boolean;
  }>((resolve) => {
    let settled = false;
    const settle = (value: { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly errored: boolean }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", () => settle({ code: null, signal: null, errored: true }));
    child.once("close", (code, signal) => settle({ code, signal, errored: false }));
  });

  if (protocolLimit) return "protocol-limit";
  if (challengeError) return "protocol";
  if (completion.errored || completion.code !== 0 || completion.signal !== null) return "execution";
  if (!protocolEnded || protocolError) return "protocol";
  return parseWorkerFrame(Buffer.concat(chunks, protocolBytes), nonce) ?? "protocol";
}

async function evaluate(entrypoint: string, pluginId: string): Promise<ChildResult> {
  const nonce = randomBytes(32).toString("hex");
  if (!NONCE_RE.test(nonce)) return { version: CHILD_RESULT_VERSION, status: "error", code: "execution" };
  const reported = await receiveWorkerMessage(entrypoint, nonce);
  if (typeof reported === "string") {
    return { version: CHILD_RESULT_VERSION, status: "error", code: reported };
  }
  if (reported.status === "error") {
    return { version: CHILD_RESULT_VERSION, status: "error", code: reported.code };
  }

  const fixture = validateToolAuthoringFixture(reported.fixture);
  if (fixture === null) return { version: CHILD_RESULT_VERSION, status: "error", code: "fixture-invalid" };
  const registration = validatePluginRegistration(reported.registration);
  if (
    registration === null
    || registration.kind !== "tool"
    || registration.pluginId !== pluginId
    || !registration.operations.includes(fixture.operation)
  ) {
    return { version: CHILD_RESULT_VERSION, status: "error", code: "registration-invalid" };
  }
  const result = normalizeJsonValue(reported.result);
  const resultBytes = result === undefined ? null : jsonByteLength(result);
  if (result === undefined || resultBytes === null || resultBytes > MAX_TOOL_AUTHORING_JSON_BYTES) {
    return { version: CHILD_RESULT_VERSION, status: "error", code: "result-invalid" };
  }
  if (!isDeepStrictEqual(result, fixture.expected)) {
    return { version: CHILD_RESULT_VERSION, status: "error", code: "fixture-mismatch" };
  }
  return {
    version: CHILD_RESULT_VERSION,
    status: "ok",
    pluginId,
    operation: fixture.operation,
  };
}

function send(result: ChildResult): void {
  const frame = Buffer.from(`${JSON.stringify(result)}\n`, "utf8");
  let offset = 0;
  while (offset < frame.byteLength) {
    offset += writeSync(3, frame, offset, frame.byteLength - offset);
  }
}

const [entrypoint, pluginId, ...extra] = process.argv.slice(2);
if (typeof entrypoint !== "string" || typeof pluginId !== "string" || extra.length !== 0) {
  process.exitCode = 1;
} else {
  try {
    send(await evaluate(entrypoint, pluginId));
  } catch {
    process.exitCode = 1;
  }
}
