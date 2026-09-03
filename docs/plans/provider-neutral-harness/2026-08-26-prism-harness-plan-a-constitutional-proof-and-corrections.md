# Prism Harness Plan A: constitutional proof and corrections

Date: 2026-08-26

Status: draft implementation plan. The architecture specification is ratified.
The Preflight and Task 1–2 review corrections were owner-approved on 2026-08-26.
The split law-status and proof-status amendment was owner-ratified on 2026-08-27.
The Task 1A transition-authority correction was owner-selected on 2026-08-27
after the completed Task 1 review. It does not authorize Task 2.
This document does not authorize implementation, Plan B work, installation,
repository creation, publication, or a live provider call.

Decision owner: D6, constitution and proof governance.

## Goal

Turn the ratified constitutional baseline into enforceable repository law before
any production-admission work begins. Plan A adds claim-appropriate enforcement
kinds, a machine-checked first-release disposition for all 46 invariants,
separate constitutional-law and implementation-proof lifecycles, structured
proof evidence, the ratified wording corrections, and a public-claim consistency
gate.

Plan A changes governance and proof machinery. It does not implement the D1,
D2, D3, or D4 runtime architecture that later plans must prove.

## Source of truth

Use this precedence during implementation:

1. Runtime, developer, and owner authority.
2. `pnh/contracts/invariants.yaml` and `pnh/contracts/invariants.lock`.
3. `docs/plans/provider-neutral-harness/constitution.md`.
4. `docs/plans/provider-neutral-harness/2026-08-26-invariant-module-architecture-matrix.md`.
5. `docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md`, especially Sections 18.1 through 18.8, 24 Plan A, 26, and 30.
6. `docs/plans/provider-neutral-harness/2026-08-27-invariant-law-proof-status-amendment.md`.
7. This plan.
8. Current implementation and historical plans.

The ratified design-spec Git blob at plan-authoring time is
`55805d89c29232326ebe2e95f652d385f766e1b0`. The hardening report blob is
`a9727a09d563c0e6635a9fadd3298b159abde0c4`. Preflight must stop if the design
spec differs unless the owner has ratified a later amendment. Compute these IDs
with `git hash-object`; they are not SHA-256 content digests.

The owner-ratified 2026-08-27 status-model amendment authorizes amended
design-spec Git blob `04e8e79a8cb89186da7032b696e832e1cf2d994d`. Its decision
record must remain present and valid; no other design-spec blob is authorized.

## Success criteria

Plan A is complete only when all of these are true:

1. Registry version 2 contains separate law and proof status, an enforcement
   kind, and a first-release disposition for each of PNH-INV-01 through
   PNH-INV-46, exactly matching design-spec Sections 18.4 and 18.8.
2. All 46 laws are ratified. PNH-INV-22, 23, and 29 are honestly marked partial
   through decision-backed, hash-bound proof-invalidation records. Pure
   transition law accepts only trusted resolver output; file existence and
   caller-supplied proof booleans never confer transition authority.
3. PNH-INV-25, 27, and 38 contain the exact ratified statements from Section
   18.5. The duplicated 50 ms wall-clock bound is removed from both PNH-INV-01
   and PNH-INV-38 under the same ratified correction.
4. PNH-INV-02, 03, 04, and 18 have `proof_status: proven` with executed
   structured proof whose kind matches the registry. PNH-INV-22, 23, and 29 are
   `partial`; every other invariant is `unproven`. A file path or `conformsTo`
   label alone cannot satisfy the gate.
5. Generated constitution text shows law status, proof status, enforcement kind,
   first-release posture, closing gates, proof reasons, evidence paths, and
   amendment history without describing partial evidence as complete proof.
6. Handwritten public claims are registered and linted against law status, proof
   status, execution class, known limitations, and release posture.
7. All required checks pass, the independent review artifact has no unresolved
   blocker, and the owner records the Plan A completion decision.

## Invariant and schema scope

- Metadata migration: PNH-INV-01 through PNH-INV-46.
- D8 exclusion: draft PNH-INV-47 and later IDs and closing gates I through K do
  not enter the Plan A baseline. Any later D8 ratification requires a new
  owner-ratified successor baseline and its own schema decision.
- Legacy-status migration: all 46 invariants move to `law_status: ratified` and
  an explicit proof status.
- Proof invalidations: PNH-INV-22, PNH-INV-23, and PNH-INV-29 only.
- Statement amendments: PNH-INV-25, PNH-INV-27, and PNH-INV-38 only.
- Bound amendments: remove `max_cross_plugin_stall_ms` from PNH-INV-01 and
  PNH-INV-38 only.
