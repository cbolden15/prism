import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sandboxCall, type JsonValue } from "../../packages/runtime/src/harness/sandbox.ts";

interface EvidenceRecord extends Record<string, JsonValue> {
  seq: number;
  prevHash: string;
  payload: string;
  hash: string;
}

interface EvidenceCheckpoint extends Record<string, JsonValue> {
  length: number;
  finalHash: string;
}

type VerifyResult =
  | { [key: string]: JsonValue; ok: true }
  | {
      [key: string]: JsonValue;
      ok: false;
      seq: number;
      reason: "length" | "head" | "seq" | "link" | "hash" | "digest";
    };

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const GENESIS_HASH = "0".repeat(64);

function checkpoint(chain: readonly EvidenceRecord[]): EvidenceCheckpoint {
  return { length: chain.length, finalHash: chain.at(-1)?.hash ?? GENESIS_HASH };
}

function append(
  chain: readonly EvidenceRecord[],
  payload: string,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<EvidenceRecord> {
  return sandboxCall<EvidenceRecord>({
    args: [[...chain], payload],
    entry: "evidence.ts",
    exportName: "appendRecord",
    port: { argumentIndex: 2, fixture: hashFixture, name: "sha256" },
  });
}

function verify(
  chain: readonly EvidenceRecord[],
  evidenceCheckpoint: EvidenceCheckpoint,
  hashFixture: "malformed" | "valid" = "valid",
): Promise<VerifyResult> {
  return sandboxCall<VerifyResult>({
    args: [[...chain], evidenceCheckpoint],
    entry: "evidence.ts",
    exportName: "verifyChain",
    port: { argumentIndex: 2, fixture: hashFixture, name: "sha256" },
  });
}

test("append builds a verifiable chain", async () => {
  const chain: EvidenceRecord[] = [];
  chain.push(await append(chain, "event-one"));
  chain.push(await append(chain, "event-two"));
  chain.push(await append(chain, "event-three"));
  assert.deepEqual(await verify(chain, checkpoint(chain)), { ok: true });
  assert.deepEqual(chain.map((record) => record.seq), [0, 1, 2]);
});

test("tampered payload is detected at the exact record", async () => {
  const chain: EvidenceRecord[] = [];
  chain.push(await append(chain, "event-one"));
  chain.push(await append(chain, "event-two"));
  const tampered = [chain[0]!, { ...chain[1]!, payload: "event-2" }];
  assert.deepEqual(await verify(tampered, checkpoint(chain)), { ok: false, seq: 1, reason: "hash" });
});

test("re-linked record (hash recomputed over wrong prev) is detected", async () => {
  const chain: EvidenceRecord[] = [];
  chain.push(await append(chain, "event-one"));
  chain.push(await append(chain, "event-two"));
  const forged: EvidenceRecord = {
    seq: 1,
    prevHash: GENESIS_HASH,
    payload: "event-two",
    hash: sha256(`1\n${GENESIS_HASH}\nevent-two`),
  };
  assert.deepEqual(await verify([chain[0]!, forged], checkpoint(chain)), { ok: false, seq: 1, reason: "link" });
});

test("gapped or reordered seq is detected", async () => {
  const chain: EvidenceRecord[] = [];
  chain.push(await append(chain, "event-one"));
  chain.push(await append(chain, "event-two"));
  const gapped = [chain[0]!, { ...chain[1]!, seq: 2 }];
  assert.deepEqual(await verify(gapped, checkpoint(chain)), { ok: false, seq: 2, reason: "seq" });
});

test("empty chain verifies", async () => {
  assert.deepEqual(await verify([], { length: 0, finalHash: GENESIS_HASH }), { ok: true });
});

test("append rejects a malformed prior tail instead of extending it", async () => {
  const validDigest = "1".repeat(64);
  for (const malformed of [
    [{ seq: 0.5, prevHash: GENESIS_HASH, payload: "old", hash: validDigest }],
    [{ seq: 2, prevHash: GENESIS_HASH, payload: "old", hash: validDigest }],
    [{ seq: 0, prevHash: GENESIS_HASH, payload: "old", hash: "not-a-digest" }],
  ]) {
    await assert.rejects(append(malformed, "next"), /chain-tail/);
  }
});

test("digest and injected hash failures fail closed", async () => {
  const valid: EvidenceRecord = {
    seq: 0,
    prevHash: GENESIS_HASH,
    payload: "event-one",
    hash: sha256(`0\n${GENESIS_HASH}\nevent-one`),
  };
  await assert.rejects(append([], "event-one", "malformed"), /hash-output/);
  assert.deepEqual(
    await verify([], { length: 0, finalHash: "not-a-digest" }),
    { ok: false, seq: 0, reason: "digest" },
  );
  assert.deepEqual(
    await verify([{ ...valid, prevHash: "not-a-digest" }], checkpoint([valid])),
    { ok: false, seq: 0, reason: "digest" },
  );
  assert.deepEqual(
    await verify([{ ...valid, hash: "not-a-digest" }], checkpoint([valid])),
    { ok: false, seq: 0, reason: "digest" },
  );
  await assert.rejects(verify([valid], checkpoint([valid]), "malformed"), /hash-output/);
});

test("tail truncation and full-history replacement fail against the checkpoint", async () => {
  const chain: EvidenceRecord[] = [];
  chain.push(await append(chain, "event-one"));
  chain.push(await append(chain, "event-two"));
  const evidenceCheckpoint = checkpoint(chain);
  assert.deepEqual(await verify(chain.slice(0, 1), evidenceCheckpoint), { ok: false, seq: 1, reason: "length" });
  const replacement: EvidenceRecord[] = [];
  replacement.push(await append(replacement, "forged-one"));
  replacement.push(await append(replacement, "forged-two"));
  assert.deepEqual(await verify(replacement, evidenceCheckpoint), { ok: false, seq: 1, reason: "head" });
});
