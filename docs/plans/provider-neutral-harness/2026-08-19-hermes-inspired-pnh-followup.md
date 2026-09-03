# Hermes-inspired provider-neutral harness follow-up plan

- Status: proposed follow-up implementation plan; M1 satisfied, blocked on M2 and M3
- Owner: Caleb
- Created: 2026-08-19
- Supersedes: `docs/plans/2026-08-18-x1-hermes-inspired-dsh-followup.md`
- Depends on: `docs/plans/provider-neutral-harness/architecture.md` and the
  provider-neutral harness (pnh) kernel plan track, beginning with
  `docs/plans/provider-neutral-harness/2026-08-19-kernel-plan-1.md`
- Research input:
  `docs/ai/workstreams/20260818-homelab-setup-hermes-dsh-followup-a2a7cb/HERMES-INTAKE.md`
- Activation: pnh first, through the harness's own public contracts; X1/C3 is
  the first consumer, not the definition of the work

> This plan may be reviewed and committed now, but no implementation task may
> start until Caleb explicitly reviews and accepts it, and until the pnh kernel
> milestone gate below is satisfied. It authorizes no deployment, provider
> login, credential change, scheduler change, GitHub write, Brain write,
> `agent-config` write, publication, or live model call. The `push-to-x1` skill
> remains paused.

## Why this plan replaces the DSH-era version

The predecessor plan gated all six capabilities on the DeepSeek Harness POC
verdict. That POC terminated at **REJECT** at the Task 1 image-admission gate
(`docs/x1/evidence/dsh-poc-acceptance-2026-08-19.md`), which killed every
`on ADOPT, create x1/dsh/plugins/...` branch in it. The harness target is now
the original narrow security kernel described in
`docs/plans/provider-neutral-harness/architecture.md`, selected by the
OpenHands intake (`intake-openhands-sdk-2026-08-19.md`, verdict IMITATE: static
loading, at-most-once execution, tamper-evident evidence, and a minimal public
core are all absent or contradicted upstream).

The runtime is therefore no longer conditional. There is no verdict branch, no
runtime pin to a third-party release, and no `<replacement-runtime>` placeholder
path. There is one substrate: pnh's narrow kernel.

Reassessing the six Hermes-derived capabilities against pnh rather than DSH
improves four of them, tightens one, and moves one out of the public core:

- **Better fit under pnh (4 of 6).** Completion, read-only Code Mode, lean
  context, and lifecycle notifications each needed a property pnh already
  treats as non-negotiable — trusted stopping authority, a real OS sandbox,
  Runtime-owned compaction, and a Telemetry plugin kind that observes without
  changing authority. Under DSH these were bolt-ons contending with the host's
  design. Under pnh they are the host's design.
- **Same discipline, stronger enforcement (1 of 6).** Progressive tool
  disclosure still must never expand authority. Under DSH that was governance.
  Under pnh it is structural: the architecture forbids mutable registries,
  ambient discovery, and model-authored plugins outright, and the C19
  mechanisms (module-graph closure, Docker-contained manifest-scoped
  determinism harness, 100% coverage gate) are executable and fail closed.
- **Rejected from core for an architectural reason (1 of 6).** Learning
  proposals were previously rejected-from-activation by governance. They are
  now rejected from the public core by the boundary rule "consumer-specific
  policy remains outside the public core." A pipeline whose destinations are
  Brain and `agent-config` is consumer policy. pnh's public core must not know
  those systems exist.

## Outcome

Add the Hermes patterns that address measured weaknesses in Caleb's laptop and
X1 workflows, implemented as pnh Runtime properties and statically registered
pnh plugins. Hermes remains a research source, never a dependency. The five
in-scope capabilities are independently gated and independently disableable.

| Capability | Intended result | pnh home |
| --- | --- | --- |
| Completion policy | Programs continue through reversible work and stop only after trusted evidence establishes a terminal state. | Runtime + Result/Evidence contracts (core property, not a plugin) |
| Progressive tool disclosure | Workers discover every already-admitted tool without loading every schema into the initial prompt. | Tool plugin over a pre-resolved manifest |
| Read-only Code Mode | Generated programs batch search, reads, and session queries without receiving mutation authority. | Tool plugin whose bindings execute inside the existing pnh OS sandbox |
| Lean context recovery | Compaction removes token-heavy history while preserving exact task, path, error, and recovery anchors. | Runtime compaction + Context plugin |
| Lifecycle notifications | Caleb receives verified milestone, anomaly, and terminal updates without model heartbeat turns. | Telemetry plugin; delivery stays consumer-side |
| ~~Learning proposals~~ | Out of pnh scope. Belongs to a consumer adapter, specified separately. | Consumer adapter only (see "Excluded from the public core") |

X1/C3 remains the authorization, queue, replay, audit, and publication control
plane on the consumer side. pnh owns one admitted task at a time and never
becomes a scheduler.

## Dependency and milestone gate

The predecessor plan gated on a third-party runtime verdict. This plan gates on
pnh's own implementation milestones. All three must be owner-accepted before
any implementation file in this plan is created.

| Milestone | State | Required evidence |
| --- | --- | --- |
| M1. Kernel boundary enforcement | **Satisfied (2026-08-19).** Kernel Plan 1 Tasks 1–8 are complete and accepted; module-graph closure, the Docker-contained determinism harness, and `c8 --all --100` execute in the standard gate. | Completion record in `2026-08-19-kernel-plan-1.md`; final READY audit in `docs/audits/2026-08-19-kernel-plan-1-audit.md`; `.github/workflows/pnh.yml` |
| M2. Runtime and plugin kernel | **Blocked / not implemented.** | A separately approved plan must deliver the Runtime task loop, Plugin SDK registration interfaces, and static plugin-manifest resolution with an ordered plugin-set digest in task evidence. |
| M3. Broker and durable ledger | **Blocked / not implemented.** | A real broker exercise and a durable consume ledger adapter must provide at-most-once semantics; `MemoryReplayLedger` remains explicitly non-conforming. |

A missing, partial, ambiguous, or unaccepted milestone is `BLOCKED`, not
permission to start early. The satisfied milestone set, the pnh source digest,
and the accepted provider catalog digest are written into a reviewed lock
artifact by Task 0 and cannot be inferred by a model.

Kernel Plan 1 is complete. This follow-up remains proposed: drafting and
committing this document is authorized, but implementation still requires
explicit owner acceptance after M2 and M3 are satisfied.

