import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_WIRE_BUFFER_BYTES as MAX_CUMULATIVE_BYTES,
  MAX_WIRE_FRAME_BYTES as MAX_FRAME_BYTES,
} from "@useprism/sdk/protocol/resource-bounds";
import { parseSupervisorStartupConfig } from "../plugin-container-supervisor.mjs";
import { SPAWN_LAUNCH_ARGS_VERSION } from "../plugin-spawn-supervisor.mjs";

const VERSION = 1;
const CHILD_SHUTDOWN_MS = 10_000;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const ACTIONS = ["launch", "cleanup", "status", "acknowledge", "write", "close-input"];
const STARTUP_KEYS = ["v", "token", "plugins"];
const EXTERNAL_REQUEST_KEYS = ["v", "type", "token", "operationId", "action", "requestId", "pluginId", "deadlineMs"];
const EXTERNAL_WRITE_KEYS = [...EXTERNAL_REQUEST_KEYS, "seq", "dataBase64"];
const BROKER_COMMAND_KEYS = ["v", "type", "token", "operationId", "command"];
const BROKER_RESPONSE_KEYS = ["v", "type", "token", "operationId", "ok", "result", "code"];
const BROKER_EVENT_KEYS = ["v", "type", "token", "event"];
const SUPERVISOR_RESULT_KEYS = ["v", "type", "commandId", "result"];
const SUPERVISOR_ERROR_KEYS = ["v", "type", "commandId", "code"];
// The spawn executor's lifecycle port emits this when it cannot set the
// launch spec's uid/gid (any non-root host) and falls back to an
// unprivileged spawn. It carries no commandId and is purely informational,
// so it is validated and dropped inside the gateway rather than forwarded
// through the broker to the external caller, whose event protocol only
// knows "stream" and "terminal".
const SUPERVISOR_WARNING_KEYS = [
  "v",
  "type",
  "code",
  "requestId",
  "pluginId",
  "requestedUid",
  "requestedGid",
  "actualUid",
  "actualGid",
  "errorCode",
];

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

function authenticate(value, token, boundary) {
  if (typeof value.token !== "string" || value.token.length !== token.length) {
    throw new Error(`${boundary} authentication failed`);
  }
  if (!timingSafeEqual(Buffer.from(value.token), Buffer.from(token))) {
    throw new Error(`${boundary} authentication failed`);
  }
}

function validateRequest(value) {
  if (
    !isPlainRecord(value) ||
    typeof value.operationId !== "string" ||
    !ID_RE.test(value.operationId) ||
    !ACTIONS.includes(value.action) ||
    typeof value.requestId !== "string" ||
    !ID_RE.test(value.requestId) ||
    typeof value.pluginId !== "string" ||
    !PLUGIN_ID_RE.test(value.pluginId) ||
    typeof value.deadlineMs !== "number" ||
    !Number.isSafeInteger(value.deadlineMs) ||
    value.deadlineMs < 0
  ) {
    throw new TypeError("invalid gateway request");
  }
  if (value.action === "write") {
    if (
      typeof value.seq !== "number" ||
      !Number.isSafeInteger(value.seq) ||
      value.seq <= 0 ||
      typeof value.dataBase64 !== "string" ||
      value.dataBase64.length === 0 ||
      Buffer.from(value.dataBase64, "base64").toString("base64") !== value.dataBase64
    ) {
      throw new TypeError("invalid gateway stream request");
    }
  }
  return value;
}

