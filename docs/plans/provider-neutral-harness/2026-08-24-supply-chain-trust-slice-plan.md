# Supply-chain trust slice — owner-pinned plugin digests + capability disclosure (implementation plan)

Status: **draft — five hardening cycles run and their fix sets applied (see
History); the cycle-5 fixes have not yet been re-verified by a confirming
pass.** Do not execute until the owner either accepts the applied fixes or a
confirming cycle returns clean.
Date: 2026-08-24
Branch: `pnh2/supply-chain-trust-slice` (created from `pnh-v2` at `5526819`)

Authorization: `pnh/README.md`'s "Plugin runtime trust model" section stakes the
subprocess executor's entire security story on supply-chain trust — "signed and
pinned manifest digests, and install-time disclosure of what capabilities a
plugin is requesting" — and states "Neither of these exists as a human-facing UX
yet" (`pnh/README.md:56-60`). The subprocess-executor decision doc's "Still
open" section carries a standing recommendation for the disclosure half
("advisory log first") and defers the CLI surface
(`docs/plans/provider-neutral-harness/2026-08-22-subprocess-executor-decisions.md`,
"Still open"). This slice turns the stated direction into shipped library
mechanism — minus signing, and minus any operator-facing installer/CLI UX,
both of which stay deferred.

> **For agentic workers:** execute task-by-task in TDD order. Steps use
> checkbox (`- [ ]`) syntax for tracking. Every task ends with the real suite
> green and a commit.

## History

- 2026-08-24: drafted; grounded on `pnh2/supply-chain-trust-slice` at `5526819`.
- 2026-08-24: hardening cycle 1 (claude SECURITY/FEASIBILITY/SCOPE; Codex
  blocked by OpenAI cyber-content moderation, so single-engine) returned
  fix-first: 3 Important, 2 Minor, 0 Critical. All five applied: pin
  provenance is now the committed file only (`admitPinnedRegistryBytes` takes
  `pnhRoot` and loads the record itself; the structural validator went
  module-private, which also closes the getter-reentrancy minor), the pin id
  rule now matches the registry's digit-permissive `SLUG_RE`, the
  strict-ascending-order validation was dropped to a uniqueness check with
  sorting demoted to a formatting convention, and the README citation was
  corrected to `:56-60`.
- 2026-08-24: hardening cycle 2 (all three Claude lenses plus Codex, which
  was unblocked this cycle) returned **rethink**: 2 Critical, 4 Important.
  The Criticals: pinned admission compared pins against digest fields
  *claimed* in the registry bytes without verifying their derivation, and
  the spawn path never re-verifies `sourceDigest` at launch (helper-file
  TOCTOU). All six findings applied: admission now recomputes
  `manifestDigest`/`versionDigest` from the descriptor's own canonical
  fields and `sourceDigest` from the trusted plugin tree (D7); the spawn
  launch-time file-coverage gap is scoped out of D1's claim, named as a
  Risk, and made a precondition on Phase 6 wiring; the fault-cell zero-edit
  path was corrected to `pnh/harness/plugin-fault-cell.mjs`; disclosure was
  relabeled to broker-requested capabilities with an explicit
  ambient-authority caveat; `pinned-admission.test.ts` is registered as
  PNH-INV-29 conformance (D6 — lock-neutral maintenance); and Task 3's test
  was fixed for the strict typecheck. Cycle-2 report is in git history
  alongside cycle 1's (`0c9419e`).
- 2026-08-24: hardening cycle 3 (all three Claude lenses on opus —
  SECURITY, FEASIBILITY, SCOPE — plus Codex) returned **rethink**: 2
  Critical, 5 Important, 4 Minor. The Criticals, both from Codex: the
  verified launch root was never linked to the admission root (pinned
  admission verified digests over `pluginsRoot` while the spawn launch path
  still accepted an unrelated caller-supplied `pluginRoot`, so a caller
  could admit one tree and launch another), and pinned admission's ticket
  was indistinguishable from a raw `admitRegistryBytes` ticket, so any
  consumer of an owner-approved ticket could be handed a self-hashed one
  instead. The owner resolved the three design forks the cycle opened:
  (a) admission snapshots each pinned plugin tree into a
  content-addressed read-only location and the ticket carries the
  `pluginId → snapshot-root` binding, with launch resolving its root from
  the ticket rather than from a caller argument (D8) — *superseded by cycle
  5, which dropped snapshots entirely; see that entry below*; (b) `versionDigest`
  stays unpinned but is anchored by recomputation from trusted sources
  rather than accepted as self-certifying — the three executor commitments
  are recomputed from the snapshot and the pnh tree and `versionDigest` is
  refolded from them (D7, amended, spawn-executor only); (c) pinned
  admission issues a distinct branded `OwnerApprovedAdmissionTicket` that
  the disclosure surface and the pinned launch entry point require (D3,
  amended). The five Importants and four Minors were applied as written:
  the descriptor is now bound to the on-disk `manifest.json` inside the
  snapshot, `loadPluginPinRecord` rejects duplicate JSON members,
  `sourceDigest`'s exact-directory-listing precondition is documented and
  tested, the committed-pin-file emptiness assertion was dropped, and the
  four Minors (Task 3 fixture cleanup, Task 1's `Produces` accuracy, D2's
  single-value `environment` field, Task 4's unfalsifiable step) were
  corrected. Cycle-3 report is in git history alongside cycles 1 and 2.
- 2026-08-24: hardening cycle 4 (all three Claude lenses on opus —
  SECURITY, FEASIBILITY, SCOPE — plus Codex) returned **rethink**: 3
  Critical, 4 Important, 0 Minor. The first Critical is the uncomfortable
  kind: a cycle-3 edit contradicted the decision it was meant to implement.
  D8 specified a per-admission `mkdtemp` parent containing one directory per
  plugin id, and Task 2 was written to name each snapshot directory by
  `sourceDigest` alone under a shared root — which collides for two plugins
  with byte-identical declared files (exactly what Task 2's own fixture
  builds, so the positive test could never have passed), refuses a second
  admission of the same set, and lets anyone who can pre-create one
  predictable directory deny admission permanently. Five passages disagreed
  about the layout, not the four the report cited; all five now state D8's
  layout, and three regression tests cover the collision, the repeat
  admission, and the symlink case below. The other two Criticals are both
  coverage gaps rather than bugs: the admitted tree is verified when a launch
  spec is built but the supervisor spawns later (TOCTOU), and
  `kernel/plugin-runner/entrypoint.mjs` — which spawn-path plugins import to
  get their protocol loop — sat outside every pinned and recomputed digest.
  The first is **narrowed** by an additive pre-spawn re-check the pinned
  caller must invoke
  immediately before `spawnChild`, with the "bytes we hashed are the bytes
  we run" claim downgraded everywhere it appeared; closing it outright means
  editing `plugin-spawn-supervisor.mjs`, which is zero-edit, so the residue
  is Deferred. The second is **fixed**: the one-path fix lives inside
  `plugin-spawn-launch-spec.ts`, which Task 5 Step 2 required to show zero
  changed lines, so it was escalated rather than resolved silently — and the
  owner granted a third named zero-edit exception for it. `runnerDigest`'s
  input set now includes the runner entrypoint (D7, cycle-4 amendment), Task
  2 covers it with a test and lands the edit in its Step 3, and Task 5 Step 2
  checks that file for a bounded diff instead of no diff. What survives is
  narrower and is the Deferred entry now: the digest binds bytes at a path
  under `pnhRoot` at admission time, not the module the child resolves at run
  time. The four Importants were applied as written: cleanup no longer
  chmods through symlinks, the `pnhRoot` trust-anchor residual now names
  both legs it feeds, `renderPluginDisclosureLines` takes the branded ticket
  instead of a forgeable record array (D4, amended), and the duplicate-JSON
  scan is shared with the manifest seam.
- 2026-08-24: hardening cycle 5 (gpt:SECURITY / gpt:FEASIBILITY / gpt:SCOPE on
  `gpt-5.6-sol` via Codex, plus claude:independent on opus) returned **rethink**
  — 2 Critical, 7 Important, 1 Minor. The findings concentrated in the snapshot
  machinery for the second cycle running: the pre-spawn re-check could be
  pointed at a different tree than the frozen spec it guards (the mutable
  `pluginSnapshotRoots` map), the snapshot API had no per-admission cleanup
  handle, unproven bytes were copied and read before the pin was proved, and a
  successful uid/gid drop could not traverse a `mkdtemp` root. Rather than
  patch four defects in one mechanism, **the owner pivoted: snapshots are
  dropped entirely and the guarantee moves to launch-side re-derivation**
  (D8, amended). The owner also decided that disclosure accepts any genuine
  `AdmissionTicket` and carries owner approval as an explicit provenance field
  (D4, amended), which resolves the SCOPE finding that requiring the brand
  blocked every plugin set that exists today. The remaining findings were
  applied as written: Task 2 now regenerates the constitution before its suite
  run (the conformance-list edit would otherwise fail the drift gate), the
  readiness plan gained a blocking prerequisite note so Phase 4 cannot author a
  now-false trust boundary unnoticed, and disclosure's trusted-origin
  requirement is stated in prose with the stdout-spoofing scenario in Risks and
  structured emission Deferred. The Minor (duplicate-member policy fork) stays
  conceded in Risks. Cycle-5 report is the current
  `2026-08-24-supply-chain-trust-slice-plan.md.hardening.md`.

## Goal

Give admission a real trust anchor and an honesty surface:

1. **Owner-pinned plugin digests.** A committed, git-reviewed pin record
   (`pnh/contracts/plugin-pins.json`) naming exactly which plugins — by
   executor-neutral content identity (`manifestDigest` + `sourceDigest`) — are
   approved for production admission, and a pinned-admission function that
   refuses any registry whose admitted set differs from the pinned set in any
   direction **and verifies the pinned identity is derived, not merely
   claimed**. Concretely, admission verifies every digest against the plugin's
   real tree under the `pluginsRoot` it was given: `manifestDigest` is
   recomputed from that tree's own `manifest.json` and required to match both
   the descriptor's canonical fields and the pin; `sourceDigest` is recomputed
   over the same tree; and
   `versionDigest` is refolded from the *pinned* `manifestDigest`/`sourceDigest`
   plus the three executor commitments **recomputed from trusted inputs**
   rather than read out of the registry (D7, amended). Admission returns a
   distinct owner-approved ticket brand (D3, amended), and the pinned spawn
   launch entry point **re-derives the manifest and source digests from
   whatever root its caller names** and refuses unless they match what was
   admitted (D8, amended) — so which tree the caller names stops mattering,
   because only bytes identical to the admitted ones can launch.
   Precisely scoped: the anchor binds plugin *content* (manifest + listed
   source files) at admission time, and the commitment recomputation holds
   for the **spawn executor only** — a Docker deployment's `imageDigest` names
   a built image and is not recomputable from a source tree, so its
   provenance stays deferred and is not covered by this anchor (named in
   Deferred and in Risks).
2. **Capability disclosure.** A pure, deterministic disclosure surface over a
   *genuine* admission ticket of either kind — structured records plus rendered
   advisory lines stating each admitted plugin's identity digests, requested
   capabilities, and **whether an owner approved it** — explicitly advisory,
   enforcing nothing (enforcement already lives in the grant layer). It accepts
   both `AdmissionTicket` and `OwnerApprovedAdmissionTicket` and carries the
   distinction as an `ownerApproved` provenance field rather than a gate
   (D4, amended), so the advisory surface can ship before any owner has pinned
   a set — while a forged object still cannot render anything, because both
   brands are checked.

After this slice, PNH-INV-29's "owner-approved" leg has a mechanism instead of
being a caller convention, and the README's supply-chain paragraph describes
code that exists.

## Grounding (verified 2026-08-24 on `pnh2/supply-chain-trust-slice` at `5526819`)

Every claim below was read off disk in the worktree during planning, not taken
from any index or prior doc.

### The admission digest check is integrity-only — every caller self-derives the expected digest

`admitRegistryBytes(bytes, expectedRegistryDigest)` compares
`sha256(bytes)` against the caller-supplied expected digest
(`pnh/runtime/admission-ticket.ts:80-88`). That is an integrity binding, not an
authorization: every caller in the tree derives the expected digest from the
same bytes it is admitting, so the check can only ever fail on transport
corruption or a deliberately wrong test input, never on an unapproved plugin.
Confirmed callers, all self-deriving:

- `pnh/tests/admission-ticket.test.ts:53` (`digest(bytes)`), and the
  deliberate-mismatch negative case at `:129`
- `pnh/tests/tool-launch-spec.test.ts:31,50` (`generated.registryDigest`)
- `pnh/tests/register-plugins.test.ts:42` (inline `createHash` over the same bytes)
- `pnh/tests/plugin-spawn-launch-spec.test.ts:131` (`generated.registryDigest`)
- `pnh/host-tests/m2-plugin-registration.test.ts:85` (`generated.registryDigest`)
- `pnh/host-tests/spawn-lifecycle-port.test.ts:69` (`generated.registryDigest`)

No pin record, pin file, or owner-approval artifact exists anywhere in `pnh/`
(no file matches a pins/approval shape; confirmed by search across
`pnh/**/*.{ts,mjs,json}`).

### The spawn launch spec re-derives commitments but inherits the descriptor's provenance

`createAdmittedPluginSpawnLaunchSpec` re-derives `runnerDigest`,
`imageDigest` (spawn artifact digest), and `profileDigest` from disk and
refuses launch when any differs from the admitted descriptor
(`pnh/runtime/plugin-spawn-launch-spec.ts:298-317`; the re-derive-all-three
design is stated at `:64-68`). This proves the descriptor matches the disk —
self-consistency — but the descriptor itself came from a registry admitted
under a self-derived digest, so nothing in the chain establishes that an owner
approved the plugin. This is exactly the boundary the readiness plan's Phase 4
describes as "self-consistency digest check only, no external verification, no
sandboxing"
(`docs/plans/provider-neutral-harness/2026-08-22-open-source-readiness-plan.md`,
Phase 4).

### `requestedCapabilities` is declared, validated, and enforced — but disclosed nowhere

The registry descriptor carries `requestedCapabilities`
(`pnh/registry/schema.ts:51`) validated against the capability catalog at
`pnh/registry/schema.ts:256`; the kernel maps it into grant construction
(`pnh/kernel/plugin-kernel.ts:151,193,234`). Enforcement exists at the grant
layer. But no code path anywhere formats, logs, or otherwise surfaces the
requested capabilities to an operator — every fixture manifest carries
`"requestedCapabilities": []`
(`pnh/host-tests/fixtures/registration-plugins/*/manifest.json`), and no
consumer renders the field. Disclosure is a missing honesty surface, not a
missing enforcement layer.

### The digest lattice already computes an executor-neutral plugin-content identity

`generatePluginRegistry` computes, per plugin:
`manifestDigest = sha256(["pnh-plugin-manifest-v2", manifest])` over the
normalized (parsed) manifest — which includes `requestedCapabilities` — at
`pnh/scripts/generate-plugin-registry.ts:346`; `sourceDigest` over the
plugin's listed files (`:283`); and `versionDigest` folding in
`manifestDigest`, `sourceDigest`, **and** the executor commitments
(`runnerDigest`, `imageDigest`, `profileDigest`) at `:347-354`. Consequence:
`manifestDigest + sourceDigest` is a stable, executor-neutral identity of the
plugin's reviewed content; `versionDigest` churns whenever harness sources
change and is therefore the wrong pin unit (see D1).

Note the trap: the spawn artifact digest
(`computeSpawnArtifactDigest`, `pnh/runtime/plugin-spawn-launch-spec.ts:128-152`)
hashes the manifest's **raw bytes**, while `manifestDigest` hashes the
**normalized parsed manifest**. Two different values both colloquially called
"the manifest digest" exist. Pins and disclosure in this slice use the
registry's `manifestDigest`/`sourceDigest` pair exclusively.

### Descriptor digest fields are format-validated only — nothing verifies their derivation

Registry validation checks each descriptor's six digest fields against a
64-hex regex and nothing more (`pnh/registry/schema.ts:261-289` validates
format, not derivation). The only place those values are actually derived
from content is registry *generation*
(`pnh/scripts/generate-plugin-registry.ts:346-354` for
`manifestDigest`/`versionDigest`, `:283-311` for `sourceDigest`), and
admission never repeats the derivations. Consequence: a hand-crafted,
schema-valid registry can claim any digest values it likes — including
copying a pinned plugin's `manifestDigest`/`sourceDigest` onto a descriptor
whose actual fields or on-disk files differ. A pin check that compares
claimed values therefore binds nothing by itself; pinned admission must
recompute the derivations it relies on (D7). The generator's canonical
manifest form is reconstructable: `normalizeManifest` emits a fixed literal
key order with sorted `files` (`generate-plugin-registry.ts:200-251`), and
`sourceDigest` is a self-contained helper (`:283-311`).

### The spawn launch re-check never covers non-entrypoint source files

`computeSpawnArtifactDigest` hashes only `manifest.json` and the single
entrypoint file (`pnh/runtime/plugin-spawn-launch-spec.ts:128-152`), and
`createAdmittedPluginSpawnLaunchSpec` compares only
`runnerDigest`/`imageDigest`/`profileDigest` (`:298-317`) — `sourceDigest`
appears nowhere in the launch-spec module. A plugin whose entrypoint imports
a sibling listed in `files` (e.g. `helper.mjs`) can have that sibling
replaced after admission without any launch-time check noticing. This slice
does not touch the launch path; the gap bounds what D1's pin can honestly
claim (admission-time binding) and is carried as a Risk with a Phase 6
precondition.

### PNH-INV-29 is `active`, but its "owner-approved" leg has no mechanism

`PNH-INV-29` ("Static owner-approved digest-bound plugin sets") is `status:
active` with conformance `pnh/tests/admission-ticket.test.ts`
(`pnh/contracts/invariants.yaml:378-390`). That conformance test proves
digest-binding of caller-hashed bytes and set staticness — it cannot prove
"owner-approved" because no owner-approval artifact exists to test against.
`PNH-INV-43` ("Hostile-plugin gate" — admitting a plugin that is not
owner-approved and digest-bound requires a stronger isolation class) is
`status: proposed` with no conformance (`pnh/contracts/invariants.yaml:559-571`).
This slice builds the mechanism those invariants assume; it authors **no**
invariant (Phase 4 of the readiness plan owns that — see Non-goals).

### No production composition root exists — admission happens only in tests

The broker gateway receives its plugin list pre-resolved over fd 3
(`parseGatewayStartupConfig(readFileSync(3, ...))`,
`pnh/harness/sandbox/broker-gateway.mjs:683-686`), and the parsed entries
carry only `pluginId`, `imageDigest`, `createArgs`
(`pnh/harness/sandbox/broker-gateway.mjs:428-456`) — no admission ticket and
no capability data cross that boundary. Therefore disclosure and pinning must
attach where the ticket exists: at admission time, in whatever composition
root calls `admitRegistryBytes`. Today the only callers are tests; there is no
CLI or installer (confirmed again: no `bin/`, no CLI dependency). The pinned
path ships as the blessed library entrypoint for the future composition root,
not as a wired operator surface — the same "selectable programmatically before
operator-facing" posture Decision 3 of the subprocess-executor decisions doc
already accepted for executor selection.

### Test and verification infrastructure this slice will use

- `pnh/tests/*.test.ts` are auto-discovered and run inside the network-none,
  read-only sandbox container
  (`pnh/harness/sandbox/container-entrypoint.mjs:106-108`); fixture writes go
  to `/tmp` (tmpfs) via `mkdtempSync` — the established pattern in
  `pnh/tests/plugin-spawn-launch-spec.test.ts:31-36,114-134`, whose
  `makePluginsRoot`/`ticketWith` helpers this slice's tests model on.
- The c8 100%-lines gate covers `pnh/core/**` only
  (`pnh/harness/sandbox/container-entrypoint.mjs:123-134`); new `runtime/`
  modules are not under that gate, so their tests must earn confidence on
  their own.
- Host-tests run outside the container via `tsx --test`
  (`pnh/harness/run-sandbox.mjs:113-125`).
- Baseline on this branch is green: `npm run test:pnh` (typecheck + module
  graph + sandbox run, core coverage 100%) and `npm run test:constitution`
  (35 pass, 0 fail) both pass on the fresh worktree at `5526819`.

### Prior decisions that bind this slice

- Capability disclosure: "advisory log first, because a blocking prompt
  requires a CLI surface … and an operator identity model this project
  doesn't have yet" — standing recommendation, adopted here as D4
  (`2026-08-22-subprocess-executor-decisions.md`, "Still open").
- CLI flag surface: deferred until `pnh/` grows a CLI for other reasons
  (same doc). This slice adds no CLI.
- Readiness plan Global Constraints forbid pulling extraction work forward
  (no `package.json`, no CLI banner); Phase 4 requires boundary wording that
  neither hedges nor overstates
  (`2026-08-22-open-source-readiness-plan.md`, Phase 4 and Global
  constraints). Task 4's copy edits are written under that bar.

## Design decisions to settle before execution

### D1: what the owner pins

- **(a) The registry digest.** One committed 64-hex value. Rejected: no
  committed registry artifact exists (registries are generated in memory from
  plugin directories), and registry bytes embed `runnerDigest`/`profileDigest`,
  so every harness source edit would churn the pin — churn that trains the
  owner to rubber-stamp.
- **(b) Per-plugin `versionDigest`.** Rejected for the same churn reason:
  `versionDigest` folds in executor commitments
  (`generate-plugin-registry.ts:347-354`).
- **(c) Per-plugin `imageDigest`.** Rejected: its meaning is
  executor-specific (container image digest on the Docker path, on-disk
  artifact digest on the spawn path), so one pin file would mean two
  different things.
- **(d) Per-plugin `manifestDigest` + `sourceDigest`. Chosen.** This is the
  executor-neutral identity of exactly what an owner reviews — the manifest
  (including its capability requests) and the source files it lists. Pins
  churn only when plugin content changes, which is precisely when re-approval
  is the point.

Semantics: **exact set equality**, both directions. A registry containing a
plugin with no pin entry is refused; a pin entry with no matching registry
plugin is refused. This matches PNH-INV-29's "static … fully resolved before a
task starts" — a pinned-but-absent plugin means the admitted set is not the
approved set.

**Amended (cycle 3; re-amended cycle 5) — scope of the guarantee.** The pin
binds plugin content **at admission time**: the descriptor's manifest fields
via a `manifestDigest` recomputed from the plugin tree's own `manifest.json`,
the listed source files via a `sourceDigest` recomputed over that same tree,
and the whole lattice via a `versionDigest` refolded from those pinned values
plus commitments recomputed from trusted inputs (D7, amended; D8). On the
spawn path this now extends *through* launch: the pinned launch entry point
re-derives both digests from the root it is handed and refuses on any
mismatch, so the executed tree is byte-identical to the verified one even
though the caller still names the path (D8, amended). It still does not bind the Docker image
artifact — `imageDigest` on that path names a built image that cannot be
recomputed from a source tree, so the Docker executor's commitment remains
unverified here (Deferred; Risks). "Exactly what an owner reviews" holds at
admission and, for the spawn executor, at launch; the Docker path's image
provenance is named, deferred work, not something this slice claims.

**Cycle 3 considered and rejected reopening this decision.** The
`versionDigest` self-certification finding (cycle 3, Important) could have
been answered by adding `versionDigest` to the pin, which is option (b)
above. That option was re-examined and re-rejected on the original churn
grounds: `versionDigest` folds in executor commitments, so pinning it makes
every harness source edit an owner-approval event, which trains the owner to
rubber-stamp — the precise failure the pin exists to prevent. The finding is
answered instead by *anchoring* `versionDigest` to recomputation from
trusted sources (D7, amended). Pins stay `{id, manifestDigest, sourceDigest}`.

### D2: pin record location and format

`pnh/contracts/plugin-pins.json`, sibling to `invariants.yaml` — it is an
owner-approval contract artifact, not runtime configuration. Versioned
(`"pnh-plugin-pins-v1"`), environment-scoped, exact-key
validated in the same spirit as `loadSpawnProfile`'s exact-key/exact-value
idiom (`plugin-spawn-launch-spec.ts:182-216`). Entry `id`s must be unique and
must match the registry's own id rule (`SLUG_RE` in
`generate-plugin-registry.ts:43`, digit-permissive) — a pin rule stricter
than the registry's would strand legally-admissible plugins from the pinned
path. Keeping the file sorted by `id` is a formatting convention for
reviewable diffs, **not** a validation rule: a legitimately owner-approved
set that arrives unsorted (e.g. after a git merge of two approval branches)
must still load, because the pin check is set equality and order carries no
security meaning.

