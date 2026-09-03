# Prism Harness goal-execution design hardening review

Target: `docs/plans/provider-neutral-harness/2026-08-26-prism-harness-goal-execution-design-spec.md`

## 1. Overall verdict

**Design rework is required before ratification.** The target has a coherent
direction, but three authority and sequencing defects block the Section 18 owner
decision:

1. A judge run can turn untrusted model output into the selection record that
   unlocks an outward-authorized apply run.
2. An encapsulated runtime can perform interior outward effects that D4 cannot
   reserve, approve, permit, or receipt individually.
3. The operative Plan I through K gates allow D8 implementation before Plan G,
   despite the document's explicit post-first-release posture.

The five lens reports produced 32 raw findings. Verification killed 11 and
merged 8 duplicate IDs. The reconciled result is 3 Critical, 10 Important, and
0 Minor findings.

## 2. Ranked surviving findings

### Critical 1: Judge output can become apply authority

Merged finding IDs: `ADVERSARIAL-2`, `SECURITY-AUTHORITY-1`, `COHERENCE-1`,
`FEAS-5`.

Evidence: the target defines a judge run as settling a selection record in
Sections 6 and 11.2 (`2026-08-26-prism-harness-goal-execution-design-spec.md:137-140,388-395`), exposes settlement-side `recordSelection` in Section 13
(`:461-466`), lists judge selections as pending owner action in Section 12.2
(`:427-434`), and then says in PNH-INV-51 that only the authenticated operator
channel may write a selection record (`:483`). The parent specification treats
model and plugin output as untrusted data in Sections 8.4 and 10
(`2026-08-26-prism-harness-architecture-design-spec.md:201-205,265-280`).
PNH-INV-10 states the same rule in
`pnh/contracts/invariants.yaml:148-175`.

Failure scenario:

1. A competitor artifact steers the judge model toward its own digest.
2. The judge emits that digest as the winner.
3. Settlement materializes the judge result as a selection record.
4. An apply task references the record.
5. D4 accepts the record as its outward-permit precondition.
6. Untrusted model output has authorized an outward change without an operator
   decision.

Affected: target Sections 6, 7.2, 11.2, 12.2, 13, 14, and Plan K;
PNH-INV-47, PNH-INV-50, and PNH-INV-51.

Exact sections to amend: Sections 6, 7.2, 11.2, 12.2, 13, 14, Plan K, and
Section 17 criteria 5 and 6.

Smallest correction: replace judge-created `SelectionRecord` with an untrusted
`JudgeRecommendation`. Only the authenticated operator channel may convert a
recommendation into the immutable selection record accepted by D4. The channel
must retrieve and display the canonical candidate set and selected digest before
the operator confirms it.

### Critical 2: Encapsulated outward work bypasses per-effect governance

Merged finding IDs: `ADVERSARIAL-1`, `SECURITY-AUTHORITY-2`.

Evidence: Section 9.1 permits `runShape: "encapsulated"` without excluding
outward grants (`2026-08-26-prism-harness-goal-execution-design-spec.md:253-274`). Section 10.4 states that interior tool calls are invisible to
settlement and that admission accepts that opacity (`:355-367`). Section 11.2
does not bar an encapsulated apply task (`:392-399`), while Section 1 promises
that every tool call and outward action is governed (`:29-34`) and PNH-INV-50
claims a run without outward classes cannot cause an outward effect (`:482`).
The parent D3 contract governs one exact provider dispatch in Section 16
(`2026-08-26-prism-harness-architecture-design-spec.md:907-998`); D4's effect
state machine can govern only visible reservations and permit consumption in
Section 15.4 (`:747-778`).

Failure scenario:

1. An encapsulated task is admitted with no visible outward effect class, or is
   used as an apply task.
2. Its prompt or selected artifact instructs the vendor runtime to invoke an
   internal shell, network, or publication tool.
