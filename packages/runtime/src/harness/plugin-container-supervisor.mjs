import { createHash, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_COMMAND_BYTES_PER_ALLOCATION,
  MAX_COMMAND_IDS_PER_ALLOCATION,
  MAX_COMMANDS_PER_EVENT_LOOP_TURN,
  MAX_RECENT_ACKNOWLEDGED_ALLOCATIONS,
  MAX_RECENT_COMMAND_IDS,
  MAX_TRACKED_COMMAND_ALLOCATIONS,
  MAX_WIRE_BUFFER_BYTES,
  MAX_WIRE_FRAME_BYTES,
} from "@useprism/sdk/protocol/resource-bounds";
import { createFaultCell } from "./plugin-fault-cell.mjs";
import { createPluginResourceArbiter } from "./plugin-resource-arbiter.mjs";

export const CLEANUP_GRACE_MS = 2_000;
export const MAX_STREAM_CHUNK_BYTES = 256_000;
export const MAX_CUMULATIVE_STREAM_BYTES = 8_000_000;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const MAX_DOCKER_OUTPUT_BYTES = 1_000_000;
// One cleanup issues up to seven sequential Docker invocations, so shutdown
// reaps cells in batches instead of spawning every chain at once.
const SHUTDOWN_FANOUT_WIDTH = 4;
const STARTUP_KEYS = ["v", "token", "plugins"];
const STARTUP_PLUGIN_KEYS = ["pluginId", "imageDigest", "createArgs"];
const COMMAND_KEYS = {
  launch: ["v", "type", "token", "commandId", "requestId", "pluginId", "deadlineMs"],
  cleanup: ["v", "type", "token", "commandId", "requestId", "pluginId"],
  status: ["v", "type", "token", "commandId", "requestId", "pluginId"],
  acknowledge: ["v", "type", "token", "commandId", "requestId", "pluginId"],
  write: ["v", "type", "token", "commandId", "requestId", "pluginId", "seq", "dataBase64"],
  "close-input": ["v", "type", "token", "commandId", "requestId", "pluginId"],
};
const SUPERVISOR_OWNED_CREATE_FLAGS = ["--name", "--label", "-l", "--cidfile", "--rm"];

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

function containerNameFor(requestId, pluginId) {
  const suffix = createHash("sha256").update(`${requestId}\0${pluginId}`).digest("hex").slice(0, 32);
  return `pnh-plugin-${suffix}`;
}

function validateIdentity(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("invalid allocation identity");
  }
  if (typeof value.requestId !== "string" || !REQUEST_ID_RE.test(value.requestId)) {
    throw new TypeError("invalid request ID");
  }
  if (typeof value.pluginId !== "string" || !PLUGIN_ID_RE.test(value.pluginId)) {
    throw new TypeError("invalid plugin ID");
  }
}

function validateLaunchRequest(value) {
  validateIdentity(value);
  if (typeof value.deadlineMs !== "number" || !Number.isSafeInteger(value.deadlineMs) || value.deadlineMs < 0) {
    throw new TypeError("invalid allocation deadline");
  }
  const hardDeadlineAtMs = value.deadlineMs + CLEANUP_GRACE_MS;
  if (!Number.isSafeInteger(hardDeadlineAtMs)) throw new TypeError("invalid hard deadline");
  return hardDeadlineAtMs;
}

function validateLaunchSpec(value) {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("plugin has no admitted launch specification");
  }
  if (typeof value.imageDigest !== "string" || !DIGEST_RE.test(value.imageDigest)) {
    throw new TypeError("invalid admitted image digest");
  }
  if (
    !Array.isArray(value.createArgs) ||
    value.createArgs.length === 0 ||
    value.createArgs.some((argument) => typeof argument !== "string" || argument.length === 0 || argument.includes("\0"))
  ) {
    throw new TypeError("invalid admitted Docker create arguments");
  }
  if (value.createArgs.some((argument) => SUPERVISOR_OWNED_CREATE_FLAGS.some(
    (flag) => argument === flag || argument.startsWith(`${flag}=`),
  ))) {
    throw new TypeError("admitted Docker arguments override supervisor custody");
  }
  return Object.freeze({ imageDigest: value.imageDigest, createArgs: Object.freeze([...value.createArgs]) });
}

function sameIdentity(state, identity) {
  return state.requestId === identity.requestId && state.pluginId === identity.pluginId;
}

function assertIdentity(state, identity) {
  if (!sameIdentity(state, identity)) throw new Error("allocation identity conflict");
}

function acknowledgedResult(requestId, pluginId) {
  return Object.freeze({ status: "acknowledged", requestId, pluginId });
}

function runningResult(state) {
  return Object.freeze({
    status: "running",
    requestId: state.requestId,
    pluginId: state.pluginId,
    containerId: state.containerId,
    hardDeadlineAtMs: state.hardDeadlineAtMs,
  });
}