- Structured proof upgrades: PNH-INV-02, PNH-INV-03, PNH-INV-04, and
  PNH-INV-18 only.
- Governance surfaces exercised without claiming complete proof: PNH-INV-09,
  24, 26, 44, and 46.

Plan A advances the constitution registry and lock schema to version 2. It does
not change PNH-PROTO-01, PNH-PROTO-02, their schema sources, or their versions.
No other proof status, statement, or bound may change after the initial v1-to-v2
mapping. No invariant law may become proposed or retired.

Implementation adds no npm dependency. New TypeScript remains strict NodeNext
with explicit `.ts` imports. Commits stay local; Plan A never pushes, deploys,
installs, publishes, or contacts a provider.

## Current-state grounding

- `pnh/contracts/registry.ts:6-24` has one closed invariant status vocabulary
  that conflates law and proof, plus a category vocabulary, but no separate law,
  proof, enforcement-kind, or release-disposition vocabulary.
- `pnh/contracts/registry.ts:32-71` defines registry version 1 and has no fields
  for proof kind, first-release posture, or closing gates.
- `pnh/contracts/registry.ts:82-85` rejects unknown invariant fields, so adding
  the ratified baseline requires a schema migration rather than YAML-only edits.
- `pnh/contracts/registry.ts:266-270` hashes only statement and bounds. The new
  enforcement and release fields would drift silently unless they join the
  binding hash.
- `pnh/contracts/registry.ts:294-299` treats proof loss as a constitutional
  status reversal. It cannot preserve a ratified law while recording reduced
  assurance.
- `pnh/contracts/conforms-to.ts:3-6` records only an invariant ID.
- `pnh/contracts/coverage.ts:6-49` collects only executed IDs and discards proof
  kind, production entrypoint, fault, artifact digest, and review evidence.
- `pnh/tests/constitution-gate.test.ts:55-69` accepts executed ID registration as
  sufficient proof for every legacy-active invariant.
- `pnh/scripts/generate-constitution.ts:56-68` renders status, proposed reason,
  and conformance paths, but not enforcement or release posture.
- `pnh/contracts/invariants.yaml:331-355`, `:356-367`, and `:444-458` still use
  legacy `active` for PNH-INV-22, 23, and 29 even though current evidence proves
  only part of each statement.
- `pnh/contracts/invariants.yaml:384-429` and `:584-607` still carry the old
  PNH-INV-25, 27, and 38 wording or bound model.
- `pnh/contracts/invariants.yaml:13-14` also carries the 50 ms bound under
  PNH-INV-01. Removing it is required to make the ratified deterministic-progress
  choice coherent.
- `pnh/README.md:86-152` contains current trust and production claims but has no
  machine-readable claim ownership or posture markers.
- `package.json:22` runs the eight-check constitution suite. It has no structured
  proof-report or public-claim command.

## Scope

### Allowed writes

- `pnh/contracts/registry.ts`
- `pnh/contracts/invariant-transition.ts`
- `pnh/contracts/transition-authority.ts`
- `pnh/contracts/invariants.yaml`
- `pnh/contracts/invariants.lock`
- `pnh/contracts/conforms-to.ts`
- `pnh/contracts/coverage.ts`
- new proof, ratification-baselines, and public-claim contract files under
  `pnh/contracts/`
- `pnh/scripts/generate-constitution.ts`
- new proof-report and public-claim scripts under `pnh/scripts/`
- constitution tests and fixtures under `pnh/tests/`
- the four proof-upgrade suites named in Task 4
- `pnh/README.md`
- `docs/plans/provider-neutral-harness/constitution.md`
- Plan A decision and review records under
  `docs/plans/provider-neutral-harness/`
- `package.json`

### Forbidden writes

- D1 through D5 implementation under `pnh/core/`, `pnh/kernel/`, `pnh/runtime/`,
  `pnh/harness/`, `pnh/sdk/`, provider examples, or host adapters, except for the
  four existing test files that gain structured proof registration.
- The ratified architecture specification or its hardening report.
- Plugin pins, protocol source, daemon configuration, credentials, or any live
  host state.

### Non-goals

- Implement Policy evaluation, admission acknowledgement, custody, settlement,
  permit consumption, broker principals, or service installation.
- Mark unproven runtime invariants proven merely because their metadata now
  exists.
- Rewrite public product copy beyond adding accurate claim and limitation
  markers required by the gate.
