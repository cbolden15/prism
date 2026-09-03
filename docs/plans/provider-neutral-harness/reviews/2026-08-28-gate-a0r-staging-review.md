# Gate A0R staging-authority review attestation

- Date: 2026-08-28
- Scope: independent hardening of the exact A0 source package (five AGE
  contracts, successor baseline, integrated reconciliation, imported-root
  supplement) and the two Gate A0R staging documents (ratification-staging
  amendment, closed staging-tool contract), per the constitutional closure
  program's Gate A0R.
- Reviewers: one adversarial pass over the full package and one
  SECURITY-lens confinement pass over the staging pair, both independent of
  the authoring session, each running three rounds — initial review,
  resolution verification, final targeted verification — with every attack
  re-run against revised bytes.

## Findings and resolution

| Round | Findings | Outcome |
|---|---|---|
| Initial (adversarial) | A-01..A-14: 5 Critical, 5 Important, 3 Minor, 1 Info | All Criticals and Importants fixed; A-12/A-13 Minors fixed; A-11 Minor fixed; A-14 Info fixed in the builders |
| Initial (security) | S-01..S-10: 4 Critical, 6 Important | All fixed or narrowed in the full staging-document revision |
| Resolution verification | 12 of 14 adversarial and 8 of 10 security findings verified Resolved; residuals S-01, S-03, A-05, plus new A-15 (Critical), A-16, A-17, A-18 (Important) | All six residual items fixed in a second revision |
| Final targeted verification | Both reviewers re-attacked every residual fix | **0 unresolved Critical, 0 unresolved Important from both reviewers** |

Full findings, per-attack justifications, and verbatim verdicts:
`REVIEW-FINDINGS-ADVERSARIAL.md` and `REVIEW-FINDINGS-SECURITY.md` in
workstream `20260828-homelab-setup-gate-a0r-staging-authority-9015b6`.

## Disclosed-and-carried residuals (owner-visible)

Neither reviewer counts these as open defects; both are recorded risk
acceptances the owner sees before deciding, and each names its stronger
alternative:

1. **S-01 — bootstrap identity of the enforcement layer and verifier.**
   Contract E4 requires both source closures to be digest-recorded in
   committed Gate A1 evidence with an independent review pass before the
   first staging tool run, and every later invocation record to carry those
   exact digests or validate nothing. What remains: the verifier's own runs
   are not checked by a second verifier, and the bootstrap authoring act
   precedes the enforcement layer's existence. The security reviewer judged
   this the standard, accepted mitigation for bootstrap trust. Stronger
   alternative if the owner wants it: a second owner gate that binds the
   enforcement layer's and verifier's digests after they are authored and
   before any staging tool run.
2. **A-05 — receipt validation is a coordinator act.** Amendment section 7
   states in its own voice that checklist execution is not
   self-authenticating and that authenticity rests on the channel of record
   alone; the decision record must hand the owner a one-command digest
   recomputation, and mechanized gate-type-aware receipt validation is Gate
   A1 build scope. The adversarial reviewer judged the disposition honest
   and completely recorded.

## Post-final-verification delta

Two one-sentence clauses proposed by the adversarial reviewer's final pass
were applied verbatim after that pass: the E2 enumeration sentence (the
verifier's re-walk is its own audit act) and the coordinator-evidence
carve-out in amendment S2 and contract section 1. The reviewers' final
verdicts hashed the staging pair at `3a12210e…` / `4ea42c9c…`; the two
clauses move the final objects to those pinned by the staging-authority
gate. No other byte differs between the verified and final versions.

## Final package objects

| Artifact | Git object |
|---|---|
| AGE-1..AGE-5 contracts | `5e531334…`, `651943a4…`, `c8cebdc7…`, `34657d4c…`, `b2df98c6…` (unchanged throughout) |
| Successor baseline (A0R revision, committed `4b90b3a`) | `d40e8d54088e3052ac214800101589b03cf6916d` |
| Reconciliation (A0R revision, committed `4b90b3a`) | `46fae101ce44bbf73b020e34aa4640d92c8e9fde` |
| Imported-root supplement | `2aa97b52bf5f58ef06eb9ebeb34a3151e716d18a` |
| Ratification-staging amendment (final) | `352b43e90ac6454008a9cf03f7142a4619a000d5` |
| Closed staging-tool contract (final) | `5964aff4d2512418ac2a1b62bda5e57f7e534a40` |

## Verification at final bytes

- `verify-package.mjs`: PASS, 1159 checks (1121 package, 38 hygiene), 0
  failures; 65 imported roots closed; 13 boundary objects bound. The
  adversarial reviewer independently re-ran this and the two gates below at
  its final pass.
- `npm run check:public-claims`: 0 failures.
- `git diff --check`: clean.

This attestation records review evidence only. It grants no authority; the
staging-authority gate and the owner receipt govern activation.
