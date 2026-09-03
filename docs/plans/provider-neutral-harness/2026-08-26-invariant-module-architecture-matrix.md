# Prism Harness invariant module and architecture matrix

Date: 2026-08-26

Status: architecture review complete; retained run-kernel mechanics folded into
the decision set; no implementation authorized by this document

## Purpose

This review maps all 46 registered invariants to the Prism Harness modules and
plugin kinds they govern. It then derives the smallest coherent set of
architecture decisions that can resolve the full registry.

“Resolve” does not always mean “activate.” A resolved invariant may be active
with proof, amended because its wording is wrong, retained as proposed behind a
named dependency, or retired by an explicit decision. This review recommends no
retirements. It does identify two active invariants whose current evidence does
not cover the subprocess executor and should be reopened before a public
release.

## Executive result

All 46 invariants fit under seven architecture decisions. Reducing the set
further would combine modules with different authority, failure modes, and test
surfaces. The seven decisions are:

1. Production admission and execution classes.
2. Host custody, fault isolation, and resource leases.
3. Trusted provider brokers and exact routing.
4. Settlement, replay, and durable evidence.
5. Foreign-capability bridge architecture.
6. Constitutional proof and claim governance.
7. Standalone package and release authority.

This set is minimal under the matrix, not merely a convenient grouping. Each
decision has at least one invariant assigned only to it:

| Decision | Exclusive witness invariants |
|---|---|
| D1 | `04`, `05`, `10`, `11`, `25`, `28`, `29`, `30`, `32`, `43` |
| D2 | `01`, `22`, `33`, `35`, `36`, `37` |
| D3 | `14` |
| D4 | `06` |
| D5 | `40`, `41` |
| D6 | `02`, `03`, `09` |
| D7 | `17`, `18`, `19`, `20` |

Removing any decision therefore leaves at least one invariant without a
coherent resolution owner. Combining decisions would reduce labels, but would
not remove a seam, implementation, or proof obligation.

The most important findings are:

1. Execution class is implicit in digests and caller-selected supervisor
   wiring. It is not a first-class admission fact.
2. `PNH-INV-29` is active, but ordinary `admitRegistryBytes` admission and
   lower-level launch functions remain available without owner pins.
3. `PNH-INV-23` is active, but a malicious subprocess descendant can leave its
   process group with `setsid`, outside the supervisor's cleanup proof.
4. The Codex provider runs as a subprocess plugin with `HOME`, so plugin code
   can reach the same ChatGPT session material that `PNH-INV-13` assigns only
   to a trusted external broker.
5. The result contract has no `ambiguous` terminal outcome, the only replay
   ledger is explicitly development-only, and the evidence chain has no
   durable append adapter. Several evidence invariants need architecture, not
   more tests around the current implementation.

The recommended dispositions account for all 46 entries:

| Disposition | Count |
|---|---:|
| Keep active | 5 |
| Reopen active status | 2 |
| Verify existing architecture | 5 |
| Build missing architecture | 21 |
| Amend binding wording | 3 |
| Defer behind a named future module | 4 |
| Resolve through a governance or release gate | 6 |

## Grounding evidence

| Finding | Repository evidence |
|---|---|
| Execution class is implicit | `pnh/registry/schema.ts:42-59` has commitment digests but no execution or trust class; `pnh/harness/sandbox/broker-gateway.mjs:474-507` takes the supervisor selection from composition wiring |
| Production pins are bypassable | `pnh/runtime/admission-ticket.ts:80` issues ordinary tickets; pinned admission is a separate interface at `pnh/runtime/pinned-admission.ts:74`; lower-level launch builders accept the ordinary ticket |
| Subprocess cleanup is not complete containment | `pnh/harness/plugin-spawn-supervisor.mjs:41-58` documents process-group containment and the `setsid` escape |
| Codex session access sits inside a provider plugin | `pnh/examples/plugins/codex-chatgpt/manifest.json:5` declares an ordinary Provider plugin; `pnh/examples/plugins/codex-chatgpt/codex-exec.mjs:9-17` requires the real `HOME`; the composition launches it through the subprocess adapter |
| Ambiguous settlement is absent | `pnh/core/result.ts:10` permits only completed, failed, and rejected outcomes |
| Durable replay and evidence adapters are absent | `pnh/adapters/memory-ledger.ts:1-4` labels the only ledger development-only; `pnh/core/evidence.ts:1-3` explicitly provides a hash chain, not retention or an append-only store |
| Host scope is not implemented | `pnh/harness/plugin-resource-arbiter.mjs` and `plugin-container-supervisor.mjs` construct state inside one supervisor process; no host daemon or cross-instance client exists |

## Retained run-kernel mechanics

