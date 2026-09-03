# Prism Harness goal-execution design specification (D8, revision 8 — amendments applied, re-hardening pending)

Status: **draft for owner review**. This document is subordinate to the
ratified architecture design specification
(`2026-08-26-prism-harness-architecture-design-spec.md`) and proposes one new
decision area, D8, plus two follow-on implementation plans. Nothing here is
authorized for implementation, and nothing here amends Plans A through H or the
first-release critical path.

Revision 2 reconciled every surviving finding of the first hardening review
(`2026-08-26-prism-harness-goal-execution-design-spec.hardening.md`, review
target blob `76af82745f97bdb8c57a1af8c3ad6e40f7e45bd1`, reviewed via the
boundary-amended draft `0b832517a6a6d79561f52400c1444c40c0a96c8f`): three
Critical and ten Important findings, in report order. Revision 3 reconciled
the two-engine review of revision 2
(`2026-08-27-prism-harness-d8-revision-2-hardening.md`, review target blobs
`3baf8e520d516a1888da58d27c329c565b80c964` and
`c2accde6d889d6499350db429233a6ca5a1740f4`): one Critical and five Important
findings.

Revision 4 responds to the two-engine review of revision 3
(`2026-08-27-prism-harness-d8-revision-3-hardening.md`, review target blobs
`fcdb2a7efb0753f3ce6c093c9b9f3b0869ef1f72` and
`43bf0c5fcd6f45fe6bc51ac87c613fe6c837d9fd`) and an explicit owner decision of
2026-08-27: the work-program, judge, and selection subsystem is **split out of
D8** into its own deferred decision area
(`2026-08-27-prism-harness-work-program-selection-design-spec.md`). D8 now
closes on Plans I and J alone.

Revision 5 reconciles the two-engine review of revision 4
(`2026-08-27-prism-harness-d8-revision-4-hardening.md`, review target blobs
`dd49d643b6e41009ff41808c343f2809152c4eb9` and
`d72ca716ff9a3cee895aa0b737fb676248ea0a1c`): two Critical and seven Important
findings, all mechanical parity and closure defects. Section 19 maps every
finding from the prior reviews to its amended sections, the control adopted,
and the verification obligation that closes it.

Revision 6 responds to the independent Codex review of revision 5 (reviewed
target blobs `a2c0101a2b6ea81657bb583c4ea0d7d3240d058e` and
`f86dccac8b4477855b9b2f649f7df0c95f8548e9`): one Critical, five Important,
and three Minor findings. It adopts the full architecture corrections: an
alias-isolated filesystem capability instead of path-only confinement, one
typed canonical-value codec for every authority-bearing digest, state-aware
restart accounting, deadline enforcement for broker and local permits, a
separately versioned operator-decision protocol, and pair-bound ratification.
Section 19.4 records the complete reconciliation.

Revision 7 responds to the independent Codex review of revision 6 (reviewed
target blobs `21c9b7038bfec37235b69eae046ec5e97e2a88a6` and
`5383a55d5057c1b1db9bd2cf269125f7e9600e53`): one Critical and four Important
findings. D8 now emits generic artifacts and typed patches but never applies
them outside its capability root; every authority-bearing nested type and
variant has a closed canonical schema; task identity binds exact algorithm,
profile, and import-policy versions; operator decisions use one atomic,
idempotent settlement CAS; and pending approval authority expires on every
daemon-epoch change rather than interpreting an old deadline. Section 19.5
records the reconciliation. Per the hardening workflow's two-cycle cap, this
revision is not subjected to a third review in the same cycle.

Revision 8 reconciles the fresh SOL hardening wave over exact D8
revision-7 blob `35c2f0daa91e1f8f33b339f9c67f36bc9259ae17` and boundary
blob `deacff7969cd6c5089870822f0a2de9dd9364cb1`. Five independent
`gpt-5.6-sol` reviewers plus two verifier nodes retained seven Critical and ten
Important root causes. This revision amends all seven Critical
findings: an outward operation can no longer gain authority from a declared
effect-family label, artifact emission can no longer rely on an unbound
"generic" sink, and `DaemonEpochV1` now has one exact non-zero unsigned 64-bit
canonical representation; every authority-bearing keyed collection now has a
schema-declared semantic key, duplicate-key rejection, and deterministic key
ordering; approval and expiry now compete on one reservation-state CAS whose
strict epoch-local deadline is checked at decision linearization; and every
approval-subject collection now has one explicit canonical set or keyed-list
rule with duplicate rejection. Every
broker observation now enters a separately bound immutable loop-content store,
and one version-bound turn-journal checkpoint commits the exact observation
reference, parse result, stable action identities, conversation state, and next
loop state before any derived reservation can advance. Every
non-provider outward tool operation now binds an exact operation descriptor,
taxonomy, trusted destination resolver, adapter,
principal, and owner-pinned destination capability; D4 carries the resolved
destination through reservation, permit consumption, and receipt. Every
artifact emission now binds a daemon-measured, owner-domain-scoped store
instance whose dedicated local backing is physically disjoint from task,
protected, credential, consumer-writer, synchronized, and other-owner roots.

The ten Important amendments bind exact versioned tool capabilities and all
four canonical composition roles; bind daemon-issued decision ids, operator
roles, and authorization-policy versions; make acknowledgement authority
byte-identical across delivery replay; define closed approval subjects for
model, tool, and verification effects; give local and outward tools one tagged,
principal-bound, one-use permit; define one provider/tool epoch-loss recovery
matrix; make accounting transitions lease- and interval-bound with idempotent
restart charging; and place post-terminal receipts in a separate supplemental
observation chain that cannot change terminal authority. Section 19.6 records
all seventeen amendments and their verification obligations. Revision 8 has
not been re-hardened and remains unratifiable until the exact amended D8 and
boundary pair receives a fresh independent review with no Critical or Important
finding and the owner ratifies it.

The separately drafted D9 governed-adaptation design
(`2026-08-27-prism-harness-governed-adaptation-design-spec.md`) builds on D8
without entering the public kernel. The D8-to-D9 authority boundary is recorded
in `2026-08-27-prism-harness-d8-governed-adaptation-boundary-amendment.md`.

---

## 1. Purpose

The ratified architecture makes one admitted run execute one plugin set under
governed effects. It does not yet say how an **owner's goal** becomes admitted
work performed by **agents**: model-driven runs that hold a role, call granted
tools in a loop, produce artifacts, and settle with evidence an operator can
review instead of trusting a transcript.

This specification designs that layer. The target flow it must make real:

1. **Admit the work, not just the agent.** The owner pins a task definition
   into the registry: which prompt plugin runs it, its granted bindings (tool
   set, provider route, budgets), and an execution class. Admission is a
   one-time ratification, not per-run ceremony.
2. **Submit through the CLI to the daemon.** Admission validates every pin,
   assigns a restricted principal, and a worker takes a renewable lease. The
   run is durable; the operator can walk away.
3. **The agent works.** Declarative agents get a kernel-driven loop where every
   model turn and tool call is a governed effect. Encapsulated agents get one
   brokered dispatch under an artifact-only execution profile.
4. **Outward actions need permits.** Every external effect is a reservation,
   one durable atomic permit consumption, and a receipt — the existing D4
   protocol semantics, carried on a versioned extension of the D4 surface.
5. **The operator reviews evidence, not vibes.** Settlement writes a terminal
   state with an evidence chain; a renderer surface queues anything needing
   owner judgment, and every authority-bearing decision is made by a human
   through the authenticated operator channel.

### 1.1 Explicit authority transitions

Five boundary statements govern everything below and are restated where they
bind:

1. **Model output is evidence only.** No model observation, evaluator or
   judge-style run output, or plugin output ever becomes an approval, grant,
   selection, or admission record. Only the authenticated operator channel
   converts evidence into an authority-bearing decision record. (Selections
   belong to the split-out work-program decision area, which inherits this
   rule.)
2. **Owner and operator decisions are separate from pure transition
   validation.** The daemon validates state transitions mechanically
   (CAS, identity, idempotency, evidence); it never infers, defaults, or
   substitutes an owner decision. A missing decision is a fail-closed
   precondition, not a gap the daemon fills.
3. **Encapsulated runtimes cannot hide outward effects from D4.** Work that
   D4 cannot individually reserve, permit, and receipt is admissible only
   under an execution profile that proves the runtime cannot produce
   privileged or outward effects at all.
4. **D8 Plans I and J cannot begin before their declared D1–D7 gates.**
   Authoring may precede implementation, but no D8 implementation starts
   before Plan G closes and the successor constitutional baseline is
   ratified, and no D8 code enters the Plan F/G first-release candidate.
5. **D8 produces generic evidence and candidate artifacts only.** It cannot
   promote them, package them for a destination, or write any D9 protected
   destination. Consumer-side D9 tooling packages generic D8 artifacts for
   its own quarantine and promotion pipeline.

---

## 2. Source of truth and precedence

Precedence for this document, highest first:

1. The ratified architecture design specification, including its Section 4
   fixed requirements and six ratified choices.
2. The hardening review
   (`2026-08-26-prism-harness-architecture-design-spec.hardening.md`) and every
   correction it forced. D8 inherits those corrections; it does not relitigate
   them.
3. The ratified invariant law and proof-status amendment
   (`2026-08-27-invariant-law-proof-status-amendment.md`) and Plan A's
   registry-version-2 contract
   (`2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md`),
   which govern how the invariants proposed here enter the constitution. D8
   invariants require the successor constitutional baseline defined in
   Section 14.1; nothing in this document mutates the immutable Plan A
   46-row baseline.
4. The D8 governed-adaptation boundary amendment
   (`2026-08-27-prism-harness-d8-governed-adaptation-boundary-amendment.md`).
5. This document.

Where this document conflicts with any of the above, the above wins and this
document must be amended.

---

## 3. Position in the program

D8 is **not first-release scope**. The parent hardening review's Important 9
warns against self-selected first-release claim sets; this document takes the
conservative reading: the Plan G release claims are the ratified D1–D7 set, and
no D8 capability may appear in public claims until its own plans close.

**Authoring and implementation are distinct.** Plan documents may be authored
early; implementation is gated:

- **Plan I may be authored** once Plan B2 closes and this design is ratified.
- **No D8 implementation may begin before Plan G closes.** Plans I and J
  change production registry, admission, settlement, and operator surfaces;
  none of those changes may exist in the tree Plan F audits or the candidate
  Plan G packages. Plan F audits the ratified D1–D7 baseline exactly as
  specified; Plan G packages only D1–D7 behavior.
- **Plan I implementation additionally requires the ratified successor
  constitutional baseline** (Section 14.1).
- **Plan J begins implementation only after Plan I closes.** Its parent
  dependencies (Plans D and E) are already closed transitively by Plan G.
- **Plan K is not a D8 plan.** It moved with the split-out work-program
  decision area and gates on Plan J, that area's own ratification, and the
  successor baseline.

Dependency position:

```text
Plan A ... Plan F, Plan G      (ratified critical path, unchanged; no D8 code)
              |
              v
successor constitutional baseline ratified   (Section 14.1 owner decision)
              |
              v
Plan I: prompt kind and task definitions     (authoring allowed after B2;
              |                               implementation after G + baseline)
              v
Plan J: declarative agent loop and operator review (implementation after I)
              |
              +--> deferred area Plan K: work programs (own ratification first)
              |
              v
Plan L: governed adaptation (D9; L1 after J, L2 also after deferred Plan K)
```

Plan L may be authored only after D9 ratification; its Milestone L1 begins
implementation only after Plan J closes, and any work-program-dependent
milestone (L2) additionally waits for the deferred area's Plan K. D9 is not
part of D8's implementation authority.

---

## 4. Scope

This design covers:

- a new non-executable `prompt` plugin kind with requested execution bindings;
- a pinned composition algorithm with an exact byte grammar and reproducible
  composed-prompt digests;
- task definitions as admitted, pinned registry artifacts;
- the mapping from an owner goal contract to a task definition;
- the declarative agent loop: kernel-driven turns, per-turn governed dispatch,
  tool calls as effects, atomically charged budgets, and a bound verification
  gate before `completed`;
- the encapsulated agent path, restricted to artifact-only execution profiles
  (the existing D3 provider mechanism, with an admission restriction);
- the D9 adaptation boundary: a run may produce a quarantined candidate
  artifact for D9 evaluation, but no D8 record authorizes durable adaptation;
- the operator review surface: approval-gated effects, canonical-content
  confirmation, and a decision queue; and
- the versioned D4 settlement-surface extension these behaviors require.

## 5. Non-goals

This design does not add:

- multi-task scheduling inside the harness — one harness instance still owns
  exactly one admitted run (parent Section 6 stands; multi-run composition
  belongs to the split-out work-program area, in the consumer control plane);
- model-directed changes to grants, plugin sets, routes, or budgets mid-run;
- an interactive chat surface, session semantics, or context-compaction
  machinery;
- a new execution class;
- prompt authority — no wording in any prompt file ever creates, requests, or
  widens authority at run time;
- durable canonical learning, direct memory or skill writes, or live changes to
  prompts, task definitions, registries, plugin sets, grants, routes, budgets,
  evaluators, constitutional law, or proof state;
- use of an approval-gated effect, or of any split-out-area record (selection,
  judge recommendation, apply task), as authority to write a D9 adaptation
  destination;
- outward, privileged, approval-gated, or apply authority for encapsulated
  runs — encapsulated work is artifact-only under a proven execution profile;
- multi-run work programs, competitive fan-out, judge runs, selection
  records, or apply tasks — that subsystem was split by owner decision into
  the deferred decision area
  (`2026-08-27-prism-harness-work-program-selection-design-spec.md`) and is
  not D8 ratification scope;
- automatic retry of ambiguous effects; or
- any weakening of the D3/D4 permit protocol semantics. D8 extends the D4
  surface through the parent Section 22 versioning rules; it never bypasses
  reservation, permit issue, atomic consumption, receipts, ambiguity, or the
  one-writer transaction discipline.

---

## 6. Vocabulary additions

| Term | Meaning |
|---|---|
| Prompt plugin | A non-executable plugin (`kind: "prompt"`) whose pinned files are instruction content, with optional requested execution bindings in its manifest. |
| Requested binding | A manifest-declared request for tool plugin references, one provider route class, and budgets. A request confers nothing; only admission grants. |
| Agent | The runtime instantiation of a prompt plugin whose requested bindings were granted for one admitted run. Not a stored kind. |
| Task definition | An owner-pinned registry artifact binding one goal statement, one prompt plugin, granted bindings, an execution class, exact loop-replay semantics, filesystem capabilities, policies, and a verification binding. |
| Goal contract | The owner-side document a task definition is derived from. Prism admits the derived task definition, not the prose contract. |
| Declarative run | An admitted run whose harness instance drives a turn loop: model dispatches and tool calls are individually governed effects. |
| Encapsulated run | An admitted run whose single effect is one brokered dispatch to an external agentic runtime under an artifact-only execution profile. |
| Execution profile | An owner-pinned, versioned, admission-bound description of an external runtime's proven effect envelope. The only profile family defined by D8 is `artifact-only`. |
| Turn | One model dispatch inside a declarative run: composed request, reserved effect, consumed permit, broker observation. |
| Proposed action | Untrusted model output the trusted loop runtime maps onto a granted operation, or rejects. Model output never becomes authority. |
| Verification binding | The task definition's admitted binding of a verifier identity and version, subject binding, expected predicate, and trusted observation shape. |
| Verification operation | A granted operation executing the verification binding; its receipt is positive evidence only when D4 validates it against the binding. |
| Budget slot | One unit of the admitted turn or effect budget, claimed atomically in the transaction that commits an effect's first semantic reservation. Slots are monotonic: once claimed, never released. |
| Elapsed-active accumulator | The persisted count of active seconds a run has consumed, paired with a closed accounting state and updated transactionally across daemon epochs. |
| Daemon epoch V1 | The durable leadership generation encoded canonically as one non-zero unsigned 64-bit integer. Zero is reserved, values never repeat or wrap, and exhaustion prevents a successor daemon from opening authority-bearing interfaces. |
| Validated keyed catalog V1 | An opaque runtime brand produced only after the canonical decoder proves the schema-declared semantic key, key order, and duplicate-key rejection for a keyed list. Raw arrays and caller-built maps do not satisfy it. |
| Approval-gate deadline V1 | The one reservation-owned epoch-local monotonic deadline after which no first decision may commit. Its epoch and integer monotonic tick are canonical authority; equality is expired. |
| Decision linearization time V1 | The trusted settlement writer's single epoch-local monotonic sample taken while serializing the conditional state update. It is the normative time of the decision transition, regardless of later storage acknowledgement latency. |
| Alias-isolated filesystem capability | A fresh per-run whole-filesystem or mount root whose inode identity graph cannot cross the capability boundary. A shared host directory is not one. |
| Artifact emission | A destination-free, by-value `putByDigest` of immutable bytes or a typed patch from a capability into the exact daemon-measured artifact-store binding carried by the admitted run. It returns only an opaque owner-domain-scoped reference and grants no apply authority. |
| Artifact store binding | The canonical identity of one daemon-owned store instance: owner domain, schema, executable adapter, writer and reader principals/protocol, dedicated physical backing and root identities, and isolation profile. It is derived by the daemon, never selected by a task. |
| Artifact store isolation evidence | The admission-time proof that the measured store binding is physically disjoint from the run's filesystem capabilities and every protected, credential, consumer-writer, synchronized, or other-owner store root. |
| Artifact reference | An owner-domain-scoped capability-free reference binding the artifact-store instance, exact binding digest, content digest, and byte length. It contains no path, endpoint, or apply target. |
| Destination class | A closed owner-registry classification of the actual sink an outward operation may affect. It is distinct from effect family, which classifies behavior rather than authority destination. |
| Outward destination capability | An owner-pinned, exact-version grant naming one non-protected destination class, canonical destination identity, adapter, adapter configuration, and execution principal. Raw endpoints and credentials are never task inputs. |
| Outward operation binding | The task-bound exact tool operation descriptor, effect taxonomy, trusted destination resolver, and closed set of outward destination capabilities that operation may resolve to. |
| Resolved outward destination | The trusted resolver's canonical reservation-time result binding one outward operation to exactly one admitted destination capability and resource selector. D4 persists and rechecks it through permit consumption and receipt. |
| Loop replay binding | The owner-pinned exact conversation serializer, proposed-action grammar and parser executable, tool-descriptor schema, and operation-ID derivation used for every turn of one admitted task. |
| Loop content store | A daemon-derived, owner-domain-scoped immutable content-addressed store for exact bounded model/tool observations and runtime feedback. Raw bytes live here, never in the evidence ledger or settlement rows. |
| Turn journal checkpoint | The one-writer settlement CAS that binds a broker receipt to its exact loop-content reference, parser result, stable action identities, conversation append, and next loop state before any derived action reservation may commit. |
| Destination policy | The task definition's owner-pinned binding from a writable effect family to whole alias-isolated capability roots. |
| Read policy | The task definition's owner-pinned binding from a readable effect family to whole alias-isolated capability roots. |
| Canonical authority value | A value encoded only by a closed `pnh-canonical-value-v1` schema; its typed bytes, schema id, version, and domain prefix determine an authority-bearing digest. |
| Task payload | The bounded, immutable UTF-8 byte sequence carrying the run's input data, canonically encoded and digest-bound into the admitted-run snapshot. Data, never instruction or authority. |
| Approval-gated effect | An effect whose grant requires a durable owner approval record before D4 may issue its dispatch permit. |
| Decision queue | The renderer surface listing pending approval-gated effects and terminal runs awaiting owner action. Read-only. |

---

## 7. Design principles

Inherited unchanged from the parent specification: one authority root (8.1),
deep modules at dangerous seams (8.2), one writer for coupled host state (8.3),
plugins never report their own authority (8.4), honest uncertainty (8.5), two
real adapters at every persistence seam (8.6), no compatibility path that
weakens production (8.7).

Five D8-specific principles:

### 7.1 Instructions and grants ride separate lanes

Authority requests exist only in validated manifest JSON and owner-pinned
registry records. Prompt file content is composition input, never parsed for
authority. This is the structural fix for the instruction-channel hijack class:
if prose could ask for authority, task input injected into prose could too.

### 7.2 Model output is a proposal, not a command

The declarative loop runtime is trusted runtime code. It treats every model
observation as untrusted content, maps proposed actions onto the closed set of
granted operations, and rejects everything else with an operator-visible
evidence record. There is no "the model asked for X, so grant X" path. The
only model-derived proposals eligible for validation are the exact actions in
a committed version-bound turn journal; raw or reparsed observation bytes have
no reservation authority. The same rule binds any evaluator- or judge-style
run: its output is normalized,
stored, and displayed evidence, never authority. The only writer of
authority-bearing decision records is the authenticated operator channel
(Section 12.3).

### 7.3 Artifact-only work gets no outward authority

A run admitted without outward effect classes produces artifacts only, and no
later record retroactively widens it. The split-out work-program decision
area builds its compete-then-apply protocol on exactly this property.

### 7.4 Selection is not adaptation authority

A D8 run may produce artifacts and recommendations for later D9 evaluation.
No approval-gated effect — nor any split-out-area selection or apply task —
may make those artifacts durable learned state. The adaptation plane owns a separate
quarantine, scan, evaluation, independent recommendation, owner approval, pure
resolution, and promotion path. Promotion affects future versions only.

### 7.5 Decisions are human; validation is mechanical

Every authority-bearing D8 record — approval or denial (and, in the
split-out area, selection) — is created by an authenticated human operator
action through the operator channel. The
daemon's role is pure transition validation: it checks identity, canonical
content, idempotency, CAS preconditions, and evidence; it never creates,
defaults, or completes a decision. Where a decision is missing, the dependent
transition fails closed.

---

## 8. D8.1 design: the `prompt` plugin kind

### 8.1 Why a kind, not loose files

The registry's admission machinery (pins, digests, versioning, owner
ratification) is exactly the provenance control prompt content needs; drifted
or injected instructions are as dangerous as drifted code. Keeping prompts
outside the registry recreates the config-drift problem at the harness's most
sensitive input.

A kind is justified under the existing rule that kinds are authority classes:
the kernel enforces a genuinely different contract for prompts — no
entrypoint, no execution, no capabilities, but pinned content, composition
metadata, and optional requested bindings.

### 8.2 Manifest shape

```jsonc
{
  "id": "task-tdd-implementer",
  "version": "1.0.0",
  "apiVersion": 1,
  "kind": "prompt",
  "compatibility": { "kernelApiVersion": "pnh-kernel-v1" },
  // no entrypoint — a prompt kind with an entrypoint fails admission
  "files": ["role.md", "loop-guidance.md"],
  "composition": {
    "algorithmVersion": "pnh-compose-v1", // closed set; pinned byte grammar
    "placement": "system",        // closed set: system | pre-task | post-task
    "precedence": 40               // lower composes earlier; ties fail admission
  },
  "requestedBindings": {
    "tools": ["fs-read", "fs-write", "test-runner"],   // tool plugin ids
    "routeClass": "code-strong",                        // one route class, no list
    "budgets": {
      "maxTurns": 40,
      "maxEffects": 200,
      "maxActiveSeconds": 7200
    }
  },
  "dependencies": [],
  "requestedCapabilities": [],
  "license": { "spdxId": "Apache-2.0", "holder": "Vora Technologies, LLC" }
}
```

Rules:

- `entrypoint` absent, `requestedCapabilities` empty; violations are admission
  rejections, not warnings.
