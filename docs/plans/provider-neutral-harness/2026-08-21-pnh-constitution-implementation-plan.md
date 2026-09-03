# PNH Constitution + Invariant Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical normative reference for PNH: a machine-readable invariant registry, a baseline lock, a generator-backed constitution document, and a `test:constitution` conformance gate that computes coverage instead of asserting it.

**Architecture:** A YAML registry (`pnh/contracts/invariants.yaml`) is the single source of truth; a committed `invariants.lock` pins binding-field hashes so any change of law without an amendment is a red build. A generator injects invariant statements and the conformance chapter into `constitution.md` between markers; a gate test enforces schema/semantic validity, baseline diffs, executed test coverage (via a `conformsTo` runtime registration helper), orphan/drift rules, and per-wire-boundary protocol pins with schema-source content hashes.

**Tech Stack:** TypeScript (strict, NodeNext, `.ts` imports), `node:test` run via `tsx --test`, `yaml` (already a dependency), `node:crypto` sha256. No new dependencies.

**Spec:** `docs/plans/provider-neutral-harness/2026-08-21-pnh-constitution-design.md` — read it before starting any task. The codex review at `reviews/2026-08-21-constitution-design-adversarial.codex.md` explains why each enforcement rule exists.

## Global Constraints

- No new npm dependencies; use `yaml`, `node:crypto`, `node:fs`, `node:child_process` only.
- All new TS lives under `pnh/` (covered by `tsconfig.pnh.json`, strict + `noUncheckedIndexedAccess`); imports use explicit `.ts` extensions like the rest of `pnh/`.
- Never modify `pnh/core/`, `pnh/kernel/`, `pnh/runtime/`, `pnh/harness/`, or `pnh/sdk/` — this plan touches only `pnh/contracts/` (new), `pnh/scripts/`, `pnh/tests/`, `package.json`, and docs. Existing test files may gain `conformsTo(...)` lines only (Task 9).
- Do not wire the gate into `test:pnh` — the sandbox runner auto-discovers the intentionally red M3 suite. The gate is the standalone `test:constitution` script until M3 is green.
- Registry IDs are permanent and never reused. Binding fields are `statement`, `status`, `bounds` (invariants) and `version`, `schema_hash` (protocols).
- The constitution document must contain no current-state or milestone language (design success criterion 4).
- Commit after each task with the exact single-line message given; never use heredocs for commits.
- Verification for every task: the task's named test command, plus `npm run typecheck:pnh` before each commit.

## Subagent Dispatch Models

Applies to subagent-driven execution (Agent-tool dispatches). ALWAYS pass an
explicit `model` on every dispatch — an omitted model silently inherits the
session model, and implementer/reviewer subagents must never run on fable.
The `<!-- model: -->` comments elsewhere in this plan govern INLINE execution
only (they rotate the session model via the plan-directive hook); they do not
apply to dispatches.

| Task | Implementer `model` | Reviewer `model` |
|---|---|---|
| 1–7 (machinery, TDD) | `sonnet` | `sonnet` |
| 8 (invariant harvest — judgment) | `opus` | `opus` |
| 9 (conformsTo mapping) | `sonnet` | `sonnet` |
| 10 (constitution prose — judgment) | `opus` | `opus` |
| 11 (tombstone + final verification) | `sonnet` | none — the orchestrator (session model) runs the final success-criteria judgment itself, the one allowed session-model pass |

---

## File Structure

```
pnh/contracts/                      # NEW directory — registry data + pure logic
  invariants.yaml                   # the registry (data)
  invariants.lock                   # committed baseline (generated JSON)
  registry.ts                       # load, structural + semantic validation, hashing, lock, protocol pins
  conforms-to.ts                    # runtime coverage registration helper
  coverage.ts                       # spawn conformance suites, collect registrations
pnh/scripts/
  generate-constitution.ts          # marker injection, conformance chapter, --check/--write/--update-lock
pnh/tests/
  constitution-registry.test.ts     # unit tests for registry.ts
  constitution-coverage.test.ts     # unit tests for conforms-to + coverage runner
  constitution-generator.test.ts    # unit tests for generator
  constitution-gate.test.ts         # the six-check gate (integration)
  fixtures/constitution/            # small YAML/lock/markdown fixtures for unit tests
docs/plans/provider-neutral-harness/
  constitution.md                   # the document (prose + generated blocks)
  specs/plugin-protocol.md          # protocol spec stub (version declaration + pointers)
  specs/supervisor-command-channel.md
package.json                        # + test:constitution script
docs/plans/provider-neutral-harness/architecture.md   # tombstone header only
```

`registry.ts` owns all pure logic (no process spawning); `coverage.ts` owns child-process execution; the generator owns rendering. The gate test composes them.

---

<!-- model: sonnet:high -->

### Task 1: Registry loader with structural and semantic validation

**Files:**
- Create: `pnh/contracts/registry.ts`
- Create: `pnh/tests/constitution-registry.test.ts`
- Create: `pnh/tests/fixtures/constitution/valid-registry.yaml`

**Interfaces:**
- Produces: `loadRegistry(path: string): Registry` (throws `RegistryError` with all messages joined on invalid input), `validateSemantics(registry: Registry, repoRoot: string): string[]`, types `Registry`, `Invariant`, `ProtocolPin`, `Amendment`, constants `CATEGORIES`, `INVARIANT_STATUSES`, `ID_PATTERN`.

- [ ] **Step 1: Write the failing tests**

Create `pnh/tests/fixtures/constitution/valid-registry.yaml`:

```yaml
version: 1
invariants:
  - id: PNH-INV-01
    title: Ordinary plugin faults stay inside their fault cell
    category: isolation
    statement: >
      An attributed ordinary failure of one plugin must not block, settle,
      or contaminate the work of any other plugin in the admitted set.
    status: proposed
    bounds:
      max_cross_plugin_stall_ms: 50
    conformance: []
    since: "2026-08-21"
    decisions:
      - docs/plans/provider-neutral-harness/2026-08-21-m3-plugin-isolation-architecture-options.md
protocols: []
```

Create `pnh/tests/constitution-registry.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  loadRegistry,
  validateSemantics,
  RegistryError,
  CATEGORIES,
  INVARIANT_STATUSES,
} from "../contracts/registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixture = (name: string) =>
  resolve(here, "fixtures", "constitution", name);

test("loads and validates the valid fixture", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  assert.equal(registry.version, 1);
  assert.equal(registry.invariants.length, 1);
  const inv = registry.invariants[0];
  assert.ok(inv);
  assert.equal(inv.id, "PNH-INV-01");
  assert.equal(inv.status, "proposed");
  assert.deepEqual(inv.bounds, { max_cross_plugin_stall_ms: 50 });
  assert.deepEqual(validateSemantics(registry, repoRoot), []);
});

test("rejects unknown fields", () => {
  assert.throws(
    () =>
      loadRegistry(fixture("valid-registry.yaml"), {
        overlay: { invariants: [{ id: "PNH-INV-01", surprise: true }] },
      }),
    RegistryError,
  );
});

test("rejects duplicate ids, bad id format, bad status, bad category", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const dup = {
    ...registry,
    invariants: [...registry.invariants, { ...registry.invariants[0]! }],
  };
  const errors = validateSemantics(dup, repoRoot);
  assert.ok(errors.some((e) => e.includes("duplicate id PNH-INV-01")));
});

test("rejects unresolvable decision and conformance paths", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const broken = {
    ...registry,
    invariants: [
      {
        ...registry.invariants[0]!,
        decisions: ["docs/does-not-exist.md"],
        conformance: ["pnh/tests/does-not-exist.test.ts"],
      },
    ],
  };
  const errors = validateSemantics(broken, repoRoot);
  assert.ok(errors.some((e) => e.includes("docs/does-not-exist.md")));
  assert.ok(errors.some((e) => e.includes("pnh/tests/does-not-exist.test.ts")));
});

test("category and status vocabularies are closed", () => {
  assert.ok(CATEGORIES.includes("isolation"));
  assert.deepEqual(INVARIANT_STATUSES, ["proposed", "active", "retired"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: FAIL — `Cannot find module '../contracts/registry.ts'`

- [ ] **Step 3: Implement `pnh/contracts/registry.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export const ID_PATTERN = /^PNH-(INV|PROTO)-\d{2,}$/u;
export const INVARIANT_STATUSES = ["proposed", "active", "retired"] as const;
export const CATEGORIES = [
  "doctrine",
  "authority",
  "task",
  "plugin",
  "bridge",
  "isolation",
  "lifecycle",
  "broker",
  "evidence",
  "resource",
  "gate",
  "extraction",
] as const;

