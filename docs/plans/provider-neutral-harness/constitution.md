# Prism Harness constitution

This document is the canonical normative reference for Prism Harness, the
provider-neutral harness. Narrative prose is non-normative and explanatory; on any conflict,
the generated registry text binds. Source of law:
`assurance/constitution/contracts/invariants.yaml`. Gate: `npm run test:constitution`.

## 1. Doctrine

Prism Harness runs one admitted task against a fixed set of
plugins, under a consumer control plane that owns scheduling and publication.
The harness supplies mechanism: admission, capability grants, isolation,
lifecycle custody, and evidence. It supplies no judgment about which work is
worth doing and no authority to release the result.

This document governs the properties any conforming harness holds: who may act,
what a plugin may be handed, what counts as proof that something happened, and
where the boundary between trusted and untrusted code sits. It does not
describe a build, a schedule, or a codebase. Plans, reviews, audits, and test
suites conform to it and cite the invariant IDs they touch.

The source of law is `assurance/constitution/contracts/invariants.yaml`. Each chapter renders the
registry entries for its category between generated markers, so the binding
text in this file cannot drift from the registry the tests read. Narrative
prose is non-normative and explanatory; on any conflict, the generated registry
text binds. A handwritten paragraph that contradicts a registered statement is
an editorial bug, not a change of law, and PNH-INV-44 is what makes that
resolution automatic rather than a matter of opinion.

Changing the law is a three-part act performed in one change: a dated decision
record explaining the change, the corresponding edit to the registry, and a
regenerated baseline (`npx tsx assurance/constitution/scripts/generate-constitution.ts` for this
file, `--update-lock` for `invariants.lock`). The amendment entry cites the
decision record, and the amendment log in chapter 14 is built from those
citations. Every binding field is covered, quantitative bounds included:
relaxing a limit is an amendment, not a tune. In a single-owner repository no
in-repo mechanism can stop the owner from changing anything, so these checks
aim at a narrower goal. They make each change of law loud, deliberate, and
attributable.

Proof carries its own standard. PNH-INV-09 governs what may be offered as
conformance evidence, which keeps the registry's proving lists from filling up
with suites that name a fault they never inject.

<!-- pnh:invariants:doctrine:begin -->
**PNH-INV-09 — Proof runs production paths and injects the fault it names** (law: ratified; proof: unproven)

Conformance proof must exercise production constructors and protocol paths and must inject the fault it claims to prove; fixture-only parity, label-only cases, and skipped required suites never count as proof.

Proof incomplete: The gate verifies executed registrations, but it does not yet verify production-path use, fault injection, or failure when a control is disabled. Enforcement: release-or-architecture-gate. First release: activate; gates A, F.

**PNH-INV-44 — Narrative prose is non-normative** (law: ratified; proof: unproven)

The constitution's narrative prose is explanatory and non-normative; on any conflict between narrative prose and a registered invariant statement, the registered statement binds.

Proof incomplete: Generated sections come from the registry, but no gate detects or resolves conflicting hand-written narrative prose. Enforcement: generated-document-consistency. First release: activate; gates A, G.
<!-- pnh:invariants:doctrine:end -->

## 2. Authority model

Authority in this system is granted, never inferred. It enters at the top from
a consumer control plane that authorizes a task, and it narrows on the way
down. Nothing below re-enters above: a plugin cannot install another plugin,
schedule work, or declare a result published, because none of those powers were
handed to it and no amount of well-formed output can manufacture them.

| Principal | Trust | Role |
|---|---|---|
| Consumer control plane | trusted | Authorizes the task and holds publication authority (PNH-INV-17), and cannot restate what an admitted contract means (PNH-INV-28). |
| Harness runtime and adapter | trusted | Derives capability grants from the single admission ticket (PNH-INV-04, PNH-INV-11) after policy admission clears (PNH-INV-05). |
| Container broker and gateway | trusted | The plugin-facing surface: carries protocol frames and asks the lifecycle principal for container actions. |
| Lifecycle principal | trusted | The one host-scoped authority that creates and destroys plugin containers and issues cleanup evidence (PNH-INV-33, PNH-INV-34). |
| Provider broker | trusted, external | Sole holder of provider credentials, sessions, and endpoints (PNH-INV-13, PNH-INV-14). |
| Aggregate arbiter | trusted, payload-blind | Reserves and releases host capacity without settling any plugin's work (PNH-INV-35). |
| Plugin container | untrusted | Executes plugin code under the assumption that it is fully malicious (PNH-INV-25); it may narrow its authority, never widen it (PNH-INV-12, PNH-INV-30). |
| Repository content, model output, tool output | untrusted | Data to be processed, never a source of authority (PNH-INV-10). |

The topology follows from that grant direction. An untrusted container's only
connection is upward into the broker and gateway layer, which speaks the pinned
plugin protocol and nothing else. The lifecycle principal acts on containers
and never listens to them.

```
             consumer control plane
                      |  admitted task, generic contracts
                      v
        harness runtime + consumer adapter
                      |                         \  authorized provider work
                      |                          v
                      |                    provider broker  (holds credentials)
                      v
        container broker / gateway  (sole plugin-facing surface)
             |                    ^
             | authenticated      | plugin protocol frames
             | lifecycle commands |
             v                    |
        lifecycle principal       |
             |                    |
     creates | destroys           |
             v                    |
        plugin container  --------+
           (untrusted)
```

No edge runs from a plugin container to the lifecycle principal, to the
provider broker, or to the consumer control plane. Container-runtime authority
is reachable only through authenticated, ticket-resolved commands issued by
trusted code (PNH-INV-34), and routes and identities are fixed by the harness
rather than chosen by the caller (PNH-INV-31). That is what keeps a compromised
plugin's reach limited to arguing with a parser.

<!-- pnh:invariants:authority:begin -->
**PNH-INV-04 — One opaque admission ticket** (law: ratified; proof: proven)

Verified registry bytes produce exactly one opaque, deeply frozen admission ticket; the harness derives authority from that ticket alone and never accepts a second registry object or a caller-constructed substitute.

Enforcement: runtime-adversarial. First release: retain; reprove the new authority root; gates B2, F. Structured proof: `pnh/tests/admission-ticket.test.ts`.

**PNH-INV-05 — Policy admission gates grant derivation** (law: ratified; proof: unproven)

Policy admission must succeed before any non-Policy capability grant is derived, and explicit Policy denial, timeout, crash, malformed response, or protocol failure fails the task closed.

Proof incomplete: No production-path suite injects every named Policy failure before grant derivation and proves that each path denies all non-Policy grants. Enforcement: runtime-adversarial. First release: activate; gates B2, F.

**PNH-INV-10 — All inbound content is untrusted** (law: ratified; proof: unproven)

Repository content, source, instructions, tests, diffs, model output, plugin output, tool output, and worker code are untrusted, and no component may treat them as authority.

Proof incomplete: The statement spans multiple content classes and components without a complete authority-confusion suite for each inbound boundary. Enforcement: runtime-adversarial. First release: activate; gates B2, C, E, F.

**PNH-INV-11 — Only a validated task and grant confer authority** (law: ratified; proof: unproven)

