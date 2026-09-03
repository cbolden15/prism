# Architecture

Prism 0.1.0 is a provider-neutral TypeScript runtime for bounded agent runs.
The CLI composes a provider, a policy, and explicit tools around Runtime. SDK
packages define the contracts. The CLI also owns local configuration, approval
records, artifacts, and run-record persistence.

These diagrams describe the shipped developer preview. Historical plans under
`docs/plans/` explain how the design developed, but they are not the current
product overview.

## System and packages

[Mermaid source](diagrams/system-and-packages.mmd)

```mermaid
flowchart LR
  operator["Developer or operator"] --> cli["@useprism/cli<br/>published"]
  integrator["Runtime integrator"] --> runtime["@useprism/runtime<br/>published"]
  cli --> runtime

  sdk["@useprism/sdk contracts<br/>published"] --> runtime
  sdk --> cli
  ollama["@useprism/provider-ollama<br/>published, optional local service"] --> runtime
  deterministic["Deterministic provider<br/>CLI asset, no network"] --> runtime
  codex["@useprism/provider-codex<br/>source-only, unpublished"] -. optional source path .-> runtime

  runtime --> provider["Selected provider"]
  runtime --> policy["Policy admission"]
  runtime --> tools["Explicit tools"]
  tools --> projectPlugin["Approved project plugin<br/>ambient subprocess authority"]
  cli --> localState["Local config, approvals,<br/>artifacts, and run records"]

  assurance["Optional assurance lanes<br/>Docker, B4, and X1"] -. separate from normal execution .-> runtime
```

Text equivalent: CLI users enter through `@useprism/cli`; library users enter
through `@useprism/runtime`. Runtime coordinates a selected provider, policy
admission, and explicit tools using contracts from `@useprism/sdk`. The
deterministic provider is a CLI asset. The Ollama adapter is published and
needs an operator-managed service. The Codex adapter is visible in source but
is not published. The CLI writes local state. Approved project plugins run as
ambient-authority subprocesses. Docker, B4, and X1 are separate assurance
lanes, not the normal execution path.

## Bounded run sequence

[Mermaid source](diagrams/bounded-run.mmd)

```mermaid
flowchart TD
  goal["Goal"] --> accepted["1. goal.accepted"]
  accepted --> providerOne["Provider turn 1"]
  providerOne --> requested["2. provider.tool-requested"]
  requested --> policy["Policy reviews the exact tool request"]
  policy --> allowed["3. policy.allowed"]
  allowed --> tool["One bounded tool call"]
  tool --> completed["4. tool.completed"]
  completed --> cleanup["Subprocess cleanup receipt<br/>when the selected adapter owns a child"]
  cleanup --> providerTwo["Provider turn 2<br/>with the tool result"]
  providerTwo --> finalized["5. provider.finalized"]
  finalized --> terminal["Completed terminal result"]
  terminal --> runCompleted["6. run.completed"]

  limits["Fixed limits<br/>turns, calls, bytes, deadline"] -. bound .-> providerOne
  limits -. bound .-> policy
  limits -. bound .-> tool
  limits -. bound .-> providerTwo
```

Text equivalent: Runtime accepts a goal, asks the provider for a decision,
passes each tool request to policy, invokes the admitted tool, and gives the
result back to the provider. It produces a terminal result after the second
provider turn. Fixed turn, call, byte, and deadline limits bound the loop. The
deterministic CLI composition emits the six events shown in order. An adapter
that starts a subprocess also owns its cleanup receipt.

## Project-plugin admission and execution

[Mermaid source](diagrams/plugin-admission.mmd)

```mermaid
flowchart TD
  scaffold["Project-owned plugin source"] --> check["plugin check<br/>execution diagnostic"]
  check --> warning["Runs with ambient host authority<br/>not a sandbox"]

  scaffold --> declaration[".prism/tool-plugin.json<br/>project intent"]
  declaration --> capture["Capture manifest and runtime closure"]
  capture --> commitments["Component commitments<br/>and approval digest"]
  commitments --> proposal["plugin approval --json<br/>non-executing proposal"]
  proposal --> inspect["Operator inspects proposal"]
  inspect --> approval["Per-user digest approval"]
  approval --> boundary["Identity and owner approval<br/>not safety"]
  approval --> artifact["Inert digest-addressed artifact"]
  artifact --> ticket["Owner-approved admission ticket<br/>one sealed participant"]
  ticket --> policy["Restrictive operation policy"]
  policy --> execute["Ambient subprocess authority"]
  execute --> receipt["Authoritative cleanup receipt"]
  receipt --> record["prism-run-record-v3"]
```

