# Plan 1 hardening review — consolidated

VERDICT: FAIL
COUNTS: Critical 3 / Important 11 / Minor 1 (after verification; 1 killed, 1 deduplicated, 1 narrowed)

## Verified findings

### HPNH-C1 Critical — The locked-realm mechanism is neither isolated nor fail-closed

- Task/step: Task 3 interface; Task 3 Steps 1, 3, and 5
- Evidence: The plan claims, `"Ambient nondeterministic intrinsics are replaced with throwing stubs while a test body runs, so any reachable ambient call fails the suite regardless of how it is spelled."` Its complete `LOCKED_GLOBALS` list is only `"Date", "Math.random", "crypto", "fetch", "process", "setTimeout", "setInterval"`, and tests load core through ordinary host-realm `await import("../core/timestamp.ts")`.
- Re-derivation: `performance.now()`, locale/time-zone state through `Intl`, `WebSocket`, `queueMicrotask`, `setImmediate`, `eval`, and `Function` are live in the repo's Node 22 runtime. `Function("return import('node:fs')")` successfully imports `node:fs`. A host-captured `Date.now` remains callable after globals are replaced. Ordinary ESM imports also reuse the first cached evaluation, so a prior static import defeats the module-initialization claim. These are reachable C19 bypasses.
- Fix: Replace same-process global monkeypatching with a freshly evaluated compartment. The proper architecture is a new `vm`/SES realm with a curated global allowlist, string/Wasm code generation disabled, a custom linker that accepts only verified core realpaths, a rejecting dynamic-import callback, and fresh module evaluation that cannot reuse the host ESM cache. Add fixtures for `performance`, `Intl`, `WebSocket`, `console`/I/O, `setImmediate`, `queueMicrotask`, `eval`, `Function`, captured references, and a pre-imported module. Pending before selecting Node `vm`: prove that c8 receives usable source-mapped coverage for compartment-evaluated TypeScript; use an SES or isolated-worker implementation if it does not.
- Lens(es): ADVERSARIAL (`ADV-01`, deduplicated with `ADV-03`); orchestrator verification

### HPNH-C2 Critical — The graph checker does not resolve or walk the real module graph

- Task/step: Task 2 Step 3
- Evidence: The checker says it is `"resolving the real graph"`, but file discovery is `else if (p.endsWith(".ts")) out.push(p);` and import handling is only `const target = resolve(dirname(file), specifier); ... if (!existsSync(target))`.
- Re-derivation: A scanned `.ts` file can statically import an existing `.mts`, `.cts`, or `.js` file under `core/`. The checker accepts the lexical path but never scans that target's imports. An in-memory compile under the plan's exact NodeNext options confirmed that `a.ts -> b.mts -> node:fs` has zero TypeScript diagnostics. Symlinks are also checked by lexical path rather than realpath. This lets runtime authority cross the credited boundary while the checker reports clean.
- Fix: Build the graph with the TypeScript `Program`/NodeNext resolver, walk every resolved source transitively, and compare `realpath` values against a `realpath` core root. Because the plan requires pure TypeScript, reject executable targets outside the approved `.ts`/`.mts`/`.cts` set, or scan every allowed executable extension with the same rules. Reject symlinks whose real target is outside core. Add fixtures for `.mts -> node:fs`, `.cts`, `.js`, re-exports, and an in-core symlink to an outside file.
- Lens(es): ADVERSARIAL (`ADV-02`); orchestrator verification

### HPNH-C3 Critical — The 100% coverage gate omits never-loaded core files

