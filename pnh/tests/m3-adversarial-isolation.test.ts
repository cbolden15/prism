import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_TRACKED_COMMAND_ALLOCATIONS,
} from "@useprism/sdk/protocol/resource-bounds";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import { runSupervisorCommandLoop } from "../../packages/runtime/src/harness/plugin-container-supervisor.mjs";
import {
  createBrokerGatewayRouter,
  type GatewayRequest,
} from "../../packages/runtime/src/harness/sandbox/broker-gateway.mjs";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLaunchRequest,
  PluginLifecycleReceipt,
} from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import {
  NdjsonFrameDecoder,
  encodePluginFrame,
  type PluginRequestFrame,
} from "@useprism/sdk/protocol";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { runProviderCompletion } from "../../packages/runtime/src/runtime/run-provider.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const TOKEN = "f".repeat(64);
const BROKER_TOKEN = "b".repeat(64);
const SUPERVISOR_TOKEN = "c".repeat(64);
const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class FakeTimers {
  set(): object { return {}; }
  clear(): void {}
}

function commandFrame(value: object): Buffer {
  return Buffer.from(`${JSON.stringify({ v: 1, token: TOKEN, ...value })}\n`);
}

function commandSupervisor() {
  return {
    launch: async (command: { requestId: string; pluginId: string }) => ({ status: "running", ...command }),
    writeInput: async (command: { requestId: string; pluginId: string; seq: number }) => ({
      status: "input-written",
      requestId: command.requestId,
      pluginId: command.pluginId,
      seq: command.seq,
    }),
    status: async (command: { requestId: string; pluginId: string }) => ({ status: "running", ...command }),
    cleanup: async () => ({ status: "terminal" }),
    closeInput: async () => ({ status: "input-closed" }),
    acknowledge: async () => ({ status: "acknowledged" }),
  };
}

test("near-limit attributed input yields the event loop before an unrelated plugin result", async () => {
  const payload = Buffer.alloc(180_000).toString("base64");
  const frames: Buffer[] = [commandFrame({
    type: "launch",
    commandId: "launch-a",
    requestId: "request-a",
    pluginId: "plugin-a",
    deadlineMs: 5_000,
  })];
  for (let seq = 1; seq <= 32; seq += 1) {
    frames.push(commandFrame({
      type: "write",
      commandId: `write-a-${seq}`,
      requestId: "request-a",
      pluginId: "plugin-a",
      seq,
      dataBase64: payload,
    }));
  }
  frames.push(commandFrame({
    type: "status",
    commandId: "status-b",
    requestId: "request-b",
    pluginId: "plugin-b",
  }));
  const input = {
    async *[Symbol.asyncIterator]() {
      for (const frame of frames) yield frame;
    },
  };
  let timerFired = false;
  let unrelatedObservedAfterYield = false;
  const timer = setTimeout(() => { timerFired = true; }, 0);
  const output = new PassThrough();
  output.resume();

  await runSupervisorCommandLoop({
    input,
    output,
    supervisor: commandSupervisor() as never,
    token: TOKEN,
    frameWriter: {
      async write(value: unknown) {
        if ((value as { commandId?: string }).commandId === "status-b") {
          unrelatedObservedAfterYield = timerFired;
        }
      },
      async idle() {},
    },
  });
  clearTimeout(timer);
  assert.equal(unrelatedObservedAfterYield, true, "bounded input monopolized the shared event loop");
  conformsTo("PNH-INV-38");
});

