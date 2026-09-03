import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

const G = "a".repeat(64);
const I = "b".repeat(64);
const R = "c".repeat(64);

const request = {
  grantDigest: G,
  routeClass: "class-a",
  providerId: "class-provider",
  modelId: "class-model",
  inputDigest: I,
};

interface ReceiptOk extends Record<string, JsonValue> {
  ok: true;
  receipt: Record<string, JsonValue>;
}

interface ReceiptFail extends Record<string, JsonValue> {
  ok: false;
  code: string;
}

type ReceiptResult = ReceiptOk | ReceiptFail;

function goodReceipt(): Record<string, JsonValue> {
  return {
    grantDigest: G,
    requestedRouteClass: "class-a",
    observedRouteClass: "class-a",
    requestedProviderId: "class-provider",
    observedProviderId: "class-provider",
    requestedModelId: "class-model",
    observedModelId: "class-model",
    inputDigest: I,
    resultDigest: R,
    telemetry: { inputTokens: 100, outputTokens: 20, cachedTokens: null, durationMs: 1500 },
  };
}

function checkReceipt(value: SandboxArgument): Promise<ReceiptResult> {
  return sandboxCall<ReceiptResult>({
    args: [request, value],
    entry: "broker.ts",
    exportName: "checkReceipt",
  });
}

test("exact receipt passes", async () => {
  const r = await checkReceipt(goodReceipt());
  assert.equal(r.ok, true);
});

test("explicit null telemetry passes without inference", async () => {
  const r = await checkReceipt({
    ...goodReceipt(),
    telemetry: { inputTokens: null, outputTokens: null, cachedTokens: null, durationMs: null },
  });
  assert.equal(r.ok, true);
});

test("route drift is rejected — no alias, no fallback", async () => {
  const r = await checkReceipt({ ...goodReceipt(), observedRouteClass: "class-b" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "route-drift");
});

test("grant and input mismatches are rejected", async () => {
  const r1 = await checkReceipt({ ...goodReceipt(), grantDigest: "d".repeat(64) });
  const r2 = await checkReceipt({ ...goodReceipt(), inputDigest: "e".repeat(64) });
  assert.equal(!r1.ok && r1.code, "grant-mismatch");
  assert.equal(!r2.ok && r2.code, "input-mismatch");
});

test("provider and model drift are rejected", async () => {
  const rp = await checkReceipt({ ...goodReceipt(), observedProviderId: "class-other" });
  const rm = await checkReceipt({ ...goodReceipt(), observedModelId: "class-other" });
  assert.equal(!rp.ok && rp.code, "provider-drift");
  assert.equal(!rm.ok && rm.code, "model-drift");
});

test("telemetry must be number-or-null, never inferred strings", async () => {
  const r = await checkReceipt({
    ...goodReceipt(),
    telemetry: { inputTokens: "100", outputTokens: 20, cachedTokens: null, durationMs: 1 },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "telemetry");
});

test("telemetry counts are integers; durations are finite nonnegative milliseconds", async () => {
  const negative = await checkReceipt({
    ...goodReceipt(),
    telemetry: { inputTokens: -1, outputTokens: 1, cachedTokens: null, durationMs: 1 },
  });
  const fractional = await checkReceipt({
    ...goodReceipt(),
    telemetry: { inputTokens: 1.5, outputTokens: 1, cachedTokens: null, durationMs: 1 },
  });
  const negativeDuration = await checkReceipt({
    ...goodReceipt(),
    telemetry: { inputTokens: 1, outputTokens: 1, cachedTokens: null, durationMs: -1 },
  });
  await assert.rejects(
    () => checkReceipt({
      ...goodReceipt(),
      telemetry: { inputTokens: 1, outputTokens: 1, cachedTokens: null, durationMs: Number.NaN },
    }),
    /finite numbers/,
  );
  assert.equal(negative.ok, false);
  assert.equal(fractional.ok, false);
  assert.equal(negativeDuration.ok, false);
});

test("receipt and telemetry records require exact shapes", async () => {
  assert.deepEqual(await checkReceipt(null), { ok: false, code: "shape" });

  const missingReceiptKey = goodReceipt();
  delete missingReceiptKey.resultDigest;
  assert.deepEqual(await checkReceipt(missingReceiptKey), { ok: false, code: "shape" });

  assert.deepEqual(
    await checkReceipt({ ...goodReceipt(), telemetry: null }),
    { ok: false, code: "telemetry" },
  );
  assert.deepEqual(
    await checkReceipt({
      ...goodReceipt(),
      telemetry: { inputTokens: 1, outputTokens: 1, cachedTokens: null, durationMs: 1, extra: 1 },
    }),
    { ok: false, code: "telemetry" },
  );
  assert.deepEqual(
    await checkReceipt({
      ...goodReceipt(),
      telemetry: { inputTokens: 1, outputTokens: 1, cachedTokens: null },
    }),
    { ok: false, code: "telemetry" },
  );
});

test("route, provider, and model identities must be slugs", async () => {
  assert.deepEqual(
    await checkReceipt({ ...goodReceipt(), requestedRouteClass: "Bad_Slug" }),
    { ok: false, code: "shape" },
  );
  assert.deepEqual(
    await checkReceipt({ ...goodReceipt(), observedProviderId: 1 }),
    { ok: false, code: "shape" },
  );
});

test("unknown keys and malformed digests are rejected", async () => {
  const r1 = await checkReceipt({ ...goodReceipt(), vendor: "x" });
  const r2 = await checkReceipt({ ...goodReceipt(), resultDigest: "nope" });
  const r3 = await checkReceipt({ ...goodReceipt(), grantDigest: "nope" });
  const r4 = await checkReceipt({ ...goodReceipt(), inputDigest: 1 });
  assert.equal(!r1.ok && r1.code, "unknown-key");
  assert.equal(!r2.ok && r2.code, "digest-format");
  assert.equal(!r3.ok && r3.code, "digest-format");
  assert.equal(!r4.ok && r4.code, "digest-format");
});

test("prototype, accessor, and post-validation mutation cannot bypass the schema", async () => {
  const inherited: SandboxArgument = {
    kind: "inherited-record",
    inherited: goodReceipt(),
    own: {},
  };
  assert.equal((await checkReceipt(inherited)).ok, false);
  const accessor: SandboxArgument = {
    kind: "accessor-record",
    key: "resultDigest",
    returns: R,
    value: goodReceipt(),
  };
  assert.equal((await checkReceipt(accessor)).ok, false);
  const nonEnumerable: SandboxArgument = {
    kind: "non-enumerable-record",
    hidden: 1,
    key: "hidden",
    value: goodReceipt(),
  };
  assert.equal((await checkReceipt(nonEnumerable)).ok, false);
  const input = goodReceipt();
  const result = await checkReceipt(input);
  assert.equal(result.ok, true);
  input.resultDigest = "d".repeat(64);
  if (result.ok) assert.equal(result.receipt.resultDigest, R);
});