export type InvariantStatus = (typeof INVARIANT_STATUSES)[number];
export type Category = (typeof CATEGORIES)[number];

export interface Amendment {
  readonly date: string;
  readonly decision: string;
}

export interface Invariant {
  readonly id: string;
  readonly title: string;
  readonly category: Category;
  readonly statement: string;
  readonly status: InvariantStatus;
  readonly bounds?: Readonly<Record<string, number>>;
  readonly conformance: readonly string[];
  readonly since: string;
  readonly decisions: readonly string[];
  readonly amendments?: readonly Amendment[];
}

export interface ProtocolPin {
  readonly id: string;
  readonly name: string;
  readonly spec: string;
  readonly version: number;
  readonly schema_source: readonly string[];
  readonly schema_hash: string;
  readonly conformance: readonly string[];
  readonly amendments?: readonly Amendment[];
}

export interface Registry {
  readonly version: 1;
  readonly invariants: readonly Invariant[];
  readonly protocols: readonly ProtocolPin[];
}

export class RegistryError extends Error {
  constructor(messages: readonly string[]) {
    super(`invalid registry:\n- ${messages.join("\n- ")}`);
    this.name = "RegistryError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const INVARIANT_FIELDS = new Set([
  "id", "title", "category", "statement", "status",
  "bounds", "conformance", "since", "decisions", "amendments",
]);
const PROTOCOL_FIELDS = new Set([
  "id", "name", "spec", "version", "schema_source",
  "schema_hash", "conformance", "amendments",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function checkAmendments(value: unknown, where: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${where}: amendments must be a list`);
    return;
  }
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.date !== "string" ||
        typeof entry.decision !== "string" || !DATE_PATTERN.test(entry.date)) {
      errors.push(`${where}: malformed amendment entry`);
    }
  }
}

function validateStructure(doc: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(doc)) return ["registry root must be a mapping"];
  if (doc.version !== 1) errors.push("version must be 1");
  for (const [listName, fields] of [
    ["invariants", INVARIANT_FIELDS],
    ["protocols", PROTOCOL_FIELDS],
  ] as const) {
    const list = doc[listName];
    if (!Array.isArray(list)) {
      errors.push(`${listName} must be a list`);
      continue;
    }
    list.forEach((entry, index) => {
      const where = `${listName}[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${where}: must be a mapping`);
        return;
      }
      for (const key of Object.keys(entry)) {
        if (!fields.has(key)) errors.push(`${where}: unknown field ${key}`);
      }
      if (typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
        errors.push(`${where}: id must match ${String(ID_PATTERN)}`);
      }
      if (!isStringArray(entry.conformance)) {
        errors.push(`${where}: conformance must be a string list`);
      }
      checkAmendments(entry.amendments, where, errors);
      if (listName === "invariants") {
        if (typeof entry.title !== "string" || entry.title.length === 0) {
          errors.push(`${where}: title required`);
        }
        if (typeof entry.statement !== "string" || entry.statement.trim().length === 0) {
          errors.push(`${where}: statement required`);
        }
        if (!CATEGORIES.includes(entry.category as Category)) {
          errors.push(`${where}: category must be one of ${CATEGORIES.join(", ")}`);
        }
        if (!INVARIANT_STATUSES.includes(entry.status as InvariantStatus)) {
          errors.push(`${where}: status must be one of ${INVARIANT_STATUSES.join(", ")}`);
        }
        if (typeof entry.since !== "string" || !DATE_PATTERN.test(entry.since)) {
          errors.push(`${where}: since must be YYYY-MM-DD`);
        }
        if (!isStringArray(entry.decisions) || entry.decisions.length === 0) {
          errors.push(`${where}: decisions must be a non-empty string list`);
        }
        if (entry.bounds !== undefined) {
          if (!isRecord(entry.bounds) ||
              !Object.values(entry.bounds).every((v) => typeof v === "number")) {
            errors.push(`${where}: bounds must map names to numbers`);
          }
        }
      } else {
        if (typeof entry.name !== "string" || entry.name.length === 0) {
          errors.push(`${where}: name required`);
        }
        if (typeof entry.spec !== "string") errors.push(`${where}: spec required`);
        if (typeof entry.version !== "number" || !Number.isInteger(entry.version) || entry.version < 1) {
          errors.push(`${where}: version must be a positive integer`);
        }
        if (!isStringArray(entry.schema_source) || entry.schema_source.length === 0) {
          errors.push(`${where}: schema_source must be a non-empty string list`);
        }
        if (typeof entry.schema_hash !== "string" || !entry.schema_hash.startsWith("sha256:")) {
          errors.push(`${where}: schema_hash must start with sha256:`);
        }
      }
    });
  }
  return errors;
}

export interface LoadOptions {
  /** test-only: shallow-merge extra fields into parsed doc before validation */
  readonly overlay?: Record<string, unknown>;
}

export function loadRegistry(path: string, options: LoadOptions = {}): Registry {
  const parsed: unknown = parse(readFileSync(path, "utf8"));
  const doc = options.overlay && isRecord(parsed)
    ? { ...parsed, ...options.overlay }
    : parsed;
  const errors = validateStructure(doc);
  if (errors.length > 0) throw new RegistryError(errors);
  return doc as unknown as Registry;
}

export function validateSemantics(registry: Registry, repoRoot: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const allEntries = [...registry.invariants, ...registry.protocols];
  for (const entry of allEntries) {
    if (seen.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
    seen.add(entry.id);
  }
  const pathFields = (entry: Invariant | ProtocolPin): string[] => {
    const paths = [...entry.conformance];
    if ("decisions" in entry) paths.push(...entry.decisions);
    if ("spec" in entry) paths.push(entry.spec, ...entry.schema_source);
    for (const amendment of entry.amendments ?? []) paths.push(amendment.decision);
    return paths;
  };
  for (const entry of allEntries) {
    for (const relative of pathFields(entry)) {
      if (!existsSync(resolve(repoRoot, relative))) {
        errors.push(`${entry.id}: path does not exist: ${relative}`);
      }
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/contracts/registry.ts pnh/tests/constitution-registry.test.ts pnh/tests/fixtures/constitution/valid-registry.yaml
git commit -m "feat(pnh): add constitution registry loader with structural and semantic validation"
```

---

### Task 2: Binding-field hashing, invariants.lock, and the amendment-required baseline diff

**Files:**
- Modify: `pnh/contracts/registry.ts` (append)
- Modify: `pnh/tests/constitution-registry.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `stableStringify(value: unknown): string`, `bindingHash(entry: Invariant | ProtocolPin): string` (returns `sha256:<hex>`), `computeLock(registry: Registry): LockFile`, `diffAgainstLock(registry: Registry, lock: LockFile, repoRoot: string): string[]`, types `LockFile`, `LockEntry`. The binding hash covers `statement` + `bounds` (invariants) and `version` + `schema_hash` (protocols) — NOT status. Status is governed separately by the lock's recorded status and a transition table: `proposed→active` is free (activation adds proof, it does not change law); `proposed→retired` and `active→retired` require an amendment; identity is free; everything else is an error. Deleting a locked ID is always an error. A binding-hash change requires a non-empty `amendments` list whose LAST entry's decision file exists. A new ID not in the lock is reported as `new id <id> (run --update-lock)` — additions are visible, never silent.

- [ ] **Step 1: Write the failing tests (append to `constitution-registry.test.ts`)**

```ts
import {
  bindingHash,
  computeLock,
  diffAgainstLock,
  stableStringify,
} from "../contracts/registry.ts";

test("stableStringify is key-order independent", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
  );
});

test("bindingHash changes only when binding fields change", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const inv = registry.invariants[0]!;
  const base = bindingHash(inv);
  assert.equal(bindingHash({ ...inv, title: "renamed" }), base);
  assert.notEqual(bindingHash({ ...inv, statement: "weakened" }), base);
  assert.notEqual(
    bindingHash({ ...inv, bounds: { max_cross_plugin_stall_ms: 5000 } }),
    base,
  );
  assert.equal(
    bindingHash({ ...inv, status: "active" as const }),
    base,
    "status is transition-governed, not hash-governed",
  );
});

test("diffAgainstLock: clean lock produces no errors", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot), []);
});

