# Prism Harness autonomous goal-execution architecture specification

Date: 2026-08-27

Status: **clean-room architecture candidate**. This document grants no
implementation, installation, provider-call, publication, or ratification
authority. It does not amend or supersede the frozen D8 revision 8 pair.

This specification is a new design derived from the autonomous goal-execution
outcome and the ratified D1 through D7 constraints. The frozen D8 documents are
historical requirements and failure evidence only. Their section structure,
schema catalog, and amendment sequence are not normative here.

## 1. Product outcome

Prism Harness must let an authenticated owner submit a goal, leave the process
running, and later receive a trustworthy terminal result from a finite,
resumable agent.

The result is trustworthy only when Prism can prove all of the following:

- the run used the exact owner-ratified task template and submitted goal;
- every model dispatch and tool operation stayed inside its admitted authority;
- every policy-gated operation received a valid operator decision before it
  executed;
- restart did not reinterpret committed output or repeat an uncertain effect;
- completion followed the admitted completion policy rather than a model's
  claim; and
- terminal evidence refers only to durable, readable, owner-scoped content.

Autonomy means Prism can advance the task without an operator supervising each
ordinary step. It does not mean the model can grant itself capabilities, change
policy, approve an effect, or decide that its own work is complete.

## 2. Reset posture

The former D8 draft attempted to specify task identity, loop replay, external
effects, accounting, content stores, approval, verification, encapsulated
runtimes, and adaptation boundaries in one ratification unit. Repeated local
amendments left the design difficult to reason about as a whole.

This replacement uses one umbrella architecture and five independently bounded
contract areas. A sixth area for encapsulated external-agent runtimes is
deferred.

Architecture acceptance has a narrow meaning: it accepts the decomposition and
authorizes writing the contract specifications. It does not ratify autonomous
goal execution or authorize implementation.

## 3. Source of truth and precedence

When sources disagree, use this order:

1. Runtime, developer, user, and owner authority.
2. The ratified invariant registry and lock.
3. The ratified Prism architecture and its binding amendments.
4. The invariant-law and proof-status amendment and the immutable Plan A
   46-row baseline.
5. This specification after owner architecture acceptance.
6. Future AGE contract specifications after their package ratification.
7. Current implementation, which may be incomplete.
8. The frozen D8 pair, its hardening reports, and other historical drafts.

Nothing in this document changes D1 through D7, the first-release critical
path, or the existing Plan A baseline.

## 4. Scope

This architecture covers:

- reusable task templates and per-run goal submissions;
- exact instruction composition and immutable run admission;
- a durable declarative model and tool loop;
- finite budgets and deterministic progression;
- provider, local-tool, outward-tool, and verification effects;
- exact operation and destination authority;
- human approval through the authenticated operator channel;
- immutable content custody and artifact emission;
- restart, response-loss, crash, and daemon-epoch recovery;
- completion policy, verification, terminal settlement, and evidence; and
- narrow output boundaries for work programs, observability, and adaptation.

## 5. Non-goals

This architecture does not add:

- multi-run scheduling, competition, judging, or winner selection;
- durable learning, memory updates, prompt replacement, skill installation, or
  adaptation promotion;
- interactive chat sessions or context compaction;
- model-directed changes to templates, grants, routes, tools, budgets,
  policies, or verification rules;
- more than one nonterminal effect lifecycle inside a run;
- automatic retry after an effect may have occurred;
- an active-time accumulator reconstructed across daemon epochs;
- production encapsulated external-agent execution;
- a direct external-observability dependency in settlement; or
- a compatibility path from the frozen D8 schemas.

Consumer software may compose several admitted runs. Each Prism run remains a
single serial authority domain.

## 6. Design decisions

### 6.1 Separate reusable policy from one submitted goal

A reusable `TaskTemplate` defines instructions, accepted goal-data shape,
capability envelope, budgets, policies, and completion requirements. A
`GoalSubmission` contains one owner's goal data. D1 combines them into one
immutable `AdmittedGoalRun`.

Prompt wording and goal wording are data. They cannot create or widen a grant.

### 6.2 Declarative execution is the production core

Prism owns the turn loop. It can therefore journal each observation, parse each
proposal using admitted code, and place every model or tool effect behind D4.

Opaque external-agent runtimes are not required for autonomous goal execution.
They remain outside production until AGE-6 proves a complete isolation and
ambient-authority boundary.

