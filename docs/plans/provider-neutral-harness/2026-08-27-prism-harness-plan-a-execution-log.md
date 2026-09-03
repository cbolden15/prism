# Prism Harness Plan A execution log

Date opened: 2026-08-27

Status: Plan A Tasks 1, 1A, and 2 are complete. The owner ratified the four Task
2 artifacts on 2026-08-28, and the authorized atomic registry-v2 migration is
implemented and verified. Task 3 has not started.

Plan: `2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md`

Branch: `goal/prism-harness`

## Baseline commit

- Commit: `33ddfb1e8f8203b1495bebabb51b2865276aaa9e`
- Subject: `docs(pnh): ratify hardened Prism Harness Plan A baseline`
- Commit date: 2026-08-27
- Scope: the ratified architecture specification, its hardening report, and the
  owner-approved Plan A implementation plan

The baseline commit contains exactly these artifacts:

| Artifact | Git blob |
|---|---|
| `2026-08-26-prism-harness-architecture-design-spec.md` | `55805d89c29232326ebe2e95f652d385f766e1b0` |
| `2026-08-26-prism-harness-architecture-design-spec.hardening.md` | `a9727a09d563c0e6635a9fadd3298b159abde0c4` |
| `2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md` | `a723f638b063f6ce89401bd26e86d85b0519d910` |

## Pre-change constitutional state

These are Git blob IDs computed with `git hash-object` at the baseline commit:

| Artifact | Git blob |
|---|---|
| `pnh/contracts/invariants.yaml` | `e21eadd127317b0dbdab0c54e183f36ccab4fcb4` |
| `pnh/contracts/invariants.lock` | `0b7efafb710dd4d57d135558a1518031f3131d3a` |
| `docs/plans/provider-neutral-harness/constitution.md` | `6816ce8063a76a49f652d4e7c4d83743b8b9b8bc` |

## Baseline verification

| Check | Result |
|---|---|
| Staged path audit | Passed. Exactly the three baseline artifacts were committed. |
| `git diff --cached --check` | Passed before commit. |
| `git diff --check` | Passed before commit. |
| `npm run typecheck:pnh` | Passed. |
| `npm run test:constitution` | Passed: 37 tests, 0 failures. |

## Active invariant confirmation

The registry blob remains
`e21eadd127317b0dbdab0c54e183f36ccab4fcb4`, matching the pre-change baseline.
Parsing `pnh/contracts/invariants.yaml` and comparing the complete ordered active
set against Plan A produced an exact match:

| ID | Title |
|---|---|
| PNH-INV-02 | One versioned wire vocabulary across all boundaries |
| PNH-INV-03 | Frames are bounded and fail closed |
| PNH-INV-04 | One opaque admission ticket |
| PNH-INV-18 | The public core carries no consumer specifics |
| PNH-INV-22 | Work, limits, cleanup, and evidence are allocation-scoped |
| PNH-INV-23 | Uncancellable deadline and cleanup path |
| PNH-INV-29 | Static owner-approved digest-bound plugin sets |

Result: passed. No unexpected active invariant exists, and no expected active
invariant is missing.

This confirmation records the legacy v1 state only. It is the migration input,
not the registry v2 target model.

## Ratified status-model amendment

The owner ratified
`2026-08-27-invariant-law-proof-status-amendment.md` on 2026-08-27.

| Artifact | Git blob |
|---|---|
| Prior architecture specification | `55805d89c29232326ebe2e95f652d385f766e1b0` |
| Amended architecture specification | `04e8e79a8cb89186da7032b696e832e1cf2d994d` |
| Prior Plan A | `a723f638b063f6ce89401bd26e86d85b0519d910` |
| Amended Plan A | `80ba48cddc5d12b50012a43b73a71aba3b5bac37` |

The amendment replaces the overloaded active/proposed status model with
independent `law_status` and `proof_status` lifecycles. All 46 laws remain
ratified. Plan A will migrate the legacy registry only after implementation is
authorized.

## Task 1: governed proof-state transition primitives

- Commit: `a354505d095cd86a7dbd14f26f7b0d6348c75bc5`
- Subject: `feat(prism): govern invariant proof transitions`
- Result: implementation commit complete; Task 1A correction required before
  Task 2

