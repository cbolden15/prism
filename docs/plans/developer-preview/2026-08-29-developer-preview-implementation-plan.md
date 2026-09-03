# Prism developer-preview implementation plan

- Plan date: 2026-08-29
- Drafted from handoff: 2026-08-30
- Status: reviewed; actionable findings resolved; ready for Phase 1A
- Milestone: standalone installable developer preview
- Source of truth: `docs/ai/workstreams/20260829-prism-developer-preview-2c50d2/HANDOFF.md`
- Product direction: `docs/plans/provider-neutral-harness/2026-08-29-prism-harness-oss-mvp-reset.md`

## Outcome

A developer can install packed Prism packages outside this repository, initialize
a project, run a bounded deterministic or Ollama-backed agent, inspect the saved
run, and scaffold and validate a tool plugin. Firecracker remains an optional
assurance package and never appears on the install or first-run path.

The existing opt-in Codex example is preserved as a sibling provider package and
compatibility command. It is not added to the supported first-run CLI routes and
does not become a release blocker. Firecracker stays in its current tree as an
optional assurance profile; creating its eventual package is deferred.

This plan preserves the current deterministic demo as a compatibility contract.
The existing command must continue to emit byte-identical JSON:

```sh
npm run --silent prism:demo -- 'Count the words in: one two three'
```

The developer preview is not complete until packed tarballs pass the release gate
in a temporary directory outside the checkout. Passing source-tree tests alone is
not enough.

## Current baseline

The starting point is `main` at `23a51dabacd38d405c6e8f3bd0f16902daed23a3`.
The root is one private package. It has no workspaces, supported `bin`, package
exports, installer, CLI-owned run store, Ollama adapter, or plugin authoring
commands. The implementation remains under `pnh/`.

The existing deterministic path is already protected by
`pnh/host-tests/prism-demo.test.ts`. It checks exact output across two shell runs,
the four required failure classes, and cleanup receipts for all subprocesses. On
2026-08-30 that test passed 8 of 8 under Node.js 26.8.1 and npm 11.19.0 after a
clean `npm ci`.

## Scope

This milestone includes:

1. Public Runtime, SDK, CLI, and Ollama provider package boundaries, plus a
   compatibility package for the existing Codex adapter.
2. Supported `init`, `doctor`, `run`, `inspect`, `plugin create`, and
   `plugin check` commands.
3. A deterministic no-account path and a direct Ollama path.
4. One bounded, read-only repository tool for listing, reading, and searching
   files below an admitted workspace root.
5. Quickstart-first documentation and packed-install acceptance tests.

It excludes durable resume, scheduling, background work, multi-agent delegation,
memory, write-capable repository tools, a model gateway, and new provider routes
beyond deterministic and Ollama. The Codex adapter is moved and kept green, but
is not wired into `prism run`. The preview supports macOS and Linux because the
current subprocess lifecycle and restrictive file-mode checks are POSIX-specific.
Native Windows and WSL remain unverified follow-ons. No package is published and
no remote is created or pushed by this plan.

## Architecture decision

### Selected: physical workspaces with compiled package boundaries

Use an npm workspace and move source into the package that owns it. Each public
package emits JavaScript and declarations into its own `dist/`, declares only
public sibling dependencies, and can be packed and installed without access to
the repository. No published file may import `pnh/` or reach across a sibling
package by relative path.

This is the proper package architecture. It costs more than wrapping the current
tree, but it makes dependency direction enforceable and makes tarball tests
meaningful.

### Transitional wrapper package

A workspace package could re-export files from `pnh/` or bundle the whole tree.
That would produce a fast source-tree demo, but a tarball would either miss files
outside its package root or hide package-boundary violations inside a bundle. It
is allowed only for the first source-level CLI checkpoint while the package stays
`private: true`. It is never a release artifact.

### Root monolith with a `bin`

The current root package could expose `prism` and continue shipping all of
`pnh/`. This is the smallest edit, but it abandons the adopted Runtime and SDK
boundaries and makes later extraction a breaking change. Do not use it.

## Dependency direction

