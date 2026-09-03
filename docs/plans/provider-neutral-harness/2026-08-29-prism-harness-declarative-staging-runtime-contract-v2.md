# Prism harness closed declarative-staging runtime contract v2

- Date: 2026-08-29
- Status: prospective Gate A0R contract; not active
- Companion:
  `2026-08-29-prism-harness-declarative-staging-runtime-amendment-v2.md`
- Runtime identity: `age-package-declarative-runtime-v2`
- Target: one local macOS arm64 Gate A1 run
- Closure rule: every value, field, source, path, process, effect, artifact,
  transition, and identity not admitted by this contract and the exact Stage R2
  gate is refused

## 1. Scope and threat model

Stage B2 permits exact source authoring, non-executing source inspection,
independent static review, and the closed authority-package tools named by the
bootstrap gate. Stage R2 permits one execution only after a separate gate and
external owner receipt close the resulting bytes and post-gate authority chain.

The runtime protects against:

- mutable-worktree or path substitution after source verification;
- caller-, model-, input-, or output-selected executable code;
- source, schema, profile, runtime, host, review, plan, manifest, parent, ref,
  and path drift;
- out-of-closure filesystem, socket, and process effects by M1, V1, and
  qualification probes;
- false-positive confinement evidence caused by missing resources or ordinary
  operational failures;
- incomplete or relabeled V1 provenance;
- checkpoint path substitution, stale-parent commits, ref collision, and
  ambiguous Git object residue; and
- replacing mutable terminal evidence after a passing checkpoint.

The qualified host assumes the kernel, root-owned Apple system files,
root-owned Command Line Tools installation, root-owned Git, root-owned
`sandbox-exec`, root-owned `ssh-keygen`, and the Stage B2 bootstrap owner
channel are trusted. Stage B2 pins an owner SSH Ed25519 public key; Stage R2 no
longer trusts a repository-authored channel statement as proof of authenticity.
A root compromise, malicious kernel, stolen owner private key, or compromised
Apple-signed runtime is outside this one-run gate. The invoking user and
same-user processes are not trusted to preserve mutable executable paths or
forge Stage R2 authority.

## 2. Components and trust boundaries

The production source closure has exactly three authored files:

| ID | Role | Effects |
|---|---|---|
| E1 | Authority revalidation, held-byte custody, qualification orchestration, M1/V1 launch, terminal settlement, and checkpoint construction | Exact run-custody writes, exact child launches, read-only Git inspection, closed Git object promotion, one checkpoint-ref CAS |
| M1 | One fixed AGE package materialization | Standard input/output/error only |
| V1 | Independent authority-capsule, source, input, and output verification | Standard input/output/error only |

`tests/acceptance.py` is a gate-bound qualification evaluator.
`tests/effect-probe.py` is a gate-bound synthetic effect probe. Neither is a
production component, plugin, plan-selected executable, or source of authority.

E1 is self-contained. Checkpoint construction is an internal E1 function; v2
has no imported or separately executable C1 source. M1 and V1 share no authored
source file and import no repository or third-party module.

The trusted coordinator performs one narrow bootstrap act: read E1's exact Git
blob into a held buffer, verify it against the Stage R2 gate, and stream it to
the exact isolated interpreter through stdin with the exact authority envelope
on file descriptor 3. E1 revalidates every bootstrap fact before creating
custody. The coordinator cannot select source, argv, profile, environment,
custody, run ID, operation, or destination.

## 3. Primitive grammars and canonical data

The following regular languages are normative:

```text
Sha256Digest := "sha256:" [0-9a-f]{64}
GitObjectId := [0-9a-f]{40}
RunId := [0-9a-f]{32}
ArtifactId := [a-z][a-z0-9-]{0,63}
SourcePath := one or more ASCII segments matching [A-Za-z0-9._+-]+
AbsolutePath := "/" followed by one or more ASCII segments matching [A-Za-z0-9._+ -]+
WorkstreamPath := "docs/ai/workstreams/" [0-9]{8} "-" [a-z0-9][a-z0-9-]{0,95}
RunRoot := WorkstreamPath "/runs/" RunId
AuthorityRef := "refs/heads/" one or more SourcePath segments
CheckpointRef := "refs/prism/age-checkpoints-v2/" RunId
```

Repository-relative paths use NFC and `/`. They contain no empty, `.`, or `..`
segment; backslash; control; colon; percent escape; leading/trailing slash;
trailing dot/space; or segment beginning with `.git` under Unicode simple case
folding. Absolute paths use NFC, have no alias or link after resolution, and
must equal a gate literal after `realpath`.