3. D4 consumes one permit for the enclosing provider dispatch.
4. The vendor runtime performs the interior outward action.
5. Prism receives only the top-level observation, with no reservation,
   approval, permit, or receipt for the interior action.
6. The run can settle while its per-effect governance claim is false.

Affected: target Sections 1, 4, 5, 9.1, 10.4, 11.2, 14, and Plans I and K;
PNH-INV-50.

Exact sections to amend: Sections 4, 5, 9.1, 10.4, 11.2, 14, Plan I, Plan K,
and Section 17 criteria 2, 3, and 5.

Smallest correction: production admission must reject encapsulated tasks with
outward grants, approval gates, or apply authority unless an admission-bound
execution profile proves that the external runtime is artifact-only and cannot
perform privileged or outward effects. All outward-capable work must use the
declarative path.

### Critical 3: Plan I through K can enter the first-release candidate before Plan G

Finding ID: `SCOPE-GUARDIAN-1`.

Evidence: Section 3 places D8 after Plan G and says it is not first-release
scope (`2026-08-26-prism-harness-goal-execution-design-spec.md:63-84`). The
operative plan text instead starts Plan I after B2, Plan J after D and E, and
Plan K after J (`:505,522,538`). The parent dependency order requires B2, then
E, F, and G (`2026-08-26-prism-harness-architecture-design-spec.md:1766-1793`). Plan F audits all 46 first-release rows and Plan G packages the
exact candidate (`:1719-1756`). Parent hardening Important 9 rejects a
self-selected release claim set
(`2026-08-26-prism-harness-architecture-design-spec.hardening.md:223-235`).

Failure scenario:

1. B2 closes while Plans E, F, and G remain open.
2. Plan I changes production registry and admission surfaces.
3. Plans J and K add D4 and operator-channel behavior before the first-release
   audit and package gates close.
4. Plan F still audits the ratified D1 through D7 baseline.
5. Plan G either packages unaudited D8 behavior or absorbs Plans I through K.
6. D8 becomes first-release scope despite the stated boundary.

Affected: target Sections 3, 15, and 17; PNH-INV-47 through PNH-INV-52; Plans
I, J, and K.

Exact sections to amend: Sections 3 and 15, plus Section 17 criterion 8.

Smallest correction: distinguish authoring from implementation. Plan I may be
drafted after B2, but no D8 implementation begins until Plan G closes. Plan J
then follows I, and Plan K follows J. State that no D8 code enters the Plan F/G
candidate.

### Important 1: D8 lacks the successor constitutional baseline it requires

Merged finding IDs: `FEAS-2`, `SCOPE-GUARDIAN-2`, `COHERENCE-6`.

Evidence: Sections 14 and 15 propose PNH-INV-47 through PNH-INV-52 with closing
gates I, J, and K (`2026-08-26-prism-harness-goal-execution-design-spec.md:471-538`), while Section 17 claims compatibility with registry version 2
(`:573-576`). Plan A requires a complete `first_release` object, accepts closing
gates only A through H, and pins an immutable 46-row baseline
(`2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md:173-242`). It permits a future baseline only through a new path and an
owner decision-backed supersession record (`:244-270`). The target invokes none
of that transition machinery.

Failure scenario:

1. Plan I tries to register PNH-INV-47 with closing gate I.
2. Registry v2 rejects I and rejects a missing `first_release` object.
3. Mutating the existing 46-row baseline is also rejected.
4. An implementer either blocks Plan I or invents an A through H mapping that
   misstates the post-first-release obligation.
5. D8 claims can no longer be activated through the ratified constitution.

Affected: target Sections 2, 3, 14, 15, and 17; PNH-INV-47 through
PNH-INV-52; Plans I, J, and K.

Exact sections to amend: Sections 2, 3, 14, 15, and Section 17 criterion 7.

Smallest correction: make an owner-ratified successor baseline a prerequisite
to Plan I. It must use a new immutable path, preserve the Plan A baseline, add
an explicit post-first-release disposition and I/J/K gates, and include complete
disposition mappings for every new invariant.

