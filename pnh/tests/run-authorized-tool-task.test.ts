import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { CapabilityIntent } from "../../packages/runtime/src/kernel/capability-rpc.ts";
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

const TASK_DIGEST = "b".repeat(64);

function registryBytes(version = "1.0.0", extraCatalogEntry = false): Buffer {
  const capabilities: object[] = [{
    id: "allowed-hosts",
    limit: {
      schema: "string-set",
      version: "pnh-capability-limit-v1",
      values: ["api-a", "api-b"],
    },
  }];
  if (extraCatalogEntry) capabilities.push({
    id: "network",
    limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true },
  });
  return Buffer.from(JSON.stringify({
    version: "pnh-plugin-registry-v3",
    environment: "production",
    capabilityCatalog: {
      version: "pnh-capability-catalog-v1",
      capabilities,
    },
    plugins: [{
      id: "tool-a",
      version,
      apiVersion: 1,
      kind: "tool",
      compatibility: { kernelApiVersion: "pnh-kernel-v1" },
      entrypoint: "index.mjs",
      files: ["index.mjs"],
      dependencies: [],
      requestedCapabilities: [{
        id: "allowed-hosts",
        limit: {
          schema: "string-set",
          version: "pnh-capability-limit-v1",
          values: ["api-a", "api-b"],
        },
      }],
      license: { spdxId: "MIT", holder: "PNH" },
      manifestDigest: "1".repeat(64),
      sourceDigest: "2".repeat(64),
      versionDigest: createHash("sha256").update(`version:${version}`).digest("hex"),
      runnerDigest: "4".repeat(64),
      imageDigest: "5".repeat(64),
      profileDigest: "6".repeat(64),
    }],
  }));
}

function ticket(version = "1.0.0", extraCatalogEntry = false): AdmissionTicket {
  const bytes = registryBytes(version, extraCatalogEntry);
  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  if (!admitted.ok) throw new Error(`ticket fixture failed: ${admitted.code}`);
  return admitted.ticket;
}

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

async function authority(admittedTicket: AdmissionTicket): Promise<AdmittedPluginAuthority> {
  const result = await admitPluginAuthority({
    ticket: admittedTicket,
    containerPort: { async launch() { throw new Error("no Policy container expected"); } },
    parentGrantDigest: "a".repeat(64),
    taskDigest: TASK_DIGEST,
    deadlineMs: Date.now() + 5_000,
    corePort,
  });
  if (!result.ok) throw new Error(`authority fixture failed: ${result.code}`);
  return result.authority;
}

class FakeHandle implements PluginContainerHandle {
  readonly requestId = "runtime-request";
  readonly pluginId = "tool-a";
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  readonly requests: PluginRequestFrame[] = [];
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
  private readonly decoder = new NdjsonFrameDecoder();
  private readonly stdout: Array<(bytes: Uint8Array) => void> = [];
  private readonly stderr: Array<(bytes: Uint8Array) => void> = [];
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private readonly exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => {
    this.resolveExit = resolvePromise;
  });

  async writeStdin(bytes: Uint8Array): Promise<void> {
    const decoded = this.decoder.push(bytes);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    for (const frame of decoded.frames) {
      assert.equal(frame.type, "request");
      if (frame.type !== "request") continue;
      this.requests.push(frame);
      const result = frame.phase === "register"
        ? { kind: "tool", operations: ["echo"], pluginId: "tool-a" }
        : (frame.payload as { input: object }).input;
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
    }
  }

  async closeStdin(): Promise<void> { this.resolveExit(this.receipt); }
  onStdout(listener: (bytes: Uint8Array) => void): void { this.stdout.push(listener); }
  onStderr(listener: (bytes: Uint8Array) => void): void { this.stderr.push(listener); }
  waitForExit(): Promise<PluginLifecycleReceipt> { return this.exited; }
  async stop(): Promise<PluginLifecycleReceipt> { this.resolveExit(this.receipt); return this.receipt; }
  async acknowledge(): Promise<void> {}
}

function request(values: string[]) {
  return {
    capabilityId: "allowed-hosts",
    requested: { schema: "string-set", version: "pnh-capability-request-v1", values },
  };
}

