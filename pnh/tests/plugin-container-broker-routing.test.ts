import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPluginContainerBroker,
  runBrokerCommandLoop,
  type BrokerRequest,
  type SupervisorCommand,
  type SupervisorCommandResult,
} from "../../packages/runtime/src/harness/plugin-container-broker.mjs";

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

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
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

  fire(index = 0): void {
    const timer = this.scheduled[index];
    if (timer !== undefined && !timer.cleared) timer.callback();
  }
}

const request: BrokerRequest = {
  operationId: "operation-1",
  action: "launch",
  requestId: "request-1",
  pluginId: "tool-golden",
  deadlineMs: 5_000,
};

function terminalResult(confirmedAbsent: boolean): SupervisorCommandResult {
  return {
    status: "terminal",
    receipt: {
      v: 1,
      requestId: "request-1",
      pluginId: "tool-golden",
      containerId: "container-1",
      trigger: "broker-stop",
      hardDeadlineAtMs: 7_000,
      daemonState: "exited",
      exitCode: 0,
      oomKilled: false,
      confirmedAbsent,
      cleanupErrors: [],
      settledAtMs: 2_000,
    },
  };
}

test("broker maps admitted requests to supervisor RPC without Docker authority", async () => {
  const source = readFileSync(join(runtimeHarnessDirectory, "plugin-container-broker.mjs"), "utf8");
  assert.doesNotMatch(source, /node:child_process|\bspawn\s*\(|\bexec(?:File)?\s*\(/);

  const sent: SupervisorCommand[] = [];
  const response = deferred<SupervisorCommandResult>();
  const timers = new FakeTimers();
  const broker = createPluginContainerBroker({
    clock: { now: () => 1_000 },
    timers,
    sendSupervisor(command) {
      sent.push(command);
      return response.promise;
    },
  });

  const pending = broker.request(request);
  assert.deepEqual(sent, [{
    type: "launch",
    commandId: "operation-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
  }]);
  assert.equal(timers.scheduled[0]?.delayMs, 4_000);

  response.resolve({
    status: "running",
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-1",
    hardDeadlineAtMs: 7_000,
  });
  assert.deepEqual(await pending, {
    status: "running",
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-1",
    hardDeadlineAtMs: 7_000,
  });
});

test("broker reports cleanup success only from a daemon-confirmed terminal receipt", async () => {
  const replies = [terminalResult(false), terminalResult(true)];
  const broker = createPluginContainerBroker({
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async sendSupervisor() {
      const result = replies.shift();
      if (result === undefined) throw new Error("missing fake reply");
      return result;
    },
  });
  const cleanup = { ...request, action: "cleanup" as const };

  await assert.rejects(broker.request(cleanup), /daemon-confirmed absence/);
  assert.deepEqual(await broker.request({ ...cleanup, operationId: "operation-2" }), terminalResult(true));
});

test("broker maps bounded stream writes to supervisor-only input authority", async () => {
  const commands: SupervisorCommand[] = [];
  const broker = createPluginContainerBroker({
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async sendSupervisor(command) {
      commands.push(command);
      return { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 1 };
    },
  });
  const dataBase64 = Buffer.from("plugin request").toString("base64");
  assert.deepEqual(await broker.request({
    operationId: "operation-write-1",
    action: "write",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
    seq: 1,
    dataBase64,
  }), { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 1 });
  assert.deepEqual(commands, [{
    type: "write",
    commandId: "operation-write-1",
    requestId: "request-1",
    pluginId: "tool-golden",
    seq: 1,
    dataBase64,
  }]);
});

test("deadline and transport close reject pending broker requests exactly once", async () => {
  const first = deferred<SupervisorCommandResult>();
  const second = deferred<SupervisorCommandResult>();
  const responses = [first, second];
  const timers = new FakeTimers();
  const broker = createPluginContainerBroker({
    clock: { now: () => 1_000 },
    timers,
    sendSupervisor() {
      const response = responses.shift();
      if (response === undefined) throw new Error("missing fake response");
      return response.promise;
    },
  });

  const timedOut = broker.request(request);
  timers.fire(0);
  await assert.rejects(timedOut, /deadline exceeded/);
  first.resolve(terminalResult(true));
  await Promise.resolve();

  const closed = broker.request({ ...request, operationId: "operation-2" });
  broker.close(new Error("gateway transport closed"));
  await assert.rejects(closed, /gateway transport closed/);
  second.resolve(terminalResult(true));
  await Promise.resolve();
  await assert.rejects(broker.request({ ...request, operationId: "operation-3" }), /gateway transport closed/);
});

test("spawn protocol authenticates both directions and settles a routed request", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  const token = "f".repeat(64);
  let resolveCommand!: (value: Record<string, unknown>) => void;
  const command = new Promise<Record<string, unknown>>((resolvePromise) => { resolveCommand = resolvePromise; });
  let buffered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    chunks.push(Buffer.from(chunk));
    buffered += chunk;
    const newline = buffered.indexOf("\n");
    if (newline !== -1) resolveCommand(JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>);
  });
  const loop = runBrokerCommandLoop({
    input,
    output,
    token,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
  });
  input.write(`${JSON.stringify({ v: 1, type: "request", token, ...request })}\n`);
  const routed = await command;
  assert.equal(routed.type, "supervisor-command");
  assert.equal(routed.token, token);

  input.end(`${JSON.stringify({
    v: 1,
    type: "supervisor-result",
    token,
    operationId: "operation-1",
    ok: true,
    result: runningResultForBroker(),
    code: null,
  })}\n`);
  await loop;
  const frames = Buffer.concat(chunks).toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1], {
    v: 1,
    type: "response",
    token,
    operationId: "operation-1",
    ok: true,
    result: runningResultForBroker(),
    code: null,
  });
});

test("spawn protocol rejects a stale gateway token before supervisor routing", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const loop = runBrokerCommandLoop({
    input,
    output,
    token: "f".repeat(64),
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
  });
  input.end(`${JSON.stringify({ v: 1, type: "request", token: "e".repeat(64), ...request })}\n`);
  await assert.rejects(loop, /authentication failed/);
});

test("spawn protocol forwards authenticated supervisor stream and terminal events", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  const token = "f".repeat(64);
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const loop = runBrokerCommandLoop({ input, output, token });
  const stream = {
    v: 1,
    type: "stream",
    requestId: "request-1",
    pluginId: "tool-golden",
    channel: "stdout",
    seq: 1,
    dataBase64: Buffer.from("response").toString("base64"),
  };
  const terminalLifecycle = terminalResult(true);
  assert.equal(terminalLifecycle.status, "terminal");
  if (terminalLifecycle.status !== "terminal") return;
  const terminal = {
    v: 1,
    type: "terminal",
    receipt: terminalLifecycle.receipt,
  };
  input.end(
    `${JSON.stringify({ v: 1, type: "supervisor-event", token, event: stream })}\n` +
    `${JSON.stringify({ v: 1, type: "supervisor-event", token, event: terminal })}\n`,
  );
  await loop;

  assert.deepEqual(
    Buffer.concat(chunks).toString("utf8").trim().split("\n").map((line) => JSON.parse(line)),
    [
      { v: 1, type: "event", token, event: stream },
      { v: 1, type: "event", token, event: terminal },
    ],
  );
});

function runningResultForBroker(): SupervisorCommandResult {
  return {
    status: "running",
    requestId: "request-1",
    pluginId: "tool-golden",
    containerId: "container-1",
    hardDeadlineAtMs: 7_000,
  };
}