### 6.3 One open effect per run

A run may have one model dispatch, tool operation, or verification operation in
a nonterminal effect state at a time. This includes reservations waiting for
approval or permit issuance, not only operations that have started executing. A
model may propose an ordered list, but Prism executes one proposal and commits
its outcome before starting the next.

This is a version 1 product constraint. It gives approval, budgets, recovery,
and terminal settlement one unambiguous ordering. Parallel work remains
possible through several independently admitted runs in the consumer control
plane.

### 6.4 One content-custody system

Model observations, tool results, parameters, feedback, and emitted artifacts
are typed immutable objects in one owner-scoped content system. They may use
different logical object kinds, but they do not create independent authority or
isolation models.

### 6.5 Discrete budgets replace active-time reconstruction

Version 1 admits exact limits for model turns, action effects, verification
attempts, provider usage, content bytes, and each effect's deadline. Budget
slots are monotonic and never refunded.

D2 still enforces process and capacity limits. A future active-compute-time
budget requires a separate contract with exact cross-epoch arithmetic and is
not implied by this architecture.

### 6.6 Architecture acceptance is not implementation ratification

The owner may accept this architecture to authorize bounded contract drafting.
Implementation remains blocked until the architecture, all required AGE
contracts, and a successor constitutional baseline are reviewed and ratified
as one digest-bound package.

## 7. System topology

```text
authenticated owner
       |
       | GoalSubmission + selected TaskTemplate
       v
AGE-1 Task Authority / D1 admission
       |
       | AdmittedGoalRun (sole runtime authority root)
       v
AGE-2 Run Coordinator ------------------------------+
       |                                             |
       | typed intent / transition command           | immutable content
       v                                             v
AGE-3 Effect Authority / D4 <----------------> AGE-4 Content Custody
       |                                             ^
       | one-use permit                              | read-by-value
       v                                             |
D3 provider broker or admitted tool executor         |
       |                                             |
       | authenticated receipt + content reference   |
       +-----------------------> D4 settlement ------+
                                      ^
                                      |
                         AGE-5 operator and verifier commands
```

The run coordinator never receives credentials or direct effect authority.
The content custodian never decides whether an operation was authorized or a
run completed. D4 remains the only authoritative writer for run, effect,
approval, verification, and terminal state.

## 8. Module ownership

| Area | Owns | Does not own |
|---|---|---|
| AGE-1 Task Authority | Templates, goal schemas, instruction composition, complete admission identity | Turn progression, permits, decisions, content bytes |
| AGE-2 Run Coordination | Deterministic turn and action progression, proposal queue, checkpoint commands | Grants, credentials, effect execution, settlement writes |
| AGE-3 Effect Authority | Reservations, permits, receipts, budgets, deadlines, recovery outcomes | Prompt meaning, raw content, operator rendering |
| AGE-4 Content Custody | Durable immutable objects, references, type and owner access, topology proof | Run outcome, destination application, promotion |
| AGE-5 Human Decision and Completion | Approval-view protocol, authenticated decision commands, verification and completion policy | Direct state writes, model execution, artifact application |
| AGE-6 Encapsulated Execution | Future opaque-runtime isolation profile | Any production capability in this architecture version |

AGE-1 through AGE-5 are required contract areas. They are separate
specifications and proof surfaces, but their production adapters may share the
existing host daemon and transaction substrate where D2 and D4 require atomic
state.

## 9. AGE-1: task authority

### 9.1 Task template

A `TaskTemplate` is a non-executable, owner-ratified registry record. It binds:

- template identity, schema, version, and owner domain;
- an immutable instruction bundle and exact composition algorithm;
- the schema accepted for per-run goal data;
- the exact model route classes and tool operations that may be granted;
- local filesystem and outward-destination capability envelopes;
- approval policy and approval-view mappings;
- discrete budget ceilings and effect-deadline policy;
- the completion policy and exact verification-operation binding, if required;
- action parser, action grammar, conversation serializer, and feedback renderer
  executable identities with their dependency closures; and
- content-retention and maximum-object-size policies; and
- the canonical schema set and registry versions needed to reproduce authority
  digests.

An instruction bundle is data, not a plugin. Executable parsers, renderers,
tools, and verifiers remain ordinary admitted executable artifacts under D1.