test("authorized Tool input is normalized, appended, and sent unchanged through the production codec", async () => {
  const admittedTicket = ticket();
  const admittedAuthority = await authority(admittedTicket);
  const handle = new FakeHandle();
  const events: string[] = [];
  let appended: CapabilityIntent | undefined;
  const containerPort: PluginContainerPort = {
    async launch() { events.push("launch"); return handle; },
  };
  const result = await runToolTask({
    ticket: admittedTicket,
    authority: admittedAuthority,
    containerPort,
    intentPort: {
      async append(intent) { events.push("append"); appended = intent; },
    },
    pluginId: "tool-a",
    operation: "echo",
    input: request(["api-b", "api-a"]),
    deadlineMs: Date.now() + 5_000,
    requestId: "runtime-request",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(events, ["append", "launch"]);
  assert.equal(result.intent, appended);
  const normalized = request(["api-a", "api-b"]);
  assert.deepEqual(result.result, normalized);
  assert.deepEqual(handle.requests[1]?.payload, { operation: "echo", input: normalized });
});

test("ungranted or widened Tool input reaches neither intent append nor container launch", async () => {
  const admittedTicket = ticket();
  const admittedAuthority = await authority(admittedTicket);
  for (const [input, code] of [
    [request(["api-a", "api-c"]), "request-widening"],
    [{ ...request(["api-a"]), capabilityId: "network" }, "capability-not-granted"],
  ] as const) {
    const events: string[] = [];
    const result = await runToolTask({
      ticket: admittedTicket,
      authority: admittedAuthority,
      containerPort: { async launch() { events.push("launch"); return new FakeHandle(); } },
      intentPort: { async append() { events.push("append"); } },
      pluginId: "tool-a",
      operation: "echo",
      input,
      deadlineMs: Date.now() + 5_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, code);
    assert.deepEqual(events, []);
  }
});

test("ticket mismatch or intent append failure prevents Tool container launch", async () => {
  const admittedTicket = ticket();
  const admittedAuthority = await authority(admittedTicket);
  const events: string[] = [];
  const mismatch = await runToolTask({
    ticket: ticket("1.0.1"),
    authority: admittedAuthority,
    containerPort: { async launch() { events.push("launch"); return new FakeHandle(); } },
    intentPort: { async append() { events.push("append"); } },
    pluginId: "tool-a",
    operation: "echo",
    input: request(["api-a"]),
    deadlineMs: Date.now() + 5_000,
  });
  assert.deepEqual(mismatch, { ok: false, code: "authority" });
  assert.equal(events.length, 0);

  const appendFailed = await runToolTask({
    ticket: admittedTicket,
    authority: admittedAuthority,
    containerPort: { async launch() { events.push("launch"); return new FakeHandle(); } },
    intentPort: { async append() { events.push("append"); throw new Error("unavailable"); } },
    pluginId: "tool-a",
    operation: "echo",
    input: request(["api-a"]),
    deadlineMs: Date.now() + 5_000,
  });
  assert.deepEqual(appendFailed, { ok: false, code: "intent-append" });
  assert.deepEqual(events, ["append"]);
});

test("authority is bound to the exact ticket even when plugin-set digests match", async () => {
  const authorityTicket = ticket();
  const launchTicket = ticket("1.0.0", true);
  assert.notEqual(authorityTicket.registryDigest, launchTicket.registryDigest);
  assert.equal(authorityTicket.pluginSetDigest, launchTicket.pluginSetDigest);
  const admittedAuthority = await authority(authorityTicket);
  const events: string[] = [];
  const result = await runToolTask({
    ticket: launchTicket,
    authority: admittedAuthority,
    containerPort: { async launch() { events.push("launch"); return new FakeHandle(); } },
    intentPort: { async append() { events.push("append"); } },
    pluginId: "tool-a",
    operation: "echo",
    input: request(["api-a"]),
    deadlineMs: Date.now() + 5_000,
  });

  assert.deepEqual(result, { ok: false, code: "authority" });
  assert.deepEqual(events, []);
});

test("the public Tool API cannot launch without admitted authority", async () => {
  const events: string[] = [];
  const result = await runToolTask({
    ticket: ticket(),
    containerPort: { async launch() { events.push("launch"); return new FakeHandle(); } },
    pluginId: "tool-a",
    operation: "echo",
    input: request(["api-a"]),
    deadlineMs: Date.now() + 5_000,
  } as never);

  assert.deepEqual(result, { ok: false, code: "authority" });
  assert.deepEqual(events, []);
});