## Architecture decision

Keep policy and authority in trusted code outside the model worker, expressed
through pnh's five contract families and five plugin kinds. Add nothing that
requires the worker, a plugin, a model, or repository content to hold authority.

```text
consumer control plane (X1/C3 or an embedding application)
                        |
                        | authorized task + capability grant
                        v
              consumer-specific adapter (out of public core)
                        |
                        v
+------------------------------------------------------------------+
|                    provider-neutral harness                       |
|                                                                   |
|  contracts (pure core)            deterministic Runtime           |
|   task | capability | telemetry     task loop, bounded context,   |
|   evidence | result                 append-only events,           |
|   + completion-contract             COMPACTION, STOPPING,         |
|   + completion-recommendation       TERMINAL RESULT               |
|   + completion-evidence                     ^                     |
|   + tool-catalog-entry                      |                     |
|   + code-mode-program              capability-secured             |
|   + context-anchor-index            plugin kernel                 |
|   + lifecycle-event                         |                     |
|                                statically registered plugins      |
|                       tool: tool-search | tool: code-mode-readonly|
|                       context: anchor-index                       |
|                       telemetry: lifecycle-observer               |
+------------------------------+------------------------------------+
                               |
                               | task-scoped broker protocol
                               v
                     trusted external brokers
                               |
                               v
                      provider adapters (credentialed)

untrusted worker sandbox (pnh/harness OS sandbox)
  bounded workspace, tools, context, output
  no credentials, endpoints, publisher authority, plugin-install authority
  read-only Code Mode RPC executes HERE, not in the Runtime process
```

Dependency direction is one way and unchanged: consumer adapters, provider
adapters, and plugins may import public contracts; contracts and Runtime may
not import X1, a provider SDK, credentials, endpoints, or private policy. Every
core module added by this plan is subject to the same three C19 mechanisms as
existing core.

### Proposed directory convention (judgment call — confirm before Task 1)

`pnh/` currently has `core/`, `harness/`, `scripts/`, `adapters/`, and `tests/`.
It has no plugin or runtime directory yet, and neither the architecture doc nor
Kernel Plan 1 names one. This plan **proposes** the following and treats it as
open for revision at review time:

| Path | Contents | Boundary |
| --- | --- | --- |
| `pnh/core/` | Contract types and pure validators, including the seven contracts below | Core purity + C19 enforced |
| `pnh/runtime/` | Task loop, compaction, stopping, terminal-result assembly, completion evaluation | Outside core; may use Node APIs |
| `pnh/sdk/` | Public plugin manifests and capability-scoped registration interfaces | Outside core |
| `pnh/kernel/` | Manifest checks, static resolution, grant binding, deterministic ordering, plugin evidence | Outside core |
| `pnh/plugins/<kind>/<id>/` | Statically registered plugins, e.g. `pnh/plugins/tool/tool-search/`, `pnh/plugins/tool/code-mode-readonly/`, `pnh/plugins/context/anchor-index/`, `pnh/plugins/telemetry/lifecycle-observer/` | Outside core; each carries a manifest |
| `pnh/harness/` | Existing OS sandbox (Containerfile, `sandbox.ts`, loader transform) | Unchanged by this plan except for new bounded RPC operations |
| `pnh/benchmark/` | Paired-benchmark fixtures, runner, and report generator | Test-only |
| `x1/pnh-adapter/` | The X1/C3 consumer adapter: delivery destinations, deployment lock, learning proposals | Outside pnh entirely; excluded from any public release |

The `<kind>` segment mirrors the architecture doc's five plugin kinds exactly
(`task`, `tool`, `context`, `policy`, `telemetry`), so a plugin's declared kind
and its location cannot disagree silently. If Caleb prefers a flat
`pnh/plugins/<id>/` with kind carried only in the manifest, that is a one-line
change to every Files list below.

### Extraction point

The correct long-term shape is a published provider-neutral harness consumed by
X1, Claude Code, and Codex adapters. This plan does not extract or publish
anything. It builds inside `pnh/` under the architecture doc's open-source
boundary rules so extraction stays possible: no X1 identity, provider identity,
endpoint, route, or private policy enters `pnh/`, and every added contract keeps
the neutral vocabulary Kernel Plan 1 already enforces (synthetic slugs such as
`class-a`, never real provider or model names). Publication remains gated by the
architecture doc's license closure, threat model, and sanitization work, plus
new explicit approval.

## Locked decisions

| Decision | Rule |
| --- | --- |
| Completion authority | Models emit `complete`, `continue`, or `blocked` as an advisory recommendation only. The Runtime alone converts it into authoritative state, after deterministic checks, budget state, and independent verifier evidence. Never model text alone. |
| Plugin authority | Plugins may narrow authority or reject work. No plugin, in any kind, may expand a task's capability grant, add a tool, widen a path, or mark completion. |
| Tool set mutability | The tool manifest is resolved and frozen before the task starts. Tool Search indexes that frozen set. There is no runtime registration, no ambient discovery, no `latest`, no model-authored or repository-supplied plugin. |
| Code Mode | Read-only host bindings only, executing inside the pnh OS sandbox. Mutation requires a separate security and benchmark plan. |
| Durable learning | Rejected from the public core. Brain remains the durable knowledge destination, reached only through a consumer adapter and the existing capture pipeline. pnh keeps no durable canonical memory and never names Brain or `agent-config`. |
| Notifications | Audit every lifecycle event inside pnh; classify and redact inside the Telemetry plugin; deliver only from the consumer side, only on verified milestones, anomalies, and terminal outcomes. |
| Provider routing | Every builder and verifier uses an immutable exact provider/model assignment. No fallback, alias resolution, or silent model upgrade. |
| Boundary enforcement | Every core module this plan adds must keep module-graph closure, the Docker-contained loader/supervisor determinism harness, and `c8 --all --100` green. A capability that cannot be built without weakening one of those is rejected, not accommodated. |
| Evidence | Missing or unwritable evidence fails the task closed. Unsupported telemetry fields are explicit `null`, never inferred. |

## Capability verdicts

This table replaces the predecessor plan's "Reuse, extend, and reject" and
"Feature thresholds" tables. The verdicts were decided against the current pnh
architecture and are inputs to this plan, not outputs of it.

