# PNH constitution and invariant registry design

Status: implemented 2026-08-21 — see constitution.md and pnh/contracts/

Date: 2026-08-21

Related sources:

- [M3 isolation architecture options](2026-08-21-m3-plugin-isolation-architecture-options.md)
- [M3 plugin fault-isolation threat model](2026-08-21-m3-plugin-fault-isolation-threat-model.md)
- [M2 hybrid restart plan](2026-08-20-m2-hybrid-restart-plan.md)
- [Current architecture direction](architecture.md) (superseded by this work)

## Purpose

Build the canonical normative reference for the provider-neutral harness: the
document everything else checks against to know whether it is doing the right
thing. Plans, reviews, audits, and test suites conform to it; it does not
describe current implementation state.

Two properties make it a real yardstick rather than a document people route
around:

1. Every invariant has a stable ID and a machine-readable definition.
2. Conformance is computed by a test, not asserted in prose.

## Decisions recorded from the design interview

These were settled with the owner on 2026-08-21 and are not open:

1. **Document role.** A normative constitution: timeless invariants, authority
   boundaries, and contracts. No current-state or milestone language. It
   replaces `architecture.md` as the reference.
2. **Topology.** The constitution mandates properties, not topology. Attributed
   per-plugin fault cells, bounded cross-plugin interference, a
   message-protocol cell port, and the escalation trigger are law. Logical
   cells versus per-plugin cell processes is an implementation choice.
3. **Substrate.** Exactly one lifecycle principal, stated substrate-neutrally.
   It holds for rootful Docker today and rootless runtimes later. Single-ness
   is justified by auditability and evidence custody, not only privilege.
4. **Task model.** One admitted task at a time is constitutional law.
   Concurrency belongs to the consumer control plane; parallelism means N
   harness instances.
5. **Enforcement.** Machine-readable registry. The markdown constitution is
   partially generated from it, tests reference invariant IDs, and a
   conformance test computes coverage and fails on drift or orphans.
6. **Scope edges.** In scope: the hostile-plugin gate, the open-source
   extraction boundary, and quantitative bounds held as registry values. Out of
   scope: wire-protocol field layouts, which live in separate spec files pinned
   by version from the registry.
7. **Ecosystem model and MCP bridge.** The target ecosystem is
   publish-then-curate: anyone may publish plugins, and each operator reviews,
   digests, and admits them into their own static set. A marketplace model
   (unreviewed installation) stays behind the hostile-plugin gate. To inherit
   the existing MCP ecosystem instead of bootstrapping a new one, the
   constitution includes bridge law governing how MCP servers are admitted as
   plugins.

## Artifacts

### 1. Invariant registry: `pnh/contracts/invariants.yaml`

Single source of truth. Lives under `pnh/` so the conformance test imports it
directly. Schema (version 1):

```yaml
version: 1
invariants:
  - id: PNH-INV-12
    title: Ordinary plugin faults stay inside their fault cell
    category: isolation
    statement: >
      An attributed ordinary failure of one plugin must not block, settle,
      or contaminate the work of any other plugin in the admitted set.
    bounds:
      max_cross_plugin_stall_ms: 50
    conformance:
      - pnh/tests/m3-plugin-fault-isolation.test.ts
    since: 2026-08-21
    decisions:
      - docs/plans/provider-neutral-harness/2026-08-21-m3-plugin-isolation-architecture-options.md
protocols:
  - id: PNH-PROTO-01
    name: plugin-protocol
    spec: docs/plans/provider-neutral-harness/specs/plugin-protocol.md
    version: 1
    schema_source:
      - pnh/sdk/protocol.ts
    schema_hash: sha256:<computed over schema_source contents>
    conformance:
      - pnh/tests/plugin-protocol.test.ts
```

Field rules:

- `id` is permanent. Retired invariants keep their ID with `status: retired`
  and a pointer to the amending decision; IDs are never reused.
