import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type Limit = Record<string, JsonValue>;

type GrantResult =
  | {
      [key: string]: JsonValue;
      ok: true;
      grant: Record<string, JsonValue>;
      digest: string;
    }
  | { [key: string]: JsonValue; ok: false; code: string };

function integerMax(max: number): Limit {
  return { schema: "integer-max", version: "pnh-capability-limit-v1", max };
}

function stringSet(values: string[]): Limit {
  return { schema: "string-set", version: "pnh-capability-limit-v1", values };
}

function booleanGate(enabled: boolean): Limit {
  return { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled };
}

function goodCatalog(): Record<string, JsonValue> {
  return {
    version: "pnh-capability-catalog-v1",
    capabilities: [
      { id: "model-calls", limit: integerMax(5) },
      { id: "allowed-hosts", limit: stringSet(["api-a", "api-b"]) },
      { id: "network", limit: booleanGate(true) },
    ],
  };
}

function goodRequested(): Record<string, JsonValue>[] {
  return [{ id: "model-calls", limit: integerMax(3) }];
}

const PARENT_GRANT_DIGEST = "a".repeat(64);
const TASK_DIGEST = "b".repeat(64);
const PLUGIN_SET_DIGEST = "c".repeat(64);
const PLUGIN_ID = "plugin-a";

function deriveGrant(
  parentGrantDigest: SandboxArgument,
  taskDigest: SandboxArgument,
  pluginId: SandboxArgument,
  pluginSetDigest: SandboxArgument,
  catalogValue: SandboxArgument,
  requestedValue: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<GrantResult> {
  return sandboxCall<GrantResult>({
    args: [parentGrantDigest, taskDigest, pluginId, pluginSetDigest, catalogValue, requestedValue],
    entry: "plugin-grant.ts",
    exportName: "deriveCapabilityGrant",
    port: { argumentIndex: 6, fixture: hashFixture, name: "sha256" },
  });
}

function goodArgs(): [
  SandboxArgument,
  SandboxArgument,
  SandboxArgument,
  SandboxArgument,
  SandboxArgument,
  SandboxArgument,
] {
  return [PARENT_GRANT_DIGEST, TASK_DIGEST, PLUGIN_ID, PLUGIN_SET_DIGEST, goodCatalog(), goodRequested()];
}

function bytes(grant: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [grant],
    entry: "plugin-grant.ts",
    exportName: "canonicalPluginGrantBytes",
  });
}

test("valid derivation narrows the requested subset and yields a stable digest", async () => {
  const result = await deriveGrant(...goodArgs());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.grant.parentGrantDigest, PARENT_GRANT_DIGEST);
    assert.equal(result.grant.taskDigest, TASK_DIGEST);
    assert.equal(result.grant.pluginId, PLUGIN_ID);
    assert.equal(result.grant.pluginSetDigest, PLUGIN_SET_DIGEST);
    assert.match(result.grant.catalogDigest as string, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.grant.capabilities, goodRequested());
    assert.match(result.digest, /^[0-9a-f]{64}$/);
  }
});

test("requesting the full parent limit (equal, not strictly narrower) is accepted", async () => {
  const [parent, task, plugin, set, catalog] = goodArgs();
  const result = await deriveGrant(parent, task, plugin, set, catalog, [{ id: "model-calls", limit: integerMax(5) }]);
  assert.equal(result.ok, true);
});

test("canonical bytes are version-tagged, fixed arity, and injective", async () => {
  const grantResult = await deriveGrant(...goodArgs());
  assert.equal(grantResult.ok, true);
  if (!grantResult.ok) return;
  const grantBytes = await bytes(grantResult.grant);
  const array = JSON.parse(grantBytes) as unknown[];
  assert.equal(array.length, 7);
  assert.equal(array[0], "pnh-plugin-grant-v1");

  const other = await bytes({ ...grantResult.grant, pluginId: "plugin-b" });
  assert.notEqual(grantBytes, other);
});

test("every reject code fires on its exact cause", async () => {
  const [parent, task, plugin, set, catalog, requested] = goodArgs();

  const cases: Array<[SandboxArgument, SandboxArgument, SandboxArgument, SandboxArgument, SandboxArgument, SandboxArgument, string]> = [
    ["not-a-digest", task, plugin, set, catalog, requested, "digest-format"],
    [parent, "not-a-digest", plugin, set, catalog, requested, "digest-format"],
    [parent, task, plugin, "not-a-digest", catalog, requested, "digest-format"],
    [parent, task, "Bad_Slug", set, catalog, requested, "slug"],
    [parent, task, plugin, set, null, requested, "catalog"],
    [
      parent,
      task,
      plugin,
      set,
      { kind: "accessor-record", key: "version", returns: "pnh-capability-catalog-v1", value: goodCatalog() },
      requested,
      "catalog",
    ],
    [parent, task, plugin, set, catalog, "not-an-array", "requested-shape"],
    [parent, task, plugin, set, catalog, ["not-an-object"], "capability-shape"],
    [parent, task, plugin, set, catalog, [{ id: "model-calls" }], "capability-shape"],
    [parent, task, plugin, set, catalog, [{ id: "model-calls", limit: integerMax(1), extra: 1 }], "capability-shape"],
    [parent, task, plugin, set, catalog, [{ id: "Bad_Slug", limit: integerMax(1) }], "capability-shape"],
    [parent, task, plugin, set, catalog, [{ id: "model-calls", limit: "nope" }], "capability-shape"],
    [
      parent,
      task,
      plugin,
      set,
      catalog,
      [{ id: "model-calls", limit: integerMax(1) }, { id: "model-calls", limit: integerMax(2) }],
      "duplicate-capability",
    ],
    [parent, task, plugin, set, catalog, [{ id: "unknown-capability", limit: integerMax(1) }], "unknown-capability"],
    [
      parent,
      task,
      plugin,
      set,
      catalog,
      [{ id: "model-calls", limit: stringSet(["api-a"]) }],
      "incomparable-capability",
    ],
    [parent, task, plugin, set, catalog, [{ id: "model-calls", limit: integerMax(6) }], "capability-not-narrower"],
  ];

  for (const [a, b, c, d, e, f, code] of cases) {
    const result = await deriveGrant(a, b, c, d, e, f);
    assert.equal(result.ok, false, JSON.stringify([a, b, c, d, e, f]));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("digest derivation fails closed on a malformed injected hash", async () => {
  const result = await deriveGrant(...goodArgs(), "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});