On the `environment` field, honestly (cycle 3, Minor): `"production"` is its
only legal value today, so the field discriminates nothing at present — it
is a required, exact-valued literal that makes the record's scope explicit
on its face and matches admission's own environment gate
(`admission-ticket.ts:105`), where a non-`production` registry is refused.
Its purpose is to make a future non-production pin set a *schema change an
owner must make deliberately* rather than a silently-accepted default, not
to select between values that exist now. It is validated exactly like the
version literal, and the plan does not claim it does more than that.

The committed file ships with an **empty** `plugins` array: no production
plugin set exists today, and an empty pin set correctly refuses every
non-empty registry on the pinned path until an owner pins something.
Emptiness is the honest initial state, not a placeholder — but it is
deliberately **not** asserted by any test (cycle 3, Important), because the
first real owner approval must not have to edit a test to land. Tests assert
the committed file's *shape*; its contents are the owner's to change.

### D3: additive pinned-admission function, not a change to `admitRegistryBytes`

`admitRegistryBytes` keeps its exact signature and behavior; a new module
`pnh/runtime/pinned-admission.ts` exports `admitPinnedRegistryBytes(bytes,
pnhRoot, pluginsRoot)` that (1) loads and validates the
committed pin record itself via `loadPluginPinRecord(pnhRoot)` — the caller
cannot supply a pin object, (2) calls `admitRegistryBytes` with a
self-derived `sha256(bytes)` — the integrity binding it already provides —
(3) enforces D1's exact-set pin check against the issued ticket, and (4)
verifies, against the plugin's real tree under `pluginsRoot`, the derivation
of every digest it relied on, per D7. The structural validator is
**module-private** to `plugin-pins.ts`: the only way to obtain a
`PluginPinRecord` is `loadPluginPinRecord`, which reads
`<pnhRoot>/contracts/plugin-pins.json` off disk. Rationale: a
`pinRecord: unknown` parameter would let any caller pass an env-var-derived,
request-supplied, or plugin-authored pin object that trivially matches the
plugin's own digests — recreating, one layer up, the exact self-certifying
class this slice exists to close (hardening cycle 1, SECURITY). Tying pins
to the contract path also means pin data only ever originates from
`JSON.parse` of file bytes, so accessor-property (getter-reentrancy) inputs
are unreachable by construction. Tests exercise alternative pin sets by
writing a `contracts/plugin-pins.json` under a tmpdir root and passing that
root. Every existing `admitRegistryBytes` test caller keeps working
untouched.

**Amended (cycle 3) — the pinned path issues a distinct ticket brand.**
Cycle 3 found (Critical) that returning the *same* `AdmissionTicket` made
owner-approved and self-hashed admission indistinguishable at the type level
and at runtime: any consumer that meant to require owner approval could be
handed a raw `admitRegistryBytes` ticket and would accept it, because
`isAdmissionTicket` answers "was this issued by admission", not "was this
owner-approved". `admitRegistryBytes` stays exactly as it is
(integrity-only, unbranded, all existing callers unaffected).
`admitPinnedRegistryBytes` now returns a distinct
`OwnerApprovedAdmissionTicket` — a frozen wrapper carrying the underlying
`AdmissionTicket`, tracked in a
module-private `WeakSet` in `pinned-admission.ts` and checked by an exported
`isOwnerApprovedAdmissionTicket`, following `admission-ticket.ts`'s existing
`issuedTickets`/`isAdmissionTicket` pattern exactly. A wrapper rather than a
branded field is forced by two existing constraints and is not a workaround:
`issueTicket` freezes its ticket, so no property can be added to it
(`admission-ticket.ts:69-75`), and `admission-ticket.ts` is on the zero-edit
list (Global constraints), so the brand cannot live inside it. Unwrapping is
explicit — brand-requiring consumers read `.ticket` when they need
`resolveAdmittedPlugin` — so no code path can confuse the two. **Amended
(cycle 5):** the one brand-*requiring* consumer this slice adds is the pinned
spawn launch entry point (D8), which rejects an unbranded ticket with
`TypeError("unverified owner-approved admission ticket")`. The disclosure
surface (D4, amended cycle 5) is brand-*reading* rather than
brand-requiring: it accepts either ticket kind and reports which one it got,
because an advisory surface that refuses to describe an unpinned set
describes nothing at all today.

**Known cost, narrowed (cycle 3):** the previously-accepted cost was that
nothing distinguished a pinned ticket from a raw one, so nothing forced a
consumer through the pinned path. For **brand-requiring consumers that cost
is now closed**: a raw self-hashed registry's ticket is not owner-approved,
cannot be made owner-approved from outside the module, and is refused by
pinned launch — proven by a negative conformance test
registered under PNH-INV-29 (D6). It is not refused by disclosure, which
renders it with `ownerApproved=false` (D4, amended cycle 5); telling the
truth about provenance is that surface's job, and refusing to speak is not a
more honest answer than saying "no owner approved this". Residual cost, stated honestly: consumers
that legitimately accept the *unbranded* `AdmissionTicket` — every existing
caller, and the legacy `createAdmittedPluginSpawnLaunchSpec` — are unchanged
and still accept a self-hashed ticket, by design, because retrofitting them
is out of scope (Non-goals) and the unpinned path must keep working. A
hostile caller can also still point `pnhRoot` at a directory it controls:
provenance is anchored to the contract path relative to the root the
composition root chooses, which is the strongest anchor available without an
operator identity model (D5). Both residuals are bounded by the fact that no
production caller exists at all today (Grounding); the pinned function is
documented as the blessed production entrypoint, and the readiness plan's
Phase 6 composition root is the named future consumer.

**Amended (cycle 4) — the `pnhRoot` residual above understated itself: the
caller controls both legs, not one.** Cycle 4 found (Important) that the
paragraph discloses only the pin-file half. `pnhRoot` supplies *both* inputs
that a pinned admission checks against each other: the pin record at
`<pnhRoot>/contracts/plugin-pins.json`, which defines the approved set, and
the harness bytes the three executor commitments are recomputed from
(`kernel/plugin-runner/spawn-profile.json`,
`kernel/plugin-runner/entrypoint.mjs`, `sdk/protocol.ts`,
`harness/plugin-spawn-supervisor.mjs`). Neither `computeSpawnRunnerDigest`
nor the spawn artifact digest embeds an absolute path — both hash file
contents under fixed logical names, so a copy under a different root digests
identically (Grounding). A caller that supplies a prepared `pnhRoot`
therefore chooses the approved digests *and* the bytes those digests are
compared against, and the two agree by construction. Recomputation from
trusted sources (D7) is trust *relative to the chosen root*, not trust in the
repository. Every prose surface that states this guarantee — this residual,
the matching Risks entry, and Task 4's README paragraph — must name both legs
and must not assert an unqualified anchor. The real fix is a production
composition root that fixes `pnhRoot` to a known location rather than
accepting it as a parameter; that is recorded in Deferred, because this slice
ships no composition root at all.

### D4: disclosure is a pure describe + render pair; emission stays caller-side

`pnh/runtime/plugin-disclosure.ts` exports `describeAdmittedPluginSet(ticket)`
(structured records, sorted by plugin id, accepting either ticket brand — see
the cycle-5 amendment below) and
`renderPluginDisclosureLines(ticket)` (deterministic advisory strings whose
first line states "advisory" and "enforces nothing"; see the cycle-4
amendment below for why it takes the ticket and not the records). No module in `runtime/`
writes to any stream — emission is the composition root's job, and today's
only composition roots are tests. Adopts the decisions doc's "advisory log
first" recommendation; a blocking prompt is deferred with the CLI (Non-goals).
Disclosure records use the registry's `manifestDigest`/`sourceDigest` (the
pin identity), so the operator-visible identity and the pinned identity are
the same value.

**Amended (cycle 3) — disclosure requires the owner-approved brand.**
`describeAdmittedPluginSet` takes an `OwnerApprovedAdmissionTicket` (D3) and
gates on `isOwnerApprovedAdmissionTicket`, not `isAdmissionTicket`. The
reason is the surface's own honesty claim: a disclosure line says "this is
the plugin set an owner approved, and these are the capabilities it
requests". Accepting a raw `admitRegistryBytes` ticket would let a
self-hashed, unpinned registry render lines that read exactly like approved
ones, which is a worse failure than showing nothing — the surface exists to
tell an operator the truth about provenance. It reads descriptor fields
through `.ticket`, so the record contents are unchanged from the
pre-amendment design.

**Superseded in part (cycle 5) — see the cycle-5 amendment below. The brand is
still read; it is no longer a gate.**

**Amended (cycle 4) — the renderer takes the ticket too, not a record array.**
Cycle 3 branded the *describe* half and left `renderPluginDisclosureLines`
taking a plain `readonly PluginDisclosureRecord[]`, which reopened the same
hole one step downstream: a record array is an ordinary object literal, so any
caller could hand-build one and get byte-identical `plugin disclosure: …`
lines carrying arbitrary `manifest=`/`source=` digests, complete with the fixed
ambient-authority caveat that makes the output read as official. The brand has
to sit on the surface an operator actually reads. So
`renderPluginDisclosureLines(ticket: OwnerApprovedAdmissionTicket)` calls
`describeAdmittedPluginSet` itself and there is no way to render lines from
anything but a ticket the module minted.

Chosen over the alternative — branding the returned record array in a second
module-private `WeakSet` — because it is the smaller change and, more
importantly, it keeps **one** brand and **one** rejection string in the slice.
A second brand would mean a second thing to forge-test, a second predicate to
keep in sync, and a second message an operator has to learn. The cost is that
records can no longer be filtered or reordered between describe and render;
nothing in this slice does that, and a caller that wants it can render its own
strings, which will not carry the `plugin disclosure:` prefix.

**Amended (cycle 5) — the brand becomes a reported fact, not an entry gate.**
Cycle 3's gate had a consequence cycle 5 named (SCOPE, Important): the
committed pin file ships empty, so the pinned path refuses every plugin set
that exists today, and disclosure threw a `TypeError` on the only tickets any
caller can actually hold. There was no configuration in which disclosure
rendered anything — a surface that ships dead. That sits against the
decisions doc's recorded position that advisory logging "can ship
independently"
(`docs/plans/provider-neutral-harness/2026-08-22-subprocess-executor-decisions.md:126-130`).
So both functions now accept `AdmissionTicket | OwnerApprovedAdmissionTicket`:

- Each `PluginDisclosureRecord` gains a `readonly ownerApproved: boolean`, and
  each rendered line gains an `ownerApproved=true|false` token. The provenance
  claim moves from *who may call this* into *what the line says*, which is
  strictly more informative: a reader of an unpinned line now learns that no
  owner approved it, where before they saw nothing at all.
- Forgery is still impossible. `describeAdmittedPluginSet` checks
  `isOwnerApprovedAdmissionTicket` first and, failing that,
  `isAdmissionTicket`; an object that satisfies neither throws. So a genuine
  unbranded ticket renders (with `ownerApproved=false`), a plain object literal
  does not render at all. Cycle 4's reason for branding the *renderer* is
  untouched — it still takes a ticket, never a record array, so no caller can
  hand-build `manifest=`/`source=` values.
- The rejection string stays one string. `TypeError("unverified owner-approved
  admission ticket")` remains the pinned-launch rejection (D3); disclosure's
  own refusal of a non-ticket reuses `admission-ticket.ts`'s existing
  "unverified admission ticket" wording, so the slice still adds exactly one
  new message.

**Emission must be trusted-origin (cycle 5, SECURITY).** The brand governs who
may *produce* a disclosure line; it cannot govern who may *type one*. The
rendered form is plain text recognizable only by its `plugin disclosure: `
prefix, and the supervisor forwards child stdout raw
(`plugin-spawn-supervisor.mjs:442-470`), so an admitted plugin can print a
byte-identical line naming any digests it likes. In a shared operator log that
line is indistinguishable from the real one. This slice adds no machinery for
that — it is a composition-root concern and there is no composition root — but
the requirement is part of the contract and belongs on the surface's own
decision: **a caller emitting these lines must emit them on a channel plugins
cannot write to, and must label or segregate child stdout in any sink that
also carries them.** Task 3 states this in the module header and Task 4 states
it in the README. The spoofing scenario is in Risks; structured-event emission
at the composition root is Deferred.

### D5: signing is deferred; git review of the pin file is the approval channel

"Signed" (README) implies a key-management and operator-identity story that
does not exist and which this slice must not invent. The committed pin file
under repository review **is** the current owner-approval channel: changing a
pin requires a commit an owner reviews. Task 4 rewords the README so "signed"
reads as future work, distinct from the pinning that now exists.

### D6: `pinned-admission.test.ts` registers as PNH-INV-29 conformance

PNH-INV-29 is `active` with a conformance list that cannot prove its
owner-approved leg (Grounding). The new pinned-admission test is exactly the
missing conformance, so it is added to the invariant's `conformance` array
in `contracts/invariants.yaml` and calls `conformsTo("PNH-INV-29")` (the
established pattern: `pnh/tests/admission-ticket.test.ts:4,48`). This is
**maintenance of an existing active invariant, not authoring a new one** —
the Phase 4 boundary invariant remains out of scope. It is lock-neutral:
`bindingHash` covers only `statement` and `bounds`
(`pnh/contracts/registry.ts:239-244`), and `active->active` is a free
transition (`:267-270`), so the conformance-list edit changes no lock hash
and triggers no amendment. Without this, the constitution gate stays blind
to the new mechanism: `constitution-gate` executes only registered
conformance files, so a broken pin comparison would leave PNH-INV-29 green.

### D7: admission verifies derivations by reusing the generator's own code

Pin comparison against *claimed* digest fields binds nothing — a
hand-crafted registry can copy pinned values onto altered content
(Grounding). `admitPinnedRegistryBytes` therefore recomputes every digest it
relies on from a trusted source, never from the registry bytes. Per admitted
plugin, against that plugin's real tree at `<pluginsRoot>/<id>`:

0. **Pin membership and claimed-field agreement first, before any file byte
   is read** (ordering added cycle 5). D1's exact-set equality and the
   descriptor-vs-pin comparison of `manifestDigest`/`sourceDigest` are pure
   in-memory checks over already-parsed registry bytes. Running them first
   means an unpinned or mismatched plugin is refused without the process
   opening a single plugin file. See the residual below for what this does
   and does not bound.
1. **`manifestDigest` from the plugin tree's own `manifest.json`.** That
   `manifest.json` is read as a regular non-symlink file, decoded
   as strict UTF-8, `JSON.parse`d, and normalized through the generator's
   `normalizeManifest`; its `id` must equal the descriptor's `id`, its
   canonical digest must equal both the descriptor's `manifestDigest` and
   the pin's, and the normalized manifest must deep-equal the descriptor's
   own normalized manifest fields. This is what binds the descriptor to a
   file that exists rather than to itself.
2. **`sourceDigest` over the plugin tree**, via the generator's `sourceDigest`
   helper, required equal to both the descriptor's and the pin's.
3. **The three executor commitments recomputed from trusted inputs.** After
   the pin legs pass, `computeSpawnPluginArtifactCommitments({ pnhRoot,
   pluginRoot: <this plugin's root under `pluginsRoot`> })` — the existing
   exported helper in `plugin-spawn-launch-spec.ts` — recomputes
   `runnerDigest`/`imageDigest`/`profileDigest` from the pnh tree and the
   plugin tree, and each must equal the descriptor's. `runnerDigest`'s input
   set gains a fourth file in cycle 4; see the amendment below.
4. **`versionDigest` refolded** from the *pinned* `manifestDigest` and
   `sourceDigest` plus the three *recomputed* commitments, required equal to
   the descriptor's.

To keep one canonical implementation instead of a copy that must never
drift, `generate-plugin-registry.ts` gets **additive exports only** — the
existing `normalizeManifest` and `sourceDigest` helpers, the
`NormalizedManifest` type, and a small
`computeManifestDigest`/`computeVersionDigest` extraction of the expressions
at `:346-354`, with zero behavior change (the Global-constraints zero-edit
rule is relaxed to exactly this). The signature is
`admitPinnedRegistryBytes(bytes, pnhRoot, pluginsRoot)`;
failure codes `manifest-digest-derivation`, `version-digest-derivation`,
`source-digest-derivation`, `manifest-file` (the plugin tree's `manifest.json`
is missing, unreadable, not a regular file, invalid, or disagrees with the
descriptor), and `commitment-mismatch` (a recomputed executor commitment
differs from the descriptor's), kept distinct from the derivation codes so a
tampered commitment is not reported as a digest-arithmetic failure.

**Residual, stated plainly (cycle 5).** Step 0's ordering bounds *which*
files get read, not *how many bytes*. Once a plugin is pinned and its claimed
fields agree, steps 1 and 2 must read the pinned files whole to hash them —
`sourceDigest` has no other way to work, and the generator's own read path is
a whole-file `readFileSync` (`generate-plugin-registry.ts:297-306`). There is
no per-file or per-admission byte budget anywhere in this path. A pin file
naming a plugin whose declared `index.mjs` is multi-gigabyte will read it
into memory before the digest mismatch is found. This slice does not add a
budget: doing it properly means streaming hashes through the generator's
shared helpers, which is a change to `generate-plugin-registry.ts` beyond the
additive-exports exception. It is named in Risks and left for the phase
permitted to touch that file.

**Amended (cycle 3) — recomputation from *trusted sources*, not from
claims.** As drafted, this decision recomputed `versionDigest` from the
descriptor's own claimed `runnerDigest`/`imageDigest`/`profileDigest`. Cycle
3 found (Important) that this only proves the descriptor's six digest fields
are arithmetically consistent with each other — a forger who edits a
commitment and recomputes a coherent `versionDigest` passes every check,
because the inputs came from the artifact being verified. Recomputation is
only binding when its inputs are trusted, so step 3 above now derives the
commitments independently and step 4 folds those, not the claims. Two
consequences stated plainly:

- **This holds for the spawn executor only.** `computeSpawnPluginArtifactCommitments`
  derives `imageDigest` as the spawn *artifact* digest over `manifest.json`
  and the entrypoint file. On the Docker path `imageDigest` names a built
  container image, which no function can recompute from a source tree; a
  Docker deployment's commitment therefore stays unverified and stays in
  Deferred and Risks. The pinned path is documented as spawn-executor
  scoped, and no wording anywhere in this plan may claim otherwise.
- **Recomputation-from-claims is no longer described as binding anywhere.**
  The Goal, D1's scope paragraph, and the Docker Risks entry were corrected
  in the same cycle; "recomputed" in this plan now always means "recomputed
  from a trusted source", and where that is not possible the gap is named.

**Amended (cycle 4) — `runnerDigest` covers the plugin runner too.** Cycle 4
found (Critical) that `computeSpawnRunnerDigest` hashes `sdk/protocol.ts` and
`harness/plugin-spawn-supervisor.mjs` and stops there, while
`kernel/plugin-runner/entrypoint.mjs` — the module a spawn-path plugin imports
to get `runPluginLoop` — sits outside every pinned and recomputed value.
Replacing that file changes the code that drives every such plugin while
admission, the launch-time `sourceDigest` re-derivation, and the commitment
recomputation all still pass. The owner granted a third named zero-edit
exception for the fix (Global Constraints). The permitted change, exactly:

- Add one entry to the `sources` array in `computeSpawnRunnerDigest`
  (`pnh/runtime/plugin-spawn-launch-spec.ts:227-234`):
  `["entrypoint.mjs", resolve(pnhRoot, "kernel", "plugin-runner", "entrypoint.mjs")]`.
  The logical name is `"entrypoint.mjs"` and is not negotiable: the container
  path's `computeRunnerDigest` (`plugin-launch-spec.ts:118-128`) already
  digests the same file under that exact name, and the point of this
  amendment is that the two paths stop disagreeing about it.
- Correct the two doc comments that currently justify the absence — the
  module header's `runnerDigest` bullet (`:58-62`) and
  `computeSpawnRunnerDigest`'s own comment (`:219-222`). Both say the
  container path's `Containerfile`, `image.lock.json`, and `entrypoint.mjs`
  "have no spawn equivalent". That is true of the first two and false of the
  third, and it is the sentence that made the omission look deliberate. Leave
  the `.d.mts` exclusion note as written — it already gives the right rule
  ("carries types only and is erased before anything runs"), which is also why
  `entrypoint.d.mts` stays out of the input set.
- Nothing else. `SPAWN_RUNNER_DIGEST_VERSION` stays `"pnh-spawn-plugin-runner-v1"`:
  no registry with a computed `runnerDigest` is committed anywhere in the
  repo, every registry is generated, and the version tag exists to
  disambiguate digest *schemes* across artifacts that outlive a change, not
  to mark a recomputation that has no stored predecessor.

Three checks make this mechanically safe, all verified at plan time rather
than assumed. Every `runnerDigest` literal in the suite is a placeholder
(`"a".repeat(64)` and friends, twelve sites) — no test hardcodes a computed
value. Both existing callers that fabricate a launch spec
(`pnh/tests/plugin-spawn-launch-spec.test.ts:107`,
`pnh/host-tests/spawn-lifecycle-port.test.ts:22`) resolve `pnhRoot` to the
real `pnh/` tree, where the new file is present, so no existing fixture gains
a missing read. The plan's *own* fabricated roots do not: `HARNESS_FILES`
(Tasks 2, 2b, 3) must gain the fourth path in the same change or admission
throws `ENOENT` on a file it now reads — that is why the constant appears
with four entries everywhere below.

### D8: launch re-derives the admitted digests from the root it is handed

**Added in cycle 3 (Critical).** As drafted, pinned admission verified
digests over `<pluginsRoot>/<id>` while `createAdmittedPluginSpawnLaunchSpec`
took an independent, caller-supplied `pluginRoot`. Nothing linked the two:
a caller could admit a pinned, owner-approved tree and then launch a
completely different directory, and every check in the chain would still
pass, because the launch spec's own re-derivation only proves the descriptor
matches *whatever root it was handed*. Verifying one tree and executing
another is not a partial guarantee; it is no guarantee. That problem
statement stands unchanged; only the answer to it has changed.

**Chosen (cycles 3–4, now superseded): content-addressed read-only
snapshots.** Admission took a fourth `snapshotRoot` argument, copied each
pinned tree into a per-admission `mkdtemp` parent with `0o444`/`0o555` modes,
verified every D7 digest against the copy, and carried
`pluginSnapshotRoots: ReadonlyMap<string, string>` on the ticket so launch
could look the root up instead of being handed one. Cycle 3 added it; cycle 4
had to repair its directory layout (a digest-named directory collided
whenever two plugins' declared bodies were byte-identical, refused a repeat
admission of the same approved set, and let anyone who could `mkdir` one
predictable path permanently deny admission).

**Amended (cycle 5) — snapshots are dropped entirely; the binding is
re-derivation at launch.** Two consecutive review cycles concentrated their
defects in the snapshot machinery and nowhere else: cycle 4's layout Critical,
then cycle 5's Critical on the lookup map itself plus three Importants (no
cleanup handle, bytes read before they were proven to be pinned bytes, and a
uid-drop traversal problem created only by relocating plugins out of
`pnhRoot`). Every one of those is a defect *in the copy step*, not in the
guarantee the copy step was reaching for.

