# Prism harness root-launcher qualification and runtime contract v3

- Date: 2026-08-29
- Status: prospective Gate A0R contract; not active
- Companion:
  `2026-08-29-prism-harness-root-launcher-authority-amendment-v3.md`
- Launcher identity: `prism-stage-launcher-v1`
- Runtime identity: `age-package-root-launched-runtime-v3`
- Target: one local macOS arm64 Gate A1 run
- Closure rule: every field, byte, source, path, process, descriptor, effect,
  transition, and identity not admitted by this contract and the exact active
  gate is refused

## 1. Scope and threat model

B3 permits closed source authoring, non-effecting build and inspection, static
review, and named authority-package tools. Q3 permits one owner-attended
privileged installation and qualification. R3 permits one run only after a
separate gate and owner signature close the installed identity, launch bytes,
runtime, host, plan, and effects.

The design protects against:

- replacement of the process that selects or streams E1 bytes;
- mutable worktree, source-path, Git-object, executable, profile, receipt,
  authority, parent, ref, path, or host substitution;
- caller-, model-, input-, or output-selected executable code or operation;
- same-user replacement of L0, the root attestation key, or a consumed run ID;
- same-UID tracing of the released child after the fork barrier;
- false confinement results caused by missing resources, connection refusal,
  DNS behavior, timeout, or generic exceptions;
- unqualified language/runtime capability hidden behind a sandbox claim;
- incomplete or relabeled V1 provenance;
- stale-parent checkpoints, ref collision, ambiguous object residue, and
  mutable unsigned terminal evidence; and
- crash-driven replay after root-ledger consumption.

The qualified host trusts the macOS kernel, SIP-protected or root-owned Apple
system files, Command Line Tools, `/usr/bin/sudo`, `/bin/sh`, the exact Q3
operator-attended command entry, root-owned L0 after qualified installation,
and the external owner key. Root compromise, a malicious Q3 operator acting as
root, kernel compromise, stolen owner or root private key, cryptographic break,
or compromised pinned Apple runtime is outside this one-run threat model.

The invoking user's ordinary repository process and unrelated same-user
processes are untrusted. They may delete user-custody evidence and cause denial
of service. They cannot produce a passing owner signature, root signature,
root-ledger identity, exact installed L0 byte sequence, or reusable sudo ticket.
Q3 and R3 each remove every existing ticket with exact `sudo -K` and invoke the
root command with exact `sudo -N`, which does not update the credential cache.
A machine whose pinned sudo lacks either behavior, permits passwordless root,
or lets the invoking user exercise another unobserved root path is ineligible.

`sandbox-exec` is deprecated platform functionality. This contract supports
only the exact qualified macOS build and pinned binary/profile behavior. Host
drift fails closed. It makes no reusable macOS product-support claim.

## 2. Components and trust boundaries

| ID | Role | Privilege and effects |
|---|---|---|
| L0 | Q3 install qualification, R3 authority validation, run consumption, exact launch, and settlement signing | Root-only install attestation and ledger writes; one dropped child; no artifact or Git ref write |
| E1 | Held-byte custody, qualification, M1/V1 orchestration, checkpoint construction, and settlement-frame production | Exact user run-custody writes, exact child launches, closed Git object promotion, one checkpoint-ref CAS |
| M1 | Fixed six-payload AGE materialization | Standard input/output/error and fixed data descriptor only |
| V1 | Independent authority, source, input, and output verification | Standard input/output/error and fixed data descriptor only |

`tests/acceptance.py` evaluates the closed R3 matrix.
`tests/effect-probe.py` performs only exact synthetic effects.
`authority/verify-static-source-policy.mjs` is the named AST policy analyzer.
None is a plugin, plan-selected executable, general command runner, or owner-
authority source.

L0 is one C17 source plus one generated constant header. It links only the
exact Apple system libraries pinned by Q3. It has no JSON, YAML, shell,
regular-expression, network, plugin, Objective-C, Foundation, preferences,
keychain, launchd, package, dynamic-loader, or config-file parser. Its only
subprocesses are fixed root-owned `ssh-keygen`, dropped-privilege raw-object
Git readers, and the one R3 sandbox/Python child.

## 3. Primitive grammars and canonical encodings

```text
Sha256Digest := "sha256:" [0-9a-f]{64}
GitObjectId := [0-9a-f]{40}
RunId := [0-9a-f]{32}
TransactionId := [0-9a-f]{32}
ArtifactId := [a-z][a-z0-9-]{0,63}
SourcePath := one or more ASCII segments matching [A-Za-z0-9._+-]+
AbsolutePath := "/" followed by one or more ASCII segments matching [A-Za-z0-9._+ -]+
WorkstreamPath := "docs/ai/workstreams/" [0-9]{8} "-" [a-z0-9][a-z0-9-]{0,95}
AuthorityRef := "refs/heads/" one or more SourcePath segments
CheckpointRef := "refs/prism/age-checkpoints-v3/" RunId
RootRunDir := "/var/db/prism-stage/runs/" RunId
```