function terminalResult(state) {
  return Object.freeze({ status: "terminal", receipt: state.receipt });
}

function observationMatches(state, observation) {
  return (
    observation.requestId === state.requestId &&
    observation.pluginId === state.pluginId &&
    observation.imageDigest === state.launchSpec.imageDigest
  );
}

export function createPluginContainerSupervisor(options) {
  if (options === null || typeof options !== "object") throw new TypeError("supervisor options are required");
  const {
    docker,
    clock,
    timers,
    resolveLaunchSpec,
    emitEvent = () => {},
    resourceArbiter = createPluginResourceArbiter(),
  } = options;
  if (docker === null || typeof docker !== "object") throw new TypeError("Docker lifecycle port is required");
  for (const method of ["create", "startAttached", "inspect", "stop", "kill", "remove"]) {
    if (typeof docker[method] !== "function") throw new TypeError(`Docker lifecycle port is missing ${method}`);
  }
  if (clock === null || typeof clock?.now !== "function") throw new TypeError("supervisor clock is required");
  if (timers === null || typeof timers?.set !== "function" || typeof timers?.clear !== "function") {
    throw new TypeError("supervisor timers are required");
  }
  if (typeof resolveLaunchSpec !== "function") throw new TypeError("launch specification resolver is required");
  if (typeof emitEvent !== "function") throw new TypeError("supervisor event sink must be a function");
  if (typeof resourceArbiter?.reserveAllocation !== "function" || typeof resourceArbiter?.runDocker !== "function") {
    throw new TypeError("plugin resource arbiter is required");
  }

  const allocations = new Map();
  const acknowledged = new Map();
  const cells = new Map();
  const allocationLeases = new Map();

  const boundedDocker = Object.freeze(Object.fromEntries(
    ["create", "startAttached", "inspect", "stop", "kill", "remove"].map((method) => [
      method,
      (...args) => resourceArbiter.runDocker(() => docker[method](...args)),
    ]),
  ));

  function runOnCell(request, operation) {
    const cell = request === null || typeof request !== "object" ? undefined : cells.get(request.requestId);
    // Every live allocation owns a cell, so a missing cell means the operation
    // is about to fail with the same unknown-allocation error it always did.
    if (cell === undefined) return Promise.resolve().then(operation);
    return cell.run(operation);
  }

  function releaseCell(requestId, cell) {
    if (cell === undefined || cells.get(requestId) !== cell) return;
    cells.delete(requestId);
    cell.dispose();
  }

  function releaseAllocationLease(requestId) {
    const lease = allocationLeases.get(requestId);
    if (lease === undefined) return;
    allocationLeases.delete(requestId);
    lease.release();
  }

  function publishEvent(event) {
    try {
      void Promise.resolve(emitEvent(Object.freeze(event))).catch(() => undefined);
    } catch {
      // Command transport failure closes the owning process independently.
    }
  }

  function acknowledgedFor(identity) {
    const pluginId = acknowledged.get(identity.requestId);
    if (pluginId === undefined) return undefined;
    if (pluginId !== identity.pluginId) throw new Error("allocation identity conflict");
    return acknowledgedResult(identity.requestId, identity.pluginId);
  }

  async function inspect(state, containerRef, cleanupErrors) {
    try {
      const observation = await boundedDocker.inspect(containerRef);
      if (observation !== null && !observationMatches(state, observation)) {
        cleanupErrors.push("identity-mismatch");
        return { trusted: false, observation: null };
      }
      return { trusted: true, observation };
    } catch {
      cleanupErrors.push("inspect-failed");
      return { trusted: true, observation: undefined };
    }
  }

  async function lifecycleCall(step, action, cleanupErrors) {
    try {
      await action();
      return true;
    } catch {
      cleanupErrors.push(`${step}-failed`);
      return false;
    }
  }

  async function cleanupInternal(state, trigger, initialErrors = []) {
    if (state.status === "terminal") return terminalResult(state);
    if (state.timer !== undefined) {
      timers.clear(state.timer);
      state.timer = undefined;
    }
    state.status = "cleaning";

    const cleanupErrors = [...initialErrors];
    if (state.stream !== undefined && !state.streamClosed && !state.inputClosed) {
      state.inputClosed = true;
      await lifecycleCall("stdin-close", () => state.stream.closeInput(), cleanupErrors);
    }
    let lastObservation;
    const initial = await inspect(state, state.containerId ?? state.containerName, cleanupErrors);
    if (!initial.trusted) {
      return settle(state, trigger, lastObservation, false, cleanupErrors);
    }
    if (initial.observation === null) {
      return settle(state, trigger, lastObservation, true, cleanupErrors);
    }
    if (initial.observation !== undefined) {
      lastObservation = initial.observation;
      state.containerId = initial.observation.containerId;
    }

    const containerId = state.containerId;
    if (containerId === null) {
      cleanupErrors.push("container-id-missing");
      return settle(state, trigger, lastObservation, false, cleanupErrors);
    }

    let stopped = true;
    let afterStop = initial;
    if (initial.observation === undefined || initial.observation.running) {
      stopped = await lifecycleCall("stop", () => boundedDocker.stop(containerId), cleanupErrors);
      afterStop = await inspect(state, containerId, cleanupErrors);
      if (!afterStop.trusted) return settle(state, trigger, lastObservation, false, cleanupErrors);
      if (afterStop.observation !== undefined && afterStop.observation !== null) {
        lastObservation = afterStop.observation;
      }
    }

    if (!stopped || afterStop.observation === undefined || afterStop.observation?.running === true) {
      await lifecycleCall("kill", () => boundedDocker.kill(containerId), cleanupErrors);
      const afterKill = await inspect(state, containerId, cleanupErrors);
      if (!afterKill.trusted) return settle(state, trigger, lastObservation, false, cleanupErrors);
      if (afterKill.observation !== undefined && afterKill.observation !== null) {
        lastObservation = afterKill.observation;
      }
    }

    await lifecycleCall("remove", () => boundedDocker.remove(containerId), cleanupErrors);
    const afterRemove = await inspect(state, containerId, cleanupErrors);
    if (!afterRemove.trusted) return settle(state, trigger, lastObservation, false, cleanupErrors);
    if (afterRemove.observation !== undefined && afterRemove.observation !== null) {
      lastObservation = afterRemove.observation;
    }
    return settle(state, trigger, lastObservation, afterRemove.observation === null, cleanupErrors);
  }

  function settle(state, trigger, observation, confirmedAbsent, cleanupErrors) {
    const receipt = Object.freeze({
      v: 1,
      requestId: state.requestId,
      pluginId: state.pluginId,
      containerId: state.containerId,
      trigger,
      hardDeadlineAtMs: state.hardDeadlineAtMs,
      daemonState: observation?.state ?? "absent",
      exitCode: observation?.exitCode ?? null,
      oomKilled: observation?.oomKilled ?? null,
      confirmedAbsent,
      cleanupErrors: Object.freeze([...cleanupErrors]),
      settledAtMs: clock.now(),
    });
    state.status = "terminal";
    state.receipt = receipt;
    publishEvent({ v: 1, type: "terminal", receipt });
    return terminalResult(state);
  }

  function handleStreamBytes(state, channel, bytes) {
    const cell = cells.get(state.requestId);
    if (cell === undefined) return;
    void cell.run(async () => {
      if (state.status === "terminal" || state.status === "cleaning") return;
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_STREAM_CHUNK_BYTES) {
        await cleanupInternal(state, "stream-overflow");
        return;
      }
      state.outputBytes += bytes.byteLength;
      if (state.outputBytes > MAX_CUMULATIVE_STREAM_BYTES) {
        await cleanupInternal(state, "stream-overflow");
        return;
      }
      state.outputSeq += 1;
      publishEvent({
        v: 1,
        type: "stream",
        requestId: state.requestId,
        pluginId: state.pluginId,
        channel,
        seq: state.outputSeq,
        dataBase64: Buffer.from(bytes).toString("base64"),
      });
    }).catch(() => undefined);
  }

  async function launchInternal(request) {
    const hardDeadlineAtMs = validateLaunchRequest(request);
    const tombstone = acknowledgedFor(request);
    if (tombstone !== undefined) return tombstone;

    const existing = allocations.get(request.requestId);
    if (existing !== undefined) {
      assertIdentity(existing, request);
      if (existing.status === "terminal") return terminalResult(existing);
      return runningResult(existing);
    }

    const launchSpec = validateLaunchSpec(resolveLaunchSpec(request.pluginId));
    const state = {
      requestId: request.requestId,
      pluginId: request.pluginId,
      containerName: containerNameFor(request.requestId, request.pluginId),
      containerId: null,
      hardDeadlineAtMs,
      launchSpec,
      status: "launching",
      timer: undefined,
      receipt: undefined,
      stream: undefined,
      streamClosed: false,
      inputClosed: false,
      inputBytes: 0,
      inputSeq: 0,
      outputBytes: 0,
      outputSeq: 0,
    };
    allocations.set(request.requestId, state);
    state.timer = timers.set(() => {
      void cleanup({ ...request, trigger: "deadline" }).catch(() => {});
    }, Math.max(0, hardDeadlineAtMs - clock.now()));

    const launchErrors = [];
    try {
      const beforeCreate = await inspect(state, state.containerName, launchErrors);
      if (!beforeCreate.trusted) return settle(state, "launch-failed", undefined, false, launchErrors);
      if (beforeCreate.observation !== null && beforeCreate.observation !== undefined) {
        state.containerId = beforeCreate.observation.containerId;
      } else {
        state.containerId = await boundedDocker.create({
          containerName: state.containerName,
          requestId: state.requestId,
          pluginId: state.pluginId,
          imageDigest: launchSpec.imageDigest,
          createArgs: launchSpec.createArgs,
        });
      }

      const afterCreate = await inspect(state, state.containerId, launchErrors);
      if (!afterCreate.trusted || afterCreate.observation === null || afterCreate.observation === undefined) {
        launchErrors.push("post-create-inspect-failed");
        return cleanupInternal(state, "launch-failed", launchErrors);
      }
      state.containerId = afterCreate.observation.containerId;
      if (afterCreate.observation.running) {
        launchErrors.push("preexisting-running-container");
        return cleanupInternal(state, "launch-failed", launchErrors);
      }
      state.stream = await boundedDocker.startAttached(state.containerId, {
        onStdout: (bytes) => handleStreamBytes(state, "stdout", bytes),
        onStderr: (bytes) => handleStreamBytes(state, "stderr", bytes),
        onClose: () => {
          state.streamClosed = true;
          void cleanup({ ...request, trigger: "process-exit" }).catch(() => undefined);
        },
      });
      state.status = "running";
      return runningResult(state);
    } catch {
      launchErrors.push("launch-failed");
      return cleanupInternal(state, "launch-failed", launchErrors);
    }
  }

  async function cleanupInternalCommand(request) {
    validateIdentity(request);
    if (!["broker-stop", "deadline", "launch-failed", "supervisor-shutdown", "process-exit", "stream-overflow"].includes(request.trigger)) {
      throw new TypeError("invalid cleanup trigger");
    }
    const tombstone = acknowledgedFor(request);
    if (tombstone !== undefined) return tombstone;
    const state = allocations.get(request.requestId);
    if (state === undefined) throw new Error("unknown allocation");
    assertIdentity(state, request);
    return cleanupInternal(state, request.trigger);
  }

  const cleanup = (request) => runOnCell(request, () => cleanupInternalCommand(request));

  async function shutdownAllocation(requestId) {
    const state = allocations.get(requestId);
    if (state === undefined) return undefined;
    if (state.status === "terminal") return state.receipt;
    const result = await cleanupInternal(state, "supervisor-shutdown");
    return result.status === "terminal" ? result.receipt : undefined;
  }

  function activeState(request) {
    validateIdentity(request);
    const state = allocations.get(request.requestId);
    if (state === undefined) throw new Error("unknown allocation");
    assertIdentity(state, request);
    if (state.status !== "running" || state.stream === undefined) throw new Error("allocation is not running");
    return state;
  }

  return Object.freeze({
    launch(request) {
      let cell;
      let created = false;
      try {
        validateLaunchRequest(request);
        const tombstone = acknowledgedFor(request);
        if (tombstone !== undefined) return Promise.resolve(tombstone);
        cell = cells.get(request.requestId);
        if (cell === undefined) {
          const lease = resourceArbiter.reserveAllocation(request);
          try {
            cell = createFaultCell(request);
            allocationLeases.set(request.requestId, lease);
            cells.set(request.requestId, cell);
            created = true;
          } catch (error) {
            lease.release();
            throw error;
          }
        }
      } catch (error) {
        return Promise.reject(error);
      }
      const result = cell.run(() => launchInternal(request));
      if (created) {
        const owned = cell;
        // A launch that never reaches `allocations` (unadmitted plugin,
        // rejected launch specification) owns the only reference to its cell.
        const release = async () => {
          await owned.flush();
          if (!allocations.has(request.requestId)) {
            releaseCell(request.requestId, owned);
            releaseAllocationLease(request.requestId);
          }
        };
        void result.then(release, release);
      }
      return result;
    },
    cleanup,
    writeInput(request) {
      return runOnCell(request, async () => {
        const state = activeState(request);
        if (state.inputClosed) throw new Error("plugin input is closed");
        if (typeof request.seq !== "number" || !Number.isSafeInteger(request.seq) || request.seq !== state.inputSeq + 1) {
          throw new Error("invalid plugin input sequence");
        }
        if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_STREAM_CHUNK_BYTES) {
          throw new Error("invalid plugin input chunk");
        }
        const nextBytes = state.inputBytes + request.bytes.byteLength;
        if (nextBytes > MAX_CUMULATIVE_STREAM_BYTES) throw new Error("plugin input byte limit exceeded");
        await state.stream.write(request.bytes);
        state.inputBytes = nextBytes;
        state.inputSeq = request.seq;
        return Object.freeze({
          status: "input-written",
          requestId: state.requestId,
          pluginId: state.pluginId,
          seq: state.inputSeq,
        });
      });
    },
    closeInput(request) {
      return runOnCell(request, async () => {
        const state = activeState(request);
        if (!state.inputClosed) {
          state.inputClosed = true;
          await state.stream.closeInput();
        }
        return Object.freeze({ status: "input-closed", requestId: state.requestId, pluginId: state.pluginId });
      });
    },
    status(request) {
      return runOnCell(request, () => {
        validateIdentity(request);
        const tombstone = acknowledgedFor(request);
        if (tombstone !== undefined) return tombstone;
        const state = allocations.get(request.requestId);
        if (state === undefined) throw new Error("unknown allocation");
        assertIdentity(state, request);
        if (state.status === "terminal") return terminalResult(state);
        return runningResult(state);
      });
    },
    acknowledge(request) {
      return runOnCell(request, () => {
        validateIdentity(request);
        const tombstone = acknowledgedFor(request);
        if (tombstone !== undefined) return tombstone;
        const state = allocations.get(request.requestId);
        if (state === undefined) throw new Error("unknown allocation");
        assertIdentity(state, request);
        if (state.status !== "terminal") throw new Error("allocation is not terminal");
        allocations.delete(request.requestId);
        acknowledged.set(request.requestId, request.pluginId);
        while (acknowledged.size > MAX_RECENT_ACKNOWLEDGED_ALLOCATIONS) {
          acknowledged.delete(acknowledged.keys().next().value);
        }
        releaseCell(request.requestId, cells.get(request.requestId));
        releaseAllocationLease(request.requestId);
        return acknowledgedResult(request.requestId, request.pluginId);
      });
    },
    shutdown() {
      return (async () => {
        // Snapshot the cells, not the allocations: a launch enqueued the
        // instant SIGTERM arrives has not written its allocation yet, and its
        // cell's shutdown operation lands behind that launch on the same FIFO.
        const snapshot = [...cells];
        const receipts = [];
        let accounted = 0;
        for (let start = 0; start < snapshot.length; start += SHUTDOWN_FANOUT_WIDTH) {
          const batch = snapshot.slice(start, start + SHUTDOWN_FANOUT_WIDTH);
          const settlements = await Promise.allSettled(batch.map(([requestId, cell]) => (
            // A cell released since the snapshot has no allocation left to reap.
            cells.get(requestId) === cell ? cell.run(() => shutdownAllocation(requestId)) : undefined
          )));
          for (const settlement of settlements) {
            // Promise.allSettled never rejects, so a rejected cleanup would drop
            // out of the receipt list and main()'s confirmedAbsent check would
            // read a short list as a clean shutdown.
            if (settlement.status === "rejected") throw settlement.reason;
            accounted += 1;
            if (settlement.value !== undefined) receipts.push(settlement.value);
          }
        }
        if (accounted !== snapshot.length) throw new Error("supervisor shutdown left a fault cell unreaped");
        return Object.freeze(receipts);
      })();
    },
    idle() {
      return Promise.allSettled([...cells.values()].map((cell) => cell.flush())).then(() => undefined);
    },
  });
}