### 9.2 Goal submission

A `GoalSubmission` contains:

- owner domain and authenticated submitter role;
- selected task-template identity;
- one goal-data value that validates against the template's goal schema;
- optional values only where the template explicitly declares an input slot;
  and
- a stable submission identity for response-loss replay.

It contains no tool, route, destination, budget, parser, verifier, or execution
profile override. Values resembling authority remain ordinary goal data.

### 9.3 Admitted goal run

D1 validates the template, goal submission, executable bindings, requested
capabilities, host topology, and policies. It then creates one immutable
`AdmittedGoalRun` snapshot through the existing D1, D2, and D4 activation
transaction.

The snapshot binds the exact goal digest, template digest, instruction bundle,
composed initial conversation, granted operations, destination capabilities,
provider route, principals, budgets, deadline policy, approval mapping,
content-custody binding, replay binding, and completion binding.

The admitted snapshot is the sole runtime authority root. A template, goal
submission, registry row, content object, or prior run cannot independently
authorize execution.

### 9.4 Instruction composition

Composition produces one ordered role and byte sequence under a named,
versioned algorithm. Roles, empty-value rules, normalization rules, source
ordering, and every input digest enter the composed-conversation digest.

Provider translation may change transport syntax only. It cannot infer, merge,
reorder, drop, duplicate, or reinterpret a composed message.

### 9.5 AGE-1 exit contract

AGE-1 closes only when two independent implementations reproduce every
authority digest and admission rejects every omitted, duplicate, reordered,
unknown, cross-owner, drifted, or over-broad binding before a run becomes
runnable.

## 10. AGE-2: run coordination

### 10.1 Coordinator role

The trusted run coordinator advances one admitted run. It has no credentials
and no direct effect executor. Its only authority-bearing operations are narrow
commands to D4 that reference the admitted run and current lease.

The coordinator performs this loop:

1. Read the last committed run checkpoint and required content references.
2. If no action is pending, commit a model-turn intent checkpoint with its
   stable operation identity, then reserve one model-dispatch effect.
3. After its receipt, require durable content publication before committing the
   model observation reference.
4. Parse the exact committed observation once using the admitted parser.
5. Commit the parse result, ordered proposal identities, conversation state,
   and next coordinator mode in one step checkpoint.
6. Execute at most one pending proposal through AGE-3, then commit its outcome
   and feedback before advancing.
7. When the model proposes completion or budgets require stopping, invoke the
   admitted AGE-5 completion policy.

### 10.2 Proposal status

A parsed proposal has one closed status progression:

```text
queued
  |-- rejected-invalid
  |-- rejected-not-granted
  +-- selected
        |-- awaiting-approval
        |-- effect-reserved
        +-- terminal-outcome
```

Only the first nonterminal proposal in deterministic order may be selected.
Every proposal receives one stable identity derived from its committed turn and
ordinal. Parser retries return the committed parse record. They do not execute
new parser code against old observation bytes.

### 10.3 Coordinator modes

The run has one coordinator mode at a time. A successful nonterminal effect
outcome returns to `ready`. A pending approval returns to its existing effect
only through the committed decision transition:

```text
ready --> model-effect ---------> ready
  |       action-effect --------> ready
  |       verification-effect --> ready or settling
  |            |
  |            +--> awaiting-approval --> same existing effect
  |
  +--> settling

settling
  |-- completed
  |-- failed
  |-- rejected
  |-- cancelled
  +-- ambiguous
```

The terminal modes are immutable. `awaiting-approval` is reachable only before
the related permit is consumed. The one-open-effect rule prevents a second
effect from running or waiting elsewhere in the same run.

### 10.4 Restart contract

Restart uses committed step checkpoints and immutable content references. It
must not:

- reparse a committed observation;
- regenerate identities for a committed proposal or verification attempt;
- redispatch an effect whose permit may have been consumed;
- regenerate model-visible feedback under a different renderer; or
- advance when a referenced object, executable binding, lease, epoch, or
  checkpoint chain cannot be verified.

An integrity failure before effect consumption rejects or fails the run. An
integrity failure after consumption with no trustworthy receipt settles the
effect and run as `ambiguous`.

### 10.5 Finite progression

