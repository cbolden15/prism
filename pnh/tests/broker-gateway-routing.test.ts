import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { PassThrough, type Writable } from "node:stream";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createBrokerGatewayRouter,
  parseGatewayStartupConfig,
  spawnGatewayChildren,
  type GatewayChild,
  type GatewayRequest,
} from "../../packages/runtime/src/harness/sandbox/broker-gateway.mjs";
import { toSupervisorStartupPlugin } from "../../packages/runtime/src/harness/plugin-spawn-supervisor.mjs";
import type { PluginSpawnLaunchSpec } from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";

const testsDirectory = fileURLToPath(new URL(".", import.meta.url));
const runtimeHarnessDirectory = join(
  testsDirectory,
  "..",
  "..",
  "packages",
  "runtime",
  "src",
  "harness",
);
const IMAGE_DIGEST = "a".repeat(64);
const GATEWAY_TOKEN = "b".repeat(64);
const BROKER_TOKEN = "c".repeat(64);
const SUPERVISOR_TOKEN = "d".repeat(64);
const SPAWN_SUPERVISOR_PATH = join(runtimeHarnessDirectory, "plugin-spawn-supervisor.mjs");
const BROKER_GATEWAY_PATH = join(runtimeHarnessDirectory, "sandbox", "broker-gateway.mjs");

function spawnPluginEntry() {
  const spec: PluginSpawnLaunchSpec = {
    pluginId: "tool-golden",
    artifactDigest: "a".repeat(64),
    entrypointPath: "/tmp/pnh-spawn-fixture/entrypoint.mjs",
    cwd: "/tmp/pnh-spawn-fixture",
    env: {},
    envAllowlist: ["PATH"],
    uid: 1000,
    gid: 1000,
  };
  return toSupervisorStartupPlugin(spec);
}

function fakeChild(): GatewayChild {
  const child = new EventEmitter() as GatewayChild;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  const config = new PassThrough();
  config.resume();
  child.stdio = [child.stdin, child.stdout, null, config];
  child.kill = () => true;
  return child;
}

class FakeTimers {
  readonly scheduled: Array<{ callback: () => void; delayMs: number; cleared: boolean }> = [];

  set(callback: () => void, delayMs: number): object {
    const handle = { callback, delayMs, cleared: false };
    this.scheduled.push(handle);
    return handle;
  }

  clear(handle: object): void {
    (handle as { cleared: boolean }).cleared = true;
  }
}

const request: GatewayRequest = {
  operationId: "operation-1",
  action: "launch",
  requestId: "request-1",
  pluginId: "tool-golden",
  deadlineMs: 5_000,
};

function runningResult() {
  return {
    status: "running",
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-1",
    hardDeadlineAtMs: 7_000,
  };
}

test("gateway authenticates and routes one operation across separate broker and supervisor channels", async () => {
  const brokerFrames: unknown[] = [];
  const supervisorFrames: unknown[] = [];
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker(frame) { brokerFrames.push(frame); },
    async writeSupervisor(frame) { supervisorFrames.push(frame); },
  });

  const pending = router.request(request);
  assert.deepEqual(brokerFrames, [{ v: 1, type: "request", token: BROKER_TOKEN, ...request }]);

  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    command: {
      type: "launch",
      commandId: "operation-1",
      requestId: "request-1",
      pluginId: "tool-golden",
      deadlineMs: 5_000,
    },
  });
  assert.deepEqual(supervisorFrames, [{
    v: 1,
    type: "launch",
    token: SUPERVISOR_TOKEN,
    commandId: "operation-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
  }]);

  await router.receiveSupervisor({
    v: 1,
    type: "result",
    commandId: "operation-1",
    result: runningResult(),
  });
  assert.deepEqual(brokerFrames[1], {
    v: 1,
    type: "supervisor-result",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    ok: true,
    result: runningResult(),
    code: null,
  });

  router.receiveBroker({
    v: 1,
    type: "response",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    ok: true,
    result: runningResult(),
    code: null,
  });
  assert.deepEqual(await pending, runningResult());
});

test("broker death rejects pending callers without touching supervisor custody", async () => {
  const supervisorFrames: unknown[] = [];
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker() {},
    async writeSupervisor(frame) { supervisorFrames.push(frame); },
  });
  const pending = router.request(request);

  router.brokerClosed(new Error("broker exited"));
  await assert.rejects(pending, /broker exited/);
  assert.deepEqual(supervisorFrames, []);
  await assert.rejects(router.request({ ...request, operationId: "operation-2" }), /broker exited/);
});