function defaultRunDocker(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failed = false;
    const collect = (target, chunk, kind) => {
      if (failed) return;
      const nextBytes = kind === "stdout" ? stdoutBytes + chunk.byteLength : stderrBytes + chunk.byteLength;
      if (nextBytes > MAX_DOCKER_OUTPUT_BYTES) {
        failed = true;
        child.kill("SIGKILL");
        reject(new Error("Docker command output exceeded limit"));
        return;
      }
      if (kind === "stdout") stdoutBytes = nextBytes;
      else stderrBytes = nextBytes;
      target.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, "stderr"));
    child.once("error", reject);
    child.once("close", (status) => {
      if (failed) return;
      resolvePromise({
        status: status ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function defaultSpawnAttached(args, handlers) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  };
  child.stdout.on("data", (chunk) => handlers.onStdout(chunk));
  child.stderr.on("data", (chunk) => handlers.onStderr(chunk));
  child.once("error", close);
  child.once("close", close);
  child.stdin.on("error", () => undefined);
  return Object.freeze({
    write(bytes) {
      return new Promise((resolvePromise, reject) => {
        child.stdin.write(bytes, (error) => {
          if (error) reject(error);
          else resolvePromise();
        });
      });
    },
    closeInput() {
      return new Promise((resolvePromise) => child.stdin.end(resolvePromise));
    },
  });
}

function normalizeImageDigest(value) {
  return typeof value === "string" ? value.replace(/^sha256:/, "") : "";
}

export function createDockerCliLifecyclePort(options = {}) {
  const runDocker = options.runDocker ?? defaultRunDocker;
  const spawnAttached = options.spawnAttached ?? defaultSpawnAttached;
  if (typeof runDocker !== "function") throw new TypeError("runDocker must be a function");
  if (typeof spawnAttached !== "function") throw new TypeError("spawnAttached must be a function");

  async function required(args, operation) {
    const result = await runDocker(args);
    if (result.status !== 0) throw new Error(`Docker ${operation} failed`);
    return result;
  }

  return Object.freeze({
    async create(input) {
      const result = await required([
        "create",
        "--name",
        input.containerName,
        "--label",
        `org.pnh.request-id=${input.requestId}`,
        "--label",
        `org.pnh.plugin-id=${input.pluginId}`,
        ...input.createArgs,
      ], "create");
      const containerId = result.stdout.trim();
      if (containerId.length === 0) throw new Error("Docker create returned no container ID");
      return containerId;
    },
    async startAttached(containerId, handlers) {
      if (
        handlers === null ||
        typeof handlers !== "object" ||
        typeof handlers.onStdout !== "function" ||
        typeof handlers.onStderr !== "function" ||
        typeof handlers.onClose !== "function"
      ) {
        throw new TypeError("attached Docker handlers are required");
      }
      const stream = await spawnAttached(["start", "-a", "-i", containerId], handlers);
      if (typeof stream?.write !== "function" || typeof stream?.closeInput !== "function") {
        throw new Error("Docker attached stream is invalid");
      }
      return stream;
    },
    async inspect(containerRef) {
      const result = await runDocker(["inspect", containerRef]);
      if (result.status !== 0) {
        if (/no such (?:object|container)/i.test(result.stderr)) return null;
        throw new Error("Docker inspect failed");
      }
      let raw;
      try {
        raw = JSON.parse(result.stdout);
      } catch {
        throw new Error("Docker inspect returned malformed JSON");
      }
      const value = Array.isArray(raw) ? raw[0] : undefined;
      const labels = value?.Config?.Labels;
      const state = value?.State;
      const imageDigest = normalizeImageDigest(value?.Image);
      if (
        typeof value?.Id !== "string" ||
        labels === null ||
        typeof labels !== "object" ||
        typeof labels["org.pnh.request-id"] !== "string" ||
        typeof labels["org.pnh.plugin-id"] !== "string" ||
        state === null ||
        typeof state !== "object" ||
        typeof state.Status !== "string" ||
        typeof state.Running !== "boolean" ||
        !DIGEST_RE.test(imageDigest)
      ) {
        throw new Error("Docker inspect returned an invalid lifecycle observation");
      }
      return Object.freeze({
        containerId: value.Id,
        requestId: labels["org.pnh.request-id"],
        pluginId: labels["org.pnh.plugin-id"],
        imageDigest,
        state: state.Status,
        running: state.Running,
        exitCode: Number.isSafeInteger(state.ExitCode) ? state.ExitCode : null,
        oomKilled: typeof state.OOMKilled === "boolean" ? state.OOMKilled : null,
      });
    },
    async stop(containerId) {
      await required(["stop", "--time", "1", containerId], "stop");
    },
    async kill(containerId) {
      await required(["kill", containerId], "kill");
    },
    async remove(containerId) {
      await required(["rm", "-f", containerId], "remove");
    },
  });
}

export function systemClock() {
  return Object.freeze({ now: () => Date.now() });
}

export function systemTimers() {
  return Object.freeze({
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle),
  });
}

export function parseSupervisorStartupConfig(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_WIRE_FRAME_BYTES) {
    throw new TypeError("invalid supervisor startup configuration");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError("invalid supervisor startup configuration");
  }
  if (text !== JSON.stringify(value) || !hasExactKeys(value, STARTUP_KEYS) || value.v !== 1) {
    throw new TypeError("invalid supervisor startup configuration");
  }
  if (typeof value.token !== "string" || !DIGEST_RE.test(value.token) || !Array.isArray(value.plugins)) {
    throw new TypeError("invalid supervisor startup configuration");
  }

  const plugins = new Map();
  for (const entry of value.plugins) {
    if (!hasExactKeys(entry, STARTUP_PLUGIN_KEYS) || typeof entry.pluginId !== "string" || !PLUGIN_ID_RE.test(entry.pluginId)) {
      throw new TypeError("invalid supervisor startup plugin");
    }
    if (plugins.has(entry.pluginId)) throw new TypeError("duplicate supervisor startup plugin");
    plugins.set(entry.pluginId, validateLaunchSpec(entry));
  }
  return Object.freeze({
    token: value.token,
    resolveLaunchSpec(pluginId) {
      return plugins.get(pluginId);
    },
  });
}