Authority comes only from a validated task and a validated capability grant; ambient references, configuration, and prior state never confer authority.

Proof incomplete: No adversarial suite attempts to derive authority from ambient references, configuration, and prior state across every admission path. Enforcement: runtime-adversarial. First release: activate; gates B2, F.

**PNH-INV-17 — Publication authority is the consumer's alone** (law: ratified; proof: unproven)

Only the consumer control plane may authorize publication; no worker, plugin, model, repository content, harness core component, or runtime holds publication authority.

Proof incomplete: Publication is not implemented as a public workflow, so unauthorized publication attempts from every named component cannot yet be tested. Enforcement: release-or-architecture-gate. First release: activate; gates G.

**PNH-INV-28 — Contract meaning is fixed at admission** (law: ratified; proof: unproven)

No consumer control plane may rewrite the meaning of a generic harness contract after admission.

Proof incomplete: No conformance suite mutates admitted contract meaning through a consumer adapter and proves that every rewrite attempt is rejected. Enforcement: runtime-adversarial. First release: activate; gates B2, F.

**PNH-INV-30 — Plugins never install or schedule** (law: ratified; proof: unproven)

A plugin or worker must never install a plugin, schedule work, or authorize completion.

Proof incomplete: No malicious-plugin and malicious-worker suite attempts all three authority classes through production command paths. Enforcement: runtime-adversarial. First release: activate; gates B2, F.
<!-- pnh:invariants:authority:end -->

## 3. Task law

A harness instance holds one admitted task. Everything about the task is
resolved before it starts: the ticket, the plugin set, the deadline.
That single-task shape is what makes evidence legible. Every receipt, every
container, and every reservation belongs to one identifiable unit of work, so a
question about what happened has one answer rather than a race between several.

Scheduling, queueing, retry policy, and prioritization live above the adapter,
in the consumer control plane that owns them anyway. Parallelism is expressed by
running several harness instances, not by admitting several tasks into one. The
host-scoped principals in chapters 7 and 10 are what make that safe: instances
share one lifecycle authority and one arbiter, each carrying per-instance
identity, so running more instances multiplies throughput without multiplying
container-runtime writers or letting each instance spend the whole host.

<!-- pnh:invariants:task:begin -->
**PNH-INV-32 — One admitted task at a time** (law: ratified; proof: unproven)

The harness admits exactly one task; scheduling, queueing, and concurrency belong to the consumer control plane above the adapter.

Proof incomplete: No admission test submits a second task through the production entrypoint and proves that scheduling authority remains outside the harness. Enforcement: runtime-adversarial. First release: activate; gates B2, F.
<!-- pnh:invariants:task:end -->

## 4. Plugin law

A plugin is a unit of borrowed capability, and it has no ambient authority to
fall back on (PNH-INV-11). The pinned plugin protocol
(PNH-PROTO-01) carries the kind vocabulary the harness understands: policy,
memory, tool, provider, and renderer. Kind determines what a plugin may be
asked to do and what it may be handed, which is why the vocabulary is part of a
pinned schema rather than a convention each side interprets for itself.

The admitted set is decided by the owner before work begins, pinned by
digest, and closed for the duration of the task (PNH-INV-29). The owner can
therefore say exactly what ran, and a repository, a model, or a plugin cannot
add another participant partway through. Within the set, authority only ever
narrows: a plugin may decline work or accept less than the harness grants it,
and has no path to obtain more for itself or for a neighbor (PNH-INV-12).

Every boundary a plugin's bytes cross is a versioned serialized protocol with
enforced limits, and the limit values live in the registry so tests import them
instead of restating them (PNH-INV-02, PNH-INV-03). Bounded parsing that fails
closed is the difference between a hostile payload costing one allocation and a
hostile payload costing the process. The same rule reaches forward to the cell
boundary of chapter 6: if fault cells move apart, the port between them is a
pinned protocol like any other (PNH-INV-39), and the move changes no ticket, no
grant, no receipt, and no event meaning.

<!-- pnh:invariants:plugin:begin -->
**PNH-INV-02 — One versioned wire vocabulary across all boundaries** (law: ratified; proof: proven)

Exactly one versioned serialized frame vocabulary crosses the runtime, adapter, broker, runner, and plugin SDK boundaries, and every such boundary is pinned in this registry by version and schema hash.

Enforcement: static-structure. First release: retain; reverify every adapter and protocol pin; gates A, F. Structured proof: `pnh/tests/plugin-protocol.test.ts`.

**PNH-INV-03 — Frames are bounded and fail closed** (law: ratified; proof: proven)

Every frame carries enforced bounds on frame bytes, cumulative bytes, message count, nesting depth, string bytes, array length, and object keys, with the values held in this registry; a frame that fails text decoding or violates any bound fails its allocation closed and is never repaired, coerced, or partially interpreted.

Bounds: `max_frame_bytes = 1000000`, `max_cumulative_bytes = 8000000`, `max_message_count = 256`, `max_json_depth = 16`, `max_string_bytes = 65536`, `max_array_length = 1024`, `max_object_keys = 128`. Enforcement: runtime-adversarial. First release: retain; rerun all parser boundaries; gates A, F. Structured proof: `pnh/tests/protocol-bounds.test.ts`.

**PNH-INV-12 — Plugins narrow authority and never widen it** (law: ratified; proof: unproven)

A plugin may narrow its authority or reject work, and must never expand, widen, or add authority for itself or for another plugin.

Proof incomplete: No malicious-plugin suite attempts grant widening for itself and another plugin through every plugin-to-harness command path. Enforcement: runtime-adversarial. First release: activate; gates B2, F.

**PNH-INV-29 — Static owner-approved digest-bound plugin sets** (law: ratified; proof: partial)

An admitted plugin set is static, owner-approved, digest-bound, and fully resolved before a task starts; mutable, ambient, model-authored, or repository-supplied plugins are never admissible.

Proof incomplete: The supported production entrypoint does not yet make owner-approved digest pins technically unavoidable. Enforcement: runtime-adversarial. First release: activate; partial until the production entrypoint enforces owner pins; gates A, B2, F. Evidence (partial; not complete proof): `pnh/tests/admission-ticket.test.ts`, `pnh/tests/pinned-admission.test.ts`.

**PNH-INV-39 — Cell port is a message protocol** (law: ratified; proof: unproven)

The plugin cell boundary is a versioned serialized message protocol pinned in this registry at introduction; moving cells out of process must not change admission tickets, capability grants, lifecycle receipts, or event semantics.

Proof incomplete: The current pins cover existing wire surfaces, but no out-of-process cell implementation proves semantic compatibility across a topology change. Enforcement: runtime-adversarial. First release: defer; no first-release conformance claim; gates H.
<!-- pnh:invariants:plugin:end -->

## 5. Bridge law

Useful capability lives in foreign ecosystems, the Model Context Protocol
first among them. Bridge law exists so that capability can be
inherited without inheriting a second admission path. A bridge is an ordinary
admitted plugin (PNH-INV-40): containerized like any other, scoped by grants
like any other, and digest-bound by packaging the foreign server inside the
plugin image so the owner approves a specific artifact rather than a name.