- `requestedBindings` is optional. A prompt with no requests is a fragment
  (composed into other agents' prompts); a prompt with granted requests is an
  agent role. Same kind, different grants.
- Requests name plugin ids and one route class. They never name providers,
  models, endpoints, or credentials — exact route resolution stays inside the
  admitted `ProviderBrokerBinding`, as in D3.
- File content is hashed into `versionDigest` like any plugin. Content is
  UTF-8 markdown or plain text; admission rejects other types.
- `maxActiveSeconds` bounds elapsed active time as defined in Section 10.5.
  It is not a wall-clock deadline; parent Sections 14.4 and 14.5 forbid
  interpreting monotonic time across daemon epochs.

### 8.2.1 Composition byte grammar (`pnh-compose-v1`)

The composed prompt for a run must be reproducible byte-for-byte from the
admitted set alone. `pnh-compose-v1` pins the exact grammar; the algorithm
version participates in the task digest and the composed-prompt digest, so two
implementations cannot silently diverge.

Admission-time source validation (each rule is a named rejection class):

- every prompt file must be valid UTF-8 with no byte-order mark;
- carriage-return bytes are rejected — line endings are exactly `\n`;
- every file must be non-empty and end with exactly one final `\n`;
- no Unicode normalization is applied at any stage — content is preserved and
  hashed byte-exact.

Composition (deterministic, total):

1. Order admitted fragments by placement class (`system`, then `pre-task`,
   then `post-task`), then by ascending `precedence`. Equal precedence within
   one placement class fails admission, so the order is total.
2. Within one placement class, join fragment file bytes in manifest `files`
   order per plugin, plugins in the precedence order above, with no separator
   bytes added or removed — each fragment already ends in exactly one `\n`.
3. Each source has one closed canonical role. The `system` join produces
   `ComposedMessageRoleV1.system`; the `pre-task` join produces
   `ComposedMessageRoleV1.pre-task-context`; the immutable task payload
   produces `ComposedMessageRoleV1.task-payload`; and the `post-task` join
   produces `ComposedMessageRoleV1.post-task-context`. They appear in exactly
   that order. An empty fragment placement class produces no message; the task
   payload message is always present, including when its bounded byte value is
   empty. A role is part of the canonical value and cannot be inferred from
   list position by an implementation.
4. The composed-prompt digest is SHA-256 over the `ComposedPromptDigestV1`
   schema encoded by `pnh-canonical-value-v1` (Section 8.2.2), with the ASCII
   domain-separation prefix `pnh-compose-v1\0`. Its fields are, in this exact
   order: algorithm version; fragment count; contributing `(pluginId,
   versionDigest, filePath)` records in composition order; message count; and
   each produced message's role and exact content bytes in message order.
   Plan I publishes test vectors, including delimiter-sensitive identifiers
   and multi-byte Unicode content, that two independent implementations must
   reproduce byte-identically.

Plan I ships cross-platform golden fixtures for: CRLF content (rejected), BOM
(rejected), invalid UTF-8 (rejected), empty file (rejected), missing final
newline (rejected), multi-fragment ordering, byte-exact Unicode content, and
digest stability across supported platforms.

The four roles above are provider-neutral semantic roles, not provider wire
role strings. The admitted `ProviderBrokerBinding` pins one
`providerMessageTranslationId`, version digest, and executable digest that
translates the complete canonical role/content sequence into the selected
provider protocol. The broker reservation, permit, and receipt carry that
binding. Translation may change provider syntax but may not merge, reorder,
drop, duplicate, or reinterpret canonical messages. An unavailable or drifted
translation rejects before dispatch. Plan I publishes vectors for all four
roles, absent fragment classes, empty payload bytes, Unicode and delimiter
content, and every one-role mutation; Plan J replays each vector through two
provider adapters and requires the same pre-translation sequence and digest.

### 8.2.2 Canonical authority-value codec (`pnh-canonical-value-v1`)

Every authority-bearing D8 digest uses one generated, closed-schema codec.
The machine-readable schema source is normative; it generates the encoder,
decoder, schema hashes, fixtures, and the human-readable field tables. No
caller hand-assembles digest preimages.

The byte grammar is fixed:

- every preimage starts with its exact ASCII domain-separation prefix,
  including the terminating `0x00`, followed by the tagged UTF-8 schema id and
  one schema-typed root value;
- single-byte tags are fixed: UTF-8 string `0x01`, byte string `0x02`,
  32-byte digest `0x03`, unsigned integer `0x04`, boolean `0x05`, record
  `0x06`, list `0x07`, nullable `0x08`, and tagged union `0x09`;
- UTF-8 strings and byte strings carry their tag, an 8-byte big-endian
  unsigned length, and exact bytes; digests carry `0x03` and exactly 32 bytes;
  unsigned integers carry `0x04` and one 8-byte big-endian value; booleans carry
  `0x05` and `0x00` or `0x01`;
- records carry `0x06` and their fields in schema order, with no field names in
  the preimage; lists carry `0x07`, an 8-byte element count, and elements in
  their schema-defined order;
- nullable values carry `0x08` and one presence byte (`0x00` for null, `0x01`
  followed by the typed value); tagged unions carry `0x09`, an 8-byte
  schema-assigned variant number, and the selected variant value; and
- native or wire maps, floats, implicit defaults, omitted fields, unknown
  fields, alternate normalizations, and implementation-selected ordering are
  forbidden. Schema-declared keyed collections use the ordinary list tag and
  the exact key rules below; no runtime map iteration order reaches the codec.

The primitive aliases and enum assignments are closed here, not left to Plan I:

- every `*Id`, `*Name`, `*Class`, `*Family`, `*Role`, `*Code`, version string,
  `CanonicalRelativePath`, and `TrustedObservationShapeId` is a tagged UTF-8
  string (`0x01`) after its registry syntax validation; every `Digest` is
  `0x03`; every `BoundedBytes` value is `0x02`; every budget, byte length, and
  schema version is unsigned integer `0x04`;
- `DaemonEpochV1` is not an identifier alias. It is exactly the unsigned
  integer primitive: tag `0x04` followed by one 8-byte big-endian value. Its
  valid domain is `1` through `18446744073709551615` inclusive. Zero is
  reserved and rejected; negative, floating-point, UTF-8 string, decimal-string,
  byte-string, digest, nullable, record, list, tagged-union, truncated-integer,
  over-width, and overflow representations are rejected. Implementations must
  use a lossless unsigned 64-bit value rather than a floating-point runtime
  number. The first successful leadership acquisition initializes an absent
  durable counter to `1` in the same transaction that acquires leadership;
  every replacement increments it exactly once. Epoch values never repeat or
  wrap. The maximum value is valid for the current daemon, but a replacement
  that cannot increment it fails leadership acquisition and keeps admission
  and operator writes closed;
- `MonotonicNanosecondsV1`, every `turnOrdinal`, `actionOrdinal`,
  `messageOrdinal`, `loopStateVersion`, `reservationStateVersion`, and
  `settlementStateVersion` are unsigned integer primitive values (`0x04` plus
  exactly 8 big-endian bytes). A monotonic value is nanoseconds from an opaque
  origin valid only inside its paired `DaemonEpochV1`; cross-epoch comparison
  is forbidden. Implementations use lossless integers and reject negative,
  floating-point, string, truncated, over-width, and overflow forms;
- `RunShapeV1` is union variant 1 `declarative`, variant 2 `encapsulated`;
  `FilesystemAccessV1` is variant 1 `read-only`, variant 2 `read-write`;
  `VerificationSubjectV1` is variant 1 `artifact-digest`, variant 2
  `external-state-probe`;
- `MutationKindV1` assigns variants in this order: 1 `final-write`, 2
  `temporary-write`, 3 `directory-create`, 4 `rename`, 5 `delete`, 6
  `metadata-change`, 7 `permission-change`, 8 `hard-link-create`, and 9
  `symbolic-link-create`;
- `ArtifactEmissionKindV1` assigns variant 1 `immutable-bytes` and variant 2
  `typed-patch`;
- `ComposedMessageRoleV1` assigns variant 1 `system`, variant 2
  `pre-task-context`, variant 3 `task-payload`, and variant 4
  `post-task-context`;
- `ApprovalGateStatusV1` assigns variant 1 `pending`, variant 2
  `approved-awaiting-permit`, variant 3 `rejected-denied`, and variant 4
  `rejected-expired`;
- `ApprovalDecisionV1` assigns variant 1 `approve`, variant 2 `deny`;
  `ApprovalSubjectV1` assigns variant 1 `model-dispatch`, variant 2
  `tool-operation`, and variant 3 `verification-operation`;
  `MutationScopeV1` assigns variant 1 `enumerated-footprint` and variant 2
  `capability-envelope`;
  `ToolEffectScopeV1` assigns variant 1 `local-filesystem` and variant 2
  `outward-adapter`; `ToolEffectPermitStatusV1` assigns variant 1
  `issued-unconsumed` and variant 2 `consumed`;
  `AccountingStateV1` assigns variant 1 `active-accruing`, variant 2
  `approval-suspended`, and variant 3 `non-accruing`;
  `AccountingTransitionKindV1` assigns variant 1 `lease-open`, variant 2
  `active-checkpoint`, variant 3 `approval-suspend`, variant 4
  `close-non-accruing`, and variant 5 `epoch-recovery-close`;
  `SupplementalObservationKindV1` assigns variant 1 `late-broker-receipt` and
  variant 2 `late-tool-receipt`;
  `LoopContentKindV1` assigns variant 1 `model-observation`, variant 2
  `tool-observation`, variant 3 `runtime-feedback`, and variant 4
  `proposed-action-parameters`;
  `ConversationRoleV1` assigns variant 1 `assistant`, variant 2 `tool`, and
  variant 3 `runtime`; `TurnParseDispositionV1` assigns variant 1 `actions`,
  variant 2 `completion`, and variant 3 `refused-malformed`;
  `TurnCheckpointDispositionV1` assigns variant 1 `actions-ready`, variant 2
  `looping`, variant 3 `verifying`, variant 4
  `settling-artifact-only`, variant 5 `failed`, and variant 6 `ambiguous`;
  `ActionCheckpointDispositionV1` assigns variant 1 `reservation-refused`,
  variant 2 `effect-settled`, and variant 3 `effect-ambiguous`.
  Literal fields such as `decisionKind: "d8-effect-approval"`,
  `role: "primary-artifact"`, and `expected: "pass"` are encoded as their
  exact tagged UTF-8 values and reject any alternative.

Every simple enum variant above has a zero-field record payload. The
`VerificationSubjectV1`, `ApprovalSubjectV1`, and `MutationScopeV1` tagged
unions instead carry records. The two `VerificationSubjectV1` variants carry
records in this exact order:
variant 1 carries exact `kind`, exact `role`; variant 2 carries exact `kind`,
`probeSpecDigest`. The redundant literal `kind` remains encoded so the typed
registry value and canonical bytes cannot disagree silently.

`MutationScopeV1` variant 1 carries exact literal
`kind: "enumerated-footprint"` then one `EnumeratedMutationScopeV1`; variant 2
carries exact literal `kind: "capability-envelope"` then one
`CapabilityMutationEnvelopeV1`. `ApprovalSubjectV1` variant 1 carries exact
literal `kind: "model-dispatch"` then one `ModelDispatchApprovalSubjectV1`;
variant 2 carries exact literal `kind: "tool-operation"` then one
`ToolOperationApprovalSubjectV1`; variant 3 carries exact literal
`kind: "verification-operation"` then one
`VerificationOperationApprovalSubjectV1`. An unknown arm or a mismatch between
the arm number, literal kind, and payload rejects before hashing.

`OperationIdentityOriginV1` is tagged union variant 1 `model-turn`, carrying
the exact literal `kind` then `turnOrdinal`, or variant 2
`journaled-action`, carrying exact `kind`, `turnOrdinal`, `actionOrdinal`,
`observationContentDigest`, and `proposedActionDigest` in that order.

Every record below carries `0x06` followed by fields in the stated order:

- `BudgetBindingV1`: `maxTurns`, `maxEffects`, `maxActiveSeconds`;
- `ComposedMessageV1`: `role`, exact `contentBytes`;
- `GrantedToolOperationBindingV1`: `operationName`,
  `operationDescriptorDigest`, `effectClass`, `effectFamily`,
  `effectTaxonomyDigest`, then sorted unique
  `destinationCapabilityIds`;
- `GrantedToolBindingV1`: `pluginId`, `toolVersionDigest`, `manifestDigest`,
  `operationSetDigest`, `effectFamilyDescriptorDigest`, then canonical keyed
  list `allowedOperations`;
- `GrantedBindingsV1`: canonical keyed list `tools`, `routeClass`, `budgets`;
- `ExecutionProfileBindingV1`: `profileId`, `versionDigest`;
- `ImportPolicyBindingV1`: `policyId`, `versionDigest`;
- `PromptFragmentBindingV1`: `pluginId`, `versionDigest`;
- `PromptSetBindingV1`: `fragments` in composition order;
- `LoopReplayBindingV1`: `conversationSerializationId`,
  `conversationSerializationVersionDigest`,
  `conversationSerializationExecutableDigest`, `proposedActionGrammarId`,
  `proposedActionGrammarVersionDigest`, `actionParserId`,
  `actionParserVersionDigest`, `actionParserExecutableDigest`,
  `toolDescriptorSchemaId`, `toolDescriptorSchemaVersionDigest`,
  `operationIdDerivationId`, `operationIdDerivationVersionDigest`;
- `FilesystemCapabilityBindingV1`: `capabilityId`, `profileId`,
  `profileVersionDigest`, `access`, nullable `importPolicy`;
- `ProvisionedFilesystemCapabilityV1`: `capabilityId`, `bindingDigest`,
  `provisionedInstanceId`, `backingIdentityDigest`, `rootIdentityDigest`;
- `OutwardDestinationResolverBindingV1`: `resolverId`, `versionDigest`,
  `destinationSchemaDigest`;
- `OutwardDestinationCapabilityBindingV1`: `destinationCapabilityId`,
  `destinationClass`, `destinationCatalogDigest`, `destinationIdentityDigest`,
  `adapterId`, `adapterVersionDigest`, `adapterConfigDigest`, `principalId`;
- `OutwardOperationBindingV1`: `toolPluginId`, `toolVersionDigest`,
  `grantedToolBindingDigest`, `operationName`, `operationDescriptorDigest`,
  `effectClass`, `effectFamily`, `effectTaxonomyDigest`, `resolver`, then sorted unique
  `destinationCapabilityIds`;
- `OutwardOperationKeyV1`: `toolPluginId`, `operationName`;
- `ResolvedOutwardDestinationV1`: `taskDigest`, `toolPluginId`,
  `toolVersionDigest`, `operationName`, `operationDescriptorDigest`,
  `effectClass`, `effectFamily`, `effectTaxonomyDigest`,
  `destinationCapabilityId`, `destinationClass`, `destinationCatalogDigest`,
  `destinationIdentityDigest`, `adapterId`, `adapterVersionDigest`,
  `adapterConfigDigest`, `principalId`, `resolverId`,
  `resolverVersionDigest`, `destinationSchemaDigest`,
  `canonicalResourceSelector`, `canonicalResourceSelectorDigest`;
- `ArtifactStoreBindingV1`: `artifactStoreId`, `storeInstanceId`,
  `ownerDomainId`, `storeSchemaVersion`, `storeSchemaDigest`, `adapterId`,
  `adapterVersionDigest`, `adapterExecutableDigest`, `writerPrincipalId`,
  `readerProtocolVersion`, `readerPrincipalId`, `backingIdentityDigest`,
  `rootIdentityDigest`, `isolationProfileId`,
  `isolationProfileVersionDigest`;
- `ArtifactStoreIsolationEvidenceV1`: `runId`,
  `artifactStoreBindingDigest`, `filesystemCapabilityCatalogDigest`,
  `protectedRootCatalogDigest`, `credentialRootCatalogDigest`,
  `consumerWriterRootCatalogDigest`, `otherOwnerArtifactStoreCatalogDigest`,
  exact literal `result: "pass"`;
- `ArtifactReferenceV1`: `artifactStoreBindingDigest`, `storeInstanceId`,
  `ownerDomainId`, `contentDigest`, `byteLength`;
- `ArtifactEmissionRecordV1`: `runId`, `taskDigest`, `sourceCapabilityId`,
  `sourceCapabilityBindingDigest`, `sourceCapabilityInstanceId`,
  `sourceRelativePath`, `emissionKind`, nullable `typedPatchSchemaDigest`,
  `artifactReference`;
- `LoopContentStoreBindingV1`: `loopContentStoreId`, `storeInstanceId`,
  `ownerDomainId`, `storeSchemaVersion`, `storeSchemaDigest`, `adapterId`,
  `adapterVersionDigest`, `adapterExecutableDigest`, `writerPrincipalId`,
  `readerPrincipalId`, `backingIdentityDigest`, `rootIdentityDigest`,
  `isolationProfileId`, `isolationProfileVersionDigest`, `retentionPolicyId`,
  `retentionPolicyVersionDigest`;
- `LoopContentStoreIsolationEvidenceV1`: `runId`,
  `loopContentStoreBindingDigest`, `filesystemCapabilityCatalogDigest`,
  `protectedRootCatalogDigest`, `credentialRootCatalogDigest`,
  `artifactStoreBindingDigest`, `consumerWriterRootCatalogDigest`,
  `otherOwnerLoopContentStoreCatalogDigest`, exact literal `result: "pass"`;
- `LoopContentReferenceV1`: `loopContentStoreBindingDigest`, `storeInstanceId`,
  `ownerDomainId`, `contentKind`, `contentDigest`, `byteLength`;
- `ConversationMessageReferenceV1`: `messageOrdinal`, `role`, `content`,
  nullable `sourceOperationId`;
- `ProposedActionV1`: `actionOrdinal`, `toolPluginId`, `operationName`,
  `canonicalParameterReference`, `canonicalParameterDigest`;
- `JournaledActionV1`: `proposedAction`, `proposedActionDigest`, `operationId`;
- `TurnParseResultV1`: `disposition`, ordered `actions`, nullable
  `refusalCode`;
- `ConversationStateV1`: `runId`, `taskDigest`, `turnOrdinal`,
  `composedPromptDigest`, `taskPayloadDigest`, nullable `previousStateDigest`,
  ordered `messages`;
- `TurnJournalEntryV1`: `runId`, `taskDigest`, `loopReplayBindingDigest`,
  `turnOrdinal`, `turnOperationId`, `preConversationStateDigest`,
  `brokerReceiptDigest`, `observationReference`, `parseResult`,
  `postConversationState`, `postConversationStateDigest`, `nextLoopState`,
  `preLoopStateVersion`, `postLoopStateVersion`;
- `ActionOutcomeCheckpointV1`: `runId`, `taskDigest`,
  `turnJournalEntryDigest`, `turnOrdinal`, `actionOrdinal`, `operationId`,
  `proposedActionDigest`, `disposition`, nullable `effectRecordDigest`,
  nullable `observationReference`, nullable `feedbackReference`,
  `preConversationStateDigest`, `postConversationState`,
  `postConversationStateDigest`, `nextLoopState`, `preLoopStateVersion`,
  `postLoopStateVersion`;
- `OperationIdentityInputV1`: `runId`, `taskDigest`, exact literal
  `operationIdDerivationId: "pnh-operation-id-v1"`, `origin`;
- `EpochMonotonicDeadlineV1`: `daemonEpoch`, `monotonicNanoseconds`;
- `ApprovalGateStateV1`: `reservationId`, `reservationStateVersion`, `status`,
  `approvalGateDeadline`, nullable `committedDecisionRecordDigest`;
- `DecisionChallengeRecordV1`: `challengeId`, `reservationId`,
  daemon-issued `decisionId`, `reservationStateVersion`,
  `canonicalContentDigest`, `operatorPrincipalId`, `operatorRoleId`,
  `ownerDomainId`, `authorizationPolicyVersionDigest`, `daemonEpoch`,
  `approvalGateDeadline`, `challengeDeadline`, nullable
  `consumedRequestDigest`;
- `DecisionAckV1`: `decisionRecordDigest`, `decisionRequestDigest`;
- `DestinationPolicyV1` and `ReadPolicyV1`: `effectFamily`, then sorted unique
  `capabilityIds`;
- `VerificationPredicateV1`: `specDigest`, exact literal `expected`;
- `VerificationBindingV1`: `verifierPluginId`, `verifierVersionDigest`,
  `subject`, `predicate`, `observationShape`;
- `MutationFootprintEntryV1`: `capabilityId`, `relativePath`, `mutationKind`;
- `ReadSetEntryV1`: `capabilityId`, `relativePath`;
- `ProvisionedCapabilityApprovalBindingV1`: `capabilityId`,
  `capabilityBindingDigest`, `provisionedInstanceId`;
- `EnumeratedMutationScopeV1`: sorted unique `filesystemCapabilityIds`,
  sorted unique `writeFootprint`, and sorted unique `readSet`;
- `CapabilityMutationEnvelopeV1`: sorted unique
  `filesystemCapabilityIds`, canonical keyed list
  `provisionedCapabilityBindings`, sorted unique `allowedMutationKinds`,
  `confinementProfileDigest`, and sorted unique `readSet`;
- `ModelDispatchApprovalSubjectV1`: `turnOperationId`, `routeClass`,
  `providerBrokerBindingDigest`, `providerMessageTranslationVersionDigest`,
  and `requestDigest`;
- `ToolOperationApprovalSubjectV1`: `grantedToolBindingDigest`,
  `operationName`, `operationDescriptorDigest`, `canonicalParameterReference`,
  `canonicalParameterDigest`, `mutationScope`, and nullable
  `resolvedOutwardDestination`;
- `VerificationOperationApprovalSubjectV1`: `verificationBindingDigest`,
  `verificationOperationId`, `subject`, `predicate`, and `observationShape`;
- `ToolEffectClaimV1`: `reservationId`, `taskDigest`,
  `grantedToolBindingDigest`, `operationName`, `operationDescriptorDigest`,
  `scope`, `executionPrincipalId`, `daemonEpoch`, `ownershipLeaseId`, and
  `ownershipLeaseGeneration`;
- `ToolEffectPermitV1`: `permitId`, `reservationId`, `claimRequestDigest`,
  `taskDigest`, `grantedToolBindingDigest`, `operationName`,
  `operationDescriptorDigest`, `effectClass`, `effectFamily`, `scope`,
  `executionPrincipalId`, nullable `mutationScope`, nullable
  `resolvedOutwardDestination`, `receiptShapeDigest`, `daemonEpoch`,
  `ownershipLeaseId`, `ownershipLeaseGeneration`, and `permitDeadline`;
- `ToolEffectPermitStateV1`: `permitId`, `reservationId`, `status`,
  `permitStateVersion`, and nullable `consumptionRecordDigest`;
- `ToolEffectConsumptionV1`: `permitId`, `permitDigest`, `reservationId`,
  `claimRequestDigest`, `executionPrincipalId`, `daemonEpoch`,
  `ownershipLeaseId`, `ownershipLeaseGeneration`, `consumptionTime`,
  `prePermitStateVersion`, and `postPermitStateVersion`;
- `OpenAccountingIntervalV1`: `intervalId`, `daemonEpoch`,
  `ownershipLeaseId`, `ownershipLeaseGeneration`, `openedAt`,
  `lastCheckpointAt`, and `checkpointedActiveNanoseconds`;
- `AccountingRecordV1`: `runId`, `accumulatedActiveNanoseconds`, `state`,
  `stateEpoch`, nullable `ownershipLeaseId`, nullable
  `ownershipLeaseGeneration`, `epochCheckpoint`, nullable `openInterval`,
  nullable `lastClosedIntervalId`, and `settlementStateVersion`;
- `AccountingTransitionRecordV1`: `transitionId`, `runId`, `kind`,
  `preSettlementStateVersion`, `postSettlementStateVersion`, `fromState`,
  `toState`, nullable `closedIntervalId`, nullable `openedIntervalId`,
  `activeDebitNanoseconds`, `transitionEpoch`, and `transitionTime`;
- `SupplementalObservationEntryV1`: `runId`, `reservationId`,
  `terminalRecordDigest`, `frozenTerminalCheckpointDigest`, `sequence`,
  nullable `previousEntryDigest`, `kind`, `receiptDigest`,
  `receiptShapeDigest`, `observedEpoch`, and `observedAt`.

The named digest schemas below are independently versioned and complete:

- `ComposedPromptDigestV1`, prefix `pnh-compose-v1\0`, ordered exactly as
  Section 8.2.1 item 4;
- `TaskPayloadDigestV1`, prefix `pnh-task-payload-v1\0`, containing exactly
  the immutable payload bytes;
- `TaskDefinitionDigestV1`, prefix `pnh-task-definition-v1\0`, containing in
  order: `taskDefId`, `version`, `goalStatement`, `promptPluginId`,
  `compositionAlgorithmVersion`, `loopReplay`, `toolRegistrySchemaDigest`,
  `effectClassificationRegistrySchemaDigest`,
  `protectedDestinationTaxonomyDigest`, `grantedBindings`, `executionClass`,
  `runShape`, nullable `executionProfile`, `promptSet`, canonical keyed list
  `filesystemCapabilities`, canonical keyed list
  `outwardDestinationCapabilities`, canonical keyed list `outwardOperations`,
  canonical keyed list `destinationPolicies`, canonical keyed list
  `readablePolicies`, nullable `verification`, and sorted unique
  key-only set `approvalGates`;
- `LoopReplayBindingDigestV1`, prefix `pnh-loop-replay-binding-v1\0`,
  containing exactly one `LoopReplayBindingV1`;
- `GrantedToolBindingDigestV1`, prefix `pnh-granted-tool-binding-v1\0`,
  containing exactly one `GrantedToolBindingV1`;
- `ToolEffectClaimRequestDigestV1`, prefix `pnh-tool-effect-claim-v1\0`,
  containing exactly one `ToolEffectClaimV1`;
- `ToolEffectPermitDigestV1`, prefix `pnh-tool-effect-permit-v1\0`, containing
  exactly one `ToolEffectPermitV1`;
- `ToolEffectConsumptionDigestV1`, prefix
  `pnh-tool-effect-consumption-v1\0`, containing exactly one
  `ToolEffectConsumptionV1`;
- `AccountingTransitionDigestV1`, prefix `pnh-accounting-transition-v1\0`,
  containing exactly one `AccountingTransitionRecordV1`;
- `SupplementalObservationEntryDigestV1`, prefix
  `pnh-supplemental-observation-v1\0`, containing exactly one
  `SupplementalObservationEntryV1`;
- `LoopContentStoreBindingDigestV1`, prefix
  `pnh-loop-content-store-binding-v1\0`, containing exactly one
  `LoopContentStoreBindingV1`;
- `LoopContentDigestV1`, prefix `pnh-loop-content-v1\0`, containing in order
  one `LoopContentKindV1` and the exact `BoundedBytes` value stored;
- `ProposedActionDigestV1`, prefix `pnh-proposed-action-v1\0`, containing
  exactly one `ProposedActionV1`;
- `ConversationStateDigestV1`, prefix `pnh-conversation-state-v1\0`,
  containing exactly one `ConversationStateV1`;
- `TurnJournalEntryDigestV1`, prefix `pnh-turn-journal-entry-v1\0`, containing
  exactly one `TurnJournalEntryV1`;
- `ActionOutcomeCheckpointDigestV1`, prefix
  `pnh-action-outcome-checkpoint-v1\0`, containing exactly one
  `ActionOutcomeCheckpointV1`;
- `FilesystemCapabilityBindingDigestV1`, prefix
  `pnh-filesystem-capability-binding-v1\0`, containing exactly one
  `FilesystemCapabilityBindingV1`;
- `ArtifactStoreBindingDigestV1`, prefix
  `pnh-artifact-store-binding-v1\0`, containing exactly one
  `ArtifactStoreBindingV1`;
- `ApprovalCanonicalContentV1`, prefix `pnh-approval-content-v1\0`, ordered
  exactly as Section 12.3 defines using the nested records above;
- `DecideRequestDigestV1`, prefix `pnh-decision-request-v1\0`, containing in
  order: `decisionId`, `canonicalContentDigest`, `challengeId`,
  transport-authenticated `operatorPrincipalId`, transport-authenticated
  `operatorRoleId`, transport-authenticated `ownerDomainId`,
  `authorizationPolicyVersionDigest`, `DaemonEpochV1 daemonEpoch`, and
  `ApprovalDecisionV1`; and
- `DecisionRecordDigestV1`, prefix `pnh-decision-record-v1\0`, containing in
  order: `decisionId`, `reservationId`, `decisionRequestDigest`,
  `canonicalContentDigest`, `challengeId`, `operatorPrincipalId`,
  `operatorRoleId`, `ownerDomainId`, `authorizationPolicyVersionDigest`,
  `DaemonEpochV1 daemonEpoch`, `approvalGateDeadline`,
  `decisionLinearizationTime`, `preDecisionReservationStateVersion`,
  `postDecisionReservationStateVersion`, `ApprovalDecisionV1`,
  `settlementStateVersion`, and
  `evidenceCheckpointDigest`.

`ToolEffectPermitV1` scope nullability is closed. `local-filesystem` requires
a non-null mutation scope and null resolved outward destination;
`outward-adapter` requires null mutation scope and the exact non-null
`ResolvedOutwardDestinationV1`. `ToolEffectPermitStateV1.issued-unconsumed`
requires null `consumptionRecordDigest`; `consumed` requires the exact
`ToolEffectConsumptionDigestV1`. Any other combination rejects before claim,
consumption, restart recovery, or receipt commitment.

Every D8 model-turn and journaled-action `OperationId` uses the exact
`pnh-operation-id-v1` derivation: SHA-256 over the ASCII prefix
`pnh-operation-id-v1\0` followed by the canonical encoding of one
`OperationIdentityInputV1`, rendered as the lowercase identifier
`opv1_` plus its 64 hexadecimal digest characters. Randomness, process state,
daemon epoch, retry attempt, parser-selected identifiers, and caller-supplied
idempotency keys are absent. A model-turn origin binds its turn ordinal; a
journaled-action origin additionally binds its action ordinal, observation
content digest, and proposed-action digest. Re-derivation mismatch rejects
before reservation.

`TurnParseResultV1.actions` is non-empty only for disposition `actions` and is
empty for `completion` or `refused-malformed`; `refusalCode` is non-null only
for `refused-malformed`. Action ordinals start at one and are contiguous in
observation order. `ConversationStateV1.messages` uses contiguous global
message ordinals and is the exact append made by that state; following its
`previousStateDigest` chain reconstructs the complete dynamic conversation.
The initial state is turn zero with null previous digest and no dynamic
messages. Any gap, duplicate,
cross-run reference, content-kind mismatch, digest mismatch, or impossible
disposition/payload combination is a non-canonical value and fails before a
journal digest or derived reservation can become authority.

Each proposed action's parameter reference must use content kind
`proposed-action-parameters`, the journal's exact store binding/instance and
owner domain, and readable bytes whose `LoopContentDigestV1`, byte length, and
operation-schema `canonicalParameterDigest` all match. The settlement record
contains no parameter bytes. Any mismatch rejects the journal or reservation.

`ActionOutcomeCheckpointV1` is unique by `(turnJournalEntryDigest,
actionOrdinal)` and must repeat the journaled operation id and proposed-action
digest. `reservation-refused` requires null `effectRecordDigest` and
`observationReference` plus non-null feedback; `effect-settled` requires a
matching effect record and permits the exact observation or feedback references
that record produced; `effect-ambiguous` requires the matching ambiguous effect
record and cannot carry positive observation evidence. Every disposition
advances the conversation and loop-state versions exactly once. Any other
nullability or version combination is non-canonical and fails closed.

Parse disposition `actions` requires next state `actions-ready`; `completion`
requires `verifying` or `settling-artifact-only` according to the admitted
verification binding; and `refused-malformed` requires `looping` while budget
remains or `failed` when it does not. Non-final action checkpoints remain
`actions-ready`; the final checkpoint moves to `looping`, `verifying`,
`settling-artifact-only`, `failed`, or `ambiguous` only as the compared
settlement state permits. An impossible parse/next-state or action/next-state
pair rejects before checkpoint authority exists.

`ArtifactStoreBindingDigestV1` does not enter `TaskDefinitionDigestV1`: a task
cannot choose, widen, or replace the daemon's artifact sink. Production
admission obtains the measured binding from host custody, compares it with the
run's owner domain and provisioned capability identities, and persists the
complete binding, its digest, and `ArtifactStoreIsolationEvidenceV1` in the
admitted-run snapshot. The snapshot and every emission record therefore pin
the runtime sink without making it task-authored authority.

`LoopContentStoreBindingDigestV1` likewise does not enter
`TaskDefinitionDigestV1`; `LoopReplayBindingV1` does. Host custody selects and
measures the private content store, while the owner-pinned task selects the
only parser/serialization semantics permitted to consume it. Admission persists
the complete content-store binding, its digest, and
`LoopContentStoreIsolationEvidenceV1` beside the complete replay binding and
`LoopReplayBindingDigestV1`. Neither store identity nor parser identity may
float on restart.

Canonical keyed collections are list-encoded; there is no map tag. Each schema
declares one semantic key. The encoder computes that key from the typed element,
encodes the key canonically, sorts by those key bytes where the collection is
unordered, and rejects equal key bytes before encoding even when the elements'
remaining fields differ. There is no payload tie-breaker, first-wins,
last-wins, or silent normalization. A decoder rejects duplicate keys and wrong
key order before re-encoding or hashing. Ordered keyed lists preserve their
declared semantic order but still reject duplicate keys. Key-only sets use the
element itself as the key and reject duplicate elements. Non-keyed sets, where
explicitly named, sort by complete canonical element bytes.

`CanonicalSortedUniqueSetV1<T>` is the generated schema constructor for every
authority field explicitly assigned that sorted-unique shape. It adds no
wrapper or new wire tag: the value
uses the ordinary `0x07` list encoding. The encoder sorts by ascending unsigned
lexicographic order of each element's **complete** `pnh-canonical-value-v1`
bytes, including every tag, length, record field, and enum/union variant number,
and rejects equal complete element bytes. The decoder requires that same strict
order and rejects a duplicate or alternate order before re-encoding, hashing,
admission, challenge issuance, or decision acceptance. No field-wise, raw-value,
locale, insertion-order, or implementation-selected comparator is permitted.

| Authority collection | Canonical shape | Semantic key | Ordering rule |
|---|---|---|---|
| `PromptSetBindingV1.fragments` | ordered keyed list | `pluginId` | Composition order; duplicate key rejected. |
| `TurnParseResultV1.actions` | ordered keyed list | `actionOrdinal` | Observation order, starting at one and contiguous; duplicate or gap rejected. |
| `ConversationStateV1.messages` | ordered keyed list | `messageOrdinal` | Conversation append order, globally contiguous; duplicate or gap rejected. |
| `GrantedBindingsV1.tools` | keyed list | `pluginId` | Canonical key bytes; duplicate plugin id rejected even when another field differs. |
| `GrantedToolBindingV1.allowedOperations` | keyed list | `operationName` | Canonical key bytes; duplicate operation name rejected. |
| `GrantedToolOperationBindingV1.destinationCapabilityIds` | key-only set | `OutwardDestinationCapabilityId` element | Canonical key bytes. |
| `EnumeratedMutationScopeV1.filesystemCapabilityIds`, `writeFootprint`, `readSet` | `CanonicalSortedUniqueSetV1<T>` | complete element | Complete canonical element bytes; duplicate element rejected. |
| `CapabilityMutationEnvelopeV1.filesystemCapabilityIds`, `allowedMutationKinds`, `readSet` | `CanonicalSortedUniqueSetV1<T>` | complete element | Complete canonical element bytes; duplicate element rejected. |
| `CapabilityMutationEnvelopeV1.provisionedCapabilityBindings` | keyed list | `capabilityId` | Canonical key bytes; duplicate capability id rejected. |
| `TaskDefinition.filesystemCapabilities` | keyed list | `capabilityId` | Canonical key bytes. |
| `TaskDefinition.outwardDestinationCapabilities` | keyed list | `destinationCapabilityId` | Canonical key bytes. |
| `TaskDefinition.outwardOperations` | keyed list | `OutwardOperationKeyV1(toolPluginId, operationName)` | Canonical key bytes. |
| `TaskDefinition.destinationPolicies` | keyed list | `effectFamily` | Canonical key bytes. |
| `TaskDefinition.readablePolicies` | keyed list | `effectFamily` | Canonical key bytes. |
| `TaskDefinition.approvalGates` | key-only set | `EffectClassId` element | Canonical key bytes. |
| `OutwardOperationBindingV1.destinationCapabilityIds` | key-only set | `OutwardDestinationCapabilityId` element | Canonical key bytes. |
| `DestinationPolicyV1.capabilityIds`, `ReadPolicyV1.capabilityIds` | key-only set | `FilesystemCapabilityId` element | Canonical key bytes. |
| `AdmittedRunSnapshot.provisionedFilesystemCapabilities` | keyed list | `capabilityId` | Canonical key bytes. |

This table is exhaustive for keyed catalog, ordered journal, and explicitly
named set collections in the task-definition, admitted-run capability,
loop-journal, and approval-content schemas.
Approval mutation-scope sets are semantic non-keyed sets, not runtime
key-to-entry catalogs; they therefore use the one complete-element comparator
above. Provisioned capability bindings are a keyed catalog and use their
declared capability-id key.
Admission rejects a missing required field, duplicate semantic key, duplicate
set member, non-canonical key order, unknown variant, unknown schema version,
unknown identifier encoding, or non-canonical byte stream before any digest can
become authority. Adding a keyed collection requires a new schema version and a
new row in this table; codec generation fails when a keyed list has no declared
key.

Plan I publishes the schema source and cross-implementation vectors covering
null and present values, every union arm, empty and multi-element lists,
delimiter-bearing strings, Unicode bytes, order rejection, unknown fields,
and a one-field mutation for every authority-bearing field. Approval-set
vectors include variable-length capability ids and paths (`cap-b`/`cap-aa`,
`z`/`aa`, minimum-valid/longer, and multibyte UTF-8), mutation names whose lexical
order differs from their enum variant order, reversed wire order, and exact
duplicate elements. A second implementation must decode, re-encode, and hash
every accepted vector byte-identically; both decoders reject reversed or
duplicate set encodings before producing an approval-content, challenge, or
decision digest.

### 8.3 Task input stays data

At composition time the runtime places admitted prompt content and the task
payload in structurally separate message roles. Task payload is never
concatenated into an admitted prompt file's content, and no admitted prompt
may declare placement inside the task payload. Registry version bumps that
would allow interleaving are constitution-gated.

**Task payload is canonically defined, not implementation-shaped.** A
`TaskPayload` is a bounded, immutable UTF-8 byte sequence (registry-bounded
maximum length; invalid UTF-8 or embedded BOM rejected at admission). The
control plane serializes structured input into those bytes exactly once,
before admission; Prism never re-serializes it. The payload digest —
SHA-256 over `TaskPayloadDigestV1` under Section 8.2.2 with the
domain-separation prefix `pnh-task-payload-v1\0` —
is persisted in the admitted-run snapshot and covered by run evidence.
Rehydration after response loss returns the same bytes; a payload whose
bytes differ from the admitted digest fails composition, so replay can
always prove exactly which input the run consumed.

---

## 9. D8.2 design: task definitions

### 9.1 Registry artifact

A task definition is an owner-pinned registry record:

```ts
type MutationKind =
  | "final-write"
  | "temporary-write"
  | "directory-create"
  | "rename"
  | "delete"
  | "metadata-change"
  | "permission-change"
  | "hard-link-create"
  | "symbolic-link-create";

type ApprovalDecisionV1 = "approve" | "deny";
type ArtifactEmissionKindV1 = "immutable-bytes" | "typed-patch";
type ComposedMessageRoleV1 =
  | "system"
  | "pre-task-context"
  | "task-payload"
  | "post-task-context";
type DaemonEpochV1 = UInt64; // canonical domain is 1..2^64-1; Section 8.2.2
type MonotonicNanosecondsV1 = UInt64;
type ReservationStateVersionV1 = UInt64;
type ApprovalGateStatusV1 =
  | "pending"
  | "approved-awaiting-permit"
  | "rejected-denied"
  | "rejected-expired";

interface TaskDefinition {
  taskDefId: string;
  version: string;
  goalStatement: string;              // owner prose, bounded length; data, not authority
  promptPluginId: string;             // the agent role
  compositionAlgorithmVersion: "pnh-compose-v1";
  loopReplay: LoopReplayBindingV1;
  toolRegistrySchemaDigest: Digest;
  effectClassificationRegistrySchemaDigest: Digest;
  protectedDestinationTaxonomyDigest: Digest;
  grantedBindings: GrantedBindings;   // owner-granted subset of requestedBindings
  executionClass: ExecutionClassId;   // existing closed set; no new classes
  runShape: "declarative" | "encapsulated";
  executionProfile: ExecutionProfileBinding | null; // required for encapsulated
  promptSet: PromptSetBinding;        // complete ordered composition set
  filesystemCapabilities: FilesystemCapabilityBinding[];
  outwardDestinationCapabilities: OutwardDestinationCapabilityBinding[];
  outwardOperations: OutwardOperationBinding[];
  destinationPolicies: DestinationPolicy[]; // one per writable effect family
  readablePolicies: ReadPolicy[];     // one per readable effect family
  verification: VerificationBinding | null;
  approvalGates: EffectClassId[];     // effect classes needing owner approval
}

interface LoopReplayBindingV1 {
  conversationSerializationId: "pnh-conversation-state-v1";
  conversationSerializationVersionDigest: Digest;
  conversationSerializationExecutableDigest: Digest;
  proposedActionGrammarId: "pnh-proposed-action-v1";
  proposedActionGrammarVersionDigest: Digest;
  actionParserId: ActionParserId;
  actionParserVersionDigest: Digest;
  actionParserExecutableDigest: Digest;
  toolDescriptorSchemaId: "pnh-tool-descriptor-v1";
  toolDescriptorSchemaVersionDigest: Digest;
  operationIdDerivationId: "pnh-operation-id-v1";
  operationIdDerivationVersionDigest: Digest;
}

interface BudgetBinding {
  maxTurns: UInt64;
  maxEffects: UInt64;
  maxActiveSeconds: UInt64;
}

interface GrantedBindings {
  tools: GrantedToolBindingV1[];      // canonical keyed list by pluginId
  routeClass: RouteClassId;
  budgets: BudgetBinding;
}

interface GrantedToolOperationBindingV1 {
  operationName: OperationName;
  operationDescriptorDigest: Digest;
  effectClass: EffectClassId;
  effectFamily: EffectFamilyId;
  effectTaxonomyDigest: Digest;
  destinationCapabilityIds: OutwardDestinationCapabilityId[];
}

interface GrantedToolBindingV1 {
  pluginId: PluginId;
  toolVersionDigest: Digest;
  manifestDigest: Digest;
  operationSetDigest: Digest;
  effectFamilyDescriptorDigest: Digest;
  allowedOperations: GrantedToolOperationBindingV1[];
}

interface ExecutionProfileBinding {
  profileId: ExecutionProfileId;
  versionDigest: Digest;
}

interface PromptSetBinding {
  // Every prompt plugin whose fragments compose into this task's prompt,
  // in composition order, at exact versions. Covered by taskDigest.
  fragments: Array<{ pluginId: string; versionDigest: Digest }>;
}

interface ImportPolicyBinding {
  policyId: ImportPolicyId;
  versionDigest: Digest;
}

interface FilesystemCapabilityBinding {
  capabilityId: FilesystemCapabilityId;
  profileId: AliasIsolatedFilesystemProfileId;
  profileVersionDigest: Digest;
  access: "read-only" | "read-write";
  importPolicy: ImportPolicyBinding | null;
}

interface ProvisionedFilesystemCapabilityV1 {
  capabilityId: FilesystemCapabilityId;
  bindingDigest: Digest;
  provisionedInstanceId: ProvisionedFilesystemCapabilityId;
  backingIdentityDigest: Digest;
  rootIdentityDigest: Digest;
}

interface OutwardDestinationResolverBinding {
  resolverId: OutwardDestinationResolverId;
  versionDigest: Digest;
  destinationSchemaDigest: Digest;
}

interface OutwardDestinationCapabilityBinding {
  destinationCapabilityId: OutwardDestinationCapabilityId;
  destinationClass: DestinationClassId;
  destinationCatalogDigest: Digest;
  destinationIdentityDigest: Digest;  // canonical owner/service/tenant/store identity
  adapterId: OutwardAdapterId;
  adapterVersionDigest: Digest;
  adapterConfigDigest: Digest;        // credential-free owner-pinned configuration
  principalId: ExecutionPrincipalId;
}

interface OutwardOperationBinding {
  toolPluginId: PluginId;
  toolVersionDigest: Digest;
  grantedToolBindingDigest: Digest;
  operationName: OperationName;
  operationDescriptorDigest: Digest;
  effectClass: EffectClassId;
  effectFamily: EffectFamilyId;
  effectTaxonomyDigest: Digest;
  resolver: OutwardDestinationResolverBinding;
  destinationCapabilityIds: OutwardDestinationCapabilityId[];
}

interface OutwardOperationKeyV1 {
  toolPluginId: PluginId;
  operationName: OperationName;
}

interface ResolvedOutwardDestinationV1 {
  taskDigest: Digest;
  toolPluginId: PluginId;
  toolVersionDigest: Digest;
  operationName: OperationName;
  operationDescriptorDigest: Digest;
  effectClass: EffectClassId;
  effectFamily: EffectFamilyId;
  effectTaxonomyDigest: Digest;
  destinationCapabilityId: OutwardDestinationCapabilityId;
  destinationClass: DestinationClassId;
  destinationCatalogDigest: Digest;
  destinationIdentityDigest: Digest;
  adapterId: OutwardAdapterId;
  adapterVersionDigest: Digest;
  adapterConfigDigest: Digest;
  principalId: ExecutionPrincipalId;
  resolverId: OutwardDestinationResolverId;
  resolverVersionDigest: Digest;
  destinationSchemaDigest: Digest;
  canonicalResourceSelector: BoundedBytes;
  canonicalResourceSelectorDigest: Digest;
}

// Daemon-derived runtime authority. No TaskDefinition field can select it.
interface ArtifactStoreBindingV1 {
  artifactStoreId: ArtifactStoreId;
  storeInstanceId: ArtifactStoreInstanceId;
  ownerDomainId: OwnerDomainId;
  storeSchemaVersion: UInt64;
  storeSchemaDigest: Digest;
  adapterId: ArtifactStoreAdapterId;
  adapterVersionDigest: Digest;
  adapterExecutableDigest: Digest;
  writerPrincipalId: ServicePrincipalId;
  readerProtocolVersion: string;
  readerPrincipalId: ServicePrincipalId;
  backingIdentityDigest: Digest;
  rootIdentityDigest: Digest;
  isolationProfileId: ArtifactStoreIsolationProfileId;
  isolationProfileVersionDigest: Digest;
}

interface ArtifactStoreIsolationEvidenceV1 {
  runId: RunId;
  artifactStoreBindingDigest: Digest;
  filesystemCapabilityCatalogDigest: Digest;
  protectedRootCatalogDigest: Digest;
  credentialRootCatalogDigest: Digest;
  consumerWriterRootCatalogDigest: Digest;
  otherOwnerArtifactStoreCatalogDigest: Digest;
  result: "pass";
}

interface ArtifactReferenceV1 {
  artifactStoreBindingDigest: Digest;
  storeInstanceId: ArtifactStoreInstanceId;
  ownerDomainId: OwnerDomainId;
  contentDigest: Digest;
  byteLength: UInt64;
}

interface ArtifactEmissionRecordV1 {
  runId: RunId;
  taskDigest: Digest;
  sourceCapabilityId: FilesystemCapabilityId;
  sourceCapabilityBindingDigest: Digest;
  sourceCapabilityInstanceId: ProvisionedFilesystemCapabilityId;
  sourceRelativePath: CanonicalRelativePath;
  emissionKind: ArtifactEmissionKindV1;
  typedPatchSchemaDigest: Digest | null;
  artifactReference: ArtifactReferenceV1;
}

type LoopContentKindV1 =
  | "model-observation"
  | "tool-observation"
  | "runtime-feedback"
  | "proposed-action-parameters";
type ConversationRoleV1 = "assistant" | "tool" | "runtime";
type TurnParseDispositionV1 = "actions" | "completion" | "refused-malformed";
type TurnCheckpointDispositionV1 =
  | "actions-ready"
  | "looping"
  | "verifying"
  | "settling-artifact-only"
  | "failed"
  | "ambiguous";
type ActionCheckpointDispositionV1 =
  | "reservation-refused"
  | "effect-settled"
  | "effect-ambiguous";

interface LoopContentStoreBindingV1 {
  loopContentStoreId: LoopContentStoreId;
  storeInstanceId: LoopContentStoreInstanceId;
  ownerDomainId: OwnerDomainId;
  storeSchemaVersion: UInt64;
  storeSchemaDigest: Digest;
  adapterId: LoopContentStoreAdapterId;
  adapterVersionDigest: Digest;
  adapterExecutableDigest: Digest;
  writerPrincipalId: ServicePrincipalId;
  readerPrincipalId: ServicePrincipalId;
  backingIdentityDigest: Digest;
  rootIdentityDigest: Digest;
  isolationProfileId: LoopContentIsolationProfileId;
  isolationProfileVersionDigest: Digest;
  retentionPolicyId: RetentionPolicyId;
  retentionPolicyVersionDigest: Digest;
}

interface LoopContentStoreIsolationEvidenceV1 {
  runId: RunId;
  loopContentStoreBindingDigest: Digest;
  filesystemCapabilityCatalogDigest: Digest;
  protectedRootCatalogDigest: Digest;
  credentialRootCatalogDigest: Digest;
  artifactStoreBindingDigest: Digest;
  consumerWriterRootCatalogDigest: Digest;
  otherOwnerLoopContentStoreCatalogDigest: Digest;
  result: "pass";
}

interface LoopContentReferenceV1 {
  loopContentStoreBindingDigest: Digest;
  storeInstanceId: LoopContentStoreInstanceId;
  ownerDomainId: OwnerDomainId;
  contentKind: LoopContentKindV1;
  contentDigest: Digest;
  byteLength: UInt64;
}

interface ConversationMessageReferenceV1 {
  messageOrdinal: UInt64;
  role: ConversationRoleV1;
  content: LoopContentReferenceV1;
  sourceOperationId: OperationId | null;
}

interface ProposedActionV1 {
  actionOrdinal: UInt64;
  toolPluginId: PluginId;
  operationName: OperationName;
  canonicalParameterReference: LoopContentReferenceV1;
  canonicalParameterDigest: Digest;
}

interface JournaledActionV1 {
  proposedAction: ProposedActionV1;
  proposedActionDigest: Digest;
  operationId: OperationId;
}

interface TurnParseResultV1 {
  disposition: TurnParseDispositionV1;
  actions: JournaledActionV1[];
  refusalCode: RefusalCodeV1 | null;
}

interface ConversationStateV1 {
  runId: RunId;
  taskDigest: Digest;
  turnOrdinal: UInt64;
  composedPromptDigest: Digest;
  taskPayloadDigest: Digest;
  previousStateDigest: Digest | null;
  messages: ConversationMessageReferenceV1[];
}

interface TurnJournalEntryV1 {
  runId: RunId;
  taskDigest: Digest;
  loopReplayBindingDigest: Digest;
  turnOrdinal: UInt64;
  turnOperationId: OperationId;
  preConversationStateDigest: Digest;
  brokerReceiptDigest: Digest;
  observationReference: LoopContentReferenceV1;
  parseResult: TurnParseResultV1;
  postConversationState: ConversationStateV1;
  postConversationStateDigest: Digest;
  nextLoopState: TurnCheckpointDispositionV1;
  preLoopStateVersion: UInt64;
  postLoopStateVersion: UInt64;
}

interface ActionOutcomeCheckpointV1 {
  runId: RunId;
  taskDigest: Digest;
  turnJournalEntryDigest: Digest;
  turnOrdinal: UInt64;
  actionOrdinal: UInt64;
  operationId: OperationId;
  proposedActionDigest: Digest;
  disposition: ActionCheckpointDispositionV1;
  effectRecordDigest: Digest | null;
  observationReference: LoopContentReferenceV1 | null;
  feedbackReference: LoopContentReferenceV1 | null;
  preConversationStateDigest: Digest;
  postConversationState: ConversationStateV1;
  postConversationStateDigest: Digest;
  nextLoopState: TurnCheckpointDispositionV1;
  preLoopStateVersion: UInt64;
  postLoopStateVersion: UInt64;
}

type OperationIdentityOriginV1 =
  | { kind: "model-turn"; turnOrdinal: UInt64 }
  | {
      kind: "journaled-action";
      turnOrdinal: UInt64;
      actionOrdinal: UInt64;
      observationContentDigest: Digest;
      proposedActionDigest: Digest;
    };

interface OperationIdentityInputV1 {
  runId: RunId;
  taskDigest: Digest;
  operationIdDerivationId: "pnh-operation-id-v1";
  origin: OperationIdentityOriginV1;
}

interface DestinationPolicy {
  effectFamily: EffectFamilyId;       // closed registry taxonomy, below
  // Whole alias-isolated capability roots; no host path or subdirectory grant.
  capabilityIds: FilesystemCapabilityId[];
}

interface ReadPolicy {
  effectFamily: EffectFamilyId;       // readable families from the same taxonomy
  capabilityIds: FilesystemCapabilityId[];
}

interface VerificationBinding {
  verifierPluginId: string;           // admitted tool plugin; distinct identity
  verifierVersionDigest: Digest;      // exact admitted version
  subject:
    | { kind: "artifact-digest"; role: "primary-artifact" }
    | { kind: "external-state-probe"; probeSpecDigest: Digest };
  predicate: { specDigest: Digest; expected: "pass" };
  observationShape: TrustedObservationShapeId; // closed set validated by D4
}
```

Rules:

- `grantedBindings` must be a subset of the prompt plugin's
  `requestedBindings`. Admission rejects grants the prompt never requested —
  this keeps the request lane meaningful in both directions. The subset rule
  is defined per field: `tools` is set inclusion over plugin ids;
  `routeClass` is exact equality; and each numeric budget field is a
  less-than-or-equal comparison — admission rejects any task definition where
  `grantedBindings.budgets.maxTurns`, `.maxEffects`, or `.maxActiveSeconds`
  exceeds the corresponding `requestedBindings.budgets` value.
- `promptSet` binds the complete ordered composition set: the role plugin and
  every request-free fragment that composes into this task's prompt, each at
  an exact version digest. The binding is covered by `taskDigest`, so adding,
  removing, or re-versioning any fragment changes the admitted task identity.
  Admission and the `PromptComposer` reject a run whose actually composed
  fragments are missing, extra, reordered, or version-drifted relative to
  this binding, or whose admitted fragment algorithm differs from the task's
  exact `compositionAlgorithmVersion`.
- **Authority keys are unique before authority bytes exist.** Plan I generates
  every collection rule from the exhaustive Section 8.2.2 key table. D1
  validates key uniqueness and canonical key order before computing
  `taskDigest`; it never constructs a first-wins or last-wins runtime map from
  unvalidated input. Every policy or operation reference must resolve to
  exactly one element in the validated keyed list. A duplicate key rejects the
  whole task definition even when one payload is byte-identical, less
  privileged, unreachable, or later filtered out. The validating decoder is
  the only constructor of the opaque `ValidatedKeyedCatalogV1` runtime brand;
  admission, snapshot rehydration, D4, and executors accept that brand rather
  than raw arrays or caller-built maps.
- **Filesystem references bind the full selected entry and provisioned
  instance.** For every unique `FilesystemCapabilityBinding`, admission
  computes `FilesystemCapabilityBindingDigestV1`, and host custody provisions
  one `ProvisionedFilesystemCapabilityV1` carrying that digest and the measured
  backing/root identities. The admitted snapshot stores the canonical keyed
  list of full bindings and the corresponding provisioned list, both keyed by
  `capabilityId`. Every destination/read policy reference must resolve exactly
  one pair. Every filesystem reservation, permit, executor request, receipt,
  and artifact-emission source binds and compares `capabilityId`, the complete
  binding digest, and `provisionedInstanceId`; an id-only lookup or mismatch
  rejects before access, and uncertainty after permit consumption is
  `ambiguous`.
- **Tool grants are complete versioned capabilities, never ids.** Every
  `grantedBindings.tools` element is one exact `GrantedToolBindingV1` whose
  digest binds the plugin id and version, complete manifest, complete operation
  set, effect-family descriptor, and every allowed operation's descriptor,
  effect classification, taxonomy, and applicable outward destination
  capabilities. The task also pins the tool-registry schema, effect-
  classification registry schema, and protected-destination taxonomy digests.
  Admission rejects an id-only grant, an operation absent from the allowed
  list, an added operation under a stable plugin id, or any digest mismatch.
  The complete binding and `GrantedToolBindingDigestV1` are copied unchanged
  into the admitted snapshot and every derived reservation, approval subject,
  permit, and receipt. An `OutwardOperationBinding` must carry that same digest
  and exactly match its named allowed operation; neither record can widen the
  other.
- **Version ids never float.** Admission resolves `executionProfile`, every
  filesystem profile, every non-null `importPolicy`, every outward operation
  descriptor, effect taxonomy, destination catalog, destination resolver,
  outward adapter/configuration, execution principal, and every component of
  `loopReplay` against the owner-pinned registry and rejects a missing digest,
  id/digest mismatch, or
  later version drift. The exact ids and digests are covered by `taskDigest`
  and copied into the admitted-run snapshot; a stable id cannot select new
  authority under an old task identity. The conversation serializer (including
  dynamic-message and structured-refusal serialization) and action parser are
  deterministic trusted modules whose executable digests cover their complete
  dependency closures; a host unable to load those exact executables under the
  bound grammar and tool-descriptor schema cannot admit or resume the task.
- **Effect family is not destination authority.** Every admitted tool operation
  has one exact `OutwardOperationBinding` when it can cause a non-provider
  outward effect. The owner-pinned `outward-operation-catalog-v1` closes the
  grantable operation descriptors and effect taxonomy; the separate
  `outward-destination-catalog-v1` closes every destination class and
  capability D8 may grant. The five forbidden destination classes are defined
  once by `protected-destination-class-v1` in the boundary amendment's Section
  3.2 and rendered verbatim in Section 11.2. They can never appear in the
  grantable destination catalog. Unknown families, classes, operations,
  descriptors, catalogs, resolvers, adapters, configurations, principals, or
  versions fail D1 admission. A generic operation whose possible destinations
  cross destination classes, include a protected class, or cannot be resolved
  totally is ungrantable; an owner approval cannot override this rule.
- **Every outward target is an admitted capability.** Each
  `OutwardOperationBinding` names the exact tool and version, operation
  descriptor, effect class/family and taxonomy digest, trusted resolver and
  destination schema, and a sorted unique set of allowed
  `OutwardDestinationCapabilityBinding` identities. Each capability binds one
  non-protected destination class, canonical owner-scoped destination identity,
  adapter and credential-free configuration digests, and authenticated
  execution principal. Raw endpoint, service, tenant, store, repository, or
  destination identifiers are not accepted from task payloads, model output,
  tool parameters, approval payloads, or caller-supplied adapter objects.
  Resource selectors within an admitted capability are typed data under the
  bound destination schema; they cannot select another destination capability.
- **Resolution is trusted and carried through the effect.** At reservation,
  D4 invokes only the exact admitted resolver over the canonical parameters
  and immutable admitted bindings. It must return exactly one
  `ResolvedOutwardDestinationV1` whose capability belongs to the operation's
  allowed set and whose class, identity, catalogs, adapter, configuration,
  principal, resolver, and schema match the admitted snapshot. D4 persists that
  value in the semantic reservation and includes it in the approval content.
  Permit claim and atomic consumption compare the same value and deliver only
  an opaque capability handle plus the canonical resource selector to the
  authenticated adapter. The adapter forbids endpoint override and follows no
  redirect, alias, DNS/service indirection, imported writer, or aggregate
  target unless every hop is resolved by the same trusted resolver to the same
  admitted capability identity. Before-dispatch mismatch rejects; a mismatch
  discovered after permit consumption is `ambiguous`. Receipt commitment
  requires the adapter's authenticated observation of the same resolved
  destination; repeating the declared family is not destination evidence.
- **Filesystem destination policy remains separate.** Every readable or
  writable filesystem grant binds whole owner-pinned
  `FilesystemCapabilityBinding` roots through `DestinationPolicy` or
  `ReadPolicy`; arbitrary host paths and subdirectory-only security boundaries
  are not grantable. The outward destination catalog does not replace or widen
  alias-isolated filesystem confinement.
- **Alias isolation is the filesystem security boundary.** An admitted
  `AliasIsolatedFilesystemProfile` must cause the trusted daemon to provision
  a fresh per-run filesystem or mount identity whose root is the capability
  root. No inode reachable inside that root may be reachable by any path,
  mount, or file handle outside it, and no outside inode may be introduced by
  hard link, bind mount, mount crossing, device node, or mutable shared-inode
  import. The profile denies mount creation and access to host namespaces and
  proves the property on every supported platform. A normal directory on a
  shared host filesystem, even if canonicalized and symlink-free, is not an
  admissible capability root.
- **Imports cross by value.** A trusted importer may populate a fresh
  capability only from a content-addressed immutable source or another
  alias-isolated read capability. It copies bytes,
  or uses a copy-on-write primitive whose adapter proves that writes cannot
  mutate the source inode; hard-link and bind-mount imports are forbidden.
  Protected classes and credential stores are ineligible import sources.
- **The artifact sink is measured authority, not a configuration adjective.**
  Before opening production admission, host custody derives one
  `ArtifactStoreBindingV1` per owner domain from the owner-pinned
  `artifact-store-isolation-profile-v1` and the measured store instance. The
  store occupies a dedicated local whole-filesystem or volume identity with an
  exclusive root held by the daemon. Network, FUSE, synchronized, replicated,
  shared-directory, bind-mounted, path-only, or caller-supplied backing is
  inadmissible. The binding pins the store and owner-domain identities, schema,
  executable adapter, writer and reader principals/protocol, physical backing
  and root identities, and isolation-profile version. The backing identity and
  inode graph must be disjoint from every protected or credential root,
  consumer-writer root, provisioned task capability, and other owner's artifact
  store. Host custody closes admission and artifact writes on profile, catalog,
  mount-topology, root-handle, adapter, executable, principal, or backing drift;
  there is no ordinary-directory fallback.
- **Admission proves the exact store for the exact run.** A task definition
  cannot contain a store id, root, adapter, or binding. Production admission
  obtains the active binding only from authenticated host custody, requires its
  owner domain to equal the run's transport-authenticated owner domain, compares
  its backing/root identities with all provisioned filesystem capabilities and
  the owner-pinned protected-root, credential-root, consumer-writer-root, and
  other-owner-store catalogs, and persists the complete binding, binding digest,
  and `ArtifactStoreIsolationEvidenceV1` in the admitted-run snapshot. Missing,
  stale, cross-owner, aliased, or incompletely proven bindings reject admission.
- **Loop content has a separate private store.** Before production admission,
  host custody derives one `LoopContentStoreBindingV1` for the run's owner
  domain from the owner-pinned loop-content isolation and retention profiles.
  The binding pins the exact store instance, schema, executable adapter, writer
  and reader principals, private local backing/root identities, isolation
  profile, and retention policy. It is daemon authority, never a task or model
  field. The backing is disjoint from task capabilities, protected and
  credential roots, artifact-store roots, consumer-writer roots, and every
  other owner's store; task principals, plugins, renderers, and consumer writers
  cannot open it. Missing proof, cross-owner access, mutable replacement,
  adapter drift, or identity drift closes admission and journal writes.
- **Loop bytes are immutable references, not evidence rows.** Only the bound
  writer principal inside settlement may `putByDigest` exact bounded model/tool
  observations, runtime feedback, or canonical proposed-action parameter bytes.
  It hashes before and after an atomic
  no-replace commit and returns `LoopContentReferenceV1`; identical replay
  returns the same reference after digest and length readback. Only the bound
  loop-runtime reader principal may retrieve bytes, by reference and matching
  owner domain. The evidence ledger and settlement rows contain only typed
  metadata, digests, and references, never raw prompts, action parameters, or
  provider payloads.
  Content referenced by a nonterminal or replay-retained run cannot be deleted;
  terminal collection follows only the snapshot-bound retention policy. An
  unreferenced pre-transaction put grants no authority and is safely collectible.
- **Artifact emission is one narrow put-by-digest operation.** Only the
  binding's authenticated writer principal, inside the one-writer settlement
  module, may copy bytes by value from an admitted capability through
  `putByDigest`. The request contains the artifact-store binding digest, source
  capability id, source capability-binding digest, provisioned source-instance
  id, relative path, expected content digest, byte length, emission kind, and
  the typed-patch schema digest when applicable; it contains no destination path,
  endpoint, mutable object name, destination class, or apply operation. The
  adapter rechecks its private root handle and physical identities, hashes the
  bytes before and after an atomic same-root no-replace commit, and either
  returns the same `ArtifactReferenceV1` for identical content or fails closed.
  Existing content under the digest is accepted only after byte length and
  digest readback match. No update, delete, rename-out, replication, or direct
  root-access surface exists in D8.
- **Consumers receive bytes, never store authority.** The separately versioned
  `pnh-artifact-read-v1` protocol accepts only an `ArtifactReferenceV1` under
  the transport-authenticated matching owner domain. The binding's dedicated
  reader principal verifies store binding, content digest, and byte length and
  returns bytes by value; it has no put authority and exposes no path, root
  handle, filesystem identity, or writer object. Task principals and consumer
  writers have no artifact-store backing access. No D8 task, tool, adapter,
  grant, approval, permit, receipt, or reference may apply, copy, rename, patch,
  or otherwise materialize an emitted artifact into an external destination.
  Any consumer-side application is a new effect under that consumer's
  separately ratified writer and is outside D8 authority.
- **Complete write footprint, not one declared target.** A reservation's
  declared target does not by itself bound what an operation writes, so the
  policy binds the operation's entire write footprint, defined as **every
  filesystem mutation the operation performs**: final writes, temporary
  files, parent-directory creation, renames, deletes, metadata and
  permission changes, and hard or symbolic link creation. Every mutation
  path must be relative to, and resolved inside, an admitted alias-isolated
  filesystem capability. An operation whose complete mutation
  set cannot be enumerated before execution — archive extraction, shell
  execution, recursive copy, rename into an unchecked path — is
  admissible only when every mutation is intercepted inside that capability,
  so that no produced path (including a hostile
  `../`-bearing archive entry) and no intermediate mutation can land
  outside the root. Write executors must use containment-preserving,
  directory-handle-relative resolution with no symlink following
  (`openat`-style, no-follow), reject mount crossings and special files, and
  keep the capability root handle private. An undeclared mutation or an
  attempted escape fails the effect even when the declared final output is
  inside policy.
- **Check bound to the write, not merely before it.** The resolved canonical
  target is bound atomically to the write itself — a captured directory
  handle, or a no-follow open with post-open identity verification — leaving
  no scheduling gap between D4's check and the write syscall. D4 checks the
  reservation's capability id, full binding digest, provisioned instance,
  relative path, and complete footprint; the executor-side capability enforces
  the same tuple at the write. Symlink swaps, hard-link
  aliases, mount crossings, and pre-existing outside-root inode aliases cannot
  redirect or share the mutation.
- **Reads are confined like writes.** Every readable effect family granted to
  the task must carry a `ReadPolicy`; admission rejects a read-capable grant
  with no alias-isolated read capability. D4 checks each reservation's actual
  capability id, full binding digest, provisioned instance, and relative source
  path, and the executor resolves it
  from the private root handle with the same no-follow and no-crossing
  primitives. A pre-existing hard link cannot expose an outside inode because
  the capability's mount identity is the admitted boundary. Untrusted model
  output can point a granted read tool only inside provisioned capability
  roots; protected stores and credentials cannot be imported and never enter
  evidence.
- A task definition granting any outward effect class must name a
  `verification` binding. Verification-free outward work is inadmissible.
- `verification: null` is admissible only for artifact-only task definitions
  (no outward effect classes). Its terminal semantics are defined in
  Section 10.4 — the run settles through the execution class's applicable
  positive-evidence rows, never through an invented receipt.
- The verification binding names an admitted verifier plugin whose identity
  differs from every tool plugin granted to perform outward effects in the
  same task definition. A tool cannot attest its own outward effect.
- **Encapsulated restriction (fail closed).** `runShape: "encapsulated"`
  requires `executionProfile` naming an owner-pinned `artifact-only` profile
  id and exact version digest, and admission rejects any encapsulated task definition
  that grants an outward effect class, lists an approval gate, or is
  referenced as an apply task. An artifact-only profile is admissible only
  with recorded production proof that the external runtime under that
  profile's launch configuration cannot perform privileged or outward
  effects. The parent's Section 16.3 grants only an isolated temporary
  working directory and the narrowest supported Codex sandbox; it does not
  itself establish read-only or network-restricted behavior. The profile
  proof must therefore independently build and adversarially verify the
  sandbox-level restrictions — a test that attempts and fails a network
  egress connection from inside the profiled runtime, and a test that
  attempts and fails a filesystem write outside the isolated working
  directory — rather than citing parent text. No profile is admitted by
  default; until one is proven, all outward-capable work uses the
  declarative path.
- The admitted task digest (`taskDigest`) covers the task definition,
  including `compositionAlgorithmVersion`, the complete `loopReplay` and
  `promptSet` bindings, the three registry/taxonomy schema digests, every
  complete `GrantedToolBindingV1`,
  every filesystem capability, every outward destination capability and
  outward operation binding, every operation/taxonomy/catalog/resolver/adapter
  version, import-policy version, and read/destination policy, and, when
  present, the exact execution-profile and verification binding digests — exactly
  as the parent Section 12 specifies for canonical admitted tasks. The digest
  preimage is `TaskDefinitionDigestV1` under Section 8.2.2.
- One task definition, one prompt plugin. Multi-agent shapes are work
  programs in the split-out area (Section 11), not fatter D8 task definitions.

### 9.2 Goal contract mapping

The owner-side goal pipeline produces goal contracts with a scope, constraints,
a definition of done, and budgets. The derivation into a task definition is a
control-plane concern, but the boundary contract is fixed here:

| Goal contract field | Task definition field |
|---|---|
| Outcome statement | `goalStatement` |
| Assigned role / worker | `promptPluginId` |
| Allowed surfaces / tools | exact `grantedBindings.tools` capability records, `filesystemCapabilities`, `outwardDestinationCapabilities`, `outwardOperations`, `destinationPolicies`, `readablePolicies` |
| Model / provider intent | `grantedBindings.routeClass` |
| Budget caps | `grantedBindings.budgets` |
| Definition of done | `verification` |
| Human-approval checkpoints | `approvalGates` |

Prose that does not survive this mapping (background, rationale) rides in the
task payload as data. Nothing in the goal contract can widen a grant beyond
what the prompt plugin requested.

---

## 10. D8.3 design: the declarative agent loop

### 10.1 Who runs the loop

The loop driver is trusted runtime code inside the harness instance — part of
the same trust zone as the D1 runtime, never plugin code. Prompt plugins
contribute content; tool plugins execute operations in their execution class;
provider brokers carry model dispatches. The loop itself is not extensible by
plugins. Its conversation serializer, proposed-action grammar/parser executable,
tool-descriptor schema, and operation-id derivation are the exact admitted
`LoopReplayBindingV1`, not whichever runtime versions are installed at resume.

### 10.2 Turn protocol

Every turn is one governed effect using the D4 permit protocol semantics on
the versioned D8 settlement extension (Section 13.1):

1. The runtime reconstructs the exact dynamic conversation from the immutable
   content references and digest chain in `ConversationStateV1`, using only the
   snapshot-bound conversation serializer. It composes the turn request from
   the composed prompt, task payload, reconstructed conversation, and exact
   admitted tool descriptors.
2. It derives the model-turn `OperationId` from `pnh-operation-id-v1` and the
   admitted run/task plus turn ordinal, then reserves the dispatch effect. A
   retry re-derives the same id; process-local or caller-supplied ids are
   forbidden. The reservation carries the turn discriminator and pre-turn
   conversation-state digest so D4 can distinguish and compare model turns.
3. **Atomic budget charging.** The transaction that commits the first
   semantic reservation (`committed` outcome) also claims one budget slot:
   a turn slot for model dispatches, an effect slot for tool and outward
   operations. Reserved, permit-issued, dispatching, and receipted operations
   all count as consumed slots. An identical semantic replay (`replayed`)
   charges no new slot; a `conflict` charges nothing and dispatches nothing.
   Slots are monotonic — a slot claimed by an effect that later settles
   `rejected` (including approval denial) or `ambiguous` stays consumed.
   Verification operations charge effect slots like any other effect. D4
   refuses the reservation, in that same transaction, when no slot remains —
   two concurrent reservations can never both pass on one remaining slot.
4. The broker consumes the permit (durable, one-use, per the parent hardening
   Critical 3 correction) and dispatches. Before D4 may commit the broker
   receipt, settlement writes the exact bounded observation bytes through the
   snapshot-bound `LoopContentStoreBindingV1`, verifies digest/length readback,
   and includes the resulting `LoopContentReferenceV1` in the receipt. A
   receipt without that readable matching reference cannot become `receipted`.
   Failure after permit consumption never authorizes redispatch: the broker may
   rehydrate the reservation-bound response so the same put/receipt can retry;
   otherwise the turn follows the parent's `ambiguous` settlement edge.
5. The runtime reads only those referenced bytes through the bound reader and
   runs only the snapshot-bound parser executable under the bound action grammar
   and tool-descriptor schema. It derives every proposed-action digest and
   `OperationId` after storing each canonical parameter value under content kind
   `proposed-action-parameters`, builds the post-turn `ConversationStateV1`,
   and commits one immutable `TurnJournalEntryV1` under the receipt-to-journal
   CAS below.
6. Only after that checkpoint commits does the runtime validate and reserve
   each journaled tool call against `grantedBindings.tools` and its exact
   admitted operation descriptor. Each reservation binds the turn-journal-entry
   digest, action ordinal, proposed-action digest, derived operation id, and
   validated parameter reference/digest; the executor receives bytes only
   through the bound reader.
   Local granted operations run in the tool plugin's execution class. Every
   non-provider outward operation key `(toolPluginId, operationName)` must
   resolve to exactly
   one entry in the validated `outwardOperations` keyed list and then through
   that exact `OutwardOperationBinding`
   to one admitted `ResolvedOutwardDestinationV1` before reservation commits;
   that value then remains bound through approval, permit consumption, adapter
   execution, and receipt. Failure to resolve exactly one matching destination
   appends refusal evidence and dispatches nothing.
7. A malformed parse journals `refused-malformed` with exact structured
   feedback bytes stored before the turn-journal CAS. Grant, policy, resolution,
   or budget refusal discovered after journaling uses the action-outcome CAS
   below. No process-local refusal text may be regenerated on replay.

**Durable receipt-to-journal rule.** The content store is outside the evidence
ledger, but the authority transition is one settlement transaction. A
`CommitTurnJournalV1` command serializes on the run row and atomically compares
the admitted task and `LoopReplayBindingDigestV1`, current loop-state version,
turn ordinal and derived turn operation id, broker receipt digest, exact
observation reference, and pre-turn conversation-state digest. The winning CAS:

1. inserts one immutable journal entry under unique `(runId, turnOrdinal)` and
   `turnOperationId` keys;
2. stores the exact parse disposition, ordered action values and stable ids,
   post-turn conversation record/digest, and next loop state;
3. advances the loop-state version once and appends only the journal/content
   digests and allowed references to evidence; and
4. makes the journal-entry digest a mandatory D4 precondition for every derived
   action reservation.

An identical command returns the existing checkpoint without mutation. A
different receipt, reference, parser binding, parse result, action identity,
conversation state, next state, or version under either unique key is a
conflict and grants nothing. Content-store puts that lose the later CAS are
unreferenced immutable objects and never authority.

Each journaled action then has one `ActionOutcomeCheckpointV1`, unique by
`(turnJournalEntryDigest, actionOrdinal)`. The settlement transaction compares
the exact journaled operation id and proposed-action digest plus the current
conversation and loop-state versions. It atomically binds either the canonical
reservation refusal and stored feedback, the settled effect record and stored
observation/feedback, or the ambiguous effect record; appends the exact new
conversation state; and advances both versions once. An identical retry returns
the checkpoint, while any conflict writes nothing. The next model-turn
reservation is forbidden until every action in the journal has exactly one
valid outcome checkpoint and the resulting conversation digest is current.
Effects may settle out of order, but checkpoints advance conversation state in
strict action-ordinal order; a later result waits without state authority until
every earlier ordinal is checkpointed.

On restart, a `receipted` turn without a journal entry reloads the exact
referenced bytes and runs the exact admitted parser executable. If that binary,
grammar, descriptor schema, store binding, bytes, or pre-state cannot be
reproduced, D4 settles `failed (replay-binding-unavailable)` before any new
reservation. A committed journal entry is never reparsed: the runtime verifies
its digest chain and resumes its recorded actions and next state. Existing
action reservations are replayed only under their recorded operation ids and
digests, and completed action checkpoints are never regenerated; a crash before
or after any reservation or checkpoint cannot mint another action, conversation
append, or budget charge. A pre-journal run admitted without these bindings has
no migration fallback and also fails closed before reservation.

**Tool effects share one explicit permit architecture.** The parent's
`claimDispatch` and `DispatchPermit` remain provider-broker-only: only the
admitted `brokerPrincipalId` may claim them. Every non-provider tool operation
instead uses `ToolEffectPermitV1`, with a closed `local-filesystem` or
`outward-adapter` scope. The local scope admits only the task snapshot's
restricted tool execution principal and binds its exact mutation scope. The
outward scope admits only the principal in the already resolved outward
destination and binds that complete destination, adapter, resource selector,
and expected receipt shape. Neither scope accepts a caller-selected endpoint,
principal, destination, capability, or tool version.

The authenticated executor submits one canonical `ToolEffectClaimV1`. Its
`ToolEffectClaimRequestDigestV1` is stable across response loss and restart.
Settlement permits exactly one permit identity per reservation. An identical
claim replay returns the same immutable `ToolEffectPermitV1` only to the same
authenticated execution principal; a changed digest, principal, scope, epoch,
lease, generation, tool binding, operation, or destination is a conflict. The
consume CAS serializes on both permit and reservation and compares the complete
permit, reservation state, principal, claim digest, expiry, daemon epoch,
ownership lease and generation, current effect state, and approval precondition
when gated. The immutable permit bytes never change; the CAS changes the
separate `ToolEffectPermitStateV1` from `issued-unconsumed` to `consumed`
exactly once before the executor can act and writes
`ToolEffectConsumptionV1` plus its digest in the same transaction. A replay
returns those existing records; a second executor cannot consume.

The permit carries an epoch-local deadline no later than both its own expiry
and the remaining active-time budget. The executor must return the exact bound
receipt shape. A process death before consumption is proven non-dispatch and
recoverable as `rejected`; death after consumption without a trustworthy
receipt is `ambiguous` and never authorizes redispatch. These rules apply
identically to the retired `LocalEffectPermit` use case and to outward adapter
calls. A broker principal cannot claim a tool permit, a tool principal cannot
claim a provider dispatch permit, and local/outward cross-use fails with
operator-visible evidence.

### 10.3 Loop termination

```text
looping
  |-- model signals completion and verification binding exists -> verifying
  |-- model signals completion and verification is null -> settling-artifact-only
  |-- budget exhausted (turns, effects, active time) -> failed (budget), evidence appended
  |-- bound loop bytes/parser/journal state unavailable or inconsistent -> failed (replay-binding-unavailable), before reservation
  |-- policy halt or operator halt -> rejected
  |-- unrecoverable dispatch ambiguity -> ambiguous (inherited from D4)

verifying
  |-- bound verification evidence valid and positive -> completed
  |-- verification negative and budget remains -> looping (bounded re-entries)
  |-- verification negative and budget exhausted -> failed

settling-artifact-only
  |-- all applicable positive-evidence rows for the execution class valid -> completed
  |-- any applicable row missing or invalid -> failed
```

`looping`, `verifying`, and `settling-artifact-only` are loop substates that
produce terminal candidates; parent D4 remains authoritative for terminal
commitment, and the run inherits `ambiguous` semantics unchanged.

**Bound verification evidence, not a bare receipt.** `completed` for a
declarative run with outward grants requires D4 to validate, against the
admitted verification binding: the verifier plugin identity and exact version
digest; the subject binding (the settled primary artifact digest, or the
admitted probe specification for external state); the predicate specification
digest with an observed `pass`; and the trusted observation shape. A
well-typed positive response from the wrong verifier, the wrong version, an
unbound subject, or a self-attesting tool does not satisfy the row. Receipt
authenticity proves the operation ran; only binding validation makes it
evidence that the admitted predicate held for the admitted subject.

### 10.4 Verification-free artifact-only settlement

A run admitted with `verification: null` (necessarily artifact-only) has an
explicit successful terminal edge: `settling-artifact-only` evaluates every
positive-evidence row applicable to its execution class from the parent
Section 15.6 matrix — typed response, plugin and version match, execution
binding, owner domain and epoch, lifecycle receipt, cleanup scope, durable
checkpoint — with no verification row applicable and none invented.
Artifact-only runs — including the split-out area's competitor and judge
shapes — settle through this edge.

### 10.5 Active-time budgets across daemon epochs

`maxActiveSeconds` bounds a persisted elapsed-active accumulator, not a
wall-clock deadline:

- Within one daemon epoch, active time accrues from the epoch's monotonic
  clock while the run holds a live ownership lease and is not suspended
  awaiting an approval decision. Approval-wait suspension does not consume
  active time; the suspension interval is recorded as evidence.
- **Approval-wait suspension is a durable substate, not an inference.**
  Entering suspension is a transactional settlement write bound to the
  gated reservation's identity and current daemon epoch: it checkpoints the
  accumulator, records the suspension start, and creates one
  `ApprovalGateStateV1` with status `pending`, a new
  `reservationStateVersion`, and the authoritative
  `approvalGateDeadline: EpochMonotonicDeadlineV1` under the registry bound.
  Deadline construction uses checked unsigned addition; overflow rejects the
  gated reservation rather than wrapping or clamping.
  No challenge, renderer, request, worker, or wall clock can supply or extend
  that deadline. The same transaction sets the closed accounting state
  `approval-suspended`; no state is inferred from timestamps.

  The settlement writer serializes every approval decision, expiry-worker
  command, canonical-content fetch, and permit-issuance attempt against that
  same reservation row and version. While holding the one-writer transaction,
  it takes one trusted epoch-local monotonic sample immediately before the
  conditional update; that `EpochMonotonicDeadlineV1` value is persisted as
  `decisionLinearizationTime` and is the normative transition time. A first
  operator decision may commit only when the gate is
  still `pending`, the versions match, and
  `decisionLinearizationTime < approvalGateDeadline`. Equality is expired.
  A pre-deadline approval moves the row to `approved-awaiting-permit`; a
  pre-deadline denial moves it to `rejected-denied`. Any command observing a
  still-pending gate at or after the deadline runs the same idempotent expiry
  transition to `rejected-expired`, exits suspension, appends expiry evidence,
  and increments the state version in one CAS. A delayed expiry worker cannot
  leave a post-deadline approval path open, and approval, denial, and expiry
  cannot each win.

  Gate-state validity is closed: `pending` and `rejected-expired` require a
  null `committedDecisionRecordDigest`; `approved-awaiting-permit` and
  `rejected-denied` require the digest of the decision committed in the same
  CAS. Missing or inconsistent status/digest/version combinations reject
  rehydration and permit issuance rather than being repaired.

  Approval and permit authority is epoch-scoped: no prior-epoch deadline,
  challenge, approval state, `DispatchPermit`, or `ToolEffectPermitV1` can
  authorize current-epoch execution. The following epoch-loss matrix is
  normative for both provider and tool reservations:

  | Durable phase in the lost epoch | One replacement-epoch transition |
  |---|---|
  | Approval pending | Prove no permit existed; change the gate and effect to `rejected`, preserve the already claimed budget slot, close accounting to `non-accruing`, append epoch-loss evidence. |
  | Approved, no permit issued | Prove absence under the reservation's permit unique key; change the effect to `rejected` with the same slot and accounting treatment. The prior approval remains immutable evidence but is not reusable. |
  | Provider or tool permit issued, durably unconsumed | Compare the durable consumption index and prove non-dispatch; expire the permit and settle `rejected` with the same slot and accounting treatment. |
  | Permit consumed, no trustworthy receipt committed | Settle `ambiguous`; never redispatch, reapprove, or issue a replacement permit. |
  | Trustworthy receipt committed before epoch loss, settlement incomplete | Validate the exact receipt and complete settlement once under its existing operation and receipt digests; never execute again. |
  | Effect or run already terminal | Return the existing terminal record without mutation. |

  Each row is one idempotent CAS keyed by `(reservationId, lostDaemonEpoch,
  recoveryPhase)`. It compares reservation, gate, permit, consumption, receipt,
  accounting, and settlement versions; commits the accumulator checkpoint and
  recovery evidence in the same transaction; and returns the existing result
  on replay. A crash before commit changes nothing. A crash after commit cannot
  charge, settle, or append evidence again. Reapproval after epoch loss, if an
  owner ever permits it, requires a new explicitly versioned policy and a new
  decision protocol; V1 always rejects the pre-consumption phases above.
  Wall-clock rollback cannot extend a window, and approval wait is never
  charged in any epoch. A read-only cross-epoch decision-result query may
  retrieve committed acknowledgement evidence but cannot change this matrix.
- The accumulator is persisted transactionally at every effect transition and
  at a registry-bounded maximum update interval. The registry constrains that
  interval to be no larger than the minimum admissible `maxActiveSeconds`, so
  no admitted budget can be smaller than one accounting blind spot.
- **Accounting transitions are closed and lease-bound.** Each run has one
  `AccountingRecordV1` containing the accumulator, closed accounting state,
  state epoch, nullable lease id and generation, epoch-local checkpoint, one
  nullable uniquely identified open interval, last closed interval id, and
  settlement state version. Every change writes one
  `AccountingTransitionRecordV1` under a unique transition id. These are the
  only legal transitions:

  | Event | Required pre-state | Atomic result |
  |---|---|---|
  | Lease acquisition or reassignment | `non-accruing`, no open interval | Open a fresh interval bound to the current epoch, lease id and generation; enter `active-accruing`. |
  | Periodic or effect checkpoint | `active-accruing`, matching live lease and open interval | Debit only elapsed epoch-local monotonic time since `lastCheckpointAt`; advance that checkpoint in the same interval. |
  | Enter approval wait | `active-accruing`, matching live lease and interval | Debit through the transition sample, close the interval, clear lease fields, enter `approval-suspended`. |
  | Approval exit, lease expiry/release, suspension, or terminal settlement | matching current state/version | Close any open interval through the last trustworthy sample, clear lease fields, enter `non-accruing`; terminal records can never open another interval. |
  | Epoch recovery of a lost open interval | prior-epoch `active-accruing` | Apply at most one conservative debit bounded by the maximum update interval, keyed uniquely by the lost `intervalId`; close it and enter current-epoch `non-accruing` before any new lease may open. Prior-epoch suspended or non-accruing state receives zero debit. |

  A transition retry returns its existing record. A crash before its commit
  leaves the old state; a crash after commit but before a new lease leaves the
  run non-accruing. Unique `(runId, closedIntervalId, transitionKind)` and state-
  version constraints prevent duplicate recovery debits. Lease-free downtime,
  approval wait, and terminal time accrue zero; active time cannot disappear
  across lease expiry, reassignment, monotonic-origin reset, or wall-clock
  rollback. A missing interval, lease mismatch, unknown state, or inconsistent
  checkpoint refuses reactivation instead of guessing.
- **In-flight enforcement, not just bookkeeping.** Every broker
  `DispatchPermit` and every `ToolEffectPermitV1` carries an epoch-local
  monotonic deadline no later than the run's remaining
  active-time budget at issuance (and never later than the permit's own
  expiry). Every effect executor must enforce that deadline: the broker
  cancels or times out the provider call, and each local or outward tool
  execution class cancels its operation and refuses further reads, writes,
  or outward calls once the deadline passes.
  An execution class that cannot enforce cancellation and post-deadline
  write refusal is inadmissible for active-time-bounded effects. A deadline
  cancellation with proven non-dispatch (or a local operation stopped before
  any write) settles the effect `rejected` and the run takes the budget edge
  (`failed (budget)`); a deadline reached after permit consumption without a
  trustworthy receipt settles `ambiguous`, exactly as the parent
  post-consumption uncertainty rule requires; a late result arriving after
  its deadline cannot satisfy any positive evidence row. A reservation whose remaining active budget is already zero
  or negative is refused outright.
- **Late observations use a separate post-terminal journal.** A receipt that
  loses the race with terminal commitment never mutates or replaces the
  terminal record, its frozen evidence checkpoint, accounting, budget,
  reservation, effect outcome, or any positive-evidence row. The one-writer
  `SupplementalObservationJournalV1` appends a canonical
  `SupplementalObservationEntryV1` keyed by reservation and the frozen
  terminal checkpoint. It has its own contiguous sequence, previous-entry
  digest chain, and unique `(reservationId, receiptDigest)` index. An identical
  append returns the existing entry; a conflicting receipt shape or checkpoint
  rejects. A receipt committed before terminal may be included in the terminal
  transaction as a late non-positive observation. A receipt committed after
  terminal can appear only in this supplemental journal. Neither path can turn
  a deadline cancellation or ambiguous outcome into completion.
- When the accumulator reaches `maxActiveSeconds`, the run takes the budget
  edge in Section 10.3.

Plan J must include restart and clock-rollback fault tests for this
accounting.

### 10.6 Encapsulated runs

An encapsulated run is the degenerate loop: one turn, whose single effect is
the brokered dispatch to an external agentic runtime (Codex today). Everything
in D3 applies. The task definition's `runShape` field selects the shape at
admission; the model cannot.

The interior tool calls of an encapsulated runtime are invisible to
settlement. That opacity is admissible only because the admission rules in
Section 9.1 confine encapsulated runs to artifact-only execution profiles: a
runtime that cannot perform privileged or outward effects has nothing D4
would need to individually reserve, approve, permit, or receipt. Admission of
an encapsulated task definition with outward grants, approval gates, apply
authority, or no proven profile fails closed. Selection guidance
(informative): declarative for roles whose value is per-step governance
(reviewers, implementers, verifier nodes); encapsulated for vendor harnesses
whose value is the vendor's own loop over artifact production.

---

## 11. Split-out subsystem and the D9 adaptation boundary

### 11.1 Work programs: split out by owner decision

The work-program, judge, and selection subsystem — control-plane composition
under a `programId`, competitive fan-out, judge recommendations, selection
rounds and records, and apply tasks — was removed from D8 by owner decision
on 2026-08-27 and re-homed as its own deferred decision area:
`2026-08-27-prism-harness-work-program-selection-design-spec.md`. That area
carries its own provisional invariants (WP-INV-01 through WP-INV-03,
superseding D8's retired alias D8-INV-06) and the deferred Plan K, requires
its own hardening cycle and owner ratification, and
builds entirely on the D8 core defined here (operator channel,
canonical-content confirmation, typed digest schemas, alias-isolated
filesystem capabilities, resolved outward destination capabilities,
the artifact-store binding and by-value reference protocol, destination and
read policies, budgets, verification bindings). D8
ratification covers Plans I and J only and grants
that area nothing.

### 11.2 D9 adaptation boundary

D8 may emit terminal evidence and content-addressed candidate artifacts for a
consumer-side D9 pipeline. Those artifacts are **generic**: settlement
evidence and content-addressed bytes with digests, not destination-formatted
packages. Consumer-side D9 tooling performs its own packaging, quarantine,
and promotion through the existing owner pipelines; D8 ships no destination
writer and no destination-specific format. Emitted artifacts remain
untrusted and quarantined. D8 cannot write or authorize writes to any of these
protected destination classes:

- `consumer-durable-state`: consumer durable memory or user-profile stores;
- `instruction-store`: prompt, instruction, procedural-guidance, skill,
  task-template, or workflow stores;
- `admission-registry`: admitted task, tool, plugin, grant, route, budget, or
  evaluator registries;
- `constitutional-release-state`: constitutional law, proof status, release,
  or publication state; or
- `executable-extension-path`: executable plugin, script, hook, or extension
  paths.

This ordered ID-and-description set is the normative
`protected-destination-class-v1` source. The Section 9.1 controls generate the
grantable `outward-destination-catalog-v1` as a disjoint closed set, bind every
non-provider outward operation to exact destination capabilities, and require
D4's trusted resolver to carry the actual destination through reservation,
permit consumption, and authenticated receipt. A declared effect family is
never destination evidence. Filesystem effects remain confined to
alias-isolated capabilities; protected and credential imports remain forbidden;
artifact emission remains destination-free (D8-INV-10/11). D8 has no external
destination writer. The daemon-derived artifact-store binding and
run-specific isolation evidence additionally prove that the destination-free
store itself is not backed by any protected, credential, task-capability,
consumer-writer, synchronized, or other-owner root (D8-INV-12). No approval or
split-out-area selection record overrides these checks.

No D8 record is a D9 promotion approval. This extends to the split-out
work-program area: even an operator-ratified selection there authorizes only
its admitted apply effect, never a promotion. D9 requires its own
exact-digest evaluation bundle, owner approval, pure promotion-resolver
decision, and destination receipt.

No candidate can affect the active run that produced it, or any other active
run. A promoted D9 version is eligible only for a future consumer submission
and must still pass every applicable D1 admission and D6/D7 proof or release
gate.

---

## 12. D8.5 design: operator review

### 12.1 Approval-gated effects

A task definition lists effect classes in `approvalGates`. The owner-pinned
`approval-subject-registry-v1` maps every gateable effect class to exactly one
closed `ApprovalSubjectV1` arm. Admission rejects an approval-gated class that
has no mapping, maps to more than one arm, or cannot populate every field from
the immutable reservation. Model dispatches, local or outward tool operations,
and verification operations therefore all have a complete approval subject;
there is no generic map or partial compatibility form. For a reservation
in a gated class, D4 creates the reservation-owned `ApprovalGateStateV1` and
refuses permit issuance until the state is `approved-awaiting-permit` with the
matching durable approval record. That record binds: reservation identity,
owner domain, the approving operator principal and role, the exact
authorization-policy version, daemon epoch, canonical
decision-request digest, gate deadline, decision linearization time, pre/post
reservation state versions, and a decision (`approve` | `deny`). D4 rejects a
prior-epoch record. Denial settles the effect
`rejected` (its budget slot stays consumed, per Section 10.2). Approval
records are evidence; they are written through the authenticated operator
channel, never by the harness instance, a plugin, or a broker.

For an outward reservation, the approval record also binds the complete
`ResolvedOutwardDestinationV1`. Approval confirms that exact already-admitted
destination; it cannot supply, replace, reclassify, or widen a destination
capability. D4 still rejects a protected, unknown, unresolved, drifted, or
mismatched destination before permit issuance regardless of the decision.

An approval record is evidence of the winning transition, not a freestanding
permit precondition. D4 may issue a permit only from the reservation's current
`approved-awaiting-permit` gate state when its state version and committed
decision-record digest match the approval record. A delayed expiry worker,
stale pending row, orphan approval row, or row inserted outside the gate-state
CAS cannot authorize dispatch.

This reuses the exact fail-closed posture of permit issuance — the gate is a
missing-precondition refusal inside D4, not a new privileged actor. The
daemon validates the approval mechanically; the decision itself is always a
human operator action (Section 7.5).

### 12.2 The decision queue

The decision queue is a `renderer` plugin surface over settlement state: it
lists pending approval-gated reservations and terminal runs awaiting review,
each with its evidence chain. Renderers are read-only over an
operator-scoped query interface; the decision write path is the operator
channel below, so a compromised renderer can misdescribe a decision but
cannot make one. (The split-out work-program area extends this queue with
open selection rounds under the same read-only rule.)

D9 promotion decisions are not D8 decision records and do not share this write
path. A consumer renderer may link from terminal evidence to the separate D9
owner-promotion channel, but the D8 queue cannot create, approve, or execute a
promotion.

### 12.3 Canonical-content confirmation

Because a compromised renderer can misdescribe what is being decided, the
operator channel never trusts renderer-supplied content for any decision:

```ts
interface EpochMonotonicDeadlineV1 {
  daemonEpoch: DaemonEpochV1;
  monotonicNanoseconds: MonotonicNanosecondsV1;
}

interface ApprovalGateStateV1 {
  reservationId: ReservationId;
  reservationStateVersion: ReservationStateVersionV1;
  status: ApprovalGateStatusV1;
  approvalGateDeadline: EpochMonotonicDeadlineV1;
  committedDecisionRecordDigest: Digest | null;
}

interface DecisionChallengeRecordV1 {
  challengeId: OpaqueChallengeId;
  reservationId: ReservationId;
  decisionId: OpaqueDecisionId; // daemon-issued and immutable
  reservationStateVersion: ReservationStateVersionV1;
  canonicalContentDigest: Digest;
  operatorPrincipalId: OperatorPrincipalId;
  operatorRoleId: OperatorRoleId;
  ownerDomainId: OwnerDomainId;
  authorizationPolicyVersionDigest: Digest;
  daemonEpoch: DaemonEpochV1;
  approvalGateDeadline: EpochMonotonicDeadlineV1;
  challengeDeadline: EpochMonotonicDeadlineV1;
  consumedRequestDigest: Digest | null;
}

interface MutationFootprintEntryV1 {
  capabilityId: FilesystemCapabilityId;
  relativePath: CanonicalRelativePath;
  mutationKind: MutationKind;
}

interface ReadSetEntryV1 {
  capabilityId: FilesystemCapabilityId;
  relativePath: CanonicalRelativePath;
}

// Normative generated schema constructor. Wire encoding remains an ordinary
// list; only the Section 8.2.2 validator can construct the opaque brand.
declare const canonicalSortedUniqueSetV1Brand: unique symbol;
type CanonicalSortedUniqueSetV1<T> = ReadonlyArray<T> & {
  readonly [canonicalSortedUniqueSetV1Brand]: true;
};

interface ProvisionedCapabilityApprovalBindingV1 {
  capabilityId: FilesystemCapabilityId;
  capabilityBindingDigest: Digest;
  provisionedInstanceId: ProvisionedFilesystemCapabilityId;
}

interface EnumeratedMutationScopeV1 {
  filesystemCapabilityIds:
    CanonicalSortedUniqueSetV1<FilesystemCapabilityId>;
  writeFootprint: CanonicalSortedUniqueSetV1<MutationFootprintEntryV1>;
  readSet: CanonicalSortedUniqueSetV1<ReadSetEntryV1>;
}

interface CapabilityMutationEnvelopeV1 {
  filesystemCapabilityIds:
    CanonicalSortedUniqueSetV1<FilesystemCapabilityId>;
  provisionedCapabilityBindings: ProvisionedCapabilityApprovalBindingV1[];
  allowedMutationKinds: CanonicalSortedUniqueSetV1<MutationKind>;
  confinementProfileDigest: Digest;
  readSet: CanonicalSortedUniqueSetV1<ReadSetEntryV1>;
}

type MutationScopeV1 =
  | { kind: "enumerated-footprint"; value: EnumeratedMutationScopeV1 }
  | { kind: "capability-envelope"; value: CapabilityMutationEnvelopeV1 };

interface ModelDispatchApprovalSubjectV1 {
  turnOperationId: OperationId;
  routeClass: RouteClassId;
  providerBrokerBindingDigest: Digest;
  providerMessageTranslationVersionDigest: Digest;
  requestDigest: Digest;
}

interface ToolOperationApprovalSubjectV1 {
  grantedToolBindingDigest: Digest;
  operationName: OperationName;
  operationDescriptorDigest: Digest;
  canonicalParameterReference: LoopContentReferenceV1;
  canonicalParameterDigest: Digest;
  mutationScope: MutationScopeV1;
  resolvedOutwardDestination: ResolvedOutwardDestinationV1 | null;
}

interface VerificationOperationApprovalSubjectV1 {
  verificationBindingDigest: Digest;
  verificationOperationId: OperationId;
  subject: VerificationSubjectV1;
  predicate: VerificationPredicateV1;
  observationShape: TrustedObservationShapeId;
}

type ApprovalSubjectV1 =
  | { kind: "model-dispatch"; value: ModelDispatchApprovalSubjectV1 }
  | { kind: "tool-operation"; value: ToolOperationApprovalSubjectV1 }
  | { kind: "verification-operation"; value: VerificationOperationApprovalSubjectV1 };

interface ApprovalCanonicalContentV1 {
  schemaVersion: 1;
  decisionKind: "d8-effect-approval";
  reservationId: ReservationId;
  reservationStateVersion: ReservationStateVersionV1;
  approvalGateDeadline: EpochMonotonicDeadlineV1;
  runId: RunId;
  ownerDomainId: OwnerDomainId;
  taskDigest: Digest;
  operationId: OperationId;
  effectClass: EffectClassId;
  effectFamily: EffectFamilyId;
  subject: ApprovalSubjectV1;
}
```

This is the complete approval authority, not a renderer view. Settlement
constructs it only from the immutable admitted task and committed reservation.
`ApprovalCanonicalContentV1` uses the field order shown above. Collection
fields inside a tool subject's selected `MutationScopeV1` arm are the exact
schema-declared keyed lists or sorted-unique sets from Section 8.2.2. Each
sorted-unique set is ordered only by the complete canonical bytes of its
element and rejects duplicate elements.
There is no secondary capability-id, raw-relative-path, mutation-name, or
insertion-order rule. Empty sets are encoded as empty lists, never omitted.
Only the generated validator constructs their opaque runtime brand; raw arrays
do not satisfy the authority schema. Malformed restored bytes fail closed and
`FetchCanonical` returns no challenge. Its digest is
SHA-256 over
`pnh-approval-content-v1\0` plus the `pnh-canonical-value-v1` encoding. The
channel displays a trusted decoding of these exact bytes; summaries may be
shown in addition but never replace or alter the bound content.

The `enumerated-footprint` mutation arm is required when the complete mutation
set is knowable before execution. A confined operation whose exact paths are
not knowable beforehand, such as archive extraction or an admitted restricted
shell, must use the `capability-envelope` arm. That arm binds every provisioned
capability id, full binding digest and instance, the exact confinement-profile
digest, the closed allowed mutation-kind set, and the complete read set. It
does not contain a wildcard path and cannot name an unprovisioned capability.
The executor must intercept every mutation under that exact envelope as
Section 9.1 requires. Empty enumerated footprints and capability envelopes are
distinct canonical values; neither can be substituted for the other.

1. The operator refers to a pending decision by opaque identity only
   (for a D8 approval, the reservation identity).
2. The channel independently retrieves the canonical content from settlement
   state — for an approval, the exact reservation content, state version, and
   authoritative gate deadline. In the same serialized command it samples the
   trusted epoch-local monotonic clock. A gate at or past its deadline takes the
   idempotent `rejected-expired` transition and returns no challenge.
3. For a still-pending pre-deadline gate, the channel displays that canonical
   content itself and persists one `DecisionChallengeRecordV1`. The daemon
   creates and binds the only decision id accepted for this challenge. The
   challenge binds the reservation state version, authenticated operator
   principal, role, owner domain, authorization-policy version, and gate
   deadline, and its deadline is
   exactly `min(now + registryChallengeBound, approvalGateDeadline)` in the
   same daemon epoch. The addition is checked and overflow returns no challenge.
   Persisting the challenge does not increment the reservation state version;
   challenge issuance fails if the reservation CAS loses.
4. The operator's confirmation binds the challenge and the exact canonical
   digest. A payload naming any other digest, a stale challenge, or a
   drifted canonical digest is rejected; nothing is written.

**Decision commitment is one idempotent settlement CAS.** The daemon derives a
canonical `DecideRequestV1` digest from the daemon-issued decision id,
canonical-content digest, challenge id, authenticated operator principal,
role, owner domain, exact authorization-policy version, and the current
`DaemonEpochV1` plus the `ApprovalDecisionV1` variant. The first valid request
transactionally:

1. serializes on the reservation row, samples one
   `decisionLinearizationTime: EpochMonotonicDeadlineV1`, and compares the
   still-pending gate, current daemon epoch, reservation state version,
   unconsumed challenge, daemon-issued decision id, canonical digest,
   principal, role, owner domain, still-current authorization-policy version,
   and the
   challenge's persisted gate and challenge deadlines;
2. when the gate is still pending and the sample is at or after the gate
   deadline, performs the one `rejected-expired` CAS, invalidates every open
   challenge for the reservation, exits suspension, appends expiry evidence,
   and returns the typed expired-window rejection without inserting a decision;
3. otherwise requires the sample to be strictly before both deadlines. A
   challenge that expired before the still-open gate rejects without mutating
   the gate, allowing a newly fetched challenge within the same window;
4. inserts one immutable decision record under a unique decision id and
   challenge id, including the operator role and policy version, gate deadline,
   decision linearization time, and pre/post reservation state versions, and
   stores the request digest with the consumed challenge;
5. changes the gate in that same CAS to `approved-awaiting-permit` on approval
   or `rejected-denied` on denial, exits `approval-suspended`, commits the exact
   accumulator checkpoint, and appends decision and suspension-transition
   evidence; and
6. commits every write above before any permit can issue. Permit issuance
   requires the current `approved-awaiting-permit` state, matching post-decision
   state version, and matching committed decision-record digest; finding an
   approval row is not sufficient authority.

Before requiring `pending` state, the handler queries the unique consumed-
challenge and decision-request indexes for the canonical request digest. If an
acknowledgement was lost, an identical same-epoch authenticated request returns
the existing immutable `DecisionAckV1` bytes and performs no state mutation,
even when replay arrives after the gate or challenge deadline: the immutable
record proves that the original decision linearized strictly before both.
`DecisionAckV1` contains only `decisionRecordDigest` and
`decisionRequestDigest`. A non-authority `DecisionDeliveryEnvelopeV1` reports
`committed-delivery` for the response to the winning CAS or `replayed-delivery`
for a later delivery; this status is deliberately absent from the ack bytes,
request digest, decision digest, gate state, and all evidence. Dropping the
first response and retrying therefore returns byte-identical authority.

Only the exact committed digest takes the replay branch; a miss proceeds to
the first-decision CAS above, so replay cannot create authority. A different
decision, digest, principal, role, owner domain, authorization-policy version,
or decision id using the consumed challenge is a conflict and writes nothing.
A cross-role replay, caller substitution of the daemon-issued decision id,
decision-id reuse across reservations, or challenge reuse under another
decision id conflicts before consuming a fresh challenge or mutating a gate.
Concurrent approval, denial, and expiry commands
race on the same reservation version; exactly one transition can commit. A
challenge consumed without its decision, a decision committed at or after its
gate deadline, or a decision committed without the matching gate transition,
suspension transition, and evidence is structurally impossible in the
production settlement adapter.

After epoch replacement, `DecideRequestV1` remains closed to prior-epoch
authority. A separate read-only `GetDecisionResultV1` query may retrieve the
already committed immutable acknowledgement by decision id and matching
transport-authenticated owner domain. It neither consumes a challenge nor
touches a reservation, permit, accounting, or evidence row, and therefore
cannot revive the prior decision as current-epoch authority.

This protocol is decision-kind-generic: the split-out work-program area
reuses it verbatim for selection ratification, with the canonical content
extended to round identity, competitor-set digest, candidates, and any judge
recommendation labeled untrusted.

A renderer can therefore lie about a decision's meaning, but the channel's own
display and challenge binding ensure the operator ratifies exactly what
settlement will enforce.

---

## 13. Interfaces

Sketches; exact types are pinned by the plans.

### 13.1 Versioned D4 settlement extension

D8 preserves D4's reservation, permit-issue, atomic permit-consumption,
receipt, ambiguity, CAS, and one-writer transaction semantics unchanged, and
extends the D4 surface under the parent Section 22 versioning rules. Plan J
must advance (and the deferred area's Plan K later extends, for its own
record families), with schema sources, content hashes, conformance suites,
and transactional migrations:

Every D8 field named `daemonEpoch`, whether newly introduced or inherited into
a D8 extension record, is typed and encoded as `DaemonEpochV1`. No D8 protocol,
snapshot, command, decision, evidence, or replay record may use an identifier,
string, implementation-native number, or legacy epoch representation.

- the admitted-run snapshot version: budgets (`maxTurns`, `maxEffects`,
  `maxActiveSeconds`), `compositionAlgorithmVersion`, `runShape`, exact
  `LoopReplayBindingV1` and binding digest, execution-profile and import-policy
  version digests, verification binding, tool-registry schema, effect-
  classification registry schema, protected-destination taxonomy, complete
  `GrantedToolBindingV1` values and binding digests,
  approval-gate classes, typed task schema and digest, the duplicate-key-free
  canonical keyed lists of full filesystem-capability bindings and
  `ProvisionedFilesystemCapabilityV1` values with each
  `FilesystemCapabilityBindingDigestV1`, exact outward-operation,
  effect-taxonomy, destination-catalog, destination-capability, resolver,
  adapter/configuration, and execution-principal bindings, plus the complete
  daemon-derived `ArtifactStoreBindingV1`, its canonical binding digest, and
  the run-specific `ArtifactStoreIsolationEvidenceV1`, plus the complete
  daemon-derived `LoopContentStoreBindingV1`, its canonical binding digest,
  `LoopContentStoreIsolationEvidenceV1`, and the turn-zero
  `ConversationStateV1` record/digest binding the admitted composed prompt and
  task payload with no dynamic messages;
- the settlement command and record version: turn discriminator on
  reservations, deterministic model-turn and journaled-action operation ids,
  content-referenced broker receipts, immutable `TurnJournalEntryV1` and
  `ActionOutcomeCheckpointV1` records, their unique keys and shared loop-state-
  version CAS, journal-entry preconditions on derived reservations, atomic
  budget-slot charging, approval-record precondition
  checks, canonical `ApprovalGateStateV1` and `DecisionChallengeRecordV1`, the
  shared reservation-state-version CAS for decision/expiry/permit issuance,
  daemon-issued decision ids, authenticated operator role and authorization-
  policy version, immutable acknowledgement and non-authority delivery
  envelope, trusted decision-linearization samples, canonical
  `AccountingRecordV1` and `AccountingTransitionRecordV1` values,
  capability-id/full-binding-digest/provisioned-instance and
  complete-footprint checks, persisted
  `ResolvedOutwardDestinationV1` values and their reservation/permit/receipt
  comparisons, permit deadlines, `ToolEffectClaimV1`,
  `ToolEffectPermitV1`, and `ToolEffectConsumptionV1` for both local and
  outward tool scopes (principal-authenticated claim, stable replay, and
  atomic one-use consumption, distinct from provider broker dispatch
  permits), the shared epoch-loss recovery matrix, by-value import records,
  and canonical
  `ArtifactEmissionRecordV1` values whose references bind the exact admitted
  artifact-store instance;
- the evidence record version: composed-prompt digest, task-payload digest,
  loop-replay/store binding digests, loop-content references, turn-journal and
  action-checkpoint digests, refusal, approval, verification-binding validation,
  artifact-store isolation, artifact emission, approval-gate expiry and
  linearization, epoch-loss, accounting-transition, deadline-late-result, and
  suspension-interval families, plus the separately chained
  `SupplementalObservationEntryV1` journal that cannot mutate terminal
  authority; and
- migration and compatibility fixtures proving journal-capable records replay
  correctly and pre-journal admitted runs fail closed before any new reservation
  rather than being reparsed or silently backfilled.

### 13.2 Runtime and daemon interfaces

The authority-bearing operator surface is a separate wire protocol,
`pnh-operator-decisions-v1`, carried inside the parent's authenticated host
custody channel but with its own PNH-PROTO registry entry, schema source,
content hash, conformance suite, and independent version clock. Its closed
message set is:

1. `ListPendingRequestV1` / `ListPendingResponseV1`, scoped to the operator's
   transport-authenticated owner domain;
2. `FetchCanonicalRequestV1` / `FetchCanonicalResponseV1`, returning
   `ApprovalCanonicalContentV1`, its canonical digest, and a daemon-issued
   decision id and single-use challenge bound to that digest, operator
   principal and role, owner domain, authorization-policy version, daemon
   epoch, reservation state version, authoritative gate deadline, and an
   expiry capped at that gate deadline;
3. `DecideRequestV1` / `DecisionResponseV1`, carrying only the daemon-issued
   decision id, canonical digest, challenge, and `approve` or `deny` decision;
   the response wraps immutable `DecisionAckV1` bytes in non-authority delivery
   metadata; and
4. `GetDecisionResultRequestV1` / `GetDecisionResultResponseV1`, a read-only
   cross-epoch lookup of an already committed acknowledgement that cannot
   create, replay, or revive authority.

Every frame carries the protocol version, pinned schema hash, canonical
`DaemonEpochV1`,
and replay identity required by parent Sections 14.3 and 22. Principal, role,
owner-domain identity, and authorization-policy version come only from the
authenticated transport and current owner-pinned policy; caller fields cannot
select them. Unsupported versions, unknown fields, an old
`approve(reservationId)` compatibility shape, schema-hash drift, stale epoch,
content-digest mismatch, or a consumed challenge without an identical
committed request fail before a decision record is written. An exact retry
after acknowledgement loss returns the existing byte-identical acknowledgement
under the
Section 12.3 CAS. There is no permissive decoder or version fallback. A future
version requires a new registry entry and an explicitly tested migration
adapter; it cannot weaken V1 confirmation semantics.

```ts
// D8.1 — composition (trusted runtime)
interface PromptComposer {
  compose(admitted: AdmittedPromptSet, taskPayload: TaskPayload): ComposedPrompt;
  // Implements pnh-compose-v1 exactly; ComposedPrompt carries the digest
  // defined in Section 8.2.1, recorded as run evidence.
}

// D8.3 — loop driver (trusted runtime)
interface AgentLoop {
  runTurn(state: LoopState): Promise<TurnOutcome>;
  // TurnOutcome: observed | refusalFedBack | terminalCandidate
}

// D8 loop-content write surface (internal to one-writer settlement).
interface LoopContentStoreWriter {
  putByDigest(
    admitted: AdmittedRunSnapshot,
    contentKind: LoopContentKindV1,
    exactBytes: BoundedBytes,
    expectedContentDigest: Digest,
    expectedByteLength: UInt64,
  ): Promise<LoopContentReferenceV1 | LoopContentStoreWriteReject>;
  // Uses only admitted.loopContentStoreBinding; no caller selects a store.
}

// Bound trusted-loop reader; task/plugin/renderer principals cannot call it.
interface LoopContentStoreReader {
  readByReference(
    admitted: AdmittedRunSnapshot,
    reference: LoopContentReferenceV1,
  ): Promise<BoundedBytes | LoopContentStoreReadReject>;
}

// One-writer D4 loop journal. Both methods are idempotent settlement CASes.
interface LoopJournal {
  commitTurn(entry: TurnJournalEntryV1): Promise<TurnJournalCommitResultV1>;
  commitAction(
    checkpoint: ActionOutcomeCheckpointV1,
  ): Promise<ActionCheckpointCommitResultV1>;
}

// D8.3 — non-provider outward destination resolution (trusted runtime)
interface OutwardDestinationResolver {
  resolve(
    operation: OutwardOperationBinding,
    canonicalParameters: BoundedBytes,
    admitted: AdmittedRunSnapshot,
  ): ResolvedOutwardDestinationV1 | DestinationResolutionReject;
  // Total and deterministic for the bound operation/schema. Returns exactly
  // one admitted capability or rejects before reservation authority exists.
}

// D8 artifact write surface (internal to the one-writer settlement module).
interface ArtifactStoreWriter {
  putByDigest(
    admitted: AdmittedRunSnapshot,
    source: {
      capabilityId: FilesystemCapabilityId;
      bindingDigest: Digest;
      provisionedInstanceId: ProvisionedFilesystemCapabilityId;
      relativePath: CanonicalRelativePath;
    },
    expectedContentDigest: Digest,
    expectedByteLength: UInt64,
    emissionKind: ArtifactEmissionKindV1,
    typedPatchSchemaDigest: Digest | null,
  ): Promise<ArtifactReferenceV1 | ArtifactStoreWriteReject>;
  // Uses only admitted.artifactStoreBinding and its private root handle.
}

// pnh-artifact-read-v1 (separate authenticated protocol and principal).
interface ArtifactStoreReader {
  readByReference(
    reference: ArtifactReferenceV1,
    authenticatedOwnerDomainId: OwnerDomainId,
  ): Promise<BoundedBytes | ArtifactStoreReadReject>;
  // Returns verified bytes by value; never exposes a path or write handle.
}

interface CanonicalDecisionChallengeV1 {
  decisionId: OpaqueDecisionId;
  canonicalContent: ApprovalCanonicalContentV1;
  canonicalContentDigest: Digest;
  challengeId: OpaqueChallengeId;
  operatorPrincipalId: OperatorPrincipalId;
  operatorRoleId: OperatorRoleId;
  ownerDomainId: OwnerDomainId;
  authorizationPolicyVersionDigest: Digest;
  reservationStateVersion: ReservationStateVersionV1;
  approvalGateDeadline: EpochMonotonicDeadlineV1;
  challengeDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpochV1;
}

interface ChallengeBoundDecisionV1 {
  decisionId: OpaqueDecisionId;
  canonicalContentDigest: Digest;
  challengeId: OpaqueChallengeId;
  decision: ApprovalDecisionV1;
}

interface DecisionAckV1 {
  decisionRecordDigest: Digest;
  decisionRequestDigest: Digest;
}

// Wire delivery metadata only. It is absent from every authority digest,
// settlement row, approval gate, and evidence checkpoint.
interface DecisionDeliveryEnvelopeV1 {
  ack: DecisionAckV1;
  deliveryStatus: "committed-delivery" | "replayed-delivery";
}

// D8.5 — operator channel (daemon-side; the only decision writer)
interface OperatorDecisions {
  listPending(): Promise<PendingDecision[]>;
  // owner domain is transport-derived; the caller cannot select it
  fetchCanonical(id: ReservationId): Promise<CanonicalDecisionChallengeV1>;
  // returns canonical content plus a daemon-issued decision id and challenge
  decide(d: ChallengeBoundDecisionV1): Promise<DecisionDeliveryEnvelopeV1>;
  getDecisionResult(id: OpaqueDecisionId): Promise<DecisionAckV1 | NotFound>;
  // authenticated operator role only; rejects stale challenges and
  // canonical-digest mismatches; writes approval records (the split-out
  // work-program area extends the same channel for selection records)
}

// Non-provider tool permits; provider DispatchPermit remains broker-only.
interface ToolEffectPermits {
  claim(c: ToolEffectClaimV1): Promise<ToolEffectPermitV1 | PermitReject>;
  consume(
    permit: ToolEffectPermitV1,
    authenticatedExecutionPrincipalId: ExecutionPrincipalId,
  ): Promise<ToolEffectConsumptionV1 | PermitReject>;
}

// One-writer append-only chain. Appending never changes terminal authority.
interface SupplementalObservationJournalV1 {
  append(
    entry: SupplementalObservationEntryV1,
  ): Promise<SupplementalObservationEntryV1 | SupplementalObservationReject>;
}
```

`OperatorDecisions.decide` is the sole write path for authority-bearing
decision records; no harness instance, plugin, broker, or renderer holds a
write. The split-out work-program area's `SelectionState` interface builds on
this channel and is specified in that area's own document.

---

## 14. Proposed invariants

### 14.1 Successor constitutional baseline (prerequisite)

The ratified Plan A baseline is immutable: a complete 46-row `first_release`
object with closing gates A through H only. D8 invariants therefore cannot be
registered against it. Before Plan I implementation begins, the owner must
ratify a **successor constitutional baseline** that:

- lives at a new immutable registry path and leaves the Plan A baseline
  byte-identical;
- carries a supersession record naming the owner decision, the prior baseline
  digest, and the reason;
- preserves all 46 ratified rows unchanged and appends the D8 invariants with
  `law_status: proposed` until the owner ratifies them;
- extends the closing-gate vocabulary with gates I and J (and K, reserved
  for the split-out work-program area) and adds an explicit
  `post-first-release` disposition class, so no D8 row can be read as a
  first-release claim; and
- includes a complete disposition mapping (enforcement kind, disposition,
  closing gate) for every non-retired D8 invariant listed below.

Plan A's transition machinery (new path plus owner decision-backed
supersession) is the only route; mutating the existing baseline or inventing
an A-through-H mapping for D8 rows is prohibited.

### 14.2 Provisional invariant set

Final PNH-INV numbers are assigned only by the successor baseline. D8 uses
provisional aliases, matching the D9 and D10 convention. Each row has exactly
one enforcement kind from the parent Section 18.1 closed set; cross-cutting
claims are split rather than given compound kinds. All enter as
`law_status: proposed`, `proof_status: unproven`, with a `proof_reason` of
"D8 design accepted, no implementation".

The retired alias D8-INV-06 is not an invariant row and has no enforcement
kind. Apply and selection authority moved to the split-out work-program area,
where WP-INV-01 supersedes the historical alias.

| Alias | Statement (target) | Enforcement kind | Closing gate |
|---|---|---|---|
| D8-INV-01 | No module in the composition, admission, loop, or settlement path parses prompt file content, task payload, or model output for authority; authority requests exist only in validated manifest and registry records. | `static-structure` | I |
| D8-INV-02 | Authority-shaped content injected into prompt files, task payloads, or model output never creates, widens, or activates a grant at run time. | `runtime-adversarial` | J |
| D8-INV-03 | A declarative run's complete granted tool capability records, including plugin/version, manifest and operation-set digests, allowed operation descriptors, effect classification/taxonomy, applicable destination capabilities, and registry/taxonomy schema identities, plus its route class and budgets, are immutable from task identity through snapshot, reservation, approval, permit, receipt, and terminal state. No id-only grant, stable-id version drift, added operation, or family/destination remap can execute. | `runtime-adversarial` | J |
| D8-INV-04 | Every model dispatch and tool effect in a declarative run is an individually reserved effect whose budget slot is claimed atomically once. Provider execution uses broker-only `DispatchPermit`; local and outward tool execution uses a scope-tagged `ToolEffectPermitV1` claimable and consumable once only by its exact admitted principal. Both carry active-budget deadlines. The authenticated executor cancels and refuses post-deadline effects or positive evidence. Lease-bound accounting charges each open active interval exactly once, charges no approval/lease-free/terminal time, and the shared epoch-loss matrix rejects every proven pre-consumption phase, marks consumed-without-receipt ambiguous, settles a committed receipt once, and never redispatches. | `runtime-adversarial` | J |
| D8-INV-05 | A run admitted without outward effect classes cannot cause an outward effect; an encapsulated run is admissible only under a proven artifact-only execution profile with no outward grants, approval gates, or apply authority. | `runtime-adversarial` | J |
| D8-INV-07 | Approval records accepted by D4 are current-epoch records whose epoch is the exact canonical non-zero `DaemonEpochV1`, written only through the authenticated operator channel under canonical-content challenge confirmation. The challenge and both decision digests bind the daemon-issued decision id, operator principal and role, owner domain, and authorization-policy version. Every challenge deadline is capped by the reservation gate deadline; decision, expiry, suspension exit, evidence, and gate update compete on one CAS strictly before that deadline. Permit issuance requires the resulting approved state and decision digest. Identical retries return byte-identical two-digest `DecisionAckV1` authority while non-authority delivery status may differ; cross-role, policy, decision-id, challenge, or reservation replay conflicts without consuming fresh authority. Cross-epoch result retrieval is read-only. | `runtime-adversarial` | J |
| D8-INV-08 | No code path outside the daemon operator-channel module can construct or persist an approval record. | `static-structure` | J |
| D8-INV-09 | A declarative run with outward grants settles `completed` only with verification evidence that D4 validated against the admitted verification binding: verifier identity and version, bound subject, predicate specification, and trusted observation shape. | `runtime-adversarial` | J |
| D8-INV-10 | No non-provider outward tool operation is admitted without an exact operation descriptor, effect taxonomy, trusted destination resolver/schema, and closed set of owner-pinned non-protected destination capabilities binding destination identity, adapter/configuration, and principal. D4 resolves exactly one admitted capability and carries it through reservation, approval, the outward arm of `ToolEffectPermitV1`, authenticated-principal claim and one-use consumption, adapter execution, and receipt. Declared family, raw endpoint, redirect, alias, imported writer, approval, or mismatched permit/receipt cannot substitute destination authority. Every filesystem mutation remains inside an admitted alias-isolated capability bound through the local arm of the same permit; imports cannot introduce protected, credential, or shared mutable inodes; complete footprints or an exact capability mutation envelope plus descriptor-relative no-follow execution prevent escape; artifact emission may use only D8-INV-12; and no D8 identity can apply an emitted artifact externally. | `runtime-adversarial` | J |
| D8-INV-11 | Every granted read operation is confined to an admitted alias-isolated read capability whose unique id, complete binding digest, and provisioned instance are bound through reservation, permit, executor request, and receipt; arbitrary host paths, subdirectory-only boundaries, protected or credential imports, shared mutable inode imports, mount crossings, and outside-root inode aliases are inadmissible, and the executor resolves every source relative to the private capability root without following links. | `runtime-adversarial` | J |
| D8-INV-12 | Every artifact emission uses only the complete daemon-derived `ArtifactStoreBindingV1` and run-specific `ArtifactStoreIsolationEvidenceV1` persisted in the admitted-run snapshot, and every `ArtifactEmissionRecordV1` binds the same store instance and owner domain. The store is a dedicated local non-network, non-FUSE, non-synchronized, non-replicating whole-filesystem or volume identity physically disjoint from every task capability, protected or credential root, consumer-writer root, and other owner's store; only the bound writer principal can atomically `putByDigest`, only the separate bound reader principal can return digest-verified bytes by value, and no task or consumer writer can access the backing root. Missing proof or any profile, catalog, mount, root, adapter, executable, principal, owner, binding, content, or reference drift closes admission and writes without fallback. | `runtime-adversarial` | J |
| D8-INV-13 | Every authority-bearing keyed catalog collection declares one canonical semantic key and ordering rule in the generated schema; duplicate key bytes reject before hashing or admission even when payloads differ, and ordered keyed lists reject duplicate keys without reordering. Only the validating decoder can construct the opaque `ValidatedKeyedCatalogV1` runtime brand; admission, snapshot rehydration, D4, and executors reject raw arrays or caller-built maps, and every key reference resolves exactly one full catalog entry. | `static-structure` | I |
| D8-INV-14 | Every approval-gated effect class maps through the owner-pinned approval-subject registry to exactly one closed `ApprovalSubjectV1` arm: model dispatch, tool operation, or verification. Tool mutation scope is either an exact enumerated footprint or an exact provisioned-capability confinement envelope, never a wildcard. Every nested `CanonicalSortedUniqueSetV1` is list-encoded in strict ascending order of complete canonical element bytes and rejects duplicates or alternate order before authority use; every keyed nested collection rejects duplicate semantic keys. Unknown or unrepresentable gated effects fail admission. | `static-structure` | I |
| D8-INV-15 | Every declarative turn binds one exact `LoopReplayBindingV1` and daemon-measured `LoopContentStoreBindingV1`. A broker receipt cannot commit without an immutable owner-scoped reference to the exact observation bytes; one turn-journal CAS commits the bound parse result, deterministic action ids, conversation state, and next loop state before any derived reservation; and every journaled action receives exactly one idempotent outcome checkpoint before the next turn. Restart either resumes those exact references, digests, serializer/parser executables, ids, and checkpoints or settles failed before new authority. Raw observations, action parameters, and feedback never enter settlement or evidence rows, and no reparse, regenerated feedback, version drift, or process-local id can create a new effect. | `runtime-adversarial` | J |
| D8-INV-16 | `pnh-compose-v1` emits one canonical role/content sequence using only the closed roles system, pre-task-context, task-payload, and post-task-context. Roles participate in the composed-prompt digest. Provider translation is exact-version admitted authority and may change wire syntax only; it cannot infer, merge, reorder, drop, duplicate, or reinterpret a canonical message. | `runtime-adversarial` | J |
| D8-INV-17 | A terminal record and its evidence checkpoint are immutable. A receipt arriving after terminal commitment can append at most one entry to the separate supplemental-observation hash chain keyed by reservation, receipt digest, and frozen terminal checkpoint; it cannot alter effect/run outcome, accounting, budget, terminal digest, main evidence chain, or positive evidence. | `runtime-adversarial` | J |

---

## 15. Implementation-plan series additions

### Plan I: prompt kind and task definitions

Decision owner: D8 (registry surfaces shared with D1).

Deliver: registry version bump adding `kind: "prompt"`, composition metadata
with the pinned `pnh-compose-v1` algorithm version, requested bindings, the
`TaskDefinition` record with prompt-set and exact `LoopReplayBindingV1`
bindings, the tool-registry, effect-classification registry, and protected-
destination taxonomy schema digests, exact `GrantedToolBindingV1` capability
records and binding digests, alias-isolated filesystem capability bindings, outward destination
capabilities and operation bindings,
exact execution-profile and import-policy version digests, read and destination
policies, verification bindings, and execution profiles; the owner-pinned
`protected-destination-class-v1`, `outward-operation-catalog-v1`, and
`outward-destination-catalog-v1` machine-readable sources, generated prose
views and fixtures, with protected destination classes absent from every
grantable catalog; the owner-pinned `artifact-store-isolation-profile-v1` and
protected-root, credential-root, consumer-writer-root, and artifact-store-root
catalog schemas; canonical `ArtifactStoreBindingV1`,
`ArtifactStoreIsolationEvidenceV1`, `ArtifactReferenceV1`, and
`ArtifactEmissionRecordV1` schemas, `ProvisionedFilesystemCapabilityV1` and
`OutwardOperationKeyV1`, canonical `EpochMonotonicDeadlineV1`,
`ApprovalGateStateV1`, `DecisionChallengeRecordV1`, every closed
`ApprovalSubjectV1` and `MutationScopeV1` arm, `ToolEffectClaimV1`,
`ToolEffectPermitV1`, `ToolEffectPermitStateV1`,
`ToolEffectConsumptionV1`, `AccountingRecordV1`,
`AccountingTransitionRecordV1`, and `SupplementalObservationEntryV1`, plus
canonical `LoopContentStoreBindingV1`,
`LoopContentStoreIsolationEvidenceV1`, `LoopContentReferenceV1`,
`ConversationStateV1`, `TurnJournalEntryV1`,
`ActionOutcomeCheckpointV1`, and operation-identity schemas; the owner-pinned
loop-content isolation and retention profiles and root catalogs; all loop-
replay, content-store, content, proposed-action, conversation-state, journal,
action-checkpoint, and operation-id vectors; plus
`ArtifactStoreBindingDigestV1` and
`FilesystemCapabilityBindingDigestV1` vectors; the generated opaque
`CanonicalSortedUniqueSetV1` schema constructor and complete-element comparator
for approval capability ids, write footprints, and read sets; the generated
exhaustive semantic-key table, duplicate-key validators, and opaque
`ValidatedKeyedCatalogV1` runtime brand;
admission validation
(per-field subset rule including numeric budgets, verification-required rule,
no-entrypoint rule, encapsulated artifact-only rule, destination-policy rule,
prompt-set completeness rule, exact tool-version/manifest/operation-set/
effect-family and registry-schema grant bindings, exact tool/operation/taxonomy/catalog/resolver/
adapter/configuration/principal binding, exact serializer/grammar/parser/
executable/tool-schema/operation-id binding, generic-or-unclassifiable outward
operation rejection, schema-declared semantic-key uniqueness and ordering, and
byte-grammar source rules); the composition
byte grammar and generated `pnh-canonical-value-v1` schema source, codecs,
schema hashes, cross-platform golden fixtures, and published test vectors for
every D8 digest schema, including every nested record order, primitive alias,
enum, union variant, literal, version binding, and the exact
`DaemonEpochV1` primitive; composed-prompt digest
evidence;
goal-contract mapping documented; D8-INV-01 static-structure proof.

Exit gate: admission rejects every malformed fixture class (entrypoint on
prompt, grant exceeding request — including each numeric budget field
individually, outward grant without verification, interleaved placement,
CRLF/BOM/empty/no-final-newline sources, encapsulated with outward grants or
gates or missing profile, self-attesting verifier, grant targeting a
protected destination class, an outward operation with a raw endpoint,
unknown or cross-class destination domain, missing destination capability,
unbound resolver, adapter, principal, catalog or schema, or any drifted
operation/taxonomy/catalog/resolver/adapter/configuration version, filesystem
capability profile backed by an
ordinary shared directory or permitting mount crossing, hard-link or
bind-mount import, protected or credential import, a task or caller-supplied
artifact-store or loop-content-store id, root, adapter, binding, or reference,
a missing or cross-owner host-custody store binding, an unknown or drifted store schema,
adapter, executable, principal, reader protocol, backing identity, root
identity, isolation profile, or root catalog, missing or drifted prompt-set
fragments, composition-algorithm mismatch, missing or drifted
execution-profile, import-policy, conversation serializer or serializer
executable dependency closure, proposed-action grammar, parser or parser
executable dependency closure, tool-descriptor schema,
or operation-id derivation digest, non-canonical typed values, unknown
schema fields, duplicate `promptSet.fragments.pluginId`, granted-tool
`pluginId`, allowed-operation name, filesystem
`capabilityId`, outward `destinationCapabilityId`, outward
`(toolPluginId, operationName)`, destination-policy `effectFamily`,
read-policy `effectFamily`, or provisioned-capability `capabilityId` keys with
identical or differing payloads, duplicate key-only members in approval
gates, operation destination-capability ids, or policy capability ids, any
keyed list in wrong canonical key order,
any keyed list missing a generated key rule, `DaemonEpochV1` zero, string,
decimal-string, byte-string,
digest, nullable, record, list, union, floating-point, negative,
truncated-integer, over-width, overflow, or wraparound representation, and
every null/union/list/enum malformed class, plus every closed composed-message
role and approval-subject/mutation-scope arm, every approval capability-id,
write-footprint, read-set, allowed-mutation-kind, or provisioned-capability
duplicate and alternate-order encoding); accepted
approval-set vectors with variable-length ids, minimum-valid and longer paths,
multibyte UTF-8 paths, and mutation variants encode in complete-element-byte order in both
codecs, while raw-field, lexical-mutation, insertion-order, reversed, and
duplicate encodings reject before any approval-content, challenge, or decision
digest; both codecs reproduce every loop-replay/store/content/action/
conversation/journal/checkpoint digest and every `opv1_` identifier, while a
one-field serializer, grammar, parser executable, tool-schema, store, owner,
turn/action/message ordinal, observation, action parameter, conversation link,
or state-version mutation changes the bytes or rejects; duplicate/gapped
ordinals, impossible parse/checkpoint nullability, wrong operation-id
re-derivation, and alternate journal keys reject; accepted epoch vectors for `1`
and `18446744073709551615` encode byte-identically in both codecs, while the
epoch-zero vector rejects; a golden
prompt plugin admits and composes byte-identically across supported
platforms and two independent codecs reproduce every published digest vector;
all four content sources emit their exact canonical roles, empty placement
classes and empty task payload follow the pinned presence rules, every role
mutation changes the digest, unknown roles reject, and two provider adapters
preserve the same canonical pre-translation sequence; id-only tool grants,
stable-id version replacement, operation addition/removal, family or taxonomy
remap, protected-taxonomy drift, registry-schema drift, and destination-binding
drift each reject or change `taskDigest` and `GrantedToolBindingDigestV1`;
model-dispatch, local/outward tool, verification, enumerated-footprint, and
capability-envelope approval vectors round-trip in both codecs, while an
unsupported gated class, wildcard capability envelope, omitted provisioned
binding, duplicate nested key, or arm/kind mismatch rejects;
first-wins and last-wins fixture decoders both reject before producing a
`taskDigest`; kernelApiVersion and registry migration rules are pinned;
D8-INV-13 and D8-INV-14 static-structure proofs close.

Authoring: after Plan B2 and design ratification. Implementation: after Plan G
closes and the successor constitutional baseline is ratified.

### Plan J: declarative agent loop

Decision owner: D8 (settlement surfaces shared with D4, dispatch with D3).

Deliver: trusted loop runtime; the versioned D4 settlement extension of
Section 13.1 (admitted-run snapshot, settlement command and record, and
evidence record versions, with schema hashes, conformance fixtures, and
transactional migration); the separately versioned
`pnh-operator-decisions-v1` protocol with schema source, hash, conformance
suite, and no legacy fallback; per-turn reservation with atomic budget-slot
charging and refusal; the exact snapshot-bound conversation serializer,
action grammar/parser executable, tool-descriptor schema, and deterministic
operation-id derivation; daemon startup/admission derivation of the exact
`LoopContentStoreBindingV1` and isolation evidence; an in-memory conformance
adapter and a production durable loop-content adapter implementing immutable
owner-scoped `putByDigest` and private by-reference reads; content-referenced
broker receipts; the idempotent `TurnJournalEntryV1` CAS and per-action
`ActionOutcomeCheckpointV1` CAS with journal-gated reservations, exact
conversation reconstruction, retention enforcement, migration refusal, and
restart recovery; the lease-bound `AccountingRecordV1` state machine and
idempotent interval transitions with exactly-once cross-epoch debit; permit
deadlines bounded by remaining active budget with broker and both tool-scope
executor cancellation and post-deadline effect refusal;
the D4 reservation- and permit-time capability and footprint checks;
proposed-action validation with refusal
evidence; verification-binding validation and the bound-evidence `completed`
rule; the artifact-only settlement edge; the adversarial artifact-only
execution-profile proof (attempted network egress and out-of-directory
writes fail from inside the profiled runtime); loop termination state
machine with fault-injection kill points at every transition, including
daemon restart and clock rollback during an active budget; approval-gated
permit refusal in D4 with the durable approval-wait suspension substate and
its one authoritative deadline, deadline-capped challenge issuance,
decision/denial/expiry reservation-version CAS, strict pre-deadline
linearization rule, approved-state permit precondition, and the complete
shared provider/tool epoch-loss recovery matrix; the scope-tagged
`ToolEffectPermitV1` protocol with stable claim replay,
principal-authenticated claim, atomic consumption, and bound receipt shape;
the immutable two-digest decision acknowledgement, non-authority delivery
envelope, role/policy/daemon-issued-id challenge binding, and read-only
cross-epoch result lookup; the separate append-only supplemental-observation
journal for post-terminal receipts; confined-capability
write and read executors; the trusted `OutwardDestinationResolver`, opaque
destination-capability handles, reservation/permit/receipt destination
comparisons, authenticated adapter observations, and fail-closed redirect,
alias, DNS/service-indirection, aggregate-target, and imported-writer handling;
the authenticated operator decision channel with
canonical-content fetch, fresh-challenge issuance, and digest-bound
confirmation plus the atomic idempotent decision CAS and current role/policy
revalidation; two independently
implemented alias-isolated filesystem adapters at the new persistence seam,
including by-value import; a
daemon startup/admission preflight that derives and persists the exact
`ArtifactStoreBindingV1` and per-run isolation evidence; two independent
production artifact-store adapters implementing atomic immutable
`putByDigest` on dedicated local backing; the separately versioned
`pnh-artifact-read-v1` protocol under a non-writer reader principal; store
binding/reference/emission evidence and response-loss replay; a first
decision-queue renderer; D8-INV-02, 03, 04, 05, 07, 08, 09, 10, 11, 12, 15,
16, and 17
proofs.

Exit gate: an end-to-end declarative run completes against the mock broker
with every turn and tool call evidenced; budget exhaustion (each budget kind,
including a concurrent-reservation race on the last slot, an in-flight
dispatch plus local and outward tool effects cancelled at their active-budget deadlines, an
attempted post-deadline local mutation, an active-accruing epoch restart that
receives one interval-keyed conservative debit, and an approval-suspended epoch restart
that restores the exact accumulator checkpoint while expiring pending approval
authority), ungranted-tool proposal, write or read
reservation naming an unbound capability, an ordinary shared-directory
capability, a hard-link or bind-mount import, a protected or credential import,
a pre-existing and racing outside-root inode alias attempt, a
protected intermediate write by an operation whose declared final output is
in policy, a hostile archive entry escaping the confined capability, a
mid-flight symlink swap or mount crossing, wrong-verifier and
wrong-subject verification receipts, verification failure, artifact-only
completion, and mid-loop crash each settle to their specified terminal with
correct evidence; an approval-gated effect cannot obtain a permit before its
winning `approved-awaiting-permit` state and matching decision digest, settles
`rejected` on denial or expiry, and pending, approved-without-permit, and
issued-unconsumed permit phases are rejected on daemon-epoch change under the
shared matrix with no duplicate slot or interval charge; against both settlement
adapters, the suite pauses expiry processing across gate deadline `T`, issues a
pre-`T` challenge whose ordinary bound would exceed `T`, and races approval,
denial, expiry, and permit issuance immediately before, exactly at, and after
`T`; only a first decision linearized before `T` commits, every at/after-`T`
path settles `rejected-expired` exactly once, and no orphan approval row or
losing CAS can issue a permit; a challenge deadline is always the minimum of
its registry bound and `T`, while a challenge expiring before `T` can be
replaced without extending `T`; an identical replay of a pre-`T` committed
decision returns its acknowledgement after `T` without a new mutation;
cross-epoch deadlines, a challenge deadline after `T`, a pending/expired gate
with a decision digest, an approved/denied gate without its matching digest,
and mismatched pre/post state versions all fail closed;
wall-clock rollback does not extend the epoch-local approval deadline and the
strict exact-deadline boundary rejects; a broker principal cannot claim a
`ToolEffectPermitV1`, a tool execution principal cannot claim a dispatch
permit, and local/outward scope or principal substitution rejects; a renderer-supplied decision
payload naming a digest other than the canonically displayed one is
rejected; an old unversioned `approve(reservationId)`, wrong schema hash,
unknown protocol version, stale challenge, and conflicting challenge reuse are
rejected; a zero, string, byte-string, truncated, overflowed, or otherwise
non-canonical daemon epoch is rejected before digest comparison; a lost
decision acknowledgement at epoch `1` or `18446744073709551615` followed by an
identical retry reproduces the original request digest and returns byte-identical
`DecisionAckV1` authority while only delivery-envelope status differs;
cross-role replay, role revocation, policy drift, caller decision-id
substitution, decision-id reuse across reservations, challenge reuse across
ids, and cross-role result lookup all reject without consuming or writing;
leadership replacement at the maximum epoch fails closed
instead of wrapping; first acquisition initializes an absent counter to `1`,
and each successful replacement increments exactly once, while concurrent
approve/deny requests
commit exactly one result; a generic writer, mislabeled effect family,
protected destination capability, raw endpoint, alternate tenant/store,
redirect, adapter alias, imported consumer writer, configuration drift,
wrong principal, or receipt reporting a destination other than the reserved
`ResolvedOutwardDestinationV1` fails before dispatch or settles `ambiguous`
after consumed-permit uncertainty as specified; mutating any bound operation,
taxonomy, catalog, resolver, adapter, configuration, principal, destination,
or resource selector changes the authority bytes; artifact-store startup or
admission rejects a protected, credential, task-capability, consumer-writer,
other-owner, ordinary-directory, hard-link-aliased, bind-mounted, network,
FUSE, synchronized, replicated, missing, or drifted backing; store puts reject
the wrong owner, writer principal, binding digest, root identity, adapter,
executable, content digest, byte length, emission kind, or typed-patch schema;
the two production adapters prove atomic no-replace immutability, identical
response-loss replay, and private-root confinement; artifact reads reject the
wrong owner, reader principal, store binding, digest, or byte length and expose
neither a path nor write handle; task and consumer-writer principals cannot
open the backing root; a filesystem reservation, permit, executor request,
receipt, or artifact source with an id-only lookup, wrong full binding digest,
wrong provisioned instance, or a key resolving to anything other than exactly
one validated catalog entry rejects before access or settles `ambiguous` after
consumed-permit uncertainty; every attempt to apply an emitted artifact through a D8
identity fails admission or the artifact-writer exclusion check; the
renderer cannot write a decision; the static
writer-exclusivity check fails when a second approval-record writer or any
artifact-store put path outside the settlement module is introduced; disabling
any control fails its test.

Permit and epoch-loss exit gate: for both provider `DispatchPermit` and both
scopes of `ToolEffectPermitV1`, inject response loss and executor death before
and after reservation, approval, permit issue, permit consumption, operation
start, receipt commit, and terminal settlement. Also crash before and after
each recovery CAS. Pending approval, approved/no-permit, and issued/unconsumed
settle `rejected` with proven non-dispatch; consumed/no-receipt settles
`ambiguous`; a committed receipt settles once; terminal state is immutable.
Identical claim replay by the same principal returns the same permit, while a
second worker, stale epoch, wrong principal, changed claim digest, wrong scope,
expired deadline, lease/generation drift, or receipt-shape drift cannot consume
or execute. The suite proves one budget-slot charge, no redispatch, and one
recovery evidence append at every kill point.

Accounting and late-observation exit gate: exercise all three accounting states
across periodic checkpoints, approval entry/exit, lease expiry/release,
reassignment, epoch replacement, monotonic-origin reset, wall-clock rollback,
and terminal settlement. Crash before/after every close, recovery-debit, and
new-lease transaction and replay each command. Exactly the active interval is
charged once, approval and lease-free time charge zero, and terminal state
never resumes. Race broker and tool receipts immediately before and after
terminal commitment, then duplicate and conflict each append with crashes.
The terminal digest and frozen checkpoint remain byte-identical, each receipt
appears at most once in the correct main or supplemental chain, and no late
observation changes accounting, outcome, completion, or positive evidence.

Loop-replay exit gate: against both D4 settlement adapters and both the
in-memory and durable loop-content adapters, inject death after the broker
response before content put, after content put, after broker-receipt commit,
before and after turn-journal commit, before and
after each action reservation, and before and after each action-outcome
checkpoint. Restart first with the exact admitted serializer/parser and then
with a different serializer or parser binary/version. The exact binding resumes byte-identically;
the changed or unavailable binding settles `failed
(replay-binding-unavailable)` before any new reservation. The suite proves the
same conversation digest, parse result, action order, `opv1_` identifiers,
budget charges, effect records, and next loop state after every kill point;
malformed output rejected by parser V1 cannot become accepted under V2; no
duplicate effect or conversation append occurs. It also rejects wrong-owner,
wrong-store, wrong-principal, digest/length, content-kind, retention-policy,
serializer, grammar, executable, tool-schema, journal-key, action-key, and
pre/post-state-version drift; blocks deletion of live referenced content;
proves task/plugin/renderer/consumer-writer principals cannot read the private
store; and verifies settlement/evidence rows contain only allowed references
and digests, never raw observations, action parameters, or feedback. A legacy
admitted run with no replay binding or journal schema
fails before reservation without backfill or reparse. D8-INV-15 closes.

Implementation: after Plan I closes.

### Plan K: moved to the deferred work-program decision area

Plan K (work programs, selection rounds and records, apply tasks, judge
recommendations) moved with the 2026-08-27 owner split decision to
`2026-08-27-prism-harness-work-program-selection-design-spec.md`. It is not a
D8 plan; its operator-review surfaces were absorbed into Plan J above. It may
begin only after Plan J closes, that area is ratified after its own
hardening, and the successor baseline covers its invariants.

Plan L belongs to D9, not D8. Its Milestone L1 starts after Plan J; any D9
milestone that consumes work programs (L2) additionally gates on the deferred
area's Plan K. Plan L may consume only D8 terminal evidence and quarantined
artifacts. Plans I and J must not add a durable learning store, adaptation
promotion contract, or destination writer to public `pnh/`.

---

## 16. Migration notes (informative)

The owner's existing cross-harness configuration repo maps onto D8 as follows:
instruction fragments and instruction-only skills become `prompt` plugins
without requests; reviewer and implementer agent definitions become `prompt`
plugins with requested bindings; script-bearing skills split at generation
time into a `prompt` plugin plus a `tool` plugin; provider lane definitions
dissolve into broker bindings; orchestration workflow scripts become work
program templates in the control plane; verification and guard hooks become
policy and verification bindings. The composite-skill split happens in that
repo's generator, keeping kind purity here.

Future improvements to those consumer artifacts enter D9 as quarantined
candidates. D8 migration does not make existing memory, instruction, skill, or
workflow destinations writable by agents or work programs.

The first journal-capable schema version is a hard replay boundary. A run
admitted without `LoopReplayBindingV1`, `LoopContentStoreBindingV1`, or the
turn/action checkpoint schemas may be inspected and terminally failed, but it
cannot resume, reparse an old observation, synthesize missing conversation
bytes, or reserve another effect. New runs use the new task/snapshot versions;
there is no heuristic backfill. Loop content referenced by old terminal records
remains under its recorded owner-domain retention policy until lawful
collection.

---

## 17. Verification criteria for this document

This specification is ready to become Plan I when:

1. The `prompt` kind's admission rules are closed (no entrypoint, empty
   capabilities, subset grants) with named rejection classes, and the
   exact composition algorithm plus fully closed typed canonical-value schemas
   (including every nested record, primitive alias, enum, and variant) make
   every D8 authority digest reproducible byte-for-byte with golden fixtures
   and independent implementations. `DaemonEpochV1` has one non-zero unsigned
   64-bit encoding, bounded range, and fail-closed exhaustion rule. Every keyed
   catalog collection has one generated semantic-key extractor and order rule;
   duplicate keys reject before encoding, hashing, or admission. Every explicit
   authority field typed `CanonicalSortedUniqueSetV1` has one
   complete-canonical-element-byte comparator; duplicate elements and alternate
   order reject before hashing or authority use, including every nested
   approval mutation-scope set. The four composition sources have exact closed
   roles in the digest, and every gateable effect maps to one representable
   closed approval-subject arm.
