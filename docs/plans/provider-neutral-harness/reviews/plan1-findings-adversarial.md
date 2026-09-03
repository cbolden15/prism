# Plan 1 adversarial findings

## Critical

### ADV-01
- severity: Critical
- task/step: Task 3 Step 3 (`pnh/harness/locked-realm.ts`), Task 3 Step 5 (realm-scoped imports)
- claim: The locked-realm mechanism is not fail-closed. It stubs only seven names, leaving dynamic code construction and multiple reachable ambient channels live. A core module that passes the Task 2 checker can still call `Function("return import('node:fs')")`, `performance.now()`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `queueMicrotask`, or `setImmediate` without tripping the planned tests, which breaks the C19 claim that dynamic loading is unavailable and that any reachable ambient call fails regardless of spelling.
- exact plan-text evidence:
  > "Locked-realm determinism harness: core tests execute the core in a compartment whose nondeterministic intrinsics (clock, entropy, environment, filesystem, network, process) are throwing stubs and whose dynamic loading (`import()`, `require`, `eval`, `Function`) is unavailable."
  >
  > "Ambient nondeterministic intrinsics are replaced with throwing stubs while a test body runs, so any reachable ambient call fails the suite regardless of how it is spelled."
  >
  > ```ts
  > export const LOCKED_GLOBALS = [
  >   "Date",
  >   "Math.random",
  >   "crypto",
  >   "fetch",
  >   "process",
  >   "setTimeout",
  >   "setInterval",
  > ] as const;
  > ```
- concrete replacement text or code:

```ts
export const LOCKED_GLOBALS = [
  "Date",
  "Math.random",
  "crypto",
  "fetch",
  "process",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "performance",
  "Intl",
  "WeakRef",
  "SharedArrayBuffer",
  "Atomics",
  "eval",
  "Function",
] as const;

// Save/restore descriptors, not just values, for every replaced global.
// Also deny the async/generator constructors so dynamic code creation cannot
// re-open `import()` through `Function("return import(...)")`.
```

Add regression tests that fail today:

```ts
assert.throws(() => performance.now(), /locked realm/);
assert.throws(() => Intl.DateTimeFormat().resolvedOptions().timeZone, /locked realm/);
assert.throws(() => queueMicrotask(() => {}), /locked realm/);
assert.throws(() => setImmediate(() => {}), /locked realm/);
assert.throws(() => Function("return import('node:fs')"), /locked realm/);
assert.throws(() => eval("Date.now()"), /locked realm/);
```

### ADV-02
- severity: Critical
- task/step: Task 1 Step 1 (`tsconfig.pnh.json`), Task 2 Step 3 (`check-module-graph.ts`)
- claim: The module-graph checker does not resolve the real NodeNext graph. It scans only `*.ts` files and only checks that a lexical target path exists under `resolve(...)`. A `.ts` file can import `./bridge.mts`, `./helper.cts`, `./payload.json`, or a symlinked `.ts` under `core/`; those targets are accepted as in-boundary, but their own imports are never walked and symlinked realpaths are never compared to the core root. That is a direct fail-open path against the mechanism the architecture says must replace lexical scanning.
- exact plan-text evidence:
  > `"include": ["pnh/**/*.ts"]`
  >
  > ```ts
  > function listTsFiles(dir: string): string[] {
  >   const out: string[] = [];
  >   for (const entry of readdirSync(dir)) {
  >     const p = join(dir, entry);
  >     if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
  >     else if (p.endsWith(".ts")) out.push(p);
  >   }
  >   return out;
  > }
  > ```
  >
  > ```ts
  > const target = resolve(dirname(file), specifier);
  > if (!isInside(root, target) && target !== root) {
  >   violations.push({ file, specifier, reason: "escapes-core" });
  >   return;
  > }
  > if (!existsSync(target)) {
  >   violations.push({ file, specifier, reason: "unresolved" });
  > }
  > ```
  >
  > "Static import specifiers are grammatically literal, so resolving the real graph is complete and fails closed."
- concrete replacement text or code:

```ts
import { lstatSync, realpathSync } from "node:fs";

const root = realpathSync.native(resolve(coreDir));
const SOURCE_FILE_RE = /\.(cts|mts|ts|cjs|mjs|js|json)$/;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = lstatSync(p);
    if (stat.isSymbolicLink()) {
      const real = realpathSync.native(p);
      if (!real.startsWith(root + sep)) {
        out.push(p); // report as escapes-core on read
        continue;
      }
    }
    if (statSync(p).isDirectory()) out.push(...listSourceFiles(p));
    else if (SOURCE_FILE_RE.test(p)) out.push(p);
  }
  return out;
}

const resolved = ts.resolveModuleName(specifier, file, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
}, ts.sys).resolvedModule;
if (!resolved) pushUnresolved(...);
const target = realpathSync.native(resolved.resolvedFileName);
if (!target.startsWith(root + sep)) pushEscapesCore(...);
```

Add explicit tests for:

```ts
"a.ts": 'export * from "./b.mts";\n',
"b.mts": 'import "node:fs";\n',
```

and for a symlinked `core/link.ts -> ../outside.ts`.

## Important

### ADV-03
- severity: Important
- task/step: Task 3 interface contract, Task 3 Step 5 retrofit pattern
- claim: Module-initialization nondeterminism is still convention-based because the plan relies on ordinary ESM imports inside the realm. ESM caching is process-global and first-import wins. If any test helper or future test statically imports `pnh/core/**` once outside `lockedRealm`, later `await import("../core/...")` calls reuse the cached module and any top-level capture of `Date`, `performance`, or other ambient handles happens before the stubs are active.
- exact plan-text evidence:
  > "All later core tests call core functions inside `lockedRealm`, and import core modules inside it (`await import(...)`) so module-initialization nondeterminism is also caught."
  >
  > ```ts
  > const ms = await lockedRealm(async () => {
  >   const { parseUtcMs } = await import("../core/timestamp.ts");
  >   return parseUtcMs("1970-01-02T00:00:00.000Z");
  > });
  > ```
  >
  > "The rejects test moves its whole loop inside `lockedRealm` the same way; the regex test imports `TIMESTAMP_RE` inside the realm."
- concrete replacement text or code:

Replace the Step 5 guidance with this stronger rule:

> "All test imports of `pnh/core/**` MUST go through a dedicated `importCoreFresh()` helper that loads a fresh module URL per call; static imports of `pnh/core/**` in tests are forbidden. Add a regression fixture whose module scope captures `Date.now` and prove the suite fails unless the first import happens after realm activation."

One concrete helper shape:

```ts
let realmImportCounter = 0;
export async function importCoreFresh<T>(rel: string): Promise<T> {
  const url = new URL(`${rel}?pnh_realm=${realmImportCounter++}`, import.meta.url);
  return import(url.href) as Promise<T>;
}
```

Use `importCoreFresh("../core/timestamp.ts")` instead of raw `await import(...)`.

### ADV-04
- severity: Important
- task/step: Task 6 Step 3 (`pnh/core/evidence.ts`)
- claim: `verifyChain` only proves internal link consistency for the array it is given. It cannot detect tail truncation or a full-chain rewrite where an attacker recomputes every `hash`, yet the implementation comment describes it as "the tamper-evidence layer". That overclaims relative to the threat model, which requires append-only evidence anchored by a trusted collector.
- exact plan-text evidence:
  > ```ts
  > // PNH evidence hash chain. Pure: hashing is injected. This is the
  > // tamper-evidence layer the OpenHands intake found missing upstream —
  > // sequence numbers must be dense from 0, each record binds its predecessor's
  > // hash, and each hash covers seq + prevHash + payload.
  > ```
  >
  > ```ts
  > verifyChain(chain: readonly EvidenceRecord[], hash: Sha256Hex): { ok: true } | { ok: false; seq: number; reason: "seq" | "link" | "hash" }
  > ```
  >
  > ```ts
  > test("append builds a verifiable chain", async () => {
  >   ...
  >   assert.deepEqual(verifyChain(chain, sha256), { ok: true });
  > });
  > ```
- concrete replacement text or code:

```ts
export function verifyChain(
  chain: readonly EvidenceRecord[],
  expected: { length: number; finalHash: string },
  hash: Sha256Hex,
): { ok: true } | { ok: false; seq: number; reason: "seq" | "link" | "hash" | "length" | "head" } {
  if (chain.length !== expected.length) {
    return { ok: false, seq: chain.length, reason: "length" };
  }
  // existing per-record checks...
  const last = chain[chain.length - 1];
  if ((last?.hash ?? GENESIS_HASH) !== expected.finalHash) {
    return { ok: false, seq: Math.max(0, chain.length - 1), reason: "head" };
  }
  return { ok: true };
}
```

Add two missing tests:

```ts
test("tail truncation is rejected when the anchored final hash is missing", ...);
test("whole-chain recomputation with forged hashes is rejected when the anchored final hash differs", ...);
```

If Plan 1 is intentionally only a local helper, then narrow the comment instead of overclaiming: rename `verifyChain` to `verifyInternalLinks` and state explicitly that truncation/full-history rewrite detection requires an external anchored digest or signature.

## Coverage statement

Reviewed `docs/plans/provider-neutral-harness/reviews/codex-review-prompt-plan1.md`, then the required context in order: `2026-08-19-kernel-plan-1.md`, `architecture.md`, `intake-openhands-sdk-2026-08-19.md`, and the cross-branch threat model sections 5, 7 (`C12`, `C19`), 8 (`T22`), and 12 via `git show`.

Executed only Lens 1 (ADVERSARIAL). I reviewed all Plan 1 tasks plus the `Layout`, `Enforcement (C19 mechanisms)`, and `Out of scope` sections. I also checked the plan’s grant canonicalization, claim-key injectivity, expiry/skew ordering, and `committed`/`replayed`/`conflict` semantics against Task 5’s test order and did not find a separate verified defect there beyond the findings above.
