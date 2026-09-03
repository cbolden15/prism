import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLifecycleReceipt,
} from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import {
  admitPluginAuthority,
  type AdmittedPluginAuthority,
  type CoreAdmissionPort,
} from "../../packages/runtime/src/kernel/plugin-kernel.ts";
import { NdjsonFrameDecoder, encodePluginFrame, type PluginRequestFrame } from "@useprism/sdk/protocol";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { runToolTask } from "../../packages/runtime/src/runtime/run-task.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [{
    id: "tool-operation",
    limit: { schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled: true },
  }],
};
const operationInput = {
  capabilityId: "tool-operation",
  requested: { schema: "boolean-gate" as const, version: "pnh-capability-request-v1" as const, enabled: true },
};
const corePort: CoreAdmissionPort = {
  async deriveCapabilityGrant(input) {
    return {
      ok: true,
      grant: {
        parentGrantDigest: input.parentGrantDigest,
        taskDigest: input.taskDigest,
        pluginId: input.pluginId,
        pluginSetDigest: input.pluginSetDigest,
        catalogDigest: createHash("sha256").update(JSON.stringify(input.catalog)).digest("hex"),
        capabilities: input.requested,
      },
      digest: createHash("sha256").update(`grant:${input.pluginId}`).digest("hex"),
    };
  },
};

function ticket(): AdmissionTicket {
  const generated = generatePluginRegistry({
    pluginsRoot: resolve(pnhRoot, "tests", "fixtures", "plugins"),
    environment: "production",
    capabilityCatalog,
    artifactCommitments: {
      "tool-golden": {
        runnerDigest: "a".repeat(64),
        imageDigest: "b".repeat(64),
        profileDigest: "c".repeat(64),
      },
    },
  });
  if (!generated.ok) throw new Error("registry generation failed");
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error("registry admission failed");
  return admitted.ticket;
}

async function authority(admittedTicket: AdmissionTicket): Promise<AdmittedPluginAuthority> {
  const result = await admitPluginAuthority({
    ticket: admittedTicket,
    containerPort: { async launch() { throw new Error("no Policy container expected"); } },
    parentGrantDigest: "a".repeat(64),
    taskDigest: "b".repeat(64),
    deadlineMs: Date.now() + 5_000,
    corePort,
  });
  if (!result.ok) throw new Error(`authority fixture failed: ${result.code}`);
  return result.authority;
}

class FakeHandle implements PluginContainerHandle {
  readonly requestId = "runtime-request";
  readonly pluginId = "tool-golden";
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  readonly requests: PluginRequestFrame[] = [];
  readonly input = new NdjsonFrameDecoder();
  readonly receipt: PluginLifecycleReceipt = {
    v: 1,
    requestId: this.requestId,
    pluginId: this.pluginId,
    containerId: "container-1",
    trigger: "process-exit",
    hardDeadlineAtMs: this.hardDeadlineAtMs,
    daemonState: "exited",
    exitCode: 0,
    oomKilled: false,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: Date.now(),
  };
  stopped = 0;
  acknowledged = 0;
  closed = false;
  duplicate = false;
  private stdout: Array<(bytes: Uint8Array) => void> = [];
  private stderr: Array<(bytes: Uint8Array) => void> = [];
  protected resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => {
    this.resolveExit = resolvePromise;
  });

  async writeStdin(bytes: Uint8Array): Promise<void> {
    const decoded = this.input.push(bytes);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    for (const frame of decoded.frames) {
      assert.equal(frame.type, "request");
      if (frame.type !== "request") continue;
      this.requests.push(frame);
      const result = frame.phase === "register"
        ? { kind: "tool", operations: ["echo"], pluginId: "tool-golden" }
        : { echoed: (frame.payload as { input: object }).input };
      const response = encodePluginFrame({
        v: 1,
        type: "response",
        requestId: frame.requestId,
        seq: frame.seq,
        ok: true,
        result,
        error: null,
      });
      for (const listener of this.stdout) listener(response);
      if (this.duplicate) for (const listener of this.stdout) listener(response);
    }
  }

  async closeStdin(): Promise<void> {
    this.closed = true;
    this.resolveExit(this.receipt);
  }

  onStdout(listener: (bytes: Uint8Array) => void): void { this.stdout.push(listener); }
  onStderr(listener: (bytes: Uint8Array) => void): void { this.stderr.push(listener); }
  waitForExit(): Promise<PluginLifecycleReceipt> { return this.exited; }
  async stop(): Promise<PluginLifecycleReceipt> {
    this.stopped += 1;
    this.resolveExit(this.receipt);
    return this.receipt;
  }
  async acknowledge(): Promise<void> { this.acknowledged += 1; }
}

