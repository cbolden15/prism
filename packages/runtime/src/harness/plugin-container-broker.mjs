import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_WIRE_BUFFER_BYTES as MAX_CUMULATIVE_BYTES,
  MAX_WIRE_FRAME_BYTES as MAX_FRAME_BYTES,
} from "@useprism/sdk/protocol/resource-bounds";

const VERSION = 1;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const ACTIONS = ["launch", "cleanup", "status", "acknowledge", "write", "close-input"];
const STARTUP_KEYS = ["v", "token"];
const REQUEST_KEYS = ["v", "type", "token", "operationId", "action", "requestId", "pluginId", "deadlineMs"];
const WRITE_REQUEST_KEYS = [...REQUEST_KEYS, "seq", "dataBase64"];
const SUPERVISOR_RESULT_KEYS = ["v", "type", "token", "operationId", "ok", "result", "code"];
const SUPERVISOR_EVENT_KEYS = ["v", "type", "token", "event"];

function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function validIdentity(value) {
  return (
    isPlainRecord(value) &&
    typeof value.requestId === "string" &&
    ID_RE.test(value.requestId) &&
    typeof value.pluginId === "string" &&
    PLUGIN_ID_RE.test(value.pluginId)
  );
}

function validateBrokerRequest(value) {
  if (
    !isPlainRecord(value) ||
    typeof value.operationId !== "string" ||
    !ID_RE.test(value.operationId) ||
    !ACTIONS.includes(value.action) ||
    !validIdentity(value) ||
    typeof value.deadlineMs !== "number" ||
    !Number.isSafeInteger(value.deadlineMs) ||
    value.deadlineMs < 0
  ) {
    throw new TypeError("invalid broker request");
  }
  if (value.action === "write") {
    if (
      typeof value.seq !== "number" ||
      !Number.isSafeInteger(value.seq) ||
      value.seq <= 0 ||
      typeof value.dataBase64 !== "string" ||
      value.dataBase64.length === 0
    ) {
      throw new TypeError("invalid broker stream request");
    }
    const bytes = Buffer.from(value.dataBase64, "base64");
    if (bytes.byteLength === 0 || bytes.toString("base64") !== value.dataBase64) {
      throw new TypeError("invalid broker stream request");
    }
  }
  return value;
}

function commandFor(request) {
  const command = {
    type: request.action,
    commandId: request.operationId,
    requestId: request.requestId,
    pluginId: request.pluginId,
  };
  if (request.action === "launch") command.deadlineMs = request.deadlineMs;
  if (request.action === "write") {
    command.seq = request.seq;
    command.dataBase64 = request.dataBase64;
  }
  return Object.freeze(command);
}

function matchesIdentity(result, request) {
  return result.requestId === request.requestId && result.pluginId === request.pluginId;
}

function validReceipt(value, request) {
  return (
    isPlainRecord(value) &&
    value.v === 1 &&
    matchesIdentity(value, request) &&
    typeof value.confirmedAbsent === "boolean"
  );
}

function validateSupervisorResult(result, request) {
  if (!isPlainRecord(result) || typeof result.status !== "string") {
    throw new Error("supervisor returned an invalid lifecycle result");
  }
  if (result.status === "running") {
    if (request.action !== "launch" && request.action !== "status") {
      throw new Error("supervisor returned an invalid lifecycle transition");
    }
    if (!matchesIdentity(result, request)) throw new Error("supervisor result identity mismatch");
    return result;
  }
  if (result.status === "terminal") {
    if (!validReceipt(result.receipt, request)) throw new Error("supervisor returned an invalid lifecycle receipt");
    if (!result.receipt.confirmedAbsent) throw new Error("broker success requires daemon-confirmed absence");
    if (request.action !== "cleanup" && request.action !== "status") {
      throw new Error("supervisor returned an invalid lifecycle transition");
    }
    return result;
  }
  if (result.status === "acknowledged") {
    if (request.action !== "acknowledge" || !matchesIdentity(result, request)) {
      throw new Error("supervisor returned an invalid acknowledgement");
    }
    return result;
  }
  if (result.status === "input-written") {
    if (request.action !== "write" || !matchesIdentity(result, request) || result.seq !== request.seq) {
      throw new Error("supervisor returned an invalid input write");
    }
    return result;
  }
  if (result.status === "input-closed") {
    if (request.action !== "close-input" || !matchesIdentity(result, request)) {
      throw new Error("supervisor returned an invalid input close");
    }
    return result;
  }
  throw new Error("supervisor returned an unknown lifecycle status");
}