function validateCommand(value, token) {
  if (!isPlainRecord(value) || typeof value.type !== "string" || !Object.hasOwn(COMMAND_KEYS, value.type)) {
    throw new TypeError("invalid supervisor command");
  }
  if (!hasExactKeys(value, COMMAND_KEYS[value.type]) || value.v !== 1) {
    throw new TypeError("invalid supervisor command");
  }
  if (typeof value.token !== "string" || value.token.length !== token.length) {
    throw new Error("supervisor authentication failed");
  }
  if (!timingSafeEqual(Buffer.from(value.token), Buffer.from(token))) {
    throw new Error("supervisor authentication failed");
  }
  if (typeof value.commandId !== "string" || !REQUEST_ID_RE.test(value.commandId)) {
    throw new TypeError("invalid supervisor command ID");
  }
  validateIdentity(value);
  if (value.type === "launch") validateLaunchRequest(value);
  if (value.type === "write") {
    if (typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq <= 0) {
      throw new TypeError("invalid supervisor stream sequence");
    }
    if (typeof value.dataBase64 !== "string" || value.dataBase64.length === 0) {
      throw new TypeError("invalid supervisor stream bytes");
    }
    const bytes = Buffer.from(value.dataBase64, "base64");
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_STREAM_CHUNK_BYTES ||
      bytes.toString("base64") !== value.dataBase64
    ) {
      throw new TypeError("invalid supervisor stream bytes");
    }
    value.bytes = bytes;
  }
  return value;
}