test("diffAgainstLock: silent bound change is rejected, amended change passes", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  const weakened = {
    ...registry,
    invariants: [
      { ...registry.invariants[0]!, bounds: { max_cross_plugin_stall_ms: 5000 } },
    ],
  };
  const errors = diffAgainstLock(weakened, lock, repoRoot);
  assert.ok(errors.some((e) => e.includes("PNH-INV-01") && e.includes("amendment")));

  const amended = {
    ...weakened,
    invariants: [
      {
        ...weakened.invariants[0]!,
        amendments: [
          {
            date: "2026-08-21",
            decision:
              "docs/plans/provider-neutral-harness/2026-08-21-pnh-constitution-design.md",
          },
        ],
      },
    ],
  };
  const amendedErrors = diffAgainstLock(amended, lock, repoRoot).filter(
    (e) => !e.startsWith("stale lock"),
  );
  assert.deepEqual(amendedErrors, []);
});

test("diffAgainstLock: deletion and illegal transition are rejected", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  const deleted = { ...registry, invariants: [], protocols: [] };
  assert.ok(
    diffAgainstLock(deleted, lock, repoRoot).some((e) =>
      e.includes("PNH-INV-01") && e.includes("deleted"),
    ),
  );
  const activeLock = computeLock({
    ...registry,
    invariants: [{ ...registry.invariants[0]!, status: "active" as const }],
  });
  const demoted = registry; // fixture status is proposed; lock says active
  assert.ok(
    diffAgainstLock(demoted, activeLock, repoRoot).some((e) =>
      e.includes("illegal status transition"),
    ),
  );
});

test("diffAgainstLock: activation is free, retirement requires an amendment", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  const activated = {
    ...registry,
    invariants: [{ ...registry.invariants[0]!, status: "active" as const }],
  };
  assert.deepEqual(diffAgainstLock(activated, lock, repoRoot), []);
  const retired = {
    ...registry,
    invariants: [{ ...registry.invariants[0]!, status: "retired" as const }],
  };
  assert.ok(
    diffAgainstLock(retired, lock, repoRoot).some((e) =>
      e.includes("retirement") && e.includes("amendment"),
    ),
  );
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: FAIL — `bindingHash` not exported

- [ ] **Step 3: Append the implementation to `pnh/contracts/registry.ts`**

```ts
import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

function isInvariant(entry: Invariant | ProtocolPin): entry is Invariant {
  return "statement" in entry;
}

export function bindingHash(entry: Invariant | ProtocolPin): string {
  const binding = isInvariant(entry)
    ? { statement: entry.statement, bounds: entry.bounds ?? {} }
    : { version: entry.version, schema_hash: entry.schema_hash };
  return sha256(stableStringify(binding));
}

export interface LockEntry {
  readonly hash: string;
  readonly status: string;
}

export interface LockFile {
  readonly version: 1;
  readonly entries: Readonly<Record<string, LockEntry>>;
}

export function computeLock(registry: Registry): LockFile {
  const entries: Record<string, LockEntry> = {};
  for (const inv of registry.invariants) {
    entries[inv.id] = { hash: bindingHash(inv), status: inv.status };
  }
  for (const proto of registry.protocols) {
    entries[proto.id] = { hash: bindingHash(proto), status: "active" };
  }
  return { version: 1, entries };
}

const FREE_TRANSITIONS = new Set([
  "proposed->proposed", "active->active", "retired->retired",
  "proposed->active",
]);
const AMENDED_TRANSITIONS = new Set(["proposed->retired", "active->retired"]);

export function diffAgainstLock(
  registry: Registry,
  lock: LockFile,
  repoRoot: string,
): string[] {
  const errors: string[] = [];
  const current = new Map<string, Invariant | ProtocolPin>();
  for (const entry of [...registry.invariants, ...registry.protocols]) {
    current.set(entry.id, entry);
  }
  const requireAmendment = (entry: Invariant | ProtocolPin, reason: string): void => {
    const last = entry.amendments?.at(-1);
    if (last === undefined) {
      errors.push(
        `${entry.id}: ${reason} requires an amendment entry citing a decision record`,
      );
      return;
    }
    if (!existsSync(resolve(repoRoot, last.decision))) {
      errors.push(`${entry.id}: amendment decision does not exist: ${last.decision}`);
    }
  };
  for (const [id, locked] of Object.entries(lock.entries)) {
    const entry = current.get(id);
    if (entry === undefined) {
      errors.push(`${id}: deleted from registry; ids are permanent, retire instead`);
      continue;
    }
    const status = isInvariant(entry) ? entry.status : "active";
    const transition = `${locked.status}->${status}`;
    if (AMENDED_TRANSITIONS.has(transition)) {
      requireAmendment(entry, `retirement (${transition})`);
    } else if (!FREE_TRANSITIONS.has(transition)) {
      errors.push(`${id}: illegal status transition ${locked.status} -> ${status}`);
    }
    if (bindingHash(entry) !== locked.hash) {
      requireAmendment(entry, "binding-field change");
      errors.push(`stale lock: ${id} changed (run generate-constitution --update-lock)`);
    }
  }
  for (const id of current.keys()) {
    if (!(id in lock.entries)) {
      errors.push(`new id ${id} (run --update-lock)`);
    }
  }
  return errors;
}
```

Note: `diffAgainstLock` reports BOTH the amendment requirement and the stale-lock line for a changed entry; the amended-change unit test filters `stale lock` because refreshing the lock is the CLI's job (Task 5), not the diff's.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/contracts/registry.ts pnh/tests/constitution-registry.test.ts
git commit -m "feat(pnh): add binding-field hashing and amendment-required lock diff"
```

---

### Task 3: `conformsTo` helper and executed-coverage runner

**Files:**
- Create: `pnh/contracts/conforms-to.ts`
- Create: `pnh/contracts/coverage.ts`
- Create: `pnh/tests/constitution-coverage.test.ts`
- Create: `pnh/tests/fixtures/constitution/sample-conforming.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone).
- Produces: `conformsTo(id: string): void` (no-op unless `PNH_CONSTITUTION_REPORT` env var is set; then appends one JSONL line `{"id":"..."}` to that file), `runConformance(files: string[], repoRoot: string): CoverageResult` where `CoverageResult = { exitCode: number; registered: ReadonlySet<string> }`. A skipped test never calls the helper, so skip-gaming fails coverage by construction.

