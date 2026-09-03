# Prism 0.1.0 developer preview

<!-- pnh:limitation:PNH-CLAIM-22:begin -->
Prism 0.1.0 is a public developer preview under the `@useprism` npm scope. It
is not a stable release: APIs and behavior may change. Registry installation is
the primary route. The local deterministic tarball candidate is an acceptance
artifact, not an independent distribution channel. Only the GitHub release
workflow adds npm provenance and GitHub attestations to the exact verified
candidate.

The CLI package ships six native authoring add-ons for Darwin arm64/x64 and
Linux arm64/x64 with GNU or musl. A separate GitHub-hosted workflow rebuilds
those files with pinned toolchain inputs, compares every byte with the
committed files, load-tests each target, and attests the verified binaries.
That check does not turn the wider npm tarball into a cross-platform
reproducible build.
<!-- pnh:limitation:PNH-CLAIM-22:end -->

Start with the [deterministic first run](../../developer-preview/getting-started.md#deterministic-first-run).
The optional Ollama path follows it in the same guide. Read
[local data and trust](../../developer-preview/data-and-trust.md) before using
repository content or authoring a plugin.

## Install from npm

Install the CLI locally in a project. It brings the matching Runtime, SDK, and
Ollama provider packages with it.

```sh
npm install --save-dev @useprism/cli@0.1.0
```

## Published packages

- `@useprism/sdk` 0.1.0: public contracts and validation helpers
- `@useprism/runtime` 0.1.0: bounded agent execution and plugin lifecycle
- `@useprism/provider-ollama` 0.1.0: direct Ollama provider adapter
- `@useprism/cli` 0.1.0: the local `prism` command

`packages/provider-codex` remains source-visible and unpublished. It is an
opt-in compatibility adapter, not a registry installation or first-run route.

## Deterministic tarball candidate

The release acceptance workflow also assembles a closed candidate with
the same four package tarballs:

- `@useprism/sdk` 0.1.0
- `@useprism/runtime` 0.1.0
- `@useprism/provider-ollama` 0.1.0
- `@useprism/cli` 0.1.0

It also includes the developer-preview and optional-assurance documentation,
`LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `candidate.json`, and
`SHA256SUMS`. The Codex compatibility package is not part of the candidate and
is not an installed first-run route.

`candidate.json` records the clean source commit, pinned Node and npm versions,
package files, document files, and their SHA-256 digests. `SHA256SUMS` covers
every candidate file except itself. These digests detect changed candidate
bytes. They are not signatures, independent provenance, or a claim of
byte-for-byte reproducibility across platforms or npm versions.

## Release evidence

Deterministic acceptance and the local HTTP stub are the hard automated gates.
`ollama-live-evidence.json` is committed historical repository-only evidence
for the already-consumed Phase 5 live Ollama attempt. It is not copied into the
candidate, and `check:release` does not read, validate, mutate, or consume it.

The evidence file records only the model identifier, result class, timestamp,
and SHA-256 digests for the fixture, expected fact, acceptance script, and the
closed SDK, Runtime, Ollama-provider, and CLI acceptance-input tree. It omits
the prompt, model output, repository content, run records, endpoint, host
details, environment values, credentials, or local paths. The private
one-attempt ledger is workstream state and is not copied into the candidate.

Missing, failed, stale, or ledger-mismatched historical live state cannot block
the deterministic release gate. Automation does not retry the historical live
check or install a model on the operator's behalf.

## Assurance and release boundary

[Optional assurance](../../assurance/README.md) records separate constitutional,
Docker, B4, and X1 boundaries. Normal local success is not evidence for a
qualified Linux, KVM, QEMU, Firecracker, or physical-X1 environment.

The release workflow publishes npm provenance for each package and GitHub
attestations for the exact package tarballs and SBOM. Those records bind
artifacts to the public source commit and workflow; they do not establish code
safety or byte-for-byte reproducibility across platforms or npm versions.
Publishing the four packages does not authorize creating a hosted service,
deploying Prism, or publishing the source-visible Codex provider.