Every run has admitted maximums for turns, action effects, verification
attempts, provider units, and content bytes. D4 claims the applicable slot or
maximum allowance in the same transaction that creates the first semantic
reservation or attempt checkpoint. When actual use is known only after the
effect, admission reserves the descriptor-declared maximum and does not refund
the difference. Slots and allowances never return to the budget after
rejection, crash, or replay.

## 11. AGE-3: effect authority

### 11.1 Complete operation binding

Every executable effect resolves one `GrantedOperationBinding` from the
admitted snapshot. The binding identifies:

- effect kind and exact operation;
- executable artifact, adapter, protocol, and authenticated claimant principal;
- parameter schema and deterministic parameter-construction version;
- effect classification and approval policy;
- local capability or outward destination resolver and closed destination set;
- receipt schema and whether content is required; and
- permit deadline policy and applicable budget.

An operation name, tool ID, effect-family label, raw endpoint, or approval
record is not a substitute for the complete binding.

### 11.2 Effect kinds

The initial closed set is:

| Kind | Authorized claimant |
|---|---|
| Model dispatch | Exact D3 broker principal bound to the admitted provider route |
| Local tool | Exact restricted local-tool executor principal and provisioned capability |
| Outward tool | Exact destination adapter principal after trusted destination resolution |
| Verification | Exact verifier executor selected by the completion binding |

Provider, local, outward, and verification permits are tagged capabilities.
They cannot be claimed across kinds even when request fields have the same
shape.

### 11.3 Effect lifecycle

```text
reserved
  |-- rejected-pre-dispatch
  |-- awaiting-approval
  |     |-- rejected-denied
  |     |-- rejected-expired
  |     |-- rejected-epoch-loss
  |     +-- approved-awaiting-permit
  |             |-- rejected-epoch-loss
  |             +-- permit-issued
  +-- permit-issued
        |-- rejected-expired
        |-- rejected-epoch-loss
        +-- consumed
              |-- receipted
              +-- ambiguous
```

The diagram is conceptual. The AGE-3 contract must define the exact legal
transition table, payload of every variant, and one-writer compare-and-set
preconditions.

### 11.4 Permit consumption

D4 samples the trusted clock inside the permit-consumption transaction. A
permit authorizes execution only when the sample is strictly less than the
permit deadline. Equality is expired.

The transaction binds the reservation, request digest, claimant principal,
operation binding, destination or local capability, daemon epoch, ownership
lease, and generation. Exactly one successful consumption may cross into the
executor. A lost response can return the same committed result to the same
claimant but cannot consume again.

### 11.5 Destination authority

Every outward operation uses a trusted resolver to select exactly one
owner-pinned destination capability before reservation. The resolved identity
is carried unchanged through approval, permit, execution, receipt, and
evidence.

Protected destination classes are structurally absent from every grantable
catalog. Raw endpoints, redirects, aliases, aggregate writers, DNS or service
indirection, caller-selected roots, unknown destinations, and unclassifiable
destinations fail closed unless the admitted resolver proves the same opaque
destination capability.

Local filesystem effects use provisioned whole-boundary capabilities and
no-follow relative resolution. An outward destination and a local filesystem
capability are different authority kinds and cannot be substituted.

### 11.6 Receipts and result content

Every receipt carries the exact reservation, consumed permit, operation,
principal, destination or local capability, execution environment, and result
shape.

The result is a closed union:

- `content`: one durable AGE-4 content reference with the admitted object kind
  and schema; or
- `no-content`: allowed only when the operation descriptor explicitly declares
  that successful execution has no observation bytes.

Output-bearing provider, tool, and verification effects cannot commit a receipt
until AGE-4 confirms durable publication and readback.

### 11.7 Recovery

The AGE-3 contract defines one recovery result for every lifecycle state:

| Durable state at epoch loss | Recovery |
|---|---|
| Reserved, no permit | Reject safely; no execution authority existed |
| Approval pending | `rejected-epoch-loss`; no old challenge remains usable |
| Approved, no permit | `rejected-epoch-loss`; prior decision remains evidence only |
| Permit issued, not consumed | Reject or expire; proven no execution authority crossed |
| Permit consumed, no trustworthy receipt | `ambiguous`; never redispatch automatically |
| Trustworthy receipt committed | Settle exactly once from that receipt |
| Terminal | Return the immutable existing result |

## 12. AGE-4: content custody

### 12.1 Object model

One content-custody system stores immutable owner-scoped objects. The initial
object kinds are:

- model observation;
- tool or verification observation;
- action parameters;
- model-visible feedback;
- emitted immutable artifact; and
- emitted typed patch.

Each kind is a closed tagged union with a named schema. A typed patch requires
one exact patch-schema digest. An immutable artifact has no patch field.

The first production profile uses one dedicated backing root per owner domain.
Logical object kinds share that owner's custody and publication protocol rather
than creating kind-specific stores. Cross-owner physical deduplication is not
part of the first production profile.

### 12.2 Reference model

A `ContentReference` identifies the owner domain, custody instance, object
kind, content digest, byte length, schema digest, and reader protocol. It is
opaque to run and consumer code. Paths, mount names, database keys, and writer
handles do not cross the custody interface.

D4 accepts a reference only after the content custodian proves that the exact
object is durable and readable under the admitted custody binding.

### 12.3 Durable publication

The production adapter must complete this protocol before returning a
reference eligible for settlement:

1. Write and flush the complete object bytes.
2. Atomically install the digest-addressed object without replacement.
3. Flush the containing directory or durable index.
4. Reopen the installed object through the production reader.
5. Verify kind, owner, length, schema, and content digest.
6. Return the reference and durability receipt.

Startup reconciliation detects incomplete publications, unreferenced objects,
missing referenced objects, digest corruption, and stale topology proof.
Missing referenced content closes admission and prevents new authority until
the owner-visible integrity condition is resolved.

### 12.4 Unified topology catalog

One topology-versioned catalog covers every content root, task capability,
protected root, credential root, synchronized or replicated root, consumer
writer, and owner domain on the host.

The catalog proves the required equality, containment, alias, mount, device,
filesystem, and backing-store relationships across all root kinds. Adding or
changing a root is one transactional topology update. A binding whose proof is
stale cannot admit runs or accept writes.

No separate artifact or loop-store catalog may make an independent disjointness
claim.

### 12.5 Principals and access

Only the custody writer principal may publish objects. Restricted readers
receive digest-verified bytes by value for one admitted owner and object kind.
Run coordinators, task executors, D9 consumers, and operator renderers receive
no backing path or general read handle.

D9 and other consumers import selected artifacts by value through separately
ratified consumer authority. A content reference never grants apply, promotion,
installation, or destination-write authority.

### 12.6 Retention and deletion

The admitted run binds one content-retention policy. An object referenced by a
nonterminal run, committed receipt, action checkpoint, approval decision,
verification attempt, terminal result, or retained evidence checkpoint cannot
be deleted. Retention expiry creates a separately recorded custody transition;
it never mutates the historical settlement record or silently turns a live
reference into a missing object.

## 13. AGE-5: human decision and completion

### 13.1 Approval subject

An approval policy maps each gateable effect class to one closed approval
subject schema. The complete mapping identity is bound into the task template,
admitted run, reservation, challenge, and decision.

The subject contains the exact operation, principal, destination or local
capability, semantic parameter values, mutation footprint, deadline, and
expected receipt. A digest or opaque reference alone is not sufficient for
operator confirmation.

### 13.2 Canonical approval view

Before issuing a challenge, a dedicated read-only operator-channel principal:

1. retrieves referenced content by value from AGE-4;
2. verifies owner, kind, schema, length, and digest;
3. decodes it with the exact admitted schema;
4. constructs a complete lossless approval view; and
5. binds both source-content digests and the approval-view digest into the
   challenge.

The renderer may choose layout, but it cannot omit, summarize, rename, or
reinterpret an authority-bearing value. Missing, oversized, ambiguous,
unsupported, lossy, or unreadable content receives no challenge.

### 13.3 Decision protocol

The operator channel authenticates owner domain, principal, role, and current
authorization-policy version. D4 issues the decision identity and challenge.
The decision binds the run, reservation, complete approval subject, approval
view, operator identity and role, policy version, daemon epoch, and deadline.

D4 samples the trusted clock inside the decision transaction. A first decision
commits only when the sample is strictly less than both the gate and challenge
deadlines. Equality is expired.

The first valid decision wins. Identical replay returns the same immutable
decision authority. Conflicting replay does not change state. Epoch loss has
explicit terminal gate variants and never reuses an old challenge.

The operator channel submits decisions. D4 remains the sole writer of approval
and effect state.