The abandoned control-center run-kernel is prior art, not a code-port target.
Its reusable mechanics fit inside the seven decisions already derived. “Keep”
in this table means retain the mechanic in the architecture. It does not change
any invariant's resolution code or activation status.

| Retained mechanic | Decision owners | Prism architecture requirement | What is not copied |
|---|---|---|---|
| CAS-controlled settlement | D4 | Every run and effect transition uses a closed transition table and compare-and-set against the expected state or version. `completed`, `failed`, `rejected`, and `ambiguous` are immutable terminal outcomes. | Control-center's application states, legacy projections, and nonterminal `effect_outcome_unknown` semantics. |
| Fenced worker ownership | D2, D4 | Trusted custody renews worker leases by heartbeat. Every lease has a monotonically increasing generation, and D4 rejects transition, reservation, receipt, or settlement writes from stale generations. Expired owners are reconciled without plugin cooperation. | Plugin-originated heartbeats, fixed 30-second leases, fixed retry counts, and application-specific polling loops. |
| Durable idempotency records | D4 | A first key-and-parameter-digest pair commits; an identical pair reports replay without dispatch; the same key with a different digest reports conflict; uncertain storage fails before dispatch. | Caller-local maps and keys scoped only to one process lifetime. |
| Effect reservation followed by receipt settlement | D3, D4 | D4 durably reserves the typed effect before D3 may invoke a broker. The broker returns a receipt bound to the reservation and observed route. D4 alone commits the receipt and terminal outcome; post-dispatch uncertainty becomes `ambiguous`. | Broker-owned settlement and hardcoded adapter-pair allowlists. |
| Faultable persistence and quiesce | D2, D4, D6 | Persistence accepts typed, allowlisted records and digests rather than raw plugin payloads. Tests inject faults around claim, transition, reservation, dispatch, receipt, and evidence checkpoint seams. D1 invokes D2 quiesce; D2 closes custody admission before snapshot and drain, then reports blockers or timeout without claiming quiescence. | Regex-only secret scrubbing as the primary control and control-center-specific excluded-store names. |

Verified source locations are
`historical-control-center/src/server/run-kernel/store.ts`,
`lifecycle.ts`, `native-controller-gate.ts`, and their tests under
`tests/server/run-kernel/`. The earlier adoption brief's
`src/server/workflows/run-kernel/` path is incorrect. Prism's current
`CapabilityIntentPort.append` already records a normalized intent before
dispatch; D4 deepens that shallow append seam into durable reservation and
settlement rather than creating a parallel protocol.

## Module groups

The user-facing word “component” is represented here as a module group. A
module has one interface, an implementation behind it, and a test surface at
its seam.

| Code | Module group | Current implementation |
|---|---|---|
| GOV | Constitution and conformance | `pnh/contracts/`, constitution generator and gate |
| ADM | Registry, pins, and admission | `pnh/registry/`, `pnh/runtime/admission-ticket.ts`, pinned admission |
| AUT | Task, policy, grants, and runtime authority | `pnh/core/task.ts`, grant modules, plugin kernel, runtime entrypoints |
| EXE | Plugin protocol and execution adapters | SDK protocol, Docker launch, subprocess launch, plugin runner |
| CUS | Lifecycle custody, fault cells, and resources | gateway, broker, supervisor, fault cell, aggregate arbiter |
| PBK | Provider broker and provider adapters | broker contracts plus the current Codex provider example |
| EVD | Settlement, replay, evidence, and results | consume, evidence, result, lifecycle receipts, memory ledger |
| BRG | Foreign-capability bridges | constitution only; no implementation exists |
| REL | Consumer adapter, standalone package, and release | architecture and readiness plans; standalone surface not built |

## Resolution codes

| Code | Meaning |
|---|---|
| KEEP | Current active statement and evidence can remain |
| REOPEN | Active status should be independently reviewed because the current claim is wider than its proof |
| VERIFY | Architecture substantially exists; complete adversarial or structural proof before activation |
| BUILD | Missing architecture must land before activation |
| AMEND | Binding wording must change before implementation or activation |
| DEFER | Keep proposed behind a named future module and do not block the first public release |
| GATE | Resolve through release or governance automation rather than runtime code |

## Complete invariant matrix

The matrix assigns every invariant at least one module group and one decision.
Plugin scope names the plugin kind or actor most directly affected. “All” means
all five current plugin kinds: Policy, Memory, Tool, Provider, and Renderer.

