import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import { test } from "node:test";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import { createFaultCell } from "../../packages/runtime/src/harness/plugin-fault-cell.mjs";
import {
  MAX_STREAM_CHUNK_BYTES,
  createPluginContainerSupervisor,
  runSupervisorCommandLoop,
  type DockerLifecyclePort,
  type DockerObservation,
  type PluginContainerSupervisor,
  type SupervisorTimerPort,
} from "../../packages/runtime/src/harness/plugin-container-supervisor.mjs";

const IMAGE_DIGEST = "a".repeat(64);
const TOKEN = "f".repeat(64);
const FAULT = { requestId: "fault-request", pluginId: "fault-plugin", deadlineMs: 5_000 } as const;
const UNRELATED = { requestId: "unrelated-request", pluginId: "unrelated-plugin", deadlineMs: 5_000 } as const;
const SAME_PLUGIN = { requestId: "fault-request-2", pluginId: FAULT.pluginId, deadlineMs: 5_000 } as const;

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

class FakeTimers implements SupervisorTimerPort {
  readonly scheduled: Array<{ callback: () => void; cleared: boolean }> = [];

  set(callback: () => void): object {
    const timer = { callback, cleared: false };
    this.scheduled.push(timer);
    return timer;
  }

  clear(handle: object): void {
    (handle as { cleared: boolean }).cleared = true;
  }

  fire(index: number): void {
    const timer = this.scheduled[index];
    assert.ok(timer);
    if (!timer.cleared) timer.callback();
  }
}

// Cleanup swallows every Docker failure into `cleanupErrors`, so the only way
// to make one cell's cleanup reject is to fail the timer clear it opens with.
class ClearFailingTimers implements SupervisorTimerPort {
  readonly scheduled: object[] = [];
  failClearIndex = -1;

  set(callback: () => void): object {
    const timer = { callback, cleared: false };
    this.scheduled.push(timer);
    return timer;
  }

  clear(handle: object): void {
    if (this.scheduled[this.failClearIndex] === handle) throw new Error("synthetic timer failure");
    (handle as { cleared: boolean }).cleared = true;
  }
}

class FaultIsolationDocker implements DockerLifecyclePort {
  readonly observations = new Map<string, DockerObservation>();
  readonly removeStarted = deferred();
  readonly releaseRemove = deferred();
  failBlockedRemove = false;
  private blockedContainerId?: string;
  private readonly handlers = new Map<string, {
    onStdout(bytes: Uint8Array): void;
    onStderr(bytes: Uint8Array): void;
    onClose(): void;
  }>();

  blockRemoval(containerId: string): void {
    this.blockedContainerId = containerId;
  }

  async create(input: {
    containerName: string;
    requestId: string;
    pluginId: string;
    imageDigest: string;
    createArgs: readonly string[];
  }): Promise<string> {
    const containerId = `container-${input.requestId}`;
    const observation: DockerObservation = {
      containerId,
      requestId: input.requestId,
      pluginId: input.pluginId,
      imageDigest: input.imageDigest,
      state: "created",
      running: false,
      exitCode: null,
      oomKilled: false,
    };
    this.observations.set(input.containerName, observation);
    this.observations.set(containerId, observation);
    return containerId;
  }

