# Intake — OpenHands/software-agent-sdk

**Verdict:** IMITATE
**Integration surface:** behavioral reference for the provider-neutral harness's runtime and contracts (`docs/plans/provider-neutral-harness/architecture.md`) — not an installed dependency, not the trusted base layer. No skill, plugin, or MCP-server installation.

- Date: 2026-08-19
- Method: shallow clone, read-only Codex assessment (no repo code executed), fit-scoring
  against the refreshed architecture constraints. Full findings with file:line citations
  preserved below.
- Evaluated as: primary candidate base per the architecture doc's intake step 1, with
  DeepSeek-as-first-broker as the acceptance criterion.

## Purpose

Python SDK + REST/WebSocket server for building coding agents: in-process agent loop,
LiteLLM-backed multi-provider LLM abstraction, typed Pydantic event log, plugin/skill
system, tool APIs, local/Docker/remote workspaces. It is the engine beneath OpenHands CLI
and Cloud. MIT licensed.

## Quality & maintenance signals

- Stars: 1,008. Last push: 2026-08-19 (same-day activity). License: MIT. Version 1.42.1.
- 529 Python test files; 32 GitHub Actions workflows (per-package tests, API-compat
  gates, persisted-settings migration checks, release security checks); `uv` frozen
  lockfile; 3 named maintainers. Strong engineering discipline.

## Security red flags (from read-only assessment)

- **Critical:** ambient plugin auto-discovery from `~/.agents/plugins`,
  `~/.openhands/plugins`, and project directories is hardcoded on
  (`include_user=True`/`include_project=True`), unpinned, rediscovered on resume; skills
  support `!` shell substitutions; command hooks use `shell=True`.
- **Critical:** permissive defaults — `confirmation_policy = NeverConfirm()`,
  `security_analyzer = None`.
- **High:** server imports client-supplied module names; workflow tool `exec()`s
  generated Python behind best-effort AST filtering; Docker image ships passwordless
  sudo, mutable `latest` tag, Chromium `--no-sandbox`; tool effects are not
  transactionally coupled to event persistence (replay on crash/resume).
- Import side effects: banner print, optional Laminar/OTel init from env, tool imports
  mutate a process-global registry. Product telemetry off by default.

## Fit against the architecture constraints (the decision drivers)

| Architecture requirement | OpenHands as shipped | Verdict |
| --- | --- | --- |
| Static, owner-approved plugin/tool set resolved before task start | Ambient discovery hardcoded on; global mutable tool registry with overwrite-on-duplicate; runtime install/load endpoints; MCP `tools/list_changed` mutates mid-task | **Fails — requires fork** |
| At-most-once task semantics under retries | At-least-once: `ActionEvent` persists before execution; crash between effect and observation ⇒ re-execution on resume | **Fails — kernel must own it** |
| Evidence-grade event log | Typed and append-only via API, but storage-mutable, no hash chain/digest, lossy (streaming deltas dropped, callback failures can lose events) | **Fails — external ledger required** |
| External credential broker (DeepSeek acceptance criterion) | **Passes with constraints:** `model="openai/..."` + `base_url` + `api_key=None` omits the key from the LiteLLM call; broker owns credentials. DeepSeek in verified model registries | Pattern transfers |
| One-way public dependency direction / lean core | Core installable alone but 18 direct runtime deps (LiteLLM, FastMCP, fakeredis, Pillow, Laminar, tree-sitter…) and import side effects | Poor as a public core |

This resolves the architecture doc's central intake question — "whether OpenHands can be
securely locked" — as **no, not without an invasive fork**: static loading, capability
isolation, and exact evidence all fail as shipped. Per the doc's own escape hatch, that
selects the **original narrow kernel** as the long-term architecture, with OpenHands
demoted from candidate base to behavioral reference.

## Overlap check

No overlap with installed skills/plugins/MCP servers. Router lanes already cover
interactive DeepSeek execution (unaffected). `agent-team` is a potential consumer of the
future harness, not a competitor.

## Reasoning

The engineering quality is real and worth learning from, but the four properties the
harness exists to guarantee — static loading, at-most-once execution, tamper-evident
evidence, minimal public core — are all absent or contradicted by load-bearing design
choices (ambient discovery, mutable global registry, effect-before-persist ordering).
Adopting it as the base means forking against upstream's own direction. Imitate instead.

