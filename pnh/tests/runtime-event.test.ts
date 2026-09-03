import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type EventResult =
  | {
      [key: string]: JsonValue;
      ok: true;
      event: Record<string, JsonValue>;
      digest: string;
    }
  | { [key: string]: JsonValue; ok: false; code: string };

function goodEvent(): Record<string, JsonValue> {
  return {
    type: "task-admitted",
    taskDigest: "a".repeat(64),
    subjectDigest: "b".repeat(64),
    occurredAt: "2026-08-19T12:00:00.000Z",
  };
}

function deriveEvent(
  value: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<EventResult> {
  return sandboxCall<EventResult>({
    args: [value],
    entry: "runtime-event.ts",
    exportName: "deriveRuntimeEvent",
    port: { argumentIndex: 1, fixture: hashFixture, name: "sha256" },
  });
}

function bytes(event: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [event],
    entry: "runtime-event.ts",
    exportName: "canonicalRuntimeEventBytes",
  });
}

test("valid event normalizes and yields a stable digest", async () => {
  const result = await deriveEvent(goodEvent());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.event, goodEvent());
    assert.match(result.digest, /^[0-9a-f]{64}$/);
  }
});

test("canonical bytes are version-tagged, fixed arity, and injective", async () => {
  const eventBytes = await bytes(goodEvent());
  const array = JSON.parse(eventBytes) as unknown[];
  assert.equal(array.length, 5);
  assert.equal(array[0], "pnh-runtime-event-v1");

  const other = await bytes({ ...goodEvent(), type: "task-completed" });
  assert.notEqual(eventBytes, other);
});

test("every runtime-event kind is accepted", async () => {
  for (const type of [
    "task-admitted",
    "plugin-set-resolved",
    "plugin-grant-issued",
    "task-completed",
    "task-rejected",
  ]) {
    const result = await deriveEvent({ ...goodEvent(), type });
    assert.equal(result.ok, true);
  }
});

test("every reject code fires on its exact cause", async () => {
  const missingType = goodEvent();
  delete missingType.type;

  const cases: Array<[SandboxArgument, string]> = [
    [null, "shape"],
    [
      { kind: "accessor-record", key: "type", returns: "task-admitted", value: goodEvent() },
      "shape",
    ],
    [{ kind: "inherited-record", inherited: goodEvent(), own: {} }, "shape"],
    [{ kind: "non-enumerable-record", hidden: 1, key: "hidden", value: goodEvent() }, "unknown-key"],
    [{ ...goodEvent(), extra: 1 }, "unknown-key"],
    [missingType, "shape"],
    [{ ...goodEvent(), type: "task-invented" }, "type"],
    [{ ...goodEvent(), taskDigest: "not-a-digest" }, "digest-format"],
    [{ ...goodEvent(), subjectDigest: "not-a-digest" }, "digest-format"],
    [{ ...goodEvent(), occurredAt: 1 }, "timestamp"],
    [{ ...goodEvent(), occurredAt: "2026-08-19 12:00:00.000Z" }, "timestamp"],
  ];

  for (const [value, code] of cases) {
    const result = await deriveEvent(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("digest derivation fails closed on a malformed injected hash", async () => {
  const result = await deriveEvent(goodEvent(), "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});
