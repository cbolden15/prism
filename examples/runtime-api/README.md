# Runtime API example

This complete deterministic example supplies the provider, policy, and tool
ports expected by `runAgent`. It makes no network request and uses no
credential.

From a Prism source checkout:

```sh
npm ci
npm run build:packages
node examples/runtime-api/run.mjs
```

From another project, install the packages and copy `run.mjs` into that
project before running it:

```sh
npm install @useprism/runtime@0.1.0 @useprism/sdk@0.1.0
node run.mjs
```

Expected output:

```json
{
  "status": "completed",
  "answer": "README.md is the first entry.",
  "events": [
    "goal.accepted",
    "provider.tool-requested",
    "policy.allowed",
    "tool.completed",
    "provider.finalized",
    "run.completed"
  ]
}
```

The example runs in one process. Runtime bounds provider turns, tool calls,
bytes, and elapsed time. A real provider or tool adapter owns any sockets,
files, child processes, and cleanup it creates.

Read [Architecture](../../docs/architecture/README.md#bounded-run-sequence) for
the flow and [Local data and trust](../../docs/developer-preview/data-and-trust.md)
before connecting adapters that handle private data.
