# Autonomous Goal Execution successor constitutional baseline

Date: 2026-08-28

Status: **candidate baseline draft, amended under Gate A0**. This document
assigns stable candidate IDs and exact law text for independent review. It is
not owner-ratified law, does not mutate the invariant registry, and does not
authorize implementation. The Gate A0 amendment binds the ratified Plan A
predecessor, moves owner-decision material outside hash-bound baseline
content, and removes dynamic proof state from immutable row form.

Decision area: Autonomous Goal Execution constitutional law.

## 1. Purpose

This candidate turns the reconciled AGE-1 through AGE-5 contracts into a
constitutional law set that can be reviewed, ratified, locked, and proved
without weakening or renumbering PNH-INV-01 through PNH-INV-46.

It does five things:

1. defines the immutable supersession relationship to the Plan A baseline;
2. extends release disposition and closing-gate vocabulary for post-first-
   release Autonomous Goal Execution work;
3. assigns PNH-INV-47 through PNH-INV-89 to deduplicated AGE laws;
4. maps every contract alias and architecture invariant family; and
5. names existing laws whose proof scope must be rerun against AGE.

## 2. Source bindings

| Source | Git object | Role |
|---|---|---|
| Invariant law and proof status amendment | `87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a` | Governs law status, proof status, enforcement kinds, locks, and ratification |
| Accepted AGE architecture | `5fc1443f9d8e740d4811a02d9e3a5dd637a12184` | Governs AGE scope, ownership, dependency order, and ratification |
| AGE architecture acceptance | `d47455756eac691c5cc8b3dc0aa774f6f04c2227` | Authorizes contract and baseline drafting only |
| AGE-1 Task Authority | `5e531334cc4f63eaa957341c5505e24f970444c2` | Task-law source |
| AGE-2 Run Coordination | `651943a4581e57079b804b29722403933178419c` | Coordination-law source |
| AGE-3 Effect Authority | `c8cebdc7f4528d3a7a2b0539b6247581cd26d33e` | Effect-law source |
| AGE-4 Content Custody | `34657d4c3e3d0d230663023e48d886f8e4b73e20` | Custody-law source |
| AGE-5 Human Decision and Completion | `b2df98c612870097f3ece3dcf2eb15fd6d7ad89e` | Decision and terminal-law source |
| Integrated AGE package reconciliation (A0 refresh) | `46fae101ce44bbf73b020e34aa4640d92c8e9fde` | Shared-interface closure, imported-root closure, and boundary manifest |
| AGE imported-root supplement | `2aa97b52bf5f58ef06eb9ebeb34a3151e716d18a` | Bounded definitions and closed mapping for every imported root |

The frozen D8 goal-execution draft and its boundary amendment are historical
evidence only. Their objects remain
`d7e65343f1d893688ae5740b9c2ffde5430708ac` and
`3b47bc97af3e35b7e4b9076c4be59c64918500fd`. D8 aliases, provisional numbers,
and gates I through K have no authority in this baseline.

## 3. Predecessor and supersession dependency

The required predecessor is the immutable Plan A baseline at:

`pnh/contracts/ratification-baselines/plan-a-v1.json`

That artifact exists and is bound exactly. Its SHA-256 content digest is:

`sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c`

It was installed by commit `0604d0529a288d384c1cbcbe0eec25a5e45dd321` and
carries the complete PNH-INV-01 through PNH-INV-46 row set. Plan A closed
under the completion-authority commit
`3cfe36d374d9af9341da85502822ecbdb13d64db`, whose validated owner receipt
binds gate digest
`sha256:ebccd457b5ff002a2a07e6e8441e18e4cbe46e9e42c380576163a5c8088f02d5`
with the `Ratified` outcome: Plan B authoring is allowed and Plan B
implementation is not authorized.

This candidate may be reviewed, but no successor baseline may be
materialized, ratified, locked, or installed until all of these values also
exist:

- an owner-ratified supersession decision, expressed through the external
  ratification gate and separate receipt defined in section 4.4, bound to
  both baselines;
- exact source and candidate digests for the five AGE contracts, the
  refreshed reconciliation, and the imported-root supplement; and
- an independent hardening report over the same bytes.

The future immutable successor path is reserved as:

`pnh/contracts/ratification-baselines/age-v1.json`

Reserving the path creates no file and grants no authority.

## 4. Successor baseline schema

### 4.1 Envelope

The machine-readable artifact, when separately authorized, must implement this
closed logical shape:

```ts
type Sha256Digest = `sha256:${string}`;

type SuccessorClosingGate =
  | "A" | "B2" | "C" | "D" | "E" | "F" | "G" | "H"
  | "AGE-1" | "AGE-2" | "AGE-3" | "AGE-4" | "AGE-5" | "AGE-X";

type SuccessorReleaseDisposition =
  | "activate"
  | "retain"
  | "defer"
  | "post-first-release";

interface BaselineSupersessionV1 {
  predecessorPath: "pnh/contracts/ratification-baselines/plan-a-v1.json";
  predecessorDigest: "sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c";
  reason: "append-autonomous-goal-execution-law";
}

interface AgeSourceBindingsV1 {
  architectureObject: "5fc1443f9d8e740d4811a02d9e3a5dd637a12184";
  acceptanceObject: "d47455756eac691c5cc8b3dc0aa774f6f04c2227";
  age1Object: "5e531334cc4f63eaa957341c5505e24f970444c2";
  age2Object: "651943a4581e57079b804b29722403933178419c";
  age3Object: "c8cebdc7f4528d3a7a2b0539b6247581cd26d33e";
  age4Object: "34657d4c3e3d0d230663023e48d886f8e4b73e20";
  age5Object: "b2df98c612870097f3ece3dcf2eb15fd6d7ad89e";
  reconciliationObject: "46fae101ce44bbf73b020e34aa4640d92c8e9fde";
  supplementObject: "2aa97b52bf5f58ef06eb9ebeb34a3151e716d18a";
}

interface AgeSuccessorBaselineV1 {
  schemaVersion: 4;
  baselineId: "pnh-age-v1";
  supersession: BaselineSupersessionV1;
  sources: AgeSourceBindingsV1;
  preservedRange: {
    first: "PNH-INV-01";
    last: "PNH-INV-46";
    count: 46;
  };
  successorRange: {
    first: "PNH-INV-47";
    last: "PNH-INV-89";
    count: 43;
  };
}
```

### 4.2 Byte-preserving predecessor law

The materializer must copy every predecessor row as the exact canonical row
bytes used by the predecessor lock. It cannot add fields to those rows, change
their order, rewrite a statement, reinterpret a first-release rule, or change
law or proof state. The successor envelope and new-row schema carry all new
metadata.

For every preserved row, the materializer must prove:

```text
sha256(predecessor canonical row bytes)
  == sha256(successor preserved canonical row bytes)
```

Any mismatch blocks supersession. A reference to the predecessor digest alone
does not excuse a changed copied row.

### 4.3 New-row fixed state

Every PNH-INV-47 through PNH-INV-89 row in this candidate has this fixed state:

```yaml
law_status: proposed
first_release:
  disposition: post-first-release
```

Each row has exactly one enforcement kind from the existing closed set. Each
row closes at its owning AGE gate and at `AGE-X`, the integrated production-
path gate. The future machine artifact must materialize these fields on every
row. Defaults and inheritance are forbidden there.

Immutable baseline rows pin law status, enforcement kind, and release policy
only. Dynamic proof status and proof reason live exclusively in the
prospective registry and lock governed by proof-transition law; every
candidate row enters that registry as unproven with the exact reason "AGE
contracts reconciled; no implementation or production proof". No baseline row
carries a proof field.

### 4.4 External ratification gate and owner receipt

Owner-decision material stays outside hash-bound baseline content. The
machine baseline carries no owner-decision path, digest, outcome, or receipt
field; binding any of them inside the baseline would create a digest cycle
with the decision that ratifies it.

Supersession instead uses the same external-gate protocol that closed Plan A:

1. A prospective `AGE-RATIFICATION-GATE` object with a closed schema pins the
   gate ID, expected owner and role, the exact prospective baseline,
   registry, lock, generated-document, reconciliation, supplement, and
   hardening-report digests, the allowed outcomes, and the closed
   outcome-to-authority mapping. The pre-decision gate contains no selected
   outcome, selected disposition, receipt digest, or decision digest.
2. The process emits `decision-needed` and pauses. A separate D5-authenticated
   owner receipt alone records the selected outcome while binding the gate
   digest.
3. A gate-type-aware receipt validator — implemented and tested during
   Gate A1 as part of trusted transition resolution, before any supersession
   decision is processed — validates the receipt and exact gate pairing: it
   proves repository containment after resolution, rejects symlink escape,
   verifies the owner-pinned content digests, and checks the expected owner,
   decision role, ratification status, supersession kind, predecessor
   digest, and candidate source objects. The existing Plan A transition
   resolver takes invariant-transition decisions only and cannot process a
   supersession receipt. File existence, Markdown wording, an absolute path,
   or a caller-supplied boolean never authorizes supersession.
4. Any amendment to a pinned artifact invalidates the prospective gate and
   returns the candidate to review.

## 5. Constitutionalization rules

The alias tables in the AGE contracts are design inputs, not an instruction to
create one row per alias.

- Existing law is reused when its binding statement already covers an AGE
  requirement. Its text and ID stay unchanged.