- Task/step: Global Constraints coverage gate; Task 8 Steps 2 through 4
- Evidence: The command is `npx c8 --100 --include 'pnh/core/**' ...`, and the fail-closed proof only adds an uncovered branch to the already-loaded `timestamp.ts`.
- Re-derivation: c8's default is to report only files loaded by V8. Its own documentation states that `--all` is required to add matching unloaded files at 0% coverage. Therefore, a new unimported core file can contain uncovered ambient behavior while this plan still reports 100%. The Task 8 probe cannot detect that failure class because it modifies a loaded file. See the [c8 coverage documentation](https://github.com/bcoe/c8#checking-for-full-source-coverage-using---all).
- Fix: Change the command to `npx c8 --all --100 --include 'pnh/core/**/*.ts' --reporter text --reporter text-summary npx tsx --test pnh/tests/*.test.ts`. Add a fail-closed proof that creates an unimported executable core file, confirms the gate reports it at 0%, removes it, and confirms PASS. Handle the type-only `consume.ts` explicitly if c8 cannot map it; do not use a broad exclusion that reopens the bypass.
- Lens(es): orchestrator verification (coverage-gate hardening)

### HPNH-I1 Important — Realm restoration corrupts global property descriptors

- Task/step: Task 3 Step 3
- Evidence: The plan saves only values, then restores `crypto` and `process` with `Object.defineProperty(g, "...", { value: saved...., configurable: true })`.
- Re-derivation: In Node 22, `crypto` and `process` are accessor properties. The proposed restore turns each into a data property and drops getter/setter behavior. A self-contained descriptor comparison confirmed both descriptors differ after the proposed cycle.
- Fix: Save `Object.getOwnPropertyDescriptor` plus whether each property originally existed, and restore the exact descriptor in reverse order. Delete properties that were originally absent. Put setup inside the protected restoration path, and test full descriptors before/after both success and error exits.
- Lens(es): CORRECTNESS (`COR-002`); orchestrator verification

### HPNH-I2 Important — The evidence verifier cannot detect truncation or whole-history replacement

- Task/step: Task 6 Steps 1 and 3
- Evidence: The plan calls this `"the tamper-evidence layer"`, but `verifyChain(chain, hash)` receives no trusted expected length or head digest and explicitly tests that an empty chain verifies.
- Re-derivation: Removing records from the tail still verifies. Recomputing every record from genesis also verifies. Internal link consistency is useful, but it does not satisfy the architecture's trusted append-only evidence requirement or its missing-evidence fail-closed invariant without an external anchor.
- Fix: Either rename the API to `verifyInternalLinks` and state the limitation, or accept a trusted checkpoint such as `{ expectedLength, expectedHeadHash }` and reject length/head mismatch. Add tail-truncation, full-rewrite, and expected-nonempty tests. The trusted collector/store remains required outside the pure helper.
- Lens(es): ADVERSARIAL (`ADV-04`)

### HPNH-I3 Important — C19 continuous execution is claimed while CI is explicitly deferred

- Task/step: Task 8 interface, Step 6, and Out of scope
- Evidence: The plan says, `"This is C19's continuous-execution shape"`, then says, `"CI wiring beyond the npm script ... [is] out of scope"` and that the single entry point satisfies continuous execution.
- Re-derivation: `architecture.md` requires all three mechanisms to run `"continuously in test and CI"`. A command that may be run manually satisfies the standard-command half only.
- Fix: Add CI wiring in this plan that runs `npm ci` and `npm run test:pnh` on every push and pull request. If CI genuinely remains out of scope, change every C19-complete claim to `local foundation only` and keep C19 open.
- Lens(es): SPEC COMPLIANCE (`SPEC-001`)

### HPNH-I4 Important — A consumer-specific Gate E TTL is hard-coded into the public core

- Task/step: Global Constraints; Task 4 interface and Step 3
- Evidence: `MAX_GRANT_TTL_MS = 360_000` is justified because it `"matches Gate E's valid_expiry window"`.
- Re-derivation: The current Gate E code does use a six-minute maximum, but `architecture.md` does not adopt that duration as a provider-neutral kernel constant and states that consumer-specific policy remains outside the public core. The numeric match is real; its authority in this core is not.
- Fix: Preferred architecture: inject a validated `GrantValidationPolicy { maxTtlMs, maxClockSkewMs }` from the consumer boundary. If a universal kernel ceiling is intended instead, record the value as a binding architecture decision first and describe it without Gate E terminology.
- Lens(es): SPEC COMPLIANCE (`SPEC-002`); orchestrator verification