- [ ] **Step 1: Write the failing tests**

Create `pnh/tests/fixtures/constitution/sample-conforming.test.ts`:

```ts
import { test } from "node:test";
import { conformsTo } from "../../../contracts/conforms-to.ts";

test("PNH-INV-01 sample conformance", () => {
  conformsTo("PNH-INV-01");
});

test.skip("PNH-INV-02 skipped never registers", () => {
  conformsTo("PNH-INV-02");
});
```

Create `pnh/tests/constitution-coverage.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runConformance } from "../contracts/coverage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

test("collects registrations from executed tests only", () => {
  const result = runConformance(
    ["pnh/tests/fixtures/constitution/sample-conforming.test.ts"],
    repoRoot,
  );
  assert.equal(result.exitCode, 0);
  assert.ok(result.registered.has("PNH-INV-01"));
  assert.ok(!result.registered.has("PNH-INV-02"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test pnh/tests/constitution-coverage.test.ts`
Expected: FAIL — `Cannot find module '../contracts/coverage.ts'`

- [ ] **Step 3: Implement both modules**

`pnh/contracts/conforms-to.ts`:

```ts
import { appendFileSync } from "node:fs";

export function conformsTo(id: string): void {
  const reportPath = process.env.PNH_CONSTITUTION_REPORT;
  if (reportPath === undefined || reportPath.length === 0) return;
  appendFileSync(reportPath, `${JSON.stringify({ id })}\n`, "utf8");
}
```

`pnh/contracts/coverage.ts`:

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface CoverageResult {
  readonly exitCode: number;
  readonly registered: ReadonlySet<string>;
}

export function runConformance(files: string[], repoRoot: string): CoverageResult {
  const reportDir = mkdtempSync(join(tmpdir(), "pnh-constitution-"));
  const reportPath = join(reportDir, "report.jsonl");
  try {
    const tsx = resolve(repoRoot, "node_modules", ".bin", "tsx");
    const result = spawnSync(
      tsx,
      ["--test", ...files.map((f) => resolve(repoRoot, f))],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, PNH_CONSTITUTION_REPORT: reportPath },
      },
    );
    const registered = new Set<string>();
    let raw = "";
    try {
      raw = readFileSync(reportPath, "utf8");
    } catch {
      raw = "";
    }
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed: unknown = JSON.parse(line);
      if (
        typeof parsed === "object" && parsed !== null &&
        typeof (parsed as { id?: unknown }).id === "string"
      ) {
        registered.add((parsed as { id: string }).id);
      }
    }
    return { exitCode: result.status ?? 1, registered };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/constitution-coverage.test.ts`
Expected: PASS (1 test; the child run inside it executes 1 passed + 1 skipped)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/contracts/conforms-to.ts pnh/contracts/coverage.ts pnh/tests/constitution-coverage.test.ts pnh/tests/fixtures/constitution/sample-conforming.test.ts
git commit -m "feat(pnh): add conformsTo registration helper and executed-coverage runner"
```

---

### Task 4: Protocol pin validation (schema hash + spec version declaration)

**Files:**
- Modify: `pnh/contracts/registry.ts` (append)
- Modify: `pnh/tests/constitution-registry.test.ts` (append)
- Create: `pnh/tests/fixtures/constitution/spec-v1.md`

