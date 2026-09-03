# Plan A completion decision

- Date presented: 2026-08-28
- Gate: `docs/ai/workstreams/20260828-homelab-setup-plan-a-task6-final-audit-c423e7/authority-evidence/PLAN-A-RATIFICATION-GATE.json`
- Gate digest: `sha256:ebccd457b5ff002a2a07e6e8441e18e4cbe46e9e42c380576163a5c8088f02d5`
- Expected owner: Vora Technologies, LLC (role: owner)
- Status: **decided — `Ratified` (see Recorded decision)**
- Supersedes: the withdrawn gate presented earlier on 2026-08-28 (digest
  `sha256:7b3becdb…3544b`), invalidated when resolution verification found
  Critical F-13; that gate was never decided.

## What the owner is deciding

Whether Plan A of the Prism harness constitutional program is complete at the
exact artifact digests pinned in the ratification gate. This decision closes
Plan A only; under every allowed outcome, Plan B implementation is not
authorized. `Ratified` additionally allows Plan B authoring (authoring only).

## Completion checklist

1. Task 1A and all six numbered tasks are complete. Tasks 1A–5 closed in
   their own governed workstreams with committed evidence; Task 6 (this
   gate) ran the full matrix, the mechanical comparison, and an independent
   adversarial review with per-fix resolution verification.
2. The complete verification matrix passed from clean processes at matrix
   HEAD `f32b2e0`: typecheck, module graph, public-claim gate (0 failures),
   constitution suite 150/150, sandbox suite 462 tests 0 failures (100% core
   coverage), generated-constitution check against the archived canonical
   proof report, freshly signed proof report, `git diff --check`. Ordered
   commands, exit statuses, stable counts, and output digests:
   `authority-evidence/PLAN-A-VERIFICATION-RESULTS.json`.
3. Registry, lock, generated constitution, proof report, and public claims
   agree: mechanical comparison C1–C11 green — all 46 rows equal the
   lock-pinned immutable baseline and design-spec Section 18.8; proof split
   exactly PNH-INV-02/03/04/18 proven, 22/23/29 partial, 39 unproven;
   PNH-INV-01 carries no 50 ms bound; PNH-INV-25/27/38 match the ratified
   amendment text after YAML folding; lock v2 equals `computeLock`; both
   proof reports carry exactly the four proven IDs with matching kinds.
4. The independent final review has no unresolved Critical or Important
   finding. Findings F-01 through F-18: both Criticals (skip-region bypasses
   of the public-claim gate — fences, then generated-region markers) and
   both Importants are fixed and reviewer-verified by re-running the
   original attacks (nineteen further attacks refused on the F-13 fix
   alone); Minors are resolved (F-04, F-12) or carried with recorded bounds
   (F-05, F-06); ten Info bounds recorded. Review artifact:
   `reviews/2026-08-26-plan-a-final-review.md`.
5. This decision states explicitly: **Plan B authoring is allowed and Plan B
   implementation is not authorized** under a `Ratified` outcome. Any
   amendment invalidates the prospective gate and returns Plan A to review.

## Allowed outcomes

| Outcome | Effect |
|---|---|
| `Ratified` | Plan A closes at the pinned digests; Plan B authoring allowed; Plan B implementation not authorized |
| `Ratified with amendments` | Invalidates this prospective gate; returns to review; no Plan B work |
| `Not ratified` | Plan A remains open; no Plan B work |

## Owner receipt (D5)

To close Plan A, the owner records a receipt that binds the gate digest and
exactly one allowed outcome — an explicit statement of the form:

> As owner for Vora Technologies, LLC, I select the outcome `<outcome>` for
> Plan A completion gate digest
> `sha256:ebccd457b5ff002a2a07e6e8441e18e4cbe46e9e42c380576163a5c8088f02d5`.

Only the validated receipt closes Plan A. The gate, validated receipt, this
completion record, and the exact authority evidence are then committed as the
dedicated Plan A completion-authority commit.

## Recorded decision

- Date: 2026-08-28
- Outcome: `Ratified`
- Receipt, verbatim as recorded from the owner:

> As owner for Vora Technologies, LLC, I select the outcome Ratified for
> Plan A completion gate digest
> sha256:ebccd457b5ff002a2a07e6e8441e18e4cbe46e9e42c380576163a5c8088f02d5.

- Validation: the selected outcome is an allowed outcome of the gate; the
  quoted digest equals the gate's `gate_digest` byte-for-byte; every
  gate-bound artifact (registry, lock, baseline, proof report, review
  attestation, generated document, verification results) is unchanged since
  gate construction.
- Effect: Plan A is closed at the pinned digests. Plan B authoring is
  allowed. Plan B implementation is not authorized. Gate A0 binds the
  completion-authority commit before proceeding.