- `statement` is the binding text. The constitution renders it verbatim.
- `bounds` holds every quantitative limit (stall milliseconds, decoded-byte
  caps, maximum plugin-set size, arbiter lease timeouts). Prose states only
  that a bound exists and is enforced; tests import the values from here.
  Initial values are owner-tunable without prose edits.
- `conformance` lists the test or gate files that prove the invariant. An
  empty list is legal only with `status: proposed`, which the conformance
  test reports as an orphan.
- `decisions` links the decision records that created or amended the entry.
- Amended entries carry an `amendments` list (date plus decision link). The
  generated amendment log in the conformance chapter is built from these
  fields, `since`, and `status`; there is no separate log file.
- Binding fields hashed into the lock are `statement` and `bounds`
  (invariants) and `version` and `schema_hash` (protocols). `status` is
  governed by a transition rule instead of the hash: activating a proposed
  invariant is free (it adds proof, it does not change law), while retiring
  one requires an amendment, and every other transition is illegal. The
  conformance test's baseline rule rejects any binding-hash change that
  lacks an amendment.

### 2. Protocol version pinning

Wire protocols (cell port, container broker frames) are not constitutional
content. The constitution binds their properties: versioned, serialized,
attributed, frame-size-bounded, replay-resistant, no ambient references. The
byte layout lives in a separate spec file per protocol under
`docs/plans/provider-neutral-harness/specs/`, on its own version clock, checked
against `pnh/sdk/protocol.ts` by its conformance tests.

The registry pins each protocol: spec path, pinned version, schema source, and
proving tests. Invariants that depend on a protocol reference it by
`PNH-PROTO-nn`. A schema change is therefore a one-line registry version bump:
visible in the amendment log and enforced by CI, without freezing bytes in the
constitution. This gives the A-to-C escalation seam friction against casual
drift while keeping constitutional amendments rare and meaningful.

### 3. Constitution: `docs/plans/provider-neutral-harness/constitution.md`

Hand-written prose chapters with generated invariant blocks between markers:

```markdown
<!-- pnh-invariants:isolation:begin -->
(generator output: rendered statements for category "isolation")
<!-- pnh-invariants:isolation:end -->
```

The narrative (doctrine, authority model, diagrams) is written prose. Invariant
statements and the conformance chapter are generated, so binding text cannot
silently diverge from the registry. Narrative prose is non-normative by rule:
the doctrine chapter states it, and on any conflict the generated registry
text binds. A contradicting handwritten paragraph is an editorial bug the
drift rule cannot catch, which is exactly why it carries no legal weight. The generator is a small script (`pnh/scripts/` alongside the
existing tooling) run via npm; the conformance test fails if committed output
differs from regenerated output.

Chapter map:

1. **Doctrine.** What PNH is, what this document governs, the amendment
   process, and the reading rule: narrative prose is non-normative and
   explanatory; on any conflict, the generated registry text binds.
2. **Authority model.** Principals table, trust classifications, one-way
   dependency law. Corrected topology diagram: untrusted containers never
   reach the lifecycle authority directly.
3. **Task law.** Exactly one admitted task; scheduling and concurrency belong
   to the consumer above the adapter.
4. **Plugin law.** Five kinds, static owner-approved digest-bound sets, no
   ambient authority, no grant widening. The cell port is a versioned
   serialized message protocol (pinned via PNH-PROTO entry).
5. **Bridge law.** How foreign capability protocols are admitted, MCP first.
   A bridge is an ordinary admitted plugin, not a new kind: containerized,
   capability-scoped, credential-free, and digest-bound by packaging the
   bridged server inside the plugin image. The frozen surface covers every
   MCP method family: tools, resources, prompts, and subscriptions are
   enumerated at admission with schema hashes, and any family or member not
   explicitly admitted is default-denied. Enforcement and attribution live
   outside the untrusted container: the MCP wire crosses the container
   boundary to a trusted harness-side mediator that compares each dispatch
   against the admitted surface before forwarding, so foreign-method
   evidence is produced by trusted code, never taken from the bridge's own
   claim. A surface mismatch fails the plugin allocation closed, and any
   post-dispatch discovery of drift settles under evidence law's ambiguity
   rule, never as an ordinary fault. Bridged capabilities map into existing
   plugin kinds and follow the same gated path, grants, budgets, and limits
   as native plugins. Remote MCP servers cannot be digest-bound and are
   inadmissible under this law; admitting them is a recorded future
   decision, not a gap.
