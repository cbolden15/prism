# Plan A final review — Gate P4 independent audit

- Date: 2026-08-28
- Workstream: `docs/ai/workstreams/20260828-homelab-setup-plan-a-task6-final-audit-c423e7/`
- Full findings record: `docs/ai/workstreams/20260828-homelab-setup-plan-a-task6-final-audit-c423e7/REVIEW-FINDINGS.md`
  (findings F-01 through F-18, a 19-entry kill list for the original pass, and
  per-fix resolution-verification sections with their own attack logs)
- Review basis: independent adversarial pass over transition governance, proof
  provenance, generated status, and public-claim closure, executed by a
  separate agent session against file bytes and command exit codes, never
  document narrative. Tamper fixtures were `git archive` extractions; the
  reviewer ran no `--write` or `--update-lock` form and wrote no repository
  file other than its findings record.
- HEADs: findings scored at `df293ca` (assigned `7469466`; all constitutional
  machine state byte-identical across that range). Remediations were
  independently re-verified by the reviewer by re-running the original attack
  probes in fresh fixtures: F-02/F-03/F-04 at `2e4ef4f`, F-13 at `f32b2e0`.
  Final matrix HEAD: `f32b2e0`.

## Verdict

Plan A closes at matrix HEAD `f32b2e0` with both Criticals and both
Importants resolved and reviewer-verified. Transition governance, proof
provenance, the lock, and generated output survived every falsification
attempt across all passes. The public-claim gate was the defective layer: its
Markdown skip regions (fences, then generated-region markers) each provided a
two-layer bypass of the digest and the sweep. Both doors are now refused,
with the reviewer's exact attacks re-run and refused, structural
single-parser reasoning recorded, and regression tests pinned. No open
finding blocks completion.

## Findings and resolutions

### F-01 (Critical) — skip regions escaped the claim digest and the sweep — RESOLVED in two stages, verified

One skip region carried a false security claim (`trusted-subprocess-v1 is
sandboxed and provides a guaranteed isolation boundary`) past every layer of
the public-claim gate: `normalizeClaimText` dropped the region before hashing
and `scanSurface` dropped it again, so a sentence that produces four failures
as prose produced zero inside the region — including inside the digest-bound
registered block PNH-CLAIM-05 on the one registered public surface, so the
exposure was live.

Stage 1 (`3579177`) closed the fenced-code vector: fenced lines never join a
claim-text digest, so they are never registered text; `scanSurface` now
sweeps them with the closed vocabularies wherever they appear. Reviewer
verification killed the original probe plus indented-fence, zero-width, and
fullwidth evasions.

Stage 2: the reviewer's resolution-verification pass found the same two-layer
escape alive through the sibling skip — generated-region markers — and filed
it as F-13 (below). F-01 is fully resolved only as of the F-13 fix.

### F-13 (Critical) — generated-region markers were an unowned skip region — RESOLVED, verified

`<!-- pnh:conformance:begin -->` / `<!-- pnh:invariants:<name>:begin -->` are
plain HTML comments any writer can type, and both the digest and the sweep
honored them as skip regions — while no generator owns, regenerates, or
verifies any region on a registered public surface. Wrapping the F-01
sentence in these markers passed the gate at exit 0 in both unregistered
prose and inside PNH-CLAIM-05.

Resolution (`f32b2e0`): a generated-region marker on a registered public
surface is refused outright wherever it appears outside a fence (a fenced
marker stays literal content, matching digest precedence). If a
generator-owned surface is ever registered, that change must consciously
extend the gate with generator ownership — and must bring
`unclosedFenceIndex` into agreement (F-18 below). Reviewer verification:
nineteen attacks, all exit 1, including marker-spelling variants,
end-marker-only regions, in-fence and cross-fence placements, and
state-freeze probes; the parser-asymmetry class is structurally unreachable
because both parsers test the same two shared constants on identically
trimmed lines, and any spelling both miss joins the digest and fails on
mismatch.

### F-02 (Important) — availability vocabulary unchecked outside registered blocks — RESOLVED, verified

Unregistered prose could call an unproven invariant proven, shipped, and
production-ready with the gate silent. Resolution (`3579177`): the
whole-surface sweep now also refuses unregistered availability language and
any `PNH-INV-nn` reference (case-insensitive) outside a registered claim
block. All four original probes and the lowercase-id evasion now fail;
regression tests pin both rules.

### F-03 (Important) — a mandated gate command was owner-only and undeclared — RESOLVED, verified

`npm run proof:constitution` refuses to mint an unsigned report (correct by
design), but both gate documents listed it bare under "a skipped command is a
failed exit gate". Resolution (`2e4ef4f`): both matrices annotate the command
owner-only (runner signing identity via `PNH_EXECUTION_SIGNING_*`) and name
the reviewer-runnable counterpart: `--check --proof-report` against the
archived canonical report.

