# Plan 1 findings — correctness

## COR-001
Severity: Important
Task/step: Task 1 Step 1, plus every `test:pnh` verification step that runs `tsc -p tsconfig.pnh.json --noEmit`

Claim: The proposed `tsconfig.pnh.json` will fail strict typecheck because it omits `esModuleInterop` while the plan uses default imports from `node:assert/strict` and `typescript`, both of which are `export =` modules in this repo's pinned type/dependency set.

Exact plan-text evidence:

> ```json
> {
>   "compilerOptions": {
>     "target": "ES2022",
>     "module": "NodeNext",
>     "moduleResolution": "NodeNext",
>     "strict": true,
>     "noUncheckedIndexedAccess": true,
>     "noEmit": true,
>     "allowImportingTsExtensions": true,
>     "types": ["node"]
>   },
>   "include": ["pnh/**/*.ts"]
> }
> ```

> ```ts
> import assert from "node:assert/strict";
> ```

> ```ts
> import ts from "typescript";
> ```

Concrete replacement text or code:

Replace the Task 1 Step 1 `tsconfig.pnh.json` block with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["pnh/**/*.ts"]
}
```

This keeps the plan's existing import style valid across the tests and `check-module-graph.ts`.

## COR-002
Severity: Important
Task/step: Task 3 Step 3

Claim: `lockedRealm()` does not restore the original global property descriptors. It only restores values, and for `crypto` and `process` it always redefines them as `{ configurable: true, value: ... }`. That violates the plan's own `finally`-restore contract and can leave globals with the wrong configurability, writability, enumerability, getter/setter behavior, or presence after the realm exits.

Exact plan-text evidence:

> ```ts
> const saved = {
>   Date: g["Date"],
>   mathRandom: Math.random,
>   crypto: g["crypto"],
>   fetch: g["fetch"],
>   process: g["process"],
>   setTimeout: g["setTimeout"],
>   setInterval: g["setInterval"],
> };
> g["Date"] = throwingProxy("Date");
> Math.random = throwingFn("Math.random");
> Object.defineProperty(g, "crypto", { value: throwingProxy("crypto"), configurable: true });
> g["fetch"] = throwingFn("fetch");
> Object.defineProperty(g, "process", { value: throwingProxy("process"), configurable: true });
> g["setTimeout"] = throwingFn("setTimeout");
> g["setInterval"] = throwingFn("setInterval");
> try {
>   return await fn();
> } finally {
>   g["Date"] = saved.Date;
>   Math.random = saved.mathRandom;
>   Object.defineProperty(g, "crypto", { value: saved.crypto, configurable: true });
>   g["fetch"] = saved.fetch;
>   Object.defineProperty(g, "process", { value: saved.process, configurable: true });
>   g["setTimeout"] = saved.setTimeout;
>   g["setInterval"] = saved.setInterval;
> }
> ```

Concrete replacement text or code:

Replace the save/restore portion with descriptor-based restoration:

```ts
type SavedGlobal = {
  target: object;
  key: string;
  existed: boolean;
  descriptor?: PropertyDescriptor;
};

function saveGlobal(target: object, key: string): SavedGlobal {
  return {
    target,
    key,
    existed: Object.prototype.hasOwnProperty.call(target, key),
    descriptor: Object.getOwnPropertyDescriptor(target, key),
  };
}

function restoreGlobal(saved: SavedGlobal): void {
  if (!saved.existed) {
    Reflect.deleteProperty(saved.target, saved.key);
    return;
  }
  if (saved.descriptor !== undefined) {
    Object.defineProperty(saved.target, saved.key, saved.descriptor);
  }
}

export async function lockedRealm<T>(fn: () => Promise<T> | T): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const saved = [
    saveGlobal(g, "Date"),
    saveGlobal(Math, "random"),
    saveGlobal(g, "crypto"),
    saveGlobal(g, "fetch"),
    saveGlobal(g, "process"),
    saveGlobal(g, "setTimeout"),
    saveGlobal(g, "setInterval"),
  ];

  Object.defineProperty(g, "Date", { value: throwingProxy("Date"), configurable: true, writable: true });
  Object.defineProperty(Math, "random", { value: throwingFn("Math.random"), configurable: true, writable: true });
  Object.defineProperty(g, "crypto", { value: throwingProxy("crypto"), configurable: true, writable: true });
  Object.defineProperty(g, "fetch", { value: throwingFn("fetch"), configurable: true, writable: true });
  Object.defineProperty(g, "process", { value: throwingProxy("process"), configurable: true, writable: true });
  Object.defineProperty(g, "setTimeout", { value: throwingFn("setTimeout"), configurable: true, writable: true });
  Object.defineProperty(g, "setInterval", { value: throwingFn("setInterval"), configurable: true, writable: true });

  try {
    return await fn();
  } finally {
    for (const entry of saved.reverse()) restoreGlobal(entry);
  }
}
```

If the plan keeps direct assignment instead, it still needs descriptor-aware restore for every property touched via `defineProperty`, plus deletion when a property was originally absent.

## COR-003
Severity: Minor
Task/step: Task 4 Step 1 test vs Task 4 Step 3 implementation comment

Claim: The plan disagrees with itself about the canonical grant array arity. The test and literal array are 13 elements long, but the implementation comment says 14. The code is correct; the comment is not.

Exact plan-text evidence:

> ```ts
> // fixed arity: bytes parse as a 13-element JSON array (version tag + 12 fields)
> const arr = JSON.parse(canonicalGrantBytes(a)) as unknown[];
> assert.equal(arr.length, 13);
> ```

> ```ts
> // Fixed arity (14), fixed order, version-tagged. Slugs cannot contain
> // JSON-significant characters and integers are safe ints, so no two
> // distinct valid grants share bytes.
> return JSON.stringify([
>   "pnh-grant-v1",
>   g.programId,
>   g.taskId,
>   g.attempt,
>   g.audience,
>   g.inputDigest,
>   g.operation,
>   g.maxModelCalls,
>   g.maxInputTokens,
>   g.maxOutputTokens,
>   g.issuedAt,
>   g.expiresAt,
>   g.nonce,
> ]);
> ```

Concrete replacement text or code:

Replace the implementation comment with:

```ts
// Fixed arity (13), fixed order, version-tagged. Slugs cannot contain
// JSON-significant characters and integers are safe ints, so no two
// distinct valid grants share bytes.
```

## Coverage statement

Reviewed the plan text for Tasks 1-8 under Lens 2 only, plus the required context documents in the mandated order: `codex-review-prompt-plan1.md`, `2026-08-19-kernel-plan-1.md`, `architecture.md`, `intake-openhands-sdk-2026-08-19.md`, and threat-model Sections 5, 7, 8, and 12 from `x1/dsh-extraction-readiness-plan`. Re-checked timestamp arithmetic by hand against `Date.UTC` reference values for `1970-01-01`, `2000-02-29`, `1970-03-01`, and `2100-01-01`. Did not run repository tests or install anything. No other correctness defects survived re-checking against the complete task order and the plan's own test expectations.
