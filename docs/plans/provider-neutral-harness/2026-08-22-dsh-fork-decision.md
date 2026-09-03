# DeepSeek Harness fork decision

Status: **ratified 2026-08-22** (owner decision, this session).
Date: 2026-08-22
Context: the open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`, MIT, Cordis-based, developer preview) was evaluated as a fork base for
the provider-neutral harness codebase that became Prism Harness. This is a
different question from the terminated X1 POC, which tried to
*wrap* dsh in authority gates; here the question was whether to build on its
codebase.

## Decision: continue Prism Harness; do not fork dsh; adopt from it selectively

1. **The divergence is at the core, not the edges.** Prism Harness's identity —
   out-of-process plugins, digest admission, static fail-closed loading,
   fault cells — contradicts dsh's foundational bets (in-process shared
   Cordis context, dynamic composition, fully trusted plugins). A fork
   would rearchitect upstream's kernel and then maintain permanent
   divergence against a repo that explicitly promises
   compatibility-breaking changes, with one maintainer.
2. **Prior evidence.** The X1 POC's terminal REJECT already demonstrated
   the cost of imposing PNH-class invariants on a runtime this project
   does not control.
3. **The differentiation is Prism Harness's, not dsh's.** dsh has no malicious-plugin
   answer: no artifact digests, no admission, no inter-plugin fault
   isolation; its approval seam gates *actions*, not *code*. dsh could not
   adopt Prism Harness's trust model without a rewrite; Prism Harness can
   adopt dsh's good parts additively.

## What "adopt selectively" means (MIT permits it)

Patterns worth copying into the constitution over time: the
"model-visible means logged" session-log invariant; per-backend denial
signatures instead of a cross-backend union.

## Named future directions, not scheduled

Neither item below is required by the ratified program. Each joins the
first slice's "Still open" class: its own decision doc if and when a
consumer actually schedules it.

- **OS-native confinement for the spawn executor**, modeled on
  `dsh-sandbox-local` (Linux bwrap/Landlock, macOS Seatbelt) — would add
  runtime file/network boundaries to spawn plugins without Docker.
  Deferred 2026-08-22: the spawn path's trust model is supply-chain by
  design, untrusted work already has the Docker executor, and no consumer
  runs third-party plugins via spawn.
- **Prism Harness as a dsh plugin** (their `ctx.sandbox` / subagent seams are
  pluggable): if ecosystem reach ever matters, shipping Prism Harness's
  executor as a dsh sandbox provider converts dsh's adoption advantage into
  a distribution channel without forking. Do not schedule before M3 completes.
