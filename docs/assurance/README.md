# Optional assurance

Prism’s normal local developer-preview path is separate from assurance work.
Start with the [deterministic first run](../developer-preview/getting-started.md#deterministic-first-run).
It does not require Docker, Rust, Firecracker, QEMU, KVM, a physical X1 host,
or a provider account. The optional Ollama path has its own operator-managed
requirements in the same guide.

This page is the entrypoint for checks that add assurance evidence. They are
not a substitute for the normal local path, and normal local success is not
evidence for an assurance profile.

The [assurance-lanes diagram](../architecture/README.md#optional-assurance-lanes)
keeps normal local execution, Docker checks, B4, and physical X1 qualification
visually separate.

## Optional Docker assurance

The Docker-backed constitutional and plugin-executor checks are documented in
`pnh/README.md`. Their sources of truth are the constitution under
`assurance/constitution/` and the public-claim surface at
`assurance/constitution/contracts/public-claims.yaml`. The associated checks
are run from a checkout, including `npm run test:pnh` and the constitution
commands recorded in `CLAUDE.md`.

These checks need a working Docker environment. They exercise the checked-in
assurance and Docker configuration; they do not qualify a Linux KVM host or a
physical X1 host. In particular, Docker Desktop, a macOS run, source-file
inspection, or a passing normal local run does not substitute for B4 evidence.

## Optional B4 and X1 assurance

The B4 implementation plan is
`docs/plans/provider-neutral-harness/2026-08-29-prism-harness-x1-microvm-b4-implementation-plan.md`.
The current profile dispatcher is `pnh/x1-firecracker/b0/run-profile.sh`, and
the existing Gate A workflow is `.github/workflows/x1-gate-a.yml`. These are
source paths, not deterministic-tarball links: the tarball candidate includes
this explanation, not the B4 implementation tree.

Run B4 profiles only from the qualified environment described by those sources:

| Profile | Required environment and evidence |
| --- | --- |
| `npm run --silent b4:check` and `npm run --silent b4:test:unit` | A qualified B0 environment: a disposable Linux x86_64 VM, a dedicated non-sudo identity, and the rootless, network-disabled inner container. It must run outside macOS and X1. |
| `npm run --silent b4:test:qemu` | The qualified B0 environment plus the required imported KVM evidence. The nested disposable KVM VM must expose usable `/dev/kvm`; QEMU-only execution is not KVM proof. |
| `npm run --silent b4:test:firecracker` and `npm run --silent b4:test:acceptance` | The qualified disposable nested KVM environment when their implementation becomes applicable. In the present milestone, the dispatcher reports these profiles as not applicable; that is not passing evidence. |
| `npm run --silent b4:reproduce`, `npm run --silent b4:scan-public`, and `npm run --silent b4:verify` | Their source-defined qualified B0 inputs and retained evidence. `b4:verify` executes the applicable profiles; a profile that cannot run is `BLOCKED`, not passing. |

The physical X1 path is separate. It requires a separately authorized,
read-only `B4-X1-READ` qualification collection. That collection records the
physical-host facts needed by the plan without installing or executing B4 source
on X1. It does not authorize an X1 mutation, deployment, or release.

## Evidence status

<!-- pnh:limitation:PNH-CLAIM-21:begin -->
No qualified Linux x86_64, KVM, QEMU, Firecracker, or physical X1 assurance
result is verified here for the exact Phase 5 source. Those environments remain
explicitly unverified unless their own fresh, runner-bound evidence is recorded.
File inspection, macOS checks, Docker checks, a container-only simulation, or
evidence from another source revision must not be represented as a substitute.
<!-- pnh:limitation:PNH-CLAIM-21:end -->

## What this does not change

This navigation page does not alter constitutional claims, B4 scripts, profile
behavior, the Gate A workflow, platform support, or the existing environment
limitations. It does not authorize running qualified assurance profiles.
