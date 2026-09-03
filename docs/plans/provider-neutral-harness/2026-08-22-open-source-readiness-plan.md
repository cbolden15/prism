# Open-source readiness — plan (draft)

Status: **draft, pending owner ratification.** Governance-gated: nothing in
this document authorizes publication, and no phase below authorizes the one
after it — each phase gate needs its own explicit ratification.
Date: 2026-08-22, restructured 2026-08-23 after a two-engine hardening pass
found the phase gates themselves were non-binding (see History below).
Branch: `pnh2/open-source-readiness-plan` (historical plan branch, created from
the legacy internal branch named `pnh-v2` before Phase 1)

Authorization: none. This document exists to make readiness legible and
sequenced, in direct answer to `architecture.md`'s Open-source boundary
section: *"Publication still requires new explicit approval; nothing in this
document grants it."* That sentence governs this plan too.

## History

A first draft (2026-08-22) was hardened once and had three factual errors in
its Grounding section corrected (invariant count, a false "no secrets found"
claim, and the spawn executor's already-shipped status). A second hardening
pass on the corrected draft ran full two-engine (Claude + Codex, three
findings independently corroborated by both, zero killed by audit) and
returned **rethink**: two Critical findings showed the plan's own gates
didn't actually gate (Phase 1 could close on an outcome that proves the
Option A implementation unsafe; the secrets-audit phase required no
remediation and nothing re-scanned before publication), plus eight Important
structural gaps. Per the harden skill's cap, a third automated pass was not
run at that point — a manual structural rewrite addressed all ten findings
instead (Option C now blocks Phase 1 until actually built; Phase 5 gained
remediation; Phase 6 became a real migration; a new Phase 7 covers
destination-repo hardening).

A third hardening pass, run as a deliberate exception to the cap because the
rewrite was structural rather than a repeat, found **zero Criticals** —
Claude-only (Codex timed out both this run and the prior one) but no finding
benefited from that gap in coverage: four Important findings (Phase 5's
remediation mandate had no valid target since `pnh/` still lives in the live
monorepo at that point; Phase 4's new invariant skipped Phase 2's own
activation bar by running after its checkpoint; Phase 7 assumed a CI
workflow no phase authored or hardened; Phase 6's clean-checkout claim
ignored a real dependency on `docs/plans/provider-neutral-harness/`) and one
Minor (`test:constitution` dropped from Phase 6's relocation list). All five
are fixed in this revision. Not re-hardened after this pass — three cycles
against one target is the stopping point.

## Goal

Turn "how close are we to open-sourcing Prism Harness" into a sequenced,
gated set of phases, each closed by an explicit ratification, so readiness
work doesn't get done out of order and doesn't get treated as authorization
by accident. The `pnh-v2` name appears only as a legacy internal Git branch;
it does not identify a product generation. PNH is the codebase's internal
working name, not an earlier Prism Harness release.

## Scope: what Prism Harness includes

The subprocess executor cannot be published independently of the PNH core it
extends — same repo, same contracts, same constitution, same gate. Readiness
is therefore a program-level bar (M3 completion, constitution coverage,
threat model, sanitization) with one spawn-specific requirement layered
on top: the spawn executor's own README already states its trust model is
supply-chain, not sandboxing, and that must stay honestly labeled — in
README prose now, and on every other public surface once one exists — for
as long as it ships publicly. (Authoring an invariant for that trust model
is spawn-specific too, but it lives in Phase 4 alongside the rest of the
labeling work, not as a second, separately-surfaced requirement — see the
Phase 2 note below.)

## Grounding (verified 2026-08-22, corrected 2026-08-23)

- `pnh/contracts/invariants.yaml` runs `PNH-INV-01` through `PNH-INV-46`
  (46 status-bearing entries): **7 are `active`, 39 are `proposed`.** The two
  `PNH-PROTO-*` entries carry no `status` field at all — they are protocol
  schema pins under a separate `conformance` list, not part of this
  active/proposed lifecycle, and are out of scope for Phase 2's audit.
- `pnh/contracts/registry.ts` (the `Invariant` interface and its accepted
  field set) has **no field for a `proposed` invariant's reason**, and
  rejects unknown fields outright. Phase 2 cannot literally satisfy "leave
  it proposed with a stated reason" until the registry schema itself grows
  a field for that reason.
- `pnh/contracts/conforms-to.ts` only appends an invariant ID to a list — a
  no-op if its triggering env var is unset — and
  `pnh/tests/constitution-gate.test.ts` checks only that the suite exits
  and the ID was appended, not that any real assertion ran. "Write a test
  that calls `conformsTo(...)`" is satisfiable by a test that checks
  nothing.
- `2026-08-22-m3-isolation-topology-decisions.md` Decision 5, cross-checked
  against `2026-08-22-m3-option-a-checkpoint-brief.md`'s criteria table: of
  Option A's five provisional criteria, criterion 1 **passes** (but proves
  less than its case count suggests), criteria 2, 3, and 5 are **untested**
  (criterion 3's untested surface also grew after this branch removed an
  incidental concurrency cap), and **criterion 4 (cross-plugin aggregate
  accounting and event chains) is evidenced as failing today** — not merely
  untested, a documented, currently-failing mechanism that criterion 4's own
  status distinguishes from the other three. Criterion 4 maps directly onto
  the aggregate arbiter's own Decision 4 authorization, so the arbiter is
  expected to address it — but that expectation is unverified until the
  arbiter ships and criterion 4 is specifically re-run against it, not
  assumed fixed by the arbiter's mere existence.
