import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLifecycleReceipt,
} from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import { NdjsonFrameDecoder, encodePluginFrame, type PluginRequestFrame } from "@useprism/sdk/protocol";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { runProviderCompletion } from "../../packages/runtime/src/runtime/run-provider.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginIds = ["memory-golden", "policy-golden", "provider-golden", "renderer-golden", "tool-golden"];

function ticket(): AdmissionTicket {
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
  if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error(`registry admission failed: ${admitted.code}`);
  return admitted.ticket;
}

class ProviderHandle implements PluginContainerHandle {
  readonly requestId = "provider-request";
  readonly pluginId = "provider-golden";
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  readonly requests: PluginRequestFrame[] = [];
  readonly decoder = new NdjsonFrameDecoder();
  readonly receipt: PluginLifecycleReceipt = {
    v: 1,
    requestId: this.requestId,
    pluginId: this.pluginId,
    containerId: "provider-process",
    trigger: "process-exit",
    hardDeadlineAtMs: this.hardDeadlineAtMs,
    daemonState: "exited",
    exitCode: 0,
    oomKilled: null,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: Date.now(),
  };
  response: unknown = { providerId: "provider-golden", model: null, text: "provider answer" };
  launches = 0;
  acknowledged = 0;
  private stdout: Array<(bytes: Uint8Array) => void> = [];
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => { this.resolveExit = resolvePromise; });

  async writeStdin(bytes: Uint8Array): Promise<void> {
    const decoded = this.decoder.push(bytes);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    for (const frame of decoded.frames) {
      assert.equal(frame.type, "request");
      if (frame.type !== "request") continue;
      this.requests.push(frame);
      const result = frame.phase === "register"
        ? { kind: "provider", pluginId: "provider-golden" }
        : this.response;
      const encoded = encodePluginFrame({
        v: 1,
        type: "response",
        requestId: frame.requestId,
        seq: frame.seq,
        ok: true,
        result,
        error: null,
      });
      for (const listener of this.stdout) listener(encoded);
    }
  }
  async closeStdin(): Promise<void> { this.resolveExit(this.receipt); }
  onStdout(listener: (bytes: Uint8Array) => void): void { this.stdout.push(listener); }
  onStderr(): void {}
  waitForExit(): Promise<PluginLifecycleReceipt> { return this.exited; }
  async stop(): Promise<PluginLifecycleReceipt> { this.resolveExit(this.receipt); return this.receipt; }
  async acknowledge(): Promise<void> { this.acknowledged += 1; }
}

function portFor(handle: ProviderHandle): PluginContainerPort {
  return { async launch() { handle.launches += 1; return handle; } };
}

test("Runtime registers a Provider before one fixed completion operation", async () => {
  const handle = new ProviderHandle();
  const request = { prompt: "Answer this.", model: null };
  const result = await runProviderCompletion({
    ticket: ticket(),
    containerPort: portFor(handle),
    pluginId: "provider-golden",
    request,
    deadlineMs: Date.now() + 5_000,
    requestId: "provider-request",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.registration, { kind: "provider", pluginId: "provider-golden" });
  assert.deepEqual(result.response, { providerId: "provider-golden", model: null, text: "provider answer" });
  assert.deepEqual(handle.requests.map(({ phase, seq, payload }) => ({ phase, seq, payload })), [
    { phase: "register", seq: 1, payload: {} },
    { phase: "operate", seq: 2, payload: { input: request, operation: "complete" } },
  ]);
  assert.equal(result.receipt.confirmedAbsent, true);
  assert.equal(handle.acknowledged, 1);
});

test("invalid requests fail before a provider process launches", async () => {
  const handle = new ProviderHandle();
  const result = await runProviderCompletion({
    ticket: ticket(),
    containerPort: portFor(handle),
    pluginId: "provider-golden",
    request: { prompt: "", model: null },
    deadlineMs: Date.now() + 5_000,
  });
  assert.deepEqual(result, { ok: false, code: "request" });
  assert.equal(handle.launches, 0);
});

test("malformed provider output fails closed after confirmed cleanup", async () => {
  const handle = new ProviderHandle();
  handle.response = { text: "missing provenance" };
  const result = await runProviderCompletion({
    ticket: ticket(),
    containerPort: portFor(handle),
    pluginId: "provider-golden",
    request: { prompt: "Answer this.", model: null },
    deadlineMs: Date.now() + 5_000,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "response");
  assert.equal(result.receipt?.confirmedAbsent, true);
});