Repository paths use NFC and `/`. They contain no empty, `.`, or `..` segment;
backslash; control; colon; percent escape; leading/trailing slash; trailing
dot/space; or segment beginning with `.git` under Unicode simple case folding.
Absolute paths must equal gate literals after no-follow component traversal.
`realpath` alone is not an authorization check.

Canonical JSON is UTF-8 with no BOM, NFC strings, bytewise UTF-8 key order, no
insignificant whitespace, shortest escapes, unsigned safe integers only, and
one final LF. Duplicate keys, noncharacters, lone surrogates, negative zero,
floating point, exponent notation, and unknown keys fail. Arrays preserve
declared order.

Every JSON schema is Draft 2020-12 with `additionalProperties: false` at every
object, exact required fields, literal enums for closed values, and
`prefixItems` plus `items: false` for fixed tuples. Isolated Python does not use
a general schema engine. E1, M1, and V1 use finite source-local validators
whose corpus verdicts must equal the gate-pinned AJV oracle.

L0 values use a binary envelope:

```text
magic: one exact 32-byte NUL-padded ASCII type literal
version: 4-byte unsigned big-endian integer, exactly 1
field-count: 4-byte unsigned big-endian integer, exact per type
for each fixed-order field:
  field-id: 2-byte unsigned big-endian enum
  field-length: 4-byte unsigned big-endian integer
  field-bytes: exactly field-length bytes
end: EOF immediately after the last field
```

Every type fixes field IDs, order, lengths, maximum total bytes, and byte
grammar. Unknown, duplicate, reordered, empty, oversized, short, trailing, or
noncanonical fields fail. Length arithmetic uses checked `size_t`; no field is
NUL-terminated or passed to a C string API before bounded copy and validation.
The decoded JSON projections are evidence only and never L0 inputs.

## 4. Acyclic authority values

### 4.1 QualificationPlanCoreV1

```ts
interface QualificationPlanCoreV1 {
  schema_version: 1;
  plan_type: "prism-launcher-qualification-plan-core-v1";
  qualification_gate_id: "age-root-launcher-qualification-gate-v1";
  bootstrap_authority_commit: GitObjectId;
  source_review_commit: GitObjectId; // S
  source_bindings_digest: Sha256Digest;
  launcher_source_digest: Sha256Digest;
  launcher_header_digest: Sha256Digest;
  launcher_binary_digest: Sha256Digest;
  build_identity_digest: Sha256Digest;
  launcher_inspection_digest: Sha256Digest;
  launcher_corpus_digest: Sha256Digest;
  install_manifest_digest: Sha256Digest;
  install_ceremony_digest: Sha256Digest;
  failure_rollback_digest: Sha256Digest;
  qualification_matrix_digest: Sha256Digest;
  owner_public_key_digest: Sha256Digest;
  transaction_id: TransactionId;
  installer_uid: number; // exact unsigned integer > 0; root forbidden
  installer_gid: number; // exact unsigned integer > 0; wheel forbidden
  authority_ref: AuthorityRef;
}
```

`PRISM-INSTALL-CAPSULE-V1` repeats every operative scalar and complete fixed
path/executable/key/build row required by installed L0. It omits the completed
Q3 gate digest, `Q`, receipt, `QA`, root public key, install attestation, and
`I`. The Q3 gate binds the complete core and capsule plus their SHA-256 values.

After the Q3 receipt, `InstallAuthorityEnvelopeV1` binds the core, completed
gate bytes and plain SHA-256, receipt and signature bytes, receipt validation,
`S`, `Q`, `QA`, authority ref, and exact closed tree deltas. It is post-gate and
does not become a Q3 gate input.

### 4.2 LaunchPlanCoreV1

```ts
interface LaunchPlanCoreV1 {
  schema_version: 1;
  plan_type: "age-root-launch-plan-core-v1";
  run_gate_id: "age-root-launcher-run-gate-v3";
  source_review_commit: GitObjectId; // S
  qualification_gate_commit: GitObjectId; // Q
  qualification_authority_commit: GitObjectId; // QA
  install_evidence_commit: GitObjectId; // I
  install_evidence_digest: Sha256Digest;
  launcher_binary_digest: Sha256Digest;
  root_public_key_digest: Sha256Digest;
  runtime_identity_digest: Sha256Digest;
  source_manifest_digest: Sha256Digest;
  static_source_policy_result_digest: Sha256Digest;
  schema_corpus_result_digest: Sha256Digest;
  acceptance_matrix_digest: Sha256Digest;
  output_map_digest: Sha256Digest;
  checkpoint_map_digest: Sha256Digest;
  bounds_digest: Sha256Digest;
  run_id: RunId;
  target_uid: number; // exact unsigned integer > 0; root forbidden
  target_gid: number; // exact unsigned integer > 0; wheel forbidden
  custody_workstream: WorkstreamPath;
  run_root: SourcePath;
  authority_ref: AuthorityRef;
  checkpoint_ref: CheckpointRef;
}
```