**Interfaces:**
- Consumes: `Registry`, `ProtocolPin` from Task 1.
- Produces: `computeSchemaHash(sources: readonly string[], repoRoot: string): string` (sha256 over each file's relative path + `\0` + contents, concatenated in list order), `validateProtocolPins(registry: Registry, repoRoot: string): string[]`. A spec file must contain a line exactly matching `Version: <n>` for the pinned version.

- [ ] **Step 1: Write the failing tests**

Create `pnh/tests/fixtures/constitution/spec-v1.md`:

```markdown
# Fixture protocol spec

Version: 1

Schema source of record: pnh/sdk/protocol.ts
```

Append to `constitution-registry.test.ts`:

```ts
import { computeSchemaHash, validateProtocolPins } from "../contracts/registry.ts";

test("protocol pin passes when hash and spec version match", () => {
  const hash = computeSchemaHash(["pnh/sdk/protocol.ts"], repoRoot);
  const registry: ReturnType<typeof loadRegistry> = {
    version: 1,
    invariants: [],
    protocols: [
      {
        id: "PNH-PROTO-01",
        name: "plugin-protocol",
        spec: "pnh/tests/fixtures/constitution/spec-v1.md",
        version: 1,
        schema_source: ["pnh/sdk/protocol.ts"],
        schema_hash: hash,
        conformance: ["pnh/tests/plugin-protocol.test.ts"],
      },
    ],
  };
  assert.deepEqual(validateProtocolPins(registry, repoRoot), []);
});

test("protocol pin fails on stale hash and on wrong spec version", () => {
  const registry: ReturnType<typeof loadRegistry> = {
    version: 1,
    invariants: [],
    protocols: [
      {
        id: "PNH-PROTO-01",
        name: "plugin-protocol",
        spec: "pnh/tests/fixtures/constitution/spec-v1.md",
        version: 2,
        schema_source: ["pnh/sdk/protocol.ts"],
        schema_hash: "sha256:0000",
        conformance: ["pnh/tests/plugin-protocol.test.ts"],
      },
    ],
  };
  const errors = validateProtocolPins(registry, repoRoot);
  assert.ok(errors.some((e) => e.includes("schema hash mismatch")));
  assert.ok(errors.some((e) => e.includes("does not declare Version: 2")));
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: FAIL — `computeSchemaHash` not exported

- [ ] **Step 3: Append to `pnh/contracts/registry.ts`**

```ts
export function computeSchemaHash(
  sources: readonly string[],
  repoRoot: string,
): string {
  const hash = createHash("sha256");
  for (const relative of sources) {
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(readFileSync(resolve(repoRoot, relative)));
  }
  return `sha256:${hash.digest("hex")}`;
}

export function validateProtocolPins(
  registry: Registry,
  repoRoot: string,
): string[] {
  const errors: string[] = [];
  for (const pin of registry.protocols) {
    const actual = computeSchemaHash(pin.schema_source, repoRoot);
    if (actual !== pin.schema_hash) {
      errors.push(
        `${pin.id}: schema hash mismatch — wire schema changed without a registry version bump`,
      );
    }
    const specPath = resolve(repoRoot, pin.spec);
    const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
    if (!spec.split("\n").some((line) => line.trim() === `Version: ${pin.version}`)) {
      errors.push(`${pin.id}: spec ${pin.spec} does not declare Version: ${pin.version}`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/constitution-registry.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/contracts/registry.ts pnh/tests/constitution-registry.test.ts pnh/tests/fixtures/constitution/spec-v1.md
git commit -m "feat(pnh): validate protocol pins with schema-source content hashes"
```

---

### Task 5: Constitution generator (marker injection, conformance chapter, CLI)

**Files:**
- Create: `pnh/scripts/generate-constitution.ts`
- Create: `pnh/tests/constitution-generator.test.ts`

**Interfaces:**
- Consumes: `Registry`, `loadRegistry`, `computeLock`, `stableStringify` from `pnh/contracts/registry.ts`.
- Produces: `injectMarkers(source: string, registry: Registry): string` and `renderConformanceChapter(registry: Registry): string` (both exported for tests). CLI behavior (executed directly): `--check` exits 1 if the committed constitution differs from regenerated output; `--write` rewrites it in place; `--update-lock` recomputes `pnh/contracts/invariants.lock` but REFUSES (exit 1, message per entry) when a changed-or-new entry lacks what `diffAgainstLock` demands (amendment with existing decision for changes; non-empty `decisions` for additions; refuses deletions always).
- Marker grammar, one pair per category plus one conformance pair:

```markdown
<!-- pnh:invariants:isolation:begin -->
<!-- pnh:invariants:isolation:end -->
<!-- pnh:conformance:begin -->
<!-- pnh:conformance:end -->
```

- Rendered invariant block format (inside category markers), one per non-retired invariant in ID order:

```markdown
**PNH-INV-01 — Ordinary plugin faults stay inside their fault cell** (active)

An attributed ordinary failure of one plugin must not block, settle,
or contaminate the work of any other plugin in the admitted set.

Bounds: `max_cross_plugin_stall_ms = 50`. Proven by: `pnh/tests/m3-plugin-fault-isolation.test.ts`.
```

- Conformance chapter: a table `| ID | Title | Status | Proven by |` over ALL entries (invariants then protocols), a protocol pin table `| ID | Name | Version | Spec | Schema hash |`, and an amendment log listing every `amendments` entry as `- <date> — <id>: <decision>` sorted by date then id.

- [ ] **Step 1: Write the failing tests**

Create `pnh/tests/constitution-generator.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "../contracts/registry.ts";
import {
  injectMarkers,
  renderConformanceChapter,
} from "../scripts/generate-constitution.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  resolve(here, "fixtures", "constitution", name);

const registry = loadRegistry(fixture("valid-registry.yaml"));

test("injectMarkers replaces category block content and preserves prose", () => {
  const source = [
    "# Constitution",
    "",
    "Narrative prose stays.",
    "",
    "<!-- pnh:invariants:isolation:begin -->",
    "stale generated content",
    "<!-- pnh:invariants:isolation:end -->",
    "",
    "<!-- pnh:conformance:begin -->",
    "<!-- pnh:conformance:end -->",
    "",
  ].join("\n");
  const output = injectMarkers(source, registry);
  assert.ok(output.includes("Narrative prose stays."));
  assert.ok(!output.includes("stale generated content"));
  assert.ok(output.includes("PNH-INV-01"));
  assert.ok(output.includes("max_cross_plugin_stall_ms = 50"));
  assert.equal(injectMarkers(output, registry), output, "idempotent");
});

test("injectMarkers fails loudly on a missing marker pair for a used category", () => {
  assert.throws(() => injectMarkers("# No markers at all", registry), /marker/u);
});

test("conformance chapter lists every id", () => {
  const chapter = renderConformanceChapter(registry);
  assert.ok(chapter.includes("PNH-INV-01"));
  assert.ok(chapter.includes("| ID |"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test pnh/tests/constitution-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `pnh/scripts/generate-constitution.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CATEGORIES,
  computeLock,
  diffAgainstLock,
  loadRegistry,
  stableStringify,
  type Category,
  type Invariant,
  type Registry,
} from "../contracts/registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const REGISTRY_PATH = resolve(repoRoot, "pnh", "contracts", "invariants.yaml");
const LOCK_PATH = resolve(repoRoot, "pnh", "contracts", "invariants.lock");
const CONSTITUTION_PATH = resolve(
  repoRoot,
  "docs", "plans", "provider-neutral-harness", "constitution.md",
);

function renderInvariant(inv: Invariant): string {
  const lines = [
    `**${inv.id} — ${inv.title}** (${inv.status})`,
    "",
    inv.statement.trim(),
    "",
  ];
  const extras: string[] = [];
  if (inv.bounds !== undefined && Object.keys(inv.bounds).length > 0) {
    const bounds = Object.entries(inv.bounds)
      .map(([k, v]) => `\`${k} = ${v}\``)
      .join(", ");
    extras.push(`Bounds: ${bounds}.`);
  }
  if (inv.conformance.length > 0) {
    extras.push(`Proven by: ${inv.conformance.map((c) => `\`${c}\``).join(", ")}.`);
  }
  if (extras.length > 0) lines.push(extras.join(" "), "");
  return lines.join("\n");
}

function renderCategory(registry: Registry, category: Category): string {
  return registry.invariants
    .filter((inv) => inv.category === category && inv.status !== "retired")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(renderInvariant)
    .join("\n");
}

export function renderConformanceChapter(registry: Registry): string {
  const rows = [
    "| ID | Title | Status | Proven by |",
    "|---|---|---|---|",
    ...registry.invariants.map(
      (inv) =>
        `| ${inv.id} | ${inv.title} | ${inv.status} | ${inv.conformance.join("<br>") || "—"} |`,
    ),
  ];
  const pins = [
    "| ID | Name | Version | Spec | Schema hash |",
    "|---|---|---|---|---|",
    ...registry.protocols.map(
      (p) => `| ${p.id} | ${p.name} | ${p.version} | ${p.spec} | \`${p.schema_hash}\` |`,
    ),
  ];
  const amendments = [...registry.invariants, ...registry.protocols]
    .flatMap((entry) =>
      (entry.amendments ?? []).map((a) => ({ id: entry.id, ...a })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((a) => `- ${a.date} — ${a.id}: ${a.decision}`);
  return [
    "### Registry",
    "",
    ...rows,
    "",
    "### Protocol pins",
    "",
    ...pins,
    "",
    "### Amendment log",
    "",
    ...(amendments.length > 0 ? amendments : ["(no amendments)"]),
    "",
  ].join("\n");
}

function replaceBlock(source: string, begin: string, end: string, body: string): string {
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`missing or malformed marker pair: ${begin}`);
  }
  return (
    source.slice(0, beginIndex + begin.length) +
    "\n" + body.trimEnd() + "\n" +
    source.slice(endIndex)
  );
}

export function injectMarkers(source: string, registry: Registry): string {
  let output = source;
  const usedCategories = new Set(registry.invariants.map((inv) => inv.category));
  for (const category of CATEGORIES) {
    const begin = `<!-- pnh:invariants:${category}:begin -->`;
    const end = `<!-- pnh:invariants:${category}:end -->`;
    if (!output.includes(begin)) {
      if (usedCategories.has(category)) {
        throw new Error(`missing or malformed marker pair for used category: ${begin}`);
      }
      continue;
    }
    output = replaceBlock(output, begin, end, renderCategory(registry, category));
  }
  output = replaceBlock(
    output,
    "<!-- pnh:conformance:begin -->",
    "<!-- pnh:conformance:end -->",
    renderConformanceChapter(registry),
  );
  return output;
}

function updateLock(registry: Registry): number {
  const nextLock = computeLock(registry);
  let previous: ReturnType<typeof computeLock> | undefined;
  try {
    previous = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as typeof nextLock;
  } catch {
    previous = undefined;
  }
  if (previous !== undefined) {
    const blocking = diffAgainstLock(registry, previous, repoRoot).filter(
      (e) => !e.startsWith("stale lock") && !e.includes("run --update-lock"),
    );
    if (blocking.length > 0) {
      console.error(`refusing to update lock:\n- ${blocking.join("\n- ")}`);
      return 1;
    }
  }
  writeFileSync(LOCK_PATH, `${stableStringify(nextLock)}\n`, "utf8");
  console.log(`lock updated: ${LOCK_PATH}`);
  return 0;
}

function main(): number {
  const mode = process.argv[2];
  const registry = loadRegistry(REGISTRY_PATH);
  if (mode === "--update-lock") return updateLock(registry);
  const source = readFileSync(CONSTITUTION_PATH, "utf8");
  const regenerated = injectMarkers(source, registry);
  if (mode === "--write") {
    writeFileSync(CONSTITUTION_PATH, regenerated, "utf8");
    console.log(`constitution written: ${CONSTITUTION_PATH}`);
    return 0;
  }
  if (mode === "--check") {
    if (regenerated !== source) {
      console.error("constitution drift: regenerated output differs from committed file");
      return 1;
    }
    console.log("constitution matches registry");
    return 0;
  }
  console.error("usage: generate-constitution.ts --check | --write | --update-lock");
  return 2;
}

if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test pnh/tests/constitution-generator.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/scripts/generate-constitution.ts pnh/tests/constitution-generator.test.ts
git commit -m "feat(pnh): add constitution generator with marker injection and lock CLI"
```

---

### Task 6: Seed registry, constitution skeleton, gate test, and `test:constitution` script

**Files:**
- Create: `pnh/contracts/invariants.yaml` (seed)
- Create: `pnh/contracts/invariants.lock` (via CLI)
- Create: `docs/plans/provider-neutral-harness/constitution.md` (skeleton)
- Create: `pnh/tests/constitution-gate.test.ts`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the standing gate. The six checks map one-to-one to the design's conformance-test section.

- [ ] **Step 1: Seed `pnh/contracts/invariants.yaml`**

```yaml
version: 1
invariants:
  - id: PNH-INV-01
    title: Ordinary plugin faults stay inside their fault cell
    category: isolation
    statement: >
      An attributed ordinary failure of one plugin must not block, settle,
      or contaminate the work of any other plugin in the admitted set.
    status: proposed
    bounds:
      max_cross_plugin_stall_ms: 50
    conformance: []
    since: "2026-08-21"
    decisions:
      - docs/plans/provider-neutral-harness/2026-08-21-m3-plugin-isolation-architecture-options.md
protocols: []
```

- [ ] **Step 2: Create the constitution skeleton `docs/plans/provider-neutral-harness/constitution.md`**

Chapter headings from the design's chapter map, every category marker pair present, prose deferred to Task 10. Exact skeleton:

```markdown
# PNH constitution

This document is the canonical normative reference for the provider-neutral
harness. Narrative prose is non-normative and explanatory; on any conflict,
the generated registry text binds. Source of law:
`pnh/contracts/invariants.yaml`. Gate: `npm run test:constitution`.

## 1. Doctrine

<!-- pnh:invariants:doctrine:begin -->
<!-- pnh:invariants:doctrine:end -->

## 2. Authority model

<!-- pnh:invariants:authority:begin -->
<!-- pnh:invariants:authority:end -->

## 3. Task law

<!-- pnh:invariants:task:begin -->
<!-- pnh:invariants:task:end -->

## 4. Plugin law

<!-- pnh:invariants:plugin:begin -->
<!-- pnh:invariants:plugin:end -->

## 5. Bridge law

<!-- pnh:invariants:bridge:begin -->
<!-- pnh:invariants:bridge:end -->

## 6. Isolation law

<!-- pnh:invariants:isolation:begin -->
<!-- pnh:invariants:isolation:end -->

## 7. Lifecycle authority

<!-- pnh:invariants:lifecycle:begin -->
<!-- pnh:invariants:lifecycle:end -->

## 8. Broker law

<!-- pnh:invariants:broker:begin -->
<!-- pnh:invariants:broker:end -->

## 9. Evidence law

<!-- pnh:invariants:evidence:begin -->
<!-- pnh:invariants:evidence:end -->

## 10. Aggregate resource law

<!-- pnh:invariants:resource:begin -->
<!-- pnh:invariants:resource:end -->

## 11. Hostile-plugin gate

<!-- pnh:invariants:gate:begin -->
<!-- pnh:invariants:gate:end -->

## 12. Extraction boundary

<!-- pnh:invariants:extraction:begin -->
<!-- pnh:invariants:extraction:end -->

## 13. Non-goals

## 14. Conformance

<!-- pnh:conformance:begin -->
<!-- pnh:conformance:end -->
```

Then materialize generated blocks and the lock:

```bash
npx tsx pnh/scripts/generate-constitution.ts --write
npx tsx pnh/scripts/generate-constitution.ts --update-lock
```

- [ ] **Step 3: Write the gate `pnh/tests/constitution-gate.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  diffAgainstLock,
  loadRegistry,
  validateProtocolPins,
  validateSemantics,
  type LockFile,
} from "../contracts/registry.ts";
import { runConformance } from "../contracts/coverage.ts";
import { injectMarkers } from "../scripts/generate-constitution.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const registry = loadRegistry(
  resolve(repoRoot, "pnh", "contracts", "invariants.yaml"),
);
const lock = JSON.parse(
  readFileSync(resolve(repoRoot, "pnh", "contracts", "invariants.lock"), "utf8"),
) as LockFile;

test("check 1: schema and semantic validity", () => {
  assert.deepEqual(validateSemantics(registry, repoRoot), []);
});

test("check 2: baseline rule — registry matches the committed lock", () => {
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot), []);
});

