import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryReplayLedger } from "../../packages/runtime/test/support/memory-ledger.ts";
import { sandboxCall } from "../../packages/runtime/src/harness/sandbox.ts";

const claim = (key: string, digest: string) => ({ key, digest });
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);

test("consume protocol exposes every terminal decision", async () => {
  const decisions = await sandboxCall<string[]>({
    args: [],
    entry: "consume.ts",
    exportName: "consumeDecisions",
  });
  assert.deepEqual(decisions, ["committed", "replayed", "conflict"]);
});

test("first consume commits; identical retry is 'replayed', never 'committed'", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  // T22 regression: a second holder (or delivery retry) of the SAME grant
  // must not be told it committed — 'replayed' means "a write exists,
  // it was not mine."
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "replayed");
});

test("same attempt key with a different digest is 'conflict'", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  assert.equal(await ledger.consume(claim("a/p/t/1", D2)), "conflict");
});

test("different attempts are independent", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  assert.equal(await ledger.consume(claim("a/p/t/2", D1)), "committed");
});

test("two instances sharing a store: exactly one commits", async () => {
  const store = new Map<string, string>();
  const a = new MemoryReplayLedger(store);
  const b = new MemoryReplayLedger(store);
  const ra = await a.consume(claim("a/p/t/1", D1));
  const rb = await b.consume(claim("a/p/t/1", D1));
  assert.deepEqual([ra, rb].sort(), ["committed", "replayed"]);
});

test("injected store failure throws — fail closed, no re-present rule", async () => {
  const failing = new MemoryReplayLedger(new Map(), () => {
    throw new Error("store unavailable");
  });
  await assert.rejects(failing.consume(claim("a/p/t/1", D1)), /store unavailable/);
});
