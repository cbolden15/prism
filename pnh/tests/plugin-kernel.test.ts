import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLaunchRequest,
  PluginLifecycleReceipt,
} from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import {
  admitPluginAuthority,
  type CoreAdmissionPort,
  type DeriveGrantInput,
} from "../../packages/runtime/src/kernel/plugin-kernel.ts";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { NdjsonFrameDecoder, encodePluginFrame, type JsonValue, type PluginRequestFrame } from "@useprism/sdk/protocol";

const PARENT_GRANT_DIGEST = "a".repeat(64);
const TASK_DIGEST = "b".repeat(64);

function integerMax(max: number) {
  return { schema: "integer-max" as const, version: "pnh-capability-limit-v1" as const, max };
}

function stringSet(values: string[]) {
  return { schema: "string-set" as const, version: "pnh-capability-limit-v1" as const, values };
}

function booleanGate(enabled: boolean) {
  return { schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled };
}

function catalog(modelCalls: number, hosts = ["api-a", "api-b"], network = true) {
  return {
    version: "pnh-capability-catalog-v1" as const,
    capabilities: [
      { id: "allowed-hosts", limit: stringSet(hosts) },
      { id: "model-calls", limit: integerMax(modelCalls) },
      { id: "network", limit: booleanGate(network) },
    ],
  };
}

function descriptor(id: string, kind: "policy" | "tool", requestedCapabilities: unknown[] = []) {
  return {
    id,
    version: "1.0.0",
    apiVersion: 1,
    kind,
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities,
    license: { spdxId: "MIT", holder: "PNH" },
    manifestDigest: createHash("sha256").update(`${id}-manifest`).digest("hex"),
    sourceDigest: createHash("sha256").update(`${id}-source`).digest("hex"),
    versionDigest: createHash("sha256").update(`${id}-version`).digest("hex"),
    runnerDigest: "c".repeat(64),
    imageDigest: createHash("sha256").update(`${id}-image`).digest("hex"),
    profileDigest: "d".repeat(64),
  };
}

function ticket(policyIds: string[] = ["policy-a"]): AdmissionTicket {
  const registry = {
    version: "pnh-plugin-registry-v3",
    environment: "production",
    capabilityCatalog: catalog(5),
    plugins: [
      ...policyIds.map((id) => descriptor(id, "policy")),
      descriptor("tool-a", "tool", [{ id: "model-calls", limit: integerMax(2) }]),
    ],
  };
  const bytes = Buffer.from(JSON.stringify(registry));
  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  if (!admitted.ok) throw new Error(`fixture admission failed: ${admitted.code}`);
  return admitted.ticket;
}

type PolicyMode =
  | JsonValue
  | "crash"
  | "malformed"
  | "sequence"
  | "timeout";

class PolicyHandle implements PluginContainerHandle {
  readonly hardDeadlineAtMs = Date.now() + 10_000;
  readonly requests: PluginRequestFrame[] = [];
  readonly decoder = new NdjsonFrameDecoder();
  stopped = 0;
  acknowledged = 0;
  private readonly stdout: Array<(bytes: Uint8Array) => void> = [];
  private readonly stderr: Array<(bytes: Uint8Array) => void> = [];
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private readonly exited = new Promise<PluginLifecycleReceipt>((resolvePromise) => {
    this.resolveExit = resolvePromise;
  });

  constructor(
    readonly requestId: string,
    readonly pluginId: string,
    readonly mode: PolicyMode,
  ) {}

  private receipt(exitCode = 0): PluginLifecycleReceipt {
    return {
      v: 1,
      requestId: this.requestId,
      pluginId: this.pluginId,
      containerId: `${this.pluginId}-container`,
      trigger: "process-exit",
      hardDeadlineAtMs: this.hardDeadlineAtMs,
      daemonState: "exited",
      exitCode,
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
      if (frame.phase === "admit" && this.mode === "timeout") continue;
      if (frame.phase === "admit" && this.mode === "crash") {
        this.resolveExit(this.receipt(1));
        continue;
      }
      const result = frame.phase === "register"
        ? { kind: "policy", pluginId: this.pluginId }
        : this.mode === "malformed"
          ? { decision: "allow" }
          : this.mode;
      const response = encodePluginFrame({
        v: 1,
        type: "response",
        requestId: frame.requestId,
        seq: frame.phase === "admit" && this.mode === "sequence" ? frame.seq + 1 : frame.seq,
        ok: true,
        result,
        error: null,
      });
      for (const listener of this.stdout) listener(response);
    }
  }

  async closeStdin(): Promise<void> { this.resolveExit(this.receipt()); }
  onStdout(listener: (bytes: Uint8Array) => void): void { this.stdout.push(listener); }
  onStderr(listener: (bytes: Uint8Array) => void): void { this.stderr.push(listener); }
  waitForExit(): Promise<PluginLifecycleReceipt> { return this.exited; }
  async stop(): Promise<PluginLifecycleReceipt> {
    this.stopped += 1;
    const receipt = this.receipt(this.mode === "crash" ? 1 : 0);
    this.resolveExit(receipt);
    return receipt;
  }
  async acknowledge(): Promise<void> { this.acknowledged += 1; }
}