| Capability | Verdict | Architectural placement | Reason |
| --- | --- | --- | --- |
| Completion policy | **Adopt as a core Runtime property** | Runtime stopping + Result contract; new `completion-*` contracts in `pnh/core/` | The architecture doc already assigns "stopping" and "terminal results" to the Runtime and restricts the Policy plugin kind to narrowing and rejecting. Making completion a plugin would put a terminal-state decision behind an extension point. This is the same invariant as "no worker, plugin, model, or repository can authorize publication." |
| Progressive tool disclosure | **Adopt as a Tool plugin, constrained** | `pnh/plugins/tool/tool-search/` over the kernel's pre-resolved manifest | OpenHands' mutable, ambient, overwrite-on-duplicate registry is exactly what pnh forbids. Tool Search is therefore a read-only index over an already-admitted manifest. `tool_search`/`tool_describe`/`tool_call` delegate to existing bounded dispatch and can never expand the grant. Enforcement is the C19 mechanisms plus the frozen plugin-set digest, not governance. |
| Read-only Code Mode | **Adopt — best-aligned of the six, partly under construction** | `pnh/plugins/tool/code-mode-readonly/` with bindings dispatched into `pnh/harness/` | pnh already has a real OS/container sandbox (`pnh/harness/sandbox/`, `2026-08-19-task3-os-sandbox-design.md`): no network, read-only root, no capabilities, fresh worker per call. The predecessor plan's stated weakness was that a DSH worker thread is containment, not a security boundary. That weakness no longer exists. |
| Lean context recovery | **Adopt as Runtime compaction + a Context plugin** | `pnh/runtime/compaction/` + `pnh/plugins/context/anchor-index/` | "Compaction" is an explicit Runtime responsibility and "Context" is a named plugin kind for explicitly admitted context. The mechanical anchor index (exact paths, commits, task IDs, error signatures preserved outside lossy summary text) maps onto both with no architecture change. |
| Learning proposals | **Reject from the public core** | Consumer adapter only (`x1/pnh-adapter/`), specified by a separate plan | The destinations are Brain and `agent-config`. Under "consumer-specific policy remains outside the public core," a pipeline defined by those destinations cannot be a pnh plugin kind, core component, or contract. The proposal-only, scan-then-independent-review-then-owner-approval discipline is preserved — it just lives on the consumer side. |
| Lifecycle notifications | **Adopt as a Telemetry plugin** | `pnh/plugins/telemetry/lifecycle-observer/`; delivery in `x1/pnh-adapter/lifecycle/` and the existing `notification-dispatcher/` | Telemetry is a named plugin kind for observing normalized events without changing authority — a cleaner fit than under DSH. Classification, redaction, and idempotent replay are native Telemetry shapes; Telegram delivery is consumer policy and stays outside pnh. |

Rejected outright, unchanged from the predecessor plan: Hermes memory, skill
auto-write, smart approvals, provider fallback, dynamic plugins, nested
delegation, dashboard, and scheduler. These broaden authority, duplicate
existing systems, or conflict with exact routing.

Do not add LangChain, LangGraph, Deep Agents, or OpenHands as an orchestration
layer or dependency. The OpenHands intake's IMITATE verdict is binding: its
patterns transfer, its packages do not. LangFuse may be evaluated later as an
optional event sink, never as authority, a required execution dependency, or a
canonical evidence store.

### Excluded from the public core: learning proposals

No file in `pnh/` may implement, name, or type a learning proposal under this
plan. If Caleb wants the capability, it needs its own plan targeting
`x1/pnh-adapter/learning/`, reusing the predecessor plan's Task 6 design
verbatim (terminal-event-only generation, content-addressed temporary queue,
deterministic secret/injection/unsafe-path scanning before review, read-only
independent reviewer with no promotion authority, one-time owner-approval
receipt bound to digest and expiry, no destination writes performed by the
harness itself). A `learning-proposal` contract may belong to that consumer
adapter's own spec. It does not belong to pnh's contract set.

## Shared contracts

Kernel Plan 1 establishes the contract convention already in use: contracts are
**pure TypeScript modules in `pnh/core/`**, validated by pure functions that
accept only plain records with exact own enumerable data properties, reject
symbols/accessors/inherited fields, return normalized copies, use canonical
fixed-arity serialization, and carry neutral vocabulary. This plan follows that
convention rather than the predecessor plan's parallel JSON Schema tree.

**Judgment call, flagged:** this inverts the predecessor plan's statement that
"generated TypeScript types are build artifacts, not a second source of truth."
Here the TypeScript module is the source of truth, because that is what the C19
mechanisms can actually enforce — a JSON Schema file has no module graph, no
Docker-contained loader execution, and no coverage. If a cross-language consumer needs JSON
Schema, it is emitted deterministically from the core modules as a build
artifact under `pnh/schema-emit/`, with a `git diff --exit-code` drift test, and
it is never authoritative.

| Contract | Module | Required purpose |
| --- | --- | --- |
| Completion contract | `pnh/core/completion-contract.ts` | Declares task outcomes, deterministic checks, independent verifier requirements, wait conditions, allowed continuations, and terminal conditions. |
| Completion recommendation | `pnh/core/completion-recommendation.ts` | Carries an advisory model verdict (`complete` \| `continue` \| `blocked`) with evidence references. It cannot change state and carries no authority field. |
| Completion evidence | `pnh/core/completion-evidence.ts` | Carries trusted check, artifact, policy, budget, verifier, and broker-receipt results the Runtime evaluates. |
| Tool catalog entry | `pnh/core/tool-catalog-entry.ts` | Describes an already-admitted tool by stable identity, search text, schema digest, policy class, and result limits. |
| Code Mode program | `pnh/core/code-mode-program.ts` | Declares generated-code digest, approved read-only binding set, input digests, limits, and result metadata. |
| Context anchor index | `pnh/core/context-anchor-index.ts` | Preserves exact paths, commits, task IDs, error signatures, decisions, route/model identity references, and session recovery pointers. |
| Lifecycle event | `pnh/core/lifecycle-event.ts` | Carries trusted milestone, anomaly, and terminal events with redaction class and deduplication key. |

Dropped from the predecessor plan's set:

- `learning-proposal.schema.json` — rejected from core (see above).
- `runtime-feature-lock.schema.json` — there is no longer a third-party runtime
  verdict to pin, and a feature-flag lock is deployment policy. It becomes a
  consumer artifact, `x1/pnh-adapter/followup-baseline-lock.json`, validated by
  a consumer-side schema outside the public contract set.

