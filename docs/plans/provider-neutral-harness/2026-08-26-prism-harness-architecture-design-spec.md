# Prism Harness architecture design specification

Date: 2026-08-26

Status: ratification draft. This document designs the target architecture and
the implementation-plan sequence. It does not authorize implementation,
installation, repository creation, publication, or a live provider call.

Product: Prism Harness by Vora Technologies, LLC. PNH remains an internal code
namespace. It is not the name of an earlier product generation.

## 1. Purpose

This specification turns the seven decisions in
`2026-08-26-invariant-module-architecture-matrix.md` into one coherent target
design. It defines the modules, interfaces, authority flow, state machines,
persistence rules, protocols, migration sequence, and proof gates needed before
implementation plans can be written.

The target audience is professional developers and software engineers. The
quality bar is therefore higher than “the example runs.” A supported Prism
installation must have inspectable authority, deterministic failure behavior,
typed interfaces, reproducible tests, explicit trust labels, durable evidence,
and a clean public package.

This is an umbrella specification. Each implementation plan will own a bounded
slice of it. No plan may silently reinterpret another plan's interface or claim
that partial integration satisfies a program-level invariant.

## 2. Source of truth and precedence

When sources disagree, use this order:

1. Runtime, developer, and owner authority.
2. `pnh/contracts/invariants.yaml` and its lock.
3. `constitution.md`, with generated registry text binding over narrative.
4. `2026-08-26-invariant-module-architecture-matrix.md`.
5. This specification after owner ratification.
6. Current implementation, which may be incomplete or contradict a proposed
   invariant.
7. Historical plans and `architecture.md`, which is explicitly superseded.

The current code grounds migration facts. It does not override the target
architecture merely because an older interface is already exported.

## 3. Executive design

Prism will expose one production entrypoint that accepts an authorized task and
an owner-approved static plugin set. That entrypoint issues one opaque admitted
run. The admitted run binds every plugin to an execution class, artifact
identity, capability grant, route, and evidence identity.

All production harness instances on a host use one host custody daemon. The
daemon is the sole lifecycle writer and hosts deep custody, resource, settlement,
and evidence modules behind a versioned local protocol. A single durable local
database lets lease generation, effect reservation, terminal settlement, and
evidence checkpoint updates share transaction discipline.

The installed daemon runs under a dedicated machine service principal. Every
local user enters a separate owner domain derived from operating-system peer
credentials and an explicit daemon ACL. User-scoped provider brokers retain the
user's provider session, while production subprocesses run under restricted
execution principals that cannot read user homes, broker channels, daemon
operator channels, or publisher authority.

Plugins remain credential-free. An effect is durably reserved before a trusted
provider broker may act. The broker returns an exact observation receipt. The
settlement module alone decides whether the run completed, failed, was rejected,
or became ambiguous.

Constitutional proof is matched to the claim being made. Runtime claims require
production-path adversarial tests. Static claims require fail-closed structural
checks. Release claims require reproducible release gates. The private standalone
repository becomes canonical only after D1 through D4 and D6 are complete.

Bridge support remains outside the first public-release critical path unless a
real consumer requires it.

## 4. Ratification posture

This specification uses the recommended architecture so the design is coherent.
The following directions are already treated as fixed requirements from the
owner's prior instructions:

- Prism Harness is the only Prism harness product. PNH is internal vocabulary.
- Vora Technologies, LLC is the product owner and intended repository owner.
- The first cloud-provider proof is Codex using an existing ChatGPT login.
- CI uses deterministic mocks. One opt-in live acceptance test runs only on a
  trusted Mac with an existing Codex login.
- The canonical repository is proven private and open-source-ready before any
  public release.
- Publication always requires a separate owner action.

Six choices still require explicit ratification before implementation-plan
authoring begins:

1. Accept the three initial execution classes exactly as specified in D1.
2. Build the recommended host-shared custody daemon instead of narrowing the
   host-scoped invariants to one supervisor.
3. Replace the universal 50 ms cross-plugin promise with a deterministic
   bounded-progress rule unless a controlled performance qualification is
   separately approved.
4. Defer D5 bridge implementation from the first public release.
5. Use Apache-2.0 for the standalone repository, with copyright held by Vora
   Technologies, LLC. This is the recommendation because its explicit patent
   grant is appropriate for a company-backed developer infrastructure project.
6. Use the complete local OS authority model in D2: one machine service
   principal, explicit per-user owner domains and roles, user-scoped broker
   agents, and separate restricted execution principals for production
   subprocesses. No production plugin runs with the admitting user's ambient
   host authority.

Changing one of these choices requires an amendment to this specification
before the affected implementation plan is drafted.

## 5. Scope

The target design covers:

- owner-pinned registry and task admission;
- explicit execution classes and executor selection;
- one-task ownership;
- host-shared lifecycle custody and aggregate resources;
- renewable worker and capacity leases;
- durable settlement, idempotency, effect reservations, receipts, and evidence;
- credential-free provider plugins and trusted provider brokers;
- Codex mock and live broker adapters;
- claim-appropriate constitutional proof;
- an optional future local foreign-capability bridge;
- a supported CLI, local quickstart, clean-checkout verification, CI, licensing,
  provenance, and release authority; and
- migration from the current `pnh/` tree to a private canonical standalone
  repository.

## 6. Non-goals

This design does not add:

- multi-task scheduling inside the harness;
- model-directed plugin installation or provider fallback;
- a public plugin marketplace;
- remote credentialed MCP admission in the local bridge class;
- a microVM or WASM execution class in the first release;
- automatic retry of ambiguous effects;
- provider credentials inside plugins or the generic runtime;
- raw prompt or provider payload retention in the settlement ledger;
- an automatic public release after CI passes; or
- compatibility aliases for unsafe production entrypoints.

The consumer control plane may run several harness instances. Each instance
still owns exactly one admitted task, and all instances share host custody.

## 7. Architecture vocabulary

| Term | Meaning |
|---|---|
| Admitted run | The single opaque authority object issued by production admission for one task and one fixed plugin set. |
| Execution binding | The owner-approved mapping from a plugin identity to one execution class and committed launch artifacts. |
| Execution class | A closed trust and isolation category that determines which executor adapter production may use. |
| Owner domain | One daemon-authorized local user's tasks, trust roots, evidence visibility, operator role, and broker delegations. |
| Policy evaluation | A durable, Policy-only pre-admission phase with bound execution and custody but no non-Policy or production-run authority. |
| Harness instance | One consumer-owned process handling one admitted run. It is a client of host custody. |
| Host custody | The one host-scoped lifecycle principal that owns liveness, cleanup, capacity, quiesce, and allocation evidence. |
| Daemon epoch | A durable leadership generation that fences leases and lifecycle confirmations from a replaced daemon. |
| Ownership lease | Renewable permission for one harness instance to act for a run at one monotonically increasing generation. |
| Capacity lease | Renewable reservation of payload-blind host resources for one allocation. |
| Settlement | The authoritative state transition from admitted intent to one immutable terminal outcome. |
| Effect reservation | A durable record that must commit before an external or privileged effect may be dispatched. |
| Dispatch permit | A D4-issued broker capability that confers provider-call authority only after one durable atomic consumption. |
| Broker observation | A typed receipt describing what a trusted provider broker observed. It is input to settlement, not authority to settle. |
| Evidence checkpoint | The durable chain length and final hash bound to a settled run. |
| Production proof | Executable evidence that exercises the production constructor and failure path named by an invariant. |

## 8. Design principles

### 8.1 One authority root

The admitted run is the only production authority root. Registry data, pin
records, executor choices, configuration, ambient process state, and prior runs
cannot independently confer authority.

A Policy evaluation receives only an internal, non-runnable capability to
execute the owner-bound Policy set. It cannot launch non-Policy plugins, reserve
provider effects, produce a completed production result, or survive promotion
as a second authority object.

### 8.2 Deep modules at dangerous seams

Admission, custody, settlement, and provider brokering hide ordering and
failure rules behind small interfaces. Callers do not manually coordinate pin
checks, lease generations, reservations, receipts, evidence, or terminal-state
guards.

### 8.3 One writer for coupled host state

Custody and settlement are separate modules, but their production adapters run
under one host daemon and one transactional database writer. This avoids a
time-of-check/time-of-use gap between “this generation is current” and “this
generation committed a receipt.”

### 8.4 Plugins never report their own authority

Plugin output is untrusted data. Plugin identity, grants, allocation identity,
execution class, route, cleanup, and broker observations come from trusted
modules outside plugin bytes.

### 8.5 Honest uncertainty

After dispatch, missing proof is not an ordinary failure. Prism records
`ambiguous` and refuses automatic retry. This is safer than guessing that an
external effect did not happen.

### 8.6 Two real adapters at every persistence seam

The settlement and evidence interfaces each have an in-memory adapter for
tests and a durable local adapter for production. Tests run against both. The
in-memory adapter is never production-conforming.

### 8.7 No runtime compatibility path that weakens production

Migration may retain old functions for tests temporarily, but the supported
production entrypoint cannot accept an ordinary ticket, caller-selected
executor, unpinned plugin, development run, or direct broker handle.

## 9. Target topology

```text
authorized OS peer + owner trust root
                 |
                 v
      D1 production admission
                 |
       Policy-only binding
                 v
+---------------------------------------------------------------+
| dedicated machine service principal                           |
| one epoch-fenced host custody daemon                           |
|                                                               |
| D2 Policy custody -> D4 policy-evaluating -> pending-ack       |
| D2 ownership/resource modules <-> D4 settlement/evidence       |
| one transactional durable database, partitioned by ownerDomain |
+--------------------------+------------------------------------+
                           |
                  acknowledged admitted run
                           |
          D1-selected execution principal and adapter
                           |
       container-isolated | restricted-subprocess | development
                           |
                    credential-free plugin
                           |
                  D4 effect reservation
                           |
              permit issue -> atomic consumption
                           |
           per-user D3 broker agent and principal
                           |
                    Codex | future providers
```