<!-- invariant-matrix:begin -->
| ID | Status | Module groups | Plugin scope | Decisions | Resolution | Architectural requirement |
|---|---|---|---|---|---|---|
| PNH-INV-01 | proposed | CUS, EVD | All | D2 | VERIFY | Keep allocation-keyed fault cells; finish claim-appropriate interference proof and resolve the 50 ms claim under INV-38. |
| PNH-INV-02 | active | GOV, EXE, CUS | All | D6 | KEEP | Keep one plugin frame vocabulary and separately pinned lifecycle protocol; preserve both across every execution adapter. |
| PNH-INV-03 | active | GOV, EXE, CUS | All | D6 | KEEP | Retain registry-sourced parser bounds and fail-closed decoding at every plugin byte seam. |
| PNH-INV-04 | active | ADM, AUT | All | D1 | KEEP | Preserve one issued, frozen ticket as the authority root; extend it with an explicit execution binding rather than adding a second authority object. |
| PNH-INV-05 | proposed | AUT, EXE | Policy to All | D1 | VERIFY | Keep policy execution before non-Policy grant derivation and add fault injection for every denial and failure path. |
| PNH-INV-06 | proposed | EVD, CUS, PBK | All operations | D4 | BUILD | Use one closed CAS transition table and immutable terminal states so late, duplicate, and stale-generation observations cannot rewrite a committed result. |
| PNH-INV-07 | proposed | EVD, PBK | Tool, Provider, Bridge | D3, D4 | BUILD | Add an explicit ambiguous terminal outcome and use it for uncertain post-dispatch effects. |
| PNH-INV-08 | proposed | EVD, CUS, PBK | All | D3, D4 | BUILD | Define one positive-evidence matrix for response, identity, exit, OOM state, and confirmed cleanup before success. |
| PNH-INV-09 | proposed | GOV | Conformance | D6 | BUILD | Classify proof types and require production-path faults at claim, transition, reservation, dispatch, receipt, and checkpoint seams instead of registration-only coverage. |
| PNH-INV-10 | proposed | ADM, AUT, EXE, PBK | All inputs | D1 | BUILD | Route all untrusted content through typed admission and execution-class interfaces; remove ambient subprocess authority from any hostile class. |
| PNH-INV-11 | proposed | ADM, AUT, EXE | All | D1 | BUILD | Make the admitted run the only production composition root; trusted subprocesses must be a separate class because they retain ambient host authority. |
| PNH-INV-12 | proposed | AUT, EXE, BRG | All | D1, D5 | BUILD | Enforce monotonic grants at the kernel and prevent execution adapters or bridges from creating side-channel authority. |
| PNH-INV-13 | proposed | PBK, EXE, BRG | Provider, Bridge | D3, D5 | BUILD | Move credential and session use out of ordinary plugins; the Codex CLI invocation belongs behind a trusted broker seam. |
| PNH-INV-14 | proposed | PBK, EVD | Provider | D3 | BUILD | Bind exact provider, route, and resolved model in broker authorization and receipt; subscription defaults must report the actual resolved model. |
| PNH-INV-15 | proposed | PBK, EVD | Provider | D3, D4 | BUILD | Normalize broker telemetry through one adapter contract; unsupported values stay null and are never inferred. |
| PNH-INV-16 | proposed | EVD, PBK, REL | All | D3, D4 | BUILD | Add a durable evidence append adapter for typed, allowlisted records and digests; append or checkpoint failure must fail closed without persisting raw plugin payloads. |
| PNH-INV-17 | proposed | AUT, REL | Consumer control plane | D7 | GATE | Define publication as a separate owner-authorized release workflow; no runtime or plugin interface receives publication capability. |
| PNH-INV-18 | active | GOV, REL | Public core | D7 | KEEP | Preserve the current core import-closure gate and extend standalone package checks without weakening the existing core seam. |
| PNH-INV-19 | proposed | REL, GOV | Consumer adapter | D7 | GATE | Build the standalone public contract package and statically reject consumer imports of private implementation modules. |
| PNH-INV-20 | proposed | REL, GOV | Release | D7 | GATE | Enforce export allowlists, history secret scanning, license inventory, SBOM, provenance, and private-material exclusions. |
| PNH-INV-21 | proposed | CUS, EVD, BRG | All | D2, D4, D5 | VERIFY | Derive allocation and foreign-call identity outside plugin bytes and bind it with the current ownership generation through custody, settlement, and evidence records. |
| PNH-INV-22 | active | CUS, EVD | All | D2 | KEEP | Keep allocation-scoped queues, timers, accounting, cleanup, and evidence; re-run the proof for every admitted execution class. |
| PNH-INV-23 | active | CUS, EXE, EVD | All | D2, D4 | REOPEN | Docker cleanup is evidenced, but subprocess `setsid` escape defeats universal confirmed absence; scope the claim by execution class or add stronger custody. |
| PNH-INV-24 | proposed | GOV, CUS | Architecture control plane | D2, D6 | GATE | Make the physical-split trigger a required architecture review with defeated-control and smaller-correction evidence. |
| PNH-INV-25 | proposed | ADM, EXE | All execution classes | D1 | AMEND | Replace the universal container claim with a rule that hostile code requires an isolation class; trusted subprocess is not that class. |
| PNH-INV-26 | proposed | GOV, EXE, REL | All | D1, D2, D6, D7 | BUILD | Keep fault cells explicitly non-security; bind public labels and evidence to the actual execution class. |
| PNH-INV-27 | proposed | ADM, EXE, CUS | All | D1, D2 | AMEND | Replace the container-only designation with ticket-bound, execution-class-specific trust and lifecycle seams. |
| PNH-INV-28 | proposed | ADM, AUT, REL | Consumer adapter | D1 | BUILD | Freeze contract meaning in the admitted run and permit adapters to translate data without rewriting authority semantics. |
| PNH-INV-29 | active | ADM, EXE | All | D1 | REOPEN | Owner-pinned admission exists, but ordinary admission and lower-level launch paths can bypass it; one production entrypoint must make pins mandatory. |
| PNH-INV-30 | proposed | AUT, EXE | All | D1 | BUILD | Remove install, scheduling, and completion authority from plugin interfaces; trusted subprocess ambient authority must not count as production capability. |
| PNH-INV-31 | proposed | ADM, EXE, CUS, PBK, EVD, BRG | All, especially Provider and Bridge | D1, D2, D3, D4, D5 | BUILD | Bind route and identity above plugin bytes, require durable effect reservation before broker dispatch, and reject direct network or endpoint authority in any hostile execution class. |
| PNH-INV-32 | proposed | AUT | Runtime | D1 | BUILD | Introduce one admitted-run ownership state so a second task cannot enter the same harness instance. |
| PNH-INV-33 | proposed | CUS | All | D2 | BUILD | Implement one host-shared lifecycle principal with per-instance identity, fenced worker generations, and trusted heartbeats, or amend the host-scope claim before release. |
| PNH-INV-34 | proposed | CUS, ADM, EXE | All | D1, D2 | VERIFY | Keep lifecycle commands ticket-resolved and closed-shape; bind ownership generation outside plugin bytes and prove payload, identity, and raw-runtime-argument injection cannot cross the seam. |
| PNH-INV-35 | proposed | CUS | All | D2 | BUILD | Move aggregate arbitration to the host-shared custody module, or amend the host-scope claim before release. |
| PNH-INV-36 | proposed | CUS | All | D2 | VERIFY | Retain per-plugin fair-share ceilings and prove all legal reservation patterns cannot starve unrelated work. |
| PNH-INV-37 | proposed | CUS | All | D2 | BUILD | Replace cleanup-only release with separate worker-ownership and capacity leases, renewed by trusted custody heartbeats, generation-fenced, and reconciled after owner death or wedge. |
| PNH-INV-38 | proposed | CUS, GOV | All | D2, D6 | AMEND | Either add a controlled performance qualification for the universal 50 ms bound or replace it with a deterministic progress bound. |
| PNH-INV-39 | proposed | GOV, ADM, EXE, CUS, BRG | All | D1, D2, D5, D6 | DEFER | Preserve the pinned cell protocol now; activation waits for an actual out-of-process cell adapter and semantic-compatibility proof. |
| PNH-INV-40 | proposed | BRG, ADM, EXE | Bridge | D5 | DEFER | Implement only when bridges enter scope; local packaged bridges use the isolated container class and ordinary owner-pinned admission. |
| PNH-INV-41 | proposed | BRG, ADM | Bridge | D5 | DEFER | Add an admitted foreign-surface manifest with method-family and schema hashes; unknown methods fail closed. |
| PNH-INV-42 | proposed | BRG, EVD, PBK | Bridge | D4, D5 | DEFER | Put dispatch comparison and evidence in a trusted mediator outside the bridge; post-dispatch drift settles ambiguous. |
| PNH-INV-43 | proposed | ADM, EXE, GOV | Unreviewed and development plugins | D1 | BUILD | Make hostile, trusted, and development classes explicit; development runs cannot produce production evidence or privileged effects. |
| PNH-INV-44 | proposed | GOV, REL | Constitution and public docs | D6, D7 | GATE | Generate normative claims from the registry and add a conflict/lint gate for hand-written public prose. |
| PNH-INV-45 | proposed | EVD, PBK, CUS, BRG | All authenticated paths | D3, D4, D5 | BUILD | Use durable idempotency records plus per-channel replay identifiers; exact replay never dispatches, parameter conflict fails closed, and replayed responses or receipts never settle work. |
| PNH-INV-46 | proposed | GOV, CUS | Architecture control plane | D2, D6 | GATE | Require a structured escalation record covering the defeated control, channels, keys, receipts, and lifecycle authority. |
<!-- invariant-matrix:end -->

