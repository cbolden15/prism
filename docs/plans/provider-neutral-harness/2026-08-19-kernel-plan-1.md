# Provider-Neutral Harness — Kernel Plan 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the narrow security kernel's foundation: the three executable boundary-enforcement mechanisms (module-graph closure, Docker-contained core determinism harness, coverage gate) and the pure contract core (timestamps, capability grants, consume decision port, evidence hash chain, broker protocol types).

**Architecture:** Everything in `pnh/core/` is pure TypeScript with zero imports from outside `pnh/core/` and zero ambient nondeterminism — clock readings, entropy, policy ceilings, and hashing enter as injected parameters. Enforcement is mechanical, not conventional: a NodeNext-resolved module-graph checker fails closed on every out-of-boundary realpath; a resolved-URL guard prevents the parent test graph from loading core; a container-local supervisor owns the checked manifest in memory and starts a fresh child Node worker for every core call; each worker receives the manifest over a private descriptor and its synchronous loader transform adds denials only to checked core modules; and a `c8 --all --100` gate includes unimported core files. Tooling (`pnh/scripts/`, `pnh/harness/`, `pnh/adapters/`) lives outside core and may use Node APIs.

**Tech Stack:** TypeScript (strict), `node:test` via Node 22 + `tsx`, a pinned Node `22.21.0` Docker runner, Node's synchronous `module.registerHooks()` API, the TypeScript compiler API/NodeNext resolution for graph checking and the core-only transform, and `c8` for the coverage gate. Zero runtime dependencies in core.

The Docker entrypoint creates the Task 2-approved manifest at a temporary bootstrap path, reads it, and deletes it before tests start. It gives the manifest once to a separate supervisor over file descriptor 3. The supervisor retains the text only in memory and gives each fresh worker its own copy over that worker's private descriptor 3. Tests and workers receive no manifest path or manifest environment value. Parent `.mjs` and TypeScript tests run under a resolved-URL core guard. Each worker uses the synchronous manifest-scoped loader transform, which compiles only verified core TypeScript, injects lexical denials only there, and returns inline maps to the original source. `node:vm` is not used and is not an acceptable fallback.

**Authority:** This plan implements `docs/plans/provider-neutral-harness/architecture.md` per its intake outcome (`intake-openhands-sdk-2026-08-19.md`: narrow kernel selected). Execution was separately authorized and completed. It did not touch `x1/dsh/**` (stop-work), create `packages/dsh-core`, or publish anything.

**Execution status (2026-08-19): Tasks 1–8 complete; final audit READY.** The final strict audit records 14 of 14 requirements complete after the parent resolved-URL guard and private manifest transport remediation (`docs/audits/2026-08-19-kernel-plan-1-audit.md`). The Task 3 SES acceptance gate passed its isolation probes but failed its required c8 attribution proof (`reviews/2026-08-19-task3-ses-acceptance-gate.md`); the first Docker replacement then blocked at a child-wide ambient-denial preload (`reviews/2026-08-19-task3-docker-preflight.md`); and the manifest-scoped loader passed the disposable gate (`reviews/2026-08-19-task3-core-loader-preflight.md`). The permanent implementation was completed in Tasks 4–8 and hardened in `766b273`.

| Task | Result | Primary implementation commit |
| --- | --- | --- |
| 1 | Complete | `cd13300` |
| 2 | Complete | `be62b71` |
| 3 | Complete, including audit remediation | `f770987`, `48d0fc8`, `766b273` |
| 4 | Complete | `412ddf9` |
| 5 | Complete | `3f17b8c`, `3e0fc1f` |
| 6 | Complete | `086a837`, `0661492` |
| 7 | Complete | `ea23a47`, `8b4b6ca` |
| 8 | Complete | `d989e67`, `6f1df0c`, `766b273` |

The task-body checkboxes and code snippets below preserve the original execution script and its superseded assumptions. This status table, the implementation notes in `2026-08-19-kernel-plan-1.decision.json`, and the final audit are the completion authorities.

## Global Constraints

- Core purity: no `Date`, `Math.random`, `crypto`, `fetch`, `process`, environment, filesystem, network, console, dynamic code generation, weak-reference/GC observation, shared-memory synchronization, or timer API usage anywhere under `pnh/core/`. Clock values, policy ceilings, and hashing arrive as typed injected values. The Docker worker's manifest-scoped transform injects lexical denials only into core; the worker-local `Sha256Hex` callback is the sole callable bridge and may return only a primitive digest.
- Module boundary: `pnh/core/` contains regular `.ts` files only — no symlinks and no `.mts`, `.cts`, `.tsx`, `.js`, `.json`, or other executable/data sidecars. Core files may import only other core `.ts` files through relative specifiers resolved with TypeScript's NodeNext resolver and checked by realpath. No `node:` modules, packages, triple-slash references, dynamic `import()`, or `require` anywhere in core.
- All identifiers are slugs: `/^[a-z0-9][a-z0-9-]{0,63}$/`. Nonces: `/^[A-Za-z0-9_-]{22,64}$/` (128-bit minimum; generated outside core, validated only in core).
- Digests are 64-char lowercase hex. Canonical serialization is a fixed-arity, fixed-order JSON array with a leading version tag — no two distinct valid grants may share bytes.
- Grant TTL and clock-skew ceilings are consumer policy, not kernel constants. `validateGrant` receives `GrantValidationPolicy { maxTtlMs, maxClockSkewMs }` as untrusted input and validates it as an exact own-data record before use; tests use synthetic policy values.
- Timestamps: pinned 24-char UTC format `YYYY-MM-DDTHH:MM:SS.sssZ`, parsed with an anchored regex, explicit component-range validation (leap-year aware), and integer days-from-civil arithmetic. No `Date` API in core.
- At-most-once ≠ replay protection: the consume port's `'committed'` means "this call inserted the row." Ambiguous ledger failures throw (fail closed) — there is no re-present rule.
- Validation accepts only plain/null-prototype records with exact own enumerable data properties, rejects symbols/accessors/inherited fields, and returns normalized copies rather than caller-owned objects. Reject codes and synthetic fixture values use neutral vocabulary (no real provider, model, X1, endpoint, or route identity anywhere in core).
- Coverage gate: 100% statements, functions, and branches over every `pnh/core/**/*.ts`, including never-imported files, via `c8 --all --100`. Type-only modules must either contain a tested runtime protocol constant or be included through an explicit generated coverage manifest; broad exclusions are forbidden.
- TypeScript `strict: true`. Tests use `node:test` + `node:assert/strict`; every runtime load of core code goes through a fresh Docker-contained worker using the manifest-scoped loader transform. A type-only `typeof import(...)` query is allowed because it erases at compile time and cannot populate the worker ESM cache.
- Docker-loader acceptance gate: before the harness is credited, a real c8 run must demonstrate original-TypeScript line/branch attribution for both a loaded core module and an unimported core file. It must also demonstrate core-only denied ambient globals while worker globals remain usable, constructor escape containment, dynamic-load rejection, manifest/digest rejection, fresh module identity, and JSON-only boundary values. If any proof fails, stop Plan 1; do not weaken Docker policy, use a global monkeypatch, or return to SES or `node:vm`.
- Continuous execution: the standard `test:pnh` command runs all three C19 mechanisms locally, and CI runs that exact command on every push and pull request that can affect the kernel. CI is part of this plan, not an out-of-scope follow-up.
- Commit after every task with the message given in the task. Never push.

---

<!-- model: sonnet -->

### Task 1: Scaffold + timestamp module

**Files:**
- Create: `pnh/core/timestamp.ts`
- Create: `pnh/tests/timestamp.test.ts`
- Create: `tsconfig.pnh.json`
- Modify: `package.json` (add two scripts to the existing `"scripts"` block)

**Interfaces:**
- Produces: `parseUtcMs(s: string): number | null` — returns epoch milliseconds for a valid pinned-format UTC timestamp, `null` for anything else. `TIMESTAMP_RE` (exported for reuse). Later tasks import from `"./timestamp.ts"`.

- [ ] **Step 1: Create `tsconfig.pnh.json`**

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
    "types": ["node"]
  },
  "include": ["pnh/**/*.ts"]
}
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, add to the existing `"scripts"` object (keep all existing entries):

```json
"typecheck:pnh": "tsc -p tsconfig.pnh.json --noEmit",
"test:pnh": "npm run typecheck:pnh && npx tsx --test pnh/tests/*.test.ts"
```

- [ ] **Step 3: Write the failing test**

Create `pnh/tests/timestamp.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUtcMs, TIMESTAMP_RE } from "../core/timestamp.ts";

test("parses reference dates to exact epoch ms", () => {
  // Expected values computed with Date.UTC here in the TEST (tests are not core).
  const cases: Array<[string, number]> = [
    ["1970-01-01T00:00:00.000Z", Date.UTC(1970, 0, 1, 0, 0, 0, 0)],
    ["2026-08-19T12:34:56.789Z", Date.UTC(2026, 7, 19, 12, 34, 56, 789)],
    ["2000-02-29T23:59:59.999Z", Date.UTC(2000, 1, 29, 23, 59, 59, 999)],
    ["2024-02-29T00:00:00.000Z", Date.UTC(2024, 1, 29, 0, 0, 0, 0)],
    ["1999-12-31T23:59:59.000Z", Date.UTC(1999, 11, 31, 23, 59, 59, 0)],
    ["2038-01-19T03:14:07.000Z", Date.UTC(2038, 0, 19, 3, 14, 7, 0)],
    ["2100-01-01T00:00:00.000Z", Date.UTC(2100, 0, 1, 0, 0, 0, 0)],
    ["1970-03-01T00:00:00.000Z", Date.UTC(1970, 2, 1, 0, 0, 0, 0)],
  ];
  for (const [s, expected] of cases) {
    assert.equal(parseUtcMs(s), expected, s);
  }
});

test("rejects malformed and out-of-range timestamps", () => {
  const bad = [
    "2026-08-19T12:34:56.789+00:00", // wrong zone form
    "2026-08-19 12:34:56.789Z",      // space separator
    "2026-8-19T12:34:56.789Z",       // unpadded month
    "2026-13-01T00:00:00.000Z",      // month 13
    "2026-00-10T00:00:00.000Z",      // month 0
    "2026-02-29T00:00:00.000Z",      // not a leap year (2026)
    "2100-02-29T00:00:00.000Z",      // century non-leap
    "2026-04-31T00:00:00.000Z",      // April 31
    "2026-08-00T00:00:00.000Z",      // day 0
    "2026-08-19T24:00:00.000Z",      // hour 24
    "2026-08-19T12:60:00.000Z",      // minute 60
    "2026-08-19T12:00:60.000Z",      // second 60
    "2026-08-19T12:00:00.00Z",       // 2-digit ms
    "2026-08-19T12:00:00.0000Z",     // 4-digit ms
    "",
    "2026-08-19T12:00:00.000Zx",     // trailing char
  ];
  for (const s of bad) {
    assert.equal(parseUtcMs(s), null, s);
  }
});

test("TIMESTAMP_RE is anchored", () => {
  assert.equal(TIMESTAMP_RE.source.startsWith("^"), true);
  assert.equal(TIMESTAMP_RE.source.endsWith("$"), true);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx tsx --test pnh/tests/timestamp.test.ts`
