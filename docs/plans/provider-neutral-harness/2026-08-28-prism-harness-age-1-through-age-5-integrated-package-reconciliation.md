# AGE-1 through AGE-5 integrated package reconciliation

Date: 2026-08-28

Verdict: **reconciled draft package**. The five AGE contracts now agree on
their shared type names, owners, lineage, and transaction boundaries. This is
not constitutional ratification, independent hardening, implementation
approval, or authority to modify downstream D8-era documents.

## 1. Authority and scope

This reconciliation is governed by the accepted Autonomous Goal Execution
architecture and acceptance record:

- architecture object:
  `5fc1443f9d8e740d4811a02d9e3a5dd637a12184`;
- acceptance object:
  `d47455756eac691c5cc8b3dc0aa774f6f04c2227`.

The frozen historical pair remains non-normative and byte-identical:

- D8 goal-execution design:
  `d7e65343f1d893688ae5740b9c2ffde5430708ac`;
- D8 boundary amendment:
  `3b47bc97af3e35b7e4b9076c4be59c64918500fd`.

The authorized work was limited to AGE-1 through AGE-5 package interfaces,
their closure records, and this reconciliation evidence. It did not open the
successor constitutional baseline, independent hardening, implementation
planning, code, migrations, downstream reconciliation, deployment, or
publication.

## 2. Contract objects

| Contract | Pre-reconciliation object | Reconciled object |
|---|---|---|
| AGE-1 Task Authority | `4c376d39a36e63699ea6bc43d09b89d9291fd4cf` | `5e531334cc4f63eaa957341c5505e24f970444c2` |
| AGE-2 Run Coordination | `9e27a9454db85bfea51b3679b863b1803778a613` | `651943a4581e57079b804b29722403933178419c` |
| AGE-3 Effect Authority | `d69a56b2a3acb9464c16668b56282cf2881bdac9` | `c8cebdc7f4528d3a7a2b0539b6247581cd26d33e` |
| AGE-4 Content Custody | `adf893bf8f7e79a19d89dfc421af00d78100ae47` | `34657d4c3e3d0d230663023e48d886f8e4b73e20` |
| AGE-5 Human Decision and Completion | `4974da37a724dbe0e2488e676906b2f12e63fa02` | `b2df98c612870097f3ece3dcf2eb15fd6d7ad89e` |

The pre-reconciliation values were produced with `git hash-object` while the
drafts were untracked. They identify the exact input bytes but were not written
to Git's object database. The workstream therefore preserves the hashes as
input evidence rather than claiming that Git can reconstruct those blobs.

## 3. Reconciliations applied

1. AGE-4 now owns `RuntimeContentProducerBindingV1`, one closed producer root
   with exact `effect-result`, `run-coordinator`, and
   `completion-verification` arms. Every preparation, durability receipt,
   prepared candidate, and content reference uses its digest.
2. AGE-3 now exposes `CancelUnconsumedEffectCommandV1` only through D4's
   internal transaction port. It covers `reserved`, `awaiting-approval`,
   `approved-awaiting-permit`, and `permit-issued`, and it loses atomically if
   permit consumption commits first.
3. AGE-4 now has exact `supplemental-observation` attachment and retention-pin
   arms keyed by `SupplementalObservationDigestV1`. AGE-5 commits the content
   reference, attachment, pin, evidence, and observation in one host
   transaction without changing terminal history.
4. AGE-5 now owns `AuthenticatedAge5CommandV1<TCommand>`, an internal
   post-authentication envelope. D2 derives its identity and authority fields
   after operating-system peer authentication. D4 revalidates the envelope and
   command pairing in the authoritative transaction.
5. All five closure records now describe the integrated package. The
   reconciliation also made AGE-3's effect-class scalar and AGE-4's publication
   request ID and raw byte digest explicit exports.

## 4. Ownership after reconciliation

AGE-1 owns admitted task authority. AGE-2 owns deterministic run coordination.
AGE-3 owns effect grants, state, permits, receipts, and the shape of the
internal cancellation command. AGE-4 owns all runtime content custody and the
closed producer-lineage root. AGE-5 owns approval, verification,
cancellation-request, completion, terminal, and supplemental-observation
contracts.