- Run a live provider, create the standalone repository, install a daemon, or
  publish anything.

## Design contracts

### Registry version 2

Every invariant gains:

```ts
type EnforcementKind =
  | "runtime-adversarial"
  | "static-structure"
  | "generated-document-consistency"
  | "controlled-performance-qualification"
  | "release-or-architecture-gate";

type LawStatus = "proposed" | "ratified" | "retired";

type ProofStatus = "unproven" | "partial" | "proven";

type AmendmentKind =
  | "binding-change"
  | "law-transition"
  | "proof-invalidation";

interface AmendmentV2 {
  readonly date: string;
  readonly decision: string;
  readonly from_hash: `sha256:${string}`;
  readonly kind?: AmendmentKind;
  readonly reason?: string;
  readonly from_proof_status?: ProofStatus;
}

type FirstReleaseDisposition =
  | "activate"
  | "retain"
  | "defer";

interface FirstReleaseRule {
  readonly disposition: FirstReleaseDisposition;
  readonly detail?: string;
  readonly closing_gates: readonly ("A" | "B2" | "C" | "D" | "E" | "F" | "G" | "H")[];
}
```

`law_status`, `proof_status`, `proof_reason`, `enforcement_kind`, and the complete
`first_release` object are lock-tracked fields. The immutable baseline pins law
status, enforcement kind, and first-release policy. Proof status is dynamic but
gate-verified: `proven` requires matching structured proof, while `partial` or
`unproven` requires a non-empty `proof_reason`. Registry and lock versions both
advance to 2.

```ts
interface LockEntryV2 {
  readonly binding_hash: `sha256:${string}`;
  readonly law_status: LawStatus;
  readonly proof_status: ProofStatus;
}
```

`binding_hash` covers statement, bounds, `law_status`, `proof_reason`,
`enforcement_kind`, and the complete `first_release` object. Proof status is
stored separately so transition validation can require both the prior binding
hash and `from_proof_status`.

`pnh/contracts/ratification-baselines/plan-a-v1.json` is the immutable,
machine-readable owner input for this migration. It records all 46 law-status,
enforcement, and first-release mappings, the ratified design-spec blob and later
status-model amendment, ratification dates, owner, and decision records. The
registry remains canonical law after migration; the gate rejects any mismatch
between baseline-governed registry fields and that artifact. Dynamic proof status
is governed by the lock, transition law, and proof report rather than copied into
the immutable owner baseline.

Lock version 2 pins the current immutable baseline:

```ts
interface RatificationBaselinePin {
  readonly path: `pnh/contracts/ratification-baselines/${string}.json`;
  readonly sha256: `sha256:${string}`;
  readonly decision: string;
}
```

The initial `plan-a-v1.json` has no predecessor. A future baseline must use a
new path, preserve every earlier baseline artifact, and include this transition
record:

```ts
interface RatificationBaselineSupersedes {
  readonly from_hash: `sha256:${string}`;
  readonly date: string;
  readonly decision: string;
  readonly owner: string;
  readonly reason: string;
}
```

The lock updater rejects same-path mutation, a missing prior artifact, a missing
or malformed transition record, a `from_hash` that differs from the pinned
baseline, or an absent decision record. Editing the registry and a baseline
together is therefore not a silent escape path.

### Law and proof transitions

`law_status` changes require an owner-ratified, hash-bound constitutional
amendment. Plan A migrates all 46 existing laws to `ratified`; it does not propose
or retire any law.

A transition from `proven` to `partial` or `unproven` is legal only when the
newest amendment entry:

- has `kind: proof-invalidation`;
- cites the locked hash and prior proof state;
- points to an existing owner-ratified decision record;
- includes a non-empty evidence-invalidation reason; and
- accompanies a non-empty `proof_reason` in the registry.

A transition from `unproven` or `partial` to `proven` requires an executed
structured proof with the registered enforcement kind and an independent review
artifact. A transition from `unproven` to `partial` requires accepted concrete
partial evidence. The guarded lock updater rejects a proof upgrade unless the
supplied proof report establishes it. No proof transition changes the statement
or law status.

### Transition authority resolution

`validateInvariantTransition` is pure domain law. It never reads the filesystem,
resolves a repository path, parses a decision document, or accepts raw caller
booleans as proof. It accepts only explicit old and new states plus opaque
validated authority produced by trusted boundary resolvers.

The decision resolver validates a repository-contained, owner-ratified decision
record against an owner-pinned content digest, expected owner and decision role,
amendment kind, prior binding hash, prior proof status where applicable, and
bound architecture artifacts. Absolute paths, traversal, symlink escape,
unratified prose, wrong-owner records, and digest or binding drift fail closed.