async function writeCommandResult(output, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (!output.write(bytes)) await once(output, "drain");
}

function createSerializedFrameWriter(output) {
  let queue = Promise.resolve();
  return Object.freeze({
    write(value) {
      const result = queue.then(() => writeCommandResult(output, value));
      queue = result.catch(() => undefined);
      return result;
    },
    idle() {
      return queue;
    },
  });
}

// Commands dispatch without being awaited by the read loop, so custody of the
// work outlives the line that started it: the loop and main()'s shutdown share
// one registry and both drain it before reporting that nothing is running.
function createInFlightCommands() {
  const pending = new Set();
  let firstFailure;
  return Object.freeze({
    track(task) {
      const tracked = task.then(undefined, (error) => {
        if (firstFailure === undefined) firstFailure = error;
      });
      pending.add(tracked);
      void tracked.then(() => pending.delete(tracked));
    },
    async drain() {
      // A drain racing a still-open input can be handed new work while it
      // waits, so re-check rather than settling one snapshot.
      while (pending.size > 0) await Promise.all([...pending]);
      if (firstFailure !== undefined) throw firstFailure;
    },
  });
}

// A recorded drain failure is permanent, so it must never stand in for the work
// waiting behind the drain: the loop still flushes, and main() still reaps its
// containers, before that failure escapes.
async function drainThen(inFlight, finalize) {
  let drainFailure;
  try {
    await inFlight.drain();
  } catch (error) {
    drainFailure = error;
  }
  try {
    await finalize();
  } catch (error) {
    if (drainFailure === undefined) throw error;
    throw new AggregateError([drainFailure, error], "supervisor drain and shutdown failed");
  }
  if (drainFailure !== undefined) throw drainFailure;
}