function validateStreamEvent(value) {
  if (!isPlainRecord(value) || value.v !== VERSION || typeof value.type !== "string") {
    throw new TypeError("invalid supervisor event");
  }
  if (value.type === "stream") {
    if (
      !hasExactKeys(value, ["v", "type", "requestId", "pluginId", "channel", "seq", "dataBase64"]) ||
      typeof value.requestId !== "string" ||
      !ID_RE.test(value.requestId) ||
      typeof value.pluginId !== "string" ||
      !PLUGIN_ID_RE.test(value.pluginId) ||
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
    typeof value.receipt.requestId !== "string" ||
    !ID_RE.test(value.receipt.requestId) ||
    typeof value.receipt.pluginId !== "string" ||
    !PLUGIN_ID_RE.test(value.receipt.pluginId) ||
    typeof value.receipt.confirmedAbsent !== "boolean"
  ) {
    throw new TypeError("invalid supervisor terminal event");
  }
  return value;
}

function validateBrokerFrame(value, token) {
  if (!isPlainRecord(value) || value.v !== VERSION || typeof value.type !== "string") {
    throw new TypeError("invalid broker routing frame");
  }
  authenticate(value, token, "broker channel");
  if (value.type === "supervisor-command") {
    if (!hasExactKeys(value, BROKER_COMMAND_KEYS) || typeof value.operationId !== "string" || !ID_RE.test(value.operationId)) {
      throw new TypeError("invalid broker supervisor command");
    }
    return value;
  }
  if (value.type === "event") {
    if (!hasExactKeys(value, BROKER_EVENT_KEYS)) throw new TypeError("invalid broker event");
    return { ...value, event: validateStreamEvent(value.event) };
  }
  if (
    value.type !== "response" ||
    !hasExactKeys(value, BROKER_RESPONSE_KEYS) ||
    typeof value.operationId !== "string" ||
    !ID_RE.test(value.operationId) ||
    typeof value.ok !== "boolean" ||
    (value.ok ? value.code !== null : typeof value.code !== "string") ||
    (value.ok ? value.result === null : value.result !== null)
  ) {
    throw new TypeError("invalid broker response");
  }
  return value;
}

function validateSupervisorWarning(value) {
  if (
    !hasExactKeys(value, SUPERVISOR_WARNING_KEYS) ||
    typeof value.code !== "string" ||
    typeof value.requestId !== "string" ||
    !ID_RE.test(value.requestId) ||
    typeof value.pluginId !== "string" ||
    !PLUGIN_ID_RE.test(value.pluginId) ||
    typeof value.errorCode !== "string"
  ) {
    throw new TypeError("invalid supervisor warning event");
  }
  return value;
}

function validateSupervisorFrame(value) {
  if (isPlainRecord(value) && (value.type === "stream" || value.type === "terminal")) {
    return validateStreamEvent(value);
  }
  if (isPlainRecord(value) && value.v === VERSION && value.type === "warning") {
    return validateSupervisorWarning(value);
  }
  if (!isPlainRecord(value) || value.v !== VERSION || typeof value.commandId !== "string" || !ID_RE.test(value.commandId)) {
    throw new TypeError("invalid supervisor routing frame");
  }
  if (value.type === "result" && hasExactKeys(value, SUPERVISOR_RESULT_KEYS)) return value;
  if (value.type === "error" && hasExactKeys(value, SUPERVISOR_ERROR_KEYS) && typeof value.code === "string") return value;
  throw new TypeError("invalid supervisor routing frame");
}

function commandMatchesRequest(command, request) {
  if (!isPlainRecord(command)) return false;
  const expectedKeys = request.action === "launch"
    ? ["type", "commandId", "requestId", "pluginId", "deadlineMs"]
    : request.action === "write"
      ? ["type", "commandId", "requestId", "pluginId", "seq", "dataBase64"]
      : ["type", "commandId", "requestId", "pluginId"];
  return (
    hasExactKeys(command, expectedKeys) &&
    command.type === request.action &&
    command.commandId === request.operationId &&
    command.requestId === request.requestId &&
    command.pluginId === request.pluginId &&
    (request.action !== "launch" || command.deadlineMs === request.deadlineMs) &&
    (request.action !== "write" || (command.seq === request.seq && command.dataBase64 === request.dataBase64))
  );
}

function validateBrokerSuccess(result, request) {
  if (!isPlainRecord(result) || typeof result.status !== "string") {
    throw new Error("broker returned an invalid lifecycle result");
  }
  if (result.status === "running") {
    if (
      (request.action !== "launch" && request.action !== "status") ||
      result.requestId !== request.requestId ||
      result.pluginId !== request.pluginId
    ) {
      throw new Error("broker lifecycle result does not match admitted request");
    }
    return result;
  }
  if (result.status === "terminal") {
    const receipt = result.receipt;
    if (
      !isPlainRecord(receipt) ||
      receipt.requestId !== request.requestId ||
      receipt.pluginId !== request.pluginId ||
      receipt.confirmedAbsent !== true
    ) {
      throw new Error("gateway success requires daemon-confirmed absence");
    }
    return result;
  }
  if (
    result.status === "acknowledged" &&
    request.action === "acknowledge" &&
    result.requestId === request.requestId &&
    result.pluginId === request.pluginId
  ) {
    return result;
  }
  if (
    result.status === "input-written" &&
    request.action === "write" &&
    result.requestId === request.requestId &&
    result.pluginId === request.pluginId &&
    result.seq === request.seq
  ) {
    return result;
  }
  if (
    result.status === "input-closed" &&
    request.action === "close-input" &&
    result.requestId === request.requestId &&
    result.pluginId === request.pluginId
  ) {
    return result;
  }
  throw new Error("broker lifecycle result does not match admitted request");
}

export function createBrokerGatewayRouter(options) {
  if (options === null || typeof options !== "object") throw new TypeError("gateway router options are required");
  const { brokerToken, supervisorToken, writeBroker, writeSupervisor, clock, timers, emitEvent = () => {} } = options;
  if (!TOKEN_RE.test(brokerToken) || !TOKEN_RE.test(supervisorToken) || brokerToken === supervisorToken) {
    throw new TypeError("gateway child-channel tokens must be distinct digests");
  }
  if (typeof writeBroker !== "function" || typeof writeSupervisor !== "function") {
    throw new TypeError("gateway child transports are required");
  }
  if (typeof emitEvent !== "function") throw new TypeError("gateway event sink is required");
  if (typeof clock?.now !== "function" || typeof timers?.set !== "function" || typeof timers?.clear !== "function") {
    throw new TypeError("gateway timing ports are required");
  }

  const pending = new Map();
  const allocations = new Map();
  let brokerError;
  let supervisorError;

  function settle(entry, operation) {
    if (entry.settled) return;
    entry.settled = true;
    timers.clear(entry.timer);
    pending.delete(entry.request.operationId);
    operation();
  }

  function failAll(error) {
    for (const entry of [...pending.values()]) settle(entry, () => entry.reject(error));
  }

  function request(input) {
    let value;
    try {
      value = validateRequest(input);
    } catch (error) {
      return Promise.reject(error);
    }
    if (brokerError !== undefined) return Promise.reject(brokerError);
    if (supervisorError !== undefined) return Promise.reject(supervisorError);
    if (pending.has(value.operationId)) return Promise.reject(new Error("duplicate gateway operation ID"));
    const delayMs = value.deadlineMs - clock.now();
    if (delayMs <= 0) return Promise.reject(new Error("gateway request deadline exceeded"));

    return new Promise((resolvePromise, reject) => {
      const entry = {
        request: value,
        resolve: resolvePromise,
        reject,
        settled: false,
        supervisorSent: false,
        supervisorResultBytes: undefined,
        timer: undefined,
      };
      entry.timer = timers.set(
        () => settle(entry, () => reject(new Error("gateway request deadline exceeded"))),
        delayMs,
      );
      pending.set(value.operationId, entry);
      let write;
      try {
        write = writeBroker({ v: VERSION, type: "request", token: brokerToken, ...value });
      } catch (error) {
        settle(entry, () => reject(error instanceof Error ? error : new Error("broker transport write failed")));
        return;
      }
      Promise.resolve(write).catch((error) => {
        settle(entry, () => reject(error instanceof Error ? error : new Error("broker transport write failed")));
      });
    });
  }

  async function receiveBroker(input) {
    const frame = validateBrokerFrame(input, brokerToken);
    if (frame.type === "event") {
      const identity = frame.event.type === "terminal" ? frame.event.receipt : frame.event;
      const pluginId = allocations.get(identity.requestId);
      if (pluginId === undefined || pluginId !== identity.pluginId) {
        throw new Error("broker event does not match an active allocation");
      }
      await emitEvent(frame.event);
      return;
    }
    const entry = pending.get(frame.operationId);
    if (entry === undefined || entry.settled) return;
    if (frame.type === "supervisor-command") {
      if (entry.supervisorSent || !commandMatchesRequest(frame.command, entry.request)) {
        throw new Error("broker supervisor command does not match admitted request");
      }
      entry.supervisorSent = true;
      if (entry.request.action === "launch") allocations.set(entry.request.requestId, entry.request.pluginId);
      await writeSupervisor({ v: VERSION, token: supervisorToken, ...frame.command });
      return;
    }
    if (!frame.ok) {
      settle(entry, () => entry.reject(new Error(`broker request failed: ${frame.code}`)));
      return;
    }
    settle(entry, () => {
      try {
        if (
          entry.supervisorResultBytes === undefined ||
          JSON.stringify(frame.result) !== entry.supervisorResultBytes
        ) {
          throw new Error("broker success does not match supervisor result");
        }
        entry.resolve(validateBrokerSuccess(frame.result, entry.request));
        if (entry.request.action === "acknowledge") allocations.delete(entry.request.requestId);
      } catch (error) {
        entry.reject(error);
      }
    });
  }

  async function receiveSupervisor(input) {
    const frame = validateSupervisorFrame(input);
    if (frame.type === "warning") return;
    if (frame.type === "stream" || frame.type === "terminal") {
      const identity = frame.type === "terminal" ? frame.receipt : frame;
      const pluginId = allocations.get(identity.requestId);
      if (pluginId === undefined || pluginId !== identity.pluginId) {
        throw new Error("supervisor event does not match an active allocation");
      }
      await writeBroker({ v: VERSION, type: "supervisor-event", token: brokerToken, event: frame });
      return;
    }
    const entry = pending.get(frame.commandId);
    if (entry === undefined || entry.settled || !entry.supervisorSent) return;
    if (frame.type === "result") entry.supervisorResultBytes = JSON.stringify(frame.result);
    await writeBroker({
      v: VERSION,
      type: "supervisor-result",
      token: brokerToken,
      operationId: frame.commandId,
      ok: frame.type === "result",
      result: frame.type === "result" ? frame.result : null,
      code: frame.type === "error" ? frame.code : null,
    });
  }

  return Object.freeze({
    request,
    receiveBroker,
    receiveSupervisor,
    brokerClosed(error = new Error("broker transport closed")) {
      if (brokerError !== undefined) return;
      brokerError = error instanceof Error ? error : new Error("broker transport closed");
      failAll(brokerError);
    },
    supervisorClosed(error = new Error("supervisor transport closed")) {
      if (supervisorError !== undefined) return;
      supervisorError = error instanceof Error ? error : new Error("supervisor transport closed");
      failAll(supervisorError);
    },
    close(error = new Error("gateway transport closed")) {
      const closeError = error instanceof Error ? error : new Error("gateway transport closed");
      if (brokerError === undefined) brokerError = closeError;
      if (supervisorError === undefined) supervisorError = closeError;
      failAll(closeError);
    },
  });
}

export function parseGatewayStartupConfig(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_FRAME_BYTES) {
    throw new TypeError("invalid gateway startup configuration");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError("invalid gateway startup configuration");
  }
  if (
    text !== JSON.stringify(value) ||
    !hasExactKeys(value, STARTUP_KEYS) ||
    value.v !== VERSION ||
    typeof value.token !== "string" ||
    !TOKEN_RE.test(value.token)
  ) {
    throw new TypeError("invalid gateway startup configuration");
  }
  parseSupervisorStartupConfig(text);
  return Object.freeze({
    token: value.token,
    plugins: Object.freeze(value.plugins.map((plugin) => Object.freeze({
      pluginId: plugin.pluginId,
      imageDigest: plugin.imageDigest,
      createArgs: Object.freeze([...plugin.createArgs]),
    }))),
  });
}

