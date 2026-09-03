# Prism Phase 3 execution contract

- Date: 2026-08-30
- Status: ready to launch
- Workstream: `20260830-prism-phase-3-runtime-repository-tool-ollama-b43ebc`
- Branch: `feat/phase-3-runtime-ollama`
- Phase 3 baseline: `6d5ecdbcacc810f214fc1aed4b55cc42995b810d`
- Phase 2 implementation rollback: `4d13207a6e02792693233d8f03516abcd1c2911c`

This contract governs Phase 3 only. The reviewed developer-preview plan remains
the product source, while this document narrows that plan into one autonomous,
verifiable milestone.

## Rendered phase task

Objective: Complete Prism Phase 3 only: replace the text-stats-specific coordinator with a general bounded Runtime loop, add a bounded read-only repository tool, implement the direct `@prism-harness/provider-ollama` package, integrate the Ollama path through the CLI and packed-install gate, and preserve Phase 2 compatibility and persistence boundaries.

Source of truth and precedence: Runtime and user authority, current Git state, `AGENTS.md` and `CLAUDE.md`, this Phase 3 contract, the reviewed developer-preview implementation plan Phase 3, then the preserved Phase 2 handoff. Stop and report any material conflict.

Allowed write scope: `packages/runtime/**`; `packages/sdk/**` only for coordinator-frozen public contracts; `packages/provider-ollama/**`; coordinator-selected repository-tool files under `packages/cli/**`; coordinator-owned CLI integration, root manifests, lockfile, package checks, compatibility tests, active claims, gotcha registry, and this Phase 3 workstream.

Verification: Activate and assert Node 26.8.1 and npm 11.19.0 from the repository pin; freeze Phase 3 behavior in tests before implementation; pass focused boundary, repository-tool, Ollama-stub, CLI, and packed-install tests; then pass `npm ci`, `npm run build`, `npm test`, and `npm run pack:check`; receive independent `READY` review of the exact committed source.

Stop condition: Stop successfully only when every Phase 3 criterion in this contract passes, the exact reviewed source is committed locally, the worktree is clean, and the Phase 3 handoff is updated. Stop before Phase 4 plugin commands, Phase 5 release documentation, any push, publication, deployment, provider expansion, Runtime persistence, or write-capable repository operation.

Sensitive-data policy: Never persist credentials, request headers, provider orchestration prompts, intermediate provider responses, repository contents, tool queries or excerpts, response bodies, or private endpoint details in run records, review artifacts, or handoffs. Preserve the reviewed Phase 2 run-record contract that stores the user goal and validated final answer and labels both as potentially sensitive local operator data. Keep live evidence bounded and digest-based. Do not pull models automatically.

Output contract: Report the final local commit, exact verification commands and results, independent review verdict, live Ollama evidence status, changed files, remaining release-readiness caveats, updated handoff, clean Git status, and the single next Phase 4 action. Do not push or publish.

Read relevant sources first. Work in small steps. Keep edits within scope. Report evidence, blockers, and next action. Stop on authority conflict, missing verification, scope conflict, or the stated stop condition.

## Required reading

Read these sources completely before changing product code:

1. `AGENTS.md` and `CLAUDE.md`.
2. This contract and the new Phase 3 `STATE.md` and `HANDOFF.md`.
3. Phase 3 of `2026-08-29-developer-preview-implementation-plan.md`.
4. The preserved Phase 2 handoff and decisions.
5. The current Runtime coordinator, SDK provider and tool contracts, CLI run
   composition, package graph check, packed-install test, and public claims.

Use the CodeGraph index for narrow symbol and dependency queries. Current Git
state remains authoritative if the index is stale.

## Environment preflight

The shell may start on an unsupported Node version. Before installation,
generation, tests, or commits, activate and assert the repository pin:

```sh
NODE_VERSION="$(tr -d '\n' < .node-version)"
export PATH="$HOME/.nvm/versions/node/v${NODE_VERSION}/bin:$PATH"
test "$(node --version)" = "v${NODE_VERSION}"
test "$(npm --version)" = "11.19.0"
```

Do not continue after either assertion fails. Do not rewrite historical Node
pins in dated records.

The optional live Ollama model is `qwen2.5:14b`. The model is an environment
precondition, not an install step. Never run `ollama pull` or substitute another
model without owner instruction. Local HTTP-stub acceptance is the hard,
deterministic provider gate. A live failure marks the developer preview as not
release-ready but does not invalidate an otherwise complete Phase 3
implementation.

## First action

Before implementation, freeze tests for:

- general provider turns and tool requests;
- policy admission, ordered events, and terminal results;
- turn, tool-call, total-byte, per-tool-byte, and deadline limits;
- repository path containment and output bounds; and
- Ollama success and failure behavior against a local HTTP stub.

Each numerical limit must be tested at its boundary and one unit beyond. Do not
fan out implementation until the coordinator has frozen the shared SDK contract
and these observable behaviors.

## Required deliverables

### General Runtime

- Replace text-stats-specific coordination with provider-neutral turns, tool
  requests, policy admission, ordered events, cleanup, and terminal results.
- Keep the deterministic output adapter byte-compatible with
  `npm run --silent prism:demo`.
- Enforce coordinator-owned turn, tool-call, total-byte, per-tool-byte, and
  wall-clock limits. Providers and tools cannot raise them.