Canonical JSON is UTF-8 with no BOM, NFC strings, bytewise UTF-8 object-key
ordering, no insignificant whitespace, shortest escapes, unsigned safe
integers only, and one final LF. Duplicate keys, noncharacters, lone
surrogates, negative zero, exponent notation, floating point, and unknown keys
fail. Arrays preserve declared order.

Every machine schema is Draft 2020-12 JSON Schema with
`additionalProperties: false` at every object, exact required fields, literal
enums for closed values, and `prefixItems` plus `items: false` for every fixed
tuple. These schemas are normative data definitions, not a requirement for a
general JSON Schema engine inside isolated Python.

E1, M1, and V1 each implement purpose-built closed validators only for the
finite values they consume. Each validator explicitly checks type, exact key
set, required fields, literals, patterns, integer bounds, array length/order,
and conditional arm rules. Stage B2's gate-bound
`authority/verify-schema-corpus.mjs` uses the repository's exact pinned
`ajv/dist/2020` implementation to compile every schema and evaluate a closed
corpus containing at least one valid instance plus one mutation for every key,
type, literal, bound, pattern, tuple position, extra field, and conditional
arm. It records the expected AJV verdict and diagnostic ID without importing or
executing authored runtime source. The corpus, AJV identity, expected-result
oracle, validator-entrypoint map, and result digest are Stage R2 gate inputs.
During post-receipt qualification, E1 feeds the same canonical corpus values to
the source-local validators and requires exact oracle equality before real
source reaches M1. Prose cannot widen either implementation.

## 4. Acyclic Stage R2 authority values

### 4.1 RunPlanCoreV1

The complete gate-pinned plan core is:

```ts
interface RunPlanCoreV1 {
  schema_version: 1;
  plan_type: "age-package-run-plan-core-v1";
  stage_r_gate_id: "age-declarative-staging-run-gate-v2";
  stage_b_v2_authority_commit: GitObjectId;
  source_review_commit: GitObjectId;
  run_source_bindings_digest: Sha256Digest;
  runtime_identity_digest: Sha256Digest;
  static_source_policy_digest: Sha256Digest;
  input_manifest_digest: Sha256Digest;
  output_map_digest: Sha256Digest;
  evidence_map_digest: Sha256Digest;
  acceptance_matrix_digest: Sha256Digest;
  checkpoint_map_digest: Sha256Digest;
  bounds_digest: Sha256Digest;
  schema_corpus_digest: Sha256Digest;
  owner_public_key_digest: Sha256Digest;
  ssh_keygen_identity_digest: Sha256Digest;
  run_id: RunId;
  custody_workstream: WorkstreamPath;
  run_root: RunRoot;
  artifact_set: "complete-age-package-v2";
  authority_ref: AuthorityRef;
  checkpoint_ref: CheckpointRef;
}
```

The plan core contains no final gate digest, receipt, receipt validation,
owner-channel record, gate commit, authority commit, expected checkpoint
parent, executable path, source code, operation array, parser, command, argv,
module, hook, expression, template, patch, or extension field.

The Stage R2 gate carries the complete canonical plan core and its digest. It
also carries every complete object whose digest the core names. No value is
caller-selected at run time.

### 4.2 StageRAuthorityEnvelopeV1

After the owner receipt and authority commit exist, the trusted coordinator
constructs:

```ts
interface StageRAuthorityEnvelopeV1 {
  schema_version: 1;
  envelope_type: "age-stage-r-authority-envelope-v1";
  run_plan_core_digest: Sha256Digest;
  source_review_commit: GitObjectId; // S
  gate_commit: GitObjectId;          // G
  authority_commit: GitObjectId;     // A
  expected_checkpoint_parent: GitObjectId; // exactly A
  authority_ref: AuthorityRef;
  stage_r_gate: BoundAuthorityFile;
  owner_receipt: BoundAuthorityFile;
  owner_receipt_signature: BoundAuthorityFile;
  receipt_validation: BoundAuthorityFile;
  owner_channel_statement: BoundAuthorityFile;
  decision_record: BoundAuthorityFile;
  owner_channel_locator_digest: Sha256Digest;
  owner_channel_record_digest: Sha256Digest;
}

interface BoundAuthorityFile {
  artifact_id: ArtifactId;
  path: SourcePath;
  git_blob: GitObjectId;
  bytes: number;
  sha256: Sha256Digest;
}
```