### 13.4 Verification binding

A completion policy that requires verification selects one exact
`GrantedVerificationOperationBinding`. It contains the complete AGE-3 operation
binding plus:

- the terminal-candidate checkpoint being verified;
- exact subject construction;
- exact predicate and predicate version;
- deterministic parameter construction;
- accepted observation and receipt shapes; and
- the rule mapping a valid receipt to pass, fail, or uncertainty.

A verifier plugin identity and natural-language predicate are not enough.
Verification operations are observation-only. An operation whose descriptor
permits mutation, repair, messaging, publication, or destination writes cannot
serve as completion verification.

### 13.5 Verification attempts

Before reservation, D4 commits one verification-attempt checkpoint derived
from the terminal-candidate checkpoint, verification-binding digest, and
attempt ordinal. The checkpoint claims its budget slot and fixes the operation
identity.

Restart reuses that identity. A later permitted attempt receives a new ordinal.
The completion policy defines the exact finite retry count and which proven
pre-dispatch failures may advance to another attempt. Post-consumption
uncertainty cannot retry automatically.

### 13.6 Completion policy

The model may propose that the goal is complete. That proposal only moves the
coordinator into the admitted completion policy.

The policy evaluates:

- budget and checkpoint consistency;
- required action outcomes;
- unresolved approval or effect state;
- content-reference integrity;
- required verification result; and
- execution-class positive evidence inherited from D4.

Only D4 writes the terminal result. Missing required evidence prevents
`completed`. Proven internal failure becomes `failed` or `rejected` according
to the contract. Possible external occurrence without trustworthy receipt
becomes `ambiguous`.

### 13.7 Terminal evidence and late observations

Terminal state and its evidence checkpoint are immutable. A trustworthy receipt
that arrives after terminal commitment may enter only a separate supplemental
observation chain keyed by the frozen terminal checkpoint, reservation, and
receipt digest. That append is idempotent and cannot change the effect outcome,
run outcome, budget, completion evidence, or terminal digest.

Cancellation closes authority for new reservations. A run with no consumed
open effect may settle `cancelled`. If an effect was consumed, cancellation
cannot rewrite its result: Prism waits for a trustworthy receipt or follows the
same `ambiguous` recovery rule as any other post-consumption interruption.

## 14. AGE-6: encapsulated execution

AGE-6 is deferred and has no production adapter or public support claim.

A future encapsulated runtime is admissible only if a separate specification
proves a complete execution envelope under a dedicated restricted principal or
stronger VM or container boundary. The proof must cover all filesystem reads
and writes, home directories, environment secrets, inherited descriptors,
local IPC, daemon and operator endpoints, process control, host namespaces,
signals, broker sessions, DNS, and direct network paths.

Inputs enter by value. Outputs leave through AGE-4. If any unobserved channel
can cause a privileged or outward effect, the runtime is not artifact-only and
cannot enter production.

Failure to implement AGE-6 does not block declarative autonomous goal
execution.

## 15. Interfaces with D1 through D7

| Existing area | Autonomous goal-execution use |
|---|---|
| D1 admission | Validates task templates and goal submissions and issues the immutable admitted run |
| D2 custody | Provides owner domains, daemon epochs, leases, restricted principals, capacity, topology custody, and operator-channel authentication |
| D3 broker | Executes admitted model-dispatch effects under the exact provider binding |
| D4 settlement | Owns run, checkpoint, effect, approval, verification, receipt, evidence, and terminal writes |
| D5 bridge | Not required; a future bridge operation must still enter AGE-3 as an exact admitted effect |
| D6 constitution | Owns successor baseline, invariant proof, independent review, and public-claim gating |
| D7 release | Packages only ratified and proven autonomous-goal surfaces after their own release gate |

AGE modules deepen existing ports. They do not create a second admission root,
host lifecycle writer, provider credential path, settlement writer, proof
system, or release authority.

## 16. Downstream boundaries

### 16.1 Work programs

A work program is a consumer-control-plane composition of independently
admitted runs. Program IDs may appear as non-authoritative correlation
metadata. Scheduling, competition, judging, selection, and apply authority are
not part of this architecture.

### 16.2 Governed adaptation

Autonomous goal execution may emit evidence and immutable artifacts. It does
not classify them as learning, package them for a protected destination, or
apply them.