2. Task definitions bind goal, role, grants, class, shape, execution profile,
   exact tool version/manifest/operation-set/effect-family capability records,
   tool and effect-classification registry schemas, protected-destination
   taxonomy, filesystem capabilities, outward operation descriptors, effect taxonomy,
   destination capability and catalog identity, trusted resolver, adapter and
   adapter configuration, principal, import policy, exact conversation
   serializer, action grammar/parser executable, tool-descriptor schema,
   operation-id derivation, verification binding, and approval gates at exact
   versions with no field the model or plugin can
   author; filesystem roots are alias-isolated rather than path-confined; and
   encapsulated shapes are structurally artifact-only. No task, payload,
   plugin, approval, or caller field can select an artifact-store or loop-
   content-store identity, root, adapter, principal, or reference. No authority
   key can identify two catalog entries, and no runtime lookup can consume an
   unvalidated keyed list.
3. The turn protocol preserves D4's reservation, permit, receipt, ambiguity,
   and one-writer semantics on a versioned settlement extension; every
   non-filesystem outward effect resolves through its admitted trusted binding
   before reservation and carries the exact `ResolvedOutwardDestinationV1`
   through the outward arm of `ToolEffectPermitV1`, its exact-principal claim,
   atomic one-use consumption, and the authenticated receipt. Local operations
   use the local arm with the same replay and consumption contract; provider
   dispatch permits remain broker-only. Budget refusal
   is an atomic settlement-side slot claim. Every broker receipt first binds an
   immutable owner-scoped loop-content reference; one turn-journal CAS binds
   its exact parse, deterministic actions, conversation state, and next state
   before derived reservations; every action has one outcome checkpoint before
   another turn; and restart either resumes those bytes/bindings/checkpoints or
   fails before authority. The admitted snapshot also carries the complete
   daemon-derived loop-content binding and isolation evidence, turn-zero
   conversation record/digest, artifact-store binding, and artifact isolation
   evidence; every emission record returns a reference to the admitted artifact
   binding and owner domain. Every filesystem effect and artifact source carries the
   selected capability's unique id, complete binding digest, and provisioned
   instance from snapshot through executor or emission record.
