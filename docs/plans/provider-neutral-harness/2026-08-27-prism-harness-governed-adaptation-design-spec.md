# Prism Harness governed-adaptation design specification (D9 draft)

Status: **draft for owner review**. The owner authorized drafting on
2026-08-27. Drafting is not ratification and authorizes no implementation,
registry change, durable-memory write, learned-skill installation, or public
claim.

D9 is a Prism deployment decision outside the public `pnh/` kernel. It defines
how completed-run evidence may become a candidate improvement, how that
candidate is evaluated, and how an owner may promote the exact reviewed bytes
for future runs. It preserves the existing decision that the public kernel has
no durable canonical learning store.

---

## 1. Purpose

D1 through D8 make work admissible, executable, reviewable, and provable. They
do not authorize a completed run to change how later runs behave. That missing
boundary matters because useful agent systems can extract reusable lessons,
improve prompts and procedural skills, and search candidate implementations.
The same mechanism can also preserve prompt injection, launder authority into
future instructions, overfit an evaluator, or install executable code without
review.

D9 provides one governed path from evidence to future behavior:

```text
completed run evidence
        |
        v
untrusted candidate -> quarantine -> deterministic scan -> bounded evaluation
                                                          |
                                                          v
                                                independent recommendation
                                                          |
                                                          v
                                               owner approval of exact digest
                                                          |
                                                          v
                                               trusted promotion writer
                                                          |
                                                          v
                                              new future-facing version
```

The model may propose. It may not promote. No candidate affects the run or work
program that produced it.

---

## 2. Source of truth and precedence

Precedence for this document, highest first:

1. The ratified D1 through D7 architecture design specification
   (`2026-08-26-prism-harness-architecture-design-spec.md`) and its ratified
   amendments.
2. The constitution and proof-governance contracts owned by D6, including
   Plan A registry version 2 and the invariant-law/proof-status amendment.
3. The locked durable-learning boundary in
   `2026-08-19-hermes-inspired-pnh-followup.md`: no durable canonical learning
   store or consumer-specific learning contract in public `pnh/`; learning
   proposals belong to a consumer adapter.
4. The D8 goal-execution design, after its surviving hardening findings are
   resolved and the owner ratifies it.
5. `2026-08-27-prism-harness-d8-governed-adaptation-boundary-amendment.md`.
6. This document.

Where a higher source conflicts with D9, the higher source wins. In
particular, D9 cannot be used to bypass D1 admission, D4 evidence, D6 proof, D7
release authority, or D8's eventual ratified selection rules.

---

## 3. Decision summary

D9 makes five decisions:

1. **Learning is candidate generation, not live mutation.** Prime Agent and
   Hermes-style refinement becomes a typed proposal lifecycle. It does not
   become direct memory, prompt, skill, registry, or system-prompt writes.
2. **The public kernel stays learning-neutral.** D9 lives in the consumer
   control plane. Public `pnh/` exports only the generic evidence and admitted
   execution surfaces already owned by D1 through D8.
3. **Autonomous research is a bounded work-program shape.** The autoresearch
   pattern is expressed through D8 artifact-only runs with a pinned experiment
   charter, immutable evaluator, finite budget, and content-addressed results.
4. **Promotion is a separate trusted operation.** A pure promotion resolver
   validates evidence and approval. A non-model writer applies the exact
   approved digest to an owner-selected destination using an idempotent,
   versioned transition.
5. **Executable learning is ordinary software supply chain work.** Candidate
   scripts, tools, or skills do not become executable through D9 alone. They
   must pass the relevant D1, D6, and D7 admission, proof, and release gates.

Reference-project verdicts:

| Reference | Verdict | Pattern retained | Authority rejected |
|---|---|---|---|
| Prime Agent | **IMITATE** | Typed supplemental state, proposal/apply separation, versions, conflict checks, rollback | In-kernel dependency, user-permission execution, direct global refinement |
| Hermes Agent | **IMITATE** | Terminal review, declarative/procedural split, provenance, read-before-write, pinning, curation, recoverable archive | Direct background writes, optional-by-default skill scanning, ambient executable skills |
| Autoresearch | **IMITATE** | Narrow mutable surface, immutable evaluator, fixed budget, experiment ledger, keep/reject loop | Unbounded loop, prose-only evaluator protection, broad destructive Git authority |

---

## 4. Position in the program