In this diagram, `A -> B` means package A imports package B:

```text
runtime --------------------------> sdk
provider-ollama ------------------> sdk
provider-codex -------------------> sdk
cli ------------------------------> runtime + sdk + provider-ollama
future assurance-firecracker -----> runtime + sdk
```

The exact rules are:

- SDK imports no Prism package and no runtime implementation.
- Runtime may import SDK. Runtime does not import CLI, a provider package, or
  Firecracker assurance.
- Provider packages import SDK contracts only. They do not import Runtime
  internals.
- CLI composes Runtime, SDK, bundled deterministic fixtures, provider packages,
  configuration, and the local run store.
- A future Firecracker assurance package may adapt Runtime and SDK contracts.
  Runtime does not know that Firecracker exists.
- Cross-package relative imports are rejected even when they happen to resolve
  inside the monorepo.

Add a package-graph check to the normal test suite. Keep the existing closed-core
check during migration, then retarget it from `pnh/core/` to the final Runtime
core directory in the same commit that moves the last core source file.

## Target tree and source ownership

| Target | Owns | Initial source move |
|---|---|---|
| `packages/sdk/` | Provider, tool, policy, manifest, registration, protocol, validation, and authoring contracts | `pnh/sdk/` plus the public contract portions extracted from registry generation |
| `packages/runtime/` | Bounded loop, policy admission, tool execution, event trace, stopping, cleanup, and plugin execution ports | `pnh/runtime/`, `pnh/kernel/`, the runtime parts of `pnh/harness/`, and required assets |
| `packages/cli/` | `prism` binary, command parsing, config resolution, deterministic profile, run store, inspection, and plugin commands | `pnh/examples/prism-demo.ts`, its three local plugin fixtures, and new CLI code |
| `packages/provider-ollama/` | Direct Ollama HTTP adapter and diagnostics | New source |
| `packages/provider-codex/` | Existing opt-in Codex CLI adapter | `pnh/examples/codex-chatgpt.ts` and its provider fixture |
| `packages/runtime/src/core/` | Closed pure security kernel used by Runtime internals | All of `pnh/core/`; retarget the closure checker in the same commit |
| `packages/sdk/src/manifest/` | Registry schema and pure manifest validation | `pnh/registry/schema.ts` |
| `packages/sdk/src/protocol/` | Wire bounds shared by SDK protocol and Runtime executors | `pnh/contracts/resource-bounds.mjs` and its declaration, converted to one TypeScript source |
| `packages/runtime/src/adapters/` | Product execution adapters | `pnh/adapters/docker-broker-plugin-container.ts`; move `memory-ledger.ts` to Runtime test support because durable replay is outside this milestone |
| `packages/cli/assets/deterministic/` | Owner-pinned deterministic plugin set | `pnh/contracts/plugin-pins.json` and the local scripted provider, policy, and text tool fixtures |
| `assurance/constitution/` | Root-private proof, transition, claim, and ratification tooling | Remaining `pnh/contracts/` sources and data; these continue to resolve `docs/plans/provider-neutral-harness/` |
| Split `pnh/scripts/` | Package graph checks, SDK manifest generation, Runtime artifact commitments, and root-private assurance generation | Assign each script before its importers move; no published package imports a root script |
| `tests/compat/` | Legacy command and public-claim compatibility checks | Current demo shell acceptance and claims checks |

Use `git mv` for physical moves. Do not leave two editable copies. Temporary
forwarders are permitted only when a constitution or compatibility check still
needs the old import path, and each forwarder must have a deletion checkpoint in
the same phase. Dated design records are not rewritten to match the new layout.
Active manifests, checks, README paths, and current documentation are updated.

`pnh/x1-firecracker/` remains in place. B4 means the existing qualified
Firecracker assurance gate. This milestone documents it as optional and keeps its
checks green, but does not turn the Rust/Cargo tree into an npm package.

Before Phase 1B edits, write a mechanical source-closure manifest that lists every
file under `pnh/core/`, `pnh/contracts/`, `pnh/registry/`, `pnh/adapters/`, and
`pnh/scripts/` with exactly one destination above. Phase 1B cannot finish while
any published package resolves back into one of those directories.

