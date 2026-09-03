# Plan A proof-status decision

Date: 2026-08-28

Status: Ratified

Owner: Vora Technologies, LLC

Decision owner: D6, constitution and proof governance

Ratification operation: after the owner ratifies this file's prospective ratified-form digest, replace only `Status: Ratification Candidate` with `Status: Ratified`. No other byte may change.

Bound architecture identity: baseline-commit:33ddfb1e8f8203b1495bebabb51b2865276aaa9e

Bound architecture identity: architecture-spec:04e8e79a8cb89186da7032b696e832e1cf2d994d

Bound architecture identity: status-model-amendment:87b3e10b6dedeeec8cc9e95d524ca890fd2d3b7a

Bound architecture identity: plan-a:1c33a814f1324e67cf53a6fe860bdbdd175031ed

Transition entry: {"invariant_id":"PNH-INV-22","amendment_kind":"proof-invalidation","prior_binding_hash":"sha256:7098adc4024207100962cce6e39f850f9b440ee6709c0d0ac7828edab6f01cbe","prior_proof_status":"proven","reason":"Existing evidence does not cover every admitted execution class through its production constructor."}

Transition entry: {"invariant_id":"PNH-INV-23","amendment_kind":"proof-invalidation","prior_binding_hash":"sha256:64f1a019051f17943ac13d10070d536538584e9d2f59051beebacabb69d63a75","prior_proof_status":"proven","reason":"Cleanup truth is not yet scoped by execution class and stronger containment is not established."}

Transition entry: {"invariant_id":"PNH-INV-29","amendment_kind":"proof-invalidation","prior_binding_hash":"sha256:27c9a1b4b1901506a3b7ec581921d011271db9d9286c7d6849a8f2264f209c4e","prior_proof_status":"proven","reason":"The supported production entrypoint does not yet make owner-approved digest pins technically unavoidable."}

## Decision

Adopt the following initial proof-state mapping for the atomic registry-v2
migration. No row is proven. Existing conformance paths remain evidence indexes,
not complete proof. The proof reasons are exact migration text.