- One alias may map to several canonical laws.
- Several aliases may map to one canonical law when their binding requirement
  is the same.
- A compound proof class is split into separate rows because one invariant has
  exactly one enforcement kind.
- Contract detail that changes only a schema field does not become
  constitutional law unless violating it creates an authority, safety,
  evidence, or custody failure.

## 6. AGE-1 candidate laws

All rows close at `AGE-1` and `AGE-X`.

| ID | Title | Binding statement | Enforcement kind |
|---|---|---|---|
| PNH-INV-47 | Task templates are policy, not executable authority | A task template is immutable by revision and contains no executable entrypoint, credential, endpoint, permit, operator decision, mutable default, or caller-selected authority. Changing any field creates a new revision and digest. | `static-structure` |
| PNH-INV-48 | Only ratified available template revisions admit goals | A goal submission can enter Policy evaluation only through one exact owner-ratified and currently available template revision. Unknown, withdrawn, unratified, drifted, or ambiguous revisions fail before production authority. | `runtime-adversarial` |
| PNH-INV-49 | Goal submissions vary data only | Caller bytes can vary only the closed canonical goal value allowed by the selected template schema. Owner domain, principal, role, authorization policy, and daemon authority are derived from the authenticated channel and cannot be selected or replaced by the caller. | `runtime-adversarial` |
| PNH-INV-50 | Initial conversation composition is exact | Initial conversation composition deterministically preserves every admitted message role, tagged source digest, order, length, and byte value. Delimiter parsing, normalization, merging, omission, duplication, reordering, or provider reinterpretation cannot change its meaning. | `runtime-adversarial` |
| PNH-INV-51 | Admitted task identity binds the complete authority package | One admitted task digest binds every execution-relevant registry, grant, operation, budget, deadline, custody, replay, approval, completion, codec, schema, executable, and dependency-closure identity required by the run. An absent, unresolved, mutable, or substituted import fails admission. | `static-structure` |
| PNH-INV-52 | Submission and activation replay preserve identity | Identical goal submission and activation replay returns the same goal task and admitted run. Conflicting canonical bytes, authenticated identity, template, import set, activation, snapshot, or acknowledgement cannot mint or replace authority under the same semantic key. | `runtime-adversarial` |

## 7. AGE-2 candidate laws

All rows close at `AGE-2` and `AGE-X`.

| ID | Title | Binding statement | Enforcement kind |
|---|---|---|---|
| PNH-INV-53 | Run behavior is one closed executable bundle | A run-behavior contract names one closed parser, grammar, serializer, feedback renderer, transition policy, producer profile set, model operation, codec, schema bundle, and complete executable dependency closure. No ambient, default, latest, or generic implementation is admissible. | `static-structure` |
| PNH-INV-54 | Runtime behavior drift fails before use | Every coordinator transition revalidates the admitted run-behavior identities. Parser, grammar, serializer, renderer, transition, producer, model-operation, codec, schema, principal, executable, or dependency drift fails before parsing, publication, proposal advancement, or effect reservation. | `runtime-adversarial` |
| PNH-INV-55 | Coordination identities are durable before effects | Every model turn, observation, parse result, proposal batch, proposal, action parameter set, AGE-3 operation, feedback item, and verification attempt has one deterministic durable identity before any derived effect reservation. The identity remains stable across response loss, epoch change, process loss, and restart. | `runtime-adversarial` |
| PNH-INV-56 | Committed observations are parsed once | One committed model observation has one committed parse result and one ordered proposal batch. Concurrent parsing, response loss, restart, executable drift, or nondeterministic output cannot reparse it or change proposal order. | `runtime-adversarial` |
| PNH-INV-57 | Proposal advancement is serial | Only the canonical first queued proposal may advance. One run has at most one selected proposal and one open AGE-3 effect, and no later proposal can bypass, race, or nest inside that authority. | `runtime-adversarial` |
| PNH-INV-58 | Checkpoints bind every semantic transition | Every semantic coordinator transition appends one fenced predecessor-linked checkpoint. A content-bearing checkpoint commits its AGE-4 references, conversation state, proposal state, effect outcome, and acknowledgement atomically or commits none. | `runtime-adversarial` |
| PNH-INV-59 | Restart never regenerates committed coordination state | Restart reuses committed conversation, parameters, feedback, parse, proposal, operation, effect, and checkpoint identities. It cannot regenerate, reinterpret, reparse, reorder, or redispatch committed work. | `runtime-adversarial` |
| PNH-INV-60 | The coordination graph is finite by construction | Every admitted coordinator transition graph has finite bounds, no uncharged pure cycle, no checkpoint cycle, no transition that preserves all progress measures, and one explicit settling boundary. A graph that cannot prove those properties is inadmissible. | `static-structure` |
| PNH-INV-61 | Runtime progression cannot livelock | Every non-replay coordinator transition consumes a finite allowance, closes bounded queued work, advances one existing effect, advances an admitted acyclic pure step, or enters settling. Repeated runtime work with no committed progress fails closed. | `runtime-adversarial` |
| PNH-INV-62 | The coordinator has no authority-bearing capability surface | Coordinator types and production bindings contain no provider credential, outward credential, permit claim, effect executor, operator decision writer, direct settlement writer, terminal writer, content path, write handle, artifact application, installation, deployment, or publication capability. | `static-structure` |
| PNH-INV-63 | Coordinator inputs cannot acquire excluded authority | Model output, parsed proposals, content references, checkpoints, feedback, recovery state, and caller commands cannot cause the coordinator to invoke or synthesize any authority excluded by PNH-INV-62. Such attempts fail before an AGE-3 or D4 mutation. | `runtime-adversarial` |