The proof resolver validates executed structured proof and its independent
review artifact before it can construct proof-upgrade authority. Until Task 3
implements that resolver, every transition to `proof_status: proven` remains
unavailable. Task 2 performs no proof upgrade.

### Structured proof report

`conformsTo(id)` remains a legacy evidence label for partial or unproven claims
and cannot establish `proof_status: proven`. Complete proof uses a closed
registration object:

```ts
interface ProofRegistration {
  readonly schema_version: 1;
  readonly invariant_id: string;
  readonly enforcement_kind: EnforcementKind;
  readonly entrypoint: string;
  readonly fault_point: string | null;
  readonly disabled_control: string | null;
  readonly test_file: string;
  readonly test_artifact_digest: string;
  readonly review_artifact: string;
  readonly review_artifact_digest: string;
  readonly executed: true;
}
```

The helper computes artifact digests from repository files. Callers cannot
supply digests. A report exists only because the test executed, so skipped tests
cannot register proof. Runtime-adversarial proof must name a production
entrypoint and at least one injected fault or disabled control. Static and
generated-document proof must name the fail-closed checker. Other kinds validate
their required artifact class explicitly.

The canonical proof report is deterministically sorted and contains no wall
clock, machine path, credential, prompt, or provider payload. A CLI may emit it
to stdout or an explicitly requested artifact path; it is not committed as a
source file.

### Public-claim registration

Handwritten public claims use explicit claim or limitation markers and a
machine-readable manifest. Each registered block binds:

- claim ID and normalized text digest;
- file path;
- invariant IDs;
- posture: `supported`, `planned`, `limitation`, or `deferred`;
- applicable execution classes and evidence environments; and
- release scope.

The gate rejects supported claims unless every backing invariant is ratified,
proven, and non-deferred. It also rejects unregistered normative security
language, text-digest drift, missing files, unknown invariants, and sandbox
wording for `trusted-subprocess-v1`. Generated constitution blocks are checked by
regeneration and are not duplicated in the handwritten-claim manifest.

## Preflight gate

- [ ] Confirm branch `goal/prism-harness` and record all pre-existing worktree
  changes. Preserve the ratified spec and hardening report.
- [ ] Confirm one local baseline commit tracks the ratified design spec, its
  hardening report, and this Plan A. Record that commit SHA in the execution log
  and stop if any artifact differs from its baseline or latest explicitly
  owner-approved amendment recorded in the execution log.
- [ ] Verify the ratified spec and hardening blobs match the hashes in this plan.
  Accept the 2026-08-27 status-model change only when its owner-ratified decision
  record exists and cites the baseline spec blob; stop on any other mismatch.
- [ ] Accept the Task 1A plan-only correction only when the execution log records
  the prior Plan A blob `80ba48cddc5d12b50012a43b73a71aba3b5bac37`, the amended
  Plan A blob, the completed Task 1 review, and the owner's selection of the pure
  validator plus trusted resolver architecture. Stop on any other plan drift.
- [ ] Record the current registry, lock, constitution, and HEAD hashes in the
  Plan A execution log.
- [ ] Run `npm run typecheck:pnh`, `npm run test:constitution`, and
  `git diff --check`; confirm all three pre-change checks pass.
- [ ] Confirm current active IDs are 02, 03, 04, 18, 22, 23, and 29. Stop if the
  registry has changed since plan authoring.

## Phase I: migrate constitutional law

### Task 1: add governed proof-state transition primitives

**Files:**

- Modify `pnh/contracts/registry.ts`
- Modify `pnh/tests/constitution-registry.test.ts`
- No registry YAML migration in this task; Task 2 performs the atomic schema and
  data migration

- [ ] Write failing tests for the pure proof-transition law: valid
  proven-to-partial and proven-to-unproven invalidations; no amendment; wrong
  prior hash or prior proof state; missing decision; wrong amendment kind; an
  unknown amendment key; malformed or blank reason; and missing `proof_reason`.
- [ ] Extend `Amendment` with closed optional `kind`, `reason`, and
  `from_proof_status` fields while accepting historical entries that predate
  those fields. Absence is the only legacy exception; reject unknown keys,
  unknown kinds, and malformed values.
- [ ] Add a pure transition validator that accepts explicit old and new law and
  proof states plus proof-evidence context. Keep the v1 registry loader working
  until Task 2 performs the atomic migration.
