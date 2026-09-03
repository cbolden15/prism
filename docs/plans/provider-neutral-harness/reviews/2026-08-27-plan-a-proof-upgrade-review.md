# Independent falsification review — Plan A Task 4 proof upgrades

Scope: the structured proof registrations for PNH-INV-02, PNH-INV-03,
PNH-INV-04, and PNH-INV-18 introduced in the Plan A Task 4 Phase 1 working
tree, and the gate hardening that accompanies them.

Reviewer role: independent falsification reviewer, distinct from the proof
producer. No implementation file was edited; every falsification was run
against an out-of-repository copy of the tree.

Verdict: **accepted**, subject to the three pre-flip corrections recorded
below. All four proofs were independently falsified and all four controls are
real. No finding refutes a proof claim. The corrections are registration
bookkeeping and a verifier-completeness gap, and every one of them must land
before any `proof_status` is flipped to `proven`.

## Method

Every falsification was performed in a copy of the repository outside the
working tree. The control under test was disabled or inverted in that copy, the
declared test file was re-run there, and the copy was restored before the next
attempt. The repository tree was never modified; `git status` at the end of the
review shows only the pre-existing Phase 1 implementation changes plus this
artifact and the findings file.

Digests below were recomputed from current bytes, not copied from the phase
report. All nine matched the phase report's declared values.

## Registry agreement

All four invariants are `law_status: ratified` and remain `proof_status:
partial`. Phase 1 flipped nothing, which is correct for this phase.

| Invariant | Registry enforcement kind | Registration kind | Match |
|---|---|---|---|
| PNH-INV-02 | `static-structure` | `static-structure`, no control | yes |
| PNH-INV-03 | `runtime-adversarial` | `runtime-adversarial`, `fault-injection` control | yes |
| PNH-INV-04 | `runtime-adversarial` | `runtime-adversarial`, `fault-injection` control | yes |
| PNH-INV-18 | `static-structure` | `static-structure`, no control | yes |

Each declared test file is also declared in that invariant's `conformance`
list, so no undeclared file stands in for executed proof. No test in any run
was skipped or marked todo.

## PNH-INV-02 — static-structure

- Declared test file: `pnh/tests/plugin-protocol.test.ts`
  (sha256:bcf0531942db40615305c16a2a3970848a09b6023e475d726ce6f9b8976c7e51)
- Test name: `validatePluginFrame is the only fail-closed checker for the pinned wire vocabulary`
- Production entrypoint: `pnh/sdk/protocol.ts`
  (sha256:7a667872398f0e38f03ecf8650560d88742c0d005d4383c0c92b945a10b92515)
- Enforcement kind match: yes.

The test imports `pnh/sdk/protocol.ts` relatively and exercises the real
exported `validatePluginFrame`. There is no mock, stub, or vendored copy of the
checker anywhere in the test file.

Falsification performed: in the isolated copy, the version clause
(`value.v !== PLUGIN_PROTOCOL_VERSION`) was removed from `validatePluginFrame`,
leaving the rest of the checker intact. The declared test file was re-run.

Outcome: exit status 1, 6 pass and 1 fail, with the named test reported as
`not ok 5 - validatePluginFrame is the only fail-closed checker for the pinned
wire vocabulary`. The control is real: the named test detects the weakening of
the checker it claims to prove.

Limitations: none beyond the registry-wide items below. No B2 or Gate G reproof
is required for this invariant.

## PNH-INV-03 — runtime-adversarial

- Declared test file: `pnh/tests/protocol-bounds.test.ts`
  (sha256:93003fdd6832b2c85c823df370710d0f9a1ac4c48700300df916d3aaf3171e2d)
- Test name: `max_frame_bytes: a line at the bound decodes, one byte over fails closed`
- Production entrypoint: `pnh/sdk/protocol.ts`
  (sha256:7a667872398f0e38f03ecf8650560d88742c0d005d4383c0c92b945a10b92515)
- Declared control: `fault-injection` —
  `NdjsonFrameDecoder.push receives a frame line one byte over max_frame_bytes`
- Enforcement kind match: yes, and the required `control` field is present, as
  `validateProofRegistration` demands for a runtime-adversarial registration.

The test imports the real `NdjsonFrameDecoder` from `pnh/sdk/protocol.ts`. The
bound it asserts against is read from the exported `MAX_*` constant at runtime
rather than hard-coded, so the injected fault tracks any future re-pin of the
bound.

Falsification performed: in the isolated copy, the oversize guard in
`NdjsonFrameDecoder.push` was made unreachable — the condition that fails the
decoder closed on a line longer than `MAX_FRAME_BYTES` was replaced with a
constant false, so the oversized frame would be admitted instead of rejected.
The declared test file was re-run.

Outcome: exit status 1, 6 pass and 1 fail, with the named test reported as
`not ok 1 - max_frame_bytes: a line at the bound decodes, one byte over fails
closed`. The declared fault is real and the named test is what detects it.