Expected: FAIL — cannot find module `../core/timestamp.ts`.

- [ ] **Step 5: Write the implementation**

Create `pnh/core/timestamp.ts`:

```ts
// Pinned 24-char UTC timestamp handling for the PNH kernel core.
// Constraint (architecture.md): no Date API in core; integer arithmetic only.

export const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Howard Hinnant's days-from-civil: days since 1970-01-01 for a civil date.
function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function parseUtcMs(s: string): number | null {
  const m = TIMESTAMP_RE.exec(s);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ms = Number(m[7]);
  if (month < 1 || month > 12) return null;
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
  if (day < 1 || day > maxDay) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const days = daysFromCivil(year, month, day);
  return ((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000 + ms;
}
```

- [ ] **Step 6: Run tests and typecheck to verify they pass**

Run: `npm run test:pnh`
Expected: typecheck clean, 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.pnh.json package.json pnh/
git commit -m "feat(pnh): scaffold kernel package with pure timestamp module"
```

### Task 2: Module-graph closure checker

**Files:**
- Create: `pnh/scripts/check-module-graph.ts`
- Create: `pnh/tests/module-graph.test.ts`
- Modify: `package.json` (one new script; extend `test:pnh`)

**Interfaces:**
- Produces: `checkModuleGraph(coreDir: string): GraphViolation[]`. The checker rejects non-`.ts` files, symlinks, triple-slash references, external/bare specifiers, realpaths outside core, unresolved NodeNext edges, dynamic `import()`, and direct `require`. Exit code 1 from the CLI on any violation. Later tasks rely on `npm run check:pnh-graph` passing.

- [ ] **Step 1: Write the failing test**

Create `pnh/tests/module-graph.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkModuleGraph } from "../scripts/check-module-graph.ts";

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pnh-graph-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