- [ ] Require `kind: proof-invalidation`, prior proof state, and a non-empty
  reason for proven-to-partial or proven-to-unproven transitions.
- [ ] Require matching structured-proof and review results for any transition to
  proven; require accepted partial evidence for unproven-to-partial.
- [ ] Specify stale-lock output whenever either lock-tracked status differs. The
  guarded updater may filter that instruction only after transition validation.
- [ ] Prove that legal proof transitions produce only the expected stale-lock
  instruction, while silent proof downgrades and self-attested upgrades stay red.

Verify:

```bash
npx tsx --test pnh/tests/constitution-registry.test.ts
npm run typecheck:pnh
npm run test:constitution
```

Commit boundary: `feat(prism): govern invariant proof transitions`

### Task 1A: separate pure transition law from trusted authority resolution

**Files:**

- Create `pnh/contracts/invariant-transition.ts`
- Create `pnh/contracts/transition-authority.ts`
- Create `pnh/tests/constitution-transition-authority.test.ts`
- Modify `pnh/contracts/registry.ts`
- Modify `pnh/tests/constitution-registry.test.ts`
- No registry YAML, lock, generated constitution, or ratification-baseline write
  is permitted in this task

- [ ] Write failing tests proving that an unratified Markdown file, an absolute
  path such as `/etc/hosts`, traversal, symlink escape, wrong owner or decision
  role, wrong amendment kind, wrong prior hash or proof state, and decision
  digest drift cannot authorize a transition.
- [ ] Move `validateInvariantTransition` and its state types into the pure
  transition module. Remove `repoRoot`, path resolution, filesystem reads, and
  raw proof booleans from its input contract.
- [ ] Add opaque validated decision and proof-authority types whose values can be
  constructed only by the trusted resolver boundary. The pure validator accepts
  those values but never creates or authenticates them.
- [ ] Add the trusted decision resolver. Require a canonical repository-relative
  path under `docs/plans/provider-neutral-harness/`, repository containment after
  resolution, owner-pinned content digest, `Status: Ratified`, expected owner and
  decision role, bound architecture identities, and matching transition fields.
- [ ] Add a fail-closed proof resolver boundary. Before Task 3, it returns no
  proof-upgrade authority. Preserve the existing proof-transition law tests by
  using test-only validated fixtures rather than caller-supplied booleans.
- [ ] Re-export transition types from `registry.ts` only if required for existing
  callers. Production code must import trusted resolvers explicitly so pure law
  cannot be mistaken for authority resolution.
- [ ] Confirm `validateInvariantTransition` has no filesystem dependency and that
  legal decision-backed downgrades produce only the expected stale-lock
  instruction after trusted resolution succeeds.

Verify:

```bash
npx tsx --test pnh/tests/constitution-registry.test.ts pnh/tests/constitution-transition-authority.test.ts
npm run typecheck:pnh
npm run test:constitution
```

Commit boundary: `fix(prism): separate transition law from authority resolution`

### Task 2: migrate the ratified all-46 baseline

**Files:**

- Create `pnh/contracts/ratification-baselines/plan-a-v1.json`
- Create `docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md`
- Create `docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md`
- Create `docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md`
- Modify `pnh/contracts/registry.ts`
- Modify `pnh/contracts/invariants.yaml`
- Modify `pnh/contracts/invariants.lock`
- Modify `pnh/scripts/generate-constitution.ts`
- Modify `pnh/tests/constitution-registry.test.ts`
- Modify `pnh/tests/constitution-generator.test.ts`
- Modify `pnh/tests/constitution-gate.test.ts`
- Modify `pnh/tests/fixtures/constitution/valid-registry.yaml`
- Modify `docs/plans/provider-neutral-harness/constitution.md`

- [ ] Write failing tests for registry version 2, every closed vocabulary,
  required law/proof combinations and reasons, binding-hash participation,
  duplicate or missing baseline IDs, invalid closing gates, baseline-lock hash
  drift, registry mismatch against the pinned artifact, same-path baseline
  mutation, missing predecessor files, and missing or invalid supersession
  metadata.
- [ ] Reject any Plan A baseline or migrated registry containing an invariant
  outside the exact PNH-INV-01 through PNH-INV-46 set, including draft D8 rows,
  or a closing gate outside A through H.
- [ ] Record the source spec blob, owner ratification, old lock hashes, complete
  all-46 table, exact proof-invalidation reasons, and exact amendment text in the
  three decision records.