  async startAttached(containerId: string, handlers: {
    onStdout(bytes: Uint8Array): void;
    onStderr(bytes: Uint8Array): void;
    onClose(): void;
  }) {
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "running", running: true });
    this.handlers.set(containerId, handlers);
    return {
      async write(): Promise<void> {},
      async closeInput(): Promise<void> {},
    };
  }

  async inspect(containerRef: string): Promise<DockerObservation | null> {
    return this.observations.get(containerRef) ?? null;
  }

  async stop(containerId: string): Promise<void> {
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode: 0 });
  }

  async kill(containerId: string): Promise<void> {
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode: 137 });
  }

  async remove(containerId: string): Promise<void> {
    if (containerId === this.blockedContainerId) {
      this.removeStarted.resolve();
      await this.releaseRemove.promise;
      if (this.failBlockedRemove) throw new Error("synthetic remove failure");
    }
    const observation = this.require(containerId);
    for (const [key, value] of this.observations) {
      if (value.containerId === observation.containerId) this.observations.delete(key);
    }
  }

  emitStdout(containerId: string, bytes: Uint8Array): void {
    this.handlers.get(containerId)?.onStdout(bytes);
  }

  exit(containerId: string, exitCode: number | null, oomKilled: boolean): void {
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode, oomKilled });
    this.handlers.get(containerId)?.onClose();
  }

  private require(containerRef: string): DockerObservation {
    const observation = this.observations.get(containerRef);
    if (observation === undefined) throw new Error(`missing synthetic container ${containerRef}`);
    return observation;
  }

  private replace(previous: DockerObservation, next: DockerObservation): void {
    for (const [key, value] of this.observations) {
      if (value.containerId === previous.containerId) this.observations.set(key, next);
    }
  }
}

interface FaultHarness {
  readonly docker: FaultIsolationDocker;
  readonly supervisor: PluginContainerSupervisor;
  readonly timers: FakeTimers;
}

interface FaultCase {
  readonly name: string;
  readonly failRemove?: true;
  trigger(harness: FaultHarness): void | Promise<unknown>;
}

function setup(): FaultHarness {
  const docker = new FaultIsolationDocker();
  const timers = new FakeTimers();
  const supervisor = createPluginContainerSupervisor({
    docker,
    clock: { now: () => 1_000 },
    timers,
    resolveLaunchSpec(pluginId) {
      if (pluginId !== FAULT.pluginId && pluginId !== UNRELATED.pluginId) return undefined;
      return { imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] };
    },
  });
  return { docker, supervisor, timers };
}

async function within<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 1_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// An ended input needs several stream turns to reach the loop's drain, so a
// single-turn check would report "not settled" even with no drain at all.
async function settledAfterStreamTurns(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  for (let turn = 0; turn < 10; turn += 1) await waitForImmediate();
  return settled;
}

async function settledThisTurn(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  await waitForImmediate();
  return settled;
}

const faultCases: readonly FaultCase[] = [
  {
    name: "deadline timeout",
    trigger({ timers }) {
      timers.fire(0);
    },
  },
  {
    name: "process crash",
    trigger({ docker }) {
      docker.exit(`container-${FAULT.requestId}`, null, false);
    },
  },
  {
    name: "protocol failure",
    trigger({ supervisor }) {
      return supervisor.cleanup({ ...FAULT, trigger: "broker-stop" });
    },
  },
  {
    name: "malformed output",
    trigger({ supervisor }) {
      return supervisor.cleanup({ ...FAULT, trigger: "broker-stop" });
    },
  },
  {
    name: "excessive output",
    trigger({ docker }) {
      docker.emitStdout(`container-${FAULT.requestId}`, Buffer.alloc(MAX_STREAM_CHUNK_BYTES + 1));
    },
  },
  {
    name: "nonzero exit",
    trigger({ docker }) {
      docker.exit(`container-${FAULT.requestId}`, 23, false);
    },
  },
  {
    name: "OOM exit",
    trigger({ docker }) {
      docker.exit(`container-${FAULT.requestId}`, 137, true);
    },
  },
  {
    name: "cleanup failure",
    failRemove: true,
    trigger({ supervisor }) {
      return supervisor.cleanup({ ...FAULT, trigger: "broker-stop" });
    },
  },
];