Constraints on every contract added here: no secrets, endpoints, subscription
session data, prompt bodies, raw repository content, real provider/model/route
identity, or worker-supplied absolute path treated as authority. Evidence
references use content digests and admitted artifact IDs. Breaking changes
require a new contract version, a migration fixture, and separate owner
approval.

## Provider and model assignment contract

The accepted provider catalog is the only source for exact executable model IDs.
Before this plan can be admitted, Task 0 materializes
`x1/pnh-adapter/hermes-followup-assignments.json` with exact immutable values
and its SHA-256 digest. Markdown labels such as `latest`, `strong`, or `sonnet`
are never executable model IDs.

This governance layer is independent of which harness runtime was chosen and
carries forward from the predecessor plan essentially unchanged.

| Task | Builder route | Independent verifier route |
| ---: | --- | --- |
| 0 | No LLM: trusted gate code only | No LLM |
| 1 | Codex through ChatGPT Max subscription; exact catalog model ID | Claude through Claude Max subscription; exact catalog model ID |
| 2 | Claude through Claude Max subscription; exact catalog model ID | Codex through ChatGPT Max subscription; exact catalog model ID |
| 3 | GLM through its subscription API key; exact catalog model ID | Codex through ChatGPT Max subscription; exact catalog model ID |
| 4 | DeepSeek through its direct API key; exact catalog model ID | Claude through Claude Max subscription; exact catalog model ID |
| 5 | Kimi through its subscription API key; exact catalog model ID | Codex through ChatGPT Max subscription; exact catalog model ID |
| 6 | GLM through its subscription API key; exact catalog model ID | Claude through Claude Max subscription; exact catalog model ID |
| 7 | Codex through ChatGPT Max subscription; exact catalog model ID | Claude through Claude Max subscription; exact catalog model ID |
| 8 | No builder LLM; trusted evidence aggregation | Claude subscription final audit using an exact catalog model ID |

The assignment file resolves each cell to one route ID, provider ID, model ID,
authentication class, and client/protocol version. A missing route, unavailable
subscription, model mismatch, verifier/builder identity collision, or changed
catalog digest blocks the task. No provider can substitute for another.

Claude and Codex assignments must resolve to the accepted subscription routes.
Anthropic and OpenAI API-key routes remain disabled. GLM and Kimi must resolve
to their approved subscription API-key classes, and DeepSeek to its approved
direct API-key class. The worker never receives any credential, and the routes
above are consumer-side execution facts — none of these identities may appear
anywhere in `pnh/`.

Every auxiliary runtime model call is also manifest authority, not ambient
harness behavior. Completion advice comes only from the current builder or its
declared verifier. Compaction uses the current task's exact route unless the
manifest declares a separate exact compactor route. Tool Search, Code Mode
dispatch, lifecycle classification, policy checks, evidence aggregation, and
notification delivery remain deterministic and perform no model calls.

## Five mandatory exit gates

| Gate | Required proof | Failure result |
| --- | --- | --- |
| 1. Authority | The Runtime remains the only state-transition authority. No plugin, worker, model, or repository input can broaden a grant, add a tool, mutate policy, publish, or mark completion. | Reject the affected feature and release candidate. |
| 2. Isolation | Read-only Code Mode cannot reach shell, environment, credentials, network, Git, write APIs, unrelated repositories, broker state, or control-plane state, and every binding call is mediated by trusted RPC inside the pnh OS sandbox. | Reject Code Mode and the release candidate. |
| 3. Correctness | Deterministic checks and an isolated verifier reach the same acceptance outcome as the control. Injected failures never produce false completion. | Reject the affected feature and release candidate. |
| 4. Efficiency | Progressive disclosure, Code Mode, and compaction meet their paired token and round-trip thresholds without lower quality or untrusted telemetry. | Imitate or reject the feature per the decision bands. |
| 5. Boundary and operational safety | After every added module: module-graph closure passes, the Docker-contained loader/supervisor determinism harness passes, `c8 --all --100` passes over all of `pnh/core/`, notifications contain only allowed sanitized events, restart/replay is idempotent, all evidence is attributable, and no consumer identity appears in `pnh/`. | Reject the affected feature and release candidate. |

Passing unit tests alone does not satisfy a gate that requires a real sandbox,
broker receipt, restart, isolation probe, or paired benchmark. Gate 5 is the
one materially new gate relative to the predecessor plan: a capability that
would require relaxing a C19 mechanism is rejected on that ground alone.

## Non-goals

- Do not install or run Hermes Agent, OpenHands, OpenCode, or DeepSeek Harness
  as part of pnh execution. They remain behavioral references.
- Do not create another scheduler, dashboard, task board, memory database, or
  orchestration control plane.
- Do not implement learning proposals, Brain writes, or `agent-config` writes in
  any form, in `pnh/` or elsewhere, under this plan.
- Do not publish, package, extract, or create any `packages/` path.
- Do not add mutating Code Mode bindings, model-created tasks, dynamic runtime
  plugins, arbitrary MCP servers, provider fallback, or interactive questions.
- Do not touch `x1/dsh/**`; it remains under stop-work.
- Do not resume or implement the `push-to-x1` skill.

## Estimate and budget boundary

Budget 14 to 22 focused engineering days after the milestone gate is satisfied:
2 to 3 days for the baseline lock and contracts, 8 to 12 days for the five
features (Code Mode is the cheapest of them because the sandbox already exists;
completion is the most expensive because it touches Runtime terminal state), and
4 to 7 days for paired benchmarks and the final audit. Removing the learning
pipeline takes roughly 3 days out of the predecessor plan's estimate.

All live runs inherit the consumer's aggregate call, token, direct-API spend,
retry, wall-time, and concurrency ceilings. Subscription routes still have call
and token ceilings. A missing active budget profile blocks a live run. This
plan does not authorize credentials or billing.

## Implementation sequence

### Phase 0: Consume the pnh milestone gate

#### Task 0: Freeze the milestone set, assignments, and benchmark baseline

**Provider/model:** No LLM. This is a trusted deterministic admission task.

**Files:**

- Create `x1/pnh-adapter/README.md` stating that this tree is consumer-specific
  and excluded from any pnh publication.
- Create `x1/pnh-adapter/schemas/followup-baseline-lock.schema.json`.
- Create `x1/pnh-adapter/followup-baseline-lock.json`.
- Create `x1/pnh-adapter/hermes-followup-assignments.json`.
- Create `x1/pnh-adapter/benchmark/baseline-manifest.json`.
- Create `docs/x1/evidence/pnh-hermes-followup/gate-0.md`.

