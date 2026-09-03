# Prism harness declarative-staging authority amendment v2

- Date: 2026-08-29
- Status: prospective Gate A0R bootstrap package; not ratified
- Drafting authority: Plan B authoring under the owner-ratified Plan A
  completion record and Goal #36
- Historical predecessor: the ratified v1 bootstrap authority and blocked v1
  Stage R candidate remain immutable
- Companion:
  `2026-08-29-prism-harness-declarative-staging-runtime-contract-v2.md`

## 1. Purpose

This amendment replaces the blocked prospective v1 Stage R design with an
acyclic and enforceable path for one local AGE package staging run. It keeps the
fixed materializer and independent verifier, but changes the authority graph,
runtime, source transport, acceptance oracle, checkpoint parent, and terminal
evidence rules.

Authority still requires two separate owner decisions:

1. Stage B2 authorizes exact v2 bootstrap authoring, static review, and narrow
   authority-package construction; and
2. Stage R2 authorizes one exact run only after a later gate pins the completed
   implementation, host, tests, profiles, reviews, run-plan core, and effects.

No draft, source file, review, test, commit, or repository string activates
either stage.

## 2. Historical preservation and supersession

The following v1 artifacts remain historical and unchanged:

- gate `age-declarative-staging-bootstrap-gate-v1`;
- its owner receipt, validation, and authority commit;
- all 23 Stage B v1 output paths;
- the Stage B source/review commit and three review records;
- the ineligible `age-declarative-staging-run-gate-v1` candidate; and
- all evidence that records 3 Critical and 7 Important unresolved findings.

This v2 amendment may supersede the v1 prospective execution path only after a
validated Stage B2 `Ratified` receipt and, later, a separately validated Stage
R2 `Ratified` receipt. It never rewrites or retroactively validates v1.

## 3. Authority stages

### Stage B2: corrected bootstrap authority

Gate `age-declarative-staging-bootstrap-gate-v2` binds:

- this amendment, its companion contract, the corrected architecture decision,
  finding-closure matrix, exact source manifest, mechanical verification, and
  every independent review and resolution;
- the immutable v1 gate, receipt, validation, Stage B authority, source/review
  commit, ineligible Stage R gate, and unresolved review evidence;
- every living constitutional and Goal #36 source read by the package verifier;
- the exact Stage B2 custody path and exhaustive output path set in section 5;
  and
- the exact non-runtime builders and verifiers Stage B2 may execute.

A Stage B2 receipt grants no runtime, acceptance-probe, materialization,
checkpoint, canonical artifact, provider, service, deployment, publication, or
constitutional effect.

### Stage R2: one exact run

After Stage B2 runtime, schemas, tests, profiles, host qualification, and static
reviews are committed as source/review commit `S`, a final
`age-declarative-staging-run-gate-v2` must bind:

- `S` and its exact source-binding table;
- complete E1, M1, V1, schema, source-policy, profile, qualification, fixture,
  and review identities;
- the exact root-owned Python, Git, and `sandbox-exec` identities, host build,
  architecture, runtime-read manifest, fixed argv, and fixed environments;
- the exact Stage B2-owner-selected SSH Ed25519 public key and root-owned
  `ssh-keygen` identity used to verify the detached Stage R2 receipt signature;
- one complete `RunPlanCoreV1`, input manifest, output map, evidence map,
  checkpoint path/class map, acceptance matrix, static-source policy, and
  literal bounds;
- one fresh run ID, exact absent run custody path, authoritative branch ref,
  and create-only checkpoint ref; and
- the exact `S -> G -> A -> checkpoint` commit-shape protocol.

The final gate is committed as `G`, a direct child of `S`, with the exact gate
finalization delta. A Stage R2 owner receipt then permits an exact validation
and decision delta committed as `A`, a direct child of `G`. Stage R2 execution
cannot start until the authority branch ref equals `A` and every post-gate
identity is closed by `StageRAuthorityEnvelopeV1`.

## 4. Definitions

- **Run-plan core**: the gate-pinned canonical `RunPlanCoreV1`. It contains all
  pre-gate run choices and identities but no final Stage R gate digest, receipt,
  receipt validation, channel record, gate commit, or authority commit.