## D1: Production admission and execution classes

### Decision

Create one production composition-root module that owns registry admission,
task admission, policy-first grant derivation, one-task ownership, plugin-set
identity, and execution-class selection. The admitted ticket remains the single
authority object. It gains a closed execution binding rather than a caller
supplying an executor later.

The initial execution classes should be:

- `container-isolated-v1`: may execute code treated as hostile.
- `trusted-subprocess-v1`: may execute only owner-approved, self-contained
  local artifacts and makes no runtime sandbox claim.
- `development-v1`: cannot produce production evidence or invoke privileged
  effects.

The executor adapter is derived from the ticket. A caller cannot route an
admitted plugin through a weaker class. Ordinary unpinned admission remains a
test/development mechanism, not a production entrypoint.

### Plain-language explanation

Think of admission as the front desk for a secure university lab. Before
anyone enters, the front desk checks who they are, what project they are
working on, which equipment they may use, and which safety rules apply. It
then issues one badge containing that complete decision. Someone inside the
lab cannot replace the badge with a more permissive one.

Prism's admission ticket serves the same purpose. It identifies the exact task,
plugins, permissions, and execution class that were approved. The execution
class says how much isolation the code needs. Untrusted code goes into a
container, reviewed local code may use a trusted subprocess, and development
code cannot produce production evidence or use privileged effects. Keeping
all of this in one deep module prevents every caller from rebuilding the
security decision differently.