## What to imitate (specific patterns, with sources)

1. Typed Pydantic discriminated-union events, frozen base, ID/timestamp/source/parent —
   the shape (not the storage) maps to the Evidence contract family
   (`openhands-sdk/openhands/sdk/event/base.py`).
2. The broker pattern proven by their own test: OpenAI-compatible endpoint +
   `api_key=None` keeps credentials out of the SDK process
   (`tests/sdk/llm/test_llm.py:836`) — this is the DeepSeek broker shape.
3. Agent-loop structure (`Agent.step()`, conversation state machine) as the behavioral
   reference for the Runtime component.
4. Their CI discipline: per-package API-compatibility gates and persisted-settings
   migration fixtures — adopt the practice for the public contracts.
5. Their failure modes as negative fixtures: ambient discovery, overwrite-on-duplicate
   registration, and effect-before-persist ordering become conformance tests the narrow
   kernel must reject.

## Remaining intake items (architecture doc steps 2–3)

- OpenCode V2 plugins — TypeScript plugin-API reference (manifest/hook shapes only; its
  dynamic loading is already excluded by the architecture doc).
- Pydantic AI Harness — core/capability split and durable-execution seam; specifically
  whether its durable-execution machinery provides the at-most-once semantics OpenHands
  lacks.

These are lighter reference-mapping passes, not base-candidate evaluations — the base
decision (narrow kernel) no longer depends on them.

---

## Appendix: full Codex findings (read-only assessment, verbatim)

Assessment scope: static inspection only; shallow clone; no code executed.
Citation paths are repo-relative.

# OpenHands software-agent-sdk adoption assessment

**Verdict: IMITATE / selectively fork. Do not adopt it unchanged as the security base layer.** The agent loop, typed models, provider breadth, and test discipline are useful. Its ambient extension system, mutable tool registry, retry semantics, and non-tamper-evident event store conflict with a strict security kernel.

Scope: static, read-only inspection only. No repository code, installs, builds, or tests were executed. The clone is shallow, so historical maintenance conclusions are limited.

## 1. Purpose

This repository provides Python and REST/WebSocket APIs for building coding agents. It contains an in-process agent/conversation engine, LLM abstraction, typed events, plugins and skills, tool APIs, local and remote workspaces, built-in coding tools, and a deployable agent server. It is the engine used beneath OpenHands CLI and Cloud, not merely a collection of tool wrappers. See [README.md:30](README.md:30).

## 2. Architecture

| Package | Responsibility | Main entry points |
|---|---|---|
| `openhands-sdk` | Agent loop, conversations, LLM abstraction, events, plugins, MCP, security policies, local/remote workspace interfaces | `openhands.sdk.Agent`, `Conversation`, `LLM`; `Agent.step()` |
| `openhands-tools` | Terminal, file editing, grep, browser, tasks, workflow execution | Tool definition modules register themselves when imported |
| `openhands-workspace` | Docker and remote workspace implementations | `DockerWorkspace`, remote API workspaces |
| `openhands-agent-server` | FastAPI REST/WebSocket runtime, persistence and plugin-management APIs | `agent-server = openhands.agent_server.__main__:main` |

The core package is defined separately in [openhands-sdk/pyproject.toml:1](openhands-sdk/pyproject.toml:1). The server executable is declared in `openhands-agent-server/pyproject.toml:56`.

### Plugin and extension lifecycle

1. Explicit plugin references can point at local paths, Git URLs, or GitHub shorthand. Remote sources are fetched into a cache and explicit attachments can be resolved to a commit SHA (`plugin/fetch.py:69-107`).

2. On the first message or run, `LocalConversation._ensure_plugins_loaded()` merges plugin skills, MCP servers, hooks, agent definitions, and commands.

3. It then automatically discovers ambient plugins from `~/.agents/plugins`, `~/.openhands/plugins`, `.agents/plugins`, and `.openhands/plugins`. Ambient plugins are not pinned and are rediscovered on resume. See [plugin/discovery.py:1](openhands-sdk/openhands/sdk/plugin/discovery.py:1) and [local_conversation.py:1066](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py:1066).

4. Project skills are also discovered from the workspace. Skills may contain inline shell substitutions that execute when invoked.

5. Runtime installation and activation are supported through SDK functions and agent-server install, update, enable, disable, and uninstall endpoints. A running conversation also exposes `load_plugin()` (`local_conversation.py:1399`).