test("gateway rejects broker-forged supervisor authority and unconfirmed cleanup success", async () => {
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker() {},
    async writeSupervisor() {},
  });
  const cleanupRequest = { ...request, action: "cleanup" as const };
  const pending = router.request(cleanupRequest);

  await assert.rejects(
    router.receiveBroker({
      v: 1,
      type: "supervisor-command",
      token: BROKER_TOKEN,
      operationId: "operation-1",
      command: { type: "cleanup", commandId: "operation-1", requestId: "other", pluginId: "tool-golden" },
    }),
    /does not match admitted request/,
  );
  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    command: { type: "cleanup", commandId: "operation-1", requestId: "request-1", pluginId: "tool-golden" },
  });
  const unconfirmed = {
    status: "terminal",
    receipt: { v: 1, requestId: "request-1", pluginId: "tool-golden", confirmedAbsent: false },
  };
  await router.receiveSupervisor({ v: 1, type: "result", commandId: "operation-1", result: unconfirmed });
  router.receiveBroker({
    v: 1,
    type: "response",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    ok: true,
    result: unconfirmed,
    code: null,
  });
  await assert.rejects(pending, /daemon-confirmed absence/);
});

test("gateway binds broker success to the exact routed supervisor result", async () => {
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker() {},
    async writeSupervisor() {},
  });
  const pending = router.request(request);
  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    command: { type: "launch", commandId: "operation-1", requestId: "request-1", pluginId: "tool-golden", deadlineMs: 5_000 },
  });
  await router.receiveSupervisor({ v: 1, type: "result", commandId: "operation-1", result: runningResult() });
  router.receiveBroker({
    v: 1,
    type: "response",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    ok: true,
    result: { ...runningResult(), containerId: "fabricated-container" },
    code: null,
  });
  await assert.rejects(pending, /does not match supervisor result/);
});

test("gateway routes stream writes and authenticated supervisor events for an active allocation", async () => {
  const brokerFrames: unknown[] = [];
  const supervisorFrames: unknown[] = [];
  const events: unknown[] = [];
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker(frame) { brokerFrames.push(frame); },
    async writeSupervisor(frame) { supervisorFrames.push(frame); },
    emitEvent(event) { events.push(event); },
  });

  const launch = router.request(request);
  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    command: { type: "launch", commandId: "operation-1", requestId: "request-1", pluginId: "tool-golden", deadlineMs: 5_000 },
  });
  await router.receiveSupervisor({ v: 1, type: "result", commandId: "operation-1", result: runningResult() });
  await router.receiveBroker({
    v: 1,
    type: "response",
    token: BROKER_TOKEN,
    operationId: "operation-1",
    ok: true,
    result: runningResult(),
    code: null,
  });
  await launch;

  const dataBase64 = Buffer.from("plugin request").toString("base64");
  const write = router.request({
    operationId: "operation-write-1",
    action: "write",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
    seq: 1,
    dataBase64,
  });
  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: "operation-write-1",
    command: {
      type: "write",
      commandId: "operation-write-1",
      requestId: "request-1",
      pluginId: "tool-golden",
      seq: 1,
      dataBase64,
    },
  });
  assert.deepEqual(supervisorFrames.at(-1), {
    v: 1,
    type: "write",
    token: SUPERVISOR_TOKEN,
    commandId: "operation-write-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    seq: 1,
    dataBase64,
  });
  const written = { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 1 };
  await router.receiveSupervisor({ v: 1, type: "result", commandId: "operation-write-1", result: written });
  await router.receiveBroker({
    v: 1,
    type: "response",
    token: BROKER_TOKEN,
    operationId: "operation-write-1",
    ok: true,
    result: written,
    code: null,
  });
  assert.deepEqual(await write, written);

  const stream = {
    v: 1,
    type: "stream",
    requestId: "request-1",
    pluginId: "tool-golden",
    channel: "stdout",
    seq: 1,
    dataBase64: Buffer.from("response").toString("base64"),
  };
  await router.receiveSupervisor(stream);
  assert.deepEqual(brokerFrames.at(-1), { v: 1, type: "supervisor-event", token: BROKER_TOKEN, event: stream });
  await router.receiveBroker({ v: 1, type: "event", token: BROKER_TOKEN, event: stream });
  assert.deepEqual(events, [stream]);

  const terminal = { v: 1, type: "terminal", receipt: terminalResultForGateway() };
  await router.receiveSupervisor(terminal);
  await router.receiveBroker({ v: 1, type: "event", token: BROKER_TOKEN, event: terminal });
  assert.deepEqual(events, [stream, terminal]);
});

function terminalResultForGateway() {
  return {
    v: 1,
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-1",
    trigger: "process-exit",
    hardDeadlineAtMs: 7_000,
    daemonState: "exited",
    exitCode: 0,
    oomKilled: false,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: 2_000,
  };
}

