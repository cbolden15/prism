# D8 governed-adaptation boundary amendment

Status: **draft for owner review**. The owner authorized drafting on
2026-08-27. This record does not ratify D8 or D9 and authorizes no
implementation.

Decision owners: D8 goal execution and D9 governed adaptation.

---

## 1. Purpose

This amendment defines the only permitted seam between D8 goal execution and
D9 cross-run adaptation. D8 may produce evidence and candidate artifacts. It
may not promote those artifacts into durable learned state, change an active
run, or write any adaptation destination.

This amendment is boundary-only: it defines the seam and does not itself
resolve or weaken any finding in
`2026-08-26-prism-harness-goal-execution-design-spec.hardening.md`. Those
findings are reconciled by D8 revisions 2 through 8 (Section 19 of the
amended D8 draft, which also reconciles the revision-2 and revision-3 reviews
`2026-08-27-prism-harness-d8-revision-2-hardening.md` and
`2026-08-27-prism-harness-d8-revision-3-hardening.md`; the work-program
subsystem was split out by owner decision on 2026-08-27). D8 remains blocked
from ratification until a hardening cycle over the current bytes completes
with no Critical or Important finding. Revision 8 amends all seven Critical and
ten Important findings retained by the seventh-cycle SOL review. Those
amendments have not received the next hardening pass and are not certified.

---

## 2. Content-digest record

| Record | `git hash-object` digest |
|---|---|
| Original D8 draft (hardening review target) | `76af82745f97bdb8c57a1af8c3ad6e40f7e45bd1` |
| Boundary-amended D8 draft (revision 1) | `0b832517a6a6d79561f52400c1444c40c0a96c8f` |
| Reconciled D8 draft (revision 2) | `3baf8e520d516a1888da58d27c329c565b80c964` |
| Reconciled D8 draft (revision 3) | `fcdb2a7efb0753f3ce6c093c9b9f3b0869ef1f72` |
| Reconciled D8 draft (revision 4 — work-program subsystem split out by owner decision 2026-08-27) | `dd49d643b6e41009ff41808c343f2809152c4eb9` |
| Reconciled D8 draft (revision 5 — revision-4 review findings closed) | `a2c0101a2b6ea81657bb583c4ea0d7d3240d058e` |
| Boundary amendment reviewed with D8 revision 5 | `f86dccac8b4477855b9b2f649f7df0c95f8548e9` |
| Reconciled D8 draft (revision 6 — revision-5 review controls adopted) | `21c9b7038bfec37235b69eae046ec5e97e2a88a6` |
| Boundary amendment reviewed with D8 revision 6 | `5383a55d5057c1b1db9bd2cf269125f7e9600e53` |
| Reconciled D8 draft (revision 7 — revision-6 review controls adopted) | `35c2f0daa91e1f8f33b339f9c67f36bc9259ae17` |
| Boundary amendment reviewed with D8 revision 7 | `deacff7969cd6c5089870822f0a2de9dd9364cb1` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1 control adopted) | `7295fead0e56f62314ddb9e4911bc50188d38622` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1–2 controls adopted) | `94a8d47d9ad38b9cc8fe452b83e275fb53978fae` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1–3 controls adopted) | `68a7f8a0b8a3f1fdecfaf2bca2717ad7560acd80` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1–4 controls adopted) | `0e99ca95f916e3afd487ab9621ccd97e2f694942` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1–5 controls adopted) | `fa8d59dd671abc8ac8b78f3a7dbc23beb2ec4fce` |
| Reconciled D8 draft (revision 8 checkpoint — seventh-cycle Critical 1–6 controls adopted) | `a2d51f213d475310449aa9a8d846f0c216609bb2` |
| Reconciled D8 draft (revision 8, current — all seventh-cycle Critical 1–7 and Important 1–10 controls adopted; re-hardening pending) | `d7e65343f1d893688ae5740b9c2ffde5430708ac` |
| Split-out work-program design (deferred decision area) | `2cc99bd2fe4a925e3f33c88f1b261b7fdf51028c` |
| D9 draft referenced by this amendment | `9adc942fc629bfb04a30163c4348c01f1a692d5a` |
| Prior locked durable-learning decision | `9c006ac40d19d503df6d8cb036ae4d484277bd0b` |
| Existing D8 hardening review | `ffd5c820c6461a109164ba30658fc7d7a34df955` |

The digests were computed with `git hash-object` from the exact working-tree
files. The D8 draft was untracked before amendment, and the pre-amendment bytes
were not written into Git's object database. The prior digests identify those
byte states but do not make them independently recoverable from Git. The
current D8, boundary-amendment, and D9 bytes remain present as the working-tree
files named above.