test("command-tracker pressure refuses excess identities without tearing down tracked work", async () => {
  const frames: Buffer[] = [];
  for (let index = 0; index < MAX_TRACKED_COMMAND_ALLOCATIONS; index += 1) {
    frames.push(commandFrame({
      type: "status",
      commandId: `status-${index}`,
      requestId: `request-${index}`,
      pluginId: "plugin-a",
    }));
  }
  frames.push(commandFrame({
    type: "status",
    commandId: "status-excess",
    requestId: "request-excess",
    pluginId: "plugin-b",
  }));
  frames.push(commandFrame({
    type: "status",
    commandId: "status-existing",
    requestId: "request-0",
    pluginId: "plugin-a",
  }));
  const writes: Array<{ type?: string; commandId?: string }> = [];
  const output = new PassThrough();
  output.resume();

  await runSupervisorCommandLoop({
    input: { async *[Symbol.asyncIterator]() { for (const frame of frames) yield frame; } },
    output,
    supervisor: commandSupervisor() as never,
    token: TOKEN,
    frameWriter: {
      async write(value: unknown) { writes.push(value as { type?: string; commandId?: string }); },
      async idle() {},
    },
  });

  assert.ok(writes.some((value) => value.type === "error" && value.commandId === "status-excess"));
  assert.ok(writes.some((value) => value.type === "result" && value.commandId === "status-existing"));
});

function gatewayRequest(operationId: string, requestId: string, pluginId: string): GatewayRequest {
  return { operationId, action: "launch", requestId, pluginId, deadlineMs: 5_000 };
}

test("forged event identity is rejected without contaminating the admitted event chain", async () => {
  const events: unknown[] = [];
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker() {},
    async writeSupervisor() {},
    async emitEvent(event) { events.push(event); },
  });
  const request = gatewayRequest("launch-a", "request-a", "plugin-a");
  const pending = router.request(request);
  await router.receiveBroker({
    v: 1,
    type: "supervisor-command",
    token: BROKER_TOKEN,
    operationId: request.operationId,
    command: {
      type: "launch",
      commandId: request.operationId,
      requestId: request.requestId,
      pluginId: request.pluginId,
      deadlineMs: request.deadlineMs,
    },
  });

  await assert.rejects(router.receiveSupervisor({
    v: 1,
    type: "stream",
    requestId: "request-a",
    pluginId: "plugin-forged",
    channel: "stdout",
    seq: 1,
    dataBase64: Buffer.from("forged").toString("base64"),
  }), /does not match an active allocation/);
  assert.deepEqual(events, []);
  router.supervisorClosed(new Error("test cleanup"));
  await assert.rejects(pending, /test cleanup/);
});

test("shared supervisor loss rejects all work as a control-plane failure, not plugin receipts", async () => {
  const events: unknown[] = [];
  const router = createBrokerGatewayRouter({
    brokerToken: BROKER_TOKEN,
    supervisorToken: SUPERVISOR_TOKEN,
    clock: { now: () => 1_000 },
    timers: new FakeTimers(),
    async writeBroker() {},
    async writeSupervisor() {},
    async emitEvent(event) { events.push(event); },
  });
  const first = router.request(gatewayRequest("launch-a", "request-a", "plugin-a"));
  const second = router.request(gatewayRequest("launch-b", "request-b", "plugin-b"));

  router.supervisorClosed(new Error("shared-control-plane-lost"));
  await assert.rejects(first, /shared-control-plane-lost/);
  await assert.rejects(second, /shared-control-plane-lost/);
  await assert.rejects(
    router.request(gatewayRequest("launch-c", "request-c", "plugin-c")),
    /shared-control-plane-lost/,
  );
  assert.deepEqual(events, []);
});

function providerTicket(): AdmissionTicket {
  const pluginIds = ["memory-golden", "policy-golden", "provider-golden", "renderer-golden", "tool-golden"];
  const generated = generatePluginRegistry({
    pluginsRoot: resolve(pnhRoot, "host-tests", "fixtures", "registration-plugins"),
    environment: "production",
    capabilityCatalog: {
      version: "pnh-capability-catalog-v1",
      capabilities: [{
        id: "allowed-hosts",
        limit: {
          schema: "string-set",
          version: "pnh-capability-limit-v1",
          values: ["api-a", "api-b"],
        },
      }],
    },
    artifactCommitments: Object.fromEntries(pluginIds.map((id, index) => [id, {
      runnerDigest: String(index + 1).repeat(64),
      imageDigest: String(index + 2).repeat(64),
      profileDigest: String(index + 3).repeat(64),
    }])),
  });
  if (!generated.ok) throw new Error("provider registry fixture failed");
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error("provider registry admission failed");
  return admitted.ticket;
}

