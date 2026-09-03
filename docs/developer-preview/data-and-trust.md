# Local data and trust

The CLI owns local configuration, approval records, artifacts, and run records.
Configuration stores no provider credentials.

<!-- pnh:limitation:PNH-CLAIM-18:begin -->
| Data | Location |
| --- | --- |
| Project config | `<workspace>/.prism/config.json` |
| Project tool declaration | `<workspace>/.prism/tool-plugin.json` |
| User config | `${XDG_CONFIG_HOME:-~/.config}/prism/config.json` |
| Remote endpoint trust | `${XDG_CONFIG_HOME:-~/.config}/prism/trust.json` |
| Per-user approval | `${XDG_CONFIG_HOME:-~/.config}/prism/plugin-approvals/v1/<workspace-sha256>.json` |
| Run records | `${XDG_STATE_HOME:-~/.local/state}/prism/runs/<run-id>.json` |
| Artifact cache | `${XDG_STATE_HOME:-~/.local/state}/prism/plugin-artifacts/v1/<registry-digest>/` |
| Default authoring root | `<cwd>/prism-plugins` |
<!-- pnh:limitation:PNH-CLAIM-18:end -->

Project tool declarations use `prism-project-tool-plugin-v1`. Per-user approval
uses a separate `prism-project-plugin-approval-v1` record; its workspace key is
a SHA-256 lookup key for the canonical workspace. The artifact cache at
`plugin-artifacts/v1/<registry-digest>` holds the captured registry, pins, and
runtime closure. It is an inert cache entry, not approval state.

Approval and artifact state are local, POSIX-only in this slice. Prism expects
the approval parents and record to be regular, current-user-owned, symlink-free,
and not group- or world-writable. Artifact reuse applies the same restrictive
local-state checks. Windows returns an unsupported-platform failure for
project-plugin approval; native Windows and WSL remain unverified.

## V3 inspection and retained data

An admitted run stores `prism-run-record-v3` with exactly these top-level
fields: `version`, `runId`, `provider`, `project`, `plugin`, `approval`,
`registry`, `runtime`, `boundary`, `limits`, `usage`, `events`, `trace`,
`terminal`, `cleanup`, `startedAt`, and `endedAt`. It retains the provider name
and model, project-config digest, plugin and operation identities, approval and
Runtime commitments, fixed limits, numeric usage, typed observe-only events,
per-call byte counts, terminal result, and cleanup fields. Its fixed boundary
claim is `identity-and-owner-approval`.

V3 evidence fields omit raw plugin input, raw plugin output, raw plugin error
text, raw paths, canonical workspace paths, and raw goal text. The trace has
only tool ID, operation, sequence, and byte counts. The terminal answer is the
provider's final answer, not a raw plugin payload; it may still include
sensitive local data. `cleanup: null` means no plugin lifecycle began.
Otherwise, cleanup retains only the trigger, exit code, OOM status, confirmed
absence, cleanup-error count, and settlement duration.

Goals and final answers are persisted by legacy records and may be sensitive
local operator data. Sanitized legacy tool traces omit raw file contents,
queries, and excerpts. The selected provider still receives the prompt and any
repository content read for that run.

## Boundaries

<!-- pnh:limitation:PNH-CLAIM-19:begin -->
- The repository tool is bounded and read-only, but it is
  not a confidentiality boundary from the selected provider.
- Identity approval is not a safety guarantee. Subprocess plugins inherit
  ambient host authority, and the subprocess is not a sandbox.
- `plugin check` validates one authoring fixture and original process-group
  cleanup. It does not establish safety, installation, trust, Runtime admission,
  or control of deliberately detached descendants.
- In-package native digests detect inconsistency. They are not signatures or an
  independent provenance root.
- Native Windows and WSL remain unverified. The preview targets the supported
  macOS and Linux combinations recorded by the package contract.
<!-- pnh:limitation:PNH-CLAIM-19:end -->