## 8. AGE-3 candidate laws

All rows close at `AGE-3` and `AGE-X`.

| ID | Title | Binding statement | Enforcement kind |
|---|---|---|---|
| PNH-INV-64 | Every executable effect has one complete operation binding | Each model, local, outward, or verification operation resolves one closed binding containing its exact kind, principal, target contract, parameter construction, receipt contract, content contract, budget charge, deadline policy, approval policy, executable, adapter, schema, and dependency closure. No ID-only or open extension binding is executable. | `static-structure` |
| PNH-INV-65 | Granted operation authority is a revalidated subset | Before reservation, permit issue, consumption, and receipt commitment, D4 proves the complete operation binding equal to or narrower than the task request and revalidates every admitted owner, run, policy, principal, executable, adapter, target, schema, and dependency identity. Drift or widening fails before new authority. | `runtime-adversarial` |
| PNH-INV-66 | Outward destination authority is exact and carried end to end | Every outward effect resolves exactly one owner-pinned non-protected destination through the admitted resolver and capability catalog before reservation. Reservation, approval, permit, consumption, adapter execution, and receipt carry that destination unchanged. Raw endpoints, redirects, aliases, multiple matches, protected roots, alternate tenants, and caller or model claims cannot substitute. | `runtime-adversarial` |
| PNH-INV-67 | One effect claims one monotonic budget charge | One run has at most one nonterminal effect. Its reservation atomically appends one exact precharged budget claim, never refunds it, and cannot create a second claim or open effect through replay, denial, expiry, cancellation, crash, or recovery. | `runtime-adversarial` |
| PNH-INV-68 | Every effect uses one exact one-use permit | Every model, local, outward, and verification effect uses one kind-tagged permit claimable and consumable once only by its exact admitted principal, target, request, environment, epoch, lease, generation, and reservation strictly before its monotonic deadline. | `runtime-adversarial` |
| PNH-INV-69 | Effect receipts bind execution and durable content | A trustworthy receipt binds the consumed permit, exact operation, principal, target, environment, usage, deadline, and one closed result arm. Output bytes exist only through an AGE-4 reference committed atomically with the receipt and retention lineage. Drift, overuse, missing content, or uncertainty cannot settle as success. | `runtime-adversarial` |
| PNH-INV-70 | Effect recovery preserves first-winner history | Proven pre-consumption states may reject safely. The first valid compare-and-set under the current epoch and deadline wins; consumption committed strictly before its deadline defeats later cancellation, expiry, or epoch-loss attempts; consumed uncertainty becomes ambiguous; a committed receipt settles once; terminal state never rewrites; and recovery never automatically redispatches a consumed effect. | `runtime-adversarial` |

## 9. AGE-4 candidate laws

All rows close at `AGE-4` and `AGE-X`.