- Keep Runtime free of HOME, current-directory, config, trust, run-record,
  inspection, and resume dependencies.

### Read-only repository tool

- Provide bounded list, read, and search operations below one admitted,
  canonical workspace root.
- Reject absolute paths, traversal, symlink escapes, non-regular files, binary
  reads, excluded credential/key names, ignored oversized files, and operations
  outside the workspace.
- Bound file bytes, aggregate bytes, result count, search work, and deadline.
- Persist only sanitized operation metadata. Never persist file contents or
  search excerpts.
- Expose no create, update, delete, rename, command execution, or network
  operation.

### Direct Ollama provider

- Add `@prism-harness/provider-ollama` with an explicit export map and exact SDK
  dependency.
- Call the configured endpoint directly through the SDK provider contract. Add
  no router, resolver, gateway, cloud fallback, or Runtime import.
- Bound request bytes, response bytes, and duration.
- Cover success, unavailable endpoint, unknown model, timeout, malformed JSON,
  oversized response, and redacted diagnostics with a local HTTP stub.

### CLI and packed integration

- Compose the general Runtime, repository tool, and Ollama provider in the CLI
  while leaving config, trust, persistence, and inspection CLI-owned.
- Preserve deterministic `init`, `doctor`, `run`, and `inspect` behavior.
- Extend packed acceptance to install SDK, Runtime, CLI, and Ollama tarballs
  together outside the checkout without registry or source-tree fallback.
- Run an Ollama-configured `init`, `doctor`, `run`, and `inspect` path against
  the local stub with isolated HOME and XDG roots.
- Keep the package graph and public export checks authoritative.

## Architecture invariants

1. SDK imports no Prism package. Runtime imports SDK only.
2. Provider packages import SDK only and never Runtime internals.
3. CLI owns ambient config, endpoint trust, local run records, and inspection.
4. The repository root is canonicalized and admitted before Runtime starts.
5. Provider and tool failures do not leak raw inputs, outputs, headers, bodies,
   local paths, or repository contents.

## Coordinator and worker DAG

Use the GPT-5.6 Sol Max root session as the sole coordinator:

```text
freeze contracts and failing tests
          |
          +-- Runtime implementation
          +-- repository tool
          +-- Ollama provider
                       |
CLI and pack integration -> independent review -> full gates -> local commit
```

The coordinator owns:

- public SDK contracts and shared event/limit types;
- root manifests, TypeScript references, package graph, and lockfile;
- existing CLI command integration and packed-install orchestration;
- shared compatibility and public-claim changes;
- all integration decisions, fixes, commits, state, and handoffs.

After contract freeze, at most three implementation workers may run in one
parallel wave with disjoint scopes:

| Worker | Model tier | Write scope | Must not edit |
| --- | --- | --- | --- |
| Runtime loop | GPT-5.6 Terra | `packages/runtime/**` and Runtime tests | SDK, CLI, root manifests, lockfile |
| Repository tool | GPT-5.6 Terra | coordinator-assigned repository-tool module and focused tests under `packages/cli/**` | existing CLI integration, SDK, Runtime, root manifests, lockfile |
| Ollama provider | GPT-5.6 Terra | `packages/provider-ollama/**` | SDK, Runtime, CLI, root manifests, lockfile |

Use GPT-5.6 Luna only for bounded read-only mapping or mechanical lookups. Every
dispatch names its model, objective, source of truth, write scope, verification,
stop condition, and output contract. Workers do not commit. The coordinator
reviews and integrates every result.

Use one shared milestone ledger. Permit no more than three active children and
twelve total children, including reviewers and retries. Two identical failures
end that strategy; do not make a third identical attempt. Do not silently omit
work when budget is tight. Drop an optional review stage and label the result
instead.

## Review gate

After integration and focused tests, dispatch independent read-only reviews for:

1. Runtime correctness, limit boundaries, stopping, and cleanup.
2. Repository containment, symlink behavior, output bounds, and trace redaction.
3. Ollama protocol behavior, diagnostic redaction, dependency direction, CLI
   composition, and packed-install isolation.

The coordinator must reproduce every finding against the exact source, fix all
confirmed P0, P1, and P2 findings, rerun affected tests, and obtain a final
`READY` verdict with no missing Phase 3 criterion. Reviewers never edit files.

## Verification and completion

The exact final source must pass under Node 26.8.1 and npm 11.19.0:

```sh
npm ci
npm run build
npm test
npm run pack:check
```

The packed gate is not complete if any installed module resolves into this
checkout or if the Ollama path depends on a live daemon. Default tests require
no account, credential, model download, or external network access.

Attempt the opt-in live fixture with `qwen2.5:14b` only after deterministic
gates pass. Permit at most two attempts with a changed hypothesis. Record only
the bounded result and digests allowed by the reviewed plan. If it does not
pass, report `implemented; live evidence missing; not release-ready` and stop
retrying.

Phase 3 is complete only when:

- every deliverable and hard gate above passes;
- the deterministic compatibility output remains byte-identical;
- independent review returns `READY`;
- the exact reviewed source is committed locally;
- `git status --short` is empty; and
- the Phase 3 handoff records the commit, evidence, caveats, and Phase 4 as the
  only next milestone.

Do not implement plugin authoring commands, release documentation, scheduling,
resume, memory, multi-agent product behavior, write-capable tools, additional
providers, Firecracker expansion, publication, remote creation, push, or
deployment during this phase.