**Implementation:**

1. Read the M1/M2/M3 acceptance records, the pnh source digest, the C19 CI run
   evidence, the accepted provider catalog digest, and the benchmark profile.
2. Fail closed unless every milestone is owner-accepted against the exact plan
   digests it claims. A partial milestone is `BLOCKED`, not a reduced scope.
3. Materialize exact builder and verifier route/model assignments from the
   accepted catalog. Verify every route's authentication class and prohibit
   aliases, fallback, and same-identity builder/verifier pairs.
4. Record the control fixture, prompts, admitted tool manifest, limits, checks,
   holdouts, source commit, and sanitized telemetry fields used for paired
   comparison.
5. Leave every follow-up feature flag disabled. Hash the lock, assignments, and
   baseline manifest into the consumer's admission evidence.

**Verification:**

- Fixtures reject a missing milestone, an unaccepted milestone, a stale plan
  digest, a changed catalog, an unresolved model ID, a fallback route, a
  duplicate builder/verifier identity, and an enabled feature flag.
- A clean fixture reproduces the accepted pnh source and baseline digests.
- No provider client, credential store, worker, scheduler, or pnh source file
  is touched.

**Stop condition:** Stop on an unsatisfied milestone, pnh source drift, route
ambiguity, or missing baseline.

### Phase 1: Add the follow-up contracts to core without weakening it

#### Task 1: Seven pure contract modules under the C19 mechanisms

**Provider/model:** Builder uses the exact Codex subscription route in the
assignment file. The independent contract review uses its exact Claude
subscription route.

**Files:**

- Create the seven `pnh/core/*.ts` contract modules listed above.
- Create the matching `pnh/tests/*.test.ts` suites, each loading core through
  the Docker-contained fresh-worker harness.
- Create `pnh/schema-emit/emit.ts` and `pnh/schema-emit/generated/`.
- Create `pnh/tests/schema-emit-drift.test.ts`.
- Update `package.json` scripts only if a new focused command is required; do
  not change the meaning of `test:pnh`.

**Implementation:**

1. Follow Kernel Plan 1's validation convention exactly: accept only
   plain/null-prototype records with exact own enumerable data properties;
   reject symbols, accessors, and inherited fields; return normalized copies;
   use anchored regexes, integer arithmetic, and injected clock values; use no
   `Date`, `crypto`, `Math.random`, `process`, or `node:` import.
2. Separate model claims from trusted observations at the type level. The
   completion recommendation module must be structurally incapable of carrying
   an authority, state, or promotion field.
3. Use canonical fixed-arity, fixed-order serialization with a leading version
   tag wherever a contract is digested, so no two distinct valid values share
   bytes.
4. Keep vocabulary neutral: slugs only, synthetic fixture values, no provider,
   model, endpoint, route, or X1 identity anywhere.
5. Emit JSON Schema deterministically from the core modules as a build artifact.
   A clean emit followed by `git diff --exit-code` must pass. The emitted files
   are never imported by core.

**Verification:**

- `npm run test:pnh` passes with all three C19 mechanisms green, including
  `c8 --all --100` over the seven new files.
- Invalid fixtures cover model-asserted authority, unknown properties,
  oversized values, unsafe paths, secret-shaped fields, missing digests,
  prototype-pollution shapes, and unsupported versions.
- The Claude review attempts to prove the contracts leak consumer identity,
  allow privilege expansion, or prevent a future non-X1 consumer; blocking
  findings are fixed before Task 2.

**Stop condition:** Stop if a contract requires a `node:` import, an ambient
intrinsic, an exclusion from the coverage gate, a consumer-specific field, or a
structure that lets a model claim authority.

### Phase 2: Make completion a trusted Runtime decision

#### Task 2: Deterministic completion, continuation, and wait barriers

**Provider/model:** Builder uses the exact Claude subscription route in the
assignment file. The verifier uses its exact Codex subscription route.

**Files:**

- Create `pnh/runtime/completion/policy.ts`.
- Create `pnh/runtime/completion/evidence.ts`.
- Create `pnh/runtime/completion/wait-barrier.ts`.
- Create `pnh/tests/completion-policy.test.ts`.
- Create `pnh/tests/fixtures/completion-policy/`.
- Update the Runtime task loop's stopping path to call the completion evaluator
  as its only terminal-state producer.

**Implementation:**

1. The model may emit only a completion recommendation with evidence
   references. The Runtime evaluates the completion contract against
   deterministic checks, expected artifacts, allowed paths, policy state,
   aggregate budget, broker receipts, independent verifier evidence, and
   unresolved blockers before changing state.
2. No Policy plugin may be consulted for a completion decision. Policy plugins
   narrow and reject; they never affirm a terminal state. Prove this with a
   negative test that registers a maximally permissive Policy plugin and shows
   it cannot produce completion.
3. Add a durable wait barrier for approved external work. Only trusted receipt
   events may wake it. Waiting consumes no model heartbeat turns and resumes
   idempotently after restart, using the durable consume ledger's at-most-once
   semantics rather than a nonce alone.
4. Continue automatically through reversible, in-scope work while budgets and
   the completion contract permit. Stop for destructive work, secrets, billing,
   deployment, publication, or a major architecture change outside the admitted
   task.
5. Preserve the retry policy: one classified transient infrastructure retry;
   semantic, test, verifier, policy, auth, integrity, path, and budget failures
   do not retry automatically.

**Verification:**

- Tests prove a `complete` recommendation cannot bypass a failing check,
  missing artifact, changed path, exhausted budget, absent verifier, stale
  receipt, or policy failure.
- Restart fixtures prove `continue` and `wait` resume exactly once without
  repeating verified work or issuing a heartbeat model call, including a crash
  injected between effect and evidence persistence (the OpenHands at-least-once
  failure mode, used here as a negative conformance test).
- Failure injection produces zero false-complete outcomes across all fixtures.
- The isolated Codex verifier cannot mutate task state or its own evidence.

**Stop condition:** Stop on any path where model text, plugin output, or a
single evaluator directly produces authoritative completion, or where restart
can re-execute an already-effectful operation.

### Phase 3: Add progressive tool disclosure over a frozen manifest

#### Task 3: A Tool plugin that indexes, never expands

**Provider/model:** Builder uses the exact GLM subscription API route in the
assignment file. The verifier uses its exact Codex subscription route.

