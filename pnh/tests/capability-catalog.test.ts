import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type Limit = Record<string, JsonValue>;

type CatalogResult =
  | { [key: string]: JsonValue; ok: true; catalog: Record<string, JsonValue> }
  | { [key: string]: JsonValue; ok: false; code: string };

type DigestResult =
  | { [key: string]: JsonValue; ok: true; catalog: Record<string, JsonValue>; digest: string }
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

function validateLimit(value: SandboxArgument): Promise<Limit | null> {
  return sandboxCall<Limit | null>({
    args: [value],
    entry: "capability-catalog.ts",
    exportName: "validateCapabilityLimit",
  });
}

function subset(parent: SandboxArgument, child: SandboxArgument): Promise<boolean> {
  return sandboxCall<boolean>({
    args: [parent, child],
    entry: "capability-catalog.ts",
    exportName: "isCapabilitySubset",
  });
}

function bytes(catalog: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [catalog],
    entry: "capability-catalog.ts",
    exportName: "canonicalCapabilityCatalogBytes",
  });
}

function validateCatalog(value: SandboxArgument): Promise<CatalogResult> {
  return sandboxCall<CatalogResult>({
    args: [value],
    entry: "capability-catalog.ts",
    exportName: "validateCapabilityCatalog",
  });
}

function deriveDigest(
  value: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<DigestResult> {
  return sandboxCall<DigestResult>({
    args: [value],
    entry: "capability-catalog.ts",
    exportName: "deriveCapabilityCatalogDigest",
    port: { argumentIndex: 1, fixture: hashFixture, name: "sha256" },
  });
}

test("valid catalog normalizes and yields a stable digest", async () => {
  const result = await validateCatalog(goodCatalog());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.catalog, goodCatalog());
  }
  const digestResult = await deriveDigest(goodCatalog());
  assert.equal(digestResult.ok, true);
  if (digestResult.ok) {
    assert.match(digestResult.digest, /^[0-9a-f]{64}$/);
  }
});