- **Stage R authority envelope**: a canonical value formed only after `A`. It
  binds the run-plan core, final gate, owner receipt, validation, owner-channel
  digest, `S`, `G`, `A`, authority ref, and expected checkpoint parent.
- **Held run snapshot**: exact gate-bound source and data Git blobs read into
  memory, rehashed, and retained by E1. Executable source is streamed from these
  buffers to interpreter stdin. Any filesystem copy is evidence-only.
- **Static source policy**: exact per-source import allowlists and closed
  forbidden byte tokens. It rejects language/runtime capabilities that
  Seatbelt cannot meaningfully prove denied.
- **Runtime-effect policy**: the exact Seatbelt and isolated-interpreter rules
  governing filesystem, socket, process, signal, device, preference, keychain,
  and Mach effects.
- **E1**: the self-contained coordinator, owner-authority validator, custody
  boundary, process orchestrator, terminal finalizer, and checkpoint builder.
- **M1**: the fixed-purpose Python materializer that maps one complete held
  source frame to one complete six-payload prospective AGE bundle.
- **V1**: the separately implemented Python verifier that validates the
  authority capsule, held V1 source, input frame, and M1 output, then re-derives
  the six payloads independently.
- **Authority ref**: the Stage R gate-bound branch ref that must equal `A`
  immediately before E1 launch and immediately before checkpoint object
  promotion.
- **Checkpoint ref**: the one create-only
  `refs/prism/age-checkpoints-v2/<run-id>` ref authorized for the run.
- **Canonical surface**: every path outside exact Stage R custody, including
  the resolved Git directory, except for the closed content-addressed object
  promotion and checkpoint-ref CAS in section 8.

## 5. Stage B2 grant and closed outputs

A validated Stage B2 `Ratified` receipt grants only these acts:

1. create the exact fresh receipt-bound Stage B2 custody workstream;
2. author the exact paths in this section with exclusive, ordinary-file
   semantics;
3. run trusted syntax parsing and byte-policy inspection without importing or
   executing authored runtime or probe source;
4. perform and record independent static authority, security, and feasibility
   review;
5. execute only the exact gate-bound source-binding, run-gate builder,
   run-gate verifier, schema-corpus verifier, and Stage R receipt-validator
   tools after their source has received clean static review; and
6. create only the exact `S`, `G`, and post-receipt `A` commits and authority
   records defined by this amendment.

The Stage B2 output set is closed:

| Class | Exact Stage B2-workstream-relative paths |
|---|---|
| Runtime source | `runtime/e1.py`, `runtime/m1.py`, `runtime/v1.py` |
| Core schemas | `schemas/run-plan-core.schema.json`, `schemas/stage-r-authority-envelope.schema.json`, `schemas/runtime-identity.schema.json`, `schemas/source-manifest.schema.json`, `schemas/artifact-bundle.schema.json`, `schemas/v1-result.schema.json` |
| Run schemas | `schemas/run-start.schema.json`, `schemas/process-invocation.schema.json`, `schemas/acceptance-result.schema.json`, `schemas/run-snapshot.schema.json`, `schemas/checkpoint.schema.json`, `schemas/run-evidence.schema.json` |
| Source policy | `schemas/static-source-policy.schema.json` |
| Sandbox | `sandbox/e1.sb`, `sandbox/worker.sb` |
| Acceptance | `tests/acceptance.py`, `tests/effect-probe.py`, `tests/fixtures.json` |
| Identity and review | `evidence/BOOTSTRAP-IDENTITY.json`, `evidence/HOST-QUALIFICATION.json`, `evidence/STATIC-REVIEW-AUTHORITY.json`, `evidence/STATIC-REVIEW-SECURITY.json`, `evidence/STATIC-REVIEW-FEASIBILITY.json`, `evidence/STATIC-REVIEW-RESOLUTION.json` |
| Stage R construction tools | `authority/build-run-gate.mjs`, `authority/verify-run-gate.mjs`, `authority/verify-schema-corpus.mjs`, `authority/validate-run-receipt.mjs` |
| Stage R pre-receipt package | `authority/OWNER-PUBLIC-KEY.pub`, `authority/RUN-SOURCE-BINDINGS.json`, `authority/RUN-GATE.json`, `authority/RUN-GATE-VERIFICATION.json`, `authority/RUN-DECISION-NEEDED.md` |
| Stage R post-receipt authority | `authority/receipt.txt`, `authority/receipt.sig`, `authority/OWNER-CHANNEL-STATEMENT.txt`, `authority/RECEIPT-VALIDATION.json`, `authority/DECISION-RECORD.md` |

