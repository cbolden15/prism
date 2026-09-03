import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLaunchRequest,
  PluginLifecycleReceipt,
} from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { registerAdmittedPlugins } from "../../packages/runtime/src/runtime/run-task.ts";
import { NdjsonFrameDecoder, encodePluginFrame, type PluginKind, type PluginRequestFrame } from "@useprism/sdk/protocol";

const KINDS = ["memory", "policy", "provider", "renderer", "tool"] as const;

function ticket(): AdmissionTicket {
  const plugins = KINDS.map((kind) => ({
    id: `${kind}-golden`,
    version: "1.0.0",
    apiVersion: 1,
    kind,
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: [],
    license: { spdxId: "MIT", holder: "PNH" },
    manifestDigest: createHash("sha256").update(`${kind}-manifest`).digest("hex"),
    sourceDigest: createHash("sha256").update(`${kind}-source`).digest("hex"),
    versionDigest: createHash("sha256").update(`${kind}-version`).digest("hex"),
    runnerDigest: "a".repeat(64),
    imageDigest: createHash("sha256").update(`${kind}-image`).digest("hex"),
    profileDigest: "c".repeat(64),
  }));
  const registry = {
    version: "pnh-plugin-registry-v3",
    environment: "production",
    capabilityCatalog: { version: "pnh-capability-catalog-v1", capabilities: [] },
    plugins,
  };
  const bytes = Buffer.from(JSON.stringify(registry));
  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  if (!admitted.ok) throw new Error(`fixture admission failed: ${admitted.code}`);
  return admitted.ticket;
}

class RegistrationHandle implements PluginContainerHandle {
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  readonly requests: PluginRequestFrame[] = [];
  readonly receipt: PluginLifecycleReceipt;
  stopped = 0;
  acknowledged = 0;
  closed = false;
  private readonly decoder = new NdjsonFrameDecoder();
  private readonly stdout: Array<(bytes: Uint8Array) => void> = [];
  private readonly stderr: Array<(bytes: Uint8Array) => void> = [];
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private readonly exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => {
    this.resolveExit = resolvePromise;
  });

  constructor(
    readonly requestId: string,
    readonly pluginId: string,
    readonly kind: PluginKind,
    private readonly claimedKind: PluginKind = kind,
  ) {
    this.receipt = {
      v: 1,
      requestId,
      pluginId,
      containerId: `${pluginId}-container`,
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
      this.requests.push(frame);
      const result = this.claimedKind === "tool"
        ? { kind: "tool", pluginId: this.pluginId, operations: ["echo"] }
        : { kind: this.claimedKind, pluginId: this.pluginId };
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

class RegistrationPort implements PluginContainerPort {
  readonly handles: RegistrationHandle[] = [];

  constructor(
    private readonly ticketValue: AdmissionTicket,
    private readonly claimedKinds: Readonly<Record<string, PluginKind>> = {},
  ) {}

  async launch(request: PluginLaunchRequest): Promise<PluginContainerHandle> {
    const descriptor = this.ticketValue.plugins.find((plugin) => plugin.id === request.pluginId);
    if (descriptor === undefined) throw new Error("unknown fixture plugin");
    const handle = new RegistrationHandle(
      request.requestId,
      request.pluginId,
      descriptor.kind,
      this.claimedKinds[request.pluginId] ?? descriptor.kind,
    );
    this.handles.push(handle);
    return handle;
  }
}

test("Runtime registers all five admitted kinds in ticket order without an operation frame", async () => {
  const admitted = ticket();
  const port = new RegistrationPort(admitted);
  const result = await registerAdmittedPlugins({
    ticket: admitted,
    containerPort: port,
    deadlineMs: Date.now() + 5_000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.registrations, [
    { kind: "memory", pluginId: "memory-golden" },
    { kind: "policy", pluginId: "policy-golden" },
    { kind: "provider", pluginId: "provider-golden" },
    { kind: "renderer", pluginId: "renderer-golden" },
    { kind: "tool", pluginId: "tool-golden", operations: ["echo"] },
  ]);
  assert.equal(result.receipts.length, 5);
  assert.equal(port.handles.length, 5);
  for (const handle of port.handles) {
    assert.deepEqual(handle.requests.map(({ phase, kind, seq }) => ({ phase, kind, seq })), [
      { phase: "register", kind: handle["kind"], seq: 1 },
    ]);
    assert.equal(handle.closed, true);
    assert.equal(handle.stopped, 0);
    assert.equal(handle.acknowledged, 1);
  }
});

test("claimed kind drift stops registration before another plugin launches", async () => {
  const admitted = ticket();
  const port = new RegistrationPort(admitted, { "memory-golden": "provider" });
  const result = await registerAdmittedPlugins({
    ticket: admitted,
    containerPort: port,
    deadlineMs: Date.now() + 5_000,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "registration");
  assert.equal(result.pluginId, "memory-golden");
  assert.equal(port.handles.length, 1);
  assert.equal(port.handles[0]?.stopped, 1);
  assert.equal(port.handles[0]?.acknowledged, 1);
});