test("string-set values are normalized to a sorted unique array", async () => {
  const result = await validateCatalog({
    version: "pnh-capability-catalog-v1",
    capabilities: [{ id: "allowed-hosts", limit: stringSet(["b-host", "a-host"]) }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const [entry] = result.catalog.capabilities as Record<string, JsonValue>[];
    assert.deepEqual((entry?.limit as Record<string, JsonValue>).values, ["a-host", "b-host"]);
  }
});

test("canonical bytes are version-tagged and fixed arity per capability", async () => {
  const catalogBytes = await bytes(goodCatalog());
  const parsed = JSON.parse(catalogBytes) as unknown[];
  assert.equal(parsed[0], "pnh-capability-catalog-v1");
  const entries = parsed[1] as unknown[];
  assert.equal(entries.length, 3);
  const [id, tuple] = entries[0] as [string, unknown[]];
  assert.equal(id, "model-calls");
  assert.deepEqual(tuple, ["integer-max", "pnh-capability-limit-v1", 5]);
});

test("canonical bytes differ when capability order changes", async () => {
  const a = goodCatalog();
  const reordered = a.capabilities as JsonValue[];
  const b = { ...goodCatalog(), capabilities: [...reordered].reverse() };
  const bytesA = await bytes(a);
  const bytesB = await bytes(b);
  assert.notEqual(bytesA, bytesB);
});

test("isCapabilitySubset narrows or rejects per schema", async () => {
  assert.equal(await subset(integerMax(5), integerMax(5)), true);
  assert.equal(await subset(integerMax(5), integerMax(3)), true);
  assert.equal(await subset(integerMax(3), integerMax(5)), false);
  assert.equal(await subset(stringSet(["a", "b"]), stringSet(["a"])), true);
  assert.equal(await subset(stringSet(["a"]), stringSet(["a", "b"])), false);
  assert.equal(await subset(booleanGate(true), booleanGate(false)), true);
  assert.equal(await subset(booleanGate(true), booleanGate(true)), true);
  assert.equal(await subset(booleanGate(false), booleanGate(true)), false);
});

test("isCapabilitySubset is incomparable across schema or version mismatch", async () => {
  assert.equal(await subset(integerMax(5), stringSet(["a"])), false);
  assert.equal(
    await subset(integerMax(5), { schema: "integer-max", version: "pnh-capability-limit-v2", max: 1 }),
    false,
  );
});

test("validateCapabilityLimit accepts each schema and rejects malformed shapes", async () => {
  assert.deepEqual(await validateLimit(integerMax(2)), integerMax(2));
  assert.deepEqual(await validateLimit(stringSet(["z", "a"])), stringSet(["a", "z"]));
  assert.deepEqual(await validateLimit(booleanGate(false)), booleanGate(false));

  const malformed: SandboxArgument[] = [
    null,
    "not-a-record",
    { ...integerMax(2), schema: "unknown-schema" },
    { ...integerMax(2), version: "pnh-capability-limit-v2" },
    { schema: "integer-max", version: "pnh-capability-limit-v1", max: 2, extra: 1 },
    { schema: "integer-max", version: "pnh-capability-limit-v1" },
    integerMax(-1),
    integerMax(1.5),
    { schema: "string-set", version: "pnh-capability-limit-v1", values: "not-an-array" },
    { ...stringSet(["a"]), extra: 1 },
    stringSet(["Bad_Slug"]),
    stringSet(["a", "a"]),
    { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: "yes" },
    { ...booleanGate(true), extra: 1 },
  ];
  for (const value of malformed) {
    assert.equal(await validateLimit(value), null);
  }
});

test("every catalog reject code fires on its exact cause", async () => {
  const cases: Array<[SandboxArgument, string]> = [
    [null, "shape"],
    [
      { kind: "accessor-record", key: "version", returns: "pnh-capability-catalog-v1", value: goodCatalog() },
      "shape",
    ],
    [{ kind: "inherited-record", inherited: goodCatalog(), own: {} }, "shape"],
    [{ kind: "non-enumerable-record", hidden: 1, key: "hidden", value: goodCatalog() }, "unknown-key"],
    [{ ...goodCatalog(), extra: 1 }, "unknown-key"],
    [(() => {
      const missing = goodCatalog();
      delete missing.capabilities;
      return missing;
    })(), "shape"],
    [{ ...goodCatalog(), version: "pnh-capability-catalog-v0" }, "version"],
    [{ ...goodCatalog(), capabilities: "not-an-array" }, "capabilities-shape"],
    [{ ...goodCatalog(), capabilities: ["not-an-object"] }, "capability-shape"],
    [{ ...goodCatalog(), capabilities: [{ id: "model-calls" }] }, "capability-shape"],
    [{ ...goodCatalog(), capabilities: [{ id: "Bad_Slug", limit: integerMax(1) }] }, "slug"],
    [{ ...goodCatalog(), capabilities: [{ id: "model-calls", limit: "nope" }] }, "limit-schema"],
    [{ ...goodCatalog(), capabilities: [{ id: "model-calls", limit: { ...integerMax(1), schema: "unknown" } }] }, "limit-schema"],
    [
      {
        ...goodCatalog(),
        capabilities: [{ id: "model-calls", limit: { schema: "integer-max", version: "pnh-capability-limit-v1" } }],
      },
      "limit-shape",
    ],
    [{ ...goodCatalog(), capabilities: [{ id: "model-calls", limit: integerMax(-1) }] }, "limit-shape"],
    [
      {
        ...goodCatalog(),
        capabilities: [
          { id: "model-calls", limit: integerMax(1) },
          { id: "model-calls", limit: integerMax(2) },
        ],
      },
      "duplicate-id",
    ],
  ];
  for (const [value, code] of cases) {
    const result = await validateCatalog(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    if (!result.ok) assert.equal(result.code, code, JSON.stringify(value));
  }
});

test("digest derivation fails closed on a malformed injected hash", async () => {
  const result = await deriveDigest(goodCatalog(), "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});

test("digest derivation propagates catalog validation failures", async () => {
  const result = await deriveDigest(null);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "shape");
});