The guarantee wanted is: **only a tree that is digest-identical to what the
owner pinned can launch.** Copying was one way to get there — pin the bytes by
making a second copy nobody else names. Re-deriving is another, and it is the
one this plan now takes: launch recomputes the normalized manifest digest and
the `sourceDigest` from whatever root it was handed, and refuses unless both
equal the admitted descriptor's. Under that rule *which* tree the caller names
stops mattering, because the only trees that pass are the ones whose bytes
already match. The cycle-3 Critical is answered not by removing the caller's
choice of root but by making a wrong choice unable to launch.

What that removes from this plan, in full: `snapshotPluginTree`,
`removePluginSnapshotTree`, the `snapshotRoot` parameter and its `mkdtemp`
per-admission parent, the `pluginSnapshotRoots` map on the ticket, the
`snapshot` failure code, the `0o444`/`0o555` modes, and every snapshot-specific
test (collision, repeat admission, symlink cleanup, pre-creation denial).
`OwnerApprovedAdmissionTicket` (D3) survives and simplifies: a frozen wrapper
carrying the inner `AdmissionTicket` and `pinnedPluginIds`, branded in a
module-private `WeakSet` exactly as before, with the same one rejection
string. `admitPinnedRegistryBytes` becomes a three-argument, read-only
function — it now writes nothing at all, which is a smaller and more
defensible seam than the one it replaces.

The exact-listing check keeps its cycle-3 justification, restated for the new
shape: `sourceDigest` hashes only the files the descriptor declares, so
comparing the on-disk listing of `<pluginsRoot>/<pluginId>` against
`["manifest.json", ...descriptor.files]` sorted is what rejects a plugin
directory carrying *undeclared* files. That check ran on the source before
(never on the copy, for exactly this reason) and it runs on the source now.
Its failures fold into `source-digest-derivation`, which is where they always
belonged once there is no capture step to fail separately.

**The pinned launch entry point.** A new module
`pnh/runtime/pinned-spawn-launch.ts` exports

```ts
createOwnerApprovedPluginSpawnLaunchSpec(options: {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly pnhRoot: string;
  readonly pluginRoot: string;
}): PluginSpawnLaunchSpec
```

It requires the owner-approved brand, requires `pluginId` to be in the
ticket's `pinnedPluginIds`, then re-derives **both** digest legs from
`pluginRoot` — the normalized `manifest.json` digest via `normalizeManifest` +
`computeManifestDigest`, and `sourceDigest` over
`["manifest.json", ...descriptor.files]` — and refuses unless each equals the
admitted descriptor's value. Only then does it delegate to the existing
`createAdmittedPluginSpawnLaunchSpec` with `ticket: ticket.ticket` and the
same `pluginRoot`.

Handing the root back to the caller is safe *because* of that re-derivation,
and only because of it. A caller who names a different directory does not get
a launch spec for that directory; it gets a throw, unless the directory's bytes
are already the pinned bytes — in which case executing them is exactly what the
owner approved. This is the cycle-5 pivot's whole argument in one sentence:
the path is not the guarantee, the bytes are.

This is **additive**: `createAdmittedPluginSpawnLaunchSpec` keeps its exact
signature and behavior for the non-pinned path, so this task needs no edit to
`plugin-spawn-launch-spec.ts` and leaves its existing tests untouched. (The
one edit that file does take in this slice belongs to Task 2 — D7's cycle-4
runner-digest amendment, under the third named zero-edit exception — and it
changes what `computeSpawnRunnerDigest` computes, not what any launch entry
point exposes. That amendment is independent of this decision and is unaffected
by the cycle-5 pivot.) A side benefit worth naming: because the pinned entry
point re-derives `sourceDigest` at launch, the helper-file TOCTOU gap cycle 2
named as a Risk is **narrowed** for the pinned spawn path specifically — the
legacy path's launch-time re-check still covers only the manifest and
entrypoint file, and that Risk entry stands for it. See the amendment below
for why "narrowed" and not "closed".

**Amended (cycle 4, rewritten cycle 5) — verification is bound to the spawn,
not to the spec, and the residual window is named rather than claimed away.**
Cycle 4 found (Critical) that the launch entry point re-derives its digests
when the *spec* is built, while the supervisor spawns from
`spec.cwd`/`spec.entrypointPath` at some later moment
(`plugin-spawn-supervisor.mjs:316-332`, `:464`). Nothing in this slice can make
those two moments the same moment: binding the check *inside* the spawn — a
verifying thunk the supervisor calls — is the stronger fix and is **not
available**, because `plugin-spawn-supervisor.mjs` is on the zero-edit list
(Global constraints), and a slice that may not edit the spawn site cannot make
the spawn site verify. The shape taken instead is additive and caller-side:
`pinned-spawn-launch.ts` also exports

```ts
assertOwnerApprovedLaunchSpecUnchanged(options: {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly spec: PluginSpawnLaunchSpec;
}): void
```

which re-derives the same two legs — normalized manifest digest and
`sourceDigest` — **over `spec.cwd`**, and throws
`Error("owner-approved plugin tree changed after launch spec creation")` on any
difference. Calling it **immediately before handing the spec to the spawn
supervisor** is a documented requirement of the pinned path, not an option, and
the pinned entry point's doc comment states it.

**It takes the spec, and it re-derives against the spec's own `cwd`.** Cycle 5
found (Critical) that resolving the root for this check through *any* separate
lookup — the cycle-4 shape read it from the ticket's mutable
`pluginSnapshotRoots` map — checks a directory that need not be the directory
the spec will actually spawn from, which is the same verify-one-execute-another
defect this decision was created to close, reintroduced inside its own fix. The
supervisor spawns from `spec.cwd`; therefore the re-check reads `spec.cwd` and
nothing else. There is no map, no second source of truth, and no argument
through which the two can be made to disagree.

What this buys and what it does not: it moves the last verification from
"whenever the spec happened to be built" to "the final instruction before the
spawn call", shrinking the window from unbounded to the supervisor's own
internal path from spec to `spawn`. It does **not** eliminate it. No wording
in this plan may say the pinned path guarantees that the bytes hashed are the
bytes executed; the honest claim is that the pinned tree is
tamper-evident-by-re-derivation at the latest point this slice can reach.
Closing the remainder needs a change at the spawn site itself and is recorded
in Deferred.

Rejected alternatives: (a) *mutating `createAdmittedPluginSpawnLaunchSpec` to
resolve its own root* — smaller diff, but it changes a function every existing
spawn caller and test uses, for a guarantee only the pinned path can offer;
(b) *carrying the root on the ticket and removing `pluginRoot` from the launch
signature* — this was the cycle-3/4 design; it moves the caller's choice out of
the signature but not out of the system, and cycle 5 showed the resulting
lookup indirection is itself a place for the verified tree and the executed
tree to diverge; (c) *copying the pinned trees at admission* — the superseded
snapshot design, which bought immutability against *other* processes only,
never against the owning uid, at the cost of a write seam, a cleanup contract,
and a relocation that broke plugins' relative imports.

**Residual costs, stated honestly.** The caller supplies `pluginRoot` at
launch, and a hostile caller therefore chooses which directory is hashed — but
it may only choose among directories whose bytes already equal the pinned
bytes, which is not a meaningful choice. The bounded exposure that does remain
is the one D3 records for `pnhRoot`: the caller controls both the pin file and
the harness bytes the commitments are recomputed from, no operator identity
model exists (D5), and no production caller exists yet (Grounding). Nothing in
this path makes the plugin tree immutable — it never did, since the owning uid
could always `chmod` a read-only copy back — so the tree is
tamper-evident-by-re-derivation at launch rather than tamper-proof, and, per
the amendment above, that re-derivation happens immediately before the spawn
call rather than atomically with it. A window remains between the last check
and `spawn`. Because admission no longer writes anything, there is no snapshot
lifetime, no cleanup contract, and no litter to garbage-collect: the three
cycle-5 Importants about those disappear with the machinery that created them.

## Non-goals

- **No signatures, no keys.** D5.
- **No blocking install/launch prompt, no CLI, no installer.** Decisions doc
  recommendation + readiness Global Constraints. The disclosure surface is
  advisory records/lines only.
- **No new invariant.** Phase 4 of the readiness plan owns authoring the
  spawn-executor trust-boundary invariant, under Phase 2's activation bar.
  This slice will change what that invariant's wording should say (the
  boundary gains pinned admission) — Task 4 leaves a coordination note. The
  only `invariants.yaml` edit is D6's lock-neutral conformance-list addition
  to the existing PNH-INV-29.
- **No Docker-path changes.** `pnh/harness/plugin-container-supervisor.mjs`,
  `pnh/harness/plugin-fault-cell.mjs`, `pnh/adapters/docker-broker-plugin-container.ts`,
  `pnh/kernel/plugin-container-port.ts`: zero edits. In particular this
  slice does not add Docker image provenance — admission binds plugin
  content, not the image artifact (D7, Risks).
- **No retrofit of existing tests onto the pinned path.** Existing
  `admitRegistryBytes` callers stay as they are; the pinned path gets its own
  tests.
- **No resource caps, no WASM.** Separate "Still open" items with their own
  future forks.

## Global constraints

- Zero edits to: `pnh/runtime/admission-ticket.ts`,
  `pnh/harness/plugin-spawn-supervisor.mjs`,
  `pnh/harness/plugin-container-supervisor.mjs`,
  `pnh/harness/plugin-fault-cell.mjs`,
  `pnh/harness/sandbox/broker-gateway.mjs`, `pnh/registry/schema.ts`,
  anything under `pnh/kernel/` or `pnh/adapters/`. Three named exceptions,
  each bounded by a decision: `pnh/contracts/invariants.yaml` takes exactly
  D6's conformance-list addition to PNH-INV-29 (no statement, bounds, or
  status change — lock-neutral); `pnh/scripts/generate-plugin-registry.ts`
  takes exactly D7's additive exports (no behavior change to generation);
  and `pnh/runtime/plugin-spawn-launch-spec.ts` takes exactly D7's cycle-4
  runner-digest addition (bounds in D7's cycle-4 amendment above, restated
  in the bullet below). All other new behavior
  arrives in new files (plus the two docs Task 4 names).
- No new dependencies. `node:crypto`, `node:fs`, `node:path` only.
- New runtime modules follow the repo's validation idiom: exact keys, exact
  values where the value is a committed constant, reject on any deviation
  (`plugin-spawn-launch-spec.ts:154-216` is the model).
- Determinism: `describeAdmittedPluginSet` and `renderPluginDisclosureLines`
  are pure; the pin-record structural validator is pure and module-private;
  disk I/O is confined to named seams — `loadPluginPinRecord` (mirroring
  `loadSpawnProfile`), `admitPinnedRegistryBytes`'s verification reads under
  the caller-supplied `pluginsRoot` (D7), and the launch-time re-derivation in
  `pinned-spawn-launch.ts` (D8). **No function in this slice writes to disk**
  (cycle 5): dropping the snapshot copy removed the slice's only write seam,
  so every path here is read-only over caller-named roots.
- `pnh/runtime/plugin-spawn-launch-spec.ts` is **read, and edited in exactly
  one place** (third named exception, granted by the owner in cycle 4 on the
  D7 precedent). D8's pinned entry point is still a new module that delegates
  to the existing `createAdmittedPluginSpawnLaunchSpec` and reuses the
  exported `computeSpawnPluginArtifactCommitments`, so the non-pinned path
  keeps its behavior and its existing tests. The one permitted change is
  `computeSpawnRunnerDigest`'s input set gaining
  `kernel/plugin-runner/entrypoint.mjs`, plus the two doc comments that
  currently justify its absence (D7, cycle-4 amendment). The rationale for
  granting it: that module is in every spawn plugin's import closure, so it
  is executing code, and a commitment leg that omits executing code does not
  commit to what runs. Nothing else in the file may move — not
  `computeSpawnArtifactDigest`, not `loadSpawnProfile`, not
  `createAdmittedPluginSpawnLaunchSpec`.
- Every prose surface this slice touches states the boundary without
  overstatement: pinning is a library mechanism with no operator-facing UX;
  disclosure is advisory; signing does not exist. (Phase 4's bar.)
- Test fixtures write only under `mkdtempSync(tmpdir(), ...)` — the sandbox
  mounts `pnh/` read-only.
- Suite green after every task: `npm run test:pnh && npm run test:constitution`.
- Commit after every task; commit messages written to a scratch file and
  committed with `git commit -F`, never a heredoc.

## Tasks

### Task 1: Pin record module + committed empty pin file

**Files:**
- Create: `pnh/runtime/plugin-pins.ts`
- Create: `pnh/contracts/plugin-pins.json`
- Test: `pnh/tests/plugin-pins.test.ts`

**Interfaces:**
- Consumes: nothing from this slice (first task).
- Produces:
  - `interface PluginPinEntry { readonly id: string; readonly manifestDigest: string; readonly sourceDigest: string }`
  - `interface PluginPinRecord { readonly version: "pnh-plugin-pins-v1"; readonly environment: "production"; readonly plugins: readonly PluginPinEntry[] }`
  - `loadPluginPinRecord(pnhRoot: string): PluginPinRecord` (reads
    `<pnhRoot>/contracts/plugin-pins.json`; throws
    `Error("invalid committed plugin pin record")` on any failure). This is
    the **only** way to obtain a `PluginPinRecord` — the structural
    validator is module-private (D3), so no other module can construct or
    launder a pin record from arbitrary data.
  - `PLUGIN_PIN_RECORD_VERSION = "pnh-plugin-pins-v1"`
  - `hasDuplicateMembers(text: string): boolean` (cycle 4) — the raw-text
    duplicate-object-member scan, exported so the manifest seam in Task 2
    uses the same guard as the pin file rather than a second copy. Pure,
    takes JSON text `JSON.parse` has already accepted.

  **What Task 2 actually imports** (cycle 3, Minor; amended cycle 4): exactly
  `loadPluginPinRecord`, `type PluginPinRecord`, and — as of cycle 4 —
  `hasDuplicateMembers`. Nothing else. The version constant is exported
  because `PluginPinRecord.version` is typed
  `typeof PLUGIN_PIN_RECORD_VERSION` and because Task 1's own
  committed-file test asserts against it — but no Task 2 code or test
  imports it, and this list previously claimed it did, which sends a worker
  hunting for a use the given implementation does not contain.

- [ ] **Step 1: Write the failing test**

All validation is exercised through the load seam — the structural validator
is module-private (D3), so the tests write candidate pin files under a tmpdir
root and load them.

```ts
// pnh/tests/plugin-pins.test.ts
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPluginPinRecord, PLUGIN_PIN_RECORD_VERSION } from "../runtime/plugin-pins.ts";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ALPHA = { id: "alpha", manifestDigest: "a".repeat(64), sourceDigest: "b".repeat(64) };
const BETA = { id: "beta", manifestDigest: "c".repeat(64), sourceDigest: "d".repeat(64) };
const VALID = { version: "pnh-plugin-pins-v1", environment: "production", plugins: [ALPHA, BETA] };

// Duplicate-member fixtures are raw text, not objects: an object literal
// cannot express `{"a": 1, "a": 2}`, which is exactly the ambiguity the
// loader has to reject (cycle 3, Important).
const DUPLICATE_RECORD_MEMBER = `{
  "version": "pnh-plugin-pins-v1",
  "environment": "production",
  "plugins": [],
  "plugins": [${JSON.stringify(ALPHA)}]
}`;

const DUPLICATE_ENTRY_MEMBER = `{
  "version": "pnh-plugin-pins-v1",
  "environment": "production",
  "plugins": [
    {
      "id": "alpha",
      "manifestDigest": "${"a".repeat(64)}",
      "manifestDigest": "${"e".repeat(64)}",
      "sourceDigest": "${"b".repeat(64)}"
    }
  ]
}`;

function load(record: unknown) {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-plugin-pins-"));
  try {
    mkdirSync(resolve(root, "contracts"), { recursive: true });
    writeFileSync(
      resolve(root, "contracts", "plugin-pins.json"),
      typeof record === "string" ? record : JSON.stringify(record),
    );
    return loadPluginPinRecord(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rejects(record: unknown): void {
  assert.throws(() => load(record), /invalid committed plugin pin record/);
}

test("a well-formed pin file loads and comes back frozen", () => {
  const record = load(VALID);
  assert.equal(record.plugins.length, 2);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.plugins));
  assert.ok(Object.isFrozen(record.plugins[0]));
});

test("an empty pin set is valid", () => {
  assert.deepEqual(load({ ...VALID, plugins: [] }).plugins, []);
});

test("entry order does not matter: an unsorted but well-formed pin set still loads", () => {
  const record = load({ ...VALID, plugins: [BETA, ALPHA] });
  assert.deepEqual(
    record.plugins.map((entry) => entry.id),
    ["beta", "alpha"],
  );
});

test("digit-leading ids are accepted, matching the registry's own id rule", () => {
  const record = load({ ...VALID, plugins: [{ ...ALPHA, id: "1password-tool" }, BETA] });
  assert.equal(record.plugins[0]?.id, "1password-tool");
});

test("rejects a wrong version, a wrong environment, and extra keys", () => {
  rejects({ ...VALID, version: "pnh-plugin-pins-v2" });
  rejects({ ...VALID, environment: "development" });
  rejects({ ...VALID, extra: true });
});

test("rejects entries with malformed digests, malformed ids, or extra keys", () => {
  rejects({ ...VALID, plugins: [{ ...ALPHA, manifestDigest: "xyz" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, sourceDigest: "A".repeat(64) }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, id: "" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, id: "-leading-dash" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, note: "why" }] });
});

test("rejects duplicate ids", () => {
  rejects({ ...VALID, plugins: [ALPHA, ALPHA] });
});

test("rejects a duplicate member at the record level", () => {
  rejects(DUPLICATE_RECORD_MEMBER);
});

test("rejects a duplicate member at the entry level", () => {
  rejects(DUPLICATE_ENTRY_MEMBER);
});

test("the duplicate-member guard is scoped per object, not global", () => {
  // ALPHA and BETA are sibling objects that legitimately carry the same three
  // member names. The guard must reject a name repeated *within* one object
  // and accept a name repeated across objects, or every multi-entry pin file
  // -- the whole point of the file -- would fail to load.
  assert.equal(load(VALID).plugins.length, 2);
});

test("rejects non-object roots, non-array plugins, and invalid JSON", () => {
  rejects(null);
  rejects([]);
  rejects({ ...VALID, plugins: {} });
  rejects("not json");
});

test("a missing pin file is rejected", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-plugin-pins-"));
  try {
    assert.throws(() => loadPluginPinRecord(root), /invalid committed plugin pin record/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed pin file loads and validates", () => {
  // Shape only. This test must stay true after an owner pins something --
  // which is the one thing this slice exists to enable -- so it deliberately
  // does NOT assert the plugin set is empty (cycle 3, Important). Emptiness
  // of the shipped file is a fact about today, recorded in Step 3's initial
  // commit, not a property the suite enforces forever.
  const record = loadPluginPinRecord(pnhRoot);
  assert.equal(record.version, PLUGIN_PIN_RECORD_VERSION);
  assert.equal(record.environment, "production");
  assert.ok(Array.isArray(record.plugins));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test pnh/tests/plugin-pins.test.ts`
Expected: FAIL — cannot find module `../runtime/plugin-pins.ts`.

- [ ] **Step 3: Commit the empty pin file and the minimal implementation**

```json
// pnh/contracts/plugin-pins.json
{
  "version": "pnh-plugin-pins-v1",
  "environment": "production",
  "plugins": []
}
```

```ts
// pnh/runtime/plugin-pins.ts
/**
 * Owner-pinned plugin digest record.
 *
 * The committed file `contracts/plugin-pins.json` is the owner-approval
 * artifact behind PNH-INV-29's "owner-approved" leg: it names exactly which
 * plugins -- by executor-neutral content identity (the registry generator's
 * `manifestDigest` + `sourceDigest`, see
 * `scripts/generate-plugin-registry.ts`) -- are approved for production
 * admission. Changing a pin requires a reviewed commit; that review IS the
 * approval channel today (no signatures exist -- deliberately out of scope,
 * see the 2026-08-24 supply-chain trust slice plan, D5).
 *
 * Deliberately NOT pinned here: `versionDigest` (folds in executor
 * commitments, so it churns on harness edits) and `imageDigest` (its meaning
 * is executor-specific). The pin unit is the content an owner actually
 * reviews: the manifest (including its capability requests) and the source
 * files it lists.
 *
 * Provenance: the structural validator is module-private. The ONLY way to
 * obtain a `PluginPinRecord` is `loadPluginPinRecord`, which reads the
 * committed file off disk -- so pin data always originates from `JSON.parse`
 * of file bytes, never from a caller-supplied object (which could otherwise
 * carry a plugin's own digests, or accessor properties).
 *
 * Entry ids must be unique. Keeping the committed file sorted by id is a
 * formatting convention for reviewable diffs, not a validation rule: the pin
 * check is set equality, order carries no security meaning, and a
 * legitimately approved set that arrives unsorted (a git merge of two
 * approval branches) must still load.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PLUGIN_PIN_RECORD_VERSION = "pnh-plugin-pins-v1";

const DIGEST_RE = /^[0-9a-f]{64}$/;
// Same rule as the registry generator's SLUG_RE (generate-plugin-registry.ts:43):
// a pin rule stricter than the registry's would strand admissible plugins.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RECORD_KEYS = ["version", "environment", "plugins"] as const;
const ENTRY_KEYS = ["id", "manifestDigest", "sourceDigest"] as const;

export interface PluginPinEntry {
  readonly id: string;
  readonly manifestDigest: string;
  readonly sourceDigest: string;
}

export interface PluginPinRecord {
  readonly version: typeof PLUGIN_PIN_RECORD_VERSION;
  readonly environment: "production";
  readonly plugins: readonly PluginPinEntry[];
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validateEntry(value: unknown): PluginPinEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!exactKeys(value as Record<string, unknown>, ENTRY_KEYS)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !ID_RE.test(entry.id)) return null;
  if (typeof entry.manifestDigest !== "string" || !DIGEST_RE.test(entry.manifestDigest)) return null;
  if (typeof entry.sourceDigest !== "string" || !DIGEST_RE.test(entry.sourceDigest)) return null;
  return Object.freeze({
    id: entry.id,
    manifestDigest: entry.manifestDigest,
    sourceDigest: entry.sourceDigest,
  });
}

function validatePluginPinRecord(value: unknown): PluginPinRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!exactKeys(value as Record<string, unknown>, RECORD_KEYS)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== PLUGIN_PIN_RECORD_VERSION) return null;
  if (record.environment !== "production") return null;
  if (!Array.isArray(record.plugins)) return null;
  const seen = new Set<string>();
  const plugins: PluginPinEntry[] = [];
  for (const raw of record.plugins) {
    const entry = validateEntry(raw);
    if (entry === null) return null;
    if (seen.has(entry.id)) return null;
    seen.add(entry.id);
    plugins.push(entry);
  }
  return Object.freeze({
    version: PLUGIN_PIN_RECORD_VERSION,
    environment: "production",
    plugins: Object.freeze(plugins),
  });
}

/**
 * Reject duplicate object members before semantic validation.
 *
 * `JSON.parse` collapses `{"a": 1, "a": 2}` to `{a: 2}` before `Object.keys`
 * can observe the ambiguity, so `exactKeys` above cannot see it: a pin entry
 * carrying two `manifestDigest` members still reports exactly three keys and
 * still loads. That matters here more than anywhere else in the harness,
 * because this file is the owner-approval artifact and a human reading the
 * diff is the entire control (D5) -- a reviewer reading top-to-bottom and the
 * loader must never disagree about which digest was approved.
 *
 * This is a scanner over the raw text, not a second parser. `JSON.parse` has
 * already proven the text is well-formed JSON, so the scan only has to do two
 * things: skip string literals (so structure characters inside them are not
 * mistaken for structure) and track object nesting (so a member name is
 * checked against its own object's names, not a global set). Names repeated
 * across sibling objects -- every multi-entry pin file -- are legal.
 *
 * `charAt` rather than indexing: under `noUncheckedIndexedAccess`, `text[i]`
 * is `string | undefined`, and `charAt` is total (it returns `""` past the
 * end), which keeps the loop free of non-null assertions.
 *
 * Exported (cycle 4) because the pin file is not the only place in this slice
 * where a duplicate member changes meaning: `pinned-admission.ts` parses each
 * pinned plugin's on-disk `manifest.json` and needs the same guard. Nothing
 * about the scan
 * is pin-specific -- it takes JSON text that `JSON.parse` has already
 * accepted and answers one question about it -- so the two seams share this
 * function rather than growing two implementations that can drift.
 */
export function hasDuplicateMembers(text: string): boolean {
  const scopes: Array<Set<string>> = [];
  let pendingName: string | null = null;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length && text.charAt(index) !== '"') {
        index += text.charAt(index) === "\\" ? 2 : 1;
      }
      index += 1;
      // Re-decode through JSON.parse so escapes resolve the same way the
      // parsed object's keys did -- "ab" and "ab" are one name.
      const decoded: unknown = JSON.parse(text.slice(start, index));
      pendingName = typeof decoded === "string" ? decoded : null;
      continue;
    }

    if (char === "{") {
      scopes.push(new Set<string>());
      index += 1;
      continue;
    }

    if (char === "}") {
      scopes.pop();
      index += 1;
      continue;
    }

    if (char === ":") {
      const scope = scopes.at(-1);
      // Neither branch is reachable for well-formed JSON (a ':' outside an
      // object, or one not preceded by a string). Rejecting rather than
      // skipping keeps the module's reject-on-any-deviation idiom.
      if (scope === undefined || pendingName === null) return true;
      if (scope.has(pendingName)) return true;
      scope.add(pendingName);
      pendingName = null;
      index += 1;
      continue;
    }

    index += 1;
  }

  return false;
}

export function loadPluginPinRecord(pnhRoot: string): PluginPinRecord {
  const path = resolve(pnhRoot, "contracts", "plugin-pins.json");
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
    // Parse first: the scanner assumes well-formed JSON, and JSON.parse is
    // what establishes that.
    value = JSON.parse(text);
    if (hasDuplicateMembers(text)) throw new Error("duplicate member");
  } catch {
    throw new Error("invalid committed plugin pin record");
  }
  const record = validatePluginPinRecord(value);
  if (record === null) throw new Error("invalid committed plugin pin record");
  return record;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx tsx --test pnh/tests/plugin-pins.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Full suite + commit**

Run: `npm run test:pnh && npm run test:constitution`
Expected: green (the new test file is auto-discovered by the sandbox run).

Commit (message via scratch file, `git commit -F`):
`feat(pnh): add the owner plugin-pin record and its committed empty file`

### Task 2: Pinned admission with derivation verification

**Files:**
- Create: `pnh/runtime/pinned-admission.ts`
- Modify: `pnh/scripts/generate-plugin-registry.ts` (D7's additive exports
  only: export the existing `normalizeManifest` and `sourceDigest` helpers,
  and extract the digest expressions at `:346-354` into exported
  `computeManifestDigest(manifest)` / `computeVersionDigest(manifestDigest,
  sourceDigest, commitments)` used in place — zero behavior change to
  generation)
- Modify: `pnh/runtime/plugin-spawn-launch-spec.ts` (D7's cycle-4 amendment
  only, and only under the third named zero-edit exception: one added entry in
  `computeSpawnRunnerDigest`'s `sources` array plus the two doc comments that
  currently justify its absence — no other hunk, see Step 3)
- Modify: `pnh/contracts/invariants.yaml` (D6 only: append
  `pnh/tests/pinned-admission.test.ts` to PNH-INV-29's `conformance` list)
- Modify: `docs/plans/provider-neutral-harness/constitution.md` (cycle 5 —
  **generated, never hand-edited**: the D6 conformance-list addition above is
  rendered into the constitution by `pnh/scripts/generate-constitution.ts`, and
  `pnh/tests/constitution-gate.test.ts` check 5 fails if the committed file
  does not match what the generator renders. Step 5 regenerates it; this entry
  exists so the file's appearance in the diff is expected rather than
  surprising. Note the path: the generator writes
  `docs/plans/provider-neutral-harness/constitution.md`, **not**
  `pnh/constitution.md` — that file does not exist.)
- Test: `pnh/tests/pinned-admission.test.ts`

**Interfaces:**
- Consumes: `loadPluginPinRecord` (Task 1); `admitRegistryBytes`,
  `AdmissionTicket`, `isAdmissionTicket`
  (`pnh/runtime/admission-ticket.ts`, unchanged); `normalizeManifest`,
  `sourceDigest`, `computeManifestDigest`, `computeVersionDigest`
  (generator exports, this task); `computeSpawnPluginArtifactCommitments`
  (`pnh/runtime/plugin-spawn-launch-spec.ts:273`, already exported — its
  signature is unchanged; the only edit to that file is the runner-digest
  input above, which changes what it computes, not how it is called);
  `conformsTo` (`pnh/contracts/conforms-to.ts`, pattern at
  `pnh/tests/admission-ticket.test.ts:4,48`).
- Produces (Task 3's tests, Task 2b, and future composition roots rely on
  these):
  - `type PinnedRegistryAdmissionFailureCode = Extract<RegistryAdmissionResult, { ok: false }>["code"] | "pin-record" | "unpinned-plugin" | "pinned-plugin-missing" | "pin-digest-mismatch" | "manifest-file" | "manifest-digest-derivation" | "version-digest-derivation" | "source-digest-derivation" | "commitment-mismatch"`
    — the `"snapshot"` code is **gone** (cycle 5): with no capture step there is
    nothing it could report. Its former cases fold into
    `source-digest-derivation` (missing/unreadable directory, listing
    disagreement, symlink or non-regular entry) — the step that now owns reading
    those files.
  - `interface OwnerApprovedAdmissionTicket { readonly ticket: AdmissionTicket; readonly pinnedPluginIds: readonly string[]; }`
    — a frozen wrapper, brand-checked through a module-private `WeakSet` (D3).
    `pinnedPluginIds` is the admitted set in registry order; D1's exact-set
    equality makes it equal to `ticket.order`, and Task 2b uses it to refuse a
    `pluginId` the owner never approved without re-deriving that equality.
  - `type PinnedRegistryAdmissionResult = { ok: true; ticket: OwnerApprovedAdmissionTicket } | { ok: false; code: PinnedRegistryAdmissionFailureCode }`
  - `admitPinnedRegistryBytes(bytes: Uint8Array, pnhRoot: string, pluginsRoot: string): PinnedRegistryAdmissionResult`
    — the pin record is loaded from `<pnhRoot>/contracts/plugin-pins.json`
    internally (D3); there is no pin-object parameter. `pluginsRoot` is the
    plugin tree every verification reads (`<pluginsRoot>/<id>/`). **Three
    arguments, and nothing is written** (cycle 5, D8): the function reads the
    pinned trees in place and returns; the former `snapshotRoot` parameter and
    the copy it named are gone.
  - `isOwnerApprovedAdmissionTicket(value: unknown): value is OwnerApprovedAdmissionTicket`
    — the D3 brand check, backed by a module-private `WeakSet`.
  - `hasExactListing(directory: string, files: readonly string[]): boolean`
    — true when the directory holds exactly `manifest.json` plus `files`.
    Exported (cycle 5) so Task 2b's launch path applies the identical rule; an
    undeclared file is invisible to `sourceDigest`, so admission and launch
    must not disagree about what the approved tree contains.

- [ ] **Step 0: The generator exports (mechanical, before the red test)**

In `pnh/scripts/generate-plugin-registry.ts`: add `export` to
`normalizeManifest` (`:201`) and `sourceDigest` (`:283`), and to the
`NormalizedManifest` interface at `:50` — verified as *not* exported today,
so this is a definite edit, not a conditional one (`PluginArtifactCommitments`
at `:63` is already exported and needs nothing). Then extract the two digest
expressions at `:346-354` into exported functions and call them where the
expressions stood:

```ts
export function computeManifestDigest(manifest: NormalizedManifest): string {
  return sha256(JSON.stringify(["pnh-plugin-manifest-v2", manifest]));
}

export function computeVersionDigest(
  manifestDigest: string,
  sourceDigest: string,
  commitments: PluginArtifactCommitments,
): string {
  return sha256(JSON.stringify([
    "pnh-plugin-version-v2",
    manifestDigest,
    sourceDigest,
    commitments.runnerDigest,
    commitments.imageDigest,
    commitments.profileDigest,
  ]));
}
```

Run `npm run test:pnh` — must stay green (behavior-preserving refactor).

- [ ] **Step 1: Write the failing test**

Model the registry construction on
`pnh/tests/plugin-spawn-launch-spec.test.ts`'s `makePluginsRoot`/`ticketWith`
pattern (tmpdir plugin directory + `generatePluginRegistry`), deriving pin
entries from the generated registry's own descriptors so the positive case is
exact by construction. Pin sets are supplied by writing a
`contracts/plugin-pins.json` under a tmpdir root (the only channel, per D3);
the positive case writes its pins in reverse order to prove order
independence.

**Why the tests fabricate a whole `pnhRoot` (cycle 3).** D7 now requires
admission to recompute the three executor commitments with
`computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot })`, which reads
`kernel/plugin-runner/spawn-profile.json`, `kernel/plugin-runner/entrypoint.mjs`
(D7's cycle-4 amendment), `sdk/protocol.ts`, and
`harness/plugin-spawn-supervisor.mjs` under `pnhRoot`. But the *same*
`pnhRoot` is also the only channel for a candidate pin set (D3), and it must
be a tmpdir because the test sandbox mounts `pnh/` read-only. So the tests
build one tmpdir root that carries both: the pins file *and* byte-identical
copies of those four files. This works because neither
`computeSpawnRunnerDigest` nor the spawn artifact digest embeds an absolute
path — both hash file *contents* under fixed logical names
(`plugin-spawn-launch-spec.ts:225-234`) — so a copy under a different root
digests identically. The fixtures must then generate with **real**
commitments computed against that same root; placeholder values would fail
the positive case the moment admission recomputes them. The cost is a
coupling worth naming: if any of those four files moves, `HARNESS_FILES`
below moves with it — and, since cycle 4 added the fourth, the reverse is
load-bearing too. A fabricated root missing `entrypoint.mjs` no longer
produces a wrong digest, it produces an `ENOENT` at admission.

```ts
// pnh/tests/pinned-admission.test.ts
import assert from "node:assert/strict";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { conformsTo } from "../contracts/conforms-to.ts";
import {
  admitRegistryBytes,
  isAdmissionTicket,
  resolveAdmittedPlugin,
} from "../runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  isOwnerApprovedAdmissionTicket,
  type PinnedRegistryAdmissionResult,
} from "../runtime/pinned-admission.ts";
import { computeSpawnPluginArtifactCommitments } from "../runtime/plugin-spawn-launch-spec.ts";
import { computeVersionDigest, generatePluginRegistry } from "../scripts/generate-plugin-registry.ts";