4. Terminal semantics for declarative runs extend the parent taxonomy without
   modifying any existing row; `completed` is gated on bound verification
   evidence for outward runs and on the applicable positive-evidence rows for
   artifact-only runs; active-time restart charging depends on the persisted
   lease-bound interval accounting state; and broker and tool permits enforce
   the same active-time deadline. The shared epoch-loss matrix rejects every
   proven pre-consumption phase, marks consumed/no-receipt ambiguous, settles
   committed receipts once, and preserves terminal state. Restart debits each
   lost active interval at most once and charges no suspended or lease-free
   time. A post-terminal receipt can enter only the separately chained
   supplemental-observation journal and cannot change terminal authority.
   Approval authority is daemon-epoch-scoped and fails closed on epoch change
   without interpreting an old monotonic deadline.
   Within one epoch, every challenge is capped by the reservation-owned gate
   deadline; decision and expiry share one state-version CAS; only a strict
   pre-deadline linearization can approve; and permit issuance requires the
   resulting approved state.
5. The work-program subsystem is fully split out: D8 defines no work
   program, judge, selection, or apply surface; the deferred area builds
   only on D8 core contracts; every granted filesystem read and write uses an
   admitted alias-isolated filesystem capability with by-value imports,
   complete-footprint enforcement, and descriptor-relative access; and every
   non-filesystem outward operation uses only its admitted opaque destination
   capability through the bound resolver, adapter configuration, and principal,
   with no raw-endpoint or alias override. D8 artifact emission uses only the
   admitted daemon-measured store binding, dedicated physically disjoint local
   backing, atomic put-by-digest writer, and owner-scoped by-value reader; it is
   destination-free and no D8 writer can apply an emitted artifact.