| Artifact | Git blob |
|---|---|
| `pnh/contracts/registry.ts` | `2ec83d3b30f12a1bc709bf8255a992514f5d624c` |
| `pnh/tests/constitution-registry.test.ts` | `8ded83639683a4420bc4e9efd99760df78ab488a` |

Task 1 added closed law, proof, and amendment vocabularies; preserved historical
amendment compatibility; rejected unknown or malformed amendment metadata; and
added transition validation for law changes, proof invalidation, partial
evidence, proof upgrades, and stale-lock signaling.

The v1 registry loader, `invariants.yaml`, and `invariants.lock` were not migrated
or modified. That atomic migration remains Task 2.

| Verification | Result |
|---|---|
| Red test | Failed on missing Task 1 exports before implementation. |
| Targeted registry suite | Passed: 22 tests, 0 failures. |
| `npm run typecheck:pnh` | Passed. |
| `npm run test:constitution` | Passed: 41 tests, 0 failures. |
| `git diff --check` | Passed. |

## Task 1 review and Task 1A plan amendment

The completed Task 1 review found that `validateInvariantTransition` was not yet
the pure authority seam required by Plan A. It resolves decision paths against
the filesystem, treats file existence as decision authority, and accepts raw
caller-supplied proof-evidence booleans. The owner selected the proper correction:
a pure transition validator plus separate trusted decision and proof resolvers.

| Artifact | Git blob |
|---|---|
| Prior Plan A | `80ba48cddc5d12b50012a43b73a71aba3b5bac37` |
| Amended Plan A | `1c33a814f1324e67cf53a6fe860bdbdd175031ed` |

The amended plan inserts Task 1A before the atomic registry migration, requires a
mandatory owner stop before Task 2 mutates `invariants.yaml`, `invariants.lock`,
or generated constitution blocks, and excludes draft D8 invariants from the
Plan A 46-row baseline.

Task 1A was implemented without rewriting the Task 1 commit.

## Task 1A: pure transition law and trusted authority resolution

- Commit: `da5e03ffaa3a9a18f06313e78d12037210fdba84`
- Subject: `fix(prism): separate transition law from authority resolution`
- Result: complete and verified

Task 1A moved transition law into a filesystem-free module, added opaque
decision and proof authorities, added the trusted repository-contained decision
resolver, and left proof upgrades fail-closed until Task 3.

The Task 2 staging pass found that three decision records must authorize a
closed batch of transitions. Commit
`814cda79c73fced80cbd1b05c47ba66378c76c2b` added exact-key batch entries,
duplicate rejection, and `binding-change` authority before ratification.

| Verification | Result |
|---|---|
| Task 1A targeted suite | Passed: 38 tests, 0 failures. |
| Batch-authority targeted suite | Passed: 39 tests, 0 failures. |
| `npm run typecheck:pnh` | Passed. |
| `npm run test:constitution` | Passed: 41 tests, 0 failures. |

## Task 2 owner ratification

The owner ratified the exact prospective artifact bytes on 2026-08-28 and
authorized the atomic Plan A Task 2 migration. The three decision records were
activated by replacing only their standalone candidate status line with
`Status: Ratified`.

| Artifact | SHA-256 | Git blob |
|---|---|---|
| `pnh/contracts/ratification-baselines/plan-a-v1.json` | `sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c` | `d5bc378f3f18b207100c957e06609d8d3f779b0e` |
| `2026-08-26-plan-a-enforcement-baseline-decision.md` | `sha256:b1138d76e5e6cce422cc6461edc673833c0c20660c4c040b0a07d6b793a2ed5b` | `f01121cbe5effbae25772176cb8c602e7499f5d9` |
| `2026-08-27-plan-a-proof-status-decision.md` | `sha256:5962f74dcaa173d0e73dc152cecb81a0d11b4b22b3ba9310f60bcc958945ddc0` | `9cf060bf78b2aa63bfb6f2f18305d35fb6deba82` |
| `2026-08-26-plan-a-invariant-amendments.md` | `sha256:2c574e464026e527f7cf8273a459ed99d3404b48d530bb092f238b1d91bd6ca6` | `6382608199143c40e17628a31baf996a201a586e` |

