# Provider-neutral harness plugin backlog

This backlog captures useful plugin ideas before their implementation contracts are final. An entry describes the user need and security boundary. It should not depend on an unstable wire format or Runtime API.

## Priority candidates

| Priority | Plugin | Kind | User job | Required capabilities | Sensitive data | Safe failure behavior | Status |
|---|---|---|---|---|---|---|---|
| P1 | Homelab health | Tool | Inspect service, container, backup, and host health without changing infrastructure | Read approved health endpoints and bounded command output | Hostnames, service metadata, operational status | Return no result if any source is unavailable or malformed; never infer healthy state | Idea |
| P1 | Production action approval | Policy | Require explicit authorization before deploys, restarts, configuration changes, or other outward-facing actions | Evaluate requested action, environment, actor, and approval evidence | Operator identity and deployment metadata | Deny when approval is missing, expired, ambiguous, or unverifiable | Idea |
| P2 | Work-brain retrieval | Memory | Retrieve prior decisions, gotchas, and project context relevant to the current task | Read-only search over approved work-brain content | Internal project knowledge | Return no context when scope or provenance cannot be verified | Idea |
| P2 | Model route selector | Provider | Choose an approved local or remote model based on privacy, capability, latency, and cost constraints | Read approved provider catalog and route policy | Prompt classification and provider metadata | Refuse the request when no route satisfies every constraint | Idea |
| P3 | Evidence renderer | Renderer | Convert structured execution results into concise Markdown or Telegram-ready evidence | Format validated result objects using approved templates | Operational evidence included in the result | Reject unknown fields and malformed evidence; never invent missing observations | Idea |

## Entry template

### Plugin name

- Kind: Tool, Policy, Memory, Provider, or Renderer
- User job:
- Required capabilities:
- Sensitive data:
- Safe failure behavior:
- Expected input:
- Expected output:
- Success evidence:
- Open contract questions:
- Priority: P1, P2, or P3
- Status: Idea, Researching, Contract ready, Implementing, or Verified

## Backlog rules

1. Describe the user job before the implementation.
2. Request the smallest capability set that can perform the job.
3. Define safe failure behavior before declaring the contract ready.
4. Keep ideas independent of unstable protocol details.
5. Move an entry to Implementing only after its plugin-kind contract and production test path exist.