| ID | Title | Binding statement | Enforcement kind |
|---|---|---|---|
| PNH-INV-71 | One complete topology catalog governs content custody | One host-wide measured catalog covers every custody, task, protected, credential, consumer-writer, synchronized, replicated, and cross-owner root. Missing inventory, stale measurements, aliases, links, mount substitutions, same-filesystem conflicts, or unclassifiable roots grant no admission, publication, read, retention, or deletion authority. | `runtime-adversarial` |
| PNH-INV-72 | Production owner custody is physically disjoint | Each production owner uses one dedicated local custody filesystem and volume identity that is non-network, non-synchronized, non-replicating, and physically disjoint from prohibited roots, consumer writers, task roots, credential roots, and every other owner's custody. | `runtime-adversarial` |
| PNH-INV-73 | Durable bytes precede content-reference authority | D4 cannot commit a content reference until AGE-4 has written, data-flushed, atomically installed, metadata-flushed, reopened, and digest-verified the exact object under its current custody and topology binding. Reference, importing authority record, and retention pin then commit together or not at all. | `runtime-adversarial` |
| PNH-INV-74 | Content-custody roles and producer lineage are structurally closed | Only the custody writer may prepare bytes, only the topology authority may commit topology and continuity, only D4 may commit references, retention changes, and deletion authority, and only the reclaimer may delete an exactly authorized object. AGE-4 owns one closed producer-lineage root with only the exact AGE-3 effect-result, AGE-2 run-coordinator, and AGE-5 completion-verification arms. No generic arm, task, producer, reader, consumer, or reclaimer type contains another role's authority, handle, or backing path. | `static-structure` |
| PNH-INV-75 | Content operations enforce exact principals and bindings | Every publication, reference, read, retention, release, purge, and deletion operation authenticates the exact owner, run where applicable, principal, role, purpose, producer, custody, topology, policy, epoch, lease, state version, and transaction identity required by its closed command. Caller bytes cannot replace trusted authority fields. | `runtime-adversarial` |
| PNH-INV-76 | Content reads are exact and by value | Every read returns bytes by value for one exact retained reference, owner, run, principal, role, purpose, authority binding, object kind, descriptor, length, and digest after proving current custody continuity. Listing, path resolution, write handles, kind substitution, cross-owner reads, and purpose reuse are forbidden. | `runtime-adversarial` |
| PNH-INV-77 | Retention and deletion never break live authority | Referenced content cannot be deleted while any live or retained pin exists. D4 must commit exact pin release, complete reverse-reference proof, owner decision where required, deletion authorization, authenticated deletion observation, and final tombstone in order without rewriting settlement history. Uncertainty retains bytes. | `runtime-adversarial` |
| PNH-INV-78 | Content identity carries no action authority | Content-reference, prepared-candidate, retention, read, and artifact-export schemas contain no permit, destination writer, apply, promotion, installation, execution, adaptation, deployment, publication, release, or consumer-side authority. | `static-structure` |
| PNH-INV-79 | Content identity cannot be exercised as action authority | No runtime path may use a content reference, candidate, read receipt, retention record, artifact bytes, or export receipt to execute, apply, promote, install, adapt, deploy, publish, release, or select an outward destination. A consumer must create its own separately authorized identity. | `runtime-adversarial` |
| PNH-INV-80 | Topology continuity is explicit and acyclic | An existing reference may cross a topology-version change only through a complete acyclic predecessor chain proving unchanged custody root, filesystem and volume identity, reader contract, principal policy, and object integrity. Missing, cyclic, stale, or drifted continuity closes ordinary reads and new writes. | `runtime-adversarial` |

## 10. AGE-5 candidate laws

All rows close at `AGE-5` and `AGE-X`.

| ID | Title | Binding statement | Enforcement kind |
|---|---|---|---|
| PNH-INV-81 | Approval subjects are complete closed values | Every approval-gated effect maps to one closed subject containing its exact operation, principal, complete model, local, outward, or verification target, semantic values, impact values, deadlines, expected receipt, source content, policy binding, and constructor identity. No summary, generic map, wildcard, or extension arm is authority-bearing. | `static-structure` |
| PNH-INV-82 | Incomplete approval subjects fail before a gate | Subject construction and gate attachment independently reject any missing, summarized, renamed, reordered, truncated, drifted, unreadable, or mismatched operation, principal, target, semantic value, impact, deadline, source, receipt, policy, schema, executable, or dependency value. | `runtime-adversarial` |
| PNH-INV-83 | The operator view is lossless and source-bound | The canonical approval view covers every subject semantic and impact value exactly and binds every source byte to an AGE-4 read under that subject's authority. Rendering cannot omit, merge, reinterpret, hide, add, or replace a value, and the operator channel returns the complete canonical view. | `runtime-adversarial` |
| PNH-INV-84 | The first eligible authenticated decision wins before both deadlines | Only a D2-authenticated principal in an eligible role may commit approve or deny. D4 revalidates owner, run, principal, role, authorization policy, channel, gate, challenge, epoch, lease, state version, and a trusted sample strictly before both deadlines in one first-winner transaction. | `runtime-adversarial` |
| PNH-INV-85 | Approval artifacts are never permit authority | Approval subjects, views, challenges, gates, decisions, acknowledgements, cancellation requests, and authenticated AGE-5 envelopes contain no AGE-3 permit claim or consumption authority. Only AGE-3 may define, issue, and consume an effect permit. | `static-structure` |
| PNH-INV-86 | Completion verification is exact, finite, and observation-only | Required completion verification uses one admitted observation-only AGE-3 operation with an exact subject, constructor, parameter producer, verifier principal, target, predicate, result mapping, receipt contract, budget coverage, and finite predecessor-linked attempt identity committed before reservation. | `runtime-adversarial` |
| PNH-INV-87 | Cancellation closes future work without rewriting consumed work | D2 derives the cancellation envelope's owner, principal, role, epoch, and lease after peer authentication, and D4 revalidates them with the command and current state. A valid cancellation first closes new reservations, then uses one D4-only compare-and-set from every unconsumed nonterminal effect state. It loses atomically to permit consumption and cannot revoke or rewrite a consumed permit, receipt, ambiguity result, budget claim, operator decision, evidence checkpoint, or terminal result. | `runtime-adversarial` |
| PNH-INV-88 | D4 alone constructs terminal authority | Only D4's transaction writer may construct or persist a terminal result, evidence checkpoint, terminal content attachment, or terminal state transition. Coordinator, model, parser, executor, broker, verifier, operator channel, content service, consumer, and external observer types contain no terminal writer. | `static-structure` |
| PNH-INV-89 | Late evidence is supplemental and cannot rewrite terminal history | A trustworthy observation arriving after terminal commitment may append once to a separate predecessor-linked supplemental chain keyed by the frozen terminal result and exact effect evidence. It cannot alter effect state, budget, completion evaluation, main evidence checkpoint, terminal outcome, terminal digest, retention authority, or downstream authority. | `runtime-adversarial` |

