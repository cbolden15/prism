# Provider-neutral harness plugin opportunity audit

Date: 2026-08-20

Status: read-only product, architecture, and usage audit

Scope: provider-neutral harness (PNH), Caleb's local agent ecosystem, aggregate local usage evidence, and the public Hermes Agent and Prime Agent architectures

## 1. Executive recommendation

PNH should not become a second skills marketplace, a credential host, or a general workflow engine. Its highest-value role is narrower: run owner-approved, digest-pinned components at trust boundaries where deterministic validation, isolation, deadlines, and evidence materially reduce risk.

The recommended plugin roadmap is:

1. After the golden Tool vertical slice, prototype four pure or snapshot-fed Tool plugins: **evidence bundle verifier**, **sensitive-output scanner**, **operational snapshot evaluator**, and **usage hotspot analyzer**. They fit the current JSON Tool protocol, need no ambient host authority, and reuse behavior already present in the homelab audit, usage-mining, and session-state systems.
2. After the five plugin-kind contracts are stable, add **approval evidence guard** (Policy), **memory admission filter** (Memory), **evidence renderer** (Renderer), and **constrained route selector** (Provider). Keep approval issuance, memory storage/search, message delivery, provider credentials, and native transports outside the plugins.
3. Keep **toolset projection** and **container lifecycle custody** in PNH core. They determine authority and execution truth; making them plugins would let an extension participate in defining or observing its own boundary.
4. Keep review/hardening pipelines as skills and saved workflows; dynamic MCP discovery as a connector/development feature; goals, schedules, heartbeats, and user approvals in consumer control planes; and provider transports in trusted external brokers.
5. Reject live infrastructure mutation, dynamic production installation, model-authored production plugins, credential-bearing Provider plugins, and regex-only command approval as PNH plugin designs.

The first plugin to implement should be the **evidence bundle verifier**. It has the strongest combined frequency, time, risk, reuse, determinism, and readiness score. Its first version can accept a bounded inline manifest and observations, verify exact shape, hashes, required evidence classes, and internal bindings, and return only a deterministic verdict plus sorted findings. It does not need filesystem, network, credential, publication, or mutation authority.

The active branch is not yet ready to host even that production plugin. Registry, admission, protocol, runner, supervisor, broker, and gateway pieces exist. During this audit, concurrent uncommitted work added the planned Docker adapter and container port, but the narrow Runtime path remained absent and the integration was not verified. The restart plan's golden Tool gate remains the prerequisite (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:81-125`).

## 2. PNH readiness and architectural constraints

### Current implementation state

| Surface | Evidence | Audit assessment |
|---|---|---|
| Five active plugin-kind names | Registry and protocol both define `policy`, `memory`, `tool`, `provider`, and `renderer` (`pnh/registry/schema.ts:5-49`; `pnh/sdk/protocol.ts:4-16`). | The vocabulary is implemented; equal runtime readiness is not. |
| Deterministic registry validation | Exact keys, sorted unique metadata, bounded identifiers, capability-subset checks, and frozen output exist (`pnh/registry/schema.ts:51-78`, `pnh/registry/schema.ts:101-188`, `pnh/registry/schema.ts:241-267`). | Implemented for the current schema. Artifact/license completeness remains a later gate. |
| Opaque admission | Registry bytes are admitted through a dedicated ticket constructor and caller-crafted objects are tested (`pnh/runtime/admission-ticket.ts:12-20`, `pnh/runtime/admission-ticket.ts:53-86`; `pnh/tests/admission-ticket.test.ts:43-127`). | Implemented contract surface. |
| Bounded canonical protocol | One request/response envelope, JSON bounds, fatal UTF-8, canonical bytes, sequencing, cumulative limits, and terminal framing exist (`pnh/sdk/protocol.ts:21-70`, `pnh/sdk/protocol.ts:219-299`). | Implemented protocol surface. |
| Owner-controlled runner | The runner handles complete frames as they arrive and rejects duplicate request IDs (`pnh/kernel/plugin-runner/entrypoint.mjs:11`; `pnh/tests/plugin-runner.test.ts:44-142`). | Implemented unit/integration surface. |
| Sole-writer lifecycle supervisor | The supervisor owns launch/cleanup state and exposes authenticated canonical commands (`pnh/harness/plugin-container-supervisor.mjs:8`, `pnh/harness/plugin-container-supervisor.mjs:124-420`, `pnh/harness/plugin-container-supervisor.mjs:770-899`). | Implemented and heavily tested, but not yet integrated through Runtime. Concurrent uncommitted edits were not audited as completed work. |
| Broker and gateway routing | Separate broker/supervisor channels and daemon-confirmed receipt checks exist (`pnh/harness/plugin-container-broker.mjs:173-240`; `pnh/harness/sandbox/broker-gateway.mjs:228-380`). | Implemented routing surface; concurrent uncommitted streaming changes were not executed or accepted as complete. |
| Runtime/adapter vertical slice | The plan names `pnh/adapters/docker-broker-plugin-container.ts` and `pnh/runtime/run-task.ts` (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:89-97`). The adapter and port appeared as concurrent uncommitted work (`pnh/adapters/docker-broker-plugin-container.ts:41-53`, `pnh/adapters/docker-broker-plugin-container.ts:359-700`; `pnh/kernel/plugin-container-port.ts:1-24`); `pnh/runtime/run-task.ts` remained absent. | In progress, not verified. Golden Tool gate is not complete. |
| Policy, Memory, Provider, Renderer behavior | Milestone 2 requires all five kinds to register and adds fail-closed Policy admission and capability RPC (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:129-154`). | Planned, contract-unstable. Do not implement production plugins yet. |
| Runtime evidence custody | Replay protection, append-before-dispatch events, resource aggregation, ambiguous-effect handling, and evidence grades are Milestone 3 work (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:158-183`). | Planned. Plugins must not compensate for missing core custody. |
| Artifact and sandbox hardening | Pinned runner/profile artifacts, allow-listed environment, reproducible verification, and negative sandbox tests are Milestone 4 work (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:185-205`). | Planned. Production promotion must wait. |

The final worktree snapshot has 24 top-level PNH test files and one plugin fixture, including one concurrent uncommitted adapter test. Tests cover substantial component behavior, but the plan explicitly requires the production Runtime path and one real container for the Tool gate. Component test volume is not a substitute for that integration gate (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:117-125`).

### Authority constraints applied in this audit

- A plugin may validate, transform, rank, reject, or narrow data already admitted to it. It may not create task authority, approval, publication authority, provider credentials, or an unrestricted host capability.
- A Tool plugin suitable for the first vertical slice must operate on bounded inline JSON. The current protocol caps a frame at 1,000,000 bytes and cumulative decoded traffic at 8,000,000 bytes (`pnh/sdk/protocol.ts:4-11`). Large artifact stores and streaming blobs are later architecture questions.
- Policy failure must occur before non-Policy grants exist and must fail closed (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:73-79`). Approval issuance therefore remains outside a Policy plugin; the plugin verifies evidence and narrows or denies.
- Provider credentials and native endpoints remain in external trusted brokers. The older architecture is explicit that provider adapters are not ordinary plugins (`docs/plans/provider-neutral-harness/architecture.md:173-193`, `docs/plans/provider-neutral-harness/architecture.md:195-214`).
- Lifecycle custody, cleanup truth, task settlement, replay, aggregate budgets, and evidence grades remain core/supervisor responsibilities. An extension cannot be authoritative about its own containment or cleanup.
- Development discovery may be dynamic and convenient, but production identity comes only from the owner-approved static registry. Development artifacts cannot produce production-grade evidence (`docs/plans/provider-neutral-harness/architecture.md:177-194`).

### Active-kind readiness

| Kind | Contract readiness | Earliest responsible plugin work |
|---|---|---|
| Tool | Protocol and component surfaces exist; Runtime integration gate incomplete. | Define contracts now; implement development fixtures only after the golden Tool slice passes. |
| Policy | Kind name exists; fail-closed admission and narrowing semantics are Milestone 2. | Contract research now; implementation after all five kinds pass real-container registration. |
| Memory | Kind name exists; storage, query, provenance, and context-budget contract remain open. | Define admission-only semantics now; implementation after the five-kind contract gate. |
| Provider | Kind name exists; approved relationship among selector, broker, route authority, telemetry, and fallback remains open. | Define descriptor-only output now; implementation after the five-kind contract gate and broker evidence design. |
| Renderer | Kind name exists; structured result and template/version contract remain open. | Define pure transformation contract now; implementation after the five-kind contract gate. |

## 3. Inventory coverage

### Coverage summary

