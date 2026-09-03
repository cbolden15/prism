import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createDockerBrokerPluginContainer,
  type GatewayByteTransport,
} from "../../packages/runtime/src/adapters/docker-broker-plugin-container.ts";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";

const TOKEN = "a".repeat(64);

class FakeTransport implements GatewayByteTransport {
  readonly sent: Record<string, unknown>[] = [];
  private dataListeners: Array<(bytes: Uint8Array) => void> = [];
  private closeListeners: Array<(error?: Error) => void> = [];

  async write(bytes: Uint8Array): Promise<void> {
    this.sent.push(JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>);
  }

  onData(listener: (bytes: Uint8Array) => void): void {
    this.dataListeners.push(listener);
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListeners.push(listener);
  }

  emit(...frames: unknown[]): void {
    const bytes = Buffer.from(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""));
    for (const listener of this.dataListeners) listener(bytes);
  }

  emitRaw(bytes: Uint8Array): void {
    for (const listener of this.dataListeners) listener(bytes);
  }

  close(error = new Error("gateway closed")): void {
    for (const listener of this.closeListeners) listener(error);
  }
}

function ticket(): AdmissionTicket {
  const registry = {
    version: "pnh-plugin-registry-v3",
    environment: "production",
    capabilityCatalog: { version: "pnh-capability-catalog-v1", capabilities: [] },
    plugins: [{
      id: "tool-golden",
      version: "1.0.0",
      apiVersion: 1,
      kind: "tool",
      compatibility: { kernelApiVersion: "pnh-kernel-v1" },
      entrypoint: "index.mjs",
      files: ["index.mjs"],
      dependencies: [],
      requestedCapabilities: [],
      license: { spdxId: "MIT", holder: "PNH" },
      manifestDigest: "b".repeat(64),
      sourceDigest: "c".repeat(64),
      versionDigest: "d".repeat(64),
      runnerDigest: "e".repeat(64),
      imageDigest: "f".repeat(64),
      profileDigest: "0".repeat(64),
    }],
  };
  const bytes = Buffer.from(JSON.stringify(registry));
  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(admitted.ok, true);
  if (!admitted.ok) throw new Error("fixture admission failed");
  return admitted.ticket;
}

function terminalReceipt(confirmedAbsent = true) {
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
    confirmedAbsent,
    cleanupErrors: [],
    settledAtMs: 2_000,
  };
}

function setup() {
  const transport = new FakeTransport();
  let operation = 0;
  const port = createDockerBrokerPluginContainer({
    ticket: ticket(),
    token: TOKEN,
    transport,
    clock: { now: () => 1_000 },
    randomId: () => `operation-${++operation}`,
  });
  return { port, transport };
}

async function launch() {
  const context = setup();
  const pending = context.port.launch({ requestId: "request-1", pluginId: "tool-golden", deadlineMs: 5_000 });
  assert.deepEqual(context.transport.sent[0], {
    v: 1,
    type: "request",
    token: TOKEN,
    operationId: "operation-1",
    action: "launch",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
  });
  context.transport.emit({
    v: 1,
    type: "response",
    operationId: "operation-1",
    ok: true,
    result: {
      status: "running",
      requestId: "request-1",
      pluginId: "tool-golden",
      containerId: "container-1",
      hardDeadlineAtMs: 7_000,
    },
    code: null,
  });
  await Promise.resolve();
  return { ...context, handle: await pending };
}

test("adapter requires an opaque admission ticket before opening transport authority", () => {
  assert.throws(
    () => createDockerBrokerPluginContainer({
      ticket: {} as AdmissionTicket,
      token: TOKEN,
      transport: new FakeTransport(),
    }),
    /unverified admission ticket/,
  );
});

test("adapter launches, applies write backpressure, streams output, and acknowledges terminal custody", async () => {
  const { handle, transport } = await launch();
  const stdout: string[] = [];
  const stderr: string[] = [];
  handle.onStdout((bytes) => stdout.push(Buffer.from(bytes).toString("utf8")));
  handle.onStderr((bytes) => stderr.push(Buffer.from(bytes).toString("utf8")));

  const write = handle.writeStdin(Buffer.from("request"));
  await Promise.resolve();
  assert.deepEqual(transport.sent[1], {
    v: 1,
    type: "request",
    token: TOKEN,
    operationId: "operation-2",
    action: "write",
    requestId: "request-1",
    pluginId: "tool-golden",
    deadlineMs: 5_000,
    seq: 1,
    dataBase64: Buffer.from("request").toString("base64"),
  });
  transport.emit({
    v: 1,
    type: "response",
    operationId: "operation-2",
    ok: true,
    result: { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 1 },
    code: null,
  });
  await write;

  transport.emit(
    { v: 1, type: "event", event: {
      v: 1,
      type: "stream",
      requestId: "request-1",
      pluginId: "tool-golden",
      channel: "stdout",
      seq: 1,
      dataBase64: Buffer.from("response").toString("base64"),
    } },
    { v: 1, type: "event", event: {
      v: 1,
      type: "stream",
      requestId: "request-1",
      pluginId: "tool-golden",
      channel: "stderr",
      seq: 2,
      dataBase64: Buffer.from("diagnostic").toString("base64"),
    } },
    { v: 1, type: "event", event: { v: 1, type: "terminal", receipt: terminalReceipt() } },
  );
  assert.deepEqual(await handle.waitForExit(), terminalReceipt());
  assert.deepEqual(stdout, ["response"]);
  assert.deepEqual(stderr, ["diagnostic"]);

  const acknowledge = handle.acknowledge(8_000);
  transport.emit({
    v: 1,
    type: "response",
    operationId: "operation-3",
    ok: true,
    result: { status: "acknowledged", requestId: "request-1", pluginId: "tool-golden" },
    code: null,
  });
  await acknowledge;
});