D9 is later than D8 and outside the first-release claim set.

```text
Plans A through G: ratified D1-D7 release path
                 |
                 v
Plans I through K: D8 goal execution, after D8 rework and ratification
                 |
                 v
Plan L1: D9 candidate, scan, review, approval, promotion, rollback
                 |
                 v
Plan L2: D9 bounded evaluator-optimizer work programs
```

Plan L may be drafted after the owner ratifies D9. No Plan L implementation
begins until Plan K closes. L2 cannot begin until L1's promotion boundary is
proven, because an optimization loop without a safe destination transition is
an authority bypass waiting to happen.

D9 adds no requirement to Plans A through K and does not change the D1 through
D7 first-release package.

---

## 5. Scope

D9 covers:

- terminal-evidence capture for possible reusable lessons;
- typed adaptation candidates for declarative memory, prompt addenda,
  procedural guidance, task/work-program templates, and executable-extension
  source bundles;
- content-addressed quarantine and deterministic scanning;
- independent evaluation against pinned baselines and constraints;
- bounded evaluator-optimizer programs modeled after autoresearch;
- an independent recommendation with no promotion authority;
- one-time owner approval bound to exact bytes, destination, base version, and
  expiry;
- pure promotion resolution, idempotent destination writes, reconciliation,
  version history, and rollback; and
- retention, deletion, provenance, privacy, and audit evidence for durable
  learned state.

## 6. Non-goals

D9 does not add:

- model-weight training as a Prism kernel responsibility;
- online mutation of the base system prompt, current prompt set, task
  definition, tool set, plugin set, grants, provider route, budgets,
  evaluator, constitution, proof registry, or active work program;
- a `learning`, `memory`, or `research` plugin kind in public `pnh/`;
- ambient collection from arbitrary transcripts, files, or repositories;
- automatic global promotion, including supposedly low-risk memory;
- an unbounded `LOOP FOREVER` execution mode;
- a single scalar score that can override hard safety or regression
  constraints;
- direct writes from D8 apply tasks to durable adaptation destinations; or
- installation of Prime Agent, Hermes Agent, or autoresearch as a trusted
  in-process dependency.

---

## 7. Vocabulary

| Term | Meaning |
|---|---|
| Adaptation plane | The consumer-side D9 components that create, evaluate, approve, and promote candidates. Not part of public `pnh/`. |
| Learning signal | A typed reference to terminal evidence that may justify a reusable change. It is not itself a lesson or instruction. |
| Adaptation candidate | Immutable candidate bytes plus metadata and evidence references. Untrusted until promoted. |
| Candidate kind | One of `memory`, `prompt-addendum`, `procedural-guidance`, `task-template`, or `executable-extension`. |
| Quarantine | Content-addressed storage that cannot be loaded into future prompts, tools, registries, or executable paths. |
| Experiment charter | Owner-pinned rules for a bounded search: mutable surface, evaluator, baseline, objectives, hard constraints, budgets, and stop rule. |
| Candidate generator | A D8 run that proposes candidate bytes. It has artifact-only authority. |
| Evaluator | An admitted, immutable mechanism that measures a candidate against the charter without writing the candidate or destination. |
| Evaluation bundle | Canonical results binding candidate digest, charter digest, evaluator identity, baseline, metrics, constraints, and receipts. |
| Adaptation recommendation | An independent review result recommending `promote`, `reject`, or `revise`. It confers no authority. |
| Promotion approval | A one-time owner decision bound to the candidate, evidence bundle, destination, expected base version, and expiry. |
| Promotion resolver | A pure trusted function that validates all promotion preconditions and returns a decision or fail-closed reason. |
| Promotion writer | A non-model consumer-side component that applies an authorized transition and records the destination receipt. |
| Destination | An owner-controlled consumer store, such as Brain or `agent-config`. Public `pnh/` never names or writes these destinations. |
| Destination version | The immutable content digest and monotonic version that future consumer runs may select. |
| Rollback | A new authorized destination transition selecting a prior known-good version. It does not erase history. |

---

## 8. Design principles

### 8.1 Evidence is input, never instruction

Transcripts, tool output, repository content, external documents, and model
reasoning remain untrusted data throughout capture, distillation, scanning, and
evaluation. Candidate generation receives bounded evidence references and
escaped content. It cannot turn source text into authority merely by copying it
into a prompt-shaped artifact.

### 8.2 Mutable state has a smaller authority domain than execution