- [ ] Stage the three decision records and immutable baseline without changing
  `invariants.yaml`, `invariants.lock`, or generated constitution blocks. Compute
  and record their exact content digests, then stop for explicit owner
  ratification. The atomic migration may continue only after the execution log
  records that decision and the trusted decision resolver accepts every record.
- [ ] Add the 46 ratified mappings to
  `ratification-baselines/plan-a-v1.json` and copy them into `invariants.yaml`
  without changing any unratified statement. Set every `law_status` to
  `ratified`; remove the legacy `status` and `proposed_reason` fields.
- [ ] Set initial `proof_status` to `partial` for PNH-INV-02, 03, 04, 18, 22, 23,
  and 29, with exact `proof_reason` text. Set the other 39 invariants to
  `unproven`. Preserve conformance paths as partial evidence but ensure generated
  prose never calls them complete proof.
- [ ] Replace PNH-INV-25, 27, and 38 with the exact Section 18.5 statements.
- [ ] Remove `max_cross_plugin_stall_ms` from PNH-INV-01 and PNH-INV-38, update
  their proof reasons, and bind both changes to the ratified amendment
  decision. Do not change any shared resource constant.
- [ ] Append one current hash-bound amendment entry to every invariant whose new
  binding fields change. Use the baseline decision for ordinary metadata, the
  proof-status decision for 22/23/29, and the amendment decision for
  01/25/27/38.
- [ ] Expand generated tables with law status, proof status, proof reason,
  enforcement kind, first-release disposition, detail, closing gates, and
  status-correct evidence labeling.
- [ ] Add the immutable baseline loader and lock-v2 pin. Require a new artifact
  path and a valid `supersedes` record for every future baseline transition;
  preserve all earlier baseline artifacts.
- [ ] Run the guarded lock update and constitution generation. Never edit the
  lock or generated blocks by hand.

Verify:

```bash
npx tsx --test pnh/tests/constitution-registry.test.ts pnh/tests/constitution-transition-authority.test.ts pnh/tests/constitution-generator.test.ts
npx tsx pnh/scripts/generate-constitution.ts --update-lock
npx tsx pnh/scripts/generate-constitution.ts --write
npm run typecheck:pnh
npm run test:constitution
```

Expected state after Task 2: all 46 laws are ratified; proof status is partial for
exactly 02, 03, 04, 18, 22, 23, and 29 and unproven for the other 39. No
invariant is proven yet.

Commit boundary: `feat(prism): install ratified invariant baseline`

## Phase II: replace labels with executable proof

### Task 3: add structured proof registration and reporting

**Files:**

- Create `pnh/contracts/proof-report.ts`
- Create `pnh/scripts/generate-proof-report.ts`
- Create `pnh/tests/constitution-proof-report.test.ts`
- Add focused proof fixtures under `pnh/tests/fixtures/constitution/`
- Modify `pnh/contracts/conforms-to.ts`
- Modify `pnh/contracts/coverage.ts`
- Modify `pnh/tests/constitution-coverage.test.ts`
- Modify `package.json`

- [ ] Write failing tests for valid proof registration, skipped-test absence,
  test and review artifact digest calculation, unknown keys, malformed digests,
  missing production entrypoint, missing fault or disabled-control metadata,
  kind mismatch, deterministic sorting, duplicate collapse, and conflicting
  duplicate rejection.
- [ ] Add the closed `ProofRegistration` contract and pure validators.
- [ ] Implement the trusted proof resolver that validates the executed proof
  report and independent review artifact, then constructs the opaque proof-
  upgrade authority consumed by `validateInvariantTransition`. Raw booleans,
  caller-supplied digests, and unvalidated report objects never authorize an
  upgrade.
- [ ] Add a structured registration helper that hashes `test_file` and
  `review_artifact` itself and emits no sensitive or machine-specific fields.
- [ ] Preserve `conformsTo` as a legacy label in a separate report record. Make
  its type impossible to confuse with structured proof.
- [ ] Update `runConformance` to return exit status, legacy labels, structured
  proofs, and parse errors. Malformed JSONL fails the run instead of disappearing.
- [ ] Add a deterministic proof-report builder and CLI. It writes only to an
  explicitly provided path or stdout.
- [ ] Add `proof:constitution` to `package.json` without weakening
  `test:constitution`. Add the proof-report unit suite to `test:constitution`.

Verify:

```bash
npx tsx --test pnh/tests/constitution-coverage.test.ts pnh/tests/constitution-proof-report.test.ts
npm run typecheck:pnh
npm run test:constitution
```