Every listed path is created with exclusive semantics. Unknown paths, links,
hard links, devices, sockets, FIFOs, mounts, aliases, case collisions, and
pre-existing entries fail closed. Runtime and test source may be parsed as data
but may not be imported, invoked, compiled to bytecode, or executed under Stage
B2.

The four Stage R construction tools are not runtime components. They may read
only committed Stage B2 source/review bytes and repository metadata, and may
write only their exact authority outputs. Their execution cannot create run
custody, launch E1/M1/V1/probes, write Git objects, update refs, or select an
owner outcome.

## 6. Stage R2 grants

Only a separately validated Stage R2 `Ratified` receipt activates this section.

### R2.1 Post-gate authority closure

The trusted coordinator validates the detached owner signature over the exact
receipt, commits exact authority record `A`, and constructs
`StageRAuthorityEnvelopeV1`. E1 independently re-verifies the signature with
the gate-pinned public key and root-owned `ssh-keygen`, then recomputes the gate
digest, receipt and validation digests, Git path-to-object bindings, the
`S -> G -> A` chain, authority-ref equality, and run-plan-core equality before
creating any custody path.

### R2.2 Immutable-source launch

The trusted coordinator may launch exact E1 only by streaming E1's verified
Git-object bytes to the exact root-owned Python interpreter's stdin. E1 may
launch only exact M1, V1, acceptance, and effect-probe source by the same held-
buffer stdin mechanism. Run data uses fixed extra file descriptors; no process
opens an authored source path or imports a custody source file.

### R2.3 Qualification before real source

E1 consumes the run ID by creating the exact run root and `RUN-START.json`
before the first probe. It runs every exact static-policy and effect case in
the gate-bound order. Each effect denial requires a successful unsandboxed
positive control and a denial-specific result under the exact worker profile.
Any missing, duplicate, skipped, reordered, inconclusive, or failed case ends
the run without releasing real source to M1.

### R2.4 One materialization and independent verification

After qualification `PASS`, E1 releases exactly one complete held input frame
to M1. M1 performs only `complete-age-package-v2`. E1 then sends V1 the exact
authority capsule, held V1 source bytes, M1 input frame, and M1 output frame.
V1 independently verifies provenance structure and re-derives the complete
six-payload bundle. Only exact byte equality permits checkpoint construction.

### R2.5 Quarantined checkpoint and create-only ref

E1 validates the exact 18-path checkpoint map before any object write. It
builds the closed object set in run custody, reads it back, and only then may
promote those exact object IDs to the canonical object store. It creates one
commit with sole parent `A` and performs one compare-and-swap from the all-zero
object ID to `refs/prism/age-checkpoints-v2/<run-id>`.

Existing exact objects may be reused after byte verification. A failed or
ambiguous ref CAS authorizes no retry, overwrite, ref deletion, object deletion,
or alternate ref. Any promoted residue is limited to the closed validated
content-addressed set and is recorded in terminal evidence.

### R2.6 Gate A2 replay

Gate A2 reads the create-only checkpoint ref and revalidates `A`, checkpointed
`RUN-START.json`, all exact blobs, V1 result, commit parent, tree, and ref. It
derives passing terminal evidence from those durable identities. Mutable run
custody and `RUN-EVIDENCE.json` never substitute.

## 7. Closed artifacts and checkpoint paths

M1 emits exactly six payloads in this order:

| Order | Path | Media type | Derivation |
|---:|---|---|---|
| 1 | `artifact/candidate-baseline.json` | `application/json` | predecessor plus PNH-INV-47 through PNH-INV-89 as proposed |
| 2 | `artifact/ratified-baseline.json` | `application/json` | payload 1 with only the closed 43 proposed-to-ratified transitions |
| 3 | `artifact/invariants.yaml` | `application/yaml` | prospective registry with exact unproven status and reason |
| 4 | `artifact/invariants.lock` | `application/json` | exact lock derived from payload 3 |
| 5 | `artifact/constitution.md` | `text/markdown; charset=utf-8` | generated form derived from payloads 2 through 4 |
| 6 | `artifact/AGE-PACKAGE-MANIFEST.json` | `application/json` | ordered identities, lengths, digests, targets, and derivations for payloads 1 through 5 |

A passing checkpoint adds exactly these 12 evidence paths:

| Order | Path | Byte class |
|---:|---|---|
| 1 | `evidence/RUN-START.json` | coordinator-derived authority root |
| 2 | `evidence/RUNTIME-SNAPSHOT.json` | coordinator-derived held-byte manifest |
| 3 | `evidence/ACCEPTANCE-RESULT.json` | qualification-bound result |
| 4 | `evidence/INPUT.frame` | V1-verified input |
| 5 | `evidence/M1-OUTPUT.frame` | V1-verified bundle |
| 6 | `evidence/M1-STDERR.bin` | identity-bound process output |
| 7 | `evidence/M1-INVOCATION.json` | coordinator-derived invocation |
| 8 | `evidence/V1-REQUEST.frame` | V1-verified authority/input/output request |
| 9 | `evidence/V1-RESULT.frame` | identity-bound V1 result |
| 10 | `evidence/V1-STDERR.bin` | identity-bound process output |
| 11 | `evidence/V1-INVOCATION.json` | coordinator-derived invocation |
| 12 | `evidence/RUN-CHECKPOINT.json` | checkpoint metadata describing the other 17 paths |

The six artifact paths and first 11 evidence paths are the exact 17 rows in
`RUN-CHECKPOINT.json`; the metadata file does not describe itself or claim a
tree, commit, or ref identity. The complete checkpoint tree adds those exact 18
paths beneath the run root to parent `A` and changes nothing else.

`evidence/RUN-EVIDENCE.json` is outside the checkpoint. It is required for
every consumed attempt but is never a Gate A2 authority input.

## 8. Commit and ref protocol

The authority chain and checkpoint have these exact shapes:

1. `S` commits Stage B2 source, identity, qualification, clean reviews,
   resolution, owner public key, source bindings, and all four reviewed
   authority tools. It does
   not contain final `RUN-GATE.json`, receipt, validation, or decision record.
2. `G` has sole parent `S` and changes only final `RUN-GATE.json`,
   `RUN-GATE-VERIFICATION.json`, and `RUN-DECISION-NEEDED.md`.
3. `A` has sole parent `G` and changes only `receipt.txt`, `receipt.sig`,
   `OWNER-CHANNEL-STATEMENT.txt`, `RECEIPT-VALIDATION.json`, and
   `DECISION-RECORD.md`.
4. The Stage R authority ref equals `A` before E1 launch and immediately before
   checkpoint promotion.
5. The checkpoint commit has sole parent `A`, the exact tree delta in section
   7, deterministic gate-bound metadata, and no signature.
6. The checkpoint ref is absent before the run and created once by CAS. It may
   never be moved or deleted under this authority.

No gate value depends on `G` or `A`. `RunPlanCoreV1` identifies `S` and the
authority-ref literal. The post-gate envelope identifies `G` and `A`.

## 9. Invalidation

Stage B2 or Stage R2 fails closed on any:

- changed gate, source, schema, profile, test, fixture, review, resolution,
  authority tool, runtime-read manifest, interpreter, Git, `sandbox-exec`, host
  build, architecture, argv, environment, path map, matrix, or bound;
- missing or surviving Critical or Important review finding;
- noncanonical gate, receipt, validation, plan core, envelope, evidence, or
  schema value;