**Files:**

- Create `pnh/plugins/tool/tool-search/manifest.json`.
- Create `pnh/plugins/tool/tool-search/index.ts`.
- Create `pnh/plugins/tool/tool-search/catalog.ts`.
- Create `pnh/plugins/tool/tool-search/search.ts`.
- Create `pnh/tests/tool-search-policy.test.ts`.
- Create `pnh/tests/fixtures/tool-search/`.

**Implementation:**

1. Build the searchable catalog only from the plugin set the kernel already
   resolved and froze for the current task, restricted to what the task's
   capability grant authorizes. A search result can narrow authority but can
   never add a tool, path, verb, or network target.
2. Expose three fixed operations: `tool_search`, `tool_describe`, and
   `tool_call`. Use bounded lexical/BM25 search over trusted catalog fields
   only.
3. Return compact summaries from search, the full schema only from describe,
   and delegate calls through the kernel's existing capability-scoped dispatch.
   Preserve underlying tool identity, schema digest, policy class, call ID,
   limits, and audit hooks — the bridge must not become an identity laundering
   layer.
4. Reject model-authored catalog entries and any runtime schema mutation. The
   ordered plugin-set digest recorded in task evidence must be identical before
   and after every search session; assert this in tests.
5. Cap result counts, schema bytes, query length, call depth, result bytes, and
   repeated failed searches. No recursive bridge calls, no hidden direct access
   to unadmitted tools.

**Verification:**

- A fixture with at least 75 mixed tools proves every authorized tool is
  discoverable and every unauthorized tool is absent from search, describe,
  call, and audit output.
- Initial tool-schema tokens are at most 35 percent of the eager-loading
  control.
- Task success and deterministic acceptance equal the control; total tokens may
  not exceed 105 percent and median wall time may not exceed 120 percent.
- Prompt-injection strings in untrusted repository content, tool output, and
  prior context do not create or alter catalog entries.

**Stop condition:** Stop if the bridge obscures underlying tool identity,
bypasses the kernel's dispatch, mutates the plugin-set digest, or makes an
unadmitted capability discoverable.

### Phase 4: Constrain Code Mode to read-only batching inside the existing sandbox

#### Task 4: A bounded generated-program Tool plugin with read-only RPC

**Provider/model:** Builder uses the exact DeepSeek direct API route in the
assignment file. The verifier uses its exact Claude subscription route.

**Files:**

- Create `pnh/plugins/tool/code-mode-readonly/manifest.json`.
- Create `pnh/plugins/tool/code-mode-readonly/index.ts`.
- Create `pnh/plugins/tool/code-mode-readonly/bindings.ts`.
- Create `pnh/plugins/tool/code-mode-readonly/limits.ts`.
- Extend `pnh/harness/sandbox.ts` with the bounded read-only RPC operations,
  preserving its existing JSON-only boundary and fresh-worker-per-call model.
- Create `pnh/tests/code-mode-isolation.test.ts`.
- Create `pnh/tests/fixtures/code-mode/`.

**Implementation:**

1. Run generated code in the existing pnh OS sandbox: no network, read-only
   root, no Linux capabilities, fresh child worker per call, destroyed after.
   The generated program receives no filesystem, process, environment, network,
   Git, MCP, broker, or control-plane object — only JSON in and JSON out.
2. Expose only task-scoped `search`, `read_file`, `session_query`, and pure
   data-processing bindings. Canonicalize paths in trusted RPC code outside the
   sandbox and enforce the task's workspace root, allowed-read paths,
   file-count, byte, and query limits on every call.
3. Deny shell, file mutation, Git mutation, network, MCP writes, publication,
   credential access, provider selection, task creation, and plugin-set
   mutation by construction and with explicit negative tests.
4. Add limits: generated source bytes, compile time, wall time, binding-call
   count, input bytes, output bytes, intermediate binding bytes, recursion
   depth, and memory. Termination must reap any child process the sandbox owns.
5. Record code digest, binding-set digest, inputs, call receipts, limits, and
   final result as evidence. Keep intermediate values out of model context and
   out of durable evidence unless a bounded sanitized failure record needs them.

**Verification:**

- Isolation fixtures attempt environment reads, credential paths, shell,
  process spawning, symlink escape, traversal, network, DNS, Git, writes,
  dynamic imports, constructor-based intrinsic recovery, MCP writes, broker
  access, and cross-repository reads. Every attempt fails with a policy receipt.
- An overflow fixture proves intermediate values and final output are capped
  before reaching the worker or the evidence store.
- Paired read/search aggregation tasks use at least 25 percent fewer
  model/tool round trips and at most 85 percent of control tokens with equal
  results.
- Termination and restart leave no surviving process and do not repeat an
  accepted binding receipt.

**Stop condition:** Stop on any host capability not mediated by trusted RPC,
any sandbox escape, any weakening of the Docker policy, or any lower-quality
aggregate result.

### Phase 5: Make compaction lean and exactly recoverable

#### Task 5: Mechanical anchors as a Context plugin over Runtime compaction

**Provider/model:** Builder uses the exact Kimi subscription API route in the
assignment file. The verifier uses its exact Codex subscription route.

**Files:**

- Create `pnh/runtime/compaction/policy.ts`.
- Create `pnh/runtime/compaction/recovery.ts`.
- Create `pnh/plugins/context/anchor-index/manifest.json`.
- Create `pnh/plugins/context/anchor-index/index.ts`.
- Create `pnh/tests/lean-context.test.ts`.
- Create `pnh/tests/fixtures/lean-context/`.

**Implementation:**

1. Run deterministic tool-result pruning before any model summarization.
   Preserve the immutable task, capability grant digest, completion contract,
   active policy and budget digests, and the newest user instructions outside
   lossy summary text.
2. Build the mechanical anchor index for exact workspace paths, base and
   current commits, task IDs, route/model evidence references, check commands,
   error signatures, accepted decisions, open blockers, artifact digests, and
   event pointers. Never ask a model to recreate an exact anchor from memory.
3. Contribute the index as a Context plugin: explicitly admitted context that
   narrows nothing and expands nothing. It must not be able to introduce a path
   the grant does not already authorize.
4. Allow workspace-scoped session search and exact event reads only through the
   Runtime's trusted query path. Recovery cannot cross task, workspace, worker,
   or retention boundaries, and has no concept of a durable knowledge store.
5. Keep summaries, indexes, and events as execution continuity only. They are
   never durable knowledge and never promote themselves.