`PRISM-LAUNCH-CAPSULE-V1` repeats the complete operative plan in L0's binary
grammar. It omits the completed R3 gate digest, `G`, receipt, receipt
validation, `A`, launch attestation, checkpoint, and settlement. The R3 gate
binds the complete core and capsule plus their SHA-256 values.

After the R3 receipt, `LaunchAuthorityEnvelopeV1` binds the core, completed
gate bytes and plain SHA-256, receipt and signature bytes, receipt validation,
`I`, `G`, `A`, authority ref, and expected checkpoint parent `A`. It is a
post-gate value.

Neither core contains executable source, arbitrary argv, operation array,
parser, expression, template, hook, module, command, gate self-digest, or post-
gate identity. The complete gates carry every object whose digest a core names.
The machine schemas require all installer/target identity fields to be integers
with minimum 1. L0 independently repeats the nonzero and non-root/wheel checks;
schema or owner-signature validity cannot waive them.

## 5. Receipt and signature closure

The B3 external owner channel selects exactly one `ssh-ed25519` public key,
principal `vora-owner`, and canonical OpenSSH bytes. Q3 and R3 pin those bytes,
their SHA-256, SSH fingerprint, the exact root-owned `ssh-keygen`, and closed
allowed-signers bytes.

Q3 receipt lines are exactly:

```text
gate_id: age-root-launcher-qualification-gate-v1
gate_digest: sha256:<64 lowercase hexadecimal characters>
gate_bytes_sha256: sha256:<64 lowercase hexadecimal characters>
outcome: <Ratified|Ratified with amendments|Not ratified>
owner: Vora Technologies, LLC
role: owner
stage: qualification
custody_path: <exact gate-bound repository-relative path>
transaction_id: <32 lowercase hexadecimal characters>
capsule_sha256: sha256:<64 lowercase hexadecimal characters>
install_ceremony_sha256: sha256:<64 lowercase hexadecimal characters>
```

R3 receipt lines are exactly:

```text
gate_id: age-root-launcher-run-gate-v3
gate_digest: sha256:<64 lowercase hexadecimal characters>
gate_bytes_sha256: sha256:<64 lowercase hexadecimal characters>
outcome: <Ratified|Ratified with amendments|Not ratified>
owner: Vora Technologies, LLC
role: owner
stage: run
custody_path: <exact gate-bound repository-relative path>
run_id: <32 lowercase hexadecimal characters>
capsule_sha256: sha256:<64 lowercase hexadecimal characters>
launcher_sha256: sha256:<64 lowercase hexadecimal characters>
root_public_key_sha256: sha256:<64 lowercase hexadecimal characters>
```

Each line has one LF and the file has one final LF. No CR, trailing space,
unknown line, omitted line, blank line, duplicate, or alternate order is valid.
Q3 uses SSHSIG namespace `prism-age-stage-q-v1`; R3 uses
`prism-age-stage-r-v3`.

L0 obtains exact receipt, signature, gate, and capsule raw Git blobs from the
authority commit. It verifies raw-object identity, hashes the completed gate
bytes, checks `gate_bytes_sha256`, checks capsule SHA-256, verifies the detached
owner signature, and only then parses the capsule. L0 does not parse gate JSON
or treat the repository receipt-validation record as signature authority.

Gate self-digest verification remains a gate-builder/verifier and E1/Gate A2
requirement. L0's trust is the owner signature over the completed gate-byte
hash and capsule hash, not an unimplemented JSON parser.

## 6. L0 source, build, and installed identity

Q3 pins:

- exact C17 source, generated header, compiler, linker, SDK, architecture,
  flags, zeroed environment, source/object order, and build transcript;
- two clean builds in fresh directories with byte-identical output;
- warning-free `-Wall -Wextra -Werror` and the exact hardening flags selected
  by the reviewed recipe;
- one arm64 Mach-O slice, exact load commands, linked libraries, minimum OS,
  length, SHA-256, and code-directory identity;
- exact imported symbols and a closed forbidden-symbol list;
- static authority/security/feasibility/correctness/design reviews;
- exact launcher parser/state-machine mutation corpus and expected result per
  case; and
- exact host OS/build and root-owned tool identities.

