# Prism harness root-launcher authority amendment v3

- Date: 2026-08-29
- Status: prospective Gate A0R package; not ratified
- Drafting authority: Plan B authoring under the owner-ratified Plan A
  completion record and Goal #36
- Historical predecessors: the ratified v1 bootstrap and rejected v1/v2 run
  designs remain immutable
- Companion:
  `2026-08-29-prism-harness-root-launcher-runtime-contract-v3.md`
- Bootstrap gate: `age-root-launcher-bootstrap-gate-v3`
- Qualification gate: `age-root-launcher-qualification-gate-v1`
- Run gate: `age-root-launcher-run-gate-v3`

## 1. Purpose

This amendment creates an enforceable path for one local AGE package staging
run without trusting a same-user process to select the source launched as E1.
It adds a separately qualified root-owned native launcher, L0, between owner
authority and the existing fixed-purpose E1/M1/V1 runtime.

Authority is split across three owner decisions:

1. B3 authorizes exact source authoring, non-effecting build and static review,
   and construction of a later qualification gate.
2. Q3 authorizes one exact privileged installation, root-key generation,
   installation attestation, and failure-only rollback.
3. R3 authorizes one exact launch and staging run after the installed identity
   is committed and pinned.

No draft, source, review, successful build, installed path, repository string,
or root signature substitutes for any owner receipt.

## 2. Historical preservation

The v1 bootstrap gate, receipt, validation, authority commit, Stage B output,
reviews, and ineligible Stage R candidate remain historical and unchanged. The
v2 amendment, contract, review records, and design-rethink record remain a
rejected prospective target. They do not become authority through this v3
package.

V3 carries forward only requirements restated by this amendment and its
companion. A v1 or v2 clause not restated or identified by an exact closed
retention row has no v3 effect. V3 never rewrites or retroactively validates a
predecessor.

## 3. Authority and commit graph

The post-B3 chain is exact:

```text
B3 external owner receipt and B3 authority
                  |
                  v
source/review/build commit S
                  |
                  v
Q3 gate commit Q
                  |
                  v
Q3 signed receipt and authority commit QA
                  |
                  v
attended install and post-install evidence commit I
                  |
                  v
R3 gate commit G
                  |
                  v
R3 signed receipt and authority commit A
                  |
                  v
root-owned L0, dropped-privilege E1, checkpoint(parent=A)
                  |
                  v
root-signed settlement and Gate A2 replay
```

`S`, `Q`, `QA`, `I`, `G`, and `A` each have the prior value as sole parent.
Each commit changes only the closed path set assigned to that step. Q3 and R3
each pin one authoritative branch ref; it must equal the corresponding
authority commit immediately before its effect.

Each gate carries a canonical core that omits its own final gate digest and all
post-gate values. Each receipt binds the completed gate digest and one
pre-receipt capsule digest. Post-gate envelopes may name later commits and
evidence but never feed back into the gate. There is no hash fixed point.

## 4. Stage B3 grant

A validated B3 `Ratified` receipt grants only these acts:

1. create one fresh receipt-bound B3 custody workstream;
2. author the exact ordinary files listed in section 5;
3. parse or inspect source as data without importing or executing E1, M1, V1,
   acceptance, effect-probe, or L0 source;
4. compile L0 without executing the candidate and record the exact build
   identity and output bytes;
5. run only the reviewed non-runtime source-binding, schema-corpus,
   static-source-policy, gate-building, gate-verification, and receipt-
   validation tools listed in section 5;
6. obtain independent authority, security, feasibility, correctness, and
   design review; and
7. create exact `S`, `Q`, and, after an external signed Q3 receipt, `QA`.

B3 grants no `sudo`, installation, root-key, L0 invocation, acceptance probe,
materialization, checkpoint, canonical ref, provider, service, deployment,
publication, or constitutional effect.

## 5. Closed B3 output set

All paths are relative to the fresh B3 custody workstream.