### F-04 (Minor) — stale bare `--check` in the plan's exit gate — RESOLVED, verified

Resolved in `2e4ef4f` with the same `--proof-report` pin the program received
in `2e3b0db`.

### F-05 (Minor) — single-entry manual surface allowlist — CARRIED

One registered surface, no discovery; a new public markdown file is unchecked
until registered. The one unchecked candidate today (`constitution.md`
handwritten prose) was audited clean by the reviewer. Follow-up: surface
discovery or a registration assertion.

### F-06 (Minor) — amendment `kind` optional and not cross-checked — CARRIED

A wrong or missing amendment `kind` mislabels the audit trail but cannot
license an unauthorized transition (verified by direct probe). Follow-up:
require `kind` on new amendments and assert it matches the authorized
transition; backfill only under an explicit decision record.

### F-12 (Minor) — plan exit gate omitted the sandbox suite — RESOLVED

The plan's matrix asserted "run every command" while omitting
`env -u PRISM_LIVE_CODEX npm run test:pnh`. Resolved at `778f0c5`.

### Info findings — recorded bounds, none blocking

- F-07: the assigned HEAD's 24 sandbox `test:pnh` failures were environmental
  and fixed in-range (`74b8237`, `df293ca`); `74b8237` verified
  evidence-semantics-neutral across ESM/CJS.
- F-08: `--check` never consults the lock; registry–lock agreement is
  enforced by `constitution-gate.test.ts` inside the mandated
  `test:constitution` run.
- F-09: PNH-INV-18's declared limitation behaved exactly as declared under a
  checker-gutting tamper.
- F-10: the sandbox image interprets pnh TypeScript as CJS while the host
  runs ESM (no `package.json` at or above `/sandbox/pnh`); fails loudly at
  transform time; unify under its own reviewed change.
- F-11: the F-01/F-02 remediation had its behavior adversarially re-probed
  but no full independent line-review; sweeping fenced lines biases toward
  false positives on future command examples — accepted as fail-closed bias
  (a false positive is loud; its fix is a wording change).
- F-14: fence info strings are not swept (not reader-visible content).
- F-15: the sweep is line-scoped; a phrase split across a Markdown soft wrap
  is not matched.
- F-16: a respelled id (`PNH INV 26`) defeats the id rule, and "proven" is in
  neither vocabulary.
- F-17: inside a registered block the generated-marker refusal is the only
  defensive layer (block bodies are not prose-swept and the digest still
  drops the region); sound while the refusal is unconditional.
- F-18: `unclosedFenceIndex` is a third parser that still honors generated
  regions for fence tracking; unreachable today because `scanSurface` refuses
  the marker first, but whoever adds generator ownership must reconcile it in
  the same change.

## Kill list

The original pass documented nineteen killed falsification attempts with
their guards; the F-13 verification pass documented nineteen more. Full
lists with commands and refusal strings are in the workstream findings
record. Highlights: the 54-amendment hash chain has zero breaks; all 39 law
transitions match a declared `Transition entry` in their cited decisions;
fabricated decision citations, laundered registry edits, tampered proof
reports, rewritten amendment history, lock drift, generated-prose
overstatement, unclosed-fence smuggling, de-registered claim blocks, and
every marker-spelling and state-freeze variant were refused with specific
errors.

## Carried follow-ups (none blocking)

1. F-05 surface discovery; F-06 amendment-kind enforcement.
2. F-10 sandbox module-format unification.
3. F-17/F-18: when generator ownership is ever added to registered surfaces,
   add in-block defense in depth and reconcile `unclosedFenceIndex` in the
   same change.
4. Runner signing-key custody: the execution runner private key exists only
   in an ephemeral session scratchpad; move to durable owner custody or
   define rotation before the next signed proof run.
5. From Task 5: compliance Minors 3–10; recorded bounds (lexical-floor gate,
   negation-scoping residue, homoglyphs out of scope, single-file surface
   set).

## Verification state at close

At matrix HEAD `f32b2e0`: full Gate P4 matrix exit 0 end to end (owner-only
step run with the owner-held signing identity); public-claims suite 74/74;
constitution suite 150/150; sandbox suite 462 tests, 459 pass, 0 fail,
3 skipped, core coverage 100%; mechanical comparison C1–C11 green (46 rows vs
immutable baseline and design-spec 18.8; proof split exactly 02/03/04/18
proven, 22/23/29 partial, 39 unproven; lock v2 equals `computeLock`; baseline
digest binding valid; the archived canonical report and the freshly signed
report each carry exactly the four proven IDs with kinds matching the
registry). The reviewer independently reproduced the suite counts and the
clean-gate baseline at each verification stage.