## Public exports

Start with the smallest supported surfaces:

| Package | Initial exports |
|---|---|
| SDK | `.` for stable contract types and validators; explicit `./provider`, `./tool`, `./policy`, and `./manifest` subpaths |
| Runtime | `.` for `runAgent`, bounded-run input/result types, events, limits, and composition ports |
| CLI | `bin.prism = ./dist/bin.js`; no supported library API |
| Ollama provider | `.` for `createOllamaProvider` and its options type |
| Codex provider | `.` for `createCodexProvider` and its options type; compatibility only in this milestone |

Every package uses an explicit `exports` map. Internal modules remain unexported.
The build fails if declarations expose a type through an undeclared internal
path. Package tests import only through export maps, not `src/` paths.

The root package remains private and coordinates workspaces, tests, builds, and
pack checks. Public package manifests stay version `0.1.0` for the preview and
use exact same-version sibling dependencies during local tarball acceptance.

The selected npm namespace is `@prism-harness`: `@prism-harness/sdk`,
`@prism-harness/runtime`, `@prism-harness/cli`,
`@prism-harness/provider-ollama`, and `@prism-harness/provider-codex`. Namespace
ownership must be verified before publication, which remains outside this plan.
Local pack tests discover actual tarball filenames from `npm pack --json`; for
version 0.1.0 the expected npm names begin `prism-harness-*-0.1.0.tgz`.

## CLI contracts

The supported shell contract is:

```text
prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--yes]
prism doctor [--allow-remote-endpoint <origin>] [--json]
prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--json] <goal>
prism inspect [--json] <run-id>
prism plugin create <name> [--directory <path>]
prism plugin check <path> [--json]
```

Rules shared by every command:

- Usage errors return exit code 2, write one actionable message to stderr, and
  write nothing to stdout.
- Runtime or provider failures return exit code 1. Successful commands return 0.
- `--json` writes one JSON value followed by one newline. Diagnostics stay on
  stderr and never corrupt JSON output.
- Unknown options and extra positional arguments fail closed. No command silently
  ignores input.
- `--` ends option parsing. A goal beginning with `-` remains representable.
- The CLI has no telemetry and never reads provider credentials for another tool.

`prism run` resolves its provider in this order: explicit flag, project config,
user config, then deterministic. Once `prism init` records Ollama, an unqualified
run uses that endpoint and model when it is loopback or the exact remote origin
was trusted during init. The explicit deterministic option always works without
an account, network request, or model download.

Human output from every successful `run` ends with `Run: <uuid>`. JSON output has
a top-level `runId`. A developer can therefore pass the identifier directly to
`inspect` without browsing the state directory.

The existing `npm run --silent prism:codex -- <prompt>` command and its fake-Codex
host test remain compatibility surfaces while the implementation moves into
`@prism-harness/provider-codex`. `prism run --provider codex` is intentionally not
supported in this milestone.

The current `npm run --silent prism:demo` command remains byte-identical. It is a
compatibility fixture, not an alias for the human-facing `prism run` formatter.

## Configuration and run records

Use versioned JSON, not a database.

- Project config: `<workspace>/.prism/config.json`
- User config: `${XDG_CONFIG_HOME:-~/.config}/prism/config.json`
- Run records: `${XDG_STATE_HOME:-~/.local/state}/prism/runs/<run-id>.json`

On supported POSIX systems, user config, state directories, and run records are
created without group or world access. Writes use a temporary file, `fsync`, and
atomic rename. Tests set temporary HOME, XDG config, and XDG state directories so
they never touch developer state.

Configuration stores only provider name, model, endpoint, and format version. It
does not store tokens or copied credential files. A run record stores a random
UUID, the admitted workspace root, goal, provider and model identifiers, bounded
limits, ordered events, a sanitized tool trace, terminal result, and start/end
times. The sanitized trace contains operation names, normalized relative paths,
counts, byte lengths, digests, and redaction flags. Raw file contents, search
excerpts, headers, and provider response bodies are never persisted. Records are
local operator data, not Runtime resume state, and documentation labels goals and
answers as potentially sensitive even with restrictive file permissions.