test("clean core-only relative imports pass", () => {
  const dir = fixture({
    "a.ts": 'import { b } from "./b.ts";\nexport const a = b + 1;\n',
    "b.ts": "export const b = 1;\n",
  });
  try {
    assert.deepEqual(checkModuleGraph(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("node: builtin import is a violation", () => {
  const dir = fixture({ "a.ts": 'import { readFileSync } from "node:fs";\n' });
  try {
    const v = checkModuleGraph(dir);
    assert.equal(v.length, 1);
    assert.equal(v[0]?.reason, "external-specifier");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bare package import is a violation", () => {
  const dir = fixture({ "a.ts": 'import x from "lodash";\n' });
  try {
    assert.equal(checkModuleGraph(dir)[0]?.reason, "external-specifier");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("relative import escaping the core dir is a violation", () => {
  const dir = fixture({ "a.ts": 'import { x } from "../outside.ts";\n' });
  try {
    assert.equal(checkModuleGraph(dir)[0]?.reason, "escapes-core");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dynamic import and require are violations", () => {
  const dir = fixture({
    "a.ts": 'export async function f(p: string) { return import(p); }\n',
    "b.ts": 'declare const require: (s: string) => unknown;\nexport const r = require("fs");\n',
  });
  try {
    const reasons = checkModuleGraph(dir).map((v) => v.reason).sort();
    assert.deepEqual(reasons, ["dynamic-import", "require-call"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("export-from and import-equals are covered", () => {
  const dir = fixture({
    "a.ts": 'export { b } from "node:crypto";\n',
    "b.ts": 'import ns = require("node:fs");\nexport const n = ns;\n',
  });
  try {
    const reasons = checkModuleGraph(dir).map((v) => v.reason).sort();
    assert.deepEqual(reasons, ["external-specifier", "external-specifier"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unresolved relative import is a violation", () => {
  const dir = fixture({ "a.ts": 'import { x } from "./missing.ts";\n' });
  try {
    assert.equal(checkModuleGraph(dir)[0]?.reason, "unresolved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-.ts source sidecars fail closed before their imports can hide", () => {
  const dir = fixture({
    "a.ts": 'export * from "./b.mts";\n',
    "b.mts": 'import "node:fs";\n',
  });
  try {
    assert.equal(
      checkModuleGraph(dir).some((v) => v.reason === "unsupported-file"),
      true,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("declaration files are unsupported sidecars, not core source", () => {
  const dir = fixture({ "a.ts": "export {};\n", "ambient.d.ts": "declare const host: unknown;\n" });
  try {
    assert.equal(checkModuleGraph(dir).some((v) => v.reason === "unsupported-file"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("symlinks are rejected even when the lexical path is inside core", () => {
  const root = mkdtempSync(join(tmpdir(), "pnh-graph-link-"));
  const core = join(root, "core");
  mkdirSync(core);
  const outside = join(root, "outside.ts");
  writeFileSync(outside, 'import "node:fs";\n');
  symlinkSync(outside, join(core, "link.ts"));
  try {
    assert.equal(checkModuleGraph(core)[0]?.reason, "symlink");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("triple-slash references are rejected", () => {
  const dir = fixture({ "a.ts": '/// <reference path="../outside.d.ts" />\nexport {};\n' });
  try {
    assert.equal(checkModuleGraph(dir)[0]?.reason, "reference-directive");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("real pnh/core passes", () => {
  const coreDir = join(import.meta.dirname, "..", "core");
  assert.deepEqual(checkModuleGraph(coreDir), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test pnh/tests/module-graph.test.ts`
Expected: FAIL — cannot find module `../scripts/check-module-graph.ts`.

- [ ] **Step 3: Write the implementation**

Create `pnh/scripts/check-module-graph.ts`:

```ts
// PNH boundary mechanism 1: resolved module-graph closure. This checker uses
// NodeNext resolution and realpaths; it is not a lexical expression denylist.
import ts from "typescript";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface GraphViolation {
  file: string;
  specifier: string;
  reason:
    | "external-specifier"
    | "escapes-core"
    | "dynamic-import"
    | "require-call"
    | "unresolved"
    | "unsupported-file"
    | "symlink"
    | "reference-directive";
}

function scanCoreTree(
  dir: string,
  files: string[],
  violations: GraphViolation[],
): void {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = lstatSync(p);
    if (stat.isSymbolicLink()) {
      violations.push({ file: p, specifier: p, reason: "symlink" });
    } else if (stat.isDirectory()) {
      scanCoreTree(p, files, violations);
    } else if (!stat.isFile() || !p.endsWith(".ts") || p.endsWith(".d.ts")) {
      violations.push({ file: p, specifier: p, reason: "unsupported-file" });
    } else {
      files.push(realpathSync.native(p));
    }
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function checkModuleGraph(coreDir: string): GraphViolation[] {
  const requestedRoot = resolve(coreDir);
  const root = realpathSync.native(requestedRoot);
  const violations: GraphViolation[] = [];
  const files: string[] = [];
  if (lstatSync(requestedRoot).isSymbolicLink()) {
    return [{ file: requestedRoot, specifier: requestedRoot, reason: "symlink" }];
  }
  scanCoreTree(root, files, violations);
  const fileSet = new Set(files);
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    noEmit: true,
  };

  for (const file of files) {
    const src = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );

    const addSpecifier = (specifier: string): void => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        violations.push({ file, specifier, reason: "external-specifier" });
        return;
      }
      if (!specifier.endsWith(".ts") || specifier.endsWith(".d.ts")) {
        violations.push({ file, specifier, reason: "unsupported-file" });
        return;
      }
      const lexicalTarget = resolve(dirname(file), specifier);
      if (!isInside(root, lexicalTarget)) {
        violations.push({ file, specifier, reason: "escapes-core" });
        return;
      }
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        compilerOptions,
        ts.sys,
      ).resolvedModule;
      if (resolved === undefined) {
        violations.push({ file, specifier, reason: "unresolved" });
        return;
      }
      let target: string;
      try {
        target = realpathSync.native(resolved.resolvedFileName);
      } catch {
        violations.push({ file, specifier, reason: "unresolved" });
        return;
      }
      if (!isInside(root, target)) {
        violations.push({ file, specifier, reason: "escapes-core" });
        return;
      }
      if (!fileSet.has(target)) {
        violations.push({ file, specifier, reason: "unsupported-file" });
      }
    };

    for (const ref of [
      ...src.referencedFiles,
      ...src.typeReferenceDirectives,
      ...src.libReferenceDirectives,
    ]) {
      violations.push({
        file,
        specifier: ref.fileName,
        reason: "reference-directive",
      });
    }

    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        addSpecifier(node.moduleSpecifier.text);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        addSpecifier(node.moduleReference.expression.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        violations.push({
          file,
          specifier: node.getText(src),
          reason: "dynamic-import",
        });
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        violations.push({
          file,
          specifier: node.getText(src),
          reason: "require-call",
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return violations;
}

// CLI: exit 1 on any violation.
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const coreDir = process.argv[2] ?? join(import.meta.dirname, "..", "core");
  const violations = checkModuleGraph(coreDir);
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.reason}: ${v.specifier} in ${v.file}`);
    }
    process.exit(1);
  }
  console.log(`module-graph closure ok: ${coreDir}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/module-graph.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Wire into scripts**

In `package.json`, add:

```json
"check:pnh-graph": "npx tsx pnh/scripts/check-module-graph.ts pnh/core"
```

and change `test:pnh` to:

```json
"test:pnh": "npm run typecheck:pnh && npm run check:pnh-graph && npx tsx --test pnh/tests/*.test.ts"
```

Run: `npm run test:pnh`
Expected: `module-graph closure ok`, then all tests pass.

- [x] **Step 6: Commit**

```bash
git add pnh/scripts/check-module-graph.ts pnh/tests/module-graph.test.ts package.json
git commit -m "feat(pnh): fail-closed module-graph closure checker"
```

### Task 3: Docker-sandboxed core loader harness

**Authoritative design:**
`2026-08-19-task3-core-scoped-loader-design.md` and
`2026-08-19-task3-os-sandbox-design.md`. The historical SES draft immediately
below is retained as evidence for the failed route and must not be executed.

**Files:**
- Create: `pnh/harness/sandbox/Containerfile`
- Create: `pnh/harness/sandbox/image.lock.json`
- Create: `pnh/harness/sandbox/container-entrypoint.mjs`
- Create: `pnh/harness/sandbox/core-loader-preload.mjs`
- Create: `pnh/harness/sandbox/core-policy.mjs`
- Create: `pnh/harness/sandbox/core-transform.mjs`
- Create: `pnh/harness/sandbox-worker.mjs`
- Create: `pnh/harness/sandbox.ts`
- Create: `pnh/harness/run-sandbox.mjs`
- Create: `pnh/tests/sandbox-boundary.test.ts`
- Modify: `pnh/tests/*.test.ts` (replace direct runtime core imports with JSON
  `sandboxCall()` requests)
- Modify: `package.json` (add the container-owned PNH test command and pin c8)

**Interface:** `sandboxCall(request)` validates a JSON-safe entry, export,
arguments, and optional locally-created `sha256` port at a declared argument
index. Its small declarative fixture format materializes null-prototype,
inherited, accessor, and non-enumerable records in the worker so validation can
be tested without crossing a host object. It sends the request over the
container-private supervisor socket. The supervisor starts a fresh
Docker-contained worker, gives it the validated manifest over private file
descriptor 3, and returns the worker's JSON-safe output. Tests never receive a
core module object, function, proxy, host object, manifest path, or manifest
environment value.

**Gate status:** the five-part disposable preflight passed on 2026-08-19
(`reviews/2026-08-19-task3-core-loader-preflight.md`). It proved both the
Docker boundary and original-TypeScript c8 attribution. Task 3 implementation
was subsequently authorized and verified with the real core graph: 16 PNH
tests passed, and container-owned c8 reported 100% statements, branches,
functions, and lines for `timestamp.ts`. Do not use a global monkeypatch, raw
text injection, host execution, SES, or `node:vm`.

- [x] **Step 1: Build the manifest-owned container runner**

Pin the Node `22.21.0` index digest in `image.lock.json`. The image installs
the committed dependency lockfile as non-root and copies only trusted runner
files, not repository source. At run time it mounts only the realpath-checked
`pnh/` subtree read-only and starts Docker with the documented no-network,
read-only-root, no-capabilities, no-new-privileges, 128-PID, 256-MiB policy.

The entrypoint re-runs the Task 2 graph checker in the container and writes the
resolved graph manifest to a temporary bootstrap path. It reads and deletes
that file before tests start, then sends the manifest once to the separate
supervisor over file descriptor 3. The supervisor retains it only in memory
and gives each new worker a copy over that worker's private descriptor 3. No
test or worker receives a shared manifest path or environment value.

- [x] **Step 2: Implement the core-only synchronous loader**

Use `module.registerHooks({ resolve, load })` in the `--import` preload. The
resolver allows only manifest-recorded entries and literal core edges. The load
hook reads, hashes, parses, and compiles only manifest-listed core `.ts` files.
It adds synthetic lexical denial bindings through a TypeScript AST transformer
and returns inline maps to original source. It delegates all non-core loading
unchanged. The exact denied names, source-map handling, and fallback condition
are specified in the authoritative loader design.

- [x] **Step 3: Implement the JSON worker boundary**

The supervisor starts every call with
`--disallow-code-generation-from-strings`, the loader preload, and a private
manifest descriptor. The `.mjs` worker dynamically imports a manifest-listed
entry only after the hook registers, creates the optional SHA-256 port locally,
emits one JSON result, and exits. It never performs a static core import or
accepts a function/object capability from its parent.

- [x] **Step 4: Prove the disposable acceptance gate (disposable fixture only)**

Run the approved preflight before retrofitting any real core test. It must
prove: Node and test globals still work; all core-only ambient and dynamic-load
denials fail; manifest and source-digest changes fail; fresh worker identity
holds; the local fixture protocol never crosses a host object; the Docker
outer boundary holds; and c8 attributes nonzero execution to the loaded
original `.ts` file while `--100` fails for an unexecuted branch and unloaded
file. Save the evidence in `docs/plans/provider-neutral-harness/reviews/`.

- [x] **Step 5: Retrofit core tests and enable the standard command**

Replace every runtime core import with `sandboxCall()`. A test may compute an
expected value locally, but all core execution, including hostile SHA-256
callback probes, happens in a fresh worker. Set `test:pnh` to typecheck, check
the graph, and invoke `run-sandbox.mjs`; c8 runs only inside the constrained
container with `--temp-directory /tmp/coverage`, `--all --100`, and
`--src /sandbox/pnh/core`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json pnh/harness pnh/tests/sandbox-boundary.test.ts
git commit -m "feat(pnh): Docker-scoped core loader harness"
```

### Historical Task 3: SES locked-realm draft (superseded; do not execute)

**Files:**
- Create: `pnh/harness/lockdown-preload.mjs`
- Create: `pnh/harness/locked-realm.ts`
- Create: `pnh/tests/locked-realm.test.ts`
- Modify: `pnh/tests/timestamp.test.ts` (run parsing under the realm)
- Modify: `package.json` (pin SES/Endo development dependencies; add realm runner)

**Interfaces:**
- Produces: `lockedCoreModule<T>(entry: string): Promise<T>` — bundles the Task 2-approved static `.ts` core graph with `@endo/bundle-source`, then evaluates it in a fresh SES Compartment with no Node endowments. `lockedProbe<T>(source: string): T` executes a single probe in a separately fresh, equivalently endowed Compartment. Every runtime core load uses `lockedCoreModule`; ordinary host `import()` of core is forbidden. `lockedRealm(fn)` remains a compatibility wrapper for host-side assertion sequencing only; it performs no confinement and is never evidence for C19.

**Stop condition:** This task is a security and coverage acceptance gate, not a best-effort migration. Do not continue to Tasks 4–8 unless every Step 5 probe passes under the pinned packages. If it fails, retain the failing output, mark this plan blocked, and request approval for the OS-sandboxed subprocess/container design. Do not substitute `node:vm`, a host import, an ignore pragma, or a lexical-only check.

- [ ] **Step 1: Pin dependencies and create the preload-first realm runner**

Run:

```bash
npm install --save-dev --save-exact ses@2.3.0 @endo/bundle-source@4.3.2 @endo/import-bundle@1.7.0 c8@12.0.0
```

Create `pnh/harness/lockdown-preload.mjs`:

```js
// This file is the first project code executed in every realm-test process.
import "ses";

lockdown();
```

Add this exact script to `package.json`:

```json
"test:pnh-realm": "node --import ./pnh/harness/lockdown-preload.mjs --import tsx --test",
"test:pnh": "npm run typecheck:pnh && npm run check:pnh-graph && npm run test:pnh-realm -- pnh/tests/*.test.ts"
```

Expected: `lockdown()` runs before `tsx`, test modules, or harness code. The Node runtime and this minimal preload are trusted computing base; guest core code is not.

- [ ] **Step 2: Write the failing SES acceptance probes**

Create `pnh/tests/locked-realm.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockedCoreModule, lockedProbe, LOCKED_GLOBALS } from "../harness/locked-realm.ts";

test("forbidden ambient globals and evaluators throw inside the compartment", async () => {
  assert.throws(() => lockedProbe("Date.now()"), /locked realm/);
  assert.throws(() => lockedProbe("Math.random()"), /locked realm/);
  assert.throws(() => lockedProbe("globalThis.crypto.randomUUID()"), /locked realm/);
  assert.throws(() => lockedProbe("fetch('x')"), /locked realm/);
  assert.throws(() => lockedProbe("process.env"), /locked realm/);
  assert.throws(() => lockedProbe("performance.now()"), /locked realm/);
  assert.throws(() => lockedProbe("Intl.DateTimeFormat().resolvedOptions().timeZone"), /locked realm/);
  assert.throws(() => lockedProbe("new WebSocket('x')"), /locked realm/);
  assert.throws(() => lockedProbe("navigator.userAgent"), /locked realm/);
  assert.throws(() => lockedProbe("new WeakRef({})"), /locked realm/);
  assert.throws(() => lockedProbe("new FinalizationRegistry(() => {})"), /locked realm/);
  assert.throws(() => lockedProbe("new SharedArrayBuffer(1)"), /locked realm/);
  assert.throws(() => lockedProbe("Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)"), /locked realm/);
  assert.throws(() => lockedProbe("setImmediate(() => {})"), /locked realm/);
  assert.throws(() => lockedProbe("queueMicrotask(() => {})"), /locked realm/);
  assert.throws(() => lockedProbe("setTimeout(() => {}, 1)"), /locked realm/);
  assert.throws(() => lockedProbe("setInterval(() => {}, 1)"), /locked realm/);
  assert.throws(() => lockedProbe("console.log('x')"), /locked realm/);
  assert.throws(() => lockedProbe("eval('1')"), /locked realm/);
  assert.throws(() => lockedProbe("Function('return import(\\\"node:fs\\\")')"), /locked realm|import/);
  await assert.rejects(() => Promise.resolve().then(() => lockedProbe("import('node:fs')")), /dynamic import|locked realm/);
  assert.throws(() => lockedProbe("globalThis['pro' + 'cess']['e' + 'nv']"), /locked realm/);
  assert.throws(() => lockedProbe("const captured = Date; captured.now()"), /locked realm/);
});

test("function constructors and host capabilities cannot reveal the host realm", async () => {
  assert.throws(
    () => lockedProbe("(function () {}).constructor('return process')()"),
    /locked realm|ReferenceError|TypeError/,
  );
  assert.throws(
    () => lockedProbe("sha256.constructor('return process')()", { sha256: (input) => input }),
    /locked realm|ReferenceError|TypeError/,
  );
});

test("host plain and null-prototype records retain the compartment's safe intrinsic identity", () => {
  const plain = { value: 1 };
  const nullRecord = Object.create(null) as Record<string, unknown>;
  nullRecord.value = 1;
  assert.equal(lockedProbe("Object.getPrototypeOf(record) === Object.prototype", { record: plain }), true);
  assert.equal(lockedProbe("Object.getPrototypeOf(record) === null", { record: nullRecord }), true);
});

test("deterministic code runs and fresh compartments do not share module identity", async () => {
  const result = lockedProbe("2 + 2");
  assert.equal(result, 4);
  const a = await lockedCoreModule<typeof import("../core/timestamp.ts")>("../core/timestamp.ts");
  const b = await lockedCoreModule<typeof import("../core/timestamp.ts")>("../core/timestamp.ts");
  assert.notEqual(a.parseUtcMs, b.parseUtcMs);
});

test("core modules load only from the checked graph", async () => {
  const { parseUtcMs } = await lockedCoreModule<typeof import("../core/timestamp.ts")>("../core/timestamp.ts");
  const ms = parseUtcMs("1970-01-02T00:00:00.000Z");
  assert.equal(ms, 86_400_000);
});

test("stub list is explicit", () => {
  assert.deepEqual(
    [...LOCKED_GLOBALS].sort(),
    ["Date", "Math.random", "crypto", "fetch", "process", "performance", "Intl", "WebSocket", "navigator", "WeakRef", "FinalizationRegistry", "SharedArrayBuffer", "Atomics", "setImmediate", "queueMicrotask", "eval", "Function", "setInterval", "setTimeout", "console"].sort(),
  );
});
```

- [ ] **Step 3: Confirm the probe fails before the harness exists**

Run:

```bash
npm run test:pnh-realm -- pnh/tests/locked-realm.test.ts
```

Expected: FAIL — cannot find module `../harness/locked-realm.ts`.

- [ ] **Step 4: Write the SES bundle harness**

Create `pnh/harness/locked-realm.ts`:

```ts
// PNH boundary mechanism 2: SES Compartment. The preload has already called
// lockdown() in this process. This harness is trusted code; bundled core code
// receives no Node authority and cannot use a constructor to regain its host.
import bundleSource from "@endo/bundle-source";
import { importBundle } from "@endo/import-bundle";
import { computeSourceMapLocation } from "@endo/import-bundle/source-map-node.js";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const LOCKED_GLOBALS = [
  "Date", "Math.random", "crypto", "fetch", "process", "performance", "Intl",
  "WebSocket", "navigator", "WeakRef", "FinalizationRegistry", "SharedArrayBuffer", "Atomics",
  "setImmediate", "queueMicrotask", "eval", "Function", "setTimeout", "setInterval", "console",
] as const;

type CoreExports = Record<string, unknown>;
type Sha256Hex = (utf8: string) => string;
declare const harden: <T>(value: T) => T;
declare const Compartment: new (options: {
  globals: Record<string, unknown>;
  __options__: true;
}) => { evaluate(source: string): unknown };

function deny(name: string): never {
  throw new Error(`locked realm: ambient '${name}' is forbidden in PNH core`);
}

function throwingProxy(name: string): object {
  return harden(new Proxy(function () {}, {
    apply: () => deny(name),
    construct: () => deny(name),
    get: () => deny(name),
    set: () => deny(name),
    has: () => deny(name),
  }));
}

function lockedEndowments(): Record<string, unknown> {
  const fail = (name: string): (() => never) => harden(() => deny(name));
  const math = Object.create(Math) as Math;
  Object.defineProperty(math, "random", { value: fail("Math.random") });
  return harden({
    Date: throwingProxy("Date"), crypto: throwingProxy("crypto"), fetch: fail("fetch"),
    process: throwingProxy("process"), performance: throwingProxy("performance"), Intl: throwingProxy("Intl"),
    WebSocket: throwingProxy("WebSocket"), navigator: throwingProxy("navigator"), WeakRef: throwingProxy("WeakRef"),
    FinalizationRegistry: throwingProxy("FinalizationRegistry"), SharedArrayBuffer: throwingProxy("SharedArrayBuffer"),
    Atomics: throwingProxy("Atomics"), setImmediate: fail("setImmediate"), queueMicrotask: fail("queueMicrotask"),
    eval: fail("eval"), Function: fail("Function"), setTimeout: fail("setTimeout"), setInterval: fail("setInterval"),
    console: throwingProxy("console"), Math: harden(math),
  });
}

function inside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export async function lockedCoreModule<T = CoreExports>(entry: string): Promise<T> {
  const root = realpathSync.native(resolve(import.meta.dirname, "..", "core"));
  const file = realpathSync.native(resolve(import.meta.dirname, entry));
  if (!inside(root, file) || !file.endsWith(".ts") || file.endsWith(".d.ts")) {
    throw new Error("core module escapes boundary");
  }
  const bundle = await bundleSource(file, { format: "endoZipBase64", cacheSourceMaps: true });
  const namespace = await importBundle(
    bundle,
    { endowments: lockedEndowments(), filePrefix: root },
    { computeSourceMapLocation },
  );
  return Object.fromEntries(Object.entries(namespace)) as T;
}

export function lockedProbe<T>(
  source: string,
  bridges: { sha256?: Sha256Hex; record?: object } = {},
): T {
  const compartment = new Compartment({
    globals: harden({
      ...lockedEndowments(),
      ...(bridges.sha256 === undefined ? {} : { sha256: harden(bridges.sha256) }),
      ...(bridges.record === undefined ? {} : { record: harden(bridges.record) }),
    }),
    __options__: true,
  });
  return compartment.evaluate(source) as T;
}

// Compatibility only: this sequences trusted host assertions. Core calls must
// still originate from lockedCoreModule and are compartment functions.
export async function lockedRealm<T>(fn: () => Promise<T> | T): Promise<T> {
  return await fn();
}
```

- [ ] **Step 5: Run and prove the acceptance gate**

Run:

```bash
npm run test:pnh-realm -- pnh/tests/locked-realm.test.ts
```

Expected: all probes pass. Before crediting the task, run the c8 command from Task 8 against a two-file temporary core fixture: execute one branch in the imported file and leave the other file unimported. Its text output must name the original `.ts` files and fail on the unexecuted branch and file. This is the proof that the SES bundle's source maps work with c8; saving source-map data without proving the report is insufficient.

- [ ] **Step 6: Retrofit every core test**

In `pnh/tests/timestamp.test.ts`, replace the static core import and load each runtime module with `lockedCoreModule`. Existing `lockedRealm` wrappers may remain for host-side assertion grouping only; they are not a security boundary. Compute host expectations before obtaining the compartment module. Example shape (apply to all timestamp tests):

```ts
test("parses reference dates to exact epoch ms", async () => {
  const cases: Array<[string, number]> = [
    ["1970-01-01T00:00:00.000Z", Date.UTC(1970, 0, 1, 0, 0, 0, 0)],
    ["2026-08-19T12:34:56.789Z", Date.UTC(2026, 7, 19, 12, 34, 56, 789)],
    ["2000-02-29T23:59:59.999Z", Date.UTC(2000, 1, 29, 23, 59, 59, 999)],
    ["2024-02-29T00:00:00.000Z", Date.UTC(2024, 1, 29, 0, 0, 0, 0)],
    ["1999-12-31T23:59:59.000Z", Date.UTC(1999, 11, 31, 23, 59, 59, 0)],
    ["2038-01-19T03:14:07.000Z", Date.UTC(2038, 0, 19, 3, 14, 7, 0)],
    ["2100-01-01T00:00:00.000Z", Date.UTC(2100, 0, 1, 0, 0, 0, 0)],
    ["1970-03-01T00:00:00.000Z", Date.UTC(1970, 2, 1, 0, 0, 0, 0)],
  ];
  const { parseUtcMs } = await lockedCoreModule<typeof import("../core/timestamp.ts")>("../core/timestamp.ts");
  for (const [s, expected] of cases) {
    assert.equal(parseUtcMs(s), expected, s);
  }
});
```

The rejects test likewise obtains `parseUtcMs` through `lockedCoreModule`; the regex test obtains `TIMESTAMP_RE` through that loader. Apply the same helper to every `core()` helper in Tasks 4, 6, and 7, and add an explicit hostile-callback constructor-escape test wherever `Sha256Hex` crosses into core. No runtime `import("../core/*.ts")` remains in test code.

- [ ] **Step 7: Run the realm suite**

Run: `npm run test:pnh`
Expected: all existing core runtime calls pass through a fresh SES Compartment under the preload-first runner. This command is not yet the c8 gate; Task 8 adds it after the preflight proves mapping.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json pnh/harness/lockdown-preload.mjs pnh/harness/locked-realm.ts pnh/tests/locked-realm.test.ts pnh/tests/timestamp.test.ts
git commit -m "feat(pnh): SES locked-realm determinism harness"
```

<!-- model: opus -->

### Task 4: Capability grant — types, canonical bytes, validation

**Files:**
- Create: `pnh/core/grant.ts`
- Create: `pnh/tests/grant.test.ts`

**Interfaces:**
- Consumes: `parseUtcMs` from `pnh/core/timestamp.ts` (Task 1).
- Produces:
  - `type Sha256Hex = (utf8: string) => string` (injected hashing; core never touches crypto)
  - `interface CapabilityGrant { programId: string; taskId: string; attempt: number; audience: string; inputDigest: string; operation: string; maxModelCalls: number; maxInputTokens: number; maxOutputTokens: number; issuedAt: string; expiresAt: string; nonce: string }`
  - `interface GrantClaim { key: string; digest: string }`
  - `canonicalGrantBytes(g: CapabilityGrant): string`
  - `interface GrantValidationPolicy { maxTtlMs: number; maxClockSkewMs: number }`
  - `validateGrantPolicy(value: unknown): GrantValidationPolicy | null`
  - `validateGrant(value: unknown, nowMs: number, policy: unknown, hash: Sha256Hex): { ok: true; grant: CapabilityGrant; claim: GrantClaim } | { ok: false; code: GrantRejectCode }`
  - `GrantRejectCode = "shape" | "unknown-key" | "slug" | "digest-format" | "nonce-format" | "timestamp" | "expiry-order" | "ttl-exceeded" | "expired" | "clock-skew" | "clock-input" | "policy" | "limit-range" | "hash-output"`
  - Constants `SLUG_RE`, `NONCE_RE`, `DIGEST_RE`
- Tasks 5–7 import these exact names from `"./grant.ts"`.

- [ ] **Step 1: Write the failing test**

Create `pnh/tests/grant.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lockedCoreModule, lockedRealm } from "../harness/locked-realm.ts";

// Injected hash lives OUTSIDE the realm/core, like a real adapter would.
const sha256: (s: string) => string = (s) =>
  createHash("sha256").update(s, "utf8").digest("hex");

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0, 0); // clock read outside core
const POLICY = { maxTtlMs: 360_000, maxClockSkewMs: 30_000 };

function goodGrant() {
  return {
    programId: "pnh-demo",
    taskId: "task-1",
    attempt: 1,
    audience: "broker-a",
    inputDigest: "a".repeat(64),
    operation: "invoke-model",
    maxModelCalls: 2,
    maxInputTokens: 10_000,
    maxOutputTokens: 2_000,
    issuedAt: "2026-08-19T11:59:30.000Z",
    expiresAt: "2026-08-19T12:04:00.000Z",
    nonce: "A".repeat(22),
  };
}

async function core() {
  return lockedCoreModule<typeof import("../core/grant.ts")>("../core/grant.ts");
}

test("valid grant validates and yields a stable claim", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    const r = validateGrant(goodGrant(), NOW, POLICY, sha256);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.claim.key, "broker-a/pnh-demo/task-1/1");
      assert.match(r.claim.digest, /^[0-9a-f]{64}$/);
    }
  });
});

test("canonical bytes are injective across field moves", async () => {
  await lockedRealm(async () => {
    const { canonicalGrantBytes, validateGrant } = await core();
    const a = goodGrant();
    const b = { ...goodGrant(), programId: "pnh-demo-x", taskId: "1" };
    const ra = validateGrant(a, NOW, POLICY, sha256);
    const rb = validateGrant(b, NOW, POLICY, sha256);
    assert.equal(ra.ok && rb.ok, true);
    assert.notEqual(canonicalGrantBytes(a), canonicalGrantBytes(b));
    // fixed arity: bytes parse as a 13-element JSON array (version tag + 12 fields)
    const arr = JSON.parse(canonicalGrantBytes(a)) as unknown[];
    assert.equal(arr.length, 13);
    assert.equal(arr[0], "pnh-grant-v1");
  });
});

test("every reject code fires on its exact cause", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    const cases: Array<[unknown, string, number]> = [
      [null, "shape", NOW],
      [{ ...goodGrant(), extra: 1 }, "unknown-key", NOW],
      [{ ...goodGrant(), programId: "Bad_Slug" }, "slug", NOW],
      [{ ...goodGrant(), inputDigest: "z".repeat(64) }, "digest-format", NOW],
      [{ ...goodGrant(), nonce: "short" }, "nonce-format", NOW],
      [{ ...goodGrant(), issuedAt: "2026-08-19 11:59:30.000Z" }, "timestamp", NOW],
      [{ ...goodGrant(), expiresAt: "2026-08-19T11:00:00.000Z" }, "expiry-order", NOW],
      [
        {
          ...goodGrant(),
          issuedAt: "2026-08-19T11:00:00.000Z",
          expiresAt: "2026-08-19T12:04:00.000Z",
        },
        "ttl-exceeded",
        NOW,
      ],
      [goodGrant(), "expired", Date.UTC(2026, 7, 19, 12, 30, 0, 0)],
      [goodGrant(), "clock-skew", Date.UTC(2026, 7, 19, 11, 0, 0, 0)],
      [{ ...goodGrant(), maxModelCalls: 0 }, "limit-range", NOW],
      [{ ...goodGrant(), attempt: 1.5 }, "limit-range", NOW],
    ];
    for (const [value, code, now] of cases) {
      const r = validateGrant(value, now, POLICY, sha256);
      assert.equal(r.ok, false, code);
      if (!r.ok) assert.equal(r.code, code);
    }
  });
});

test("bad injected hash output is rejected", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    const r = validateGrant(goodGrant(), NOW, POLICY, () => "not-hex");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "hash-output");
  });
});

test("expiry boundary: now === expiresAt is expired", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    const r = validateGrant(goodGrant(), Date.UTC(2026, 7, 19, 12, 4, 0, 0), POLICY, sha256);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "expired");
  });
});

test("invalid injected clocks fail closed", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      const r = validateGrant(goodGrant(), now, POLICY, sha256);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, "clock-input");
    }
  });
});

test("policy is an exact finite-integer own-data record", async () => {
  await lockedRealm(async () => {
    const { validateGrant, validateGrantPolicy } = await core();
    const nullPolicy = Object.create(null) as Record<string, unknown>;
    nullPolicy.maxTtlMs = 1;
    nullPolicy.maxClockSkewMs = 0;
    assert.deepEqual(validateGrantPolicy(nullPolicy), { maxTtlMs: 1, maxClockSkewMs: 0 });
    const badPolicies: unknown[] = [
      null,
      { maxTtlMs: Number.NaN, maxClockSkewMs: 0 },
      { maxTtlMs: Number.POSITIVE_INFINITY, maxClockSkewMs: 0 },
      { maxTtlMs: -1, maxClockSkewMs: 0 },
      { maxTtlMs: 1.5, maxClockSkewMs: 0 },
      { maxTtlMs: 1, maxClockSkewMs: -1 },
      { maxTtlMs: 1, maxClockSkewMs: 0, extra: true },
      Object.create({ maxTtlMs: 1, maxClockSkewMs: 0 }),
    ];
    const accessor = { maxClockSkewMs: 0 } as Record<string, unknown>;
    Object.defineProperty(accessor, "maxTtlMs", { get: () => 1, enumerable: true });
    badPolicies.push(accessor);
    for (const policy of badPolicies) {
      assert.equal(validateGrantPolicy(policy), null);
      const r = validateGrant(goodGrant(), NOW, policy, sha256);
      assert.equal(!r.ok && r.code, "policy");
    }
  });
});

test("prototype and non-enumerable fields are rejected", async () => {
  await lockedRealm(async () => {
    const { validateGrant } = await core();
    const inherited = Object.create(goodGrant()) as object;
    const extra = { ...goodGrant() } as Record<string, unknown>;
    Object.defineProperty(extra, "hidden", { value: 1, enumerable: false });
    assert.equal(validateGrant(inherited, NOW, POLICY, sha256).ok, false);
    assert.equal(validateGrant(extra, NOW, POLICY, sha256).ok, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pnh-realm -- pnh/tests/grant.test.ts`
Expected: FAIL — cannot find module `../core/grant.ts`.

- [ ] **Step 3: Write the implementation**

Create `pnh/core/grant.ts`:

```ts
// PNH capability grant core. Pure: clock, policy, and hash are injected.
// Fixed-arity canonical bytes, pinned timestamps with integer math, exact
// plain-record validation, and neutral vocabulary are enforced here.
import { parseUtcMs } from "./timestamp.ts";

export type Sha256Hex = (utf8: string) => string;

export interface GrantValidationPolicy {
  maxTtlMs: number;
  maxClockSkewMs: number;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const DIGEST_RE = /^[0-9a-f]{64}$/;

export interface CapabilityGrant {
  programId: string;
  taskId: string;
  attempt: number;
  audience: string;
  inputDigest: string;
  operation: string;
  maxModelCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface GrantClaim {
  key: string;
  digest: string;
}

export type GrantRejectCode =
  | "shape"
  | "unknown-key"
  | "slug"
  | "digest-format"
  | "nonce-format"
  | "timestamp"
  | "expiry-order"
  | "ttl-exceeded"
  | "expired"
  | "clock-skew"
  | "clock-input"
  | "policy"
  | "limit-range"
  | "hash-output";

const GRANT_KEYS = [
  "programId",
  "taskId",
  "attempt",
  "audience",
  "inputDigest",
  "operation",
  "maxModelCalls",
  "maxInputTokens",
  "maxOutputTokens",
  "issuedAt",
  "expiresAt",
  "nonce",
] as const;

const POLICY_KEYS = ["maxTtlMs", "maxClockSkewMs"] as const;

export function canonicalGrantBytes(g: CapabilityGrant): string {
  // Fixed arity (13), fixed order, version-tagged. Slugs cannot contain
  // JSON-significant characters and integers are safe ints, so no two
  // distinct valid grants share bytes.
  return JSON.stringify([
    "pnh-grant-v1",
    g.programId,
    g.taskId,
    g.attempt,
    g.audience,
    g.inputDigest,
    g.operation,
    g.maxModelCalls,
    g.maxInputTokens,
    g.maxOutputTokens,
    g.issuedAt,
    g.expiresAt,
    g.nonce,
  ]);
}

type Ok = { ok: true; grant: CapabilityGrant; claim: GrantClaim };
type Fail = { ok: false; code: GrantRejectCode };

function positiveSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

export function validateGrantPolicy(value: unknown): GrantValidationPolicy | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(rec);
  if (Reflect.ownKeys(rec).some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  if (keys.some((key) => !(POLICY_KEYS as readonly string[]).includes(key))) return null;
  for (const key of POLICY_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return null;
  }
  if (!positiveSafeInt(rec.maxTtlMs)) return null;
  if (typeof rec.maxClockSkewMs !== "number" || !Number.isSafeInteger(rec.maxClockSkewMs) || rec.maxClockSkewMs < 0) {
    return null;
  }
  return { maxTtlMs: rec.maxTtlMs, maxClockSkewMs: rec.maxClockSkewMs };
}

export function validateGrant(
  value: unknown,
  nowMs: number,
  policyValue: unknown,
  hash: Sha256Hex,
): Ok | Fail {
  const policy = validateGrantPolicy(policyValue);
  if (policy === null) return { ok: false, code: "policy" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "shape" };
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) {
    return { ok: false, code: "shape" };
  }
  if (Reflect.ownKeys(rec).some((k) => typeof k !== "string" || !keys.includes(k))) {
    return { ok: false, code: "unknown-key" };
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      return { ok: false, code: "shape" };
    }
  }
  for (const k of keys) {
    if (!(GRANT_KEYS as readonly string[]).includes(k)) {
      return { ok: false, code: "unknown-key" };
    }
  }
  for (const k of GRANT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return { ok: false, code: "shape" };
  }
  const {
    programId, taskId, attempt, audience, inputDigest, operation,
    maxModelCalls, maxInputTokens, maxOutputTokens, issuedAt, expiresAt, nonce,
  } = rec;

  for (const s of [programId, taskId, audience, operation]) {
    if (typeof s !== "string" || !SLUG_RE.test(s)) {
      return { ok: false, code: "slug" };
    }
  }
  if (typeof inputDigest !== "string" || !DIGEST_RE.test(inputDigest)) {
    return { ok: false, code: "digest-format" };
  }
  if (typeof nonce !== "string" || !NONCE_RE.test(nonce)) {
    return { ok: false, code: "nonce-format" };
  }
  if (
    !positiveSafeInt(attempt) ||
    !positiveSafeInt(maxModelCalls) ||
    !positiveSafeInt(maxInputTokens) ||
    !positiveSafeInt(maxOutputTokens)
  ) {
    return { ok: false, code: "limit-range" };
  }
  if (typeof issuedAt !== "string" || typeof expiresAt !== "string") {
    return { ok: false, code: "timestamp" };
  }
  const issuedMs = parseUtcMs(issuedAt);
  const expiresMs = parseUtcMs(expiresAt);
  if (issuedMs === null || expiresMs === null) {
    return { ok: false, code: "timestamp" };
  }
  if (expiresMs <= issuedMs) return { ok: false, code: "expiry-order" };
  if (!Number.isSafeInteger(nowMs)) return { ok: false, code: "clock-input" };
  if (expiresMs - issuedMs > policy.maxTtlMs) {
    return { ok: false, code: "ttl-exceeded" };
  }
  if (nowMs >= expiresMs) return { ok: false, code: "expired" };
  if (nowMs + policy.maxClockSkewMs < issuedMs) {
    return { ok: false, code: "clock-skew" };
  }

  const grant: CapabilityGrant = {
    programId: programId as string,
    taskId: taskId as string,
    attempt: attempt as number,
    audience: audience as string,
    inputDigest: inputDigest as string,
    operation: operation as string,
    maxModelCalls: maxModelCalls as number,
    maxInputTokens: maxInputTokens as number,
    maxOutputTokens: maxOutputTokens as number,
    issuedAt: issuedAt as string,
    expiresAt: expiresAt as string,
    nonce: nonce as string,
  };
  const digest = hash(canonicalGrantBytes(grant));
  if (!DIGEST_RE.test(digest)) return { ok: false, code: "hash-output" };
  // Slugs cannot contain '/', so this join is injective.
  const key = `${grant.audience}/${grant.programId}/${grant.taskId}/${grant.attempt}`;
  return { ok: true, grant, claim: { key, digest } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pnh`
Expected: all tests pass, graph check still clean (grant.ts imports only `./timestamp.ts`).

- [ ] **Step 5: Commit**

```bash
git add pnh/core/grant.ts pnh/tests/grant.test.ts
git commit -m "feat(pnh): pure capability grant validation with canonical bytes"
```

### Task 5: Consume decision port + at-most-once conformance

**Files:**
- Create: `pnh/core/consume.ts`
- Create: `pnh/adapters/memory-ledger.ts`
- Create: `pnh/tests/consume.test.ts`

**Interfaces:**
- Consumes: `GrantClaim` from `pnh/core/grant.ts` (Task 4).
- Produces:
  - `type ConsumeDecision = "committed" | "replayed" | "conflict"` (core)
  - `interface ReplayLedger { consume(claim: GrantClaim): Promise<ConsumeDecision> }` (core)
  - `class MemoryReplayLedger implements ReplayLedger` (adapter, test-only)
- The broker receipt check in Task 7 does not consume these; they are the seam a real durable ledger adapter implements in a later plan.

- [ ] **Step 1: Write the failing test**

Create `pnh/tests/consume.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryReplayLedger } from "../adapters/memory-ledger.ts";

const claim = (key: string, digest: string) => ({ key, digest });
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);

test("first consume commits; identical retry is 'replayed', never 'committed'", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  // T22 regression: a second holder (or delivery retry) of the SAME grant
  // must not be told it committed — 'replayed' means "a write exists,
  // it was not mine."
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "replayed");
});

test("same attempt key with a different digest is 'conflict'", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  assert.equal(await ledger.consume(claim("a/p/t/1", D2)), "conflict");
});

test("different attempts are independent", async () => {
  const ledger = new MemoryReplayLedger();
  assert.equal(await ledger.consume(claim("a/p/t/1", D1)), "committed");
  assert.equal(await ledger.consume(claim("a/p/t/2", D1)), "committed");
});

test("two instances sharing a store: exactly one commits", async () => {
  const store = new Map<string, string>();
  const a = new MemoryReplayLedger(store);
  const b = new MemoryReplayLedger(store);
  const ra = await a.consume(claim("a/p/t/1", D1));
  const rb = await b.consume(claim("a/p/t/1", D1));
  assert.deepEqual([ra, rb].sort(), ["committed", "replayed"]);
});

test("injected store failure throws — fail closed, no re-present rule", async () => {
  const failing = new MemoryReplayLedger(new Map(), () => {
    throw new Error("store unavailable");
  });
  await assert.rejects(failing.consume(claim("a/p/t/1", D1)), /store unavailable/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test pnh/tests/consume.test.ts`
Expected: FAIL — cannot find module `../adapters/memory-ledger.ts`.

- [ ] **Step 3: Write the core port**

Create `pnh/core/consume.ts`:

```ts
// PNH at-most-once consume port. Distinct from replay protection: 'committed'
// means THIS call inserted the row. A caller may proceed to execution only on
// 'committed'. 'replayed' means a write exists but was not this call's —
// under DSH finding ADV3-C2/T22 semantics the caller must NOT execute.
// 'conflict' means the same attempt key exists with a different grant digest
// (grant re-issue/broadening) — never execute, surface to the operator.
// Implementations MUST throw on any ambiguous storage failure (fail closed);
// there is no rule that re-presents an ambiguous outcome as success.
import type { GrantClaim } from "./grant.ts";

export type ConsumeDecision = "committed" | "replayed" | "conflict";

export interface ReplayLedger {
  consume(claim: GrantClaim): Promise<ConsumeDecision>;
}
```

- [ ] **Step 4: Write the adapter test double**

Create `pnh/adapters/memory-ledger.ts`:

```ts
// In-memory ReplayLedger for tests and local development ONLY. It is
// NON-CONFORMING for production use: it provides no durability, so a process
// restart forgets consumed grants. A durable CAS-backed adapter is a later
// plan's deliverable. This file is an adapter, not core — Node APIs allowed.
import type { GrantClaim } from "../core/grant.ts";
import type { ConsumeDecision, ReplayLedger } from "../core/consume.ts";

export class MemoryReplayLedger implements ReplayLedger {
  constructor(
    private readonly store: Map<string, string> = new Map(),
    private readonly beforeWrite: () => void = () => {},
  ) {}

  consume(claim: GrantClaim): Promise<ConsumeDecision> {
    this.beforeWrite();
    const existing = this.store.get(claim.key);
    if (existing === undefined) {
      // Single-threaded Map insert models an atomic compare-and-set.
      this.store.set(claim.key, claim.digest);
      return Promise.resolve("committed");
    }
    return Promise.resolve(existing === claim.digest ? "replayed" : "conflict");
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:pnh`
Expected: all pass; graph check clean (`consume.ts` imports only `./grant.ts`).

- [ ] **Step 6: Commit**

```bash
git add pnh/core/consume.ts pnh/adapters/memory-ledger.ts pnh/tests/consume.test.ts
git commit -m "feat(pnh): at-most-once consume port with T22 conformance tests"
```

<!-- model: sonnet -->

### Task 6: Evidence hash chain

**Files:**
- Create: `pnh/core/evidence.ts`
- Create: `pnh/tests/evidence.test.ts`

**Interfaces:**
- Consumes: `Sha256Hex`, `DIGEST_RE` from `pnh/core/grant.ts`.
- Produces:
  - `interface EvidenceRecord { seq: number; prevHash: string; payload: string; hash: string }`
  - `GENESIS_HASH = "0".repeat(64)`
  - `appendRecord(chain: readonly EvidenceRecord[], payload: string, hash: Sha256Hex): EvidenceRecord`
  - `interface EvidenceCheckpoint { length: number; finalHash: string }`
  - `verifyChain(chain: readonly EvidenceRecord[], checkpoint: EvidenceCheckpoint, hash: Sha256Hex): { ok: true } | { ok: false; seq: number; reason: "length" | "head" | "seq" | "link" | "hash" | "digest" }`

- [ ] **Step 1: Write the failing test**

Create `pnh/tests/evidence.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lockedCoreModule, lockedRealm } from "../harness/locked-realm.ts";

const sha256 = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

async function core() {
  return lockedCoreModule<typeof import("../core/evidence.ts")>("../core/evidence.ts");
}

function checkpoint(chain: readonly { hash: string }[]) {
  return { length: chain.length, finalHash: chain.at(-1)?.hash ?? "0".repeat(64) };
}

test("append builds a verifiable chain", async () => {
  await lockedRealm(async () => {
    const { appendRecord, verifyChain } = await core();
    const chain: ReturnType<typeof appendRecord>[] = [];
    chain.push(appendRecord(chain, "event-one", sha256));
    chain.push(appendRecord(chain, "event-two", sha256));
    chain.push(appendRecord(chain, "event-three", sha256));
    assert.deepEqual(verifyChain(chain, checkpoint(chain), sha256), { ok: true });
    assert.deepEqual(chain.map((r) => r.seq), [0, 1, 2]);
  });
});

test("tampered payload is detected at the exact record", async () => {
  await lockedRealm(async () => {
    const { appendRecord, verifyChain } = await core();
    const chain: ReturnType<typeof appendRecord>[] = [];
    chain.push(appendRecord(chain, "event-one", sha256));
    chain.push(appendRecord(chain, "event-two", sha256));
    const tampered = [chain[0]!, { ...chain[1]!, payload: "event-2" }];
    const r = verifyChain(tampered, checkpoint(chain), sha256);
    assert.deepEqual(r, { ok: false, seq: 1, reason: "hash" });
  });
});

test("re-linked record (hash recomputed over wrong prev) is detected", async () => {
  await lockedRealm(async () => {
    const { appendRecord, verifyChain, GENESIS_HASH } = await core();
    const chain: ReturnType<typeof appendRecord>[] = [];
    chain.push(appendRecord(chain, "event-one", sha256));
    chain.push(appendRecord(chain, "event-two", sha256));
    // Recompute record 1 as if it followed genesis: consistent hash, wrong link.
    const forged = {
      seq: 1,
      prevHash: GENESIS_HASH,
      payload: "event-two",
      hash: sha256(`1\n${GENESIS_HASH}\nevent-two`),
    };
    const r = verifyChain([chain[0]!, forged], checkpoint(chain), sha256);
    assert.deepEqual(r, { ok: false, seq: 1, reason: "link" });
  });
});

test("gapped or reordered seq is detected", async () => {
  await lockedRealm(async () => {
    const { appendRecord, verifyChain } = await core();
    const chain: ReturnType<typeof appendRecord>[] = [];
    chain.push(appendRecord(chain, "event-one", sha256));
    chain.push(appendRecord(chain, "event-two", sha256));
    const gapped = [chain[0]!, { ...chain[1]!, seq: 2 }];
    const r = verifyChain(gapped, checkpoint(chain), sha256);
    assert.deepEqual(r, { ok: false, seq: 2, reason: "seq" });
  });
});

test("empty chain verifies", async () => {
  await lockedRealm(async () => {
    const { verifyChain } = await core();
    assert.deepEqual(verifyChain([], { length: 0, finalHash: "0".repeat(64) }, sha256), { ok: true });
  });
});

test("append rejects a malformed prior tail instead of extending it", async () => {
  await lockedRealm(async () => {
    const { appendRecord, GENESIS_HASH } = await core();
    const malformed = [{ seq: 0, prevHash: GENESIS_HASH, payload: "old", hash: "not-a-digest" }];
    assert.throws(() => appendRecord(malformed, "next", sha256), /chain-tail/);
  });
});

test("tail truncation and full-history replacement fail against the checkpoint", async () => {
  await lockedRealm(async () => {
    const { appendRecord, verifyChain } = await core();
    const chain: ReturnType<typeof appendRecord>[] = [];
    chain.push(appendRecord(chain, "event-one", sha256));
    chain.push(appendRecord(chain, "event-two", sha256));
    const cp = checkpoint(chain);
    assert.deepEqual(verifyChain(chain.slice(0, 1), cp, sha256), { ok: false, seq: 1, reason: "length" });
    const replacement: ReturnType<typeof appendRecord>[] = [];
    replacement.push(appendRecord(replacement, "forged-one", sha256));
    replacement.push(appendRecord(replacement, "forged-two", sha256));
    assert.deepEqual(verifyChain(replacement, cp, sha256), { ok: false, seq: 1, reason: "head" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pnh-realm -- pnh/tests/evidence.test.ts`
Expected: FAIL — cannot find module `../core/evidence.ts`.

- [ ] **Step 3: Write the implementation**

Create `pnh/core/evidence.ts`:

```ts
// PNH evidence hash chain. Pure: hashing is injected. The trusted checkpoint
// binds the chain head and length; internal links alone are not an evidence
// retention or append-only store.
import { DIGEST_RE, type Sha256Hex } from "./grant.ts";

export const GENESIS_HASH = "0".repeat(64);

export interface EvidenceRecord {
  seq: number;
  prevHash: string;
  payload: string;
  hash: string;
}

export interface EvidenceCheckpoint {
  length: number;
  finalHash: string;
}

function recordHash(seq: number, prevHash: string, payload: string, hash: Sha256Hex): string {
  const digest = hash(`${seq}\n${prevHash}\n${payload}`);
  if (!DIGEST_RE.test(digest)) throw new Error("hash-output");
  return digest;
}

export function appendRecord(
  chain: readonly EvidenceRecord[],
  payload: string,
  hash: Sha256Hex,
): EvidenceRecord {
  const seq = chain.length;
  const last = chain[chain.length - 1];
  if (
    last !== undefined &&
    (!Number.isSafeInteger(last.seq) || last.seq !== seq - 1 || !DIGEST_RE.test(last.hash))
  ) {
    throw new Error("chain-tail");
  }
  const prevHash = last === undefined ? GENESIS_HASH : last.hash;
  return { seq, prevHash, payload, hash: recordHash(seq, prevHash, payload, hash) };
}

export function verifyChain(
  chain: readonly EvidenceRecord[],
  checkpoint: EvidenceCheckpoint,
  hash: Sha256Hex,
): { ok: true } | { ok: false; seq: number; reason: "length" | "head" | "seq" | "link" | "hash" | "digest" } {
  if (chain.length !== checkpoint.length) return { ok: false, seq: chain.length, reason: "length" };
  if (!DIGEST_RE.test(checkpoint.finalHash)) return { ok: false, seq: chain.length, reason: "digest" };
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i] as EvidenceRecord;
    if (!DIGEST_RE.test(rec.prevHash) || !DIGEST_RE.test(rec.hash)) {
      return { ok: false, seq: rec.seq, reason: "digest" };
    }
    if (rec.seq !== i) return { ok: false, seq: rec.seq, reason: "seq" };
    const expectedPrev = i === 0 ? GENESIS_HASH : (chain[i - 1] as EvidenceRecord).hash;
    if (rec.prevHash !== expectedPrev) return { ok: false, seq: rec.seq, reason: "link" };
    if (rec.hash !== recordHash(rec.seq, rec.prevHash, rec.payload, hash)) {
      return { ok: false, seq: rec.seq, reason: "hash" };
    }
  }
  const actualHead = chain.at(-1)?.hash ?? GENESIS_HASH;
  if (actualHead !== checkpoint.finalHash) return { ok: false, seq: Math.max(0, chain.length - 1), reason: "head" };
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pnh`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add pnh/core/evidence.ts pnh/tests/evidence.test.ts
git commit -m "feat(pnh): tamper-evident evidence hash chain"
```

### Task 7: Broker protocol types + receipt check

**Files:**
- Create: `pnh/core/broker.ts`
- Create: `pnh/tests/broker.test.ts`

**Interfaces:**
- Consumes: `DIGEST_RE`, `SLUG_RE` from `pnh/core/grant.ts`.
- Produces:
  - `interface BrokerRequest { grantDigest: string; routeClass: string; providerId: string; modelId: string; inputDigest: string }`
  - `interface BrokerTelemetry { inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null; durationMs: number | null }` — unsupported fields are explicit `null`, never inferred
  - `interface BrokerReceipt { grantDigest: string; requestedRouteClass: string; observedRouteClass: string; requestedProviderId: string; observedProviderId: string; requestedModelId: string; observedModelId: string; inputDigest: string; resultDigest: string; telemetry: BrokerTelemetry }`
  - `checkReceipt(request: BrokerRequest, receipt: unknown): { ok: true; receipt: BrokerReceipt } | { ok: false; code: ReceiptRejectCode }`
  - `ReceiptRejectCode = "shape" | "unknown-key" | "grant-mismatch" | "route-drift" | "provider-drift" | "model-drift" | "input-mismatch" | "digest-format" | "telemetry"`
- Neutral vocabulary: `routeClass`, `providerId`, and `modelId` are slugs; fixtures use synthetic values such as `class-a`, `class-b`, and `class-provider` only.

- [ ] **Step 1: Write the failing test**

Create `pnh/tests/broker.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockedCoreModule, lockedRealm } from "../harness/locked-realm.ts";

const G = "a".repeat(64);
const I = "b".repeat(64);
const R = "c".repeat(64);

const request = { grantDigest: G, routeClass: "class-a", providerId: "class-provider", modelId: "class-model", inputDigest: I };

function goodReceipt() {
  return {
    grantDigest: G,
    requestedRouteClass: "class-a",
    observedRouteClass: "class-a",
    requestedProviderId: "class-provider",
    observedProviderId: "class-provider",
    requestedModelId: "class-model",
    observedModelId: "class-model",
    inputDigest: I,
    resultDigest: R,
    telemetry: { inputTokens: 100, outputTokens: 20, cachedTokens: null, durationMs: 1500 },
  };
}

async function core() {
  return lockedCoreModule<typeof import("../core/broker.ts")>("../core/broker.ts");
}

test("exact receipt passes", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const r = checkReceipt(request, goodReceipt());
    assert.equal(r.ok, true);
  });
});

test("route drift is rejected — no alias, no fallback", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const drifted = { ...goodReceipt(), observedRouteClass: "class-b" };
    const r = checkReceipt(request, drifted);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "route-drift");
  });
});

test("grant and input mismatches are rejected", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const wrongGrant = { ...goodReceipt(), grantDigest: "d".repeat(64) };
    const wrongInput = { ...goodReceipt(), inputDigest: "e".repeat(64) };
    const r1 = checkReceipt(request, wrongGrant);
    const r2 = checkReceipt(request, wrongInput);
    assert.equal(!r1.ok && r1.code, "grant-mismatch");
    assert.equal(!r2.ok && r2.code, "input-mismatch");
  });
});

test("provider and model drift are rejected", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const provider = { ...goodReceipt(), observedProviderId: "class-other" };
    const model = { ...goodReceipt(), observedModelId: "class-other" };
    const rp = checkReceipt(request, provider);
    const rm = checkReceipt(request, model);
    assert.equal(!rp.ok && rp.code, "provider-drift");
    assert.equal(!rm.ok && rm.code, "model-drift");
  });
});

test("telemetry must be number-or-null, never inferred strings", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const bad = {
      ...goodReceipt(),
      telemetry: { inputTokens: "100", outputTokens: 20, cachedTokens: null, durationMs: 1 },
    };
    const r = checkReceipt(request, bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "telemetry");
  });
});

test("telemetry counts are integers; durations are finite nonnegative milliseconds", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const negative = { ...goodReceipt(), telemetry: { inputTokens: -1, outputTokens: 1, cachedTokens: null, durationMs: 1 } };
    const fractional = { ...goodReceipt(), telemetry: { inputTokens: 1.5, outputTokens: 1, cachedTokens: null, durationMs: 1 } };
    const badDuration = { ...goodReceipt(), telemetry: { inputTokens: 1, outputTokens: 1, cachedTokens: null, durationMs: Number.NaN } };
    assert.equal(checkReceipt(request, negative).ok, false);
    assert.equal(checkReceipt(request, fractional).ok, false);
    assert.equal(checkReceipt(request, badDuration).ok, false);
  });
});

test("unknown keys and malformed digests are rejected", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const extra = { ...goodReceipt(), vendor: "x" };
    const badDigest = { ...goodReceipt(), resultDigest: "nope" };
    const r1 = checkReceipt(request, extra);
    const r2 = checkReceipt(request, badDigest);
    assert.equal(!r1.ok && r1.code, "unknown-key");
    assert.equal(!r2.ok && r2.code, "digest-format");
  });
});

test("prototype, accessor, and post-validation mutation cannot bypass the schema", async () => {
  await lockedRealm(async () => {
    const { checkReceipt } = await core();
    const inherited = Object.create(goodReceipt()) as object;
    assert.equal(checkReceipt(request, inherited).ok, false);
    const accessor = goodReceipt() as Record<string, unknown>;
    Object.defineProperty(accessor, "resultDigest", { get: () => R, enumerable: true });
    assert.equal(checkReceipt(request, accessor).ok, false);
    const input = goodReceipt();
    const result = checkReceipt(request, input);
    assert.equal(result.ok, true);
    input.resultDigest = "d".repeat(64);
    if (result.ok) assert.equal(result.receipt.resultDigest, R);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pnh-realm -- pnh/tests/broker.test.ts`
Expected: FAIL — cannot find module `../core/broker.ts`.

- [ ] **Step 3: Write the implementation**

Create `pnh/core/broker.ts`:

```ts
// PNH broker protocol core. The broker owns credentials and transports outside
// core. Core validates exact synthetic route/provider/model identity, digests,
// telemetry, and returns a normalized copy of the receipt.
import { DIGEST_RE, SLUG_RE } from "./grant.ts";

export interface BrokerRequest {
  grantDigest: string;
  routeClass: string;
  providerId: string;
  modelId: string;
  inputDigest: string;
}

export interface BrokerTelemetry {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  durationMs: number | null;
}

export interface BrokerReceipt {
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

export type ReceiptRejectCode =
  | "shape"
  | "unknown-key"
  | "grant-mismatch"
  | "route-drift"
  | "provider-drift"
  | "model-drift"
  | "input-mismatch"
  | "digest-format"
  | "telemetry";

const RECEIPT_KEYS = [
  "grantDigest",
  "requestedRouteClass",
  "observedRouteClass",
  "requestedProviderId",
  "observedProviderId",
  "requestedModelId",
  "observedModelId",
  "inputDigest",
  "resultDigest",
  "telemetry",
] as const;

const TELEMETRY_KEYS = [
  "inputTokens",
  "outputTokens",
  "cachedTokens",
  "durationMs",
] as const;

function countOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
}

function durationOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(rec);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(rec);
  if (Reflect.ownKeys(rec).some((k) => typeof k !== "string" || !keys.includes(k))) return null;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(rec, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return null;
  }
  return rec;
}

export function checkReceipt(
  request: BrokerRequest,
  value: unknown,
): { ok: true; receipt: BrokerReceipt } | { ok: false; code: ReceiptRejectCode } {
  const rec = plainRecord(value);
  if (rec === null) {
    return { ok: false, code: "shape" };
  }
  for (const k of Object.keys(rec)) {
    if (!(RECEIPT_KEYS as readonly string[]).includes(k)) {
      return { ok: false, code: "unknown-key" };
    }
  }
  for (const k of RECEIPT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return { ok: false, code: "shape" };
  }
  const t = rec["telemetry"];
  const trec = plainRecord(t);
  if (trec === null) {
    return { ok: false, code: "telemetry" };
  }
  for (const k of Object.keys(trec)) {
    if (!(TELEMETRY_KEYS as readonly string[]).includes(k)) {
      return { ok: false, code: "telemetry" };
    }
  }
  for (const k of TELEMETRY_KEYS) {
    const valid = k === "durationMs" ? durationOrNull(trec[k]) : countOrNull(trec[k]);
    if (!Object.prototype.hasOwnProperty.call(trec, k) || !valid) {
      return { ok: false, code: "telemetry" };
    }
  }
  for (const k of ["grantDigest", "inputDigest", "resultDigest"] as const) {
    if (typeof rec[k] !== "string" || !DIGEST_RE.test(rec[k] as string)) {
      return { ok: false, code: "digest-format" };
    }
  }
  for (const k of [
    "requestedRouteClass", "observedRouteClass", "requestedProviderId", "observedProviderId",
    "requestedModelId", "observedModelId",
  ] as const) {
    if (typeof rec[k] !== "string" || !SLUG_RE.test(rec[k] as string)) {
      return { ok: false, code: "shape" };
    }
  }
  if (rec["grantDigest"] !== request.grantDigest) {
    return { ok: false, code: "grant-mismatch" };
  }
  if (
    rec["requestedRouteClass"] !== request.routeClass ||
    rec["observedRouteClass"] !== request.routeClass
  ) {
    return { ok: false, code: "route-drift" };
  }
  if (rec["requestedProviderId"] !== request.providerId || rec["observedProviderId"] !== request.providerId) {
    return { ok: false, code: "provider-drift" };
  }
  if (rec["requestedModelId"] !== request.modelId || rec["observedModelId"] !== request.modelId) {
    return { ok: false, code: "model-drift" };
  }
  if (rec["inputDigest"] !== request.inputDigest) {
    return { ok: false, code: "input-mismatch" };
  }
  return {
    ok: true,
    receipt: {
      grantDigest: rec.grantDigest as string,
      requestedRouteClass: rec.requestedRouteClass as string,
      observedRouteClass: rec.observedRouteClass as string,
      requestedProviderId: rec.requestedProviderId as string,
      observedProviderId: rec.observedProviderId as string,
      requestedModelId: rec.requestedModelId as string,
      observedModelId: rec.observedModelId as string,
      inputDigest: rec.inputDigest as string,
      resultDigest: rec.resultDigest as string,
      telemetry: {
        inputTokens: trec.inputTokens as number | null,
        outputTokens: trec.outputTokens as number | null,
        cachedTokens: trec.cachedTokens as number | null,
        durationMs: trec.durationMs as number | null,
      },
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pnh`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add pnh/core/broker.ts pnh/tests/broker.test.ts
git commit -m "feat(pnh): broker protocol contracts with exact-identity receipt check"
```

### Task 8: Coverage gate + pipeline wiring

**Files:**
- Modify: `package.json` (finalize the c8-backed `test:pnh`; c8 is already pinned by Task 3's acceptance preflight)
- Create: `pnh/README.md`
- Create: `.github/workflows/pnh.yml`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run test:pnh` = typecheck + graph check + tests under 100% statement/function/branch coverage of every `pnh/core/**/*.ts`. This is the local half of C19; `.github/workflows/pnh.yml` runs the same command on every push and pull request.

- [ ] **Step 1: Wire the coverage gate**

In `package.json`, change `test:pnh` to:

```json
"test:pnh": "npm run typecheck:pnh && npm run check:pnh-graph && node pnh/harness/run-sandbox.mjs"
```

- [ ] **Step 2: Run and close coverage gaps**

Run: `npm run test:pnh`
Expected: either PASS at 100/100/100, or the container-owned c8 reports uncovered files/lines/branches in the original `pnh/core/**/*.ts` source paths. If c8 reports generated paths, missing maps, a non-TypeScript location, or zero execution for a loaded core file, stop: the Docker-loader acceptance gate has failed and this plan must not claim C19. For each legitimate uncovered item, add a test through `sandboxCall()`. Do NOT add ignore pragmas — an uncovered branch is a missing test, not an annotation site. Repeat until the gate passes. If c8 reports a type-only module at 0%, add a tested runtime protocol version export to that module; never exclude the file.

- [ ] **Step 3: Verify the gate actually fails closed**

Temporarily add an unreachable branch to `pnh/core/timestamp.ts` and a new unimported executable file `pnh/core/coverage-probe.ts`, run `npm run test:pnh`, and confirm the command FAILS for both the branch and the unimported file. Remove both, run again, and confirm PASS. This proves `--all` rejects unexecuted code that the graph checker does not import.

- [ ] **Step 4: Write `pnh/README.md`**

```markdown
# PNH — provider-neutral harness (kernel plan 1)

Private incubation of the narrow security kernel selected by
`docs/plans/provider-neutral-harness/architecture.md` and the OpenHands
intake. Not published; publication requires the architecture doc's
open-source boundary work and separate approval.

## Layout

- `core/` — pure contracts and validation. No ambient nondeterminism, no
  imports outside `core/`. Enforced, not promised (see below).
- `harness/` — Docker launcher, parent resolved-URL guard, in-memory supervisor, manifest-scoped loader transform, and JSON worker test harness.
- `scripts/` — module-graph closure checker (tooling).
- `adapters/` — test doubles; `MemoryReplayLedger` is non-conforming for
  production (no durability).
- `tests/` — all tests; core code runs in fresh Docker-contained workers.

## Enforcement (C19 mechanisms)

`npm run test:pnh` runs, in order: `tsc` strict typecheck; the realpath-aware
NodeNext module-graph closure checker; parent tests under a resolved-URL core
guard; the core suite through an in-memory supervisor and fresh
Docker-contained workers that receive the manifest over private descriptors;
and container-owned `c8 --all --100` over every `core/**/*.ts` file so no
unimported body escapes execution. The bootstrap manifest is deleted before
tests start, and dynamic code generation is unavailable in workers.

The lexical class of checking is deliberately absent: it was demonstrated
fail-open (DSH Rounds 2–3, threat-model Section 12 on branch
`x1/dsh-extraction-readiness-plan`).
```

- [ ] **Step 5: Add the continuous CI gate**

Create `.github/workflows/pnh.yml`:

```yaml
name: provider-neutral-harness

on:
  push:
  pull_request:

jobs:
  pnh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.21.0
          cache: npm
      - run: npm ci
      - run: npm run test:pnh
```

- [ ] **Step 6: Full verification**

Run: `npm run test:pnh && npm run test:x1`
Expected: both green — `test:x1` proves the new tsconfig/scripts did not disturb the existing suite.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json pnh/README.md pnh/core pnh/tests .github/workflows/pnh.yml
git commit -m "feat(pnh): 100% coverage gate completes C19 enforcement pipeline"
```

---

## Out of scope for Plan 1 (later plans)

- Grant proofs/signatures and key pinning (Plan 2, with the durable ledger adapter).
- The runtime task loop, plugin SDK/kernel, and future program-level supervisor. The container-local sandbox test supervisor implemented by Task 3 is in scope and complete.
- Live brokers (DeepSeek first, via the OpenAI-compatible + no-in-process-key shape from the intake) — requires the durable ledger.
- Live CI/deployment credentials and provider adapters remain out of scope; `.github/workflows/pnh.yml` is limited to the local kernel gate and uses no secrets.
- Any publication, packaging, or `packages/` path.