### Why this is one decision

Registry identity, policy ordering, grants, execution mode, and one-task scope
all answer the same question: “What exactly was admitted to run, under what
authority?” Splitting them leaves callers responsible for recombining security
facts correctly. A deep production admission module provides leverage by
hiding that sequence behind one interface and improves locality because every
production caller gets the same ordering and downgrade checks.

### Direct invariant cover

`04`, `05`, `10`, `11`, `12`, `25`, `26`, `27`, `28`, `29`, `30`, `31`,
`32`, `34`, `39`, `43`.

### Required proof

- Unpinned and development tickets cannot enter a production run.
- Execution-class substitution fails before launch.
- Every Policy failure occurs before non-Policy grant derivation.
- A second task cannot enter an active run.
- Plugins cannot add participants, widen grants, install, schedule, or approve
  completion through a production interface.
- Trusted-subprocess evidence and disclosure state that ambient host authority
  exists.

## D2: Host custody, fault isolation, and resource leases

### Decision

Choose whether the constitution's host scope is real. The complete architecture
is one host-shared custody daemon with two deep internal modules: lifecycle
custody and payload-blind resource arbitration. Harness instances are clients
identified on every command. Fault cells remain logical partitions unless the
recorded physical-split trigger fires.

Worker ownership and capacity reservations become distinct renewable lease
types. Trusted custody clients heartbeat on behalf of work; plugins cannot
renew their own authority. Every ownership lease has a monotonically
increasing generation. The custody module reclaims expired owners and capacity
after death or wedge, while the settlement module rejects every stale-generation
transition or receipt. This separates liveness from outcome authority without
making callers coordinate the two rules themselves.

The custody daemon also owns the quiesce-and-drain implementation behind its
interface. D1 invokes that interface; D2 atomically closes custody admission
before it snapshots active and ambiguous work, waits for bounded drain, and
reports blockers or timeout without claiming success. This does not create a
second admission authority. Execution adapters report only the cleanup
guarantee they can actually prove.

The smaller alternative is to amend `PNH-INV-33` and `35` to supervisor scope.
That is honest but gives no protection against several Prism processes each
assuming the full host budget. It is not the recommended open-source
architecture.

### Plain-language explanation

A MacBook has one real pool of CPU, memory, processes, and Docker capacity,
even if several Prism processes are running. If each process keeps its own
private count, they may all believe capacity is available and overload the
same laptop. D2 creates one host-level custodian that keeps the authoritative
count for everyone.

Work and capacity are checked out through leases. A lease is temporary
ownership that must be renewed with a heartbeat. Its generation number works
like a version number. If worker 1 disappears and worker 2 takes over, worker
1's old generation can no longer finish the task or submit a receipt. Quiesce
is the controlled shutdown procedure: stop accepting new custody, record what
is still active, wait for it to drain, and report honestly if anything remains.

### Direct invariant cover

`01`, `21`, `22`, `23`, `24`, `26`, `27`, `31`, `33`, `34`, `35`, `36`,
`37`, `38`, `39`, `46`.

### Required proof

