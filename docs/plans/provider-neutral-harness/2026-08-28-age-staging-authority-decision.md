# AGE staging-authority decision

- Date presented: 2026-08-28
- Gate: `docs/ai/workstreams/20260828-homelab-setup-gate-a0r-staging-authority-9015b6/authority-evidence/AGE-STAGING-AUTHORITY-GATE.json`
- Gate digest: `sha256:843783b09f655c038a2815c9f907ecbb2d461c72110a977f0743749011ef9777`
- Expected owner: Vora Technologies, LLC (role: owner)
- Status: **decided — `Ratified` (see Recorded decision)**

## What the owner is deciding

Whether to grant the narrow staging authority Gate A1 requires: running
bounded review tooling and producing noncanonical prospective bytes, both
confined by the ratification-staging amendment and the closed staging-tool
contract at the exact digests the gate pins. Under every allowed outcome,
law status, proof status, runtime execution, canonical writes, runtime or
service installation, provider calls, repository effects by staging tools,
public claims, and implementation-plan authority remain withheld, and Plan B
implementation remains not authorized.

## Readiness checklist

1. The staging package is independently hardened: an adversarial pass over
   the full A0 source package and a SECURITY-lens confinement pass over the
   staging pair, three rounds each, ending at 0 unresolved Critical and 0
   unresolved Important findings from both reviewers
   (`reviews/2026-08-28-gate-a0r-staging-review.md`).
2. Two A0 package defects found by the review are fixed and committed as
   checkpoint `4b90b3a` (baseline `d40e8d54…`, reconciliation `46fae101…`);
   the five contracts and the supplement are byte-unchanged.
3. The verification manifest records, at source head `4b90b3a`: package
   verifier PASS 1159 checks with 0 failures, public-claim gate 0 failures,
   and a clean `git diff --check`, plus committed-tree equality for all 15
   amendment bindings.
4. The gate pins every artifact by exact digest and contains no selected
   outcome and no receipt.

## Disclosed residuals (read before deciding)

1. **Bootstrap identity (S-01).** The Gate A1 enforcement layer and
   verifier are validated by committed digests plus an independent review
   before any staging tool run — not by a second verifier watching the
   verifier. A stronger control is available on request: a second owner
   gate binding those digests after they are authored.
2. **Receipt validation is a coordinator act (A-05).** No repository code
   can validate this receipt today; validation follows the amendment's
   section 7 checklist, and authenticity rests on the channel of record.
   The recipe below lets the owner verify the gate digest independently of
   the coordinator. Mechanized receipt validation is Gate A1 build scope.

## Independent digest check (one command)

```bash
npx tsx docs/ai/workstreams/20260828-homelab-setup-gate-a0r-staging-authority-9015b6/recompute-gate-digest.ts
```

The gate digest is computed over the gate JSON without its `gate_digest`
field, serialized canonically — a plain file hash does not reproduce it.
The command above recomputes it the canonical way and prints `MATCH` or
`MISMATCH` against the recorded value; it printed `MATCH` at presentation
time.

## Allowed outcomes

| Outcome | Effect |
|---|---|
| `Ratified` | Staging authority activates at the pinned digests: Gate A1 staging work under the closed staging-tool contract only; every withheld authority stays withheld; Plan B implementation stays not authorized |
| `Ratified with amendments` | Invalidates this prospective gate; returns the staging package to review; no Gate A1 work |
| `Not ratified` | Staging authority is not granted; no Gate A1 work; the A0 package remains authored-only |

## Owner receipt (per amendment section 7)

The receipt must bind the gate digest, exactly one allowed outcome, and the
exact Gate A1 workstream directory path (which must not exist yet and must
sit directly under `docs/ai/workstreams/`). Proposed path, substitutable by
the owner:
`docs/ai/workstreams/20260829-homelab-setup-gate-a1-prospective-staging`.

An explicit statement of the form:

> As owner for Vora Technologies, LLC, I select the outcome `<outcome>` for
> AGE staging-authority gate `age-staging-authority-gate-v1`, gate digest
> `sha256:843783b09f655c038a2815c9f907ecbb2d461c72110a977f0743749011ef9777`,
> and bind the Gate A1 workstream directory
> `docs/ai/workstreams/<exact-path>`.

Only a receipt passing every section 7 checklist item activates the staging
authority. The gate, validated receipt, and this decision record are then
committed as the dedicated staging-authority commit.

## Recorded decision

- Date: 2026-08-28
- Outcome: `Ratified`
- Receipt, verbatim as recorded from the owner's channel of record:

> As owner for Vora Technologies, LLC, I select the outcome Ratified for
> AGE staging-authority gate age-staging-authority-gate-v1, gate digest
> sha256:843783b09f655c038a2815c9f907ecbb2d461c72110a977f0743749011ef9777,
> and bind the Gate A1 workstream directory
> docs/ai/workstreams/20260829-homelab-setup-gate-a1-prospective-staging.

- Validation: all six section 7 checklist items pass, executed mechanically
  by `validate-staging-receipt.ts` in the Gate A0R workstream over the
  verbatim receipt (`receipt.txt`) — the outcome is an allowed outcome; the
  quoted digest equals `gate_digest` byte-for-byte; all 12 gate-pinned
  artifacts are byte-identical at validation time and the gate digest
  recomputes; the receipt names the gate id; the recorded owner and role
  equal the expected owner and role; the bound Gate A1 workstream path sits
  directly under `docs/ai/workstreams/` and does not exist at validation
  time. Prior to the receipt, the owner-side digest recipe printed `MATCH`.
- Effect: the ratification-staging amendment and the closed staging-tool
  contract are active at the pinned digests. Gate A1 staging work is
  permitted, only under the closed staging-tool contract, in the bound
  workstream `docs/ai/workstreams/20260829-homelab-setup-gate-a1-prospective-staging`
  and its run-scoped `tmp/` subtree. Law status, proof status, runtime
  execution, canonical writes, runtime or service installation, provider
  calls, repository effects by staging tools, public claims, and
  implementation-plan authority remain withheld. Plan B implementation
  remains not authorized. Any changed source or staging byte invalidates
  this gate and requires fresh review and a new gate.