### HPNH-I5 Important — Broker fixtures violate the plan's own route-identity neutrality rule

- Task/step: Global Constraints; Task 7 Step 1
- Evidence: The plan forbids `"route identity anywhere in core, including ... fixture values"`, but uses `routeClass: "route-primary"` and `observedRouteClass: "route-fallback"`.
- Re-derivation: These are concrete synthetic route identities. The generic operation value `invoke-model` is not itself a model identity, so that portion of the original lens finding was not accepted.
- Fix: Use neutral values such as `class-a` and `class-b`, and keep the Task 7 neutrality statement identical to the global rule.
- Lens(es): SPEC COMPLIANCE (`SPEC-003`, narrowed)

### HPNH-I6 Important — Broker receipts cannot prove exact provider or model identity

- Task/step: Task 7 interface and Step 3
- Evidence: `BrokerRequest` contains only `grantDigest`, `routeClass`, and `inputDigest`; `BrokerReceipt` adds requested/observed route, result digest, and telemetry. The implementation calls this an `"exact-identity check"` but compares only route, grant, and input.
- Re-derivation: The binding architecture requires exact provider and model evidence and rejection of model drift. No field exists to express or compare either identity.
- Fix: Add requested and observed provider/model identifiers to the request/receipt contract, add `provider-drift` and `model-drift` reject codes, validate all identifiers as neutral slugs, and test each mismatch independently.
- Lens(es): SPEC COMPLIANCE (`SPEC-004`)

### HPNH-I7 Important — Task 8 can leave required coverage tests out of its commit

- Task/step: Task 8 Steps 3 and 7
- Evidence: Step 3 requires adding tests to matching `pnh/tests/*.test.ts` files, while Step 7 stages only `package.json package-lock.json pnh/README.md`.
- Re-derivation: A worker following the command literally leaves all coverage-closing test edits unstaged, contradicting the global per-task commit rule.
- Fix: Stage the actual coverage-test paths, for example `git add package.json package-lock.json pnh/README.md pnh/tests`, then inspect the staged diff before committing.
- Lens(es): EXECUTABILITY (`EXEC-001`)

### HPNH-I8 Important — Telemetry validation accepts negative and fractional counts/timings

- Task/step: Task 7 Step 3
- Evidence: `numberOrNull` accepts any finite number: `v === null || (typeof v === "number" && Number.isFinite(v))`.
- Re-derivation: `-1` and `-0.5` both pass. The threat model explicitly treats negative telemetry as corruption, and token counts cannot be fractional.
- Fix: Validate token fields as `null` or nonnegative safe integers. Validate duration as `null` or a nonnegative finite number (or safe integer if milliseconds are integral by contract). Add negative, fractional-token, `NaN`, and infinity tests.
- Lens(es): orchestrator verification (CORRECTNESS and SPEC COMPLIANCE)

### HPNH-I9 Important — `NaN` clock input bypasses both expiry and clock-skew checks

- Task/step: Task 4 Step 3
- Evidence: `validateGrant` accepts `nowMs: number`, then checks only `if (nowMs >= expiresMs)` and `if (nowMs + MAX_CLOCK_SKEW_MS < issuedMs)`.
- Re-derivation: Both comparisons are false for `NaN`, so even an expired grant can validate. This is an unknown clock state being treated as authority rather than failing closed.
- Fix: Before timestamp comparisons, require `Number.isSafeInteger(nowMs)` and return a neutral reject code such as `clock-input` when false. Add `NaN`, positive/negative infinity, and fractional-clock tests.
- Lens(es): orchestrator verification (ADVERSARIAL and CORRECTNESS)