- `architecture.md`'s Open-source boundary section names the required
  public-release components (contracts, generic runtime, SDK, kernel,
  broker protocol, conformance tests, a license inventory, third-party
  notices) and the required exclusions (X1/C3 adapters, live credentials,
  private evidence, production repository content) — but states
  publication itself needs new approval regardless. It names what the
  *published tree* must exclude; it says nothing about the *destination
  repository's* own access controls (branch protection, required review,
  2FA), which is a separate gap this plan must own (Phase 7 below).
- No `LICENSE` file exists anywhere in this repository.
- No PNH-scoped threat model exists. `architecture.md`'s Security invariants
  section names the DSH threat model (2026-08-19, review-passed) as a
  "starting input" that "transfers to this harness largely unchanged," not
  as a completed PNH document.
- A keyword grep (`api[_-]?key|secret|token|password|credential`) over
  `pnh/`'s `.ts`/`.mjs`/`.json` files returns real matches (re-run count
  varies 20-218 by glob scope) — e.g. `pnh/core/broker.ts` (a comment: "the
  broker owns credentials and transports") and `pnh/core/grant.ts`
  (`maxInputTokens`/`maxOutputTokens` fields). Manual triage found only
  false positives — token-count field names and one architectural-noun
  comment, no embedded secrets — but this remains a keyword spot-check, not
  an audit: it did not cover git history, other file types, or use a real
  secret-scanning tool. Do not cite "no matches" as a finding of this plan;
  none was found.
- No extraction or sanitization pass has been attempted on `pnh/`. It still
  lives inside this private homelab-infra monorepo, which also holds SSH
  access notes and backup credentials elsewhere in the tree.
- `pnh/` has **no `package.json`, tsconfig, or npm scripts of its own** —
  every build/test entry point (`test:pnh`, `typecheck:pnh`,
  `check:pnh-graph`, **and `test:constitution`**) lives at the repo root.
  `pnh/harness/run-sandbox.mjs` hardcodes `repositoryRoot` one directory
  above `pnh/` and copies the repo root's `package.json`/`package-lock.json`
  into the sandbox build context; `pnh/scripts/generate-constitution.ts`
  assumes the same monorepo-relative layout. Extracting `pnh/` as
  files-only, with no further work, cannot produce a tree that builds
  standalone.
- `pnh/contracts/registry.ts`'s `validateSemantics()` (run by
  `test:constitution`) resolves every invariant's `decisions` path and
  every protocol pin's `spec`/`schema_source` path against `repoRoot` and
  fails closed on any missing one. `invariants.yaml` references roughly
  ten files under `docs/plans/provider-neutral-harness/` (`constitution.md`,
  spec docs, decision docs) — **a sibling directory at the monorepo root,
  outside `pnh/` entirely.** No extraction step that copies `pnh/` alone
  carries this dependency with it.
