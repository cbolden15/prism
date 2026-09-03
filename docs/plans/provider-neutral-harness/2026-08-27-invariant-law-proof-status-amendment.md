# Invariant law and proof status amendment

Date: 2026-08-27

Status: Ratified

Owner: Vora Technologies, LLC

Decision owner: D6, constitution and proof governance

## Decision

Replace the overloaded invariant `status` field with separate constitutional-law
and implementation-proof lifecycles in registry version 2:

```ts
type LawStatus = "proposed" | "ratified" | "retired";
type ProofStatus = "unproven" | "partial" | "proven";
```

An implementation losing proof does not make its constitutional requirement
optional. Proof may be downgraded while the law remains ratified. Public support
requires both `law_status: ratified` and `proof_status: proven`, plus a
non-deferred release disposition.

## Bound artifacts

The amendment was made against this local baseline:

| Artifact | Git identity |
|---|---|
| Baseline commit | `33ddfb1e8f8203b1495bebabb51b2865276aaa9e` |
| Prior architecture-spec blob | `55805d89c29232326ebe2e95f652d385f766e1b0` |
| Prior Plan A blob | `a723f638b063f6ce89401bd26e86d85b0519d910` |
| Amended architecture-spec blob | `04e8e79a8cb89186da7032b696e832e1cf2d994d` |
| Amended Plan A blob | `80ba48cddc5d12b50012a43b73a71aba3b5bac37` |

The Git blob IDs use Git object hashing, not SHA-256 content-digest notation.

## Registry version 2 contract

All 46 current invariants migrate to `law_status: ratified`. `proposed` is
reserved for future statements that the owner has not ratified. `retired`
requires an owner-ratified constitutional amendment.

The registry stores proof status so the lock, generated constitution, and public
claims agree. The gate verifies rather than trusts it:

- `proven` requires executed structured proof of the registered enforcement kind
  and an independent review artifact;
- `partial` requires concrete evidence and a non-empty `proof_reason` naming the
  unproved remainder; and
- `unproven` requires a non-empty `proof_reason` and cannot support a public
  claim.

The immutable ratification baseline pins law status, enforcement kind, and
first-release policy. Proof status remains dynamic under lock and proof-report
governance.

## Initial and Plan A exit mapping

The v1-to-v2 migration begins with these proof states:

- `partial`: PNH-INV-02, 03, 04, 18, 22, 23, and 29;
- `unproven`: PNH-INV-01, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17,
  19, 20, 21, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, and 46; and
- `proven`: none until structured proof migration executes.

At Plan A exit:

- `proven`: PNH-INV-02, 03, 04, and 18;
- `partial`: PNH-INV-22, 23, and 29; and
- `unproven`: the same 39 invariants listed above.

## Transition governance

A transition to `proven` requires a matching structured proof report and an
independent review artifact. The guarded lock updater rejects self-attested proof
upgrades.

A transition from `proven` to `partial` or `unproven` requires a hash-bound
amendment with `kind: proof-invalidation`, the prior proof state, an existing
owner-ratified decision record, and a non-empty evidence-invalidation reason.

No proof transition changes the invariant statement or law status. No law-status
transition is permitted without a separate owner-ratified amendment.

## Scope and authorization

This decision amends architecture-spec Sections 18.1, 18.2, 18.4, 18.6, 18.7,
18.8, Plan A in Section 24, and the corresponding Plan A implementation plan.
It supersedes the earlier active-to-proposed reopening design.

This amendment authorizes updating the architecture and Plan A documents. It
does not authorize implementing Plan A, starting Plan B, installing a service,
making a live provider call, creating the standalone repository, or publishing
Prism Harness.