What the bridge exposes is frozen at admission. Every method family the foreign
protocol offers, tools and resources and prompts and subscriptions alike, is
enumerated with schema hashes, and anything absent from that enumeration is
denied (PNH-INV-41). A foreign server that grows a new method after admission
therefore gains nothing; it has to be re-admitted.

Enforcement sits outside the container. A trusted harness-side mediator
compares each dispatch against the admitted surface before forwarding it and
produces the evidence itself, so no record of a foreign call depends on the
bridge's own account of what it did (PNH-INV-42). A surface mismatch fails the
allocation closed, and drift discovered after dispatch settles as ambiguous
under chapter 9 rather than as an ordinary fault, because at that point the
harness genuinely does not know what the far side did.

One consequence is worth naming. A server reachable only over the network
cannot be packaged into an image and pinned by digest, so it does not satisfy
what PNH-INV-40 admits. Widening bridge law to cover remote servers is an
amendment with a decision record behind it, not an oversight to be quietly
patched.

<!-- pnh:invariants:bridge:begin -->
**PNH-INV-40 — Bridges are ordinary admitted plugins** (law: ratified; proof: unproven)

A foreign-capability bridge is an ordinary admitted plugin: containerized, capability-scoped, credential-free, and digest-bound by packaging the bridged server inside the plugin image.

Proof incomplete: No foreign-capability bridge implementation or production conformance path exists yet. Enforcement: runtime-adversarial. First release: defer; with D5; gates H.

**PNH-INV-41 — Frozen foreign surface, default deny** (law: ratified; proof: unproven)

The bridged foreign surface is enumerated at admission with schema hashes across every method family; any family or member not explicitly admitted is denied.

Proof incomplete: No bridge admission registry or fault-injection suite currently proves complete surface enumeration and default denial. Enforcement: runtime-adversarial. First release: defer; with D5; gates H.

**PNH-INV-42 — Trusted mediation and attribution** (law: ratified; proof: unproven)

Foreign-method dispatch is compared against the admitted surface and evidenced by a trusted harness-side mediator outside the plugin container; foreign-method evidence is never taken from the bridge's own claim, and a surface mismatch fails the plugin allocation closed with post-dispatch drift settling as ambiguous.

Proof incomplete: The trusted bridge mediator and its mismatch and post-dispatch ambiguity paths have not been implemented or adversarially tested. Enforcement: runtime-adversarial. First release: defer; with D5; gates H.
<!-- pnh:invariants:bridge:end -->

## 6. Isolation law

A fault cell is the partition that owns one plugin allocation's queues, timers,
cleanup, and evidence (PNH-INV-22). When a plugin misbehaves, the blast radius
is meant to be its own cell: other plugins in the admitted set keep working,
keep their deadlines, and settle on their own terms (PNH-INV-01, still
proposed).

Byte limits are the known exception, and the law does not yet claim them. The
supervisor command loop meters raw transport bytes across every allocation
against one shared ceiling, because a chunk is counted before any frame is
parsed and so cannot be attributed to an allocation at the point it is
measured. A byte-heavy plugin can still tear that channel down for everyone.
PNH-INV-22 is deliberately mute on byte limits until per-allocation ingest
accounting is designed; see
`2026-08-21-m3-logical-cells-plan.md`.

This chapter deliberately mandates properties rather than a topology. Whether
cells are partitions inside one trusted process or separate processes is an
engineering choice; attribution, containment, and the interference bound are
law either way. Two rules make the choice honest instead of convenient.
Attribution is established outside plugin-controlled bytes, before any output
or failure is routed anywhere (PNH-INV-21), because a cell that learns whose
work it holds by reading the payload can be told a lie. And interference is a
number, not a feeling: the bound lives in the registry and tests import it
(PNH-INV-38), so "isolated enough" has an answer that a suite can disagree with.

Moving cells apart is the escalation, and it has a trigger rather than a
schedule. Bounded, attributed plugin input that still produces process-wide
effects after logical cells and limits exist is evidence that an in-process
control was defeated, and that evidence is the price of admission for a split
(PNH-INV-24). A proposal to split accounts for what it costs: processes,
channels, keys, receipt reconciliation, and the lifecycle-authority changes
that follow (PNH-INV-46). Splitting is not free security, which leads to the
last point of this chapter.

Fault cells are availability and correctness mechanisms and carry no security
guarantee (PNH-INV-26). The security boundaries are fixed elsewhere and named
once: the plugin container is the untrusted-code boundary, and the lifecycle
principal is the container-authority boundary (PNH-INV-27). Plugin code is
treated as fully malicious inside its own constrained container (PNH-INV-25),
so containment does not depend on a cell behaving well.

<!-- pnh:invariants:isolation:begin -->
**PNH-INV-01 — Ordinary plugin faults stay inside their fault cell** (law: ratified; proof: unproven)

An attributed ordinary failure of one plugin must not block, settle, or contaminate the work of any other plugin in the admitted set.

Proof incomplete: Representative fault-cell tests do not prove every ordinary failure class under the ratified deterministic scheduler model. Enforcement: runtime-adversarial. First release: activate; gates C, F.

**PNH-INV-21 — Attribution comes from outside plugin bytes** (law: ratified; proof: unproven)

Allocation identity is established outside plugin-controlled bytes before any output or failure is routed into a cell; attribution must never be derived from plugin payload content.

Proof incomplete: M3 rejects representative forged identities, but it does not yet cover every output and failure route or prove failure with attribution disabled. Enforcement: runtime-adversarial. First release: activate; gates C, D, F.

**PNH-INV-22 — Work, limits, cleanup, and evidence are allocation-scoped** (law: ratified; proof: partial)

Each plugin allocation's queue, timers, and cleanup path are scoped to its own fault cell; in ordinary operation a blocked or failing cell, including a second allocation of the same plugin, never stalls another allocation's queued work or the evidence it produces, and cleanup once accepted cannot be cancelled by a concurrent shutdown or dispose. Supervisor shutdown is the bounded exception: it reaps cells in fixed-width batches to cap concurrent container teardown, so a cell that hangs during shutdown can delay the reaping of cells in later batches.

Proof incomplete: Existing evidence does not cover every admitted execution class through its production constructor. Enforcement: runtime-adversarial. First release: activate; for every production class; partial until then; gates A, B2, C, F. Evidence (partial; not complete proof): `pnh/tests/m3-plugin-fault-isolation.test.ts`.

**PNH-INV-24 — Physical splitting requires defeated-control evidence** (law: ratified; proof: unproven)

Moving fault cells out of the shared trusted process is never legal without evidence that a specific attributed failure defeated a specific in-process control and that no smaller correction restores the bound.

Proof incomplete: M3 used a smaller correction successfully, but no enforceable review gate yet validates this evidence standard when a physical split is proposed. Enforcement: release-or-architecture-gate. First release: activate; gates A, F.

**PNH-INV-25 — Plugin code is assumed fully malicious** (law: ratified; proof: unproven)

