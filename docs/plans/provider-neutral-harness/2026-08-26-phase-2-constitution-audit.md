# Phase 2 constitution audit

Date: 2026-08-26

Status: implementation complete; awaiting owner ratification

## Result

The live registry contains 46 invariants: 7 active, 39 proposed, and none
retired. The two `PNH-PROTO-*` entries are protocol pins without invariant
status and were excluded from this audit.

All 39 proposed invariants remain proposed. Each now records a concrete
`proposed_reason` in `pnh/contracts/invariants.yaml`, and the generated
constitution renders that reason. No invariant was promoted because none of
the proposed entries had both complete production-path fault-injection proof
for its full statement and the independent activation review required by the
open-source readiness plan. No invariant was retired because the claims that
need narrowing still express intended boundaries rather than abandoned ones.

## Audit disposition

The registry is the canonical per-invariant audit. Its reasons fall into four
reviewable groups:

1. Production-path evidence is incomplete: `PNH-INV-01`, `05`, `06`, `07`,
   `08`, `10`, `11`, `12`, `13`, `14`, `15`, `16`, `21`, `28`, `30`, `31`,
   `32`, `34`, `36`, and `45`.
2. The current architecture does not yet satisfy the full claim: `PNH-INV-25`,
   `27`, `33`, `35`, `37`, `38`, and `39`.
3. The governed surface does not exist yet: `PNH-INV-17`, `19`, `20`, `40`,
   `41`, `42`, and `43`.
4. The rule is documented but not mechanically enforced: `PNH-INV-09`, `24`,
   `26`, `44`, and `46`.

These groups account for all 39 proposed invariants exactly once.

## Architecture findings

- `PNH-INV-25` and `PNH-INV-27` describe a container-only trust model. Prism
  Harness also has a trusted subprocess executor, so those statements need
  execution-mode-specific wording before activation.
- `PNH-INV-33` and `PNH-INV-35` claim one host-shared lifecycle principal and
  arbiter. The implemented controls are supervisor scoped.
- `PNH-INV-37` claims lease expiry after an owning cell dies. Cleanup releases
  reservations, but no independent lease-expiry mechanism covers a wedged
  owner that never reaches cleanup.
- `PNH-INV-38` has synchronized resource bounds and adversarial M3 evidence,
  but the universal 50 ms cross-plugin stall bound lacks real-time performance
  proof.
- `PNH-INV-39` pins current protocol surfaces, but an out-of-process topology
  has not demonstrated semantic compatibility.

## Schema decision

`proposed_reason` is audit metadata, not binding constitutional text. It is:

- required and non-empty when `status` is `proposed`;
- forbidden when `status` is `active` or `retired`;
- represented in TypeScript as a discriminated invariant union;
- rendered in invariant sections and the conformance table; and
- excluded from `bindingHash`, so clarifying a reason does not masquerade as a
  constitutional statement or bound amendment.

An activation or retirement must remove the field. Existing lock transition
and amendment rules continue to govern the status change itself.

## Ratification request

The owner should review the 7 active / 0 retired / 39 proposed-with-reason
split and the architecture findings above. Phase 3 must not begin until that
split is ratified.