D9 must import selected bytes by value, establish its own candidate identity,
and obtain its own scanning, evaluation, owner-approval, resolver, and writer
authority. A run result, artifact reference, approval, verification pass,
recommendation, or work-program selection is never promotion authority.

### 16.3 External observability

External telemetry is derivative. D4 settlement and AGE recovery never depend
on an external observability backend. Export uses an exact owner-authorized
snapshot and a governed outward effect. Imported external scores and traces are
untrusted evidence.

## 17. Canonical schema and identity law

Every authority-bearing contract must satisfy these rules:

- one generated closed schema defines each record and tagged union;
- every digest type has one name, domain prefix, root schema, and codec version;
- every digest-typed field resolves to a declared local or imported digest
  contract;
- keyed collections declare one semantic key, canonical ordering, and duplicate
  rejection before lookup or hashing;
- semantic sets sort by complete canonical element bytes and reject duplicates;
- invalid combinations are represented as impossible tagged-union shapes, not
  independent enums and nullable fields;
- task identity binds every registry or mapping that can change execution,
  approval, destination, verification, or rendering semantics; and
- two independent codecs reproduce all authority digests and reject alternate
  encodings.

Exact field schemas belong to the bounded AGE contract specifications. The
umbrella architecture defines their ownership and required bindings.

## 18. Failure and terminal semantics

| Condition | Result |
|---|---|
| Goal, template, grant, topology, or binding invalid before admission | Reject; no run authority |
| Parser cannot map model output to the closed proposal grammar | Durable rejected proposal; continue or fail according to admitted policy |
| Proposal references an ungranted operation | Durable rejection; no reservation |
| Approval denied, expired, or lost with daemon epoch | Reject that effect; no permit |
| Permit expires before consumption | Reject safely; no execution authority crossed |
| Permit consumed and no trustworthy receipt exists | `ambiguous`; no automatic retry |
| Output-bearing receipt lacks durable content | No receipt commitment; post-consumption state becomes `ambiguous` if recovery cannot prove the result |
| Checkpoint or referenced content is corrupt or missing before dispatch | Fail closed before new authority |
| Verification fails with a trustworthy receipt | Completion does not pass; follow the admitted finite policy |
| Verification may have occurred but lacks a trustworthy receipt | `ambiguous`; no automatic retry |
| Terminal write response is lost | Replay returns the identical immutable terminal result by stable request identity |
| Late receipt arrives after terminal | Record only through a separately defined supplemental observation path that cannot alter terminal authority |

Every AGE contract must specify restart behavior for each nonterminal state and
fault-injection tests on both sides of every authority-bearing commit.

## 19. Security invariants proposed by this architecture

Final invariant IDs are assigned only by the successor constitutional
baseline. The architecture proposes these invariant families:

| Alias | Target statement | Proof class |
|---|---|---|
| AGE-INV-TASK | Goal or instruction content never creates or widens authority; the admitted run binds every execution-relevant registry and executable version. | Static plus runtime adversarial |
| AGE-INV-SERIAL | One run has at most one nonterminal effect lifecycle, and every model turn, proposal, or verification attempt has one durable identity before reservation. | Runtime adversarial |
| AGE-INV-EFFECT | Every model, tool, outward, and verification operation uses one exact reservation and kind-tagged permit consumed once by the admitted principal before its deadline. | Runtime adversarial |
| AGE-INV-DEST | No outward effect executes without one trusted resolution to an owner-pinned non-protected destination carried through receipt. | Runtime adversarial |
| AGE-INV-REPLAY | Restart uses committed bytes, executable bindings, proposal identities, and checkpoints without reparse, regeneration, or unsafe redispatch. | Runtime adversarial |
| AGE-INV-CONTENT | D4 never commits a content reference before durable publication, and one topology catalog prevents cross-kind and cross-owner root aliasing. | Runtime adversarial |
| AGE-INV-DECISION | Only the authenticated operator channel can submit a decision, and the decision binds a lossless view of every semantic effect value. | Static plus runtime adversarial |
| AGE-INV-VERIFY | Completion requiring verification uses one exact admitted verification operation and durable attempt identity. | Runtime adversarial |
| AGE-INV-TERMINAL | Only D4 writes one immutable terminal result from the admitted completion policy and required positive evidence. | Static plus runtime adversarial |
| AGE-INV-BOUNDARY | Goal-execution outputs confer no work-program selection, adaptation promotion, observability, installation, or publication authority. | Static plus runtime adversarial |