- broken `S -> G -> A` chain or authority-ref mismatch;
- source-path execution, mutable reread after V1 `PASS`, unlisted process,
  profile, source, input, output, path, ref, or effect;
- ambiguous storage, object promotion, commit, or ref result; or
- attempted reuse of a consumed run ID or any failed run byte.

Changing any Stage R-bound identity requires a fresh `S`, gate, owner receipt,
run ID, `G`, and `A`. No optimistic retry is authorized.

## 10. Withheld authority

This amendment grants none of the following:

1. execution of unbound, caller-authored, model-authored, input-derived,
   output-derived, generated, mutable, or path-selected source;
2. a general tool, plugin, transformation language, shell runner, package
   resolver, module loader, extension mechanism, or dynamic operation;
3. canonical writes outside the closed object promotion and one checkpoint-ref
   CAS;
4. proof or law effect outside the six prospective noncanonical payloads;
5. provider, model, credential, endpoint, external network, daemon, timer,
   scheduler, installation, deployment, repository creation, publication, or
   release effect;
6. AGE product runtime, Plan B implementation, public support claims, or Linux/
   CI execution;
7. checkpoint ref movement, deletion, repair, alternate ref, branch update, tag,
   stash, hook, config, index, or signing effect; or
8. treating source, review, test success, V1 output, Git content, or a repository
   owner string as an authenticated owner decision.

## 11. Receipt protocols

Both gates use canonical JSON with UTF-8, LF, bytewise UTF-8 key order, no
insignificant whitespace, and one final LF. `gate_digest` is computed by
replacing only its own top-level value with `sha256:` plus 64 ASCII zeroes,
canonicalizing the complete gate, and hashing those bytes with SHA-256.

The gate-pinned run-plan core contains no gate digest, so no nested value is
zeroed and no fixed point exists.

The Stage B2 bootstrap receipt is the existing external-channel trust root. It
has exactly these UTF-8 lines, in order, with one final LF after every line:

```text
gate_id: <exact gate ID>
gate_digest: sha256:<64 lowercase hexadecimal characters>
outcome: <Ratified|Ratified with amendments|Not ratified>
owner: Vora Technologies, LLC
role: owner
custody_path: <exact gate-bound repository-relative path>
run_id:
supersession_reason: replace-cyclic-stage-r-with-enforceable-runtime-v2
stage_r_owner_public_key_sha256: sha256:<64 lowercase hexadecimal characters>
```

The authenticated external owner channel supplies both the Stage B2 receipt and
the exact SSH Ed25519 public-key bytes whose SHA-256 it names. The Stage B2
coordinator records them but does not claim repository code authenticated that
bootstrap decision. That manual trust root is explicit and ends at Stage B2.

The Stage R2 receipt uses the first eight lines above, with its exact run ID and
without the public-key-digest line. The owner signs those exact receipt bytes
using SSHSIG namespace `prism-age-stage-r-v2`. `receipt.sig` is the detached
armored SSH signature. The Stage R2 gate pins the exact public-key bytes,
SHA-256, SSH fingerprint, key type `ssh-ed25519`, principal `vora-owner`,
namespace, and root-owned `ssh-keygen` identity.

The Stage R2 validator records verbatim receipt and signature bytes, the public
key identity, external channel locator/record digests, validation timestamp,
validator identity, and one boolean plus bounded diagnostic for every check.

Stage B2 activation requires the authenticated runtime owner channel, exact
gate/receipt equality, `Ratified`, recomputed gate digest, exact public-key
digest, complete source bindings, absent custody, no collision, and clean
reviews. Stage R2 validation additionally requires a successful
`ssh-keygen -Y verify` over exact receipt bytes, `parent(G) = S`, exact `G` tree
delta, authority-ref equality to `G` before `A`, and no existing run or
checkpoint ref. `Ratified with amendments` and `Not ratified` grant nothing.

## 12. Non-authority

This draft grants no authority by existing, passing checks, receiving review,
or being committed. Its next possible effect is only a separately authenticated
Stage B2 owner receipt over the final bootstrap gate. Until then, v2 Stage B
authoring, Stage R construction, runtime execution, and Goal #36 constitutional
transition remain stopped.
