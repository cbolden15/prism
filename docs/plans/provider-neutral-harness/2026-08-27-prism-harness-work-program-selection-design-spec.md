# Prism Harness work-program and competitive-selection design (deferred decision area)

Status: **deferred draft — split out of D8 by owner decision, not part of the
D1–D10 baseline**. On 2026-08-27 the owner directed that the work-program,
judge, and selection subsystem be removed from the D8 goal-execution
specification and re-homed as its own separately ratifiable decision area,
following the second-cycle hardening finding that the subsystem traced to no
stated D8 goal and forced bundled ratification. D8 (revision 4) closes on
Plans I and J alone.

This document preserves the split-out design so it can be independently
hardened and ratified when the owner names a concrete requirement for
multi-run competition. Nothing here is ratified, and no plan may be authored
from this document before its own hardening cycle completes with no Critical
or Important finding and the owner ratifies it.

Invariant aliases: this area uses its own provisional namespace, WP-INV-01
through WP-INV-03 (matching the D9-INV and D10-INV convention). D8's retired
alias D8-INV-06 is superseded by WP-INV-01; D8-INV-07 and D8-INV-08 remain in
D8 core covering approval records, and WP-INV-02 and WP-INV-03 extend the same
writer-exclusivity rules to selection records. Final IDs are assigned only by
an owner-ratified successor constitutional baseline.

Precedence: identical to D8 revision 4 Section 2, with D8 revision 4 itself
above this document. Everything D8 defines — the operator channel,
canonical-content confirmation, destination-capability enforcement, budgets,
verification bindings — is inherited, not redefined.

---

## 1. Position

- Authoring gate: owner names a concrete multi-run competition requirement
  and ratifies this design after its own hardening cycle.
- Implementation gate: after Plan J closes (Plan K remains this area's plan
  name), plus the successor constitutional baseline covering WP-INV-01..03.
- D9 dependency: D9's Milestone L2 (bounded evaluator-optimizer programs)
  consumes work programs and therefore gates on this area's Plan K, not on
  D8 core. D9's Milestone L1 does not depend on this area.

## 2. Design (extracted from D8 revision 3, Sections 11.1–11.4)

### 2.1 Control-plane composition

A work program is a set of admitted runs correlated by a `programId` carried
in each run's evidence. The kernel neither schedules nor sequences them; the
consumer control plane (CLI or a supervising service) admits each run through
the normal D1 path. This preserves the parent non-goal: no multi-task
scheduling inside the harness.

### 2.2 Competitive fan-out: compete, recommend, select, apply

Because grants are static at admission, competition is two-phase with a human
selection between the phases:

1. **Compete.** N runs are admitted from the same or different prompt plugins
   and route classes, each with artifact-only grants (no outward effect
   classes). Each settles with an artifact digest.
2. **Open the round.** The operator channel creates one selection round for
   the program: a daemon-issued `selectionRoundId` bound to the owner domain,
   `programId`, program-definition digest, and the competitor-set digest
   (the canonical ordered set of competitor run and artifact identities).
3. **Recommend (optional).** A judge run — itself an admitted artifact-only
   run with read-only grants over the competitor artifacts — settles a judge
   recommendation: untrusted evidence naming a recommended digest with
   rationale. It is stored and displayed; it authorizes nothing.
4. **Select.** An authenticated operator ratifies the winner through the
   operator channel under D8's canonical-content confirmation protocol. The
   channel writes the immutable selection record. This is the only path that
   creates selection authority.
5. **Apply.** A separately admitted apply task carries the outward grants and
   an admission-bound reference to `(programId, selectionRoundId)`. D4
   refuses outward reservations from an apply run unless the referenced
   selection record exists, is operator-ratified, binds the same owner
   domain, and names exactly the artifact digest the apply task was admitted
   against.

### 2.3 Selection record state machine

One selection round has exactly one immutable selection slot:

```text
round-open
  |-- operator ratifies winner -> selected (immutable)
  |-- operator closes round without selection -> closed-unselected (immutable)
```

The selection record binds: `ownerDomainId`, `programId`, `selectionRoundId`,
program-definition digest, competitor-set digest, the operator decision
identity (channel-authenticated), the winning artifact digest, and a record
version. Uniqueness is `(ownerDomainId, programId, selectionRoundId)` under
the daemon's one-writer CAS: the first committed record wins; an identical
replay (same decision identity and winning digest) returns the existing
record; any conflicting write fails closed with operator-visible conflict
evidence and does not rewrite history. A new competitive attempt requires a
new round with a new competitor-set digest; rounds are never reused.