E1 requires `parent(G) = S`, `parent(A) = G`, exact gate-finalization and
authority tree deltas, and `authority_ref = A`. The envelope's authority files
must equal their blobs in `A` one-for-one. The receipt validation must prove the
detached SSH signature against the gate-pinned public key but cannot name `A`
inside its own bytes. The envelope closes `A` after the commit exists, avoiding
a second self-reference.

`RUN-START.json` embeds the complete envelope, complete plan core, and their
digests. Both become durable checkpoint inputs.

## 5. Runtime, host, and absolute read closure

`BOOTSTRAP-IDENTITY.json` is an instance of
`age-declarative-bootstrap-identity-v2` and contains:

```ts
interface BootstrapIdentityV2 {
  schema_version: 2;
  identity_type: "age-declarative-bootstrap-identity-v2";
  stage_b_v2_authority_commit: GitObjectId;
  source_review_commit: GitObjectId;
  production_sources: [BoundGitBlob, BoundGitBlob, BoundGitBlob];
  qualification_sources: [BoundGitBlob, BoundGitBlob, BoundGitBlob];
  schemas: BoundGitBlob[];
  profiles: [BoundGitBlob, BoundGitBlob];
  interpreter: RuntimeExecutableIdentity;
  git: RuntimeExecutableIdentity;
  sandbox_exec: RuntimeExecutableIdentity;
  ssh_keygen: RuntimeExecutableIdentity;
  host: HostIdentity;
  runtime_read_rules: RuntimeReadRule[];
  fixed_argv: FixedArgv;
  fixed_environments: FixedEnvironments;
  run_plan_core_digest: Sha256Digest;
  source_manifest_digest: Sha256Digest;
  static_source_policy_digest: Sha256Digest;
  output_map_digest: Sha256Digest;
  evidence_map_digest: Sha256Digest;
  acceptance_matrix_digest: Sha256Digest;
  checkpoint_map_digest: Sha256Digest;
  bounds_digest: Sha256Digest;
  schema_corpus_digest: Sha256Digest;
  owner_public_key_digest: Sha256Digest;
  candidate_grammar_digest: Sha256Digest;
}

interface BoundGitBlob {
  artifact_id: ArtifactId;
  path: SourcePath;
  git_object: GitObjectId;
  bytes: number;
  sha256: Sha256Digest;
  media_type: string;
}

interface RuntimeExecutableIdentity {
  artifact_id: ArtifactId;
  requested_path: AbsolutePath;
  resolved_path: AbsolutePath;
  bytes: number;
  sha256: Sha256Digest;
  owner: "root";
  group: string;
  mode_octal: string;
  version: string;
  code_signature_identifier: string;
  code_directory_hash: string;
  team_identifier: string | null;
}

interface RuntimeReadRule {
  artifact_id: ArtifactId;
  rule: "exact-file" | "root-owned-sealed-prefix" | "metadata-directory";
  path: AbsolutePath;
  owner: "root";
  group: string;
  mode_octal: string;
  bytes: number | null;
  sha256: Sha256Digest | null;
  recursive_manifest_digest: Sha256Digest | null;
  entries: number | null;
  total_bytes: number | null;
  profile_operation: "file-read-data" | "file-read-metadata";
}
```

The interpreter is the fully resolved root-owned Command Line Tools Python 3.9
binary beneath `/Library/Developer/CommandLineTools/`; neither `/usr/bin/python3`
nor an Xcode/Homebrew/NVM/user path may substitute. Every ancestor from
`/Library` through the resolved executable and runtime prefix must be root-owned
and not group- or world-writable.

The interpreter argv is exactly:

```text
-I -S -B -E -s -
```

The worker environment contains only:

```text
HOME=/nonexistent
LANG=C
LC_ALL=C
TZ=UTC
```

The implementation never depends on hash-table iteration order; canonical
serializers sort every object key explicitly. No `PYTHONPATH`, `PYTHONHOME`,
user site, bytecode cache, locale inheritance,
proxy, credential, temp-directory, loader, or debug variable is present. E1's
environment adds only exact gate-bound run-root and Git-plumbing variables
listed in `FixedEnvironments`; none is inherited from the caller.

The Stage R2 gate repeats the complete runtime identity, not only its digest.
Each runtime-read rule must have a one-for-one literal Seatbelt operation and
path. A root-owned sealed prefix includes a canonical recursive manifest of
path, kind, owner, group, mode, byte length, and SHA-256 for every ordinary
file. Root-owned symlinks are allowed only when the manifest records their
literal target and their resolved target remains inside the same non-writable
sealed prefix. Devices, writable ancestors, changed link target, changed entry
count, or changed manifest invalidate the gate.

