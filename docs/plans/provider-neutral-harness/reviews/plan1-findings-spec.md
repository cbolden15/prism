# Plan 1 findings — spec compliance

COUNTS: Critical 0 / Important 4 / Minor 0

## Findings

### SPEC-001 — Important

- Task/step: Task 8 interface, Task 8 Step 6, Out of scope
- Claim: The plan says `test:pnh` alone satisfies C19 continuous execution, but `architecture.md` and the cited threat model require the module-graph closure, locked-realm harness, and coverage gate to run in the standard test command and CI on every change. The plan explicitly defers CI, so its own compliance claim is false.
- Exact plan-text evidence:
  "`- Produces: `npm run test:pnh` = typecheck + graph check + tests under 100% statement/function/branch coverage of `pnh/core/**`. This is C19's continuous-execution shape: all three mechanisms in one command.`"
  "`- CI wiring beyond the npm script (the repo has no CI today; the \"continuous execution\" requirement is satisfied by `test:pnh` being the single entry point).`"
- Concrete replacement text or code:

```md
Replace the Task 8 interface sentence with:
- Produces: `npm run test:pnh` = typecheck + graph check + tests under 100% statement/function/branch coverage of `pnh/core/**`. This satisfies the local standard-test-command half of C19; the plan is not C19-complete until the same command runs in CI on every change.

Replace the out-of-scope bullet with:
- CI wiring is not out of scope for C19 compliance. Add a task in this plan that runs `npm run test:pnh` in CI on every change, or downgrade the claim from “implements architecture.md” to “local foundation only; CI still required”.
```

### SPEC-002 — Important

- Task/step: Global Constraints, Task 4 interface, Task 4 implementation
- Claim: The plan hard-codes a six-minute grant TTL and justifies it with a DSH-specific `Gate E` reference that does not appear in the governing `architecture.md`. That makes the authority window untraceable to the approved architecture and pulls old-program terminology back into a provider-neutral kernel plan.
- Exact plan-text evidence:
  "`- `MAX_GRANT_TTL_MS = 360_000` (6 minutes, matches Gate E's `valid_expiry` window). `MAX_CLOCK_SKEW_MS = 30_000`.`"
  "`- Constants `MAX_GRANT_TTL_MS = 360_000`, `MAX_CLOCK_SKEW_MS = 30_000`, `SLUG_RE`, `NONCE_RE`, `DIGEST_RE``"
  "`export const MAX_GRANT_TTL_MS = 360_000;`"
- Concrete replacement text or code:

```md
Replace the global-constraint bullet with:
- `MAX_GRANT_TTL_MS = 360_000`. This value must be copied verbatim from the approving architecture decision; if `architecture.md` does not state it yet, add it there first. `MAX_CLOCK_SKEW_MS = 30_000`.

Replace the Task 4 commentary text with:
// Constraint from architecture.md: the TTL constant is architecture-owned.
// Keep the numeric value here only after the architecture doc states it.
```

### SPEC-003 — Important

- Task/step: Global Constraints, Task 4 Step 1, Task 7 interface, Task 7 Step 1
- Claim: The plan-wide neutrality rule forbids provider, model, X1, and route identity in core, reject codes, and fixture values. Task 4 uses `invoke-model`, and Task 7 weakens the reminder to “no provider or model names” while its fixtures use `route-primary` and `route-fallback`. The plan is internally inconsistent and non-compliant with its own neutrality constraint.
- Exact plan-text evidence:
  "`- Validation rejects unknown keys. Reject codes are neutral vocabulary (no provider, model, X1, or route identity anywhere in core, including reject codes and fixture values).`"
  "`operation: \"invoke-model\",`"
  "`- Neutral vocabulary: `routeClass` is a slug; no provider or model names appear anywhere in core, including tests' fixture values.`"
  "`const request = { grantDigest: G, routeClass: \"route-primary\", inputDigest: I };`"
  "`const drifted = { ...goodReceipt(), observedRouteClass: \"route-fallback\" };`"
- Concrete replacement text or code:

```md
Replace the Task 7 neutrality note with:
- Neutral vocabulary: `routeClass` is a slug, and no provider, model, X1, or route identity appears anywhere in core, reject codes, or test fixture values.
```

```ts
operation: "perform-task",
const request = { grantDigest: G, routeClass: "class-a", inputDigest: I };
requestedRouteClass: "class-a",
observedRouteClass: "class-a",
const drifted = { ...goodReceipt(), observedRouteClass: "class-b" };
```

### SPEC-004 — Important

- Task/step: Task 7 interface and implementation
- Claim: The architecture makes exact provider and model identity part of the broker/evidence seam and forbids provider/model drift after authorization. Task 7's broker request/receipt contract carries only route, grant, input, result, and telemetry fields, so `checkReceipt()` has no field it can compare for exact provider identity or model identity and therefore cannot enforce those binding invariants.
- Exact plan-text evidence:
  "`- Produces:
  - `interface BrokerRequest { grantDigest: string; routeClass: string; inputDigest: string }`
  - `interface BrokerReceipt { grantDigest: string; requestedRouteClass: string; observedRouteClass: string; inputDigest: string; resultDigest: string; telemetry: BrokerTelemetry }`
  - `checkReceipt(request: BrokerRequest, receipt: unknown): { ok: true; receipt: BrokerReceipt } | { ok: false; code: ReceiptRejectCode }`
  - `ReceiptRejectCode = \"shape\" | \"unknown-key\" | \"grant-mismatch\" | \"route-drift\" | \"input-mismatch\" | \"digest-format\" | \"telemetry\"``"
  "`if (
    rec[\"requestedRouteClass\"] !== request.routeClass ||
    rec[\"observedRouteClass\"] !== request.routeClass
  ) {
    return { ok: false, code: \"route-drift\" };
  }`"
- Concrete replacement text or code:

```ts
interface BrokerRequest {
  grantDigest: string;
  routeClass: string;
  providerId: string;
  modelId: string;
  inputDigest: string;
}

interface BrokerReceipt {
  grantDigest: string;
  requestedRouteClass: string;
  observedRouteClass: string;
  requestedProviderId: string;
  observedProviderId: string;
  requestedModelId: string;
  observedModelId: string;
  inputDigest: string;
  resultDigest: string;
  telemetry: BrokerTelemetry;
}

type ReceiptRejectCode =
  | "shape"
  | "unknown-key"
  | "grant-mismatch"
  | "route-drift"
  | "provider-drift"
  | "model-drift"
  | "input-mismatch"
  | "digest-format"
  | "telemetry";
```

```md
Add tests that reject any mismatch between requested and observed provider/model IDs using neutral fixture slugs.
```

## Constraint-to-task coverage statement

- Global constraint coverage mapped: timestamp purity and pinned UTC format map to Task 1; module-boundary enforcement maps to Task 2; locked-realm determinism maps to Task 3; capability serialization/validation and injected clock/hash map to Task 4; at-most-once vs replay semantics map to Task 5; evidence hash chaining maps to Task 6; broker request/receipt validation maps to Task 7; coverage-gate wiring maps to Task 8.
- Verified gaps: C19 continuous execution is only partially implemented because CI is explicitly deferred; the capability TTL constant is not traceable to `architecture.md`; the neutrality rule is violated in fixture values and weakened in Task 7 wording; the broker contract omits exact provider/model identity and drift checks required by the architecture/security invariants.
- No forbidden-path violation found in the plan text: the reviewed tasks stay under `pnh/**`, `package.json`, `package-lock.json`, `tsconfig.pnh.json`, and `pnh/README.md`; nothing instructs work in `x1/dsh/**` or `packages/`.
- Deferred but not counted as findings here: Plan 1 does not claim to deliver the full runtime, plugin kernel, task contract family, or result contract family; those remain later-plan scope rather than plan-internal contradictions.