### HPNH-I10 Important — Evidence digests are not format-validated despite the declared contract

- Task/step: Task 6 interface and Step 3
- Evidence: Task 6 says it consumes `Sha256Hex, DIGEST_RE`, but the implementation imports only `Sha256Hex`; `recordHash` accepts any string returned by the callback, and `verifyChain` checks equality only.
- Re-derivation: A callback returning a short or non-hex string can produce a chain that verifies. This violates the global 64-character lowercase-hex digest rule and also makes the newline-delimited record encoding unsafe once `prevHash` is not fixed-width.
- Fix: Import and apply `DIGEST_RE` to every generated and supplied `hash`/`prevHash`. Make invalid injected hash output fail closed with an explicit result or exception. Add malformed hash callback and malformed record tests.
- Lens(es): orchestrator verification (CORRECTNESS and SPEC COMPLIANCE)

### HPNH-I11 Important — Exact-shape validators accept inherited fields and return mutable untrusted receipts

- Task/step: Task 4 Step 3; Task 7 Step 3
- Evidence: Both validators enumerate with `Object.keys(rec)`, test required fields with `k in rec`, and the broker returns `rec as unknown as BrokerReceipt`.
- Re-derivation: Required fields may come from a prototype, while inherited, symbol, and non-enumerable unknown fields evade `Object.keys`. The broker then returns the caller-owned object itself, so its prototype or fields can change after validation.
- Fix: Require a plain/null-prototype record, compare `Reflect.ownKeys` to the exact allowed string-key set, require own data properties, and return a newly constructed normalized receipt/telemetry object. Add `Object.create(validPrototype)`, symbol-key, non-enumerable-key, getter, and post-validation mutation tests.
- Lens(es): orchestrator verification (CORRECTNESS)

### HPNH-M1 Minor — Canonical grant array arity is documented as 14 but implemented and tested as 13

- Task/step: Task 4 Steps 1 and 3
- Evidence: The test says `"13-element JSON array (version tag + 12 fields)"` and asserts length 13; the implementation comment says `"Fixed arity (14)"` over the same 13-element literal.
- Fix: Change the implementation comment to `Fixed arity (13)`.
- Lens(es): CORRECTNESS (`COR-003`)

## Killed findings

- `COR-001` killed: an in-memory compile with the repo's pinned TypeScript and the exact NodeNext options produced zero diagnostics for default imports from both `node:assert/strict` and `typescript`; `esModuleInterop` is not required here.
- `ADV-03` deduplicated into `HPNH-C1`: host ESM first-import caching is another consequence of the same non-isolated realm design, not a separate root cause.
- `SPEC-003` narrowed: `invoke-model` is generic operation vocabulary, not a concrete model identity; `route-primary` and `route-fallback` remain verified violations of the plan's explicit fixture-value rule.

## Coverage statement

- ADVERSARIAL read all eight tasks plus the enforcement and out-of-scope sections, then attacked the realm, module graph, grant/consume semantics, and evidence chain.
- CORRECTNESS read every task/code block and checked test/implementation consistency, strict TypeScript concerns, restore behavior, and date arithmetic. The coordinator independently confirmed `1970-01-01`, `2000-02-29`, and `2100-01-01` against `Date.UTC`.
- SPEC COMPLIANCE mapped the Global Constraints and binding architecture requirements to Tasks 1 through 8. It found no planned writes under `x1/dsh/**` or `packages/**`.
- EXECUTABILITY walked all commands and paths in task order. The repo has TypeScript, `@types/node`, and `tsx`; Node is `v22.21.0`; `c8` is intentionally absent before Task 8; existing repo usage supports `tsx --test` and `import.meta.dirname`.
- The orchestrator independently read the full plan, architecture, intake, and all 517 lines of the cross-branch threat model; inspected package and Gate E expiry code; ran only self-contained compiler/runtime/arithmetic probes; and did not run repository test suites or install anything.