| Source | Safely inspected coverage | Main limitation |
|---|---|---|
| Active PNH worktree | Authoritative restart plan, older architecture, backlog, PNH README, current source, fixture, test names, package scripts, and recent PNH Git history. | No tests or candidate code were executed. The branch may continue moving after this audit. |
| `agent-config` | 63 `SKILL.md` files representing 60 unique names, four saved workflow scripts, 23 hook/support files, Git history, and selected implementation contracts. | Archived and duplicate skill variants were deduplicated conceptually. Skill quality was not re-audited. |
| Installed agent packages | Metadata for 17 cached Codex packages and 18 non-temporary Claude plugin packages; configured MCP server names without credentials or endpoint values. | Cache presence does not prove current enablement or successful use. |
| Usage history | Aggregate read-only queries over `~/.claude/usage.db`: 2,642 Claude sessions, 19,944 redacted prompt rows, tool calls, hook events, and attribution metadata. | Corpus ends 2026-08-04, contains Claude only, and cannot represent current Codex usage. Binary DB rows cannot receive line-number citations; exact aggregate queries are documented in Sources. |
| Shell history | File presence and parser behavior only. | History contained mixed prompt-like records and invalid byte sequences; command-frequency output was rejected rather than treated as reliable evidence. |
| Local projects | Git repository inventory, recent commit counts, package-manifest types, workflow/timer filenames, and targeted source in the most active relevant repositories. | Numerous worktrees duplicate canonical repositories; counts were used directionally, not as unique-product totals. No newly discovered scripts were executed. |
| Installed CLIs | Read-only package-manager inventories for top-level Homebrew formulae, global npm packages, pipx applications, and GitHub CLI extensions. | Presence does not prove frequency. Homebrew metadata refresh occurred during the first inventory query, but no package was installed, upgraded, removed, or executed as a candidate. |
| GitHub | Authenticated read-only public repository list and a relevance-filtered view of starred repositories. | Private repository metadata and full social/contribution graphs were not exported. The list supports discovery, not frequency claims. |
| Work-brain | Durable-context search for PNH, Hermes, memory layering, self-heal isolation, and provider economics; only relevant sanitized decision summaries were used. | Search is relevance-ranked, not exhaustive. Personal-brain content was unavailable and not requested. |
| Automations | Repository definitions for n8n, systemd timers/services, saved agent workflows, Control Center schedules, approval storage, and continuity snapshots. | Live n8n/systemd state was not queried. Repository definitions may be stale unless corroborated by current project instructions. |

### Reusable behavior already present

| Existing asset | Reusable behavior | Correct reuse boundary |
|---|---|---|
| Homelab audit collector | Read-only evidence collection, degraded-source marking, required-file validation, secret-shaped-value rejection, manifest generation, and cleanup (`scripts/audit/remote-collect.sh:1-90`; `scripts/audit/collect-audit.sh:40-90`, `scripts/audit/collect-audit.sh:105-172`). | Keep collection in a consumer-specific adapter/broker. Reuse validation rules in snapshot-fed Tool plugins. |
| Homelab audit prompt | Evidence-only analysis, line-level provenance, explicit unknowns, and no-secret reporting (`scripts/audit/PROMPT.md:3-49`, `scripts/audit/PROMPT.md:144-147`). | Keep model reasoning as a skill/workflow; move only deterministic bundle checks into Tool plugins. |
| Usage-mining workflow | Five independent lenses, deterministic numeric re-verification, evidence scrubbing, ranking, and adversarial review (`agent-config/workflows/usage-mining.js:1-21`, `agent-config/workflows/usage-mining.js:42-52`, `agent-config/workflows/usage-mining.js:117-149`). | Keep model fan-out as a workflow. Extract deterministic aggregate scoring into a Tool plugin or standalone package. |
| Session-state hook | Bounded snapshots, secret/private-data patterns, repository/worktree binding, verification detection, HMAC integrity, save/restore, and safe rendering (`agent-config/hooks/session-state.mjs:14-24`, `agent-config/hooks/session-state.mjs:93-130`, `agent-config/hooks/session-state.mjs:193-197`, `agent-config/hooks/session-state.mjs:510-633`). | Keep lifecycle triggering as hooks. Reuse sanitization and binding test cases in the sensitive-output Tool. |
| Post-edit test hook | Project-owned test commands gated by a trusted hash; changed commands fail safe by skipping (`agent-config/hooks/post-edit-test.sh:40-97`). | Keep as hook. It is lifecycle automation, not a task plugin. |
| Harden workflow and plan auditor | Frozen-target multi-lens review, independent verification, plan-to-code mapping, and file-level evidence (`agent-config/skills/harden/SKILL.md:10-50`; `agent-config/skills/codebase-plan-auditor/SKILL.md:15-51`, `agent-config/skills/codebase-plan-auditor/SKILL.md:130-164`). | Keep as skills/workflows. Model judgment and repository exploration are too broad and variable for a narrow PNH plugin. |
| Control Center approvals | Typed approval status/action, plan hash, expiry, nonce, target/review/audit metadata, atomic approve/reject, and rollback lookup (`control-center/src/server/actions/approvals.ts:3-20`, `control-center/src/server/actions/approvals.ts:78-162`). | Control plane issues and stores approvals. A PNH Policy plugin may only verify an admitted receipt and deny/narrow. |
| Control Center schedules | Versioned strict schema for ownership, enablement, repository, workflow/eval reference, cron/catch-up, and host (`control-center/schemas/workflow-schedule.schema.json:10-31`, `control-center/schemas/workflow-schedule.schema.json:42-123`). | Keep scheduling in the consumer control plane. PNH may consume an authorized task produced by it. |
| Control Center continuity | Principal-scoped, expiring snapshots with latest-only retrieval (`control-center/src/server/session/continuity-store.ts:12-52`). | Keep durable continuity in consumer application code; do not make PNH's plugin worker a state owner. |
| Route classifier/model spec | Explicit model/effort selection and per-session override files (`agent-config/hooks/route-classifier.mjs:1-19`, `agent-config/hooks/route-classifier.mjs:35-63`). | Reuse classification vocabulary, not credential resolution. Provider plugin output remains a constrained descriptor to a broker. |
| Work-brain retrieval | Existing brain-context MCP and `vora-context` skill already search curated durable decisions before work. | Keep indexing/query transport in MCP/service. A Memory plugin may admit, rank, trim, and provenance-bind returned candidates. |
| Public `life-agent-mcp` | A maintained FastMCP proxy exposing many personal-assistant operations. | Treat as connector/consumer integration, not code to fold into PNH. |
| Public transcript workflow | Map/reduce transcript-to-notes pipeline with multiple model backends. | Keep as application/workflow; its structured stage boundaries are useful test material for evidence plugins. |

The installed CLI set already covers source control and security (`gh`, `gitleaks`), infrastructure and delivery (`cloudflared`, `tailscale`, `wrangler`, provider CLIs), data/backup (`restic`, PostgreSQL, Redis, `syncthing`), local models (`ollama`), media/doc processing (`ffmpeg`, `pandoc`, `poppler`, `yt-dlp`), and agent development (`codex`, `codegraph`, `context-mode`, browser and audit tools). PNH should wrap none of these wholesale. Where needed, a consumer adapter or MCP server should expose a bounded maintained operation.

## 4. Usage patterns found

No private prompt text was read into this report. The figures below are aggregates over the indexed usage database and sanitized repository metadata.

### Aggregate signals

- The indexed corpus covers 2,642 Claude sessions from 2026-06-27 through 2026-08-04. It contains 40,738 shell-tool calls, 16,691 reads, 9,423 edits, 4,039 writes, 1,863 agent dispatches, and 1,396 web searches.
- Context-mode attribution appears in 342 distinct sessions; Perplexity in 111, CodeGraph in 62, and Playwright in 45. Context gathering is a recurring workload, not an edge case.
- High-frequency skill attribution includes subagent-driven development in 288 sessions, writing plans in 61, intake in 32, harden in 24, and codebase-plan-auditor in 16. Review, planning, and evidence reconciliation recur across projects.
- The database contains 19,944 redacted prompt rows representing 13,616 distinct hashes; 1,783 hashes recur. The existence of repeated prompt families supports automation research, but a repeated hash alone does not prove that a PNH plugin is the right mechanism.
- Recent local Git history is concentrated in Control Center, Vora, homelab, and agent configuration. These repositories contain overlapping approvals, schedules, handoffs, evidence, provider routing, monitoring, and test-gate behavior.

### Repeated work and friction

| Pattern | Independent evidence | Product implication |
|---|---|---|
| Gather context from several systems before acting | Context-mode, CodeGraph, web, browser, Brain retrieval, repository reads, and the `vora-context` skill. | Build a provenance-preserving admission seam, not another global search engine. Memory plugin should consume broker/MCP results. |
| Collect evidence first, analyze second | Homelab audit collector/prompt, usage-mining prepared bundles, harden frozen diff, plan auditor, and PNH evidence contracts. | Highest-value Tool opportunity is deterministic evidence-bundle verification. |
| Re-scrub sensitive content at boundaries | Session-state secret/private URL filters, homelab evidence secret scan, usage-mining second scrub, public-release sanitization requirements. | A bounded sensitive-output scanner is reusable across harnesses, but cannot claim complete DLP. |
| Repeat approval checks around outward effects | Control Center approval records, X1 authorization receipts, homelab dry/live promotion, deployment skills, and user-level confirmation rules. | Separate approval issuance from a fail-closed Policy verifier. Never let a plugin mint approval. |
| Convert structured evidence into Markdown/messages | Audit reports, PR descriptions, decision forms, Telegram notifications, status packets, and handoffs. | Renderer plugin is valuable after its contract exists; delivery stays outside. |
| Normalize provider/model choices across runtimes | Route classifier, model defaults, X1 runner registry, Hermes integration, Codex/Claude/GLM use, and provider-specific cost constraints. | Provider plugin may choose only from an admitted catalog; broker owns credentials and transport. |
| Long work needs continuity, goals, schedules, and re-entry | Session-state hooks, workflow-governance, Control Center schedules/snapshots, systemd/n8n automations, Prime/Hermes patterns. | This is a control-plane/core concern. Do not force it into a plugin. |
| Operational inspection is safer when separated from mutation | Homelab read-only audit, dry-run self-heal, monitoring workflows, backup checks, and approval-gated remediation. | Feed a structured snapshot to a pure evaluator. Keep SSH, Docker, and repair commands in a scoped adapter/broker. |
| Review workflows vary while their evidence checks are stable | Hardening and plan-audit workflows use model judgment, but both freeze targets and verify evidence. | Keep orchestration as skills; extract only deterministic validation/scoring operations. |
| Repeated command pipelines are fragile | Shell dominates tool usage; hook history shows trust checks and session-state logic were added to prevent drift and unsafe execution. | Prefer typed requests and static packages. Do not create a generic shell Tool plugin. |

