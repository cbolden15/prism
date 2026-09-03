# Prism Phase 5 execution contract

- Date: 2026-08-30
- Status: complete
- Workstream: `20260830-prism-phase-5-onboarding-release-143e51`
- Branch: `feat/phase-5-onboarding-release`
- Phase 5 baseline: `4100b3211f6889e38d5017fde4971241c40c97e9`
- Phase 4 reviewed source: `6c5e478371f643eeb94c5021e6f712f8e20926bd`

This contract governs Phase 5 only. The reviewed developer-preview plan remains
the product source. This document narrows its onboarding and release-gate phase
into one autonomous, locally verifiable milestone. It does not authorize a
public release.

## Rendered phase task

Objective: Complete Prism Phase 5 only: make the four-package local developer preview understandable and usable from a content-closed candidate bundle, with copy-paste deterministic onboarding first, optional Ollama onboarding second, accurate command, plugin, local-data, diagnostics, and trust documentation, an optional-assurance section, bounded live-evidence handling, and a clean-checkout release gate that preserves every reviewed Phase 4 package and behavior boundary.

Source of truth and precedence: Runtime and user authority, current Git state, `AGENTS.md` and `CLAUDE.md`, this Phase 5 execution contract, Phase 5 and the release gate in the reviewed developer-preview implementation plan, then the completed Phase 4 handoff. Stop and report any material conflict.

Allowed write scope: `README.md`; coordinator-frozen user documentation under `docs/developer-preview/**` and `docs/assurance/**`; bounded release-evidence records under `docs/releases/developer-preview/**`; coordinator-assigned release-gate scripts and focused compatibility tests; coordinator-owned `package.json` scripts, public-claim surfaces and manifest, active notices, gotcha registry, and this Phase 5 workstream. `packages/*/src/**`, Runtime behavior, provider behavior, SDK contracts, native assets, and `pnh/x1-firecracker/**` are out of scope.

Verification: Activate and assert Node 26.8.1 and npm 11.19.0; freeze the documentation map, command snippets, candidate-bundle manifest, link and claim checks, live-evidence schema, and clean-checkout acceptance before implementation; pass focused documentation and release-gate tests; obtain independent `READY` reviews of the exact committed source; then pass `npm ci`, `npm run build`, `npm test`, `npm run pack:check`, and the Phase 5 release gate from a clean temporary checkout. The deterministic gate is hard; `qwen2.5:14b` live evidence is required for release readiness but never triggers a model pull or unbounded retry.

Stop condition: Stop successfully only when every Phase 5 criterion passes, the exact reviewed source and bounded release evidence are committed locally, the worktree is clean, and the Phase 5 handoff is updated. Stop before package publication, npm namespace claims, signing, installers, registry clients, GitHub release creation, remote creation, push, deployment, public-release posture changes, product feature work, or Firecracker implementation changes.

Sensitive-data policy: Never persist or echo credentials, environment values, provider prompts or responses, repository contents, raw tool queries or excerpts, endpoint details, local absolute paths, user configuration, goals, answers, or run-record contents in release evidence, review artifacts, candidate manifests, or handoffs. Live evidence is schema-closed and digest-based. Documentation must label goals and answers as sensitive local operator data and must state that plugin checks execute code with ambient host authority and are not a sandbox.

Output contract: Report the final local source and closure commits, exact verification commands and results, independent review verdicts, candidate-bundle contents and digests, documented command coverage, public-claim status, live Ollama evidence status, optional-assurance checks run or explicitly unverified, changed files, remaining publication blockers, updated handoff, clean Git status, and the single next owner action. Do not push, publish, sign, deploy, or create a remote release.

Read relevant sources first. Work in small steps. Keep edits within scope. Report evidence, blockers, and next action. Stop on authority conflict, missing verification, scope conflict, or the stated stop condition.

## Required reading

Read these sources completely before changing release-facing files:

1. `AGENTS.md`, `CLAUDE.md`, this contract, and this Phase 5 workstream's
   `STATE.md`, `HANDOFF.md`, and `DECISIONS.md`.
2. Phase 5, the clean-install release gate, test matrix, and definition of done
   in `2026-08-29-developer-preview-implementation-plan.md`.
3. The completed Phase 4 handoff and execution contract, including its trust
   boundaries and exact reviewed source.
