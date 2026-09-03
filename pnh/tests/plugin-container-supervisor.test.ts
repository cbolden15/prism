import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { PassThrough, type Writable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import {
  CLEANUP_GRACE_MS,
  MAX_STREAM_CHUNK_BYTES,
  createDockerCliLifecyclePort,
  createPluginContainerSupervisor,
  parseSupervisorStartupConfig,
  runSupervisorCommandLoop,
  type DockerLifecyclePort,
  type DockerObservation,
  type SupervisorTimerPort,
} from "../../packages/runtime/src/harness/plugin-container-supervisor.mjs";

const IMAGE_DIGEST = "a".repeat(64);
const testsDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeHarnessDirectory = join(
  testsDirectory,
  "..",
  "..",
  "packages",
  "runtime",
  "src",
  "harness",
);

class FakeClock {
  nowMs = 1_000;

  now = (): number => this.nowMs;
}

class FakeTimers implements SupervisorTimerPort {
  readonly scheduled: Array<{ callback: () => void; delayMs: number; cleared: boolean }> = [];

  set(callback: () => void, delayMs: number): object {
    const timer = { callback, delayMs, cleared: false };
    this.scheduled.push(timer);
    return timer;
  }

  clear(handle: object): void {
    const timer = handle as { cleared: boolean };
    timer.cleared = true;
  }

  fire(index = 0): void {
    const timer = this.scheduled[index];
    assert.ok(timer);
    if (!timer.cleared) timer.callback();
  }
}

class FakeDocker implements DockerLifecyclePort {
  readonly calls: string[] = [];
  readonly streamCalls: string[] = [];
  readonly written: Uint8Array[] = [];
  readonly observations = new Map<string, DockerObservation>();
  stopLeavesRunning = false;
  private attachedHandlers?: {
    onStdout(bytes: Uint8Array): void;
    onStderr(bytes: Uint8Array): void;
    onClose(): void;
  };

  async create(input: {
    containerName: string;
    requestId: string;
    pluginId: string;
    imageDigest: string;
    createArgs: readonly string[];
  }): Promise<string> {
    this.calls.push("create");
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
    this.calls.push("startAttached");
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "running", running: true });
    this.attachedHandlers = handlers;
    return {
      write: async (bytes: Uint8Array) => {
        this.streamCalls.push("write");
        this.written.push(bytes.slice());
      },
      closeInput: async () => {
        this.streamCalls.push("closeInput");
      },
    };
  }

  emitStdout(bytes: Uint8Array): void {
    this.attachedHandlers?.onStdout(bytes);
  }

  emitStderr(bytes: Uint8Array): void {
    this.attachedHandlers?.onStderr(bytes);
  }

  exit(containerId: string, exitCode = 0, oomKilled = false): void {
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode, oomKilled });
    this.attachedHandlers?.onClose();
  }

  async inspect(containerRef: string): Promise<DockerObservation | null> {
    this.calls.push("inspect");
    return this.observations.get(containerRef) ?? null;
  }

  async stop(containerId: string): Promise<void> {
    this.calls.push("stop");
    if (this.stopLeavesRunning) return;
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode: 0 });
  }

  async kill(containerId: string): Promise<void> {
    this.calls.push("kill");
    const observation = this.require(containerId);
    this.replace(observation, { ...observation, state: "exited", running: false, exitCode: 137 });
  }

  async remove(containerId: string): Promise<void> {
    this.calls.push("remove");
    const observation = this.require(containerId);
    for (const [key, value] of this.observations) {
      if (value.containerId === observation.containerId) this.observations.delete(key);
    }
  }

  private require(containerRef: string): DockerObservation {
    const observation = this.observations.get(containerRef);
    if (observation === undefined) throw new Error("missing fake container");
    return observation;
  }

  private replace(previous: DockerObservation, next: DockerObservation): void {
    for (const [key, value] of this.observations) {
      if (value.containerId === previous.containerId) this.observations.set(key, next);
    }
  }
}

function setup() {
  const docker = new FakeDocker();
  const clock = new FakeClock();
  const timers = new FakeTimers();
  const events: unknown[] = [];
  const supervisor = createPluginContainerSupervisor({
    docker,
    clock,
    timers,
    resolveLaunchSpec(pluginId) {
      if (pluginId !== "tool-golden") return undefined;
      return { imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] };
    },
    emitEvent(event) {
      events.push(event);
    },
  });
  return { clock, docker, events, supervisor, timers };
}