Limitations and required reproof: a **B2 reproof is required** if the exported
`MAX_*` constants are ever re-pinned. Because the test derives its bound from
those constants, a re-pin changes the test file digest, which invalidates the
proof target digest and forces re-registration rather than a bare re-run. That
is the safe direction, but it must be honoured rather than worked around.

## PNH-INV-04 — runtime-adversarial

- Declared test file: `pnh/tests/admission-ticket.test.ts`
  (sha256:f08a896379550bb1d21f29e1ee9b023002a544eca6470402b3c4b70b2b35a61d)
- Test name: `caller-crafted objects cannot impersonate admission tickets`
- Production entrypoint: `pnh/runtime/admission-ticket.ts`
  (sha256:2c42a3a1999fcdf3de407385e4267c943daffa61a2cbf3dc4a645f8b965ab63f)
- Declared control: `fault-injection` —
  `caller-constructed substitute admission ticket presented to the verifier`
- Enforcement kind match: yes, with the required `control` field present.

The test imports the real `isAdmissionTicket` and `resolveAdmittedPlugin` from
`pnh/runtime/admission-ticket.ts`. The production brand is an unforgeable
identity check against a module-private issued-ticket set, not a structural
shape check, which is the property the test claims.

Falsification performed: in the isolated copy, `isAdmissionTicket` was made to
return true unconditionally, which is exactly the weakening that would let a
caller-constructed object impersonate an issued ticket. The declared test file
was re-run.

Outcome: exit status 1, 5 pass and 1 fail, with the named test reported as
`not ok 6 - caller-crafted objects cannot impersonate admission tickets`. The
declared fault is real.

Limitations: none beyond the registry-wide items below. No B2 or Gate G reproof
is required for this invariant.

## PNH-INV-18 — static-structure

- Declared test file: `pnh/tests/module-graph.test.ts`
  (sha256:7d50d9c9c76ce3b69ecf0041280ee9fcef4c1505408b913535e1e4318d5ba577)
- Test name: `checkModuleGraph fails closed on the public core and on consumer-specific dependencies`
- Production entrypoint as registered: `pnh/core/plugin-grant.ts`
  (sha256:6325e6224e1a7013834a8b7b0cac0fbb3358c78ca3aca6037c50d8a567f23a8a)
- Fail-closed checker actually exercised: `checkModuleGraph` in
  `pnh/scripts/check-module-graph.ts`
  (sha256:7c3f21edbba56cfdd977502e33fc2f91caab8184c80cb1b62319118ae3408fe7)
- Enforcement kind match: yes.

The test imports the real `checkModuleGraph` relatively and runs it against the
real `pnh/core` tree, plus an injected fixture in which a core module imports a
consumer-specific package and a file outside the core tree.

Falsification performed: in the isolated copy, `checkModuleGraph` was made to
return an empty violation list unconditionally, which is the total defeat of the
static checker. The declared test file was re-run.

Outcome: exit status 1, 2 pass and 6 fail, including the named test reported as
`not ok 7 - checkModuleGraph fails closed on the public core and on
consumer-specific dependencies`. The checker is genuinely load-bearing for the
named test; the test does not pass vacuously.

Second falsification, on the fixture direction: the injected fixture yields
exactly `["escapes-core", "external-specifier"]`, so the test detects both a
dependency that leaves the core tree and a consumer-specific external
specifier. It is not asserting only that the clean tree passes.

### Judgment on the entrypoint binding (coordinator note 2)

The question put to this review is whether binding `pnh/core/plugin-grant.ts` as
`production_entrypoint`, because `collectDependencyClosure` rejects
`pnh/scripts/check-module-graph.ts` over its `node:module` `createRequire` load
of `typescript`, still constitutes valid static-structure proof that the public
core carries no consumer specifics.

Judgment: it is a valid proof of the checker's fail-closed *behaviour*, and it
is not a valid *pinning* of the checker. Both halves matter.

What is genuinely proven: the falsification above shows the named test fails the
moment `checkModuleGraph` stops detecting violations, and the test exercises the
real core tree. The enforcement behaviour is executed and adversarially
confirmed, not asserted.

What is not proven: no bound digest covers
`pnh/scripts/check-module-graph.ts`. Its current digest is
`7c3f21edbba56cfdd977502e33fc2f91caab8184c80cb1b62319118ae3408fe7`, and that
value appears in no proof target. A future edit that weakens the checker would
therefore change no registered digest and would not invalidate the proof target,
so `proof:constitution` would not force re-registration. The proof could go
stale silently while continuing to present as bound. Separately, the registered
entrypoint's dependency closure spans 4 of the 11 public-core modules, so the
static claim as pinned is narrower than the invariant's statement about the
public core as a whole.

**A Gate G reproof is required for PNH-INV-18** once the checker itself can be
bound as a production entrypoint — that is, once `collectDependencyClosure`
can classify a `node:module` `createRequire` loader without rejecting the file,
or once the checker's `typescript` load is restructured so the closure scanner
accepts it. This obligation must be recorded against the invariant and must not
be waived by the passing test alone. Until then PNH-INV-18's registration should
be understood as behaviour-proven and byte-unpinned.