The exact executable identities, ancestor ownership/modes, host OS version and
build, architecture, runtime-read manifest, profile literals, and code-signing
values are rechecked before every process spawn.

The Stage R2 owner key is exactly one `ssh-ed25519` public key selected by the
authenticated Stage B2 bootstrap receipt and committed in `S`. The Stage R2
gate pins its canonical OpenSSH bytes, SHA-256, `ssh-keygen -lf` fingerprint,
principal `vora-owner`, and SSHSIG namespace `prism-age-stage-r-v2`.
`validate-run-receipt.mjs` and E1 each invoke the exact root-owned
`ssh-keygen -Y verify`. Exact allowed-signers and armored-signature bytes travel
through inherited read-only pipes addressed as fixed `/dev/fd/<n>` arguments;
exact receipt bytes travel on stdin. No mutable key or signature path is opened.
A missing, malformed, mismatched, replayed, or non-Ed25519 signature fails
before custody. The signature does not authorize a different gate, run ID,
custody path, namespace, principal, or receipt byte.

## 6. Held run snapshot and source policy

E1 reads each gate-bound Git blob with the exact root-owned Git binary while
disabling replacement objects, supplied alternates, global/system config,
hooks, attributes, filters, and text conversion. It verifies source-commit
path-to-object equality, object type `blob`, length, and SHA-256 before retaining
the bytes in memory.

`RUNTIME-SNAPSHOT.json` lists every held item in fixed order with source commit,
path, Git object, length, digest, media type, and transport. Production and
qualification source transport is `interpreter-stdin`; data transport is
`fd3-frame` or `held-buffer`. Snapshot files, if emitted for diagnostics, are
not executable inputs and are excluded from interpreter/profile read rules.

E1 itself is launched from the same held-byte rule by the trusted coordinator.
M1, V1, acceptance, and effect-probe source is streamed directly from E1's held
buffers. Python receives `-` as its only source location. No process opens,
imports, compiles, or executes a worktree, custody, temporary, or snapshot
source path.

`STATIC-SOURCE-POLICY.json` validates against the bound schema and carries one
exact rule set per source. A trusted gate-bound analyzer parses each production
source as Python 3.9 AST data without importing or executing it and enforces:

- exact top-level import and `from`-import allowlists;
- no relative, wildcard, computed, conditional, nested, or dynamic import;
- no calls to `eval`, `exec`, `compile`, `__import__`, `getattr`, `setattr`,
  `delattr`, `globals`, `locals`, `vars`, or breakpoint/debug hooks;
- no `ctypes`, `cffi`, `marshal`, `pickle`, `shelve`, `importlib`, package/site
  APIs, extension loaders, dynamic libraries, mmap, PTY, multiprocessing,
  threading, worker pools, async process APIs, or computed module names;
- no socket or subprocess API outside E1 and no effect-probe API outside the
  exact synthetic probe source;
- no AST node or byte token in the policy's closed forbidden sets; and
- exact file-specific entry point, function set, and module-level statement
  classes.

M1 and V1 may import only the standard-library modules explicitly named by the
Stage R2 gate. They receive no filesystem, socket, process, clock, randomness,
environment enumeration, signal, package, or native-extension authority.

The source policy is a static structural property. The runtime does not claim
to deny Python language features such as dynamic evaluation after launch; the
exact reviewed source is required not to contain a route to them.

The source-local schema validators are part of each production source's exact
function and entrypoint map. They import no third-party module and implement
only the checks enumerated in section 3. Any missing schema-corpus case,
or unreviewed validator branch makes the Stage R2 gate ineligible. An
AJV/source-local verdict mismatch makes qualification fail before real source
release and consumes the one run ID.

## 7. Canonical frames and bounds

M1 and V1 data uses `age-stage-frame-v2`:

```text
magic: ASCII "PRISM-AGE-STAGE-V2\n"
header-length: exactly 8 lowercase hexadecimal ASCII bytes, then LF
header: exactly header-length canonical JSON bytes
payload-count: exactly 8 lowercase hexadecimal ASCII bytes, then LF
payloads: for each descriptor, 8 lowercase hexadecimal length bytes, LF,
          then exactly that many payload bytes
end: EOF immediately after the final payload byte
```

The header contains only schema version 2, one literal frame type, and fixed-
order payload descriptors. Every descriptor has exact artifact ID, path, media
type, byte length, and SHA-256. Wire count, prefix length, actual length,
descriptor length, and digest must agree. Extra frames, trailing bytes,
uppercase hex, CRLF, short reads, partial writes, reordered payloads, or
noncanonical headers fail.