### Important 2: D8 requires versioned D4 extensions while claiming no protocol changes

Merged finding IDs: `SCOPE-GUARDIAN-3`, `COHERENCE-8`.

Evidence: Sections 5 and 10.2 say D4 is unchanged
(`2026-08-26-prism-harness-goal-execution-design-spec.md:106-118,312-330`).
The same design adds turn and effect budgets, new effect classifications,
approval prerequisites, verification evidence, and loop settlement behavior in
Sections 10.2, 10.3, 12.1, Plan J, and Plan K (`:314-353,412-423,507-536`). The
parent requires every settlement-command or record-schema change to advance its
version, hash, and conformance suite in Section 22
(`2026-08-26-prism-harness-architecture-design-spec.md:1504-1526`).

Failure scenario:

1. Plan J preserves the existing D4 schema to satisfy the target's unchanged-
   protocol claim.
2. A declarative run reserves a model turn.
3. D4 has no admitted budget field, turn discriminator, approval prerequisite,
   or verification row with which to enforce the new contract.
4. The effect either dispatches without the D8 guard or D4 changes without a
   versioned protocol surface.
5. Evidence and migration compatibility become unverifiable.

Affected: target Sections 5, 10, 12.1, 13, 15, and 17; PNH-INV-49 through
PNH-INV-52; Plans J and K.

Exact sections to amend: Sections 5, 10.2, 10.3, 12.1, 13, Plan J, Plan K, and
Section 17 criteria 3, 4, and 6.

Smallest correction: replace "no protocol changes" with "preserves D4's
reservation, permit, receipt, ambiguity, and one-writer safety semantics."
Plans J and K must version the admitted-run snapshot, settlement commands and
records, evidence rows, schema migrations, hashes, and conformance fixtures.

### Important 3: Consumed-count budget checks do not reserve budget atomically

Merged finding IDs: `ADVERSARIAL-5`, `FEAS-6` with the broader `FEAS-6` claim
narrowed during verification.

Evidence: Section 10.2 says D4 issues a permit when the consumed-turn count is
below `maxTurns`, while calling this a reservation-side check
(`2026-08-26-prism-harness-goal-execution-design-spec.md:319-323`). PNH-INV-49
requires D4 to refuse over-budget reservations (`:481`), but the target does not
define when a turn or effect claims a slot, whether in-flight operations count,
or how semantic replays are charged. Parent Section 15.9 requires explicit
transaction modes for reservation races
(`2026-08-26-prism-harness-architecture-design-spec.md:868-885`).

Failure scenario:

1. A run has one turn or effect remaining.
2. A buggy loop or concurrent recovery path creates two distinct semantic
   reservations before either operation is consumed.
3. Both reservation checks see the same consumed count and pass.
4. Both permits are consumed.
5. The run exceeds its immutable admitted budget.

Affected: target Sections 8.2, 10.2, 10.3, 14, and Plan J; PNH-INV-48 and
PNH-INV-49.

Exact sections to amend: Sections 10.2, 10.3, 14, Plan J, and Section 17
criterion 3.

Smallest correction: atomically claim one budget slot in the same transaction
that creates the first semantic reservation. Count reserved, permit-issued,
dispatching, and receipted operations. Identical semantic replay charges no new
slot; a conflicting reservation dispatches nothing. Define charging for
rejected, approval-pending, and verification effects.

### Important 4: A positive verification receipt does not prove the assertion is true

Finding ID: `ADVERSARIAL-7`.

Evidence: the target defines a verification operation as a granted operation
and accepts its positive receipt for completion in Sections 6, 9.1, and 10.3
(`2026-08-26-prism-harness-goal-execution-design-spec.md:135,253-274,343-353`). It does not bind verifier identity, subject state or artifact digest,
expected predicate, or independent provenance. The parent says plugin and tool
output are untrusted in Sections 8.4 and 10
(`2026-08-26-prism-harness-architecture-design-spec.md:201-205,265-280`) and
requires D4 to evaluate all applicable trusted evidence in Section 15.6
(`:806-828`).