Every admitted plugin executes under the execution class bound at admission. Code treated as hostile uses a separately constrained isolation class with production proof for its named boundary. Owner-reviewed subprocess code runs only under the restricted Prism execution principal, is never described as sandboxed, and receives no user, broker, operator, or publisher authority. Development code cannot produce production evidence or privileged effects.

Proof incomplete: No production proof covers every admitted execution class, including hostile container isolation, restricted trusted subprocess authority, and development-mode exclusion. Enforcement: runtime-adversarial. First release: activate; after exact amendment; gates A, B2, F.

**PNH-INV-26 — Fault cells are not security boundaries** (law: ratified; proof: unproven)

Fault cells are availability and correctness mechanisms and must never be relied on as security boundaries.

Proof incomplete: Documentation states this boundary, but no public-surface labeling gate yet prevents fault-cell isolation from being presented as sandboxing. Enforcement: generated-document-consistency. First release: activate; gates A, F, G.

**PNH-INV-27 — Fixed boundary designation** (law: ratified; proof: unproven)

Every production execution class has one admission-bound authority boundary and one custody principal. `container-isolated-v1` uses the plugin container as its hostile-code boundary. `trusted-subprocess-v1` uses a dedicated restricted OS principal as its ambient-authority boundary but makes no hostile-code sandbox claim. The host custody daemon remains the sole lifecycle principal for both. `development-v1` is non-production.

Proof incomplete: No production proof establishes the exact authority boundary and custody principal for every execution class. Enforcement: runtime-adversarial. First release: activate; after exact amendment; gates A, B2, C, F.

**PNH-INV-38 — Bounded cross-plugin interference** (law: ratified; proof: unproven)

Under legal registry-bounded load, every ready allocation receives one scheduler quantum before any ready allocation receives a second. One full rotation contains at most `max_live_allocations` turns, and each turn admits at most `max_commands_per_event_loop_turn` commands. All bounds live in this registry and tests import them. Wall-clock latency is not a universal invariant; any wall-clock claim requires a separately approved controlled performance qualification on a named environment.

Proof incomplete: Deterministic full-rotation fairness is not yet proven under every legal registry-bounded load. Bounds: `max_live_allocations = 32`, `max_live_allocations_per_plugin = 8`, `max_concurrent_docker_invocations = 4`, `max_command_bytes_per_allocation = 8000000`, `max_command_ids_per_allocation = 4096`, `max_tracked_command_allocations = 64`, `max_recent_command_ids = 4096`, `max_recent_acknowledged_allocations = 4096`, `max_commands_per_event_loop_turn = 8`, `max_wire_frame_bytes = 1000000`, `max_wire_buffer_bytes = 8000000`. Enforcement: runtime-adversarial. First release: activate; after exact amendment; gates A, C, F. Evidence (unproven; not complete proof): `pnh/tests/m3-aggregate-arbiter.test.ts`, `pnh/tests/m3-adversarial-isolation.test.ts`.

**PNH-INV-46 — Escalation review content** (law: ratified; proof: unproven)

An escalation review that proposes moving fault cells out of process must identify the defeated control, show why a smaller correction is insufficient, and account for the resulting process, channel, key-management, receipt-reconciliation, and lifecycle-authority changes.

Proof incomplete: The M3 decision did not escalate topology, and no enforceable review template or gate validates all required content for a future escalation. Enforcement: release-or-architecture-gate. First release: activate; gates A, F.
<!-- pnh:invariants:isolation:end -->

## 7. Lifecycle authority

One principal per host creates and destroys plugin containers, and its
confirmations are the only thing the harness accepts as cleanup evidence
(PNH-INV-33). Single-ness is usually argued from privilege, and privilege is
part of it, but the stronger reason is custody. With one writer there is one
account of what was created and what was reaped, and a container that no
receipt explains is a contradiction rather than a plausible artifact of some
other writer. Several writers turn every question about a leaked container into
a reconciliation problem.

Host scope is what lets instance-level parallelism stay cheap. All harness
instances on a host share the principal and stamp per-instance identity onto
every command, so adding instances adds callers rather than container-runtime
writers.

The principal is deliberately incurious. It accepts ticket-resolved
authenticated commands, and it does not read plugin payloads, honor
plugin-selected identities, or take raw runtime arguments from anyone
(PNH-INV-34). Its vocabulary is small on purpose: a component this privileged
should be auditable by reading its command schema, which is why that schema is
pinned as a protocol in chapter 14 rather than left to convention.

The law is stated substrate-neutrally. Rootful and rootless container runtimes
both satisfy it, and stronger sandbox classes do as well, because what matters
is the shape of the authority and not the mechanism that grants it. Independent
deadlines and a cleanup path that plugin, runtime, and broker failure cannot
cancel (PNH-INV-23) complete the arrangement: nothing a plugin does, and no
crash upstream of the principal, removes the guarantee that the allocation ends
and is reaped.

<!-- pnh:invariants:lifecycle:begin -->
**PNH-INV-23 — Uncancellable deadline and cleanup path** (law: ratified; proof: partial)

Every allocation has an independent hard deadline and a confirmed cleanup path that plugin, runtime, and broker failure cannot cancel.

Proof incomplete: Cleanup truth is not yet scoped by execution class and stronger containment is not established. Enforcement: runtime-adversarial. First release: activate; by execution class; partial until then; gates A, C, D, F. Evidence (partial; not complete proof): `pnh/tests/plugin-container-supervisor.test.ts`.

**PNH-INV-33 — Single host-scoped lifecycle principal** (law: ratified; proof: unproven)

Exactly one lifecycle principal per host may create or destroy plugin containers; all harness instances on the host share it, every command carries per-instance identity, and its confirmations are the sole source of cleanup evidence.

Proof incomplete: The supervisor tests cover one lifecycle principal instance, but the implementation does not provide one shared principal across all host instances. Enforcement: runtime-adversarial. First release: activate; gates C, F. Evidence (unproven; not complete proof): `pnh/tests/plugin-container-supervisor.test.ts`.

**PNH-INV-34 — Payload-blind lifecycle authority** (law: ratified; proof: unproven)

The lifecycle principal accepts only ticket-resolved authenticated lifecycle commands and never interprets plugin payloads, plugin-selected identities, or raw container-runtime arguments.

Proof incomplete: No complete negative suite injects payloads, identities, and raw runtime arguments into every authenticated lifecycle command path. Enforcement: runtime-adversarial. First release: activate; gates B2, C, F.
<!-- pnh:invariants:lifecycle:end -->

## 8. Broker law

Two different components are called brokers, and conflating them is how
credentials end up somewhere they should not be. This document uses the terms
strictly.

A **provider broker** is a trusted external service that holds provider
credentials, subscription sessions, publisher credentials, and provider
endpoints, and performs authorized calls on the harness's behalf. A **container
broker** is a trusted harness-side component that mediates plugin traffic and
asks the lifecycle principal for container actions. The container broker never
holds provider credentials, and the provider broker never touches container
lifecycle.

Credentials stay inside provider brokers (PNH-INV-13). No plugin, worker,
runtime, or core component receives them, and none of them receives open-ended
broker access either, because a general-purpose broker call is a credential in
all but name. Provider and model identity stay exact after authorization
(PNH-INV-14): no alias resolution, no silent upgrade, no substitution, no
fallback. An owner who authorized one model gets that model or an error, not
a helpful approximation whose output looks identical in the log.

