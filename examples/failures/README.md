# Failure examples

Failure results are structured and do not include a terminal answer. Start
with policy denial, where the provider requests a known tool but policy rejects
the exact request before the tool executes.

```sh
npm ci
npm run build:packages
node examples/failures/policy-denied.mjs
```

Expected output:

```json
{
  "status": "failed",
  "code": "policy-denied",
  "toolInvoked": false
}
```

No network request, credential, file write, or child process is used by this
example. See [Diagnostics](../../docs/developer-preview/diagnostics.md) for CLI
failure codes and the next command for each case.
