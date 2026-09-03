# Prism harness closed declarative-staging runtime contract

- Date: 2026-08-29
- Status: prospective Gate A0R contract, not active
- Companion: `2026-08-29-prism-harness-declarative-staging-runtime-amendment.md`
- Runtime identity: `age-package-declarative-runtime-v1`
- Target: one local macOS arm64 Gate A1 run; Linux and CI execution are not
  authorized by this revision
- Closure rule: any capability, value, field, artifact, input, output, path,
  transition, effect, or implementation identity not admitted here and in the
  exact Stage R gate is refused

## 1. Authority stages and component boundary

Stage B permits authoring and static review of exact closed paths. It permits no
authored-code execution. Stage R permits execution only after its separate gate
and owner receipt bind the resulting bytes.

The Stage R runtime has exactly four components:

| ID | Role | Run authority |
|---|---|---|
| E1 | coordinator and effect boundary | Revalidate Stage R, read exact Git objects, launch exact M1 and V1, hold bytes, write closed custody evidence |
| M1 | fixed package materializer | Transform one complete framed source bundle into one complete framed six-payload artifact bundle |
| V1 | independent verifier | Independently parse, derive, and validate the complete bundle, returning one closed result frame |
| C1 | checkpoint builder imported only by E1 | Write closed byte classes as Git objects, create one evidence commit, and create one checkpoint ref by compare-and-swap |

Only source files named by the Stage R runtime-identity record belong to these
closures. M1 and V1 share no source file. They are not plugins and have no
dynamic imports. A plan cannot select, replace, extend, or parameterize source
or behavior.

## 2. Primitive grammars and canonical JSON

The following regular languages are normative:

```text
Sha256Digest := "sha256:" [0-9a-f]{64}
GitObjectId := [0-9a-f]{40}
RunId := [0-9a-f]{32}
ArtifactId := [a-z][a-z0-9-]{0,63}
SourcePath := one or more ASCII path segments matching [A-Za-z0-9._+-]+
WorkstreamPath := "docs/ai/workstreams/" [0-9]{8} "-" [a-z0-9][a-z0-9-]{0,95}
RunRoot := WorkstreamPath "/runs/" RunId
CheckpointRef := "refs/prism/age-checkpoints/" RunId
```

Paths are repository-relative NFC strings with `/` separators. They contain no
empty, `.`, or `..` segment; backslash; control; colon; percent escape; leading
or trailing slash; trailing dot or space; or segment beginning with `.git` under
Unicode simple case folding. Exact path literals listed by the authority may
contain only `SourcePath` segments. Resolved-path containment is required in
addition to grammar validity.

Canonical JSON is UTF-8 with no BOM, NFC strings, bytewise UTF-8 key ordering,
no insignificant whitespace, shortest JSON escapes, unsigned safe integers
only, and one final LF. Duplicate keys, noncharacters, lone surrogates, negative
zero, exponent notation, floating point, and unknown keys fail. Arrays preserve
declared order.

Every machine-readable schema is Draft 2020-12 JSON Schema with
`additionalProperties: false` at every object, exact `required` arrays, the
primitive patterns above, and literal enums for every closed value. The Stage R
gate pins each schema path, object, length, and digest. Prose cannot widen a
machine schema.

## 3. Closed plan, runtime identity, and input manifest

The complete plan value is:

```ts
interface AgePackageMaterializationPlanV1 {
  schema_version: 1;
  plan_type: "age-package-materialization-plan-v1";
  stage_r_gate: {
    gate_id: "age-declarative-staging-run-gate-v1";
    gate_digest: Sha256Digest;
  };
  stage_b_authority_commit: GitObjectId;
  source_commit: GitObjectId;
  runtime_identity_digest: Sha256Digest;
  input_manifest_digest: Sha256Digest;
  run_id: RunId;
  custody_workstream: WorkstreamPath;
  run_root: RunRoot;
  artifact_set: "complete-age-package-v1";
  expected_checkpoint_parent: GitObjectId;
  checkpoint_ref: CheckpointRef;
}
```

The plan's paths, run ID, commit IDs, digests, and ref must equal Stage R gate
literals. No value is caller-selected at run time. The plan has no executable,
source closure, module, package, operation, parser, schema path, output path,
command, flag, environment, expression, template, patch, sequence, or extension
field.

`BOOTSTRAP-IDENTITY.json` has exactly:

```ts
interface BootstrapIdentityV1 {
  schema_version: 1;
  identity_type: "age-declarative-bootstrap-identity-v1";
  stage_b_authority_commit: GitObjectId;
  components: Array<BoundFile>;
  schemas: Array<BoundFile>;
  tests: Array<BoundFile>;
  sandbox_profile: BoundFile;
  node: { path: string; version: string; bytes: number; sha256: Sha256Digest };
  git: { path: string; version: string; bytes: number; sha256: Sha256Digest };
  sandbox_exec: { path: "/usr/bin/sandbox-exec"; bytes: number; sha256: Sha256Digest };
  host: { product: "macOS"; version: string; build: string; architecture: "arm64" };
  runtime_read_closure: Array<BoundFile>;
  source_manifest_digest: Sha256Digest;
  output_map_digest: Sha256Digest;
  evidence_map_digest: Sha256Digest;
  bounds_digest: Sha256Digest;
  candidate_grammar_digest: Sha256Digest;
}

interface BoundFile {
  artifact_id: ArtifactId;
  path: SourcePath;
  git_object: GitObjectId;
  bytes: number;
  sha256: Sha256Digest;
}
```

Arrays are nonempty, sorted by `artifact_id`, and duplicate-free. The Stage R
gate repeats the complete identity, not only its digest. The actual absolute
binaries, versions, file lengths, and SHA-256 values are rechecked immediately
before every process spawn.

The input manifest has exactly:

```ts
interface AgePackageInputManifestV1 {
  schema_version: 1;
  manifest_type: "age-package-input-manifest-v1";
  source_commit: GitObjectId;
  entries: Array<SourceEntry>;
}

interface SourceEntry {
  artifact_id: ArtifactId;
  path: SourcePath;
  git_object: GitObjectId;
  bytes: number;
  sha256: Sha256Digest;
  media_type: "application/json" | "application/yaml" | "text/markdown; charset=utf-8" | "text/javascript; charset=utf-8";
}
```

The Stage R gate carries the complete ordered `entries` array. The manifest
must equal that array one-for-one with no omission, extra row, category, glob,
wildcard, or indirection. E1 reads every entry with `git cat-file blob
<git_object>` from `source_commit`, with replacement objects and supplied
alternates disabled, and verifies path-to-object equality, type `blob`, length,
and SHA-256. Mutable worktree bytes never substitute.

## 4. Canonical framing and bounds

All M1 and V1 data uses `age-stage-frame-v1` in these exact bytes:

```text
magic: ASCII "PRISM-AGE-STAGE-V1\n"
header-length: exactly 8 lowercase hexadecimal ASCII bytes, then LF
header: exactly header-length canonical JSON bytes
payload-count: exactly 8 lowercase hexadecimal ASCII bytes, then LF
payload: repeated payload-count times as 8 lowercase hexadecimal ASCII length,
         then LF, then exactly that many payload bytes
end: EOF immediately after the last payload byte
```

The header is:

```ts
interface AgeStageFrameHeaderV1 {
  schema_version: 1;
  frame_type: "m1-input-v1" | "m1-output-v1" | "v1-request-v1" | "v1-result-v1";
  payloads: Array<FramePayloadDescriptor>;
}

interface FramePayloadDescriptor {
  artifact_id: ArtifactId;
  path: SourcePath;
  media_type: string;
  bytes: number;
  sha256: Sha256Digest;
}
```

Wire payload count must equal `header.payloads.length`. Each prefix length,
actual length, descriptor length, and digest must agree. IDs and paths are
unique and in the contract-defined order. Extra frames, trailing bytes,
uppercase hex, CRLF, short reads, partial writes, or noncanonical headers fail.

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
| V1 request frame bytes | 14,745,655 |
| V1 result frame bytes | 262,144 |
| JSON depth | 16 |
| JSON object keys | 256 |
| JSON array items | 512 |
| UTF-8 string bytes | 262,144 |
| Candidate rows | exactly 43 |
| Diagnostics | 64 records, 1,024 UTF-8 bytes each |
| Captured stderr | 65,536 bytes per process |
| M1 or V1 wall timeout | 30,000 ms each |
| Full acceptance timeout | 120,000 ms |

Exceeding one limit fails before the affected bytes enter custody or a child
process receives them. Truncated diagnostic output is itself a closed failure.

## 5. Candidate Markdown grammar

M1, V1, and the living package verifier independently implement this grammar:

```text
table-header := "| ID | Title | Binding statement | Enforcement kind |"
table-rule := "|---|---|---|---|"
candidate-id := "PNH-INV-" ("4" [7-9] | [5-8] DIGIT)
cell-char := any Unicode scalar except "|", CR, LF, or control
cell := non-space-cell-char /
        (non-space-cell-char *(cell-char) non-space-cell-char)
enforcement := "static-structure" | "runtime-adversarial" |
               "generated-document-consistency" |
               "controlled-performance-qualification" |
               "release-or-architecture-gate"
candidate-row := "| " candidate-id " | " cell " | " cell " | `" enforcement "` |"
candidate-table := table-header LF table-rule LF 1*(candidate-row LF)
```

