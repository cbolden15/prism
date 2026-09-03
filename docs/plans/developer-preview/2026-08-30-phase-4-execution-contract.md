# Prism Phase 4 execution contract

- Date: 2026-08-30
- Status: completed at reviewed source `6c5e478371f643eeb94c5021e6f712f8e20926bd`
- Workstream: `20260830-prism-phase-4-plugin-authoring-7354d1`
- Branch: `feat/phase-4-plugin-authoring`
- Phase 4 baseline: `fb8e0afd67a525ce6138afb37322fcfdb8f78b86`
- Phase 3 reviewed source: `4e372bc0f391f8c2669b796f5349a9d46156ffec`

This contract governs Phase 4 only. The reviewed developer-preview plan remains
the product source. This document narrows its plugin-authoring phase into one
autonomous, testable milestone.

## Rendered phase task

Objective: Complete Prism Phase 4 only: add `prism plugin create` and `prism plugin check` for one understandable tool-plugin scaffold, with a shared SDK authoring contract, a dedicated Prism-managed authoring root backed by a CLI-private native capability operation, bounded subprocess validation, and packed-install acceptance, while preserving all Phase 3 package, compatibility, persistence, and provider boundaries.

Source of truth and precedence: Runtime and user authority, current Git state, `AGENTS.md` and `CLAUDE.md`, this Phase 4 execution contract, Phase 4 of the reviewed developer-preview implementation plan, then the completed Phase 3 handoff. Stop and report any material conflict.

Allowed write scope: `packages/sdk/**` only for the already frozen authoring contracts and tests; coordinator-assigned plugin-create, native capability, and focused tests under `packages/cli/**`; coordinator-owned CLI integration, native prebuild manifest and build recipes, package manifests, lockfile, root scripts, packed-install tests, compatibility checks, active claims, gotcha registry, and this Phase 4 workstream. Runtime and provider product source are out of scope.

Verification: Activate and assert Node 26.8.1 and npm 11.19.0; freeze the amended managed-root, native-loader, filesystem, CLI-output, cleanup, and packed-install behavior in failing tests before implementation; pass focused SDK and CLI tests; build and verify every declared native prebuild target; then pass `npm ci`, `npm run build`, `npm test`, and `npm run pack:check`; receive independent `READY` review of the exact committed source.

Stop condition: Stop successfully only when every Phase 4 criterion passes, the exact reviewed source is committed locally, the worktree is clean, and the Phase 4 handoff is updated. Stop before Phase 5 release documentation, non-tool scaffolds, registry or installer features, signing, publication, remote creation, push, deployment, Runtime changes, provider changes, or any sandbox claim.

Sensitive-data policy: Never persist or echo child-process environment values, raw child stdout or stderr, imported plugin source, fixture input or output, credentials, private paths, repository contents, or provider data in run records, review artifacts, or handoffs. Generated scaffold content is public template material. Child diagnostics use stable bounded error codes. The checker must state that the subprocess has ambient host authority and is not a sandbox.

Output contract: Report the final local source and closure commits, exact verification commands and results, independent review verdict, generated scaffold files and contract version, subprocess-boundary evidence, packed-install acceptance, changed files, remaining caveats, updated handoff, clean Git status, and the single next Phase 5 action. Do not push or publish.

Read relevant sources first. Work in small steps. Keep edits within scope. Report evidence, blockers, and next action. Stop on authority conflict, missing verification, scope conflict, or the stated stop condition.

## Required reading

Read these sources completely before changing product code:

1. `AGENTS.md` and `CLAUDE.md`.
2. This contract and the Phase 4 `STATE.md`, `HANDOFF.md`, and `DECISIONS.md`.
3. Phase 4 and the test matrix in
   `2026-08-29-developer-preview-implementation-plan.md`.
4. The completed Phase 3 handoff and decision log.
5. The current SDK manifest, registration, tool, and JSON contracts.
6. The CLI dispatcher and parser tests, Runtime plugin-session behavior,
   subprocess fixtures, package graph check, and packed-install test.