**Membership and lineage (closes the revision-3 review's selection-membership
finding).** Selection creation atomically proves, inside the same CAS
transaction, that the winning artifact digest is a member of the frozen
competitor set bound to the round: the channel resolves the candidate list
from the competitor-set digest and refuses any winner — operator-typed or
judge-recommended — whose digest is not in that set. A judge recommendation
naming a digest outside the round's competitor set is displayed with an
explicit non-member warning and cannot be confirmed.

**One-use apply binding (closes the same review's reuse finding).** A
selection record authorizes exactly one admitted apply task. The apply task's
admission binds `(programId, selectionRoundId, applyTaskDigest)`; D4's
selection precondition check consumes that binding atomically on first
outward-permit issuance for the apply run, and a second apply task
referencing the same round fails its precondition. Re-applying after a
failed apply run requires a new owner decision that explicitly releases the
binding, recorded as evidence.

### 2.4 Verifier and judge shapes

Judge panels, adversarial verification, and perspective-diverse review are
expressible as work programs (N competitor or verifier runs plus one
synthesis/judge run). No kernel support is required beyond selection rounds
and records; topology templates are a control-plane authoring concern.

## 3. Interfaces (sketch)

```ts
interface SelectionState {
  openRound(r: RoundSpec): Promise<SelectionRoundId>;
  // operator-channel only; binds program, competitor-set, owner domain
  requireSelection(ref: ApplySelectionRef): Promise<void>;
  // called by D4 before issuing outward permits to an apply run; validates
  // existence, operator ratification, owner domain, round identity,
  // frozen-set membership, the exact admitted winning artifact digest, and
  // the unconsumed one-use apply binding; never sufficient for a D9
  // promotion
}
```

Selection decisions ride D8's `OperatorDecisions` channel and
canonical-content confirmation: the channel fetches the canonical round
content (owner domain, round identity, program-definition digest,
competitor-set digest, each candidate's run and artifact identities, any
judge recommendation labeled untrusted) by opaque identity, displays it, and
binds the confirmation to a fresh single-use challenge and the exact
canonical digest.

## 4. Proposed invariants

| Alias | Statement (target) | Enforcement kind | Closing gate |
|---|---|---|---|
| WP-INV-01 | Outward apply authority requires an existing operator-ratified selection record bound at reservation time to the same owner domain, program, round, and exact admitted artifact digest; the winning digest is a proven member of the round's frozen competitor set; and the record's one-use apply binding is unconsumed. | `runtime-adversarial` | K |
| WP-INV-02 | Selection records accepted by D4 preconditions are written only through the authenticated operator channel under canonical-content challenge confirmation; no plugin, harness instance, broker, renderer, or judge output can create, complete, or default one. | `runtime-adversarial` | K |
| WP-INV-03 | No code path outside the daemon operator-channel module can construct or persist a selection record. | `static-structure` | K |

## 5. Plan K: work programs and operator selection (deferred)

Decision owner: this area (operator surfaces shared with D2's channel
authority; approval-gated effects remain D8 core).

Deliver: `programId` evidence correlation; selection rounds, the one-winner
selection-record CAS with membership proof and one-use apply binding; the
apply-task admission binding; judge recommendations as evidence records;
selection support in the operator channel's canonical-content confirmation;
a decision-queue renderer extension for open rounds; WP-INV-01, 02, and 03
proofs.

Exit gate: a three-competitor program runs compete-recommend-select-apply end
to end with no outward effect before the operator-ratified selection record
exists; a judge recommendation alone never unlocks an apply permit; a
recommendation naming a non-member digest cannot be confirmed; two
conflicting selection attempts on one round produce one immutable winner and
one operator-visible conflict; a second apply task referencing a consumed
selection fails its precondition; a renderer-supplied decision payload naming
a digest other than the canonically displayed one is rejected; the renderer
cannot write a decision; the static writer-exclusivity check fails when a
second decision-record writer is introduced.

Begins: after Plan J closes, this area's ratification, and the successor
baseline covering its invariants.

## 6. Known open review state

The revision-3 hardening report
(`2026-08-27-prism-harness-d8-revision-3-hardening.md`) contained two
findings internal to this subsystem: the selection-membership gap and (within
the same finding) selection reuse. Both are addressed in Sections 2.3 and 3
above, but **this document has not yet had its own hardening cycle**; those
closures are unverified. The scope finding from the same report is resolved
by this split itself.

## 7. Owner ratification record

- **Split decision:** 2026-08-27 — the owner directed the split of this
  subsystem out of D8 (recorded in workstream
  `20260827-goal-prism-harness-prism-d1-d10-baseline-684db5`).
- **Ratification of this area:** pending; requires its own hardening cycle
  with no Critical or Important finding first.

Ratification would authorize writing Plan K only. It does not authorize
implementation, registry changes, or any public claim.