A one-scalar cell is allowed and satisfies both cell endpoints. Backslash does
not escape `|`. CR, trailing space, leading space inside a cell, tabs, HTML,
continuation lines, escaped pipes, extra columns, and unknown enforcement values
fail. Exactly five tables occur under headings 6 through 10 of the named
successor candidate, one per AGE-1 through AGE-5 section. Their complete
physical row sequence is exactly PNH-INV-47 through PNH-INV-89 once and in
order. The UTF-8 bytes from `table-header` through each last row are the grammar
input; other Markdown tables cannot satisfy or widen it.

The canonical UTF-8 bytes of this fenced grammar, including final LF, are
hashed into `candidate_grammar_digest`. The Stage R gate pins that digest. The
living verifier, M1, and V1 each expose their expected digest and acceptance
tests prove agreement on valid rows, malformed extra rows, escaped pipes,
trailing spaces, duplicate IDs, missing IDs, and unknown enforcement kinds.

## 6. M1 fixed materialization and exact artifacts

M1 performs one ordered transform:

1. validate framing, source order, identities, lengths, digests, and limits;
2. parse the Plan A predecessor, current registry, and current lock with closed
   parsers;
3. parse only the named successor-candidate sections with section 5 grammar;
4. require exact candidate IDs, aliases, architecture-family mapping,
   imported-root closure, boundary manifest, and reproof overlay;
5. copy 46 predecessor baseline rows byte-identically;
6. construct 43 proposed rows with exact enforcement and release fields;
7. construct the prospective ratified form with only those 43 transitions;
8. construct the prospective registry and lock with proof status `unproven`
   and reason `AGE contracts reconciled; no implementation or production proof`;
9. render the generated constitution; and
10. emit exactly six payloads in section 6 of the amendment, in listed order.

`AGE-PACKAGE-MANIFEST.json` has exactly:

```ts
interface AgePackageArtifactManifestV1 {
  schema_version: 1;
  manifest_type: "age-package-artifact-manifest-v1";
  source_manifest_digest: Sha256Digest;
  artifacts: Array<{
    artifact_id: "candidate-baseline" | "ratified-baseline" | "invariants-registry" | "invariants-lock" | "generated-constitution";
    path: string;
    canonical_target: string;
    media_type: string;
    bytes: number;
    sha256: Sha256Digest;
    derivation: "candidate" | "closed-ratification-transition" | "registry" | "lock" | "generated-document";
  }>;
}
```

The five rows occur in payload order. The manifest does not contain its own
digest; the frame header binds all six payloads. Output bytes contain no
timestamp, absolute path, process ID, hostname, user, environment value, random
value, proof upgrade, public availability claim, or unknown artifact.

## 7. Process confinement and qualified host

Stage R is macOS arm64 only. E1 launches M1 and V1 as:

```text
/usr/bin/sandbox-exec -f <exact-bound-profile> <exact-absolute-node> <fixed-node-flags> <exact-bound-entrypoint>
```

The Stage R gate pins every shown path and byte. The profile is default-deny and
permits only the exact initial Node executable, required runtime-library reads,
the read-only source snapshot, inherited standard streams, and process exit. It
denies outbound and inbound network, DNS, Mach lookup except the literal runtime
allowlist, process fork, child execution after initial launch, signals to other
processes, filesystem writes, metadata writes, device access, user preferences,
keychain, and reads outside the exact closure.

Node receives an empty environment plus only these literals:

```text
HOME=/nonexistent
LANG=C
LC_ALL=C
TZ=UTC
NODE_NO_WARNINGS=1
```

`NODE_OPTIONS` is absent. Fixed flags include `--permission`, `--no-addons`,
`--no-experimental-require-module`, `--disallow-code-generation-from-strings`,
and `--disable-proto=throw`; any flag unavailable in the exact pinned Node build
fails host qualification. M1 and V1 use Node built-ins only and have no
`node_modules`, CommonJS, addon, worker, WASI, WebAssembly, VM, inspector,
preload, policy override, dynamic import, or package resolution.

The Stage R gate may be emitted only after read-only host identification proves
the exact Node, Git, `sandbox-exec`, OS build, architecture, and runtime read
closure exist. Its acceptance suite must then prove network, DNS, child process,
worker, addon, filesystem read, filesystem write, environment, and code-
generation probes fail under the exact profile before M1 sees real source.
GitHub Actions and Linux are outside this authority; adding either requires a
new sandbox design, qualification, review, gate, and owner receipt.