- Two harness instances share one lifecycle writer and one aggregate budget.
- Per-instance and per-plugin quotas prevent legal starvation.
- Owner death and wedge expire both ownership and capacity leases.
- A stale generation cannot heartbeat, reserve an effect, commit a receipt, or
  settle a run after ownership is reassigned.
- Forged identity, malformed frames, CPU pressure, and memory pressure remain
  allocation-scoped.
- Quiesce closes custody admission before its snapshot and cannot acknowledge
  while active work, ambiguous effects, or named blockers remain.
- Cleanup evidence cannot claim more than the execution adapter can observe.
- The physical-split review gate rejects a proposal missing any required
  evidence.

## D3: Trusted provider brokers and exact routing

### Decision

Keep provider plugins credential-free. A provider plugin may validate or
normalize provider-shaped data, but a trusted external broker adapter owns
credentials, subscription sessions, endpoints, native CLI invocation, and
resolved model identity.

The current Codex example should move `codex exec` into a trusted local broker
adapter. The ordinary plugin must not inherit the real `HOME` used by the Codex
login. D4 must durably reserve a typed effect before this module can dispatch.
The broker receives the reservation identity with one task-scoped request and
returns an exact receipt bound to that reservation, provider, route, resolved
model, normalized telemetry, and dispatch state. No aliases or fallback occur
after admission. The broker reports observations; it never settles the run.

### Plain-language explanation

A provider plugin should not carry the master key to a Claude, Codex, or other
provider account. Instead, it prepares a tightly scoped request and hands it
to a trusted broker. The broker is the small piece of Prism allowed to hold
login sessions, credentials, provider endpoints, and native command-line
access.

Before the broker acts, D4 records exactly what effect was authorized. The
broker then performs that effect and returns a receipt saying which provider,
route, and model were actually used. This is similar to a purchasing office:
the department describes an approved purchase, the office uses the payment
account, and the office returns a receipt. The broker reports what happened,
but the settlement module decides whether the overall run completed, failed,
was rejected, or became ambiguous.

### Why this is separate from D1

Provider transport is a true external dependency with credentials and
post-dispatch uncertainty. Its seam and error modes are different from plugin
admission. Keeping it behind a broker interface lets a local Codex adapter, a
mock adapter, and future provider adapters share one authorization and receipt
contract without exposing native provider details to the runtime.

### Direct invariant cover

`07`, `08`, `13`, `14`, `15`, `16`, `31`, `45`.

### Required proof

- Plugin, worker, runtime, and core processes cannot read broker credentials or
  choose broker endpoints.
- Mock and live Codex adapters produce the same normalized receipt shape.
- No broker invocation occurs without a committed effect reservation.
- Every broker receipt binds the reservation identity and admitted route.
- Alias, fallback, substitution, and unresolved model identity fail closed.
- Unsupported telemetry remains null.
- A delivery failure after dispatch returns an ambiguous state, not a retryable
  ordinary failure.

## D4: Settlement, replay, and durable evidence

### Decision

Create one deep settlement module for every effectful operation. It owns a
closed transition table from admitted intent through reservation and dispatch
to exactly one terminal record. Every transition is a compare-and-set against
the expected state and current ownership generation. The terminal vocabulary
includes `completed`, `failed`, `rejected`, and `ambiguous`; every terminal is
immutable.

The settlement module turns the current intent append into a reservation
protocol. A first idempotency key and canonical parameter digest commits. An
identical pair reports replay without dispatch. Reusing the key with a
different digest reports conflict. Unknown durable-store outcomes fail before
dispatch. For effectful work, a committed reservation must exist before the
broker adapter is called, and its receipt is committed afterward. Dispatch
without a trustworthy receipt settles `ambiguous`.

Back it with two local-substitutable seams:

- A durable compare-and-set settlement ledger covering idempotency, ownership
  generation, state transitions, effect reservations, and receipt commitment.
  The current memory ledger remains a test/development adapter.
- A durable append and checkpoint store for evidence. The current pure hash
  chain remains the deterministic implementation behind that store.

Lifecycle receipts, broker receipts, and plugin output become observations fed
into settlement. They do not settle work independently. Persisted records are
typed, closed-shape metadata and digests; raw plugin input, output, prompts,
credentials, paths, and provider payloads are excluded by construction. Secret
scanning remains defense in depth rather than the primary persistence control.

### Plain-language explanation

D4 is the authoritative record of what happened to a task. It works like the
transaction system behind an online order. The order may move from approved,
to reserved, to dispatched, and finally to a terminal outcome. A closed
transition table means only listed moves are legal. Compare-and-set means an
update succeeds only if the record is still in the state and ownership
generation the caller expected.