const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

const REAL_PNH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The four files computeSpawnPluginArtifactCommitments reads from pnhRoot
// (entrypoint.mjs joins the runner digest in D7's cycle-4 amendment).
const HARNESS_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "spawn-profile.json"],
  ["kernel", "plugin-runner", "entrypoint.mjs"],
  ["sdk", "protocol.ts"],
  ["harness", "plugin-spawn-supervisor.mjs"],
];

function fabricatePnhRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-root-"));
  for (const segments of HARNESS_FILES) {
    const target = resolve(root, ...segments);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(REAL_PNH_ROOT, ...segments), target);
  }
  mkdirSync(resolve(root, "contracts"), { recursive: true });
  return root;
}

function manifestFor(id: string): string {
  return JSON.stringify({
    id,
    version: "1.0.0",
    apiVersion: 1,
    kind: "tool",
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: [],
    license: { spdxId: "MIT", holder: "PNH" },
  });
}

function generate(pnhRoot: string, ids: readonly string[]) {
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  for (const id of ids) {
    const pluginRoot = resolve(pluginsRoot, id);
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(resolve(pluginRoot, "manifest.json"), manifestFor(id));
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
  }
  const generated = generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog,
    // Real commitments against the fabricated root, not placeholders: D7
    // step 3 recomputes these and requires equality.
    artifactCommitments: Object.fromEntries(
      ids.map((id) => [
        id,
        computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot: resolve(pluginsRoot, id) }),
      ]),
    ),
  });
  if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
  return { pluginsRoot, generated };
}

function pinsFor(generated: ReturnType<typeof generate>["generated"]) {
  return {
    version: "pnh-plugin-pins-v1",
    environment: "production",
    // Reverse order on purpose: the pin check is set equality, not sequence
    // equality, and the committed file's sorting is convention only.
    plugins: [...generated.registry.plugins].reverse().map((plugin) => ({
      id: plugin.id,
      manifestDigest: plugin.manifestDigest,
      sourceDigest: plugin.sourceDigest,
    })),
  };
}

interface Fixture {
  readonly pnhRoot: string;
  readonly pluginsRoot: string;
  readonly generated: ReturnType<typeof generate>["generated"];
  // Writes the pin set (the only channel, D3) and admits in one step.
  readonly admit: (bytes: Uint8Array, pins: unknown) => PinnedRegistryAdmissionResult;
}

function withFixture<T>(ids: readonly string[], body: (fixture: Fixture) => T): T {
  const pnhRoot = fabricatePnhRoot();
  const { pluginsRoot, generated } = generate(pnhRoot, ids);
  try {
    return body({
      pnhRoot,
      pluginsRoot,
      generated,
      admit: (bytes, pins) => {
        writeFileSync(
          resolve(pnhRoot, "contracts", "plugin-pins.json"),
          typeof pins === "string" ? pins : JSON.stringify(pins),
        );
        return admitPinnedRegistryBytes(bytes, pnhRoot, pluginsRoot);
      },
    });
  } finally {
    // Plain rmSync suffices: admission writes nothing, so the only trees here
    // are the ones this fixture made, at their default modes (cycle 5, D8).
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
}

// Re-serialize a mutated copy of a generated registry document. Admission
// self-hashes whatever bytes it gets, so forged bytes admit or fail purely
// on the pin and derivation checks -- exactly what these tests probe.
function forgedBytes(generated: { bytes: Uint8Array }, mutate: (doc: any) => void): Uint8Array {
  const doc = JSON.parse(new TextDecoder().decode(generated.bytes));
  mutate(doc);
  return new TextEncoder().encode(`${JSON.stringify(doc)}\n`);
}

const EMPTY_PINS = { version: "pnh-plugin-pins-v1", environment: "production", plugins: [] };

test("a registry whose plugin set exactly matches the pins admits, issuing an owner-approved ticket", () => {
  conformsTo("PNH-INV-29");
  withFixture(["alpha", "beta"], ({ generated, admit }) => {
    const result = admit(generated.bytes, pinsFor(generated));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(isOwnerApprovedAdmissionTicket(result.ticket));
      assert.ok(isAdmissionTicket(result.ticket.ticket));
      assert.ok(resolveAdmittedPlugin(result.ticket.ticket, "alpha"));
      assert.ok(resolveAdmittedPlugin(result.ticket.ticket, "beta"));
      // The wrapper names the approved set and nothing else (cycle 5, D8):
      // there is no root on the ticket, because launch re-derives against the
      // root it is handed rather than looking one up.
      assert.deepEqual([...result.ticket.pinnedPluginIds].sort(), ["alpha", "beta"]);
    }
  });
});

test("admitting the same plugin set twice succeeds, and neither run writes to disk", () => {
  conformsTo("PNH-INV-29");
  // The cycle-3/4 snapshot design had a per-admission directory, which made
  // repeat admission a real hazard (the second run found its path occupied).
  // Re-derivation has no such state: admission is a pure read, so the same
  // approved set admits as many times as it is asked to.
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    const before = readdirSync(pluginsRoot).sort();
    const pins = pinsFor(generated);
    assert.equal(admit(generated.bytes, pins).ok, true);
    assert.equal(admit(generated.bytes, pins).ok, true);
    assert.deepEqual(readdirSync(pluginsRoot).sort(), before);
    assert.deepEqual(readdirSync(resolve(pluginsRoot, "alpha")).sort(), ["index.mjs", "manifest.json"]);
  });
});

test("a raw self-hashed registry's ticket is not owner-approved", () => {
  conformsTo("PNH-INV-29");
  withFixture(["alpha"], ({ generated }) => {
    // The brand's whole point (D3): admitRegistryBytes proves integrity, never
    // owner approval. If this ever passes, the one brand-requiring consumer --
    // pinned launch (D8) -- silently accepts an unpinned registry, which is the
    // failure the brand exists to make impossible. Disclosure (D4) is
    // deliberately NOT in that list as of cycle 5: it accepts either ticket
    // kind and reports which one it got. The ticket here is genuine and passes
    // isAdmissionTicket; only the brand separates it from an approved one.
    const raw = admitRegistryBytes(generated.bytes, generated.registryDigest);
    assert.equal(raw.ok, true);
    if (raw.ok) {
      assert.ok(isAdmissionTicket(raw.ticket));
      assert.equal(isOwnerApprovedAdmissionTicket(raw.ticket), false);
    }
  });
});

test("an invalid pin file refuses admission", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    assert.deepEqual(admit(generated.bytes, { pins: [] }), { ok: false, code: "pin-record" });
  });
});

test("a missing pin file refuses admission", () => {
  const pnhRoot = fabricatePnhRoot();
  const { pluginsRoot, generated } = generate(pnhRoot, ["alpha"]);
  try {
    // fabricatePnhRoot creates contracts/ but writes no pins file.
    assert.deepEqual(
      admitPinnedRegistryBytes(generated.bytes, pnhRoot, pluginsRoot),
      { ok: false, code: "pin-record" },
    );
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("a registry plugin with no pin entry is refused as unpinned", () => {
  withFixture(["alpha", "beta"], ({ generated, admit }) => {
    const pins = pinsFor(generated);
    pins.plugins = pins.plugins.filter((entry) => entry.id !== "beta");
    assert.deepEqual(admit(generated.bytes, pins), { ok: false, code: "unpinned-plugin" });
  });
});

test("a pinned plugin missing from the registry is refused", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    const pins = pinsFor(generated);
    pins.plugins = [
      ...pins.plugins,
      { id: "zeta", manifestDigest: "e".repeat(64), sourceDigest: "f".repeat(64) },
    ];
    assert.deepEqual(admit(generated.bytes, pins), { ok: false, code: "pinned-plugin-missing" });
  });
});

test("changed plugin content is refused: the regenerated registry no longer matches the old pins", () => {
  withFixture(["alpha"], ({ pnhRoot, pluginsRoot, generated, admit }) => {
    const pins = pinsFor(generated);
    writeFileSync(
      resolve(pluginsRoot, "alpha", "index.mjs"),
      "export async function handle(r) { return null; }\n",
    );
    const regenerated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({
          pnhRoot,
          pluginRoot: resolve(pluginsRoot, "alpha"),
        }),
      },
    });
    if (!regenerated.ok) throw new Error("registry generation failed");
    assert.deepEqual(admit(regenerated.bytes, pins), { ok: false, code: "pin-digest-mismatch" });
  });
});

test("a forged descriptor that copies pinned digests over altered manifest fields is refused", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    // Change a manifest field, keep every claimed digest: the pin comparison
    // alone would pass; only derivation recomputation catches it.
    const bytes = forgedBytes(generated, (doc) => {
      doc.plugins[0].version = "1.0.1";
    });
    assert.deepEqual(admit(bytes, pinsFor(generated)), {
      ok: false,
      code: "manifest-digest-derivation",
    });
  });
});

test("a swapped executor commitment is refused even when versionDigest is recomputed to match", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    // This forgery is internally COHERENT: every claimed digest field agrees
    // with every other, so recomputing versionDigest from the descriptor's own
    // claims -- which is what this plan specified before cycle 3 -- would
    // accept it. It is refused only because admission derives the commitments
    // independently, from the pnh tree and the plugin tree, and compares
    // (D7 step 3). The distinct code says a commitment was tampered with, not
    // that the digest arithmetic failed.
    const bytes = forgedBytes(generated, (doc) => {
      const plugin = doc.plugins[0];
      plugin.imageDigest = "f".repeat(64);
      plugin.versionDigest = computeVersionDigest(plugin.manifestDigest, plugin.sourceDigest, {
        runnerDigest: plugin.runnerDigest,
        imageDigest: plugin.imageDigest,
        profileDigest: plugin.profileDigest,
      });
    });
    assert.deepEqual(admit(bytes, pinsFor(generated)), { ok: false, code: "commitment-mismatch" });
  });
});

test("a byte change to the plugin runner entrypoint moves runnerDigest", () => {
  withFixture(["alpha"], ({ pnhRoot, pluginsRoot, generated, admit }) => {
    // D7's cycle-4 amendment, and the only test that can fail if it is
    // dropped. `kernel/plugin-runner/entrypoint.mjs` is the module a spawn
    // plugin imports to get its protocol loop -- the supervisor never loads
    // it -- and before the amendment it was in no pinned or recomputed
    // value, so this exact edit moved nothing and admission accepted it.
    const pluginRoot = resolve(pluginsRoot, "alpha");
    const before = computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot });
    appendFileSync(resolve(pnhRoot, "kernel", "plugin-runner", "entrypoint.mjs"), "\n// swapped\n");
    const after = computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot });
    assert.notEqual(after.runnerDigest, before.runnerDigest);
    // Scoped, not blanket: profileDigest reads spawn-profile.json from the
    // same directory and must NOT move with its sibling, or the assertion
    // above would pass for a version bump that touched everything.
    assert.equal(after.profileDigest, before.profileDigest);
    // And the consequence at the seam that matters: the registry was
    // generated against the pre-swap harness, so what admission recomputes
    // from the tree it now trusts no longer agrees with the descriptor.
    assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
      ok: false,
      code: "commitment-mismatch",
    });
  });
});

test("a source file swapped on disk after generation is refused via sourceDigest recomputation", () => {
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    // Registry bytes and pins agree on the old sourceDigest; the tree the
    // caller named no longer matches it, so the recomputation disagrees and
    // the set never becomes launchable.
    writeFileSync(
      resolve(pluginsRoot, "alpha", "index.mjs"),
      "export async function handle(r) { return null; }\n",
    );
    assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
      ok: false,
      code: "source-digest-derivation",
    });
  });
});

test("a source tree carrying a file the manifest does not declare is refused", () => {
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    // sourceDigest's exact-listing precondition (D8): the digest covers only
    // the files the descriptor names, so a tree carrying an undeclared file
    // hashes to the pinned value while shipping bytes nobody pinned. Admission
    // enumerates the real directory and refuses the extra entry. Its failures
    // fold into `source-digest-derivation` -- the same leg, one directory
    // listing earlier -- because there is no longer a capture step to have
    // its own code (cycle 5).
    writeFileSync(resolve(pluginsRoot, "alpha", "README.md"), "# stray\n");
    assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
      ok: false,
      code: "source-digest-derivation",
    });
  });
});