The adaptation plane can create quarantined bytes without being allowed to
load those bytes into a prompt, execute them, or make them canonical. Every
stage has the minimum authority needed for its output.

### 8.3 Evaluation and promotion are different decisions

A strong score means only that the candidate satisfied one pinned evaluation
bundle. It does not prove safety, generality, truth, or owner intent. The
evaluator cannot promote, the reviewer cannot promote, and the promotion
writer cannot choose what to promote.

### 8.4 Improvement is versioned and future-facing

Promotion creates a new immutable destination version. Active runs retain the
versions admitted at their start. A promotion cannot alter their composed
prompt, context, task, tool, route, budget, proof requirements, or effect
authority.

### 8.5 Rollback is designed before autonomy

Every destination transition records the prior version and supports a
content-addressed rollback transition. L2 optimization work is inadmissible
until L1 proves promotion reconciliation and rollback.

---

## 9. Topology and trust boundaries

```text
public pnh kernel                           consumer adaptation plane
-----------------                          -------------------------
D8 run settles with D4 evidence ---------> evidence reader (read-only)
                                             |
                                             v
                                      candidate generator
                                             |
                                             v
                                      quarantine writer
                                             |
                              +--------------+--------------+
                              v                             v
                     deterministic scanner          D8 evaluation program
                              |                             |
                              +--------------+--------------+
                                             v
                                      independent reviewer
                                             |
                                             v
                                      owner approval channel
                                             |
                                             v
                                  pure promotion resolver
                                             |
                                             v
                                   destination-specific writer
```

The public kernel does not import D9 modules. The adaptation plane may call
supported public query and execution interfaces, but dependency direction is
one way. Consumer identities, destination paths, memory schemas, and promotion
contracts remain outside `pnh/`.

The candidate generator, evaluator, and reviewer run under separate admitted
identities. None holds destination-write authority. The promotion writer holds
write authority for exactly one destination family but receives only a trusted
resolver decision, never free-form model output.

---

## 10. Candidate model and closed lifecycle

An adaptation candidate is immutable after creation:

```ts
type CandidateKind =
  | "memory"
  | "prompt-addendum"
  | "procedural-guidance"
  | "task-template"
  | "executable-extension";

interface AdaptationCandidate {
  candidateId: string;
  ownerDomainId: string;
  kind: CandidateKind;
  contentDigest: string;
  mediaType: string;
  schemaVersion: number;
  sourceEvidenceDigest: string;
  generatorIdentity: string;
  generatorRunId: string;
  intendedDestinationClass: string;
  createdAt: string;
  retentionClass: string;
}
```

Canonical state transitions:

```text
proposed -> quarantined
quarantined -> scanned | rejected
scanned -> evaluated | rejected
evaluated -> reviewed | rejected
reviewed -> approved | rejected | revise-requested
approved -> promoting | expired
promoting -> promoted | ambiguous
```

No transition moves backward. Revision creates a new candidate ID and digest.
Rollback does not reopen a promoted candidate. It creates a new destination
transition referencing a prior version.

All transitions are one-writer, compare-and-swap operations over candidate ID,
owner domain, current state, and content digest. Identical replay returns the
existing result. Conflicting replay fails closed.

---

## 11. Capture and distillation

Only trusted terminal states may trigger automatic candidate generation.
Intermediate turns may be referenced after settlement, but they cannot trigger
durable writes while work is still active.

A learning signal must name:

- the terminal run or program identity;
- the evidence-chain digest;
- the concrete observation, correction, repeated failure, successful tactic,
  or measured opportunity;
- the proposed candidate kind and destination class;
- why the signal is expected to recur; and
- exclusions, including transient environment failures and unresolved guesses.

Candidate generators run artifact-only. They cannot inspect credentials,
hidden evaluator cases, destination write tokens, or mutable canonical state.
They may emit no candidate when evidence is weak. "Nothing reusable" is a
valid and expected outcome.

Global candidate generation is never inferred from model confidence. The
destination class and retention policy are owner-pinned inputs.

---

## 12. Quarantine and deterministic scanning

Candidate bytes enter quarantine before any model review. Quarantine has no
loader path into prompts, skills, tools, task registries, or executable code.

The deterministic scanner binds its version and ruleset digest and checks at
least:

- secrets, credentials, tokens, private endpoints, and disallowed personal
  data;