function writeStartup(child, value) {
  const descriptor = child?.stdio?.[3];
  if (typeof descriptor?.end !== "function") throw new Error("gateway child startup descriptor is unavailable");
  descriptor.end(JSON.stringify(value));
}

function isSpawnShapedCreateArgs(createArgs) {
  return (
    Array.isArray(createArgs) &&
    createArgs.length === 2 &&
    createArgs[0] === SPAWN_LAUNCH_ARGS_VERSION
  );
}

export function spawnGatewayChildren(options) {
  const {
    brokerToken,
    supervisorToken,
    plugins,
    spawnProcess = spawn,
    executable = process.execPath,
    supervisorPath: supervisorPathOverride,
  } = options;
  if (!TOKEN_RE.test(brokerToken) || !TOKEN_RE.test(supervisorToken) || brokerToken === supervisorToken) {
    throw new TypeError("gateway child tokens must be distinct digests");
  }
  const supervisorStartup = { v: VERSION, token: supervisorToken, plugins };
  parseSupervisorStartupConfig(JSON.stringify(supervisorStartup));
  const gatewayDirectory = dirname(fileURLToPath(import.meta.url));
  const defaultSupervisorPath = resolve(gatewayDirectory, "..", "plugin-container-supervisor.mjs");
  const spawnSupervisorPath = resolve(gatewayDirectory, "..", "plugin-spawn-supervisor.mjs");
  const supervisorPath = supervisorPathOverride === undefined
    ? defaultSupervisorPath
    : resolve(supervisorPathOverride);
  const isSpawnSupervisor = supervisorPath === spawnSupervisorPath;
  for (const plugin of plugins) {
    const spawnShaped = isSpawnShapedCreateArgs(plugin.createArgs);
    if (isSpawnSupervisor && !spawnShaped) {
      throw new TypeError(
        `plugin "${plugin.pluginId}" launch spec is not spawn-shaped but is being routed to the spawn supervisor module`,
      );
    }
    if (!isSpawnSupervisor && spawnShaped) {
      throw new TypeError(
        `plugin "${plugin.pluginId}" launch spec is spawn-shaped but is being routed to a non-spawn supervisor module`,
      );
    }
  }
  const brokerPath = resolve(gatewayDirectory, "..", "plugin-container-broker.mjs");
  const childOptions = { stdio: ["pipe", "pipe", "inherit", "pipe"] };
  let supervisor;
  let broker;
  try {
    supervisor = spawnProcess(executable, [supervisorPath], childOptions);
    writeStartup(supervisor, supervisorStartup);
    broker = spawnProcess(executable, [brokerPath], childOptions);
    writeStartup(broker, { v: VERSION, token: brokerToken });
    return Object.freeze({ supervisor, broker });
  } catch (error) {
    broker?.stdin?.end();
    broker?.kill?.("SIGKILL");
    supervisor?.stdin?.end();
    supervisor?.kill?.("SIGKILL");
    throw error;
  }
}