## 5. Hermes and Prime patterns worth adopting

### Hermes Agent

Hermes's central registry, named toolsets, availability checks, and platform presets are useful patterns. Its tools runtime documents a central dispatch registry, dynamic MCP registration, and toolset filtering by explicit enable/disable lists and platform presets ([Hermes tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)). PNH should adopt the shape but replace import-time self-registration and dynamic production discovery with deterministic registry generation and digest-bound projections.

| Hermes pattern | Placement for PNH | Adaptation |
|---|---|---|
| Central tool registry | PNH core | Keep the owner-approved static registry as the sole identity/authority source. Reject plugin overrides and task-time discovery. |
| Named toolsets and platform enablement | PNH core plus consumer adapter | Define digest-bound projections over already-admitted tools. Consumer adapter selects a projection; a plugin does not create one. |
| Dynamic MCP integration | MCP connector and development-only authoring tool | Discover in development, snapshot schemas/capabilities, review, and generate a static production registry entry. Never pass arbitrary MCP discovery through at task time. |
| Pluggable memory/context providers | Memory contract plus external MCP/service | PNH Memory plugin ranks/trims/provenance-binds admitted results. Search indexes, user profiles, and credentials remain external. |
| Centralized provider resolution | External provider broker plus narrow Provider contract | Reuse a shared catalog/descriptor model. Do not copy credential lookup or mutable fallback into a plugin. Hermes's resolver returns API keys and endpoints, which is explicitly outside PNH's ordinary plugin boundary ([Hermes provider runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/provider-runtime)). |
| Gateway channel integration | Consumer-specific adapter | The gateway pattern cleanly separates platform events, session routing, authorization, and delivery. PNH should receive normalized authorized tasks and return results, not own chat-channel credentials ([Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)). |
| Dangerous-command detection and approvals | Consumer UX warning plus typed Policy validation | Regex patterns are useful warnings and approval prompts, not a security control. PNH Policy evaluates a typed action intent and signed/opaque approval evidence. |
| Background process management | PNH supervisor/core | Continue the sole-writer supervisor design; do not expose a general background-process tool to plugins. |
| Usage insights and session search | Tool plugin over sanitized aggregates; Memory over admitted hits | Keep raw transcripts and indexes external. Pass bounded, provenance-bearing data. |
| Skill discovery and self-creation | Existing skill system and development-only authoring | Progressive disclosure is useful. Automatic production creation conflicts with static owner approval and cannot update the registry without review/rebuild. |

Hermes's architecture also demonstrates why PNH must be stricter. Hermes supports user/project/pip plugin discovery, import-time registration, credential passthrough, mutable provider fallback, and permanent command allowlists ([Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), [Hermes tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)). Those are reasonable application features but not PNH production security primitives.

### Prime Agent

Prime's separation among client, daemon supervisor, worker, session, kernel, and persisted storage is directly relevant. Its documentation is also explicit that workers and kernels provide lifecycle/failure containment, not a security sandbox, and normally share OS permissions with the client ([Prime architecture](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/architecture.md)). PNH should keep that distinction visible.