test("gateway owns independently configured broker and supervisor child processes", async () => {
  const spawned: Array<{ path: string; child: GatewayChild }> = [];
  const childConfigs: string[] = [];
  function fakeChild(): GatewayChild {
    const child = new EventEmitter() as GatewayChild;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    const config = new PassThrough();
    const chunks: Buffer[] = [];
    config.on("data", (chunk: Buffer) => chunks.push(chunk));
    config.on("end", () => childConfigs.push(Buffer.concat(chunks).toString("utf8")));
    child.stdio = [child.stdin, child.stdout, null, config];
    child.kill = () => true;
    return child;
  }
  const owned = spawnGatewayChildren({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    plugins: [{ pluginId: "tool-golden", imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] }],
    spawnProcess(_executable, args) {
      const child = fakeChild();
      spawned.push({ path: args[0] ?? "", child });
      return child;
    },
  });

  assert.equal(spawned.length, 2);
  assert.match(spawned[0]?.path ?? "", /plugin-container-supervisor\.mjs$/);
  assert.match(spawned[1]?.path ?? "", /plugin-container-broker\.mjs$/);
  assert.notStrictEqual(owned.supervisor, owned.broker);
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  assert.deepEqual(childConfigs.map((value) => JSON.parse(value)), [
    {
      v: 1,
      token: SUPERVISOR_TOKEN,
      plugins: [{ pluginId: "tool-golden", imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] }],
    },
    { v: 1, token: BROKER_TOKEN },
  ]);
});

test("gateway startup is closed and direct empty-custody shutdown succeeds", async () => {
  const startupText = JSON.stringify({ v: 1, token: GATEWAY_TOKEN, plugins: [] });
  assert.deepEqual(parseGatewayStartupConfig(startupText), { token: GATEWAY_TOKEN, plugins: [] });
  assert.throws(
    () => parseGatewayStartupConfig(JSON.stringify({ ...JSON.parse(startupText), brokerPath: "/tmp/attacker" })),
    /invalid gateway startup configuration/,
  );

  const child = spawn(process.execPath, [BROKER_GATEWAY_PATH], {
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

  const rejected = spawn(process.execPath, [BROKER_GATEWAY_PATH], {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let rejectedStderr = "";
  rejected.stderr.setEncoding("utf8");
  rejected.stderr.on("data", (chunk: string) => { rejectedStderr += chunk; });
  (rejected.stdio[3] as Writable).end(startupText);
  rejected.stdin.end(`${JSON.stringify({
    v: 1,
    type: "request",
    token: "e".repeat(64),
    operationId: "operation-1",
    action: "status",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: Date.now() + 5_000,
  })}\n`);
  const rejectedStatus = await new Promise<number | null>((resolvePromise, reject) => {
    rejected.once("error", reject);
    rejected.once("close", resolvePromise);
  });
  assert.equal(rejectedStatus, 1);
  assert.match(rejectedStderr, /broker gateway failed/);
});

test("spawnGatewayChildren defaults supervisorPath to the Docker supervisor when no override is passed", () => {
  const spawned: Array<{ path: string }> = [];
  spawnGatewayChildren({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    plugins: [{ pluginId: "tool-golden", imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] }],
    spawnProcess(_executable, args) {
      spawned.push({ path: args[0] ?? "" });
      return fakeChild();
    },
  });
  assert.equal(spawned.length, 2);
  assert.match(spawned[0]?.path ?? "", /plugin-container-supervisor\.mjs$/);
});

test("spawnGatewayChildren honors a supervisorPath override and spawns that module instead", () => {
  const spawned: Array<{ path: string }> = [];
  spawnGatewayChildren({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    plugins: [spawnPluginEntry()],
    supervisorPath: SPAWN_SUPERVISOR_PATH,
    spawnProcess(_executable, args) {
      spawned.push({ path: args[0] ?? "" });
      return fakeChild();
    },
  });
  assert.equal(spawned.length, 2);
  assert.match(spawned[0]?.path ?? "", /plugin-spawn-supervisor\.mjs$/);
});

test("spawnGatewayChildren refuses a spawn-shaped launch spec routed to the Docker supervisor", () => {
  assert.throws(
    () => spawnGatewayChildren({
      brokerToken: BROKER_TOKEN,
      supervisorToken: SUPERVISOR_TOKEN,
      plugins: [spawnPluginEntry()],
      spawnProcess() { return fakeChild(); },
    }),
    /spawn/i,
  );
});

test("spawnGatewayChildren refuses a Docker-shaped launch spec routed to the spawn supervisor", () => {
  assert.throws(
    () => spawnGatewayChildren({
      brokerToken: BROKER_TOKEN,
      supervisorToken: SUPERVISOR_TOKEN,
      plugins: [{ pluginId: "tool-golden", imageDigest: IMAGE_DIGEST, createArgs: ["--read-only", `sha256:${IMAGE_DIGEST}`] }],
      supervisorPath: SPAWN_SUPERVISOR_PATH,
      spawnProcess() { return fakeChild(); },
    }),
    /spawn/i,
  );
});