`inspect` accepts a canonical UUID only and constructs the record path itself. It
does not accept arbitrary paths. Unknown versions, malformed records, symlinks,
and paths outside the state root are rejected.

Project config is untrusted repository content. It may select deterministic or a
loopback Ollama endpoint without prompting. A non-loopback endpoint from project
config is rejected before network access unless the exact normalized origin is
already trusted or the operator passes
`--allow-remote-endpoint <normalized-origin>`. A bare boolean flag is invalid.
Interactive confirmation prints that origin, and automation must repeat it as the
flag value. `--yes` is accepted only for an explicit `prism init` invocation,
never for config discovered during an unrelated command.

Remote trust created by `prism init` is stored in user config, not the repository.
Project-scoped trust binds the canonical workspace path and project-config digest;
changing the endpoint or config invalidates it. User-scoped trust binds the exact
normalized origin. `doctor` and `run` use the same resolver and authorization
gate. Without trust, `doctor` reports `remote endpoint not authorized`, makes no
request, and exits 1. Tests cover metadata-service addresses, DNS names, config
changes, malformed URLs, and proof that denied `doctor` and `run` make zero
network calls.

## Security boundaries

The preview preserves these boundaries:

1. Runtime owns turn, tool-call, byte, and deadline limits. Providers and tools
   cannot raise their own limits.
2. CLI owns config and run-record persistence. Runtime receives explicit adapters
   and has no ambient HOME or current-directory lookup.
3. The repository tool receives one admitted workspace root, meaning the canonical
   real path approved by the CLI before Runtime starts. Every operation
   resolves real paths below that root, rejects symlink escapes, applies byte and
   result-count bounds, excludes `.git` and common credential/key filenames by
   default, and exposes no write operation. Exclusion is defense in depth; raw
   repository tool output is still prohibited from persisted run records.
4. Ollama is a direct provider. It calls the configured endpoint with a bounded
   request and response size and a timeout. It does not route through an arbiter,
   gateway, or hidden fallback provider.
5. The subprocess plugin path retains its documented ambient host authority. CLI
   wording must not call it a sandbox. Firecracker is the optional hostile-code
   isolation profile.

Provider errors disclose the endpoint origin, model, timeout class, and HTTP
status when available. They do not echo response bodies, headers, authorization
values, local config contents, or full prompts to stderr.

## Implementation phases

### Phase 0: freeze the working demo

Goal: preserve the known-good path before package movement.

1. Keep the exact success object and four failure families in
   `pnh/host-tests/prism-demo.test.ts`.
2. Add the test to `tests/compat/` only when the implementation moves. The shell
   test must continue invoking the root package command, not an internal function.
3. Record the baseline under Node.js 26.8.1 and npm 11.19.0.

Verification:

```sh
npm ci
npx tsx --test pnh/host-tests/prism-demo.test.ts
```

Rollback: no product code changes. Revert only test moves or additions.

### Phase 1A: smallest CLI vertical slice

Goal: prove shell to parser to current deterministic composition before moving
the runtime closure.

Add:

- `packages/cli/package.json`, marked `private: true` for this checkpoint.
- `packages/cli/src/bin.ts` with the Node shebang and process adapter.
- `packages/cli/src/cli.ts` with a dependency-injected command dispatcher.
- `packages/cli/src/commands/run.ts` for the deterministic run command.
- `packages/cli/test/prism-cli.test.ts` for process-level and parser-level cases.

Update the root workspace manifest, lockfile, TypeScript include, and host-test
script. The temporary binary may import the current deterministic composition
from `pnh/` because the package is private and not packed. Put a comment at that
import naming Phase 1B as the deletion gate.

Acceptance:

```sh
prism run 'Count the words in: one two three'
prism run --provider deterministic 'Count the words in: one two three'
```

Both commands execute the existing owner-pinned provider, policy, and subprocess
tool path and emit its existing JSON result. Tests also cover missing command,
unknown command, unknown provider, missing goal, and stdout/stderr separation.
The original package demo test must remain green.

