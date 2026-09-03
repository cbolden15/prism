# M3 plugin isolation architecture decision brief

Status: decision in progress

Date: 2026-08-21

Related sources:

- [M3 hybrid restart plan](2026-08-20-m2-hybrid-restart-plan.md#milestone-3-deterministic-runtime-and-evidence-custody)
- [Plugin fault-isolation threat model](2026-08-21-m3-plugin-fault-isolation-threat-model.md)
- [Current PNH architecture](architecture.md)
- [Harness intent and consumer follow-up](2026-08-19-hermes-inspired-pnh-followup.md)
- [Intentional red isolation suite](../../../pnh/tests/m3-plugin-fault-isolation.test.ts)

## What the provider-neutral harness is

PNH is a small embeddable agent harness and security kernel around a headless
agent loop. A consumer supplies an already-authorized task and capability grant
through an adapter. PNH validates that authority, resolves one owner-approved
plugin set, runs bounded work, calls providers only through trusted external
brokers, and returns a terminal result with exact evidence.

It is provider-neutral by design. The public contracts and Runtime do not know
about a particular model provider, consumer deployment, credential source,
endpoint, scheduler, or private policy. X1/C3 is the first consumer and an
important proving ground, but it is not the product definition. The intended
result is a generic harness that other systems can embed without inheriting X1
or provider-specific types and assumptions.

PNH keeps the useful idea from the terminated DeepSeek Harness experiment: a
composable plugin system around a headless agent loop. It does not revive that
implementation. It rebuilds the narrow security and evidence properties that
the experiment showed were missing or too weak.

## Intent behind the harness

The harness is intended to make agent execution inspectable and bounded without
turning the model, repository, or plugin ecosystem into an authority source.
The design aims to:

1. Keep policy and authority in deterministic trusted code outside the model
   worker.
2. Make plugin identity, capability grants, provider routing, budgets, effects,
   and terminal evidence exact and replay-resistant.
3. Let statically approved plugins extend behavior without receiving ambient
   host access, provider credentials, installation authority, or the ability to
   widen a task.
4. Keep the public core small, provider-neutral, consumer-neutral, testable, and
   suitable for later extraction as an open-source component.
5. Fail closed when authority, routing, lifecycle custody, cleanup, or evidence
   is missing or ambiguous.

This is deliberately narrower than a general agent platform. The harness owns
one admitted task at a time. A consumer may put a scheduler or deterministic
program supervisor above it, but the model and plugin system never become the
scheduler.

## Where PNH sits

```text
Consumer control plane
  scheduler, private policy, publication authority
                    |
                    | authorized task + capability grant
                    v
Consumer adapter
                    |
                    v
+------------------------------------------------------+
| Provider-neutral harness                             |
| contracts | deterministic Runtime | evidence/result  |
| capability-secured kernel | admitted plugin set      |
+----------------------+-------------------------------+
                       | task-scoped provider requests
                       v
Trusted external brokers and provider adapters
  credentials, endpoints, native provider behavior

Untrusted plugin containers
  bounded protocol and resources, no credentials or Docker authority
                       |
                       v
Privileged lifecycle daemon
  sole Docker lifecycle writer and cleanup authority
```

Dependency direction is one way. Consumer adapters, provider adapters, and
plugins may depend on public PNH contracts. PNH contracts and Runtime do not
depend on consumer policy, provider SDK types, credentials, endpoints, or
private operational identities.

## Authority and trust model

| Component | Trusted role | Authority it must not receive |
|---|---|---|
| Consumer control plane | Authorizes tasks, schedules work, owns private policy and publication decisions | It cannot rewrite generic PNH contract meaning after admission. |
| PNH core and Runtime | Validate authority, drive deterministic task state, bind evidence, and settle results | They do not hold provider credentials or consumer publication authority. |
| Plugin kernel | Resolves the static registry, derives grants, orders plugins, and enforces capability requests | It cannot admit mutable, ambient, model-authored, or repository-supplied plugins. |
| Plugins and workers | Perform narrowly registered behavior inside admitted limits | They cannot expand grants, install plugins, schedule work, access credentials, or authorize completion or publication. |
| External brokers and lifecycle daemon | Brokers hold provider credentials; the daemon alone holds Docker lifecycle authority | Neither may accept plugin-selected endpoints, identities, routes, or raw Docker arguments. |

Repository content, model output, plugin output, tool output, and worker code are
untrusted. Plugins may narrow authority or reject an operation. They cannot add
authority. Missing or unwritable evidence fails the task closed.

## Non-goals and limits

PNH is not intended to be:

- a public plugin marketplace or runtime package installer;
- a general workflow scheduler or nested agent-orchestration platform;
- a credential host, provider router with fallback, or publication authority;
- a home for consumer-specific policy, durable personal memory, or private
  infrastructure identities;
- a claim of resistance to kernel, container-runtime, or hypervisor escape.

Production plugin sets are static, owner-approved, digest-bound, and resolved
before a task starts. Development loading must remain visibly distinct and
cannot produce production evidence. Hostile third-party distribution would
require a new decision on rootless custody and stronger isolation such as
gVisor, Kata Containers, or Firecracker.

## Current maturity

The harness is real but incomplete:

- The pure deterministic core and its mechanical boundary checks are in place.
- Registry admission, exact plugin-set identity, five-kind registration,
  fail-closed Policy admission, capability grants, and the gated Tool path have
  passed their M2 closure gates.
- Plugin containers, the broker/gateway path, and the sole-writer lifecycle
  supervisor exist with daemon-confirmed cleanup evidence.
- M3 deterministic Runtime state, durable evidence custody, aggregate limits,
  and complete cross-plugin isolation are not implemented yet.
- The current M3 isolation suite is intentionally red at 0/8 because one global
  supervisor queue blocks unrelated plugins during failing cleanup.

Milestone 4 artifact and sandbox hardening is also still pending. This branch is
not approval for deployment, hostile third-party plugins, public distribution,
or a production marketplace.

## Why plugin isolation matters to the harness intent

The topology choice is not only a performance or reliability question. PNH
claims that an admitted plugin receives narrow authority and that evidence is
truthful about which plugin caused which effect. If one ordinary plugin failure
can block, settle, or contaminate another plugin's work, the implementation no
longer matches that claim even when the containers remain separate.

At the same time, solving the problem by cloning Docker-capable supervisors
would weaken the harness's least-authority design. The decision must preserve
both sides of the intent: strong plugin-local containment and one narrow,
auditable privileged lifecycle boundary.

## Why this decision exists

PNH runs plugins as separate containers but currently routes every allocation
through one supervisor-wide promise queue. The committed M3 isolation suite
launches a failing plugin and an unrelated plugin concurrently. All eight cases
fail because cleanup for the failing plugin blocks status and input progress for
the unrelated plugin.

That result proves the current implementation does not provide logical fault
isolation. It does not prove that logical isolation is architecturally
impossible. The decision is whether to repair the shared control plane, split
the whole control plane per plugin, or use privilege separation to combine one
Docker authority with physically isolated unprivileged control cells.

## Fixed security constraints

These are not part of the open decision:

1. Plugin code is fully malicious and runs inside a separately constrained
   container.
2. Logical fault cells are availability and correctness mechanisms, not security
   boundaries.
3. The plugin container is the untrusted-code boundary. The privileged lifecycle
   daemon is the Docker-authority boundary.
4. An attributed ordinary plugin failure must not disrupt unrelated plugins.
5. Physical splitting is not justified merely because the current global queue
   is incorrect. It requires evidence that properly bounded logical cells remain
   insufficient.

## Decisions currently open

### 1. Control-cell topology

Should plugin lifecycle, parsing, accounting, and evidence state remain in one
shared process with plugin-keyed cells, or should some of that state move into a
separate process per plugin?

### 2. Docker authority placement

Should Docker authority remain in one minimal daemon, or should each plugin
control plane receive its own Docker-capable supervisor? This is a separate
choice from process isolation. Physical control cells do not require distributed
Docker authority.

### 3. Plugin protocol parsing

Shared parsing is a common process-failure surface. The decision is whether M3
accepts parsing inside the shared trusted Runtime, or requires parsing to move
behind an unprivileged per-plugin process boundary if adversarial tests show
cross-plugin effects.

### 4. Aggregate resource arbitration

Per-plugin limits belong to the plugin cell. Aggregate CPU, memory, concurrency,
and decoded-byte limits still need one shared arbiter. That arbiter must reserve
and release capacity without owning plugin settlement or interpreting plugin
payloads.

### 5. Escalation threshold

The project needs an explicit threshold for moving from logical cells to
physical unprivileged cells. The threshold should be evidence that bounded,
attributed plugin input can still crash, stall, corrupt, or exhaust the shared
trusted process after logical cells and aggregate limits are implemented.

## Option A: shared control plane with logical plugin cells

Shape:

```text
Plugin containers
      ↓ bounded attributed bytes
Shared Runtime, broker, and gateway
      ↓ authenticated lifecycle commands
One privileged lifecycle daemon
```

Each allocation receives its own queue, timers, lifecycle state, byte counters,
concurrency accounting, cleanup path, and evidence chain. A narrow shared arbiter
owns aggregate reservations. The lifecycle daemon remains the sole Docker
writer.

Advantages:

- Preserves one privileged principal and the existing ticket-bound lifecycle
  path.
- Requires the smallest M3 change and directly addresses the 0/8 red suite.
- Keeps aggregate scheduling, replay protection, and evidence ordering easier to
  inspect.
- Avoids process, channel, token, startup, shutdown, and receipt-reconciliation
  multiplication.

Disadvantages:

- A shared process crash, compromise, event-loop stall, or memory exhaustion can
  still affect every plugin.
- Shared protocol parsing can turn one malicious payload into a process-wide
  failure.
- Correct isolation depends on disciplined ownership of every queue, timer,
  counter, and terminal transition.
- Passing ordinary fault tests can create false confidence if process-wide
  adversarial cases are not tested separately.

Security assessment: acceptable for M3 if the supervisor remains payload-blind,
the eight isolation tests pass, and parser, CPU, memory, identity, accounting,
and evidence tests show no cross-plugin effect. Logical cells must never be
described as sandboxing.

## Option B: one complete Docker-capable control plane per plugin

Shape:

```text
Plugin A container → broker A → Docker-capable supervisor A
Plugin B container → broker B → Docker-capable supervisor B
Plugin C container → broker C → Docker-capable supervisor C
```

Advantages:

- OS process boundaries reduce accidental shared-state corruption and
  head-of-line blocking.
- A parser crash or event-loop stall can be confined to one plugin control
  plane.
- Local state machines are smaller because each process owns fewer allocations.

Disadvantages:

- Multiplies Docker-capable principals, authenticated channels, secrets or
  tokens, and argument-validation surfaces.
- Expands the number of components whose compromise can become host compromise.
- Makes aggregate budgets, global replay protection, shutdown, and retained
  receipt reconciliation more complicated.
- Adds process storms, startup latency, memory overhead, monitoring paths, and
  upgrade coordination.

Security assessment: stronger process isolation paired with materially worse
privilege distribution. This is not the recommended architecture. The process
boundary is valuable, but cloning Docker authority is the wrong way to obtain
it.

## Option C: per-plugin unprivileged control cells with one lifecycle daemon

Shape:

```text
Plugin A container → unprivileged cell A ┐
Plugin B container → unprivileged cell B ├→ one privileged lifecycle daemon
Plugin C container → unprivileged cell C ┘
```

Each cell process owns attributed parsing, per-plugin queues, timers, limits,
and evidence preparation. A narrow shared Runtime or arbiter owns admission,
aggregate reservations, replay, and final evidence policy. The lifecycle daemon
accepts only authenticated, ticket-resolved lifecycle commands and remains the
sole Docker writer.

Advantages:

- Provides process isolation for parser crashes, event-loop stalls, and local
  memory failures without multiplying Docker authority.
- Keeps the privileged daemon small, payload-blind, and easier to audit.
- Makes plugin-local ownership explicit while preserving centralized admission
  and aggregate policy.
- Offers a clean escalation path from Option A if interfaces are designed around
  a control-cell port now.

Disadvantages:

- Adds per-plugin processes, authenticated channels, startup and shutdown
  coordination, and health monitoring.
- Requires careful identity binding so one cell cannot impersonate another.
- Aggregate reservations and terminal evidence cross a process boundary and need
  replay-safe protocols.
- Costs more memory and operational complexity than logical cells.

Security assessment: this is the strongest practical architecture if physical
control-plane isolation is required. Its viability is pending evidence that
logical cells remain insufficient and validation of process, channel, and
resource overhead.

## Comparison

| Criterion | Option A: logical cells | Option B: Docker control plane per plugin | Option C: unprivileged process per plugin |
|---|---|---|---|
| Ordinary fault isolation | Strong if ownership is correct | Strong | Strong |
| Shared parser/process blast radius | Higher | Lower | Lower |
| Docker-capable principals | One | One per plugin | One |
| Aggregate budget coordination | Simplest | Hardest | Moderate |
| Operational complexity | Lowest | Highest | Moderate |
| Fit for current M3 evidence | Best immediate fit | Not justified | Escalation architecture |

## Provisional recommendation

Choose Option A for M3, but design the logical cell behind an interface that can
move into the Option C process boundary without changing admission tickets,
capability grants, lifecycle receipts, or event semantics.

Reject Option B unless a future constraint makes a single lifecycle daemon
impossible. No current evidence supports multiplying Docker authority.

Option A remains provisional until it passes:

1. The eight ordinary concurrent isolation cases.
2. Attributed malformed-protocol and forged-identity cases.
3. CPU starvation and memory-pressure cases.
4. Cross-plugin aggregate accounting and event-chain cases.
5. Shared-process loss cases classified separately from ordinary plugin faults.

If bounded attributed input still produces process-wide effects after those
controls exist, move to Option C. That is evidence that logical isolation is
insufficient. It is not evidence for Option B.

## Decision checkpoint

**Partially settled on 2026-08-22. See
`2026-08-22-m3-isolation-topology-decisions.md` for the recorded decisions and
`2026-08-22-m3-option-a-checkpoint-brief.md` for the evidence behind them.**

| Decision | State |
|---|---|
| Option A approved as the M3 implementation target | **Ratified, narrowly.** The implementation is accepted as correct; Option A's provisional status is *not* retired |
| Option C approved as the only physical-isolation escalation path | **Ratified** |
| Option B explicitly rejected because it expands Docker authority | **Ratified** |
| Which adversarial result is sufficient to trigger Option C | **Ratified**, with an ordering constraint: evidence gathered before the aggregate arbiter exists does not count |
| Whether hostile third-party plugin distribution changes the decision before Milestone 4 hardening | Still open |

The narrow step this section previously authorized — repair the shared global
queue into plugin-keyed logical cells and evaluate Option A against the red suite
— is complete and merged (`cb10ead`). It passed criterion 1 of the five below and
produced evidence that criterion 4 currently fails.

The next step is not yet authorized. On the evidence, it should be the aggregate
arbiter of decision 4: per-allocation ingest accounting, and a concurrency bound
on Docker invocations. Physical splitting remains unauthorized, and decision 5's
ordering constraint means the adversarial suite for criteria 2, 3, and 5 should
wait for the arbiter rather than run against a system that lacks it.