6. **Isolation law.** Topology-neutral: attributed per-plugin fault cells; an
   ordinary fault never disrupts an unrelated plugin; cross-plugin
   interference bounds exist and are enforced (values in registry); the
   escalation trigger: bounded attributed input still producing process-wide
   effects after logical cells and limits exist means cells must move out of
   process.
7. **Lifecycle authority.** Substrate-neutral single principal, payload-blind,
   ticket-resolved authenticated commands only, sole source of cleanup
   evidence. Host-scoped: all harness instances on a host share the one
   principal, with per-instance identity on every command, so N-instance
   parallelism never multiplies container-runtime writers. Rootless runtimes
   named as a compatible substrate.
8. **Broker law.** Provider credentials only in trusted external brokers; no
   plugin-selected endpoints, identities, or routes. Defines "provider
   broker" and "container broker" as distinct terms and uses them
   consistently.
9. **Evidence law.** Fail closed on missing or ambiguous evidence; replay
   resistance; attribution truthfulness.
10. **Aggregate resource law.** One payload-blind arbiter; per-plugin
    fair-share ceilings; reservations are leases that expire on cell death.
    The arbiter is host-scoped and shared by all harness instances with
    per-instance quotas, so instances cannot each spend the full host
    allowance while staying individually green.
11. **Hostile-plugin gate.** Admitting any plugin that is not owner-approved
    and digest-bound requires a stronger isolation class (microVM tier)
    before admission is legal. Development-mode loading is defined here as
    non-admitted execution: visibly distinct, unable to produce production
    evidence, and barred from bridges and privileged effects, so it neither
    passes through the gate nor bypasses it.
12. **Extraction boundary.** Public neutral core versus consumer-private;
    what may depend on what; consumer-specific types barred from the core.
13. **Non-goals.** Durable non-goals only.
14. **Conformance.** Generated: registry table (ID, statement, proving
    suites), protocol pin table, orphan rule, amendment log.

### 4. Conformance test

A dedicated `test:constitution` npm script. It is wired into `test:pnh` once
the intentionally red M3 suite is green; until then it runs standalone,
because the sandbox runner auto-discovers the red suite and the constitution
gate must not ride on it. Checks:

1. Registry parses, matches the schema (unknown fields rejected), and passes
   semantic validation: globally unique IDs, resolvable cross-references,
   decision and amendment paths that exist on disk, and status transitions
   that are legal against the baseline.
2. Baseline rule. A committed `invariants.lock` pins every ID plus a hash of
   its binding fields. Any addition, retirement, deletion, or binding-field
   change relative to the lock requires an `amendments` entry citing a
   decision file that exists and a `from_hash` matching the exact binding
   hash it supersedes, and the lock regenerates only alongside that
   amendment. Pinning each amendment to the hash it amends from is what
   turns silently weakening a bound, deleting an invariant, or introducing
   an unregistered protocol into a red build instead of a quiet diff.
3. Executed conformance. The conformance suites run under the runner with a
   machine-readable report; every active invariant must have at least one
   passing, non-skipped test that registers its ID via the `conformsTo`
   helper. Path existence and ID string search remain as fast pre-checks,
   but tags alone never satisfy the rule. Tests that enforce a quantitative
   bound import its value from the registry rather than hard-coding it.
4. No active invariant has zero conformance entries (orphan rule).
5. Regenerating the constitution from the registry produces the committed
   file byte-for-byte (drift rule). Handwritten narrative is
   constitutionally non-normative (the doctrine chapter says so, and the
   reading rule resolves any conflict in favor of the generated registry
   text), so a contradicting paragraph outside the markers is an editorial
   bug, not a change of law.