Text equivalent: a project declaration records intent. `plugin approval`
captures the manifest and runtime closure and returns a non-executing proposal.
The operator inspects its commitments and approves that digest. Prism stores
the captured bytes as an inert artifact and gives Runtime an admission ticket
for one participant. A restrictive policy admits the declared operation. The
plugin then runs with the user's ambient host authority. The approval proves
identity and owner approval, not safety. Cleanup evidence is written into the
V3 run record. `plugin check` is a separate execution diagnostic and also runs
the plugin with ambient authority.

## Local data and evidence

[Mermaid source](diagrams/local-data-and-evidence.mmd)

```mermaid
flowchart LR
  workspace["Workspace"] --> projectConfig[".prism/config.json"]
  workspace --> declaration[".prism/tool-plugin.json"]

  userConfig["XDG config root"] --> config["prism/config.json"]
  userConfig --> trust["prism/trust.json"]
  userConfig --> approvals["plugin-approvals/v1/<br/>workspace-sha256.json"]

  userState["XDG state root"] --> artifacts["plugin-artifacts/v1/<br/>registry-digest/"]
  userState --> records["runs/<run-id>.json"]

  records --> retained["Retained in V3<br/>identities, commitments, limits,<br/>usage, events, terminal answer, cleanup"]
  records --> omitted["Omitted from V3 evidence<br/>raw plugin input and output,<br/>raw errors, raw paths, raw goal"]

  warning["Goals and final answers can contain<br/>sensitive local operator data"] -. applies to .-> records
  execution["Prompt and repository content<br/>used by the run"] -. sent when configured .-> provider["Selected provider"]
```

Text equivalent: workspace configuration and tool intent stay under `.prism/`.
User configuration, endpoint trust, and approvals live under the XDG config
root. Artifacts and run records live under the XDG state root. V3 records keep
identities, commitments, limits, usage, events, the terminal answer, and
cleanup evidence. They omit raw plugin input, output, errors, paths, and the raw
goal. Final answers can still contain sensitive data. A configured provider
receives the prompt and any repository content used during the run.

## Optional assurance lanes

[Mermaid source](diagrams/assurance-lanes.mmd)

```mermaid
flowchart LR
  normal["Normal developer-preview path<br/>deterministic CLI or Runtime API"] --> local["Local bounded run<br/>no Docker, KVM, or Firecracker required"]

  docker["Optional Docker assurance"] --> dockerEvidence["Constitution and executor checks<br/>Docker environment required"]
  b4["Optional B4 lane"] --> b0["Qualified disposable<br/>Linux x86_64 B0 environment"]
  b0 --> kvm["Imported KVM evidence<br/>and QEMU profile"]
  kvm --> firecracker["Firecracker and acceptance profiles<br/>when applicable"]
  x1["Optional physical X1 lane"] --> x1Read["Separately authorized<br/>read-only qualification"]

  local -. does not prove .-> dockerEvidence
  dockerEvidence -. does not qualify .-> b0
  b0 -. does not qualify .-> x1Read

  status["Current exact-source status<br/>qualified Linux, KVM, QEMU,<br/>Firecracker, and X1 evidence unverified"] -. applies to .-> b0
  status -. applies to .-> kvm
  status -. applies to .-> firecracker
  status -. applies to .-> x1Read
```

Text equivalent: the normal deterministic CLI and Runtime API paths do not
need Docker, KVM, QEMU, Firecracker, or X1. Docker checks are optional and do
not qualify the B4 or X1 lanes. B4 starts in a qualified disposable Linux x86_64
environment, then adds KVM and QEMU evidence before applicable Firecracker
profiles. Physical X1 qualification is separate and read-only. No fresh
qualified result for those environments is recorded for the exact current
source.

## Package responsibilities

| Package | Responsibility | Preview status |
| --- | --- | --- |
| `@useprism/sdk` | Provider, tool, policy, manifest, registration, and protocol contracts | Published |
| `@useprism/runtime` | Bounded execution, policy admission, tool calls, events, cleanup, and terminal results | Published |
| `@useprism/provider-ollama` | Ollama provider adapter for an operator-managed endpoint | Published |
| `@useprism/cli` | Composition, configuration, approval workflow, local artifacts, and run inspection | Published |
| `@useprism/provider-codex` | Source-visible Codex CLI compatibility adapter | Unpublished |

See [Concepts](../developer-preview/concepts.md), [Local data and
trust](../developer-preview/data-and-trust.md), and [Optional
assurance](../assurance/README.md) for the task-level details.