**Verification:**

- Fixtures recover every exact path, digest, task ID, route/model evidence
  reference, error signature, command, and unresolved blocker after at least
  two compactions.
- Prompt-injection text in prior tool results remains quoted data and cannot
  alter policy, task authority, or recovery scope.
- Paired long-session runs retain equal acceptance quality with median
  aggregate tokens at most 85 percent and median wall time at most 120 percent
  of control.
- Any missing critical anchor, incomparable telemetry, or changed acceptance
  result rejects the candidate.

**Stop condition:** Stop if compaction loses an authoritative instruction,
acceptance criterion, exact anchor, or recovery boundary, or if the Context
plugin can widen a grant.

### Phase 6: Observe lifecycle without consuming model turns

#### Task 6: A Telemetry plugin with consumer-side delivery

**Provider/model:** Builder uses the exact GLM subscription API route in the
assignment file. The verifier uses its exact Claude subscription route.

**Files:**

- Create `pnh/plugins/telemetry/lifecycle-observer/manifest.json`.
- Create `pnh/plugins/telemetry/lifecycle-observer/index.ts`.
- Create `pnh/plugins/telemetry/lifecycle-observer/classify.ts`.
- Create `pnh/plugins/telemetry/lifecycle-observer/redact.ts`.
- Create `x1/pnh-adapter/lifecycle/dispatch.ts` as the consumer-side delivery
  boundary.
- Extend the root `notification-dispatcher/` with a separate lifecycle envelope
  and delivery policy through its existing trusted boundary. Do not overload or
  weaken the infrastructure-alert domain.
- Create `pnh/tests/lifecycle-observer.test.ts`.
- Create `pnh/tests/fixtures/lifecycle-events/`.
- Create `x1/tests/pnh-lifecycle-dispatch.test.ts`.

**Implementation:**

1. Subscribe as a Telemetry plugin to normalized Runtime, plugin-kernel,
   broker, budget, and verifier events. Telemetry observes and cannot change
   authority. Models cannot emit a notification directly.
2. Audit every lifecycle event inside pnh. Emit only verified milestone,
   anomaly, and terminal classes. Milestones require a durable checkpoint and
   passing phase checks; terminal success requires the Task 2 completion
   evaluation; terminal failure carries its trusted classification.
3. Redact inside the plugin: prompt content, diffs, repository data,
   credentials, endpoints, session material, and raw model output never leave
   it. Emitted events carry only task/program IDs, phase, trusted state,
   elapsed time, budget status, safe evidence references, and the required
   operator action when one exists.
4. Deliver only from the consumer side. Anomalies and terminal outcomes go
   through the existing Telegram-capable dispatcher; verified milestones go to
   the owner-approved low-noise destination recorded in the consumer's
   configuration. A missing destination blocks activation. No heartbeat,
   per-tool, token-by-token, or unchanged-wait messages.
5. Use event ID plus destination as the idempotency key, backed by the durable
   ledger. Retry only classified transient delivery failures; restart and
   replay must not duplicate a notification.

**Verification:**

- A complete event stream yields exactly the expected milestone, anomaly, and
  terminal messages and no others.
- Restart, duplicate, out-of-order, stale, forged-model, and unchanged-wait
  fixtures create no duplicate or unauthorized notification.
- Redaction fixtures place secrets and prompt text in every source field; no
  prohibited value reaches emitted events, dispatcher payloads, logs, or
  failure messages.
- No destination name, endpoint, token, or consumer identity appears anywhere
  in `pnh/`; the boundary check in Gate 5 covers this file set explicitly.
- Notification delivery performs zero model calls.

**Stop condition:** Stop on a notification sourced from model text, a leaked
sensitive field, notification spam, a duplicate terminal message, or any
consumer identity landing inside `pnh/`.

### Phase 7: Run paired feature and integrated benchmarks

#### Task 7: Prove value without weakening any gate

**Provider/model:** Builder uses the exact Codex subscription route in the
assignment file. The independent audit uses its exact Claude subscription
route. The implementation fixture retains its exact per-task provider/model
routes.

**Files:**

- Create `pnh/benchmark/feature-matrix.json`.
- Create `pnh/benchmark/run-paired.ts`.
- Create `pnh/benchmark/report.ts`.
- Create `x1/tests/pnh-followup-live-matrix.test.ts` with explicit live-test
  gating.
- Create `docs/x1/evidence/pnh-hermes-followup/benchmark.md`.

**Implementation:**

1. Run each feature alone against the frozen baseline, then run the accepted
   feature set together. Use the same task inputs, exact routes, prompts,
   admitted tool manifest, limits, sandbox image digest, deterministic checks,
   verifier holdouts, and broker telemetry.
2. Run five paired control/candidate repetitions. Extend to nine when token
   ratios span more than 10 percentage points or classifications disagree. Add
   forced supervisor and worker interruptions after a verified milestone.
3. Measure input, output, cached, and reasoning tokens where the broker
   reports them (`null` where it does not — never inferred), plus model calls,
   tool calls, compactions, context bytes, wall time, retries, policy denials,
   acceptance, verifier result, and notification counts. Reject incomparable or
   untrusted telemetry.
4. Re-run the five exit gates unchanged, including a full `npm run test:pnh`
   with all three C19 mechanisms, plus the completion false-positive, Code Mode
   isolation, tool-identity, and notification-redaction attack fixtures.
5. Keep each feature independently disableable. A failed optional feature does
   not authorize relaxing its gate and does not force adoption of the others.

**Feature thresholds:**

| Feature | `ADOPT` threshold | `IMITATE` band | `REJECT` condition |
| --- | --- | --- | --- |
| Completion policy | Zero false completion; all wait/restart/crash-injection fixtures pass; fewer reversible-unblock turns than control | Safety passes but continuation needs a redesign against the Runtime seam | Any false completion, unauthorized state transition, re-executed effect after restart, or heartbeat model turn |
| Tool Search | Equal quality; initial schema tokens at most 35 percent of control; total tokens at most 105 percent; plugin-set digest unchanged | Equal quality and safety, but savings miss `ADOPT` | Hidden authorized tool, visible unadmitted tool, dispatch bypass, digest mutation, or lower quality |
| Read-only Code Mode | Equal quality; at least 25 percent fewer round trips; tokens at most 85 percent; wall time at most 120 percent | Equal quality and safety with smaller savings | Isolation failure, uncapped value, leaked capability, weakened sandbox policy, or lower quality |
| Lean context | Equal quality; all exact anchors recover; tokens at most 85 percent; wall time at most 120 percent | Equal quality and safety with smaller savings | Lost authority/anchor, cross-scope recall, grant widening, or lower quality |
| Lifecycle observer | Exact allowed messages; zero model calls; replay idempotent; redaction tests pass; zero consumer identity in `pnh/` | Safe event mapping needs a redesigned Telemetry seam | Sensitive leak, spam, duplicate terminal event, model-sourced notification, or consumer identity in core |