test("an on-disk manifest carrying a duplicate member is refused, as the pin file's is", () => {
  conformsTo("PNH-INV-29");
  // `JSON.parse` keeps the LAST of duplicate members, so this manifest
  // normalizes to entrypoint "index.mjs" while `sourceDigest` covers raw bytes
  // that also carry "shadow.mjs". Generation and admission both parse, so both
  // land on the same value and every digest agrees: the two representations are
  // consistent with each other and inconsistent with the file on disk. Only a
  // raw-text scan catches that, which is why Task 1's `hasDuplicateMembers` is
  // exported and applied at this seam rather than reimplemented (cycle 4).
  const pnhRoot = fabricatePnhRoot();
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  try {
    const pluginRoot = resolve(pluginsRoot, "alpha");
    mkdirSync(pluginRoot, { recursive: true });
    // A leading `entrypoint` shadowed by the real one later in the object.
    writeFileSync(
      resolve(pluginRoot, "manifest.json"),
      `{"entrypoint":"shadow.mjs",${manifestFor("alpha").slice(1)}`,
    );
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot }),
      },
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
    // The generator accepts it -- that asymmetry is the finding, and it stays
    // (the generator sits behind the zero-edit constraint; see Risks).
    writeFileSync(resolve(pnhRoot, "contracts", "plugin-pins.json"), JSON.stringify(pinsFor(generated)));
    assert.deepEqual(admitPinnedRegistryBytes(generated.bytes, pnhRoot, pluginsRoot), {
      ok: false,
      code: "manifest-file",
    });
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("an inner admission failure propagates its own code", () => {
  const pnhRoot = fabricatePnhRoot();
  const spare = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  try {
    writeFileSync(resolve(pnhRoot, "contracts", "plugin-pins.json"), JSON.stringify(EMPTY_PINS));
    const result = admitPinnedRegistryBytes(new TextEncoder().encode("not json"), pnhRoot, spare);
    assert.deepEqual(result, { ok: false, code: "invalid-json" });
  } finally {
    rmSync(spare, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("the empty pin set refuses every non-empty registry", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    assert.deepEqual(admit(generated.bytes, EMPTY_PINS), { ok: false, code: "unpinned-plugin" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test pnh/tests/pinned-admission.test.ts`
Expected: FAIL — cannot find module `../runtime/pinned-admission.ts`. The
missing import fails the whole file, so every test in it is red here for that
one reason. One of them —
`"a byte change to the plugin runner entrypoint moves runnerDigest"` — has a
second, independent reason: `computeSpawnRunnerDigest` does not read the
runner entrypoint yet. Step 3 lands both changes, so confirm at Step 4 that
this test is green on its own terms and not merely because the import
resolved.

- [ ] **Step 3: Minimal implementation**

Two files, in this order. First the bounded edit to an existing one, which is
D7's cycle-4 amendment and the third named zero-edit exception: in
`pnh/runtime/plugin-spawn-launch-spec.ts`, add
`["entrypoint.mjs", resolve(pnhRoot, "kernel", "plugin-runner", "entrypoint.mjs")]`
to `computeSpawnRunnerDigest`'s `sources` array, and correct the two doc
comments (`:58-62`, `:219-222`) that assert the file has no spawn equivalent.
Exact bounds, the reason the name `"entrypoint.mjs"` is not negotiable, and
what must not move are all in the amendment under D7. Nothing else in that
file changes; Task 5 Step 2 checks the diff against exactly those bounds.

Then the new module:

```ts
// pnh/runtime/pinned-admission.ts
/**
 * Pinned registry admission: the blessed production path to an
 * owner-approved admission ticket.
 *
 * `admitRegistryBytes` alone is an integrity binding -- every caller derives
 * the expected digest from the same bytes it admits, so it cannot refuse an
 * unapproved plugin. This module adds the authorization leg: the admitted
 * plugin set must exactly equal the owner-pinned set (both directions), by
 * the executor-neutral content identity `manifestDigest` + `sourceDigest`.
 *
 * ## What this function returns, and why it is not a bare ticket
 *
 * The result is an `OwnerApprovedAdmissionTicket` -- a frozen wrapper around
 * the ordinary ticket, carrying the approved plugin ids, recognised by
 * `isOwnerApprovedAdmissionTicket`. It is a second brand on top of
 * `isAdmissionTicket`, using the same module-private-WeakSet pattern
 * (`admission-ticket.ts:10,109`), for the reason that pattern exists at all:
 * a type alias would be erased at runtime and a property would be forgeable.
 * The wrapper is a wrapper rather than an extra field because `issueTicket`
 * freezes the ticket before branding it (`admission-ticket.ts:69-76`) and
 * `admission-ticket.ts` is on this slice's zero-edit list.
 *
 * The distinction it encodes: `isAdmissionTicket` proves the registry bytes
 * hash to the digest they were admitted under; it proves nothing about who
 * approved them. `isOwnerApprovedAdmissionTicket` proves this function ran --
 * pins loaded from the contract path, every digest re-derived against the
 * real on-disk trees. The consumer that must not accept a self-hashed
 * registry (pinned launch, D8) requires the second brand, so the ordinary
 * ticket from `admitRegistryBytes` cannot stand in for one. Disclosure (D4)
 * deliberately accepts either kind and reports which it got, because an
 * advisory line about an unapproved set is more useful than no line at all
 * (cycle 5).
 *
 * ## Where the pins come from
 *
 * The pin record is loaded from `<pnhRoot>/contracts/plugin-pins.json` by
 * this function itself -- there is deliberately no pin-object parameter. A
 * caller-supplied pin object could be wired from an env var, a request
 * payload, or the plugin's own manifest digests, which would recreate the
 * self-certifying class this module exists to close. Anchoring pins to the
 * contract path is the strongest provenance available without an operator
 * identity model; a caller who controls `pnhRoot` controls the pins, and
 * that residual is disclosed in the slice plan (D3), not hidden.
 *
 * No caller is forced through this path today -- no production composition
 * root exists yet (see the 2026-08-24 supply-chain trust slice plan, D3).
 * Any future operator-facing entrypoint must admit through this function.
 *
 * ## Why every digest is recomputed
 *
 * Comparing pins against the digest fields a registry *claims* binds
 * nothing on its own: registry validation checks those fields for 64-hex
 * format, never for derivation, so a forged registry can copy a pinned
 * plugin's `manifestDigest`/`sourceDigest` onto a descriptor whose actual
 * fields or on-disk files differ. This function therefore recomputes
 * everything it relies on (slice plan, D7), each leg from a source the
 * descriptor does not control:
 *
 * - `manifestDigest` from the descriptor's own canonical fields, via the
 *   generator's `normalizeManifest`/`computeManifestDigest`.
 * - `sourceDigest` from the plugin's real tree under `pluginsRoot`, via the
 *   generator's `sourceDigest` helper -- one canonical implementation, not a
 *   copy that must never drift.
 * - the on-disk `manifest.json` in that tree, normalized and digested,
 *   required to equal the same `manifestDigest`. Without this leg the two
 *   manifest representations are only *jointly* pinned: `sourceDigest`
 *   covers the file's bytes and `manifestDigest` covers the descriptor's
 *   fields, but nothing requires them to agree, so a launch that reads
 *   `manifest.json` from the tree could read fields admission never approved.
 * - the three executor commitments (`runnerDigest`, `imageDigest`,
 *   `profileDigest`) via `computeSpawnPluginArtifactCommitments`, from the
 *   harness tree under `pnhRoot` and that same plugin tree -- never from the
 *   descriptor.
 * - `versionDigest` last, refolded from the *pinned* manifest and source
 *   digests plus those *recomputed* commitments.
 *
 * That last ordering is the whole point of the cycle-3 change. Recomputing
 * `versionDigest` from the descriptor's own claimed commitment slots checks
 * only that a forger did the arithmetic consistently; a forger who swaps
 * `imageDigest` and refolds `versionDigest` to match passes. Recomputing the
 * commitments first and refolding from those makes the descriptor's claims
 * unusable as their own evidence.
 *
 * ## Scope of the commitment leg -- read this before trusting it
 *
 * `computeSpawnPluginArtifactCommitments` derives the commitments **the
 * spawn executor** uses. This admission path is therefore spawn-executor
 * scoped: for a spawn plugin all three commitments are genuinely anchored,
 * and a swapped `imageDigest` is caught here rather than at launch. It says
 * nothing about a Docker-executor plugin, whose `imageDigest` names an image
 * in a daemon this process cannot hash. That remains a named Deferred gap;
 * do not read "commitments are recomputed" as "image provenance is
 * verified".
 *
 * ## This function writes nothing (cycle 5, D8)
 *
 * Verifying a tree the caller can still swap afterwards proves nothing about
 * what later gets launched -- but the answer to that is not to capture the
 * bytes here, it is to re-derive them there. Cycles 3 and 4 had admission copy
 * each pinned tree into a read-only snapshot and hand launch a
 * `pluginId -> snapshot root` map; two review cycles found their defects
 * concentrated in that machinery and the owner dropped it. Admission now reads
 * each plugin's real tree under `pluginsRoot` and returns. The gap between
 * "the tree admission approved" and "the tree the process executes" is closed
 * at the other end: `createOwnerApprovedPluginSpawnLaunchSpec` re-derives the
 * manifest digest and `sourceDigest` from whatever root it is handed and
 * refuses anything that does not match the admitted descriptor, so WHICH tree
 * the caller names stops mattering -- only matching bytes can launch.
 *
 * `sourceDigest` requires the directory listing to equal
 * `["manifest.json", ...descriptor.files]` exactly -- an undeclared file is a
 * failure, not an ignored extra. It is checked here, against the real tree,
 * because that is the only place an undeclared file is visible at all: the
 * digest covers only the files the descriptor names, so a tree carrying an
 * extra one hashes to the pinned value while shipping bytes nobody pinned. Its
 * failures fold into `source-digest-derivation` -- the same leg, one directory
 * listing earlier.
 *
 * Order matters: pin membership and every descriptor-derived check run before
 * anything reads a file body, so an unpinned or unrecognised plugin costs one
 * directory listing rather than a full hash of whatever it declared. The
 * residual is that a *pinned* plugin's declared files must still be read to be
 * hashed, and this slice imposes no byte budget on that (see Risks).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  admitRegistryBytes,
  type AdmissionTicket,
  type RegistryAdmissionResult,
} from "./admission-ticket.ts";
import {
  hasDuplicateMembers,
  loadPluginPinRecord,
  type PluginPinRecord,
} from "./plugin-pins.ts";
import { computeSpawnPluginArtifactCommitments } from "./plugin-spawn-launch-spec.ts";
import {
  computeManifestDigest,
  computeVersionDigest,
  normalizeManifest,
  sourceDigest,
} from "../scripts/generate-plugin-registry.ts";

const approvedTickets = new WeakSet<object>();

export interface OwnerApprovedAdmissionTicket {
  readonly ticket: AdmissionTicket;
  /**
   * The plugin ids this admission approved. Equal to `ticket.order` under D1's
   * exact-set equality; carried explicitly so the launch path (D8) can refuse
   * an id outside the approved set without re-deriving that equality.
   */
  readonly pinnedPluginIds: readonly string[];
}

export type PinnedRegistryAdmissionFailureCode =
  | Extract<RegistryAdmissionResult, { ok: false }>["code"]
  | "pin-record"
  | "unpinned-plugin"
  | "pinned-plugin-missing"
  | "pin-digest-mismatch"
  | "manifest-file"
  | "manifest-digest-derivation"
  | "version-digest-derivation"
  | "source-digest-derivation"
  | "commitment-mismatch";

export type PinnedRegistryAdmissionResult =
  | { ok: true; ticket: OwnerApprovedAdmissionTicket }
  | { ok: false; code: PinnedRegistryAdmissionFailureCode };

/**
 * `sourceDigest`'s exact-listing precondition: the directory must contain
 * `["manifest.json", ...files]` and nothing else. The digest covers only the
 * declared files, so an undeclared one is invisible to it -- a tree carrying
 * an extra file hashes to the pinned value while shipping bytes nobody
 * pinned. One `readdirSync`, no file bodies: this runs before anything is
 * hashed so an unexpected tree costs a listing rather than a full read.
 */
/**
 * True when `directory` holds exactly `manifest.json` plus `files` and nothing
 * else. Exported because Task 2b's launch path must apply the same rule: an
 * undeclared file is invisible to `sourceDigest`, so if admission refuses one
 * and launch does not, the two ends disagree about what the approved tree is.
 * One function, so they cannot drift apart.
 */
export function hasExactListing(directory: string, files: readonly string[]): boolean {
  const expected = ["manifest.json", ...files].sort();
  let entries: string[];
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return false;
  }
  return (
    entries.length === expected.length && entries.every((entry, index) => entry === expected[index])
  );
}

export function isOwnerApprovedAdmissionTicket(
  value: unknown,
): value is OwnerApprovedAdmissionTicket {
  return typeof value === "object" && value !== null && approvedTickets.has(value);
}

export function admitPinnedRegistryBytes(
  bytes: Uint8Array,
  pnhRoot: string,
  pluginsRoot: string,
): PinnedRegistryAdmissionResult {
  let pins: PluginPinRecord;
  try {
    pins = loadPluginPinRecord(pnhRoot);
  } catch {
    return { ok: false, code: "pin-record" };
  }
  if (!(bytes instanceof Uint8Array)) return { ok: false, code: "digest-format" };

  const admitted = admitRegistryBytes(bytes, createHash("sha256").update(bytes).digest("hex"));
  if (!admitted.ok) return admitted;

  const pinned = new Map(pins.plugins.map((entry) => [entry.id, entry] as const));
  const approvedIds: string[] = [];
  for (const plugin of admitted.ticket.plugins) {
    const pin = pinned.get(plugin.id);
    if (pin === undefined) return { ok: false, code: "unpinned-plugin" };
    if (pin.manifestDigest !== plugin.manifestDigest || pin.sourceDigest !== plugin.sourceDigest) {
      return { ok: false, code: "pin-digest-mismatch" };
    }

    // The claimed manifestDigest must actually derive from the descriptor's
    // own manifest fields, put through the generator's canonical form (fixed
    // key order, sorted collections -- a forger's key order cannot matter).
    const normalized = normalizeManifest({
      id: plugin.id,
      version: plugin.version,
      apiVersion: plugin.apiVersion,
      kind: plugin.kind,
      compatibility: plugin.compatibility,
      entrypoint: plugin.entrypoint,
      files: plugin.files,
      dependencies: plugin.dependencies,
      requestedCapabilities: plugin.requestedCapabilities,
      license: plugin.license,
    });
    if (normalized === null || computeManifestDigest(normalized) !== plugin.manifestDigest) {
      return { ok: false, code: "manifest-digest-derivation" };
    }

    // Everything above is derived from the descriptor and the pin file. Only
    // now does this function touch the plugin's tree, and only for a plugin
    // the owner pinned (cycle 5, D7 ordering).
    const pluginRoot = resolve(pluginsRoot, plugin.id);

    // The listing check first -- one readdir, no file bodies -- then the hash.
    // `sourceDigest`'s own error code is "source-tree"; all three outcomes mean
    // the same thing here: the tree at `pluginRoot` is not the pinned tree.
    if (!hasExactListing(pluginRoot, plugin.files)) {
      return { ok: false, code: "source-digest-derivation" };
    }
    const recomputedSource = sourceDigest(pluginRoot, plugin.id, plugin.files);
    if (!recomputedSource.ok || recomputedSource.digest !== plugin.sourceDigest) {
      return { ok: false, code: "source-digest-derivation" };
    }

    // Bind the two manifest representations to each other: the file a launch
    // would read must normalize to the same digest as the descriptor's fields.
    //
    // The duplicate-member scan is the same one the pin file gets (Task 1).
    // `JSON.parse` keeps the LAST of duplicate members, so a manifest carrying
    // two `entrypoint` members normalizes to one value while `sourceDigest`
    // covers raw bytes containing both. Those two stay consistent with each
    // other, so admission would pass -- while any other consumer that resolves
    // duplicates differently reads a manifest this admission never approved.
    let onDiskManifest: unknown;
    try {
      const manifestText = readFileSync(resolve(pluginRoot, "manifest.json"), "utf8");
      onDiskManifest = JSON.parse(manifestText);
      if (hasDuplicateMembers(manifestText)) return { ok: false, code: "manifest-file" };
    } catch {
      return { ok: false, code: "manifest-file" };
    }
    const normalizedOnDisk = normalizeManifest(onDiskManifest);
    if (
      normalizedOnDisk === null ||
      computeManifestDigest(normalizedOnDisk) !== plugin.manifestDigest
    ) {
      return { ok: false, code: "manifest-file" };
    }

    // Commitments come from the harness tree and the plugin tree, never from
    // the descriptor. A throw here means the harness tree could not be read,
    // which is equally a refusal to certify these three slots.
    let commitments;
    try {
      commitments = computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot });
    } catch {
      return { ok: false, code: "commitment-mismatch" };
    }
    if (
      commitments.runnerDigest !== plugin.runnerDigest ||
      commitments.imageDigest !== plugin.imageDigest ||
      commitments.profileDigest !== plugin.profileDigest
    ) {
      return { ok: false, code: "commitment-mismatch" };
    }

    // Refold from pinned identity + recomputed commitments. Reaching this
    // check means all five inputs are already independently verified, so it
    // catches exactly one remaining forgery: a versionDigest that is simply
    // wrong. It stays because the ticket's pluginSetDigest is built from
    // versionDigest (`admission-ticket.ts:67`), and an unverified value must
    // not reach it.
    const expectedVersionDigest = computeVersionDigest(pin.manifestDigest, pin.sourceDigest, {
      runnerDigest: commitments.runnerDigest,
      imageDigest: commitments.imageDigest,
      profileDigest: commitments.profileDigest,
    });
    if (expectedVersionDigest !== plugin.versionDigest) {
      return { ok: false, code: "version-digest-derivation" };
    }

    approvedIds.push(plugin.id);
    pinned.delete(plugin.id);
  }
  if (pinned.size > 0) return { ok: false, code: "pinned-plugin-missing" };

  const approved: OwnerApprovedAdmissionTicket = Object.freeze({
    ticket: admitted.ticket,
    pinnedPluginIds: Object.freeze([...approvedIds]) as readonly string[],
  });
  approvedTickets.add(approved);
  return { ok: true, ticket: approved };
}
```

`Object.freeze` on the id array is real immutability, unlike the frozen `Map`
the superseded snapshot design carried (a frozen `Map` still accepts
`set`/`delete`). The wrapper's own defence remains the private WeakSet,
exactly as in `admission-ticket.ts`: a forged object with the right shape is
not branded, and `isOwnerApprovedAdmissionTicket` answers false for it.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx tsx --test pnh/tests/pinned-admission.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the conformance, then full suite + commit**

First, D6's one-line `invariants.yaml` edit: append
`pnh/tests/pinned-admission.test.ts` to PNH-INV-29's `conformance` list (the
entry at `pnh/contracts/invariants.yaml:378-390`), as a single new line under
the existing `- pnh/tests/admission-ticket.test.ts`. Change nothing else in
that entry — no `statement`, `bounds`, or `status` edit.

This is lock-neutral by D6: `bindingHash` covers `statement` and `bounds`
only, so the conformance-list addition changes no lock hash and needs no
amendment. `npm run test:constitution` must therefore stay green with **no**
lock file change and **no** amendment record.

Registering this file is what makes the brand's negative test load-bearing.
PNH-INV-29 is about owner-approved digest-bound plugin sets, and the test
that a raw self-hashed registry's ticket is *not* owner-approved is the only
executable statement of where that approval boundary sits. Left unregistered
it would be an ordinary test that a future refactor could delete without the
constitution noticing; registered, `constitution-gate` runs it.

Then regenerate the constitution, **before** running the suite:

```
npx tsx pnh/scripts/generate-constitution.ts --write
```

This is not optional and not cosmetic (cycle 5, pass-5 Critical 2). The
generator renders each invariant's conformance list into
`docs/plans/provider-neutral-harness/constitution.md`, and
`constitution-gate` check 5 asserts the committed file equals what the
generator would render right now. Appending a conformance entry without
regenerating therefore fails the gate on drift — the edit above is
lock-neutral, but it is not render-neutral. `npm run test:constitution`
contains no regeneration step of its own, so nothing else in this task will
do it for you. Commit the regenerated file with the rest of the task; it is
a generated artifact and must never be hand-edited.

Run: `npm run test:pnh && npm run test:constitution`
Expected: green — including `constitution-gate` now executing
`pinned-admission.test.ts` as PNH-INV-29 conformance.

One expectation worth stating, because the cycle-4 runner-digest edit in Step
3 changes what `computeSpawnRunnerDigest` computes:
`pnh/tests/plugin-spawn-launch-spec.test.ts` must stay green unmodified. It
recomputes commitments through `computeSpawnPluginArtifactCommitments` and
compares them against the resolver's own recomputation rather than asserting
digest literals, and its `"c".repeat(64)` values are deliberately-wrong inputs
to the mismatch tests, not expected outputs. If a test there goes red, it is
asserting a hard-coded digest that the amendment invalidated — fix the literal
and say so in the commit; do not narrow the `sources` change to keep it green.

Commit: `feat(pnh): admit registries through owner pins, re-derived from disk`

<!-- model: opus -->

### Task 2b: Owner-approved spawn launch that re-derives the admitted digests

The defect this task closes is not in admission — it is in the seam after it.
`createAdmittedPluginSpawnLaunchSpec` takes `pluginRoot` from its caller and
never asks whether that root holds the bytes admission verified. Everything
Task 2 proves is therefore proved about a directory the launch path is free to
ignore: a caller can admit `/opt/pnh/plugins` and launch `/tmp/mine`, and no
check anywhere refuses it, because the commitment re-derivation at
`plugin-spawn-launch-spec.ts:307` covers `manifest.json` and the entrypoint
only — a tree that satisfies those two passes, whoever wrote it and whatever
else it contains.

This task adds an entry point that still takes a `pluginRoot` and closes the
defect anyway, by **re-deriving the full admitted identity from that root**
before it will build a spec: the normalized manifest digest and the
`sourceDigest` over every declared file, each required to equal what the
admitted descriptor carries. The question "is this the right directory?" is
replaced by "does this directory hold the right bytes?", which is the question
that was actually worth asking — the path is not the guarantee, the bytes are.

**Files:**
- Create: `pnh/runtime/pinned-spawn-launch.ts`
- Test: `pnh/tests/pinned-spawn-launch.test.ts`

**Interfaces:**
- Consumes: `OwnerApprovedAdmissionTicket`,
  `isOwnerApprovedAdmissionTicket`, `admitPinnedRegistryBytes`,
  `hasExactListing` (Task 2);
  `createAdmittedPluginSpawnLaunchSpec`, `type PluginSpawnLaunchSpec`
  (`pnh/runtime/plugin-spawn-launch-spec.ts:298`, unchanged); `sourceDigest`,
  `normalizeManifest`, `computeManifestDigest` (generator exports, Task 2
  Step 0); `resolveAdmittedPlugin` (`pnh/runtime/admission-ticket.ts`,
  unchanged).
- Produces:
  - `createOwnerApprovedPluginSpawnLaunchSpec(options: { ticket: OwnerApprovedAdmissionTicket; pluginId: string; pnhRoot: string; pluginRoot: string }): PluginSpawnLaunchSpec`
  - `assertOwnerApprovedLaunchSpecUnchanged(options: { ticket: OwnerApprovedAdmissionTicket; pluginId: string; spec: PluginSpawnLaunchSpec }): void`
    (cycle 4, re-signatured cycle 5) — the re-derivation on its own, so it can
    be run at a second moment. It is the final gate of the function above *and*
    a documented obligation on the pinned path's caller, who must call it
    immediately before handing the spec to the spawn supervisor. Throws
    `Error("owner-approved plugin tree changed after launch spec creation")`.
    It takes the **spec** and re-derives against `spec.cwd` — the exact
    directory the supervisor will `chdir` into (`plugin-spawn-supervisor.mjs`,
    `spawnChild`) — rather than looking a root up from anywhere else. A
    re-check that verifies a directory chosen by a different mechanism than the
    one the spec froze checks the wrong thing; that indirection was pass-5's
    Critical 1 and is gone. D8's cycle-4 amendment records why this is
    caller-side: the spawn site itself is zero-edit, so the check can be moved
    next to the spawn but not inside it, and a window remains.

`createAdmittedPluginSpawnLaunchSpec` is **not** modified. Its signature is
public and its existing test file exercises it directly; changing it would
turn a scoped addition into a breaking change for a call site this slice does
not own. The additive entry point is strictly stronger — it accepts a
narrower ticket type and verifies the whole declared tree rather than two
files — so a caller that wants the guarantee opts into it by importing the new
function. What that leaves open is stated in Deferred: the old entry point
still exists and still accepts any root, and nothing in this slice forces
callers off it.

- [ ] **Step 1: Write the failing test**

The fixture below deliberately re-declares a trimmed copy of Task 2's
`fabricatePnhRoot` rather than importing it: importing from
`pinned-admission.test.ts` would execute that file's whole suite as a side
effect of the import. The copy is smaller (one plugin, no forgery helpers)
and the cost is that the four harness paths in `HARNESS_FILES` now appear in
three test files — this one, Task 2's, and Task 3's — and must move together.

The plugin declares **two** files, `index.mjs` and `lib.mjs`, and only
`index.mjs` is the entrypoint. That is what makes the re-derivation in Step 3
falsifiable: `imageDigest` covers `manifest.json` and the entrypoint only, so
tampering with `lib.mjs` is invisible to the commitment check the existing
launch path already performs, and is caught only by the `sourceDigest`
re-derivation this task adds.

```ts
// pnh/tests/pinned-spawn-launch.test.ts
import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admitRegistryBytes } from "../runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  type OwnerApprovedAdmissionTicket,
} from "../runtime/pinned-admission.ts";
import {
  assertOwnerApprovedLaunchSpecUnchanged,
  createOwnerApprovedPluginSpawnLaunchSpec,
} from "../runtime/pinned-spawn-launch.ts";
import { computeSpawnPluginArtifactCommitments } from "../runtime/plugin-spawn-launch-spec.ts";
import { generatePluginRegistry } from "../scripts/generate-plugin-registry.ts";

const REAL_PNH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HARNESS_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "spawn-profile.json"],
  ["kernel", "plugin-runner", "entrypoint.mjs"],
  ["sdk", "protocol.ts"],
  ["harness", "plugin-spawn-supervisor.mjs"],
];

