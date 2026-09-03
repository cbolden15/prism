import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  executeCapabilityRequest,
  validateCapabilityRequest,
  type CapabilityIntent,
} from "../../packages/runtime/src/kernel/capability-rpc.ts";
import type { PluginContainerPort } from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import {
  admitPluginAuthority,
  type AdmittedPluginAuthority,
  type CoreAdmissionPort,
  type PluginGrantValue,
} from "../../packages/runtime/src/kernel/plugin-kernel.ts";
import { admitRegistryBytes } from "../../packages/runtime/src/runtime/admission-ticket.ts";

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

function grant(overrides: Partial<PluginGrantValue> = {}): PluginGrantValue {
  return {
    parentGrantDigest: "a".repeat(64),
    taskDigest: TASK_DIGEST,
    pluginId: "tool-a",
    pluginSetDigest: "c".repeat(64),
    catalogDigest: "d".repeat(64),
    capabilities: [
      { id: "allowed-hosts", limit: stringSet(["api-a", "api-b"]) },
      { id: "model-calls", limit: integerMax(5) },
      { id: "network", limit: booleanGate(true) },
    ],
    ...overrides,
  };
}

test("integer-max requests require an exact nonnegative safe integer within the grant", () => {
  const accepted = validateCapabilityRequest(grant(), {
    capabilityId: "model-calls",
    requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 3 },
  });
  assert.deepEqual(accepted, {
    ok: true,
    request: {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 3 },
    },
  });
  assert.equal(accepted.ok && Object.isFrozen(accepted.request.requested), true);

  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(validateCapabilityRequest(grant(), {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value },
    }), { ok: false, code: "request-shape" });
  }
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "model-calls",
    requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 6 },
  }), { ok: false, code: "request-widening" });
});

test("string-set requests normalize order but reject duplicates and values outside the grant", () => {
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "allowed-hosts",
    requested: { schema: "string-set", version: "pnh-capability-request-v1", values: ["api-b", "api-a"] },
  }), {
    ok: true,
    request: {
      capabilityId: "allowed-hosts",
      requested: { schema: "string-set", version: "pnh-capability-request-v1", values: ["api-a", "api-b"] },
    },
  });
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "allowed-hosts",
    requested: { schema: "string-set", version: "pnh-capability-request-v1", values: ["api-a", "api-a"] },
  }), { ok: false, code: "request-shape" });
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "allowed-hosts",
    requested: { schema: "string-set", version: "pnh-capability-request-v1", values: ["api-c"] },
  }), { ok: false, code: "request-widening" });
});

test("boolean-gate requests cannot enable a capability disabled by the grant", () => {
  assert.equal(validateCapabilityRequest(grant(), {
    capabilityId: "network",
    requested: { schema: "boolean-gate", version: "pnh-capability-request-v1", enabled: true },
  }).ok, true);
  assert.equal(validateCapabilityRequest(grant({
    capabilities: [{ id: "network", limit: booleanGate(false) }],
  }), {
    capabilityId: "network",
    requested: { schema: "boolean-gate", version: "pnh-capability-request-v1", enabled: false },
  }).ok, true);
  assert.deepEqual(validateCapabilityRequest(grant({
    capabilities: [{ id: "network", limit: booleanGate(false) }],
  }), {
    capabilityId: "network",
    requested: { schema: "boolean-gate", version: "pnh-capability-request-v1", enabled: true },
  }), { ok: false, code: "request-widening" });
});

test("request envelopes reject unknown capabilities, schema drift, and non-data shapes", () => {
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "unknown",
    requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 1 },
  }), { ok: false, code: "capability-not-granted" });
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "model-calls",
    requested: { schema: "string-set", version: "pnh-capability-request-v1", values: [] },
  }), { ok: false, code: "schema-mismatch" });
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "model-calls",
    requested: { schema: "integer-max", version: "wrong", value: 1 },
  }), { ok: false, code: "request-shape" });
  assert.deepEqual(validateCapabilityRequest(grant(), {
    capabilityId: "model-calls",
    requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 1 },
    extra: true,
  }), { ok: false, code: "request-shape" });
  const inherited = Object.assign(Object.create({ extra: true }), {
    capabilityId: "model-calls",
    requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 1 },
  });
  assert.deepEqual(validateCapabilityRequest(grant(), inherited), { ok: false, code: "request-shape" });
  const accessor = { schema: "integer-max", version: "pnh-capability-request-v1" } as Record<string, unknown>;
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  for (const [capabilityId, requested] of [
    ["model-calls", accessor],
    ["model-calls", { schema: "integer-max", version: "pnh-capability-request-v1", value: 1, extra: true }],
    ["allowed-hosts", { schema: "string-set", version: "pnh-capability-request-v1", values: "api-a" }],
    ["network", { schema: "boolean-gate", version: "pnh-capability-request-v1", enabled: true, extra: true }],
  ] as const) {
    assert.deepEqual(validateCapabilityRequest(grant(), { capabilityId, requested }), {
      ok: false,
      code: "request-shape",
    });
  }
});

