# Prism harness declarative-staging authority amendment

- Date: 2026-08-29
- Status: prospective Gate A0R bootstrap package, not ratified
- Drafting authority: Plan B authoring under the owner-ratified Plan A
  completion record and Goal #36
- Supersession target: the 2026-08-28 ratification-staging amendment and its
  direct-entry staging-tool model
- Companion: `2026-08-29-prism-harness-declarative-staging-runtime-contract.md`

## 1. Purpose

This amendment replaces general authored staging tools with one fixed-purpose
declarative AGE package materializer and one independent verifier. It uses two
owner decisions so implementation bytes cannot obtain run authority from a gate
that predates those bytes:

1. a bootstrap gate may authorize authoring and static review only; and
2. a later run gate may authorize execution only after it pins the exact
   implementation, runtime, sandbox, schemas, tests, and reviews.

The current 2026-08-28 amendment remains unchanged and retains its historical
identity. This amendment supersedes that direct-entry model only after both
decision stages validate with outcome `Ratified`. Neither a draft, a review,
source code, nor a test result activates authority.

## 2. Two-stage authority model

### Stage B: bootstrap authoring

Gate `age-declarative-staging-bootstrap-gate-v1` pins, one-for-one:

- the exhaustive `AUTHORITY-SOURCE-BINDINGS.json` table, where every row has a
  stable artifact ID, repository-relative path, Git object, byte length, and
  SHA-256 digest;
- this amendment, its companion contract, the architecture decision, every
  independent review and resolution, and the bootstrap verification manifest;
- the current registry, lock, generated constitution, Plan A predecessor,
  accepted AGE package, successor candidate, current staging authority, and
  blocking E4 evidence at their exact committed identities; and
- the exact closed bootstrap output path set in section 4.

Its receipt may grant only Stage B. It cannot grant process launch,
materialization, acceptance-test execution, checkpoint construction, Git-ref
mutation, constitutional transition, or any Stage R effect.

### Stage R: exact run authority

After Stage B source and review are committed, a separate
`age-declarative-staging-run-gate-v1` must pin:

- the validated Stage B gate, authenticated receipt, validation record, and
  bootstrap authority commit;
- every exact E1, M1, V1, C1, schema, test, fixture, sandbox-profile, and review
  byte authorized for execution;
- the absolute Node, Git, and `sandbox-exec` paths, versions, SHA-256 digests,
  host OS build, architecture, and runtime-library read closure;
- the exact source manifest, plan, input manifest, output map, evidence map,
  expected checkpoint parent, checkpoint ref, acceptance matrix, and bounds;
  and
- a fresh run ID and non-existing run-custody path under the Stage B workstream.

Stage R has its own external owner receipt. A Stage B receipt cannot satisfy or
substitute for it. Changed Stage R bytes require a new run gate and receipt.

## 3. Definitions

- **Declarative plan**: one closed JSON value with type
  `age-package-materialization-plan-v1`. It contains identities and one
  receipt-bound path. It contains no executable, operation array, parser,
  command, argv, module, package, hook, expression, template, patch, or
  extension field.
- **Bound runtime closure**: the exact E1, M1, V1, and C1 source objects and
  imports named by a validated Stage R gate. Only this closure may execute.
- **Unbound code**: any caller-authored, model-authored, input-derived,
  output-derived, mutable, dynamically selected, or differently identified
  source outside the bound runtime closure. It never receives execution
  authority.
- **M1 materializer**: the fixed-purpose Node.js program that receives one
  canonical framed source bundle on standard input and returns the complete
  prospective AGE artifact bundle on standard output.
- **V1 verifier**: a separately implemented Node.js program that independently
  parses, derives, and verifies the package from held input and output bytes.
- **E1 coordinator**: the bound effect boundary that revalidates identities,
  reads exact Git objects, launches M1 and V1, holds bytes, enforces custody,
  and owns terminal evidence.
- **C1 checkpoint builder**: the E1 source component that writes closed byte
  classes as Git objects, creates one evidence commit, and atomically anchors
  it at the one Stage R checkpoint ref.
- **Staging custody**: the Stage B workstream named by its authenticated owner
  receipt, and one Stage R run path named by the Stage R receipt. Membership is
  determined after path, link, mount, filesystem, and case resolution.
- **Canonical surface**: every path outside staging custody, including the
  resolved Git directory and every canonical registry, lock, baseline,
  constitution, product-source, and public path.

## 4. Stage B grant and closed outputs

A validated Stage B `Ratified` receipt grants only these coordinator acts:

1. create the exact fresh receipt-bound workstream;
2. author the exact paths below as ordinary source or data;
3. perform read-only source inspection and independent static review;
4. record source identities, review findings, and review resolutions; and
5. draft and verify one Stage R gate and one decision-needed record.

The Stage B output set is closed:

| Class | Exact receipt-workstream-relative paths |
|---|---|
| Runtime source | `runtime/e1.mjs`, `runtime/m1.mjs`, `runtime/v1.mjs`, `runtime/c1.mjs` |
| Schemas | `schemas/plan.schema.json`, `schemas/input-manifest.schema.json`, `schemas/artifact-bundle.schema.json`, `schemas/v1-result.schema.json`, `schemas/run-start.schema.json`, `schemas/invocation.schema.json`, `schemas/checkpoint.schema.json`, `schemas/run-evidence.schema.json` |
| Sandbox | `sandbox/macos-seatbelt.sb` |
| Tests | `tests/acceptance.mjs`, `tests/fixtures.json` |
| Identity and review | `evidence/BOOTSTRAP-IDENTITY.json`, `evidence/STATIC-REVIEW-AUTHORITY.json`, `evidence/STATIC-REVIEW-SECURITY.json`, `evidence/STATIC-REVIEW-RESOLUTION.json` |
| Stage R package | `authority/RUN-SOURCE-BINDINGS.json`, `authority/RUN-GATE.json`, `authority/RUN-GATE-VERIFICATION.json`, `authority/RUN-DECISION-NEEDED.md` |

Every listed path is created with exclusive semantics. Unknown paths, links,
hard links, devices, sockets, FIFOs, mounts, aliases, case collisions, and
pre-existing entries fail closed. Stage B does not authorize executing,
importing, evaluating, testing, or spawning any authored runtime or test byte.
Static review cannot claim runtime acceptance.

## 5. Stage R grants

Only a separately validated Stage R `Ratified` receipt activates these grants.

### R1. Bound runtime execution

Execute only the exact Stage R-gate-bound E1 closure. E1 may launch only the
exact bound acceptance, M1, and V1 entry points through the exact bound macOS
Seatbelt profile and absolute Node binary. This expressly authorizes those
bound source bytes; it does not authorize unbound code.

### R2. Acceptance before materialization

Run the exact bound acceptance suite over only the closed synthetic fixtures.
Every required case must pass under the bound Node and sandbox identities.
E1 must consume the run ID and write `RUN-START.json` before the first
acceptance process launch. Acceptance failure writes terminal evidence,
terminates Stage R without a materialization launch, and requires a fresh Stage
R gate, receipt, and run ID before any retry.

### R3. One fixed materialization

After acceptance, run exactly one M1 operation, `complete-age-package-v1`, over
the exact run-gate source manifest. A plan cannot select another operation,
artifact subset, parser, source, destination, or executable.

### R4. Independent verification

Run exact V1 over the same held inputs and M1's held artifact bundle. V1 may
return only a closed `PASS` or `FAIL` frame. It cannot authorize status, alter
bytes, select a path, or invoke another executable.

### R5. Checkpoint and evidence

E1 may persist only section 6 evidence paths. On V1 `PASS`, C1 may create one
checkpoint commit under the expected parent and create exactly one ref:
`refs/prism/age-checkpoints/<run-id>`. The ref is created by compare-and-swap
from the all-zero object ID and must resolve to the new commit immediately.
Changing or deleting it is not authorized.

### R6. Gate A2 replay

Gate A2 may reverify the exact anchored checkpoint with the same Stage R-bound
identities. New bytes, components, runtime, host build, profile, schema, path,
source, operation, effect, or replay target require another owner gate.

## 6. Closed materialization and evidence paths

M1 emits exactly six payloads in this order under the run root:

| Order | Path | Media type | Derivation |
|---:|---|---|---|
| 1 | `artifact/candidate-baseline.json` | `application/json` | 46 byte-identical predecessor rows plus PNH-INV-47 through PNH-INV-89 as proposed |
| 2 | `artifact/ratified-baseline.json` | `application/json` | payload 1 with only the closed 43 proposed-to-ratified transitions |
| 3 | `artifact/invariants.yaml` | `application/yaml` | prospective registry with successor proof status `unproven` and the exact unproven reason |
| 4 | `artifact/invariants.lock` | `application/json` | lock derived exactly from payload 3 |
| 5 | `artifact/constitution.md` | `text/markdown; charset=utf-8` | generated form derived exactly from payloads 2 through 4 |
| 6 | `artifact/AGE-PACKAGE-MANIFEST.json` | `application/json` | ordered identities, lengths, digests, canonical target mapping, and derivation labels for payloads 1 through 5 |

E1 and C1 may create only these run-root-relative evidence paths:

| Path | Presence | Byte class |
|---|---|---|
| `evidence/RUN-START.json` | every consumed Stage R attempt | coordinator-derived |
| `evidence/INPUT.frame` | after acceptance `PASS` | V1-verified input |
| `evidence/M1-OUTPUT.frame` | after valid M1 framing | V1-verified artifact bundle |
| `evidence/M1-STDERR.bin` | every M1 launch | identity-bound process output |
| `evidence/M1-INVOCATION.json` | every M1 launch | coordinator-derived |
| `evidence/V1-REQUEST.frame` | every V1 launch | coordinator-framed input and artifact bytes |
| `evidence/V1-RESULT.frame` | every V1 launch | identity-bound V1 output |
| `evidence/V1-STDERR.bin` | every V1 launch | identity-bound process output |
| `evidence/V1-INVOCATION.json` | every V1 launch | coordinator-derived |
| `evidence/RUN-CHECKPOINT.json` | V1 `PASS` only | C1-derived checkpoint metadata |
| `evidence/RUN-EVIDENCE.json` | every consumed Stage R attempt | coordinator-derived terminal record |