function portFor(handle: FakeHandle): PluginContainerPort {
  return { async launch() { return handle; } };
}

class LateExitAfterFailedStopHandle extends FakeHandle {
  override async stop(): Promise<PluginLifecycleReceipt> {
    this.stopped += 1;
    setImmediate(() => this.resolveExit(this.receipt));
    throw new Error("stop timed out");
  }

  override async acknowledge(): Promise<void> {
    this.acknowledged += 1;
    throw new Error("acknowledgement failed");
  }
}

test("Runtime registers the admitted Tool before one operation and acknowledges clean absence", async () => {
  const handle = new FakeHandle();
  const admittedTicket = ticket();
  const admittedAuthority = await authority(admittedTicket);
  const intents: object[] = [];
  const result = await runToolTask({
    ticket: admittedTicket,
    authority: admittedAuthority,
    containerPort: portFor(handle),
    intentPort: { async append(intent) { intents.push(intent); } },
    pluginId: "tool-golden",
    operation: "echo",
    input: operationInput,
    deadlineMs: Date.now() + 5_000,
    requestId: "runtime-request",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.registration, { kind: "tool", operations: ["echo"], pluginId: "tool-golden" });
  assert.deepEqual(result.result, { echoed: operationInput });
  assert.equal(result.receipt, handle.receipt);
  assert.equal(intents.length, 1);
  assert.equal(intents[0], result.intent);
  assert.deepEqual(handle.requests.map(({ phase, seq }) => ({ phase, seq })), [
    { phase: "register", seq: 1 },
    { phase: "operate", seq: 2 },
  ]);
  assert.equal(handle.closed, true);
  assert.equal(handle.stopped, 0);
  assert.equal(handle.acknowledged, 1);
});

test("Runtime distinguishes an expired Tool launch from a pre-deadline launch failure", async () => {
  const admittedTicket = ticket();
  const admittedAuthority = await authority(admittedTicket);
  let now = 1_000;
  const input = {
    ticket: admittedTicket,
    authority: admittedAuthority,
    intentPort: { async append() {} },
    pluginId: "tool-golden",
    operation: "echo",
    input: operationInput,
    deadlineMs: 2_000,
    requestId: "runtime-request",
    clock: { now: () => now },
  } as const;

  const launchFailure = await runToolTask({
    ...input,
    containerPort: { async launch() { throw new Error("allocation refused"); } },
  });
  assert.equal(launchFailure.ok, false);
  if (launchFailure.ok) return;
  assert.equal(launchFailure.code, "launch");

  const deadlineFailure = await runToolTask({
    ...input,
    containerPort: {
      async launch() {
        now = input.deadlineMs;
        throw new Error("adapter request deadline exceeded");
      },
    },
  });
  assert.equal(deadlineFailure.ok, false);
  if (deadlineFailure.ok) return;
  assert.equal(deadlineFailure.code, "deadline");
});

test("Runtime rejects duplicate Tool output and stops the allocation exactly once", async () => {
  const handle = new FakeHandle();
  handle.duplicate = true;
  const admittedTicket = ticket();
  const result = await runToolTask({
    ticket: admittedTicket,
    authority: await authority(admittedTicket),
    containerPort: portFor(handle),
    intentPort: { async append() {} },
    pluginId: "tool-golden",
    operation: "echo",
    input: operationInput,
    deadlineMs: Date.now() + 5_000,
    requestId: "runtime-request",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "protocol");
  assert.equal(result.receipt?.confirmedAbsent, true);
  assert.equal(handle.stopped, 1);
  assert.equal(handle.acknowledged, 1);
});

test("Runtime retains the authoritative late receipt after failed stop and attempts acknowledgement", async () => {
  const handle = new LateExitAfterFailedStopHandle();
  handle.duplicate = true;
  const admittedTicket = ticket();
  const result = await runToolTask({
    ticket: admittedTicket,
    authority: await authority(admittedTicket),
    containerPort: portFor(handle),
    intentPort: { async append() {} },
    pluginId: "tool-golden",
    operation: "echo",
    input: operationInput,
    deadlineMs: Date.now() + 5_000,
    requestId: "runtime-request",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "protocol");
  assert.equal(result.receipt, handle.receipt);
  assert.equal(handle.stopped, 1);
  assert.equal(handle.acknowledged, 1);
});