Stop after this checkpoint and review the diff. Do not describe the CLI workspace
as installable yet. Its pack gate is intentionally closed while it imports `pnh/`.

Rollback: remove `packages/cli/`, remove the workspace entry, and regenerate the
lockfile. The original demo remains untouched and usable.

### Phase 1B: close Runtime, SDK, and CLI packages

Goal: make the deterministic CLI installable from tarballs without repository
files or development dependencies.

1. Move SDK contracts and validators into `packages/sdk/src/` and add export-map
   consumer tests. Move `pnh/registry/schema.ts` and convert the protocol resource
   bounds into SDK-owned TypeScript in the same step so SDK never imports root
   contracts.
2. Move the bounded loop and the deterministic path's runtime closure into
   `packages/runtime/src/`. Move required `.mjs`, JSON, and subprocess assets with
   the code that resolves them.
3. Move all of `pnh/core/` into `packages/runtime/src/core/`, then retarget
   `check-module-graph.ts`, its tests, and the sandbox core-manifest writer in that
   same commit. No intermediate commit may leave the closed-core gate pointed at
   a missing or partially moved directory.
4. Move product and test adapters according to the source-closure manifest. Move
   the registry generator into SDK authoring support, split Runtime-specific
   artifact commitments into Runtime, and move constitution-only contracts and
   scripts under `assurance/constitution/`.
5. Move the deterministic provider, policy, and text tool fixtures under
   `packages/cli/assets/deterministic/`. Resolve assets from `import.meta.url`,
   never `process.cwd()`.
6. Replace the temporary CLI import from `pnh/` with public Runtime and SDK
   imports. Set the CLI package to `private: false` only after the isolated
   tarball test passes.
7. Move the existing Codex adapter and fixture into
   `packages/provider-codex/`. Repoint `prism:codex` and
   `codex-provider-example.test.ts` in the same commit, and keep the deterministic
   fake as the default acceptance. Live Codex remains opt-in.
8. Add TypeScript project references, declaration output, explicit package
   exports, a Node asset-copy build script, and package-graph enforcement.
   The build emits declarations from `.ts` and copies only an explicit allowlist
   of non-TypeScript runtime assets. Hand-authored `.d.mts` files are either
   replaced by emitted declarations or copied to a distinct declared target;
   same-path collisions fail the build.
9. Update plugin runner and artifact commitment path calculations together, then
   regenerate and test digests. A moved runner cannot reuse a digest computed for
   the old layout.
10. Retarget active tests and public-claim manifests. Preserve dated design
   records and the provider-neutral-harness documents required by constitution
   validation.

Acceptance packs SDK, Runtime, and CLI into a temporary directory, initializes a
blank npm project, installs only those tarballs, changes to a second working
directory, and invokes the installed `prism` binary. The test fails if any loaded
module resolves into the source checkout.

Install unpublished sibling packages together in one command, for example
`npm install ./prism-harness-sdk-0.1.0.tgz
./prism-harness-runtime-0.1.0.tgz ./prism-harness-cli-0.1.0.tgz
./prism-harness-provider-ollama-0.1.0.tgz`. The script obtains these names from
`npm pack --json`; it does not rely on npm resolving an unpublished
`@prism-harness/*` dependency from the public registry.

Rollback: restore the moved paths with Git, restore the old scripts, and keep the
Phase 1A private CLI checkpoint. Do not retain duplicate source trees.

### Phase 2: CLI-owned config, doctor, records, and inspection

Goal: complete the deterministic first-run shell without generalizing Runtime.

1. Implement project/user config resolution and non-interactive flags for tests.
2. Implement `doctor` checks for Node version, writable config/state locations,
   selected provider configuration, exact-origin authorization, Ollama
   reachability, and presence of the configured model when Ollama is selected.
   Model absence exits 1 with `model not found; run ollama pull <model>`. A remote
   endpoint is never probed before the shared trust gate passes.
3. Save every `prism run` result through the CLI-owned run store.
4. Implement `inspect` over validated run IDs and records.
5. Add temp-HOME acceptance for `init`, `doctor`, `run`, and `inspect` from packed
   tarballs.