V1 verifies the held input frame and artifact bundle and binds its result to
their exact digests. C1 separately binds the V1 result and coordinator-derived metadata.
No document may describe post-verification evidence as V1-accepted artifact
bytes. Acceptance invocation, status, bounded output digests, and diagnostics
are fields inside `RUN-EVIDENCE.json`; acceptance creates no additional path.
On `PASS`, `RUN-CHECKPOINT.json` is inside the checkpoint tree but omits its own
blob, tree, and commit identities. `RUN-EVIDENCE.json` is written after
checkpoint-ref validation and recorded later by ordinary program evidence
discipline; it is not part of the checkpoint commit.

## 7. Withheld authority

This amendment grants none of the following:

1. execution of unbound code, staged artifacts, source inputs, plan bytes,
   output bytes, generated bytes, or dynamically selected code;
2. a general tool, plugin, module loader, transformation language, script
   runner, shell, package resolver, or extension mechanism;
3. law-status or proof-status effect outside the six prospective artifacts;
4. a canonical registry, lock, baseline, constitution, product-source, branch,
   tag, config, index, hook, stash, or Git-ref change other than the exact
   Stage R checkpoint commit and one compare-and-swap checkpoint ref;
5. provider, model, network, credential, endpoint, external service, daemon,
   timer, scheduler, installation, deployment, publication, or release effect;
6. AGE runtime implementation, Plan B implementation-plan authority, or public
   support claims;
7. a destination outside the two receipt-bound custody roots;
8. use of current mutable worktree bytes as authority or provenance; or
9. treating source, review prose, test success, M1 output, V1 output, a commit,
   or a repository string as an owner decision or owner authentication.

## 8. Invalidation and supersession

- Any changed Stage B-gate byte invalidates Stage B before activation.
- Any changed Stage B output after its source identities are recorded
  invalidates every derived Stage R gate.
- Any changed Stage R-gate byte, bound runtime, schema, test, fixture, profile,
  Node binary, Git binary, `sandbox-exec` binary, OS build, architecture,
  runtime-library closure, path map, source input, or review invalidates the
  Stage R receipt before process launch.
- Any acceptance or run violation poisons the whole run. Its bytes cannot feed
  another run or checkpoint.
- A canonical write outside the exact checkpoint commit and ref reopens Gate
  A0R and poisons the run.
- Stage B alone does not supersede current authority. Both validated receipts
  are required, and even then old gate, receipt, decision, and evidence bytes
  remain historical and unchanged.

## 9. Decision and validation protocols

Both gates are canonical JSON using UTF-8, LF, bytewise-key-sorted objects, no
insignificant whitespace, and one final LF. `gate_digest` is computed by
replacing its value with `sha256:` followed by 64 ASCII zeroes, serializing
that canonical form, and hashing the complete bytes with SHA-256. The stored value
is `sha256:` plus 64 lowercase hexadecimal characters.

Each separate receipt is recorded verbatim from the authenticated owner channel
of record. Repository content cannot authenticate an owner. Before E1 exists,
the trusted resolver is the Goal 36 coordinator acting only as a recorder and
checklist executor; its arithmetic is independently reproducible and is not
self-authenticating.

Every receipt has exactly these UTF-8 lines, in order, with one LF after each:

```text
gate_id: <exact gate ID>
gate_digest: sha256:<64 lowercase hexadecimal characters>
outcome: <Ratified|Ratified with amendments|Not ratified>
owner: Vora Technologies, LLC
role: owner
custody_path: <exact repository-relative path>
run_id: <empty for Stage B; 32 lowercase hexadecimal characters for Stage R>
supersession_reason: replace-general-staging-tools-with-fixed-declarative-materializer
```

The coordinator persists the verbatim receipt, channel-record locator and
digest, validation timestamp as evidence metadata, validator identity, and one
boolean plus diagnostic for each check. Validation requires all of these:

1. owner authentication exists in the external channel of record;
2. `gate_id`, `gate_digest`, owner, role, and supersession reason equal the
   gate byte-for-byte;
3. outcome is gate-allowed and exactly `Ratified` for activation;
4. recomputing the gate digest by the stated algorithm equals both gate and
   receipt;
5. every gate-bound row equals path, object, length, and SHA-256 at validation;
6. Stage B custody is one fresh direct child of `docs/ai/workstreams/`, or
   Stage R custody is the exact non-existing run child and run ID bound by its
   gate; and
7. no receipt, validation record, authority commit, run, or ref collision
   exists.

The gate, verbatim receipt, external authentication locator, validation record,
and decision record are committed separately as the relevant authority commit.
E1 later revalidates Stage R mechanically but cannot authenticate or repair the
owner receipt. `Ratified with amendments` invalidates the gate. `Not ratified`
grants nothing.

## 10. Non-authority boundary

This draft grants no authority by existing, being reviewed, passing checks, or
being committed. It is not constitutional law, proof, a receipt, runtime
implementation, process-launch permission, or permission to resume E4. Its
next possible effect is only a separately authenticated Stage B owner receipt.