Before owner ratification, the candidate verifier confirmed exactly 46 baseline
rows, seven partial proof states, 39 unproven proof states, no proven state, and
53 trusted transition authorities. The registry, lock, and generated
constitution retained their pre-change blobs through the ratification gate.

## Task 2: ratified all-46 registry migration

- Subject: `feat(prism): install ratified invariant baseline`
- Result: complete and verified

The atomic migration installed registry and lock version 2 against the approved
immutable baseline. All 46 invariants have `law_status: ratified`; PNH-INV-02,
03, 04, 18, 22, 23, and 29 are `proof_status: partial`; the remaining 39 are
`proof_status: unproven`; none is `proven`.

PNH-INV-25, 27, and 38 now carry the exact ratified Section 18.5 statements.
`max_cross_plugin_stall_ms` was removed only from PNH-INV-01 and PNH-INV-38.
Every migrated row has one current amendment bound to its legacy lock hash and
the ratified decision selected for that row. Protocol pins and shared resource
constants are unchanged.

| Generated artifact | Git blob |
|---|---|
| `pnh/contracts/invariants.yaml` | `db44d31c7b2fa620f5a9c1e6486e1bd49e3b6a9d` |
| `pnh/contracts/invariants.lock` | `282b414e9a03a0ff3b3e6f31a31c239c0b58ec0b` |
| `docs/plans/provider-neutral-harness/constitution.md` | `840287302ca21a89a73e44e6c3ed5d114474f003` |

| Verification | Result |
|---|---|
| Ratification digest and authority gate | Passed: four approved digests, 46 rows, 53 trusted authorities. |
| Focused migration verifier | Passed: 46 invariants, 7 partial, 39 unproven, 0 proven, lock v2. |
| Targeted registry, authority, and generator suite | Passed: 37 tests, 0 failures. |
| `npm run typecheck:pnh` | Passed. |
| `npm run test:constitution` | Passed: 36 tests, 0 failures. |
| Generated constitution drift check | Passed. |
| `git diff --check` | Passed. |

Task 2 does not install structured proof reports. The gate therefore rejects any
`proven` state until Task 3 supplies that authority path. No Task 3 work is part
of this migration.

## Preserved pre-existing worktree state

`2026-08-26-prism-harness-goal-execution-design-spec.md` was untracked before
the baseline commit. It was excluded from the commit and remains outside Plan A
baseline scope.

## Execution events

| Date | Event | Evidence |
|---|---|---|
| 2026-08-27 | Recorded the local Plan A baseline commit. | `33ddfb1e8f8203b1495bebabb51b2865276aaa9e` |
| 2026-08-27 | Confirmed the complete pre-change active invariant set. | PNH-INV-02, 03, 04, 18, 22, 23, and 29 |
| 2026-08-27 | Ratified the separate law-status and proof-status architecture. | `2026-08-27-invariant-law-proof-status-amendment.md` |
| 2026-08-27 | Completed and verified Plan A Task 1. | `a354505d095cd86a7dbd14f26f7b0d6348c75bc5` |
| 2026-08-27 | Reviewed Task 1 and recorded the owner-selected Task 1A plan amendment. | Prior Plan A `80ba48cddc5d12b50012a43b73a71aba3b5bac37`; amended Plan A `1c33a814f1324e67cf53a6fe860bdbdd175031ed` |
| 2026-08-28 | Completed and verified Task 1A. | `da5e03ffaa3a9a18f06313e78d12037210fdba84` |
| 2026-08-28 | Added closed batch decision authority required by Task 2. | `814cda79c73fced80cbd1b05c47ba66378c76c2b` |
| 2026-08-28 | Owner ratified the four exact Task 2 prospective digests and authorized atomic migration. | `RATIFICATION-GATE.json`; 46 rows; 53 trusted authorities |
| 2026-08-28 | Completed and verified the atomic Task 2 registry-v2 migration. | 46 ratified laws; 7 partial; 39 unproven; 0 proven; lock v2 |
