# PNH M2 hybrid restart plan

Date: 2026-08-20

Status: reviewed and ready for Milestone 1 implementation

Branch: `pnh/m2-hybrid-restart`

Worktree: historical local worktree (not retained)

Baseline: `1f6ad5724e292112d8346f1b88f6e626eb363faa`

Source audit: `docs/audits/2026-08-20-runtime-plugin-kernel-audit.md`

## Decision

Restart Tasks 2 through 7 behind integration-first security gates. Retain the reviewed worker-boundary preflight and Task 1 pure contracts. Do not transplant the partial registry, broker, SDK, kernel, or Runtime implementations from `pnh/m2-runtime-plugin-kernel`.

Estimated elapsed engineering time: 10–14 focused working days, plus review latency. A first trustworthy Tool vertical slice should exist after 2–3 days. The branch is not M2-complete until every gate below passes without skips.

## Goal

Build a provider-neutral Runtime and plugin kernel in which:

- one owner-approved registry snapshot is the sole source of plugin identity and authority;
- every plugin executes in an isolated, bounded worker using one exact protocol;
- Policy denial or failure stops admission before non-Policy grants exist;
- lifecycle custody remains with the host until the container daemon confirms termination and removal;
- every accepted task, effect, and result is bound to the same plugin-set digest, budget, and evidence chain;
- conformance and coverage gates exercise the real production path.

## Non-goals

- General third-party plugin distribution or a public marketplace.
- Compatibility shims for the discarded partial implementation.
- In-process execution of untrusted plugin code.
- Claims of resistance to kernel, container-runtime, or hypervisor escape.
- Protection against collusion among plugins that the owner jointly approved for one task. Their aggregate effective catalog must still be a subset of the owner-approved plugin-set ceiling.
- Deployment, push, or production activation in this workstream.

## Reuse boundary

Keep:

- `pnh/core/capability-catalog.ts`
- `pnh/core/plugin-grant.ts`
- `pnh/core/plugin-set.ts`
- `pnh/core/result.ts`
- `pnh/core/runtime-event.ts`
- `pnh/core/task.ts`
- their Task 1 tests
- `docs/plans/provider-neutral-harness/reviews/2026-08-20-m2-plugin-worker-preflight.md`

Rebuild:

- generated registry and admission path;
- SDK framing and plugin runner;
- container broker, gateway, and adapter;
- capability RPC and plugin kernel;
- Runtime orchestration and event persistence;
- adversarial fixtures, coverage gates, and M2 closure evidence.

Any useful code from the discarded branch is reference material only. Reuse requires a fresh test against this plan's invariant, not a cherry-pick.

## Security boundary and stop condition

Selected boundary: one standard Linux container per plugin, no host socket, no shared writable host path, read-only root filesystem, dropped capabilities, no-new-privileges, bounded pids/memory/CPU, fixed network mode, owner-controlled runner, exact seccomp bytes, and an allow-listed environment.

This boundary is intended to contain buggy or malicious application code under the assumed host kernel and container runtime. It does not prove containment of a kernel or runtime escape.

Stop and return for an architecture decision if the required threat model includes hostile third-party code actively attempting container escapes. The do-it-properly option is a dedicated rootless broker/supervisor with signed admission tickets and artifacts, aggregate cgroup enforcement, an external reaper, and a stronger sandbox such as gVisor, Kata Containers, or Firecracker. Its viability is pending host support, operational complexity, and performance validation.

## Cross-cutting invariants

1. Exactly one versioned NDJSON frame vocabulary crosses Runtime, adapter, broker, runner, and plugin SDK. UTF-8 decoding is fatal. Every frame has bounded bytes, depth, strings, arrays, and sequence.
2. The verified registry produces an opaque, deeply frozen admission ticket. Runtime accepts that ticket and never accepts a second registry object.
3. Policy explicit denial, timeout, crash, malformed response, or protocol failure is fail-closed and occurs before any non-Policy grant derivation.
4. A request settles once. The host supervisor is the sole Docker lifecycle writer and its daemon-inspected receipt is the authoritative lifecycle observation. Runtime ignores duplicate or late broker observations after settlement. Post-dispatch uncertainty is recorded as ambiguous. Success requires one valid response, a clean matching exit commitment, truthful OOM state, and daemon-confirmed cleanup.
5. Tests use production constructors and protocol paths. Fixture-only parity is not completion evidence. Required Docker tests cannot be skipped.