- prompt-injection markers, authority requests, tool directives, and attempts
  to override higher instructions;
- unsafe absolute paths, traversal, symlinks, repository-control files, and
  destination escapes;
- executable content that is mislabeled as declarative content;
- prohibited provider, consumer, or private-policy identity in public-facing
  candidates;
- malformed schema, ambiguous encoding, unsupported media type, and
  non-canonical bytes; and
- duplicate or near-duplicate content against active and previously rejected
  candidates.

Scanner failure or uncertainty cannot produce `scanned`. A rejected candidate
remains available only according to its retention policy and cannot be loaded
by an evaluator as trusted context.

---

## 13. Evaluation and the autoresearch pattern

### 13.1 Experiment charter

Every optimization program begins with an immutable charter:

```ts
interface ExperimentCharter {
  charterId: string;
  ownerDomainId: string;
  mutableSurface: MutableSurfaceRule[];
  baselineDigest: string;
  evaluatorIdentity: string;
  evaluatorDigest: string;
  objectiveSpecDigest: string;
  hardConstraintDigest: string;
  holdoutPolicyDigest: string;
  maxCandidates: number;
  maxEffects: number;
  maxActiveSeconds: number;
  maxCostUnits: number;
  stopRule: "budget" | "no-improvement-window" | "owner-stop";
  workspaceProfileDigest: string;
}
```

The evaluator, baseline, objectives, constraints, and mutation envelope cannot
be modified by candidate runs. Charter changes create a new experiment.

### 13.2 D8 work-program shape

The autoresearch pattern becomes a finite D8 work program:

1. **Baseline.** Evaluate the immutable baseline under the charter.
2. **Generate.** Admit one or more artifact-only candidate runs inside isolated
   workspaces. Each may modify only the declared mutable surface.
3. **Evaluate.** Run the immutable evaluator under a separate identity. Record
   objective metrics, hard constraints, cost, complexity, and receipts.
4. **Recommend.** An independent reviewer compares canonical evaluation
   bundles and emits an adaptation recommendation. It does not create D8
   selection authority or D9 promotion authority.
5. **Stop.** End on the first charter stop condition. There is no indefinite
   autonomous mode.

Autoresearch's useful keep-or-revert behavior is implemented by immutable
candidate digests and disposable workspaces. Production D9 does not grant a
model broad `git reset` authority over the source repository.

### 13.3 Objective integrity

A primary metric may rank candidates, but promotion also requires every hard
constraint and regression gate. The charter records a deterministic comparison
function where possible. Subjective ties go to the owner; a judge cannot make
them authoritative.

At least one holdout or adversarial evaluation set is inaccessible to candidate
generators. Evaluator output binds the exact subject digest. A well-typed
positive result from an untrusted tool is not proof of the measured predicate.

The evaluation bundle records failed and crashed candidates. Rejecting a
candidate never erases its experiment evidence, because repeated rediscovery
of a known failure wastes budget and can create an endless loop.

---

## 14. Independent review and trusted resolution

The independent reviewer has read-only access to:

- candidate bytes from quarantine;
- source-evidence references;
- scan results;
- evaluation bundles and baseline comparisons;
- active destination policy and expected base version; and
- prior accepted and rejected candidates needed for conflict or duplication
  checks.

It emits `promote`, `reject`, or `revise` with findings. This output remains
untrusted advice.

The pure promotion resolver accepts only plain validated records and returns a
closed decision:

```ts
type PromotionDecision =
  | { ok: true; operation: AuthorizedPromotion }
  | { ok: false; code: PromotionRejectCode };

interface PromotionResolver {
  resolve(input: PromotionResolutionInput): PromotionDecision;
}
```

The resolver verifies candidate state, all required evidence digests, scanner
version, evaluator identity, hard constraints, independent recommendation,
owner approval, expiry, destination class, expected base version, and rollback
availability. It performs no model call and writes no state.

---

## 15. Owner approval, promotion, and rollback

Initial D9 requires explicit owner approval for every durable promotion. A
future policy-based low-risk lane would require its own owner-ratified design
amendment and proof. It is not latent flexibility in this contract.

Approval binds:

- owner domain and authenticated operator role;
- candidate ID and content digest;
- scan and evaluation bundle digests;
- independent recommendation digest;
- destination identity and destination class;
- expected base version and resulting version intent;
- one-time operation ID; and
- expiry.

