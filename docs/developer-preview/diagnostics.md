# Diagnostics

## Diagnostic matrix

| Symptom | Bounded cause | Next command |
| --- | --- | --- |
| unsupported Node; unsupported npm | The pinned toolchain is not active. | `node --version && npm --version` |
| config root or state root unwritable | A required local data root is missing, unsafe, or not writable. | `prism doctor` |
| remote endpoint not authorized | The exact non-loopback origin was not approved for this configuration. | `prism doctor --allow-remote-endpoint <origin>` |
| Ollama unavailable; model not found | The loopback service is unavailable or the configured model is not installed. | `prism doctor` |
| malformed-response; oversized-response; timeout | The provider response violated a bounded response or deadline check. | `prism doctor` |
| invalid run ID; invalid record | The ID is not canonical, or the local record is absent or malformed. | `prism inspect --json <run-id>` |
| repository path rejected | The requested repository path is outside the selected workspace or violates a tool bound. | `prism run <goal>` |
| native-unavailable; native-integrity | The native authoring target is unsupported or packaged bytes failed integrity verification. | `prism plugin create packed-tool` |
| root-unmanaged; destination-exists | The authoring root is unmanaged or the requested destination exists. | `prism plugin create packed-tool` |
| manifest-invalid; execution; output-limit; cleanup-failed | The plugin static check or bounded child stage rejected the fixture. | `prism plugin check prism-plugins/packed-tool` |
| `project-plugin-approval-missing`; approval | The project has intent but no active matching per-user approval. | `prism plugin approval --json` |
| `project-plugin-approval-mismatch`; approval | Approval no longer binds this workspace, declaration, or captured commitments. | `prism plugin approval --json` |
| `project-plugin-approval-digest-mismatch`; approval | The supplied digest is not the currently displayed proposal digest. | `prism plugin approval --json` |
| `source-closure`; import | A runtime file has a rejected source/import closure. | `prism plugin check prism-plugins/release-slug` |
| `project-plugin-artifact-*`; artifact | Local artifact state is unsafe, invalid, unavailable after repair, or inconsistent with approval. | `prism plugin approval --json` |
| `project-plugin-disabled`; `--no-plugin` | This warning confirms a deliberate legacy run with no project-plugin V3 evidence. | `prism run --no-plugin <goal>` |
| `project-plugin-lifecycle-receipt-missing`; evidence cleanup | The child lifecycle began but its authoritative cleanup receipt was unavailable. | `prism plugin revoke` |
| `project-plugin-approval-changed`; reapprove | Source or approval context changed while approval was being written. | `prism plugin approval --json` |

For missing, mismatched, revoked, or changed approval, inspect the fresh proposal,
assert the displayed context and digest, and run `plugin approve` with that exact
digest. Do not reuse an old digest or bypass admission with direct execution.
For source, import, or artifact drift, fix the reported tree first, rerun the
static check, then inspect and reapprove. If a collaborator needs the legacy
path temporarily, use `--no-plugin` deliberately and read its warning.

`project-plugin-lifecycle-receipt-missing` produces no run ID or stored record.
Revoke approval to block another plugin run while you verify that the child
process group has stopped; there is nothing for `prism inspect` to read.

Keep diagnostics scoped to the reported code or summary. Do not weaken checks,
elevate privileges, paste secrets, or copy complete local run records into an
issue report.