Installation itself fetches and copies files; no plugin `postinstall` hook was found (`extensions/installation/manager.py:54-123`). Activation is effectful because a plugin can contribute shell hooks, skills, MCP processes, and agents.

### Event log

Events are typed Pydantic discriminated-union objects. The base event is frozen, rejects unknown fields, and has an ID, timestamp, source, and parent ID. See [event/base.py:20](openhands-sdk/openhands/sdk/event/base.py:20).

`EventLog.append()` locks the store, rejects duplicate IDs and missing parents, and writes each event as a separate indexed JSON file ([event_store.py:184](openhands-sdk/openhands/sdk/conversation/event_store.py:184)). The public event-log API is append-oriented, and branching preserves previous events while moving the active conversation head.

It is not evidence-grade append-only storage:

- The underlying `FileStore` supports arbitrary write and delete operations.
- There is no hash chain, signature, canonical digest, or tamper detection.
- Scanning stops at the first missing event index (`event_store.py:308-317`).
- The active view excludes abandoned branches (`conversation/state.py:295-302`).
- Streaming token deltas are deliberately not persisted (`event/streaming_delta.py:5-13`).
- Raw LLM completion logging defaults to disabled.
- User callbacks run before the persistence callback and exceptions are not isolated (`conversation/base.py:463-476`, `local_conversation.py:411-427`).

### Tool registration

Tools use a process-global mutable registry. Importing a tool definition commonly calls `register_tool()`. Duplicate names warn and overwrite the existing resolver rather than failing ([tool/registry.py:31](openhands-sdk/openhands/sdk/tool/registry.py:31), `tool/registry.py:139-146`).

Agents can be configured with explicit tools and `include_default_tools=[]`, but runtime mutation remains available through `add_runtime_tools()`. MCP `tools/list_changed` notifications can add or replace tools during a conversation (`agent/base.py:832-953`).

### Sandbox and workspace integration

`LocalWorkspace` executes directly against the host filesystem and process environment. It is not a sandbox despite the abstract workspace documentation’s general wording. A local workspace creates a `LocalConversation`; `RemoteWorkspace` creates a `RemoteConversation` connected to an agent server ([conversation.py:37](openhands-sdk/openhands/sdk/conversation/conversation.py:37)).

`DockerWorkspace` starts a remote agent-server container when the model is constructed and defaults to the mutable image `ghcr.io/openhands/agent-server:latest-python` (`openhands-workspace/.../docker/workspace.py:81,151-156`). The supplied image gives the `openhands` user passwordless sudo and runs Chromium with `--no-sandbox` (`docker/Dockerfile:145-149,327`). Containerization here is an execution environment, not a complete hostile-code security boundary.

### Providers and LLM calls

`LLM` is a multi-provider interface over LiteLLM. It accepts model, API key, provider-connection ID, custom base URL, Azure settings, and AWS credentials ([llm.py:220](openhands-sdk/openhands/sdk/llm/llm.py:220)). Calls ultimately go to LiteLLM’s `completion()`/`acompletion()` (`llm.py:2170-2224`).

OpenAI-compatible endpoints are supported through `model="openai/..."` plus `base_url`; there is an explicit test for forwarding `openai/local-model` to a custom `/v1` endpoint ([test_llm.py:836](tests/sdk/llm/test_llm.py:836)). DeepSeek models and provider patterns are present in the verified model and feature registries.

Credentials are owned by `openhands-sdk` in the default direct-provider path. `LLM` carries the key in-process, and `ProviderConnectionStore` persists shared credentials. Without a cipher, that store explicitly serializes secrets in plaintext (`provider_connection_store.py:205-214`).

## 3. Quality signals

- Static inventory found 529 Python test files: 343 SDK, 75 tools, 98 agent-server, 8 workspace, 4 integration, and 1 example test. Tests were not run.
- There are 32 GitHub Actions workflows. They cover per-package tests and coverage, Windows, stress tests, pre-commit, examples, integration tests, release security checks, REST/SDK API compatibility, deprecations, persisted-settings compatibility, releases, and docs. The main matrix is visible in [.github/workflows/tests.yml:2](.github/workflows/tests.yml:2).
- The repository has 123 files under `examples/`, 22 README files, type markers, external SDK documentation, API compatibility gates, and persisted-settings migration fixtures.
- Dependency resolution is locked with `uv`; CI uses `uv sync --frozen`.
- These are strong engineering signals. They demonstrate breadth and compatibility discipline, though not the security properties required by this proposed kernel.

