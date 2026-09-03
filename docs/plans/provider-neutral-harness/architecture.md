# Provider-neutral agent harness architecture

> **Superseded 2026-08-21.** The canonical normative reference is now
> [constitution.md](constitution.md), backed by the machine-readable registry
> `pnh/contracts/invariants.yaml` and the `npm run test:constitution` gate.
> This document is retained as historical context only.

- Status: architecture direction for evaluation
- Created: 2026-08-19; refreshed 2026-08-19 after the DSH POC terminal verdict
  and the Task 4 stop-work record
- Scope: generic open-source harness and plugin boundary
- Implementation: not authorized by this document
- Post-verdict inputs: the DSH POC terminated at **REJECT** (Task 1
  image-admission gate; `docs/x1/evidence/dsh-poc-acceptance-2026-08-19.md`),
  and the Task 4 capability-contract extraction reached **stop-work** after
  three failed design-review rounds. The revised DSH threat model and the full
  review chain live on branch `x1/dsh-extraction-readiness-plan` (commit
  `2bffc0a`): `docs/x1/dsh-open-source/threat-model.md` (Section 12) and
  `docs/x1/dsh-open-source/capability-contract-design-2026-08-19.md`. Their
  lessons are folded into this document as constraints.

## Purpose

Build a reusable agent harness without making DeepSeek Harness, X1, or any
model provider part of the public core. The harness should keep the useful part
of the DeepSeek Harness experiment: a composable plugin system around a
headless agent loop. It must preserve the security, routing, evidence, and
rollback properties the POC required.

DeepSeek Harness is a terminated reference implementation: its POC ended at
REJECT and its Task 4 contract extraction is stopped under the authorization
record's stop-work clause. This document does not reopen either; it describes
what a successor harness should look like, informed by what that program
proved and disproved.

The intended public result is a small provider-neutral harness that another
system can embed through an adapter. X1/C3 is one consumer, not the definition
of the product.

## Recommendation

Use existing projects to avoid re-learning solved agent-loop and plugin-design
problems, then implement only the narrow security kernel they do not provide.

1. Evaluate [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk)
   as the primary behavioral reference and possible dependency. Focus on its
   plugin lifecycle, typed event log, tool model, and sandbox integration.