D6 governs proof for every arrow and module. D7 governs packaging and release.
D5 adds a trusted foreign-protocol mediator only when bridge support is brought
into scope.

## 10. Trust zones and authority

| Zone | Trusted for | Never trusted for |
|---|---|---|
| Privileged installer | Creating and removing declared service principals, ACLs, and launchd registrations after explicit owner approval | Plugin installation, task authority, provider credentials, release approval |
| Owner domain and consumer control plane | Task issuance, trust-root selection, broker delegation, owner-scoped operations, publication approval | Other owner domains, replacing proof with configuration, bypassing production admission |
| Production admission module | Registry, pin, task, grant, route, and execution-binding validation | Scheduling multiple tasks or choosing provider fallback |
| Harness instance | Driving one admitted run and relaying typed commands | Credentials, lifecycle truth, terminal settlement, publication |
| Host custody service principal | Lifecycle, daemon epoch, lease generation, capacity, settlement writes, evidence checkpoint custody, owner-domain enforcement | User homes or sessions, interpreting plugin payload meaning, expanding grants |
| Restricted subprocess principal | Running one owner-bound reviewed artifact through its class adapter | User homes, broker or operator channels, provider sessions, publication authority, hostile-code sandbox claims |
| Plugin | Returning typed behavior within its grant | Identity, route selection, credentials, endpoint choice, settlement, installation, ambient user authority |
| Per-user provider broker principal | Owner-delegated credential use, provider transport, exact observed receipt | Other owner domains, creating grants, changing routes, fallback, terminal settlement |
| External provider | Returning provider output | Prism authority, cleanup truth, evidence completeness |

Repository content, prompts, source, model output, tool output, test fixtures,
and plugin output are untrusted in every zone.

## 11. Module map and dependency law

| Decision | Deep module or release surface | Production adapter | Test adapter |
|---|---|---|---|
| D1 | Production admission | Filesystem trust-root and registry reader | In-memory bytes and pins |
| D2 | Host custody and resource arbitration | Dedicated service-principal daemon over an authenticated and authorized local channel | In-process daemon fixture with fake clock, epoch, and owner domains |
| D3 | Provider broker | Per-user Codex broker agent using the existing ChatGPT login | Deterministic non-production-principal mock broker |
| D4 | Settlement and evidence | Transactional durable local database | In-memory settlement and evidence stores |
| D5 | Foreign-capability mediator | Deferred local packaged bridge | Frozen-surface fixture |
| D6 | Constitution and proof governance | CI and release gates | Controlled broken-control fixtures |
| D7 | Standalone package and release | Private canonical repository and owner release workflow | Clean temporary checkout |

Dependencies point toward public contracts and narrow ports:

```text
public contracts and ports
   +-- D1 production composition root
   |     uses HostActivation, HostCustody, Settlement, and ExecutionAdapter ports
   +-- D2 custody and resource adapters
   |     implement HostCustody ports
   +-- D4 settlement and evidence adapters
   |     implement activation, Settlement, DispatchClaim, and PermitConsumption ports
   +-- D3 provider broker adapters
   |     implement ProviderBroker and use DispatchClaim and PermitConsumption
   +-- D5 bridge mediator, if built
   +-- D6 conformance tooling

host-daemon composition
   +-- joins D2 and D4 behind one internal transaction coordinator

D7 packages public contracts and verified implementations. Consumer adapters
depend only on public contracts and supported entrypoints.
```

D2 and D4 share a production process and transaction substrate, not each
other's public interface. Their integration uses an internal transaction
context hidden inside the host daemon implementation.

## 12. Common identity model

Every production record uses identities derived outside plugin bytes:

| Identity | Source | Stability |
|---|---|---|
| `ownerDomainId` | Daemon authorization policy applied to authenticated OS peer credentials | Stable for one authorized local owner domain |
| `activationRequestId` | D1 from trusted entropy before Policy evaluation begins | Stable across activation retries and response loss |
| `runId` | Production admission using trusted entropy; host custody validates the exact provisional identity | Stable for the admitted run |
| `taskDigest` | Canonical admitted task and capability catalog | Stable across execution retries of the same admitted task |
| `pluginSetDigest` | Ordered owner-approved plugin descriptors | Stable for the admitted run |
| `pluginId` and `versionDigest` | Owner-approved registry | Stable for one plugin binding |
| `executionClass` | Owner-approved execution binding | Immutable after admission |
| `instanceId` | Host custody handshake bound to authenticated peer and owner domain | Stable for one harness-instance connection |
| `daemonEpoch` | Host custody leadership acquisition | Changes whenever daemon leadership changes |
| `leaseId` and `generation` | Host custody | Generation increases on reassignment; lease is valid only in its daemon epoch |
| `operationId` | Trusted runtime when the logical effect is first created | Reused for retries of the same logical effect |
| `reservationId` | Digest of run, plugin, capability, and operation identities | Stable across worker reassignment |
| `brokerPrincipalId` | D1-selected provider broker binding authenticated by D4 | Immutable for one admitted provider route |
| `dispatchPermitId` | D4 when a reservation is claimed by its bound broker | Stable through delivery retry; consumable exactly once |

Attempt number and ownership generation do not participate in semantic effect
idempotency. Including either would create a new external effect identity after
a retry. They remain fencing fields on writes.

## 13. D1 design: production admission and execution classes

### 13.1 Module responsibility

The production admission module owns this ordered operation:

1. Resolve the trusted root from owner-controlled configuration.
2. Read the owner pin record and registry from that root.
3. Validate exact registry bytes and schema.
4. Re-derive plugin manifest, source, artifact, runner, and profile commitments.
5. Require exact owner-pin membership for the complete plugin set.
6. Admit the task and validate its parent grant.
7. Validate and bind every Policy plugin to its owner-approved execution class,
   launch commitments, and restricted execution principal.
8. Create one stable activation request and ask the host daemon to atomically
   create a Policy-only ownership lease, capacity allocation, evidence
   checkpoint, and `policy-evaluating` D4 record.
9. Run Policy plugins only through those bindings and that custody allocation.
10. Persist the Policy decision. A denial, timeout, crash, malformed response,
    or protocol failure atomically rejects the evaluation and releases custody.
11. Derive exact non-Policy grants, route bindings, provider-broker bindings,
    execution classes, and launch commitments.
12. Ask the host daemon to atomically promote the same activation to
    `admission-pending-ack`, with D2 ownership generation 1 and the complete D4
    admitted-run snapshot.
13. Rehydrate the opaque `AdmittedRun` from that snapshot and acknowledge its
    exact digest. The daemon then commits `admitted`.
14. Return the deeply frozen admitted run. No production plugin may launch
    before the acknowledgement commits.

Every activation operation is idempotent by `activationRequestId`. Response
loss returns the same durable identity and snapshot rather than creating a new
run. Failure before step 12 produces a durable rejection but no admitted
production authority. An unacknowledged step 12 activation is non-runnable and
expires to `rejected` under the registry bound.

### 13.2 Interface

The illustrative interface is intentionally small:

```ts
interface ProductionAdmission {
  admit(input: AuthorizedRunRequest): Promise<
    | { ok: true; run: AdmittedRun }
    | { ok: false; code: AdmissionRejectCode }
  >;
}

interface ProductionOperations {
  status(input: AuthorizedStatusRequest): Promise<ProductionStatus>;
  quiesce(input: AuthorizedQuiesceRequest): Promise<QuiesceResult>;
  reopenAdmission(input: AuthorizedReopenRequest): Promise<AdmissionState>;
}
```

These interfaces are separate so an ordinary run caller does not automatically
receive operator authority. The supported CLI may receive both only after the
owner-authorized composition root verifies the requested operation.

`AuthorizedRunRequest` contains the task, parent grant, and an owner-selected
trust-root identifier. It does not contain registry bytes, executor objects,
arbitrary filesystem roots, broker endpoints, or launch arguments.

`AdmittedRun` is branded and opaque to external construction. Its inspectable
data includes:

- run, task, registry, plugin-set, and capability-catalog identities;
- the ordered plugin set and exact version digests;
- one grant digest per plugin;
- one `PluginExecutionBinding` per plugin;
- exact provider route and `ProviderBrokerBinding` values where required;
- owner-domain, daemon-epoch, activation-request, and acknowledgement digests;
- the production environment marker; and
- the custody lease identity returned during admission.

Callers may inspect these fields for disclosure and evidence. They cannot
construct or modify the brand.

### 13.3 Execution bindings

`PluginExecutionBinding` contains:

- plugin ID and version digest;
- execution class;
- runner, artifact, and profile digests required by that class;
- restricted execution principal and authority-domain profile required by that
  class;
- lifecycle protocol version;
- disclosure label; and
- whether the binding is permitted to produce production evidence.

The registry schema gains this binding and advances to a new version. The
binding participates in plugin version identity and owner pins. A plugin may
declare compatibility with an execution class, but it cannot choose a weaker
class. The owner-approved registry selects the class.

### 13.4 Initial execution classes

| Class | Intended code | Isolation claim | Privileged effects | Production evidence |
|---|---|---|---|---|
| `container-isolated-v1` | Code treated as hostile | Container launch profile and verified lifecycle receipt | Only through granted brokered effects | Yes |
| `trusted-subprocess-v1` | Owner-reviewed local artifacts | Dedicated restricted OS principal; no hostile-code sandbox claim | Only through granted interfaces; no access to user homes, provider sessions, daemon control, or publisher authority | Yes, labeled with the weaker class and principal boundary |
| `development-v1` | Local authoring and fixtures | No production isolation claim | No privileged effects or bridges | No |

The `trusted-subprocess-v1` executor implementation and principal policy are
part of the trusted computing base; plugin code and output remain untrusted
content and never become authority. The plugin does not run as the admitting
user or the custody service principal. Its execution principal
has a non-user home, an allowlisted executable and environment, no inherited
login session, and deny-by-default filesystem and IPC access. The class remains
ineligible for hostile-code or sandbox claims. If the supported operating
system cannot enforce this principal separation, production admission rejects
the class rather than falling back to an ordinary subprocess.