4. `README.md`, `pnh/README.md`, `.env.example`, active notices, the public-claim
   manifest and checker, package manifests, CLI parser tests, packed-install
   acceptance, and the live Ollama fixture script.
5. `pnh/README.md`,
   `docs/plans/provider-neutral-harness/2026-08-29-prism-harness-x1-microvm-b4-implementation-plan.md`,
   `pnh/x1-firecracker/b0/run-profile.sh`, and
   `.github/workflows/x1-gate-a.yml`. Read only enough implementation detail to
   document the existing X1 boundary, limitations, profiles, and environments
   accurately; Phase 5 does not change them.

Use CodeGraph for narrow code-symbol and dependency queries. Current Git state
is authoritative when its local index is stale. CodeGraph itself runs under
Node 22 because of its upstream Node 25+ WASM issue. It is never a Prism gate.

## Baseline and authority

- Phase 5 begins from Phase 4 closure commit `4100b32` on
  `feat/phase-5-onboarding-release`.
- Exact reviewed Phase 4 product source `6c5e478` is an ancestor and remains the
  behavior baseline.
- The five workspaces remain version `0.1.0`. The supported candidate bundle
  contains SDK, Runtime, Ollama provider, and CLI tarballs. The Codex provider
  remains a source-tree compatibility package and is not a first-run route.
- No Git remote exists. Do not invent repository, homepage, issue, registry,
  download, or support URLs.
- `@prism-harness` namespace ownership is unverified. Do not probe it, claim it,
  or describe registry installation as available.
- Phase 5 may document and package behavior already reviewed. It may not change
  public APIs, command grammar, Runtime semantics, provider behavior, plugin
  authority, native prebuilds, or package dependency direction.
- A behavior defect found while documenting blocks Phase 5 or requires a
  separately approved corrective slice. Do not hide a product change inside a
  documentation commit.

This is a local developer-preview candidate gate, not a public release gate.
Namespace ownership, final dependency-license scanning, SBOM generation,
signing, provenance, sanitization, distribution, and publication remain work
that requires separate owner approval.

## Environment preflight

The shell may start on an unsupported Node version. Before installation,
generation, tests, candidate assembly, live acceptance, or commits, activate
and assert the repository pin:

```sh
NODE_VERSION="$(tr -d '\n' < .node-version)"
export PATH="$HOME/.nvm/versions/node/v${NODE_VERSION}/bin:$PATH"
test "$(node --version)" = "v${NODE_VERSION}"
test "$(npm --version)" = "11.19.0"
```

Do not continue after either assertion fails. Do not rewrite historical Node
pins in dated records.

Source dependency installation may use the npm registry when the local cache is
empty. Candidate installation and every deterministic first-run acceptance must
use only the four local tarballs with offline npm settings, ignored lifecycle
scripts, an empty cache, and no registry fallback.

## First action

Before drafting release prose or implementing scripts, freeze failing tests for:

- the exact documentation map and every relative Markdown link;
- the six-command CLI grammar, shared exit codes, option terminator, and
  deterministic, Ollama, inspect, and plugin snippets;
- the closed candidate-bundle tree, manifest schema, sorted checksums, package
  set, license and notice files, and refusal to overwrite output;
- packed installation and all documented first-run paths outside the checkout;
- the closed live-evidence schema, fixture and expected-fact digests, forbidden
  fields, and stale-evidence rejection; and
- registration and linting of release-facing trust and availability claims.

Do not dispatch documentation or release-gate implementation until the
coordinator has frozen these paths, schemas, commands, and outputs.

## Contract review

The saved doc-review workflow ran five verified lenses: coherence, feasibility,
security, scope, and adversarial. Its first pass returned `fix-first` for two P1
findings and one P2 finding. The contract now distinguishes pre-live and final
gates, matches the installed `init` grammar, and defines one parameterized
packed-acceptance runner instead of assuming the current script already exports
shared helpers.

A targeted rerun found an undefined one-attempt ledger and one guessed X1 path.
This revision defines the exclusive workstream ledger and names the exact
existing X1 sources. The final feasibility and adversarial rerun returned
`ready`, with no surviving P0, P1, P2, or P3 findings. All review passes were
read-only and independently audited.

## Required deliverables

### Documentation map

Create this closed user-facing map:

```text
README.md
docs/developer-preview/getting-started.md
docs/developer-preview/concepts.md
docs/developer-preview/command-reference.md
docs/developer-preview/plugin-authoring.md
docs/developer-preview/data-and-trust.md
docs/developer-preview/diagnostics.md
docs/assurance/README.md
docs/releases/developer-preview/README.md
docs/releases/developer-preview/ollama-live-evidence.json
```

The root README is a short landing page. It starts with the local candidate
bundle and a copy-paste deterministic path, then links to the optional Ollama
path. It does not start with architecture history, constitution terminology,
Codex, Docker, Rust, or Firecracker.

The developer-preview documents own normal product onboarding. The assurance
document owns optional constitutional and X1 navigation. Release evidence has
its own directory and schema. Do not duplicate full sections across files.

All links are repository-relative and resolve on a case-sensitive filesystem.
No document points at a source-only module when a public package or command is
the supported surface. Dated architecture records remain unchanged.

### Deterministic first run

Document installation from the local candidate bundle, not from npm. The user
must be able to copy the documented commands into a blank directory and:

1. install exactly the four local tarballs offline with lifecycle scripts
   disabled;
2. initialize deterministic configuration or rely on the documented default;
3. run `prism doctor`;
4. run a deterministic goal and receive a run ID; and
5. inspect that run by canonical ID.

The flow uses the installed `prism` binary and never imports this checkout. It
requires Node 26.8.1 and npm 11.19.0 but no provider account, API key, model,
daemon, Docker, Rust, Firecracker, Codex login, or external network request after
the candidate bundle exists.

Do not publish a registry command, global-install command, curl installer, or
placeholder URL. Make the current local-only distribution status visible near
the first install command.

### Optional Ollama first run

The second path documents the direct Ollama provider with:

- an already running loopback Ollama endpoint;
- an already installed `qwen2.5:14b` model;
- explicit `init`, `doctor`, `run`, and `inspect` commands;
- the repository tool's read-only scope and content disclosure to the selected
  local model; and
- exact-origin authorization for any non-loopback endpoint.

Prism and its gates never pull a model. Documentation may explain that model
installation is a separate operator choice, but the copy-paste acceptance and
automation must not execute `ollama pull` or silently substitute another model.

### Concepts and command reference

Explain the current package roles, dependency direction, bounded Runtime loop,
provider, policy, repository tool, CLI-owned configuration and persistence, and
plugin authoring boundary without exposing internal APIs as supported surfaces.

Document exactly these command families:

```text
prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--allow-remote-endpoint <origin>] [--yes]
prism doctor [--allow-remote-endpoint <origin>] [--json]
prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--json] <goal>
prism inspect [--json] <run-id>
prism plugin create <name> [--directory <path>]
prism plugin check <path> [--json]
```

Cover exit codes 0, 1, and 2; stdout and stderr separation; one-value JSON
output; unknown-option rejection; and `--` for a goal beginning with `-`.
Document the preserved `prism:demo` and fake `prism:codex` commands as
source-tree compatibility checks, not installed first-run routes.

### Plugin authoring

Document only the current tool scaffold:

- the managed authoring root and its default `prism-plugins` location;
- the exact four generated plugin files;
- generated `node --test index.test.mjs` and installed `prism plugin check`;
- deterministic refusal of existing destinations and unmanaged roots;
- the ambient-authority warning and cleanup claim; and
- what a passing check does not prove.

Do not document provider, policy, memory, or renderer scaffolds; discovery,
installation, registry, search, update, signing, trust, or publication flows;
or an overwrite mode that does not exist.

### Local data and trust

Document the active POSIX locations and ownership boundaries:

| Data | Location |
| --- | --- |
| Project config | `<workspace>/.prism/config.json` |
| User config | `${XDG_CONFIG_HOME:-~/.config}/prism/config.json` |
| Run records | `${XDG_STATE_HOME:-~/.local/state}/prism/runs/<run-id>.json` |
| Default authoring root | `<cwd>/prism-plugins` |

State that configuration stores no provider credentials. Goals and final
answers are persisted and may be sensitive. Sanitized tool traces omit raw file
contents, queries, and excerpts. The selected provider still receives the
prompt and any repository content read for that run.

State these boundaries without qualification drift:

- the repository tool is bounded and read-only but is not a confidentiality
  boundary from the selected provider;
- subprocess plugins inherit ambient host authority and are not sandboxed;
- `plugin check` validates one authoring fixture and original process-group
  cleanup, not safety, installation, trust, Runtime admission, or deliberately
  detached descendants;
