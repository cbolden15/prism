# OSS release proof rotation review

Date: 2026-09-03

Scope: independent re-review of the existing trusted proof targets for
PNH-INV-02, PNH-INV-03, PNH-INV-04, and PNH-INV-18 before a one-use reviewer
key rotation. The reviewed state is the current working tree rooted at Git
HEAD `57c1be90539b6dfc0dcf29ea0f6a12563f27be96`, with the file identities below
taking precedence over the dirty-tree base commit.

## Phase boundary

No new constitution proof report existed during this review or the Phase 1.5
identity refresh. This document
does not evaluate or accept a proof report digest. The four newly declared
attestation files were not created in this phase. Each may be created only
after the proof producer generates a signed report, the report revalidates
against the file identities below, and the reviewer independently checks that
exact report.

## Reviewer identity

- Principal: `pnh:independent-reviewer`
- Role: `independent-reviewer`
- Key ID: `pnh-reviewer-2026-09-03-oss-release`
- Public-key fingerprint: `sha256:ddb2f1e0ad161c87aba0196f66528fe275b652a1d324e7b2ae1c0b8f8fd65b86`
- Fingerprint definition: SHA-256 of the DER-encoded Ed25519 SubjectPublicKeyInfo

The prior reviewer key `pnh-reviewer-2026-08-28` remains in the owner-pinned
trust store. The new reviewer public key is distinct from that key and from the
owner-pinned execution-runner key.

## Shared identities

| Evidence | Path | SHA-256 |
|---|---|---|
| Registry | `assurance/constitution/contracts/invariants.yaml` | `sha256:c1fa914b8556d927116078e02c82aaf8348bead3396c49e4596a65f77ccc9fc1` |
| Ratification baseline | `assurance/constitution/contracts/ratification-baselines/plan-a-v1.json` | `sha256:8e147530512fe946c811f7273ac644ae405e1d692d7f05cfef49865010cb525c` |
| Proof-target manifest | `assurance/constitution/contracts/proof-targets.json` | `sha256:46d9b1a3842b7725c7e5760d0780884ee4fb1881ffa8308308b2c36c56d7e2c7` |
| Reviewer trust | `assurance/constitution/contracts/reviewer-trust.json` | `sha256:423d7b7e6acee49f97ba36c3239dec2d047b2299115582f7b9bdd86bac3091e5` |
| Execution-runner trust | `assurance/constitution/contracts/execution-runner-trust.json` | `sha256:99317f2ba2738b66016e5b8b7b759bc8b1d2f7233e161c8fe450b6bcd85058a6` |

The baseline ID is `plan-a-v1`.

## Prepared protocol transition

The owner-ratified decision is
`docs/plans/provider-neutral-harness/2026-09-03-oss-release-package-scope-protocol-amendment.md`,
`sha256:17d2740a937a8653f20590f25124066099c2690934348e4dce69581434c54df2`.
It authorizes only the PNH-PROTO-02 implementation-source repin for the two
package-coordinate substitutions and the one-use execution and review keys.

Independent recomputation over all seven schema sources produced
`sha256:32843d51695f556cdd8192de8824ba6aef60459188b151b872df0220d9ebb719`.
The version remains 1, and the independently recomputed binding is
`sha256:3895e0058b90b420b675748c4876c9306ad2cc465b3618817a3090d47e73d44b`.
The registry delta is limited to that schema hash and one 2026-09-03
`binding-change` amendment from
`sha256:3e8049fb8a51f371e1abe99406ecc23e225a37140875aa597e9f07fe64a41f67`.
No protocol version, source list, spec path, conformance path, prior amendment,
or other registry row changed.

The protocol spec is
`docs/plans/provider-neutral-harness/specs/supervisor-command-channel.md`,
`sha256:d6beb42ce6e3a92254e8b1a0d74d5399cb97f6e8515b6b5ba24ae7fbee8ffc67`.
It keeps version 1 for an owner-ratified implementation-only repin and still
requires a version bump for wire vocabulary, encoding, authentication, or
semantic changes. The new execution-runner key
`pnh-runner-2026-09-03-oss-release` has independently verified fingerprint
`sha256:85957d0ccceea821a4582a5600eeffd7bdb915c747f93772bbcaddbd21855fc2`.
The historical runner key remains pinned, and the runner and reviewer keys are
distinct.

## PNH-INV-02

- Invariant binding: `sha256:5c4a0a36da64d9e108762912cd6a812aa353b53b7a95900d3d5482be133bc073`
- Test: `pnh/tests/plugin-protocol.test.ts`, `sha256:9be38a1499d02657af0008124c069a0965bf1ec77643f05f4e03b003ab99b0c0`
- Exact test name: `validatePluginFrame is the only fail-closed checker for the pinned wire vocabulary`
- Production entrypoint: `packages/sdk/src/protocol.ts`, `sha256:6c5fec5ea2fb107eabc9fc26f32a9a30b9026e295c9398e7f3ef8f66c41ed7ee`
- Checker: `validatePluginFrame`
- Dependency closure: `sha256:dc51f7bddee0f5a8c3370e562071b4745f3f0172b12f773b9eaf284cade3d0c0`
- Proof-target digest: `sha256:5c47c66bf649a43b3b209681d33698cf37617f906aa88daad5bfab0411790934`
- Pending attestation: `docs/plans/provider-neutral-harness/reviews/2026-09-03-oss-release-proof-rotation-review.PNH-INV-02.attestation.json`