function validateSupervisorEvent(value) {
  if (!isPlainRecord(value) || value.v !== VERSION || typeof value.type !== "string") {
    throw new TypeError("invalid supervisor event");
  }
  if (value.type === "stream") {
    if (
      !hasExactKeys(value, ["v", "type", "requestId", "pluginId", "channel", "seq", "dataBase64"]) ||
      !validIdentity(value) ||
      (value.channel !== "stdout" && value.channel !== "stderr") ||
      typeof value.seq !== "number" ||
      !Number.isSafeInteger(value.seq) ||
      value.seq <= 0 ||
      typeof value.dataBase64 !== "string" ||
      Buffer.from(value.dataBase64, "base64").toString("base64") !== value.dataBase64
    ) {
      throw new TypeError("invalid supervisor stream event");
    }
    return value;
  }
  if (
    value.type !== "terminal" ||
    !hasExactKeys(value, ["v", "type", "receipt"]) ||
    !isPlainRecord(value.receipt) ||
    value.receipt.v !== VERSION ||
    !validIdentity(value.receipt) ||
    typeof value.receipt.confirmedAbsent !== "boolean"
  ) {
    throw new TypeError("invalid supervisor terminal event");
  }
  return value;
}

export function createPluginContainerBroker(options) {
  if (options === null || typeof options !== "object") throw new TypeError("broker options are required");
  const { sendSupervisor, clock, timers } = options;
  if (typeof sendSupervisor !== "function") throw new TypeError("supervisor RPC is required");
  if (typeof clock?.now !== "function") throw new TypeError("broker clock is required");
  if (typeof timers?.set !== "function" || typeof timers?.clear !== "function") {
    throw new TypeError("broker timers are required");
  }

  const pending = new Map();
  let closedError;

  function request(input) {
    const requestValue = validateBrokerRequest(input);
    if (closedError !== undefined) return Promise.reject(closedError);
    if (pending.has(requestValue.operationId)) return Promise.reject(new Error("duplicate broker operation ID"));
    const delayMs = requestValue.deadlineMs - clock.now();
    if (delayMs <= 0) return Promise.reject(new Error("broker request deadline exceeded"));

    return new Promise((resolvePromise, reject) => {
      let settled = false;
      const settle = (operation) => {
        if (settled) return;
        settled = true;
        timers.clear(timer);
        pending.delete(requestValue.operationId);
        operation();
      };
      const timer = timers.set(
        () => settle(() => reject(new Error("broker request deadline exceeded"))),
        delayMs,
      );
      pending.set(requestValue.operationId, {
        reject: (error) => settle(() => reject(error)),
      });

      let supervisorRequest;
      try {
        supervisorRequest = sendSupervisor(commandFor(requestValue));
      } catch (error) {
        settle(() => reject(error instanceof Error ? error : new Error("supervisor RPC failed")));
        return;
      }
      Promise.resolve(supervisorRequest)
        .then(
          (result) => settle(() => {
            try {
              resolvePromise(validateSupervisorResult(result, requestValue));
            } catch (error) {
              reject(error);
            }
          }),
          (error) => settle(() => reject(error instanceof Error ? error : new Error("supervisor RPC failed"))),
        );
    });
  }

  return Object.freeze({
    request,
    close(error = new Error("broker transport closed")) {
      if (closedError !== undefined) return;
      closedError = error instanceof Error ? error : new Error("broker transport closed");
      for (const operation of [...pending.values()]) operation.reject(closedError);
    },
  });
}

export function parseBrokerStartupConfig(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_FRAME_BYTES) {
    throw new TypeError("invalid broker startup configuration");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError("invalid broker startup configuration");
  }
  if (
    text !== JSON.stringify(value) ||
    !hasExactKeys(value, STARTUP_KEYS) ||
    value.v !== VERSION ||
    typeof value.token !== "string" ||
    !TOKEN_RE.test(value.token)
  ) {
    throw new TypeError("invalid broker startup configuration");
  }
  return Object.freeze({ token: value.token });
}

function authenticate(value, token) {
  if (typeof value.token !== "string" || value.token.length !== token.length) {
    throw new Error("broker authentication failed");
  }
  if (!timingSafeEqual(Buffer.from(value.token), Buffer.from(token))) {
    throw new Error("broker authentication failed");
  }
}

function validateInputFrame(value, token) {
  if (!isPlainRecord(value) || value.v !== VERSION || typeof value.type !== "string") {
    throw new TypeError("invalid broker frame");
  }
  authenticate(value, token);
  if (value.type === "request") {
    const keys = value.action === "write" ? WRITE_REQUEST_KEYS : REQUEST_KEYS;
    if (!hasExactKeys(value, keys)) throw new TypeError("invalid broker request frame");
    return { type: "request", value: validateBrokerRequest(value) };
  }
  if (value.type === "supervisor-result") {
    if (
      !hasExactKeys(value, SUPERVISOR_RESULT_KEYS) ||
      typeof value.operationId !== "string" ||
      !ID_RE.test(value.operationId) ||
      typeof value.ok !== "boolean" ||
      (value.ok ? value.code !== null : typeof value.code !== "string") ||
      (value.ok ? value.result === null : value.result !== null)
    ) {
      throw new TypeError("invalid supervisor result frame");
    }
    return { type: "supervisor-result", value };
  }
  if (value.type === "supervisor-event") {
    if (!hasExactKeys(value, SUPERVISOR_EVENT_KEYS)) throw new TypeError("invalid supervisor event frame");
    return { type: "supervisor-event", value: validateSupervisorEvent(value.event) };
  }
  throw new TypeError("invalid broker frame type");
}

