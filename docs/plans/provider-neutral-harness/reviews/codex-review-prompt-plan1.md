You are the orchestrator for a pre-execution hardening review of an implementation plan for a security kernel. Nothing has been implemented yet — the plan is the artifact under review. Your job: find the defects NOW that would otherwise surface as review failures or runtime bugs after implementation.

## Context (read in this order, before dispatching anything)

1. `docs/plans/provider-neutral-harness/2026-08-19-kernel-plan-1.md` — the plan under review (8 TDD tasks, complete code in every step).
2. `docs/plans/provider-neutral-harness/architecture.md` — the binding constraints (especially "Boundary enforcement (constraint from Task 4)", the capability-family constraints, and Security invariants).
3. `docs/plans/provider-neutral-harness/intake-openhands-sdk-2026-08-19.md` — the intake verdict the plan implements.
4. Prior-art threat model (different branch, same git object store — read via git, do NOT switch branches):
   `git show x1/dsh-extraction-readiness-plan:docs/x1/dsh-open-source/threat-model.md`
   Sections 5, 7 (C12, C19), 8 (T22), and 12 matter most. This program's lexical checker was demonstrated fail-open across three review rounds; the plan claims to implement the replacement mechanisms.

## Dispatch: four review subagents, in parallel, each blind to the others

Use your subagent mechanism to run four independent reviewers. If subagents are unavailable, run the four lenses yourself in separate sequential passes without letting one lens's findings leak into the next. Each reviewer reads the plan + context files and writes findings to its own file:

- `docs/plans/provider-neutral-harness/reviews/plan1-findings-adversarial.md`
- `docs/plans/provider-neutral-harness/reviews/plan1-findings-correctness.md`
- `docs/plans/provider-neutral-harness/reviews/plan1-findings-spec.md`
- `docs/plans/provider-neutral-harness/reviews/plan1-findings-executability.md`

Each finding: `id, severity (Critical|Important|Minor), task/step, claim, evidence (quote the exact plan text), fix (concrete replacement text or code)`.

**Lens 1 — ADVERSARIAL (break the mechanisms).** Assume the enforcement code is wrong and attack it as specified:
- Locked-realm harness: enumerate ambient nondeterminism/authority the stub list misses that is REACHABLE by code passing the module-graph checker — e.g. `performance.now()`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `queueMicrotask`, `setImmediate`, `Atomics`/`SharedArrayBuffer`, `WeakRef`, `Error().stack` contents, `globalThis` enumeration to find un-stubbed handles, capturing `Date` before the realm activates (module evaluated OUTSIDE a realm once, then re-used inside — note ESM module caching means first-import wins). A reachable miss is Critical.
- Module-graph checker: bypass attempts — `export * from`, TS `/// <reference>`, `import()` with the callee renamed via destructuring is NOT possible for the import keyword, but check `new Function("return import('x')")` reachability, decorators/emit helpers pulling `tslib`, JSON imports, and whether the checker's file listing misses non-`.ts` files a TS file could reference.
- Grant/consume semantics: try to construct two distinct valid grants with identical canonical bytes; attack the claim-key derivation for cross-audience collisions; attack the expiry/skew boundary conditions; check whether `'replayed'` vs `'conflict'` semantics can be abused to double-execute (the T22 scenario) given the plan's MemoryReplayLedger and the port contract comments.
- Evidence chain: forge a chain that verifies (truncation from the tail, whole-chain re-computation — note what the design can and cannot detect and whether the plan's comments overclaim).

**Lens 2 — CORRECTNESS (every code block, line by line).** The plan contains complete implementations and tests. Verify they are mutually consistent and would actually pass:
- Timestamp math: check `daysFromCivil` against the test's `Date.UTC` reference dates by hand for at least 3 cases including 2000-02-29 and 2100-01-01 (century non-leap).
- Every test expectation vs the implementation it tests (reject-code ordering in `validateGrant` — e.g. which code fires when multiple defects coexist in a test fixture; the `clock-skew` fixture must not hit `expired` first; TTL arithmetic; the canonical-array arity assertion vs the actual array literal).
- TypeScript strictness: would each block compile under `strict` + `noUncheckedIndexedAccess` as written (indexing, narrowing after `r.ok` checks, `import type` erasure making `consume.ts` runtime-empty)?
- Locked-realm restore path: does the `finally` block restore exactly what was saved, including properties defined via `defineProperty`?

**Lens 3 — SPEC COMPLIANCE (plan vs architecture.md).** For each Global Constraint in the plan and each binding constraint in architecture.md: point to the task/step that implements it, or record a gap. Specifically check: the five contract families' capability constraints (at-most-once vs replay wording, no ambient clock, canonical serialization), neutral vocabulary in ALL fixture values and reject codes, `MAX_GRANT_TTL_MS` value vs the architecture's cited Gate E window, the "continuous execution" requirement vs the plan's single-entry-point claim, and whether anything in the plan touches forbidden paths (`x1/dsh/**`, `packages/`).

**Lens 4 — EXECUTABILITY (can a worker actually run this).** Steps in order, commands as written: does the repo have `typescript` and `@types/node` available for `tsconfig.pnh.json` (check `package.json`); does `tsx --test` glob expansion work as written; does the c8 command line function with `npx ... npx tsx`; does the Task 2 CLI self-detection guard work under tsx; are file paths consistent across tasks; does Task 3's retrofit instruction fully specify the change; is any step's expected output wrong; will `import.meta.dirname` work under the repo's Node version. Flag any step a competent worker could not complete without guessing.

## Verification gate (you, the orchestrator — this is the hardening step)

For every Critical and Important finding from any lens: re-derive it yourself against the actual plan text before accepting it. Kill findings that misquote the plan, describe code the plan doesn't contain, or claim a bug the plan's own test would catch in Task order. Deduplicate across lenses (same defect via two lenses = one finding, keep both lens attributions).

## Report contract

Write the consolidated, verified report to:
`docs/plans/provider-neutral-harness/reviews/2026-08-19-plan1-hardening-report.md`

Shape:

```
# Plan 1 hardening review — consolidated
VERDICT: PASS | FAIL   (FAIL if any verified Critical stands)
COUNTS: Critical N / Important N / Minor N (after verification; note kills)
## Verified findings
### <id> <severity> — <one-line claim>
- Task/step: ...
- Evidence: <exact quote>
- Fix: <concrete replacement text/code>
- Lens(es): ...
## Killed findings (with kill reason, one line each)
## Coverage statement
<which plan sections each lens actually read; anything not reviewed, say so>
```

Also print the VERDICT and COUNTS lines to the terminal at the end.

## Invariants (hard rules)

- Do NOT edit the plan file or any file outside `docs/plans/provider-neutral-harness/reviews/` — fixes are applied by a separate session after reconciliation (one-writer rule).
- Do NOT commit, do NOT push, do NOT switch branches (`git show` for cross-branch reads only).
- Do NOT run the repo's test suites or install anything; this is a document review. Running small self-contained snippets you wrote yourself (e.g., checking date arithmetic in `node -e`) is fine.
- Quote line/step references exactly; a finding that misquotes the plan is a killed finding.
- Findings must be actionable: every Critical/Important carries a concrete fix, not "consider handling".