The operator channel retrieves canonical candidate and destination data by
opaque identity and displays the exact digest and base-version transition. A
renderer-supplied description is not approval input.

Before writing, the promotion writer durably records `promoting`. The
destination write is conditional on the expected base version and idempotent by
operation ID. An identical retry returns the existing version. A conflicting
base version or content digest writes nothing.

If the destination may have committed but acknowledgement is lost, the
candidate becomes `ambiguous`. The writer reconciles by operation ID and exact
destination digest. It does not retry blindly.

Rollback selects a previous immutable version through the same resolver,
approval, expected-base, and receipt path. Emergency rollback may use an
owner-authenticated fast path, but it still records the exact transition and
cannot erase the faulty version or its evidence.

---

## 16. Rules by candidate kind

| Candidate kind | Promotion result | Additional rule |
|---|---|---|
| `memory` | New declarative consumer-memory version | Must carry provenance, retention, correction, and deletion semantics. No authority-bearing instructions. |
| `prompt-addendum` | New consumer prompt/config version | Must remain supplemental. It cannot replace the immutable base prompt or request grants. |
| `procedural-guidance` | New non-executable guidance version | Scripts and executable snippets are split into `executable-extension`. |
| `task-template` | New consumer-side authoring template | It may propose D8 task definitions but cannot enter the admitted registry without normal owner pinning and admission. |
| `executable-extension` | Source bundle only | Requires ordinary code review, scanning, tests, D1 admission, D6 proof, and D7 release before execution. |

Durable user facts and preferences require an owner-selected privacy policy.
The policy defines permitted categories, retention, correction, export, and
deletion. D9 does not infer permission to persist sensitive personal data from
the fact that it appeared in a conversation.

---

## 17. Evidence and audit records

The consumer adaptation ledger is append-only and content-addressed. Each
promoted version can be reconstructed from:

- source terminal evidence and run/program identities;
- candidate bytes and digest;
- generator identity, prompt/config digest, and exact route/model evidence;
- deterministic scan report and ruleset digest;
- experiment charter, baseline, evaluator identity, and evaluation bundle;
- independent recommendation;
- owner approval and expiry;
- pure resolver result;
- promotion operation, expected base version, and destination receipt; and
- rollback or supersession records.

Public PNH evidence may be referenced by digest but is not copied into a
consumer memory store unless the destination policy permits it. Secrets and
raw private evidence never enter renderer summaries or model review prompts.

---

## 18. Failure and recovery semantics

| Failure | Required result |
|---|---|
| Missing or non-terminal source evidence | No candidate generation |
| Candidate persistence failure | No candidate ID; no review or evaluation |
| Scanner error or uncertainty | Remain quarantined or reject; never promote |
| Evaluator crash or timeout | Failed evaluation receipt; candidate cannot advance |
| Metric improvement with hard-constraint failure | Reject |
| Reviewer disagreement or malformed output | No recommendation; no promotion |
| Missing, stale, mismatched, or expired approval | Resolver rejection |
| Destination base-version conflict | Write nothing; require a new candidate or approval |
| Lost write acknowledgement | `ambiguous`; reconcile by operation ID and digest |
| Regression after promotion | Owner-approved rollback transition plus new learning signal |
| Deletion request for personal data | Destination-specific deletion transition and tombstone evidence |

No failure falls back to direct writes, latest-version resolution, another
provider/model, weaker scanning, a self-review-only verdict, or unbounded retry.

---

## 19. Interfaces

Exact schemas belong to Plan L. These sketches establish ownership:

```ts
interface LearningSignalReader {
  listEligibleTerminalEvidence(query: EligibleEvidenceQuery): TerminalEvidenceRef[];
}

interface CandidateQuarantine {
  put(candidate: CandidateEnvelope): CandidateReceipt;
  get(candidateId: string): CandidateEnvelope;
}

interface CandidateScanner {
  scan(candidate: CandidateEnvelope, policy: ScanPolicy): ScanResult;
}

interface ExperimentCoordinator {
  admit(charter: ExperimentCharter): ExperimentId;
  record(result: EvaluationBundle): EvaluationReceipt;
  stop(experimentId: ExperimentId, reason: StopReason): StopReceipt;
}

interface OwnerPromotionChannel {
  decide(challenge: CanonicalPromotionChallenge): PromotionApprovalRecord;
}

interface DestinationWriter {
  apply(operation: AuthorizedPromotion): DestinationReceipt;
  reconcile(operationId: string): DestinationReceipt | AmbiguousReceipt;
}
```