async function dispatchCommand(supervisor, command) {
  if (command.type === "launch") return supervisor.launch(command);
  if (command.type === "cleanup") {
    return supervisor.cleanup({ requestId: command.requestId, pluginId: command.pluginId, trigger: "broker-stop" });
  }
  if (command.type === "status") return supervisor.status(command);
  if (command.type === "write") {
    return supervisor.writeInput({
      requestId: command.requestId,
      pluginId: command.pluginId,
      seq: command.seq,
      bytes: command.bytes,
    });
  }
  if (command.type === "close-input") return supervisor.closeInput(command);
  return supervisor.acknowledge(command);
}

function appendBytes(left, right) {
  const combined = Buffer.alloc(left.byteLength + right.byteLength);
  Buffer.from(left).copy(combined, 0);
  Buffer.from(right).copy(combined, left.byteLength);
  return combined;
}

export async function runSupervisorCommandLoop({ input, output, supervisor, token, frameWriter = createSerializedFrameWriter(output), inFlight = createInFlightCommands() }) {
  if (typeof token !== "string" || !DIGEST_RE.test(token)) throw new TypeError("invalid supervisor token");
  if (typeof input?.[Symbol.asyncIterator] !== "function" || typeof output?.write !== "function") {
    throw new TypeError("invalid supervisor command transport");
  }
  const liveCommandIds = new Set();
  const commandIdsByRequest = new Map();
  const commandBytesByRequest = new Map();
  const recentCommandIds = new Set();
  const recentCommandQueue = [];
  let buffer = Buffer.alloc(0);
  let commandsThisTurn = 0;

  async function yieldAfterCommandQuantum() {
    commandsThisTurn += 1;
    if (commandsThisTurn < MAX_COMMANDS_PER_EVENT_LOOP_TURN) return;
    commandsThisTurn = 0;
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
  }

  function rememberRecentCommandId(commandId) {
    if (recentCommandIds.has(commandId)) return;
    recentCommandIds.add(commandId);
    recentCommandQueue.push(commandId);
    while (recentCommandQueue.length > MAX_RECENT_COMMAND_IDS) {
      recentCommandIds.delete(recentCommandQueue.shift());
    }
  }

  function releaseCommandTracking(requestId) {
    const commandIds = commandIdsByRequest.get(requestId);
    if (commandIds !== undefined) {
      for (const commandId of commandIds) {
        liveCommandIds.delete(commandId);
        rememberRecentCommandId(commandId);
      }
    }
    commandIdsByRequest.delete(requestId);
    commandBytesByRequest.delete(requestId);
  }

  function trackCommand(command, frameBytes) {
    if (liveCommandIds.has(command.commandId) || recentCommandIds.has(command.commandId)) {
      throw new Error("duplicate supervisor command ID");
    }
    let commandIds = commandIdsByRequest.get(command.requestId);
    if (commandIds === undefined) {
      if (commandIdsByRequest.size >= MAX_TRACKED_COMMAND_ALLOCATIONS) return "tracking-capacity";
      commandIds = new Set();
      commandIdsByRequest.set(command.requestId, commandIds);
    }
    const recoveryCommand = command.type === "cleanup" || command.type === "status" || command.type === "acknowledge";
    const nextBytes = (commandBytesByRequest.get(command.requestId) ?? 0) + frameBytes;
    if (!recoveryCommand && (
      commandIds.size >= MAX_COMMAND_IDS_PER_ALLOCATION ||
      nextBytes > MAX_COMMAND_BYTES_PER_ALLOCATION
    )) {
      rememberRecentCommandId(command.commandId);
      return "allocation-capacity";
    }
    liveCommandIds.add(command.commandId);
    commandIds.add(command.commandId);
    commandBytesByRequest.set(command.requestId, nextBytes);
    return undefined;
  }

  function rejectAttributedCommand(command, cleanup) {
    inFlight.track((async () => {
      if (cleanup) {
        try {
          await supervisor.cleanup({
            requestId: command.requestId,
            pluginId: command.pluginId,
            trigger: "stream-overflow",
          });
        } catch {}
      }
      await frameWriter.write({
        v: 1,
        type: "error",
        commandId: command.commandId,
        code: "command-failed",
      });
    })());
  }

  for await (const chunk of input) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError("supervisor command transport must contain bytes");
    if (buffer.byteLength + chunk.byteLength > MAX_WIRE_BUFFER_BYTES) {
      throw new Error("supervisor command buffer limit exceeded");
    }
    buffer = appendBytes(buffer, chunk);

    let newline;
    while ((newline = buffer.indexOf(0x0a)) !== -1) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.byteLength === 0 || line.byteLength > MAX_WIRE_FRAME_BYTES || line[line.byteLength - 1] === 0x0d) {
        throw new Error("invalid supervisor command frame");
      }
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(line);
      } catch {
        throw new Error("invalid supervisor command UTF-8");
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("malformed supervisor command");
      }
      if (text !== JSON.stringify(raw)) throw new Error("noncanonical supervisor command");
      const command = validateCommand(raw, token);
      const rejected = trackCommand(command, line.byteLength);
      if (rejected !== undefined) {
        rejectAttributedCommand(command, rejected === "allocation-capacity");
        await yieldAfterCommandQuantum();
        continue;
      }

      // Not awaited: one plugin's blocked command must not hold the next
      // plugin's frame at the parser. The registry keeps custody of it.
      inFlight.track((async () => {
        try {
          const result = await dispatchCommand(supervisor, command);
          await frameWriter.write({ v: 1, type: "result", commandId: command.commandId, result });
          if (command.type === "acknowledge" && result.status === "acknowledged") {
            releaseCommandTracking(command.requestId);
          }
        } catch {
          await frameWriter.write({
            v: 1,
            type: "error",
            commandId: command.commandId,
            code: "command-failed",
          });
        }
      })());
      await yieldAfterCommandQuantum();
    }
    if (buffer.byteLength > MAX_WIRE_FRAME_BYTES) throw new Error("supervisor command frame exceeded limit");
  }
  if (buffer.byteLength !== 0) throw new Error("unterminated supervisor command frame");
  await drainThen(inFlight, () => frameWriter.idle());
}