## 11. Complete AGE alias mapping

The mapping is normative for this candidate. IDs from PNH-INV-01 through
PNH-INV-46 refer to preserved predecessor law; IDs from PNH-INV-47 through
PNH-INV-89 refer to candidate rows above.

| Contract alias | Canonical invariant IDs |
|---|---|
| AGE1-INV-01 | PNH-INV-04, PNH-INV-10, PNH-INV-11 |
| AGE1-INV-02 | PNH-INV-47, PNH-INV-48 |
| AGE1-INV-03 | PNH-INV-49 |
| AGE1-INV-04 | PNH-INV-50 |
| AGE1-INV-05 | PNH-INV-51 |
| AGE1-INV-06 | PNH-INV-52 |
| AGE2-INV-BEHAVIOR | PNH-INV-14, PNH-INV-28, PNH-INV-53, PNH-INV-54 |
| AGE2-INV-IDENTITY | PNH-INV-55 |
| AGE2-INV-PARSE | PNH-INV-56 |
| AGE2-INV-SERIAL | PNH-INV-57, PNH-INV-67 |
| AGE2-INV-CHECKPOINT | PNH-INV-58 |
| AGE2-INV-REPLAY | PNH-INV-45, PNH-INV-55, PNH-INV-56, PNH-INV-58, PNH-INV-59 |
| AGE2-INV-FINITE | PNH-INV-60, PNH-INV-61 |
| AGE2-INV-BOUNDARY | PNH-INV-13, PNH-INV-17, PNH-INV-30, PNH-INV-31, PNH-INV-62, PNH-INV-63 |
| AGE3-INV-GRANT | PNH-INV-11, PNH-INV-12, PNH-INV-64, PNH-INV-65 |
| AGE3-INV-DEST | PNH-INV-31, PNH-INV-66 |
| AGE3-INV-SERIAL | PNH-INV-67 |
| AGE3-INV-PERMIT | PNH-INV-45, PNH-INV-68 |
| AGE3-INV-RECEIPT | PNH-INV-06, PNH-INV-08, PNH-INV-16, PNH-INV-69 |
| AGE3-INV-RECOVERY | PNH-INV-06, PNH-INV-07, PNH-INV-70 |
| AGE4-INV-01 | PNH-INV-71 |
| AGE4-INV-02 | PNH-INV-72 |
| AGE4-INV-03 | PNH-INV-73 |
| AGE4-INV-04 | PNH-INV-74, PNH-INV-75 |
| AGE4-INV-05 | PNH-INV-76 |
| AGE4-INV-06 | PNH-INV-77 |
| AGE4-INV-07 | PNH-INV-17, PNH-INV-30, PNH-INV-78, PNH-INV-79 |
| AGE4-INV-08 | PNH-INV-80 |
| AGE5-INV-SUBJECT | PNH-INV-81, PNH-INV-82 |
| AGE5-INV-VIEW | PNH-INV-83 |
| AGE5-INV-DECISION | PNH-INV-45, PNH-INV-84 |
| AGE5-INV-NOPERMIT | PNH-INV-68, PNH-INV-85 |
| AGE5-INV-VERIFY | PNH-INV-86 |
| AGE5-INV-NORETRY | PNH-INV-07, PNH-INV-70, PNH-INV-86 |
| AGE5-INV-CANCEL | PNH-INV-06, PNH-INV-70, PNH-INV-87 |
| AGE5-INV-TERMINAL | PNH-INV-06, PNH-INV-08, PNH-INV-16, PNH-INV-28, PNH-INV-88 |
| AGE5-INV-LATE | PNH-INV-06, PNH-INV-89 |