Failure scenario:

1. An outward effect changes state.
2. A compromised or self-attesting verification tool returns a well-typed
   positive response without checking that state.
3. D4 authenticates that the operation ran and records its receipt.
4. The receipt is treated as proof of the predicate.
5. The run settles `completed` with a formally complete but false evidence
   chain.

Affected: target Sections 6, 9.1, 10.3, 14, Plan I, and Plan J; PNH-INV-52.

Exact sections to amend: Sections 6, 9.1, 10.3, 13, 14, Plan I, Plan J, and
Section 17 criteria 2 and 4.

Smallest correction: bind verification to an admitted verifier identity and
version, exact subject state or artifact digest, expected predicate, and trusted
observation shape. A tool's self-reported boolean must never satisfy PNH-INV-52
without D4-valid evidence for that bound subject.

### Important 5: Selection records have no owner-bound single-winner state machine

Finding ID: `SECURITY-AUTHORITY-4`.

Evidence: the selection vocabulary names only a winning artifact digest in
Section 6 (`2026-08-26-prism-harness-goal-execution-design-spec.md:136-140`).
Section 13 checks only `(programId, artifactDigest)` and specifies no owner
domain, program-definition digest, competitor-set digest, one-winner key,
record version, replay result, or conflict transition (`:461-466`). The parent
identity and state-machine rules require owner-bound identities and immutable
CAS outcomes in Sections 12, 15.3, and 15.5
(`2026-08-26-prism-harness-architecture-design-spec.md:320-343,723-745,780-804`).

Failure scenario:

1. Two authorized selection attempts process one competitive round.
2. One selects artifact A and one selects artifact B.
3. Both writes commit because no unique round identity or one-winner CAS is
   specified.
4. `requireSelection` finds both `(programId, digest)` pairs.
5. An apply task can use B despite the conflicting selection for A.

Affected: target Sections 6, 11, 13, 14, and Plan K; PNH-INV-50 and
PNH-INV-51.

Exact sections to amend: Sections 6, 11.1, 11.2, 13, 14, Plan K, and Section 17
criterion 5.

Smallest correction: define one immutable selection slot per owner-bound program
execution round. Bind owner domain, daemon-issued round ID, program-definition
digest, competitor-set digest, decision identity, winning artifact digest, and
record version. Identical replay returns the existing result; a conflicting
winner fails closed.

### Important 6: Renderer-independent confirmation covers approvals but not selections

Finding ID: `SECURITY-AUTHORITY-5`.

Evidence: Section 12.2 acknowledges that a compromised renderer can misdescribe
a decision, but its independent operator-channel echo is stated only for the
reservation content being approved
(`2026-08-26-prism-harness-goal-execution-design-spec.md:425-434`). Section 11.2
also permits owner selection through that queue (`:388-391`), and the generic
`DecisionRecord` interface does not require a canonical selection challenge
(`:455-459`). Parent Sections 8.4 and 10 keep renderer and plugin-derived content
untrusted (`2026-08-26-prism-harness-architecture-design-spec.md:201-205,265-280`).

Failure scenario:

1. A compromised renderer displays benign artifact A as the winner.
2. It submits a decision payload naming artifact B.
3. The operator channel authenticates the operator but does not independently
   retrieve and display the canonical selection fields.
4. The operator confirms based on the renderer's display.
5. The channel writes an authentic selection for B, and the apply phase uses B.

Affected: target Sections 11.2, 12.2, 13, 14, and Plan K; PNH-INV-50 and
PNH-INV-51.

Exact sections to amend: Sections 11.2, 12.2, 13, Plan K, and Section 17
criterion 6.

Smallest correction: make the operator channel fetch selection candidates from
canonical settlement state by opaque identity, display the owner domain, round,
candidate-set digest, selected digest, and artifact reference, then bind the
decision to a fresh challenge and the exact canonical selection digest.