function systemTimers() {
  return Object.freeze({
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle),
  });
}

async function writeFrame(output, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await new Promise((resolvePromise, reject) => {
    output.write(bytes, (error) => {
      if (error) reject(error);
      else resolvePromise();
    });
  });
}

function appendBytes(left, right) {
  const combined = Buffer.alloc(left.byteLength + right.byteLength);
  Buffer.from(left).copy(combined, 0);
  Buffer.from(right).copy(combined, left.byteLength);
  return combined;
}

async function readFrames(input, onFrame) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError("gateway transport must contain bytes");
    if (buffer.byteLength + chunk.byteLength > MAX_CUMULATIVE_BYTES) {
      throw new Error("gateway channel buffer limit exceeded");
    }
    buffer = appendBytes(buffer, chunk);
    let newline;
    while ((newline = buffer.indexOf(0x0a)) !== -1) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.byteLength === 0 || line.byteLength > MAX_FRAME_BYTES || line[line.byteLength - 1] === 0x0d) {
        throw new Error("invalid gateway frame");
      }
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(line);
      } catch {
        throw new Error("invalid gateway frame UTF-8");
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("malformed gateway frame");
      }
      if (text !== JSON.stringify(raw)) throw new Error("noncanonical gateway frame");
      await onFrame(raw);
    }
    if (buffer.byteLength > MAX_FRAME_BYTES) throw new Error("gateway frame exceeded limit");
  }
  if (buffer.byteLength !== 0) throw new Error("unterminated gateway frame");
}

