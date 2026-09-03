import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  sandboxCall,
  type JsonValue,
  type SandboxArgument,
} from "../../packages/runtime/src/harness/sandbox.ts";

type TaskResult =
  | {
      [key: string]: JsonValue;
      ok: true;
      task: Record<string, JsonValue>;
      catalog: Record<string, JsonValue>;
      catalogDigest: string;
      taskDigest: string;
    }
  | { [key: string]: JsonValue; ok: false; code: string };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function goodTask(): Record<string, JsonValue> {
  return {
    programId: "pnh-demo",
    taskId: "task-1",
    attempt: 1,
    audience: "broker-a",
    operation: "invoke-model",
  };
}

function goodCatalog(): Record<string, JsonValue> {
  return {
    version: "pnh-capability-catalog-v1",
    capabilities: [{ id: "model-calls", limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 3 } }],
  };
}

function catalogBytes(catalog: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [catalog],
    entry: "capability-catalog.ts",
    exportName: "canonicalCapabilityCatalogBytes",
  });
}

function taskBytes(task: SandboxArgument, catalogDigest: SandboxArgument): Promise<string> {
  return sandboxCall<string>({
    args: [task, catalogDigest],
    entry: "task.ts",
    exportName: "canonicalTaskBytes",
  });
}

function admitTask(
  value: SandboxArgument,
  catalogValue: SandboxArgument,
  grantInputDigest: SandboxArgument,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<TaskResult> {
  return sandboxCall<TaskResult>({
    args: [value, catalogValue, grantInputDigest],
    entry: "task.ts",
    exportName: "admitTask",
    port: { argumentIndex: 3, fixture: hashFixture, name: "sha256" },
  });
}

async function expectedTaskDigest(task: Record<string, JsonValue>, catalog: Record<string, JsonValue>): Promise<string> {
  const catalogDigest = sha256(await catalogBytes(catalog));
  return sha256(await taskBytes(task, catalogDigest));
}

test("valid task admits and binds the catalog digest into the task digest", async () => {
  const task = goodTask();
  const catalog = goodCatalog();
  const grantInputDigest = await expectedTaskDigest(task, catalog);
  const result = await admitTask(task, catalog, grantInputDigest);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.taskDigest, grantInputDigest);
    assert.match(result.catalogDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.task, task);
  }
});

test("canonical task bytes are version-tagged, fixed arity, and injective", async () => {
  const task = goodTask();
  const catalogDigest = "a".repeat(64);
  const bytes = await taskBytes(task, catalogDigest);
  const array = JSON.parse(bytes) as unknown[];
  assert.equal(array.length, 7);
  assert.equal(array[0], "pnh-task-v1");
  assert.equal(array[6], catalogDigest);

  const other = await taskBytes({ ...task, taskId: "task-2" }, catalogDigest);
  assert.notEqual(bytes, other);
  const otherDigest = await taskBytes(task, "b".repeat(64));
  assert.notEqual(bytes, otherDigest);
});

test("every task reject code fires on its exact cause", async () => {
  const task = goodTask();
  const catalog = goodCatalog();
  const validDigest = await expectedTaskDigest(task, catalog);
  const missingProgramId = goodTask();
  delete missingProgramId.programId;

  const cases: Array<[SandboxArgument, SandboxArgument, SandboxArgument, string]> = [
    [null, catalog, validDigest, "shape"],
    [
      { kind: "accessor-record", key: "programId", returns: "pnh-demo", value: goodTask() },
      catalog,
      validDigest,
      "shape",
    ],
    [{ kind: "inherited-record", inherited: goodTask(), own: {} }, catalog, validDigest, "shape"],
    [{ kind: "non-enumerable-record", hidden: 1, key: "hidden", value: goodTask() }, catalog, validDigest, "unknown-key"],
    [{ ...goodTask(), extra: 1 }, catalog, validDigest, "unknown-key"],
    [missingProgramId, catalog, validDigest, "shape"],
    [{ ...goodTask(), programId: "Bad_Slug" }, catalog, validDigest, "slug"],
    [{ ...goodTask(), attempt: 0 }, catalog, validDigest, "limit-range"],
    [{ ...goodTask(), attempt: 1.5 }, catalog, validDigest, "limit-range"],
    [task, null, validDigest, "catalog"],
    [task, { kind: "accessor-record", key: "version", returns: "pnh-capability-catalog-v1", value: goodCatalog() }, validDigest, "catalog"],
    [task, catalog, "not-a-digest", "grant-digest-format"],
    [task, catalog, "a".repeat(64), "grant-binding"],
  ];

  for (const [value, catalogValue, grantInputDigest, code] of cases) {
    const result = await admitTask(value, catalogValue, grantInputDigest);
    assert.equal(result.ok, false, JSON.stringify({ value, catalogValue, grantInputDigest }));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("malformed injected hash is rejected", async () => {
  const task = goodTask();
  const catalog = goodCatalog();
  const validDigest = await expectedTaskDigest(task, catalog);
  const result = await admitTask(task, catalog, validDigest, "malformed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "hash-output");
});