These aliases are design handles only. They do not enter the immutable Plan A
baseline.

## 20. Contract package and dependency order

The architecture produces five required subordinate specifications:

```text
architecture acceptance
        |
        +--> AGE-1 task-authority contract
        +--> AGE-4 content-custody contract
                   |
                   v
             AGE-3 effect-authority contract
                   |
                   v
             AGE-2 run-coordination contract
                   |
                   v
             AGE-5 decision-and-completion contract
                   |
                   v
successor constitutional baseline + integrated contract package
                   |
                   v
independent hardening and owner implementation ratification
                   |
                   v
bounded implementation plans
```

AGE-1 and AGE-4 may be authored in parallel because task identity can name the
content-custody binding without defining effect state. AGE-3 depends on their
identity contracts. AGE-2 depends on AGE-3 checkpoint and effect commands.
AGE-5 depends on all prior content, operation, and checkpoint identities.

AGE-6 is absent from this dependency path.

## 21. Ratification protocol

### 21.1 Architecture acceptance

The owner may accept an exact digest of this document. Acceptance authorizes
writing AGE-1 through AGE-5 contract specifications. It authorizes no code,
schema migration, invariant activation, provider call, public claim, or
implementation plan.

### 21.2 Implementation ratification

Implementation ratification is one atomic owner decision bound to:

- the accepted architecture digest;
- exact AGE-1 through AGE-5 contract digests;
- the successor constitutional schema and immutable baseline digest;
- a supersession record preserving all Plan A rows byte-identically;
- complete mappings for every new invariant and implementation gate; and
- an independent hardening report over that exact package with no unresolved
  Critical or Important finding.

If any byte changes, the package requires a new report and owner decision.

### 21.3 Plan authority

Implementation ratification authorizes writing bounded implementation plans.
Each plan still requires its declared dependencies, verification, and owner
gate. Ratification does not itself authorize installation, live provider use,
deployment, publication, or release.

## 22. Architecture verification scenarios

The contract package must make these scenarios mechanically testable:

1. A local artifact-producing goal completes through several model and tool
   turns, restarts after each checkpoint, and produces identical terminal
   evidence against in-memory and durable adapters.
2. An outward operation shows the operator its exact destination and semantic
   payload, consumes one permit before its deadline, and completes only after
   its exact verification operation passes.
3. Crashes before and after reservation, approval, permit issue, permit
   consumption, content publication, receipt, action checkpoint, verification
   checkpoint, and terminal commit never duplicate an effect or reinterpret a
   committed observation.
4. Cross-owner and cross-kind content-root aliases, wrong principals, stale
   epochs, changed registries, changed parsers, changed approval mappings,
   redirects, raw endpoints, and protected destinations all fail before new
   authority.
5. A terminal artifact can be imported by a D9 fixture only as bytes and
   provenance. It cannot directly write a protected destination, alter a task
   template, or become executable.

## 23. Architecture risks and controls

| Risk | Control |
|---|---|
| Contract package grows back into a monolith | One owner and one state family per AGE specification; umbrella spec contains no exhaustive field catalog |
| Serial execution is mistaken for weak autonomy | Autonomy is measured by unattended finite progression; multi-run parallelism remains available outside one run |
| Template submission becomes ambient standing authority | Authenticated per-run submission, immutable run admission, finite budgets, and policy-gated effects |
| Content custody becomes a hidden general filesystem service | Opaque references, typed read-by-value ports, one writer, no paths or general handles |
| Operator UI hides meaningful values | Lossless schema-bound approval view and challenge binding to source and view digests |
| Verification becomes a repair backdoor | One exact operation binding and destination; no operation selection at runtime |
| Deferred encapsulated mode sneaks into release | No AGE-6 production adapter, invariant, plan, or public claim in the required path |

## 24. Acceptance record

- Architecture digest: pending.
- Owner architecture acceptance: pending.
- AGE-1 through AGE-5 contract specifications: not yet authored.
- Successor constitutional baseline: not yet authored.
- Independent package hardening: not run.
- Implementation ratification: pending.

The next authorized action after architecture acceptance is contract drafting,
starting with AGE-1 Task Authority and AGE-4 Content Custody. No existing D8
plan is amended by that action.