test("check 3: executed conformance for every active invariant", () => {
  const active = registry.invariants.filter((inv) => inv.status === "active");
  const files = [...new Set(active.flatMap((inv) => [...inv.conformance]))];
  if (files.length === 0) {
    assert.equal(active.length, 0, "active invariants must map to suites");
    return;
  }
  const result = runConformance(files, repoRoot);
  assert.equal(result.exitCode, 0, "conformance suites must pass");
  for (const inv of active) {
    assert.ok(
      result.registered.has(inv.id),
      `${inv.id}: no executed, non-skipped test registered it via conformsTo`,
    );
  }
});

test("check 4: orphan rule — active invariants have conformance entries", () => {
  for (const inv of registry.invariants) {
    if (inv.status === "active") {
      assert.ok(inv.conformance.length > 0, `orphan invariant: ${inv.id}`);
    }
  }
});

test("check 5: drift rule — committed constitution matches regeneration", () => {
  const constitutionPath = resolve(
    repoRoot, "docs", "plans", "provider-neutral-harness", "constitution.md",
  );
  const source = readFileSync(constitutionPath, "utf8");
  assert.equal(injectMarkers(source, registry), source);
});

test("check 6: protocol pins — hashes and spec versions", () => {
  assert.deepEqual(validateProtocolPins(registry, repoRoot), []);
});
```

- [ ] **Step 4: Add the npm script**

In `package.json` scripts block, after `"test:pnh"`, add:

```json
"test:constitution": "tsx --test pnh/tests/constitution-registry.test.ts pnh/tests/constitution-coverage.test.ts pnh/tests/constitution-generator.test.ts pnh/tests/constitution-gate.test.ts",
```

- [ ] **Step 5: Run the gate to verify it passes**

Run: `npm run test:constitution`
Expected: PASS — all suites green (check 3 passes vacuously: seed has no active invariants; the assertion inside enforces that only when files is empty).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck:pnh
git add pnh/contracts/invariants.yaml pnh/contracts/invariants.lock docs/plans/provider-neutral-harness/constitution.md pnh/tests/constitution-gate.test.ts package.json
git commit -m "feat(pnh): stand up the constitution gate with seed registry and skeleton"
```

---

### Task 7: Protocol spec stubs and real protocol pins