- in-package native digests detect inconsistency but are not signatures or an
  independent provenance root; and
- native Windows and WSL remain unverified. The preview currently targets
  supported macOS and Linux combinations recorded by the package contract.

### Diagnostics

Give a symptom, bounded cause, and next command for at least:

- unsupported Node or npm version;
- missing or unwritable config/state roots;
- unauthorized remote endpoint;
- Ollama unavailable or model missing;
- malformed, oversized, or timed-out provider response;
- invalid run ID or record;
- repository path rejection;
- unsupported or integrity-failed native authoring target;
- managed-root and destination failures; and
- plugin static, execution, timeout, output-pressure, or cleanup failure.

Do not tell users to disable checks, weaken filesystem modes, run unknown code
with elevated privileges, print raw records into issue reports, or paste secrets.

### Optional assurance

Move assurance material out of the first-run narrative and into
`docs/assurance/README.md`. This is a navigation and explanation change, not a
source relocation.

The document distinguishes normal local execution from optional Docker and X1
assurance profiles. It links to the existing constitution, public-claim surface,
B4 documentation, and profile commands. It preserves every recorded limitation
and states the environment each proof requires.

Keep `pnh/x1-firecracker/**`, B4 scripts, lockfiles, licenses, and CI paths in
place. Qualified Linux x86_64, KVM, QEMU, and physical-X1 results are reported as
unverified when they were not run on the exact Phase 5 source. File inspection,
macOS, or Docker Desktop does not substitute for those environments.

## Local candidate bundle

Add one explicit local assembly command that requires an output path and refuses
an existing destination. It writes no default into the repository and performs
no network, publication, signing, or installation step.

The bundle tree is closed:

```text
prism-developer-preview-0.1.0/
  README.md
  LICENSE
  NOTICE
  THIRD_PARTY_NOTICES.md
  docs/
    developer-preview/*.md
    assurance/README.md
    releases/developer-preview/README.md
    releases/developer-preview/ollama-live-evidence.json
  packages/
    prism-harness-sdk-0.1.0.tgz
    prism-harness-runtime-0.1.0.tgz
    prism-harness-provider-ollama-0.1.0.tgz
    prism-harness-cli-0.1.0.tgz
  candidate.json
  SHA256SUMS
```

Discover actual tarball names from `npm pack --json`. Reject a missing, extra,
or duplicate package. The Codex compatibility package is not in this bundle.

`candidate.json` is canonical JSON with this closed shape:

```text
version: "prism-developer-preview-candidate-v1"
sourceCommit: 40 lowercase hexadecimal characters
node: "26.8.1"
npm: "11.19.0"
packages: sorted entries of { name, version, file, sha256 }
documents: sorted entries of { file, sha256 }
```

Every digest is lowercase SHA-256 without an algorithm prefix. Package names,
versions, paths, and counts are closed. `documents` contains exactly the root
README, license, notice, third-party notices, and the documentation files shown
in the bundle tree. `SHA256SUMS` is sorted by relative path and covers every
bundle file except itself. It uses two spaces between digest and path and ends
with one newline.

Candidate assembly requires a clean Git worktree and records `HEAD`. It creates
a mode-0700 temporary detached worktree at that exact commit, links the
already-installed external build dependencies into it, replaces every
`@prism-harness/*` workspace link with the corresponding detached package, and
builds and packs only from that private tree. It performs no dependency install
and makes no network request. The final clean-checkout gate's preceding
`npm ci` supplies the reviewed dependency tree.

Assembly follows no output symlink, overwrites nothing, and stages complete
output before one no-replace publication. Failure removes the detached
worktree, private tarballs, and the invocation's still-identical staging
directory. The output path is bounded and supplied explicitly.

The source-side release gate compiles a private temporary helper and uses the
host's atomic no-replace rename primitive: `renamex_np(RENAME_EXCL)` on macOS
or `renameat2(RENAME_NOREPLACE)` on Linux. A working C compiler is therefore a
maintainer-side release-gate prerequisite. The helper and its build directory
are removed after each publication attempt and are never copied into the
candidate bundle.

Do not claim byte-for-byte reproducibility across npm or platform versions.
The gate proves a closed candidate assembled under the pinned toolchain and
records the bytes it actually produced.