Neither kind of broker takes routing instructions from below. Endpoints,
identities, and routes are fixed by trusted configuration, never selected by a
plugin (PNH-INV-31), which closes the path where a plugin's output becomes the
address its own traffic goes to.

<!-- pnh:invariants:broker:begin -->
**PNH-INV-13 — Credentials live only in trusted brokers** (law: ratified; proof: unproven)

Provider credentials, subscription sessions, publisher credentials, and provider endpoints are held only by trusted external brokers; no plugin, worker, harness core component, or runtime ever receives them or arbitrary broker access.

Proof incomplete: Broker tests do not yet prove credential and arbitrary-endpoint absence from every plugin, worker, core, runtime, and publisher boundary. Enforcement: runtime-adversarial. First release: activate; gates C, E, F.

**PNH-INV-14 — Provider and model identity are exact** (law: ratified; proof: unproven)

Provider and model identity are exact after authorization; alias resolution, silent upgrade, substitution, and fallback are never permitted.

Proof incomplete: No fault-injection suite attempts alias resolution, fallback, model substitution, and silent upgrade through every broker adapter. Enforcement: runtime-adversarial. First release: activate; gates E, F.

**PNH-INV-31 — No plugin-selected routing or identity** (law: ratified; proof: unproven)

No broker or lifecycle principal may accept a plugin-selected endpoint, identity, or route.

Proof incomplete: Forged identity cases exist, but endpoint and route injection are not covered across both broker and lifecycle-principal paths. Enforcement: runtime-adversarial. First release: activate; gates B2, C, D, E, F.
<!-- pnh:invariants:broker:end -->

## 9. Evidence law

The durable product of a task is its record. Code runs and containers vanish;
what remains is an account of what happened, and every audit, every retry
decision, and every trust judgment downstream rests on that account being true.
Evidence law is therefore written to prefer a loud absence over a confident
guess.

Three terminal shapes exist, and the boundary between them is the whole point.
Success requires the complete positive set: a valid response, a clean matching
exit commitment, truthful out-of-memory state, and confirmed cleanup
(PNH-INV-08). Failure is an attributed, observed fault. Ambiguity is the
recorded state for a dispatched effect whose outcome the harness cannot
establish (PNH-INV-07). Collapsing ambiguity into either neighbor is the
tempting move and the forbidden one: called success it manufactures a fact,
called failure it invites a retry that may duplicate an effect that already
happened.

Settlement happens once (PNH-INV-06). Late and duplicate observations are
common in a system with deadlines, brokers, and a container runtime, and they
arrive after the answer is already recorded; letting them rewrite it would mean
the record's meaning depends on arrival order. Missing or unwritable evidence
fails the task closed (PNH-INV-16), because a task that cannot be accounted for
has no claim to have succeeded. Telemetry an underlying substrate does not
support is recorded as null and never inferred or backfilled (PNH-INV-15): a
null is honest, an estimate that renders like a measurement is not.

Truthfulness also constrains the channel. Authenticated commands, responses,
and receipts resist replay (PNH-INV-45), so a captured frame cannot settle
work, confer authority, or mint evidence a second time.

<!-- pnh:invariants:evidence:begin -->
**PNH-INV-06 — A request settles once** (law: ratified; proof: unproven)

A request settles exactly once; duplicate or late observations arriving after settlement must never change the settled outcome.

Proof incomplete: No fault-injection suite covers duplicate and late observations across every request settlement path with the settlement guard disabled. Enforcement: runtime-adversarial. First release: activate; gates D, F.

**PNH-INV-07 — Post-dispatch uncertainty settles as ambiguous** (law: ratified; proof: unproven)

Uncertainty about whether a dispatched effect occurred is recorded as ambiguous and must never be settled as success or as an ordinary failure.

Proof incomplete: No production-path test injects post-dispatch effect uncertainty and proves the outcome remains ambiguous rather than success or failure. Enforcement: runtime-adversarial. First release: activate; gates D, E, F.

**PNH-INV-08 — Success requires complete positive evidence** (law: ratified; proof: unproven)

Success requires one valid response, a clean matching exit commitment, truthful out-of-memory state, and confirmed cleanup; an outcome missing any of these must never settle as success.

Proof incomplete: No suite independently removes each required positive-evidence signal and proves that every incomplete combination fails closed. Enforcement: runtime-adversarial. First release: activate; gates D, E, F.

**PNH-INV-15 — Unsupported telemetry is null** (law: ratified; proof: unproven)

An unsupported telemetry field is recorded as null and must never be inferred, estimated, or backfilled.

Proof incomplete: No cross-provider test removes each optional telemetry field and proves that adapters preserve null instead of inferring a value. Enforcement: runtime-adversarial. First release: activate; gates E, F.

**PNH-INV-16 — Missing evidence fails the task closed** (law: ratified; proof: unproven)

Missing or unwritable evidence fails the task closed.

Proof incomplete: No production-path suite injects missing and unwritable evidence sinks at each settlement stage and proves fail-closed behavior. Enforcement: runtime-adversarial. First release: activate; gates D, E, F.

**PNH-INV-45 — Authenticated exchanges are replay-resistant** (law: ratified; proof: unproven)

Every authenticated command, response, and receipt is replay-resistant; a replayed frame or receipt must never settle work, confer authority, or produce evidence.

Proof incomplete: Replay defenses are not proven across every authenticated command, response, and receipt path with the replay control disabled. Enforcement: runtime-adversarial. First release: activate; gates C, D, E, F.
<!-- pnh:invariants:evidence:end -->

## 10. Aggregate resource law

Per-plugin limits bound what one plugin takes. They say nothing about what the
sum of well-behaved plugins takes, and a host has one memory budget, one CPU
budget, and one disk. Aggregate law governs that shared pool so that a plugin
staying inside every grant it holds still cannot squeeze the host.

A single payload-blind arbiter per host reserves and releases capacity, with
per-instance quotas so several harness instances share one allowance rather
than each assuming the whole of it (PNH-INV-35). The arbiter settles nothing
and reads no plugin content. It is an accountant, and keeping it that way is
what stops it from becoming a second, quieter authority over outcomes.

Fair-share ceilings cap what any one plugin may reserve (PNH-INV-36), so
starvation cannot be achieved through entirely legal requests. Reservations are
leases tied to the life of the owning cell (PNH-INV-37): when a cell dies, its
capacity comes back without anyone remembering to return it. Crashes are the
normal case in a system that assumes malicious plugin code, so capacity that
depends on graceful release is capacity that leaks.

<!-- pnh:invariants:resource:begin -->
**PNH-INV-35 — Host-scoped aggregate arbiter** (law: ratified; proof: unproven)

One payload-blind arbiter per host reserves and releases aggregate capacity for all harness instances with per-instance quotas; it never owns plugin settlement and never interprets plugin payloads.

Proof incomplete: The aggregate arbiter is supervisor scoped, not a single host-shared service covering all harness instances as this statement requires. Enforcement: runtime-adversarial. First release: activate; gates C, F.

