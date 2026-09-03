# Prism harness ratification-staging amendment (Gate A0R draft)

- Date: 2026-08-28
- Status: draft under Gate A0R, revised under the Gate A0R independent
  hardening pass; no effect until a validated `Ratified` receipt over the
  AGE staging-authority gate binds it
- Drafting authority: Plan B authoring under the Plan A `Ratified` outcome
  (completion-authority commit `3cfe36d374d9af9341da85502822ecbdb13d64db`);
  Gate A0R of the constitutional closure program
- Companion document: the closed staging-tool contract
  (`2026-08-28-prism-harness-staging-tool-contract.md`); the staging-authority
  gate binds this amendment and that contract as one package, so the receipt
  that activates this amendment fixes both documents' exact bytes

## 1. Purpose

The accepted AGE architecture does not authorize implementation, schema
migration, or prospective machine rows. Gate A1 of the constitutional closure
program requires exactly two capabilities that the architecture currently
withholds: running bounded review tooling over the ratified source package,
and producing noncanonical prospective artifact bytes for review. This
amendment grants those two capabilities — narrowly, contingently, and with an
explicit closed list of authorities it does not grant.

## 2. Source bindings

This amendment binds the exact A0 source package (as revised by the Gate A0R
hardening pass) and the exact read-only inputs staging tools may consume. Any
changed byte in any bound object invalidates the staging-authority gate and
requires fresh review and a new gate.

### 2.1 Candidate package

| Artifact | Path | Git object |
|---|---|---|
| AGE-1 task authority contract | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-age-1-task-authority-contract-spec.md` | `5e531334cc4f63eaa957341c5505e24f970444c2` |
| AGE-2 run coordination contract | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-age-2-run-coordination-contract-spec.md` | `651943a4581e57079b804b29722403933178419c` |
| AGE-3 effect authority contract | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-age-3-effect-authority-contract-spec.md` | `c8cebdc7f4528d3a7a2b0539b6247581cd26d33e` |
| AGE-4 content custody contract | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-age-4-content-custody-contract-spec.md` | `34657d4c3e3d0d230663023e48d886f8e4b73e20` |
| AGE-5 human decision and completion contract | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-age-5-human-decision-and-completion-contract-spec.md` | `b2df98c612870097f3ece3dcf2eb15fd6d7ad89e` |
| Successor constitutional baseline (Gate A0 amendment, A0R revision) | `docs/plans/provider-neutral-harness/2026-08-28-prism-harness-autonomous-goal-execution-successor-constitutional-baseline.md` | `d40e8d54088e3052ac214800101589b03cf6916d` |
| Integrated package reconciliation (Gate A0 refresh, A0R revision) | `docs/plans/provider-neutral-harness/2026-08-28-prism-harness-age-1-through-age-5-integrated-package-reconciliation.md` | `46fae101ce44bbf73b020e34aa4640d92c8e9fde` |
| Imported-root supplement | `docs/plans/provider-neutral-harness/2026-08-28-prism-harness-age-imported-root-supplement.md` | `2aa97b52bf5f58ef06eb9ebeb34a3151e716d18a` |

### 2.2 Read-only staging inputs

Staging tools may read the following, and R1 of the staging-tool contract
forbids writing any of them:

| Artifact | Path | Git object |
|---|---|---|
| Canonical invariant registry | `pnh/contracts/invariants.yaml` | `48ae4d1fe0bf93219c86829647d7cb733dbbefa9` |
| Canonical invariant lock | `pnh/contracts/invariants.lock` | `da3a5da77b6b006af9129d2f1364b9ac73027f1a` |
| Plan A predecessor baseline | `pnh/contracts/ratification-baselines/plan-a-v1.json` | `d5bc378f3f18b207100c957e06609d8d3f779b0e` |
| Invariant law and proof status amendment | `docs/plans/provider-neutral-harness/2026-08-27-invariant-law-proof-status-amendment.md` | `87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a` |
| Accepted AGE architecture | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-autonomous-goal-execution-architecture-spec.md` | `5fc1443f9d8e740d4811a02d9e3a5dd637a12184` |
| AGE architecture acceptance | `docs/plans/provider-neutral-harness/2026-08-27-prism-harness-autonomous-goal-execution-architecture-acceptance.md` | `d47455756eac691c5cc8b3dc0aa774f6f04c2227` |
| Living package verifier | `docs/ai/workstreams/20260828-homelab-setup-age1-age5-package-reconciliation-73b68d/verify-package.mjs` | `1c5c2807f0b3f1d25f705c96128385c6198ff8b8` |