async function main() {
  const startupText = readFileSync(3, "utf8");
  const startup = parseSupervisorStartupConfig(startupText);
  const frameWriter = createSerializedFrameWriter(process.stdout);
  const inFlight = createInFlightCommands();
  const supervisor = createPluginContainerSupervisor({
    docker: createDockerCliLifecyclePort(),
    clock: systemClock(),
    timers: systemTimers(),
    resolveLaunchSpec: startup.resolveLaunchSpec,
    emitEvent: (event) => frameWriter.write(event),
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Before the cell snapshot: a launch still in flight would otherwise land
    // its container after shutdown had already reported every one absent. The
    // reap runs even when that drain failed — shutdown() runs at most once, so
    // skipping it here would leave the containers unreaped for good.
    await drainThen(inFlight, async () => {
      const receipts = await supervisor.shutdown();
      if (receipts.some((receipt) => !receipt.confirmedAbsent)) {
        throw new Error("supervisor shutdown could not confirm container absence");
      }
    });
  };
  const shutdownForSignal = () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", shutdownForSignal);
  process.once("SIGTERM", shutdownForSignal);
  try {
    await runSupervisorCommandLoop({
      input: process.stdin,
      output: process.stdout,
      supervisor,
      token: startup.token,
      frameWriter,
      inFlight,
    });
  } finally {
    await shutdown();
    await frameWriter.idle();
  }
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write("plugin container supervisor failed\n");
    process.exitCode = 1;
  });
}