for (const faultCase of faultCases) {
  test(`ordinary ${faultCase.name} remains inside its plugin fault cell`, async () => {
    conformsTo("PNH-INV-22");
    const harness = setup();
    await harness.supervisor.launch(FAULT);
    await harness.supervisor.launch(UNRELATED);
    harness.docker.blockRemoval(`container-${FAULT.requestId}`);
    harness.docker.failBlockedRemove = faultCase.failRemove === true;

    const triggered = faultCase.trigger(harness);
    const faultSettlement = triggered === undefined ? undefined : Promise.resolve(triggered);
    await within(
      harness.docker.removeStarted.promise,
      `${faultCase.name} did not enter the failing plugin cleanup path`,
    );

    const unrelatedProgress = Promise.all([
      harness.supervisor.status(UNRELATED),
      harness.supervisor.writeInput({
        ...UNRELATED,
        seq: 1,
        bytes: Buffer.from("unrelated request"),
      }),
    ]);
    const progressedBeforeFaultCleanup = await settledThisTurn(unrelatedProgress);
    harness.docker.releaseRemove.resolve();

    const [status, write] = await within(
      unrelatedProgress,
      `${faultCase.name} permanently blocked the unrelated plugin`,
    );
    if (faultSettlement !== undefined) await faultSettlement;
    await harness.supervisor.idle();
    await harness.supervisor.cleanup({ ...UNRELATED, trigger: "broker-stop" });

    assert.equal(status.status, "running");
    assert.deepEqual(write, {
      status: "input-written",
      requestId: UNRELATED.requestId,
      pluginId: UNRELATED.pluginId,
      seq: 1,
    });
    assert.equal(
      progressedBeforeFaultCleanup,
      true,
      `${faultCase.name} cleanup head-of-line blocked an unrelated plugin in the shared supervisor`,
    );
  });
}

test("a second allocation of the same plugin is not blocked by the first allocation's cleanup", async () => {
  const harness = setup();
  await harness.supervisor.launch(FAULT);
  await harness.supervisor.launch(SAME_PLUGIN);
  harness.docker.blockRemoval(`container-${FAULT.requestId}`);

  const blockedCleanup = harness.supervisor.cleanup({ ...FAULT, trigger: "broker-stop" });
  await within(
    harness.docker.removeStarted.promise,
    "the first allocation did not enter the blocked cleanup path",
  );

  const samePluginProgress = Promise.all([
    harness.supervisor.status(SAME_PLUGIN),
    harness.supervisor.writeInput({
      ...SAME_PLUGIN,
      seq: 1,
      bytes: Buffer.from("second allocation"),
    }),
  ]);
  const progressedBeforeFaultCleanup = await settledThisTurn(samePluginProgress);
  harness.docker.releaseRemove.resolve();

  const [status, write] = await within(
    samePluginProgress,
    "the first allocation permanently blocked the second allocation of the same plugin",
  );
  await blockedCleanup;

  assert.equal(status.status, "running");
  assert.deepEqual(write, {
    status: "input-written",
    requestId: SAME_PLUGIN.requestId,
    pluginId: SAME_PLUGIN.pluginId,
    seq: 1,
  });
  assert.equal(
    progressedBeforeFaultCleanup,
    true,
    "cleanup of one allocation head-of-line blocked a second allocation of the same plugin",
  );
});

test("reclaimed allocations leave a fresh launch able to settle in its own turn", async () => {
  const harness = setup();
  for (let index = 0; index < 8; index += 1) {
    const request = { requestId: `cycle-${index}`, pluginId: FAULT.pluginId, deadlineMs: 5_000 };
    await harness.supervisor.launch(request);
    await harness.supervisor.cleanup({ ...request, trigger: "broker-stop" });
    assert.deepEqual(await harness.supervisor.acknowledge(request), {
      status: "acknowledged",
      requestId: request.requestId,
      pluginId: request.pluginId,
    });
    assert.deepEqual(await harness.supervisor.status(request), {
      status: "acknowledged",
      requestId: request.requestId,
      pluginId: request.pluginId,
    });
  }

  const fresh = { requestId: "fresh-request", pluginId: FAULT.pluginId, deadlineMs: 5_000 };
  await harness.supervisor.launch(fresh);
  const freshProgress = Promise.all([
    harness.supervisor.status(fresh),
    harness.supervisor.writeInput({ ...fresh, seq: 1, bytes: Buffer.from("fresh allocation") }),
  ]);
  const progressed = await settledThisTurn(freshProgress);
  const [status, write] = await within(freshProgress, "the fresh allocation never settled");

  assert.equal(status.status, "running");
  assert.deepEqual(write, {
    status: "input-written",
    requestId: fresh.requestId,
    pluginId: fresh.pluginId,
    seq: 1,
  });
  assert.equal(progressed, true, "reclaimed allocations left the fresh allocation waiting on prior work");
});