### Important 7: Two proposed invariants use an invalid compound enforcement kind

Finding ID: `COHERENCE-7`.

Evidence: PNH-INV-47 and PNH-INV-51 specify `static-structure` plus
`runtime-adversarial` in Section 14
(`2026-08-26-prism-harness-goal-execution-design-spec.md:477-484`). The parent
requires exactly one `enforcement_kind` from a closed set in Section 18.1
(`2026-08-26-prism-harness-architecture-design-spec.md:1041-1053`), and Plan A
defines the same field as a scalar union
(`2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md:173-220`).

Failure scenario:

1. Plan I registers PNH-INV-47 with the compound value.
2. The registry parser rejects it.
3. An implementer chooses one kind to proceed.
4. The invariant later appears eligible for activation after only that proof
   shape, while the omitted half remains untested.

Affected: target Sections 14 and 17; PNH-INV-47 and PNH-INV-51; Plans I and K.

Exact sections to amend: Section 14, Plan I, Plan K, and Section 17 criterion 7.

Smallest correction: split each mixed statement into homogeneous invariants
with one enforcement kind each. Update provisional numbering, plan ownership,
proof gates, and the successor baseline accordingly.

### Important 8: Composed-prompt evidence has no canonical byte grammar

Finding ID: `FEAS-7`.

Evidence: Section 8.2 promises byte-for-byte reproduction from the admitted set
(`2026-08-26-prism-harness-goal-execution-design-spec.md:191-235`), but Sections
8.2, 8.3, and 13 define no algorithm version, file ordering rule beyond the
manifest list, separator, BOM treatment, line-ending rule, Unicode
normalization, empty-fragment behavior, final newline, or message-role
serialization (`:191-243,442-447`). The parent requires canonical request
digests and versioned schema surfaces in Sections 15.5 and 22
(`2026-08-26-prism-harness-architecture-design-spec.md:780-800,1504-1526`).

Failure scenario:

1. Two implementations admit the same prompt files.
2. One joins fragments with one line feed; the other uses two.
3. Both satisfy the target's current prose.
4. They produce different prompt bytes, provider inputs, and evidence digests.
5. The recorded digest cannot reproduce which request generated the result.

Affected: target Sections 8.2, 8.3, 13, 15, and 17; Plan I. No proposed D8
invariant directly covers this claim.

Exact sections to amend: Sections 8.2, 8.3, 13, Plan I, and Section 17
criterion 1.

Smallest correction: pin a composition-algorithm version and exact byte grammar
covering source validation, ordering, separators, roles, and serialization.
Bind the version into the task digest and add cross-platform golden fixtures for
CRLF, BOM, Unicode, empty files, and final-newline cases.

### Important 9: Wall-clock budgets have no cross-daemon-epoch rule

Finding ID: `FEAS-8`.

Evidence: Section 8.2 defines `maxWallClockSeconds` and Section 10.3 makes it a
terminal budget (`2026-08-26-prism-harness-goal-execution-design-spec.md:209-212,334-347`) without defining restart or approval-wait accounting. The
parent says monotonic deadlines are valid only inside one daemon epoch and
cannot be interpreted after restart in Sections 14.4 and 14.5
(`2026-08-26-prism-harness-architecture-design-spec.md:604-610,645-647`). Parent
recovery reconciles prior-epoch state in Section 15.10 (`:887-905`).

Failure scenario:

1. A run consumes 7,100 seconds of a 7,200-second budget.
2. launchd restarts the daemon and creates a new epoch.
3. The old monotonic deadline cannot be compared in the new epoch.
4. Resetting the deadline grants another 7,200 seconds; trusting wall time makes
   clock rollback authoritative.
5. The immutable admitted budget is exceeded or the run is rejected early.

Affected: target Sections 8.2, 10.3, 14, and Plan J; PNH-INV-48 and
PNH-INV-49.