The exact acceptance entry point is a Stage R-gate-bound qualification source,
not a fifth runtime component or a plan-selected executable. E1 launches it
through the same M1/V1 profile, captures bounded output in memory, and records
only its invocation, status, output digests, and diagnostics as fields in
`RUN-EVIDENCE.json`. E1 itself orchestrates the fixed synthetic M1/V1 cases;
acceptance source cannot spawn a process or select a fixture, source, profile,
or executable.

## 8. E1 preflight, run custody, and terminal state

E1 performs these nonmutating checks before consuming the run ID:

1. revalidate Stage B and Stage R gates, receipts, validation records, authority
   commits, and exact source ancestry;
2. compare the actual Node, Git, `sandbox-exec`, OS build, architecture,
   runtime-read closure, source closures, schemas, profile, tests, fixtures, and
   reviews to `BOOTSTRAP-IDENTITY.json` and the Stage R gate;
3. validate plan, input manifest, output map, evidence map, bounds, and candidate
   grammar against their exact schemas and gate literals;
4. verify every Git path, object type, object ID, byte length, and digest with
   replacement objects, external alternates, global config, and system config
   disabled;
5. resolve custody and prove workstream, run root, output, temporary, evidence,
   and checkpoint paths are exact, absent, ordinary, same-filesystem,
   case-distinct, link-free, mount-free, and beneath custody;
6. prove expected parent is current, checkpoint ref is absent, and no conflicting
   run, terminal record, checkpoint object, or authority transition exists.

If one nonmutating check fails, no custody path or process is created. After all
six pass, E1 atomically creates the exact run directories and
`RUN-START.json`. That exclusive write consumes the Stage R run ID before any
acceptance process launch. E1 then runs the exact acceptance entry point and
synthetic M1/V1 cases under the bound identities, holding their bounded output
in memory. Acceptance failure writes the one `acceptance-fail` terminal record;
the existing run path makes every reuse collide. A retry requires a fresh Stage
R gate, receipt, and run ID.

Only acceptance `PASS` permits E1 to frame or release real source to M1. E1
writes only the amendment's exact artifact and evidence paths. One outer
finalizer writes exactly one `RUN-EVIDENCE.json` for every consumed Stage R
attempt.

`RUN-EVIDENCE.json` has one terminal arm from `pass`, `acceptance-fail`,
`m1-fail`, `v1-fail`, `checkpoint-fail`, `timeout`, `signal`, `protocol-fail`,
or `storage-fail`. It binds every authority, runtime, plan, source, process,
frame, path, status, diagnostic, checkpoint, and ref identity that exists for
that arm. Ambiguous storage or Git results never become `pass` and are not
retried.

## 9. V1 independent verification

V1 receives one `v1-request-v1` frame with exactly two payloads: the exact held
M1 input frame and exact held M1 output frame. Before re-derivation it
independently validates:

- both frame structures, all bounds, and every descriptor digest;
- the complete input manifest against Stage R source bindings;
- every JSON, YAML, lock, and section 5 Markdown grammar rule;
- candidate identity, count, order, predecessor equality, and transition set;
- registry, lock, baseline, generated-document, alias, family, import,
  boundary, and reproof agreement;
- the exact six output paths, media types, schemas, order, and derivations; and
- absence of proof upgrades, public claims, volatile values, unknown files, and
  forbidden paths.

V1 re-derives the complete six-payload bundle. `PASS` requires byte equality for
every payload and descriptor. Its `v1-result-v1` frame contains exactly one
canonical JSON payload with result, input-frame digest, output-frame digest,
V1 identity digest, and zero diagnostics for `PASS` or one to 64 closed
diagnostics for `FAIL`. V1 writes nothing and cannot repair M1 output.

## 10. C1 exact-byte checkpoint and durable ref

C1 receives three distinct held classes:

1. **V1-verified**: input frame, output frame, and the six exact output payloads;
2. **V1 identity-bound**: V1 request, V1 result, V1 stderr, and invocation; and
3. **Coordinator-derived**: run start, M1 stderr and invocation.

C1 never claims classes 2 or 3 were V1-accepted artifacts. It validates their
schemas and digest links independently. It then uses the exact absolute Git
binary with `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`,
`GIT_NO_REPLACE_OBJECTS=1`, no supplied alternates, an isolated temporary index,
hooks disabled, and signing disabled to:

1. verify the expected parent and absent checkpoint ref again;
2. write the six artifact payloads and nine pre-checkpoint evidence files as
   blobs;