| Class | Exact paths |
|---|---|
| Native launcher | `launcher/prism-stage-launcher.c`, `launcher/protocol-constants.h` |
| Build | `build/BUILD-RECIPE.json`, `build/BUILD-IDENTITY.json`, `build/LAUNCHER-MACHO.bin`, `build/LAUNCHER-INSPECTION.json` |
| Runtime | `runtime/e1.py`, `runtime/m1.py`, `runtime/v1.py` |
| Authority schemas | `schemas/qualification-plan-core.schema.json`, `schemas/install-capsule.schema.json`, `schemas/install-attestation.schema.json`, `schemas/launch-plan-core.schema.json`, `schemas/launch-capsule.schema.json`, `schemas/launch-attestation.schema.json`, `schemas/settlement-frame.schema.json`, `schemas/settlement-attestation.schema.json` |
| Retained runtime schemas | `schemas/run-plan-core.schema.json`, `schemas/runtime-identity.schema.json`, `schemas/source-manifest.schema.json`, `schemas/artifact-bundle.schema.json`, `schemas/v1-result.schema.json`, `schemas/run-start.schema.json`, `schemas/process-invocation.schema.json`, `schemas/acceptance-result.schema.json`, `schemas/run-snapshot.schema.json`, `schemas/checkpoint.schema.json`, `schemas/run-evidence.schema.json` |
| Static policy | `schemas/static-source-policy.schema.json`, `schemas/static-source-policy-result.schema.json`, `tests/static-source-policy-corpus.json`, `authority/verify-static-source-policy.mjs`, `evidence/STATIC-SOURCE-POLICY-RESULT.json` |
| Runtime validation | `authority/verify-schema-corpus.mjs`, `tests/schema-corpus.json`, `evidence/SCHEMA-CORPUS-RESULT.json` |
| Sandbox and acceptance | `sandbox/e1.sb`, `sandbox/worker.sb`, `tests/acceptance.py`, `tests/effect-probe.py`, `tests/fixtures.json`, `tests/launcher-corpus.bin` |
| Q3 ceremony | `qualification/INSTALL-MANIFEST.json`, `qualification/INSTALL-CEREMONY.txt`, `qualification/FAILURE-ROLLBACK.txt`, `qualification/QUALIFICATION-MATRIX.json` |
| Identity and review | `evidence/BOOTSTRAP-IDENTITY.json`, `evidence/HOST-QUALIFICATION.json`, `evidence/STATIC-REVIEW-AUTHORITY.json`, `evidence/STATIC-REVIEW-SECURITY.json`, `evidence/STATIC-REVIEW-FEASIBILITY.json`, `evidence/STATIC-REVIEW-CORRECTNESS.json`, `evidence/STATIC-REVIEW-DESIGN.json`, `evidence/STATIC-REVIEW-RESOLUTION.json` |
| Gate tools | `authority/build-qualification-gate.mjs`, `authority/verify-qualification-gate.mjs`, `authority/validate-qualification-receipt.mjs`, `authority/build-run-gate.mjs`, `authority/verify-run-gate.mjs`, `authority/validate-run-receipt.mjs` |
| Q3 pre-receipt | `authority/OWNER-PUBLIC-KEY.pub`, `authority/SOURCE-BINDINGS.json`, `authority/INSTALL-CAPSULE.bin`, `authority/QUALIFICATION-GATE.json`, `authority/QUALIFICATION-GATE-VERIFICATION.json`, `authority/QUALIFICATION-DECISION-NEEDED.md` |
| Q3 post-receipt | `authority/qualification-receipt.txt`, `authority/qualification-receipt.sig`, `authority/QUALIFICATION-RECEIPT-VALIDATION.json`, `authority/QUALIFICATION-DECISION-RECORD.md` |
| Post-install | `authority/INSTALL-ATTESTATION.bin`, `authority/INSTALL-ATTESTATION.sig`, `authority/ROOT-ATTESTATION-PUBLIC-KEY.pub`, `authority/INSTALL-EVIDENCE.json` |
| R3 pre-receipt | `authority/LAUNCH-CAPSULE.bin`, `authority/RUN-GATE.json`, `authority/RUN-GATE-VERIFICATION.json`, `authority/RUN-DECISION-NEEDED.md` |
| R3 post-receipt | `authority/run-receipt.txt`, `authority/run-receipt.sig`, `authority/RUN-RECEIPT-VALIDATION.json`, `authority/RUN-DECISION-RECORD.md` |

Every path is created with exclusive ordinary-file semantics. Unknown paths,
links, hard links, devices, sockets, FIFOs, mounts, aliases, case collisions,
and pre-existing entries fail closed. Candidate L0 bytes may be inspected as a
Mach-O file but may not execute under B3.

## 6. Stage Q3 grant

Only a separately validated Q3 `Ratified` receipt activates this section. It
grants one owner-attended, ordered `sudo -K` then `sudo -N` ceremony whose
complete bytes and digest are pinned by Q3. `-K` removes every cached owner
credential; `-N` must be supported by the pinned sudo identity and prevents
fresh authentication from updating the cache.

The ceremony may:

1. prove every destination is absent and every ancestor is root-owned and not
   group- or world-writable;