The thirteen boundary-manifest objects are bound transitively: each is the
exact git object the reconciliation's boundary manifest (section 9) pins, and
each is declarable as a read-only input by its object id. This amendment and
the staging-tool contract are themselves always-declarable read-only inputs
of every staging tool run.

The living package verifier and the repository's own gates run as
coordinator verification commands under the program's discipline, not as
staging tool runs; the pin above fixes the verifier's bytes, no staging tool
executes it, and the staging-tool contract does not govern coordinator
verification commands.

Program authority: `CONSTITUTIONAL-CLOSURE-PROGRAM.md` in workstream
`20260828-goal-prism-harness-execute-goal-36-through-collision-safe-preflight-and-produce-a-verified-constitu-780a8e`.
Gate A0 checkpoint commit: `5c69cb4`; A0R package-revision checkpoint:
`4b90b3a`, the source head whose committed tree carries every section 2
binding at the exact object above. The program document is a living
execution record and is deliberately not digest-bound here; nothing in the
staging-tool contract's permitted-capability set is parameterized by it —
the closed artifact forms and the closed law-transition set are stated
inside the contract itself (contract P4).

## 3. Definitions

- **Staging custody**: exactly two kinds of location, and custody membership
  is determined after full path resolution — symbolic links, hard links,
  `..` segments, case folding, and mount indirection are resolved first, and
  a resolved path outside the custody roots is outside custody regardless of
  its unresolved spelling.
  - (a) The single Gate A1 governed-workstream directory subtree under
    `docs/ai/workstreams/`: a new directory created for Gate A1, distinct
    from every workstream directory existing at gate time, whose exact
    repository-relative path the owner receipt binds (section 7). No other
    workstream directory is staging custody.
  - (b) Run-scoped temporary directories: for each staging tool run, a fresh
    directory created by the run's enforcement layer (contract section 6)
    under the Gate A1 workstream's own `tmp/` subtree — inside custody kind
    (a), excluded from repository commits by an ignore rule created with
    the workstream — recorded in that run's evidence and used by no other
    run. No operating-system temporary hierarchy is staging custody, and no
    tool or session may designate any other location as temporary.
- **Canonical surface**: every repository path outside staging custody, and
  additionally the resolved git directory wherever it physically resides —
  including the target of a `.git` worktree or gitlink pointer file outside
  the working tree. The registry (`pnh/contracts/invariants.yaml`), the lock
  (`pnh/contracts/invariants.lock`), the ratification baselines
  (`pnh/contracts/ratification-baselines/`), and the generated constitution
  are canonical stores within the canonical surface.
- **Staging tool**: a program run under the closed staging-tool contract. A
  staging tool run is a terminating operating-system process using the
  toolchain fixed in contract section 1, executed under the independent
  enforcement layer of contract section 6; it is not runtime execution in
  the sense of section 5, item 3. Staging tools are authored as workstream
  source text held in staging custody, never on the canonical surface.
- **Noncanonical prospective bytes**: candidate and exact prospective
  artifact sets (baseline forms, registry forms, lock forms, generated
  document forms) produced during Gate A1 in staging custody, in exactly the
  closed forms of contract P4. Neither set is canonical; neither set carries
  law status effect or proof status beyond the P4 fixed content.

## 4. Granted staging authority

Upon — and only upon — a validated `Ratified` receipt binding the AGE
staging-authority gate digest, Gate A1 work may:

- **S1 — Bounded review tooling.** Author and run staging tools within the
  closed staging-tool contract's permitted-capability set, over the exact
  source bindings of section 2.
- **S2 — Noncanonical prospective bytes.** Produce, compare, and verify
  noncanonical prospective bytes, in staging custody only and only through
  staging tool runs compliant with the closed staging-tool contract. A
  process that handles prospective bytes outside a compliant run — other
  than the coordinator recording staged bytes as committed evidence under
  section 5, item 7 — exercises no granted authority and violates this
  section.

Nothing else is granted. S1 and S2 activate the Gate A1 scope named by the
program, and they remain active — unchanged and unextended — for re-running
the same staging tools over the same pinned package during Gate A2
verification and hardening. They extend to no new artifact form, no new
custody location, and no gate beyond A2; every gate whose work exceeds
re-running these tools requires its own ratification.