Use CodeGraph for narrow symbol and dependency queries. Current Git state is
authoritative when its local index is stale. CodeGraph itself runs under Node 22
because of its upstream Node 25+ WASM issue; it is not a Prism verification gate.

## Environment preflight

The shell may start on an unsupported Node version. Before installation,
generation, tests, or commits, activate and assert the repository pin:

```sh
NODE_VERSION="$(tr -d '\n' < .node-version)"
export PATH="$HOME/.nvm/versions/node/v${NODE_VERSION}/bin:$PATH"
test "$(node --version)" = "v${NODE_VERSION}"
test "$(npm --version)" = "11.19.0"
```

Do not continue after either assertion fails. Do not rewrite historical Node
pins in dated records.

Phase 4 has no live-model gate. Do not start Ollama, pull a model, or rerun the
Phase 3 live fixture. Deterministic compatibility, HTTP-stub behavior, and the
recorded Phase 3 live evidence must remain unchanged.

## Owner amendment: managed authoring roots

The owner selected the full managed-root and native-capability architecture on
2026-08-30 after three independent reviews showed that pathname checks cannot
satisfy the original create and rollback promises under concurrent namespace
mutation.

This amendment supersedes only the original `plugin create` destination model
and its pathname-based implementation strategy. The SDK authoring contract,
four generated plugin files, `plugin check`, subprocess boundary, package
boundaries, fixed content bounds, packed-install gate, and Phase 4 stop
condition remain frozen.

The amended authority model is:

1. `--directory` names a dedicated Prism-managed authoring root. It no longer
   names an arbitrary existing parent. Without the option, the root is
   `<cwd>/prism-plugins`.
2. A requested root is either absent or already managed. An absent root is
   initialized and published atomically with the first complete plugin. An
   existing root must be owned by the effective user, have mode `0700`, contain
   the exact `.prism-authoring-root-v1` marker, and be opened without following
   symlinks. Existing unmarked directories are rejected.
3. Authorization attaches to the opened root identity, not to a pathname
   string. A parent-path rename cannot redirect descriptor-relative writes.
   Any identity mismatch before success fails closed as `root-changed`.
4. The immediate namespace of a managed root has one writer: the native create
   operation. Prism processes take a nonblocking exclusive lock on the opened
   root. Users and other tools must not add, remove, rename, or replace root
   entries while create is running. The lock coordinates Prism writers; it is
   not a security boundary against a hostile process running as the same OS
   user.
5. The CLI loads one high-level Node-API operation. That operation opens path
   components and creates, reads, renames, and removes entries relative to held
   directory descriptors. It stages a complete plugin and installs it with an
   atomic no-replace rename. JavaScript receives no general filesystem
   capability API.
6. Native code may use `openat`, `mkdirat`, `fstatat`, `unlinkat`, and the
   platform no-replace rename (`renameat2` with `RENAME_NOREPLACE` on Linux;
   `renameatx_np` with `RENAME_EXCL` on macOS). Cleanup is limited to a private
   staging identity created by that invocation while it owns the root lock.
7. The CLI package contains prebuilt Node-API binaries for `darwin-arm64`,
   `darwin-x64`, `linux-arm64-gnu`, `linux-x64-gnu`, `linux-arm64-musl`, and
   `linux-x64-musl`. Install and command execution must not compile native code,
   invoke a package install script, access a registry, or use the network.
   Unsupported targets and prebuild-integrity mismatches fail closed.
   macOS binaries target 13.5 or later, GNU/Linux binaries target glibc 2.28 or
   later, and musl remains an exercised compatibility target with the same
   experimental platform status as upstream Node.js.

The managed-root marker is CLI metadata, not generated plugin content. The
plugin directory still contains exactly the four frozen scaffold files. Packed
acceptance must prove that the expected marker and plugin are the only changes
inside a newly initialized authoring root and that paths outside that root stay
byte-identical.

## First action

Before implementation, freeze shared contracts and failing tests for:

- plugin ID grammar and `--directory` destination semantics;
- exact generated files and byte-identical scaffold output;
- manifest and authoring-fixture validation at every numerical boundary;
- existing, symlinked, changed, and out-of-scope filesystem paths;
- registration mismatch, malformed fixture, timeout, output pressure, abnormal
  exit, and cleanup uncertainty;
- human and JSON output, exit codes, warning placement, and redaction; and
- packed creation, generated tests, checking, manifest rejection, checkout
  isolation, and proof that no path outside the scaffold changed.

Do not dispatch implementation until the coordinator has frozen the public SDK
authoring contract, fixture protocol, bounds, error classes, and CLI outputs.

## Required deliverables

### SDK authoring surface

- Add one explicit `@prism-harness/sdk/authoring` export. Keep it pure: no
  filesystem, process, environment, network, Runtime, CLI, or provider imports.
- Reuse one manifest normalizer. Do not create a second manifest grammar. If the
  current pure normalization logic must move out of the Node registry generator,
  preserve its existing registry behavior and public export compatibility.
- Keep `packages/sdk/src/protocol.ts` byte-identical. Phase 4 adds no wire
  protocol amendment.
- Export a deterministic helper that accepts one existing SDK plugin ID and
  returns the complete scaffold as a sorted, deeply frozen file map.
- Export a strict `prism-tool-authoring-fixture-v1` validator with exactly
  `version`, `operation`, `input`, and `expected` fields. The operation uses the
  SDK slug grammar. Input and expected output are normalized SDK JSON values.
- Test malformed objects, accessors, prototypes, unknown fields, unsupported
  versions, unsorted or duplicate output paths, JSON depth and size, and
  post-validation mutation.

### Generated tool scaffold

`plugin create` generates exactly these files beneath the new destination:

```text
manifest.json
index.mjs
index.test.mjs
README.md
```

The generated bytes are deterministic for a given plugin ID. The scaffold:

- uses the existing lowercase plugin ID grammar
  `[a-z0-9][a-z0-9-]{0,63}`; scoped npm names, slashes, uppercase characters,
  dots, underscores, and traversal forms are outside Phase 4;
- declares one version `1.0.0` tool manifest with the current kernel API,
  `index.mjs` as its entrypoint, the other generated files in its closed source
  list, no plugin dependencies, the existing `tool-operation` capability, and a
  generic MIT authoring license record;
- exports the normal plugin `handle` function plus one validated
  `prismToolAuthoringFixture` value;
- registers one `echo` operation and runs that operation with the fixture's
  bounded input and expected output; and
- includes a Node built-in test and a short README with the exact test and check
  commands plus the ambient-authority warning.

Do not generate `package.json`, a lockfile, dependencies, build tooling, CI,
editor files, credentials, registry metadata, signing material, or publication
configuration.

### `plugin create`

- Support only:

  ```text
  prism plugin create <name> [--directory <path>]
  ```

- Treat `--directory` as the managed authoring-root path. The destination is
  `<root>/<name>`. Without the option, the root is `<cwd>/prism-plugins`.
- Require every existing path component to be a real directory opened without
  following symlinks. Permit the final root component only when it is absent or
  is a valid managed root. Reject an existing unmarked path, the wrong owner or
  mode, an invalid marker, non-directory components, and identity changes.
- Initialize an absent root in one private staging directory containing the
  exact marker and complete first plugin, then publish the root with an atomic
  no-replace rename. Never claim or retrofit an arbitrary existing directory.
- For an existing managed root, take a nonblocking exclusive root lock, create
  the complete plugin in a private staging directory through descriptor-relative
  operations, and atomically rename it to `<name>` without replacement.
- Refuse a destination that already exists as any file type, including a
  symlink. Add no overwrite, force, merge, update, or interactive mode.
- On failure, remove only the invocation's still-identical private staging
  entries while the root lock is held. Never recursively remove an existing
  destination, a published plugin, or an identity-changed entry.