6. Operator decisions are daemon-authenticated writes under the independently
   versioned `pnh-operator-decisions-v1` protocol and typed canonical-content
   challenge confirmation; every epoch field is `DaemonEpochV1`; challenge
   issuance binds the daemon-issued decision id, reservation version,
   authoritative gate deadline, operator principal and role, owner domain, and
   authorization-policy version;
   challenge consumption, immutable decision or exact-once expiry,
   suspension exit, and evidence append share one idempotent reservation CAS;
   exact committed replay returns byte-identical two-digest acknowledgement
   authority while delivery status remains non-authority; cross-role, policy,
   id, reservation, and challenge substitution conflicts; cross-epoch result
   retrieval is read-only; and renderers are read-only.
7. Every proposed invariant has exactly one enforcement kind from the parent
   closed set, and the successor constitutional baseline path (new immutable
   path, preserved Plan A baseline, D8 I/J gates, the separately reserved K
   gate, post-first-release disposition, complete mappings) is a named
   prerequisite.
8. The plan series separates authoring from implementation: no D8
   implementation before Plan G and the successor baseline, no D8 code in the
   Plan F/G candidate, and I → J ordering with Plan K deferred to the
   split-out area.
9. D8 can produce generic evidence and candidate artifacts for D9, but no D8
   identity, record, effect, or apply task can promote durable learned state,
   apply an emitted artifact to any external destination, write a D9
   destination, or change an active run.