2. Use [OpenCode V2 plugins](https://opencode.ai/v2/docs/build/plugins) as the
   TypeScript plugin-API reference if TypeScript is selected. Do not inherit its
   dynamic package-loading or broad in-process authority for production use.
3. Study [Pydantic AI Harness](https://github.com/pydantic/pydantic-ai-harness)
   for its separation between a lean core and independently evolving
   capabilities.
4. Build a custom narrow kernel only for the missing requirements: signed and
   digest-pinned manifests, capability grants, external credential brokers,
   exact evidence, static production loading, and fail-closed routing.

The intake must decide whether OpenHands can sit beneath the public contracts
without weakening these invariants. If it cannot, reproduce the required
behavior behind original public interfaces rather than exposing OpenHands,
OpenCode, DeepSeek Harness, or Pydantic-specific types.

## High-level shape

```text
private or deployment-specific control plane
  X1/C3, another scheduler, or a direct embedding application
                         |
                         | authorized task + capability
                         v
                consumer-specific adapter
                         |
                         v
+----------------------------------------------------------------+
|                  provider-neutral harness                       |
|                                                                |
|  contracts     deterministic runtime       evidence/result      |
|      ^                  |                        |               |
|      |                  v                        |               |
|  plugin SDK <---- capability-secured plugin kernel ------------+|
|      ^                  |                                        |
|      |        statically registered plugins                     |
|      |      task | tool | context | policy | telemetry          |
+------+------------------+----------------------------------------+
       |                  |
       |                  | task-scoped broker protocol
       |                  v
       |        trusted external provider brokers
       |                  |
       |                  v
       |       external provider adapters
       |       Claude | Codex | GLM | Kimi | DeepSeek | Ollama
       |
       +---- imported by consumer and provider adapters

untrusted worker sandbox
  bounded workspace, tools, commands, context, and output
  no provider credentials, endpoints, publisher credentials,
  plugin installation authority, or control-plane authority
```

Dependency direction is one way. Consumer adapters, provider adapters, and
plugins may import public contracts. Public contracts and runtime packages must
not import X1, a provider SDK, provider-native types, credentials, endpoints, or
private operational policy.

**Boundary enforcement (constraint from Task 4).** Three DSH review rounds
proved that a lexical denylist checker cannot carry this rule as a security
control: JavaScript's expression space is unenumerable, so any recognizer that
passes unrecognized forms fails open (five-plus fresh bypass classes per
reviewer per round). The rule is enforced instead by executable, fail-closed
mechanisms, run continuously in test and CI:

1. Module-graph closure: the core's resolved static import graph contains
   nothing outside core (static import specifiers are grammatically literal,
   so this resolution is complete and fails closed on any out-of-boundary
   edge).
2. Locked-realm determinism harness: core tests execute the core in a
   compartment whose nondeterministic intrinsics (clock, entropy, environment,
   filesystem, network, process) are throwing stubs and whose dynamic loading
   (`import()`, `require`, `eval`, `Function`) is unavailable.
3. Coverage gate: 100% statement, function, and branch coverage of core, so
   no unexecuted body escapes stub execution.

Lexical scanning may exist as an advisory lint for honest mistakes; it is
never credited as prevention. Vocabulary neutrality (no provider, model,
endpoint, or route identity in core) has no fail-closed mechanism and is
carried as detective only. See threat-model C19 and Section 12 on the branch
cited above.

## Public components

The names below are descriptive placeholders, not committed package names.

| Component | Owns | Excludes |
| --- | --- | --- |
| Contracts | Task, capability, telemetry, evidence, and result types | Runtime state, X1 policy, provider transports |
| Runtime | Headless task loop, bounded context, append-only events, compaction, stopping, and terminal results | Scheduling, publication, credentials, plugin installation |
| Plugin SDK | Public manifests and capability-scoped registration interfaces | Secrets and unrestricted host handles |
| Plugin kernel | Manifest checks, dependency resolution, grants, deterministic ordering, lifecycle, and plugin evidence | Model-selected installation and mutable package resolution |
| Broker protocol | Task-scoped provider request and evidence receipt | Provider SDK types, endpoints, credentials |
| External adapters | Consumer translation or native provider transport | Changes to generic contract meaning or task authority |

The five contract families remain the narrow interoperability seam:

1. Task: authorized objective, inputs, limits, immutable route request, and
   acceptance criteria.
2. Capability: task-scoped authority, audience, limits, expiry, and replay
   protection. Constraints from the failed DSH capability design: the consume
   decision must distinguish "my write committed" from "a write exists" across
   process instances and fail closed on ambiguity — replay protection and
   at-most-once execution are different properties, and a one-time nonce alone
   delivers only the first (DSH finding ADV3-C2/T22). Contract validation is
   pure: clock readings enter as injected values, time math is integer
   arithmetic on pinned formats (no `Date` API), nonce generation stays
   outside the core, and grant serialization is canonical (fixed arity, fixed
   order, length-capped fields) so no two distinct grants share bytes.
3. Telemetry: normalized counts and timings with explicit `null` for unsupported
   fields.
4. Evidence: exact runtime, plugin, provider, model, input, and output identity.
5. Result: terminal state, safe error class, artifact references, and evidence
   digests.

## Plugin model

Plugins extend behavior through narrow public registration interfaces. They do
not receive the runtime container, raw process state, or unrestricted
filesystem and network handles.

| Kind | Purpose |
| --- | --- |
| Task | Validate or project an authorized task into runtime inputs |
| Tool | Register a bounded, schema-validated operation |
| Context | Contribute explicitly admitted context |
| Policy | Narrow an existing capability or reject an operation |
| Telemetry | Observe normalized events without changing authority |

Provider adapters are not ordinary in-process plugins. They run behind trusted
brokers because they own transports, endpoints, native model behavior, and
credential access. The untrusted worker never loads or calls them directly.

Every production plugin manifest records its ID, version, plugin API version,
content and entrypoint digests, kind, exact dependencies, requested
capabilities, compatible contract versions, and license metadata. The kernel
resolves and validates the complete plugin set before the task starts. The
ordered plugin-set digest becomes part of task evidence.

Production uses a static, owner-approved plugin registry. It does not allow:

- package installation or dependency resolution at task time;
- mutable versions such as `latest`;
- repository or home-directory plugin discovery;
- model-authored or repository-supplied plugins;
- lifecycle installation scripts; or
- a plugin overriding a built-in tool or policy by name.

A separate development mode may load local plugins for authoring and tests. It
must be visibly distinct and unable to produce production evidence.

## Runtime and broker boundary

The generic runtime owns one admitted task at a time. A consumer may place a
deterministic program supervisor above it for multi-task sequencing and
recovery. The model and plugin system never become the scheduler.

For each task, the runtime validates authority before creating a workspace,
builds context only from admitted inputs, exposes only approved tools, and
calls a provider only through the bound task-scoped broker. It records
append-only events and rejects a candidate result when provider, model, plugin,
workspace, telemetry, or output evidence differs from the authorization.

Trusted brokers hold provider credentials and subscription sessions. Each
broker exposes only task-scoped inference, returns normalized telemetry and
exact route evidence, and fails closed on replay, expiry, route drift, model
drift, parameter drift, budget exhaustion, or evidence failure. Ambiguous
ledger or delivery failures fail closed too: a broker that cannot prove its
own consume write committed must not treat an existing record as permission
to proceed, or a delivery retry double-executes a one-time grant with no
attacker involved. There is no automatic fallback.

## Security invariants

- Repository content, source, instructions, tests, diffs, model output, and
  tool output are untrusted.
- Only a validated task and capability grant authority.
- Plugins may narrow authority or reject work. They cannot expand authority.
- Workers never receive provider credentials, subscription sessions, publisher
  credentials, provider endpoints, or arbitrary broker access.
- Provider and model identity are exact. Alias resolution, silent upgrade,
  substitution, and fallback are forbidden after authorization.
- Unsupported telemetry fields are `null`, never inferred.
- Missing or unwritable evidence fails the task closed.
- No worker, plugin, model, or repository can authorize publication.
- Consumer-specific policy remains outside the public core.

The public release requires a threat model covering plugin supply chain,
capability confusion, prompt injection, broker impersonation, replay,
at-most-once execution ambiguity across concurrent grant holders, evidence
tampering, dependency compromise, malicious model output, and private-data
exposure. The revised DSH threat model (2026-08-19, review-passed; branch
cited above) is the starting input: its control catalog (C12's extended
consume clause, C19's executable boundary mechanisms) and register (T01-T22)
transfer to this harness largely unchanged.

## Open-source boundary

The public release may contain contracts, the generic runtime, plugin SDK and
kernel, broker protocol, synthetic examples, conformance tests,
reproducible-build checks, public-sanitization tools, a license inventory, and
third-party notices.

It excludes X1/C3 adapters and policies, live credentials and endpoints,
private infrastructure or evidence, publisher controls, production repository
content, and model artifacts without verified redistribution rights. Provider
brokers or adapters are published only after their own security, license, and
sanitization review.

The POC's terminal record already classified every POC artifact
(`docs/x1/evidence/dsh-poc-extraction-inventory-2026-08-19.md`), and the
post-verdict release plan (`docs/plans/2026-08-19-dsh-post-verdict-release.md`)
records the hard blockers (license closure, threat model, sanitization) that
gate any extraction. Publication still requires new explicit approval; nothing
in this document grants it.

## Intake and architecture decision

The next phase is evidence gathering, not implementation:

1. Map OpenHands plugin lifecycle, events, tool loop, sandbox, dependencies,
   license obligations, and API surface to this document.
2. Map OpenCode V2 setup, transforms, hooks, ordering, disposal, and tools to a
   possible TypeScript SDK.
3. Map Pydantic AI's core/capability split and durable-execution seam to these
   package boundaries.
4. Compare a wrapped OpenHands base, an original narrow kernel, and a staged
   hybrid against security, maintenance, language, licensing, and extraction
   cost. Evaluate every candidate against the Task 4 constraints: can the
   boundary-enforcement mechanisms (module-graph closure, locked-realm
   harness, coverage gate) be applied to or around it, and does its execution
   machinery provide at-most-once task semantics under retries, or must the
   kernel add them.
5. Write a separately approved implementation plan only after the intake has a
   verified recommendation.

| Option | Tradeoff |
| --- | --- |
| OpenHands base | Reuses the most behavior, but retains a substantial Python harness dependency and may require hardening around plugin installation and authority |
| Original narrow kernel | Cleanest long-term boundary and smallest authority surface, but requires more implementation and conformance work |
| Staged hybrid | Uses OpenHands during contract and conformance development, then decides whether it remains an implementation detail |

The staged hybrid is the current recommendation. The proper long-term
architecture is the original narrow kernel if a wrapped dependency cannot
enforce static loading, capability isolation, exact evidence, or the public
dependency direction without invasive patches.

The intake must resolve the implementation language, whether OpenHands can be
securely locked, the plugin trust-root mechanism, the minimal durable event
store interface, and which provider adapters are safe to publish first.

## Non-goals

This document does not authorize implementation, installation, deployment,
publication, or a production runner. It does not amend the terminated DSH POC,
whose REJECT verdict is final, and it does not reopen the Task 4 extraction or
lift its stop-work state. It does not add Ollama to any verdict, select a
final language or dependency, or predetermine `ADOPT`, `IMITATE`, or
`REJECT`.