const launchRequest = {
  requestId: "request-1",
  pluginId: "tool-golden",
  deadlineMs: 5_000,
};

test("duplicate launch allocation returns one running lifecycle without a second create", async () => {
  const { docker, supervisor, timers } = setup();
  const [first, duplicate] = await Promise.all([
    supervisor.launch(launchRequest),
    supervisor.launch(launchRequest),
  ]);

  assert.deepEqual(first, duplicate);
  assert.equal(first.status, "running");
  assert.deepEqual(docker.calls, ["inspect", "create", "inspect", "startAttached"]);
  assert.equal(timers.scheduled.length, 1);
  assert.equal(timers.scheduled[0]?.delayMs, launchRequest.deadlineMs + CLEANUP_GRACE_MS - 1_000);
  await assert.rejects(
    supervisor.launch({ ...launchRequest, pluginId: "other-plugin" }),
    /allocation identity conflict/,
  );
});

test("cleanup awaits stop, inspects, escalates kill, removes, and confirms daemon absence", async () => {
  const { docker, supervisor } = setup();
  docker.stopLeavesRunning = true;
  await supervisor.launch(launchRequest);
  docker.calls.length = 0;

  const result = await supervisor.cleanup({
    requestId: launchRequest.requestId,
    pluginId: launchRequest.pluginId,
    trigger: "broker-stop",
  });
  assert.equal(result.status, "terminal");
  if (result.status !== "terminal") return;
  assert.deepEqual(docker.calls, ["inspect", "stop", "inspect", "kill", "inspect", "remove", "inspect"]);
  assert.deepEqual(result.receipt, {
    v: 1,
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-request-1",
    trigger: "broker-stop",
    hardDeadlineAtMs: 7_000,
    daemonState: "exited",
    exitCode: 137,
    oomKilled: false,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: 1_000,
  });
  assert.equal(Object.isFrozen(result.receipt), true);

  const persisted = await supervisor.status(launchRequest);
  assert.strictEqual(persisted.status === "terminal" ? persisted.receipt : undefined, result.receipt);
  assert.deepEqual(await supervisor.acknowledge(launchRequest), {
    status: "acknowledged",
    requestId: "request-1",
    pluginId: "tool-golden",
  });
  assert.deepEqual(await supervisor.status(launchRequest), {
    status: "acknowledged",
    requestId: "request-1",
    pluginId: "tool-golden",
  });
  assert.deepEqual(await supervisor.launch(launchRequest), {
    status: "acknowledged",
    requestId: "request-1",
    pluginId: "tool-golden",
  });
});

test("deadline and broker cleanup race through one owner into one lifecycle receipt", async () => {
  conformsTo("PNH-INV-23");
  const { docker, supervisor, timers } = setup();
  await supervisor.launch(launchRequest);
  docker.calls.length = 0;

  timers.fire();
  const brokerCleanup = supervisor.cleanup({
    requestId: launchRequest.requestId,
    pluginId: launchRequest.pluginId,
    trigger: "broker-stop",
  });
  await supervisor.idle();
  const fromBroker = await brokerCleanup;
  const status = await supervisor.status(launchRequest);
  assert.equal(fromBroker.status, "terminal");
  assert.equal(status.status, "terminal");
  if (fromBroker.status === "terminal" && status.status === "terminal") {
    assert.strictEqual(status.receipt, fromBroker.receipt);
    assert.equal(status.receipt.trigger, "deadline");
  }
  assert.equal(docker.calls.filter((call) => call === "stop").length, 1);
  assert.equal(docker.calls.filter((call) => call === "remove").length, 1);
});

test("broker disappearance cannot cancel the independent hard-deadline timer", async () => {
  conformsTo("PNH-INV-23");
  const { supervisor, timers } = setup();
  await supervisor.launch(launchRequest);
  timers.fire();
  await supervisor.idle();

  const result = await supervisor.status(launchRequest);
  assert.equal(result.status, "terminal");
  if (result.status === "terminal") {
    assert.equal(result.receipt.trigger, "deadline");
    assert.equal(result.receipt.confirmedAbsent, true);
  }
});

test("supervisor shutdown cleans active allocations through the same receipt path", async () => {
  const { supervisor } = setup();
  await supervisor.launch(launchRequest);
  const receipts = await supervisor.shutdown();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.trigger, "supervisor-shutdown");
  assert.equal(receipts[0]?.confirmedAbsent, true);
  const status = await supervisor.status(launchRequest);
  assert.equal(status.status, "terminal");
});

