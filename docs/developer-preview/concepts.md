# Concepts

Prism is a four-package public developer preview. The SDK defines public
contracts, Runtime owns bounded execution, the Ollama provider implements the
SDK provider contract, and the CLI owns local configuration and persistence.

The [architecture guide](../architecture/README.md) maps the packages. Its
[bounded run sequence](../architecture/README.md#bounded-run-sequence) shows
the provider, policy, tool, cleanup, event, and terminal-result flow described
below.

## Bounded local execution

A run accepts one goal, obtains provider turns, applies policy admission, and
uses bounded tools before producing a terminal result. Runtime does not own
local configuration or run history. The CLI writes those records; they are not
cloud state, telemetry, or a Runtime-resume mechanism.

The deterministic provider is the default first-run path. Ollama is direct and
opt-in. The repository tool can list, read, and search only within the selected
workspace under its bounds. It is read-only, but content it reads is disclosed
to the selected provider.

## Project-pinned tool admission

The project intent file is `.prism/tool-plugin.json`. It names one
workspace-relative path and the `slugify` operation. This is separate from
per-user approval, which binds one canonical workspace, the exact project tool
configuration bytes, and plugin identity commitments. A clone at another path
or another user's approval store does not inherit approval.

Approval preview captures the manifest and runtime-closure bytes and derives
captured-byte commitments: manifest, source, registry, Runtime version, runner,
image, and profile digests. It executes no plugin. The
`prism plugin approve --digest` command materializes those approved bytes as an
inert digest-addressed artifact. The artifact cannot run by itself.

At run time, the CLI applies a restrictive policy to the exact
`release-slug#slugify` operation. It gives Runtime an owner-approved admission
ticket for one sealed participant, not workspace configuration, user approval
files, a package to discover, or an editable participant list. The ticket
confirms identity and owner approval; it does not establish safety.

The admitted tool starts with ambient subprocess authority in a local process.
It inherits the user's filesystem, network, process, and other host authority.
Typed run events are observe-only events; they cannot add a participant or
change authority. The subprocess owner returns the authoritative cleanup
receipt, which the CLI records as V3 evidence after the lifecycle settles.

## What this slice does not add

This slice has no profiles, general loader or discovery system, resource scopes,
event infrastructure, HMR, resume, or one-shot approval. It also has no public
composition-plan schema, multiple participants, user-global plugins, plugin
dependencies, search, hosted service, or automatic artifact garbage collection.

## Preview boundary

The published 0.1.0 packages are `@useprism/sdk`, `@useprism/runtime`,
`@useprism/provider-ollama`, and `@useprism/cli`. The Codex compatibility
package remains source-visible and unpublished. Source-tree checks are not
installed first-run routes, and the developer-preview APIs may change before a
stable release.
