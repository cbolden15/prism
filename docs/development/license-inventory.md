# License inventory

**Project license:** Apache-2.0

## Release surfaces

| Surface | Inventory source | Verification before publication |
|---|---|---|
| Full npm dependency graph, including build and development tools | `package-lock.json` | Run `npm audit --audit-level=low --include=dev --include=optional --include=peer`, then `scripts/release/generate-oss-sbom.mjs` to enforce the license allowlist and write the full license report |
| Four public npm packages | Package manifests and the closed candidate | Run `npm run pack:check`; generate the production release-set SPDX document; attest and publish only the candidate tarballs listed in `candidate.json` |
| CLI native authoring add-ons | `packages/cli/prebuilds/manifest.json`, `packages/cli/prebuilds/provenance.json`, and `packages/cli/native/Dockerfile.prebuilds` | Run the always-on Native prebuild reproducibility workflow and require its uniquely named verification job |
| Node sandbox and plugin-runner image | `pnh/harness/sandbox/image.lock.json`, `pnh/kernel/plugin-runner/image.lock.json` | Resolve the pinned OCI index and compare labels and version |
| X1 B4 toolchain | `pnh/x1-firecracker/b0/toolchain.lock.json` | Run B4 lock verification and compare bundled license hashes |
| Firecracker and Linux inputs | `pnh/x1-firecracker/firecracker/upstream.lock.json` | Run the qualified B4 source and license gates |

`THIRD_PARTY_NOTICES.md` is the human-readable index. Lockfiles and bundled
license texts are authoritative for exact artifact versions.