Frame types and payload counts are:

| Frame | Exact payloads |
|---|---|
| `m1-input-v2` | Complete ordered source-manifest payload list |
| `m1-output-v2` | Six artifact payloads |
| `v1-request-v2` | Authority capsule, held V1 source bytes, exact M1 input frame, exact M1 output frame |
| `v1-result-v2` | One canonical V1 result JSON payload |

Literal limits are:

| Limit | Value |
|---|---:|
| Header bytes | 65,536 |
| Input payload count | 64 |
| Input bytes per payload | 1,048,576 |
| Total M1 input frame bytes | 8,388,608 |
| M1 output payload count | exactly 6 |
| Output bytes per payload | 1,048,576 |
| Total M1 output frame bytes | 6,291,456 |
| V1 authority capsule bytes | 1,048,576 |
| V1 source bytes | 1,048,576 |
| V1 request frame bytes | 16,842,751 |
| V1 result frame bytes | 262,144 |
| JSON depth | 16 |
| JSON object keys | 256 |
| JSON array items | 512 |
| UTF-8 string bytes | 262,144 |
| Candidate rows | exactly 43 |
| Acceptance cases | exactly the gate-bound matrix length |
| Diagnostics | 64 records, 1,024 UTF-8 bytes each |
| Captured stderr | 65,536 bytes per process |
| One M1 or V1 process | 30,000 ms |
| Full qualification | 120,000 ms |
| Complete consumed run | 300,000 ms |

Exceeding a limit fails before affected bytes enter child custody. Truncation is
a closed failure, never a passing diagnostic.

## 8. Candidate grammar and fixed materialization

M1, V1, and the living package verifier independently implement the exact
candidate-table grammar from the v1 contract, including:

- exactly five tables under AGE-1 through AGE-5;
- exactly PNH-INV-47 through PNH-INV-89 once and in order;
- exact header, rule, cell, ID, and enforcement syntax;
- no CR, tab, escaped pipe, continuation, extra column, leading/trailing cell
  space, trailing line space, duplicate region, or unknown enforcement kind;
  and
- rejection of every other Markdown table as a candidate-table substitute.

The canonical fenced grammar bytes and digest are repeated by the Stage R2
gate. M1, V1, and the living verifier must expose the same digest.

M1 performs exactly one transform, `complete-age-package-v2`:

1. validate frame, manifest, source order, identities, lengths, and bounds;
2. parse the predecessor baseline, current registry, lock, boundary manifests,
   and successor candidate with closed parsers;
3. require exact candidate IDs, aliases, architecture-family mapping,
   imported-root closure, boundary manifests, and reproof overlay;
4. copy the 46 predecessor rows byte-identically;
5. construct 43 proposed rows with exact enforcement and release fields;
6. construct the prospective ratified form with only the closed transitions;
7. construct the prospective registry and lock with proof status `unproven` and
   exact reason `AGE contracts reconciled; no implementation or production proof`;
8. render the generated constitution; and
9. emit the six artifact payloads in the amendment's exact order.

Outputs contain no timestamp, absolute path, process ID, host, user,
environment value, random value, proof upgrade, public availability claim, or
unknown artifact.

## 9. Process confinement and qualification

The Stage R2 gate carries two complete concrete Seatbelt profiles:

- E1 profile: permits exact root-owned interpreter, Git, `sandbox-exec`, and
  `ssh-keygen` execution; exact runtime reads; exact run-custody reads/writes;
  read-only repository/Git metadata; exact quarantine and validated object
  promotion; one authority-ref read; one checkpoint-ref CAS; and one
  qualification-only Unix-domain control socket beneath run custody.
- Worker profile: permits exact root-owned interpreter execution, exact runtime
  reads, inherited standard streams and file descriptor 3, bounded process
  exit, and no filesystem data read/write outside the interpreter closure.

Both profiles default deny. Worker profile denies all network operations,
process fork/exec, signals to unrelated processes, device data, preferences,
keychain, and unlisted Mach services. It carries no mutable source-path read
rule.

The qualified runtime-effect cases are:

| Case | Positive control | Worker-profile result |
|---|---|---|
| out-of-closure file read | Read exact canary under qualification root | `EACCES` or `EPERM` at the read operation |
| out-of-custody file write | Create exact fresh canary target | `EACCES` or `EPERM`; target remains absent |
| socket effect | Connect to E1's exact Unix-domain control socket | `EACCES` or `EPERM`; listener records no worker connection |
| child process | Execute exact root-owned `/usr/bin/true` | `EACCES` or `EPERM`; no child result |
| environment closure | Observe a positive-control sentinel | Worker sees exactly the four allowed variables and no sentinel |