D2 still owns peer authentication, owner-domain and role derivation, daemon
epoch, and ownership leases. AGE-5's authenticated envelope records those
trusted results but does not authenticate a caller. D4 still owns settlement,
compare-and-set ordering, evidence checkpoints, content-reference attachment,
and terminal transactions. An AGE transaction-port declaration defines a
closed request shape. It does not transfer D4 writer authority.

## 5. Package laws closed

- No generic producer or attachment arm exists.
- No caller chooses owner domain, principal, role, epoch, lease, union tag, D4
  state version, or transaction identity.
- Cancellation cannot rewrite a consumed effect, receipt, ambiguity result,
  budget claim, or terminal result.
- Supplemental evidence cannot rewrite the frozen evidence checkpoint or any
  terminal authority.
- A content reference grants no destination write, artifact application,
  adaptation, installation, deployment, publication, or release authority.

## 6. Verification

The workstream verifier passed 445 checks across the five contracts (a
draft-time count; the refreshed verifier at the Gate A0 checkpoint reports
1159 checks — 1121 package, 38 hygiene — over the full package):

- balanced Markdown fences and consecutive top-level sections;
- 136 parseable TypeScript blocks with unique declarations;
- 122 locally owned digest roots with unique package-wide domains and explicit
  root mappings;
- every AGE-1 through AGE-5 import resolved to one owning contract;
- exact producer, cancellation, authenticated-command, supplemental-custody,
  and closure-record assertions; and
- unchanged architecture, acceptance, frozen D8, and frozen boundary objects.

`git diff --check` is also required in the final handoff. The verifier and
cross-check evidence live in the governed reconciliation workstream.

## 7. Remaining gates

The package is reconciled but not ratified. The successor constitutional
baseline must assign final invariant identities and register the complete
proof obligations and exact D2/D4-owned contract roots. Independent package
hardening must then test the resulting baseline before implementation can be
ratified.

Those are later milestones. Sections 1 through 7 are the original
reconciliation record; sections 8 through 10 are the Gate A0 refresh over the
corrected package bytes.

## 8. Gate A0 imported-root closure

The imported-root supplement completes the package's external-symbol closure:

- supplement:
  `docs/plans/provider-neutral-harness/2026-08-28-prism-harness-age-imported-root-supplement.md`;
- supplement object: `2aa97b52bf5f58ef06eb9ebeb34a3151e716d18a`.

Its closed mapping covers all 65 symbols the five contracts reference or
import-list without declaring: 12 D1 admission roots, 25 D2 custody roots,
6 D4 settlement roots, 3 D6 contract-package roots, 7 shared primitive
constructors, and 12 contract-local informal vocabulary names resolved to
their owning contract. The supplement also records the package's attribution
resolutions (`PrincipalId` and `RoleId` to D2, `AuthorizationPolicyDigest` to
D1, and the three unlisted authenticated-envelope generics to D2) without
changing any contract byte.

Closure is mechanical and bidirectional: the refreshed package verifier
recomputes the external-symbol inventory from the contract bytes and fails on
any symbol missing from the mapping, any mapping row naming a package-declared
symbol, and any per-contract reference count that does not match the table.
A missing, duplicate, substituted, or unresolved import blocks reconciliation.

## 9. Gate A0 boundary manifest

Every excluded source and hardening object is bound below. None enters the
implementation-ratification package; none is normative for AGE.