Commit boundary: `feat(prism): add structured invariant proof reports`

### Task 4: upgrade the four revalidated invariants to proven

**Files:**

- Create `docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md`
- Modify `pnh/tests/plugin-protocol.test.ts`
- Modify `pnh/tests/protocol-bounds.test.ts`
- Modify `pnh/tests/admission-ticket.test.ts`
- Modify `pnh/tests/module-graph.test.ts`
- Modify `pnh/tests/constitution-gate.test.ts`
- Modify `pnh/contracts/invariants.yaml`
- Modify `pnh/contracts/invariants.lock` through the guarded updater
- Modify `pnh/scripts/generate-constitution.ts`
- Modify `docs/plans/provider-neutral-harness/constitution.md`

- [ ] Replace ID-only registration for PNH-INV-02, 03, 04, and 18 with structured
  registrations that match their registry enforcement kinds.
- [ ] For PNH-INV-03 and 04, name the current production entrypoint and the
  injected fault or disabled control. For PNH-INV-02 and 18, name the fail-closed
  static checker.
- [ ] Run a separate falsification review of those four proof upgrades.
  Record exact test files, entrypoints, limitations, and any required B2 or G
  reproof. The proof registrations bind the resulting review artifact digest.
- [ ] Set those four registry rows to `proof_status: proven`, remove their
  `proof_reason`, generate a proof report, and run the guarded lock update with
  that report. The updater must reject the same transition without the report.
- [ ] Change the constitution gate so every proven invariant requires at least
  one executed structured proof matching its kind, declared conformance file,
  artifact digest, and review artifact. Legacy labels never satisfy this check.
- [ ] Fail on a structured proof for an unknown ID, wrong kind, undeclared test
  file, missing review artifact, conflicting duplicate, or skipped suite.
- [ ] Render proven structured proof separately from partial and unproven
  evidence.

Verify:

```bash
npx tsx --test pnh/tests/plugin-protocol.test.ts pnh/tests/protocol-bounds.test.ts pnh/tests/admission-ticket.test.ts pnh/tests/module-graph.test.ts
npx tsx --test pnh/tests/constitution-coverage.test.ts pnh/tests/constitution-proof-report.test.ts pnh/tests/constitution-gate.test.ts
npm run proof:constitution -- --output /tmp/prism-plan-a-proof-report.json
npx tsx pnh/scripts/generate-constitution.ts --update-lock --proof-report /tmp/prism-plan-a-proof-report.json
npx tsx pnh/scripts/generate-constitution.ts --write
npm run typecheck:pnh
npm run test:constitution
```

Commit boundary: `feat(prism): enforce claim-appropriate proven status`

## Phase III: make public claims fail closed

### Task 5: add the public-claim consistency gate

**Files:**

- Create `pnh/contracts/public-claims.yaml`
- Create `pnh/contracts/public-claims.ts`
- Create `pnh/scripts/check-public-claims.ts`
- Create `pnh/tests/public-claims.test.ts`
- Add public-claim fixtures under `pnh/tests/fixtures/constitution/`
- Modify `pnh/README.md`
- Modify `pnh/tests/constitution-gate.test.ts`
- Modify `package.json`

- [ ] Write failing tests for supported claims backed by partial, unproven,
  proposed-law, retired, or deferred invariants; deferred claims described as
  available; unknown claim or invariant IDs,
  missing files, duplicate markers, digest drift, unmarked normative security
  language, execution-class mismatch, and any sandbox claim for
  `trusted-subprocess-v1`.
- [ ] Implement a closed parser for the public-claim manifest and claim and
  limitation markers.
- [ ] Normalize Markdown deterministically before hashing. Ignore fenced code,
  generated constitution blocks, and explicitly registered limitation blocks;
  do not ignore ordinary prose.
- [ ] Register current `pnh/README.md` claims and limitations without describing
  any partial or unproven control as supported. Correct stale wording only where
  the current text exceeds the registry.
- [ ] Add a CLI that prints every failure with claim ID, file, and line. Empty or
  missing surface sets fail closed.
- [ ] Add `check:public-claims` and include its tests in `test:constitution`.

Verify:

```bash
npx tsx --test pnh/tests/public-claims.test.ts
npm run check:public-claims
npm run typecheck:pnh
npm run test:constitution
```

Commit boundary: `feat(prism): gate public claims against invariant status`

## Phase IV: close Plan A without entering Plan B

### Task 6: regenerate, audit, and obtain the owner completion decision

**Files:**