The installed path is
`/Library/PrivilegedHelperTools/com.vora.prism-stage-launcher-v1`, root:wheel
mode `0555`. Every ancestor is root-owned and not group- or world-writable.
The state root is `/var/db/prism-stage`, root:wheel mode `0700`, with fixed
`keys`, `qualification`, and `runs` subdirectories mode `0700`.

L0 hashes its installed path and validates metadata on every mode entry. This
self-check is defense in depth. The trusted installation identity originates
in the Q3 attended command, which verifies the candidate inside a root-only
transaction directory before the first candidate execution.

## 7. Q3 attended installation state machine

`INSTALL-CEREMONY.txt` contains exactly two ordered commands:

```text
/usr/bin/sudo -K
/usr/bin/sudo -N -p <gate-literal-owner-prompt> -- /bin/sh -c <literal-command>
```

The gate binds the complete UTF-8 ceremony bytes separately from display
quoting. The operator compares the Q3-receipt-bound ceremony SHA-256 before
entry and authenticates only at the exact literal prompt. The second command is
not attempted if `-K` fails. The exact pinned sudo identity must document and
qualify that `-K` removes every cached credential and `-N` never updates the
cache. A passwordless policy, existing alternate root path, changed prompt, or
unsupported option makes the host ineligible.

The root shell clears the environment and uses only absolute gate-pinned
system-tool paths. It performs this order:

1. require effective UID 0, fixed umask `077`, exact host identity, and absent
   destination/state/transaction paths;
2. traverse every ancestor without following a link and reject writable,
   mounted-over, aliased, non-root-owned, or wrong-filesystem components;
3. create one root-only transaction directory named by `transaction_id`;
4. copy the candidate from its gate-exact source into the transaction
   directory with no-follow exclusive creation;
5. verify candidate length, SHA-256, Mach-O, architecture, load commands,
   libraries, code-directory identity, and mode before execution;
6. create state directories, generate the Ed25519 key with exact root-owned
   `ssh-keygen`, and verify key type, ownership, modes, public bytes, and
   fingerprint;
7. install the verified candidate to a fresh final path and fsync the file and
   parent directories;
8. write a root-only preflight marker containing the fixed install capsule,
   receipt, and verified identities;
9. invoke installed L0 exactly once in `attest-install` mode;
10. verify `InstallAttestationV1` and its detached root SSHSIG; and
11. seal the transaction as successful without deleting qualified state.

L0 install mode independently verifies Q3 owner signature, capsule, `S -> Q ->
QA`, authority-ref equality, installed identity, root key public identity,
preflight marker, exact sudo identity and `-K`/`-N` qualification record, and
complete launcher corpus. It signs only if every case has the exact expected
result and no R3 run directory exists.

Failure before a valid install attestation enters one exact rollback arm. The
root shell checks identity before removing each path and removes only paths
created by this transaction. Unknown state, wrong identity, successful
attestation, or ambiguous removal stops and preserves evidence. There is no
rollback after success under Q3.

## 8. Raw Git object-reader boundary

L0 never executes Git as root. For Q3 and R3 it creates fixed pipes, forks one
reader, calls `PT_DENY_ATTACH`, clears groups, sets the already validated exact
nonzero installer GID/UID for Q3 or target GID/UID for R3, proves no root
regain, clears the environment, fixes limits and descriptors, and execs exact
root-owned Git with a closed `cat-file --batch` protocol.

The reader receives only a fixed ordered tuple of 40-hex object IDs from L0.
It cannot receive a path, ref, option, config, operation, or verdict. Git
replacement objects, supplied alternates, global/system config, hooks,
attributes, filters, text conversion, signing, object writes, index, worktree,
and network are disabled by exact argv/environment and the reader Seatbelt
profile.

The reader returns bounded type, length, object ID, and raw object bytes. L0:

1. checks the Git object hash over `<type> <length>\0<bytes>`;
2. parses only bounded commit, tree, and blob objects;
3. requires exact parent count and ordered path traversal;
4. requests each next object by an ID derived from already verified bytes;
5. recomputes every gate-bound plain SHA-256 and length; and
6. derives all authority ancestry, closed tree deltas, path bindings, receipt,
   signature, capsule, source, and checkpoint facts itself.

Reader timeout, crash, signal, malformed header, unexpected object, duplicate,
short read, trailing byte, hash mismatch, pack ambiguity, or parse ambiguity is
a closed failure. The reader cannot make L0 accept attacker-selected bytes
without breaking a bound object hash.

## 9. R3 preflight and permanent consumption

Before consumption L0:

1. validates effective UID 0, exact installed L0 and root-key identities, host,
   system tools, ancestors, and no-follow paths;
2. verifies R3 owner receipt, signature, launch capsule, `S -> Q -> QA -> I ->
   G -> A`, every closed tree delta, and authority-ref equality;