**Files:**
- Create: `docs/plans/provider-neutral-harness/specs/plugin-protocol.md`
- Create: `docs/plans/provider-neutral-harness/specs/supervisor-command-channel.md`
- Modify: `pnh/contracts/invariants.yaml` (protocols block)
- Modify: `pnh/contracts/invariants.lock` (via `--update-lock`)
- Modify: `docs/plans/provider-neutral-harness/constitution.md` (via `--write`)

**Interfaces:**
- Consumes: `computeSchemaHash` (Task 4), generator CLI (Task 5).
- Produces: two pinned wire boundaries the gate enforces from now on. Spec stubs declare version + schema source of record only — writing field layouts is out of scope per the design.

- [ ] **Step 1: Write the two spec stubs**

`docs/plans/provider-neutral-harness/specs/plugin-protocol.md`:

```markdown
# Plugin protocol

Version: 1

Wire boundary between a plugin container and the container broker (NDJSON
frames). Schema source of record: `pnh/sdk/protocol.ts` (frame types,
`MAX_FRAME_BYTES`, `MAX_JSON_DEPTH`, encode/validate functions). Field-layout
documentation lives here in a future revision; this stub exists to carry the
version declaration the registry pin enforces. Changing the schema source
requires bumping `Version:` here and the registry pin together.
```

`docs/plans/provider-neutral-harness/specs/supervisor-command-channel.md`:

```markdown
# Supervisor command channel

Version: 1

Wire boundary between the container broker and the plugin container
supervisor (lifecycle commands and receipts). Schema source of record:
`pnh/harness/plugin-container-supervisor.mjs` command surface and
`pnh/harness/plugin-container-supervisor.d.mts`. Field-layout documentation
lives here in a future revision; this stub exists to carry the version
declaration the registry pin enforces. Changing the schema source requires
bumping `Version:` here and the registry pin together.
```

- [ ] **Step 2: Compute the two schema hashes**

```bash
npx tsx -e "import{computeSchemaHash}from'./pnh/contracts/registry.ts';console.log('plugin-protocol',computeSchemaHash(['pnh/sdk/protocol.ts'],'.'));console.log('supervisor-command-channel',computeSchemaHash(['pnh/harness/plugin-container-supervisor.mjs','pnh/harness/plugin-container-supervisor.d.mts'],'.'))"
```

Expected: two `sha256:<64 hex>` lines. Copy them into Step 3.

- [ ] **Step 3: Add the protocols block to `pnh/contracts/invariants.yaml`**

Replace `protocols: []` with (hashes from Step 2):

```yaml
protocols:
  - id: PNH-PROTO-01
    name: plugin-protocol
    spec: docs/plans/provider-neutral-harness/specs/plugin-protocol.md
    version: 1
    schema_source:
      - pnh/sdk/protocol.ts
    schema_hash: sha256:<from step 2>
    conformance:
      - pnh/tests/plugin-protocol.test.ts
  - id: PNH-PROTO-02
    name: supervisor-command-channel
    spec: docs/plans/provider-neutral-harness/specs/supervisor-command-channel.md
    version: 1
    schema_source:
      - pnh/harness/plugin-container-supervisor.mjs
      - pnh/harness/plugin-container-supervisor.d.mts
    schema_hash: sha256:<from step 2>
    conformance:
      - pnh/tests/plugin-container-supervisor.test.ts
```

- [ ] **Step 4: Refresh lock and constitution, run the gate**

```bash
npx tsx pnh/scripts/generate-constitution.ts --update-lock
npx tsx pnh/scripts/generate-constitution.ts --write
npm run test:constitution
```

Expected: `--update-lock` reports the two new ids and succeeds; gate PASSES including check 6.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck:pnh
git add docs/plans/provider-neutral-harness/specs pnh/contracts/invariants.yaml pnh/contracts/invariants.lock docs/plans/provider-neutral-harness/constitution.md
git commit -m "feat(pnh): pin both wire boundaries with schema hashes and spec stubs"
```

---

<!-- model: fable -->

### Task 8: Harvest the full invariant set into the registry

**Files:**
- Modify: `pnh/contracts/invariants.yaml`
- Modify: `pnh/contracts/invariants.lock` + `constitution.md` (via CLI)

**Interfaces:**
- Consumes: registry schema (Task 1), CLI (Task 5).
- Produces: the complete invariant set, all `status: proposed` EXCEPT ones whose listed conformance suites already exist and genuinely prove them (leave even those `proposed` for now — Task 9 flips statuses when `conformsTo` lines land, so the gate stays green throughout).

**Recipe.** For each source item below: extract the normative claim, write it as a single testable `statement` (present tense, "must"/"never", no implementation detail, no current-state language), assign the category, cite the source file in `decisions`, put every number into `bounds`. Where the design's review fixes changed a source's claim (e.g. host-scoping), the DESIGN wording wins — cite both files. Renumber sequentially per insertion order (`PNH-INV-02` onward; `PNH-INV-01` exists).

**Harvest map (source → invariants).** Work through in order; expected yield 30–45 total:

1. `2026-08-20-m2-hybrid-restart-plan.md` — "Cross-cutting invariants" section: one entry per listed invariant (categories: mostly `authority`, `evidence`, `plugin`).
2. `architecture.md` — "Security invariants" section: one entry each (skip any duplicate of item 1 — dedupe by claim, keep first, cite both decisions). "Open-source boundary" section: 2–3 `extraction` entries (public core must not depend on consumer types; consumer adapters depend only on public contracts).
3. `2026-08-21-m3-plugin-fault-isolation-threat-model.md` — "Required controls and evidence" + "Physical-split escalation rule": `isolation` entries, including the escalation trigger as its own invariant.
4. `2026-08-21-m3-plugin-isolation-architecture-options.md` — "Fixed security constraints" 1–5: five entries (`isolation`/`gate`); "Authority and trust model" table rows: one `authority` entry per row's "must not receive" clause.
5. Design-doc chapter map (`2026-08-21-pnh-constitution-design.md`) — the review-fix invariants. These twelve are fully specified here; copy them (statements final, categories set):

| id-slot | category | title | statement (verbatim) | bounds |
|---|---|---|---|---|
| task | task | One admitted task at a time | The harness admits exactly one task; scheduling, queueing, and concurrency belong to the consumer control plane above the adapter. | — |
| lifecycle | lifecycle | Single host-scoped lifecycle principal | Exactly one lifecycle principal per host may create or destroy plugin containers; all harness instances on the host share it, every command carries per-instance identity, and its confirmations are the sole source of cleanup evidence. | — |
| lifecycle | lifecycle | Payload-blind lifecycle authority | The lifecycle principal accepts only ticket-resolved authenticated lifecycle commands and never interprets plugin payloads, plugin-selected identities, or raw container-runtime arguments. | — |
| resource | resource | Host-scoped aggregate arbiter | One payload-blind arbiter per host reserves and releases aggregate capacity for all harness instances with per-instance quotas; it never owns plugin settlement and never interprets plugin payloads. | — |
| resource | resource | Fair-share ceilings | No plugin may reserve aggregate capacity beyond its fair-share ceiling; a plugin acting within its grants must never be able to starve unrelated plugins through legal reservations. | — |
| resource | resource | Reservations are leases | Aggregate reservations are leases that expire when the owning cell dies; a crashed or wedged plugin must never permanently retain aggregate capacity. | — |
| isolation | isolation | Bounded cross-plugin interference | Cross-plugin interference from bounded, attributed plugin input is quantitatively bounded and enforced; the bound values live in this registry and tests import them. | max_cross_plugin_stall_ms: 50 |
| plugin | plugin | Cell port is a message protocol | The plugin cell boundary is a versioned serialized message protocol pinned in this registry at introduction; moving cells out of process must not change admission tickets, capability grants, lifecycle receipts, or event semantics. | — |
| bridge | bridge | Bridges are ordinary admitted plugins | A foreign-capability bridge is an ordinary admitted plugin: containerized, capability-scoped, credential-free, and digest-bound by packaging the bridged server inside the plugin image. | — |
| bridge | bridge | Frozen foreign surface, default deny | The bridged foreign surface is enumerated at admission with schema hashes across every method family; any family or member not explicitly admitted is denied. | — |
| bridge | bridge | Trusted mediation and attribution | Foreign-method dispatch is compared against the admitted surface and evidenced by a trusted harness-side mediator outside the plugin container; foreign-method evidence is never taken from the bridge's own claim, and a surface mismatch fails the plugin allocation closed with post-dispatch drift settling as ambiguous. | — |
| gate | gate | Hostile-plugin gate | Admitting any plugin that is not owner-approved and digest-bound requires a stronger isolation class before admission is legal; development-mode loading is non-admitted execution that cannot produce production evidence and cannot invoke bridges or privileged effects. | — |

- [ ] **Step 1: Draft all entries into `invariants.yaml`** following the recipe and map above. Every entry `status: proposed`, `conformance: []` unless an existing suite in `pnh/tests/` plainly proves the claim — then list it but STILL keep `proposed`.

- [ ] **Step 2: Validate, refresh, and run the gate**

```bash
npx tsx pnh/scripts/generate-constitution.ts --update-lock
npx tsx pnh/scripts/generate-constitution.ts --write
npm run test:constitution
```

Expected: PASS. `--update-lock` lists every new id.

- [ ] **Step 3: Self-check the harvest** — re-read each source section and confirm every normative claim maps to an entry or a recorded dedupe. The parser-isolation caveat applies: nothing may list `m3-plugin-fault-isolation.test.ts` as proof of a parser-isolation claim.

- [ ] **Step 4: Commit**

```bash
git add pnh/contracts/invariants.yaml pnh/contracts/invariants.lock docs/plans/provider-neutral-harness/constitution.md
git commit -m "feat(pnh): harvest the full invariant set into the registry"
```

---

<!-- model: sonnet:high -->

### Task 9: Map existing suites via `conformsTo` and activate proven invariants

**Files:**
- Modify: existing files under `pnh/tests/` (one `conformsTo(...)` line inside each proving test; no other changes)
- Modify: `pnh/contracts/invariants.yaml` (statuses + conformance lists), lock + constitution via CLI

**Interfaces:**
- Consumes: `conformsTo` from `pnh/contracts/conforms-to.ts` (import path from a test: `./../contracts/conforms-to.ts` → `../contracts/conforms-to.ts`).

- [ ] **Step 1: For each harvested invariant with a candidate suite**, open the suite and confirm one specific test actually exercises the claim. If yes: add `import { conformsTo } from "../contracts/conforms-to.ts";` at top and `conformsTo("PNH-INV-nn");` as the first line of that test's body; set the invariant's `conformance` to that file and `status: active`. If no test truly proves it, leave it `proposed` — activation without proof is exactly what the gate exists to prevent. Do NOT map host-tests (they require Docker); unit suites under `pnh/tests/` only.

Example (in `pnh/tests/plugin-set.test.ts`, if it proves the frozen-plugin-set invariant):

```ts
import { conformsTo } from "../contracts/conforms-to.ts";

