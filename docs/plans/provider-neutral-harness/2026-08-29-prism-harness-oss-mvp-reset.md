# Prism Harness open-source MVP reset

- Date: 2026-08-29
- Status: adopted product direction
- Scope: first open-source milestone
- Supersedes: constitutional closure and high-assurance governance as the
  first-release critical path

## North star

Prism Harness is a provider-neutral runtime for building, running, and
inspecting goal-oriented AI agents with pluggable models, tools, and policies.

The open-source product should make one agent loop easy to understand, run,
test, and extend. Security and governance remain possible policy layers. They
do not define the minimum product.

## Package boundary

Prism is published as three layers. The labels below describe package
responsibilities; final registry names are selected during extraction.

| Layer | Owns | Does not own | Release boundary |
|---|---|---|---|
| Prism Runtime | Core contracts, one bounded run, plugin execution, limits, events, stopping, and terminal results | Durable resume, background scheduling, credentials, or plugin installation | Required for the first open-source release |
| Prism Plugin SDK | Public protocol, manifest, registration, validation, and authoring helpers for provider, tool, policy, memory, and renderer plugins | Runtime lifecycle, authoritative run state, persistence, or unrestricted host handles | Required for the first open-source release |
| Prism Autonomy | Optional durable multi-turn coordination, checkpoints, resume and recovery, effect handling, and later scheduling | Provider or tool implementations, credentials, or authority beyond the admitted run | Follow-on package built on the open-source runtime; not a first-release blocker |

The dependency direction is one-way: the Plugin SDK imports neither Runtime
nor Autonomy; Runtime may depend on the Plugin SDK but never on Autonomy; and
Autonomy depends on the published Runtime and Plugin SDK. Provider, tool,
policy, memory, and renderer behavior stays in plugins.

Durable stores and schedulers are trusted host adapters behind Autonomy
interfaces, not model-facing plugins. A model or plugin may propose work but
cannot install plugins, mutate authoritative run state directly, bypass
runtime limits, or decide that its own effect is safe to retry.

The first open-source release publishes Runtime and the Plugin SDK together.
Autonomy starts from that released boundary and evolves independently without
expanding the minimum demo below.

## Smallest end-to-end demo

The first milestone is one deterministic command:

```sh
npm run --silent prism:demo -- 'Count the words in: one two three'
```

The command is not implemented yet. It is the acceptance target for the next
implementation slice.

The demo has three statically registered plugins:

| Plugin | Responsibility |
|---|---|
| `local-scripted` provider | On turn one, request the `text-stats` tool. On turn two, turn its result into the final answer. |
| `allow-text-stats` policy | Permit only `text-stats/analyze-text`, with at most one tool call. |
| `text-stats` tool | Execute the existing subprocess plugin and return character, word, and line counts. |

The provider is deterministic and local. It uses no API key, provider account,
network request, or model download. Its purpose is to prove the provider seam
and the agent loop before a live model is introduced.

## Required sequence

One run performs exactly these steps:

1. Accept the goal and create an in-memory run.
2. Ask `local-scripted` for the next action.
3. Ask `allow-text-stats` whether that exact tool operation is permitted.
4. Invoke `text-stats/analyze-text` once through the real subprocess plugin
   path.
5. Return the tool result to `local-scripted`, receive `3 words`, and finish.

The coordinator allows at most two provider turns and one tool call. Any other
provider action, tool, operation, extra turn, malformed response, plugin
failure, or timeout ends the run with a typed failure.

## Output contract

Standard output is one JSON object:

```json
{
  "status": "completed",
  "answer": "3 words",
  "provider": "local-scripted",
  "toolCalls": [
    {
      "tool": "text-stats",
      "operation": "analyze-text",
      "result": {
        "text": "one two three",
        "characters": 13,
        "words": 3,
        "lines": 1
      }
    }
  ],
  "events": [
    { "seq": 1, "type": "goal.accepted" },
    { "seq": 2, "type": "provider.tool-requested" },
    { "seq": 3, "type": "policy.allowed" },
    { "seq": 4, "type": "tool.completed" },
    { "seq": 5, "type": "provider.finalized" },
    { "seq": 6, "type": "run.completed" }
  ]
}
```

The public JSON omits random IDs, timestamps, process IDs, and temporary
paths, so equal input produces equal output. Internal diagnostics may carry
those values on standard error when a run fails.

## What the demo proves

The milestone is complete only when a clean checkout demonstrates:

- one goal entering a bounded coordinator loop;
- one provider plugin selecting a tool through a typed decision;
- one policy plugin approving the exact operation and call count;
- one real subprocess tool returning validated structured data;
- one final provider answer plus an ordered, inspectable trace.

The host test must run the package command, parse standard output, compare it
to the exact object above, and confirm all plugin processes have exited.
Focused typechecking and the existing public-claim gate must also pass.

## Failure acceptance

Tests must cover four failures:

1. The provider requests an unknown tool or second tool call.
2. The policy denies the operation.
3. The tool returns malformed output or exits unsuccessfully.
4. The provider returns neither a valid tool request nor a final answer.

Every case returns a typed error, emits no false `run.completed` event, and
confirms subprocess cleanup.

## Explicit non-goals

The first demo excludes:

- live model or cloud-provider calls;
- memory, persistence, resume, retries, or multi-agent delegation;
- multiple tools, parallel calls, streaming, scheduling, or background work;
- Docker, a host daemon, a dedicated service principal, or production
  installation;
- constitutional gates, owner receipts, proof status, immutable evidence
  chains, and release automation.

These are later product or assurance decisions. None may block the local loop.

## Relationship to the current code

The existing `npm run prism:example` command already proves owner-pinned
admission and one real `text-stats` subprocess operation. The new demo keeps
that path and adds only the missing product loop:

1. a typed provider decision with `tool` and `final` variants;
2. a bounded coordinator that connects provider, policy, and tool plugins;
3. a deterministic event trace and final result contract.

The Codex integration remains an optional provider example. It is not the MVP
acceptance test because it depends on a local account session and
nondeterministic external output.

## Implementation boundary

The next slice may add only:

- the provider-decision contract;
- the bounded local coordinator;
- the scripted provider and single-operation policy fixtures;
- the `prism:demo` entry point;
- focused success and failure tests.

It must reuse the existing registry, admission, plugin protocol, provider
operation, tool operation, subprocess lifecycle, and `text-stats` code.
Discoveries about constitutional closure, E4, release governance, or
production isolation are recorded separately and do not expand this slice.

## Done

The milestone is done when the command prints the exact successful JSON from a
clean checkout, the four failure cases pass, relevant existing Prism tests stay
green, and a new contributor can identify the provider, policy, tool, and
coordinator from the example without reading a constitutional document.