- Create `docs/plans/provider-neutral-harness/reviews/2026-08-26-plan-a-final-review.md`
- Create `docs/plans/provider-neutral-harness/2026-08-26-plan-a-completion-decision.md`
- Modify generated constitution and lock only through their scripts if final
  checks detect drift

- [ ] Run the complete verification matrix below from a clean process.
- [ ] Generate the structured proof report to a temporary artifact and verify it
  contains exactly the four proven invariant IDs with matching kinds.
- [ ] Mechanically compare all 46 registry rows against
  the lock-pinned immutable baseline and design-spec Section 18.8.
- [ ] Verify all 46 laws are ratified; PNH-INV-22, 23, and 29 are partial with
  decision-backed proof-invalidation metadata and accurate proof reasons.
- [ ] Verify PNH-INV-01 has no 50 ms bound and PNH-INV-25, 27, and 38 match the
  ratified text byte-for-byte after YAML folding.
- [ ] Run an independent adversarial review that tries to falsify transition
  governance, proof provenance, generated status, and public-claim closure.
- [ ] Resolve every Critical or Important review finding before presenting the
  owner gate. Record killed findings and concrete guards in the review artifact.
- [ ] Present the owner with a discrete completion checklist. Stop until the
  owner records `Ratified`, `Ratified with amendments`, or `Not ratified` for the
  Plan A result.
- [ ] If ratified, record the exact registry and lock blobs, proof-report digest,
  review artifact, test results, and owner decision. Do not start Plan B.

## Verification matrix

Run every command. A skipped command is a failed exit gate.

```bash
npm run typecheck:pnh
npm run check:pnh-graph
npm run check:public-claims
npm run test:constitution
env -u PRISM_LIVE_CODEX npm run test:pnh
npx tsx pnh/scripts/generate-constitution.ts --check --proof-report docs/ai/workstreams/20260828-homelab-setup-plan-a-task4-proof-upgrades-c3381b/authority-evidence/canonical-proof-report.json
# Owner-only: regeneration requires the owner-held runner signing identity in
# the environment (PNH_EXECUTION_SIGNING_*); an unsigned report is refused by
# design. Independent reviewers verify the archived canonical report through
# the --check --proof-report line above instead of regenerating.
npm run proof:constitution -- --output /tmp/prism-plan-a-proof-report.json
git diff --check
```

Additional assertions:

- The registry contains exactly 46 invariant IDs and the expected protocol IDs.
- The lock-pinned immutable ratification baseline and registry have identical
  invariant ID sets, law statuses, enforcement kinds, first-release
  dispositions, details, and closing gates.
- The lock has no stale entry and is version 2.
- Proven IDs are exactly 02, 03, 04, and 18.
- Partial IDs are exactly 22, 23, and 29.
- The other 39 invariant IDs are unproven.
- No partial, unproven, proposed-law, retired, or deferred invariant is described
  as proven or supported in generated or handwritten public prose.
- No public surface calls `trusted-subprocess-v1` sandboxed.
- No Plan A artifact contains credentials, home paths, prompts, provider
  payloads, or private endpoints.
- Git status contains only Plan A-scoped files plus changes that predated
  execution and were explicitly preserved.

## Rollback and forward recovery

- Do not hand-edit `invariants.lock` or generated constitution blocks. Regenerate
  them from a valid registry.
- Before Task 2, record the registry, lock, constitution, and immutable
  ratification-baseline path and hash. A failed migration restores the complete
  pre-Task-2 set, not one file at a time.
- Task 2 has a mandatory owner stop after decision records and the immutable
  baseline are staged and hashed but before registry, lock, or generated output
  changes. Missing explicit authorization restores the pre-Task-2 set.
- Do not mark 22, 23, or 29 proven to make a test green. Their safe recovery state
  is `law_status: ratified` with `proof_status: partial` until later production
  proof exists.
- A failed public-claim gate blocks completion. Do not weaken the vocabulary or
  remove a public surface to silence a legitimate mismatch.
- A malformed or incomplete proof report blocks completion. Legacy
  `conformsTo` registrations are not a fallback.
- No rollback or owner decision may automatically start Plan B.

## Plan A exit gate

Plan A closes only when:

1. Task 1A, all six numbered tasks, and every verification command are complete.
2. Registry, lock, generated constitution, proof report, and public claims agree.
3. The independent final review has no unresolved Critical or Important finding.
4. The owner ratifies the complete Plan A result and its exact artifact hashes.
5. The completion decision states explicitly that Plan B authoring is allowed
   but Plan B implementation is not authorized.
