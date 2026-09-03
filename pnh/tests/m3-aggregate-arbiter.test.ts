import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import {
  createPluginContainerSupervisor,
  runSupervisorCommandLoop,
  type DockerLifecyclePort,
  type DockerObservation,
} from "../../packages/runtime/src/harness/plugin-container-supervisor.mjs";
import {
  ResourceCapacityError,
  createPluginResourceArbiter,
} from "../../packages/runtime/src/harness/plugin-resource-arbiter.mjs";

function identity(requestId: string, pluginId: string) {
  return { requestId, pluginId } as const;
}

const IMAGE_DIGEST = "a".repeat(64);
const TOKEN = "f".repeat(64);

class AggregateDocker implements DockerLifecyclePort {
  readonly observations = new Map<string, DockerObservation>();
  activeCalls = 0;
  maxActiveCalls = 0;
  blockFirstInspect = false;
  firstInspectStarted!: Promise<void>;
  private resolveFirstInspectStarted?: () => void;
  private releaseFirstInspect?: () => void;
  private firstInspectBlocked = false;

  constructor() {
    this.firstInspectStarted = new Promise((resolve) => {
      this.resolveFirstInspectStarted = resolve;
    });
  }

  releaseBlockedInspect(): void {
    this.releaseFirstInspect?.();
  }

  private async call<T>(operation: () => T | Promise<T>): Promise<T> {
    this.activeCalls += 1;
    this.maxActiveCalls = Math.max(this.maxActiveCalls, this.activeCalls);
    try {
      return await operation();
    } finally {
      this.activeCalls -= 1;
    }
  }

  async create(input: {
    containerName: string;
    requestId: string;
    pluginId: string;
    imageDigest: string;
    createArgs: readonly string[];
  }): Promise<string> {
    return this.call(() => {
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
    });
  }

  async startAttached(containerId: string): Promise<{ write(bytes: Uint8Array): Promise<void>; closeInput(): Promise<void> }> {
    return this.call(() => {
      const current = this.observations.get(containerId);
      assert.ok(current);
      const running = { ...current, state: "running", running: true } as DockerObservation;
      this.replace(current, running);
      return { async write() {}, async closeInput() {} };
    });
  }

  async inspect(containerRef: string): Promise<DockerObservation | null> {
    return this.call(async () => {
      if (this.blockFirstInspect && !this.firstInspectBlocked) {
        this.firstInspectBlocked = true;
        this.resolveFirstInspectStarted?.();
        await new Promise<void>((resolve) => {
          this.releaseFirstInspect = resolve;
        });
      }
      return this.observations.get(containerRef) ?? null;
    });
  }

  async stop(containerId: string): Promise<void> {
    await this.call(() => this.setExited(containerId, 0));
  }

  async kill(containerId: string): Promise<void> {
    await this.call(() => this.setExited(containerId, 137));
  }

  async remove(containerId: string): Promise<void> {
    await this.call(() => {
      const current = this.observations.get(containerId);
      assert.ok(current);
      for (const [key, value] of this.observations) {
        if (value.containerId === current.containerId) this.observations.delete(key);
      }
    });
  }

  private setExited(containerId: string, exitCode: number): void {
    const current = this.observations.get(containerId);
    assert.ok(current);
    this.replace(current, { ...current, state: "exited", running: false, exitCode });
  }

  private replace(previous: DockerObservation, next: DockerObservation): void {
    for (const [key, value] of this.observations) {
      if (value.containerId === previous.containerId) this.observations.set(key, next);
    }
  }
}

function supervisorWith(docker: DockerLifecyclePort, resourceArbiter = createPluginResourceArbiter()) {
  return createPluginContainerSupervisor({
    docker,
    resourceArbiter,
    clock: { now: () => 1_000 },
    timers: { set: () => ({}), clear: () => undefined },
    resolveLaunchSpec: () => ({ imageDigest: IMAGE_DIGEST, createArgs: ["--network", "none", IMAGE_DIGEST] }),
  });
}

test("aggregate admission rejects only the request beyond the live-allocation cap", () => {
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 2,
    maxLiveAllocationsPerPlugin: 2,
    maxConcurrentDockerInvocations: 1,
  });
  const first = arbiter.reserveAllocation(identity("request-1", "plugin-a"));
  arbiter.reserveAllocation(identity("request-2", "plugin-b"));

  assert.throws(
    () => arbiter.reserveAllocation(identity("request-3", "plugin-c")),
    ResourceCapacityError,
  );
  assert.equal(arbiter.snapshot().liveAllocations, 2);
  first.release();
  assert.doesNotThrow(() => arbiter.reserveAllocation(identity("request-3", "plugin-c")));
});

test("one plugin cannot consume more than its fair-share allocation ceiling", () => {
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 4,
    maxLiveAllocationsPerPlugin: 1,
    maxConcurrentDockerInvocations: 1,
  });
  arbiter.reserveAllocation(identity("request-1", "plugin-a"));

  assert.throws(
    () => arbiter.reserveAllocation(identity("request-2", "plugin-a")),
    ResourceCapacityError,
  );
  assert.doesNotThrow(() => arbiter.reserveAllocation(identity("request-3", "plugin-b")));
});