function catalog() {
  return {
    version: "pnh-capability-catalog-v1" as const,
    capabilities: [
      { id: "allowed-hosts", limit: stringSet(["api-a", "api-b"]) },
      { id: "model-calls", limit: integerMax(5) },
      { id: "network", limit: booleanGate(true) },
    ],
  };
}

async function authority(): Promise<AdmittedPluginAuthority> {
  const descriptor = {
    id: "tool-a",
    version: "1.0.0",
    apiVersion: 1,
    kind: "tool",
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: catalog().capabilities,
    license: { spdxId: "MIT", holder: "PNH" },
    manifestDigest: "1".repeat(64),
    sourceDigest: "2".repeat(64),
    versionDigest: "3".repeat(64),
    runnerDigest: "4".repeat(64),
    imageDigest: "5".repeat(64),
    profileDigest: "6".repeat(64),
  };
  const registry = {
    version: "pnh-plugin-registry-v3",
    environment: "production",
    capabilityCatalog: catalog(),
    plugins: [descriptor],
  };
  const bytes = Buffer.from(JSON.stringify(registry));
  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  if (!admitted.ok) throw new Error(`fixture admission failed: ${admitted.code}`);
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
  const containerPort: PluginContainerPort = {
    async launch() { throw new Error("no Policy container expected"); },
  };
  const result = await admitPluginAuthority({
    ticket: admitted.ticket,
    containerPort,
    parentGrantDigest: "a".repeat(64),
    taskDigest: TASK_DIGEST,
    deadlineMs: Date.now() + 5_000,
    corePort,
  });
  if (!result.ok) throw new Error(`authority fixture failed: ${result.code}`);
  return result.authority;
}

test("a valid request appends one frozen grant-bound intent before dispatch", async () => {
  const admitted = await authority();
  const events: string[] = [];
  let appended: CapabilityIntent | undefined;
  let dispatched: CapabilityIntent | undefined;
  const result = await executeCapabilityRequest({
    authority: admitted,
    pluginId: "tool-a",
    request: {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 3 },
    },
    intentPort: {
      async append(intent) { events.push("append"); appended = intent; },
    },
    dispatchPort: {
      async dispatch(intent) { events.push("dispatch"); dispatched = intent; return { accepted: true }; },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(events, ["append", "dispatch"]);
  assert.equal(appended, dispatched);
  assert.equal(appended, result.intent);
  assert.equal(Object.isFrozen(result.intent), true);
  assert.deepEqual(result.result, { accepted: true });
  assert.equal(result.intent.pluginId, "tool-a");
  assert.equal(result.intent.taskDigest, TASK_DIGEST);
  assert.equal(result.intent.pluginSetDigest, admitted.pluginSetDigest);
  assert.equal(result.intent.grantDigest, admitted.plugins[0]?.grantDigest);
});

test("invalid authority or widened input reaches neither intent append nor dispatch", async () => {
  const admitted = await authority();
  for (const [target, request, code] of [
    [admitted, {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 6 },
    }, "request-widening"],
    [Object.freeze({ ...admitted }), {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 1 },
    }, "authority"],
    [admitted, {
      capabilityId: "model-calls",
      requested: { schema: "integer-max", version: "pnh-capability-request-v1", value: 1 },
    }, "plugin-not-admitted"],
  ] as const) {
    const events: string[] = [];
    const result = await executeCapabilityRequest({
      authority: target as AdmittedPluginAuthority,
      pluginId: code === "plugin-not-admitted" ? "tool-missing" : "tool-a",
      request,
      intentPort: { async append() { events.push("append"); } },
      dispatchPort: { async dispatch() { events.push("dispatch"); } },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, code);
    assert.deepEqual(events, []);
  }
});

test("intent append failure prevents dispatch; dispatch failure occurs only after append", async () => {
  const admitted = await authority();
  const request = {
    capabilityId: "network",
    requested: { schema: "boolean-gate", version: "pnh-capability-request-v1", enabled: true },
  } as const;
  const appendEvents: string[] = [];
  const appendFailed = await executeCapabilityRequest({
    authority: admitted,
    pluginId: "tool-a",
    request,
    intentPort: { async append() { appendEvents.push("append"); throw new Error("ambiguous"); } },
    dispatchPort: { async dispatch() { appendEvents.push("dispatch"); } },
  });
  assert.deepEqual(appendFailed, { ok: false, code: "intent-append" });
  assert.deepEqual(appendEvents, ["append"]);

  const dispatchEvents: string[] = [];
  const dispatchFailed = await executeCapabilityRequest({
    authority: admitted,
    pluginId: "tool-a",
    request,
    intentPort: { async append() { dispatchEvents.push("append"); } },
    dispatchPort: { async dispatch() { dispatchEvents.push("dispatch"); throw new Error("uncertain"); } },
  });
  assert.equal(dispatchFailed.ok, false);
  if (!dispatchFailed.ok) assert.equal(dispatchFailed.code, "dispatch");
  assert.deepEqual(dispatchEvents, ["append", "dispatch"]);
});