For efficiency features, median total tokens above 105 percent or median wall
time above 150 percent is `REJECT`. Everything between the `ADOPT` threshold and
the reject boundary is `IMITATE` when quality and safety are equal. Safety,
correctness, and the boundary mechanisms override efficiency without exception.

**Verification:**

- Every accepted feature passes its targeted tests and all five exit gates in
  one release candidate.
- Requested and actual provider/model evidence match for every builder and
  verifier call; no fallback occurs during injected provider failure.
- The interrupted integrated run resumes from its last verified checkpoint
  without repeated work, questions, heartbeats, or duplicate notifications.
- The Claude audit receives immutable evidence and cannot alter benchmark data,
  feature flags, or verdicts.

**Stop condition:** Stop the matrix on unexpected billing mode, model mismatch,
fallback, credential exposure, interactive prompt, unbounded usage, lower
acceptance quality, a failing C19 mechanism, or a second identical
infrastructure failure.

### Phase 8: Decide per feature and restore the disabled boundary

#### Task 8: Publish evidence, not activation

**Provider/model:** No builder LLM. Trusted code aggregates evidence. The final
read-only audit uses the exact Claude subscription route in the assignment file.

**Files:**

- Create `docs/x1/evidence/pnh-hermes-followup/verdict.json`.
- Create `docs/x1/evidence/pnh-hermes-followup/report.md`.
- Create `docs/x1/evidence/pnh-hermes-followup/rollback.md`.
- Update `x1/pnh-adapter/followup-baseline-lock.json` with final feature
  dispositions and evidence digests.

**Implementation:**

1. Assign `ADOPT`, `IMITATE`, or `REJECT` independently to each feature using
   the ordered rules in Task 7. A model may identify inconsistencies but cannot
   choose or alter a verdict.
2. Record pnh source and sandbox image digests, exact provider/model evidence,
   all test and benchmark commands, sanitized telemetry, failures, skipped
   checks, unresolved non-blockers, and the final audit result.
3. Disable every feature after evaluation. Remove live credentials and
   subscription mounts from the disposable test profile, stop test services,
   and prove the original disabled behavior is restored.
4. Write a separate future activation plan only for features Caleb explicitly
   accepts. The consumer learning-proposal adapter, laptop adapters, publication
   or extraction, mutating Code Mode, and the `push-to-x1` skill each remain
   separately gated.
5. Do not deploy, push, open a PR, activate a timer, change a default, publish,
   or write to Brain or `agent-config` under this task.

**Verification:**

- The report is reproducible from immutable evidence and reports every failed
  or skipped check accurately.
- Feature flags, services, temporary mounts, and test credentials return to
  their pre-run disabled state.
- The final audit has read-only access and no verdict-write capability.
- `npm run test:pnh`, `npm run validate:x1`, `npm run test:x1`,
  `npm run test:x1:fixtures`, and `npm run build` pass after cleanup.
- `npm test --prefix notification-dispatcher` and
  `npm run build --prefix notification-dispatcher` pass after cleanup.

**Stop condition:** The plan is complete only when evidence is recorded, the
test configuration is disabled, cleanup checks pass, and no activation work
remains inside this scope.

## Commit and execution boundaries

Implementation uses one dedicated branch and isolated worktree after the
milestone gate. Commit only verified phase boundaries. Do not combine kernel
plan work and follow-up work into one branch, because accepted kernel milestone
evidence is an immutable input to this plan.

Local commits are permitted only when the execution program explicitly admits
them. Push, draft PR creation, deployment, service activation, credential
provisioning, provider login, publication, Brain capture, and `agent-config`
mutation retain their existing explicit approval boundaries. No task may modify
its own plan, assignments, provider catalog, policy, verifier, allowed paths, or
any C19 mechanism.

## Completion contract

This follow-up is complete when:

1. The pnh milestone gate was satisfied without ambiguity and every executable
   task assignment contains exact provider/model IDs.
2. The seven follow-up contracts live in `pnh/core/`, pass all three C19
   mechanisms, contain no consumer identity, and emit stable JSON Schema
   artifacts that are never authoritative.
3. Every implemented feature passes its safety, correctness, recovery, and
   paired benchmark thresholds plus all five exit gates.
4. An independent read-only audit finds no blocking gap and trusted code records
   per-feature verdicts from immutable evidence.
5. The test configuration is disabled again, all cleanup checks pass, and no
   learning pipeline, consumer adapter behavior, publication, or `push-to-x1`
   behavior has been activated.

## Source records

- [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs/)
- [Hermes Agent 0.20.4 release](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.18)
- [Hermes persistent goals](https://hermes-agent.nousresearch.com/docs/user-guide/features/goals)
- [Hermes Tool Search](https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-search)
- [Hermes Code Execution](https://hermes-agent.nousresearch.com/docs/user-guide/features/code-execution)
- [Hermes memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes context compression](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching)
- `docs/plans/provider-neutral-harness/architecture.md`
- `docs/plans/provider-neutral-harness/intake-openhands-sdk-2026-08-19.md`
- `docs/plans/provider-neutral-harness/2026-08-19-kernel-plan-1.md`
- `docs/plans/provider-neutral-harness/2026-08-19-task3-os-sandbox-design.md`
- `docs/plans/provider-neutral-harness/2026-08-19-task3-core-scoped-loader-design.md`
- `docs/x1/evidence/dsh-poc-acceptance-2026-08-19.md`
- `docs/plans/2026-08-18-x1-hermes-inspired-dsh-followup.md` (superseded
  predecessor; retained as the DSH-era record)
- `docs/ai/workstreams/20260818-homelab-setup-hermes-dsh-followup-a2a7cb/HERMES-INTAKE.md`
- `historical-agent-config/docs/reports/2026-08-04-usage-review.md`
- `historical-agent-config/docs/specs/research/11-hermes-subsystem-audit.md`