The class names are closed values. A new class requires a registry version,
constitution review, launch adapter, disclosure, adversarial proof, and D7
release review.

### 13.5 Production and development entrypoints

Production and development use different branded inputs and entrypoints.

- Production requires owner pins, a production registry, exact commitments,
  a supported execution class, and host custody.
- Development may load local code, but receives a development run that cannot
  enter production execution adapters, D3 brokers, D5 bridges, or production
  evidence stores.

`admitRegistryBytes` remains a pure parser and test seam or becomes internal.
It is not a supported production entrypoint. `OwnerApprovedAdmissionTicket`
is folded into the admitted-run implementation rather than surviving as a
second authority object.

### 13.6 Executor selection

Production resolves the executor adapter from the admitted plugin binding.
No supported launch or run function accepts a caller-supplied executor for an
admitted production run. Lower-level adapters may remain injectable inside
tests, but their interfaces require the exact binding and reject a class
mismatch before launch.

### 13.7 D1 failure semantics

Admission rejects on schema failure, pin mismatch, undeclared files, artifact
commitment drift, Policy failure, grant widening, unsupported class, class and
profile mismatch, principal-policy mismatch, route ambiguity, broker-binding
mismatch, existing active task, or custody failure. A rejected Policy evaluation
may leave typed durable evidence, but no rejection path creates runnable
production authority or an orphaned activation.

## 14. D2 design: host custody, fault isolation, and resource leases

### 14.1 Recommended topology

The complete architecture is one host-shared custody daemon. It is the sole
lifecycle principal for all production harness instances in its installed
authority domain. The owner must either ratify this topology or amend
PNH-INV-33 and PNH-INV-35 before implementation.

For these invariants, `host` means one operating-system installation, not one
repository, worktree, shell, user session, or supervisor process. The complete
Mac architecture therefore has one machine-scoped custody registration,
protocol endpoint, and settlement database owned by a dedicated service
principal. Authenticated users do not share authority merely because they share
a host. The daemon maps each authorized OS peer to an `ownerDomainId` and role,
partitions tasks, evidence visibility, trust roots, and operator actions by that
domain, and rejects unregistered local accounts.

User-scoped provider brokers run as per-user agents and may access only that
user's Codex login. They authenticate to the daemon as a broker principal
delegated by the same owner domain. They cannot create a second lifecycle
principal or aggregate budget. The daemon and restricted execution principals
cannot read broker session storage. If Plan C cannot enforce the machine
singleton, service identity, owner-domain ACLs, and principal separation across
local accounts, PNH-INV-13, 33, and 35 remain proposed and production mode is
unsupported on that operating system.

The daemon runs in two supported modes:

- foreground development mode, which is visibly non-production; and
- installed production mode, started and supervised by the operating system.

The macOS production adapter may use launchd, but installation is a separate
owner-authorized action. Prism never installs a daemon automatically during
`npm install`, test execution, plugin admission, or a model-driven run.
Installation creates the dedicated service and execution principals, socket and
database ACLs, and launchd registrations through an inspectable privileged
installer. Package code never silently creates or widens those authorities.

### 14.2 Host interfaces

The harness instance uses a versioned client interface. The activation method
is the host-daemon transaction seam shared by D1, D2, and D4:

```ts
interface HostActivation {
  beginPolicyEvaluation(input: PolicyEvaluationActivation): Promise<PolicyEvaluationRun>;
  promoteRun(input: AdmittedRunPromotion): Promise<PendingAdmittedRun>;
  acknowledgeAdmission(input: AdmissionAcknowledgement): Promise<ActivatedRun>;
  resumeActivation(input: ActivationLookup): Promise<ActivationSnapshot>;
}

interface HostCustody {
  renewOwnership(lease: OwnershipLeaseIdentity): Promise<LeaseDecision>;
  reserveCapacity(input: CapacityRequest): Promise<CapacityLease>;
  releaseCapacity(lease: CapacityLeaseIdentity): Promise<void>;
}

interface HostCustodyOperations {
  status(input: CustodyStatusRequest): Promise<CustodyStatus>;
  quiesce(input: QuiesceRequest): Promise<QuiesceResult>;
  reopenAdmission(input: ReopenAdmissionRequest): Promise<AdmissionState>;
}
```

The implementation may use a command union internally. The public interface
must preserve the ordering, identity, and error behavior above.

`HostActivation` is a narrow façade over the daemon's internal transaction
coordinator, not a second authority module. Every method is idempotent by the
same `activationRequestId` and owner domain. `beginPolicyEvaluation` creates
only Policy custody and the `policy-evaluating` record. `promoteRun` atomically
creates complete D2 ownership generation 1, the D4
`admission-pending-ack` snapshot, and its checkpoint. It returns the same
snapshot after response loss. `acknowledgeAdmission` compares the exact snapshot
digest and moves it to `admitted`; it is idempotent for the same digest and
conflicts for any other digest. `resumeActivation` rehydrates the same snapshot
for the same authenticated owner domain. If a transaction fails, it commits
none of that transition. If D1 disappears before acknowledgement, the pending
record cannot launch and expires to a durable rejection.

Operator methods use a separate least-privilege interface. Plugins and ordinary
run callers never receive it.

### 14.3 Local protocol and authentication

Production uses a local operating-system channel with these properties:

- closed-shape, versioned messages;
- a separately pinned protocol entry and schema hash;
- operating-system peer credentials authenticated before message decoding;
- explicit peer-to-owner-domain and role authorization;
- service, execution, and per-user broker principal identities;
- restrictive socket ACLs that deny unregistered local accounts;
- daemon-issued instance identity;
- current daemon epoch on every privileged command and confirmation;
- monotonically increasing frame sequence or replay identity;
- maximum frame, message, nesting, and string bounds from the invariant
  registry;
- no plugin-controlled raw runtime arguments; and
- no daemon socket, authentication material, or client handle passed to a
  plugin process.

Instance, owner-domain, role, and broker identities are derived during a trusted
handshake from peer credentials and daemon policy. A caller cannot select or
replace them in a command. Ordinary run, operator, broker, and release roles are
distinct. Reconnection after process loss creates a new instance identity and
cannot revive an expired ownership generation or a prior daemon epoch.

### 14.4 Ownership leases

An ownership lease contains `runId`, `ownerDomainId`, `instanceId`, `leaseId`,
`generation`, `daemonEpoch`, and a monotonic deadline valid only inside that
epoch. A wall-clock timestamp may be recorded for diagnostics, but never decides
lease validity. The daemon issues generation 1 for the first owner and
increments the generation on every reassignment.

Only the trusted harness client sends heartbeats. Plugins cannot renew their
own custody. Every settlement mutation includes the lease identity and expected
generation. The same database transaction checks current generation before it
changes run, effect, receipt, or terminal state.

An expired or released generation cannot:

- heartbeat;
- reserve capacity;
- reserve or dispatch an effect;
- commit a broker or lifecycle observation;
- append production evidence; or
- settle the run.

### 14.5 Capacity leases

Capacity leases are distinct from ownership leases. They reserve payload-blind
host resources for one allocation and include instance, plugin, and run
identity plus owner domain and daemon epoch. Bounds and timeouts come from the
invariant registry.

The first production adapter enforces:

- aggregate live-allocation limit;
- per-instance limit;
- per-plugin fair-share limit;
- lifecycle-runtime command concurrency;
- parser and transient buffer bounds; and
- deterministic progress under legal load.

Capacity expires after missed trusted heartbeats or ownership loss. Graceful
release is an optimization, not the only reclamation mechanism.

Monotonic deadlines are never interpreted across daemon epochs. Leadership
change or restart expires every prior-epoch ownership and capacity lease,
fences its generation, and requires reconciliation before work is reassigned.

### 14.6 Fault cells

Fault cells remain allocation-keyed logical partitions. They provide locality,
attribution, queue isolation, timer isolation, and cleanup serialization. They
are not security boundaries. The existing Option A evidence remains valid only
for the execution classes it actually exercises.

The physical-split trigger remains binding: if bounded attributed input can
still produce a process-wide effect after logical cells and resource controls,
the affected cell moves out of process under a separately approved design.

### 14.7 Quiesce and drain

D1 invokes D2's quiesce interface. D2 atomically closes custody admission before
it snapshots Policy evaluations, pending acknowledgements, active runs,
capacity leases, and ambiguous effects. It waits for a registry-bounded drain
period and returns one of:

- `acknowledged`, with no active or ambiguous blockers;
- `timed-out`, with exact blocker identities; or
- `failed`, when the custody state cannot be read durably.

Quiesce never fabricates cleanup or settlement. Reopening admission is a
separate owner or supported-CLI action.

### 14.8 Daemon leadership and external-effect fencing

Installed production combines an operating-system singleton guard with a
durable monotonically increasing `daemonEpoch`. The daemon acquires both before
opening its protocol endpoint. Losing either closes admission and operator
writes. A replacement increments the epoch, fences every prior-epoch lease, and
reconciles externally tagged containers, subprocesses, sockets, and temporary
artifacts before it accepts work.

Every privileged lifecycle command and confirmation binds the daemon epoch,
owner domain, run, allocation, and ownership generation. External resources are
tagged with those values where the substrate permits. A stale daemon may still
be alive, but its confirmations and settlement writes are rejected, and the
replacement does not issue conflicting lifecycle actions until reconciliation
proves or reports the prior resource state. Paused-leader and replacement races
are required production-path tests.

## 15. D4 design: settlement, replay, and durable evidence

### 15.1 Module responsibility

The settlement module owns all authoritative state from admitted intent through
one immutable terminal outcome. Execution, broker, lifecycle, and plugin
outputs are observations. They cannot directly update a terminal result.

The production settlement adapter runs inside the host custody daemon so lease
generation checks and settlement writes share one transaction writer.

### 15.2 Settlement interface

