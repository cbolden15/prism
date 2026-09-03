# Prism harness closed staging-tool contract (Gate A0R draft)

- Date: 2026-08-28
- Status: draft under Gate A0R, revised under the Gate A0R independent
  hardening pass; active only upon a validated `Ratified` receipt over the
  AGE staging-authority gate
- Companion document: the ratification-staging amendment
  (`2026-08-28-prism-harness-ratification-staging-amendment.md`), whose
  section 3 definitions (staging custody, canonical surface, staging tool,
  noncanonical prospective bytes) apply here unchanged, including the rule
  that custody membership is determined after full path resolution
- Closure rule: this contract is closed. A capability not listed in
  section 3 is refused. A refusal in section 4 prevails over any reading of
  section 3. The permitted artifact forms and the law-transition set are
  stated in full inside this contract (P4); no external document widens
  them.

## 1. Scope and toolchain

This contract governs every staging tool run during Gate A1 and every
re-run of the same tools during Gate A2 verification. A staging tool is a
terminating operating-system process, authored as workstream source text
held in staging custody, run under the independent enforcement layer of
section 6, whose inputs and outputs obey this contract. Anything that does
not satisfy this contract in full is not a staging tool, holds no staging
authority, and is refused: producing, transforming, or handling
noncanonical prospective bytes outside a compliant staging tool run —
other than the coordinator recording staged bytes as committed evidence
under the amendment's section 5, item 7 — violates the ratification-staging
amendment's section 4, and every byte such a process wrote is invalid
staged material under section 8.

The toolchain is fixed: the repository's already-installed Node.js runtime
and the devDependency modules already present under `node_modules` at gate
time, plus the host `git` binary invoked only for read-only object access
(`cat-file`, `hash-object`, `rev-parse`, `ls-files`), all invoked offline.
No resolver that can fetch is used: no `npx` without `--no-install`, no
`npm exec`, no `npm install`, no `corepack` activation. Staging tool entry
points are plain `.mjs` modules executed directly by the installed `node`
binary under the section 6 enforcement layer.

## 2. Pinned inputs

Every staging tool run declares its inputs, and every declared input is one
of:

1. a section 2 source binding of the ratification-staging amendment
   (candidate package or read-only staging input), identified by path and
   exact digest;
2. a repository git object whose exact object id is pinned inside a bound
   document of the amendment's section 2 — the thirteen boundary-manifest
   objects pinned by the reconciliation's boundary manifest are read this
   way — identified by that object id;
3. a byte sequence previously written to staging custody by a compliant
   staging tool run, identified by path and exact digest, together with the
   writing run's evidence record and that record's independent verification
   `PASS` (section 6); a chained input without a verifier `PASS` for its
   writing run is undeclarable;
4. workstream source text authored for Gate A1 — tool modules, test
   fixtures, and configuration — held in staging custody and identified by
   path and exact digest;
5. the tool's own source closure: its entry point and every module it
   imports from staging custody, each identified by path and exact digest;
   every module of a source closure is class 4 workstream source text — a
   byte sequence written by a staging tool run (class 3) is never part of
   any source closure;
6. fixed literal values inside the tool's declared source closure.

The ratification-staging amendment and this contract are always-declarable
read-only inputs. An undeclared input is a contract violation. Reading a
declared input whose bytes no longer match the declared digest is a
contract violation, and the tool must stop with a failure status.

## 3. Permitted capabilities (closed list)

- **P1 — Read pinned bytes.** Read the files and git objects that are
  declared inputs, and nothing else.
- **P2 — Parse and check in-process.** Parse, typecheck, and structurally
  analyze declared input text using only the TypeScript compiler API loaded
  as a library from the installed `node_modules/typescript`, or
  `tsc --noEmit` invoked offline from that same installed package. No
  toolchain entry point that evaluates module code is applied to any
  declared input or any staging-custody path (see R7).
- **P3 — Digest and serialize.** Compute content digests and canonical
  serializations of declared inputs and of bytes the run produces.
- **P4 — Materialize prospective bytes.** Write, inside staging custody
  only, exactly these artifact forms:
  - (a) the candidate baseline form: PNH-INV-01 through PNH-INV-46 as
    byte-identical canonical rows, and PNH-INV-47 through PNH-INV-89 as
    `proposed` rows with explicit enforcement and post-first-release policy
    and no proof fields;
  - (b) the exact prospective ratified form: produced from (a) by applying
    exactly the closed set of 43 law transitions — `proposed` to
    `ratified`, one per prospective row PNH-INV-47 through PNH-INV-89, and
    no other transition of any kind;
  - (c) the matching prospective registry and lock forms, with proof status
    fixed as unproven with an exact reason and a release disposition;
  - (d) the prospective generated-document form derived from (b) and (c);
  - (e) reports, logs, and manifests under P6.
  No other artifact form is permitted. This list is closed here and is
  parameterized by no external document.