test("supervisor owns attached stdin with ordered writes and explicit input close", async () => {
  const { docker, supervisor } = setup();
  await supervisor.launch(launchRequest);

  assert.deepEqual(await supervisor.writeInput({
    requestId: "request-1",
    pluginId: "tool-golden",
    seq: 1,
    bytes: Buffer.from("request bytes"),
  }), {
    status: "input-written",
    requestId: "request-1",
    pluginId: "tool-golden",
    seq: 1,
  });
  assert.deepEqual(docker.written.map((bytes) => Buffer.from(bytes).toString("utf8")), ["request bytes"]);
  await assert.rejects(
    supervisor.writeInput({
      requestId: "request-1",
      pluginId: "tool-golden",
      seq: 1,
      bytes: Buffer.from("duplicate"),
    }),
    /input sequence/,
  );
  assert.deepEqual(await supervisor.closeInput(launchRequest), {
    status: "input-closed",
    requestId: "request-1",
    pluginId: "tool-golden",
  });
  assert.deepEqual(docker.streamCalls, ["write", "closeInput"]);
  await assert.rejects(
    supervisor.writeInput({
      requestId: "request-1",
      pluginId: "tool-golden",
      seq: 2,
      bytes: Buffer.from("late"),
    }),
    /input is closed/,
  );
});

test("attached stdout and stderr are sequenced before natural exit cleanup emits one receipt", async () => {
  const { docker, events, supervisor } = setup();
  const launch = await supervisor.launch(launchRequest);
  assert.equal(launch.status, "running");
  if (launch.status !== "running" || launch.containerId === null) return;

  docker.emitStdout(Buffer.from("stdout"));
  docker.emitStderr(Buffer.from("stderr"));
  await supervisor.idle();
  docker.exit(launch.containerId, 0, false);
  await supervisor.idle();

  assert.deepEqual(events.slice(0, 2), [
    {
      v: 1,
      type: "stream",
      requestId: "request-1",
      pluginId: "tool-golden",
      channel: "stdout",
      seq: 1,
      dataBase64: Buffer.from("stdout").toString("base64"),
    },
    {
      v: 1,
      type: "stream",
      requestId: "request-1",
      pluginId: "tool-golden",
      channel: "stderr",
      seq: 2,
      dataBase64: Buffer.from("stderr").toString("base64"),
    },
  ]);
  const terminal = events[2] as { type: string; receipt: { trigger: string; confirmedAbsent: boolean; exitCode: number | null } };
  assert.equal(terminal.type, "terminal");
  assert.equal(terminal.receipt.trigger, "process-exit");
  assert.equal(terminal.receipt.confirmedAbsent, true);
  assert.equal(terminal.receipt.exitCode, 0);
  assert.equal(events.length, 3);
});

test("oversized attached output fails closed through supervisor cleanup", async () => {
  const { docker, events, supervisor } = setup();
  await supervisor.launch(launchRequest);
  docker.emitStdout(Buffer.alloc(MAX_STREAM_CHUNK_BYTES + 1));
  await supervisor.idle();

  const terminal = events.at(-1) as { type: string; receipt: { trigger: string; confirmedAbsent: boolean } };
  assert.equal(terminal.type, "terminal");
  assert.equal(terminal.receipt.trigger, "stream-overflow");
  assert.equal(terminal.receipt.confirmedAbsent, true);
  assert.equal(events.some((event) => (event as { type?: string }).type === "stream"), false);
});