```ts
interface Settlement {
  beginPolicyEvaluation(input: BeginPolicyInput): Promise<RunSnapshot>; // activation transaction only
  promoteRun(input: PromoteRunInput): Promise<RunSnapshot>; // activation transaction only
  acknowledgeAdmission(input: AdmissionAcknowledgement): Promise<RunSnapshot>;
  reserveEffect(input: EffectIntent): Promise<ReservationDecision>;
  claimDispatch(input: DispatchClaim): Promise<DispatchPermitDecision>;
  consumeDispatchPermit(input: DispatchPermitConsumption): Promise<DispatchDecision>;
  recordObservation(input: TrustedObservation): Promise<RunSnapshot>;
  settle(input: SettlementCandidate): Promise<TerminalDecision>;
}
```

The interface hides the transition table, idempotency index, transaction
ordering, evidence append, checkpoint update, and stale-generation checks.
The production adapter exposes Policy begin and run promotion only to the host
daemon's activation transaction, not as independently callable client
operations.

### 15.3 Run state machine

```text
policy-evaluating
   |-- rejected          terminal, no production authority
   +-- admission-pending-ack
           |-- rejected  terminal, acknowledgement expired or conflicted
           +-- admitted
                   |-- active
                   |     |-- completed   terminal
                   |     |-- failed      terminal
                   |     |-- rejected    terminal
                   |     +-- ambiguous   terminal
                   |
                   |-- failed            terminal
                   +-- rejected          terminal
```

Only the listed transitions are legal. A compare-and-set includes run state,
state version, lease ID, and ownership generation. Every terminal state is
immutable. A duplicate terminal candidate returns the existing terminal only
when its digest is identical; a different candidate is a conflict and does not
rewrite history.

### 15.4 Effect state machine

```text
reserved
   |-- rejected          terminal, no dispatch occurred
   +-- permit-issued     no dispatch authority consumed
           |-- rejected  terminal, permit expired before consumption
           +-- dispatching
                   |-- receipted terminal observation available
                   +-- ambiguous terminal, occurrence cannot be proven
```

`dispatching` commits through permit consumption before the broker call. A
crash after that commit is
conservatively ambiguous unless the broker can return a reservation-bound
receipt. This may classify a crash before the actual external call as ambiguous,
but it never risks a duplicate effect from an unsafe automatic retry.

Only the `brokerPrincipalId` and production evidence environment bound at
admission may call `claimDispatch`. The first valid claim atomically moves
`reserved` to `permit-issued` and returns one opaque `DispatchPermit`. A lost
response may return the same permit only to the same authenticated principal
and request digest while it remains unexpired. The permit is delivered through
an authenticated broker channel, never to a plugin or ordinary harness caller.

Immediately before the provider call, D3 must call
`consumeDispatchPermit`. D4 authenticates the caller and atomically compares the
permit, reservation, request digest, broker principal, evidence environment,
expiry, daemon epoch, lease, and generation. Exactly one successful consumption
moves `permit-issued` to `dispatching`; every concurrent or replayed consumption
fails without provider authority. Permit consumption is durable in the shared
SQLite transaction substrate. D3 has no process-local alternative.

### 15.5 Idempotency

The trusted runtime creates `operationId` when a logical effect is first
recorded. Plugins and providers do not supply arbitrary idempotency keys.

The semantic key is derived from:

- run and task identity;
- plugin identity;
- capability identity; and
- stable logical operation identity.

Attempt number and ownership generation are excluded from the key. The
canonical parameter digest covers the normalized request.

Reservation returns:

- `committed` for the first key and digest;
- `replayed` for the identical key and digest, with no dispatch permission;
- `conflict` for the same key and different digest; or
- a thrown or explicit storage failure that never grants dispatch permission.

The current `CapabilityIntentPort.append` is deepened into this reservation
interface. The current `ReplayLedger.consume` behavior becomes part of the
durable settlement adapter rather than a separate production decision point.

### 15.6 Positive evidence matrix

A `completed` terminal requires all evidence applicable to the execution class:

| Evidence | Container class | Trusted subprocess | Provider effect |
|---|---:|---:|---:|
| Valid typed response | Required | Required | Required |
| Matching admitted plugin and version | Required | Required | Required |
| Matching execution binding | Required | Required | Required |
| Matching owner domain and daemon epoch | Required | Required | Required |
| Matching restricted execution principal | Not applicable | Required | Required when plugin allocation is subprocess |
| Clean lifecycle receipt | Required | Required within proven scope | Required for plugin allocation |
| Truthful OOM state | Required | Explicit null when unavailable | Required for plugin allocation |
| Confirmed cleanup | Required | Scope-labeled, never overclaimed | Required for plugin allocation |
| Reservation-, broker-principal-, and consumed-permit-bound receipt | Not applicable | Not applicable unless provider | Required |
| Matching production evidence environment | Not applicable | Not applicable unless provider | Required |
| Exact provider, route, and model | Not applicable | Not applicable unless provider | Required |
| Durable evidence checkpoint | Required | Required | Required |

Missing required evidence prevents completion. Post-dispatch missing provider
evidence produces `ambiguous`. Pre-dispatch validation failure produces
`rejected`. Internal operation or execution failure with proven no external
uncertainty produces `failed`.

### 15.7 Evidence records

Evidence is typed before persistence. The initial record families are:

- admission identity;
- Policy decision and effective grant digests;
- execution binding and launch identity;
- custody lease and generation event;
- capacity reservation and release;
- normalized plugin lifecycle observation;
- effect reservation and dispatch transition;
- normalized broker observation;
- settlement transition; and
- terminal result and checkpoint.

Records contain closed-shape metadata, timestamps, counters, digests, and
artifact references. They do not contain raw prompts, source, stdout, stderr,
provider payloads, credentials, home paths, repository contents, or private
endpoints. Those values may live in separately governed user artifacts; the
ledger stores only their digests and allowed references.

Secret scanning is defense in depth. Typed allowlists are the primary control.

### 15.8 Evidence durability

The pure hash-chain implementation remains deterministic core logic. A durable
evidence store owns append, sequence allocation, checkpoint persistence, and
readback verification.

The terminal settlement transaction must either:

1. append the final typed evidence record;
2. update the evidence checkpoint;
3. write the immutable terminal result; and
4. commit all three;

or commit none. An unknown commit outcome is not reported as completion.

### 15.9 Durable local adapter

The initial durable adapter uses SQLite semantics with:

- one daemon writer;
- WAL mode where supported;
- foreign keys enabled;
- explicit transaction modes for claim and reservation races;
- unique indexes for activation requests, semantic idempotency keys, permit
  consumption, and transition sequence;
- schema versioning and transactional migration;
- restrictive filesystem permissions;
- startup integrity checks; and
- backup before irreversible schema migration.

The implementation plan must select and preflight the Node SQLite library on
the supported Node and macOS versions. Library selection is an implementation
dependency, not permission to weaken these semantics.

### 15.10 Recovery

On daemon restart:

- terminal runs remain immutable;
- prior-epoch ownership and capacity leases expire and are reconciled;
- stale generations are fenced;
- `policy-evaluating` runs resume only for the same activation request and owner
  domain or settle rejected after their bound;
- `admission-pending-ack` runs rehydrate the same snapshot and cannot launch
  until the acknowledgement commits;
- `permit-issued` effects have proven no dispatch consumption and may expire or
  return the same permit to the same bound broker;
- `dispatching` effects without a trustworthy receipt become ambiguous;
- reserved but never-dispatching effects remain safe to inspect and may be
  rejected by an owner action;
- evidence chains are verified against checkpoints before new work is admitted;
  and
- integrity or migration failure closes production admission.

## 16. D3 design: trusted provider brokers and exact routing

### 16.1 Module responsibility

The provider broker owns credential use, subscription sessions, provider
endpoints, native provider commands, exact route execution, and normalized
provider observations. It does not create grants, choose fallback, accept an
unreserved effect, or settle a run.

Provider plugins remain ordinary credential-free plugins. They may validate or
normalize provider-shaped data under a grant. They never receive the Codex
login, `HOME`, a provider endpoint, or a native CLI handle.

Each provider route admitted by D1 includes one immutable
`ProviderBrokerBinding`: owner domain, broker principal, adapter and executable
digests, broker protocol version, provider and route class, evidence
environment (`production`, `acceptance`, or `mock`), and the operating-system
principal expected on the authenticated channel. D4 authenticates that binding
at reservation, permit claim, permit consumption, and observation commit. A
shape-compatible adapter is substitutable only inside the same evidence
environment; mock and acceptance principals cannot act for production.

### 16.2 Broker interface

```ts
interface ProviderBroker {
  dispatch(request: ReservedBrokerRequest): Promise<BrokerObservation>;
}
```

The supported broker implementation validates the reservation and normalized
request with D4, then calls D4's broker-only `claimDispatch` operation. It does
not invoke the provider merely because that call returns a `DispatchPermit`.
Immediately before invocation it must atomically consume that permit through
D4. Repeated or concurrent consumers stop before provider dispatch even when a
caller or broker worker is buggy. A crash before successful consumption has
proven no provider authority. A crash after consumption is post-dispatch
uncertainty because Prism cannot prove that the external call did not occur.

`ReservedBrokerRequest` includes:

- reservation, run, task, and grant digests;
- owner-domain and `ProviderBrokerBinding` digests;
- broker principal, adapter identity, protocol version, and evidence environment;
- exact requested route class, provider ID, and model ID;
- input digest and allowed output limits;
- deadline and replay identity; and
- no raw trust-root, plugin-selected endpoint, or fallback list.

`BrokerObservation` includes:

- reservation identity;
- consumed dispatch-permit identity;
- owner-domain, broker-principal, adapter, protocol, and evidence-environment
  identities;
- requested and observed route, provider, and model;
- input and result digests;
- normalized telemetry with explicit nulls;
- dispatch state;
- safe error class; and
- broker protocol version.

D4 authenticates the channel principal, validates every binding and identity,
and persists the observation. The broker cannot write terminal state directly.