- Write only the managed-root marker and the requested four-file scaffold. Do
  not change process-wide current directory, HOME, XDG state, config, trust, or
  run records.
- Return 0 with one bounded human success message. Usage failures return 2.
  Creation failures return 1, keep stdout empty, and use stable redacted error
  classes.

Create failures use this closed vocabulary:

```text
root-parent-missing
root-parent-not-directory
root-parent-symlink
root-unmanaged
root-invalid
root-busy
root-changed
destination-exists
native-unavailable
native-integrity
create-failed
cleanup-failed
```

### `plugin check`

- Support only:

  ```text
  prism plugin check <path> [--json]
  ```

- Treat the path as one plugin directory. Reject symlinked path components,
  symlinked entries, non-directories, changed identities, invalid UTF-8,
  malformed JSON, manifest/source-tree mismatch, undeclared files, unsupported
  plugin kinds, and a directory basename that differs from the manifest ID.
- Validate the manifest and complete source tree before spawning or importing
  code. A static failure must make zero child-process calls.
- Run one dedicated CLI-owned evaluator child. The evaluator owns the final
  completion descriptor and must not import plugin code. It starts one
  subordinate plugin worker without inheriting that descriptor. Do not create
  an admission ticket, alter the owner-pinned registry, or describe a successful
  authoring check as installation, trust, authorization, or Runtime admission.
- Start the evaluator and worker in one original process group with the plugin
  root as their working directory, a closed environment allowlist, an isolated
  temporary HOME, bounded stdout and stderr, bounded one-frame channels, and one
  wall-clock deadline.
- In the worker, import only the declared entrypoint, validate the exported
  fixture, call registration, run the fixture operation, and return one bounded
  observation carrying an evaluator nonce delivered through a one-way descriptor
  that is closed before import. Treat that observation as plugin-controlled data.
  In the evaluator, independently validate the nonce, fixture, registration,
  matching tool ID, operation, normalized result, and expected value before
  writing final success.
- Treat console output, malformed or duplicate IPC, registration drift, fixture
  mismatch, timeout, output overflow, signal, nonzero exit, or cleanup
  uncertainty as failure. Never echo raw plugin output or stack traces.
- Ensure the child and its original process group are absent on every path. A
  successful child must exit cleanly; every timeout or failure terminates the
  group. Report uncertainty as `cleanup-failed`. Do not claim control over a
  deliberately detached or re-parented hostile descendant.
- Immediately before code execution, write one warning to stderr that the plugin
  runs with ambient host authority and is not sandboxed. JSON mode still emits
  exactly one JSON value on stdout.
- Human success reports plugin ID, fixture operation, ambient-subprocess
  boundary, and confirmed cleanup. JSON success uses a closed versioned shape
  with `sandboxed: false` and contains no absolute path or raw fixture values.

Passing `plugin check` proves only this closed authoring contract and fixture. It
does not prove safety, grant capabilities, pin the plugin, install it, or make it
available to `prism run`.

### CLI and packed-install integration

- Extend the existing dispatcher with a closed `plugin create|check` command
  family. Preserve all current command grammar, exit codes, stdout/stderr rules,
  `--` behavior, and unknown-option rejection.
- Keep filesystem creation and child-process authority CLI-owned. SDK remains
  pure, Runtime remains unchanged, and providers remain unchanged.
- Add package export and consumer assertions for the SDK authoring surface. Keep
  the package graph and source-closure checks authoritative.
- Extend packed acceptance to install the same four Phase 3 tarballs outside the
  checkout, run existing deterministic and stubbed Ollama flows, scaffold one
  tool, run `node --test index.test.mjs`, and pass installed
  `prism plugin check` from a second working directory.
- Audit the installed native addon resolution, verify its digest before load,
  and prove the installed command has no compiler, install-script, registry, or
  network dependency. All declared prebuilds and their source-digest manifest
  must be present in the CLI tarball.
- Mutate `apiVersion` in the packed manifest and prove deterministic rejection
  before child execution. Preserve and compare a sentinel outside the scaffold,
  compare the managed-root marker and every generated file before and after the
  successful check, and reject any unexpected root entry.