The positive control runs under the E1 profile against fresh synthetic
resources. The worker observation uses the same exact effect-probe source and
case ID under the worker profile. A positive control that fails makes the case
inconclusive and the qualification fails. Any worker error other than the
case-specific expected policy result also fails.

No test treats generic exception, `ENOENT`, `ECONNREFUSED`, timeout, DNS result,
or unavailable addon as sandbox proof. DNS resolution is not a separate
required denial. The worker has no permitted socket effect regardless of name
resolution.

Static-policy qualification applies every gate-bound forbidden mutation to
held synthetic source and requires the analyzer to report the exact case ID and
rule. Those mutated bytes are never executed.

## 10. E1 state machine and run custody

E1 performs these nonmutating checks before consuming the run ID:

1. validate both gates, receipts, detached Stage R2 receipt signature, owner
   public key, validation records, authority commits, and exact ancestry;
2. recompute the Stage R2 gate digest and complete authority envelope;
3. require `parent(G) = S`, `parent(A) = G`, exact tree deltas, and
   `authority_ref = A`;
4. validate the complete plan core, runtime identity, source/input manifests,
   source policy, output/evidence/checkpoint maps, acceptance matrix, profiles,
   and bounds with the source-local closed validators; require the gate-bound
   AJV schema-corpus oracle identity;
5. revalidate every Git path, object, byte length, digest, host identity,
   root-owned ancestor, runtime-read rule, code signature, profile rule, argv,
   and environment;
6. resolve custody and prove every run, qualification, quarantine, temporary,
   artifact, evidence, object, and ref path is exact, absent, case-distinct,
   same-filesystem where required, link-free, mount-free, and beneath its
   authorized root; and
7. prove the checkpoint ref and run root are absent and no run, terminal,
   authority, or ref collision exists.

A pre-consumption failure creates no custody or durable run evidence. After all
checks pass, E1 atomically creates the exact run directories and exclusive
`RUN-START.json`. This consumes the run ID.

E1 then:

1. builds `RUNTIME-SNAPSHOT.json` from held bytes;
2. executes every qualification case in exact order;
3. writes `ACCEPTANCE-RESULT.json`;
4. on qualification `PASS`, constructs and writes `INPUT.frame`;
5. launches M1 once and records exact invocation/stderr/output;
6. launches V1 once and records exact request/invocation/stderr/result;
7. on V1 `PASS`, builds and anchors one checkpoint; and
8. executes one outer finalizer that writes exactly one terminal
   `RUN-EVIDENCE.json` for the consumed attempt.

E1 never rereads a mutable artifact or source after V1 `PASS`. All checkpoint
objects are created from held buffers. Any uncaught exception, short write,
timeout, signal, malformed frame, storage ambiguity, or Git ambiguity becomes
one closed failure arm.

## 11. V1 independent verification and identity closure

V1 receives exactly four request payloads:

1. an authority capsule containing canonical Stage R2 gate bytes, plan core,
   authority envelope, receipt validation, runtime identity, source bindings,
   input manifest, source policy, maps, matrix, and bounds;
2. the exact held V1 source bytes E1 streamed to the interpreter;
3. the exact held M1 input frame; and
4. the exact held M1 output frame.

Before deriving artifacts, V1 independently:

- canonicalizes and hashes the gate with only its top-level digest zeroed;
- checks the gate's plan core and all complete bound objects;
- verifies that the gate's V1 source row equals payload 2 by path, object,
  length, and digest;
- checks `S`, runtime identity, interpreter/profile identities, and authority
  envelope values against the gate and request;
- validates all four frame payload descriptors and limits;
- parses every source format and candidate grammar independently;
- rejects duplicate or extra grammar regions, tables, keys, paths, frames, and
  payloads; and
- re-derives the exact six-payload artifact bundle.

V1 does not authenticate the external owner channel or query Git. E1 and Gate
A2 own those checks. V1 does close the cryptographic relationship among gate
bytes, held V1 source, runtime identity, input, and output without embedding a
self-digest in its own source.

`PASS` requires byte equality for every payload and descriptor. The result
contains the gate digest, authority-envelope digest, source-review commit,
runtime-identity digest, V1-source digest, input-frame digest, output-frame
digest, V1-request digest, and zero diagnostics. `FAIL` contains one to 64
closed diagnostics. V1 writes nothing and cannot repair M1 output.