Exact sections to amend: Sections 8.2, 10.3, Plan J, and Section 17 criteria 3
and 4.

Smallest correction: persist an elapsed-active-time accumulator, charge each
daemon epoch conservatively, and define whether approval suspension consumes
the budget. Use monotonic time only within an epoch and add restart and clock-
rollback fault tests.

### Important 10: Verification-free declarative runs have no successful terminal edge

Finding ID: `COHERENCE-4`.

Evidence: Section 9.1 permits `verification: null` and requires verification
only for outward grants
(`2026-08-26-prism-harness-goal-execution-design-spec.md:253-274`). Section 10.3
sends every model completion to `verifying`, whose only success edge requires a
verification receipt (`:334-347`). Section 11.2 explicitly needs artifact-only
competitors and judges (`:385-391`), while PNH-INV-52 applies only to outward-
grant runs (`:484`). The parent's evidence matrix requires all applicable
evidence, not a nonexistent operation
(`2026-08-26-prism-harness-architecture-design-spec.md:806-828`).

Failure scenario:

1. An artifact-only competitor is validly admitted with `verification: null`.
2. It produces its artifact and signals completion.
3. The loop enters `verifying`.
4. No verification operation exists, so no success edge can fire.
5. The run waits until budget exhaustion and the work program cannot select its
   artifact.

Affected: target Sections 4, 6, 9.1, 10.3, 11.2, 14, and Plans I through K;
PNH-INV-52.

Exact sections to amend: Sections 9.1, 10.3, 11.2, 14, Plan I, Plan J, Plan K,
and Section 17 criteria 2, 4, and 5.

Smallest correction: either require a verification binding for every
declarative run, or add an explicit `verification: null` edge that evaluates the
execution class's applicable positive-evidence rows and can settle artifact-only
work without inventing a receipt.

No Minor finding survived verification.

## 3. Findings killed or merged by verification

### Killed findings

| Finding | Why it was killed |
|---|---|
| `ADVERSARIAL-3` | The scenario keeps the destructive operation inside the owner-admitted grant. Untrusted content influences use of existing authority but does not create or widen authority. |
| `ADVERSARIAL-4` | Parent Sections 12, 15.5, and 15.10 already require runtime-created stable operation IDs, canonical-parameter idempotency, and ambiguous recovery for every effect. |
| `ADVERSARIAL-6` | Denial settles the effect `rejected`; the inherited one-writer CAS and immutable terminal rules do not permit both an effective approval and denial. |
| `SECURITY-AUTHORITY-3` | The tool-plugin list does not replace the parent capability catalog. Parent admission and D4 still bind capability identity and canonical parameters. |
| `COHERENCE-2` | Section 11.2 explicitly requires an admission-bound selection reference, and Section 13 says its interfaces are sketches to be pinned by Plan K. |
| `COHERENCE-3` | `looping` and `verifying` are loop substates that produce terminal candidates; parent D4 remains authoritative and the target explicitly inherits `ambiguous`. |
| `COHERENCE-5` | Like `SECURITY-AUTHORITY-3`, it omits the inherited capability-grant layer attached to admitted plugins. |
| `FEAS-1` | Empty prompt-plugin capabilities do not erase the admitted run's immutable `ProviderBrokerBinding`, which D4 authenticates for model dispatch. |
| `FEAS-3` | The target already requires the apply task's selection reference to be admission-bound and assigns its exact schema to Plan K. |
| `FEAS-4` | Parent `reserved` is already a durable pending state, and the target's decision queue explicitly lists pending approval-gated reservations. |
| `SCOPE-GUARDIAN-4` | The control-plane claim applies to program topology and scheduling; the target separately carves out selection records and declares daemon-side D8 interfaces. The real versioning defect survives as Important 2. |

### Merged findings