- Continue auditing every installed module resolution. The generated plugin and
  checker must not resolve a module from this checkout or require registry,
  network, Docker, Rust, Firecracker, Ollama, Codex login, or credentials.

## Fixed bounds

Freeze these defaults in the SDK or CLI owner named above and test each at its
boundary and one unit beyond:

| Bound | Value |
| --- | ---: |
| Plugin ID UTF-8 bytes | 64 |
| Manifest bytes | 65,536 |
| Manifest-declared files, excluding `manifest.json` | 16 |
| One scaffold file | 262,144 bytes |
| Complete scaffold | 1,000,000 bytes |
| Fixture input JSON | 65,536 bytes |
| Fixture expected/result JSON | 65,536 bytes |
| Child stdout | 65,536 bytes |
| Child stderr | 65,536 bytes |
| Evaluator result bytes/messages | 65,536 / 1 |
| Plugin-worker observation bytes/messages | 262,144 / 1 |
| Child execution deadline | 5,000 ms |
| Grace before forced process-group kill | 2,000 ms |

Generated defaults stay far below these ceilings. A bound is not permission to
persist or display the corresponding content.

The CLI additionally freezes the default authoring-root basename
`prism-plugins`, marker basename `.prism-authoring-root-v1`, marker bytes
`prism-managed-authoring-root-v1\n`, root mode `0700`, marker mode `0600`,
scaffold file mode `0644`, and staging grammar
`.prism-authoring-stage-v1-<32 lowercase hex digits>`. Native root paths are
bounded to 4,096 UTF-8 bytes. The supported target map and every prebuild digest
are closed. Tests cover every native string and byte length at its boundary and
one unit beyond. Native code must reject unknown object fields, embedded NUL
bytes, separators in entry names, unsupported targets, and any scaffold map
other than the four SDK-owned entries.

## Architecture invariants

1. SDK imports no Prism package. Its authoring helper is pure and deterministic.
2. CLI owns the managed authoring root, native capability operation, scaffold
   writes, path admission, child execution, warnings, and authoring-check output.
3. Runtime and provider source do not change in Phase 4.
4. The pinned SDK protocol source, deterministic coordinator, Phase 3 run paths,
   config, trust, run records, and Ollama behavior remain compatible.
5. Native create code exposes one high-level operation and no reusable arbitrary
   path primitive. Every mutation is relative to a held root or staging
   descriptor, and final publication is atomic and no-replace.
6. Native prebuilds are source-traceable, digest-pinned package assets. Loading
   fails closed before native execution when the current target is unsupported
   or the selected asset digest differs.
   The in-package digest is a consistency check, not a signature or independent
   trust anchor; package signing and publication provenance remain outside
   Phase 4.
7. CLI checker code does not modify the checked plugin. Its only filesystem write
   is one isolated temporary HOME that it removes. Imported plugin code retains
   ambient host authority, so the general command cannot promise that arbitrary
   plugin code writes nowhere. Packed acceptance proves the generated fixture
   leaves its scaffold and an outside sentinel byte-identical.
8. The evaluator's final result descriptor is never inherited by imported plugin
   code. Worker observations are untrusted and independently validated before the
   evaluator reports success.
9. An authoring check is not production admission and is never called a sandbox.
10. Generated files are deterministic, closed, bounded, and understandable
   without a build step or dependency install.

## Coordinator and worker DAG

Use the GPT-5.6 Sol Max root session as the sole coordinator:

```text
freeze managed-root/native contract and amended failing tests
          |
          +-- native capability operation and prebuilds
          +-- managed-root plugin-create path
                         |
CLI/package/packed integration -> independent review -> full gates -> local commit
```

The coordinator owns:

- public SDK export names, fixture shape, bounds, and shared error classes;
- managed-root semantics, native API shape, target matrix, and prebuild manifest;
- existing CLI dispatcher and process entrypoint integration;
- package manifests, TypeScript references, package graph, and lockfile;
- packed-install orchestration, compatibility checks, claims, and gotchas; and
- every integration decision, fix, commit, workstream update, and handoff.