## Candidate and final release gate

Add focused documentation, candidate-builder, and evidence-validator checks to
the normal suite. The final `check:release` gate must:

1. validate the documentation map, links, command coverage, version pins,
   release status, and public-claim registration;
2. assemble a candidate into a fresh temporary directory from a clean exact
   commit;
3. verify every candidate manifest and checksum entry and audit each npm
   tarball's file list;
4. copy the bundle to a second location outside the checkout and install only
   its four tarballs offline with lifecycle scripts disabled and an empty npm
   cache;
5. execute the documented deterministic `init`, `doctor`, `run`, and `inspect`
   path with isolated HOME and XDG roots;
6. execute Ollama `init`, `doctor`, `run`, and `inspect` against the local HTTP
   stub, never a live daemon;
7. scaffold a tool, run its generated test, pass `plugin check`, and prove the
   managed root and an outside sentinel stay within the reviewed mutation
   contract; and
8. prove no installed or generated module resolves into the source checkout and
   no registry, install script, compiler, daemon, account, credential, Docker,
   Rust, Firecracker, Codex login, or external network is needed.

Preserve the existing `pack:check` contract and its native-prebuild audits.
Refactor its coordinator-owned script only as needed into a parameterized runner
that both the default pack gate and candidate gate invoke. The default command,
observable assertions, and output remain compatible. The candidate gate passes
the bundle's four exact tarballs to that same runner rather than copying its
installed-flow assertions into a second script.

The normal suite tests the evidence validator with temporary passing, missing,
stale, malformed, and forbidden-field fixtures. It does not require the
repository's live-evidence file during pre-live implementation. The final
`check:release` command does require that committed file and fails closed when it
is absent or stale.

The package dry-run check rejects source maps with absolute paths, source and
test trees not needed at runtime, workstream files, credentials, unexpected
fixtures or binaries, checkout references, symlinks into the checkout, and
missing license or notice coverage in the candidate bundle.

## Live Ollama evidence

The hard provider gate remains the local HTTP stub. After every deterministic
gate passes, Phase 5 makes at most one live release-evidence attempt with the
already installed `qwen2.5:14b` model at the existing loopback Ollama service.
Do not run `ollama pull`, start a new remote service, change the model, loosen
acceptance, or retry until the model happens to pass.

Enforce the limit with
`docs/ai/workstreams/20260830-prism-phase-5-onboarding-release-143e51/LIVE_ATTEMPT.json`.
Before probing the model or endpoint, the live script must create that file with
exclusive no-replace semantics. An existing file means the attempt is already
consumed and the script refuses to start. A crash after creation still consumes
the attempt.

The ledger is canonical JSON with exactly:

```text
version: "prism-phase-5-live-attempt-v1"
workstream: "20260830-prism-phase-5-onboarding-release-143e51"
ordinal: 1
model: "qwen2.5:14b"
startedAt: UTC ISO-8601 timestamp
finishedAt: UTC ISO-8601 timestamp or null
result: "started" | "passed" | "model-missing" | "doctor-failed" | "provider-failed" | "acceptance-failed" | "tooling-failed"
evidenceSha256: 64 lowercase hexadecimal characters or null
```

The initial exclusive write uses `result: "started"`, `finishedAt: null`, and
`evidenceSha256: null`. Completion atomically replaces only that same ledger
with a terminal result. It records no raw error, model output, prompt, endpoint,
run data, host detail, environment value, path, or credential. Tests exercise
the state machine and concurrent-start refusal in temporary workstreams.

The live script writes `ollama-live-evidence.json` only after the existing
content-derived fixture acceptance succeeds. The file is canonical JSON with
exactly:

```text
version: "prism-live-ollama-evidence-v1"
fixtureSha256: 64 lowercase hexadecimal characters
expectedFactSha256: 64 lowercase hexadecimal characters
acceptanceScriptSha256: 64 lowercase hexadecimal characters
acceptanceInputSha256: 64 lowercase hexadecimal characters
model: "qwen2.5:14b"
result: "passed"
recordedAt: UTC ISO-8601 timestamp
```

The acceptance-input digest covers the sorted regular files under the SDK,
Runtime, Ollama-provider, and CLI package manifests plus their `src` and
`dist` trees. This binds the live result to the source and built bytes that
implement the exercised execution path.