No alias is orphaned. AGE1-INV-01 and AGE5-INV-NORETRY append no duplicate law
because their requirements are already binding through the listed canonical
IDs.

## 12. Accepted architecture family mapping

| Architecture alias | Canonical invariant IDs |
|---|---|
| AGE-INV-TASK | PNH-INV-04, PNH-INV-10, PNH-INV-11, PNH-INV-47 through PNH-INV-54 |
| AGE-INV-SERIAL | PNH-INV-55, PNH-INV-57, PNH-INV-58, PNH-INV-60, PNH-INV-61, PNH-INV-67 |
| AGE-INV-EFFECT | PNH-INV-11, PNH-INV-12, PNH-INV-45, PNH-INV-64 through PNH-INV-70 |
| AGE-INV-DEST | PNH-INV-31, PNH-INV-66 |
| AGE-INV-REPLAY | PNH-INV-06, PNH-INV-07, PNH-INV-45, PNH-INV-52, PNH-INV-55, PNH-INV-56, PNH-INV-58, PNH-INV-59, PNH-INV-70 |
| AGE-INV-CONTENT | PNH-INV-71 through PNH-INV-80 |
| AGE-INV-DECISION | PNH-INV-45, PNH-INV-68, PNH-INV-81 through PNH-INV-85 |
| AGE-INV-VERIFY | PNH-INV-07, PNH-INV-68, PNH-INV-70, PNH-INV-86 |
| AGE-INV-TERMINAL | PNH-INV-06, PNH-INV-08, PNH-INV-16, PNH-INV-28, PNH-INV-87 through PNH-INV-89 |
| AGE-INV-BOUNDARY | PNH-INV-13, PNH-INV-17, PNH-INV-30, PNH-INV-31, PNH-INV-62, PNH-INV-63, PNH-INV-78, PNH-INV-79 |

## 13. Existing-law AGE reproof overlay

Supersession cannot mutate a preserved row or its Plan A first-release rule.
AGE applicability is therefore recorded as a separate proof-scope overlay. It
does not change law or claim that prior proof covered AGE.

| Existing ID | AGE reproof requirement | Closing gate |
|---|---|---|
| PNH-INV-04 | Reprove the opaque admitted authority root with the complete AGE task import set. | AGE-1, AGE-X |
| PNH-INV-05 | Reprove that Policy admission completes before any AGE production grant. | AGE-1, AGE-X |
| PNH-INV-06 | Reprove first-winner settlement across effects, cancellation, terminal commitment, and supplemental evidence. | AGE-3, AGE-5, AGE-X |
| PNH-INV-07 | Inject post-consumption uncertainty for every AGE effect kind and verification attempt. | AGE-3, AGE-5, AGE-X |
| PNH-INV-08 | Remove each AGE completion evidence class independently and prove completion fails. | AGE-5, AGE-X |
| PNH-INV-09 | Apply structured production-path proof and independent falsification to every AGE law. | AGE-X |
| PNH-INV-10 | Inject authority-shaped instructions, goals, model output, content, and tool output at every AGE boundary. | AGE-1, AGE-2, AGE-3, AGE-X |
| PNH-INV-11 | Attempt authority derivation from every value outside the admitted AGE task and operation bindings. | AGE-1, AGE-3, AGE-X |
| PNH-INV-12 | Attempt grant widening by every AGE producer, coordinator, plugin, executor, verifier, and imported operation binding. | AGE-1, AGE-2, AGE-3, AGE-X |
| PNH-INV-13 | Prove coordinator, executor, content, verifier, and operator processes cannot receive broker credentials or arbitrary endpoints. | AGE-2, AGE-3, AGE-5, AGE-X |
| PNH-INV-14 | Reprove exact provider, route, and model identity through AGE coordination, effect, receipt, and recovery. | AGE-2, AGE-3, AGE-X |
| PNH-INV-16 | Inject missing and unwritable checkpoint, receipt, content, decision, verification, and terminal evidence. | AGE-2, AGE-3, AGE-4, AGE-5, AGE-X |
| PNH-INV-17 | Prove AGE content and terminal outputs cannot publish without separate consumer authority. | AGE-4, AGE-5, AGE-X |
| PNH-INV-28 | Mutate template, behavior, operation, approval, verification, and completion meaning after admission and prove rejection. | AGE-1, AGE-2, AGE-3, AGE-5, AGE-X |
| PNH-INV-29 | Reprove that every plugin and exact executable used by AGE is owner-approved and digest-bound before admission. | AGE-1, AGE-2, AGE-3, AGE-X |
| PNH-INV-30 | Prove models, coordinator, plugins, executors, and content identities cannot install, schedule, apply, or authorize completion. | AGE-2, AGE-4, AGE-5, AGE-X |
| PNH-INV-31 | Attempt caller, model, coordinator, and plugin route or identity selection through every AGE effect path. | AGE-2, AGE-3, AGE-X |
| PNH-INV-32 | Reprove one admitted task under autonomous multi-turn execution without adding an internal task scheduler. | AGE-2, AGE-X |
| PNH-INV-33 | Reprove one host custody and settlement daemon across AGE owner, lease, effect, content, decision, and terminal transactions. | AGE-3, AGE-4, AGE-5, AGE-X |
| PNH-INV-34 | Prove the host daemon interprets only closed authenticated AGE commands and never model or plugin payloads as lifecycle authority. | AGE-1, AGE-3, AGE-5, AGE-X |
| PNH-INV-45 | Reprove replay resistance for every authenticated AGE command, permit, receipt, decision, cancellation, and response. | AGE-1, AGE-3, AGE-5, AGE-X |

