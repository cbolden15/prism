/**
 * Bare-subprocess lifecycle port for the plugin supervisor.
 *
 * `createPluginContainerSupervisor` in `plugin-container-supervisor.mjs` owns
 * allocation custody, deadlines, stream accounting, and cleanup receipts. It
 * reaches the outside world through a six-method lifecycle port, and the only
 * implementation shipped so far drives the Docker CLI. This module supplies a
 * second implementation of that same port backed by `child_process.spawn`, so
 * the identical custody machinery can supervise a plugin that runs as a plain
 * subprocess instead of a container.
 *
 * Boundary adaptation. The supervisor's `validateLaunchSpec` accepts exactly
 * two fields — a 64-hex `imageDigest` and a non-empty `createArgs` string array
 * — and discards everything else, and its startup parser accepts exactly
 * `pluginId`/`imageDigest`/`createArgs`. Both are imported unchanged here, so a
 * spawn specification has to travel through those two fields rather than
 * alongside them. It does:
 *
 *   - `imageDigest` carries the spawn artifact digest verbatim. It is a real
 *     sha256 over the plugin artifact, not a placeholder, which keeps the
 *     supervisor's own identity check (`observation.imageDigest ===
 *     launchSpec.imageDigest`) a genuine artifact-identity check rather than a
 *     comparison of two invented constants. It is emphatically NOT an OCI image
 *     digest, and nothing in this module gives it Docker semantics.
 *   - `createArgs` carries a two-element envelope: a version tag and the JSON
 *     spawn specification. These are never passed to `docker create`, never
 *     interpreted as flags, and never reach a shell — `create` decodes them and
 *     nothing else does.
 *
 * `create` cross-checks the decoded payload's `pluginId` and `artifactDigest`
 * against the admitted values that arrived on the other two fields, so the
 * envelope cannot disagree with the admission ticket that authorized it.
 *
 * Privilege drop. `uid`/`gid` from the spawn profile are applied best-effort.
 * An unprivileged invocation cannot assume another user, so `EPERM` is the
 * common case, not an edge case: it is caught, a structured warning event is
 * emitted through the same event channel the supervisor already writes to, and
 * the process is spawned once more as the invoking user. The drop is never
 * silently skipped and never fatal.
 *
 * Descendant containment. A container's cleanup kills a cgroup; a bare
 * subprocess has no cgroup, and the plugin is free to spawn children of its
 * own. Signalling only the direct child's pid would leave those children
 * running while the supervisor's receipt reported `confirmedAbsent: true` — an
 * assertion of absence about a process that is still alive. So every child is
 * spawned `detached`, which makes it the leader of a new process group, and
 * every signal this port sends goes to `-pid`, the whole group. `remove`
 * additionally probes the group with signal 0 and refuses to forget an
 * allocation whose group still has members, whether or not the direct child
 * itself has exited.
 *
 * The residual hole is named rather than papered over: a grandchild that calls
 * `setsid` (a plugin spawning with `detached: true` of its own) leaves the
 * group and becomes invisible to both the group kill and the group probe. Only
 * a cgroup or a PID namespace can contain that, and this port has neither.
 * Process-group containment covers the ordinary case — a plugin spawning
 * helpers — and is a Unix mechanism; this port assumes a Unix host, as the
 * `uid`/`gid` handling already does.
 *
 * Exit is observed on the child's `exit` event, never on `close`. `close`
 * waits for every stdio pipe to be closed, and a grandchild that inherited
 * stdout holds those pipes open long after the direct child is gone; gating
 * the record's state on `close` would report a dead process as `running` until
 * the allocation's deadline expired. Stdio is drained separately, on a bounded
 * grace window, purely to satisfy the `onClose` handler contract.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { constants } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPluginContainerSupervisor,
  parseSupervisorStartupConfig,
  runSupervisorCommandLoop,
  systemClock,
  systemTimers,
} from "./plugin-container-supervisor.mjs";

/** Envelope tag for the spawn specification carried in `createArgs`. */
export const SPAWN_LAUNCH_ARGS_VERSION = "pnh-spawn-launch-v1";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const SPAWN_SPEC_KEYS = [
  "pluginId",
  "artifactDigest",
  "entrypointPath",
  "cwd",
  "env",
  "envAllowlist",
  "uid",
  "gid",
];
const DEFAULT_STOP_GRACE_MS = 2_000;
const DEFAULT_KILL_GRACE_MS = 2_000;
/** How long `onClose` waits for stdio to drain after the child has exited. */
const DEFAULT_DRAIN_GRACE_MS = 500;
/** Poll interval for the process-group liveness probe. */
const GROUP_POLL_MS = 25;

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
}

function assertStringRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a string map`);
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") throw new TypeError(`${label} must be a string map`);
  }
}

function assertNonEmptyStrings(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a string list`);
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new TypeError(`${label} must be a string list`);
    }
  }
}

function assertUnixId(value, label) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

/**
 * Encode a spawn launch specification into the supervisor's `createArgs` slot.
 *
 * Both elements are non-empty strings that match none of the supervisor-owned
 * Docker flags, and `JSON.stringify` escapes any NUL byte, so the result always
 * satisfies the supervisor's `validateLaunchSpec` argument constraints.
 */
export function encodeSpawnLaunchSpec(spec) {
  if (!isPlainRecord(spec)) throw new TypeError("spawn launch specification must be an object");
  const payload = {
    pluginId: spec.pluginId,
    artifactDigest: spec.artifactDigest,
    entrypointPath: spec.entrypointPath,
    cwd: spec.cwd,
    env: { ...spec.env },
    envAllowlist: [...(spec.envAllowlist ?? [])],
    uid: spec.uid,
    gid: spec.gid,
  };
  validateSpawnSpec(payload);
  return Object.freeze([SPAWN_LAUNCH_ARGS_VERSION, JSON.stringify(payload)]);
}

/**
 * Adapt a spawn launch specification to the supervisor's admitted launch-spec
 * shape. The result is what `resolveLaunchSpec` must return, and what a startup
 * config's `plugins` entry must contain.
 */
export function toSupervisorStartupPlugin(spec) {
  const createArgs = encodeSpawnLaunchSpec(spec);
  return Object.freeze({
    pluginId: spec.pluginId,
    imageDigest: spec.artifactDigest,
    createArgs,
  });
}

function validateSpawnSpec(value) {
  if (!isPlainRecord(value)) throw new TypeError("spawn launch specification must be an object");
  assertExactKeys(value, SPAWN_SPEC_KEYS, "spawn launch specification");
  if (typeof value.pluginId !== "string" || value.pluginId.length === 0) {
    throw new TypeError("spawn launch specification has an invalid plugin ID");
  }
  if (typeof value.artifactDigest !== "string" || !DIGEST_RE.test(value.artifactDigest)) {
    throw new TypeError("spawn launch specification has an invalid artifact digest");
  }
  if (typeof value.entrypointPath !== "string" || value.entrypointPath.length === 0) {
    throw new TypeError("spawn launch specification has an invalid entrypoint path");
  }
  if (typeof value.cwd !== "string" || value.cwd.length === 0) {
    throw new TypeError("spawn launch specification has an invalid working directory");
  }
  assertStringRecord(value.env, "spawn launch specification environment");
  assertNonEmptyStrings(value.envAllowlist, "spawn launch specification allowlist");
  assertUnixId(value.uid, "spawn launch specification uid");
  assertUnixId(value.gid, "spawn launch specification gid");
  return value;
}

function decodeSpawnLaunchArgs(createArgs) {
  if (!Array.isArray(createArgs) || createArgs.length !== 2 || createArgs[0] !== SPAWN_LAUNCH_ARGS_VERSION) {
    throw new TypeError("admitted arguments are not a spawn launch specification");
  }
  let parsed;
  try {
    parsed = JSON.parse(createArgs[1]);
  } catch {
    throw new TypeError("admitted arguments are not a spawn launch specification");
  }
  return validateSpawnSpec(parsed);
}

/**
 * Build the child environment: allowlisted host variables first, then the
 * profile's fixed environment, which wins on conflict. Nothing else is
 * inherited — the spawned process does not see `process.env`.
 *
 * Two caveats are runtime facts rather than leaks. On darwin, libuv adds
 * `__CF_USER_TEXT_ENCODING` to every child environment so CoreFoundation does
 * not abort; it is synthesized from the calling uid, not copied from the host
 * environment. And when the supervisor itself runs under `NODE_V8_COVERAGE`,
 * Node re-adds that variable to the child so coverage collection is transitive.
 * Both are appended by the spawn layer after this function's result is applied,
 * and Node exposes no way to suppress either.
 */
function buildChildEnv(spec, hostEnv) {
  const env = {};
  for (const name of spec.envAllowlist) {
    const value = hostEnv[name];
    if (typeof value === "string") env[name] = value;
  }
  for (const [name, value] of Object.entries(spec.env)) env[name] = value;
  return env;
}