2. create one root-only transaction directory;
3. copy exact candidate bytes into that directory and verify SHA-256, length,
   Mach-O shape, linked-library closure, architecture, and code-directory hash;
4. atomically install L0 at
   `/Library/PrivilegedHelperTools/com.vora.prism-stage-launcher-v1` as
   root:wheel mode `0555`;
5. create `/var/db/prism-stage` and its fixed subdirectories as root:wheel mode
   `0700`;
6. generate one root-only Ed25519 attestation key and public key;
7. invoke exact installed L0 once in `attest-install` mode; and
8. emit and verify one root-signed `InstallAttestationV1` before success.

The root private key, root run ledger, and root temporary files never enter
Git. Only the public key and signed installation evidence may be copied into
the post-install evidence paths and committed as `I`.

Q3 authorizes failure rollback only before a valid installation attestation
exists. Rollback may remove only paths created by that failed transaction and
must prove their expected identities first. A successful L0 install, root key,
installation attestation, or any run-claim directory may be removed only under
a later decommission gate.

Q3 grants no E1 launch, materialization, checkpoint, persistent service,
sudoers change, launchd job, socket, repository ref, or constitutional effect.

## 7. Stage R3 grant

After `I`, a final R3 gate must pin:

- `S`, `Q`, `QA`, and `I` plus their exact sole-parent and tree-delta rules;
- installed L0 path, bytes, ownership, mode, ancestor closure, source, build,
  Mach-O, code-directory, and `InstallAttestationV1` identities;
- the root attestation public key and SSH fingerprint;
- owner public key, root-owned `ssh-keygen`, Git, Python, and `sandbox-exec`
  identities;
- complete E1, M1, V1, analyzer, schema, profile, fixture, corpus, review, and
  host identities;
- one complete acyclic `LaunchPlanCoreV1` and
  `PRISM-LAUNCH-CAPSULE-V1`;
- one fresh run ID, absent root-ledger claim and run-custody path,
  authoritative branch ref, and create-only checkpoint ref;
- exact unsigned nonzero target UID/GID, fixed passwd/group identities,
  privilege-drop protocol, anti-attach barrier, file descriptors, argv,
  environment, limits, timers, and settlement protocol;
- exact `sudo -K` then `sudo -N` run ceremony bytes, literal prompt, and
  no-cache qualification evidence;
- exact acceptance matrix and static-source-policy result; and
- exact artifact, evidence, checkpoint, and offline durability maps.

A validated R3 `Ratified` receipt grants one invocation:

```text
/usr/bin/sudo -K
/usr/bin/sudo -N -p <gate-literal-owner-prompt> --
/Library/PrivilegedHelperTools/com.vora.prism-stage-launcher-v1
run --repo <gate-exact-absolute-path> --authority <exact-A>
```

The normative contract supplies the first command and literal second-command
argv. The multiline form above is explanatory only. The second command runs
only after successful `-K`; `-N` cannot update a sudo timestamp. No shell,
wildcard, variable expansion, alternate mode, extra descriptor, or caller-
selected value is authorized at R3.

## 8. Run consumption and launch authority

L0 performs all nonmutating authority, installation, host, repository, source,
path, ref, and absence checks before consumption. It then creates
`/var/db/prism-stage/runs/<run-id>` with exclusive no-follow semantics. That
root-only directory permanently consumes the run ID even if launch later
fails. No R3 path may remove, rename, reuse, or repair it.

L0 forks a child behind a root-controlled release pipe. The child sets
`PT_DENY_ATTACH`, closes unlisted descriptors, clears supplementary groups,
sets the exact GID and UID, proves it cannot regain UID 0, clears the
environment, fixes limits/signals/umask/cwd, and reports a fixed ready frame.
The root parent then binds the child PID and readiness facts in
`LaunchAttestationV1`, signs and persists it in the root ledger, and releases
the child.

The child executes exact root-owned `sandbox-exec`, the gate-literal profile,
the exact isolated root-owned Python interpreter, and exact E1 bytes streamed
from L0. E1 receives a signed launch-attestation mirror over a held descriptor.
No authored source path is opened or executed.

## 9. Runtime, checkpoint, and settlement

E1 retains the fixed AGE materializer, independent verifier, held-byte source
transport, finite source-local validators, positive-control effect testing,
quarantined Git object construction, create-only checkpoint ref, and exact
checkpoint-parent rule. The companion restates every retained requirement and
supersedes the v2 coordinator, analyzer, network, and GC clauses.