Closure files:

- `packages/sdk/src/protocol.ts`, `sha256:6c5fec5ea2fb107eabc9fc26f32a9a30b9026e295c9398e7f3ef8f66c41ed7ee`
- `packages/sdk/src/protocol/resource-bounds.ts`, `sha256:f3f539e05643e324cd5af4634df5aa1c93d9face7c9864f873ca880218320e25`

Falsification: in an out-of-repository copy, the protocol validator was changed
to admit protocol version 2 as well as the pinned version 1. After rebuilding
the SDK in that copy, the exact registered test failed because the unpinned
frame was returned instead of `null`. Exit status was 1, with zero passing and
one failing selected test.

Outcome: the exact registered test is load-bearing for rejection of an
unpinned wire vocabulary.

## PNH-INV-03

- Invariant binding: `sha256:79e988910f0feabaa36dd2155c15be5bd23c7a23b6bedc198d374fbdf162b9b3`
- Test: `pnh/tests/protocol-bounds.test.ts`, `sha256:c249f5da178654ec7062137c5839aa51ab1659f2a05f06540ea60a6f38262fdc`
- Exact test name: `max_frame_bytes: a line at the bound decodes, one byte over fails closed`
- Production entrypoint: `packages/sdk/src/protocol.ts`, `sha256:6c5fec5ea2fb107eabc9fc26f32a9a30b9026e295c9398e7f3ef8f66c41ed7ee`
- Control: `NdjsonFrameDecoder.push receives a frame line one byte over max_frame_bytes`
- Dependency closure: `sha256:dc51f7bddee0f5a8c3370e562071b4745f3f0172b12f773b9eaf284cade3d0c0`
- Proof-target digest: `sha256:956e3c3f8fb96c45ac2ad3793456b4b2e5b6291848623fb95d08a75eb1e452b2`
- Pending attestation: `docs/plans/provider-neutral-harness/reviews/2026-09-03-oss-release-proof-rotation-review.PNH-INV-03.attestation.json`

The closure files and their identities are the same as PNH-INV-02.

Falsification: in an out-of-repository copy, the encoder, complete-line
decoder, and unterminated-buffer ceilings were widened by 64 bytes. After
rebuilding the SDK in that copy, the exact registered test failed because the
over-limit frame no longer raised the required `RangeError`. Exit status was 1,
with zero passing and one failing selected test.

Outcome: the exact registered test is load-bearing for the frame-size ceiling.
The other six declared protocol bounds passed in the unchanged baseline run but
were outside this exact proof target.

## PNH-INV-04

- Invariant binding: `sha256:a6b2129306d14c16f9621f99870178eb181612032886a5e4b49eae72f0dfcf3c`
- Test: `pnh/tests/admission-ticket.test.ts`, `sha256:ba1f3b9b99d718e5781c0d272692679886b654a68f80d692eebba5ea567c84f1`
- Exact test name: `caller-crafted objects cannot impersonate admission tickets`
- Production entrypoint: `packages/runtime/src/runtime/admission-ticket.ts`, `sha256:16d1344b5735a5ee90eded743ac04ba09ec9c32de53b5ec7e247fefa8957c6dd`
- Control: `caller-constructed substitute admission ticket presented to the verifier`
- Dependency closure: `sha256:2e1993f0971a303a8707c789c1f12624327f714f3f1f155fdc684136e6d20276`
- External specifier: `node:crypto`
- Proof-target digest: `sha256:f8f05eba04465482c1a30a90251be09c7e2e789a82ecf91ea2e20ff3e1b5c3e2`
- Pending attestation: `docs/plans/provider-neutral-harness/reviews/2026-09-03-oss-release-proof-rotation-review.PNH-INV-04.attestation.json`

Closure files:

- `packages/runtime/src/runtime/admission-ticket.ts`, `sha256:16d1344b5735a5ee90eded743ac04ba09ec9c32de53b5ec7e247fefa8957c6dd`
- `packages/sdk/package.json`, `sha256:bed1bb74065704277d0190cff918ec1e96f3fd654ba6c414d57a6c1344e86879`
- `packages/sdk/src/manifest.ts`, `sha256:8941664d3746327f152e6cf34f1721be41d1c19d5398bc25079d8ff149e4e98e`
- `packages/sdk/src/manifest/registry.ts`, `sha256:84bae94a94fbbcbc4887af876458714283d739e90bbac27a94adb56ef6cac9e6`

Falsification: in an out-of-repository copy, `isAdmissionTicket` was weakened
from issued-object membership to accepting any non-null object. The exact
registered test failed on the forged ticket, reporting `true !== false`. Exit
status was 1, with zero passing and one failing selected test.