**PNH-INV-36 — Fair-share ceilings** (law: ratified; proof: unproven)

No plugin may reserve aggregate capacity beyond its fair-share ceiling; a plugin acting within its grants must never be able to starve unrelated plugins through legal reservations.

Proof incomplete: Aggregate tests cover representative ceilings, but do not yet prove all legal reservation patterns with the fair-share control disabled. Enforcement: runtime-adversarial. First release: activate; gates C, F.

**PNH-INV-37 — Reservations are leases** (law: ratified; proof: unproven)

Aggregate reservations are leases that expire when the owning cell dies; a crashed or wedged plugin must never permanently retain aggregate capacity.

Proof incomplete: Cleanup paths release reservations, but no lease-expiry mechanism or fault-injection proof covers a wedged owner that never cleans up. Enforcement: runtime-adversarial. First release: activate; gates C, F.
<!-- pnh:invariants:resource:end -->

## 11. Hostile-plugin gate

The ecosystem this document assumes is publish-then-curate. Anyone may publish
a plugin; each owner reviews what they choose to run, pins it by digest, and
admits it into their own set. Every isolation guarantee in chapters 6 and 7 is
calibrated for that population: code assumed malicious, but selected by someone
who accepted responsibility for selecting it.

Install-and-run distribution, where a plugin arrives without owner review,
is a different threat population wearing the same interface. PNH-INV-43 turns
that difference into a gate rather than a footnote: admitting a plugin that is
not owner-approved and digest-bound requires a stronger isolation class first.
A boundary above the shared kernel, microVM-grade rather than container-grade,
is the kind of class that question is asking about. The gate is
written as a trigger so the question gets asked at the moment the ecosystem
model changes, which is the only moment at which the answer is cheap.

Development-mode loading is defined here so it cannot be mistaken for a way
around the gate. Loading unpinned code for development is non-admitted
execution: visibly distinct, unable to produce production evidence, and barred
from bridges and privileged effects. It does not pass through the gate, and it
does not need to, because nothing it produces is allowed to count.

<!-- pnh:invariants:gate:begin -->
**PNH-INV-43 — Hostile-plugin gate** (law: ratified; proof: unproven)

Admitting any plugin that is not owner-approved and digest-bound requires a stronger isolation class before admission is legal; development-mode loading is non-admitted execution that cannot produce production evidence and cannot invoke bridges or privileged effects.

Proof incomplete: Owner-pinned admission exists, but no stronger hostile-plugin class or complete development-mode evidence and effect gate exists. Enforcement: runtime-adversarial. First release: activate; gates B2, F.
<!-- pnh:invariants:gate:end -->

## 12. Extraction boundary

The harness core is meant to be publishable on its own, and a consumer of it is
meant to keep its own policy, endpoints, and operational identity private. That
split only survives if the dependency direction is fixed. The public neutral
core carries no consumer-specific types, policy, endpoints, or operational
identities (PNH-INV-18), and a consumer adapter depends only on published
public contracts, never on core internals and never on another consumer's
private material (PNH-INV-19). Contracts point outward; specifics point inward.

The value of the boundary is not only distribution. A core that cannot name a
consumer cannot special-case one, so provider neutrality is enforced by what
the core is unable to express rather than by everyone remembering to be
neutral.

Release hygiene closes the loop. A public release carries no consumer adapters
or policies, no live credentials or endpoints, no private infrastructure or
evidence, no publisher controls, no production repository content, and no model
artifacts lacking verified redistribution rights (PNH-INV-20). Components that
sit close to those secrets, provider brokers and adapters among them, become
publishable only after their own security, license, and sanitization review.

<!-- pnh:invariants:extraction:begin -->
**PNH-INV-18 — The public core carries no consumer specifics** (law: ratified; proof: proven)

The public neutral core must never depend on consumer-specific types, policy, endpoints, or operational identities.

Enforcement: static-structure. First release: retain; reverify the standalone graph; gates G. Structured proof: `pnh/tests/module-graph.test.ts`.

**PNH-INV-19 — Consumer adapters depend only on public contracts** (law: ratified; proof: unproven)

A consumer adapter depends only on published public contracts, never on core internals or on another consumer's private material.

Proof incomplete: The standalone package and consumer-adapter boundary do not exist yet, so no extraction-time dependency gate can prove this claim. Enforcement: static-structure. First release: activate; gates G.

**PNH-INV-20 — Private material never ships in a public release** (law: ratified; proof: unproven)

A public release must never contain consumer adapters or policies, live credentials or endpoints, private infrastructure or evidence, publisher controls, production repository content, or model artifacts without verified redistribution rights; a provider broker or adapter becomes publishable only after its own security, license, and sanitization review.

Proof incomplete: The isolated export, license inventory, provenance review, and secret scan are later readiness gates and have not been completed. Enforcement: release-or-architecture-gate. First release: activate; gates G.
<!-- pnh:invariants:extraction:end -->

## 13. Non-goals

These are durable exclusions. They describe what conformance to this document
never confers, so a reader who satisfies every chapter above still knows what
remains undecided.

1. **Authorization to act.** Conformance authorizes nothing: no build, no
   installation, no deployment, no publication, and no production run.
   Permission to do any of those comes from the consumer control plane and its
   own decision records.
2. **Technology selection.** This document names no language, dependency,
   vendor, container runtime, or sandbox product. Its law is written
   substrate-neutrally so it survives a substrate change.
3. **Wire field layouts.** Byte and field layouts belong to versioned spec
   files pinned by the registry as PNH-PROTO entries. Freezing them here would
   make every schema revision a constitutional amendment.
4. **Consumer control plane internals.** Scheduling, queueing, prioritization,
   retry policy, and product behavior above the adapter are outside this
   document's reach, by the same division that chapter 3 draws.
5. **Overturning recorded decisions.** This document neither revives closed
   questions nor lifts a stop-work state placed by another.
6. **Reporting on any codebase.** This is a yardstick, not a survey. What a
   given build does is measured against these chapters by the conformance gate,
   and is never asserted in them.

## 14. Conformance

Conformance is computed, not claimed. The gate reads the registry, runs the
proving suites, and compares its own regenerated output against this file, so
each of the following tables is machine-produced from
`assurance/constitution/contracts/invariants.yaml`.

The registry table lists every invariant with its proving suites. An active
invariant with no proving entry is an orphan, and the gate reports it as a
finding rather than letting an untested rule pass as settled law. A proposed
invariant is one whose statement is registered while its proof is still owed.
Its required proposed reason records the exact missing evidence, architecture,
surface, or enforcement gate. The distinction is about evidence, not about how
binding the statement is.

The protocol table pins each wire boundary separately, with a content hash over
its schema sources. Recomputing those hashes is part of the gate, so changing a
schema without bumping its registry version turns the build red instead of
sliding through as a diff nobody read. The amendment log is assembled from the
amendment entries in the registry, which is why chapter 1 asks for the decision
record and the registry edit in the same change: the log is a byproduct of
following the process, and empty where the process was skipped.

<!-- pnh:conformance:begin -->
### Registry