| Merged IDs | Surviving finding | Reason |
|---|---|---|
| `ADVERSARIAL-2`, `SECURITY-AUTHORITY-1`, `COHERENCE-1`, `FEAS-5` | Critical 1 | All identify the same judge-output-to-selection-authority path. |
| `ADVERSARIAL-1`, `SECURITY-AUTHORITY-2` | Critical 2 | Both identify opaque encapsulated effects that bypass D4 visibility. |
| `FEAS-2`, `SCOPE-GUARDIAN-2`, `COHERENCE-6` | Important 1 | All identify the missing successor baseline and I/J/K gate vocabulary. |
| `SCOPE-GUARDIAN-3`, `COHERENCE-8` | Important 2 | Both show that D8 needs versioned D4 extensions despite the unchanged-protocol claim. |
| `ADVERSARIAL-5`, `FEAS-6` | Important 3 | Verification retained the narrower consumed-count race and dropped broader claims that inherited D4 transaction rules already cover. |

## 4. Cross-finding root causes

| Root cause | Findings | Sections | Plans | Invariants |
|---|---|---|---|---|
| Authority-bearing records lack one exclusive typed writer and complete identity | Critical 1; Important 5 and 6 | 11 through 13 | K | 47, 50, 51 |
| Opaque execution is treated as compatible with per-effect governance | Critical 2 | 9.1, 10.4, 11.2 | I, K | 50 |
| D8 says it reuses existing contracts while adding new state, counters, timing, and evidence semantics | Important 2, 3, 8, 9, 10 | 8, 10, 12, 13 | I, J, K | 48, 49, 52 |
| Constitutional and release sequencing stop at the D1 through D7 baseline | Critical 3; Important 1 and 7 | 3, 14, 15, 17 | I, J, K | 47 through 52 |
| Receipt authenticity is confused with truth of the verified predicate | Important 4 | 9.1, 10.3, 14 | I, J | 52 |

## 5. Ratification recommendation

**Recommendation: do not ratify the current draft.** Before the Section 18
owner decision:

1. Replace judge-created selection authority with operator-ratified selection
   records, including single-winner identity and canonical confirmation.
2. Make encapsulated production runs effect-free, or prohibit them from every
   outward and apply path.
3. Move D8 implementation after Plan G and ratify a successor constitutional
   baseline for PNH-INV-47 through PNH-INV-52 and gates I through K.
4. Specify the versioned D4 extension, atomic budget charging, prompt byte
   grammar, cross-epoch wall-clock accounting, and verification evidence rules.
5. Re-run hardening after those amendments. Record `Ratified with amendments`
   only if no Critical finding survives the second pass.

## 6. Review integrity

The review used repository-local evidence only. It did not edit the target,
authority documents, code, tests, registry, or plan series.

Five read-only Codex lenses ran: ADVERSARIAL, COHERENCE, FEASIBILITY,
SECURITY-AUTHORITY, and SCOPE-GUARDIAN. Their first launch attempt produced no
sentinel blocks because the outer workspace sandbox denied Codex app-server
initialization. Each lens was re-dispatched once outside that outer sandbox,
while every nested worker remained under `--sandbox read-only`. All five retries
exited successfully and produced final sentinel blocks.

Two additional read-only verifier workers split all 32 raw findings 16/16. Both
completed every assigned row. The coordinator extracted the last sentinel block
from each worker output, re-opened the cited target and authority sections, then
applied the kills and merges recorded above. All seven successful workers used
model `gpt-5.6-sol` with reasoning effort `high`.

This was the supplied bespoke five-Codex-lens topology, not the standard saved
multi-engine hardening workflow. The result therefore has independent contexts
but not independent model families. The review did not run implementation
tests, select a SQLite library, benchmark loop-scale settlement, exercise a live
provider, inspect a real renderer or operator channel, or validate macOS and
launchd behavior. Those remain implementation-plan verification work.

Full worker output, rendered prompts, extracted reports, and the execution
ledger remain under `/tmp/pnh-goal-harden/` and are not copied into this report.
