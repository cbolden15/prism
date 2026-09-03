# OSS release package-scope protocol amendment

Status: Ratified

Owner: Vora Technologies, LLC

Decision owner: D6, constitution and proof governance

Transition entry: {"invariant_id":"PNH-PROTO-02","amendment_kind":"binding-change","prior_binding_hash":"sha256:3e8049fb8a51f371e1abe99406ecc23e225a37140875aa597e9f07fe64a41f67","new_binding_hash":"sha256:3895e0058b90b420b675748c4876c9306ad2cc465b3618817a3090d47e73d44b","reason":"Repin implementation-source bytes for the source-only @prism-harness/sdk to @useprism/sdk package-coordinate change; accepted wire fields, encoding, authentication, and semantics remain unchanged."}

Bound architecture identity: ratification-baseline:plan-a-v1:sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c

Bound architecture identity: ratified-source:docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:04e8e79a8cb89186da7032b696e832e1cf2d994d

Bound architecture identity: ratified-source:docs/plans/provider-neutral-harness/2026-08-27-invariant-law-proof-status-amendment.md:87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a

Bound architecture identity: ratified-source:docs/plans/provider-neutral-harness/2026-08-26-prism-harness-plan-a-constitutional-proof-and-corrections.md:1c33a814f1324e67cf53a6fe860bdbdd175031ed

## Decision

PNH-PROTO-02 remains at protocol version 1. The accepted wire vocabulary,
field layout, encoding, authentication requirements, and command and receipt
semantics are unchanged. The only changes in its schema-source closure replace
the internal package import `@prism-harness/sdk/protocol/resource-bounds` with
the public package import `@useprism/sdk/protocol/resource-bounds` in:

- `packages/runtime/src/harness/plugin-container-supervisor.mjs`
- `packages/runtime/src/harness/plugin-resource-arbiter.mjs`

This is a security-relevant implementation-source byte change, so the complete
schema-source hash remains mandatory. The same-version implementation-only
amendment precedent applies: repin the schema hash and binding hash under an
owner-ratified amendment without claiming a wire protocol revision. That
precedent is recorded in
`docs/plans/provider-neutral-harness/2026-08-26-aggregate-arbiter-protocol-amendment.md`
and
`docs/plans/provider-neutral-harness/2026-08-26-command-scheduler-fairness-amendment.md`.

The prior binding is
`sha256:3e8049fb8a51f371e1abe99406ecc23e225a37140875aa597e9f07fe64a41f67`.
The complete schema-source hash after the package-coordinate change is
`sha256:32843d51695f556cdd8192de8824ba6aef60459188b151b872df0220d9ebb719`.
With protocol version 1 unchanged, the exact new binding is
`sha256:3895e0058b90b420b675748c4876c9306ad2cc465b3618817a3090d47e73d44b`.

## Authorized registry delta

The PNH-PROTO-02 registry row may change only as follows:

1. Set `schema_hash` to the complete schema-source hash above.
2. Append one amendment dated 2026-09-03 with kind `binding-change`, the exact
   prior binding, this decision path, and the exact transition reason above.

The protocol `version`, `schema_source`, `spec`, and `conformance` fields remain
fixed. Existing amendment history and every other registry row remain fixed.

## One-use proof-key rotation

The owner authorizes these distinct public identities for one final OSS release
proof cycle over the prepared source state:

- Execution runner `pnh-runner-2026-09-03-oss-release`, fingerprint
  `sha256:85957d0ccceea821a4582a5600eeffd7bdb915c747f93772bbcaddbd21855fc2`.
- Independent reviewer `pnh-reviewer-2026-09-03-oss-release`, fingerprint
  `sha256:ddb2f1e0ad161c87aba0196f66528fe275b652a1d324e7b2ae1c0b8f8fd65b86`.

The new private keys may authenticate only the execution receipt and reviewer
attestations required for that proof cycle. Existing runner and reviewer public
keys remain in their trust stores so historical evidence stays verifiable.
Their retention does not broaden this one-use authorization.

After the final signed report, reviewer attestations, and constitution gates
have been verified, both new private keys must be destroyed. Private key bytes
must never enter the repository, logs, reports, review artifacts, or commits.