class PolicyPort implements PluginContainerPort {
  readonly handles: PolicyHandle[] = [];
  constructor(private readonly modes: Readonly<Record<string, PolicyMode>>) {}

  async launch(request: PluginLaunchRequest): Promise<PluginContainerHandle> {
    const mode = this.modes[request.pluginId];
    if (mode === undefined) throw new Error(`unexpected launch: ${request.pluginId}`);
    const handle = new PolicyHandle(request.requestId, request.pluginId, mode);
    this.handles.push(handle);
    return handle;
  }
}

class RecordingCorePort implements CoreAdmissionPort {
  readonly calls: DeriveGrantInput[] = [];

  async deriveCapabilityGrant(input: DeriveGrantInput) {
    this.calls.push(input);
    return {
      ok: true as const,
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
  }
}

async function run(
  modes: Readonly<Record<string, PolicyMode>>,
  policyIds = Object.keys(modes),
  deadlineMs = Date.now() + 5_000,
) {
  const corePort = new RecordingCorePort();
  const containerPort = new PolicyPort(modes);
  const result = await admitPluginAuthority({
    ticket: ticket(policyIds),
    containerPort,
    parentGrantDigest: PARENT_GRANT_DIGEST,
    taskDigest: TASK_DIGEST,
    deadlineMs,
    corePort,
  });
  return { containerPort, corePort, result };
}

test("all Policies run before non-Policy grants and can only return a frozen catalog subset", async () => {
  const restricted = catalog(2, ["api-a"], false);
  const { containerPort, corePort, result } = await run({
    "policy-a": { decision: "restrict", catalog: restricted },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(corePort.calls.map((call) => call.pluginId), ["policy-a", "tool-a"]);
  assert.deepEqual(corePort.calls[1]?.catalog, restricted);
  assert.deepEqual(result.authority.effectiveCatalog, restricted);
  assert.deepEqual(result.authority.ceilingCatalog, catalog(5));
  assert.equal(Object.isFrozen(result.authority), true);
  assert.equal(Object.isFrozen(result.authority.plugins), true);
  assert.equal(Object.isFrozen(result.authority.effectiveCatalog.capabilities), true);
  assert.deepEqual(containerPort.handles[0]?.requests.map(({ phase, seq }) => ({ phase, seq })), [
    { phase: "register", seq: 1 },
    { phase: "admit", seq: 2 },
  ]);
  const payload = containerPort.handles[0]?.requests[1]?.payload as Record<string, JsonValue>;
  assert.equal(payload.pluginSetDigest, result.authority.pluginSetDigest);
  assert.deepEqual(payload.ceilingCatalog, catalog(5));
  assert.deepEqual(payload.effectiveCatalog, catalog(5));
});

test("explicit Policy denial returns no non-Policy grant", async () => {
  const { corePort, result } = await run({ "policy-a": { decision: "deny" } });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "policy-denied");
  assert.deepEqual(corePort.calls, []);
});

test("Policy timeout, crash, malformed output, and sequence failure return no non-Policy grant", async (t) => {
  for (const mode of ["timeout", "crash", "malformed", "sequence"] as const) {
    await t.test(mode, async () => {
      const deadline = mode === "timeout" ? Date.now() + 25 : Date.now() + 5_000;
      const { corePort, result } = await run({ "policy-a": mode }, ["policy-a"], deadline);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.code, "policy-failure");
      assert.deepEqual(corePort.calls, []);
    });
  }
});

test("a protocol-valid Policy cannot widen beyond the immutable ticket ceiling", async () => {
  const { corePort, result } = await run({
    "policy-a": { decision: "restrict", catalog: catalog(6) },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "policy-ceiling");
  assert.deepEqual(corePort.calls, []);
});

test("a later Policy cannot re-widen authority removed by an earlier Policy", async () => {
  const { corePort, result } = await run({
    "policy-a": { decision: "restrict", catalog: catalog(2) },
    "policy-b": { decision: "restrict", catalog: catalog(4) },
  }, ["policy-a", "policy-b"]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "policy-not-monotonic");
  assert.deepEqual(corePort.calls, []);
});

test("the production sandbox core rejects a non-Policy request outside the Policy-narrowed catalog", async () => {
  const containerPort = new PolicyPort({
    "policy-a": { decision: "restrict", catalog: catalog(1) },
  });
  const result = await admitPluginAuthority({
    ticket: ticket(),
    containerPort,
    parentGrantDigest: PARENT_GRANT_DIGEST,
    taskDigest: TASK_DIGEST,
    deadlineMs: Date.now() + 5_000,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "grant-derivation");
  assert.equal(result.pluginId, "tool-a");
  assert.equal(result.detail, "capability-not-narrower");
});
