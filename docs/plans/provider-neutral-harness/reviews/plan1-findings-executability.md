# Plan 1 executability findings

Counts: Critical 0 / Important 1 / Minor 0

## Findings

### EXEC-001 — Important — Task 8 Steps 3 and 7 omit required test-file staging

- Task/step: Task 8, Step 3 and Step 7
- Claim: Step 3 explicitly tells the worker to edit whichever `pnh/tests/*.test.ts` files the coverage report identifies, but Step 7 stages only `package.json`, `package-lock.json`, and `pnh/README.md`. A worker following the plan exactly cannot complete the required per-task commit without guessing which additional files to add, and may accidentally leave the coverage-closing tests out of the commit.
- Evidence:
  - "`Commit after every task with the message given in the task. Never push.`"
  - "`For each uncovered branch, add a test to the matching test file that exercises it inside `lockedRealm` (e.g., the `timestamp.ts` month-boundary branches, `grant.ts` reject paths not yet hit). Do NOT add ignore pragmas — an uncovered branch is a missing test, not an annotation site. Repeat until the gate passes.`"
  - "`git add package.json package-lock.json pnh/README.md`"
- Fix:

```bash
git add package.json package-lock.json pnh/README.md pnh/tests
git commit -m "feat(pnh): 100% coverage gate completes C19 enforcement pipeline"
```

## Command and path coverage statement

- Paths reviewed under the required precedence order:
  1. `docs/plans/provider-neutral-harness/reviews/codex-review-prompt-plan1.md`
  2. `docs/plans/provider-neutral-harness/2026-08-19-kernel-plan-1.md`
  3. `docs/plans/provider-neutral-harness/architecture.md`
  4. `docs/plans/provider-neutral-harness/intake-openhands-sdk-2026-08-19.md`
  5. `git show x1/dsh-extraction-readiness-plan:docs/x1/dsh-open-source/threat-model.md` with Sections 5, 7, 8, and 12
- Additional in-scope metadata reviewed for Lens 4 only: root `package.json`, root `package-lock.json`, and existing repo script usage of `tsx --test`, `import.meta.dirname`, and tsx CLI guards.
- Commands reviewed: every `Run:` command in Tasks 1 through 8, plus the `test:pnh`, `check:pnh-graph`, and `test:x1` script shapes in the plan and root `package.json`.
- Checks completed with no separate finding:
  - root `package.json` already provides `typescript`, `@types/node`, and `tsx`
  - the repo already uses `tsx --test ...*.test.ts` in `test:x1`
  - the repo already uses `import.meta.dirname`, and the current repo Node runtime is `v22.21.0`
  - the Task 2 CLI self-detection pattern is executable under the repo's tsx-based script model
  - Task 3's retrofit instructions are specific enough to carry out without guessing
  - no additional expected-output mismatch was confirmed under the executability lens
