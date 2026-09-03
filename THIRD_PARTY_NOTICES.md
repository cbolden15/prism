# Third-party notices

Prism depends on third-party packages and, in its optional X1 assurance path,
pins external build artifacts. This file is an index, not a replacement for
the original license texts.

## npm packages

The published CLI bundles these third-party runtime dependencies:

- `acorn` 8.18.0 (MIT)
- `acorn-walk` 8.3.5 (MIT)

Their license files remain in the bundled dependency directories inside the
CLI tarball. The repository build and assurance checks also use `ajv` (MIT),
`yaml` (ISC), `@types/node` (MIT), `c8` (ISC), `tsx` (MIT), and `typescript`
(Apache-2.0). Exact direct and transitive versions are recorded in
`package-lock.json` and the full dependency license report generated alongside
the production-only release SBOM.

## X1 assurance artifacts

The frozen artifact inventory is
`pnh/x1-firecracker/b0/toolchain.lock.json`. Bundled license and notice texts
are under `pnh/x1-firecracker/licenses/` for Node's Docker image, Rust,
Firecracker, Linux, Buildroot, cargo-deny, Syft, and Trivy.

The 0.1.0 release workflow generates an exact-commit SBOM, validates the full
dependency-license inventory, and attests the published artifacts. Those
records establish artifact origin and dependency identity; they do not establish
that third-party code is safe.