| Area | Document | Git object | Disposition |
|---|---|---|---|
| Frozen D8 pair | `2026-08-26-prism-harness-goal-execution-design-spec.md` | `d7e65343f1d893688ae5740b9c2ffde5430708ac` | Byte-identical historical evidence |
| Frozen D8 pair | `2026-08-27-prism-harness-d8-governed-adaptation-boundary-amendment.md` | `3b47bc97af3e35b7e4b9076c4be59c64918500fd` | Byte-identical historical evidence |
| D8 hardening | `2026-08-26-prism-harness-goal-execution-design-spec.hardening.md` | `ffd5c820c6461a109164ba30658fc7d7a34df955` | Excluded hardening object |
| D8 hardening | `2026-08-27-prism-harness-d8-revision-2-hardening.md` | `fdc63fccd28e79b75aecb7784e9b2b758a6a3aa8` | Excluded hardening object |
| D8 hardening | `2026-08-27-prism-harness-d8-revision-3-hardening.md` | `ee356d930cb4de70156ad13039f4e0e495f508d3` | Excluded hardening object |
| D8 hardening | `2026-08-27-prism-harness-d8-revision-4-hardening.md` | `87b1027ed8973c47d6adc74e864ff172e8b0b105` | Excluded hardening object |
| D8 hardening | `2026-08-27-prism-harness-d8-revision-8-hardening.md` | `43ca2f865d76e14cc2adc11298e643a56235ff08` | Excluded hardening object |
| D9 governed adaptation | `2026-08-27-prism-harness-governed-adaptation-design-spec.md` | `9adc942fc629bfb04a30163c4348c01f1a692d5a` | Excluded draft; blocked and non-normative |
| D9 governed adaptation | `2026-08-27-prism-harness-governed-adaptation-design-spec.md.hardening.md` | `c1fadeefc7560d7aeea322b108aa0f47813f4c56` | Excluded hardening object |
| D9 and D10 boundary | `2026-08-27-prism-harness-d9-external-observability-boundary-amendment.md` | `e4a5f79e56982a9dfb468bc64184b878d41e4bed` | Excluded boundary draft |
| D10-era external observability | `2026-08-27-prism-harness-external-observability-design-spec.md` | `6db3ac85fd71897fff3f57987dcefae513e557a4` | Excluded draft; blocked and non-normative |
| D10-era external observability | `2026-08-27-prism-harness-external-observability-design-spec.md.hardening.md` | `bf37144fc017e023f40d2f059ec85174651b14d8` | Excluded hardening object |
| Work-program selection | `2026-08-27-prism-harness-work-program-selection-design-spec.md` | `2cc99bd2fe4a925e3f33c88f1b261b7fdf51028c` | Excluded draft; blocked and non-normative |

AGE-6 absence receipt: no AGE-6 contract document exists anywhere in
`docs/plans/provider-neutral-harness/`. The accepted architecture defers
AGE-6 encapsulated execution with no production adapter, invariant, plan, or
public claim in the required path. The omission is deliberate, and this
receipt makes it visible to the final owner gate. The refreshed package
verifier fails if an AGE-6 contract file appears without a new boundary
decision.

## 10. Gate A0 refresh record

Plan A closed before this refresh, and the refreshed package binds it
exactly:

- immutable predecessor: `pnh/contracts/ratification-baselines/plan-a-v1.json`
  at SHA-256
  `8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c`,
  installed by commit `0604d0529a288d384c1cbcbe0eec25a5e45dd321`;
- Plan A completion-authority commit:
  `3cfe36d374d9af9341da85502822ecbdb13d64db`, carrying the validated owner
  receipt bound to gate digest
  `sha256:ebccd457b5ff002a2a07e6e8441e18e4cbe46e9e42c380576163a5c8088f02d5`;
- standing effect: Plan B authoring allowed; Plan B implementation not
  authorized.

The corrected successor baseline at
`docs/plans/provider-neutral-harness/2026-08-28-prism-harness-autonomous-goal-execution-successor-constitutional-baseline.md`
pins this reconciliation's object; the digest direction is one-way, so this
record names the baseline by path only, and the baseline's own object is
recorded in the Gate A0 workstream evidence.

The draft-time baseline verifier in the
`20260828-homelab-setup-age-successor-constitutional-baseline-814c43`
workstream pinned pre-closure source objects and asserted the predecessor's
absence; it is historical evidence of the draft-time state, not a living
gate. The refreshed package verifier at
`docs/ai/workstreams/20260828-homelab-setup-age1-age5-package-reconciliation-73b68d/verify-package.mjs`
is the living check: it reports its package and hygiene check components
separately and rejects stale source objects, unresolved imported roots, and
an incomplete boundary manifest.
