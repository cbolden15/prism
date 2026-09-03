# Prism by Vora

<!-- pnh:limitation:PNH-CLAIM-01:begin -->

Prism 0.1.0 is a public developer preview. The published package boundary is
the SDK, Runtime, Ollama provider, and CLI. The Codex provider remains visible
in the source tree and unpublished. This release does not assert completed
high-assurance closure; the proof and environment limitations below remain.

<!-- pnh:limitation:PNH-CLAIM-01:end -->

<!-- pnh:claim:PNH-CLAIM-16:begin -->

## North star

Prism is a provider-neutral runtime for building, running, and
inspecting goal-oriented AI agents with pluggable models, tools, and policies.

The first open-source milestone is one deterministic local agent loop: a
scripted provider chooses the committed `text-stats` tool, a policy admits one
bounded call, the tool executes through the subprocess plugin path, and the
provider returns the final answer with an ordered trace. The developer-preview
implementation lives in
`packages/runtime/src/runtime/bounded-local-coordinator.ts`, with the
composition in `packages/cli/src/deterministic/prism-demo.ts` and the exact
compatibility acceptance test in `tests/compat/prism-demo.test.ts`. The test executes the package command
twice, compares byte-identical output, and requires confirmed cleanup receipts
for both provider turns, the policy, and the tool. The milestone contract is
`docs/plans/provider-neutral-harness/2026-08-29-prism-harness-oss-mvp-reset.md`.

Use the developer-preview demo command:

```sh
npm run --silent prism:demo -- 'Count the words in: one two three'
```

The JSON answer is `3 words` with the six ordered events specified by the
milestone contract. This path needs no API key, provider account, network
request, model download, Docker service, or daemon.

<!-- pnh:claim:PNH-CLAIM-16:end -->

<!-- pnh:claim:PNH-CLAIM-02:begin -->

## Layout

- `packages/sdk/`: provider, tool, policy, manifest, registration, and protocol contracts.
- `packages/runtime/src/core/`: pure contracts and validation. No imports leave this directory.
  Enforced, not promised (see below).
- `packages/runtime/`: bounded execution, launchers, adapters, and explicit runtime assets.
- `packages/cli/`: the `prism` binary, versioned local config and trust, CLI-owned run records, inspection, and deterministic assets.
- `packages/provider-codex/`: the opt-in Codex CLI adapter and deterministic fake test.
- `assurance/constitution/`, `pnh/tests/`, and `tests/compat/`: assurance and compatibility checks.

<!-- pnh:claim:PNH-CLAIM-02:end -->

<!-- pnh:claim:PNH-CLAIM-03:begin -->

## Enforcement (C19 mechanisms)

`npm run test:pnh` starts with two checks of different scope. The `tsc` strict
typecheck reads the assurance, package, PNH, and compatibility-test includes in
`tsconfig.pnh.json`. The realpath-aware NodeNext module-graph closure checker
walks `packages/runtime/src/core/` alone and rejects an import that leaves that
directory. Enforced, not promised.

<!-- pnh:claim:PNH-CLAIM-03:end -->

<!-- pnh:claim:PNH-CLAIM-13:begin -->

The same command then executes the core suite in fresh Docker workers with the
manifest-scoped loader transform and dynamic code generation unavailable, and
applies container-owned `c8 --all --100` over every `core/**/*.ts` file so no
unimported body escapes execution. The parent test process carries a
resolved-URL guard against direct, transitive, computed, and symlinked loads of
`core/`. The entrypoint removes the bootstrap manifest before tests start; a
separate supervisor keeps it in memory and hands it to each fresh worker
through a private file descriptor, so a worker reads the manifest from that
descriptor rather than from a writable path. PNH-INV-12, PNH-INV-25, and
PNH-INV-27 are unproven, so this describes the mechanism in the tree, not a
property the project stands behind.

<!-- pnh:claim:PNH-CLAIM-13:end -->

<!-- pnh:limitation:PNH-CLAIM-04:begin -->

The lexical class of checking is deliberately absent: it was demonstrated
fail-open (DSH Rounds 2–3, threat-model Section 12 on branch
`x1/dsh-extraction-readiness-plan`).

<!-- pnh:limitation:PNH-CLAIM-04:end -->

## Run the local subprocess example

On macOS or Linux with Node.js 26.8.1 installed, run:

```sh
npm ci
npm run build:packages
npm run prism:example -- "one two three"
```

Expected output:

```json
{
  "text": "one two three",
  "characters": 13,
  "words": 3,
  "lines": 1
}
```

This command needs no Docker service, API key, or provider account.

<!-- pnh:claim:PNH-CLAIM-15:begin -->

It executes the committed `text-stats` plugin as a real subprocess through
registry generation, owner-pinned admission, launch-side digest re-derivation,
the gateway, registration, one operation, and confirmed cleanup. PNH-INV-29 is
partial, so this is the path this one example takes, not a property of every
composition.

<!-- pnh:claim:PNH-CLAIM-15:end -->

The plugin is in `packages/cli/assets/deterministic/plugins/text-stats/`; the
composition code is `packages/cli/src/deterministic/local-text-stats.ts`.

## Run the Codex provider

<!-- pnh:claim:PNH-CLAIM-05:begin -->

This integration uses the Codex CLI's existing ChatGPT login. It does not
need an OpenAI API key, and Prism does not read or copy Codex credential
files. Confirm the local CLI login, then run one prompt:

```sh
codex login status
npm run prism:codex -- "Reply with a one-sentence explanation of capability pinning."
```

The provider invokes `codex exec` with the prompt on stdin, an ephemeral
session, ignored user configuration, the CLI's own read-only file access
mode, and a separate temporary working directory. It returns the CLI's
final-message artifact as a validated provider response.