const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

interface Fixture {
  readonly pnhRoot: string;
  readonly pluginsRoot: string;
  /** `resolve(pluginsRoot, "alpha")` — the real tree, which the caller names. */
  readonly pluginRoot: string;
  /** An empty scratch directory outside `pluginsRoot`, cleaned up with it. */
  readonly elsewhere: string;
  readonly registryBytes: Uint8Array;
  readonly registryDigest: string;
  readonly ticket: OwnerApprovedAdmissionTicket;
}

function withFixture<T>(body: (fixture: Fixture) => T): T {
  const pnhRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-root-"));
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-plugins-"));
  const elsewhere = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-elsewhere-"));
  try {
    for (const segments of HARNESS_FILES) {
      const target = resolve(pnhRoot, ...segments);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(REAL_PNH_ROOT, ...segments), target);
    }
    mkdirSync(resolve(pnhRoot, "contracts"), { recursive: true });

    const pluginRoot = resolve(pluginsRoot, "alpha");
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(
      resolve(pluginRoot, "manifest.json"),
      JSON.stringify({
        id: "alpha",
        version: "1.0.0",
        apiVersion: 1,
        kind: "tool",
        compatibility: { kernelApiVersion: "pnh-kernel-v1" },
        entrypoint: "index.mjs",
        files: ["index.mjs", "lib.mjs"],
        dependencies: [],
        requestedCapabilities: [],
        license: { spdxId: "MIT", holder: "PNH" },
      }),
    );
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export * from './lib.mjs';\n");
    writeFileSync(resolve(pluginRoot, "lib.mjs"), "export async function handle() { return 1; }\n");

    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot }),
      },
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);

    const plugin = generated.registry.plugins[0];
    if (plugin === undefined) throw new Error("expected one generated plugin");
    writeFileSync(
      resolve(pnhRoot, "contracts", "plugin-pins.json"),
      JSON.stringify({
        version: "pnh-plugin-pins-v1",
        environment: "production",
        plugins: [
          {
            id: plugin.id,
            manifestDigest: plugin.manifestDigest,
            sourceDigest: plugin.sourceDigest,
          },
        ],
      }),
    );

    const admitted = admitPinnedRegistryBytes(generated.bytes, pnhRoot, pluginsRoot);
    if (!admitted.ok) throw new Error(`fixture admission failed: ${admitted.code}`);
    return body({
      pnhRoot,
      pluginsRoot,
      pluginRoot,
      elsewhere,
      registryBytes: generated.bytes,
      registryDigest: generated.registryDigest,
      ticket: admitted.ticket,
    });
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
}

test("a root whose bytes re-derive to the admitted digests builds a spec on that root", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pnhRoot,
      pluginRoot,
    });
    assert.equal(spec.pluginId, "alpha");
    // The caller named this root and the function accepted it -- because its
    // bytes re-derived to the manifest digest and sourceDigest the owner
    // pinned, not because of where it sits.
    assert.equal(spec.cwd, resolve(pluginRoot));
    assert.equal(spec.entrypointPath, resolve(pluginRoot, "index.mjs"));
  });
});

test("an ordinary admission ticket is refused: integrity is not owner approval", () => {
  withFixture(({ registryBytes, registryDigest, pluginRoot, pnhRoot }) => {
    // The D3 bypass, tested at the seam it actually mattered at. This ticket
    // is genuine -- admitRegistryBytes issued it and isAdmissionTicket says
    // so -- and before the brand it was accepted here, which meant every
    // guarantee Task 2 establishes could be skipped by admitting the same
    // bytes directly.
    const raw = admitRegistryBytes(registryBytes, registryDigest);
    assert.equal(raw.ok, true);
    if (raw.ok) {
      assert.throws(
        () =>
          createOwnerApprovedPluginSpawnLaunchSpec({
            ticket: raw.ticket as unknown as OwnerApprovedAdmissionTicket,
            pluginId: "alpha",
            pnhRoot,
            pluginRoot,
          }),
        /unverified owner-approved admission ticket/,
      );
    }
  });
});

test("a forged ticket-shaped object is refused", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const forged = {
      ticket: ticket.ticket,
      pinnedPluginIds: ["alpha"],
    } as unknown as OwnerApprovedAdmissionTicket;
    assert.throws(
      () =>
        createOwnerApprovedPluginSpawnLaunchSpec({
          ticket: forged,
          pluginId: "alpha",
          pnhRoot,
          pluginRoot,
        }),
      /unverified owner-approved admission ticket/,
    );
  });
});

test("an unknown plugin id is refused", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    assert.throws(
      () =>
        createOwnerApprovedPluginSpawnLaunchSpec({
          ticket,
          pluginId: "zeta",
          pnhRoot,
          pluginRoot,
        }),
      /admitted plugin not found/,
    );
  });
});

test("a root whose declared files differ is refused, even where imageDigest cannot see it", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    // lib.mjs is declared but is not the entrypoint, so imageDigest does not
    // cover it: the commitment check inside the delegate would pass on this
    // tree. Only the sourceDigest re-derivation this task adds refuses it.
    const tampered = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, tampered, { recursive: true });
    writeFileSync(resolve(tampered, "lib.mjs"), "export async function handle() { return 2; }\n");
    assert.throws(
      () =>
        createOwnerApprovedPluginSpawnLaunchSpec({
          ticket,
          pluginId: "alpha",
          pnhRoot,
          pluginRoot: tampered,
        }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("a root whose manifest.json differs is refused, though no declared file changed", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    // manifest.json is not in `files`, so sourceDigest does not cover it. The
    // manifest-digest leg of the re-derivation is what catches this, which is
    // why both legs are checked and not just the cheaper one.
    const restamped = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, restamped, { recursive: true });
    writeFileSync(
      resolve(restamped, "manifest.json"),
      JSON.stringify({
        id: "alpha",
        version: "9.9.9",
        apiVersion: 1,
        kind: "tool",
        compatibility: { kernelApiVersion: "pnh-kernel-v1" },
        entrypoint: "index.mjs",
        files: ["index.mjs", "lib.mjs"],
        dependencies: [],
        requestedCapabilities: [],
        license: { spdxId: "MIT", holder: "PNH" },
      }),
    );
    assert.throws(
      () =>
        createOwnerApprovedPluginSpawnLaunchSpec({
          ticket,
          pluginId: "alpha",
          pnhRoot,
          pluginRoot: restamped,
        }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("a digest-identical copy at a different path is ACCEPTED, and that is correct", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    // Not a gap -- the guarantee. The owner pinned bytes, not a path. A tree
    // that hashes to the pinned manifest digest and sourceDigest IS the
    // approved plugin, wherever it sits; refusing it would mean the check was
    // really about location, and a location check is what the cycle-3/4
    // snapshot design tried and failed to make unforgeable. Anyone who can
    // write digest-identical bytes at a second path could equally have written
    // them at the first.
    const copy = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, copy, { recursive: true });
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pnhRoot,
      pluginRoot: copy,
    });
    assert.equal(spec.cwd, resolve(copy));
    assert.notEqual(spec.cwd, resolve(pluginRoot));
  });
});

test("a tree edited after the spec was built is caught by the pre-spawn re-check", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    // The cycle-4 Critical, as a test. The spec is built while the tree is
    // still intact, so the digest gate passes and hands back a perfectly good
    // spec -- and then the window opens. Whoever holds that spec must
    // re-assert before spawning, or the supervisor launches bytes nothing
    // verified.
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pnhRoot,
      pluginRoot,
    });
    assert.doesNotThrow(() =>
      assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }),
    );

    writeFileSync(resolve(pluginRoot, "lib.mjs"), "export async function handle() { return 3; }\n");

    // The spec is unchanged and still names the same cwd -- which is the whole
    // problem: a spec cannot tell you the tree beneath it moved.
    assert.equal(spec.cwd, resolve(pluginRoot));
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("the pre-spawn re-check follows the spec's own cwd, not any other root", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    // Pass-5 Critical 1, as a test. The spec was frozen against the copy, so
    // the copy is what must be re-verified. A re-check that resolved its root
    // by any other means would read the untouched original here, pass, and let
    // the supervisor chdir into the tampered tree the spec actually names.
    const copy = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, copy, { recursive: true });
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pnhRoot,
      pluginRoot: copy,
    });
    writeFileSync(resolve(copy, "lib.mjs"), "export async function handle() { return 4; }\n");
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("the pre-spawn re-check refuses an unbranded ticket, with the one brand message", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pnhRoot,
      pluginRoot,
    });
    const forged = {
      ticket: ticket.ticket,
      pinnedPluginIds: ["alpha"],
    } as unknown as OwnerApprovedAdmissionTicket;
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket: forged, pluginId: "alpha", spec }),
      /unverified owner-approved admission ticket/,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test pnh/tests/pinned-spawn-launch.test.ts`
Expected: FAIL — cannot find module `../runtime/pinned-spawn-launch.ts`.

- [ ] **Step 3: Minimal implementation**

```ts
// pnh/runtime/pinned-spawn-launch.ts
/**
 * The spawn launch path for owner-approved tickets.
 *
 * `createAdmittedPluginSpawnLaunchSpec` accepts `pluginRoot` from its caller
 * and asks only that the tree satisfy the descriptor's `imageDigest`, which
 * covers `manifest.json` and the entrypoint. A tree that reproduces those two
 * files and differs everywhere else launches, whoever wrote it.
 *
 * This entry point takes the same `pluginRoot` and answers the harder
 * question: does this directory hold the bytes the owner pinned? It re-derives
 * the plugin's full admitted identity from the supplied root -- the normalized
 * manifest digest and the `sourceDigest` over every declared file -- and
 * refuses unless both equal what the admitted descriptor carries (D8, cycle-5
 * amendment).
 *
 * That is why there is no need to constrain WHICH root the caller names. The
 * cycle-3/4 design tried to answer "is this the blessed directory?" by handing
 * the caller a path it did not choose; a path is only ever a proxy for its
 * contents, and the proxy is what kept breaking. Re-derivation checks the
 * contents directly, so naming a different directory buys an attacker nothing
 * unless they can put the pinned bytes in it -- and if they can do that, they
 * could have put them in the original.
 *
 * Three gates precede the delegation:
 *
 * 1. The ticket must carry the owner-approved brand. An ordinary
 *    `AdmissionTicket` is refused even though it is genuine, because
 *    `admitRegistryBytes` proves integrity and not approval (D3) -- accepting
 *    one here would let a caller reproduce the whole launch path from
 *    self-hashed bytes.
 * 2. The plugin id must be one the ticket approved.
 * 3. The supplied root must re-derive to the admitted `manifestDigest` and
 *    `sourceDigest`. Both legs, because neither covers the other:
 *    `manifest.json` is not in `files`, and the declared files are not in the
 *    manifest digest.
 *
 * Digest equality is over the *normalized* manifest, matching how the pin was
 * computed. Two manifests whose raw bytes differ but which normalize
 * identically are, for this check, the same manifest -- deliberately, since
 * that is exactly what the owner pinned. The duplicate-member concern that
 * admission screens for lives in Risks.
 *
 * ## What gate 3 does NOT give you, and the call you must make (cycle 4)
 *
 * Gate 3 runs when the **spec is built**. The supervisor spawns from
 * `spec.cwd`/`spec.entrypointPath` at some later moment
 * (`plugin-spawn-supervisor.mjs:316-332`, `:464`), and this slice may not edit
 * that file, so it cannot make the spawn site verify for itself. Anything that
 * rewrites the tree in between executes unverified bytes.
 *
 * So this module exports `assertOwnerApprovedLaunchSpecUnchanged`, and the
 * pinned path's contract is: **call it as the last thing you do before handing
 * the spec to the spawn supervisor.** That is a requirement, not an
 * optimisation. It shrinks the window from "however long the spec sat around"
 * to the supervisor's own internal path from spec to `spawn`; it does not
 * remove it. Do not read this module as promising that the bytes admission
 * hashed are the bytes that execute -- the honest claim is that the tree is
 * tamper-evident by re-derivation at the latest point this slice can reach
 * (D8, cycle-4 amendment; the remainder is in Deferred).
 *
 * The re-check takes the **spec**, and re-derives against `spec.cwd`. That is
 * the directory the supervisor will actually chdir into, so it is the only
 * directory whose contents the re-check may be about. A re-check that arrived
 * at a root by some other route could pass on one tree while the supervisor
 * launched another; that was pass-5's Critical 1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAdmittedPlugin } from "./admission-ticket.ts";
import {
  hasExactListing,
  isOwnerApprovedAdmissionTicket,
  type OwnerApprovedAdmissionTicket,
} from "./pinned-admission.ts";
import {
  createAdmittedPluginSpawnLaunchSpec,
  type PluginSpawnLaunchSpec,
} from "./plugin-spawn-launch-spec.ts";
import {
  computeManifestDigest,
  normalizeManifest,
  sourceDigest,
} from "../scripts/generate-plugin-registry.ts";

/**
 * Re-derives a plugin's admitted identity from `pluginRoot` and requires it to
 * match. Shared by the two entry points below so the check cannot drift, and
 * private so no caller can invoke it against a root the spec did not name.
 */
function assertRootMatchesAdmitted(
  ticket: OwnerApprovedAdmissionTicket,
  pluginId: string,
  pluginRoot: string,
): void {
  if (!isOwnerApprovedAdmissionTicket(ticket)) {
    throw new TypeError("unverified owner-approved admission ticket");
  }
  const descriptor = resolveAdmittedPlugin(ticket.ticket, pluginId);
  if (descriptor === undefined || !ticket.pinnedPluginIds.includes(pluginId)) {
    throw new Error("admitted plugin not found");
  }

  const root = resolve(pluginRoot);
  // The listing first -- one readdir, no file bodies. An undeclared file is
  // invisible to sourceDigest, and admission refused one, so launch must too.
  if (!hasExactListing(root, descriptor.files)) {
    throw new Error("owner-approved plugin tree changed after launch spec creation");
  }

  let manifestDigest: string;
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    const normalized = normalizeManifest(parsed);
    if (!normalized.ok) {
      throw new Error("owner-approved plugin tree changed after launch spec creation");
    }
    manifestDigest = computeManifestDigest(normalized.manifest);
  } catch {
    throw new Error("owner-approved plugin tree changed after launch spec creation");
  }

  const recomputedSource = sourceDigest(root, descriptor.id, descriptor.files);
  if (
    manifestDigest !== descriptor.manifestDigest ||
    !recomputedSource.ok ||
    recomputedSource.digest !== descriptor.sourceDigest
  ) {
    throw new Error("owner-approved plugin tree changed after launch spec creation");
  }
}

/**
 * Re-derives the tree the spec froze and requires it to still equal what the
 * owner approved. Takes the spec, not a path: `spec.cwd` is the directory the
 * supervisor will chdir into, and re-verifying anything else would be checking
 * a tree nothing is about to execute.
 *
 * Two callers, on purpose: gate 3 below, and the pinned path's own caller,
 * which MUST call this immediately before handing a spec to the spawn
 * supervisor (see the header).
 *
 * Throws:
 * - `TypeError("unverified owner-approved admission ticket")` if the ticket
 *   did not come from `admitPinnedRegistryBytes`. Same string the pinned
 *   admission surface uses (D3): one brand, one rejection message.
 * - `Error("admitted plugin not found")` if the ticket approved no plugin
 *   with this id.
 * - `Error("owner-approved plugin tree changed after launch spec creation")`
 *   if `spec.cwd` no longer re-derives to the admitted digests.
 */
export function assertOwnerApprovedLaunchSpecUnchanged(options: {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly spec: PluginSpawnLaunchSpec;
}): void {
  assertRootMatchesAdmitted(options.ticket, options.pluginId, options.spec.cwd);
}

/**
 * Throws everything `assertOwnerApprovedLaunchSpecUnchanged` throws (gate 3 is
 * the same derivation), plus whatever `createAdmittedPluginSpawnLaunchSpec`
 * throws, unchanged.
 *
 * Building a spec is NOT the last check on the pinned path. Call
 * `assertOwnerApprovedLaunchSpecUnchanged` on the returned spec immediately
 * before the spawn.
 */
export function createOwnerApprovedPluginSpawnLaunchSpec(options: {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly pnhRoot: string;
  readonly pluginRoot: string;
}): PluginSpawnLaunchSpec {
  // Brand gate, id gate, and digest gate, in that order.
  assertRootMatchesAdmitted(options.ticket, options.pluginId, options.pluginRoot);

  return createAdmittedPluginSpawnLaunchSpec({
    ticket: options.ticket.ticket,
    pluginId: options.pluginId,
    pnhRoot: options.pnhRoot,
    pluginRoot: resolve(options.pluginRoot),
  });
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx tsx --test pnh/tests/pinned-spawn-launch.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm run test:pnh && npm run test:constitution`
Expected: green. `pnh/tests/plugin-spawn-launch-spec.test.ts` must stay green
untouched — this task adds a module and changes none.

Commit: `feat(pnh): launch spawn plugins only from trees that re-derive to the pins`

<!-- model: sonnet -->

### Task 3: Capability disclosure records and advisory rendering

**Files:**
- Create: `pnh/runtime/plugin-disclosure.ts`
- Test: `pnh/tests/plugin-disclosure.test.ts`

**Interfaces:**
- Consumes: `RegistryCapability`, `RegistryCapabilityCatalog`
  (`pnh/registry/schema.ts:18-21`); `AdmissionTicket`, `isAdmissionTicket`,
  `resolveAdmittedPluginOrder` (`pnh/runtime/admission-ticket.ts`, unchanged);
  `OwnerApprovedAdmissionTicket`, `isOwnerApprovedAdmissionTicket`,
  `admitPinnedRegistryBytes` (Task 2 — the brand distinguishes the two ticket
  kinds, and the admission entry point builds the integration fixture).

Disclosure accepts **either** ticket kind (D4, amended cycle 5), and says which
one it got. Cycle 3 narrowed it to the owner-approved wrapper on the reasoning
that a disclosure line asserts "an owner approved this plugin set" — but that
was the wrong repair for a real problem. Advisory logging ships independently
of pinning (`2026-08-22-subprocess-executor-decisions.md:126-130`), so a
harness running without pins had no way to disclose anything at all, and the
line's honesty problem is solved by saying what is true rather than by refusing
to speak. Forged objects are still refused: both kinds are brand-checked, so
the input is always a ticket some admission surface issued.

Every record and every rendered line therefore carries `ownerApproved`
explicitly. `true` means the ticket came from `admitPinnedRegistryBytes` and
the set matched the owner's pins; `false` means it came from
`admitRegistryBytes`, which proves the registry hashes to the digest it claims
and nothing about who approved it (D3).
- Produces:
  - `interface PluginDisclosureRecord { readonly pluginId: string; readonly version: string; readonly kind: string; readonly manifestDigest: string; readonly sourceDigest: string; readonly ownerApproved: boolean; readonly requestedBrokerCapabilities: readonly RegistryCapability[] }`
  - `describeAdmittedPluginSet(ticket: AdmissionTicket | OwnerApprovedAdmissionTicket): readonly PluginDisclosureRecord[]` (pure; throws `TypeError("unverified admission ticket")` on an object neither brand recognises; records sorted by `pluginId`; every record's `ownerApproved` reflects which brand matched)
  - `renderPluginDisclosureLines(ticket: AdmissionTicket | OwnerApprovedAdmissionTicket): readonly string[]` (pure, deterministic; **two** header lines — the first states the disclosure is advisory and enforces nothing, the second is the fixed ambient-authority caveat below)

The renderer takes the **ticket**, not a record array, and calls
`describeAdmittedPluginSet` itself (D4, amended cycle 4; the widened input type
is cycle 5's amendment and does not change this). It therefore throws on
anything unbranded, and there is no signature through which a hand-built record
can reach the `plugin disclosure:` prefix — which is what the cycle-4 amendment
was actually protecting, and it survives the widening intact.
`PluginDisclosureRecord` stays exported as a type, because it is what
`describeAdmittedPluginSet` returns and callers that want structured data
rather than lines still need to name it.

The field is named `requestedBrokerCapabilities`, not `requestedCapabilities`,
because that is exactly what it is: the broker-granted capability requests the
manifest declares. It is **not** a total authority statement. A spawn-path
plugin that requests zero capabilities still holds whatever ambient host
authority its subprocess inherits (filesystem, network), which no field in the
registry describes. Rendering an unqualified `capabilities=none` would read as
"this plugin can do nothing," which is false, so the renderer emits a fixed
second header line saying so:

```
plugin disclosure: broker-requested capabilities only; ambient executor authority (e.g. spawn-path host filesystem/network access) is not reflected here -- see the README plugin runtime trust model
```

**The `plugin disclosure:` prefix is not a trust marker, and this slice does not
make it one.** A spawn-path plugin's subprocess inherits the harness's stdout,
so a plugin can print lines with the same prefix, the same fixed caveat, and
attacker-chosen digests — the branded renderer controls what *it* emits, not
what else reaches the same stream. The mitigation this slice ships is a
requirement stated in prose and nothing more: **only lines a reader can
attribute to the harness's own composition root are disclosure**, so an
operator reading interleaved stdout must not treat the prefix as provenance.
Making that mechanically checkable means emitting disclosure as structured
events on a channel plugins cannot write to, which is a composition-root change
with its own design questions and is Deferred, not silently assumed. Recording
the requirement without the mechanism is the honest position; claiming the
brand secures the stream would not be.

- [ ] **Step 1: Write the failing test**

```ts
// pnh/tests/plugin-disclosure.test.ts
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AdmissionTicket } from "../runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  type OwnerApprovedAdmissionTicket,
} from "../runtime/pinned-admission.ts";
import {
  describeAdmittedPluginSet,
  renderPluginDisclosureLines,
  type PluginDisclosureRecord,
} from "../runtime/plugin-disclosure.ts";
import { computeSpawnPluginArtifactCommitments } from "../runtime/plugin-spawn-launch-spec.ts";
import type { RegistryCapability, RegistryCapabilityCatalog } from "../registry/schema.ts";
import { generatePluginRegistry } from "../scripts/generate-plugin-registry.ts";