- **P5 — Compare and verify.** Compare staged bytes against declared inputs
  and against other staged bytes; recompute counts, digests, and closures;
  determine equality or difference.
- **P6 — Report.** Write deterministic reports, logs, and manifests into
  staging custody. Report metadata may carry a timestamp; artifact bytes
  may not.
- **P7 — Signal outcome.** Exit with a process status that reflects the
  verification outcome truthfully.
- **P8 — Manage own outputs.** Overwrite or delete, within staging custody,
  only bytes that this same run wrote. Cross-run overwrite and deletion are
  refused, and evidence and report files are never overwritten or deleted
  by any staging tool.

## 4. Refusals (closed list)

- **R1 — No write outside staging custody.** No file, directory, link,
  attribute, or metadata changes on any canonical surface or anywhere else
  outside staging custody, judged after full path resolution (B6).
- **R2 — No network.** No socket, no name resolution, no request, no
  listener, in any direction — including any package resolver that can
  fetch.
- **R3 — No provider call.** No model, provider, or external service
  invocation of any kind.
- **R4 — No installation.** No runtime, service, daemon, timer, scheduled
  job, package, dependency, or toolchain component is installed, upgraded,
  or removed, in the repository or on the host.
- **R5 — No canonical-store effect.** No creation, mutation, or deletion of
  the canonical registry, lock, ratification baselines, or generated
  constitution at their canonical paths, and no write anywhere in the
  resolved git directory; `pnh/contracts/ratification-baselines/age-v1.json`
  is never created at its canonical path. Prospective forms of these
  artifacts exist only inside staging custody under P4 and are never
  canonical.
- **R6 — No status assignment.** No law status and no proof status is
  assigned, changed, or discharged beyond the P4(a)–(c) fixed content,
  which includes the closed 43-transition set of P4(b) applied to
  prospective rows only.
- **R7 — No execution of staged or input bytes.** Staged artifact bytes and
  declared-input bytes are never executed, evaluated, imported, or loaded
  as code. No toolchain entry point — `node <path>`, `tsx`, dynamic
  `import()`, `require()`, `module.register`, `--import` or `--require`
  preloads, or `vm` evaluation — is invoked on any staging-custody path or
  on declared-input content, regardless of stated intent, with exactly one
  carve-out: the section 6 enforcement layer launching a run's declared
  entry point, and the E2 verifier's mandated re-run of that same entry
  point. The only module code a run executes is its own declared source
  closure (input class 5, every module class 4 workstream source text),
  and its only launcher is the enforcement layer.
- **R8 — No git effect.** No commit, push, tag, branch, stash, config,
  hook, index, or ref change is initiated by a staging tool, including any
  direct filesystem write to any resolved git directory — `.git`, or the
  target of a `.git` worktree or gitlink pointer file, wherever it
  physically resides.
- **R9 — No public claim.** No write to any public surface; no availability
  statement in any output.
- **R10 — No environment mutation.** No change to environment variables
  beyond the tool's own process, no shell-profile, global-config, or
  host-state change.
- **R11 — No credential access.** No read of `~/.dev-secrets.env`, any
  secret store, keychain, token file, or credential material of any kind.
- **R12 — No nondeterminism.** No input beyond section 2 and no
  nondeterminism of any kind, not limited to randomness: no read of
  environment variables beyond the fixed allowlist the enforcement layer
  sets, and no dependence on hostname, process id, user identity, locale,
  timezone, network identity, filesystem metadata not fixed by a declared
  input's digest, or directory-iteration order. Wall-clock time appears
  only in report metadata under P6.
- **R13 — No input-derived command construction.** No declared-input
  content is passed to a shell, to `exec`, or to any `spawn` with
  `shell: true`, and no command or flag string is built by concatenating or
  interpolating input-derived text. Subprocess invocation, where section 1
  permits it at all, uses a fixed argv array of literals and
  digest-verified paths.
- **R14 — No canonical-code execution with write reach.** No staging tool
  executes, imports, or spawns canonical-surface code that can write
  outside staging custody. Prospective generation is performed by
  staging-custody source; a canonical-surface module may be exercised only
  inside Gate A1 tests run under the section 6 enforcement layer with every
  write outside staging custody denied.