The evidence reader is read-only over supported terminal evidence. Quarantine
cannot load active runtime state. The scanner cannot waive findings. The
experiment coordinator has no destination authority. The owner channel writes
approval only. The destination writer cannot choose bytes or destination.

---

## 20. Proposed invariants

D8's final invariant numbers are not yet stable. D9 therefore uses provisional
aliases. Plan L must assign final IDs only through an owner-ratified successor
baseline after D8's own successor baseline closes.

| Alias | Statement | Intended enforcement kind |
|---|---|---|
| D9-INV-01 | No model, plugin, candidate generator, evaluator, reviewer, or D8 run can promote, install, or load a candidate into durable canonical state. | `runtime-adversarial` |
| D9-INV-02 | Candidate bytes are immutable and content-addressed before scanning, evaluation, review, or approval. | `runtime-adversarial` |
| D9-INV-03 | Promotion requires a pure resolver decision and one-time owner approval bound to candidate digest, evidence digests, destination, expected base version, and expiry. | `runtime-adversarial` |
| D9-INV-04 | Promotion affects only future runs; active runs retain every admitted prompt, context, task, tool, route, budget, and proof version. | `runtime-adversarial` |
| D9-INV-05 | Executable candidates remain non-executable until they pass the ordinary admission, proof, and release gates for executable code. | `static-structure` |
| D9-INV-06 | Every optimization program binds an immutable evaluator, baseline, mutation envelope, objective/constraint specification, finite budget, and stop rule before candidate generation. | `runtime-adversarial` |
| D9-INV-07 | A recommendation, selection, or improved metric is never sufficient promotion authority, and hard-constraint failure always blocks promotion. | `runtime-adversarial` |
| D9-INV-08 | Destination writes are expected-base conditional, idempotent by operation ID, reconcilable after lost acknowledgement, and rollback preserves history. | `fault-injection` |
| D9-INV-09 | Public `pnh/` contains no consumer-specific learning contract, canonical memory store, destination identity, or promotion writer. | `static-structure` |

Each row has one enforcement kind. Cross-cutting claims are split instead of
using compound enforcement values.

---

## 21. Plan L: governed adaptation and optimization

Decision owner: D9. Consumer-side implementation under
`x1/pnh-adapter/learning/`, with D8 as an execution dependency and D6 governing
successor proof registration. Destination-specific adapters may call supported
Brain and `agent-config` capture paths, but no consumer identity or path crosses
into public `pnh/`.

### Milestone L1: candidate and promotion lifecycle

Deliver:

- consumer-side candidate schemas and canonical serialization;
- terminal-evidence eligibility and artifact-only generation;
- content-addressed quarantine and deterministic scanners;
- independent recommendation with no promotion authority;
- canonical owner challenge and one-time approval record;
- pure promotion resolver;
- expected-base, idempotent destination writers for test destinations;
- ambiguity reconciliation, version history, rollback, retention, and deletion;
- module-boundary proof that public `pnh/` contains none of D9's
  consumer-specific contracts or destinations; and
- proofs for D9-INV-01 through D9-INV-05, D9-INV-08, and D9-INV-09.

Exit gate: a terminal run can produce a quarantined declarative candidate, but
every attempted bypass fails. An exact approved candidate promotes once to a
test destination, conflicting replay writes nothing, lost acknowledgement
reconciles, and rollback restores a prior version without erasing history.

### Milestone L2: bounded evaluator-optimizer programs

Deliver:

- experiment-charter schemas and admission checks;
- isolated candidate workspaces and mutation-envelope enforcement;
- immutable baseline/evaluator bindings and hidden holdout support;
- objective-vector, hard-constraint, cost, and complexity evidence;
- finite stop rules and deduplication against every previously seen candidate;
- D8 work-program templates for baseline, generate, evaluate, recommend, and
  stop;
- an autoresearch-style reference experiment over a harmless fixture; and
- proofs for D9-INV-06 and D9-INV-07.

Exit gate: the reference experiment improves its primary fixture metric, rejects
one reward-hacking candidate, rejects one hard-constraint regression, stops at
budget, and produces only a promotion candidate. No experiment output writes a
destination or changes an active run.

Begins: L1 after Plan K. L2 after L1.

---