It contains no prompt, model output, repository content, filename, tool query or
excerpt, run ID, run-record bytes, endpoint, host details, environment values,
credentials, or absolute paths. Tests write evidence only to a temporary path.
Writing the repository evidence file requires an explicit flag.

The final `check:release` gate validates the evidence schema and recomputes the
fixture, expected-fact, acceptance-script, and closed acceptance-input digests.
Any relevant change makes the evidence stale and blocks release readiness. It
also requires the workstream ledger to report `passed` and requires
`evidenceSha256` to match the committed evidence file. The attempt ledger is
workstream state and is never copied into the candidate bundle.

If the model is absent or the one attempt fails, stop with:

```text
Phase 5 implementation complete; live evidence missing; developer preview not release-ready.
```

Do not mark the milestone complete, do not loop, and do not weaken the hard
deterministic gate. Stop only the model loaded by this acceptance run after its
result is recorded; do not stop the Ollama service or unrelated models.
Only a new explicit owner instruction may authorize replacing or resetting a
consumed ledger.

## Public claims and notices

Register every release-facing Markdown surface that contains availability,
security, invariant, or execution-boundary language. At minimum, the root
README, data-and-trust document, assurance document, and release README must be
scanned by the public-claim gate.

The coordinator owns claim markers, normalized text digests, evidence
environments, and `public-claims.yaml`. Do not change invariant law or proof
status. Keep release scope `private-incubation`; a local developer-preview
candidate does not authorize `public-release` posture.