## 12. Exact checkpoint construction

The checkpoint schema uses 17 fixed `prefixItems` for the six artifact paths and
first 11 evidence paths in the amendment. Each row fixes path and byte class and
requires exact Git blob, length, and SHA-256. Duplicate, missing, reordered, or
unknown rows cannot validate.

Before any Git object write, E1 validates all 17 held rows and constructs
`RUN-CHECKPOINT.json` without an identity for itself, the final tree, commit, or
ref result. It then:

1. creates an exclusive quarantine object directory beneath run custody;
2. writes exactly the 17 row blobs, checkpoint metadata blob, required trees,
   and one deterministic commit with `GIT_OBJECT_DIRECTORY` pointed only at the
   quarantine and the canonical store read-only as its sole alternate;
3. reads every quarantined object back by expected ID and rehashes its bytes;
4. proves the final tree differs from parent `A` only at the exact 18 run paths;
5. rechecks `authority_ref = A` and checkpoint-ref absence;
6. promotes only the exact validated object-ID set to canonical object fanout
   paths using exclusive no-overwrite semantics, accepting a pre-existing object
   only after exact byte verification;
7. proves the commit is readable from the canonical store and still has parent
   `A` and the exact tree; and
8. performs one `git update-ref <checkpoint-ref> <commit> <zero-id>` followed by
   exact ref, commit, tree, parent, path, blob, length, and digest readback.

Global/system Git config, replacement objects, supplied alternates, hooks,
attributes, filters, signing, index, worktree writes, reflog message variance,
and environment inheritance are disabled or fixed by gate literals.

If object promotion succeeds and ref creation fails or is ambiguous, the only
permitted canonical residue is the exact validated content-addressed object set.
The terminal record lists every promoted ID. E1 may not retry, delete, rewrite,
or create another ref.

## 13. Terminal arms and evidence authority

`RUN-EVIDENCE.json` validates against exactly one schema `oneOf` arm:

| Terminal state | Required prior results | Required final fields | Forbidden later fields |
|---|---|---|---|
| `acceptance-fail` | acceptance `FAIL` | acceptance result and diagnostic | M1, V1, checkpoint |
| `m1-fail` | acceptance `PASS`; M1 attempted | M1 invocation/result and diagnostic | V1, checkpoint |
| `v1-fail` | acceptance/M1 `PASS`; V1 attempted | V1 invocation/result and diagnostic | checkpoint |
| `checkpoint-fail` | acceptance/M1/V1 `PASS` | quarantine/promotion/ref status, promoted IDs, diagnostic | passing checkpoint result |
| `timeout` | exact failed phase | settled prior phases, timeout identity | later phases |
| `signal` | exact failed phase | signal identity and settled prior phases | later phases |
| `protocol-fail` | exact failed phase | protocol diagnostic and settled prior phases | later phases |
| `storage-fail` | exact failed phase | storage diagnostic, known promoted IDs, ambiguity flag | later phases or pass |
| `pass` | acceptance/M1/V1/checkpoint `PASS` | exact commit, tree, parent `A`, checkpoint blob, and ref | failure fields |

Every consumed arm requires the complete `RUN-START` and snapshot digests,
authority-envelope digest, plan-core digest, run ID, runtime identity, source
commit, and bounded diagnostics. Optional phase fields are represented only by
the arm that permits them; `null` does not stand in for a missing required
passing result.

For `pass`, `RUN-EVIDENCE.json` is a deterministic projection written after ref
readback. Gate A2 ignores the custody file and derives the same projection from
the checkpoint ref, parent `A`, checkpointed `RUN-START`, snapshot, acceptance,
invocations, frames, V1 result, and checkpoint metadata. Replacing or deleting
the mutable projection cannot alter authority.

Failure evidence grants no retry or downstream transition. It may be preserved
as ordinary custody evidence but is not checkpoint authority.

## 14. Exact acceptance matrix

The Stage R2 gate carries this closed matrix with stable case IDs. Every row
must be implemented and emit one exact result record.

