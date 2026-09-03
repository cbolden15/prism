# Plan A invariant amendments

Date: 2026-08-28

Status: Ratified

Owner: Vora Technologies, LLC

Decision owner: D6, constitution and proof governance

Ratification operation: after the owner ratifies this file's prospective ratified-form digest, replace only `Status: Ratification Candidate` with `Status: Ratified`. No other byte may change.

Bound architecture identity: baseline-commit:33ddfb1e8f8203b1495bebabb51b2865276aaa9e

Bound architecture identity: architecture-spec:04e8e79a8cb89186da7032b696e832e1cf2d994d

Bound architecture identity: status-model-amendment:87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a

Bound architecture identity: plan-a:1c33a814f1324e67cf53a6fe860bdbdd175031ed

Transition entry: {"invariant_id":"PNH-INV-01","amendment_kind":"binding-change","prior_binding_hash":"sha256:c36da6617d7b0a93bac6ae0a3c736c51d49d844785de9ff88d58633dd2e43ac3","reason":"Removed the unsupported universal 50 ms cross-plugin wall-clock bound."}

Transition entry: {"invariant_id":"PNH-INV-25","amendment_kind":"binding-change","prior_binding_hash":"sha256:ce0e01587c00f6de2f111523982b4f64f6495d0ecaa27384ba05effd9d5a021d","reason":"Replaced the container-only statement with the ratified execution-class statement."}

Transition entry: {"invariant_id":"PNH-INV-27","amendment_kind":"binding-change","prior_binding_hash":"sha256:435a72ee006354c9a9e2467f7f13a9d7bc900bf02f64de9ed648de1a846ad008","reason":"Replaced the container-only authority model with execution-class-specific authority and custody boundaries."}

Transition entry: {"invariant_id":"PNH-INV-38","amendment_kind":"binding-change","prior_binding_hash":"sha256:0345b3e245b753bf5a1ad69ecccf7ceea7c6e8fec818b7e87a86cd03d25d5619","reason":"Replaced the wall-clock interference claim with deterministic scheduler fairness and removed the unsupported 50 ms bound."}

## Decision

Adopt the following exact binding changes during the atomic registry-v2
migration. No other statement or bound changes.

## PNH-INV-01 bound amendment

Keep the existing statement unchanged. Remove
`max_cross_plugin_stall_ms: 50` entirely. PNH-INV-01 has no bounds after this
amendment.

Exact amendment entry:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
from_hash: sha256:c36da6617d7b0a93bac6ae0a3c736c51d49d844785de9ff88d58633dd2e43ac3
kind: binding-change
reason: Removed the unsupported universal 50 ms cross-plugin wall-clock bound.
```

## PNH-INV-25 statement amendment

Replace the statement with this exact text:

> Every admitted plugin executes under the execution class bound at
> admission. Code treated as hostile uses a separately constrained isolation
> class with production proof for its named boundary. Owner-reviewed
> subprocess code runs only under the restricted Prism execution principal,
> is never described as sandboxed, and receives no user, broker, operator, or
> publisher authority. Development code cannot produce production evidence or
> privileged effects.

Exact amendment entry:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
from_hash: sha256:ce0e01587c00f6de2f111523982b4f64f6495d0ecaa27384ba05effd9d5a021d
kind: binding-change
reason: Replaced the container-only statement with the ratified execution-class statement.
```

## PNH-INV-27 statement amendment

Replace the statement with this exact text:

> Every production execution class has one admission-bound authority boundary
> and one custody principal. `container-isolated-v1` uses the plugin container
> as its hostile-code boundary. `trusted-subprocess-v1` uses a dedicated
> restricted OS principal as its ambient-authority boundary but makes no
> hostile-code sandbox claim. The host custody daemon remains the sole
> lifecycle principal for both. `development-v1` is non-production.

Exact amendment entry:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
from_hash: sha256:435a72ee006354c9a9e2467f7f13a9d7bc900bf02f64de9ed648de1a846ad008
kind: binding-change
reason: Replaced the container-only authority model with execution-class-specific authority and custody boundaries.
```

## PNH-INV-38 statement and bound amendment

Replace the statement with this exact text:

> Under legal registry-bounded load, every ready allocation receives one
> scheduler quantum before any ready allocation receives a second. One full
> rotation contains at most `max_live_allocations` turns, and each turn admits
> at most `max_commands_per_event_loop_turn` commands. All bounds live in this
> registry and tests import them. Wall-clock latency is not a universal
> invariant; any wall-clock claim requires a separately approved controlled
> performance qualification on a named environment.

Remove only `max_cross_plugin_stall_ms: 50`. Preserve these bounds unchanged:

```yaml
max_live_allocations: 32
max_live_allocations_per_plugin: 8
max_concurrent_docker_invocations: 4
max_command_bytes_per_allocation: 8000000
max_command_ids_per_allocation: 4096
max_tracked_command_allocations: 64
max_recent_command_ids: 4096
max_recent_acknowledged_allocations: 4096
max_commands_per_event_loop_turn: 8
max_wire_frame_bytes: 1000000
max_wire_buffer_bytes: 8000000
```

Exact amendment entry:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md
from_hash: sha256:0345b3e245b753bf5a1ad69ecccf7ceea7c6e8fec818b7e87a86cd03d25d5619
kind: binding-change
reason: Replaced the wall-clock interference claim with deterministic scheduler fairness and removed the unsupported 50 ms bound.
```

## Proof reasons after amendment

| ID | Initial proof status | Exact proof reason |
|---|---|---|
| PNH-INV-01 | unproven | Representative fault-cell tests do not prove every ordinary failure class under the ratified deterministic scheduler model. |
| PNH-INV-25 | unproven | No production proof covers every admitted execution class, including hostile container isolation, restricted trusted subprocess authority, and development-mode exclusion. |
| PNH-INV-27 | unproven | No production proof establishes the exact authority boundary and custody principal for every execution class. |
| PNH-INV-38 | unproven | Deterministic full-rotation fairness is not yet proven under every legal registry-bounded load. |

## Bound artifacts

| Artifact | Git identity |
|---|---|
| Baseline commit | `33ddfb1e8f8203b1495bebabb51b2865276aaa9e` |
| Ratified architecture spec | `04e8e79a8cb89186da7032b696e832e1cf2d994d` |
| Ratified status-model amendment | `87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a` |
| Ratified Plan A | `1c33a814f1324e67cf53a6fe860bdbdd175031ed` |
| Legacy registry | `e21eadd127317b0dbdab0c54e183f36ccab4fcb4` |
| Legacy lock | `0b7efafb710dd4d57d135558a1518031f3131d3a` |

## Scope

This decision authorizes exactly the four binding-change entries above after
owner ratification. Shared resource constants, protocol pins, and every other
invariant statement and bound remain unchanged.