- The subprocess (spawn) executor is not future work — it is already merged
  and routable on `pnh-v2` (`pnh/harness/plugin-spawn-supervisor.mjs`;
  `broker-gateway.mjs`'s `isSpawnShapedCreateArgs` routing). `pnh/README.md`
  was corrected 2026-08-22 to stop saying it "does not exist in code yet."
  `pnh/`'s only artifact-digest check (in `plugin-spawn-supervisor.mjs`) is
  a self-consistency check between the admitted request and the launched
  artifact — it verifies internal agreement, not that the artifact came
  from a trusted source. No signing, pinning, or provenance mechanism
  exists anywhere in `pnh/` today. "Supply-chain trust" is the intended
  future boundary, not a working control; short-form public labeling must
  say what's actually true (no sandboxing, no artifact verification) rather
  than a phrase a reader could mistake for a working mechanism.

## Design decisions to settle before Phase 1 begins

### D1: phase ordering — technical readiness before extraction mechanics

Extracting `pnh/` into its own tree while M3 and constitution coverage are
still moving means re-extracting every time `main` advances.

**Recommendation: gate order as listed below** — Phases 1-5 (technical and
governance readiness) close before Phase 6 (extraction mechanics) opens.

### D2: does the spawn executor publish in the first release

- **D2-a. Ship both executors, spawn flagged experimental everywhere.**
  Nothing about the code changes; every public surface (README now, and
  a package manifest / CLI banner once Phase 6 creates them) states the
  trust-model gap explicitly.
- **D2-b. First public release ships the Docker executor only**, and the
  spawn executor follows once Phase 3's threat model has its own section
  for it.

**Recommendation: D2-a.** Excluding the code from a public repo doesn't
remove it from the tree being extracted, so honest labeling is cheaper and
more durable than exclusion, and it's consistent with this program's
existing pattern of declaring enforcement levels rather than hiding gaps
(see `PNH-INV-38`'s own `proposed` status).

### D3: threat-model authorship

**Recommendation: adapt the DSH document**, per `architecture.md`'s own
stated plan — but track the adaptation as a real Phase 3 deliverable with
its own review, not something inherited by reference.

### D4: registry schema evolution for "proposed, with a reason"

Phase 2 cannot leave an invariant `proposed` "with a stated reason" until
the registry schema has somewhere to put that reason.

**Recommendation: add a `proposed_reason` field**, required exactly when
`status: proposed`, validated by `loadRegistry` and rendered by the
constitution generator — as Phase 2's own first task, not assumed to
already exist.

## Non-goals

- Does not authorize publication itself, or any phase's execution.
- Does not re-plan, scope, or authorize building Option C. If Phase 1's gate
  requires Option C (see Phase 1 below), that is its own separately
  authorized program with its own plan and hardening pass — this document
  only refuses to consider Phase 1 closed without evidence that program
  produced a passing result. It does not schedule, staff, or design that
  program.
- Does not re-plan M3 or the aggregate arbiter otherwise — Phase 1 treats
  `2026-08-22-aggregate-arbiter-plan.md`'s hardening and execution, plus the
  decision-5-ordered adversarial suite (including a criterion-4 re-run), as
  an external dependency gate.
- Does not select a public repo name, org, or hosting location.
- Does not draft the PNH threat model itself — Phase 3 schedules that as its
  own separately approved plan.
- Does not run a secret-scanning tool itself — Phase 5 schedules that as a
  named task with a named tool, run against a disposable isolated export
  rather than this live repo. Does not itself perform remediation —
  credential rotation is Phase 5's own gated step; history-rewrite
  (stripping content from the extracted tree) is Phase 6's, run only
  against the extracted tree and never against this monorepo.

## Global constraints

- No phase touches `pnh/` runtime code without following that code's own
  governing plan's global constraints (commit discipline, PROTO-02 pinning,
  etc.) — this document does not supersede them.
- Every phase ends at an explicit ratification checkpoint. Nothing carries
  into the next phase without one.
- No extraction, no repository creation, and no license file addition to a
  *public* location happens before Phase 6. This is a process constraint
  only — CI, git hooks, and remote config carry no technical guard against
  it; only recalling and following this document prevents an early push.
- Commit after each phase's artifact lands, `git commit -m` or `-F` file,
  never a heredoc. Never push without being asked.

## Phases

### Phase 0: Baseline — done

This document is the baseline assessment.

### Phase 1: M3 completion (external dependency, not owned here)

Status: **complete 2026-08-26 through Option A.** Evidence and owner
ratification are recorded in
`2026-08-26-m3-adversarial-isolation-decision.md`.

Gate, in order:

1. `2026-08-22-aggregate-arbiter-plan.md` hardened and executed.
2. The adversarial suite for criteria 2, 3, and 5 (Decision 5's ordering),
   **plus a specific re-run of criterion 4** against the now-shipped
   arbiter — criterion 4 is evidenced failing today and the arbiter is
   built to address it, but that is an expectation to verify, not a
   result to assume.
3. **If every criterion now passes: "Option A confirmed sufficient" closes
   this phase.** If any criterion still fails: Option C is triggered, and
   this phase does **not** close on that outcome alone. It closes only once
   a separately authorized Option C program (see Non-goals) has been built
   and all five criteria have been re-run and passed against it. An
   unresolved question does not close this phase either way.

This is the largest credibility risk on the list: publishing an
isolation-focused security kernel before its own central isolation claim has
adversarial evidence — or while that evidence is known to fail — undercuts
the project's own pitch.

**Ratification checkpoint:** owner confirms which branch closed the phase
(Option A confirmed, or Option C built and verified) before Phase 2 begins.

### Phase 2: Constitution coverage

Status: **implementation complete 2026-08-26; awaiting owner ratification.**
The live audit retained 7 active invariants, 39 proposed invariants with
specific reasons, and 0 retired invariants. The audit and architectural gaps
are recorded in `2026-08-26-phase-2-constitution-audit.md`.

First task: implement D4 — add and validate a `proposed_reason` field on
the registry schema, required when `status: proposed`, covered by tests for
the field's presence, its constitution-generator rendering, and status
transitions.

Then re-derive the audit list from a live query of `invariants.yaml` at
execution time, not from this document's cached figures — as of this
writing that is all 39 `proposed` entries among `PNH-INV-01` through
`PNH-INV-46` (the two `PNH-PROTO-*` schema-pin entries have no `status`
field and are out of scope). For each, one of three explicit outcomes —
never silence:

1. Write the conformance test that activates it. **A conformance test must
   exercise the invariant's real production constructor or code path,
   inject the specific fault the invariant guards against, and
   demonstrably fail when the guarding control is disabled.** A test whose
   only assertion is that `conformsTo(...)` was called, with no fault
   injected and no failure path proven, does not activate the invariant —
   present evidence for independent review before flipping status to
   `active`, not merely the test file's existence.
2. Explicitly retire it, with a recorded reason.
3. Leave it `proposed`, with the reason recorded in the new
   `proposed_reason` field from this phase's first task.

Target: zero invariants ship publicly as `proposed` with no recorded
reason, and no invariant ships `active` on evidence weaker than a real
fault-injection test.

**Ratification checkpoint:** owner reviews the resulting active/retired/
proposed-with-reason split, and separately reviews the activation evidence
for anything moved to `active`, before Phase 3 begins.

### Phase 3: PNH-scoped threat model

Adapt the DSH threat model (2026-08-19) into a document scoped to this
harness, covering the list `architecture.md`'s Security invariants section
already names: plugin supply chain, capability confusion, prompt injection,
broker impersonation, replay, at-most-once execution ambiguity, evidence
tampering, dependency compromise, malicious model output, private-data
exposure. Give the spawn executor's weaker trust model its own explicit
section (D2), rather than folding it into the Docker executor's analysis —
and describe that boundary accurately: no sandboxing, and no artifact
verification beyond a self-consistency check, not "supply-chain trust" as
though a working trust mechanism exists.

**Ratification checkpoint:** independent review pass (adversarial-spec-
reviewer or equivalent) before Phase 4 begins.

### Phase 4: spawn-executor labeling — README and registry

> **Blocking prerequisite (added 2026-08-24 by the supply-chain-trust slice).**
> Before executing this phase, reconcile the trust-boundary wording below with
> `docs/plans/provider-neutral-harness/2026-08-24-supply-chain-trust-slice-plan.md`.
> That slice adds owner-pinned admission, so "self-consistency digest check
> only, no external verification" may already be false for pinned plugin sets
> by the time this phase runs. Check whether that slice has merged and describe
> the boundary that actually exists, rather than authoring the wording below
> unchanged.

The executor this phase labels already exists in code today. Its historical
implementation branch was named `pnh-v2`; that branch name is not a Prism
Harness product version. This phase is not gated on some future landing, and
its README correction already shipped 2026-08-22. What remains:

1. Author a new invariant covering the spawn executor's actual trust
   boundary (self-consistency digest check only, no external verification,
   no sandboxing) — none exists today, and Phase 2's proposed-invariant
   audit silently skips it precisely because it's absent rather than
   `proposed`. This is the one spawn-specific piece of Phase 2-adjacent work;
   it lives here, not duplicated as a second item in the Scope section.
   **This invariant is subject to Phase 2's activation bar regardless of
   phase order:** it ships `proposed`, with a `proposed_reason`, until a
   real fault-injection conformance test exists for it and has passed the
   same independent review Phase 2 requires for any other invariant. Phase
   4 running after Phase 2's own checkpoint closed does not exempt this
   invariant from that bar — running later than Phase 2 is not evidence of
   having passed it.
2. Confirm the README section's wording states the boundary precisely (no
   sandboxing, no artifact verification, self-consistency check only) and
   does not use "supply-chain trust" as short-form language that implies a
   working control.

Public-surface labeling that requires an artifact which doesn't exist yet —
a `pnh/package.json` description, a CLI banner — is **not** in this phase's
scope, because `pnh/` has no package manifest or CLI today and Global
Constraints forbid pulling extraction work forward to create one. That
labeling is Phase 6's responsibility, as one line item on the manifest
Phase 6 authors.

**Ratification checkpoint:** owner confirms the README and the new
invariant both state the boundary accurately — not as a hedge, and not
overstating a control that doesn't exist — before Phase 5 begins.

### Phase 5: Sanitization and secrets audit (isolated export, no live-repo rewrite)

Run a real secret-scanning tool (gitleaks or trufflehog) over `pnh/`'s full
history, taken from a **disposable, read-only isolated export** — e.g.
`git filter-repo --path pnh/` run against a throwaway clone, never against
this live monorepo — not just the current tree. `pnh/` still lives inside
this shared homelab-infra monorepo at this point, and any history-rewrite
tooling run against the live repo would corrupt every unrelated SHA-pinned
reference elsewhere in the tree; the export exists specifically so
remediation never needs to touch the repo this document itself lives in.
Cross-check `architecture.md`'s Public components table against `pnh/`'s
actual directory listing to confirm nothing excluded (X1/C3 adapters,
credentials, private evidence) is reachable from anything on the public
list.

**On any true positive: rotate or revoke the credential immediately** —
that step is independent of any git surgery and does not wait on
extraction. **Structural remediation (stripping the content from history)
is Phase 6's responsibility**, run against the actual extracted tree before
it is ever pushed to a public remote (see Phase 6 step 6) — the live
monorepo is never rewritten. A scan result the owner merely "reviewed" is
not remediation; the checkpoint below requires either a clean scan or a
recorded rotation, not a review of whatever the first scan found.

**Ratification checkpoint:** owner reviews the isolated-export scan result
— zero true positives, or every true positive's credential rotated with
the finding carried forward to Phase 6 — before Phase 6 begins.

### Phase 6: Extraction mechanics

Only after Phases 1-5 close. This phase is a real migration, not a file
copy:

1. Extract `pnh/` into its own tree (new repo or subtree split).
2. Author a standalone `package.json`, lockfile, and tsconfig for the
   extracted tree; relocate `test:pnh`/`typecheck:pnh`/`check:pnh-graph`
   **and `test:constitution`** (the constitution-registry/coverage/
   generator/gate/protocol-bounds suite — the one that exercises Phase 2's
   own work) equivalents into it. All four, not three; a "full test suite"
   pass that never invoked `test:constitution` did not verify anything
   Phase 2 built.
3. **Relocate or vendor a frozen copy of `docs/plans/provider-neutral-harness/`**
   into the extracted tree (`constitution.md`, the specs referenced by
   `invariants.yaml`'s ~10 `decisions`/`spec`/`schema_source` paths, and
   the decision docs those paths name). `registry.ts`'s `validateSemantics()`
   resolves these against `repoRoot` and fails closed on any missing path;
   none of this directory lives inside `pnh/` today, so step 5's
   clean-checkout verification cannot pass without this step landing first.
4. Rewrite `run-sandbox.mjs`'s `repositoryRoot`-relative sourcing and
   `generate-constitution.ts`'s parent-relative path assumptions to use
   the extracted tree's own layout, including the relocated docs path from
   step 3.
5. Add `LICENSE`, third-party notices, and a license inventory. Add the
   spawn executor's trust-model label to the new package manifest's
   description (deferred here from Phase 4, since the manifest didn't
   exist until this task).
6. Author a CI workflow for the extracted repo with an explicit
   least-privilege `permissions:` block — the existing `pnh.yml` pattern
   (checkout + `npm ci` + `npm run test:pnh`, no `permissions:` block) does
   not carry this property and must not be copied over unexamined.
7. **If Phase 5 recorded any true positive:** run history-rewrite tooling
   (BFG or `git filter-repo`) against this extracted tree — never against
   the source monorepo — to strip the flagged content before proceeding to
   step 8.
8. Verify from a clean checkout: `npm ci`, typecheck, the full test suite
   (including `test:constitution`), and `npm pack --dry-run` all succeed
   with no dependency on this repo's root `package.json`, `node_modules`,
   scripts, or docs tree.
9. **Rerun Phase 5's secret scan against the exact final commit and
   packaged artifact** — subtree/history operations in step 1, and any
   remediation in step 7, can reintroduce or preserve content differently
   than Phase 5's isolated-export scan saw; nothing here is exempt from
   this check just because Phase 5 already passed once on a different tree
   shape.

**Ratification checkpoint:** owner confirms the extracted tree is
self-contained (including its docs dependency), its clean-checkout
verification passed with `test:constitution` included, its CI workflow is
least-privilege, and its rescan is clean, before Phase 7 begins.

### Phase 7: Destination repository hardening

Not named anywhere else in this program — `architecture.md`'s Open-source
boundary section describes what the *published tree* excludes, not what
protects the *destination repository* once it exists. Before the repository
is made public:

- Branch protection on the default branch: required PR review, required
  status checks (Phase 6's authored CI workflow, at minimum), no
  force-push.
- 2FA enforced for every write collaborator.
- CODEOWNERS or equivalent for the security-sensitive paths (`contracts/`,
  the kernel, the constitution).
- **Require approval before running workflows for first-time or outside
  contributors** — a public repo with CI wired to `pull_request` and no
  approval gate lets an untrusted fork's PR execute in that CI's context.
- If a package manifest is published to a registry: 2FA and provenance
  enabled on the publishing account.

**Ratification checkpoint:** owner confirms the destination repository's
protection settings are live before Phase 8 begins.

### Phase 8: Owner ratification and publication

The explicit, separate approval `architecture.md` names three times in
different words. Nothing before this phase makes anything public, and
nothing in this document is that approval.

## Deferred

- Provider brokers and adapters beyond the generic core —
  `architecture.md` already routes these through their own later
  security/license/sanitization review.
- OS-native confinement for the spawn executor and the WASM roadmap, per
  `2026-08-22-dsh-fork-decision.md` — capability questions, not readiness
  blockers.

## Risks

- **Publishing before Phase 1 closes, or on an Option C trigger that was
  never actually built.** The single largest risk, and the reason Phase
  1's gate no longer treats "Option C triggered" as a closing outcome by
  itself.
- **Extraction started before Phases 1-2 stabilize.** Every subsequent
  `main` change would require re-extraction; D1's ordering exists
  specifically to prevent this.
- **Treating a scan the owner "reviewed" as remediation.** It is not.
  Phase 5's gate requires a clean rescan after any true positive, not a
  review of the first scan's output; Phase 6 rescans again against the
  final published artifact because history operations can reintroduce
  content.
- **Shipping the spawn executor's trust model mislabeled as a working
  control.** "Supply-chain trust" without qualification reads as a
  functioning mechanism; the only real check today is a self-consistency
  digest comparison. Phase 3 and Phase 4 both require the precise wording.
- **Phase 6 treated as a file copy instead of a migration.** `pnh/` has no
  standalone build today; skipping the package.json/tsconfig/path-rewrite
  work in Phase 6 produces an extracted tree that cannot build.
- **A public repository with no destination-side hardening.** Phase 7
  exists because excluding secrets from the *tree* says nothing about who
  can push to the *repository* once it's public.
- **Remediation tooling run against the live monorepo instead of an
  isolated export.** Would corrupt every unrelated SHA-pinned reference in
  this shared repo; Phase 5's scan and Phase 6's remediation are scoped
  specifically to prevent this.
- **Phase 6 declaring victory on a clean-checkout run that silently skipped
  `test:constitution` or never relocated `docs/plans/provider-neutral-harness/`.**
  Both produce a false "standalone build passes" signal; Phase 6 step 8
  names both explicitly for this reason.
