// In-memory ReplayLedger for tests and local development ONLY. It is
// NON-CONFORMING for production use: it provides no durability, so a process
// restart forgets consumed grants. A durable CAS-backed adapter is a later
// plan's deliverable. This file is an adapter, not core — Node APIs allowed.
import type { GrantClaim } from "../../src/core/grant.ts";
import type { ConsumeDecision, ReplayLedger } from "../../src/core/consume.ts";

export class MemoryReplayLedger implements ReplayLedger {
  constructor(
    private readonly store: Map<string, string> = new Map(),
    private readonly beforeWrite: () => void = () => {},
  ) {}

  async consume(claim: GrantClaim): Promise<ConsumeDecision> {
    this.beforeWrite();
    const existing = this.store.get(claim.key);
    if (existing === undefined) {
      // Single-threaded Map insert models an atomic compare-and-set.
      this.store.set(claim.key, claim.digest);
      return "committed";
    }
    return existing === claim.digest ? "replayed" : "conflict";
  }
}