The amendment cannot embed its own current blob digest without changing that
digest. Current identity is therefore pair-bound externally: every hardening
report and owner ratification record must contain the exact
`(D8 git-hash-object digest, boundary-amendment git-hash-object digest)` it
reviewed or ratified. The table records prior identities and the current D8
dependency; it is not a substitute for that external pair pin.

The hardening review's line-number citations target the original D8 digest.
Revision 2 reconciles every surviving finding and records the mapping in its
own Section 19. Reconciliation review must use the finding text and that
mapping, not assume that the review's line numbers point at current lines.

---

## 3. Binding boundary decisions

### 3.1 D8 output is evidence, not durable learning

D8 may settle terminal evidence, content-addressed artifacts, evaluation
results, and model-authored recommendations. Every one remains untrusted input
to D9. No D8 result is self-applying.

### 3.2 D8 authority stops before adaptation destinations

No D8 task definition, grant, approval gate, selection record, judge result,
apply task, effect reservation, permit, or receipt can authorize a write to:

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
`protected-destination-class-v1` design source. Plan I materializes it as one
owner-pinned machine-readable
registry artifact and generates every prose view and admission fixture from
that artifact. D8 Section 9.1 references this source rather than maintaining a
second hand-written list; D8 Section 11.2 reproduces this list verbatim.

These are D9 protected destination classes. They are absent from D8's grantable
`outward-destination-catalog-v1`; the exclusion is structural, not a declared
effect-family denylist. Every non-provider outward operation admitted under
`outward-operation-catalog-v1` binds the exact
`GrantedToolBindingV1` digest, tool version, manifest and operation-set
digests, operation descriptor, effect classification/taxonomy, trusted
destination resolver and schema, closed
destination-capability set, adapter version and configuration, and execution
principal. Task identity also pins the tool-registry, effect-classification
registry, and protected-destination taxonomy schemas. D4 resolves the actual
destination before reservation and carries the same
`ResolvedOutwardDestinationV1` through approval, the outward arm of
`ToolEffectPermitV1`, exact-principal claim and one-use consumption, adapter
execution, and authenticated receipt. Provider `DispatchPermit` remains
broker-only, and local/outward tool scopes cannot cross. A declared effect family is
never destination evidence. Raw endpoints, generic cross-class writers,
redirects, aliases, DNS or service indirection, aggregate targets, imported
writers, unknown destinations, and unclassifiable destinations fail closed
unless the admitted resolver proves the same opaque capability identity.

The operation, outward-destination-capability, filesystem-capability, and
policy catalogs are canonical keyed lists with schema-declared semantic keys.
Duplicate key bytes reject before hashing or admission even when their payloads
describe different authority. D1 and D4 accept only the validated opaque
catalog brand, so first-wins or last-wins lookup behavior cannot choose between
an allowed and protected entry. Filesystem effects additionally carry the full
selected binding digest and provisioned instance through execution.

Every filesystem grant still uses a whole alias-isolated per-run filesystem or
mount capability. Protected, credential, hard-link, bind-mount, and mutable
shared-inode imports remain prohibited.

Artifact emission does not escape destination enforcement by calling its sink
"generic." Host custody derives and measures one `ArtifactStoreBindingV1` per
owner domain before admission opens. The binding pins the exact store instance,
schema, executable adapter, writer and reader principals/protocol, dedicated
local backing/root identities, and isolation profile. Startup and per-run
admission prove that its whole-filesystem or volume identity is physically
disjoint from every task capability, protected or credential root,
consumer-writer root, synchronized or replicated backing, and other owner's
store. Ordinary directories, aliases, hard links, bind mounts, network or FUSE
mounts, caller-selected roots, and identity drift fail closed without fallback.

Only the one-writer settlement module may atomically `putByDigest` into that
bound store. It returns an opaque owner-domain-scoped `ArtifactReferenceV1`;
the separate `pnh-artifact-read-v1` principal can return digest-verified bytes
by value but receives no path or write handle. Task principals and consumer
writers cannot access the backing root. D8 defines no destination-application
policy, adapter, grant, or effect; any consumer application requires a
separately ratified consumer writer (D8-INV-10/11/12). No approval or
split-out-area selection record overrides these checks.

### 3.3 Selection is not D9 promotion

The selection contract now lives in the split-out work-program decision area
(`2026-08-27-prism-harness-work-program-selection-design-spec.md`): every
selection is an operator-ratified, round-bound immutable record written only
through the authenticated operator channel, and judge output is untrusted
recommendation evidence. Wherever that area is ratified, its selection
records authorize only the exact admitted apply effect. Neither a D8 approval
record nor any split-out-area record can serve as D9 owner approval or
satisfy D9's promotion resolver.

A judge recommendation, improved metric, operator-ratified split-out-area
selection, or successful split-out-area apply receipt is evidence. It is never
durable-adaptation authority.

### 3.4 Promotion is separate and future-facing