## 4. Security red flags

| Severity | Finding |
|---|---|
| Critical | Ambient project/user plugins are automatically loaded. Plugin hooks may execute shell commands, prompt evaluators, or tool-using agents. Skill content supports `!` shell substitutions with full process privileges ([skills/execute.py:1](openhands-sdk/openhands/sdk/skills/execute.py:1)); command hooks use `shell=True` (`hooks/executor.py:489-516`). |
| Critical | Security is permissive by default: `confirmation_policy = NeverConfirm()` and `security_analyzer = None` ([conversation/state.py:119](openhands-sdk/openhands/sdk/conversation/state.py:119)). |
| High | The server imports module names supplied through conversation requests and command-line configuration (`conversation_service.py:1517-1528`, `agent_server/__main__.py:75-127`). The optional workflow tool performs best-effort AST filtering and then executes generated Python with `exec(compile(...))` ([workflow/impl.py:342](openhands-tools/openhands/tools/workflow/impl.py:342)). |
| High | The supplied local and Docker workspaces are not sufficient strict-sandbox boundaries: host execution locally, passwordless sudo in the image, mutable default image tag, broad development tooling, and Chromium `--no-sandbox`. |
| High | Tool effects are not transactionally coupled to event persistence. A process failure can cause an already-effectful call to be replayed on resume. See §6b. |

Additional findings:

- There are no Python package post-install scripts; packages use standard setuptools. `make build` runs `uv sync --dev` and installs pre-commit hooks. `make clean` deletes caches, schema validation invokes `npx`, and the Dockerfile downloads packages and binaries with `apt`, `curl`, and `wget` ([Makefile:34](Makefile:34)).
- Importing `openhands.sdk` prints a startup banner. Importing the agent module calls `maybe_init_laminar()`, which may initialize outbound observability when LMNR/OTel environment variables are present (`agent/agent.py:98-99`). Tool-definition imports mutate the global registry.
- Expected outbound paths include LLM providers, remote workspaces, Git plugin sources, remote MCP servers, optional secret/credential lookup URLs, configurable completion webhooks, optional security/critic services, and browser recording’s default `unpkg.com` rrweb CDN.
- Product telemetry is disabled by default: exporter `none`, consent unset, and no delivery ([config.py:132](openhands-agent-server/openhands/agent_server/config.py:132)). PostHog and HTTP exporters are opt-in. Laminar/OTel tracing is separately environment-driven.
- Most secrets are wrapped in `SecretStr`, redacted, or encrypted when a cipher is supplied. Weak points are plaintext provider-connection persistence without a cipher, a server API mode that can return plaintext secrets, and ACP subprocesses receiving the whole secret registry because selective injection is not possible.

## 5. Maintenance health