Idempotency protects against double clicks and retries. Repeating the same key
with the same parameters returns the existing record and does not dispatch the
effect again. Reusing the key with different parameters is a conflict. Once a
run reaches `completed`, `failed`, `rejected`, or `ambiguous`, later messages
cannot rewrite history. `Ambiguous` matters because sometimes Prism knows a
request left the machine but cannot prove whether the provider completed it.
Calling that an ordinary failure could cause an unsafe automatic retry.

### Direct invariant cover

`06`, `07`, `08`, `15`, `16`, `21`, `23`, `31`, `42`, `45`.

### Required proof

- Invalid transitions, duplicate and late observations, and stale ownership
  generations cannot change a terminal record.
- Every missing positive-evidence element prevents success.
- Exact replay, parameter conflict, and ambiguous storage failure never
  dispatch work.
- A broker cannot be called before durable effect reservation, and a receipt
  cannot commit against another reservation or ownership generation.
- Evidence append and checkpoint failures fail closed.
- Post-dispatch transport loss settles ambiguous.
- Raw plugin or provider payload fields fail typed persistence before append.
- Tests run against both in-memory and durable local adapters at the settlement
  interface.

## D5: Foreign-capability bridge architecture

### Decision

Keep bridge support outside the first public-release critical path unless an
actual MCP consumer requires it. When implemented, a local bridge is an
ordinary owner-pinned plugin in the isolated container class. The foreign
server is packaged into that artifact, receives no credential, and cannot
choose its own route.

Admission records a frozen foreign surface across every supported method
family with schema hashes. A trusted mediator outside the bridge compares every
dispatch to that surface and writes the evidence. Remote credentialed servers
do not fit this class; they require a brokered remote-bridge class and a later
constitutional amendment.

### Plain-language explanation

A bridge translates between Prism and another protocol, such as MCP.
Translation creates risk because the foreign system may expose methods or data
shapes that Prism never reviewed. D5 requires Prism to record the exact foreign
methods and schemas allowed at admission time. A trusted mediator checks every
later call against that frozen list.

For a local bridge, the foreign server is packaged with the plugin and runs in
the isolated container class. It does not receive credentials or decide where
requests go. A remote server with credentials is a different security problem,
so it cannot be quietly treated like the local case. Bridge support is deferred
from the first public release because there is no reason to build and secure
this interface until a real consumer needs it.

### Direct invariant cover

`12`, `13`, `21`, `31`, `39`, `40`, `41`, `42`, `45`.

### Required proof

- Unlisted families, methods, and schema changes fail before dispatch.
- The bridge cannot forge its own method evidence.
- Post-dispatch surface drift settles ambiguous.
- Bridge artifact, foreign server, and admitted surface identities move
  together.
- No bridge receives provider or publisher credentials.

## D6: Constitutional proof and claim governance

### Decision

Add a claim-appropriate enforcement kind to each invariant. The minimum closed
set is:

- runtime adversarial;
- static structure;
- generated-document consistency;
- controlled performance qualification; and
- release or architecture process gate.

Runtime safety claims still require production-path fault injection and a test
that fails when the control is disabled. Settlement and custody tests inject
faults immediately before and after claim, transition, heartbeat, effect
reservation, broker dispatch, receipt commit, evidence append, checkpoint, and
quiesce snapshot seams. A static dependency claim requires a fail-closed graph
check. A release claim requires a reproducible release gate. This avoids
pretending that a documentation-conflict rule or an architecture review
template can be proven by the same test shape as a parser bound.

Activation requires the appropriate executable proof plus independent review.
The constitution generator renders the enforcement kind and evidence. Public
prose that makes a stronger claim than the registry fails a documentation gate.

### Plain-language explanation

The constitution is Prism's list of engineering promises. D6 says each promise
must be backed by the kind of proof that actually matches it. A parser limit
needs an executable test with oversized input. A security claim needs an
adversarial test that disables or breaks the control. An import rule needs a
static graph check. A release-process promise needs a release gate.

This prevents a common problem in software projects: a team writes a test that
touches a feature, sees the test pass, and declares a much larger claim proven.
Under D6, an invariant becomes active only when its specific enforcement kind,
evidence, and independent review are present. Public documentation is checked
against the same registry, so marketing language cannot promise stronger
security than the implementation has demonstrated.

### Direct invariant cover

`02`, `03`, `09`, `24`, `26`, `38`, `39`, `44`, `46`. This decision also
governs activation evidence for every other invariant.

### Required proof

- Registration-only tests cannot activate runtime claims.
- Every dangerous persistence or dispatch seam has a deterministic fault point
  whose test proves rollback, fencing, or ambiguous settlement.
- Every active invariant has an enforcement kind and executable evidence.
- Narrative conflict, stale generated text, and protocol drift fail the gate.
- Performance claims name the environment and statistical qualification used.
- Architecture escalation cannot close without a complete structured record.