## 18. Owner ratification record

Before Plan I authoring, the owner should record one of:

- **Ratified:** accept this D8 design and its plan series.
- **Ratified with amendments:** name each changed section and selected option.
- **Not ratified:** return to design review.

Recorded owner decision:

- **Status:** pending
- **Date:** —
- **Owner:** Vora Technologies, LLC
- **Decision:** —

Ratification authorizes writing Plan I only. It does not authorize
implementation, registry changes, or any public claim about agent execution.

---

## 19. Hardening reconciliation

Findings from
`2026-08-26-prism-harness-goal-execution-design-spec.hardening.md`, in report
order. Each row names the control this revision adopts and the verification
obligation that closes the finding.

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical 1 — judge output can become apply authority | Control moved with the subsystem: split-out area Sections 2.2–2.3 and 3 (in revision 4, D8 retains only the generic evidence-only rule in 1.1 and 7.2) | Judge output is an untrusted recommendation; only the authenticated operator channel converts evidence into an immutable selection record after canonical-content challenge confirmation. **Split out of D8 by owner decision; unverified by D8.** | The deferred area's own hardening cycle and Plan K exit gates; not a D8 closure. |
| Critical 2 — encapsulated outward work bypasses per-effect governance | 1.1, 4, 5, 6, 9.1, 10.6, 14.2 (D8-INV-05), Plan I, Plan J, 17.2–17.3 | Encapsulated runs are admissible only under a proven artifact-only execution profile; outward grants, approval gates, and apply authority on encapsulated shapes fail admission closed. | Plan I rejection fixtures for every encapsulated-violation class; Plan J D8-INV-05 proof that a profiled run cannot cause an outward effect. |
| Critical 3 — Plans I–K could enter the first-release candidate before Plan G | 1.1, 3, 15, 17.8 | Authoring/implementation split: no D8 implementation before Plan G closes and the successor baseline is ratified; no D8 code in the Plan F/G candidate; D8 orders I → J, while K belongs to the separately ratified deferred area. | Plan I entry conditions record Plan G closure and baseline ratification; Plan F/G audits confirm zero D8 surfaces in the candidate. |
| Important 1 — missing successor constitutional baseline | 2, 3, 14.1, 15, 17.7 | Owner-ratified successor baseline at a new immutable path with preserved Plan A rows, D8 I/J gates, a separately reserved K gate, `post-first-release` disposition, and complete mappings is a Plan I implementation prerequisite. | Baseline ratification record exists before Plan I implementation; registry v2 accepts every D8 row through the supersession path. |
| Important 2 — versioned D4 extension vs "no protocol changes" | 1 (item 4), 5, 10.2, 13.1, 15 (Plans J, K), 17.3 | Replaced the unchanged-protocol claim with preserved-semantics language plus an explicit versioned settlement extension (snapshot, command/record, evidence versions, hashes, conformance, migration). | Plan J delivers the versioned surfaces with conformance fixtures; parent Section 22 CI hash checks pass. |
| Important 3 — non-atomic budget charging | 6, 10.2 (step 3), 14.2 (D8-INV-04), Plan J, 17.3 | Budget slots are claimed atomically in the first-reservation transaction; monotonic slots; replay charges nothing; conflict dispatches nothing; charging defined for rejected, approval-pending, and verification effects. | Plan J concurrent-race exit-gate test on the last slot; D8-INV-04 proof. |
| Important 4 — receipt authenticity confused with predicate truth | 6, 9.1 (`VerificationBinding`), 10.3, 13.1, 14.2 (D8-INV-09), Plans I and J, 17.2, 17.4 | Verification bound to admitted verifier identity/version, subject digest or probe spec, predicate spec, and trusted observation shape; self-attestation structurally excluded. | Plan J wrong-verifier, wrong-version, and unbound-subject fixtures fail completion; D8-INV-09 proof. |
| Important 5 — no owner-bound single-winner selection state machine | Control moved with the subsystem: split-out area Section 2.3 | Daemon-issued selection rounds; one immutable selection slot per round with full identity binding; identical replay returns the record; conflicting winner fails closed. **Split out of D8 by owner decision; unverified by D8.** | The deferred area's own hardening cycle and Plan K exit gates; not a D8 closure. |
| Important 6 — renderer-independent confirmation missing for selections | 12.3 (approvals, retained in D8); selection application moved to the split-out area Section 3 | Canonical-content confirmation: channel-side fetch by opaque identity, canonical display, fresh challenge bound to the canonical digest — retained in D8 for approvals, reused by the deferred area for selections. | Plan J exit-gate test rejects a decision payload naming a non-canonical digest (approvals); selection-side tests belong to the deferred area's Plan K. |
| Important 7 — compound enforcement kinds | 14.2, 15 (Plans I, J, K), 17.7 | Compound rows split into homogeneous invariants (D8-INV-01/02 and D8-INV-07/08), each with one closed-set kind; provisional aliases defer final numbering to the successor baseline. | Registry v2 parser accepts every row; each proof gate covers its single kind. |
| Important 8 — no canonical composed-prompt byte grammar | 8.2, 8.2.1, 8.3, 13.2, Plan I, 17.1 | `pnh-compose-v1` pins source validation, ordering, joining, message-role serialization, and the digest definition; algorithm version participates in task and composed-prompt digests. | Plan I cross-platform golden fixtures reproduce identical digests; each malformed source class rejects. |
| Important 9 — wall-clock budgets across daemon epochs | 6, 8.2, 10.3, 10.5, Plan J, 17.4 | `maxActiveSeconds` bounds a persisted elapsed-active accumulator; epoch-local monotonic accrual; conservative restart charging; approval-wait suspension excluded and evidenced; wall clocks never decide budget state. | Plan J restart and clock-rollback fault tests during an active budget. |
| Important 10 — verification-free runs had no successful terminal edge | 9.1, 10.3, 10.4, 14.2 (D8-INV-09 scope), Plans I–K, 17.4 | Explicit `settling-artifact-only` edge evaluating the execution class's applicable positive-evidence rows; `verification: null` restricted to artifact-only definitions. | Plan J artifact-only completion exit-gate test settles `completed` with correct evidence and no invented receipt. |