## Milestone 1: golden Tool vertical slice

Estimate: 2–3 days.

Purpose: prove the architecture composes before adding all plugin kinds.

Implementation:

- Add normalized manifest and registry generation in `pnh/scripts/generate-plugin-registry.ts`.
- Add an opaque admission-ticket constructor in `pnh/runtime/admission-ticket.ts`; only the registry verifier can create it.
- Add the single protocol schema and fatal bounded codec in `pnh/sdk/protocol.ts`.
- Add the owner-controlled request loop in `pnh/kernel/plugin-runner/entrypoint.mjs`; process each complete line immediately rather than waiting for EOF.
- Add `pnh/harness/plugin-container-supervisor.mjs` as a process outside the broker and the sole owner of Docker launch, stop, kill, inspect, and remove calls.
- Add a broker and gateway in `pnh/harness/plugin-container-broker.mjs` and `pnh/harness/sandbox/broker-gateway.mjs`.
- Add the adapter in `pnh/adapters/docker-broker-plugin-container.ts`.
- Add a narrow Runtime path in `pnh/runtime/run-task.ts` for one Tool registration and one Tool operation.
- Add one non-empty Tool fixture under `pnh/tests/fixtures/plugins/tool-golden/`.

Required protocol behavior:

- request and response IDs are unique and matched;
- exact next sequence is enforced;
- one response is accepted per request;
- extra output, invalid UTF-8, unknown fields, malformed envelopes, and unterminated oversized lines fail;
- registration and operation use the same envelope and codec;
- every request has a deadline and transport close rejects all pending requests.

Custody behavior:

- the supervisor serializes lifecycle state by authenticated request ID and admitted plugin identity; broker code never calls Docker directly;
- the supervisor rejects duplicate launch allocation and returns the existing lifecycle status;
- its hard-deadline state machine triggers at the admission-ticket deadline plus a fixed, committed two-second cleanup grace; because the state machine and broker-request handler share one serialized owner, reaping cannot race broker-requested cleanup;
- cleanup awaits `docker stop`, inspects state, escalates with awaited `docker kill`, then awaits `docker rm -f`;
- the supervisor persists one terminal lifecycle receipt until Runtime acknowledges it; the receipt records the trigger, daemon state, exit, OOM, and confirmed absence;
- broker success is sent only from that receipt after daemon inspection confirms the container is absent.

Gate:

- the generated non-empty registry is verified into one admission ticket;
- Runtime uses that ticket to launch the real Tool container;
- registration and one operation succeed through the production protocol;
- timeout, duplicate response, invalid UTF-8, and extra output fail closed;
- the container is daemon-confirmed absent after success and each failure;
- broker death does not cancel the supervisor deadline, and simultaneous timeout plus broker stop yields one lifecycle receipt and one Runtime settlement;
- `npm run test:pnh`, `npm run test:x1`, and `git diff --check` pass with no required skip.

Commit boundary: `feat(pnh): prove M2 Tool vertical slice`.

## Milestone 2: authority-complete kernel

Estimate: 2–3 days.

Purpose: complete authority semantics before broadening Runtime behavior.

Implementation:

- Extend registry generation to canonicalize manifest version, dependencies, requested capabilities, compatibility, license, source digest, runner digest, and image identity into `versionDigest`.
- Resolve dependency order and compute the plugin-set digest exclusively from the admission ticket.
- Implement Policy, Memory, Tool, Provider, and Renderer registration through the same protocol.
- Implement fail-closed Policy admission and monotonic catalog narrowing in `pnh/kernel/plugin-kernel.ts`.
- Treat the admission ticket's aggregate owner-approved catalog as an immutable ceiling; even a protocol-valid Policy response cannot add or widen authority beyond it.
- Implement one capability-request schema per limit type in `pnh/kernel/capability-rpc.ts`: integer maximum, string set, and boolean gate.
- Validate normalized requested values against grants before intent append and dispatch.
- Freeze kernel state, grants, catalogs, descriptors, and admission data at construction boundaries.