3. verifies the root-signed installation attestation and exact `I` binding;
4. loads and hashes every gate-bound source/data blob through the raw-object
   reader and retains the complete bounded snapshot in root memory;
5. requires target UID/GID to be exact unsigned integers greater than zero,
   rejects UID 0, GID 0, and the root/wheel identities, requires exact fixed
   passwd/group rows, then validates interpreter, Git, `sandbox-exec`,
   `ssh-keygen`, profiles, runtime-read manifest, argv, environment,
   descriptors, maps, matrix, and bounds;
6. proves the root run claim, user run root, checkpoint ref, and all exact
   terminal paths are absent, distinct, link-free, mount-safe, and beneath
   their authorized roots; and
7. proves no alternate authority, transaction, or run identity collides.

Only then L0 creates `/var/db/prism-stage/runs/<run-id>` as root:wheel mode
`0700` with exclusive no-follow semantics and fsyncs it and its parent. The
directory itself is the replay tombstone. A crash at any later instruction
leaves the run consumed. R3 grants no deletion, reuse, retry, or repair.

The run directory receives fixed root-only `claim.bin`, launch attestation and
signature, and, if normal settlement occurs, settlement attestation and
signature. Files use exclusive creation, checked writes, fsync, fixed modes,
and directory fsync. Partial files remain failure evidence and cannot pass.

## 10. Fork barrier and privilege drop

L0 creates source, authority, launch-attestation, ready, release, settlement,
stdout, and stderr pipes before fork. Every pipe end has one fixed owner and
maximum. The root key is never inherited.

The child executes this exact sequence:

1. `ptrace(PT_DENY_ATTACH, 0, 0, 0)` and fail if traced or unsupported;
2. reset the signal mask and dispositions to gate literals;
3. close every descriptor except the fixed pipe ends;
4. `setgroups(0, NULL)`;
5. recheck target UID/GID are the already validated nonzero, non-root/wheel
   literals, then `setgid(target_gid)` and verify real/effective GID;
6. `setuid(target_uid)` and verify real/effective UID equals the nonzero target;
7. attempt `setuid(0)` and require `-1` with `errno == EPERM`, then reverify
   target IDs;
8. replace the environment with the exact closed map;
9. set rlimits, `umask`, working directory, and process timers;
10. write one fixed ready frame containing child PID and verified IDs;
11. block for one release byte from the root parent; and
12. `execve` exact root-owned `sandbox-exec` with inline profile, exact isolated
    Python argv, and source location `-`.

After a valid ready frame, the parent creates `LaunchAttestationV1` binding
owner authority, installed L0, source/object identities, target IDs, child PID,
barrier, descriptors, argv, profile, interpreter, run claim, custody, nonce,
and start time. It signs under namespace `prism-launch-attestation-v1`, persists
the bytes and signature in the root ledger, sends held copies to E1, and only
then writes the release byte and E1 source.

Unexpected readiness, early exit, attach failure, ID mismatch, descriptor
leak, signature failure, persistence ambiguity, or short release consumes the
run and cannot start E1.

The exact qualified `sandbox-exec` path must replace itself with Python in the
same direct-child PID. E1's first fixed startup frame reports `getpid()` and
must equal the PID in `LaunchAttestationV1` before E1 creates custody or starts
another process. Q3 qualification proves `PT_DENY_ATTACH` remains effective
across the exact sandbox/Python exec chain by attempting a same-UID attach and
requiring the gate-bound kernel refusal. A forked wrapper, changed PID, cleared
deny flag, or inconclusive attach test makes the host ineligible.

## 11. Held runtime and static source closure

E1, M1, V1, acceptance, and effect-probe source is exact `S` Git-blob content.
L0 retains and streams E1 bytes. E1 receives the remaining held bytes through
the closed authority/source frame and launches each exact Python source through
stdin. No process opens, imports, compiles, or executes an authored worktree,
custody, temporary, or snapshot source path.

Python argv is exactly:

```text
-I -S -B -E -s -
```

Worker environment is exactly:

```text
HOME=/nonexistent
LANG=C
LC_ALL=C
TZ=UTC
```

E1 adds only gate-literal run-root and Git-plumbing variables. No proxy,
credential, package, loader, debug, user-site, bytecode, locale, temp, or
caller environment survives.

The static analyzer is exactly
`authority/verify-static-source-policy.mjs`. B3 and R3 bind its source, pinned
Node parser identity, AST-version assumptions, schema, corpus, expected result,
and independent review. The corpus contains one mutation for every forbidden
import, call, node, token, scope, entrypoint, and call-graph edge plus every
allowlisted boundary.

The analyzer enforces:

- exact top-level imports and file-specific function/entrypoint maps;
- no relative, wildcard, conditional, nested, computed, or dynamic import;
- no dynamic evaluation, reflection, native extension, dynamic library,
  package/site, serialization-to-code, mmap, PTY, thread, worker, async process,
  or arbitrary subprocess route;
- no socket or resolver route in M1 or V1;
- in E1, socket calls only in exact literal AF_UNIX, AF_INET, and AF_INET6
  qualification functions, with no resolver API;
- exact subprocess calls only in E1's closed interpreter/Git/sandbox paths;
- exact source-local validator entrypoints and no hidden parser; and
- rejection of every closed forbidden byte token and AST node.

The analyzer never executes mutated Python. An absent corpus case, unexpected
diagnostic, analyzer drift, review gap, or source/result mismatch makes Q3 or
R3 ineligible.

## 12. Runtime frames and retained AGE transform

M1 and V1 retain `age-stage-frame-v2` with exact magic, lowercase fixed-width
hex lengths, canonical JSON headers, fixed ordered descriptors, bounded
payloads, and EOF immediately after the last payload. Extra frames, payloads,
keys, paths, trailing bytes, short reads, truncation, CRLF, reordered rows, or
digest mismatch fail.

The retained limits are gate literals: 65,536 header bytes; at most 64 input
payloads; 1,048,576 bytes per input/output payload; exactly six M1 output
payloads; 8,388,608 total M1 input bytes; 6,291,456 total M1 output bytes;
16,842,751 V1 request bytes; 262,144 V1 result bytes; depth 16; 256 object keys;
512 array items; 64 diagnostics of at most 1,024 UTF-8 bytes; 65,536 captured
stderr bytes; 30 seconds per M1/V1 process; 120 seconds qualification; and 300
seconds complete consumed run. The final gate repeats every limit.

M1 performs only `complete-age-package-v2`. It parses the exact predecessor,
registry, lock, boundary manifests, and 43-row successor candidate; retains the
46 predecessor rows byte-identically; constructs exact proposed and
prospective-ratified rows; keeps proof status `unproven` with the exact reason;
and emits exactly:

1. `artifact/candidate-baseline.json`;
2. `artifact/ratified-baseline.json`;
3. `artifact/invariants.yaml`;
4. `artifact/invariants.lock`;
5. `artifact/constitution.md`; and
6. `artifact/AGE-PACKAGE-MANIFEST.json`.

V1 shares no authored source with M1. It receives the complete authority
capsule, its own held source bytes, exact M1 input frame, and exact M1 output
frame. It independently validates grammar, authority relationships, source
identity, inputs, derivation, outputs, and byte equality. It writes nothing.
Only exact `PASS` with zero diagnostics permits checkpoint construction.

No output contains timestamp, PID, host, user, absolute path, environment,
random value, proof upgrade, public claim, or unknown artifact.

## 13. Process confinement and acceptance

E1 and worker Seatbelt profiles default deny. E1 permits only exact root-owned
interpreter, Git, `sandbox-exec`, and `ssh-keygen` execution; fixed runtime
reads; run-custody writes; read-only repository metadata; closed object
promotion; one authority-ref read; one checkpoint-ref CAS; and synthetic
qualification listeners. Worker permits only interpreter/runtime reads,
inherited fixed descriptors, and process exit. It has no mutable source read,
filesystem data write, network, child, unrelated signal, device, preference,
keychain, or unlisted Mach-service authority.

Every denial case uses the same exact probe source for an E1-profile positive
control and worker-profile negative control. The positive resource is fresh and
must succeed. The negative observation must fail at the named operation with
`EACCES` or `EPERM`, and the resource must show no effect. Generic exception,
`ENOENT`, `ECONNREFUSED`, name-resolution result, timeout, or unavailable
resource is not proof.

The closed matrix includes:

| ID | Case | Required result |
|---|---|---|
| AUTH-01 | Q3/R3 core excludes post-gate identities; gate digests and plain gate-byte hashes | Exact acyclic equality |
| AUTH-02 | Owner signature, complete `S -> Q -> QA -> I -> G -> A`, authority ref | Exact equality before consumption |
| INSTALL-01 | Candidate copy/hash/inspect/install/key/attest path | Exact root-signed install `PASS` |
| INSTALL-02 | Pre-existing, linked, swapped, wrong-hash, wrong-mode, partial, or rollback target | Fail before candidate execution or preserve safely |
| SUDO-01 | Cached ticket before Q3/R3; exact `-K`, fresh `-N` authentication, concurrent/after `sudo -n true` | Old ticket removed; owner prompt required; no reusable ticket exists during or after command |
| SUDO-02 | Passwordless policy, missing/changed `-K` or `-N`, prompt drift, or alternate silent root path | Host ineligible; no Q3/R3 effect |
| L0-01 | Wrong mode, argv, repo, authority, capsule, executable, host, key, or tool | Refusal without run claim |
| L0-02 | Every launcher binary parser/state mutation | Exact closed diagnostic under Q3 corpus |
| OBJECT-01 | Wrong raw object, type, length, hash, parent, tree, path, or source byte | Refusal by root L0 |
| LEDGER-01 | Fresh root run claim | Exclusive durable creation consumes run ID |
| LEDGER-02 | Existing or partial run claim | Refusal; no deletion or retry |
| PRIV-01 | Trace attempt, group/UID/GID mismatch, root-regain attempt, fd/env/limit drift | Refusal before release |
| PRIV-02 | Exact sandbox/Python exec PID continuity and same-UID attach attempt | E1 PID equals signed direct child; attach gets gate-bound denial |
| PRIV-03 | Target UID/GID 0, root/wheel identity, negative, noninteger, unresolved, or row mismatch | L0 refusal before helper, fork, or run claim |
| LAUNCH-01 | Mutate worktree/object/custody after held read | Executed bytes remain L0-held exact E1 bytes |
| STATIC-01 | Every forbidden import/call/node/token/scope/call edge | Exact analyzer diagnostic; no execution |
| SCHEMA-01 | Every schema valid case and key/type/literal/bound/arm mutation | AJV and source-local verdict equality |
| EFFECT-01 | Out-of-closure file read | Positive succeeds; worker policy denial |
| EFFECT-02 | Out-of-custody file write | Positive succeeds; worker denied; target absent |
| EFFECT-03 | AF_UNIX connect | Positive connects; worker denied; no worker connection |
| EFFECT-04 | AF_INET loopback TCP connect | Positive connects; worker denied at socket/connect |
| EFFECT-05 | AF_INET6 loopback TCP connect | Positive connects; worker denied at socket/connect |
| EFFECT-06 | Child exec | Positive exits 0; worker denied; no child result |
| EFFECT-07 | Environment sentinel | Positive sees sentinel; worker sees exact closed map only |
| MATRIX-01 | Missing, duplicate, reordered, skipped, or unknown case | Qualification `FAIL` |
| PARSE-01 | Exact synthetic AGE source package | Six payloads and independent V1 `PASS` |
| PARSE-02 | Extra, escaped, malformed, duplicate, missing, reordered, or unknown candidate data | M1, V1, and living verifier refuse |
| DRIFT-01 | Source, build, install, host, runtime, schema, profile, corpus, review, map, matrix, or bound drift | Pre-consumption refusal |
| V1-01 | One-byte output disagreement, wrong authority/source/input, extra file, volatile value, proof upgrade, public claim | V1 `FAIL` |
| PATH-01 | Alias, link, hard link, mount, case collision, existing path, or terminal collision | Refusal without overwrite |
| GIT-01 | Wrong parent, map, tree delta, object, or checkpoint-ref state | Refusal before canonical promotion |
| GIT-02 | Ref CAS collision or ambiguity | Checkpoint failure; no retry or alternate ref |
| SETTLE-01 | Wrong child, wait status, frame, checkpoint, helper, or signature | Root-signed failure or absent settlement; never pass |
| REPEAT-01 | Two synthetic transforms from identical held input | Byte-identical six payloads |
| REVIEW-01 | Missing review or surviving Critical/Important finding | Gate invalid; no effect |

There is no DNS denial case. The exact source policy proves M1/V1 cannot call a
resolver and E1 can use network APIs only in literal loopback qualification
functions. The contract claims no general DNS sandbox property.

## 14. E1 state machine and checkpoint

After receiving and verifying the signed launch-attestation mirror, E1:

1. writes exact `RUN-START.json` from held authority and launch bytes;
2. builds `RUNTIME-SNAPSHOT.json` from held sources;
3. runs every exact static/schema/effect case in order;
4. writes `ACCEPTANCE-RESULT.json`;
5. on `PASS`, releases one complete held input frame to M1;
6. records one M1 invocation, stderr, and output;
7. sends V1 the exact authority, held V1 source, input, and output;
8. on V1 `PASS`, builds one checkpoint from held buffers;
9. performs one create-only checkpoint-ref CAS; and
10. writes one bounded settlement frame to L0 and exits.

The checkpoint tree adds exactly six artifact paths and these 14 evidence paths
to parent `A`:

1. `evidence/RUN-START.json`;
2. `evidence/LAUNCH-ATTESTATION.bin`;
3. `evidence/LAUNCH-ATTESTATION.sig`;
4. `evidence/RUNTIME-SNAPSHOT.json`;
5. `evidence/ACCEPTANCE-RESULT.json`;
6. `evidence/INPUT.frame`;
7. `evidence/M1-OUTPUT.frame`;
8. `evidence/M1-STDERR.bin`;
9. `evidence/M1-INVOCATION.json`;
10. `evidence/V1-REQUEST.frame`;
11. `evidence/V1-RESULT.frame`;
12. `evidence/V1-STDERR.bin`;
13. `evidence/V1-INVOCATION.json`; and
14. `evidence/RUN-CHECKPOINT.json`.