An existing `proof_status: proven` does not satisfy this overlay unless its
structured proof report explicitly covers the AGE production path and the
listed fault or forbidden authority.

## 14. Materialization and ratification protocol

This candidate becomes eligible for owner decision only after these ordered
gates close:

1. Plan A produces and ratifies the immutable predecessor — satisfied: the
   predecessor was installed by commit `0604d052` and Plan A closed under
   completion-authority commit `3cfe36d3` with a validated owner receipt.
2. A materializer copies all 46 predecessor rows byte-identically and emits
   all 43 candidate rows with explicit fixed state and closing gates.
3. Mechanical verification proves complete ID, alias, architecture-family,
   source, supersession, row-byte, imported-root, boundary-manifest, and
   reproof-overlay closure.
4. Independent hardening over the exact architecture, five AGE contracts,
   refreshed reconciliation record, imported-root supplement, candidate
   baseline, and materialized artifact has no unresolved Critical or
   Important finding.
5. The external ratification gate of section 4.4 pins the predecessor digest,
   successor digest, exact law statements, source objects, and hardening
   report; the separate D5-authenticated owner receipt binds the gate digest,
   the selected outcome, the supersession reason, and the
   implementation-ratification disposition.

Before step 5, every new law remains proposed. Owner ratification may produce
the immutable successor with those exact statements at `law_status: ratified`.
It cannot silently edit this candidate, preserve a failed hardening report, or
carry proof status above what executed evidence establishes.

## 15. Proof and public-claim posture

All new laws are unproven. Static-looking architecture and complete contract
prose are not implementation proof. `proof_status: proven` requires the
registered enforcement kind, executed production-path evidence, and an
independent falsification artifact under PNH-INV-09.

No new AGE law supports a first-release or public support claim. The
`post-first-release` disposition remains until a later owner-ratified release
decision names an exact implementation, proof report, evidence environment,
and release scope.

## 16. Downstream and implementation boundary

This baseline adds no AGE-6, work-program selection, governed adaptation,
external observability, artifact application, installation, deployment,
publication, or release authority. D8, D9, and D10-era documents remain blocked
and non-normative for AGE. The refreshed reconciliation's boundary manifest
binds every excluded source and hardening object plus the explicit AGE-6
absence receipt.

This draft does not authorize:

- creation or mutation of a machine-readable baseline;
- edits to `invariants.yaml`, `invariants.lock`, or the generated constitution;
- Plan A execution or amendment;
- owner constitutional or implementation ratification;
- independent or full hardening;
- implementation planning, code, schemas, migration, or live provider use; or
- installation, deployment, publication, or release.

## 17. Draft closure record

- Candidate ID range: PNH-INV-47 through PNH-INV-89.
- New candidate laws: 43.
- Contract aliases mapped: 37 of 37.
- Architecture families mapped: 10 of 10.
- Existing laws requiring AGE-scoped reproof: 21.
- New-law status: proposed; prospective registry posture unproven.
- Release disposition: post-first-release.
- Required predecessor: present at
  `sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c`,
  ratified through Plan A completion-authority commit `3cfe36d3`.
- Imported-root closure: 65 external symbols mapped in the supplement.
- Boundary manifest: bound in the refreshed reconciliation, with the AGE-6
  absence receipt.
- Independent hardening: not run.
- Owner ratification: not requested or granted.
- Registry, lock, constitution, Plan A, contracts, code, and frozen pair:
  unchanged.

The next milestone may independently harden this exact candidate package.
Constitutional materialization and ratification remain blocked behind the
Gate A0R staging authority, the section 14 protocol, and the section 4.4
external gate and owner receipt.