function systemTimers() {
  return Object.freeze({
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle),
  });
}

async function writeFrame(output, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (!output.write(bytes)) await once(output, "drain");
}

function appendBytes(left, right) {
  const combined = Buffer.alloc(left.byteLength + right.byteLength);
  Buffer.from(left).copy(combined, 0);
  Buffer.from(right).copy(combined, left.byteLength);
  return combined;
}

export async function runBrokerCommandLoop({ input, output, token, clock = { now: () => Date.now() }, timers = systemTimers() }) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new TypeError("invalid broker token");
  if (typeof input?.[Symbol.asyncIterator] !== "function" || typeof output?.write !== "function") {
    throw new TypeError("invalid broker command transport");
  }

  const supervisorPending = new Map();
  const tasks = new Set();
  let writeQueue = Promise.resolve();
  let buffer = Buffer.alloc(0);

  const enqueueWrite = (value) => {
    const result = writeQueue.then(() => writeFrame(output, value));
    writeQueue = result.catch(() => undefined);
    return result;
  };
  const broker = createPluginContainerBroker({
    clock,
    timers,
    sendSupervisor(command) {
      return new Promise((resolvePromise, reject) => {
        supervisorPending.set(command.commandId, { resolve: resolvePromise, reject });
        void enqueueWrite({
          v: VERSION,
          type: "supervisor-command",
          token,
          operationId: command.commandId,
          command,
        }).catch(reject);
      });
    },
  });

  function startRequest(value) {
    const task = broker.request(value).then(
      (result) => enqueueWrite({
        v: VERSION,
        type: "response",
        token,
        operationId: value.operationId,
        ok: true,
        result,
        code: null,
      }),
      (error) => enqueueWrite({
        v: VERSION,
        type: "response",
        token,
        operationId: value.operationId,
        ok: false,
        result: null,
        code: error instanceof Error && /deadline/.test(error.message) ? "deadline" : "request-failed",
      }),
    );
    tasks.add(task);
    void task.finally(() => tasks.delete(task)).catch(() => undefined);
  }

  try {
    for await (const chunk of input) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError("broker transport must contain bytes");
      if (buffer.byteLength + chunk.byteLength > MAX_CUMULATIVE_BYTES) {
        throw new Error("broker command buffer limit exceeded");
      }
      buffer = appendBytes(buffer, chunk);
      let newline;
      while ((newline = buffer.indexOf(0x0a)) !== -1) {
        const line = buffer.subarray(0, newline);
        buffer = buffer.subarray(newline + 1);
        if (line.byteLength === 0 || line.byteLength > MAX_FRAME_BYTES || line[line.byteLength - 1] === 0x0d) {
          throw new Error("invalid broker frame");
        }
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(line);
        } catch {
          throw new Error("invalid broker frame UTF-8");
        }
        let raw;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new Error("malformed broker frame");
        }
        if (text !== JSON.stringify(raw)) throw new Error("noncanonical broker frame");
        const frame = validateInputFrame(raw, token);
        if (frame.type === "request") {
          startRequest(frame.value);
          continue;
        }
        if (frame.type === "supervisor-event") {
          await enqueueWrite({ v: VERSION, type: "event", token, event: frame.value });
          continue;
        }
        const pending = supervisorPending.get(frame.value.operationId);
        if (pending === undefined) continue;
        supervisorPending.delete(frame.value.operationId);
        if (frame.value.ok) pending.resolve(frame.value.result);
        else pending.reject(new Error("supervisor command failed"));
        await Promise.resolve();
      }
      if (buffer.byteLength > MAX_FRAME_BYTES) throw new Error("broker frame exceeded limit");
    }
    if (buffer.byteLength !== 0) throw new Error("unterminated broker frame");
  } finally {
    const closedError = new Error("gateway transport closed");
    broker.close(closedError);
    for (const pending of supervisorPending.values()) pending.reject(closedError);
    supervisorPending.clear();
    await Promise.allSettled([...tasks]);
    await writeQueue;
  }
}

async function main() {
  const startup = parseBrokerStartupConfig(readFileSync(3, "utf8"));
  await runBrokerCommandLoop({ input: process.stdin, output: process.stdout, token: startup.token });
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write("plugin container broker failed\n");
    process.exitCode = 1;
  });
}