## Gate behaviour

The gate was falsified directly, not only inspected. `PNH-INV-02` was forced to
`proof_status: proven` with its `proof_reason` removed and no structured proof
supplied, in the isolated copy, and each entrypoint was exercised:

- `generate-constitution.ts --update-lock` refused: exit status 1, citing the
  amendment `from_hash` mismatch against the locked hash, the missing trusted
  transition authority for a proof-status transition, and the missing trusted
  decision authority for a binding-field change. The lock path is genuinely
  fail-closed against a hand-edited proof status.
- `generate-constitution.ts --write` accepted it: exit status 0, and it emitted
  a constitution asserting `(law: ratified; proof: proven)` together with a
  `structured proof:` label naming a test file, for an invariant with no
  structured proof at all.
- `generate-constitution.ts --check` accepted the result: exit status 0,
  reporting that the constitution matches the registry.
- The constitution test suite caught it: exit status 1, 60 tests with 57 pass
  and 3 fail — the baseline rule check, the executed-structured-proof check, and
  the four-revalidated-invariants check all fired.

The conclusion is that the gate is real but its enforcement lives in the test
suite, not in the generator. `evaluateProvenProof` has no production call site;
the numbered `check N:` tests in `pnh/tests/constitution-gate.test.ts` are the
gate. That matches the pre-existing convention in this repository — checks 1
through 8 were already structured that way before this change — so it is not a
regression introduced by Phase 1. It does mean the document-producing
entrypoints will render and accept a false `structured proof:` label whenever
they are run without the suite.

## Registry-wide limitations

1. **The declared review artifact path does not match Plan A.** All four
   registrations declare
   `docs/plans/provider-neutral-harness/reviews/2026-08-28-plan-a-task4-falsification-review.md`.
   Plan A Task 4 names this file,
   `docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md`,
   and Plan A is authoritative. This review is therefore written at the Plan A
   path, and the manifest must be rebound by Phase 2 before any digest can be
   bound. Until then `proof:constitution` continues to fail closed against a
   file that does not exist.

2. **The gate does not bind the declared review artifact.** `evaluateProvenProof`
   re-derives every registration field from the trusted manifest except
   `review_artifact`, which it accepts from the registration and checks only for
   readability and digest self-consistency. Any readable repository file passes.
   The producer path is not affected — `createProofRegistration` reads the
   declared path from the manifest — and `transition-authority.ts` independently
   verifies a signed review attestation on `--update-lock`, so no shipped
   entrypoint is exploitable today. It is a completeness gap in a
   security-relevant predicate and it makes the phase report's description of
   the gate inaccurate for that one field.

3. **Manifest coupling.** Confirmed empirically, not assumed: adding a fifth
   target to `pnh/contracts/proof-targets.json` changes the recomputed proof
   target digest of all four existing registrations. The failure direction is
   safe, because stale registrations are rejected rather than silently accepted.
   The operational cost is that every future Task 4 batch re-registers all
   existing targets, which creates room for a re-registration to be rubber
   stamped. Low severity, worth an explicit re-verification step in the batch
   procedure.

4. **B2 reproof for PNH-INV-03** on any re-pin of the exported `MAX_*`
   constants, as recorded above.

5. **Gate G reproof for PNH-INV-18** on the entrypoint binding, as recorded
   above.

6. **Test names are load-bearing.** The gate matches proofs to targets by exact
   test name. Renaming any of the four declared tests without updating the
   manifest fails closed. Correct direction, maintenance edge worth recording.

## Pre-flip corrections

None of these refute a proof. All three must land before any `proof_status`
becomes `proven`.

1. Rebind the four `review_artifact` declarations in
   `pnh/contracts/proof-targets.json` to the Plan A path and re-register the
   affected digests.
2. Record the PNH-INV-18 Gate G reproof obligation against the invariant, so the
   unpinned checker is tracked rather than forgotten.
3. Make `evaluateProvenProof` derive `review_artifact.path` from the trusted
   manifest, the same way it derives every other field, and error when a
   registration's declared path differs.

## Verification commands

| Command | Exit status | Result |
|---|---|---|
| `npx tsx --test pnh/tests/plugin-protocol.test.ts pnh/tests/protocol-bounds.test.ts pnh/tests/admission-ticket.test.ts pnh/tests/module-graph.test.ts` | 0 | 28 pass, 0 fail, 0 skipped, 0 todo |
| `npx tsx --test pnh/tests/constitution-coverage.test.ts pnh/tests/constitution-proof-report.test.ts pnh/tests/constitution-gate.test.ts` | 0 | 33 pass, 0 fail, 0 skipped, 0 todo |
| `npm run typecheck:pnh` | 0 | clean |

Findings are recorded separately in
`docs/ai/workstreams/20260828-homelab-setup-plan-a-task4-proof-upgrades-c3381b/FALSIFICATION-FINDINGS.md`.