test("concurrent adapter writes serialize behind acknowledged backpressure", async () => {
  const { handle, transport } = await launch();
  const first = handle.writeStdin(Buffer.from("first"));
  const second = handle.writeStdin(Buffer.from("second"));
  await Promise.resolve();
  assert.equal(transport.sent.length, 2);
  assert.equal(transport.sent[1]?.seq, 1);

  transport.emit({
    v: 1,
    type: "response",
    operationId: "operation-2",
    ok: true,
    result: { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 1 },
    code: null,
  });
  await first;
  await Promise.resolve();
  assert.equal(transport.sent.length, 3);
  assert.equal(transport.sent[2]?.operationId, "operation-3");
  assert.equal(transport.sent[2]?.seq, 2);
  transport.emit({
    v: 1,
    type: "response",
    operationId: "operation-3",
    ok: true,
    result: { status: "input-written", requestId: "request-1", pluginId: "tool-golden", seq: 2 },
    code: null,
  });
  await second;
});

test("duplicate responses and extra output after terminal fail closed", async () => {
  const first = setup();
  const pending = first.port.launch({ requestId: "request-1", pluginId: "tool-golden", deadlineMs: 5_000 });
  const response = {
    v: 1,
    type: "response",
    operationId: "operation-1",
    ok: true,
    result: { status: "running", requestId: "request-1", pluginId: "tool-golden", containerId: "container-1", hardDeadlineAtMs: 7_000 },
    code: null,
  };
  first.transport.emit(response, response);
  await assert.rejects(pending, /duplicate gateway response/);

  const second = await launch();
  second.transport.emit(
    { v: 1, type: "event", event: { v: 1, type: "terminal", receipt: terminalReceipt() } },
    { v: 1, type: "event", event: {
      v: 1,
      type: "stream",
      requestId: "request-1",
      pluginId: "tool-golden",
      channel: "stdout",
      seq: 1,
      dataBase64: Buffer.from("late").toString("base64"),
    } },
  );
  await assert.rejects(second.handle.waitForExit(), /output after terminal/);
});

test("stop accepts the identical terminal receipt from event and cleanup response", async () => {
  const { handle, transport } = await launch();
  const stopping = handle.stop();
  const receipt = terminalReceipt();
  transport.emit(
    { v: 1, type: "event", event: { v: 1, type: "terminal", receipt } },
    {
      v: 1,
      type: "response",
      operationId: "operation-2",
      ok: true,
      result: { status: "terminal", receipt },
      code: null,
    },
  );
  assert.deepEqual(await stopping, receipt);
  assert.deepEqual(await handle.waitForExit(), receipt);
});

test("transport close rejects pending launch and active handle exit", async () => {
  const pendingContext = setup();
  const pending = pendingContext.port.launch({ requestId: "request-1", pluginId: "tool-golden", deadlineMs: 5_000 });
  pendingContext.transport.close();
  await assert.rejects(pending, /gateway closed/);

  const active = await launch();
  active.transport.close();
  await assert.rejects(active.handle.waitForExit(), /gateway closed/);
  await assert.rejects(active.handle.writeStdin(Buffer.from("late")), /gateway closed/);
});

test("invalid UTF-8 and unconfirmed terminal receipts fail active handles closed", async () => {
  const invalid = await launch();
  invalid.transport.emitRaw(Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x0a]));
  await assert.rejects(invalid.handle.waitForExit(), /UTF-8/);

  const unconfirmed = await launch();
  unconfirmed.transport.emit({
    v: 1,
    type: "event",
    event: { v: 1, type: "terminal", receipt: terminalReceipt(false) },
  });
  await assert.rejects(unconfirmed.handle.waitForExit(), /daemon-confirmed absence/);
});