// Typed, not inferred: the strict typecheck rejects a widened object literal
// where a RegistryCapability is required.
const CAP: RegistryCapability = {
  id: "clock-read",
  limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true },
};
const capabilityCatalog: RegistryCapabilityCatalog = {
  version: "pnh-capability-catalog-v1",
  capabilities: [CAP],
};

const REAL_PNH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "spawn-profile.json"],
  ["kernel", "plugin-runner", "entrypoint.mjs"],
  ["sdk", "protocol.ts"],
  ["harness", "plugin-spawn-supervisor.mjs"],
];

/**
 * Admits two plugins -- "quiet" requesting nothing and "asking" requesting
 * `askingCapabilities` -- and returns the owner-approved ticket the disclosure
 * API consumes, plus a cleanup that removes every temporary tree this call
 * created.
 *
 * Commitments are computed against the fabricated harness root rather than
 * written as placeholder digests: pinned admission recomputes all three and
 * refuses a mismatch (D7 step 3), so a placeholder now fails admission
 * outright instead of quietly passing through.
 */
function admittedTicket(askingCapabilities: readonly RegistryCapability[]): {
  ticket: OwnerApprovedAdmissionTicket;
  cleanup: () => void;
} {
  const pnhRoot = mkdtempSync(resolve(tmpdir(), "pnh-plugin-disclosure-root-"));
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-plugin-disclosure-"));
  const cleanup = () => {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  };
  try {
    for (const segments of HARNESS_FILES) {
      const target = resolve(pnhRoot, ...segments);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(REAL_PNH_ROOT, ...segments), target);
    }
    mkdirSync(resolve(pnhRoot, "contracts"), { recursive: true });

    const write = (id: string, requestedCapabilities: readonly RegistryCapability[]) => {
      const pluginRoot = resolve(pluginsRoot, id);
      mkdirSync(pluginRoot, { recursive: true });
      writeFileSync(
        resolve(pluginRoot, "manifest.json"),
        JSON.stringify({
          id,
          version: "1.0.0",
          apiVersion: 1,
          kind: "tool",
          compatibility: { kernelApiVersion: "pnh-kernel-v1" },
          entrypoint: "index.mjs",
          files: ["index.mjs"],
          dependencies: [],
          requestedCapabilities,
          license: { spdxId: "MIT", holder: "PNH" },
        }),
      );
      writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
    };
    write("quiet", []);
    write("asking", askingCapabilities);

    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: Object.fromEntries(
        ["quiet", "asking"].map((id) => [
          id,
          computeSpawnPluginArtifactCommitments({ pnhRoot, pluginRoot: resolve(pluginsRoot, id) }),
        ]),
      ),
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);

    writeFileSync(
      resolve(pnhRoot, "contracts", "plugin-pins.json"),
      JSON.stringify({
        version: "pnh-plugin-pins-v1",
        environment: "production",
        plugins: generated.registry.plugins.map((plugin) => ({
          id: plugin.id,
          manifestDigest: plugin.manifestDigest,
          sourceDigest: plugin.sourceDigest,
        })),
      }),
    );

    const admitted = admitPinnedRegistryBytes(generated.bytes, pnhRoot, pluginsRoot);
    if (!admitted.ok) throw new Error(`pinned admission failed: ${admitted.code}`);
    // Returned branded. Disclosure accepts either kind (D4, amended cycle 5),
    // so tests that want the unpinned case unwrap `.ticket` -- a genuine
    // AdmissionTicket carrying the same plugins, which is precisely the input
    // that must render with `ownerApproved=false` rather than be refused.
    return { ticket: admitted.ticket, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

test("disclosure records are sorted, deterministic, and carry the pin identity digests", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const first = describeAdmittedPluginSet(ticket);
    const second = describeAdmittedPluginSet(ticket);
    assert.deepEqual(first, second);
    assert.deepEqual(first.map((record) => record.pluginId), ["asking", "quiet"]);
    for (const record of first) {
      assert.match(record.manifestDigest, /^[0-9a-f]{64}$/);
      assert.match(record.sourceDigest, /^[0-9a-f]{64}$/);
      // The ticket came from `admitPinnedRegistryBytes`, so every record says so.
      assert.equal(record.ownerApproved, true);
    }
    // Destructured, not indexed: noUncheckedIndexedAccess types element
    // access as possibly-undefined.
    const [asking, quiet] = first;
    assert.ok(asking !== undefined && quiet !== undefined);
    assert.deepEqual(quiet.requestedBrokerCapabilities, []);
    assert.deepEqual(asking.requestedBrokerCapabilities, [CAP]);
  } finally {
    cleanup();
  }
});

test("a forged ticket-shaped object is rejected by both brands", () => {
  // Right shape, no brand. Widening the input type to accept either ticket
  // kind widens nothing for an object neither admission surface issued.
  assert.throws(
    () => describeAdmittedPluginSet({ plugins: [] } as unknown as AdmissionTicket),
    /unverified admission ticket/,
  );
});

test("a genuine unpinned ticket is described, and every record says ownerApproved=false", () => {
  // The cycle-5 pivot on D4, as a test. The inner ticket is a real
  // `admitRegistryBytes` ticket: the registry hashes to the digest it claims,
  // and nothing about who approved it is known (D3). Cycle 3 refused this
  // input outright, which left a harness running without pins unable to
  // disclose anything -- and advisory logging ships independently of pinning
  // (`2026-08-22-subprocess-executor-decisions.md:126-130`). Describing it
  // truthfully is strictly better than silence.
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const records = describeAdmittedPluginSet(ticket.ticket);
    assert.deepEqual(records.map((record) => record.pluginId), ["asking", "quiet"]);
    for (const record of records) {
      assert.equal(record.ownerApproved, false);
    }
    // Identity digests are unchanged by provenance -- only the claim about
    // approval differs between the two ticket kinds.
    const approved = describeAdmittedPluginSet(ticket);
    assert.deepEqual(
      records.map((record) => record.manifestDigest),
      approved.map((record) => record.manifestDigest),
    );
  } finally {
    cleanup();
  }
});

test("rendered lines are advisory, deterministic, and name every plugin and capability", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const lines = renderPluginDisclosureLines(ticket);
    assert.equal(lines.length, 4);
    const [header, caveat, askingLine, quietLine] = lines;
    assert.ok(
      header !== undefined &&
        caveat !== undefined &&
        askingLine !== undefined &&
        quietLine !== undefined,
    );
    assert.match(header, /advisory/);
    assert.match(header, /enforces nothing/);
    assert.match(header, /ownerApproved=true/);
    assert.match(caveat, /broker-requested capabilities only/);
    assert.match(caveat, /ambient executor authority/);
    assert.match(askingLine, /^plugin disclosure: asking@1\.0\.0 kind=tool manifest=[0-9a-f]{64} source=[0-9a-f]{64} ownerApproved=true brokerCapabilities=clock-read/);
    assert.match(quietLine, /brokerCapabilities=none$/);
  } finally {
    cleanup();
  }
});

test("an unpinned ticket renders the same lines, marked ownerApproved=false", () => {
  // Every line, not just the header: stdout interleaves, and a reader who sees
  // one plugin line in isolation must still be able to tell whether an owner
  // approved that plugin. A per-set-only marker would be a line that reads as
  // approved when it is not.
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const lines = renderPluginDisclosureLines(ticket.ticket);
    assert.equal(lines.length, 4);
    const [header, , askingLine, quietLine] = lines;
    assert.ok(header !== undefined && askingLine !== undefined && quietLine !== undefined);
    assert.match(header, /ownerApproved=false/);
    assert.match(askingLine, /ownerApproved=false/);
    assert.match(quietLine, /ownerApproved=false/);
  } finally {
    cleanup();
  }
});

test("the ambient-authority caveat is present even when nothing was requested", () => {
  // Same fixture, both plugins requesting nothing: the caveat is fixed text,
  // not a function of what was requested, and "none" must never be the whole
  // story a reader gets.
  const { ticket, cleanup } = admittedTicket([]);
  try {
    const lines = renderPluginDisclosureLines(ticket);
    const [, caveat] = lines;
    assert.ok(caveat !== undefined);
    assert.match(
      caveat,
      /ambient executor authority \(e\.g\. spawn-path host filesystem\/network access\) is not reflected here/,
    );
  } finally {
    cleanup();
  }
});

test("hand-built disclosure records cannot be rendered into disclosure lines", () => {
  // The cycle-4 Important, as a test, and it survives cycle 5's widening
  // intact. These are exactly the records `describeAdmittedPluginSet` would
  // return -- right shape, right field names, plausible digests, and an
  // `ownerApproved: true` the caller simply asserted about itself. Shape is not
  // provenance; a brand is. Widening to "either genuine ticket" does not widen
  // to "any object", so the renderer still refuses this the way describe does.
  const forged: readonly PluginDisclosureRecord[] = [
    {
      pluginId: "asking",
      version: "1.0.0",
      kind: "tool",
      manifestDigest: "a".repeat(64),
      sourceDigest: "b".repeat(64),
      ownerApproved: true,
      requestedBrokerCapabilities: [],
    },
  ];
  assert.throws(
    () => renderPluginDisclosureLines(forged as unknown as OwnerApprovedAdmissionTicket),
    /unverified admission ticket/,
  );
});
```

Note for the implementer: verify the capability limit's `version` literal
(`"pnh-capability-limit-v1"`) against `CAPABILITY_LIMIT_VERSION` in
`pnh/registry/schema.ts` when writing the test — `tsc` will catch a mismatch
against the typed `RegistryCapability`, but knowing the real constant name
saves a round trip.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test pnh/tests/plugin-disclosure.test.ts`
Expected: FAIL — cannot find module `../runtime/plugin-disclosure.ts`.

- [ ] **Step 3: Minimal implementation**

```ts
// pnh/runtime/plugin-disclosure.ts
/**
 * Capability disclosure over an admission ticket of either kind.
 *
 * The input is `AdmissionTicket | OwnerApprovedAdmissionTicket` (D4, amended
 * cycle 5), and every record and line states which one it was. Cycle 3
 * narrowed this to the owner-approved brand alone, reasoning that a disclosure
 * line asserts "an owner approved this plugin set" and an unpinned ticket
 * cannot support that claim. The premise was right and the repair was wrong:
 * advisory logging ships independently of pinning
 * (`2026-08-22-subprocess-executor-decisions.md:126-130`), so the narrowing
 * left every harness running without pins with no disclosure at all -- silence
 * where the operator wanted the truth. The claim is fixed by making it
 * accurate, not by refusing to speak: `ownerApproved=false` says exactly what
 * an `admitRegistryBytes` ticket proves, which is that the registry hashes to
 * the digest it claims and nothing about who approved it (D3).
 *
 * Forged objects are still refused. Both kinds are brand-checked -- the
 * module-private WeakSets in `pinned-admission.ts` and `admission-ticket.ts` --
 * so "either genuine ticket" is not "any object with the right shape". There is
 * one rejection message for both, `unverified admission ticket`, because from a
 * caller's side there is one failure: this did not come from an admission
 * surface.
 *
 * Both exports take the ticket, including the renderer (cycle 4). Cycle 3
 * branded describe and left render taking a record array, which put the hole
 * back one step downstream: records are plain objects, so a hand-built array
 * rendered lines indistinguishable from approved ones -- same prefix, same
 * caveat, attacker-chosen digests, and now an `ownerApproved: true` the caller
 * asserted about itself. The brand belongs on the surface an operator reads, so
 * render derives its own records and there is no unbranded way in.
 *
 * Advisory only. Capability ENFORCEMENT already exists at the grant layer
 * (`kernel/plugin-kernel.ts` builds grants from `requestedCapabilities`);
 * what was missing is the honesty surface: nothing anywhere showed an
 * operator what an admitted plugin asked for. These records and lines are
 * that surface. They enforce nothing, and say so.
 *
 * Emission is the composition root's job -- no module under `runtime/`
 * writes to a stream. "Advisory log first" is the recorded recommendation in
 * the subprocess-executor decisions doc's "Still open" section; a blocking
 * prompt is deferred with the CLI surface.
 *
 * These lines are only disclosure when a reader can attribute them to the
 * harness. A spawn-path plugin's subprocess inherits the harness's stdout, so
 * it can print the `plugin disclosure:` prefix, this caveat, and any digests it
 * likes. Nothing in this module can prevent that: it controls what the harness
 * emits, not what else reaches the same stream. The caller's obligation is
 * therefore to emit from the trusted composition root and to treat the prefix
 * as formatting rather than provenance. Making that mechanical means a
 * structured event channel plugins cannot write to, which is Deferred.
 *
 * Identity digests here are the registry's `manifestDigest`/`sourceDigest` --
 * the same pair the owner pins in `contracts/plugin-pins.json` -- so the
 * identity an operator sees and the identity the owner approved are the same
 * value.
 *
 * Scope of the capability field, stated precisely because the honest reading
 * matters: `requestedBrokerCapabilities` covers **broker-granted capability
 * requests only** -- what the manifest declares and what the grant layer
 * enforces. It is not a statement of a plugin's total authority. A spawn-path
 * plugin that requests zero capabilities still holds whatever ambient host
 * authority its subprocess inherits (filesystem and network access), which no
 * registry field describes and this module cannot see. An unqualified
 * "capabilities=none" would read as "this plugin can do nothing", which is
 * false; the renderer therefore emits a fixed caveat line naming the ambient
 * gap and pointing at the README's plugin runtime trust model section.
 */
import type { RegistryCapability } from "../registry/schema.ts";
import { isAdmissionTicket, type AdmissionTicket } from "./admission-ticket.ts";
import {
  isOwnerApprovedAdmissionTicket,
  type OwnerApprovedAdmissionTicket,
} from "./pinned-admission.ts";

export interface PluginDisclosureRecord {
  readonly pluginId: string;
  readonly version: string;
  readonly kind: string;
  readonly manifestDigest: string;
  readonly sourceDigest: string;
  /**
   * True only for a ticket `admitPinnedRegistryBytes` issued -- the owner's
   * pins matched the admitted set exactly. False for an `admitRegistryBytes`
   * ticket, which proves registry integrity and says nothing about approval.
   */
  readonly ownerApproved: boolean;
  readonly requestedBrokerCapabilities: readonly RegistryCapability[];
}

/**
 * The one gate. Checks the stronger brand first, since an
 * `OwnerApprovedAdmissionTicket` is a wrapper around an `AdmissionTicket`
 * rather than one itself, and refuses anything neither WeakSet recognises.
 */
function resolveDisclosureTicket(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): { readonly inner: AdmissionTicket; readonly ownerApproved: boolean } {
  if (isOwnerApprovedAdmissionTicket(ticket)) {
    return { inner: ticket.ticket, ownerApproved: true };
  }
  if (isAdmissionTicket(ticket)) {
    return { inner: ticket, ownerApproved: false };
  }
  throw new TypeError("unverified admission ticket");
}

export function describeAdmittedPluginSet(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): readonly PluginDisclosureRecord[] {
  const { inner, ownerApproved } = resolveDisclosureTicket(ticket);
  const records = [...inner.plugins]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((plugin) =>
      Object.freeze({
        pluginId: plugin.id,
        version: plugin.version,
        kind: plugin.kind,
        manifestDigest: plugin.manifestDigest,
        sourceDigest: plugin.sourceDigest,
        ownerApproved,
        requestedBrokerCapabilities: Object.freeze(
          plugin.requestedCapabilities.map((capability) => Object.freeze({ ...capability })),
        ),
      }),
    );
  return Object.freeze(records);
}

function renderCapabilities(capabilities: readonly RegistryCapability[]): string {
  if (capabilities.length === 0) return "none";
  return capabilities
    .map((capability) => `${capability.id}(${JSON.stringify(capability.limit)})`)
    .join(",");
}

// Fixed text, asserted verbatim by the tests: "none" must never read as
// "this plugin can do nothing".
const AMBIENT_AUTHORITY_CAVEAT =
  "plugin disclosure: broker-requested capabilities only; ambient executor authority " +
  "(e.g. spawn-path host filesystem/network access) is not reflected here -- see the " +
  "README plugin runtime trust model";

/**
 * Takes the ticket, not the records (D4, amended cycle 4). Deriving the
 * records here is the whole point: a `PluginDisclosureRecord[]` is an ordinary
 * object literal, so a `records` parameter would let any caller emit lines
 * carrying the `plugin disclosure:` prefix, arbitrary digests, a self-asserted
 * `ownerApproved=true`, and the fixed caveat that makes the output look
 * authoritative. Rejects an unbranded input with the module's one rejection
 * message.
 *
 * `ownerApproved` appears on the header line and on every plugin line. The
 * repetition is deliberate: stdout interleaves, and a reader who sees a single
 * plugin line out of context must still be able to tell whether an owner
 * approved that plugin. A marker only on the header would render lines that
 * read as approved when they are not.
 */
export function renderPluginDisclosureLines(
  ticket: AdmissionTicket | OwnerApprovedAdmissionTicket,
): readonly string[] {
  // Brand-checked here as well as in describe, so the flag on the header line
  // comes from the ticket rather than from a record that may not exist when the
  // admitted set is empty.
  const { ownerApproved } = resolveDisclosureTicket(ticket);
  const records = describeAdmittedPluginSet(ticket);
  const lines = [
    `plugin disclosure: ${records.length} plugin(s) admitted; ownerApproved=${ownerApproved}; ` +
      "this disclosure is advisory and enforces nothing",
    AMBIENT_AUTHORITY_CAVEAT,
    ...records.map(
      (record) =>
        `plugin disclosure: ${record.pluginId}@${record.version} kind=${record.kind} ` +
        `manifest=${record.manifestDigest} source=${record.sourceDigest} ` +
        `ownerApproved=${record.ownerApproved} ` +
        `brokerCapabilities=${renderCapabilities(record.requestedBrokerCapabilities)}`,
    ),
  ];
  return Object.freeze(lines);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx tsx --test pnh/tests/plugin-disclosure.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm run test:pnh && npm run test:constitution`
Expected: green.

Commit: `feat(pnh): add advisory capability disclosure over admission tickets`

### Task 4: Documentation truth updates

**Files:**
- Modify: `pnh/README.md` (the "Plugin runtime trust model" section,
  `pnh/README.md:36-60` — the final paragraph only)
- Modify: `docs/plans/provider-neutral-harness/2026-08-22-subprocess-executor-decisions.md`
  ("Still open" → the "Capability disclosure" item only; additive note)

**Interfaces:** none — prose only. No code file changes in this task.

- [ ] **Step 1: Replace the README's final trust-model paragraph**