- Version inspected: `1.42.1`.
- The shallow clone’s only available commit is `73fabfd76491940fcb1a042289a18ad618ec89d7`, dated 2026-08-19, “Add read-at-use LLM provider connections (#4492).” This indicates same-day activity but cannot establish release cadence or long-term continuity.
- `MAINTAINERS` names three maintainers: `@xingyaoww`, `@neubig`, and `@enyst` ([MAINTAINERS:7](MAINTAINERS:7)). That reduces obvious single-maintainer risk.
- Contributor concentration cannot be measured from this clone: `git shortlog` contains only the shallow tip author.
- Current open-issue count is not stored in the repository. Visible backlog signals include issue templates and a stale workflow that exempts `roadmap` and `backlog` labels while processing up to 150 items per run ([stale.yml:20](.github/workflows/stale.yml:20)). This demonstrates active backlog governance, not backlog size.

## 6. Harness-fit answers

### a. Can registration be static?

**Not completely through current configuration. Dynamic discovery is not load-bearing to the core agent loop, but the shipped conversation lifecycle assumes it.**

An agent can use explicit `tools` and `include_default_tools=[]` (`agent/base.py:124-169`). However:

- Ambient user and project plugins are hardcoded on with `include_user=True` and `include_project=True`.
- Ambient plugins are unpinned and rediscovered on resume.
- Project skills are separately discovered.
- The tool registry remains globally mutable and duplicate names overwrite.
- MCP can change the tool set during execution.
- Runtime plugin loading and server installation endpoints remain available.

A proper static mode requires a fork or upstream change: disable all ambient discovery, runtime installation/loading, project skills, MCP `tools/list_changed`, and client-supplied Python module imports; resolve owner-approved plugins and tools to immutable content digests before the first message; reject duplicate registrations; then freeze the registry.

### b. Does it provide at-most-once task semantics?

**No. Tool execution can be at-least-once under crash/resume.**

The agent emits the `ActionEvent` before executing the tool (`agent/agent.py:1341-1383`). If the side effect succeeds but the process fails before the observation is persisted, resume detects the unmatched action and executes it again (`agent/agent.py:643-653`; [conversation/state.py:668](openhands-sdk/openhands/sdk/conversation/state.py:668)). Tenacity retries protect LLM transport calls, not task-level external effects.

The kernel must provide durable operation IDs, an intent/result ledger, idempotency keys, and per-tool deduplication or transactional dispatch.

### c. Can an external broker own credentials?

**Yes, with constraints.**

Configure an OpenAI-compatible broker through `model="openai/..."` and `base_url`, leave `api_key=None`, and the SDK omits `api_key` from the LiteLLM call (`llm/utils/litellm_provider.py:75-81`). The broker can then own DeepSeek/OpenAI/Anthropic credentials. If the broker requires authentication, the SDK still holds the broker-scoped token.

Direct-provider mode requires keys or cloud credentials in the SDK process. A strict deployment should disable provider-connection storage, scrub provider credential environment variables inherited by LiteLLM, and allow only the broker endpoint.

### d. Is the event log suitable as evidence?

**No, not without an external evidence layer.**

It is typed, branch-aware, and append-only through its normal API. It is also mutable at the storage layer, lacks tamper evidence, can omit streaming and raw provider data, exposes an active view that hides abandoned branches, and can lose events if an earlier callback fails.

Use an external append-only ledger that records canonical event bytes, monotonically increasing sequence numbers, previous-record hashes, tool-policy decisions, operation IDs, provider request/response hashes, and tool results. Persistence should occur before non-idempotent dispatch and fail closed.

### e. What is the dependency weight, and is core standalone?

**Core is separately installable, but heavy.**

`openhands-sdk` has 18 direct runtime dependencies, including LiteLLM, FastMCP, `fakeredis[lua]`, HTTPX, Pillow, Laminar, tree-sitter, websockets, JOSE, Pydantic, and Tenacity ([openhands-sdk/pyproject.toml:7](openhands-sdk/pyproject.toml:7)). This is not a small foundation library.

It does not declare dependencies on `openhands-tools`, `openhands-workspace`, or `openhands-agent-server`, and packaging includes only `openhands.sdk*`. CI explicitly rejects `openhands.tools` imports in SDK tests. Therefore, it is importable without the sibling distributions, subject to its own substantial dependency tree and import side effects.

### f. License obligations beyond MIT

The repository root is MIT licensed ([LICENSE:1](LICENSE:1)); preserve its copyright and permission notice when redistributing substantial portions.

No additional `LICENSE`, `COPYING`, or `NOTICE` files were found. That does not prove there are no further obligations:

- An Agent Plugins JSON Schema is vendored from `agent-plugins.org` without a separate in-repository license notice (`plugin/format/agent_plugins.py:33-46`).
- The server package bundles an SVG and JavaScript/JSON VS Code extension assets.
- Docker images install and redistribute many operating-system packages, OpenVSCode Server, Node, Docker tooling, Chromium, and other binaries.
- Python dependencies and runtime-fetched rrweb retain their own licenses.

Run an SBOM and license scan before redistribution, and verify the provenance/license of the vendored schema and bundled visual/extension assets.

## Recommended integration boundary

Use OpenHands only as an untrusted planning/orchestration component:

1. Selectively fork `openhands-sdk`’s agent/LLM/event models; exclude `openhands-tools`, `openhands-workspace`, and `openhands-agent-server` from the trusted base.
2. Replace ambient extension handling with a frozen, owner-signed manifest resolved before task start.
3. Route every LLM call through the external credential broker and every tool action through the kernel’s policy, idempotency, and sandbox dispatcher.
4. Mirror all actions and results into a separate tamper-evident evidence ledger.

Adoption should remain blocked until static extension mode, transactional tool dispatch, and evidence-grade logging are implemented and tested.