function exitCodeFor(code, signal) {
  if (typeof code === "number") return code;
  if (typeof signal === "string") {
    const number = constants.signals[signal];
    if (typeof number === "number") return 128 + number;
  }
  return null;
}

/**
 * @param {number} ms
 * @param {boolean} [keepAlive] whether the timer holds the event loop open. A
 *   wait that is the only thing driving the process forward — a poll tick, a
 *   grace window with no live handle behind it — must keep the loop alive, or
 *   it never fires and its awaiter never resumes.
 */
function delay(ms, keepAlive = false) {
  return new Promise((done) => {
    const handle = setTimeout(done, ms);
    if (!keepAlive && typeof handle.unref === "function") handle.unref();
  });
}

/** `promise`, or `ms`, whichever comes first, on a timer that is cleared either way. */
function raceDeadline(promise, ms) {
  let handle;
  const deadline = new Promise((done) => {
    handle = setTimeout(done, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(handle));
}

async function settledWithin(record, ms) {
  if (record.state === "exited") return true;
  await raceDeadline(record.exited, ms);
  return record.state === "exited";
}

/**
 * A lifecycle port that runs plugins as bare subprocesses.
 *
 * @param {object} [options]
 * @param {(event: object) => unknown} [options.emitEvent] structured event sink,
 *   shared with the supervisor's own event channel by `main()`.
 * @param {Function} [options.spawnProcess] seam over `child_process.spawn`.
 * @param {(pid: number, signal: number | string) => void} [options.signalGroup]
 *   seam over `process.kill(-pid, signal)`. Injected alongside `spawnProcess`
 *   whenever a test supplies a fake child, so a synthetic pid can never reach a
 *   real host process group.
 * @param {Record<string, string | undefined>} [options.hostEnv] host environment
 *   the allowlist filters.
 * @param {number} [options.stopGraceMs] how long `stop` waits after SIGTERM.
 * @param {number} [options.killGraceMs] how long `kill`/`remove` wait after SIGKILL.
 * @param {number} [options.drainGraceMs] how long `onClose` waits for stdio to
 *   drain after the child has exited.
 */
export function createSpawnLifecyclePort(options = {}) {
  const emitEvent = options.emitEvent ?? (() => undefined);
  const spawnProcess = options.spawnProcess ?? spawn;
  const signalGroup = options.signalGroup ?? ((pid, signal) => process.kill(-pid, signal));
  const hostEnv = options.hostEnv ?? process.env;
  const stopGraceMs = options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const drainGraceMs = options.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS;

  /** Keyed by both container name and generated container ID. */
  const records = new Map();

  function observationFor(record) {
    return Object.freeze({
      containerId: record.containerId,
      requestId: record.requestId,
      pluginId: record.pluginId,
      imageDigest: record.artifactDigest,
      state: record.state,
      running: record.state === "running",
      exitCode: record.exitCode,
      // A bare subprocess has no cgroup memory verdict to report. `null` is the
      // honest answer; claiming `false` would assert something unobserved.
      oomKilled: null,
    });
  }

  function spawnChild(record) {
    const args = [record.spec.entrypointPath];
    // `detached` puts the child in a process group of its own, so a later
    // `-pid` signal reaches its descendants too. The handle is deliberately
    // NOT unref'd: the supervisor keeps custody of the allocation.
    const base = {
      cwd: record.spec.cwd,
      env: record.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    };
    try {
      return spawnProcess(process.execPath, args, {
        ...base,
        uid: record.spec.uid,
        gid: record.spec.gid,
      });
    } catch (error) {
      const errorCode = error?.code;
      if (errorCode !== "EPERM" && errorCode !== "EACCES") throw error;
      emitEvent(
        Object.freeze({
          v: 1,
          type: "warning",
          code: "spawn-privilege-drop-failed",
          requestId: record.requestId,
          pluginId: record.pluginId,
          requestedUid: record.spec.uid,
          requestedGid: record.spec.gid,
          actualUid: process.getuid?.() ?? null,
          actualGid: process.getgid?.() ?? null,
          errorCode,
        }),
      );
      return spawnProcess(process.execPath, args, { ...base });
    }
  }

  /**
   * Whether any process remains in the allocation's process group. The direct
   * child may be long gone and the answer still be `true`: a grandchild
   * inherits its parent's process group, so the group outlives its leader.
   *
   * `EPERM` means the group exists but is not ours to signal, which is a
   * liveness answer of `true`. Only `ESRCH` — no such group — proves absence.
   */
  function groupAlive(record) {
    if (typeof record.pid !== "number" || record.pid <= 1) return false;
    try {
      signalGroup(record.pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  }

  /**
   * Signal the whole allocation: the process group first, then the direct
   * child. The second signal is redundant when the group kill lands, and is
   * the only one that lands if the child left the group on its own.
   */
  function signalAllocation(record, signal) {
    if (typeof record.pid === "number" && record.pid > 1) {
      try {
        signalGroup(record.pid, signal);
      } catch {
        // ESRCH: the group is already empty. Liveness is re-probed by caller.
      }
    }
    if (record.child === null) return;
    try {
      record.child.kill(signal);
    } catch {
      // The child may have exited between the liveness check and the signal.
      // The settle check below reports the real state either way.
    }
  }

  async function awaitGroupExit(record, graceMs) {
    const attempts = Math.max(1, Math.ceil(graceMs / GROUP_POLL_MS));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!groupAlive(record)) return true;
      await delay(GROUP_POLL_MS, true);
    }
    return !groupAlive(record);
  }

  async function terminate(record, signal, graceMs) {
    if (record.child === null) return;
    if (record.state !== "running" && !groupAlive(record)) return;
    signalAllocation(record, signal);
    await settledWithin(record, graceMs);
  }

  return Object.freeze({
    async create(input) {
      const spec = decodeSpawnLaunchArgs(input.createArgs);
      if (spec.artifactDigest !== input.imageDigest) {
        throw new TypeError("admitted artifact digest does not match the spawn launch specification");
      }
      if (spec.pluginId !== input.pluginId) {
        throw new TypeError("admitted plugin ID does not match the spawn launch specification");
      }
      if (records.has(input.containerName)) {
        throw new Error("a process already holds this allocation name");
      }
      const containerId = randomBytes(32).toString("hex");
      const record = {
        containerId,
        containerName: input.containerName,
        requestId: input.requestId,
        pluginId: input.pluginId,
        artifactDigest: input.imageDigest,
        spec,
        env: buildChildEnv(spec, hostEnv),
        child: null,
        pid: null,
        state: "created",
        exitCode: null,
        exited: Promise.resolve(),
      };
      records.set(input.containerName, record);
      records.set(containerId, record);
      return containerId;
    },

    async startAttached(containerId, handlers) {
      // Validated before the spawn, exactly as the Docker port does. A handler
      // that is not callable would otherwise throw from inside an event
      // listener — an uncaught exception raised after the child is already
      // running, which would take the supervisor down and orphan it.
      if (
        handlers === null ||
        typeof handlers !== "object" ||
        typeof handlers.onStdout !== "function" ||
        typeof handlers.onStderr !== "function" ||
        typeof handlers.onClose !== "function"
      ) {
        throw new TypeError("attached spawn handlers are required");
      }
      const record = records.get(containerId);
      if (record === undefined) throw new Error("unknown spawn allocation");
      if (record.state !== "created") throw new Error("spawn allocation is not startable");

      let settle;
      record.exited = new Promise((done) => {
        settle = done;
      });
      const child = spawnChild(record);
      record.child = child;
      record.pid = typeof child.pid === "number" ? child.pid : null;
      record.state = "running";

      child.stdout?.on("data", (chunk) => handlers.onStdout(chunk));
      child.stderr?.on("data", (chunk) => handlers.onStderr(chunk));
      child.stdin?.on("error", () => undefined);

      // Stdio drain is tracked from the moment of spawn, so no `end` can be
      // missed, and it is kept strictly separate from the exit transition
      // below: a grandchild holding stdout open must not be able to make a
      // dead process look alive.
      const drained = [];
      for (const stream of [child.stdout, child.stderr]) {
        if (stream === null || stream === undefined) continue;
        drained.push(new Promise((done) => {
          let settledStream = false;
          const finish = () => {
            if (settledStream) return;
            settledStream = true;
            done();
          };
          stream.once("end", finish);
          stream.once("close", finish);
          stream.once("error", finish);
        }));
      }
      const allDrained = Promise.all(drained);

      let exitObserved = false;
      const finishExit = (code, signal) => {
        if (exitObserved) return;
        exitObserved = true;
        record.state = "exited";
        record.exitCode = exitCodeFor(code, signal);
        settle();
        // `onClose` means "the allocation is over, start cleanup" to the
        // supervisor. Give stdio a bounded window to flush what the child
        // already wrote, then report regardless — an inherited pipe held open
        // by a descendant must not postpone cleanup indefinitely.
        void Promise.race([allDrained, delay(drainGraceMs)]).then(() => {
          handlers.onClose();
        });
      };
      // A post-spawn `error` (for example a failed exec) arrives asynchronously
      // and must close the allocation rather than reach an unhandled listener.
      child.once("error", () => finishExit(null, null));
      // `exit`, not `close`: the process is what this record tracks, not its
      // pipes. See the module header.
      child.once("exit", (code, signal) => finishExit(code, signal));

      return Object.freeze({
        write(bytes) {
          return new Promise((resolvePromise, reject) => {
            if (child.stdin === null) {
              reject(new Error("spawn allocation has no input stream"));
              return;
            }
            child.stdin.write(bytes, (error) => {
              if (error) reject(error);
              else resolvePromise();
            });
          });
        },
        closeInput() {
          return new Promise((resolvePromise) => {
            if (child.stdin === null) {
              resolvePromise();
              return;
            }
            child.stdin.end(resolvePromise);
          });
        },
      });
    },

    async inspect(containerRef) {
      const record = records.get(containerRef);
      return record === undefined ? null : observationFor(record);
    },

    async stop(containerId) {
      const record = records.get(containerId);
      if (record === undefined) return;
      await terminate(record, "SIGTERM", stopGraceMs);
    },

    async kill(containerId) {
      const record = records.get(containerId);
      if (record === undefined) return;
      await terminate(record, "SIGKILL", killGraceMs);
    },

    async remove(containerId) {
      const record = records.get(containerId);
      if (record === undefined) return;
      if (record.child !== null) {
        // Signal unconditionally, even when the direct child has already
        // exited: an exited leader says nothing about its group, and
        // descendants left running here become processes the supervisor's
        // receipt would report as absent.
        signalAllocation(record, "SIGKILL");
        if (record.state === "running") await settledWithin(record, killGraceMs);
        await awaitGroupExit(record, killGraceMs);
        // Forgetting a still-live process would turn the supervisor's
        // `confirmedAbsent` into a lie. Fail loudly instead.
        if (record.state === "running" || groupAlive(record)) {
          throw new Error("spawn allocation did not exit");
        }
      }
      records.delete(record.containerName);
      records.delete(record.containerId);
    },
  });
}

/* c8 ignore start -- process entrypoint, exercised only when invoked directly */

async function writeFrame(output, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (!output.write(bytes)) await once(output, "drain");
}

/**
 * Minimal duplicate of the container supervisor's module-private serialized
 * frame writer, so one writer instance is shared between the supervisor's
 * `emitEvent`, this port's warning events, and the command loop's replies.
 * The original is not exported and must not be.
 */
function createSerializedFrameWriter(output) {
  let queue = Promise.resolve();
  return Object.freeze({
    write(value) {
      const result = queue.then(() => writeFrame(output, value));
      queue = result.catch(() => undefined);
      return result;
    },
    idle() {
      return queue;
    },
  });
}

async function main() {
  const startupText = readFileSync(3, "utf8");
  const startup = parseSupervisorStartupConfig(startupText);
  const frameWriter = createSerializedFrameWriter(process.stdout);
  const supervisor = createPluginContainerSupervisor({
    docker: createSpawnLifecyclePort({ emitEvent: (event) => frameWriter.write(event) }),
    clock: systemClock(),
    timers: systemTimers(),
    resolveLaunchSpec: startup.resolveLaunchSpec,
    emitEvent: (event) => frameWriter.write(event),
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const receipts = await supervisor.shutdown();
    if (receipts.some((receipt) => !receipt.confirmedAbsent)) {
      throw new Error("supervisor shutdown could not confirm process absence");
    }
  };
  // Because children are spawned `detached`, a SIGINT delivered to this
  // process's group (a terminal's Ctrl-C) no longer reaches them: they are in
  // groups of their own. That is the intended direction — the plugins die
  // through `supervisor.shutdown()`, which stops, kills, and verifies each
  // group and refuses to exit 0 unless every receipt confirms absence, rather
  // than through a signal that races the custody machinery. Nothing here
  // addresses a child by pid, so group signalling introduced no conflict.
  const shutdownForSignal = () => {
    void shutdown().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", shutdownForSignal);
  process.once("SIGTERM", shutdownForSignal);
  try {
    // The command loop is imported unchanged; its own inline duplicate-command-ID
    // guard already covers replay, so nothing is reimplemented here.
    await runSupervisorCommandLoop({
      input: process.stdin,
      output: process.stdout,
      supervisor,
      token: startup.token,
      frameWriter,
    });
  } finally {
    await shutdown();
    await frameWriter.idle();
  }
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write("plugin spawn supervisor failed\n");
    process.exitCode = 1;
  });
}

/* c8 ignore stop */