Replace the paragraph at `pnh/README.md:56-60` ("Given that, the real
boundary … this is a stated direction, not shipped behavior.") with:

```markdown
Given that, the real boundary for the subprocess path is supply-chain
trust in the plugin itself, not runtime sandboxing. Two library mechanisms
for that now exist in code.

The first is owner-pinned plugin digests. An owner commits
`{id, manifestDigest, sourceDigest}` per plugin to
`contracts/plugin-pins.json`, and `runtime/pinned-admission.ts` admits a
registry only if the pinned set and the registry's set match exactly — no
extra plugin, no missing one. It re-derives every digest rather than
trusting what the registry claims: the manifest digest from the
descriptor's own fields, the source digest from the plugin tree on disk,
and the three executor commitments (`runnerDigest`, `imageDigest`,
`profileDigest`) by recomputation, after which the version digest is
recomputed from the pinned and recomputed values together. Two
preconditions are worth stating plainly, because they are what the
guarantee rests on. The source digest is an exact directory listing:
`manifest.json` plus every file the manifest declares and nothing else, so
an undeclared file added to a plugin tree is a refusal, not an ignored
extra — which also means a plugin whose tree legitimately carries
undeclared files cannot be pinned at all until its manifest declares them.
And the commitment recomputation covers the **spawn** executor only; the
Docker path's `imageDigest` names a container image this code cannot
rebuild, so it is still taken on trust there. On the launch side,
`runtime/pinned-spawn-launch.ts` still takes a plugin directory from its
caller, and re-derives that directory's exact file listing, normalized
manifest digest, and source digest before building a launch spec —
refusing on any mismatch with what was admitted. Which directory the
caller names therefore stops mattering: only a tree holding the bytes the
owner pinned can launch, wherever it sits. The pin file ships empty:
until an owner pins a plugin set, the pinned path refuses everything.

Three limits belong next to that, because each is a place where the
sentence above says more than the code delivers. First, the anchor: both
the pins and the harness bytes the commitments are recomputed from are
read out of the same caller-supplied `pnhRoot`, and no digest embeds an
absolute path, so a copy of the tree under a different root digests
identically. The guarantee is relative to that root, and fixing it is a
composition root's job — which this library does not ship. Second, the
tree is re-derived when a launch spec is built and again, by contract,
immediately before the spawn; it is not re-derived by the spawn itself,
so a window remains in which the owning uid can rewrite the tree between
the last check and the child process reading it. Read it as
tamper-evident, not tamper-proof. Third, the recomputed commitments name
paths, not the modules a running plugin resolves.
`kernel/plugin-runner/entrypoint.mjs`, which spawn-path plugins import to
get their protocol loop, is covered: swapping it moves `runnerDigest` and
admission refuses. But it is hashed where `pnhRoot` says it lives, at
admission time, and nothing binds that to the module the child process
actually loads later. A substituted runner is detectable; it is not
prevented.

The second is advisory capability disclosure
(`runtime/plugin-disclosure.ts`), rendering the broker capabilities each
admitted plugin requested — informational only, enforcing nothing, and
explicitly excluding the ambient host authority a subprocess plugin holds
regardless of what it requested. It accepts an admission ticket of either
kind and labels every line `ownerApproved=true` or `ownerApproved=false`,
so a harness running without pins still discloses what its plugins asked
for without implying an approval nobody gave. One caveat about where the
lines come from: a spawn-path plugin's subprocess inherits the harness's
stdout and can print the same prefix, so treat as disclosure only what
the harness itself emitted, not everything matching the format.

Neither is wired to an operator-facing surface yet: there is no CLI or
installer, nothing forces admission through the pinned path, the older
launch entry point still accepts a caller-supplied plugin directory
without re-deriving it, pin approval is ordinary git review of the
committed file, and cryptographic signing does not exist. Those remain
stated direction, not shipped behavior.
```

The wording rule (readiness plan, Phase 4, item 2): the mechanism may be
described as existing, but nothing may imply a working operator-facing
control, a signing scheme, or an enforcement effect the code does not have.

Before committing this paragraph, confirm it does not contradict Phase 4 of
the readiness plan: Phase 4's "self-consistency digest check only" claim
describes the *launch* path via `createAdmittedPluginSpawnLaunchSpec`, which
this slice leaves in place; the *admission* path now has pinning, and the
pinned launch path added here is a second entry point beside it, not a
replacement.

Phase 4 of `2026-08-22-open-source-readiness-plan.md` now carries a blocking
prerequisite note pointing at this slice by path (added in cycle 5 — a
bounded, additive edit to that plan's Phase 4 section, and the only change
this slice makes to it). Cycle 4 had left the collision flagged here and in
Risks and instructed the implementer not to touch the readiness plan at all,
which meant the warning lived only in a document Phase 4's author had no
reason to open. Phase 4's invariant wording must still account for both entry
points; that remains Phase 4's author's job, but they will now be told so
where they are working. Do not extend that note or edit anything else in the
readiness plan from this slice.

- [ ] **Step 2: Annotate the decisions doc's "Capability disclosure" item**

Append to the "Capability disclosure" paragraph in the "Still open" section
of `2026-08-22-subprocess-executor-decisions.md` (additive — do not rewrite
the existing recommendation):

```markdown
*Update 2026-08-24:* the advisory-log half shipped as library code
(`pnh/runtime/plugin-disclosure.ts`, per the supply-chain trust slice plan);
blocking prompt vs. advisory remains open exactly as recommended above, and
still waits on a CLI surface and an operator identity model.
```

- [ ] **Step 3: Full suite + commit**

Run: `npm run test:pnh && npm run test:constitution`
Expected: green (prose-only change; suite proves nothing broke by accident).

Commit: `docs(pnh): state the shipped pinning and disclosure mechanisms honestly`

### Task 5: Final verification

- [ ] **Step 1: Full suite from a clean state**

Run: `npm run test:pnh && npm run test:constitution`
Expected: typecheck clean, module-graph check clean, sandbox run green with
the four new test files discovered and passing (`plugin-pins`,
`pinned-admission`, `pinned-spawn-launch`, `plugin-disclosure`), core
coverage still 100%, constitution suite still 35+ pass / 0 fail.

- [ ] **Step 2: Self-review against this plan**

Confirm: every Grounding claim still true post-change; no file in the Global
Constraints zero-edit list was touched (`git diff --stat pnh-v2..HEAD`) —
`runtime/admission-ticket.ts` in particular must show zero changed lines,
since the brand was built as an addition beside it.
`runtime/plugin-spawn-launch-spec.ts` is the one file on that list where this
became a **bounded**-diff check rather than a zero-diff one in cycle 4: the
owner granted the third named zero-edit exception for D7's runner-digest
amendment, so the file must show exactly one added `sources` entry in
`computeSpawnRunnerDigest` plus the two corrected doc comments, and nothing
else. Read the diff, do not just count it —
`computeSpawnArtifactDigest`, `loadSpawnProfile`,
`createAdmittedPluginSpawnLaunchSpec`, and `SPAWN_RUNNER_DIGEST_VERSION` must
all be untouched, and the pinned launch path must still be an addition beside
this file rather than a change to it. Any other hunk here is a scope
violation, not a judgement call.
README wording matches
Task 4 Step 1 verbatim; new modules import only `node:` builtins,
`./admission-ticket.ts`, `./plugin-pins.ts`, `./pinned-admission.ts`,
`./plugin-spawn-launch-spec.ts`, `../registry/schema.ts`, and
`../scripts/generate-plugin-registry.ts`.

Exactly two files outside `pnh/` may appear in that diff:
`docs/plans/provider-neutral-harness/constitution.md` (regenerated in Task 2
Step 5 — the conformance lists are generator output, so a hand edit here is
the error) and
`docs/plans/provider-neutral-harness/2026-08-22-subprocess-executor-decisions.md`
(Task 4 Step 2). Anything else outside `pnh/` is out of scope for this slice.

- [ ] **Step 2b: Confirm the two gates cannot be walked around**

These are the properties the slice exists for, so check them by reading, not
by trusting the suite:

1. No exported function in `pinned-admission.ts` or `pinned-spawn-launch.ts`
   returns or accepts an `OwnerApprovedAdmissionTicket` that did not come out
   of `admitPinnedRegistryBytes` — `approvedTickets` is module-private and
   nothing adds to it elsewhere (`rg -n 'approvedTickets' pnh/`).
2. Every path into a launch spec re-derives. `createOwnerApprovedPluginSpawnLaunchSpec`
   does take a `pluginRoot` — that is the cycle-5 design, not a leak — so the
   property to check is that it cannot return a spec for a directory whose
   bytes were not re-derived and matched against the admitted descriptor:
   listing, normalized `manifestDigest`, and `sourceDigest`, all three, before
   any spec is constructed. Read the function and confirm there is no early
   return, no cached result, and no option that skips the check. Then confirm
   `assertOwnerApprovedLaunchSpecUnchanged` re-derives against `spec.cwd` and
   nothing else — no map lookup, no second parameter naming a directory,
   no caller-chosen root. A re-check that can be pointed at a different
   directory than the one the spec froze verifies the wrong tree, which is
   precisely the defect the cycle-5 pivot removed.

- [ ] **Step 3: Report**

Report the diff stat, suite results, and the two documentation deltas. Do not
push and do not merge to `pnh-v2` until the plan has been hardened and the
owner has confirmed.

## Deferred

- **Cryptographic signing of pins or registries.** Needs a key-management and
  operator-identity story that doesn't exist (D5). The README names it as
  direction.
- **Blocking install/launch-time disclosure prompt.** Waits on a CLI surface
  and operator identity model (decisions doc recommendation, adopted).
- **CLI flag surface, installer, any operator-facing wiring.** Readiness
  Global Constraints forbid pulling extraction forward; Phase 6's composition
  root is the named future consumer of `admitPinnedRegistryBytes` and the
  disclosure rendering.
- **The spawn-executor trust-boundary invariant.** Phase 4 of the readiness
  plan owns authoring it (as `proposed`, under Phase 2's activation bar).
- **Docker image-digest pinning.** The Docker path takes `imageDigest` from
  the descriptor on trust. The commitment recomputation added in Task 2 is a
  **spawn-executor mechanism**: it rebuilds the three commitments from the
  harness tree and the plugin tree, which is possible for a bare Node subprocess
  and is not possible for a container image this code neither builds nor
  pulls. For a Docker-path plugin the `imageDigest` slot is therefore still an
  unverified claim, and the recomputed `versionDigest` inherits that — it is
  coherent, not trustworthy. Pinning container images is Docker-path work with
  its own registry and build considerations, and it must land before the
  pinned path is treated as a Docker-path trust anchor.
- **Migrating callers off the unpinned launch entry point.**
  `createAdmittedPluginSpawnLaunchSpec` takes a caller-supplied `pluginRoot`
  and does not re-derive it; it is unchanged by this slice. Task 2b adds
  `createOwnerApprovedPluginSpawnLaunchSpec` beside it rather than replacing
  it — same parameter shape, re-derivation added — so the weaker path remains
  reachable by anyone who imports it. Removing or narrowing it is a breaking
  change to a public signature with an existing test file, and belongs with
  the Phase 6 composition root that will decide which entry point production
  actually uses.
- **Launch-time source coverage for the unpinned path.** Extending
  `computeSpawnArtifactDigest` beyond `manifest.json` and the entrypoint to
  every declared file. Task 2b's launch-time re-derivation closes this window
  for the pinned path only — it covers the exact listing, the normalized
  manifest, and every declared file — while a caller using the old entry point
  still gets manifest-and-entrypoint coverage over a directory nothing
  checked.
- **Making pinned admission mandatory.** Meaningful only once a production
  composition root exists; revisit when Phase 6 creates one.
- **Verification at the spawn call itself (cycle 4, unchanged by the cycle-5
  pivot).** Task 2b's `assertOwnerApprovedLaunchSpecUnchanged` moves the
  re-derivation to the last instruction this slice controls before the
  supervisor takes over,
  which shrinks the window but does not remove it: the supervisor's own path
  from spec to `spawn` (`plugin-spawn-supervisor.mjs:316-332`, `:464`) runs
  after the last check, and that file is zero-edit here. Closing it properly
  means either verifying inside the supervisor, or handing the supervisor an
  already-open handle/descriptor obtained at verification time so the path
  cannot be re-pointed or its contents rewritten in between — both of which
  change a file this slice may not touch. Belongs with whichever phase is
  allowed to edit the spawn supervisor.
- **Which runner the child actually loads (cycle 4, residue of a fix).** The
  gap cycle 4 raised — `kernel/plugin-runner/entrypoint.mjs`, the module
  spawn-path plugins import to get `runPluginLoop`, sitting outside every
  pinned and recomputed value — is **fixed in this slice, not deferred**. The
  owner granted the third named zero-edit exception, `computeSpawnRunnerDigest`
  now reads that file, and Task 2 covers it with a test (D7, cycle-4
  amendment; Global Constraints). What stays deferred is the narrower thing
  underneath it. The digest is taken over
  `<pnhRoot>/kernel/plugin-runner/entrypoint.mjs` at admission time, while the
  child process resolves the runner from its own relative import specifier at
  run time; nothing binds the second to the first. The file lives under
  `pnhRoot`, outside the plugin tree, so
  `assertOwnerApprovedLaunchSpecUnchanged` — which re-derives the plugin tree
  the spec froze — does not cover it either. Closing that means pinning the
  module the child resolves, either by re-deriving the runner alongside the
  plugin at launch time or by loading it through a path the ticket names, and
  both touch the launch and supervisor seams this slice holds still. Phase 6,
  alongside the composition root below, which is the same problem seen from
  the other end.
- **A production composition root that fixes `pnhRoot` (cycle 4).** Every
  guarantee in this slice is relative to a root the caller supplies, and that
  root feeds *both* legs: the pins that define the approved set
  (`<pnhRoot>/contracts/plugin-pins.json`) and the harness bytes the
  commitments are recomputed from. No digest embeds an absolute path, so a
  copy of the tree under a different root digests identically and admits
  identically. The fix is not another check inside these functions — a
  function cannot validate the root it was told to use — it is a composition
  root that resolves `pnhRoot` to a known location rather than accepting it as
  a parameter. That is Phase 6 work; until it exists, `pnhRoot` is trusted
  input and D3, Risks, and the README all say so.
- **Disclosure on a channel plugins cannot write to (cycle 5).** Disclosure
  lines go to stdout, and a spawn-path plugin's subprocess inherits the
  harness's stdout, so a plugin can print `plugin disclosure: ...` lines that
  are indistinguishable at the byte level from the harness's own. This slice
  answers that with a requirement in prose — only lines attributable to the
  harness's composition root are disclosure (D4, Task 3) — and ships no
  mechanism, because every mechanism worth having is a composition-root
  change. The shape of the fix is known: emit disclosure as structured events
  on a channel the child cannot reach (a dedicated fd the supervisor does not
  pass down, a callback the composition root owns, or a sink whose writer is
  not inherited), and have the reader consume events rather than scan stdout.
  The open questions are which channel, whether the child's stdout should be
  captured and re-emitted with attribution rather than passed through, and
  what the harness does when no reader is attached — all of which are the
  composition root's to answer, and none of which a pure function over a
  ticket can settle. Deferred to Phase 6 alongside the entry above. Until
  then, the prefix is a formatting convention, not a provenance claim.
- **Resource caps, WASM runtime.** Unchanged from the decisions doc's "Still
  open" recommendations.

## Risks

- **Dead-code risk: no production caller.** Nothing invokes
  `admitPinnedRegistryBytes` outside tests, because nothing invokes
  `admitRegistryBytes` outside tests either — no composition root exists.
  Mitigation: the module headers name the pinned path as the blessed
  production entrypoint; the readiness plan's Phase 6 composition root is the
  named consumer; the README says "nothing forces admission through the
  pinned path" so the gap is disclosed, not implied away.
- **Two manifest digests.** The spawn artifact digest hashes raw manifest
  bytes; the registry `manifestDigest` hashes the normalized parsed manifest.
  A pin entry hand-computed by hashing `manifest.json` bytes will never
  match. Mitigation: module headers in `plugin-pins.ts` and
  `plugin-disclosure.ts` state which digest is in play; pin entries are
  produced from registry-generator output (the Task 2 test models exactly
  this workflow).
- **Ticket ordering vs. pin ordering.** `ticket.plugins` is
  dependency-ordered (`admission-ticket.ts:63-78`); the pin file carries no
  ordering constraint at all (sorting is a formatting convention only, per
  hardening cycle 1). The set comparison is order-independent by
  construction (map-based); Task 1 tests an unsorted pin set loading, and
  Task 2's positive case writes its pins in reverse order.
- **The trust anchor is a caller-chosen root, and it feeds both legs.**
  `admitPinnedRegistryBytes` reads only `<pnhRoot>/contracts/plugin-pins.json`,
  so a caller cannot inject a pin object — but a caller who controls
  `pnhRoot` still controls which committed file is read. Cycle 4 widens this
  entry, because stating only the pin half understated it: the same `pnhRoot`
  is also where the three executor commitments are recomputed from
  (`kernel/plugin-runner/spawn-profile.json`,
  `kernel/plugin-runner/entrypoint.mjs`, `sdk/protocol.ts`,
  `harness/plugin-spawn-supervisor.mjs`). Neither `computeSpawnRunnerDigest`
  nor the spawn artifact digest embeds an absolute path — both hash file
  contents under fixed logical names — so a copy of the harness tree under a
  different root digests identically and admits identically. One caller-chosen
  value therefore decides both which plugin set counts as approved and which
  harness bytes the approval is checked against. No check inside these
  functions can fix that; a function cannot validate the root it was told to
  use. The residual is the strongest anchor available without an operator
  identity model (D5), is disclosed in D3, the module header, and the README,
  and the real fix — a composition root that fixes `pnhRoot` — is Deferred.
- **Phase 4 wording.** If the readiness plan's Phase 4 executes after this
  slice, its new invariant and README-confirmation step must describe a
  boundary that now includes pinned admission at the library layer. Cycle 5
  stopped relying on a reader of *this* plan noticing that: Phase 4 of
  `2026-08-22-open-source-readiness-plan.md` now carries a blocking
  prerequisite note naming this slice by path, so the warning sits where the
  work will actually be picked up. The note is additive and deliberately
  short — it says the dependency exists and where to look, not what Phase 4's
  text should become, because Phase 4 still owns that text. Residual: if this
  slice is abandoned rather than merged, that note becomes a pointer to
  nothing and must be removed by whoever abandons it.
- **Empty pin file misread as vacuous.** An empty pin set makes the pinned
  path refuse everything, which could read as "the feature does nothing."
  That is the correct semantic (nothing is approved yet) and is stated in
  D2, the module header, and the README paragraph.
- **Spawn launch-time file coverage: closed on the pinned path, open on the
  old one.** The window is real: `computeSpawnArtifactDigest` hashes only the
  manifest and the entrypoint
  (`pnh/runtime/plugin-spawn-launch-spec.ts:128-152`), and
  `createAdmittedPluginSpawnLaunchSpec` never references `sourceDigest` at
  all (`:298-317`), so a non-entrypoint file listed in `files` (a
  `helper.mjs` the entrypoint imports) could be swapped between admission and
  launch with nothing noticing. The pinned path narrows it by re-derivation
  (D8, amended cycle 5): `createOwnerApprovedPluginSpawnLaunchSpec` takes the
  plugin directory its caller names and, before constructing any spec,
  re-derives that directory's exact file listing, normalized `manifestDigest`,
  and full `sourceDigest`, refusing on any mismatch with the admitted
  descriptor. The caller still names the root — that is deliberate — but
  naming a different root buys nothing, because only a tree holding the bytes
  the owner pinned survives the check. "Narrows" rather than "closes": the
  re-derivation happens at spec construction and again at the pinned caller's
  pre-spawn assertion, never at the spawn itself; see the tamper-evident entry
  below for what is left. It stays open
  on `createAdmittedPluginSpawnLaunchSpec`, which this slice deliberately
  leaves reachable and unchanged — see the two Deferred entries on migrating
  callers and on coverage for the unpinned path. Corroborated independently
  by two engines in hardening cycle 2.
- **The Docker image artifact is not bound by the pin.** Pins bind plugin
  *content* (manifest + listed source files). `imageDigest` reaches the
  Docker launch path (`pnh/runtime/plugin-launch-spec.ts`, which takes it on
  trust by its own design) with nothing verifying it. The cycle-3
  commitment-recomputation leg does not change this: it recomputes the three
  executor commitments via `computeSpawnPluginArtifactCommitments`, which is
  a **spawn**-executor mechanism, so for a Docker-path plugin the
  `imageDigest` slot is still an unverified claim and the recomputed
  `versionDigest` inherits that — coherent, not trustworthy. Docker image
  provenance (pinned image digests, or build attestation) is Deferred and
  must land before the pinned path is treated as a trust anchor for the
  Docker path.
- **The D3 bypass is closed for brand-requiring consumers, not globally.**
  `admitRegistryBytes` still exists and still issues a usable
  `AdmissionTicket` from self-hashed bytes; the slice does not and must not
  remove it (D3). What cycle 3 adds is that the two consumers introduced here
  — disclosure (D4) and the pinned launch entry point (D8) — require the
  `OwnerApprovedAdmissionTicket` brand and reject a merely-admitted ticket,
  and Task 2's negative conformance test proves it. The honest residual: any
  *existing* consumer that accepts a bare `AdmissionTicket` is unaffected, so
  "owner-approved" is a property of the consumer's signature, not of the
  system.
- **Admission and launch read whole files with no size budget.** Dropping the
  copy step (D8, amended cycle 5) removed a class of disk-consumption defects
  and left one behind: every leg that digests a plugin — the on-disk manifest
  read, the `sourceDigest` recomputation at admission, and the same
  recomputation again at launch — calls `readFileSync` on each declared file
  with no cap on how large it may be. A pinned plugin declaring a
  multi-gigabyte `files` entry will be read into memory in full, three times
  over the admit-then-launch sequence, before any digest disagrees. That is a
  resource bound, not a trust bound: the bytes still have to match what the
  owner pinned, so this cannot admit a plugin that should be refused — it can
  only make refusing one expensive. The mitigating fact is that the pin file
  is owner-committed, so the input is not attacker-chosen the way registry
  bytes are; the residual matters when the owner's own tree grows unexpectedly
  or when a composition root admits on a schedule. A byte budget belongs with
  the resource caps already Deferred, not in these functions.
- **The launch-side re-derivation is tamper-evident, not tamper-proof.** D8 is
  careful about this and it is repeated here because it is the property most
  easily over-read. The plugin tree's listing, `manifestDigest`, and
  `sourceDigest` are re-derived when a launch spec is built, and re-derived
  again when the pinned path calls
  `assertOwnerApprovedLaunchSpecUnchanged` — against `spec.cwd`, the exact
  root the spec froze — immediately before handing the spec to the spawn
  supervisor. Neither is the spawn. The supervisor's own path from spec to
  `spawn` (`plugin-spawn-supervisor.mjs:316-332`, `:464`) runs after the last
  check this slice can perform, and that file is zero-edit here, so a window
  remains in which anything able to write the plugin tree can rewrite it after
  the final check and have it execute unverified. The pivot to re-derivation
  neither widened nor narrowed this window: it removed the read-only snapshot
  that made the window look smaller than it was, and the check that closes it
  is the same check in the same place. Mitigation is placement and honesty:
  the assertion sits as late as reachable, the obligation to call it is stated
  as a requirement rather than an optimisation in Task 2b's header and D8, and
  no prose in this plan claims the bytes hashed are the bytes run. Closing it
  properly is Deferred.
- **The runner entrypoint is inside the runner digest now, but the digest
  binds a path, not the module the child resolves.** Cycle 4 found
  `kernel/plugin-runner/entrypoint.mjs` — the module a spawn-path plugin
  imports to get its protocol loop — outside every pinned and recomputed
  value, and the owner granted the exception that fixed it (D7, cycle-4
  amendment). The mechanism is worth keeping straight, because the obvious
  reading is wrong: the supervisor does not load that module. It spawns the
  plugin's own entrypoint, and the runner enters the picture through the
  *plugin's* imports, which is exactly how this repo's spawn fixtures do it
  (`pnh/host-tests/fixtures/spawn-plugins/*/index.mjs` import it by relative
  path). What the fix buys is that swapping that file now moves
  `runnerDigest`, so a swapped runner fails commitment recomputation at
  admission instead of passing every check. What it does not buy is identity
  between the bytes hashed and the module the child actually loads:
  `computeSpawnRunnerDigest` reads `<pnhRoot>/kernel/plugin-runner/entrypoint.mjs`
  at admission, while the child resolves whatever its own relative specifier
  names at run time. Those coincide when `pnhRoot` is the tree the plugin
  resolves into and nothing rewrites the file in between — the same
  caller-chosen-root residual as the entry above, and the same TOCTOU window
  as the entry before it, now applied to a file that lives outside the plugin
  tree entirely. The launch-side re-derivation does not reach it: that check
  covers the manifest and the files the manifest declares, and
  `entrypoint.mjs` is neither, so `assertOwnerApprovedLaunchSpecUnchanged`
  says nothing about it.
  Read the coverage as "a substituted runner is detectable at admission", not
  as "the runner that runs is the runner we hashed".
- **Anyone sharing the harness's stdout can forge a disclosure line.** The
  `plugin disclosure:` prefix is a formatting convention, not a provenance
  marker, and a spawn-path plugin's subprocess inherits the harness's stdout
  (`plugin-spawn-supervisor.mjs`, zero-edit here), so a plugin can print lines
  with the same prefix — including `ownerApproved=true` for capabilities
  nobody approved — that are byte-identical to the harness's own. Nothing in
  this slice detects that, and adding a nonce or a signature to the line would
  not help, because whatever the harness can print into a shared stream a
  reader of that stream cannot attribute. What ships instead is a requirement
  stated in D4 and Task 3: only lines attributable to the harness's own
  composition root are disclosure. That is enforceable by whoever wires the
  composition root and by nobody else, which is why the real fix — structured
  events on a channel the child cannot write to — is Deferred rather than
  attempted here. The blast radius is bounded by what disclosure is: it
  enforces nothing, so a forged line misleads a reader without granting the
  forger anything it did not already have.
- **Duplicate JSON members: defended at both parse sites this slice owns, and
  at neither of the generator's.** Cycle 4 extracted Task 1's
  `hasDuplicateMembers` and applied it at the manifest seam in
  `pinned-admission.ts`, so the pin record and the plugin's on-disk
  `manifest.json` now reject duplicates identically. The registry generator still parses both the
  manifest and its own inputs with a bare `JSON.parse`
  (`generate-plugin-registry.ts:272-279`), which keeps the last of duplicate
  members. That site sits behind the zero-edit constraint, whose D7 exception
  permits additive exports only, so it is deliberately left alone: a manifest
  carrying two `entrypoint` members is accepted by the generator, and refused
  by admission. The two therefore disagree about the same file rather than
  both being wrong — the failure surfaces as a refusal at admission, which is
  the safe direction — but the asymmetry is real, is not fixed here, and
  belongs to whoever is next permitted to edit the generator.
- **Prose drift.** Task 4 edits two documents that other planned work (Phase
  4) will also touch, and cycle 5 added a third touchpoint in the readiness
  plan itself. All three edits are additive and scoped to a single paragraph
  or note; the hardening pass should re-check them against the readiness
  plan's Global Constraints, and Verification step 3 lists all three so a
  fourth is visible as a scope violation.

## Verification

The slice is done when:

1. `npm run test:pnh` passes — typecheck, module graph, and the sandbox run
   with `plugin-pins.test.ts`, `pinned-admission.test.ts`,
   `pinned-spawn-launch.test.ts`, and `plugin-disclosure.test.ts` discovered
   and green, core coverage 100%.
2. `npm run test:constitution` passes — with the constitution regenerated
   from `invariants.yaml` and committed, so check 5 finds no drift between
   rendered and committed conformance lists.
3. `git diff --stat pnh-v2..HEAD` shows only: four new runtime modules,
   four new test files, one new committed JSON contract file, the additive
   generator exports in `pnh/scripts/generate-plugin-registry.ts`, the
   one-line conformance addition in `pnh/contracts/invariants.yaml`, the
   regenerated `docs/plans/provider-neutral-harness/constitution.md` (whose
   conformance list is rendered from `invariants.yaml`, so the one-line
   addition necessarily moves it — see Task 2 Step 5), the README paragraph,
   the decisions-doc note, the Phase 4 prerequisite note in
   `docs/plans/provider-neutral-harness/2026-08-22-open-source-readiness-plan.md`,
   and this plan (plus its hardening report). Anything else is a scope
   violation, including a second edit to the readiness plan.
4. The README paragraph and decisions-doc note read accurately against the
   code as merged — no claim of signing, no claim of operator-facing UX, no
   claim of enforcement by disclosure.