| ID | Title | Law status | Proof status | Proof reason | Enforcement | First release | Detail | Closing gates | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| PNH-INV-01 | Ordinary plugin faults stay inside their fault cell | ratified | unproven | Representative fault-cell tests do not prove every ordinary failure class under the ratified deterministic scheduler model. | runtime-adversarial | activate | — | C, F | — |
| PNH-INV-02 | One versioned wire vocabulary across all boundaries | ratified | proven | — | static-structure | retain | reverify every adapter and protocol pin | A, F | structured proof: pnh/tests/plugin-protocol.test.ts |
| PNH-INV-03 | Frames are bounded and fail closed | ratified | proven | — | runtime-adversarial | retain | rerun all parser boundaries | A, F | structured proof: pnh/tests/protocol-bounds.test.ts |
| PNH-INV-04 | One opaque admission ticket | ratified | proven | — | runtime-adversarial | retain | reprove the new authority root | B2, F | structured proof: pnh/tests/admission-ticket.test.ts |
| PNH-INV-05 | Policy admission gates grant derivation | ratified | unproven | No production-path suite injects every named Policy failure before grant derivation and proves that each path denies all non-Policy grants. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-06 | A request settles once | ratified | unproven | No fault-injection suite covers duplicate and late observations across every request settlement path with the settlement guard disabled. | runtime-adversarial | activate | — | D, F | — |
| PNH-INV-07 | Post-dispatch uncertainty settles as ambiguous | ratified | unproven | No production-path test injects post-dispatch effect uncertainty and proves the outcome remains ambiguous rather than success or failure. | runtime-adversarial | activate | — | D, E, F | — |
| PNH-INV-08 | Success requires complete positive evidence | ratified | unproven | No suite independently removes each required positive-evidence signal and proves that every incomplete combination fails closed. | runtime-adversarial | activate | — | D, E, F | — |
| PNH-INV-09 | Proof runs production paths and injects the fault it names | ratified | unproven | The gate verifies executed registrations, but it does not yet verify production-path use, fault injection, or failure when a control is disabled. | release-or-architecture-gate | activate | — | A, F | — |
| PNH-INV-10 | All inbound content is untrusted | ratified | unproven | The statement spans multiple content classes and components without a complete authority-confusion suite for each inbound boundary. | runtime-adversarial | activate | — | B2, C, E, F | — |
| PNH-INV-11 | Only a validated task and grant confer authority | ratified | unproven | No adversarial suite attempts to derive authority from ambient references, configuration, and prior state across every admission path. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-12 | Plugins narrow authority and never widen it | ratified | unproven | No malicious-plugin suite attempts grant widening for itself and another plugin through every plugin-to-harness command path. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-13 | Credentials live only in trusted brokers | ratified | unproven | Broker tests do not yet prove credential and arbitrary-endpoint absence from every plugin, worker, core, runtime, and publisher boundary. | runtime-adversarial | activate | — | C, E, F | — |
| PNH-INV-14 | Provider and model identity are exact | ratified | unproven | No fault-injection suite attempts alias resolution, fallback, model substitution, and silent upgrade through every broker adapter. | runtime-adversarial | activate | — | E, F | — |
| PNH-INV-15 | Unsupported telemetry is null | ratified | unproven | No cross-provider test removes each optional telemetry field and proves that adapters preserve null instead of inferring a value. | runtime-adversarial | activate | — | E, F | — |
| PNH-INV-16 | Missing evidence fails the task closed | ratified | unproven | No production-path suite injects missing and unwritable evidence sinks at each settlement stage and proves fail-closed behavior. | runtime-adversarial | activate | — | D, E, F | — |
| PNH-INV-17 | Publication authority is the consumer's alone | ratified | unproven | Publication is not implemented as a public workflow, so unauthorized publication attempts from every named component cannot yet be tested. | release-or-architecture-gate | activate | — | G | — |
| PNH-INV-18 | The public core carries no consumer specifics | ratified | proven | — | static-structure | retain | reverify the standalone graph | G | structured proof: pnh/tests/module-graph.test.ts |
| PNH-INV-19 | Consumer adapters depend only on public contracts | ratified | unproven | The standalone package and consumer-adapter boundary do not exist yet, so no extraction-time dependency gate can prove this claim. | static-structure | activate | — | G | — |
| PNH-INV-20 | Private material never ships in a public release | ratified | unproven | The isolated export, license inventory, provenance review, and secret scan are later readiness gates and have not been completed. | release-or-architecture-gate | activate | — | G | — |
| PNH-INV-21 | Attribution comes from outside plugin bytes | ratified | unproven | M3 rejects representative forged identities, but it does not yet cover every output and failure route or prove failure with attribution disabled. | runtime-adversarial | activate | — | C, D, F | — |
| PNH-INV-22 | Work, limits, cleanup, and evidence are allocation-scoped | ratified | partial | Existing evidence does not cover every admitted execution class through its production constructor. | runtime-adversarial | activate | for every production class; partial until then | A, B2, C, F | partial evidence; not complete proof: pnh/tests/m3-plugin-fault-isolation.test.ts |
| PNH-INV-23 | Uncancellable deadline and cleanup path | ratified | partial | Cleanup truth is not yet scoped by execution class and stronger containment is not established. | runtime-adversarial | activate | by execution class; partial until then | A, C, D, F | partial evidence; not complete proof: pnh/tests/plugin-container-supervisor.test.ts |
| PNH-INV-24 | Physical splitting requires defeated-control evidence | ratified | unproven | M3 used a smaller correction successfully, but no enforceable review gate yet validates this evidence standard when a physical split is proposed. | release-or-architecture-gate | activate | — | A, F | — |
| PNH-INV-25 | Plugin code is assumed fully malicious | ratified | unproven | No production proof covers every admitted execution class, including hostile container isolation, restricted trusted subprocess authority, and development-mode exclusion. | runtime-adversarial | activate | after exact amendment | A, B2, F | — |
| PNH-INV-26 | Fault cells are not security boundaries | ratified | unproven | Documentation states this boundary, but no public-surface labeling gate yet prevents fault-cell isolation from being presented as sandboxing. | generated-document-consistency | activate | — | A, F, G | — |
| PNH-INV-27 | Fixed boundary designation | ratified | unproven | No production proof establishes the exact authority boundary and custody principal for every execution class. | runtime-adversarial | activate | after exact amendment | A, B2, C, F | — |
| PNH-INV-28 | Contract meaning is fixed at admission | ratified | unproven | No conformance suite mutates admitted contract meaning through a consumer adapter and proves that every rewrite attempt is rejected. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-29 | Static owner-approved digest-bound plugin sets | ratified | partial | The supported production entrypoint does not yet make owner-approved digest pins technically unavoidable. | runtime-adversarial | activate | partial until the production entrypoint enforces owner pins | A, B2, F | partial evidence; not complete proof: pnh/tests/admission-ticket.test.ts<br>pnh/tests/pinned-admission.test.ts |
| PNH-INV-30 | Plugins never install or schedule | ratified | unproven | No malicious-plugin and malicious-worker suite attempts all three authority classes through production command paths. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-31 | No plugin-selected routing or identity | ratified | unproven | Forged identity cases exist, but endpoint and route injection are not covered across both broker and lifecycle-principal paths. | runtime-adversarial | activate | — | B2, C, D, E, F | — |
| PNH-INV-32 | One admitted task at a time | ratified | unproven | No admission test submits a second task through the production entrypoint and proves that scheduling authority remains outside the harness. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-33 | Single host-scoped lifecycle principal | ratified | unproven | The supervisor tests cover one lifecycle principal instance, but the implementation does not provide one shared principal across all host instances. | runtime-adversarial | activate | — | C, F | unproven evidence; not complete proof: pnh/tests/plugin-container-supervisor.test.ts |
| PNH-INV-34 | Payload-blind lifecycle authority | ratified | unproven | No complete negative suite injects payloads, identities, and raw runtime arguments into every authenticated lifecycle command path. | runtime-adversarial | activate | — | B2, C, F | — |
| PNH-INV-35 | Host-scoped aggregate arbiter | ratified | unproven | The aggregate arbiter is supervisor scoped, not a single host-shared service covering all harness instances as this statement requires. | runtime-adversarial | activate | — | C, F | — |
| PNH-INV-36 | Fair-share ceilings | ratified | unproven | Aggregate tests cover representative ceilings, but do not yet prove all legal reservation patterns with the fair-share control disabled. | runtime-adversarial | activate | — | C, F | — |
| PNH-INV-37 | Reservations are leases | ratified | unproven | Cleanup paths release reservations, but no lease-expiry mechanism or fault-injection proof covers a wedged owner that never cleans up. | runtime-adversarial | activate | — | C, F | — |
| PNH-INV-38 | Bounded cross-plugin interference | ratified | unproven | Deterministic full-rotation fairness is not yet proven under every legal registry-bounded load. | runtime-adversarial | activate | after exact amendment | A, C, F | unproven evidence; not complete proof: pnh/tests/m3-aggregate-arbiter.test.ts<br>pnh/tests/m3-adversarial-isolation.test.ts |
| PNH-INV-39 | Cell port is a message protocol | ratified | unproven | The current pins cover existing wire surfaces, but no out-of-process cell implementation proves semantic compatibility across a topology change. | runtime-adversarial | defer | no first-release conformance claim | H | — |
| PNH-INV-40 | Bridges are ordinary admitted plugins | ratified | unproven | No foreign-capability bridge implementation or production conformance path exists yet. | runtime-adversarial | defer | with D5 | H | — |
| PNH-INV-41 | Frozen foreign surface, default deny | ratified | unproven | No bridge admission registry or fault-injection suite currently proves complete surface enumeration and default denial. | runtime-adversarial | defer | with D5 | H | — |
| PNH-INV-42 | Trusted mediation and attribution | ratified | unproven | The trusted bridge mediator and its mismatch and post-dispatch ambiguity paths have not been implemented or adversarially tested. | runtime-adversarial | defer | with D5 | H | — |
| PNH-INV-43 | Hostile-plugin gate | ratified | unproven | Owner-pinned admission exists, but no stronger hostile-plugin class or complete development-mode evidence and effect gate exists. | runtime-adversarial | activate | — | B2, F | — |
| PNH-INV-44 | Narrative prose is non-normative | ratified | unproven | Generated sections come from the registry, but no gate detects or resolves conflicting hand-written narrative prose. | generated-document-consistency | activate | — | A, G | — |
| PNH-INV-45 | Authenticated exchanges are replay-resistant | ratified | unproven | Replay defenses are not proven across every authenticated command, response, and receipt path with the replay control disabled. | runtime-adversarial | activate | — | C, D, E, F | — |
| PNH-INV-46 | Escalation review content | ratified | unproven | The M3 decision did not escalate topology, and no enforceable review template or gate validates all required content for a future escalation. | release-or-architecture-gate | activate | — | A, F | — |