The checkpoint commit has sole parent `A`. Its tree contains the six exact AGE
payloads and the closed run evidence, including the signed launch-attestation
mirror. It cannot contain the later settlement attestation.

After E1 has settled its one attempt and exited, L0:

1. waits for its direct child only;
2. reads one bounded settlement frame from the held pipe;
3. uses a second dropped-privilege anti-attach raw-object reader to verify the
   reported checkpoint commit, parent, tree, ref, and exact row identities;
4. creates and signs `SettlementAttestationV1` under a distinct namespace;
5. persists it in the root ledger and writes an exact signed mirror through a
   pre-opened no-follow custody descriptor; and
6. exits without changing a Git object, ref, worktree path, or artifact.

Every normally settled consumed attempt receives a signed settlement arm. An
L0 crash, power loss, or settlement-persistence failure leaves the permanent
claim and cannot pass or retry. Only the exact pass arm with child exit 0,
valid launch signature, complete settlement frame, and verified checkpoint can
satisfy Gate A2.

## 10. Gate A2 replay and offline durability

Gate A2 ignores unsigned mutable terminal claims. It requires the owner-signed
R3 authority, root-signed install, launch, and settlement attestations, exact
checkpoint ref and parent `A`, exact checkpoint tree and blobs, and independent
V1 `PASS`.

After settlement and before any constitutional transition, Gate A2 runs the
scratch-clone `git gc --prune=now` durability verifier. This is an offline
reachability check, not part of R3 consumption. Failure blocks downstream
transition but does not rewrite the completed run or grant a retry.

## 11. Invalidation

B3, Q3, or R3 fails closed on any:

- changed source, build, candidate, install command, tool, schema, policy,
  corpus, profile, review, host, executable, key, attestation, plan, capsule,
  gate, receipt, commit, parent, tree delta, ref, path, map, matrix, or bound;
- missing or unresolved Critical or Important review finding;
- noncanonical value, unknown field, extra path, ambiguous process result, or
  signature failure;
- pre-existing Q3 destination, root-key path, run claim, run root, or
  checkpoint ref;
- source-path execution, unlisted child, failed privilege drop, traceable
  child, mutable reread, or helper-selected object/verdict;
- missing positive control or denial-specific worker result;
- object promotion, ref CAS, settlement, or storage ambiguity; or
- attempted retry, rollback after qualification, ledger deletion, or reuse of
  any consumed identity.

Changing an R3-bound identity requires a fresh `S` or `I` as applicable, gate,
receipt, run ID, `G`, and `A`. No optimistic retry is authorized.

## 12. Receipt protocols

All gates use canonical JSON and top-level self-digest zeroing as defined by
the companion. B3 retains an explicit external owner-channel trust root. Its
receipt also selects one exact SSH Ed25519 owner public key for Q3 and R3.

Q3 and R3 receipts are fixed UTF-8 line protocols. Each contains exact gate
ID, gate digest, outcome, owner, role, custody path, stage, capsule SHA-256, and
stage-specific transaction or run ID. Q3 also binds the attended install-
command SHA-256. R3 also binds the installed-launcher and root-attestation-key
digests. Unknown, omitted, reordered, duplicated, or noncanonical lines fail.

The owner signs exact Q3 receipt bytes under SSHSIG namespace
`prism-age-stage-q-v1` and exact R3 receipt bytes under namespace
`prism-age-stage-r-v3`. Validators use the B3-pinned `ssh-ed25519` public key,
principal `vora-owner`, exact root-owned `ssh-keygen`, and no mutable allowed-
signers or signature path.

`Not ratified` grants no effect. `Ratified with amendments` grants no effect
unless every amendment is represented in a rebuilt gate and fresh signed
receipt. Repository content cannot authenticate an owner decision.

## 13. Withheld authority

This amendment grants no general privileged helper, reusable installer,
daemon, scheduler, plugin, shell runner, dynamic source, package resolver,
network service, credential use, provider invocation, canonical artifact
publication, repository creation, branch update, tag, release, proof upgrade,
law change, or public support claim.

It grants no checkpoint retry, ref repair, object cleanup, successful-install
rollback, ledger deletion, key export, alternate command, or use on another
host, repository, workstream, UID, run ID, source, authority, or artifact set.

## 14. Non-authority

This document is a prospective authority design. It does not authorize
compiling or executing L0, invoking authored runtime or probes, running `sudo`,
installing a file, generating a key, selecting an owner outcome, creating a run
claim, materializing AGE artifacts, creating a checkpoint, or changing
constitutional law or proof status.