type ProviderFault = "none" | "malformed" | "forged-identity";

class AdversarialProviderHandle implements PluginContainerHandle {
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  acknowledged = 0;
  private readonly decoder = new NdjsonFrameDecoder();
  private readonly stdout: Array<(bytes: Uint8Array) => void> = [];
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private readonly exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => {
    this.resolveExit = resolvePromise;
  });

  constructor(
    readonly requestId: string,
    readonly pluginId: string,
    private readonly fault: ProviderFault,
  ) {}

  private receipt(): PluginLifecycleReceipt {
    return {
      v: 1,
      requestId: this.requestId,
      pluginId: this.pluginId,
      containerId: `${this.requestId}-process`,
      trigger: "process-exit",
      hardDeadlineAtMs: this.hardDeadlineAtMs,
      daemonState: "exited",
      exitCode: 0,
      oomKilled: false,
      confirmedAbsent: true,
      cleanupErrors: [],
      settledAtMs: Date.now(),
    };
  }

  async writeStdin(bytes: Uint8Array): Promise<void> {
    const decoded = this.decoder.push(bytes);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    for (const frame of decoded.frames) {
      assert.equal(frame.type, "request");
      if (frame.type !== "request") continue;
      this.respond(frame);
    }
  }

  private respond(frame: PluginRequestFrame): void {
    if (frame.phase === "operate" && this.fault === "malformed") {
      for (const listener of this.stdout) listener(Buffer.from("not-json\n"));
      return;
    }
    const result = frame.phase === "register"
      ? { kind: "provider", pluginId: this.pluginId }
      : { providerId: this.pluginId, model: null, text: `answer:${this.requestId}` };
    const response = encodePluginFrame({
      v: 1,
      type: "response",
      requestId: frame.phase === "operate" && this.fault === "forged-identity" ? "forged-request" : frame.requestId,
      seq: frame.seq,
      ok: true,
      result,
      error: null,
    });
    for (const listener of this.stdout) listener(response);
  }

  async closeStdin(): Promise<void> { this.resolveExit(this.receipt()); }
  onStdout(listener: (bytes: Uint8Array) => void): void { this.stdout.push(listener); }
  onStderr(): void {}
  waitForExit(): Promise<PluginLifecycleReceipt> { return this.exited; }
  async stop(): Promise<PluginLifecycleReceipt> {
    const receipt = this.receipt();
    this.resolveExit(receipt);
    return receipt;
  }
  async acknowledge(): Promise<void> { this.acknowledged += 1; }
}

class AdversarialProviderPort implements PluginContainerPort {
  readonly handles: AdversarialProviderHandle[] = [];
  constructor(private readonly badRequestId: string, private readonly fault: ProviderFault) {}

  async launch(request: PluginLaunchRequest): Promise<PluginContainerHandle> {
    const handle = new AdversarialProviderHandle(
      request.requestId,
      request.pluginId,
      request.requestId === this.badRequestId ? this.fault : "none",
    );
    this.handles.push(handle);
    return handle;
  }
}

for (const fault of ["malformed", "forged-identity"] as const) {
  test(`attributed ${fault} provider output settles only its allocation`, async () => {
    const port = new AdversarialProviderPort("bad-request", fault);
    const ticket = providerTicket();
    const invoke = (requestId: string) => runProviderCompletion({
      ticket,
      containerPort: port,
      pluginId: "provider-golden",
      request: { prompt: `prompt:${requestId}`, model: null },
      deadlineMs: Date.now() + 5_000,
      requestId,
    });

    const [bad, good] = await Promise.all([invoke("bad-request"), invoke("good-request")]);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "protocol");
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.response.text, "answer:good-request");
    assert.deepEqual(port.handles.map((handle) => handle.acknowledged), [1, 1]);
  });
}