Runtime receives no persistence dependency. A failed record write makes the CLI
run fail visibly rather than claiming that inspection is available.

Rollback: remove config and record adapters while preserving the packed
deterministic `run` command and package boundaries.

### Phase 3: general Runtime, repository tool, and Ollama

Goal: replace the text-stats-specific coordinator with the bounded product loop
and add the useful local-model path.

1. Generalize provider turns, tool requests, policy admission, event payloads,
   and terminal results. Keep the old deterministic output adapter as a
   compatibility layer.
2. Add limits for provider turns, tool calls, total bytes, per-tool bytes, and
   wall-clock deadline. Test every limit at its boundary and one value beyond.
3. Add list, read, and search operations to the repository tool. Test `..`,
   absolute paths, symlink escape, binary files, ignored large files, byte caps,
   result caps, and timeout behavior.
4. Implement `@prism-harness/provider-ollama` against a local HTTP stub first.
   Cover success, unavailable endpoint, unknown model, timeout, malformed JSON,
   oversized response, and redacted diagnostics.
5. Add an opt-in live Ollama acceptance that never runs in the default suite.

The live acceptance uses a committed small repository fixture containing a
unique fact that does not appear in the prompt or filenames. Its concrete
question asks for that fact and the file that defines it. It passes only when the
trace shows a bounded read/search of that file and the final answer contains both
the expected fact and filename. Stub tests remain the deterministic default, but
a developer-preview release candidate must record one successful live run with
the declared model. Without that evidence, the Ollama path is implemented but
the milestone is not release-ready.

Ollama calls its configured endpoint directly through the SDK provider contract.
No model router, gateway, resolver, or cloud fallback is introduced.

Rollback: select the deterministic provider and old compatibility adapter. The
general loop and Ollama package can be reverted independently because CLI depends
only on public provider and Runtime contracts.

### Phase 4: plugin create and check

Goal: let a developer produce one understandable tool plugin against the SDK.

1. `plugin create` validates a package-style name, refuses existing or symlinked
   destinations, and writes a small tool fixture with manifest, source, test, and
   README.
2. `plugin check` validates the manifest and registration contract, imports the
   plugin in a bounded child process, runs its fixture operation, confirms cleanup,
   and reports the subprocess trust boundary.
3. Acceptance scaffolds into a temporary directory, runs its test, checks it,
   mutates one manifest field to prove rejection, and confirms no file outside the
   scaffold changed.

Do not add a registry client, installer, package search, signing, or publication
flow in this milestone.

Only tool scaffolding is included because the release gate needs one authoring
path small enough to understand in one sitting. Provider, policy, memory, and
renderer scaffolds remain future SDK examples rather than partial generators in
this milestone.

Rollback: remove the CLI subcommands and SDK authoring helper. Runtime and provider
packages remain unaffected.

### Phase 5: onboarding and release gate

Goal: make the packed preview usable by someone who did not build it.

1. Rewrite the root README around a copy-paste deterministic path followed by an
   Ollama path.
2. Document concepts, command reference, plugin authoring, local data locations,
   subprocess authority, and diagnostics.
3. Move Firecracker and constitutional proof material under an optional assurance
   documentation section. Keep `pnh/x1-firecracker/` and its B4 checks in place;
   do not weaken or delete existing limitations.
4. Run all clean-checkout and packed-artifact gates. Record any Linux-only or
   physical-X1 assurance checks as non-gating and unverified when they were not run.

No npm publication, Git remote creation, push, or deployment occurs without a
separate owner instruction.

Rollback: documentation and release scripts revert without changing the package
contracts proven in earlier phases.

## Test matrix