The original implementation and review waves consumed six child lineages. The
amended wave may use at most two implementation workers with disjoint scopes,
reserving three lineages for exact-source review and one for a bounded retry:

| Worker | Model tier | Write scope | Must not edit |
| --- | --- | --- | --- |
| Native capability | GPT-5.6 Terra | coordinator-assigned `packages/cli/native/**`, runtime prebuild assets, and focused native tests | SDK, TypeScript create/check modules, Runtime, providers, root manifests, lockfile |
| Managed-root create | GPT-5.6 Terra | `packages/cli/src/commands/plugin-create.ts`, its CLI-private loader, and dedicated create tests | SDK, check modules, Runtime, providers, root manifests, lockfile, packed test |

Use GPT-5.6 Luna only for bounded read-only mapping or mechanical lookups. Every
dispatch names its model, objective, source of truth, write scope, verification,
stop condition, and output contract. Workers do not commit. The coordinator
reviews and integrates every result.

Use one milestone ledger. Permit no more than three active children and twelve
total children, including reviewers and retries. Two identical failures end that
strategy. Do not make a third identical attempt. When budget is tight, label an
omitted optional review instead of silently truncating implementation work.

## Review gate

After integration and focused tests, dispatch independent read-only reviews for:

1. SDK authoring shape, manifest reuse, determinism, bounds, export-map closure,
   and protocol compatibility.
2. Managed-root identity and ownership, native descriptor use, symlink and race
   behavior, atomic no-replace publication, exclusive-root locking, cleanup,
   prebuild provenance, loader integrity, target coverage, and proof that no
   unauthorized path changes.
3. Child-process authority, environment redaction, time/output bounds, IPC,
   process-group cleanup, CLI contracts, and packed-install isolation.

The coordinator reproduces every finding against the exact source, fixes all
confirmed P0, P1, and P2 findings, reruns affected tests, and obtains final
`READY` verdicts with no missing Phase 4 criterion. Reviewers never edit files.

## Verification and completion

The exact final source must pass under Node 26.8.1 and npm 11.19.0:

```sh
npm ci
npm run build
npm test
npm run pack:check
```

Before those clean gates, regenerate the six declared prebuilds from the exact
native source and run the native target-matrix check. The matrix must load and
exercise each Linux glibc/musl x64/arm64 binary in its matching container and
each macOS arm64/x64 binary on matching Node 26.8.1 architecture. If the host
cannot execute a declared target, record that as a Phase 4 blocker rather than
claiming support from file inspection alone. Normal package installation and
`plugin create` execution remain compiler-, Docker-, registry-, and
network-independent.

The packed gate is incomplete if any installed or generated module resolves into
this checkout, if any path outside the scaffold changes, if invalid manifest
bytes reach child execution, or if checking requires a network, daemon, account,
credential, model, Docker, Rust, or Firecracker.

Phase 4 is complete only when:

- every deliverable and fixed-bound test above passes;
- every declared native prebuild is rebuilt from the committed source,
  digest-pinned, packaged, and exercised on its matching target;
- the generated test and installed `plugin check` pass outside the checkout;
- one manifest mutation rejects before child execution;
- deterministic, Ollama-stub, Codex compatibility, package graph, source closure,
  and public-claim checks remain green;
- the SDK protocol source and Phase 3 deterministic output remain byte-identical;
- independent review returns `READY`;
- the exact reviewed source is committed locally;
- `git status --short` is empty; and
- the Phase 4 handoff records the commit, evidence, caveats, and Phase 5 as the
  only next milestone.

Do not add provider, policy, memory, or renderer scaffolds; plugin discovery,
search, install, update, registry, signing, trust, or publication; release docs;
Runtime or provider behavior; scheduling, resume, memory, multi-agent product
features; write-capable agent tools; Firecracker expansion; remote creation;
push; deployment; or npm publication during Phase 4.