test("Docker reservations are FIFO and never exceed the configured concurrency", async () => {
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 2,
    maxLiveAllocationsPerPlugin: 2,
    maxConcurrentDockerInvocations: 1,
  });
  const order: string[] = [];
  let releaseFirst!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = arbiter.runDocker(async () => {
    order.push("first-start");
    await blocked;
    order.push("first-end");
  });
  const second = arbiter.runDocker(async () => {
    order.push("second");
  });
  await waitForImmediate();

  assert.deepEqual(order, ["first-start"]);
  assert.deepEqual(arbiter.snapshot(), {
    liveAllocations: 0,
    activeDockerInvocations: 1,
    queuedDockerInvocations: 1,
  });
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
});

test("cleanup-class Docker work can proceed while its allocation lease is held", async () => {
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 1,
    maxLiveAllocationsPerPlugin: 1,
    maxConcurrentDockerInvocations: 1,
  });
  const lease = arbiter.reserveAllocation(identity("request-1", "plugin-a"));

  assert.equal(await arbiter.runDocker(async () => "cleaned"), "cleaned");
  assert.equal(arbiter.snapshot().liveAllocations, 1);
  lease.release();
  assert.equal(arbiter.snapshot().liveAllocations, 0);
});

test("supervisor admission refuses excess work without disturbing a live allocation", async () => {
  const docker = new AggregateDocker();
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 1,
    maxLiveAllocationsPerPlugin: 1,
    maxConcurrentDockerInvocations: 1,
  });
  const supervisor = supervisorWith(docker, arbiter);
  const first = identity("request-1", "plugin-a");
  const second = identity("request-2", "plugin-b");

  assert.equal((await supervisor.launch({ ...first, deadlineMs: 5_000 })).status, "running");
  await assert.rejects(supervisor.launch({ ...second, deadlineMs: 5_000 }), ResourceCapacityError);
  assert.equal((await supervisor.status(first)).status, "running");
  await supervisor.cleanup({ ...first, trigger: "broker-stop" });
  await supervisor.acknowledge(first);
  assert.equal((await supervisor.launch({ ...second, deadlineMs: 5_000 })).status, "running");
});

test("supervisor applies one Docker concurrency bound across distinct plugin cells", async () => {
  const docker = new AggregateDocker();
  docker.blockFirstInspect = true;
  const arbiter = createPluginResourceArbiter({
    maxLiveAllocations: 2,
    maxLiveAllocationsPerPlugin: 2,
    maxConcurrentDockerInvocations: 1,
  });
  const supervisor = supervisorWith(docker, arbiter);
  const first = supervisor.launch({ ...identity("request-1", "plugin-a"), deadlineMs: 5_000 });
  await docker.firstInspectStarted;
  const second = supervisor.launch({ ...identity("request-2", "plugin-b"), deadlineMs: 5_000 });
  await waitForImmediate();

  assert.equal(docker.maxActiveCalls, 1);
  assert.equal(arbiter.snapshot().queuedDockerInvocations, 1);
  docker.releaseBlockedInspect();
  await Promise.all([first, second]);
  assert.equal(docker.maxActiveCalls, 1);
});

test("more than eight megabytes of one allocation's commands does not tear down another allocation", async () => {
  const output = new PassThrough();
  let outputText = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    outputText += chunk;
  });
  const cleaned: string[] = [];
  const supervisor = {
    launch: async (command: { requestId: string; pluginId: string }) => ({ status: "running", ...command }),
    writeInput: async (command: { requestId: string; pluginId: string; seq: number }) => ({
      status: "input-written",
      ...command,
    }),
    status: async (command: { requestId: string; pluginId: string }) => ({ status: "running", ...command }),
    cleanup: async (command: { requestId: string; pluginId: string }) => {
      cleaned.push(command.requestId);
      return { status: "terminal" };
    },
    closeInput: async () => ({ status: "input-closed" }),
    acknowledge: async () => ({ status: "acknowledged" }),
  };
  const frame = (value: object) => `${JSON.stringify({ v: 1, token: TOKEN, ...value })}\n`;
  const frames = [frame({
    type: "launch",
    commandId: "launch-a",
    requestId: "request-a",
    pluginId: "plugin-a",
    deadlineMs: 5_000,
  })];
  const payload = Buffer.alloc(180_000).toString("base64");
  for (let seq = 1; seq <= 35; seq += 1) {
    frames.push(frame({
      type: "write",
      commandId: `write-a-${seq}`,
      requestId: "request-a",
      pluginId: "plugin-a",
      seq,
      dataBase64: payload,
    }));
  }
  frames.push(frame({ type: "status", commandId: "status-b", requestId: "request-b", pluginId: "plugin-b" }));
  const input = {
    async *[Symbol.asyncIterator]() {
      for (const encoded of frames) yield Buffer.from(encoded);
    },
  };
  await runSupervisorCommandLoop({ input, output, supervisor: supervisor as never, token: TOKEN });

  const responses = outputText.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(cleaned.includes("request-a"));
  assert.ok(responses.some((response) => response.commandId === "write-a-35" && response.type === "error"));
  assert.ok(responses.some((response) => response.commandId === "status-b" && response.type === "result"));
  conformsTo("PNH-INV-38");
});