Include `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in the candidate. Keep
the existing warning that a final dependency-license scan and SBOM are required
before publication. Do not claim that Phase 5 completes those separate gates.

## Architecture invariants

1. Product source under `packages/*/src/**`, native source and prebuilds,
   Runtime assets, provider behavior, and SDK contracts remain unchanged.
2. The deterministic compatibility command remains byte-identical.
3. SDK, Runtime, provider, and CLI dependency direction remains unchanged.
4. Candidate installation uses only four local tarballs and never falls back to
   a registry or checkout.
5. Documentation names only behavior that tests or registered limitations prove.
6. Normal onboarding does not require optional assurance infrastructure.
7. Ollama stays direct, opt-in, bounded, and model-pull-free.
8. Local records remain CLI-owned. Documentation does not describe them as
   Runtime resume, telemetry, or cloud state.
9. Plugin checking remains an ambient subprocess authoring check, not a sandbox,
   installer, trust decision, or production admission.
10. Phase 5 creates no outward-facing state and grants no publication authority.

## Coordinator and worker DAG

Use the GPT-5.6 Sol Max root session as the sole coordinator:

```text
freeze docs, schemas, claims, and failing gates
          |
          +-- deterministic/Ollama onboarding and reference docs
          +-- optional assurance documentation
          +-- candidate assembly and release-gate tooling
                            |
coordinator integration -> focused tests -> pre-live read-only review
          -> deterministic full gates -> one live evidence attempt
          -> exact-source commit -> independent final review
          -> clean-checkout full gates -> closure handoff -> clean worktree
```

The coordinator owns:

- the documentation information architecture, command snippets, schemas, and
  public wording contracts;
- `README.md`, shared links, package and root manifests, lockfile, and scripts;
- candidate composition, package set, manifest/checksum formats, and integration
  with packed acceptance;
- public-claim surfaces, markers, digests, evidence environments, and notices;
- live-evidence generation, validation, and the one-attempt ledger;
- every integration decision, fix, commit, review response, workstream update,
  and handoff.

After contract freeze, at most three implementation workers may run in one
parallel wave with disjoint paths:

| Worker | Model tier | Write scope | Must not edit |
| --- | --- | --- | --- |
| Onboarding docs | GPT-5.6 Terra | coordinator-assigned `README.md` and `docs/developer-preview/**` | claims manifest, scripts, tests, packages, assurance docs, workstream |
| Assurance docs | GPT-5.6 Terra | `docs/assurance/**` and no other path | README, developer-preview docs, claims manifest, B4 source, scripts, packages |
| Release gate | GPT-5.6 Terra | coordinator-assigned Phase 5 scripts and focused tests | README, user docs, claims manifest, package source, native assets, lockfile |

Use GPT-5.6 Luna only for bounded read-only mapping or mechanical lookups. Every
dispatch names its model, objective, source of truth, write scope, verification,
stop condition, sensitive-data policy, and output contract. Workers do not
commit. The coordinator reviews and integrates every result.

Use one milestone ledger. Permit no more than three active children and twelve
total children, including reviewers and retries. Two identical failures end
that strategy. Never make a third identical attempt. Prefer completion events
to polling. If budget forces a reduced optional review, label the result instead
of silently truncating implementation work.

## Review gate

After integration and focused tests, run a read-only pre-live review of the live
script, evidence schema, candidate assembly, public claims, and documented
behavior. Resolve confirmed findings before consuming the one live attempt.

After deterministic gates and the live attempt, commit the complete candidate
source and evidence. Dispatch independent read-only reviews against that exact
commit for:

1. onboarding accuracy, copy-paste executability, command/reference coverage,
   navigation, release-status wording, and newcomer usability;
2. local-data disclosure, remote-endpoint trust, repository/provider content
   flow, plugin ambient authority, public claims, notices, and assurance wording;
3. candidate assembly, path safety, closed package and document sets, checksum
   and evidence schemas, offline installation, checkout isolation, and
   clean-checkout reproducibility of the gate.

Reviewers never edit files. The coordinator reproduces every finding against the
exact source, fixes all confirmed P0, P1, and P2 findings, reruns affected tests,
and obtains final `READY` verdicts with no missing Phase 5 criterion.

Any fix after review creates a new exact-source commit and invalidates prior
verdicts for affected scopes. Any change to the live script, fixture, expected
fact, Runtime, repository tool, CLI execution path, or Ollama provider also
invalidates live evidence. Because Phase 5 permits only one live attempt, a
confirmed post-live change to those paths leaves the implementation complete but
the developer preview not release-ready.

## Verification and completion

Before consuming the live attempt, the implementation must pass these hard
deterministic gates under Node 26.8.1 and npm 11.19.0:

```sh
npm ci
npm run build
npm test
npm run pack:check
```

After evidence is written and the exact source is committed and reviewed, that
commit must pass the complete final gate:

```sh
npm ci
npm run build
npm test
npm run pack:check
npm run check:release
```

Run the final commands from a fresh temporary checkout or detached worktree of
the exact reviewed commit, not from a directory carrying ignored build output.
Confirm the temporary checkout has no copied `node_modules`, `dist`, coverage,
tarballs, candidate artifacts, npm cache, HOME, or XDG state before starting.
Use temporary HOME, XDG, npm-cache, and Docker-config roots. The temporary
Docker config may contain only a link to the already-installed executable
Buildx plugin needed by the reviewed Docker tests; never copy Docker
`config.json`, credentials, contexts, or other operator state. Plugin selection
requires effective execute access. Remove inherited `BUILDX_CONFIG`,
`BUILDX_BUILDER`, and `BUILDKIT_HOST` so nested Docker commands cannot select
operator Buildx state outside those temporary roots.

The deterministic gate is incomplete if a documented link or command drifts,
the candidate set is open, an artifact or module reaches into the source
checkout, installation can reach a registry, a lifecycle script runs, an
unexpected path changes, a public claim is unregistered, or release evidence is
missing or stale.

Record optional assurance separately:

- checks actually run on the exact source, with command and environment;
- checks skipped because the required Linux, KVM, QEMU, or physical-X1 host was
  unavailable; and
- no inferred or substituted result.

Phase 5 is complete only when:

- every required document exists, links resolve, and tested command snippets
  match the installed CLI;
- a closed local candidate bundle installs and completes deterministic, stubbed
  Ollama, inspection, scaffold, generated-test, and plugin-check paths outside
  the checkout;
- deterministic compatibility, source closure, package graph, native target
  checks, fake Codex compatibility, public claims, and packed-install isolation
  remain green;
- one fresh `qwen2.5:14b` live fixture passes and its bounded current evidence is
  committed;
- independent exact-source reviews return `READY`;
- all five clean-checkout commands above pass;
- the exact reviewed source and closure evidence are committed locally;
- `git status --short` is empty; and
- the Phase 5 handoff records evidence, caveats, remaining public-distribution
  blockers, and one owner-gated next action.

Do not add product features, new commands, providers, tools, scaffolds, package
APIs, Runtime behavior, registry or installer functionality, signing, SBOM or
publication machinery, namespace claims, remote configuration, release hosting,
Firecracker implementation changes, remote creation, push, PR, deployment, or
npm publication during Phase 5.
