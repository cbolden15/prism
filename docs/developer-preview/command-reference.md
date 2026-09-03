# Command reference

Use these commands through the `prism` binary installed by
`@useprism/cli@0.1.0`, either from npm or from the deterministic tarball
candidate.

```text
Usage: prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--allow-remote-endpoint <origin>] [--yes]
Usage: prism doctor [--allow-remote-endpoint <origin>] [--json]
Usage: prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--no-plugin] [--json] <goal>
Usage: prism inspect [--json] <run-id>
Usage: prism plugin create <name> [--directory <path>]
Usage: prism plugin check <path> [--json]
Usage: prism plugin declare <workspace-relative-path> --operation slugify
Usage: prism plugin undeclare
Usage: prism plugin approval --json
Usage: prism plugin approve --digest <approval-digest>
Usage: prism plugin revoke
```

## Shared behavior

Exit code 0 means success. Exit code 1 means an operational failure. Exit code 2
means a usage failure. Human-readable successful output goes to stdout and
human-readable failures go to stderr. JSON mode writes one JSON value to stdout.
Unknown options are rejected. Where the grammar accepts a positional goal or
path after options, use `--` before a value that begins with `-`, for example
`prism run -- --draft-goal`.

`plugin check` emits its ambient-authority warning on stderr before it executes
the plugin. `prism run --no-plugin` emits
`Prism run warning: project-plugin-disabled` on stderr when a declaration is
present. It ignores that declaration for this one legacy run, cannot execute the
project plugin, and cannot write V3 evidence for it.

## Configure and diagnose

`prism init` writes project or user provider configuration. Deterministic is the
default. Ollama needs `--provider ollama --model <name>` and uses the loopback
endpoint by default. A non-loopback endpoint needs `--yes` and an exact,
normalized `--allow-remote-endpoint <origin>`.

`prism doctor` checks the required Node version, active configuration and state
locations, and, for Ollama, endpoint authorization, reachability, and the
configured model. Its `--json` output is one diagnostic value.

## Run and inspect

`prism run` accepts one goal and uses `--workspace <path>` to select a
workspace. With no project declaration it persists the normal local run record
before reporting a run ID. With a declaration, it fails closed when approval,
source, artifact, or Runtime commitments do not match. Those pre-run failures
write a typed error to stderr and have no run ID. A project run that started and
then reaches a terminal failure writes its V3 record first and reports `Run:` on
stderr. `--json` reports a compact success or failure value; inspect the run ID
for the stored record.

`prism inspect [--json] <run-id>` accepts only a canonical UUID. For an admitted
project run, JSON is the complete `prism-run-record-v3` object: provider,
project configuration digest, plugin and approval identities, registry and
Runtime commitments, fixed limits and measured usage, observe-only events,
byte-count trace, terminal result, cleanup receipt or `null`, and timestamps.
Human inspection includes the final answer, so do not paste it into a public
report.

## Author, declare, approve, revoke

`prism plugin create <name>` creates the four-file tool scaffold in
`prism-plugins` by default; `--directory <path>` chooses its managed root.
`prism plugin check <path> [--json]` checks static authoring rules and executes
the fixture in a bounded child with ambient host authority. Its JSON result
includes the plugin ID, operation, execution-boundary fields, and cleanup status.

`prism plugin declare <workspace-relative-path> --operation slugify` writes
only `.prism/tool-plugin.json`; it needs an existing project config. A later
declaration replaces project intent and leaves it unapproved until confirmation.
`prism plugin undeclare` removes that declaration and returns
`Undeclared project tool plugin.` on success.

`prism plugin approval --json` prints one non-executing JSON proposal. It does
not approve, import, execute, or materialize a plugin. Read and assert its
`approvalDigest`, then pass that exact lowercase SHA-256 value to
`prism plugin approve --digest <approval-digest>`. Success prints
`Approved project tool plugin <id>: <approval-digest>`. Approval captures an
artifact before it writes the per-user record; it does not have a `--yes` or
implicit approval mode.

`prism plugin revoke` removes the active per-user approval and prints
`Revoked project tool plugin approval.` Cached artifacts may remain inert: no
artifact executes without a matching active approval.

## Source-tree compatibility checks

`npm run --silent prism:demo -- 'Count the words in: one two three'` and the
fake `npm run --silent prism:codex` command are preserved source-tree
compatibility checks. They are not installed CLI first-run routes.