function parseExternalRequest(value, token) {
  const keys = value?.action === "write" ? EXTERNAL_WRITE_KEYS : EXTERNAL_REQUEST_KEYS;
  if (!hasExactKeys(value, keys) || value.v !== VERSION || value.type !== "request") {
    throw new TypeError("invalid gateway request frame");
  }
  authenticate(value, token, "gateway");
  const request = validateRequest(value);
  const normalized = {
    operationId: request.operationId,
    action: request.action,
    requestId: request.requestId,
    pluginId: request.pluginId,
    deadlineMs: request.deadlineMs,
  };
  if (request.action === "write") {
    normalized.seq = request.seq;
    normalized.dataBase64 = request.dataBase64;
  }
  return Object.freeze(normalized);
}

function waitForChild(child) {
  if (child.exitCode !== null && child.exitCode !== undefined) return Promise.resolve();
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise();
    };
    child.once("close", finish);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, CHILD_SHUTDOWN_MS);
    timer.unref?.();
  });
}

async function shutdownChild(child) {
  child.stdin.end();
  await waitForChild(child);
}

export async function runGatewayProcess({ input, output, token, children, brokerToken, supervisorToken }) {
  let outputQueue = Promise.resolve();
  const writeOutput = (value) => {
    const result = outputQueue.then(() => writeFrame(output, value));
    outputQueue = result.catch(() => undefined);
    return result;
  };
  const router = createBrokerGatewayRouter({
    brokerToken,
    supervisorToken,
    clock: { now: () => Date.now() },
    timers: systemTimers(),
    writeBroker: (frame) => writeFrame(children.broker.stdin, frame),
    writeSupervisor: (frame) => writeFrame(children.supervisor.stdin, frame),
    emitEvent: (event) => writeOutput({ v: VERSION, type: "event", event }),
  });
  children.broker.stdin.on("error", (error) => router.brokerClosed(error));
  children.supervisor.stdin.on("error", (error) => router.supervisorClosed(error));
  children.broker.on("error", (error) => router.brokerClosed(error));
  children.supervisor.on("error", (error) => router.supervisorClosed(error));

  const brokerReader = readFrames(children.broker.stdout, (frame) => router.receiveBroker(frame))
    .catch((error) => router.brokerClosed(error))
    .finally(() => router.brokerClosed(new Error("broker transport closed")));
  const supervisorReader = readFrames(children.supervisor.stdout, (frame) => router.receiveSupervisor(frame))
    .catch((error) => router.supervisorClosed(error))
    .finally(() => router.supervisorClosed(new Error("supervisor transport closed")));

  try {
    await readFrames(input, async (frame) => {
      const request = parseExternalRequest(frame, token);
      void router.request(request).then(
        (result) => writeOutput({ v: VERSION, type: "response", operationId: request.operationId, ok: true, result, code: null }),
        (error) =>
          writeOutput({
            v: VERSION,
            type: "response",
            operationId: request.operationId,
            ok: false,
            result: null,
            code: error instanceof Error && /deadline/.test(error.message) ? "deadline" : "request-failed",
          }),
      ).catch(() => undefined);
    });
  } finally {
    router.close(new Error("gateway transport closed"));
    await shutdownChild(children.broker);
    await shutdownChild(children.supervisor);
    await Promise.allSettled([brokerReader, supervisorReader]);
    await outputQueue;
  }
}

async function main() {
  const startup = parseGatewayStartupConfig(readFileSync(3, "utf8"));
  const brokerToken = randomBytes(32).toString("hex");
  const supervisorToken = randomBytes(32).toString("hex");
  const children = spawnGatewayChildren({ brokerToken, supervisorToken, plugins: startup.plugins });
  await runGatewayProcess({
    input: process.stdin,
    output: process.stdout,
    token: startup.token,
    children,
    brokerToken,
    supervisorToken,
  });
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write("broker gateway failed\n");
    process.exitCode = 1;
  });
}
