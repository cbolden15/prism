import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type ValidateResult =
  | { [key: string]: JsonValue; ok: true; members: Record<string, JsonValue>[] }
  | { [key: string]: JsonValue; ok: false; code: string };

type DigestResult =
  | { [key: string]: JsonValue; ok: true; members: Record<string, JsonValue>[]; digest: string }
  | { [key: string]: JsonValue; ok: false; code: string };

function member(pluginId: string, versionDigest = "a".repeat(64)): Record<string, JsonValue> {
  return { pluginId, versionDigest };
}

function goodSet(): Record<string, JsonValue>[] {
  return [member("plugin-a", "a".repeat(64)), member("plugin-b", "b".repeat(64))];
}

function bytes(members: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [members],
    entry: "plugin-set.ts",
    exportName: "canonicalPluginSetBytes",
  });
}

function validateSet(value: SandboxArgument): Promise<ValidateResult> {
  return sandboxCall<ValidateResult>({
    args: [value],
    entry: "plugin-set.ts",
    exportName: "validatePluginSet",
  });
}

function deriveDigest(
  value: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<DigestResult> {
  return sandboxCall<DigestResult>({
    args: [value],
    entry: "plugin-set.ts",
    exportName: "derivePluginSetDigest",
    port: { argumentIndex: 1, fixture: hashFixture, name: "sha256" },
  });
}

test("valid ordered set normalizes and yields a stable digest", async () => {
  const result = await validateSet(goodSet());
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.members, goodSet());

  const digestResult = await deriveDigest(goodSet());
  assert.equal(digestResult.ok, true);
  if (digestResult.ok) assert.match(digestResult.digest, /^[0-9a-f]{64}$/);
});

test("canonical bytes are version-tagged, fixed arity, and order-sensitive", async () => {
  const setBytes = await bytes(goodSet());
  const array = JSON.parse(setBytes) as unknown[];
  assert.equal(array[0], "pnh-plugin-set-v1");
  const members = array[1] as unknown[];
  assert.deepEqual(members, [
    ["plugin-a", "a".repeat(64)],
    ["plugin-b", "b".repeat(64)],
  ]);

  const reversedBytes = await bytes([...goodSet()].reverse());
  assert.notEqual(setBytes, reversedBytes);
});

test("every plugin-set reject code fires on its exact cause", async () => {
  const cases: Array<[SandboxArgument, string]> = [
    [null, "shape"],
    [{ kind: "accessor-record", key: "0", returns: member("plugin-a"), value: {} }, "shape"],
    ["not-an-array", "shape"],
    [["not-an-object"], "member-shape"],
    [[{ pluginId: "plugin-a" }], "member-shape"],
    [[{ ...member("plugin-a"), extra: 1 }], "member-shape"],
    [[member("Bad_Slug")], "slug"],
    [[member("plugin-a", "not-a-digest")], "digest-format"],
    [[member("plugin-a"), member("plugin-a", "b".repeat(64))], "duplicate-member"],
  ];
  for (const [value, code] of cases) {
    const result = await validateSet(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("empty plugin set is valid", async () => {
  const result = await validateSet([]);
  assert.deepEqual(result, { ok: true, members: [] });
});

test("digest derivation fails closed on a malformed injected hash", async () => {
  const result = await deriveDigest(goodSet(), "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});

test("digest derivation propagates validation failures", async () => {
  const result = await deriveDigest(null);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "shape");
});