| ID | Case | Required result |
|---|---|---|
| AUTH-01 | Plan core contains no post-gate identity; gate digest recomputation | Acyclic digest equals stored gate |
| AUTH-02 | Receipt, validation, channel digests, `S -> G -> A`, authority ref | Exact equality before custody |
| AUTH-03 | Advance authority ref after preflight | Refusal before checkpoint object promotion |
| SNAP-01 | Replace worktree/custody source after held read | Executing/output bytes remain held Git bytes |
| SNAP-02 | Replacement object, supplied alternate, filter, hook, or global config | Refusal before source release |
| STATIC-01 | Each forbidden import, call, AST node, and byte token | Exact source-policy rejection; no execution |
| STATIC-02 | Missing, extra, conditional, relative, wildcard, or computed import | Exact source-policy rejection |
| EFFECT-01 | Out-of-closure read positive/worker pair | Positive succeeds; worker gets policy denial |
| EFFECT-02 | Out-of-custody write positive/worker pair | Positive succeeds; worker denied; target absent |
| EFFECT-03 | Unix socket positive/worker pair | Positive connects; worker denied; no worker connection |
| EFFECT-04 | Child exec positive/worker pair | Positive exits 0; worker denied; no child result |
| EFFECT-05 | Environment sentinel and exact worker environment | Positive sees sentinel; worker sees exact closed map only |
| MATRIX-01 | Missing, duplicate, reordered, skipped, or unknown case ID | Qualification `FAIL` |
| PARSE-01 | Valid exact synthetic source package | Six-payload M1 bundle and independent V1 `PASS` |
| PARSE-02 | Extra/escaped/trailing-space/duplicate/missing/reordered candidate row or unknown enforcement | M1, V1, and living verifier refuse |
| INPUT-01 | Changed predecessor, mapping, boundary, source statement, object, length, or digest | Refusal before M1 output |
| PROTO-01 | Extra key/path/frame/payload/trailing byte, malformed length, short write | Exact schema or protocol failure |
| DRIFT-01 | Runtime, source, schema, profile, test, fixture, host, review, matrix, or bound drift | Pre-consumption refusal |
| V1-01 | M1/V1 one-byte disagreement, extra file, volatile value, proof upgrade, or public claim | V1 `FAIL` |
| V1-02 | Wrong gate, authority capsule, held V1 source, source commit, or runtime identity | V1 `FAIL` |
| PATH-01 | Custody alias, link, hard link, mount, case collision, existing path, or terminal collision | Refusal without overwrite |
| GIT-01 | Wrong parent, invalid exact path map, duplicate path/class, or nonclosed tree delta | Refusal before canonical object promotion |
| GIT-02 | Checkpoint ref collision or ambiguous CAS | `checkpoint-fail`; no retry or alternate ref |
| GIT-03 | Passing ref after `git gc --prune=now` in scratch clone | Commit and every blob remain reachable and rehash correctly |
| HELD-01 | Mutate custody after V1 `PASS` | Checkpoint uses held bytes; mutation has no effect |
| TERM-01 | Each timeout, signal, protocol, storage, and phase failure arm | Exactly one schema arm; no later-phase fields |
| REPEAT-01 | Two synthetic transforms from identical held input | Byte-identical six payloads |
| REVIEW-01 | Missing review or any surviving Critical/Important finding | Stage R2 gate invalid; no launch |

Scratch Git tests use fresh clones and synthetic refs. They cannot update the
real repository checkpoint ref. The real Stage R2 run still has one consumed
run ID and one authorized checkpoint attempt.

## 15. Closed refusals

The runtime refuses:

- unknown, missing, malformed, duplicate, reordered, linked, aliased, mutable,
  uncommitted, wildcard, category-based, or extra inputs and outputs;
- any value, field, source, path, schema, profile, runtime, host, commit, parent,
  ref, process, case, or effect outside gate literals;
- unbound or path-executed source and any caller/model/input/output-selected
  code or operation;
- network service, credentials, providers, package resolution, native
  extensions, installation, deployment, publication, release, or public claim;
- canonical writes outside exact object promotion and one checkpoint-ref CAS;
- proof or law status effect outside prospective noncanonical artifact bytes;
- replay under another authority, source, runtime, host, workstream, run ID,
  parent, ref, or artifact set; and
- optimistic retry, mutable reread after V1 `PASS`, ref repair, object cleanup,
  or reuse of a failed or ambiguous run.

## 16. Evidence and non-authority

Passing Stage R2 proves only that exact prospective AGE package bytes were
produced under two activated owner decisions and anchored for later replay. It
does not ratify those bytes, change constitutional law or proof status, create
an AGE product runtime, authorize Plan B implementation, create repositories,
invoke providers, publish a claim, or grant any effect outside a separate
downstream owner gate.

This contract itself is not active authority. Before a clean bootstrap gate and
external Stage B2 owner receipt exist, none of its authored runtime, probe,
gate-construction, receipt-validation, or checkpoint behavior may execute.