test("shutdown fails closed when one cell's cleanup rejects", async () => {
  const docker = new FaultIsolationDocker();
  const timers = new ClearFailingTimers();
  const supervisor = createPluginContainerSupervisor({
    docker,
    clock: { now: () => 1_000 },
    timers,
    resolveLaunchSpec(pluginId) {
      if (pluginId !== FAULT.pluginId && pluginId !== UNRELATED.pluginId) return undefined;
      return { imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] };
    },
  });
  await supervisor.launch(FAULT);
  await supervisor.launch(UNRELATED);
  timers.failClearIndex = 0;

  await assert.rejects(supervisor.shutdown(), /synthetic timer failure/);
  const unrelated = await supervisor.status(UNRELATED);
  assert.equal(unrelated.status, "terminal", "the surviving cell was never cleaned");
});

test("shutdown reaps a launch enqueued in the same turn", async () => {
  conformsTo("PNH-INV-22");
  const harness = setup();
  await harness.supervisor.launch(FAULT);
  const inFlightLaunch = harness.supervisor.launch(UNRELATED);
  const shutdown = harness.supervisor.shutdown();

  await inFlightLaunch;
  const receipts = await within(shutdown, "shutdown never settled");
  // Two cells exist when shutdown snapshots, even though the second allocation
  // is not written to `allocations` until its launch turn runs.
  assert.equal(receipts.length, 2);
  assert.deepEqual(
    receipts.map((receipt) => receipt.requestId).sort(),
    [FAULT.requestId, UNRELATED.requestId].sort(),
  );
  assert.equal(receipts.every((receipt) => receipt.confirmedAbsent), true);
});

test("dispose does not cancel work already accepted by a fault cell", async () => {
  conformsTo("PNH-INV-22");
  const cell = createFaultCell(FAULT);
  const gate = deferred();
  const order: string[] = [];

  const blocked = cell.run(async () => {
    await gate.promise;
    order.push("accepted-first");
    return "accepted-first";
  });
  const queued = cell.run(async () => {
    order.push("accepted-second");
    return "accepted-second";
  });
  cell.dispose();
  gate.resolve();

  assert.equal(await blocked, "accepted-first");
  assert.equal(await queued, "accepted-second");
  await cell.flush();
  assert.deepEqual(order, ["accepted-first", "accepted-second"]);
});

test("a fault cell serializes its operations, drains on flush, and refuses work after disposal", async () => {
  const cell = createFaultCell(FAULT);
  assert.equal(cell.requestId, FAULT.requestId);
  assert.equal(cell.pluginId, FAULT.pluginId);

  const order: number[] = [];
  const runs = [1, 2, 3].map((value) => cell.run(async () => {
    order.push(value);
    return value;
  }));
  assert.deepEqual(await Promise.all(runs), [1, 2, 3]);
  await cell.flush();
  assert.deepEqual(order, [1, 2, 3]);

  await assert.rejects(
    cell.run(() => {
      throw new Error("synthetic operation failure");
    }),
    /synthetic operation failure/,
  );
  assert.equal(await cell.run(() => "after a rejected operation"), "after a rejected operation");

  cell.dispose();
  cell.dispose();
  await assert.rejects(cell.run(() => "late"), /fault cell is disposed/);
  await cell.flush();
});

interface FrameReader {
  waitFor(commandId: string): Promise<Record<string, unknown>>;
}

function readFrames(output: PassThrough): FrameReader {
  const seen = new Map<string, Record<string, unknown>>();
  const waiting = new Map<string, (frame: Record<string, unknown>) => void>();
  let buffered = "";
  output.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const frame = JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>;
      buffered = buffered.slice(newline + 1);
      const commandId = String(frame.commandId);
      seen.set(commandId, frame);
      waiting.get(commandId)?.(frame);
      newline = buffered.indexOf("\n");
    }
  });
  return {
    waitFor(commandId) {
      const frame = seen.get(commandId);
      if (frame !== undefined) return Promise.resolve(frame);
      return new Promise((resolve) => waiting.set(commandId, resolve));
    },
  };
}

