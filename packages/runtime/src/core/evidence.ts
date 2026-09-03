// PNH evidence hash chain. Pure: hashing is injected. The trusted checkpoint
// binds the chain head and length; internal links alone are not an evidence
// retention or append-only store.
import { DIGEST_RE, type Sha256Hex } from "./grant.ts";

export const GENESIS_HASH = "0".repeat(64);

export interface EvidenceRecord {
  seq: number;
  prevHash: string;
  payload: string;
  hash: string;
}

export interface EvidenceCheckpoint {
  length: number;
  finalHash: string;
}

function recordHash(seq: number, prevHash: string, payload: string, hash: Sha256Hex): string {
  const digest = hash(`${seq}\n${prevHash}\n${payload}`);
  if (!DIGEST_RE.test(digest)) throw new Error("hash-output");
  return digest;
}

export function appendRecord(
  chain: readonly EvidenceRecord[],
  payload: string,
  hash: Sha256Hex,
): EvidenceRecord {
  const seq = chain.length;
  const last = chain[chain.length - 1];
  if (
    last !== undefined &&
    (!Number.isSafeInteger(last.seq) || last.seq !== seq - 1 || !DIGEST_RE.test(last.hash))
  ) {
    throw new Error("chain-tail");
  }
  const prevHash = last === undefined ? GENESIS_HASH : last.hash;
  return { seq, prevHash, payload, hash: recordHash(seq, prevHash, payload, hash) };
}

export function verifyChain(
  chain: readonly EvidenceRecord[],
  checkpoint: EvidenceCheckpoint,
  hash: Sha256Hex,
): { ok: true } | { ok: false; seq: number; reason: "length" | "head" | "seq" | "link" | "hash" | "digest" } {
  if (chain.length !== checkpoint.length) return { ok: false, seq: chain.length, reason: "length" };
  if (!DIGEST_RE.test(checkpoint.finalHash)) return { ok: false, seq: chain.length, reason: "digest" };
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i] as EvidenceRecord;
    if (!DIGEST_RE.test(rec.prevHash) || !DIGEST_RE.test(rec.hash)) {
      return { ok: false, seq: rec.seq, reason: "digest" };
    }
    if (rec.seq !== i) return { ok: false, seq: rec.seq, reason: "seq" };
    const expectedPrev = i === 0 ? GENESIS_HASH : (chain[i - 1] as EvidenceRecord).hash;
    if (rec.prevHash !== expectedPrev) return { ok: false, seq: rec.seq, reason: "link" };
    if (rec.hash !== recordHash(rec.seq, rec.prevHash, rec.payload, hash)) {
      return { ok: false, seq: rec.seq, reason: "hash" };
    }
  }
  const actualHead = chain.at(-1)?.hash ?? GENESIS_HASH;
  if (actualHead !== checkpoint.finalHash) return { ok: false, seq: Math.max(0, chain.length - 1), reason: "head" };
  return { ok: true };
}