<!-- pnh:claim:PNH-CLAIM-05:end -->

<!-- pnh:limitation:PNH-CLAIM-06:begin -->

Prism makes no sandbox claim for this path. `codex exec` runs as a trusted
subprocess under `trusted-subprocess-v1`, which designates an ambient-authority
boundary and not a hostile-code boundary, so the CLI keeps the ambient host
authority of the user who launched it.

<!-- pnh:limitation:PNH-CLAIM-06:end -->

<!-- pnh:limitation:PNH-CLAIM-14:begin -->

Normal test runs use a deterministic fake `codex` executable and never call a
cloud service. They hold no provider credential and produce no evidence about
the live provider path. The trusted-Mac acceptance test is opt-in:

<!-- pnh:limitation:PNH-CLAIM-14:end -->

```sh
PRISM_LIVE_CODEX=1 npm run test:provider-codex
```

## Plugin runtime trust model

<!-- pnh:claim:PNH-CLAIM-07:begin -->

Prism includes a Docker-container plugin executor. Its launch profile
in `packages/runtime/src/kernel/plugin-runner/launch-profile.json` sets no network
(`network: none`), a read-only root filesystem, all Linux capabilities dropped
(`capDrop: ["ALL"]`), a seccomp profile, resource caps (memory, CPU, PID
count), and a non-root uid/gid (`10101:10101`).

<!-- pnh:claim:PNH-CLAIM-07:end -->

<!-- pnh:limitation:PNH-CLAIM-08:begin -->

A second, additive "bare subprocess" executor exists and is routable
(`packages/runtime/src/harness/plugin-spawn-supervisor.mjs`, wired through
`packages/runtime/src/harness/sandbox/broker-gateway.mjs`). It does **not** close the Network
or Filesystem boundaries the way the Docker executor does: a subprocess
plugin runs on the host with the host's network and filesystem visible
to it, subject only to whatever uid/gid the process is launched under.
uid/gid drop on the subprocess path is best-effort, not reliable
privilege dropping — under a normal unprivileged invocation (the common
case, not an edge case) the drop itself typically fails with `EPERM` and
is a no-op.

Given that, the real boundary for the subprocess path is supply-chain trust
in the plugin itself, not runtime sandboxing. Two library mechanisms now exist
in code.

<!-- pnh:limitation:PNH-CLAIM-08:end -->

<!-- pnh:claim:PNH-CLAIM-09:begin -->

The first is owner-pinned plugin digests. The deterministic composition commits
`{id, manifestDigest, sourceDigest}` per plugin to
`packages/cli/assets/deterministic/plugin-pins.json`.
`packages/runtime/src/runtime/pinned-admission.ts` admits a registry
only when the pinned set and registry set match exactly. It re-derives the
manifest digest from the descriptor, the source digest from the plugin tree,
and the spawn executor's runner, artifact, and profile commitments. It then
recomputes the version digest from those verified values. The source check
requires an exact directory listing: `manifest.json`, every declared file,
and nothing else. An undeclared file causes refusal. The committed pin record
covers the owner-reviewed `allow-text-stats`, `local-scripted`, and
`text-stats` examples. Adding or changing a plugin
requires updating its reviewed manifest and source digests.

`packages/runtime/src/runtime/pinned-spawn-launch.ts` applies the same identity at launch. It
re-derives the selected directory's exact listing, normalized manifest digest,
and source digest before building a launch spec. A byte-identical copy at a
different path is valid because the owner approved content, not a pathname.
The caller must run the exported unchanged-tree assertion immediately before
handing the spec to the spawn supervisor.

<!-- pnh:claim:PNH-CLAIM-09:end -->

<!-- pnh:limitation:PNH-CLAIM-10:begin -->

This mechanism has three limits. First, the pin file and plugin root come from
the caller. Runtime and SDK commitment paths default to their installed package
artifacts, but the low-level API also accepts explicit path overrides for
controlled tests and embedding. The result is relative to every selected path,
so a composition must anchor them to owner-reviewed artifacts. Second, the tree
is checked before spawn, not atomically by `spawn` itself. The owning user can
still rewrite files in the remaining check-to-use window. Treat this as
tamper-evident, not tamper-proof. Third, commitment recomputation covers the
spawn executor. The Docker path's `imageDigest` names an image this code does
not independently rebuild and verify.

<!-- pnh:limitation:PNH-CLAIM-10:end -->

<!-- pnh:limitation:PNH-CLAIM-11:begin -->

The second mechanism is advisory capability disclosure in
`packages/runtime/src/runtime/plugin-disclosure.ts`. It reports the broker capabilities each
admitted plugin requested and labels every line `ownerApproved=true` or
`ownerApproved=false`. A harness running without pins can therefore disclose
what plugins requested without claiming approval. The output also states that
it excludes ambient host authority inherited by a subprocess, including host
filesystem and network access. A subprocess inherits stdout and can print the
same prefix, so only output attributable to the harness composition root is
trustworthy disclosure.

<!-- pnh:limitation:PNH-CLAIM-11:end -->

<!-- pnh:limitation:PNH-CLAIM-12:begin -->

The deterministic `prism run` command now exercises both mechanisms from a
packed developer-preview CLI. The packed CLI supports project or user `init`,
`doctor`, persisted deterministic and direct Ollama runs, and UUID-only
`inspect` under local HOME/XDG paths. Ollama runs use the bounded general
Runtime and a read-only repository tool. Remote Ollama endpoints are
exact-origin trust-gated before CLI diagnostics or provider execution can
contact them. Publishing the developer-preview packages does not force every
library caller through pinned admission. Pin approval is ordinary git review,
and cryptographic signing does not exist.

<!-- pnh:limitation:PNH-CLAIM-12:end -->