## 5. Boundedness duties

- **B1 — Termination.** Every run terminates; a run that cannot make
  progress stops with a failure status rather than waiting.
- **B2 — Determinism.** Given equal declared inputs, artifact bytes are
  byte-identical across runs. Reports may differ only in metadata fields
  declared as metadata.
- **B3 — Declared inputs.** The run's evidence records every declared input
  as path (or git object id) plus exact digest before the run reads it.
- **B4 — Recorded outputs.** The run's evidence records every written path
  plus exact digest after the run writes it.
- **B5 — Recorded identity.** The run's evidence records the tool's source
  closure (entry point and every imported module, each with path and
  digest), the Node.js runtime version, the resolved version of every
  `node_modules` package the run loads, and the exact enforcement-layer
  invocation used.
- **B6 — Resolved containment.** Every path is fully resolved — symbolic
  links, hard links, `..` segments, case folding, mount indirection —
  before any read, write, overwrite, or delete. A resolved path outside
  staging custody (for reads: outside the declared inputs) is a refusal,
  and the run stops with a failure status.

## 6. Independent enforcement

No confinement duty in this contract rests on the staging tool's own
self-report:

- **E1 — Enforcement layer.** Every staging tool run executes under an
  enforcement layer that denies by default and does not trust the tool: the
  installed Node.js runtime's permission model, invoked with read allowance
  limited to the run's declared inputs plus its own source closure, write
  allowance limited to the run's staging-custody locations, no network
  allowance ever, and child-process allowance only for the offline
  read-only `git` and `tsc --noEmit` invocations the run's declared plan
  names — or a host operating-system sandbox with the same deny-by-default
  posture. The exact invocation is recorded in evidence (B5).
- **E2 — Independent verification.** After every run, a verifier process
  that is not the tool and shares none of its source closure re-walks the
  run's staging-custody locations, re-hashes every byte, compares the
  actual filesystem delta against the run's B3/B4 record, checks B6
  resolved containment for every recorded path, re-runs the tool in a
  scrubbed environment (empty beyond the fixed allowlist) and diffs
  artifact bytes against the first run's, and records `PASS` or `FAIL`
  with its own identity digest. The verifier's own enforcement invocation
  additionally permits spawning the installed `node` binary on the audited
  run's declared entry point, and nothing else. The verifier's re-walk
  enumerates the run's staging-custody locations directly; that enumeration
  is E2's own audit act and requires no input-class declaration. Evidence
  without a verifier `PASS` is not evidence.
- **E3 — Chained trust.** A staging-custody byte sequence is declarable as
  an input (section 2, class 3) only with its writing run's verifier
  `PASS`; a `FAIL` or missing verification poisons every byte the run
  wrote.
- **E4 — Bootstrap identity.** The enforcement layer and the verifier are
  themselves Gate A1 build scope, authored as workstream source text under
  this contract, and no staging tool run precedes their existence. Before
  the first staging tool run: both source closures are digest-recorded in
  committed Gate A1 evidence, and an independent review pass over exactly
  those committed sources is recorded the same way. Every E1 invocation
  record and every E2 record carries the enforcement layer's and the
  verifier's identity digests; a record whose identity digest differs from
  the committed one validates nothing. A verifier run is bound by this
  committed identity and its recorded inputs and outputs; verification
  does not recurse to a second verifier.

## 7. Evidence

Gate A1 evidence must make every staging tool run reproducible from the
record alone: tool identity and toolchain versions (B5), declared inputs
(B3), outputs (B4), exit status (P7), the staging-custody locations used
(including each run-scoped temporary directory), the enforcement-layer
invocation (E1), and the verifier record (E2). Evidence lives in staging
custody until the program's own commit discipline records it.

## 8. Violation

A run that breaches any refusal, exceeds the permitted capabilities, or
fails a boundedness duty is invalid: every byte it wrote is invalid staged
material, must not be a declared input of any later run, and requires fresh
review before any replacement is produced. Detection is the E2 verifier's
duty, never the violating tool's own report. A violation that touched a
canonical surface additionally reopens Gate A0R: the staging-authority gate
is invalidated and a new gate is required.

## 9. Non-authority boundary

This contract grants no authority by existing. It is the closed boundary
for tools that the ratification-staging amendment's section 4 activates, and
it has effect only while that amendment has effect. It is not a contract
revision of AGE-1 through AGE-5, not a law change, not a proof, and not an
implementation plan.