## 22. Migration and initial rollout

The initial rollout should be narrower than Prime Agent or Hermes:

1. Start with `memory` and `prompt-addendum` candidates generated only from
   owner-corrected, terminally successful sessions.
2. Use a test destination and manual owner approval for every promotion.
3. Add procedural guidance only after duplicate detection, correction, and
   rollback have production evidence.
4. Add bounded evaluator-optimizer programs over non-executable fixtures.
5. Leave `executable-extension` promotion disabled until its separate
   admission, security, test, and release path is proven end to end.

Existing Brain and `agent-config` capture pipelines remain canonical. D9 must
integrate through their supported consumer-side write paths rather than create
a second canonical store.

---

## 23. Main risks and controls

| Risk | Control |
|---|---|
| Prompt injection becomes durable memory | Quarantine, instruction scanning, independent review, exact owner approval |
| Learned prose launders new authority | Candidate kinds cannot request grants; D1 remains sole admission authority |
| Reward hacking or evaluator overfitting | Immutable evaluator, hard constraints, holdout cases, subject-digest binding |
| Repeated rediscovery creates an endless loop | Dedupe against all seen candidates, finite charter, failed-result ledger |
| Personal data persists without intent | Owner-selected privacy policy, category limits, retention, correction, deletion |
| Executable skill bypasses software review | Executable-extension quarantine plus D1/D6/D7 gates |
| Concurrent promotions fork canonical state | Expected-base compare-and-swap, one-time operation ID, conflict refusal |
| Lost acknowledgement duplicates a write | Durable `promoting` state and destination reconciliation by operation ID |
| A bad improvement affects active work | Future-run-only version selection and immutable admitted snapshots |
| Rollback erases evidence | Append-only transitions and preserved version history |

---

## 24. Verification criteria for this document

D9 is ready for owner ratification only when:

1. The public-kernel exclusion matches the existing locked durable-learning
   decision and introduces no D9 dependency into `pnh/`.
2. Candidate generation, evaluation, recommendation, approval, resolution,
   writing, and rollback have non-overlapping authority.
3. The candidate state machine is closed, immutable, idempotent, and explicit
   about ambiguity.
4. Active D8 runs cannot observe a promotion performed after their admission.
5. Every candidate kind has a destination and executable-content rule.
6. The autoresearch pattern has a pinned evaluator, baseline, mutation
   envelope, objective and constraints, finite budget, and stop rule.
7. No metric, judge, D8 selection, or recommendation can authorize promotion.
8. Every proposed invariant has one valid enforcement kind and a successor
   baseline path.
9. Plan L begins after Plan K and cannot enter D1 through D7 release claims.
10. The D8 boundary amendment explicitly forbids D8 apply authority from
    targeting D9 destinations.

---

## 25. Source records

- `2026-08-19-hermes-inspired-pnh-followup.md`
- `2026-08-26-prism-harness-architecture-design-spec.md`
- `2026-08-26-prism-harness-goal-execution-design-spec.md`
- `2026-08-26-prism-harness-goal-execution-design-spec.hardening.md`
- [Prime Agent README](https://github.com/PrimeIntellect-ai/prime-agent/blob/bc0fa7606abb3b7af0f765319518d255e6ae553d/README.md)
- [Prime Agent refinement implementation](https://github.com/PrimeIntellect-ai/prime-agent/blob/bc0fa7606abb3b7af0f765319518d255e6ae553d/packages/coding-agent/src/core/refinement/refinement.ts)
- [Hermes Agent README](https://github.com/nousresearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/README.md)
- [Hermes background review](https://github.com/nousresearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/agent/background_review.py)
- [Hermes skill manager](https://github.com/nousresearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/tools/skill_manager_tool.py)
- [Autoresearch README](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/README.md)
- [Autoresearch experiment protocol](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/program.md)

---

## 26. Owner ratification record

Before Plan L authoring, the owner should record one of:

- **Ratified:** accept D9 and its D8 boundary amendment.
- **Ratified with amendments:** name each changed section and selected option.
- **Not ratified:** return to design review.

Recorded owner decision:

- **Status:** pending
- **Date:** -
- **Owner:** Vora Technologies, LLC
- **Decision:** -

Ratification authorizes writing Plan L only. It does not authorize
implementation, destination access, durable capture, automatic evaluation,
promotion, rollback, deployment, push, publication, or a public learning claim.