test("plugin set is deep-frozen after admission", () => {
  conformsTo("PNH-INV-07");
  // ...existing assertions unchanged...
});
```

- [ ] **Step 2: Refresh and run the gate**

```bash
npx tsx pnh/scripts/generate-constitution.ts --update-lock
npx tsx pnh/scripts/generate-constitution.ts --write
npm run test:constitution
```

Expected: PASS — check 3 now spawns the mapped suites and every active id registers. If an id fails to register, the mapped test didn't run its `conformsTo` line — fix the mapping, don't relax the check.

- [ ] **Step 3: Confirm the sandbox runner still passes untouched suites the same way it did before this task** (the added lines are no-ops without the env var):

```bash
npm run typecheck:pnh
```

Expected: clean. (Do not run `test:pnh`; the M3 suite is red by design.)

- [ ] **Step 4: Commit**

```bash
git add pnh/tests pnh/contracts/invariants.yaml pnh/contracts/invariants.lock docs/plans/provider-neutral-harness/constitution.md
git commit -m "feat(pnh): activate proven invariants via conformsTo registrations"
```

---

<!-- model: fable -->

### Task 10: Write the constitution prose

**Files:**
- Modify: `docs/plans/provider-neutral-harness/constitution.md` (prose outside markers only)

- [ ] **Step 1: Write each chapter's narrative** per the design's chapter map (read it first: `2026-08-21-pnh-constitution-design.md`, "Chapter map"). Rules: narrative explains, never legislates — every normative claim must already be a registry entry the chapter's generated block shows; no current-state, milestone, or dated language; chapter 2 includes the corrected authority diagram (untrusted containers never reach the lifecycle authority directly — connect them to the broker/gateway layer only); chapter 1 states the amendment process (dated decision record + registry change + `--update-lock`) and the reading rule verbatim from the skeleton header; chapter 13 lists the durable non-goals from `architecture.md`'s Non-goals section, rewritten timelessly.

- [ ] **Step 2: Verify no drift and no current-state language**

```bash
npx tsx pnh/scripts/generate-constitution.ts --check
rg -in 'status:|as of|currently|not yet|implemented|milestone|M[0-9]\b' docs/plans/provider-neutral-harness/constitution.md
```

Expected: `--check` passes; the `rg` finds nothing (the skeleton header's "Gate:" line is fine — if `rg` matches only that, done).

- [ ] **Step 3: Run the full gate and commit**

```bash
npm run test:constitution
git add docs/plans/provider-neutral-harness/constitution.md
git commit -m "docs(pnh): write constitution narrative chapters"
```

---

### Task 11: Tombstone architecture.md and final verification

**Files:**
- Modify: `docs/plans/provider-neutral-harness/architecture.md` (header only)
- Modify: `docs/plans/provider-neutral-harness/2026-08-21-pnh-constitution-design.md` (status line only)

- [ ] **Step 1: Add the tombstone** — insert immediately after the H1 of `architecture.md`:

```markdown
> **Superseded 2026-08-21.** The canonical normative reference is now
> [constitution.md](constitution.md), backed by the machine-readable registry
> `pnh/contracts/invariants.yaml` and the `npm run test:constitution` gate.
> This document is retained as historical context only.
```

Change nothing else in that file.

- [ ] **Step 2: Update the design doc status line** from `Status: design approved in session, pending owner review of this document` to `Status: implemented 2026-08-21 — see constitution.md and pnh/contracts/`.

- [ ] **Step 3: Final verification against the design's success criteria**

```bash
npm run test:constitution        # criterion 1: gate green, zero orphans/drift, clean baseline
npm run typecheck:pnh            # strict TS clean
npx tsx pnh/scripts/generate-constitution.ts --check   # criterion 2
rg -c 'sha256:' pnh/contracts/invariants.yaml          # criterion 3: 2 protocol hashes present
rg -in 'currently|as of|milestone' docs/plans/provider-neutral-harness/constitution.md  # criterion 4: no output
git diff --stat -- docs/plans/provider-neutral-harness/architecture.md                  # criterion 5: header-only diff (working tree vs HEAD, run before Step 4's commit)
```

Expected: all green / empty as annotated.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/provider-neutral-harness/architecture.md docs/plans/provider-neutral-harness/2026-08-21-pnh-constitution-design.md
git commit -m "docs(pnh): tombstone architecture.md; constitution is the reference"
```
