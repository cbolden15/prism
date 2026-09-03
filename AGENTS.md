# Prism agent instructions

Read `CLAUDE.md` for project facts and commands before changing this repository.

- Use the exact Node.js version in `.node-version` for verification.
- Keep `packages/runtime/src/core/` closed to imports outside
  `packages/runtime/src/core/`.
- Treat `docs/plans/provider-neutral-harness/` as required source material;
  constitution validation resolves paths into it.
- Do not rewrite historical Node pins in dated design records. Update active
  manifests, CI, images, and current documentation instead.
- Run `npm test` and `npm run pack:check` before reporting a release-facing
  change as complete.
