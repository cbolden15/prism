import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0, 0); // Clock read outside core.
const POLICY = { maxTtlMs: 360_000, maxClockSkewMs: 30_000 };

interface GrantClaimValue {
  [key: string]: JsonValue;
  digest: string;
  key: string;
}

type GrantResult =
  | {
      [key: string]: JsonValue;
      ok: true;
      grant: Record<string, JsonValue>;
      claim: GrantClaimValue;
    }
  | { [key: string]: JsonValue; ok: false; code: string };

function goodGrant(): Record<string, JsonValue> {
  return {
    programId: "pnh-demo",
    taskId: "task-1",
    attempt: 1,
    audience: "broker-a",
    inputDigest: "a".repeat(64),
    operation: "invoke-model",
    maxModelCalls: 2,
    maxInputTokens: 10_000,
    maxOutputTokens: 2_000,
    issuedAt: "2026-08-19T11:59:30.000Z",
    expiresAt: "2026-08-19T12:04:00.000Z",
    nonce: "A".repeat(22),
  };
}

function validateGrant(
  value: SandboxArgument,
  nowMs = NOW,
  policy: SandboxArgument = POLICY,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<GrantResult> {
  return sandboxCall<GrantResult>({
    args: [value, nowMs, policy],
    entry: "grant.ts",
    exportName: "validateGrant",
    port: { argumentIndex: 3, fixture: hashFixture, name: "sha256" },
  });
}

function canonicalGrantBytes(grant: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [grant],
    entry: "grant.ts",
    exportName: "canonicalGrantBytes",
  });
}

test("valid grant validates and yields a stable claim", async () => {
  const result = await validateGrant(goodGrant());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.claim.key, "broker-a/pnh-demo/task-1/1");
    assert.match(result.claim.digest, /^[0-9a-f]{64}$/);
  }
});

test("canonical bytes are injective across field moves", async () => {
  const a = goodGrant();
  const b = { ...goodGrant(), programId: "pnh-demo-x", taskId: "1" };
  const resultA = await validateGrant(a);
  const resultB = await validateGrant(b);
  const bytesA = await canonicalGrantBytes(a);
  const bytesB = await canonicalGrantBytes(b);
  assert.equal(resultA.ok && resultB.ok, true);
  assert.notEqual(bytesA, bytesB);
  const array = JSON.parse(bytesA) as unknown[];
  assert.equal(array.length, 13);
  assert.equal(array[0], "pnh-grant-v1");
});

test("every reject code fires on its exact cause", async () => {
  const missingProgramId = goodGrant();
  delete missingProgramId.programId;
  const cases: Array<[SandboxArgument, string, number]> = [
    [null, "shape", NOW],
    [missingProgramId, "shape", NOW],
    [
      {
        kind: "accessor-record",
        key: "programId",
        returns: "pnh-demo",
        value: goodGrant(),
      },
      "shape",
      NOW,
    ],
    [{ ...goodGrant(), extra: 1 }, "unknown-key", NOW],
    [{ ...goodGrant(), programId: "Bad_Slug" }, "slug", NOW],
    [{ ...goodGrant(), inputDigest: "z".repeat(64) }, "digest-format", NOW],
    [{ ...goodGrant(), nonce: "short" }, "nonce-format", NOW],
    [{ ...goodGrant(), issuedAt: 1 }, "timestamp", NOW],
    [{ ...goodGrant(), expiresAt: 1 }, "timestamp", NOW],
    [{ ...goodGrant(), issuedAt: "2026-08-19 11:59:30.000Z" }, "timestamp", NOW],
    [{ ...goodGrant(), expiresAt: "2026-08-19T11:00:00.000Z" }, "expiry-order", NOW],
    [
      {
        ...goodGrant(),
        issuedAt: "2026-08-19T11:00:00.000Z",
        expiresAt: "2026-08-19T12:04:00.000Z",
      },
      "ttl-exceeded",
      NOW,
    ],
    [goodGrant(), "expired", Date.UTC(2026, 7, 19, 12, 30, 0, 0)],
    [goodGrant(), "clock-skew", Date.UTC(2026, 7, 19, 11, 0, 0, 0)],
    [{ ...goodGrant(), maxModelCalls: 0 }, "limit-range", NOW],
    [{ ...goodGrant(), attempt: 1.5 }, "limit-range", NOW],
  ];

  for (const [value, code, now] of cases) {
    const result = await validateGrant(value, now);
    assert.equal(result.ok, false, code);
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("bad injected hash output is rejected", async () => {
  const result = await validateGrant(goodGrant(), NOW, POLICY, "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});

test("expiry boundary: now === expiresAt is expired", async () => {
  const result = await validateGrant(
    goodGrant(),
    Date.UTC(2026, 7, 19, 12, 4, 0, 0),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "expired");
});

test("invalid injected clocks fail closed", async () => {
  for (const now of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const result = await validateGrant(goodGrant(), now);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "clock-input");
  }
});

test("policy is an exact finite-integer own-data record", async () => {
  const nullPolicy: SandboxArgument = {
    kind: "null-prototype-record",
    value: { maxTtlMs: 1, maxClockSkewMs: 0 },
  };
  assert.deepEqual(
    await sandboxCall({
      args: [nullPolicy],
      entry: "grant.ts",
      exportName: "validateGrantPolicy",
    }),
    { maxTtlMs: 1, maxClockSkewMs: 0 },
  );

  const badPolicies: SandboxArgument[] = [
    null,
    { maxTtlMs: "1", maxClockSkewMs: 0 },
    { maxTtlMs: Number.MAX_SAFE_INTEGER + 1, maxClockSkewMs: 0 },
    { maxTtlMs: -1, maxClockSkewMs: 0 },
    { maxTtlMs: 1.5, maxClockSkewMs: 0 },
    { maxTtlMs: 1, maxClockSkewMs: -1 },
    { maxTtlMs: 1, maxClockSkewMs: 0, extra: true },
    {
      kind: "inherited-record",
      inherited: { maxTtlMs: 1, maxClockSkewMs: 0 },
      own: {},
    },
    {
      kind: "accessor-record",
      key: "maxTtlMs",
      returns: 1,
      value: { maxClockSkewMs: 0 },
    },
    {
      kind: "non-enumerable-record",
      hidden: 1,
      key: "hidden",
      value: { maxTtlMs: 1, maxClockSkewMs: 0 },
    },
  ];

  for (const policy of badPolicies) {
    assert.equal(
      await sandboxCall({
        args: [policy],
        entry: "grant.ts",
        exportName: "validateGrantPolicy",
      }),
      null,
    );
    const result = await validateGrant(goodGrant(), NOW, policy);
    assert.equal(!result.ok && result.code, "policy");
  }
});

test("prototype and non-enumerable fields are rejected", async () => {
  const inherited: SandboxArgument = {
    kind: "inherited-record",
    inherited: goodGrant(),
    own: {},
  };
  const nonEnumerable: SandboxArgument = {
    kind: "non-enumerable-record",
    hidden: 1,
    key: "hidden",
    value: goodGrant(),
  };
  assert.equal((await validateGrant(inherited)).ok, false);
  assert.equal((await validateGrant(nonEnumerable)).ok, false);
});