| Prime pattern | Placement for PNH | Adaptation |
|---|---|---|
| Client/supervisor/worker/kernel separation | PNH core and consumer adapter | Preserve single ownership: UI/adapters render and steer; Runtime settles tasks; supervisor owns worker lifecycle. PNH adds container isolation and daemon-confirmed cleanup. |
| Typed host requests from the kernel | PNH capability RPC | This is the right shape for requests crossing from constrained code to authoritative host operations. Bind every request to ticket, task, budget, operation, and evidence. |
| Durable session/harness state | Consumer control plane plus PNH append-only evidence | PNH persists task events/results; consumer owns goals, user sessions, schedules, attachments, and re-entry. |
| Progressive skill disclosure | Existing skills system; registry metadata for plugins | Keep descriptions/catalog metadata cheap and load full skill instructions on demand. Production plugin code is still static and prebuilt. |
| Executable skills as packages | Development-only authoring/package pipeline | Prime warns that skills can contain executable code and supports Python-backed packages ([Prime skills](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/skills.md)). PNH requires pinned artifacts, no task-time installation, explicit contracts, and conformance tests. |
| Evidence-backed refinement | Development-only authoring tool | Record proposed changes, source evidence, review verdict, and rollback snapshot. Refinement may propose registry changes but cannot activate them. Prime similarly distinguishes reviewable refinement from packaging executable skills ([Prime README](https://github.com/PrimeIntellect-ai/prime-agent)). |
| Persistent goals, schedules, heartbeats | Consumer-specific adapter/control plane | Control Center already has versioned schedules and continuity. PNH accepts the resulting authorized task; it is not the scheduler. |
| Bounded autonomous work and quality gates | PNH core budgets plus consumer acceptance gates | Adopt explicit turn/time/resource budgets and truthful gate scope. Hitting a limit is not success, matching Prime's documented semantics ([Prime README](https://github.com/PrimeIntellect-ai/prime-agent)). |

## 6. Ranked candidate matrix

### Scoring method

Each dimension is rated 1 (weak) through 5 (strong). Weighted score is the sum of `rating / 5 × weight`.

| Code | Dimension | Weight |
|---|---|---:|
| F | Observed frequency | 12 |
| T | Time saved | 10 |
| R | Risk reduced | 12 |
| X | Cross-project reuse | 8 |
| N | Provider neutrality | 7 |
| C | Contract clarity | 8 |
| A | Capability narrowness | 8 |
| D | Determinism/testability | 8 |
| E | Evidence value | 8 |
| L | Existing implementation leverage | 6 |
| S | Security feasibility | 6 |
| M | Maintenance burden, inverse | 3 |
| Q | Current milestone readiness | 4 |

### Dimension ratings

| Rank | Candidate | F | T | R | X | N | C | A | D | E | L | S | M | Q | Score |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Evidence bundle verifier | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 99.4 |
| 2 | Sensitive-output scanner | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 5 | 96.2 |
| 3 | Operational snapshot evaluator | 4 | 4 | 5 | 4 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 91.0 |
| 4 | Approval evidence guard | 4 | 4 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 2 | 91.0 |
| 5 | Usage hotspot analyzer | 4 | 4 | 3 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 90.2 |
| 6 | Memory admission filter | 5 | 5 | 4 | 5 | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 3 | 2 | 88.0 |
| 7 | Background lifecycle custody | 3 | 3 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 4 | 87.6 |
| 8 | Evidence renderer | 4 | 4 | 3 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 2 | 86.8 |
| 9 | Toolset projection | 3 | 3 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 3 | 86.0 |
| 10 | Constrained route selector | 4 | 4 | 5 | 5 | 5 | 3 | 5 | 4 | 5 | 5 | 4 | 3 | 2 | 86.0 |
| 11 | Provider transport normalization | 4 | 4 | 5 | 5 | 5 | 4 | 2 | 3 | 5 | 4 | 5 | 2 | 2 | 80.6 |
| 12 | Review/harden pipeline | 5 | 5 | 4 | 5 | 5 | 2 | 2 | 2 | 4 | 5 | 4 | 4 | 5 | 79.8 |
| 13 | Session continuity snapshots | 4 | 4 | 4 | 4 | 5 | 3 | 2 | 4 | 5 | 5 | 4 | 3 | 4 | 78.8 |
| 14 | Progressive skill discovery/creation | 4 | 4 | 2 | 5 | 5 | 4 | 4 | 4 | 3 | 5 | 4 | 4 | 4 | 77.8 |
| 15 | Notification delivery | 3 | 3 | 3 | 4 | 5 | 5 | 4 | 5 | 3 | 5 | 4 | 4 | 3 | 76.6 |
| 16 | Goal/schedule/heartbeat engine | 4 | 4 | 4 | 4 | 5 | 4 | 2 | 3 | 4 | 5 | 4 | 2 | 2 | 75.0 |
| 17 | Dynamic MCP discovery | 4 | 5 | 3 | 5 | 5 | 4 | 2 | 3 | 3 | 5 | 3 | 3 | 3 | 74.8 |
| 18 | Live homelab action executor | 3 | 4 | 5 | 2 | 3 | 3 | 1 | 3 | 5 | 5 | 2 | 2 | 1 | 64.2 |

### Classification and readiness

| Rank | Candidate | Confidence | Evidence sources | Primary extension point | Earliest implementation milestone | Primary blocker |
|---:|---|---|---:|---|---|---|
| 1 | Evidence bundle verifier | High | 6 | PNH Tool plugin | After golden Tool slice | Final bounded evidence-manifest schema and treatment of large artifacts. |
| 2 | Sensitive-output scanner | High | 5 | PNH Tool plugin | After golden Tool slice | Must define limited detection claims and avoid leaking matched values in findings. |
| 3 | Operational snapshot evaluator | High | 5 | PNH Tool plugin | After golden Tool slice | Canonical provider-neutral health snapshot schema; collection stays external. |
| 4 | Approval evidence guard | High | 6 | PNH Policy plugin | After all five plugin-kind contracts | Policy contract and authoritative approval-receipt issuer/verifier boundary. |
| 5 | Usage hotspot analyzer | High | 4 | PNH Tool plugin | After golden Tool slice | Cross-harness sanitized aggregate schema; current corpus is Claude-only and stale. |
| 6 | Memory admission filter | High on need; medium on contract | 5 | PNH Memory plugin | After all five plugin-kind contracts | Memory contract, provenance, deletion/expiry, context budget, and external query boundary. |
| 7 | Background lifecycle custody | High | 5 | PNH core feature | Milestone 1 through production hardening | Production integration, artifact pinning, aggregate limits, and optional stronger sandbox viability. |
| 8 | Evidence renderer | High on need; medium on contract | 4 | PNH Renderer plugin | After all five plugin-kind contracts | Renderer contract, template identity, output bounds, and result/evidence field stability. |
| 9 | Toolset projection | High | 4 | PNH core feature | Milestone 2 | Digest-bound projection semantics and whether projection is ticket-time or task-time narrowing. |
| 10 | Constrained route selector | High on need; medium on contract | 6 | PNH Provider plugin | After all five plugin-kind contracts | Route authority, broker catalog/evidence, cost freshness, telemetry, and no-fallback semantics. |
| 11 | Provider transport normalization | High | 5 | External provider adapter or broker | After broker protocol and production hardening | Credential isolation, subscription terms, native telemetry, at-most-once billing/effect ledger. |
| 12 | Review/harden pipeline | High | 5 | Existing skill or improved skill | Now | Variable model judgment and broad repository/tool authority make a narrow plugin inappropriate. |
| 13 | Session continuity snapshots | High | 4 | Hook or workflow automation | Now | Already solved in hooks/application code; plugin lifecycle is the wrong trigger. |
| 14 | Progressive skill discovery/creation | High | 4 | Existing skill or improved skill | Now, development only | Production activation must remain owner-reviewed and static. |
| 15 | Notification delivery | High | 4 | MCP server or connector | Now | Channel credentials, recipient authority, retries, and delivery side effects. |
| 16 | Goal/schedule/heartbeat engine | High | 5 | Consumer-specific adapter | Now in Control Center; PNH integration later | Durable queue, user ownership, catch-up, re-entry, and scheduling are control-plane concerns. |
| 17 | Dynamic MCP discovery | High | 4 | MCP server or connector | Development mode only | Mutable schemas/servers conflict with one verified production registry snapshot. |
| 18 | Live homelab action executor | High | 5 | Reject or defer | No ordinary-plugin milestone | Requires ambient SSH/Docker/mutation authority and external approval. Use scoped runbooks/adapters instead. |

## 7. Top-ten candidate specifications

### 7.1 Evidence bundle verifier — PNH Tool plugin

- **User job:** Determine whether a prepared evidence bundle is complete, internally bound, provenance-bearing, and safe to trust for the next workflow stage.
- **Observed evidence:** Homelab collection validates required artifacts and secret scans; usage-mining fingerprints prepared inputs and re-executes numeric claims; harden freezes one diff; PNH success depends on matching evidence and commitments (`scripts/audit/collect-audit.sh:40-90`; `agent-config/workflows/usage-mining.js:14-21`, `agent-config/workflows/usage-mining.js:117-135`; `docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:158-183`).
- **Why PNH:** Isolation and evidence-bound execution are useful when an untrusted workflow wants to assert that its own evidence is sufficient. The verifier can remain pure and deterministic.
- **Why existing tooling is insufficient:** Existing validators are project-specific shell/JS code and do not share one versioned manifest/verdict contract across harnesses.
- **Input contract:** `{v, bundleType, bundleId, manifestDigest, artifacts:[{id, mediaType, byteLength, sha256, grade}], bindings:[{subject, evidenceIds}], required:[{class,minCount}], inlineObservations:[...]}`. All arrays sorted, IDs unique, and content bounded by Tool protocol limits.
- **Output contract:** `{v, accepted, bundleDigest, checks:[{code,ok,evidenceIds}], missingClasses:[], warnings:[]}` with stable ordering and no prose inference.
- **Minimum capabilities:** None beyond receiving the admitted request and returning JSON. No filesystem, network, clock, randomness, or host process.
- **Sensitive data:** Metadata may reveal project/evidence classes. Raw evidence should be excluded from v1; inline observations must already be sanitized.
- **Safe failure:** Any unknown version/field, digest mismatch, duplicate, missing required class, oversize, or ambiguous binding returns `accepted:false`. Timeout/crash fails the operation.
- **Success evidence:** Input digest, plugin/version/runner/profile/image commitments, deterministic output digest, and conformance checks proving the same bytes yield the same verdict.
- **Reusable code:** Registry exact-shape/sorted-unique patterns; audit `validate_evidence`; usage-mining fingerprint and numeric-verification concepts.
- **Supply chain/licensing:** Prefer original implementation using existing PNH dependencies. Do not copy third-party validator code without license/provenance review.
- **Testing:** Golden accepted bundle; every single-field mutation; duplicate IDs; reordered fields; missing/extra evidence; oversized input; fuzzed JSON; differential digest tests; real-container timeout/cleanup.
- **Earliest milestone:** After the golden Tool vertical slice.
- **Open questions:** Whether later versions admit digest-addressed external artifacts; who assigns evidence grades; whether partial/degraded evidence is a failed verdict or a typed non-production grade.

**Scenario:** A hardening workflow freezes one diff and collects five reviewer findings. Before synthesis, the Tool receives only the diff digest, reviewer-result digests, expected lens classes, and finding-to-source bindings. One reviewer result references a different diff digest. The Tool returns `accepted:false` with `binding-mismatch`; synthesis never runs on mixed targets.

### 7.2 Sensitive-output scanner — PNH Tool plugin

- **User job:** Scan a bounded candidate artifact for known secret, credential, private endpoint, identity, and unsafe-path patterns before it crosses a reporting or publication boundary.
- **Observed evidence:** Session-state has token/private URL/customer-data detection and bounded sanitization; homelab collection rejects secret-shaped assignments; usage-mining removes source paths before verification (`agent-config/hooks/session-state.mjs:14-24`, `agent-config/hooks/session-state.mjs:93-130`; `scripts/audit/collect-audit.sh:73-90`; `agent-config/workflows/usage-mining.js:143-149`).
- **Why PNH:** Running an owner-pinned scanner in isolation creates a consistent, evidence-bearing preflight across providers and consumers.
- **Why existing tooling is insufficient:** Current patterns are duplicated, language-specific, and tied to individual hooks/scripts. They have no shared rule-set identity or machine-verifiable verdict.
- **Input contract:** `{v, policyId, policyDigest, artifactType, content|structuredValue, declaredRedactions:[...]}`. V1 accepts bounded UTF-8 text or JSON only.
- **Output contract:** `{v, status:'clean'|'findings'|'unsupported', policyDigest, findings:[{class,locationHash,start?,end?,severity}], scannedBytes}`. Matched secret text is never echoed.
- **Minimum capabilities:** No network/filesystem/clock. Read request, return findings.
- **Sensitive data:** The candidate content itself. It must remain inside the isolated plugin and must not appear in logs, errors, or evidence except as digests and location hashes.
- **Safe failure:** Unknown encoding/policy, truncation, malformed JSON, timeout, or scanner error returns non-clean. This tool never certifies that no unknown secret pattern exists.
- **Success evidence:** Exact input/policy digest, scanned byte count, plugin commitments, and deterministic finding locations/classes.
- **Reusable code:** Session-state patterns and safe-rendering tests; homelab secret-scan failure cases. Gitleaks may inform test cases, but invoking its mutable external binary from the plugin is out of scope for v1.
- **Supply chain/licensing:** Original small scanner is preferred. If a third-party pattern database is imported, pin its version/license and include notices.
- **Testing:** Known token families, private URLs, emails/phones/customer IDs, false-positive corpus, Unicode boundaries, huge strings, matched-value non-disclosure, malformed values, timeout/cleanup.
- **Earliest milestone:** After the golden Tool vertical slice.
- **Open questions:** Policy taxonomy, Unicode normalization, acceptable false-positive rate, and whether production-grade DLP requires an external maintained service.

**Scenario:** A Renderer produces a Markdown audit. Before a consumer sends it to a channel, the scanner receives the bounded text and pinned disclosure policy. It detects a private endpoint and credential-shaped assignment, returns only hashed locations and classes, and the consumer blocks delivery. The scanner does not know the channel or hold its credentials.

### 7.3 Operational snapshot evaluator — PNH Tool plugin

- **User job:** Evaluate a provider-neutral, already-collected health snapshot and return explicit healthy/degraded/unhealthy/unknown findings without touching infrastructure.
- **Observed evidence:** Homelab has separate collect/compare/generate commands, a read-only audit collector, health/backup/monitor workflows, and dry-run remediation (`package.json:6-21`; `scripts/audit/remote-collect.sh:1-90`; `scripts/audit/PROMPT.md:31-49`).
- **Why PNH:** A pure evaluator benefits from isolation, fixed rules, deadlines, deterministic findings, and evidence binding while keeping collection and mutation elsewhere.
- **Why existing tooling is insufficient:** Current collectors and comparators are homelab-specific. Other consumers need a shared minimal snapshot envelope and verdict vocabulary.
- **Input contract:** `{v, snapshotId, collectedAt, sourceDigest, components:[{id,class,observations:[typed status/age/count/ratio]}], freshnessPolicy, requiredClasses}`. Clock/freshness cutoff is injected as an admitted integer.
- **Output contract:** `{v, status, snapshotDigest, findings:[{componentId,code,severity,evidenceRefs}], unknowns:[], evaluatedAtInput}`.
- **Minimum capabilities:** None for evaluator v1. A consumer adapter or dedicated health broker performs SSH/API collection and passes the snapshot.
- **Sensitive data:** Service names, topology metadata, operational status. Use opaque component IDs when the consumer does not need names.
- **Safe failure:** Missing source, stale required class, malformed observation, conflicting evidence, or unsupported metric returns degraded/unknown, never healthy by inference.
- **Success evidence:** Source snapshot digest, rule-set digest, every finding's evidence reference, plugin commitments, and no unbound observation.
- **Reusable code:** Homelab comparator/audit schemas and degraded-source semantics. Do not embed SSH or Docker commands.
- **Supply chain/licensing:** Reuse owner-authored contract concepts. Any monitoring-format parser should be implemented from public specs or reviewed licensed libraries.
- **Testing:** Healthy, stale, missing, contradictory, malformed, duplicate, threshold boundary, overflow, unknown component class, deterministic order, and real-container cleanup.
- **Earliest milestone:** After golden Tool slice; provider-neutral schema research starts now.
- **Open questions:** Minimum universal health vocabulary, injected-time format, severity ownership, and whether evidence grades belong in this contract or core.

**Scenario:** A consumer adapter gathers service, backup, and host observations using its existing read-only credentials, strips names to opaque IDs, and submits the signed snapshot. The evaluator marks backups stale and one required source unknown. It emits no repair command. The control plane separately decides whether to ask for approval for a runbook.

### 7.4 Approval evidence guard — PNH Policy plugin

- **User job:** Deny or narrow a typed action unless admitted approval evidence exactly matches the action, target, actor class, expiry input, nonce, and plan/artifact digest.
- **Observed evidence:** Control Center already stores plan hashes, action classes, expiry, nonce, and audit metadata; X1 uses separate authorization receipts and fail-closed runner checks; deployment workflows repeatedly require explicit confirmation (`control-center/src/server/actions/approvals.ts:3-20`, `control-center/src/server/actions/approvals.ts:129-159`; `docs/plans/provider-neutral-harness/architecture.md:216-229`).
- **Why PNH:** Policy isolation and fail-closed pre-admission ordering prevent a model, repository, or non-Policy plugin from bypassing a missing/mismatched approval.
- **Why existing tooling is insufficient:** Existing stores issue approvals for specific applications. They do not provide one provider-neutral verification/narrowing contract bound to PNH's ticket and task evidence.
- **Input contract:** `{v, actionIntent:{class,targetDigest,planDigest,effectIds,requestedLimits}, approvalReceipt:{issuerId,receiptId,subjectDigest,allowedLimits,expiresAtInput,nonce,evidenceDigest}, nowInput}`. Receipt authenticity is verified through an admitted key/issuer descriptor, not ambient network access.
- **Output contract:** `{v, decision:'allow-narrowed'|'deny', narrowedLimits, reasonCode, receiptDigest}`. It can never output broader limits than the ticket ceiling or request.
- **Minimum capabilities:** Verify an admitted signature/MAC or opaque receipt using owner-approved verifier material. No approval UI, identity lookup, network, deployment, or mutation authority.
- **Sensitive data:** Operator/issuer identifiers and action metadata. Prefer stable pseudonymous IDs and digests.
- **Safe failure:** Missing, expired, replayed, malformed, mismatched, unverifiable, or ambiguous receipt denies before non-Policy grants.
- **Success evidence:** Receipt/action/ticket digests, issuer/version, narrowing proof, Policy plugin commitments, and a record that no non-Policy grant existed before decision.
- **Reusable code:** Control Center approval record shape and X1 receipt-binding tests; PNH grant subset checks.
- **Supply chain/licensing:** Cryptography must use a reviewed pinned library already allowed by the artifact process. Do not design custom cryptographic primitives.
- **Testing:** Every field mismatch, expiry edge, replay, duplicate receipt, widened limits, unknown issuer, invalid signature, crash/timeout/malformed output, and ordering proof.
- **Earliest milestone:** After all five plugin-kind contracts and fail-closed Policy admission are implemented.
- **Open questions:** Receipt issuer trust root, replay ledger ownership, online versus offline verification, multi-approval/quorum, and how human identity claims are represented.

**Scenario:** A task proposes restarting a production service under a plan digest. The external approval service issues a receipt for staging only. The Policy plugin compares the typed intent and receipt, returns `deny:target-mismatch`, and Runtime derives no Tool or Provider grant. The plugin neither contacts the approval service nor runs the restart.

### 7.5 Usage hotspot analyzer — PNH Tool plugin

- **User job:** Turn sanitized aggregate usage facts into deterministic ranked candidates for automation, consolidation, or investigation.
- **Observed evidence:** The usage database records session/tool/hook/attribution aggregates; the saved usage-mining workflow already separates model discovery from deterministic numeric verification and ranking (`agent-config/workflows/usage-mining.js:1-21`, `agent-config/workflows/usage-mining.js:34-52`, `agent-config/workflows/usage-mining.js:117-135`).
- **Why PNH:** A provider-neutral pure scorer gives Claude, Codex, Hermes, Prime, or future adapters the same evidence-bound ranking without exposing transcripts.
- **Why existing tooling is insufficient:** The current workflow is Claude-oriented, model-heavy, and split around a local database. Its deterministic core is not a portable contract.
- **Input contract:** `{v, corpus:{harnesses,windowStart,windowEnd,fingerprint}, metrics:[{key,calls,failures,distinctSessions,repeats,durationMs,...}], scoringPolicy}`. No prompts or raw tool arguments.
- **Output contract:** `{v, corpusFingerprint, ranked:[{key,score,components,confidenceFlags}], excluded:[{key,reason}]}`.
- **Minimum capabilities:** None. Pure numeric/enum processing.
- **Sensitive data:** Aggregate project/tool labels may still be internal. Apply minimum-count thresholds and pseudonymous keys before admission.
- **Safe failure:** Invalid denominator, mixed corpus fingerprint, negative/overflow count, unknown scoring policy, or inconsistent totals rejects the analysis.
- **Success evidence:** Corpus and policy digest, exact component scores, deterministic tie-break order, plugin commitments.
- **Reusable code:** Usage-mining weight/rank concepts and database fingerprint checks. Keep SQL ingestion in a standalone collector/adapter.
- **Supply chain/licensing:** Original arithmetic implementation; no external analytics runtime needed.
- **Testing:** Golden rankings, zero/unknown denominators, tie breaks, corpus mismatch, overflow, privacy threshold, cross-harness fixtures, and deterministic serialization.
- **Earliest milestone:** After golden Tool slice.
- **Open questions:** Standard cross-harness metric vocabulary, privacy thresholds, whether duration/cost estimates are comparable, and who signs the corpus fingerprint.

**Scenario:** Claude and Codex adapters each export the same sanitized metric schema for 14 days. The Tool rejects one row whose failure denominator exceeds total calls, then ranks the valid repeated workflows with visible score components. A separate workflow decides whether to propose a skill, hook, CLI, or plugin.

### 7.6 Memory admission filter — PNH Memory plugin

- **User job:** Admit only relevant, in-scope, fresh, provenance-bearing context candidates into a task's bounded context budget.
- **Observed evidence:** Brain-context and context-mode are heavily used; durable memory layering assigns curated wikis, session recall, auto-memory pointers, and snapshots distinct roles; Hermes and Prime both invest in persistent recall and progressive disclosure.
- **Why PNH:** The trust decision is not merely search. A Memory plugin can enforce source scope, provenance, freshness input, audience, deduplication, and budget before context enters Runtime.
- **Why existing tooling is insufficient:** MCP/search services retrieve; they do not bind admitted context to the PNH ticket/task/evidence chain or guarantee consistent cross-consumer trimming.
- **Input contract:** `{v, queryDigest, taskScope, budget:{items,bytes,tokensEstimate}, nowInput, candidates:[{id,sourceClass,contentDigest,excerpt,updatedAt,scope,audience,confidence,provenance}]}`.
- **Output contract:** `{v, admitted:[{id,contentDigest,rank,reasonCodes}], rejected:[{id,reasonCode}], usedBudget, candidateSetDigest}`. No memory writes.
- **Minimum capabilities:** None in v1. Search occurs in an external MCP/service; candidates arrive already bounded and sanitized.
- **Sensitive data:** Internal project knowledge and excerpts. Enforce audience/scope before returning content, and permit digest-only rejection records.
- **Safe failure:** Unknown provenance/scope, stale timestamp input, budget ambiguity, duplicate/conflicting digest, malformed candidate, timeout, or crash returns no context.
- **Success evidence:** Candidate-set/query/task/plugin-set digests, admitted IDs/digests, budget accounting, and rejection codes.
- **Reusable code:** Brain-context result contracts, memory-layering decision, context-mode search practice, session-state bounded rendering.
- **Supply chain/licensing:** Work-brain content is private and not distributable. Implement adapter/contracts without embedding data. Respect source licenses for indexed public documents.
- **Testing:** Audience/scope leakage, stale and duplicate candidates, conflicting IDs, budget edges, adversarial excerpts, deterministic ranking, empty/failed search, and no-write proof.
- **Earliest milestone:** After all five plugin-kind contracts.
- **Open questions:** Memory plugin registration contract, ranking determinism, excerpt versus digest references, deletion/expiry propagation, token estimation, and whether ranking policy is owner or consumer supplied.

### 7.7 Background lifecycle custody — PNH core feature

- **User job:** Know that every plugin worker has one lifecycle owner, one terminal receipt, and daemon-confirmed absence after success or failure.
- **Observed evidence:** The active plan makes the host supervisor the sole Docker lifecycle writer and success contingent on cleanup; current supervisor/broker/gateway tests cover duplicate launch, races, death, and confirmed receipts (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:108-125`; `pnh/tests/plugin-container-supervisor.test.ts:144-410`; `pnh/tests/broker-gateway-routing.test.ts:54-255`). Prime independently separates supervisor and worker ownership but says its process split is not a sandbox.
- **Why PNH:** This is intrinsic to trustworthy plugin execution.
- **Why a skill/CLI/plugin is insufficient:** Lifecycle truth must remain authoritative when model, plugin, broker, or consumer fails. A plugin cannot attest to its own destruction.
- **Input/output contract:** Core supervisor command `{ticket-bound identity, image/profile/runner commitments, deadline, limits}` to terminal receipt `{trigger, daemon identity/state, exit, OOM, confirmedAbsent}`.
- **Minimum capabilities:** Trusted supervisor alone holds the exact container lifecycle capability. Plugins receive none.
- **Sensitive data:** Container identity and operational diagnostics; evidence should expose only needed normalized fields.
- **Safe failure:** Ambiguous post-dispatch state is not success; supervisor retains receipt until acknowledged and reaps independently of broker lifetime.
- **Success evidence:** Daemon inspection, matching commitments, one settlement, confirmed absence, and no leaked container.
- **Reusable code:** Current supervisor, broker, gateway, and tests.
- **Supply chain/licensing:** Docker/container runtime behavior and base artifacts must be pinned and documented; stronger sandbox components need separate license/host review.
- **Testing:** Existing race/death/cleanup suite plus real Docker, OOM, aggregate cgroup, daemon restart, reaper, artifact drift, and required-no-skip CI.
- **Earliest milestone:** Continue in Milestone 1; production trust waits for Milestones 3-5.
- **Open questions:** Rootless dedicated supervisor, external reaper, aggregate cgroups, and gVisor/Kata/Firecracker viability.

### 7.8 Evidence renderer — PNH Renderer plugin

- **User job:** Convert a validated structured result into bounded Markdown, chat blocks, or another declared representation without inventing facts or sending it anywhere.
- **Observed evidence:** Homelab reports, usage reports, PR descriptions, handoffs, decision forms, and Telegram messages repeatedly transform structured evidence into human-facing output; the backlog already proposes this Renderer (`docs/plans/provider-neutral-harness/plugin-backlog.md:5-13`).
- **Why PNH:** Pinned templates and isolated pure rendering produce consistent output and bind representation to result evidence.
- **Why existing tooling is insufficient:** Current templates are spread among skills/scripts and do not share template identity, strict input schemas, or result-evidence binding.
- **Input contract:** `{v, format, templateId, templateDigest, result:{validated PNH result subset}, locale?, maxBytes}`.
- **Output contract:** `{v, format, rendered, renderedDigest, templateDigest, omittedFields:[]}`. Output includes no transport target.
- **Minimum capabilities:** None. Templates are packaged and digest-pinned with the plugin; no runtime template download.
- **Sensitive data:** Whatever validated result fields are admitted. Pair with disclosure policy and sensitive-output scan before external delivery.
- **Safe failure:** Unknown field/template/format, missing required value, oversize output, or escaping error rejects; never fill missing observations with prose.
- **Success evidence:** Input/result/template/output digests and exact plugin commitments.
- **Reusable code:** Existing Handlebars dependency and report structures, subject to strict escaping and helper allowlists.
- **Supply chain/licensing:** Pin template engine; inventory license; avoid importing proprietary templates into public packages.
- **Testing:** Golden outputs, escaping, Unicode, missing/unknown fields, deterministic ordering, size limits, template mutation, and no-network/no-delivery proof.
- **Earliest milestone:** After Renderer contract exists in the all-five-kind gate.
- **Open questions:** Template packaging, localization, canonical line endings, helper functions, and whether all formats can share one Renderer contract.

### 7.9 Toolset projection — PNH core feature

- **User job:** Expose a stable named subset of already-admitted tools for a consumer/platform/task without changing the owner-approved ceiling.
- **Observed evidence:** Hermes uses named toolsets, platform presets, and availability checks; local harnesses expose materially different tool catalogs; PNH already computes one plugin-set identity and capability ceiling.
- **Why PNH:** Tool exposure affects authority, prompt surface, evidence, and reproducibility. The projection must be part of the ticket/task evidence.
- **Why existing tooling is insufficient:** Per-harness configuration lists are useful but do not share a digest-bound, monotonic projection contract.
- **Input/output contract:** Core input `{ticket, requestedProjectionId, consumerClass, taskLimits}` to output `{projectionId, projectionDigest, toolOperationIds, narrowedCatalog}`.
- **Minimum capabilities:** Pure core calculation over the admission ticket. No plugin execution.
- **Sensitive data:** Tool IDs can reveal available systems; return only the selected projection to the worker/model.
- **Safe failure:** Unknown projection/tool, duplicate, unavailable dependency, or attempted widening denies admission.
- **Success evidence:** Registry/ticket/projection/catalog digests and proof every operation is under the owner ceiling.
- **Reusable code:** Registry dependency order, capability subset logic, and Hermes's conceptual toolset resolution.
- **Supply chain/licensing:** Behavioral pattern only; implement original PNH code.
- **Testing:** Projection mutation changes digest; subset/widening; dependency closure; platform differences; unavailable tool; deterministic order; prompt/evidence binding.
- **Earliest milestone:** Milestone 2 authority-complete kernel.
- **Open questions:** Projection declared in registry versus consumer policy; availability as static artifact fact versus runtime broker fact; composable versus single named projections.

### 7.10 Constrained route selector — PNH Provider plugin

- **User job:** Select or reject one route descriptor from an admitted provider catalog using privacy, capability, latency, cost ceiling, auth class, and no-fallback constraints.
- **Observed evidence:** Local model routing spans Claude, Codex, Hermes/local models, and cost-sensitive providers; route classifier and X1 runner registry already separate runtime/model/auth/network classes; Hermes centralizes provider resolution across entry points.
- **Why PNH:** A Provider plugin can make the selection logic reusable and evidence-bound while remaining unable to call the provider.
- **Why existing tooling is insufficient:** Current route logic is distributed among hooks, runner registries, application defaults, and provider clients. It does not share a provider-neutral selection proof.
- **Input contract:** `{v, routeRequest:{requiredCapabilities,dataClass,maxCost,maxLatency,allowedAuthClasses,allowedNetworkClasses,fallback:'forbidden'}, catalogDigest, candidates:[{routeId,providerClass,modelId,capabilities,costSnapshot,latencyClass,authClass,networkClass,brokerId,evidenceGrade}]}`.
- **Output contract:** `{v, decision:'selected'|'refused', routeId?, candidateSetDigest, reasonCodes, constraintChecks}`. No key, token, endpoint, native request, or fallback chain.
- **Minimum capabilities:** Read only the admitted catalog snapshot. Broker later resolves `routeId` and owns transport/credentials.
- **Sensitive data:** Task classification and commercial route metadata. Avoid prompt content; pass declared data class/capabilities.
- **Safe failure:** No exact candidate, stale cost/catalog evidence, unknown telemetry, drift, timeout, or malformed output refuses. No silent fallback.
- **Success evidence:** Task/request/catalog/candidate/route/plugin-set digests and every constraint result; broker must later attest exact route execution.
- **Reusable code:** Route-classifier vocabulary, model defaults, X1 runner descriptors, Hermes shared-resolution pattern. Do not reuse credential lookup inside the plugin.
- **Supply chain/licensing:** Provider SDKs remain in broker adapters with their own licenses/terms. Provider plugin should need no SDK.
- **Testing:** Every constraint, stale catalog, tie-breaks, no candidate, unknown telemetry, attempted credential/endpoint field, route drift, fallback prohibition, and broker evidence mismatch.
- **Earliest milestone:** After all five contracts, then after broker evidence design for production.
- **Open questions:** Cost/latency freshness authority, deterministic tie-break policy, subscription-session economics, model alias prohibition, and whether route selection is Provider or consumer Policy responsibility.

## 8. Correct-extension-point decisions

This comparison includes the minimum plugin, the current/existing approach, and the do-it-properly architecture for every top-ten opportunity.

| Opportunity | Minimum PNH plugin | Keep/improve existing approach | Do-it-properly architecture | Recommendation |
|---|---|---|---|---|
| Evidence bundle verification | Pure Tool validates bounded inline manifest/bindings. | Add project-specific validators to each workflow. | Signed content-addressed evidence service with durable manifests, retention, and verifier API. **Pending:** operational cost, storage privacy, and signature model. | Build minimum Tool after golden slice; design contract so external artifact references can be added later. |
| Sensitive-output scanning | Pure Tool scans bounded text/JSON under pinned policy. | Consolidate session-state, audit, and workflow regexes into a standalone library/hook. | Dedicated local DLP/redaction service with maintained detectors, review queue, policy versioning, and measurable recall. **Pending:** accuracy, privacy, and maintenance cost. | Build minimum Tool for known-pattern preflight; explicitly avoid “complete DLP” claims. |
| Operational snapshot evaluation | Pure Tool evaluates a pre-collected neutral snapshot. | Keep homelab-specific collector/comparator and add adapters per project. | Dedicated read-only health broker/collector signs normalized snapshots; Tool evaluates; separate approval/runbook service mutates. | Adopt split architecture: external collector plus Tool evaluator. Start schema research now. |
| Approval evidence guard | Policy verifies admitted receipt and narrows/denies. | Continue application-specific approval stores and skill-level prompts. | External approval service with strong operator authentication, signed single-use receipts, durable replay ledger, quorum/expiry, and audit API. **Pending:** issuer trust and replay-store design. | Build Policy verifier only; Control Center/external service remains issuer and replay authority. |
| Usage hotspot analysis | Tool scores sanitized aggregate metrics. | Keep the saved usage-mining workflow and deterministic local scripts. | Cross-harness local telemetry pipeline with privacy thresholds, sealed snapshots, reproducible SQL, deterministic scorer, and human review. | Keep collection/workflow; extract scorer as Tool when a cross-harness schema exists. |
| Memory admission | Memory plugin ranks/trims admitted search hits. | Keep brain-context/context-mode MCP plus per-harness skills. | External curated memory broker with source ACLs, deletion/expiry, signed query result sets, provenance, and task-scoped retrieval; Memory plugin admits results. **Pending:** contract and token-budget semantics. | Research now; implement admission-only plugin after Memory contract. |
| Background lifecycle | A lifecycle plugin would request/start/stop workers. | Keep current supervisor scripts/tests. | Dedicated rootless supervisor/broker, signed tickets/artifacts, aggregate cgroups, external reaper, and gVisor/Kata/Firecracker. **Pending:** host support, performance, and complexity. | Reject plugin option. Keep in core and complete the current plan; evaluate stronger sandbox before hostile third-party code. |
| Evidence rendering | Renderer transforms validated result through packaged template. | Keep templates in skills/scripts. | Versioned signed template packages, schema compiler, localization/escaping conformance, disclosure scan, and separate delivery service. | Build Renderer after contract; delivery remains connector/control plane. |
| Toolset projection | A Policy/Tool plugin returns names to enable. | Keep consumer configuration lists. | Registry-native, digest-bound projection declarations with dependency closure, monotonic narrowing, and task evidence. | Reject plugin option. Implement in PNH core Milestone 2. |
| Constrained route selection | Provider plugin selects descriptor from admitted catalog. | Keep hooks/defaults/runner registries. | Trusted provider broker with credential vault, native adapters, current catalog, budget/consume ledger, route attestation, and selector plugin over broker-issued descriptors. **Pending:** provider terms and telemetry normalization. | Implement descriptor-only Provider plugin later; broker is the proper transport architecture. |

### Other exact extension-point decisions

| Candidate | Primary category | Decision |
|---|---|---|
| Provider transport normalization | External provider adapter or broker | Credentials, endpoints, native SDKs, subscription sessions, billing/consume state, and fallback behavior never enter an ordinary plugin. |
| Review/harden pipeline | Existing skill or improved skill | Preserve saved workflow, frozen targets, independent lenses, and deterministic verification. Add plugin calls only for pure evidence checks. |
| Session continuity snapshots | Hook or workflow automation | Hooks and consumer stores own save/restore timing. A plugin may validate a snapshot document but must not own lifecycle. |
| Progressive skill discovery/creation | Existing skill or improved skill | Continue progressive disclosure and skill-creator workflow. Production plugin proposals require review, build, digest, registry regeneration, and conformance. |
| Notification delivery | MCP server or connector | Renderer returns content; connector/control plane owns recipients, credentials, retries, rate limits, and delivery receipts. |
| Goals/schedules/heartbeats | Consumer-specific adapter | Control Center/systemd/n8n own durable scheduling and re-entry. PNH accepts one authorized task and enforces its budget. |
| Dynamic MCP discovery | MCP server or connector | Allow development discovery; convert reviewed tools into static registry artifacts for production. |
| Generic contract linting | Standalone CLI/package | Use for authoring skills, schedules, manifests, and handoffs. It does not benefit enough from per-task container isolation to be a production plugin by default. |
| Live homelab mutation | Reject or defer | Use narrow existing runbooks behind external approval and a consumer adapter. Do not grant SSH/Docker to an ordinary plugin. |

## 9. Proposed implementation waves

### Now: research and contract definition

1. Finish the golden Tool Runtime/adapter gate before adding candidates.
2. Define v1 schemas and hostile test matrices for evidence bundle, sensitive-output, operational snapshot, and usage aggregate inputs. Keep all v1 inputs inline and bounded.
3. Define the non-plugin boundaries for approval issuer, memory search service, provider broker, notification delivery, and scheduler.
4. Specify registry-native toolset projection semantics for Milestone 2.
5. Add no implementation to the production registry yet. Contract examples remain synthetic and development-only.

Exit criterion: each candidate has a versioned schema, capability inventory, failure table, evidence requirements, and a decision showing why it is a plugin or not.

### After the golden Tool vertical slice

1. Implement one development-registry fixture for **evidence bundle verifier** and prove it through the production Tool path.
2. Add **sensitive-output scanner** only after the matched-value non-disclosure tests pass.
3. Add **operational snapshot evaluator** with synthetic provider-neutral fixtures; do not connect SSH/Docker/network.
4. Add **usage hotspot analyzer** against synthetic and sanitized aggregate fixtures; collection stays outside.
5. Compare combined versus separate plugin packaging. Keep separate IDs unless shared code can remain a small pinned library without creating a broad “utility” capability.

Exit criterion: every Tool passes deterministic, malformed-input, overflow, timeout, crash, and daemon-confirmed cleanup tests through Runtime. Development evidence must remain visibly non-production.

### After all five plugin-kind contracts

1. Implement **approval evidence guard** first because Policy ordering and fail-closed semantics are security-critical.
2. Implement **memory admission filter** over synthetic candidates from a fake external retrieval adapter.
3. Implement **evidence renderer** with one Markdown format and no delivery authority.
4. Implement **constrained route selector** over a synthetic admitted broker catalog and prove it cannot receive credentials/endpoints.
5. Implement registry-native **toolset projection** in core and bind its digest into task/evidence.

Exit criterion: all five kinds register through real containers; Policy failure yields no non-Policy grants; plugin attempts to widen authority fail; every output remains bound to ticket/task/plugin-set/evidence.

### After production artifact and sandbox hardening

1. Promote only plugins whose source, lockfile, image, runner, profile, manifest, license, and conformance commitments reproduce exactly.
2. Add external broker/service integrations one at a time: approval verifier material, memory candidate broker, provider catalog/transport broker, then delivery connector.
3. Run supply-chain and privacy review for every third-party rule set, template engine, provider SDK, or parser.
4. Decide whether the threat model requires a rootless dedicated supervisor and stronger sandbox. If yes, validate gVisor, Kata, or Firecracker before third-party code.
5. Keep marketplace distribution and task-time installation out of scope.

Exit criterion: production registry is owner-approved and static; all required Docker/conformance tests run without skips; artifact commitments match; no credentials/native transports enter plugins; external effects remain separately authorized.

## 10. Proposed backlog changes

The following rows are ready to copy. They do not modify `plugin-backlog.md` in this audit.

### Adopt now

“Adopt now” means contract research now and implementation only at the listed gate.

| Priority | Plugin/feature | Kind/category | User job | Required capabilities | Sensitive data | Safe failure behavior | Status |
|---|---|---|---|---|---|---|---|
| P1 | Evidence bundle verifier | Tool | Verify completeness, digests, provenance classes, and evidence bindings for a prepared bundle | None; bounded inline JSON only | Evidence metadata and sanitized observations | Reject unknown, missing, duplicate, mismatched, ambiguous, oversized, or malformed input | Researching |
| P1 | Sensitive-output scanner | Tool | Detect known sensitive-data patterns in bounded candidate output without echoing matches | None; bounded text/JSON only | Candidate artifact may contain secrets/private data | Any unsupported/truncated/error state is non-clean; never claim complete DLP | Researching |
| P1 | Operational snapshot evaluator | Tool | Evaluate a pre-collected provider-neutral health snapshot without touching infrastructure | None in plugin; collector is external | Service/topology/status metadata | Missing, stale, conflicting, or malformed evidence returns degraded/unknown, never inferred healthy | Researching |
| P2 | Usage hotspot analyzer | Tool | Rank automation opportunities from sanitized aggregate cross-harness metrics | None; numeric/enum aggregate input only | Internal aggregate labels | Reject inconsistent corpus, denominator, fingerprint, policy, or totals | Researching |
| Core | Toolset projection | PNH core feature | Expose a digest-bound subset of already-admitted tools per consumer/task | Pure ticket/registry calculation | Tool catalog metadata | Unknown or widening projection denies admission | Researching |

### Research next

| Priority | Plugin | Kind | User job | Required capabilities | Sensitive data | Safe failure behavior | Status |
|---|---|---|---|---|---|---|---|
| P1 | Approval evidence guard | Policy | Verify an external approval receipt and narrow/deny a typed action | Admitted verifier material only; no approval UI/network | Operator/issuer and action metadata | Missing, expired, replayed, mismatched, ambiguous, or unverifiable receipt denies before grants | Researching |
| P1 | Memory admission filter | Memory | Admit in-scope, provenance-bearing retrieval candidates under a context budget | None in v1; external MCP/service supplies candidates | Internal project knowledge | Any scope/provenance/budget ambiguity returns no context | Researching |
| P2 | Evidence renderer | Renderer | Render validated results through a pinned bounded template without delivery | Packaged template only | Validated result fields | Unknown/missing fields, escaping error, or oversize rejects; never invent values | Researching |
| P2 | Constrained route selector | Provider | Select/refuse one descriptor from an admitted provider catalog | Read catalog snapshot only; no credentials/endpoints/transports | Task classification and commercial route metadata | No exact/stale/ambiguous candidate refuses; no fallback | Researching |

### Defer until later milestone

| Priority | Candidate | Category | Defer until | Reason |
|---|---|---|---|---|
| P2 | External artifact references for evidence verifier | Tool contract extension | Runtime evidence custody and production artifact hardening | Requires authenticated content-addressed retrieval and size/streaming semantics. |
| P2 | Production memory/provider/renderer plugins | Plugin kinds | Five-kind real-container conformance | Their final contracts do not exist yet. |
| P3 | Rootless supervisor plus stronger sandbox | PNH core/supervisor | Production artifact hardening decision | Viability depends on host support, performance, and operational complexity. |
| P3 | Signed template/rule-set distribution | Development/production packaging | Reproducible artifact and license pipeline | Needs signing, provenance, update, rollback, and notice policy. |

### Keep outside PNH

| Candidate | Primary category | Existing/recommended home | Reason |
|---|---|---|---|
| Provider credentials and native transports | External provider adapter or broker | Trusted broker services | They require credential, endpoint, billing, and native protocol authority. |
| Approval issuance and operator UX | Consumer-specific adapter | Control Center/external approval service | A plugin may verify but never mint authority. |
| Work-brain/context indexes and search transport | MCP server or connector | brain-context/context-mode services | Storage, ACLs, deletion, and query transport are service concerns. |
| Review, harden, intake, plan audit | Existing skill or improved skill | `agent-config` saved workflows/skills | Broad, variable model judgment and repository exploration. |
| Goals, schedules, heartbeats, continuity | Consumer-specific adapter / hook | Control Center, systemd/n8n, session-state hooks | Durable user/workflow lifecycle is above one PNH task. |
| Message/channel delivery | MCP server or connector | Existing channel gateway/connectors | Holds recipient and credential authority and causes outward effects. |
| Dynamic MCP discovery | MCP server or connector | Development-only discovery pipeline | Production requires reviewed static snapshots. |
| Generic schema/contract linter | Standalone CLI/package | Agent-config authoring tool | Useful without per-task sandbox cost; may generate plugin manifests as build input. |

### Reject

| Candidate | Reason |
|---|---|
| Generic shell/SSH/Docker Tool plugin | Ambient host authority is too broad; use typed operations in external adapters/brokers. |
| Live homelab action executor plugin | Mutation, approval, credentials, and infrastructure reach belong in scoped runbooks and control plane. |
| Credential-bearing Provider plugin | Violates the trusted broker boundary. |
| Regex-only dangerous-command Policy as a security control | JavaScript/shell semantics are not enumerable; use typed action intents and authoritative capability enforcement. |
| Model-authored or task-installed production plugin | Violates static owner approval, reproducibility, and supply-chain controls. |
| Public marketplace/dynamic third-party distribution | Explicit current non-goal and incompatible with the present threat model. |
| Plugin-controlled worker lifecycle or cleanup attestation | An extension cannot be authoritative about its own containment or termination. |

## 11. Unknowns and confidence limits

1. **Usage recency and harness coverage:** `~/.claude/usage.db` stops on 2026-08-04 and contains Claude sessions only. Exact frequencies should be refreshed after Codex ingestion before estimating hours saved. The architectural conclusions have additional repository evidence and do not depend on one count.
2. **Live-state coverage:** This audit did not SSH to hosts, query live n8n/systemd, inspect credential stores, or run provider calls. Repository automation definitions establish reusable patterns, not current operational health.
3. **Current branch movement:** At audit start, the PNH worktree was on `pnh/m2-hybrid-restart` with only the pre-existing untracked `plugin-backlog.md`. During the audit, concurrent uncommitted adapter, port, broker, supervisor, gateway, and test changes appeared. They were preserved and not executed. Readiness may change quickly, and this report treats the golden Tool gate as incomplete until its specified Runtime integration and tests are verified.
4. **Contract uncertainty:** Memory, Provider, Renderer, and full Policy semantics remain Milestone 2 work. Their candidate contracts are proposals, not implementation-ready public APIs.
5. **Large artifact handling:** The first Tool protocol is bounded JSON/NDJSON. This report does not choose a blob/CAS protocol. Evidence v1 deliberately uses manifests and small inline observations.
6. **Scoring subjectivity:** Scores use declared weights and evidence counts but remain product judgment. They prioritize Caleb's observed work, authority reduction, and present PNH readiness over novelty or market breadth.
7. **Licensing:** Hermes Agent and Prime Agent are used as pattern references. No source was copied. Any future code reuse requires file-level provenance, license, notice, dependency, and redistribution review. n8n workflow behavior should be treated as a pattern, not imported as library code without reviewing its license.
8. **Stronger sandbox viability:** The plan's gVisor/Kata/Firecracker option remains pending host support, operational complexity, and performance validation (`docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:65-71`).
9. **Public repository/social discovery:** Authenticated GitHub inventory found Caleb's public MCP, transcript pipeline, config manager, and related starred agent tooling. It was not used to infer private behavior or rank products without local usage evidence.
10. **Evidence counts:** “Evidence sources” counts independent categories such as usage DB, Git history, local implementation, work-brain decision, automation definition, and public primary architecture. Multiple files from one subsystem count as one source category.

## 12. Sources

### Local primary sources

- Active plan: `docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md:15-30`, `:65-79`, `:81-125`, `:129-205`, `:209-230`.
- Architecture: `docs/plans/provider-neutral-harness/architecture.md:58-100`, `:126-157`, `:159-214`, `:216-251`.
- Existing backlog: `docs/plans/provider-neutral-harness/plugin-backlog.md:1-37`.
- PNH registry/protocol: `pnh/registry/schema.ts:5-78`, `:101-188`, `:190-267`; `pnh/sdk/protocol.ts:4-70`, `:109-217`, `:219-299`.
- Concurrent adapter/port snapshot: `pnh/adapters/docker-broker-plugin-container.ts:41-53`, `:359-700`; `pnh/kernel/plugin-container-port.ts:1-24`; `pnh/tests/docker-broker-plugin-container.test.ts:133-286`.
- PNH runner/lifecycle/routing tests: `pnh/tests/plugin-runner.test.ts:44-142`; `pnh/tests/plugin-container-supervisor.test.ts:144-410`; `pnh/tests/plugin-container-broker-routing.test.ts:74-212`; `pnh/tests/broker-gateway-routing.test.ts:54-255`.
- Homelab audit: `scripts/audit/remote-collect.sh:1-90`; `scripts/audit/collect-audit.sh:40-90`, `:105-172`; `scripts/audit/PROMPT.md:3-49`, `:144-147`.
- Agent configuration: `agent-config/workflows/usage-mining.js:1-21`, `:34-52`, `:117-149`; `agent-config/hooks/session-state.mjs:14-24`, `:93-130`, `:193-197`, `:510-633`; `agent-config/hooks/post-edit-test.sh:40-97`; `agent-config/hooks/route-classifier.mjs:1-19`, `:35-63`; `agent-config/skills/harden/SKILL.md:10-50`; `agent-config/skills/codebase-plan-auditor/SKILL.md:15-51`, `:130-164`.
- Control Center: `control-center/src/server/actions/approvals.ts:3-20`, `:78-162`; `control-center/schemas/workflow-schedule.schema.json:10-31`, `:42-123`; `control-center/src/server/session/continuity-store.ts:12-52`.
- Public local-product references: [life-agent-mcp](https://github.com/cbolden15/life-agent-mcp), [youtube-transcript-workflow](https://github.com/cbolden15/youtube-transcript-workflow), and [claude-code-config-manager](https://github.com/cbolden15/claude-code-config-manager).

### Aggregate usage queries

Executed read-only against `~/.claude/usage.db`; no prompt text was selected:

```sql
SELECT MIN(started_at), MAX(started_at), COUNT(*) FROM sessions;
SELECT harness, COUNT(*) FROM sessions GROUP BY harness;
SELECT tool_name, COUNT(*), SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END)
FROM tool_calls GROUP BY tool_name ORDER BY COUNT(*) DESC;
SELECT kind, name, COUNT(DISTINCT session_id || ':' || agent_id)
FROM attributions GROUP BY kind, name;
SELECT COUNT(*), COUNT(DISTINCT text_hash) FROM prompts;
SELECT COUNT(*) FROM (
  SELECT text_hash FROM prompts GROUP BY text_hash HAVING COUNT(*) > 1
);
```

### Public primary architecture sources

- [Hermes Agent repository](https://github.com/NousResearch/hermes-agent)
- [Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Hermes tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)
- [Hermes provider runtime resolution](https://hermes-agent.nousresearch.com/docs/developer-guide/provider-runtime)
- [Hermes security](https://hermes-agent.nousresearch.com/docs/user-guide/security)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
- [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes scheduled tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)
- [Prime Agent repository and long-running features](https://github.com/PrimeIntellect-ai/prime-agent)
- [Prime Agent architecture](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/architecture.md)
- [Prime Agent skills](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/skills.md)

## Verification record

- Audit-authored file: only `docs/plans/provider-neutral-harness/plugin-opportunity-audit.md`. Concurrent implementation/test changes were present at final verification and were not modified by this audit.
- No candidate plugin, repository script, package, test suite, deployment, provider call, or live automation was executed.
- The report includes plugin and non-plugin recommendations.
- Every top-five recommendation uses bounded input, no ambient host authority, no credentials/native provider transport, and fail-closed behavior.
- Provider selection returns only an admitted route descriptor; credentials and transport remain in a trusted external broker.
- Every top-ten candidate records evidence, safe failure, success evidence, earliest milestone, and open questions.