### Protocol pins

| ID | Name | Version | Spec | Schema hash |
|---|---|---|---|---|
| PNH-PROTO-01 | plugin-protocol | 1 | docs/plans/provider-neutral-harness/specs/plugin-protocol.md | `sha256:849f3945430069b48ea46c70b57704aa819d2971c14faa5467abea9a806696c3` |
| PNH-PROTO-02 | supervisor-command-channel | 1 | docs/plans/provider-neutral-harness/specs/supervisor-command-channel.md | `sha256:32843d51695f556cdd8192de8824ba6aef60459188b151b872df0220d9ebb719` |

### Amendment log

- 2026-08-21 — PNH-INV-22: docs/plans/provider-neutral-harness/2026-08-21-pnh-inv-22-activation-amendment.md
- 2026-08-21 — PNH-INV-22: docs/plans/provider-neutral-harness/2026-08-21-pnh-inv-22-activation-amendment.md
- 2026-08-21 — PNH-PROTO-02: docs/plans/provider-neutral-harness/2026-08-21-supervisor-fault-cell-amendment.md
- 2026-08-26 — PNH-INV-38: docs/plans/provider-neutral-harness/2026-08-26-aggregate-arbiter-protocol-amendment.md
- 2026-08-26 — PNH-INV-38: docs/plans/provider-neutral-harness/2026-08-26-command-scheduler-fairness-amendment.md
- 2026-08-26 — PNH-PROTO-01: docs/plans/provider-neutral-harness/2026-08-26-aggregate-arbiter-protocol-amendment.md
- 2026-08-26 — PNH-PROTO-01: docs/plans/provider-neutral-harness/2026-08-26-command-scheduler-fairness-amendment.md
- 2026-08-26 — PNH-PROTO-02: docs/plans/provider-neutral-harness/2026-08-26-aggregate-arbiter-protocol-amendment.md
- 2026-08-26 — PNH-PROTO-02: docs/plans/provider-neutral-harness/2026-08-26-command-scheduler-fairness-amendment.md
- 2026-08-28 — PNH-INV-01: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
- 2026-08-28 — PNH-INV-02: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-02: docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md
- 2026-08-28 — PNH-INV-03: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-03: docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md
- 2026-08-28 — PNH-INV-04: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-04: docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md
- 2026-08-28 — PNH-INV-05: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-06: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-07: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-08: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-09: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-10: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-11: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-12: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-13: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-14: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-15: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-16: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-17: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-18: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-18: docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md
- 2026-08-28 — PNH-INV-19: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-20: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-21: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-22: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
- 2026-08-28 — PNH-INV-23: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
- 2026-08-28 — PNH-INV-24: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-25: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
- 2026-08-28 — PNH-INV-26: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-27: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
- 2026-08-28 — PNH-INV-28: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-29: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
- 2026-08-28 — PNH-INV-30: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-31: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-32: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-33: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-34: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-35: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-36: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-37: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-38: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
- 2026-08-28 — PNH-INV-39: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-40: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-41: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-42: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-43: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-44: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-45: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-08-28 — PNH-INV-46: docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md
- 2026-09-03 — PNH-PROTO-02: docs/plans/provider-neutral-harness/2026-09-03-oss-release-package-scope-protocol-amendment.md
<!-- pnh:conformance:end -->