function commandLine(command: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify({ v: 1, token: TOKEN, ...command })}\n`);
}

test("the command loop answers a second plugin while another plugin's cleanup is blocked", async () => {
  conformsTo("PNH-INV-22");
  const harness = setup();
  await harness.supervisor.launch(FAULT);
  await harness.supervisor.launch(UNRELATED);
  harness.docker.blockRemoval(`container-${FAULT.requestId}`);

  const input = new PassThrough();
  const output = new PassThrough();
  const frames = readFrames(output);
  const loop = runSupervisorCommandLoop({ input, output, supervisor: harness.supervisor, token: TOKEN });

  input.write(commandLine({
    type: "cleanup",
    commandId: "command-cleanup",
    requestId: FAULT.requestId,
    pluginId: FAULT.pluginId,
  }));
  await within(
    harness.docker.removeStarted.promise,
    "the blocked cleanup never reached Docker through the command loop",
  );
  input.write(commandLine({
    type: "status",
    commandId: "command-status",
    requestId: UNRELATED.requestId,
    pluginId: UNRELATED.pluginId,
  }));

  const status = await within(
    frames.waitFor("command-status"),
    "a blocked cleanup head-of-line blocked an unrelated plugin's command in the loop",
  );
  assert.equal(status.type, "result");
  assert.equal((status.result as { status: string }).status, "running");

  harness.docker.releaseRemove.resolve();
  input.end();
  await within(loop, "the command loop never finished");
  assert.equal((await frames.waitFor("command-cleanup")).type, "result");
});

test("the command loop drains a dispatched command before it reports custody", async () => {
  const harness = setup();
  await harness.supervisor.launch(FAULT);
  harness.docker.blockRemoval(`container-${FAULT.requestId}`);

  const input = new PassThrough();
  const output = new PassThrough();
  const frames = readFrames(output);
  const loop = runSupervisorCommandLoop({ input, output, supervisor: harness.supervisor, token: TOKEN });

  input.write(commandLine({
    type: "cleanup",
    commandId: "command-cleanup",
    requestId: FAULT.requestId,
    pluginId: FAULT.pluginId,
  }));
  await within(
    harness.docker.removeStarted.promise,
    "the blocked cleanup never reached Docker through the command loop",
  );
  input.end();

  // `main()`'s shutdown drains the loop's registry before it reaps containers,
  // so a loop that finished here would let the process report container custody
  // with a cleanup still running.
  assert.equal(
    await settledAfterStreamTurns(loop),
    false,
    "the command loop resolved while a dispatched command was still running",
  );

  harness.docker.releaseRemove.resolve();
  await within(loop, "the command loop never finished");
  assert.equal((await frames.waitFor("command-cleanup")).type, "result");
});

test("a recorded frame-write failure surfaces without skipping the work behind the drain", async () => {
  const harness = setup();
  await harness.supervisor.launch(FAULT);

  const input = new PassThrough();
  const output = new PassThrough();
  let idled = false;
  const loop = runSupervisorCommandLoop({
    input,
    output,
    supervisor: harness.supervisor,
    token: TOKEN,
    frameWriter: {
      write() {
        return Promise.reject(new Error("synthetic frame write failure"));
      },
      idle() {
        idled = true;
        return Promise.resolve();
      },
    },
  });

  input.end(commandLine({
    type: "status",
    commandId: "command-status",
    requestId: FAULT.requestId,
    pluginId: FAULT.pluginId,
  }));

  // The registry records a write failure permanently, and `main()`'s shutdown
  // gates its container reap on that same drain: the step behind the drain has
  // to run anyway, or a broken stdout leaves containers unreaped for good.
  await within(
    assert.rejects(loop, /synthetic frame write failure/),
    "the command loop never finished",
  );
  assert.equal(idled, true, "a recorded frame-write failure skipped the work behind the drain");
});
