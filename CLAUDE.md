# Prism

**Last Updated:** 2026-09-03
**GitHub:** https://github.com/cbolden15/prism
**Stack:** TypeScript, Node.js 26.8.1, Docker plugin isolation, optional Rust and Firecracker assurance

## Quick Reference

| Property | Value |
|----------|-------|
| Local Dev | Headless CLI/library; no port |
| Staging | TBD |
| Production | Public npm packages under `@useprism`; X1 remains optional and disabled |

## Architecture

Prism is a provider-neutral agent runtime implemented as npm workspaces.
Providers, tools, and policies are plugins. The runtime owns bounded execution,
admission, events, cleanup, and terminal results. Firecracker is an optional
assurance adapter, not the default execution path.

## Key Files

| File | Purpose |
|------|---------|
| `pnh/README.md` | Detailed implementation status and trust claims |
| `packages/runtime/src/runtime/bounded-local-coordinator.ts` | Deterministic bounded agent loop |
| `packages/sdk/` | Public provider and plugin contracts |
| `packages/cli/` | CLI and deterministic provider, policy, and tool assets |
| `assurance/constitution/` | Root-private constitutional checks and data |
| `docs/plans/provider-neutral-harness/2026-08-29-prism-harness-oss-mvp-reset.md` | Adopted OSS product direction |
| `.node-version` | Canonical Node.js version |

## Common Commands

```bash
npm ci
npm run --silent prism:demo -- 'Count the words in: one two three'
npm run typecheck
npm run test:constitution
npm run test:host
npm test
npm run pack:check
```

## Environment Variables

The deterministic demo and normal test suite require none. Live provider
examples use provider-specific opt-in variables or an existing provider CLI
session. See `.env.example`; never commit credentials.

## Deployment

**Target:** Public OSS packages through `.github/workflows/release.yml`.

Package publication must use the exact tested candidate tarballs, the
`npm-release` GitHub environment, npm provenance, and the release gates. X1 is
not part of package publication and remains disabled unless separately
authorized.

## Gotchas

- Plain `npm run` writes its own banner to stdout. Use `npm run --silent` for
  byte-exact CLI acceptance tests.
- `docs/plans/provider-neutral-harness/` is a runtime validation dependency,
  not disposable planning material.
- The subprocess plugin path inherits ambient host authority. It is not a
  hostile-code sandbox.
- Full B4 verification requires a qualified Linux x86_64 environment and must
  not be treated as verified by macOS-only checks.

See `docs/engineering/gotchas/` for the registry.
