# Compatibility

This page separates the 0.1.0 package contract from optional integrations and
assurance environments. “Tested” means the path is covered by the repository's
release checks. It does not imply a hostile-code boundary.

## Toolchain

| Component | 0.1.0 status | Notes |
| --- | --- | --- |
| Node.js | 26.8.1 | Exact repository and release-check pin; package engines accept 26.8.1 through the end of Node 26 |
| npm | 11.19.0 | Exact repository and release-check pin; package engines accept 11.19.0 or newer |
| Package format | ESM | Public packages expose ESM entrypoints and TypeScript declarations |

## Operating systems

| Environment | 0.1.0 status | Scope |
| --- | --- | --- |
| macOS arm64 | Tested package target | CLI native authoring prebuild and normal local flows |
| macOS x64 | Packaged target | CLI native authoring prebuild; verify the exact host before relying on it |
| Linux arm64, glibc | Packaged target | CLI native authoring prebuild; normal CI uses Linux x64 |
| Linux arm64, musl | Packaged target | CLI native authoring prebuild |
| Linux x64, glibc | Tested package target | Normal CI, CLI native authoring prebuild, and local flows |
| Linux x64, musl | Packaged target | CLI native authoring prebuild |
| Native Windows | Unsupported for project-plugin approval | Normal preview behavior is not verified |
| WSL | Unverified | Do not infer support from Linux package targets |

“Packaged target” means the CLI release contract includes that native prebuild.
It is narrower than a claim that every Prism workflow has been exercised on
that operating system.

## Providers and execution paths

| Path | Distribution | Requirements | Network and credentials |
| --- | --- | --- | --- |
| Deterministic CLI | Built into `@useprism/cli` | Node.js and npm only | Registry access for installation; none for the run |
| Runtime API | `@useprism/runtime` plus `@useprism/sdk` | An explicit provider, policy, and tool set | Determined by the supplied adapters |
| Ollama | `@useprism/provider-ollama` | Operator-managed endpoint and installed model | Loopback by default; no Prism-held provider credential |
| Codex CLI adapter | Source-visible, unpublished | Existing Codex CLI login | Opt-in source-checkout path; no OpenAI API key read by Prism |
| Project tool plugin | `@useprism/cli` | POSIX local approval and artifact state | Plugin inherits the launching user's filesystem, network, and process authority |

## Optional assurance environments

| Lane | Required environment | Current exact-source status |
| --- | --- | --- |
| Normal deterministic run | Node.js 26.8.1 | Covered by local, compatibility, and packed-install checks |
| Docker assurance | Working Docker environment | Optional constitution and executor checks; not B4 evidence |
| B4 base | Qualified disposable Linux x86_64 B0 environment | No fresh qualified result recorded for the exact current source |
| KVM and QEMU | Qualified B0 environment plus usable imported KVM evidence | Unverified for the exact current source |
| Firecracker | Applicable qualified nested KVM environment | Current profile may report not applicable; that is not a pass |
| Physical X1 | Separately authorized read-only qualification | Unverified and not authorized by normal local commands |

Read [Local data and trust](data-and-trust.md) before running project plugins,
and use [Optional assurance](../assurance/README.md) for the environment-specific
commands and evidence rules.

## Versioning posture

Prism 0.1.0 is a developer preview. Public package versions are aligned at
0.1.0, and APIs and behavior may change before a stable release. Release notes
record user-visible changes. A formal migration and deprecation policy will be
added before compatibility guarantees extend beyond the preview.