Outcome: the exact registered test is load-bearing for opaque ticket identity.

## PNH-INV-18

- Invariant binding: `sha256:44ac9a1eb7b834873dd33b2a429e6065beeef8a2c3a9353ea69667c4b25a8aec`
- Test: `pnh/tests/module-graph.test.ts`, `sha256:cba73a0539696a6f87c66492b76a57ad489d50cf84c893845dc7002f1f148ab1`
- Exact test name: `checkModuleGraph fails closed on the public core and on consumer-specific dependencies`
- Production entrypoint: `packages/runtime/src/core/plugin-grant.ts`, `sha256:6325e6224e1a7013834a8b7b0cac0fbb3358c78ca3aca6037c50d8a567f23a8a`
- Checker: `checkModuleGraph`
- Dependency closure: `sha256:23059c826b45cc541fbd8f516dd83ca436d5e3d691f0bc3c4dfc2e89e4737d92`
- Proof-target digest: `sha256:6140f51eba2507ac16ccc7bfba78045fb71648759d7692a9a97330d7512e34fd`
- Pending attestation: `docs/plans/provider-neutral-harness/reviews/2026-09-03-oss-release-proof-rotation-review.PNH-INV-18.attestation.json`

Closure files:

- `packages/runtime/src/core/capability-catalog.ts`, `sha256:769eef0ef40260c4982f2f07304b00f507c066bae2a22eb2d91fd50d3e1b95e6`
- `packages/runtime/src/core/grant.ts`, `sha256:13481e2189ab09fe6a806283c7874edb9b62acef8ea8c3dc1a6485ea4fa18826`
- `packages/runtime/src/core/plugin-grant.ts`, `sha256:6325e6224e1a7013834a8b7b0cac0fbb3358c78ca3aca6037c50d8a567f23a8a`
- `packages/runtime/src/core/timestamp.ts`, `sha256:3ad92342262b4baa4daac053fc47fe26efa687a00216f0619390ab750d83687f`

Falsification: in an out-of-repository copy, a bare import from
`homelab-consumer` was inserted into the real public-core tree. The exact
registered test failed its clean-tree assertion and reported the inserted
specifier as `external-specifier`. Exit status was 1, with zero passing and one
failing selected test.

Outcome: the exact registered test exercises the real core tree and is
load-bearing for consumer-specific bare imports.

## Unchanged baseline

The four complete target files were run unchanged with Node.js 26.8.1:

```text
npx tsx --test pnh/tests/plugin-protocol.test.ts pnh/tests/protocol-bounds.test.ts pnh/tests/admission-ticket.test.ts pnh/tests/module-graph.test.ts
tests 28, pass 28, fail 0, skipped 0
```

Phase 1.5 rebuilt SDK, runtime, provider-codex, provider-ollama, and CLI in the
source worktree. A separate out-of-repository copy rebuilt all five again, and
every package's `dist` tree matched byte-for-byte. All target test, production
entrypoint, and dependency-closure identities remain the same as Phase 1, so
the four recorded falsification judgments still apply. The unchanged 28-test
target run above was repeated after the rebuild with the same result.

## Limitations

PNH-INV-18 retains all three limitations declared in the trusted target:

1. `packages/runtime/scripts/check-module-graph.ts` is not digest-bound because
   its `node:module` `createRequire` loader is rejected by
   `collectDependencyClosure`. A future checker edit does not invalidate the
   target digest.
2. The registered entrypoint closure covers 4 of the 11 public-core modules,
   which is narrower than the invariant statement about the whole public core.
3. Binding the checker itself still requires either classifying its loader in
   `collectDependencyClosure` or restructuring the TypeScript load. A passing
   test alone does not discharge this obligation.

The SDK-backed PNH-INV-02 and PNH-INV-03 tests import package exports from
`packages/sdk/dist`, while their proof entrypoint binds `packages/sdk/src`.
Mutated source initially remained invisible in disposable copies that retained
pre-mutation build output. Rebuilding the SDK made both attacks fail as
required. A separate unmodified copy rebuilt the current SDK and matched the
source worktree's `packages/sdk/dist` byte-for-byte. This makes an SDK build and
output-parity check a required precondition for Phase 2. The
`proof:constitution` command does not perform that build itself. This is an
execution limitation, and it should be hardened separately. It is not an
unresolved Important finding for the exact reviewed tree because current build
parity was independently established and the mutation controls were evaluated
after rebuilding.

This review does not cover a future proof report, npm release artifacts, X1, or
changes outside the four registered targets.

## Findings and Phase 1.5 judgment

| Severity | Unresolved |
|---|---:|
| Critical | 0 |
| Important | 0 |

Each exact trusted target passed unchanged and failed under its corresponding
invariant-breaking mutation. The registrations are suitable for Phase 2
reproof, subject to the limitations and SDK build-parity precondition above.
No report verdict or signature is issued by this document.