Where a section 2 source states that its own drafting authority did not
authorize staged machine forms, prospective rows, or tooling (for example
the successor baseline's non-authority boundary), this amendment's S1 and S2
govern for Gate A1 and A2 staging work only; every other statement in those
sources stands unchanged.

## 5. Withheld authorities (closed list)

This amendment grants none of the following, under any outcome, in any
custody:

1. **Law status.** No canonical row acquires, changes, or loses law status.
   Staged prospective rows in staging custody carry law-status fields only
   as the closed P4 fixed content — `proposed` rows and the closed set of
   43 `proposed` to `ratified` transitions applied to prospective rows
   PNH-INV-47 through PNH-INV-89 only — and those fields have no legal
   effect while staged.
2. **Proof status.** No staged or canonical row acquires a proof status
   other than the program-required unproven-with-exact-reason fixed content;
   no proof obligation is discharged.
3. **Runtime execution.** No staged artifact, harness runtime, kernel,
   plugin, daemon, or service executes. Staged bytes are data, never code in
   execution.
4. **Canonical write.** No byte on any canonical surface changes, including
   the resolved git directory. No canonical store is created, mutated, or
   deleted; `pnh/contracts/ratification-baselines/age-v1.json` is not
   created at its canonical path.
5. **Runtime or service installation.** No runtime, service, daemon, timer,
   scheduled job, package, or dependency is installed anywhere.
6. **Provider call.** No model, provider, or external service is called.
7. **Repository effect.** Staging tools initiate no git effect. Repository
   commits recording Gate A1 evidence are coordinator acts governed by the
   program's own commit discipline, not by this amendment, and never alter a
   canonical store.
8. **Public claim.** No public surface gains any claim; staged bytes and
   reports make no availability statement.
9. **Implementation-plan authority.** No implementation plan for the AGE
   runtime is authorized; Plan B implementation remains not authorized.
   Building the Gate A1 staging tools, their enforcement layer, and their
   verifier under the staging-tool contract is S1 scope, not runtime
   implementation.

## 6. Invalidation

- Any changed byte in any artifact the staging-authority gate pins — the
  section 2 bindings, this amendment, the staging-tool contract, the review
  attestation, and the verification manifest — invalidates the
  staging-authority gate. Fresh review and a new gate are then required
  before any staging work.
- Any staging-tool contract violation invalidates the staged bytes of that
  run (contract section 8).
- Withdrawal or supersession of the Plan A `Ratified` outcome suspends this
  amendment entirely.

## 7. Decision protocol

The external AGE staging-authority gate pins this amendment, the staging-tool
contract, the section 2 candidate package, the review attestation, and the
verification manifest by exact digest, and lists the allowed outcomes. The
gate contains no selected outcome and no receipt.

A separate owner receipt must bind the gate digest, exactly one allowed
outcome, and the exact repository-relative path of the Gate A1
governed-workstream directory (section 3, custody kind (a)). The owner's
identity is authenticated by the channel of record, which lies outside
repository content; repository strings can describe an expected identity but
cannot authenticate one. No repository code validates this receipt today:
the existing Plan A transition resolver takes invariant-transition decisions
only and cannot process a staging receipt, and the gate-type-aware receipt
validator is Gate A1 build scope. The receipt is therefore recorded verbatim
in the decision record and validated against this closed checklist, with the
validation result recorded beside it:

1. the selected outcome is an allowed outcome of the gate;
2. the quoted gate digest equals the gate's `gate_digest` byte-for-byte;
3. every gate-pinned artifact is byte-identical at validation time;
4. the receipt names this gate's `gate_id` (replay guard: a receipt that
   omits it, or that quotes any other gate's digest, validates nothing);
5. the recorded owner and role equal the gate's expected owner and role;
6. the bound Gate A1 workstream path does not exist at validation time and
   lies directly under `docs/ai/workstreams/`.

Checklist execution is a coordinator act and is not self-authenticating;
the receipt's authenticity rests on the channel of record alone. So that the
owner need not trust the coordinator's arithmetic, the decision record must
give the owner a one-command recipe to recompute the gate digest from the
gate file and compare it to the digest quoted in the receipt. Mechanized,
gate-type-aware receipt validation is Gate A1 build scope.

Only a receipt that passes every checklist item activates sections 4 and 5.
The gate, validated receipt, and decision record are committed separately as
the staging-authority commit.

## 8. Non-authority boundary

This document is a draft amendment produced under Gate A0R. It confers no
authority by existing. It is not a contract revision, not a law change, not a
proof, and not an implementation plan. Its only path to effect is the
decision protocol of section 7.