Gate:

- explicit Policy denial produces no non-Policy grants;
- Policy timeout, crash, malformed output, and sequence failure produce no non-Policy grants;
- a protocol-valid Policy attempt to exceed the ticket ceiling is rejected before non-Policy grants exist;
- widened catalog or operation input is rejected;
- dependency and capability metadata changes alter version and plugin-set digests;
- all five kinds register through real containers using the production codec;
- unit, integration, and existing X1 regression suites pass.

Commit boundary: `feat(pnh): enforce complete plugin authority`.

## Milestone 3: deterministic Runtime and evidence custody

Estimate: 3–4 days.

Purpose: make task settlement and evidence truthful under failure.

Implementation:

- Define the Runtime state table and append-before-dispatch transition API.
- Define a plugin fault-cell contract. A timeout, crash, protocol failure, malformed or excessive output, nonzero or OOM exit, or cleanup failure in one ordinary plugin must settle and clean only that plugin's allocation. It must not close shared control-plane channels, cancel or settle unrelated requests, consume or release another plugin's limits, or mutate another plugin's event chain.
- Bind plugin-set digest and trusted budget snapshot into every event and terminal result.
- Enforce request replay protection before concurrency allocation, then cumulative decoded-byte limits, write backpressure, per-plugin concurrency, and aggregate resource caps. An in-flight duplicate returns existing request status and never allocates a second slot.
- Inspect daemon exit code, signal, OOM state, container identity, image digest, runner digest, and profile digest before success.
- Classify every failure after possible dispatch as ambiguous unless an idempotency proof establishes otherwise.
- Reject every pending launch, operation, and stop on deadline, abort, broker close, or gateway close.
- Enforce evidence grades so development registries and fixture ports cannot yield production-grade results.
- Implement bounded coverage transport outside the untrusted plugin process or through a separately reviewed trusted coverage runner.

Fault-isolation design gate:

Threat-model source of truth: [`2026-08-21-m3-plugin-fault-isolation-threat-model.md`](2026-08-21-m3-plugin-fault-isolation-threat-model.md).

Architecture decision brief: [`2026-08-21-m3-plugin-isolation-architecture-options.md`](2026-08-21-m3-plugin-isolation-architecture-options.md).

| Dimension | Shared supervisor with logical fault cells | Per-plugin control-plane processes |
|---|---|---|
| Ordinary plugin failure | Requires plugin-keyed queues, timers, lifecycle state, accounting, and cleanup; the M3 invariant is proven by concurrent fault-injection tests. | OS process boundaries reduce accidental cross-plugin state corruption but do not remove the need for request and evidence isolation. |
| Shared control-plane failure or compromise | Larger shared-fate boundary; assess separately from ordinary plugin failure. | Smaller process blast radius if process isolation is configured correctly. |
| Docker authority | Preserves one Docker-capable supervisor and the existing narrow gateway-to-supervisor authority path. | Multiplies Docker-capable supervisor principals and authenticated control channels, expanding privileged authority and key-management surface. |
| Lifecycle and operations | Fewer processes, channels, restarts, and retained receipts; logical-cell invariants must be explicit. | More process custody, startup, shutdown, receipt reconciliation, resource overhead, and observability paths. |

Decision: retain shared-supervisor logical fault cells for M3. Do not implement per-plugin process splitting unless a written threat model and the fault-injection evidence show that logical isolation cannot satisfy the invariant. Any physical split is a separately reviewed architecture change that must account for expanded Docker authority before implementation.

Gate:

- event chain validation proves unchanged plugin-set digest and budget;
- broker death, gateway loss, timeout, overflow, OOM, nonzero exit, and malformed completion settle once with correct evidence;
- for every ordinary failure class listed above, concurrent fault-injection proves the failing plugin cannot close shared channels, alter unrelated resource accounting or evidence, or prevent unrelated plugins from continuing and settling correctly;
- replay cannot create a second container or second effect;
- aggregate limits hold across concurrent plugins;
- the fault-isolation threat model records whether logical cells satisfy the invariant and blocks physical process splitting unless evidence proves they do not;
- no successful or failed test leaves a container behind.

Commit boundary: `feat(pnh): add deterministic runtime evidence custody`.

## Milestone 4: artifact and sandbox hardening

Estimate: 1–2 days.

Purpose: make the runtime artifact match the reviewed security profile.

Implementation:

- Rebuild and pin an owner-controlled runner using Node 22.23.2 or a newer separately reviewed release.
- Copy the exact syscall deny list from the approved worker preflight into the committed profile and deny every listed syscall, including `pidfd_send_signal`.
- Digest-bind the seccomp profile and runner artifact in the registry and admission ticket.
- Build broker environment from an explicit allow-list; reject ambient profile and coverage overrides.
- Record source, lockfile, image, runner, profile, and manifest commitments in generated evidence.
- Produce a reproducible artifact verification command and a Markdown record of its exact output; no bespoke verification framework is in scope.

Gate:

- local image inspection matches every pinned commitment;
- profile mutation, ambient override, tag drift, or digest mismatch prevents admission;
- sandbox negative tests prove no host socket, shared writable host path, unexpected environment, or undeclared network access;
- full PNH and X1 suites pass.

Commit boundary: `build(pnh): freeze M2 runner security artifacts`.

## Milestone 5: adversarial conformance and closure

Estimate: 2–3 days.

Purpose: prove M2 against the audit findings and close it with reproducible evidence.

Implementation:

- Add `pnh/tests/m2-conformance.test.ts` and malicious fixtures for replay, output flooding, invalid UTF-8, extra frames, malformed registration, Policy fail-open attempts, capability widening, timeout races, broker death, OOM, and cleanup failure.
- Run one real non-empty plugin for each kind through generator, admission, Runtime, broker, runner, and cleanup.
- Add enforced coverage for Runtime, SDK, kernel, broker, and runner; keep the existing core threshold.
- Fail CI on required test skips, missing Docker, coverage gaps, stale generated registry, or artifact commitment drift.
- Write `docs/plans/provider-neutral-harness/reviews/2026-08-20-m2-hybrid-conformance.md` and a fresh Markdown codebase-vs-plan audit using the existing audit workflow; no new audit framework is in scope.

Gate:

- `npm run test:pnh` passes with no required skips;
- `npm run test:x1` passes;
- all declared coverage thresholds pass;
- `git diff --check` passes;
- independent audit verdict is READY with no critical or high findings;
- workstream state and closure documents contain exact commands and results.

Commit boundary: `test(pnh): close M2 conformance gates`.

## Test strategy

For each invariant:

1. Write a failing unit or integration test that demonstrates the broken or absent behavior.
2. Implement the minimum production path needed to pass it.
3. Add the corresponding hostile case.
4. Run the focused test, then `npm run test:pnh`.
5. Before each milestone commit, run `npm run test:x1` and `git diff --check`.

Docker-backed tests must use unique labels and a cleanup sweep scoped to the test run. Cleanup verification queries the daemon, not the attached CLI process.

## Review and execution rules

- Run the installed multi-lens document review before implementation.
- Reconcile all critical and high findings in this plan or record an explicit owner decision.
- Execute one milestone at a time; do not begin the next milestone until the current gate is green and locally committed.
- A later milestone may reopen an earlier committed interface only through a corrective commit followed by rerunning every affected earlier gate.
- Update `docs/ai/workstreams/20260820-homelab-setup-pnh-m2-hybrid-8fa288/HANDOFF.md` at every verified milestone.
- Do not push, deploy, or modify the original `pnh/m2-runtime-plugin-kernel` worktree.