3. create `RUN-CHECKPOINT.json` containing parent, the 15 other
   path/blob/length/digest/class rows, runtime identity, V1 result digest, and
   checkpoint-ref literal; it contains no row for itself and no tree or commit
   identity;
4. write `RUN-CHECKPOINT.json` as the sixteenth blob and build one final tree
   differing from the expected parent only at those exact 16 Stage R paths;
5. read the final tree back, prove all 16 paths and blobs exact, then create one
   deterministic commit with gate-pinned author, committer, timestamps,
   message, and no signature; and
6. execute `git update-ref <checkpoint-ref> <commit> 0000000000000000000000000000000000000000`, then prove the ref and commit tree
   equal the held identities using `git cat-file`.

The ref makes the checkpoint reachable. Ref update ambiguity, a pre-existing
ref, a different resolved object, object-write uncertainty, tree mismatch, or
post-update validation failure yields `checkpoint-fail`, no retry, and no
authority to change or delete the ref. E1 writes terminal evidence only after
this validation; that record binds the final tree, commit, ref, and
`RUN-CHECKPOINT.json` blob and is not inside the checkpoint tree. Later Gate A2
reads exact checkpoint objects through the ref; mutable custody never
substitutes.

## 11. Closed refusals

The runtime refuses:

- unknown, missing, malformed, duplicate, reordered, linked, mutable, aliased,
  uncommitted, category-based, wildcard, or extra inputs and outputs;
- any plan value, schema, grammar, bound, artifact, evidence path, executable,
  runtime, profile, host, commit, ref, or effect outside Stage R literals;
- unbound, caller-selected, model-selected, input-derived, output-derived,
  generated, staged, or dynamically selected code;
- network, credentials, providers, package resolution, installation, services,
  scheduling, deployment, publication, release, or public claims;
- canonical writes and Git effects outside C1's one commit and one create-only
  checkpoint ref;
- law or proof effect outside prospective artifact bytes;
- replay under another authority, source, runtime, host, workstream, run ID,
  parent, ref, or artifact set; and
- multiple open runs, multiple commits, optimistic retry, mutable reread after
  V1 `PASS`, or reuse of a failed or ambiguous run's bytes.

## 12. Acceptance matrix

The exact bound suite runs in a fresh scratch clone and must prove all cases:

| Case | Required result |
|---|---|
| Exact synthetic source package | Six-payload bundle, independent `PASS`, anchored checkpoint ref |
| Second identical synthetic run in separate authorized scratch clone | Byte-identical six payloads |
| Malformed extra row, escaped pipe, trailing-space cell, duplicate/missing/reordered ID, unknown enforcement | All three parsers refuse |
| Changed predecessor row, mapping, boundary, source statement, object, length, or digest | Refusal before M1 output |
| Extra plan/input/output/evidence key, path, frame, payload, or trailing byte | Schema or protocol refusal |
| Runtime binary, source closure, profile, schema, test, fixture, OS build, or review drift | Preflight refusal before spawn |
| Worktree substitution, replacement object, supplied alternate, global config, hook, signing, or wrong parent | Preflight or C1 refusal |
| Network, DNS, filesystem read/write, environment, child, worker, addon, VM, WASI, WebAssembly, dynamic import, or code-generation probe | Seatbelt or Node refusal |
| M1/V1 one-byte disagreement, extra file, volatile value, proof upgrade, or public claim | V1 `FAIL` |
| Custody alias, link, hard link, mount, case collision, pre-existing path, terminal collision, or ref collision | Refusal without overwrite |
| Mutation after V1 `PASS` | Held bytes checkpointed; mutable mutation has no effect |
| Timeout, signal, short write, malformed stderr, storage failure, or ambiguous checkpoint/ref result | Closed terminal failure, no retry |
| Missing static review or surviving Critical/Important finding | Stage R gate invalid; no process launch |

The suite must also verify the checkpoint ref remains reachable after
`git gc --prune=now` in the scratch clone and that every checkpoint blob can be
re-read and rehashed. The earlier direct-entry acceptance cases are historical
and cannot substitute.

## 13. Evidence and non-authority

Evidence binds both gates and receipts, external authentication locators,
validation records, authority commits, plan, input manifest, source commit,
every Git object, complete runtime identity, static reviews, acceptance result,
process invocation, frame, terminal state, output payload, V1 result, checkpoint
commit, and checkpoint ref.

Passing this contract proves only that noncanonical prospective bytes were
produced under two activated staging decisions. It does not ratify those bytes,
change law or proof status, authorize AGE runtime or Plan B implementation,
create a public claim, or grant an effect outside a separate downstream owner
gate.