Every finding above is either closed within D8 scope by a stated control and
a named verification obligation, or — for the rows explicitly marked
split-out — deferred with its control to the work-program decision area,
whose own hardening and ratification are the sole closure mechanism. No
split-out control is certified by D8.

### 19.1 Second-cycle reconciliation (revision 3)

Findings from the fresh two-engine review of revision 2
(`2026-08-27-prism-harness-d8-revision-2-hardening.md`, target blobs
`3baf8e520d516a1888da58d27c329c565b80c964` and
`c2accde6d889d6499350db429233a6ca5a1740f4`), in report order:

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical — protected-destination ban was prose, not enforcement | 9.1 (destination-capability rules, `DestinationPolicy`), 11.5, 14.2 (D8-INV-10), Plans I and J | Closed effect-family taxonomy with protected classes ungrantable at D1 admission; owner-pinned destination policies; independent D4 canonical-target re-check at reservation and permit time that no approval or selection overrides. | Plan I protected-destination rejection fixtures (absolute paths, traversal, symlinks, aliases); Plan J out-of-policy write reservation test; D8-INV-10 proof. |
| Important — encapsulated profile cited a Section 16.3 property it does not grant | 9.1 (encapsulated restriction) , Plan J | Citation corrected; the artifact-only profile proof must independently build and adversarially verify network-egress and out-of-directory-write restriction rather than cite parent text. | Plan J adversarial profile tests: attempted egress and out-of-directory writes fail from inside the profiled runtime. |
| Important — numeric budget subset semantics undefined | 9.1 (per-field subset rule), Plan I | Explicit less-than-or-equal comparison per budget field; tools set inclusion; routeClass equality. | Plan I grant-exceeding-request fixtures exercising each numeric budget field individually. |
| Important — TaskDefinition did not bind the composed fragment set | 9.1 (`PromptSetBinding`), Plan I | Complete ordered exact-version prompt-set binding covered by `taskDigest`; admission and PromptComposer reject missing, extra, reordered, or drifted fragments. | Plan I missing/drifted prompt-set rejection fixtures; digest change on any fragment change. |
| Important — composed-prompt digest had no defined byte encoding | 8.2.1 (item 4), 9.1 (taskDigest), Plan I | Normative preimage encoding: domain-separation prefix, fixed field order, length-prefixed UTF-8, 8-byte big-endian integers, no optional fields; applied to every D8 digest preimage. | Plan I published test vectors reproduced byte-identically by independent implementations. |
| Important — `maxActiveSeconds` could be exceeded by an in-flight dispatch | 10.5, 14.2 (D8-INV-04), Plan J | Broker and local-effect permit deadlines bounded by remaining active budget with authenticated-executor cancellation and post-deadline effect refusal; accounting interval bounded by the minimum admissible budget; terminal outcomes defined for pre- and post-consumption deadline expiry. | Plan J broker and local in-flight deadline-cancellation exit-gate tests; D8-INV-04 proof includes both permit classes. |

Design-lens note: the revision-2 review's Claude DESIGN lens failed to
complete, so that cycle's design-quality coverage was incomplete; the
revision-3 review recorded the same gap (its FEASIBILITY and DESIGN lenses
stalled), so the revision-4 review must include that coverage or record the
gap explicitly.

### 19.2 Third-cycle reconciliation (revision 4)

Findings from the two-engine review of revision 3
(`2026-08-27-prism-harness-d8-revision-3-hardening.md`, target blobs
`fcdb2a7efb0753f3ce6c093c9b9f3b0869ef1f72` and
`43bf0c5fcd6f45fe6bc51ac87c613fe6c837d9fd`), in report order:

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical — destination policy checked a declared target, not the actual write footprint | 9.1 (complete-footprint and confined-capability rules), 14.2 (D8-INV-10), Plans I and J | Every final write path independently declared and checked; unenumerable-write operations inadmissible unless executed in a confined filesystem capability rooted at the policy root; containment-preserving no-follow primitives mandatory. | Plan I traversal/rename/symlink/multi-file rejection fixtures; Plan J hostile-archive and confined-capability tests; D8-INV-10 proof. |
| Important — write check was checked-then-used (TOCTOU) | 9.1 (check-bound-to-write rule), 14.2 (D8-INV-10) | Resolved canonical target bound atomically to the write via captured directory handle or no-follow open with post-open identity verification; no scheduling gap. | Plan J mid-flight symlink-swap exit-gate test. |
| Important — no read-side policy confinement | 9.1 (`ReadPolicy`, reads-confined rule), 6 (vocabulary), 14.2 (D8-INV-11), Plans I and J | Read policies mirror destination policies: admission rejects unconfined read grants; D4 re-checks canonical sources; executors use confined primitives. | Plan I read-grant rejection fixtures; Plan J out-of-policy read reservation test; D8-INV-11 proof. |
| Important — work-program subsystem traced to no stated D8 goal | Preface, 1.1, 3, 4, 5, 6, 7.2–7.3, 11, 12.2–12.3, 13.2, 14.2, 15, 17.5, 17.8 | Owner decision 2026-08-27: subsystem split into the deferred decision area (`2026-08-27-prism-harness-work-program-selection-design-spec.md`); D8 closes on Plans I and J; operator review absorbed into Plan J. | The deferred area requires its own hardening and ratification; D8 ratification menu no longer bundles it. |
| Important — selection could name a non-competitor and be reused | Split-out area Sections 2.3 and 3 | Membership proved atomically inside the selection CAS against the frozen competitor set; one-use apply binding consumed atomically at first outward-permit issuance. | Deferred area's Plan K exit-gate tests (non-member confirmation refused; second apply fails); unverified until that area's own hardening cycle. |
| Important — boundary amendment allowed ratifying revision 3 against a revision-2 review | Boundary amendment Section 5 (item 5) | Exact-current-blob rule: ratification requires a clean report whose recorded target digest equals the exact bytes submitted; any byte change invalidates the report. | Baseline digest verification at ratification time. |
| Important — active-time deadlines covered only the broker | 10.5 (in-flight enforcement bullet), Plan J | Deadline propagation to every effect executor; enforceable cancellation and post-deadline write refusal; execution classes that cannot enforce it are inadmissible for active-time-bounded effects; late results recorded but never positive evidence. | Plan J local-tool deadline-cancellation and late-result tests. |
| Important — TaskPayload undefined and unbound | 8.3 (canonical payload definition), 6 (vocabulary), 13.1 (evidence version) | Bounded immutable UTF-8 bytes; domain-separated length-prefixed digest persisted in the admitted-run snapshot; drifted bytes fail composition. | Plan I cross-implementation and response-loss payload fixtures. |