| Layer | Required evidence |
|---|---|
| Compatibility | Existing byte-identical demo success and four real subprocess failure paths |
| Package graph | SDK independence; Runtime to SDK only; providers to SDK only; no cross-package relative imports |
| Unit | CLI parser, config precedence, record validation, limits, repository path containment, provider response validation |
| Integration | Deterministic runtime, local Ollama HTTP stub, opt-in real Ollama fixture answer, plugin child process, atomic local record store |
| Process | Exit codes, stdout/stderr contracts, cleanup receipts, signal/timeout handling |
| Packed install | Install tarballs outside checkout, invoke `prism`, run and inspect, scaffold and check plugin |
| Full repository | `npm test`, `npm run build`, `npm run pack:check`, public-claims gate |

The package dry-run check must inspect each public tarball's file list. Reject source
maps with embedded absolute paths, fixtures not needed at runtime, credentials,
workstream files, test-only binaries, and references to source-checkout paths.

## Clean-install release gate

Run with the exact version in `.node-version`:

```sh
npm ci
npm run build
npm test
npm run pack:check
```

`pack:check` must build fresh tarballs and perform this outside-repository flow in
a temporary directory:

1. Install the SDK, Runtime, CLI, and required provider tarballs together in one
   command into a blank project without workspace links or registry fallback.
2. Run `prism doctor` with a temporary HOME and XDG directories.
3. Run the deterministic path, capture its run ID, and inspect the saved record.
4. Run the Ollama path against the local stub.
5. Scaffold a tool, run its generated test, and pass `prism plugin check`.

Separately, record the opt-in real Ollama fixture acceptance before calling a
release candidate complete. The default clean-install gate stays deterministic;
the recorded live check supplies the product-quality evidence it cannot.

The live script writes a bounded evidence record under
`docs/releases/developer-preview/`. It contains the fixture digest, expected fact
digest, model identifier, result class, and timestamp, but no prompt, model
output, repository contents, endpoint, or credentials. The release check rejects
missing evidence or a fixture-digest mismatch.

The gate also asserts that Firecracker, Docker, Rust, KVM, Codex login, API keys,
and network access are absent from the deterministic install and first run.

## Review gate before implementation

Review this plan through product, dependency-direction, security-boundary, scope,
feasibility, and clean-install lenses. Resolve every P0 or P1 finding in the plan
before changing runtime code. Record accepted P2 findings or explicit deferrals.

The first implementation action after review is Phase 1A only. Phase 1B starts
after the source-level CLI process test and legacy demo compatibility test are
green and the diff has been re-read for accidental release claims.

### Review history

The first saved-workflow review on 2026-08-30 ran six lenses with independent
verification. It returned `rework`: one P0, five P1s, one P2, and eight FYIs; one
additional finding was killed by audit. Revision 2 accepts every actionable
finding:

- the source table and Phase 1B now assign core, contracts, registry, adapters,
  scripts, and digest path updates;
- Codex is explicitly a preserved compatibility package, command, and fake test,
  not a supported first-run provider;
- project-selected remote endpoints require explicit operator action;
- persisted tool traces exclude raw repository contents;
- a real Ollama fixture run has a concrete usefulness bar; and
- successful human and JSON run output always exposes the run ID.

Relevant FYIs were also resolved by specifying declaration/asset collision rules,
one-command local tarball installation, workspace terminology, POSIX platform
scope, tool-only scaffold rationale, and lockstep runner-digest updates.

The second saved-workflow review on 2026-08-30 ran five lenses with independent
verification. It returned `rework` for a `doctor` endpoint-authorization gap and
five precision issues. The final revision applies the same exact-origin trust
gate to `doctor` and `run`, declares `@prism-harness` as the package namespace,
defers the Rust Firecracker package boundary, persists remote trust only from an
explicit init, tests live Ollama against a content-derived fact, and makes doctor
verify that the configured Ollama model is present. It also specifies doctor
failure exit codes, mechanical origin confirmation, and bounded live evidence.

## Definition of done

The milestone is complete when a clean machine can install only packed Prism
artifacts, complete deterministic and Ollama first runs, inspect a local record,
scaffold and validate a tool plugin, and find accurate trust-boundary documentation.
All default tests and package gates pass under Node.js 26.8.1, the real Ollama
fixture acceptance has recorded useful output, and the preserved fake-Codex
compatibility test passes without a live account. Optional qualified Firecracker
evidence remains explicitly separate.