6. Every pinned protocol entry names its schema source files and a content
   hash over them; the check recomputes the hash, so changing a wire schema
   without a registry version bump is a red build. Each wire boundary gets
   its own entry: the plugin protocol and the supervisor command channel are
   separate pins, never one shared version constant.

## Enforcement rules

- Plans, reviews, and audits cite the IDs they touch.
- An invariant with no covering test is an audit finding, surfaced by the
  conformance test as well.
- Amendments are dated decision records that update the registry and the
  lock together. Every binding-field change is an amendment, bounds
  included: tuning a limit without a decision record is a red build, not a
  tune.
- Honest threat model of enforcement: in a solo-owner repository no in-repo
  mechanism can stop the owner from changing anything. The checks exist to
  make every change of law loud, deliberate, and attributable (a registry
  plus lock diff carrying a decision record), never to make change
  impossible.

## Sourcing the invariants

Harvested, not invented. Sources, in priority order:

1. M2 hybrid restart plan, cross-cutting invariants section.
2. `architecture.md`, security invariants and open-source boundary sections.
3. M3 threat model, required controls and escalation rule.
4. M3 options brief, fixed security constraints.
5. Review fixes from the 2026-08-21 doc review: quantitative stall bounds,
   arbiter fair-share ceilings and reservation leases, the cell port as a
   message protocol, the corrected authority diagram, and the hostile-plugin
   gate as a trigger rather than a non-goal line.
6. Bridge law is new with this design rather than harvested; its registry
   entries cite this document as their decision record.

Expected size: 30 to 45 invariants.

Conformance-mapping caveat: the M3 isolation suite's protocol-failure and
malformed-output case names overstate what the suite drives (its cleanup
triggers are labels, not injected faults), so parser-isolation invariants
must map to dedicated adversarial parser cases, never to that suite. Where a source left a decision open
(parsing placement, arbiter design), the constitution states the property and
the registry holds an initial bound value the owner can tune.

## Migration

- `architecture.md` gets a tombstone header pointing at the constitution and
  is otherwise left unedited.
- New and revised documents cite invariant IDs. Retrofitting citations into
  existing milestone docs is not part of this work.
- The M3 decision checkpoint items become decision records referenced by the
  relevant registry entries.

## Out of scope

- Implementing the MCP bridge plugin. This design puts bridge law in the
  constitution so the bridge can be built legally later; building it is its
  own plan.
- Admission of remote MCP servers. They cannot be digest-bound, so bridge
  law excludes them; lifting that is a future decision record.
- Writing or changing any protocol spec's field layout.
- Mutation-testing the conformance mapping. Recorded as future hardening;
  the v1 bar is executed, non-skipped, runner-reported coverage per
  invariant.
- Implementing M3 (logical cells, arbiter, parsing changes). This work
  produces the yardstick; the restart plan governs implementation.
- Retrofitting invariant citations into historical documents.
- CI infrastructure beyond the conformance test in the existing suite.

## Success criteria

1. A dedicated `test:constitution` script runs the conformance test; it
   passes with zero orphans, zero drift, and a clean baseline diff. It is
   wired into `test:pnh` once the intentionally red M3 suite is green; the
   criterion is the constitution gate passing, not the full runner (which
   auto-discovers the red suite and stays red by design until M3 lands).
2. Every invariant statement in the constitution is generator output from the
   registry; hand-editing a statement fails the drift check.
3. Both existing wire boundaries are pinned separately with schema-source
   content hashes and at least one proving test each: the plugin protocol
   (`pnh/sdk/protocol.ts`) and the supervisor command channel
   (`pnh/harness/plugin-container-supervisor.mjs` command schema). The cell
   port does not exist until M3 builds it; the constitution mandates that it
   be pinned at introduction, and the conformance test enforces the pin from
   then on.
4. The constitution contains no current-state or milestone language.
5. `architecture.md` carries the tombstone and nothing else changed in it.