### 19.3 Fourth-cycle reconciliation (revision 5)

Findings from the two-engine review of revision 4
(`2026-08-27-prism-harness-d8-revision-4-hardening.md`, target blobs
`dd49d643b6e41009ff41808c343f2809152c4eb9` and
`d72ca716ff9a3cee895aa0b737fb676248ea0a1c`), in report order:

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical — write-side policy omitted the credential-store exclusion | 9.1 (destination-capability paragraph), 14.2 (D8-INV-10) | Credential stores excluded on the write side with wording matching the read side: admission rejects credential-resolving policy roots; D4 refuses write targets inside a credential store. | Plan I credential-root rejection fixture; Plan J credential-target write refusal test; D8-INV-10 proof. |
| Critical — protected-class taxonomy diverged from the boundary amendment | 9.1 (taxonomy reference), 11.2 (generated protected-class view), boundary Section 3.2 | The boundary defines one ordered `protected-effect-family-v1` source; Plan I materializes it as an owner-pinned machine-readable artifact; D8 9.1 references it and D8 11.2 is generated verbatim. | Baseline consistency check rejects source/generated-view drift across the registry artifact, D8 11.2, and boundary 3.2. |
| Important — `evidenceExpectations` traced to no rule | 6 (vocabulary), 9.1 (`TaskDefinition`) | Field and vocabulary mention removed as speculative generality; evidence content is fully determined by the parent Section 15.6/15.7 families plus the D8 evidence versions in 13.1. | Grep: no `evidenceExpectations` occurrence remains outside this reconciliation row. |
| Important — read check verified the root, not the descendant target | 9.1 (reads-confined bullet), 14.2 (D8-INV-11) | D4 re-checks the actual canonical descendant source target against the full protected/credential taxonomy in addition to root membership. | Plan J ancestor-root/protected-descendant read refusal test; D8-INV-11 proof. |
| Important — footprint covered only final writes | 9.1 (complete-footprint bullet), 14.2 (D8-INV-10) | Footprint redefined as every filesystem mutation (temp files, parent creation, renames, deletes, metadata, links, final writes); each declared-and-checked or confined; undeclared out-of-capability mutation fails the effect. | Plan J protected-intermediate-write test. |
| Important — approval-wait suspension had no durable state or restart rule | 10.5 (suspension substate bullet), 13.1, Plan J | Transactional reservation-bound suspension substate with accumulator checkpoint, decision/expiry exit writes, and epoch rehydration; wait time never charged. | Plan J pending-approval-across-restart, denial, and expiry tests. |
| Important — local tool permits had no conforming claimant | 10.2 (local-effect permit paragraph), 13.1 | Versioned `LocalEffectPermit` claimable only by the admission-bound restricted execution principal, atomic one-use consumption, same deadline semantics; broker dispatch permits remain broker-only; cross-use fails. | Plan J wrong-principal and cross-use conformance tests. |
| Important — boundary required all of Plan L to follow Plan K | Boundary amendment Section 5 (item 4) | Milestone-specific rule matching D8's graph: L1 after Plan J; L2 after the deferred area's Plan K. | Baseline consistency check across D8 Section 3 and boundary Section 5. |
| Important — Section 19 certified split-out controls as closed D8 controls | 19 (rows for prior Critical 1, Important 5, Important 6; closing statement) | Split-out rows explicitly marked deferred and unverified by D8; closure assigned solely to the deferred area's own hardening and Plan K; closing statement no longer claims nothing is deferred. | Baseline open/closed-findings table lists the deferred rows as open in the work-program area. |

### 19.4 Fifth-cycle reconciliation (revision 6)

Findings from the independent Codex review of revision 5, whose report verified
the D8 target blob `a2c0101a2b6ea81657bb583c4ea0d7d3240d058e` and boundary
amendment blob `f86dccac8b4477855b9b2f649f7df0c95f8548e9`, in report order:

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical — pre-existing hard links bypass read/write confinement | 9.1 (`FilesystemCapabilityBinding`, alias-isolation and by-value transfer rules), 13.1, D8-INV-10/11, Plans I/J | A whole per-run filesystem or mount identity, not a directory path, is the security boundary; inside and outside inodes cannot alias; arbitrary shared host directories are inadmissible; imports/exports cross by value; private-root descriptor-relative execution remains defense in depth. | Plan I rejects shared-directory, hard-link, bind-mount, mount-crossing, and protected/credential import profiles; Plan J proves pre-existing and racing hard-link attempts cannot cross either production adapter's boundary. |
| Important — universal digest grammar could not encode authority structures | 8.2.1–8.2.2, 8.3, 9.1, 12.3, Plan I | One generated `pnh-canonical-value-v1` codec with closed typed schemas, explicit null/union/list encoding, exact field order, deterministic set ordering, schema hashes, and no permissive decoder. | Two independent implementations reproduce vectors for every schema, field, null state, union arm, list shape, ordering failure, and one-field mutation. |
| Important — approval-wait rehydration contradicted restart charging | 10.5, 13.1, Plan J | Persisted closed accounting state distinguishes `active-accruing`, `approval-suspended`, and `non-accruing`; only an open active interval receives the conservative restart surcharge; suspended and non-accruing states restore the exact checkpoint. | Plan J tests all three epoch-loss states near the budget boundary plus missing/inconsistent-state refusal. |
| Important — local-effect deadlines absent from invariant and exit gate | 10.5, D8-INV-04, Plan J | Broker `DispatchPermit` and `LocalEffectPermit` share bounded deadline semantics; each authenticated executor cancels and refuses every post-deadline effect and late positive evidence. | Plan J cancels an in-flight broker call and local write, attempts a post-deadline mutation, and verifies late results cannot satisfy evidence. |
| Important — operator channel had no versioned wire contract | 12.3, 13.2, Plan J | `pnh-operator-decisions-v1` has its own PNH-PROTO entry, schema source/hash, independent clock, closed message set, canonical typed content, conformance suite, and no legacy fallback. | Plan J rejects unversioned approval, unknown version/field, wrong schema hash, stale epoch/challenge, challenge replay, and canonical-digest drift. |
| Important — ratification freshness bound only D8 | Boundary amendment Sections 2, 4, and 5 | Every hardening report and owner ratification binds one exact `(D8 blob, boundary-amendment blob)` pair; either byte stream changing invalidates the report. Current self-identity is never embedded recursively in the amendment. | Ratification tooling hashes both files, compares both with the clean report and external owner record, and refuses either mismatch. |
| Minor — split-out ownership retained stale labels | Preface, 1.1, 3; boundary Sections 1, 3.3, and 4 | D8 consistently owns two plans, I and J; Plan K and its selection/apply records are named as split-out-area records. | Scope grep and dependency-graph consistency check. |
| Minor — protected-class wording was not byte-identical | 9.1, 11.2, boundary Section 3.2 | One canonical ordered `protected-effect-family-v1` source generates D8 11.2 and the boundary view; D8 9.1 references the source instead of duplicating it. | Baseline fixture compares both generated views with the owner-pinned machine-readable source. |
| Minor — retired invariant row violated the closed-kind declaration | 14.2 | D8-INV-06 is historical prose outside the active invariant table; every table row has exactly one parent-closed enforcement kind. | Successor-baseline importer validates the complete table before registration. |

Revision 6 remains unratifiable until a fresh hardening report over the exact
revision-6 D8 and boundary-amendment blobs returns no Critical or Important
finding. This reconciliation records adopted controls; it does not certify
their adequacy.

### 19.5 Sixth-cycle reconciliation (revision 7)

Findings from the independent Codex review of revision 6, whose report verified
the D8 target blob `21c9b7038bfec37235b69eae046ec5e97e2a88a6` and boundary
amendment blob `5383a55d5057c1b1db9bd2cf269125f7e9600e53`, in report order:

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical — export application bypassed capability and protected-destination confinement | 9.1, 11.2, 13.1, D8-INV-10, Plans I/J, boundary Section 3.2 | D8 has no destination application surface. The trusted one-writer settlement adapter may emit only destination-free content-addressed immutable bytes or a typed patch to the generic artifact store. No D8 task, tool, adapter, grant, approval, permit, or receipt can apply that artifact externally; application belongs to a separately ratified consumer writer. | Plan I schema/admission check finds no export-policy or destination-apply type; Plan J static writer-exclusivity and runtime tests reject every D8 artifact-application attempt, including protected and credential targets. |
| Important — canonical codec left nested schema choices to Plan I | 8.2.2, 9.1, 12.3, Plan I | Primitive aliases, all record orders, every enum/union variant number and payload, literals, set ordering, and all six digest schemas are closed in revision 7. Plan I generates code from those decisions; it does not choose them. | Two independent codecs reproduce vectors for every nested type and reject alternate field order, enum number, alias tag, duplicate, unknown, or non-canonical encoding. |
| Important — task identity omitted authority-bearing profile and policy versions | 8.2.2, 9.1, 13.1, Plan I | `TaskDefinition` and `TaskDefinitionDigestV1` bind `compositionAlgorithmVersion`, exact execution-profile id/digest, filesystem-profile id/digest, and import-policy id/digest; the admitted snapshot persists the same versions. D8 has no export policy. | One-field mutation vectors change `taskDigest`; admission rejects missing, mismatched, or drifted algorithm/profile/import-policy versions. |
| Important — operator-decision replay was contradictory and acknowledgement loss unrecoverable | 12.3, 13.2, D8-INV-07, Plan J | One settlement CAS consumes the challenge, commits one immutable decision, exits suspension, appends evidence, and stores the canonical request digest. Exact same-epoch replay returns the original acknowledgement; any conflict writes nothing; permit issuance follows commit. | Lost-ack retry, concurrent approve/deny, cross-principal/domain, stale-epoch, mismatched-digest, and conflicting challenge-reuse tests. |
| Important — approval expiry had no restart-safe time model | 10.5, 12.1, 12.3, Plan J | Approval authority is daemon-epoch-scoped, matching the parent prohibition on interpreting monotonic deadlines across epochs. The durable suspension history rehydrates after epoch change, but the pending decision window expires and the effect settles `rejected`; active wait remains uncharged. | Same-epoch deadline, exact boundary, wall-clock rollback, daemon restart, and leadership-change tests prove an old challenge or approval cannot authorize a permit. |

The hardening workflow's two-cycle cap prohibited a third review in that cycle.
A later SOL hardening wave reviewed the exact revision-7 pair; Section 19.6
records its retained findings and the first adopted control. The rows above
record fixes, not certification.

### 19.6 Seventh-cycle SOL reconciliation (revision 8, amendments applied; re-hardening pending)

Five independent `gpt-5.6-sol` reviewers and two independent SOL verifier nodes
reviewed the exact D8 revision-7 blob
`35c2f0daa91e1f8f33b339f9c67f36bc9259ae17` and boundary-amendment blob
`deacff7969cd6c5089870822f0a2de9dd9364cb1`. Reconciliation retained seven
Critical and ten Important findings. Revision 8 amends each retained root
cause separately so every control and verification obligation remains
auditable. These rows record amendments, not independent certification.

| Finding | Amended sections | Control adopted | Verification obligation |
|---|---|---|---|
| Critical 1 — effect-family admission trusted a declared label without binding the actual outward destination | 8.2.2, 9.1, 10.3, 11.1–11.2, 12.1, 13.1, D8-INV-10, Plans I/J, verification criterion 17.2–17.5; boundary Sections 2–5 | Every non-filesystem outward operation is owner-admitted by exact tool version, operation descriptor, effect taxonomy, destination catalog and opaque capability, trusted resolver, adapter version/configuration, and principal. D4 resolves the concrete destination before reservation and carries the same `ResolvedOutwardDestinationV1` through approval, permit consumption, dispatch, and authenticated receipt. A declared effect family is never destination authority; raw endpoints, generic cross-class writers, redirects, aliases, indirection, imported writers, unknown targets, and unclassifiable targets fail closed unless the admitted resolver proves the same capability identity. | Plan I generates and validates the operation, taxonomy, destination, resolver, and adapter registries; rejects incomplete, unknown, generic cross-class, protected, and one-field-drift bindings; and proves every authority field changes `taskDigest`. Plan J exercises generic HTTP/KV writers, mislabeled families, protected capabilities, alternate tenants/stores, raw endpoints, redirects, adapter aliases, DNS/service indirection, imported writers, configuration or principal drift, and mismatched receipts; no permit is issued before exact resolution, and post-consumption destination uncertainty settles `ambiguous`. |
| Critical 2 — the generic artifact store had no authority-bound or physically isolated sink | 6, 8.2.2, 9.1, 11.1–11.2, 13.1–13.2, D8-INV-10/12, Plans I/J, verification criteria 17.2–17.5; boundary Sections 2–5 | Artifact emission now binds one daemon-derived `ArtifactStoreBindingV1` per owner domain, including store instance, schema, executable adapter, writer and reader principals/protocol, dedicated local physical backing/root identities, and isolation profile. Host custody proves at startup and admission that the whole-filesystem or volume identity is disjoint from task capabilities, protected and credential roots, consumer-writer roots, synchronized/replicated backing, and other-owner stores. Only settlement may atomically `putByDigest`; consumers receive digest-verified bytes by value through a separate read principal and never receive a path or backing authority. | Plan I closes the binding, isolation-evidence, reference, emission, profile, and root-catalog schemas and rejects every task/caller-selected or incomplete binding. Plan J runs both production store adapters against protected-root, credential-root, task-capability, consumer-writer, cross-owner, ordinary-directory, hard-link, bind-mount, network, FUSE, synchronized, replicated, topology-drift, wrong-principal, wrong-binding, content-mismatch, response-loss, and direct-root-access attacks. Every case fails closed, while an identical digest replay returns the same opaque owner-scoped reference. |
| Critical 3 — `DaemonEpoch` had no canonical primitive representation | 6, 8.2.2, 12.3, 13.1–13.2, D8-INV-07, Plans I/J, verification criteria 17.1/17.6; boundary Sections 2/4 | `DaemonEpochV1` is exactly primitive tag `0x04` followed by one 8-byte big-endian unsigned integer in the inclusive range `1..18446744073709551615`. Zero is reserved; alternate tags or shapes, lossy runtime numbers, truncation, overflow, reuse, and wraparound reject. Both decision digest schemas and every D8 snapshot, protocol, command, decision, evidence, and replay epoch field use this type. The maximum value is valid for the current daemon, but a replacement cannot increment it and therefore keeps admission and operator writes closed. | Plan I publishes independent-codec vectors for rejected zero, accepted one and maximum, every alternate primitive tag/shape, truncation, over-width, and overflow; both codecs produce identical `DecideRequestDigestV1` and `DecisionRecordDigestV1` bytes. Plan J proves acknowledgement-loss replay at one and maximum reproduces the original request digest, rejects every non-canonical epoch before digest comparison, and prevents leadership wrap or reuse at exhaustion. |
| Critical 4 — canonical keyed collections permitted duplicate authority keys | 8.2.2, 9.1, 10.2, 13.1, D8-INV-10/11/13, Plans I/J, verification criteria 17.1–17.3; boundary Sections 2/4 | Keyed authority catalogs remain list-encoded but now have an exhaustive generated schema table declaring one semantic key and order rule per collection. Unordered keyed lists sort by canonical key bytes; ordered keyed lists preserve semantic order; both reject equal key bytes before encoding or hashing even when payloads differ. D1 constructs lookup maps only after validation. Filesystem policy references resolve one full `FilesystemCapabilityBindingV1`; reservations, permits, executor requests, receipts, and artifact sources carry its `FilesystemCapabilityBindingDigestV1` and `ProvisionedFilesystemCapabilityV1` instance rather than resolving an id alone. | Plan I feeds identical-key/different-payload and identical-key/identical-payload vectors through every keyed collection, both codecs, and first-wins/last-wins fixture decoders; all reject before `taskDigest`. Wrong key order and missing generated key rules also reject. Plan J mutates capability id, full binding digest, and provisioned instance independently across reservation, permit, executor, receipt, and artifact emission; no ambiguous lookup reaches access, and post-consumption uncertainty settles `ambiguous`. |
| Critical 5 — decision CAS could commit approval after the approval window expired | 6, 8.2.2, 10.5, 12.1/12.3, 13.1–13.2, D8-INV-07, Plans I/J, verification criteria 17.4/17.6; boundary Sections 2/4 | One `ApprovalGateStateV1` owns the canonical epoch-local deadline and reservation state version. Challenge issuance samples the trusted clock, expires a due pending gate instead of issuing, and caps every challenge deadline at the gate deadline. Approval, denial, expiry, suspension exit, evidence, and permit precondition share one reservation-version CAS. The settlement writer persists one decision linearization sample; a first decision commits only when that sample is strictly before both deadlines, while equality or later performs `rejected-expired` exactly once. Permit issuance requires the winning `approved-awaiting-permit` state and matching decision digest, not approval-row existence. | Plan J pauses expiry across deadline `T`, issues a pre-`T` challenge whose ordinary bound exceeds `T`, and races approval, denial, expiry, and permit issuance before, exactly at, and after `T` against both settlement adapters. Only a pre-`T` first decision commits; every due pending path expires once; no losing CAS or orphan row issues a permit. A shorter challenge can be replaced without extending `T`, and exact replay of a committed pre-`T` decision returns its acknowledgement after `T` without mutation. |
| Critical 6 — approval-content collection ordering had two incompatible canonical rules | 8.2.2, 12.3, D8-INV-14, Plan I, verification criterion 17.1; boundary Sections 2/4 | Every collection nested in the selected `ApprovalSubjectV1`/`MutationScopeV1` arm has one explicit shape. Semantic sets remain ordinary list-encoded values but use only ascending unsigned lexicographic order of each element's complete `pnh-canonical-value-v1` bytes; provisioned capability bindings use one declared capability-id key. Equal members/keys and alternate wire order reject before authority use. The generated opaque set brand excludes raw arrays, and the prior field comparator is removed. | Plan I publishes cross-codec vectors with variable-length capability ids and paths (`cap-b`/`cap-aa`, `z`/`aa`, minimum-valid/longer, multibyte UTF-8), mutation names whose lexical order differs from enum order, reversed wire order, duplicate entries, and duplicate provisioned-capability keys. Both encoders emit one byte order; both decoders reject every alternate order and duplicate before any approval-content, challenge, or decision digest. D8-INV-14 closes by static structure. |
| Critical 7 — durable loop replay lacked a version-bound content journal and action checkpoint | 6, 7.2, 8.2.2, 9.1, 10.1–10.3, 13.1–13.2, D8-INV-15, Plans I/J, migration Section 16, verification criteria 17.1–17.4; boundary Sections 2/4 | `TaskDefinitionDigestV1` and the admitted snapshot bind the exact conversation serializer and parser executable dependency closures, action grammar, tool-descriptor schema, and deterministic `pnh-operation-id-v1` derivation. Host custody also binds a private owner-domain `LoopContentStoreBindingV1`; raw model/tool observations, action parameters, and runtime feedback are immutable content-addressed objects outside settlement and evidence rows. A receipt cannot commit without a readable exact reference. One turn-journal CAS commits receipt/reference, parse result, stable action identities, conversation state, and next state before derived reservations, and each journaled action gets one idempotent outcome checkpoint before another turn. Restart uses those exact bytes/bindings/checkpoints or fails before new authority; a committed journal is never reparsed. | Plan I publishes independent-codec vectors for every replay/store/content/action/conversation/journal/checkpoint digest and `opv1_` id, including one-field drift, ordinal gaps, impossible variants, and alternate keys. Plan J injects crashes after broker response before content put, after content put and receipt, around turn-journal commit, every action reservation, and every action checkpoint against both settlement adapters and in-memory/durable content adapters. Parser V1's malformed rejection cannot become V2 authority; exact restart reproduces conversation, actions, ids, budgets, effects, and next state, while missing/drifted serializer/parser bindings fail before reservation. Wrong-owner/principal/store/reference/retention access, live deletion, raw-byte records, duplicate effects, and legacy backfill/reparse all fail. D8-INV-15 closes. |

| Important 1 — task identity did not pin authorized tool and effect-classification versions | 8.2.2, 9.1, 10.2, 13.1, D8-INV-03, Plans I/J, verification criteria 17.1–17.3; boundary Sections 2/4 | `GrantedToolBindingV1` replaces id-only tool grants and binds plugin/version, manifest, operation set, effect-family descriptor, every allowed operation/descriptor/classification/taxonomy, and applicable destination capabilities. `TaskDefinitionDigestV1` also binds the tool-registry, effect-classification registry, and protected-destination taxonomy schemas. The same binding digest persists through snapshot, reservation, approval, permit, and receipt. | Plan I mutates each version, operation membership, family mapping, taxonomy, destination binding, and registry schema independently; id-only, added-operation, drifted, and mismatched forms reject or change task identity. Plan J rejects any lifecycle-stage binding mismatch before execution or marks post-consumption uncertainty ambiguous. |
| Important 2 — `pnh-compose-v1` did not bind non-system message roles | 8.2.1–8.2.2, 13.1–13.2, D8-INV-16, Plans I/J, verification criterion 17.1; boundary Sections 2/4 | The canonical sequence has four closed roles: `system`, `pre-task-context`, `task-payload`, and `post-task-context`. Role and bytes enter `ComposedPromptDigestV1`; empty placement and payload rules are exact. Provider translation is an exact admitted broker binding and cannot change sequence semantics. | Plan I publishes all-role, empty-placement, empty-payload, Unicode, delimiter, unknown-role, and one-role-mutation vectors. Both codecs agree; both provider adapters preserve the same canonical pre-translation sequence and digest. |
| Important 3 — epoch-loss recovery omitted approved and pre-consumption permit phases | 10.5, 12.3, 13.1, D8-INV-04/07, Plan J, verification criteria 17.4/17.6; boundary Sections 2/4 | One provider/tool recovery matrix covers pending approval, approved/no permit, issued/unconsumed, consumed/no receipt, receipt committed, and terminal. Proven pre-consumption phases reject; consumed/no-receipt is ambiguous; a committed receipt settles once; terminal is immutable. One recovery CAS preserves the existing slot charge, closes accounting, and appends evidence exactly once. | Plan J injects crashes at reservation, approval, issue, consume, start, receipt, terminal, and both sides of recovery CAS for provider and tool permits. Replay yields one state, one charge, no permit reuse or redispatch, and byte-identical recovery evidence. |
| Important 4 — decision acknowledgement replay could not satisfy both wire and idempotency semantics | 8.2.2, 12.3, 13.2, D8-INV-07, Plan J, verification criterion 17.6; boundary Sections 2/4 | `DecisionAckV1` is immutable authority containing only decision-record and request digests. First versus replay delivery moves to `DecisionDeliveryEnvelopeV1`, which is excluded from every authority digest, gate, settlement row, and evidence checkpoint. | Plan J drops the first response and exercises serial/concurrent retries. Ack bytes remain identical; only non-authority delivery status differs; no retry mutates settlement. |
| Important 5 — challenge and decision digests omitted operator role and daemon-issued decision id | 8.2.2, 12.1/12.3, 13.1–13.2, D8-INV-07, Plans I/J, verification criterion 17.6; boundary Sections 2/4 | `DecisionChallengeRecordV1` binds reservation, daemon-issued decision id, content digest, operator principal and role, owner domain, authorization-policy version, epoch, and deadlines. Request/decision digests and the full-record CAS bind the same role, policy, and id; current policy is revalidated. | Cross-role replay, role revocation, policy drift, caller id substitution, id reuse across reservations, and challenge reuse across ids conflict before challenge consumption or decision write. Read-only cross-epoch result lookup cannot revive authority. |
| Important 6 — the local-effect permit lacked response-loss and restart semantics | 8.2.2, 10.2, 10.5, 13.1–13.2, D8-INV-04, Plan J, verification criteria 17.3–17.4; boundary Sections 2/4 | The local arm of `ToolEffectPermitV1` has one permit identity per reservation, canonical stable claim digest, same-principal identical replay, complete issue/consume CAS fields, bound deadline/receipt shape, and explicit pre/post-consumption recovery. | Plan J loses responses and kills workers before/after issue and consume, duplicates delivery to two workers, and mutates epoch, principal, digest, expiry, lease, or generation. Exactly one execution occurs; proven pre-consume expiry rejects and consumed/no-receipt is ambiguous. |
| Important 7 — accounting labels lacked lease transitions and idempotent restart charging | 8.2.2, 10.5, 13.1, D8-INV-04, Plan J, verification criterion 17.4; boundary Sections 2/4 | `AccountingRecordV1` persists accumulator, closed state, state epoch, lease/generation, epoch checkpoint, unique open interval, last closed interval, and settlement version. The closed transition table atomically closes intervals on expiry/release/suspension/terminal/reassignment; epoch recovery debits a lost interval at most once before a new lease can open. | Plan J exercises every state across lease expiry/release/reassignment, epoch and clock changes, plus crashes before/after close, recovery debit, and lease open. Active time charges once, approval/lease-free time charges zero, and terminal never resumes. |
| Important 8 — late-result evidence had no legal post-terminal commit path | 8.2.2, 10.5, 13.1–13.2, D8-INV-17, Plan J, verification criterion 17.4; boundary Sections 2/4 | `SupplementalObservationJournalV1` is a separate append-only sequence/hash chain keyed by reservation, receipt digest, and frozen terminal checkpoint. Post-terminal append is idempotent and cannot change terminal/effect outcome, main evidence, accounting, budget, or positive evidence. | Plan J races provider and tool receipts before/after terminal, then duplicates, conflicts, and crashes each append. Terminal bytes stay fixed, each late receipt appears at most once in the proper chain, and no late completion occurs. |
| Important 9 — outward tool operations had no conforming permit claimant | 8.2.2, 9.1, 10.2/10.5, 13.1–13.2, D8-INV-10, Plan J, verification criteria 17.3–17.5; boundary Sections 2/4 | The outward arm of `ToolEffectPermitV1` is claimable only by the exact principal in `ResolvedOutwardDestinationV1` and binds destination, adapter, selector, tool capability, deadline, and receipt shape. Provider `DispatchPermit` remains broker-only; local and outward arms cannot cross. | Plan J covers correct/wrong principal and scope, concurrent workers, claim-response loss, crash, stale epoch, deadline, adapter/destination drift, missing receipt, and receipt mismatch. Exactly one outward dispatch occurs; uncertainty after consumption is ambiguous. |
| Important 10 — approval authority omitted role and could not represent every valid gated effect | 8.2.2, 12.1/12.3, 13.1–13.2, D8-INV-14, Plans I/J, verification criteria 17.1/17.6; boundary Sections 2/4 | Owner-pinned `approval-subject-registry-v1` maps every gateable class to one closed model-dispatch, tool-operation, or verification-operation arm. Tool mutation scope is exact enumerated footprint or exact provisioned-capability confinement envelope, never wildcard. Role and policy bindings follow Important 5 through challenge/request/decision/CAS/evidence. | Plan I round-trips every arm and rejects unsupported classes, archive/shell wildcard forms, missing provisioned bindings, empty-vs-envelope substitution, unknown arms, duplicate keys, and order drift. Plan J rejects role revocation/policy drift and proves each gated family displays and enforces the exact subject. |

All seven Critical and ten Important findings are amended in revision 8. This
is not a certification claim: the exact D8 and boundary bytes must be rehashed
as a pair, then a fresh independent hardening report must return no Critical or
Important finding before owner ratification.
