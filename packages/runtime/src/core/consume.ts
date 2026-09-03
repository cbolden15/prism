// PNH at-most-once consume port. Distinct from replay protection: 'committed'
// means THIS call inserted the row. A caller may proceed to execution only on
// 'committed'. 'replayed' means a write exists but was not this call's —
// under DSH finding ADV3-C2/T22 semantics the caller must NOT execute.
// 'conflict' means the same attempt key exists with a different grant digest
// (grant re-issue/broadening) — never execute, surface to the operator.
// Implementations MUST throw on any ambiguous storage failure (fail closed);
// there is no rule that re-presents an ambiguous outcome as success.
import type { GrantClaim } from "./grant.ts";

export const CONSUME_DECISIONS = ["committed", "replayed", "conflict"] as const;

export type ConsumeDecision = (typeof CONSUME_DECISIONS)[number];

export function consumeDecisions(): readonly ConsumeDecision[] {
  return CONSUME_DECISIONS;
}

export interface ReplayLedger {
  consume(claim: GrantClaim): Promise<ConsumeDecision>;
}