### 16.3 Codex adapter

The first live adapter is a per-user broker agent under the admitting owner's OS
login. It moves `codex exec` and ChatGPT session access out of
`pnh/examples/plugins/codex-chatgpt/codex-exec.mjs` and behind the trusted
broker interface. The machine daemon delegates only reservation-bound permits
to this agent and never reads or copies its subscription session.

The live adapter:

- uses the existing trusted Mac Codex login;
- never copies or parses credential files into Prism;
- authenticates as the admitted owner-domain broker principal;
- invokes one exact admitted route and model;
- disables fallback and user configuration that could change route meaning;
- uses an isolated temporary working directory and the narrowest supported
  Codex sandbox;
- passes the prompt through a trusted broker input channel;
- returns only the normalized observation and an artifact digest; and
- refuses to run when route or model identity cannot be resolved exactly.

The deterministic mock adapter implements the identical interface and receipt
shape under a distinct `mock` principal and evidence environment. D4 rejects
that principal for a production reservation. CI runs only the mock. The live
acceptance test is opt-in on the trusted Mac, uses an `acceptance` principal,
and makes one bounded request. Acceptance evidence cannot settle a production
run.

OpenAI's current [Codex authentication documentation](https://developers.openai.com/codex/auth)
confirms that local Codex clients support ChatGPT subscription sign-in, and the
[CLI reference](https://developers.openai.com/codex/cli/reference) marks
`codex exec` as the stable non-interactive command. The installed trusted-Mac
CLI was also inspected without making a provider call: version 0.149.1 reports
ChatGPT login and exposes explicit model, sandbox, ephemeral-session,
ignored-user-config, strict-config, JSON, and output-schema controls. Plan E
must pin and preflight a supported CLI version rather than assuming these flags
forever. It must also prove that the CLI returns a trustworthy observed model
identity. If it cannot, the live adapter remains a non-production acceptance
example and cannot satisfy exact-route completion.

### 16.4 Provider uncertainty

The broker reports whether dispatch was definitely not attempted, was attempted,
or was accepted with a valid receipt. Transport loss after `dispatching` never
becomes an ordinary retryable failure. D4 settles it as ambiguous.

## 17. D5 design: foreign-capability bridge

D5 is designed now to protect future compatibility, but its implementation is
deferred from the first public release.

A local bridge is an ordinary owner-pinned plugin in
`container-isolated-v1`. The foreign server is packaged into the admitted
artifact. Admission freezes every supported method family, member, and schema
hash. A trusted harness-side mediator checks each foreign dispatch against that
surface and records evidence outside plugin bytes.

The first bridge design, when authorized, must support tools, resources,
prompts, and subscriptions as separate admitted method families. Unknown or
drifted members fail before dispatch. Post-dispatch drift settles ambiguous.

Remote credentialed servers are not members of this class. Supporting them
requires a brokered remote-bridge design and constitutional amendment.

No D5 implementation plan is authored until the owner names a concrete consumer
and ratifies bridge inclusion.

## 18. D6 design: constitutional proof and claim governance

### 18.1 Enforcement kinds

Every invariant gains one required `enforcement_kind` from this closed set:

- `runtime-adversarial`;
- `static-structure`;
- `generated-document-consistency`;
- `controlled-performance-qualification`; or
- `release-or-architecture-gate`.

Every proposed or ratified invariant states its intended kind even before proof
exists. An invariant with `proof_status: proven` must have matching executable
evidence.

### 18.2 Proof registration

The registry may keep conformance file paths as its durable index. Runtime test
registration adds structured proof metadata to the machine-readable report:

- invariant ID;
- enforcement kind;
- production constructor or entrypoint exercised;
- fault point or disabled control, when applicable;
- non-skipped result;
- test artifact digest; and
- review artifact when activation requires independent review.

A path, test name, or `conformsTo` tag alone cannot establish
`proof_status: proven` for a runtime claim.

### 18.3 Fault points

D2 and D4 expose deterministic test-only fault injection immediately before and
after:

- Policy-evaluation activation;
- admission promotion and acknowledgement;
- ownership claim;
- daemon leadership acquisition and replacement fencing;
- heartbeat renewal;
- state transition;
- capacity reservation;
- effect reservation;
- dispatch-permit issue and atomic consumption;
- dispatch start;
- broker acceptance;
- receipt commit;
- evidence append;
- checkpoint update; and
- quiesce snapshot.

Production constructors do not allow arbitrary runtime fault injection. Tests
must prove that disabling the named control causes the expected red result.

### 18.4 Separate constitutional law from proof state

Registry version 2 replaces the overloaded invariant `status` field with two
independent fields:

```ts
type LawStatus = "proposed" | "ratified" | "retired";
type ProofStatus = "unproven" | "partial" | "proven";
```

Lock version 2 records both statuses independently. Its binding digest includes
the statement, bounds, law status, proof reason, enforcement kind, and
first-release rule. Proof status remains a separate lock field so a transition
must cite both the prior binding hash and prior proof state.

`law_status` answers whether the owner has adopted the statement as
constitutional law. `proof_status` answers how much of that law the current
implementation proves. All 46 invariants in the ratified baseline have
`law_status: ratified`. Future unratified candidates use `proposed`; only an
owner decision may move a law to `ratified` or `retired`.

`proof_status` is stored so the registry, generated constitution, public claims,
and lock agree, but the gate verifies rather than trusts it. `proven` requires
an executed structured proof of the registered enforcement kind. `partial`
requires concrete evidence plus an exact statement of the unproved remainder.
`unproven` requires a non-empty reason and cannot support a public claim.

A proof upgrade to `proven` requires matching structured proof and an
independent review artifact. A downgrade from `proven` to `partial` or
`unproven` requires a hash-bound `proof-invalidation` amendment, the prior proof
state, an evidence-invalidation reason, lock and generated-document updates, and
owner ratification. No proof-state transition changes constitutional law.

Plan A migrates legacy registry state as follows:

- PNH-INV-02, 03, 04, and 18 start `partial` because their existing evidence is
  not yet structured; Plan A upgrades them to `proven` after revalidation;
- PNH-INV-22 remains `partial` until every admitted execution class reruns the
  allocation-scoped fault-cell proof through its production constructor;
- PNH-INV-23 remains `partial` until cleanup truth is scoped by execution class
  or stronger containment exists;
- PNH-INV-29 remains `partial` until the supported production entrypoint makes
  owner pins technically unavoidable; and
- every other invariant starts `unproven` until its closing gate executes the
  required proof.

This model preserves the law while making implementation assurance honest.

### 18.5 Required amendments

Before D1 and D2 implementation, binding amendments resolve:

- PNH-INV-25 with this exact target statement:

  > Every admitted plugin executes under the execution class bound at
  > admission. Code treated as hostile uses a separately constrained isolation
  > class with production proof for its named boundary. Owner-reviewed
  > subprocess code runs only under the restricted Prism execution principal,
  > is never described as sandboxed, and receives no user, broker, operator, or
  > publisher authority. Development code cannot produce production evidence or
  > privileged effects.

- PNH-INV-27 with this exact target statement:

  > Every production execution class has one admission-bound authority boundary
  > and one custody principal. `container-isolated-v1` uses the plugin container
  > as its hostile-code boundary. `trusted-subprocess-v1` uses a dedicated
  > restricted OS principal as its ambient-authority boundary but makes no
  > hostile-code sandbox claim. The host custody daemon remains the sole
  > lifecycle principal for both. `development-v1` is non-production.

- PNH-INV-38 with this exact target statement:

  > Under legal registry-bounded load, every ready allocation receives one
  > scheduler quantum before any ready allocation receives a second. One full
  > rotation contains at most `max_live_allocations` turns, and each turn admits
  > at most `max_commands_per_event_loop_turn` commands. All bounds live in this
  > registry and tests import them. Wall-clock latency is not a universal
  > invariant; any wall-clock claim requires a separately approved controlled
  > performance qualification on a named environment.

Plan A copies these statements exactly into the registry decision records. A
wording change is a new architecture amendment, not an implementation-plan
choice.

### 18.6 Public-claim gate

Normative claims are generated from the registry. Handwritten public prose is
linted against law status, proof status, execution-class labels, known
limitations, and release posture. A supported claim requires
`law_status: ratified`, `proof_status: proven`, and a non-deferred release
disposition. A README cannot describe partial or unproven behavior as supported
or call a trusted subprocess sandboxed.

### 18.7 Independent review

A transition to `proof_status: proven` and every architecture escalation require
a review artifact from a separate review pass whose task is to falsify the
claim. In a solo-owner project, this is review independence, not organizational
independence. The owner remains the final ratifier.

### 18.8 Ratification enforcement and first-release baseline

The following table is the complete Plan A input. Every row has
`law_status: ratified`. `activate` means `proof_status` must become `proven`
before the named closing gate. `retain` means legacy evidence must be converted
to matching structured proof before support continues. `defer` permits proof to
remain incomplete and must appear as unsupported in public claims.

| ID | Enforcement kind | First-release disposition | Closing gate |
|---|---|---|---|
| PNH-INV-01 | `runtime-adversarial` | activate | C/F |
| PNH-INV-02 | `static-structure` | retain; reverify every adapter and protocol pin | A/F |
| PNH-INV-03 | `runtime-adversarial` | retain; rerun all parser boundaries | A/F |
| PNH-INV-04 | `runtime-adversarial` | retain; reprove the new authority root | B2/F |
| PNH-INV-05 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-06 | `runtime-adversarial` | activate | D/F |
| PNH-INV-07 | `runtime-adversarial` | activate | D/E/F |
| PNH-INV-08 | `runtime-adversarial` | activate | D/E/F |
| PNH-INV-09 | `release-or-architecture-gate` | activate | A/F |
| PNH-INV-10 | `runtime-adversarial` | activate | B2/C/E/F |
| PNH-INV-11 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-12 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-13 | `runtime-adversarial` | activate | C/E/F |
| PNH-INV-14 | `runtime-adversarial` | activate | E/F |
| PNH-INV-15 | `runtime-adversarial` | activate | E/F |
| PNH-INV-16 | `runtime-adversarial` | activate | D/E/F |
| PNH-INV-17 | `release-or-architecture-gate` | activate | G |
| PNH-INV-18 | `static-structure` | retain; reverify the standalone graph | G |
| PNH-INV-19 | `static-structure` | activate | G |
| PNH-INV-20 | `release-or-architecture-gate` | activate | G |
| PNH-INV-21 | `runtime-adversarial` | activate | C/D/F |
| PNH-INV-22 | `runtime-adversarial` | activate for every production class; partial until then | A/B2/C/F |
| PNH-INV-23 | `runtime-adversarial` | activate by execution class; partial until then | A/C/D/F |
| PNH-INV-24 | `release-or-architecture-gate` | activate | A/F |
| PNH-INV-25 | `runtime-adversarial` | activate after exact amendment | A/B2/F |
| PNH-INV-26 | `generated-document-consistency` | activate | A/F/G |
| PNH-INV-27 | `runtime-adversarial` | activate after exact amendment | A/B2/C/F |
| PNH-INV-28 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-29 | `runtime-adversarial` | activate; partial until the production entrypoint enforces owner pins | A/B2/F |
| PNH-INV-30 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-31 | `runtime-adversarial` | activate | B2/C/D/E/F |
| PNH-INV-32 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-33 | `runtime-adversarial` | activate | C/F |
| PNH-INV-34 | `runtime-adversarial` | activate | B2/C/F |
| PNH-INV-35 | `runtime-adversarial` | activate | C/F |
| PNH-INV-36 | `runtime-adversarial` | activate | C/F |
| PNH-INV-37 | `runtime-adversarial` | activate | C/F |
| PNH-INV-38 | `runtime-adversarial` | activate after exact amendment | A/C/F |
| PNH-INV-39 | `runtime-adversarial` | defer; no first-release conformance claim | H or later architecture gate |
| PNH-INV-40 | `runtime-adversarial` | defer with D5 | H |
| PNH-INV-41 | `runtime-adversarial` | defer with D5 | H |
| PNH-INV-42 | `runtime-adversarial` | defer with D5 | H |
| PNH-INV-43 | `runtime-adversarial` | activate | B2/F |
| PNH-INV-44 | `generated-document-consistency` | activate | A/G |
| PNH-INV-45 | `runtime-adversarial` | activate | C/D/E/F |
| PNH-INV-46 | `release-or-architecture-gate` | activate | A/F |

Plan F consumes this table as a manifest, not as guidance. Plan G rejects
release readiness if any row is outside its allowed disposition or if a deferred
row is described as supported.

At Plan A exit, PNH-INV-02, 03, 04, and 18 are `proven`; PNH-INV-22, 23, and 29
are `partial`; and the remaining 39 invariants are `unproven`. Later plans change
proof status only by satisfying the transition rules in Section 18.4.

## 19. D7 design: standalone package and release authority

### 19.1 Canonical repository

The standalone repository is created privately under the Vora Technologies,
LLC organization. It becomes canonical only after its clean-checkout gate passes
and the monorepo consumer uses public contracts rather than implementation
imports.

Extraction uses an isolated allowlisted export into a fresh Git root. It never
rewrites history in the live monorepo and never copies monorepo Git objects into
the standalone repository. A signed provenance manifest binds the exported
files to the verified source commit, export tool digest, allowlist, and resulting
standalone root commit. The new repository still scans every reachable object
and ref before visibility can change.

### 19.2 Repository layout

The target layout separates the public seam from implementations:

```text
packages/
  contracts/          public task, grant, plugin, broker, evidence, result types
  runtime/            admission, plugin kernel, run orchestration
  node-adapters/      SQLite, container, subprocess, host-custody clients
  codex-broker/       trusted Codex provider adapter
  cli/                supported developer entrypoint
examples/
  local-text-stats/
  codex-chatgpt/
docs/
  constitution, threat model, decisions, protocols, quickstart
```

Package names and npm publication are selected during the D7 plan. The package
seams are binding: consumer adapters import `contracts` and supported runtime
entrypoints only. A static graph gate rejects implementation imports.

### 19.3 Supported CLI

The CLI owns operator-facing composition. Its first supported functions are:

- environment and daemon diagnostics;
- service-principal, execution-principal, owner-domain, socket-ACL, database-ACL,
  and broker-delegation diagnostics;
- production verification of registry, pins, and execution bindings;
- the no-provider local quickstart;
- the mocked Codex quickstart;
- the opt-in live Codex acceptance command;
- explicit quiesce, status, and admission reopen operations; and
- explicit service install, upgrade, rollback, uninstall-preserve,
  uninstall-purge, and reinstall operations; and
- disclosure of execution class, requested capabilities, and known trust
  limits before a run.

The CLI does not install plugins dynamically, discover repositories, infer
provider routes, or publish releases. Service lifecycle commands are separate
owner-authorized operations. They print their exact privileged changes, require
an interactive or signed approval outside model-driven execution, and never run
from package installation hooks.

### 19.4 Installed service lifecycle

The installed daemon has one versioned lifecycle contract:

- `install` verifies a clean package, records owner approval, creates the
  service and restricted execution principals, installs launchd definitions,
  creates socket and database ACLs, initializes the database, and proves the
  principal-separation negative tests before opening admission;
- `doctor` is read-only and reports package, principal, ACL, epoch, protocol,
  schema, database integrity, broker delegation, and orphaned-resource state;
- `upgrade` quiesces first, refuses unresolved blockers, snapshots the database
  and service metadata, installs the candidate, performs transactional schema
  migration, increments the daemon epoch, reconciles external resources, and
  opens admission only after health and compatibility gates pass;
- `rollback` restores the prior executable and metadata. It restores a database
  backup only when no post-upgrade write occurred; otherwise it requires a
  tested forward-recovery adapter and keeps admission closed;
- `uninstall-preserve` is the default uninstall. It quiesces, deregisters the
  service, removes sockets and executable authority, retains the database and
  evidence under restrictive ownership, and emits the exact reinstall path;
- `uninstall-purge` is a separate destructive owner action. It refuses active,
  pending, or ambiguous work, requires an evidence export or explicit evidence
  destruction acknowledgement, and removes retained data and dedicated
  principals only after service authority is gone; and
- `reinstall` discovers preserved state, verifies ownership and integrity,
  migrates through the supported path, creates a new daemon epoch, and does not
  reopen admission until reconciliation passes.

Fresh install, upgrade, rollback, preserve/reinstall, purge, interrupted
migration, and unresolved-ambiguity cases run in disposable supported-macOS
environments before release. Tests assert both resulting filesystem state and
absence of residual privileged service authority.

### 19.5 CI and clean-checkout gate

Required CI includes:

- strict typecheck, unit tests, host tests, and constitution gate;
- 100% pure-core coverage and module-graph closure;
- deterministic mock provider integration;
- protocol schema-hash and generated-doc drift checks;
- current-tree and full reachable-Git-object secret and private-material scans,
  dependency review, license inventory, SBOM, and provenance;
- export allowlist and private-material negative scan;
- supported Node and operating-system matrix; and
- clean temporary checkout using only documented commands; and
- disposable-Mac service lifecycle verification from install through purge.

The history gate enumerates every object reachable from every local and remote
ref that will exist when the repository becomes public. It records the ref set
and scanner versions in the release attestation. Unreachable source-monorepo
objects are absent because extraction starts from a fresh root. Any reachable
secret, private endpoint, private artifact, or excluded licensed material blocks
both repository visibility change and package publication.

The live Codex acceptance test does not run in shared CI because it depends on
an owner-controlled subscription session. Its signed or hashed result is a
release input, not a public credential artifact.

### 19.6 Licensing

Recommended project license: Apache-2.0.

Every copied or adapted third-party source retains required notices. The
repository ships a third-party notices file, machine-readable license inventory,
SBOM, and provenance record. Artifacts with unresolved redistribution rights
remain excluded.

### 19.7 Publication authority

Publication is a separate owner-controlled workflow. CI can build and attest a
candidate, but cannot publish merely because tests pass. Plugins, model output,
repository content, ordinary pull requests, and the harness runtime never
receive publication capability.

The owner workflow accepts only the exact candidate commit, ref set, package
digests, history-scan attestation, lifecycle-test attestation, SBOM, provenance,
and invariant-disposition manifest produced by Plan G. A ref or object change
invalidates approval and requires a new candidate. Repository visibility and
package publication are separate explicit owner actions.

## 20. End-to-end flows

### 20.1 Local plugin run

1. The supported CLI or consumer adapter submits an authorized task to D1.
2. D1 validates the owner domain, trusted root, pins, registry, task, and the
   Policy execution bindings.
3. The host daemon idempotently creates the Policy-only lease, allocation,
   `policy-evaluating` record, and evidence checkpoint.
4. D1 runs Policy through the bound executor. D4 records its result before any
   non-Policy grant exists.
5. D1 derives all remaining grants, execution bindings, and broker bindings.
   The daemon promotes the same activation to `admission-pending-ack`.
6. D1 rehydrates and acknowledges the exact snapshot. D4 commits `admitted`.
7. D2 grants remaining capacity leases and D1-selected adapters launch plugins.
8. Plugin responses and lifecycle receipts return as untrusted and trusted
   observations respectively.
9. D4 checks the positive-evidence matrix and commits one terminal result and
   evidence checkpoint.
10. D2 confirms cleanup and releases capacity.

### 20.2 Codex provider run

1. Steps 1 through 7 above complete.
2. The credential-free Provider plugin produces a normalized capability request.
3. D4 commits an effect reservation using a stable logical operation ID.
4. The admitted per-user D3 broker principal validates the reservation and
   claims its bound dispatch permit.
5. Immediately before provider invocation, D3 asks D4 to consume the permit.
   The first valid consumption commits `dispatching`; every replay or concurrent
   consumer receives no provider authority.
6. D3 invokes the exact admitted route using the owner-domain ChatGPT login.
7. D3 returns a permit-, principal-, environment-, and reservation-bound
   normalized observation.
8. D4 validates route, model, provider, input, telemetry shape, lifecycle, and
   evidence, then settles.

### 20.3 Crash after provider dispatch

1. D4 has committed `dispatching`.
2. The broker call occurs or may have occurred.
3. The harness or broker dies before a trustworthy receipt commits.
4. On recovery, D4 cannot prove non-occurrence or completion.
5. The effect and run settle `ambiguous`.
6. No automatic retry occurs. An owner-visible recovery workflow handles the
   case separately.

### 20.4 Worker ownership loss

1. The harness instance stops heartbeating.
2. D2 expires ownership and capacity leases.
3. D2 increments generation if work is reassigned.
4. D4 rejects every write from the old generation.
5. Pre-dispatch work may be safely rejected or resumed according to stored
   state. Dispatching work becomes ambiguous without a receipt.

### 20.5 Quiesce

1. An owner or supported CLI action uses D1's `ProductionOperations` interface.
2. D1 invokes D2's operator interface. D2 closes custody admission atomically.
3. D2 snapshots Policy evaluations, pending acknowledgements, active runs,
   leases, and ambiguous effects.
4. Existing work drains within the registry bound or produces exact blockers.
5. D2 acknowledges only when no active or ambiguous blocker remains.

### 20.6 Daemon replacement

1. The replacement acquires the operating-system singleton guard while
   production admission remains closed.
2. It increments the durable daemon epoch and fences every prior-epoch lease.
3. It verifies database and evidence integrity, then reconciles every externally
   tagged resource from the prior epoch.
4. Stale daemon confirmations and settlement writes fail their epoch checks.
5. Admission reopens only after reconciliation proves the resource state or
   reports exact operator-visible blockers.

## 21. Error and terminal taxonomy

| Condition | Dispatch allowed | Terminal or response |
|---|---:|---|
| Policy-evaluation admission, pin, class, principal, or owner domain invalid | No | Rejection; no Policy execution authority |
| Policy denies or fails inside its bound evaluation | No | `rejected`; no admitted run authority |
| Admission acknowledgement response is lost | No until acknowledgement commits | Return the same pending snapshot for the same activation request |
| Admission acknowledgement expires or conflicts | No | `rejected`; pending authority never becomes runnable |
| Admission route, broker binding, or grant invalid | No | Admission rejection; no run authority |
| Identical idempotency replay | No | Existing reservation reference, never success for this call |
| Idempotency parameter conflict | No | Conflict and operator-visible evidence |
| Ambiguous storage before dispatch permission | No | Fail closed; no effect authority |
| Dispatch permit issued but not consumed | No | Same bound broker may recover it; expiry rejects with proven non-dispatch |
| Duplicate or concurrent permit consumption | No | First durable consume wins; every other consume is replay rejection |
| Capacity unavailable | No | Bounded capacity rejection |
| Plugin operation fails before external dispatch | No further dispatch | `failed` when non-occurrence is proven |
| Policy or broker explicitly rejects | No or stopped before effect | `rejected` |
| Permit consumed and provider call may have occurred but receipt is missing | Never retried automatically | `ambiguous` |
| Prior daemon epoch or ownership generation attempts a write | No | Fenced conflict and operator-visible evidence |
| Complete positive evidence commits | Already occurred exactly once | `completed` |
| Late or duplicate conflicting terminal observation | No | Conflict; original terminal remains |

Safe error classes never include raw credentials, prompts, provider payloads,
filesystem paths, stderr, or private endpoints.

## 22. Protocol and schema versioning

The program introduces or advances these versioned surfaces:

- plugin registry version for execution bindings;
- owner-domain, role, service-principal, execution-principal, and broker-binding
  policy versions;
- Policy evaluation, activation request, pending acknowledgement, and admitted-
  run canonical identity versions;
- host custody command protocol, including daemon epoch and principal identity,
  as its own PNH-PROTO entry;
- settlement command and record version, including permit issue and atomic
  consumption;
- evidence record and checkpoint version;
- provider broker request and observation protocol pin with principal and
  evidence-environment identity;
- installed-service lifecycle manifest version; and
- standalone public contract package version.

Each wire surface has one schema source, content hash, conformance suite, and
independent version clock. A schema change without a registry version and hash
update fails CI. Old production protocol versions are rejected unless a
separately tested migration adapter is explicitly included.

## 23. Migration from current code

Migration is staged. There is never a supported production period with two
authority roots.

### 23.1 Admission migration

- Extend registry generation and owner pins with execution bindings.
- Add Policy-only bindings, stable activation request identity, promotion,
  acknowledgement, expiry, and rehydration.
- Bind owner domains, restricted execution principals, and provider brokers at
  admission.
- Build the new production admission module around existing pure validators.
- Route examples and host tests through it.
- Make ordinary admission internal or explicitly development-only.
- Remove caller-selected production executor paths after migration tests pass.

### 23.2 Custody migration

- Extract current supervisor-scoped lifecycle and resource behavior behind the
  D2 interface.
- Introduce the host protocol and daemon fixture.
- Add the machine service principal, restricted execution principals,
  owner-domain and role ACLs, per-user broker delegation, and negative access
  tests.
- Move lifecycle and aggregate state into the daemon.
- Prove two harness instances share one writer and budget.
- Add daemon epochs, monotonic lease deadlines, generation fencing,
  reconciliation, leadership replacement, and quiesce.

### 23.3 Settlement migration

- Add `ambiguous` to the terminal contract.
- Replace intent append with effect reservation.
- Add Policy evaluation, admission-pending-ack, and idempotent acknowledgement
  states.
- Add permit issue and durable atomic permit consumption states.
- Implement in-memory and durable settlement adapters.
- Move replay decisions, evidence append, and terminal writes behind D4.
- Route local and provider examples through D4.

### 23.4 Broker migration

- Define admission-, principal-, environment-, permit-, and reservation-bound
  broker contracts.
- Build the deterministic mock under a non-production principal.
- Build the per-user authenticated broker agent and prove the daemon and plugin
  principals cannot access its session.
- Move native Codex invocation and session access out of the Provider plugin.
- Run mocked CI and one opt-in trusted-Mac acceptance test.
- Delete the plugin's direct credential-session path.

### 23.5 Standalone migration

- Freeze the verified monorepo source baseline.
- Export through an allowlist into an isolated private repository with a fresh
  Git root and signed source-to-export provenance.
- Add package seams, CLI, docs, license, notices, CI, SBOM, and provenance.
- Add the complete install, doctor, upgrade, rollback, preserve, reinstall, and
  purge lifecycle.
- Migrate the monorepo consumer to public contract imports.
- Run clean-checkout, service-lifecycle, current-tree, and all-reachable-Git-
  object private-material gates.
- Require owner ratification before changing repository visibility.

## 24. Implementation-plan series

The design should become seven program plans plus one optional future plan.
Each plan may split into smaller execution plans if its preflight finds an
unreviewable diff, but it may not combine with a later dependency to bypass an
exit gate.

### Plan A: constitutional proof and corrections

Decision owner: D6.

Deliver:

- the Section 18.8 all-46 enforcement and disposition baseline copied into the
  registry and generated documentation;
- separate `law_status`, `proof_status`, and `enforcement_kind` schema with
  generated documentation;
- structured production-path proof reports;
- decision-backed proof upgrade and invalidation workflows;
- PNH-INV-22, 23, and 29 proof-invalidation decisions;
- the exact PNH-INV-25, 27, and 38 amendments from Section 18.5; and
- public-claim consistency gate.

Exit gate: constitution tests pass, all 46 laws are ratified and match Section
18.8, PNH-INV-02, 03, 04, and 18 have matching structured proof, PNH-INV-22, 23,
and 29 are honestly partial, all other proof remains unproven, amendment text is
exact, and the owner ratifies the complete baseline.

### Plan B: production admission and execution bindings

Decision owner: D1.

Deliver:

- registry and pin schema version with execution bindings;
- Policy-only execution binding and evaluation contract;
- stable activation request, promotion, acknowledgement, expiry, and
  rehydration contracts;
- owner-domain, restricted-execution-principal, and provider-broker bindings;
- one deep production admission module;
- class-derived executor selection;
- separate non-production development entrypoint;
- one-task ownership integration; and
- supported disclosure of class and authority-domain limits.

Plan B has two explicit milestones. B1 pins the pure D1 contracts so Plans C and
D can implement them. B1 does not claim a complete production admission path.
B2 closes only after the C/D integration gate exercises Policy evaluation,
promotion, lost-response rehydration, acknowledgement, principal binding, and
rejection through production adapters. At B2, no supported production path
accepts an unpinned ticket or caller-selected executor, and PNH-INV-04, 05, 22,
25, 27, 29, and 43 have their required proof or honest status.

### Plan C: host custody and resource leases

Decision owner: D2.

Deliver:

- versioned authenticated host protocol;
- host-shared custody daemon and client under a dedicated service principal;
- per-user owner domains and roles, restricted execution principals, socket and
  database ACLs, and per-user broker delegation;
- ownership and capacity leases;
- daemon leadership epochs, monotonic lease deadlines, generation fencing,
  paused-predecessor rejection, and expired-owner reconciliation;
- host-wide resource arbitration; and
- quiesce and drain.

Exit gate: independent harness instances in two authorized owner domains share
one lifecycle writer and budget without crossing evidence or operator
authority; unauthorized local accounts, stale epochs, paused leaders, wedges,
clock rollback, fairness, quiesce, forged identities, and principal-access
negative tests pass.

### Plan D: durable settlement and evidence

Decision owner: D4.

Deliver:

- closed CAS run and effect state machines;
- Policy evaluation, admission-pending-ack, acknowledgement, expiry, and
  rehydration states;
- stable operation identity and durable idempotency;
- effect reservation, permit issue, atomic permit consumption, and dispatch
  transitions;
- immutable `ambiguous` terminal outcome;
- typed evidence records and durable checkpoints;
- in-memory and SQLite adapters; and
- restart and fault-injection recovery.

Exit gate: the same interface suite passes against both adapters, every
dangerous transition has a kill-point test, and activation response loss,
duplicate permit consumers, late, stale, prior-epoch, replay, conflict, and
post-consumption uncertainty cases settle correctly.

Plans C and D begin only after Plan B1's interface is pinned. They may run in
parallel worktrees with disjoint write scopes. Their shared integration
milestone joins them behind the host daemon and proves Policy custody,
activation acknowledgement, atomic generation and daemon-epoch fencing, and
restart recovery. Plans C and D may close after that gate. Plan B remains open
until its B2 production-path gate also passes.

### Plan E: trusted Codex provider broker

Decision owner: D3.

Deliver:

- reservation-bound broker contract;
- admission-bound broker identity and evidence-environment contract;
- deterministic mock adapter under a non-production principal;
- trusted per-user local Codex broker agent;
- durable dispatch-permit consumption immediately before provider invocation;
- credential-free Provider plugin;
- exact route, model, telemetry, and ambiguity handling; and
- mocked CI plus one live trusted-Mac acceptance gate.

Exit gate: mock and live adapters produce the same normalized shape but D4
rejects mock and acceptance principals for production; plugin, daemon, and
restricted execution principals cannot access the ChatGPT session; and no
provider call occurs without a committed reservation and the one successful
durable permit consumption.

### Plan F: threat model and invariant activation audit

Decision owners: D1, D2, D3, D4, and D6.

Deliver:

- production threat model for the integrated architecture;
- adversarial review of every planned proof upgrade;
- exact proof-status changes with decision records; and
- corrected public trust labels; and
- a machine-checked result for every Section 18.8 manifest row.

Exit gate: every one of the 46 manifest rows has `law_status: ratified` and
`proof_status: proven` or is one of the explicitly deferred D5/PNH-INV-39 rows;
every deferred row is disclosed as unsupported; and no proven claim is broader
than the tested execution class, authority domain, operating system, or evidence
environment.

### Plan G: standalone package and release readiness

Decision owner: D7.

Deliver:

- private canonical Vora repository;
- fresh-root allowlisted export with signed source provenance;
- public contract and implementation package seams;
- supported CLI, quickstarts, and complete installed-service lifecycle;
- license, notices, SBOM, provenance, and CI;
- current-tree and all-reachable-Git-object private-material gates;
- clean Mac checkout plus install, upgrade, rollback, preserve/reinstall, and
  purge verification; and
- owner-controlled publication workflow.

Exit gate: the private repository is reproducibly open-source-ready; every
Section 18.8 row has its allowed release disposition; the exact candidate commit
and ref set pass history, lifecycle, license, SBOM, provenance, and secret gates;
and the owner separately authorizes or declines repository visibility and
package publication.

### Optional Plan H: local foreign-capability bridge

Decision owner: D5.

This plan is not authored until a concrete consumer is named. Its exit gate is
the frozen-surface, mediator, drift, credential-absence, and ambiguity proof in
D5.

## 25. Program dependency order

```text
Plan A: D6 proof and amendments
              |
              v
Plan B1: D1 contracts and pure admission
              |
      +-------+-------+
      v               v
Plan C: D2        Plan D: D4
      +-------+-------+
              v
      C/D integration gate
              |
              v
Plan B2: D1 production-path closure
              |
              v
Plan E: D3 Codex broker
              |
              v
Plan F: integrated threat and activation audit
              |
              v
Plan G: D7 standalone and release readiness

Plan H: D5 bridge, deferred unless explicitly pulled into scope.
```

B1 pins identities and ports but is not a production-conformance milestone. C
and D implement those ports in parallel. The shared integration gate must pass
before C or D closes, and B2 then proves D1 through those production adapters.
E begins after D's permit-consumption contract and B2's broker binding are
stable. This ordering avoids making pre-admission Policy execution depend on a
fixture that cannot satisfy production proof.

## 26. Milestone rules

Every implementation plan must contain:

- exact invariant IDs touched;
- the corresponding Section 18.8 manifest rows and allowed exit disposition;
- current-state grounding with file and line evidence;
- one bounded write scope;
- protocol and schema migration rules;
- authority-domain, principal, daemon-epoch, activation, and recovery rules when
  those surfaces are touched;
- production constructor and adapter names;
- unchanged adversarial tests where possible;
- tests that fail when the new control is disabled;
- full verification commands and expected result classes;
- explicit non-goals;
- rollback or forward-recovery strategy; and
- an owner ratification gate before the next program plan begins.

No plan closes because code exists. It closes when the interface works through
the production path, required proof passes, status and public prose match, and
the result is checkpointed.

## 27. Invariant traceability

The seven decisions cover all 46 invariants exactly as inventoried in the
matrix:

| Decision | Invariants |
|---|---|
| D1 | 04, 05, 10, 11, 12, 25, 26, 27, 28, 29, 30, 31, 32, 34, 39, 43 |
| D2 | 01, 21, 22, 23, 24, 26, 27, 31, 33, 34, 35, 36, 37, 38, 39, 46 |
| D3 | 07, 08, 13, 14, 15, 16, 31, 45 |
| D4 | 06, 07, 08, 15, 16, 21, 23, 31, 42, 45 |
| D5 | 12, 13, 21, 31, 39, 40, 41, 42, 45 |
| D6 | 02, 03, 09, 24, 26, 38, 39, 44, 46, plus activation proof for all invariants |
| D7 | 17, 18, 19, 20, 26, 44 |

Plan ownership follows the primary decision. Cross-decision invariants cannot
activate until every owner decision named in their matrix row is complete.

## 28. Main risks and controls

| Risk | Control |
|---|---|
| Host daemon adds installation friction or leaves authority behind | Versioned install, doctor, upgrade, rollback, uninstall-preserve, uninstall-purge, and reinstall contract with disposable-Mac tests |
| Shared daemon becomes a large shallow module | Keep custody, resources, settlement, and evidence as deep internal modules tested through their own interfaces |
| SQLite library or native dependency harms Mac installation | Preflight supported Node adapters before Plan D; preserve SQLite semantics and clean-checkout gate |
| Subprocess plugins inherit user authority or are mistaken for sandboxed code | Dedicated restricted execution principal, deny-by-default home and IPC access, ticket-bound class labels, and negative principal tests |
| Retry or permit replay duplicates an external effect | Stable logical operation identity, durable reservation, atomic permit consumption, generation and epoch fencing, and no automatic ambiguous retry |
| Provider adapter or local user crosses an authority domain | OS peer credentials, explicit owner-domain roles, per-user broker principals, evidence partitioning, and D4 broker-binding checks |
| Daemon replacement creates split-brain lifecycle effects | OS singleton guard, durable daemon epoch, tagged-resource reconciliation, and paused-predecessor tests |
| Clock rollback preserves dead leases | Epoch-local monotonic deadlines and conservative prior-epoch expiry on restart |
| Parallel D2 and D4 plans drift | Pin shared identity and transaction contracts at B1; require a dedicated C/D integration gate before B2 |
| Constitution becomes ceremonial | Ratified all-46 baseline, exact amendment text, disabled-control tests, generated text, and manifest-closed F/G gates |
| Extraction exposes private history | Fresh Git root, signed source provenance, and scans over every object and ref that can become public |
| Public release occurs accidentally | Exact candidate and ref-set attestation plus separate owner actions for visibility and package publication |

## 29. Design-spec verification criteria

This specification is ready to become implementation plans when:

1. Every D1 through D7 decision has a named module or release surface.
2. The authority and dependency diagrams contain no path from plugin bytes to
   credentials, lifecycle authority, settlement authority, or publication.
3. Policy executes only after a class, restricted principal, custody allocation,
   and durable evaluation state exist.
4. D2 and D4 ownership is non-overlapping at their interfaces and atomic in the
   production adapter, including promotion and acknowledgement recovery.
5. Run and effect state machines account for pending acknowledgement, response
   loss, permit issue and consumption, pre-dispatch failure, post-consumption
   uncertainty, replay, conflict, stale generation and epoch, and immutable
   terminal outcomes.
6. The Codex adapter has both a deterministic mock and an opt-in live acceptance
   path.
7. The machine daemon has explicit service, execution, owner-domain, operator,
   and broker principals plus install-to-purge lifecycle semantics.
8. D5 is explicitly deferred and cannot become accidental release scope.
9. D6 defines the all-46 law and enforcement baseline, proof states, proof
   transition governance, fault points, exact amendments, and public-claim
   consistency.
10. D7 defines the fresh-root private repository, public package seam, CLI,
    service lifecycle, all-reachable-object scan, licensing, and publication
    authority.
11. The traceability and Section 18.8 tables cover all 46 invariant IDs with no
    unknown or unowned ID.
12. All six owner decisions are explicit and are the only blockers before Plan A.

## 30. Owner ratification record

Before implementation-plan authoring, the owner should record one of:

- **Ratified:** accept this specification and all six choices in Section 4.
- **Ratified with amendments:** name each changed section and selected option.
- **Not ratified:** return the design to architecture review.

Recorded owner decision:

- **Status:** Ratified
- **Date:** 2026-08-26
- **Owner:** Vora Technologies, LLC
- **Decision:** Accept this specification and all six choices in Section 4.

Recorded status-model amendment:

- **Status:** Ratified
- **Date:** 2026-08-27
- **Owner:** Vora Technologies, LLC
- **Decision:** Replace overloaded invariant activation status with separate
  `law_status` and `proof_status` lifecycles as specified in Section 18.4.
- **Decision record:**
  `docs/plans/provider-neutral-harness/2026-08-27-invariant-law-proof-status-amendment.md`

Ratification authorizes writing Plan A. It does not authorize implementing Plan
A, creating the standalone repository, installing the daemon, making a live
provider call, or publishing Prism Harness.