| ID | Initial proof status | Exact proof reason |
|---|---|---|
| PNH-INV-01 | unproven | Representative fault-cell tests do not prove every ordinary failure class under the ratified deterministic scheduler model. |
| PNH-INV-02 | partial | Existing evidence is not yet registered as structured static proof across every adapter and protocol pin. |
| PNH-INV-03 | partial | Existing parser-boundary evidence is not yet registered as structured runtime-adversarial proof across every parser boundary. |
| PNH-INV-04 | partial | Existing admission-ticket evidence is not yet registered as structured runtime-adversarial proof of the new authority root. |
| PNH-INV-05 | unproven | No production-path suite injects every named Policy failure before grant derivation and proves that each path denies all non-Policy grants. |
| PNH-INV-06 | unproven | No fault-injection suite covers duplicate and late observations across every request settlement path with the settlement guard disabled. |
| PNH-INV-07 | unproven | No production-path test injects post-dispatch effect uncertainty and proves the outcome remains ambiguous rather than success or failure. |
| PNH-INV-08 | unproven | No suite independently removes each required positive-evidence signal and proves that every incomplete combination fails closed. |
| PNH-INV-09 | unproven | The gate verifies executed registrations, but it does not yet verify production-path use, fault injection, or failure when a control is disabled. |
| PNH-INV-10 | unproven | The statement spans multiple content classes and components without a complete authority-confusion suite for each inbound boundary. |
| PNH-INV-11 | unproven | No adversarial suite attempts to derive authority from ambient references, configuration, and prior state across every admission path. |
| PNH-INV-12 | unproven | No malicious-plugin suite attempts grant widening for itself and another plugin through every plugin-to-harness command path. |
| PNH-INV-13 | unproven | Broker tests do not yet prove credential and arbitrary-endpoint absence from every plugin, worker, core, runtime, and publisher boundary. |
| PNH-INV-14 | unproven | No fault-injection suite attempts alias resolution, fallback, model substitution, and silent upgrade through every broker adapter. |
| PNH-INV-15 | unproven | No cross-provider test removes each optional telemetry field and proves that adapters preserve null instead of inferring a value. |
| PNH-INV-16 | unproven | No production-path suite injects missing and unwritable evidence sinks at each settlement stage and proves fail-closed behavior. |
| PNH-INV-17 | unproven | Publication is not implemented as a public workflow, so unauthorized publication attempts from every named component cannot yet be tested. |
| PNH-INV-18 | partial | Existing module-graph evidence is not yet registered as structured static proof of the standalone public-core graph. |
| PNH-INV-19 | unproven | The standalone package and consumer-adapter boundary do not exist yet, so no extraction-time dependency gate can prove this claim. |
| PNH-INV-20 | unproven | The isolated export, license inventory, provenance review, and secret scan are later readiness gates and have not been completed. |
| PNH-INV-21 | unproven | M3 rejects representative forged identities, but it does not yet cover every output and failure route or prove failure with attribution disabled. |
| PNH-INV-22 | partial | Existing evidence does not cover every admitted execution class through its production constructor. |
| PNH-INV-23 | partial | Cleanup truth is not yet scoped by execution class and stronger containment is not established. |
| PNH-INV-24 | unproven | M3 used a smaller correction successfully, but no enforceable review gate yet validates this evidence standard when a physical split is proposed. |
| PNH-INV-25 | unproven | No production proof covers every admitted execution class, including hostile container isolation, restricted trusted subprocess authority, and development-mode exclusion. |
| PNH-INV-26 | unproven | Documentation states this boundary, but no public-surface labeling gate yet prevents fault-cell isolation from being presented as sandboxing. |
| PNH-INV-27 | unproven | No production proof establishes the exact authority boundary and custody principal for every execution class. |
| PNH-INV-28 | unproven | No conformance suite mutates admitted contract meaning through a consumer adapter and proves that every rewrite attempt is rejected. |
| PNH-INV-29 | partial | The supported production entrypoint does not yet make owner-approved digest pins technically unavoidable. |
| PNH-INV-30 | unproven | No malicious-plugin and malicious-worker suite attempts all three authority classes through production command paths. |
| PNH-INV-31 | unproven | Forged identity cases exist, but endpoint and route injection are not covered across both broker and lifecycle-principal paths. |
| PNH-INV-32 | unproven | No admission test submits a second task through the production entrypoint and proves that scheduling authority remains outside the harness. |
| PNH-INV-33 | unproven | The supervisor tests cover one lifecycle principal instance, but the implementation does not provide one shared principal across all host instances. |
| PNH-INV-34 | unproven | No complete negative suite injects payloads, identities, and raw runtime arguments into every authenticated lifecycle command path. |
| PNH-INV-35 | unproven | The aggregate arbiter is supervisor scoped, not a single host-shared service covering all harness instances as this statement requires. |
| PNH-INV-36 | unproven | Aggregate tests cover representative ceilings, but do not yet prove all legal reservation patterns with the fair-share control disabled. |
| PNH-INV-37 | unproven | Cleanup paths release reservations, but no lease-expiry mechanism or fault-injection proof covers a wedged owner that never cleans up. |
| PNH-INV-38 | unproven | Deterministic full-rotation fairness is not yet proven under every legal registry-bounded load. |
| PNH-INV-39 | unproven | The current pins cover existing wire surfaces, but no out-of-process cell implementation proves semantic compatibility across a topology change. |
| PNH-INV-40 | unproven | No foreign-capability bridge implementation or production conformance path exists yet. |
| PNH-INV-41 | unproven | No bridge admission registry or fault-injection suite currently proves complete surface enumeration and default denial. |
| PNH-INV-42 | unproven | The trusted bridge mediator and its mismatch and post-dispatch ambiguity paths have not been implemented or adversarially tested. |
| PNH-INV-43 | unproven | Owner-pinned admission exists, but no stronger hostile-plugin class or complete development-mode evidence and effect gate exists. |
| PNH-INV-44 | unproven | Generated sections come from the registry, but no gate detects or resolves conflicting hand-written narrative prose. |
| PNH-INV-45 | unproven | Replay defenses are not proven across every authenticated command, response, and receipt path with the replay control disabled. |
| PNH-INV-46 | unproven | The M3 decision did not escalate topology, and no enforceable review template or gate validates all required content for a future escalation. |

## Exact proof-invalidation amendments

PNH-INV-22:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
from_hash: sha256:7098adc4024207100962cce6e39f850f9b440ee6709c0d0ac7828edab6f01cbe
kind: proof-invalidation
reason: Existing evidence does not cover every admitted execution class through its production constructor.
from_proof_status: proven
```

PNH-INV-23:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
from_hash: sha256:64f1a019051f17943ac13d10070d536538584e9d2f59051beebacabb69d63a75
kind: proof-invalidation
reason: Cleanup truth is not yet scoped by execution class and stronger containment is not established.
from_proof_status: proven
```

PNH-INV-29:

```yaml
date: "2026-08-28"
decision: docs/plans/provider-neutral-harness/2026-08-27-plan-a-proof-status-decision.md
from_hash: sha256:27c9a1b4b1901506a3b7ec581921d011271db9d9286c7d6849a8f2264f209c4e
kind: proof-invalidation
reason: The supported production entrypoint does not yet make owner-approved digest pins technically unavoidable.
from_proof_status: proven
```

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

This decision records the initial migration state only. It authorizes no proof
upgrade. Task 3 remains responsible for structured proof and independent review.