test("Docker CLI adapter owns the exact lifecycle command vocabulary", async () => {
  const commands: string[][] = [];
  const inspectValue = [{
    Id: "container-1",
    Image: `sha256:${IMAGE_DIGEST}`,
    Config: {
      Labels: {
        "org.pnh.request-id": "request-1",
        "org.pnh.plugin-id": "tool-golden",
      },
    },
    State: {
      Status: "running",
      Running: true,
      ExitCode: 0,
      OOMKilled: false,
    },
  }];
  const port = createDockerCliLifecyclePort({
    async runDocker(args) {
      commands.push([...args]);
      if (args[0] === "create") return { status: 0, stdout: "container-1\n", stderr: "" };
      if (args[0] === "inspect" && args[1] === "absent") {
        return { status: 1, stdout: "", stderr: "Error: No such object: absent" };
      }
      if (args[0] === "inspect") return { status: 0, stdout: JSON.stringify(inspectValue), stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    spawnAttached(args, handlers) {
      commands.push([...args]);
      handlers.onStdout(Buffer.from("attached"));
      return {
        async write() {},
        async closeInput() {},
      };
    },
  });

  assert.equal(await port.create({
    containerName: "pnh-plugin-test",
    requestId: "request-1",
    pluginId: "tool-golden",
    imageDigest: IMAGE_DIGEST,
    createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`],
  }), "container-1");
  assert.deepEqual(commands[0], [
    "create",
    "--name",
    "pnh-plugin-test",
    "--label",
    "org.pnh.request-id=request-1",
    "--label",
    "org.pnh.plugin-id=tool-golden",
    "--read-only",
    `sha256:${IMAGE_DIGEST}`,
  ]);

  assert.deepEqual(await port.inspect("container-1"), {
    containerId: "container-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    imageDigest: IMAGE_DIGEST,
    state: "running",
    running: true,
    exitCode: 0,
    oomKilled: false,
  });
  assert.equal(await port.inspect("absent"), null);
  const attachedOutput: string[] = [];
  await port.startAttached("container-1", {
    onStdout(bytes) { attachedOutput.push(Buffer.from(bytes).toString("utf8")); },
    onStderr() {},
    onClose() {},
  });
  await port.stop("container-1");
  await port.kill("container-1");
  await port.remove("container-1");
  assert.deepEqual(commands.slice(-4), [
    ["start", "-a", "-i", "container-1"],
    ["stop", "--time", "1", "container-1"],
    ["kill", "container-1"],
    ["rm", "-f", "container-1"],
  ]);
  assert.deepEqual(attachedOutput, ["attached"]);
});

test("spawnable command loop authenticates canonical commands and never exposes Docker", async () => {
  const { docker, supervisor } = setup();
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const token = "f".repeat(64);
  const loop = runSupervisorCommandLoop({ input, output, supervisor, token });
  input.end(Buffer.from(`${JSON.stringify({
    v: 1,
    type: "launch",
    token,
    commandId: "command-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
  })}\n`));
  await loop;

  assert.equal(docker.calls.filter((call) => call === "create").length, 1);
  const response = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(response.type, "result");
  assert.equal(response.commandId, "command-1");
  assert.equal(response.result.status, "running");
});

test("wrong command authentication fails before allocation", async () => {
  const { docker, supervisor } = setup();
  const input = new PassThrough();
  const output = new PassThrough();
  const loop = runSupervisorCommandLoop({ input, output, supervisor, token: "f".repeat(64) });
  input.end(Buffer.from(`${JSON.stringify({
    v: 1,
    type: "launch",
    token: "e".repeat(64),
    commandId: "command-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
  })}\n`));
  await assert.rejects(loop, /authentication failed/);
  assert.equal(docker.calls.length, 0);
});

test("fixed-FD startup configuration is canonical, closed, and plugin-bound", () => {
  const text = JSON.stringify({
    v: 1,
    token: "f".repeat(64),
    plugins: [{
      pluginId: "tool-golden",
      imageDigest: IMAGE_DIGEST,
      createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`],
    }],
  });
  const startup = parseSupervisorStartupConfig(text);
  assert.deepEqual(startup.resolveLaunchSpec("tool-golden"), {
    imageDigest: IMAGE_DIGEST,
    createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`],
  });
  assert.equal(startup.resolveLaunchSpec("unknown"), undefined);
  assert.throws(() => parseSupervisorStartupConfig(`${text}\n`), /invalid supervisor startup configuration/);
  assert.throws(
    () => parseSupervisorStartupConfig(JSON.stringify({ ...JSON.parse(text), extra: true })),
    /invalid supervisor startup configuration/,
  );
  assert.throws(
    () => parseSupervisorStartupConfig(JSON.stringify({
      ...JSON.parse(text),
      plugins: [{
        pluginId: "tool-golden",
        imageDigest: IMAGE_DIGEST,
        createArgs: ["--name=attacker-name", `sha256:${IMAGE_DIGEST}`],
      }],
    })),
    /override supervisor custody/,
  );
});

test("the supervisor file is directly spawnable with fixed-FD startup custody", async () => {
  const startupText = JSON.stringify({
    v: 1,
    token: "f".repeat(64),
    plugins: [],
  });
  const child = spawn(process.execPath, [join(runtimeHarnessDirectory, "plugin-container-supervisor.mjs")], {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  (child.stdio[3] as Writable).end(startupText);
  child.stdin.end();
  const status = await new Promise<number | null>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
  assert.equal(status, 0, stderr);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});