`RUN-CHECKPOINT.json` contains fixed `prefixItems` for the other 19 paths. It
does not identify itself, the final tree, commit, ref, settlement frame, or
settlement attestation. E1 constructs blobs, trees, and commit in an exclusive
run-custody object quarantine, reads every object back, validates the exact
tree delta and sole parent `A`, promotes only the closed content-addressed
object set, and performs one CAS from zero to the checkpoint commit.

Existing exact objects may be reused only after byte verification. Ref
collision or ambiguity grants no retry, overwrite, deletion, cleanup, alternate
ref, or branch update. Promoted residue is limited to the validated object set
and is reported in the settlement frame.

## 15. Root settlement protocol

The root parent reads one `PRISM-SETTLEMENT-FRAME-V1` after releasing E1. The
frame binds launch-attestation digest, run ID, terminal arm, child-observed
phase, checkpoint commit/tree/parent/ref when present, promoted object IDs,
bounded diagnostics, and E1 end monotonic time. It is not authoritative until
L0 verifies and signs it.

L0 waits for the direct child and rejects a second child identity, stopped
process, ambiguous wait, timeout, signal mismatch, extra frame, or trailing
byte. For a claimed pass it runs a fresh anti-attach dropped-privilege raw-
object reader and independently verifies authority-ref equality, checkpoint
ref, commit, sole parent `A`, exact tree delta, all 20 checkpoint paths, every
blob length/SHA-256, launch signature, acceptance `PASS`, and V1 `PASS`.

`SettlementAttestationV1` binds the installed L0 identity, root public key,
install and launch attestations, child PID and wait result, settlement-frame
digest, verified checkpoint identities or exact failure arm, root-ledger path,
start/end monotonic times, and diagnostic. L0 signs under namespace
`prism-settlement-attestation-v1`, persists bytes/signature in the root ledger,
and writes exact mirrors to pre-opened custody descriptors.

Normal post-consumption failures receive one signed failure arm. If L0 crashes,
loses power, or cannot persist a settlement, the permanent run claim remains
and settlement is absent or partial. That state is terminal failure, not
authority to retry.

Unsigned `RUN-EVIDENCE.json`, if emitted for diagnostics, is non-authoritative.
Gate A2 derives pass only from owner authority, signed install/launch/settlement
bytes, and checkpoint content.

## 16. Gate A2 and offline durability

Gate A2 requires:

- exact B3, Q3, and R3 owner authority and commit graph;
- valid root-signed install, launch, and settlement attestations under the
  `I`-pinned public key and distinct namespaces;
- settlement pass with direct child exit 0 and exact checkpoint identities;
- checkpoint ref, commit, sole parent `A`, closed tree, launch evidence,
  acceptance `PASS`, V1 `PASS`, and exact artifact bytes; and
- independent reconstruction of the six prospective AGE payloads.

It then copies the checkpoint ref into a fresh scratch clone, runs exact
`git gc --prune=now`, and revalidates reachability and every object byte. This
offline durability check occurs after settlement. Failure blocks downstream
constitutional transition but does not change the consumed R3 result.

No mutable custody file or root-ledger availability substitutes for the
signatures and checkpoint. Deleting a mirror causes denial of service. A valid
mirror remains independently verifiable without exposing the root private key.

## 17. Closed failures and withheld authority

Pre-consumption refusal creates no root run claim. Post-consumption failure
never grants retry. Every ambiguous state is failure. Unknown fields, paths,
objects, children, descriptors, effects, diagnostics, terminal arms, or
partial values cannot be ignored.

L0 and E1 refuse unbound source, caller-selected argv, shell expansion,
dynamic operation, package resolution, credentials, external network,
providers, service activation, daemonization, installation outside Q3,
publication, release, repository creation, proof upgrade, law change, branch
update, checkpoint-ref movement, repair, alternate ref, ledger deletion, key
export, rollback after qualification, or use on another host/repository/run.

## 18. Non-authority

Passing R3 proves only that exact prospective AGE package bytes were produced
by exact root-launched source under three owner decisions and anchored for
later replay. It does not ratify those bytes, change law or proof status, create
an AGE product runtime, authorize Plan B implementation, create repositories,
invoke providers, publish a claim, or grant any effect outside a separate
downstream owner gate.

This contract is not active authority. Before a clean B3 gate and authenticated
B3 owner receipt exist, none of its authored launcher, runtime, probe,
qualification, gate-construction, receipt-validation, or checkpoint behavior
may execute.
