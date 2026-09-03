# Prism examples

Run the deterministic example first. Each example states what it needs, what
can leave the local process, and what cleanup to expect.

| Example | Prerequisites | Network or credentials | Expected result | Cleanup and authority |
| --- | --- | --- | --- | --- |
| [Deterministic CLI](deterministic/README.md) | Node.js 26.8.1, npm 11.19.0 | Network for registry installation only; no credentials | `3 words` plus an inspectable run ID | Prism records subprocess cleanup; no untrusted-code boundary is implied |
| [Runtime API](runtime-api/README.md) | `@useprism/runtime` and `@useprism/sdk` | None in the committed example | One tool call and six ordered events | In-process example; supplied adapters own any resources they create |
| [Project plugin](project-plugin/README.md) | Installed CLI on macOS or Linux | None for the deterministic provider | `preview-first` and a V3 run record | Plugin executes with ambient host authority; Prism records the authoritative child cleanup receipt |
| [Ollama](ollama/README.md) | Running Ollama and an installed `qwen2.5:14b` model | Loopback service; no Prism-held provider credential | Finds a marker in `FACTS.md` | Repository reads are bounded, but model disclosure is not a confidentiality boundary |
| [Policy denial](failures/README.md) | Runtime and SDK packages | None | Structured `policy-denied` result | Tool is never invoked |

From a source checkout, build the workspace packages before running JavaScript
examples:

```sh
npm ci
npm run build:packages
```

The project-plugin example contains executable code. Read it before running
`plugin check`, approval, or `prism run`.