## D7: Standalone package and release authority

### Decision

Make the private standalone repository the canonical package before any public
release. It owns its package manifest, lockfile, TypeScript configuration,
constitution, decision records, test commands, supported CLI, license,
third-party notices, SBOM, provenance, and least-privilege CI.

Consumer adapters import only a public contract package. A static graph gate
rejects imports of implementation modules. The export allowlist excludes
consumer policy, credentials, private endpoints, private evidence, production
repository data, and artifacts without redistribution rights.

Publication is a separate owner-authorized workflow. Passing tests or producing
an artifact never grants publication authority.

### Plain-language explanation

D7 turns Prism from code living inside another private project into a product
that an outside engineer can inspect and install. The standalone repository
must contain everything required to understand, build, test, and legally
redistribute it. That includes the package manifest, locked dependencies,
documentation, license, third-party notices, software bill of materials,
provenance, and CI checks.

The clean-checkout test is the practical standard. A developer should be able
to clone the repository onto a Mac, follow the supported quickstart, and run
both a local example and mocked provider tests without relying on Caleb's
private environment. Publishing remains a separate owner action. A passing
test suite can prove that an artifact is ready, but it cannot decide that Vora
Technologies, LLC has authorized a public release.

### Direct invariant cover

`17`, `18`, `19`, `20`, `26`, `44`.

### Required proof

- A clean Mac checkout installs and runs supported local and mocked-provider
  quickstarts.
- Consumer adapter imports pass only through public contracts.
- Secret, license, SBOM, provenance, and export-allowlist gates run in CI.
- Public docs and CLI output disclose the selected execution class.
- Publication requires an explicit owner-controlled action and cannot be
  triggered by plugin, model, repository content, or ordinary CI success.

## Decision dependency order

The implementation order is:

```text
D6 proof model
      |
      v
D1 admitted run and execution classes
      |
      +-------------------+
      v                   v
D2 host custody       D4 settlement and evidence
      |                   |
      +---------+---------+
                v
        D3 provider brokers
                |
                v
        D5 bridges, if included

D7 release gates depend on D1-D4 and D6.
D5 is a release dependency only if bridge support ships initially.
```

D6 comes first because it defines what evidence can close each later decision.
D1 comes next because identity, authority, and executor trust class must be
fixed before custody or settlement can record them. D2 and D4 can proceed in
parallel after D1. D3 consumes the settlement contract. D5 consumes admission,
broker, settlement, and protocol contracts. D7 packages only decisions that
have already closed.

## Active invariants requiring owner attention

### PNH-INV-29

The active statement says every admitted plugin set is owner-approved. The code
still exports ordinary `admitRegistryBytes`, generic admitted launch builders,
and programmatic executor selection. The supported examples use the pinned
path, but the invariant is universal. Either make the production composition
root technically unavoidable or narrow the statement before public release.

### PNH-INV-23

The active statement promises a confirmed cleanup path for every allocation.
The subprocess supervisor explicitly documents that a descendant can call
`setsid`, escape the tracked process group, and become invisible. Either scope
confirmed absence by execution class, prohibit this executor from claims that
require hostile-code cleanup, or add a real containment substrate.

### PNH-INV-22

The allocation-scoped fault-cell claim can remain active, but its proof must be
re-run after execution classes become explicit. Its current evidence should not
silently imply that logical fault-cell cleanup is a security guarantee for a
trusted subprocess.

## Owner decisions still required

1. Ratify explicit execution classes, beginning with
   `container-isolated-v1`, `trusted-subprocess-v1`, and `development-v1`.
2. Choose the recommended host-shared custody daemon, or amend `PNH-INV-33`
   and `35` to supervisor scope.
3. Ratify provider integrations as credential-free plugins plus trusted broker
   adapters; move Codex CLI and ChatGPT session access behind that seam.
4. Choose whether `PNH-INV-38` keeps a qualified 50 ms performance promise or
   changes to a deterministic progress bound.
5. Defer bridges from the first public release unless a concrete consumer
   requires them.

## Recommended next program

Do not implement all seven decisions in one branch. The first program should
cover D6 and D1 together: establish the proof taxonomy, create the explicit
execution binding, make owner-pinned admission mandatory for production, and
correct `PNH-INV-25`, `27`, `29`, and `43`. That program creates the identity
and evidence vocabulary every later module needs.

After D1 closes, D2 and D4 are independent enough to plan and execute in
parallel. D3 follows their shared contracts. D5 remains deferred unless the
owner pulls bridge support into the first release. D7 closes the program by
moving the verified modules into the canonical standalone package and proving
the release from a clean Mac checkout.
