import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type ResultValue =
  | {
      [key: string]: JsonValue;
      ok: true;
      result: Record<string, JsonValue>;
      digest: string;
    }
  | { [key: string]: JsonValue; ok: false; code: string };

function goodResult(): Record<string, JsonValue> {
  return {
    taskDigest: "a".repeat(64),
    attempt: 1,
    outcome: "completed",
    evidenceLength: 3,
    evidenceFinalHash: "b".repeat(64),
    completedAt: "2026-08-19T12:04:00.000Z",
  };
}

function deriveResult(
  value: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<ResultValue> {
  return sandboxCall<ResultValue>({
    args: [value],
    entry: "result.ts",
    exportName: "deriveTerminalResult",
    port: { argumentIndex: 1, fixture: hashFixture, name: "sha256" },
  });
}

function bytes(result: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [result],
    entry: "result.ts",
    exportName: "canonicalResultBytes",
  });
}

test("valid result normalizes and yields a stable digest", async () => {
  const result = await deriveResult(goodResult());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.result, goodResult());
    assert.match(result.digest, /^[0-9a-f]{64}$/);
  }
});

test("canonical bytes are version-tagged, fixed arity, and injective", async () => {
  const resultBytes = await bytes(goodResult());
  const array = JSON.parse(resultBytes) as unknown[];
  assert.equal(array.length, 7);
  assert.equal(array[0], "pnh-result-v1");

  const other = await bytes({ ...goodResult(), outcome: "failed" });
  assert.notEqual(resultBytes, other);
});

test("every result reject code fires on its exact cause", async () => {
  const missingTaskDigest = goodResult();
  delete missingTaskDigest.taskDigest;

  const cases: Array<[SandboxArgument, string]> = [
    [null, "shape"],
    [
      { kind: "accessor-record", key: "taskDigest", returns: "a".repeat(64), value: goodResult() },
      "shape",
    ],
    [{ kind: "inherited-record", inherited: goodResult(), own: {} }, "shape"],
    [{ kind: "non-enumerable-record", hidden: 1, key: "hidden", value: goodResult() }, "unknown-key"],
    [{ ...goodResult(), extra: 1 }, "unknown-key"],
    [missingTaskDigest, "shape"],
    [{ ...goodResult(), taskDigest: "not-a-digest" }, "digest-format"],
    [{ ...goodResult(), evidenceFinalHash: "not-a-digest" }, "digest-format"],
    [{ ...goodResult(), attempt: 0 }, "limit-range"],
    [{ ...goodResult(), attempt: 1.5 }, "limit-range"],
    [{ ...goodResult(), evidenceLength: -1 }, "limit-range"],
    [{ ...goodResult(), evidenceLength: 1.5 }, "limit-range"],
    [{ ...goodResult(), outcome: "cancelled" }, "outcome"],
    [{ ...goodResult(), completedAt: 1 }, "timestamp"],
    [{ ...goodResult(), completedAt: "2026-08-19 12:04:00.000Z" }, "timestamp"],
  ];

  for (const [value, code] of cases) {
    const result = await deriveResult(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("evidenceLength zero is a valid boundary", async () => {
  const result = await deriveResult({ ...goodResult(), evidenceLength: 0 });
  assert.equal(result.ok, true);
});

test("every outcome is accepted", async () => {
  for (const outcome of ["completed", "failed", "rejected"]) {
    const result = await deriveResult({ ...goodResult(), outcome });
    assert.equal(result.ok, true);
  }
});

test("digest derivation fails closed on a malformed injected hash", async () => {
  const result = await deriveResult(goodResult(), "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});