D9 promotion requires quarantined immutable bytes, deterministic scan
evidence, a bound evaluation bundle, independent recommendation, one-time
owner approval, a pure trusted resolver decision, and a destination receipt.

Promotion creates a new version eligible only for future consumer submissions.
Every active run and active work program keeps the exact versions admitted at
its start.

### 3.5 Executable candidates re-enter ordinary governance

D9 may promote an executable candidate only as non-executable source awaiting
ordinary review. It does not become runnable until the applicable D1
admission, D6 proof, and D7 release gates close. D9 cannot mint an exception to
the executable software supply chain.

### 3.6 The public kernel remains learning-neutral

D9 contracts, destination identities, candidate stores, approval records,
promotion resolvers, and destination writers remain consumer-side. Public
`pnh/` gains no learning proposal, canonical memory, or promotion module.

---

## 4. Exact D8 sections carrying the boundary

In D8 revision 8 (`d7e65343f1d893688ae5740b9c2ffde5430708ac`), the D8-to-D9
boundary lives in these sections:

| D8 section | Content |
|---|---|
| Status preface | Links the separate D9 design, this amendment, and the split-out work-program area. |
| Section 1.1 (item 5) | D8 produces generic evidence and candidate artifacts only; consumer-side D9 tooling packages them. |
| Section 2 | Includes this amendment in D8 precedence. |
| Section 3 | Sequences D9 Plan L after Plan J (L2 also after the deferred area's Plan K) without making either a D8 plan. |
| Sections 4 and 5 | Allows quarantined candidate output and forbids durable learning/promotion. |
| Section 7.4 | States that selection is not adaptation authority. |
| Section 9.1 | Rejects duplicate semantic authority keys; binds exact versioned tool/operation/effect/destination grants and registry/taxonomy schemas; and binds every runtime filesystem lookup to one full binding digest and provisioned instance. |
| Section 11.2 | Defines protected destination classes, exact operation/capability/resolver binding, reservation-to-receipt destination identity, authority-bound physically isolated artifact emission, future-run-only behavior, and the D9 handoff. |
| Section 12.2 | Separates D8 operator decisions from D9 promotion approval. |
| Section 13.1 | Persists the exact artifact-store binding, isolation evidence, binding-scoped emission record, complete tool grants, scoped tool permits, recovery matrix, and accounting/supplemental-observation records in the D4 extension. |
| Section 13.2 | Separates the internal store writer from the owner-scoped by-value reader; exposes only exact-principal tool-permit claim/consume; keeps the operator channel as the sole decision writer; and keeps the split-out area's `SelectionState` insufficient for D9 promotion. |
| Section 15 | Gives Plans I/J explicit artifact-store schemas, isolation profiles, production adapters, adversarial gates, and D8-INV-12; keeps Plan L consumer-side and Plan K deferred. |
| Sections 16 and 17 | Routes future improvements through D9 and adds a boundary verification criterion (17.9). |

No Plan A execution record, constitutional registry, lock, implementation plan,
code, test, package, destination, or runtime configuration is changed by this
amendment.

---

## 5. Ratification requirements

The owner may ratify this boundary only together with or after reviewing the D9
design. Ratification means:

1. D8 may produce D9 inputs but never promote them.
2. D8 artifact emission is destination-free; applying an emitted artifact is
   available only to a separately ratified consumer-side writer. Its own store
   is the exact daemon-measured, owner-domain-scoped, physically disjoint local
   binding carried by the admitted snapshot and emission record; only
   settlement may put by digest, and consumers receive verified bytes through
   a separate non-writer principal without path or backing access. Every other
   D8 outward effect is bound to an admitted non-protected destination
   capability whose exact resolved identity survives reservation, permit,
   adapter execution, and authenticated receipt; a declared effect family,
   approval, raw endpoint, redirect, alias, or duplicate catalog key cannot
   widen it.
3. D9 remains outside public `pnh/`.
4. Promotion affects future versions only.
5. Plan L's Milestone L1 follows Plan J; every work-program-dependent Plan L
   milestone (L2) additionally follows the deferred work-program area's
   Plan K. This milestone-specific rule matches D8's dependency graph
   exactly.
6. D8 ratification requires a hardening report with no Critical or Important
   finding that records the exact D8 draft digest and exact boundary-amendment
   digest as one reviewed pair. The owner ratification record pins the same
   pair externally. Any byte change to either file after review invalidates
   that review for ratification purposes; matching only the D8 digest is
   insufficient.

Recorded owner decision:

- **Status:** pending
- **Date:** -
- **Owner:** Vora Technologies, LLC
- **Decision:** -

Ratification authorizes updating the design baseline and drafting Plan L after
D9 ratification. It does not authorize implementation, destination writes,
durable capture, autonomous experiments, promotion, rollback, deployment,
push, publication, or public claims.
