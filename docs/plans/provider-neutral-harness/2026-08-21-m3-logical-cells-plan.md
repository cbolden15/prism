# M3 logical fault cells — narrow-step implementation plan

Status: hardened 2026-08-21 — codex + three-lens claude panel, 20 applied findings, owner scope decisions recorded (Task 4 cut, PNH-INV-01 deferred, command-loop fix split out). Ready for execution.
Date: 2026-08-21
Branch: `pnh/m3-logical-cells` (create from `main` before Task 1)

Authorization: the pre-authorized narrow step from
`2026-08-21-m3-plugin-isolation-architecture-options.md` ("repair the shared
global queue into plugin-keyed logical cells and use the existing red suite to
evaluate Option A. Do not implement physical splitting."). This plan does not
depend on the still-open owner decisions at that document's decision
checkpoint, and must not foreclose them.

## Goal

The committed M3 isolation suite `pnh/tests/m3-plugin-fault-isolation.test.ts`
goes from 0/8 to green, extended with the cases named in Tasks 1 and 2, by
replacing the supervisor-wide promise chain with per-allocation fault cells
**and** by removing the same head-of-line block from the production command
loop the broker actually drives — with no change to admission tickets,
capability grants, lifecycle receipts, or event semantics, the supervisor still
payload-blind, and the lifecycle daemon still the sole Docker writer.
PNH-INV-22 moves from `proposed` to `active` with those suites as its
conformance proof, its statement scoped to what they prove.

PNH-INV-01 stays `proposed` and the constitution gate is **not** wired into
`test:pnh` in this plan — see Deferred.

## Grounding (verified 2026-08-21, on `main` at `c34adc7`)

- The shared global queue is `let queue = Promise.resolve()` inside
  `createPluginContainerSupervisor` (`pnh/harness/plugin-container-supervisor.mjs:140`),
  reassigned by `enqueue()` (`:142-146`) — one FIFO chain for every operation
  of every plugin: `launch` (`:397-399`), `cleanup` (`:385`), `writeInput`
  (`:401-423`), `closeInput` (`:424-433`), `status` (`:434-445`),
  `acknowledge` (`:446-459`), `shutdown` (`:460-473`), `idle` (`:474-476`),
  and per-chunk `handleStreamBytes` (`:269-292`).
- Allocations live in `allocations = new Map()` keyed by `requestId` (`:138`);
  every request/handle/receipt carries `requestId` + `pluginId`
  (`pnh/kernel/plugin-container-port.ts:4-42`). The enqueued closures know
  their identity; only the serialization primitive discards it.
- `allocations.set(...)` runs *inside* the queued launch turn (`:325`), not at
  enqueue time. Any map a fan-out iterates must account for a launch that is
  enqueued but has not yet reached that line.
- The only removal from `allocations` is inside `acknowledge` (`:455`).
  `settle()` (`:248-267`) marks the state terminal and stores the receipt but
  removes nothing, which is what keeps a post-cleanup `status` readable
  (`pnh/tests/plugin-container-supervisor.test.ts:233-249`).
- **The production entry point is `runSupervisorCommandLoop` (`:770-824`), and
  it is globally serialized independently of the supervisor's queue.** It
  `await`s each `dispatchCommand` before parsing the next line (`:808-810`),
  so one blocked plugin stalls every other plugin's buffered command even if
  the supervisor beneath it is perfectly celled. The broker drives exactly this
  path (`pnh/harness/sandbox/broker-gateway.mjs:440-447` spawns the supervisor
  and writes every command frame to its stdin). The M3 suite does not reach it
  — it calls `createPluginContainerSupervisor` directly.
- `runSupervisorCommandLoop` also holds a real cross-plugin aggregate counter:
  `cumulativeBytes` (`:777`, `:780-781`) sums raw transport bytes across every
  allocation and throws past `MAX_CUMULATIVE_COMMAND_BYTES` (8 MB, `:16`),
  tearing down the whole loop rather than the byte-heavy plugin. Task 2 owns
  the explicit decision about it.
- `main()`'s only shutdown failure signal is
  `receipts.some((r) => !r.confirmedAbsent)` (`:841-844`). A receipt that never
  arrives is indistinguishable from success there, and the process exits 0.
- The red suite fails 8/8 with
  `"<case> cleanup head-of-line blocked an unrelated plugin in the shared supervisor"`
  (assertion at `pnh/tests/m3-plugin-fault-isolation.test.ts:296-299`): each
  case blocks the FAULT plugin's `docker.remove()` and asserts the UNRELATED
  plugin's `status`/`writeInput` still settle. Verified by direct run
  (`npx tsx --test pnh/tests/m3-plugin-fault-isolation.test.ts`, fake Docker,
  no container needed).
- The broker layer is already concurrent (`pending` map keyed by
  `operationId`, `pnh/harness/plugin-container-broker.mjs:173-238`). The
  frame-writer serializers (`plugin-container-supervisor.mjs:732-743`, and the
  broker's own at `:328-336`, `:731-743`) are stdout-stream writers, not work
  queues — out of scope, and they legitimately keep their own `let queue`.
- `pnh/harness/plugin-container-supervisor.mjs` + `.d.mts` are the pinned
  schema source of PNH-PROTO-02 (`pnh/contracts/invariants.yaml:609-618`), so
  any edit changes the pinned `schema_hash` — a binding-field change that
  requires an amendment entry citing a dated decision record whose
  `from_hash` matches the **locked binding hash**
  (`pnh/contracts/registry.ts:288-301`), which is not the same value as
  `schema_hash`.
- M3-relevant invariants PNH-INV-01, -21, -22, -24, -25, -26, -27, -33, -38,
  -46 are all `status: proposed` with empty conformance. PNH-INV-23
  (uncancellable deadline/cleanup path) is `active`, conformed by
  `pnh/tests/plugin-container-supervisor.test.ts`, and must stay green
  throughout.
- `pnh/tests/plugin-broker.test.ts` does not exist on `main`. The suite that
  actually crosses the broker↔supervisor seam is
  `pnh/tests/broker-gateway-routing.test.ts`.

## Design

**Cell key is the allocation (`requestId`), not the plugin.** PNH-INV-22's
binding statement scopes queues, timers, limits, cleanup, and evidence "to the
owning allocation"; allocation-keyed serialization is strictly stronger than
plugin-keyed and still satisfies the docs' "plugin-keyed logical cells"
phrasing (two plugins never share a cell). A plugin's own second allocation is
likewise not blocked by its first — same-plugin isolation is asserted by a new
test in Task 1.

**The cell is a separate module behind a portable interface.** New file
`pnh/harness/plugin-fault-cell.mjs` (plus `.d.mts`) exports a factory
`createFaultCell({ requestId, pluginId })` owning: the cell's serialization
chain (`run(operation)`), a `flush()` that settles when the chain drains, and
`dispose()`. The supervisor holds `cells = new Map()` keyed by `requestId` and
routes every formerly-global `enqueue` through the owning cell. A separate
module is justified purely by keeping the new serialization logic legible and
independently testable; it makes no claim on any future architecture option.

**The cell module is inside the PNH-PROTO-02 pin.** It holds the serialization
chain PNH-INV-23's uncancellable-cleanup guarantee depends on, so leaving it
out of `schema_source` would let an edit change security behavior with no
`schema_hash` movement, no amendment, and a green `test:constitution`.
`plugin-fault-cell.mjs` and `.d.mts` are added to PNH-PROTO-02's
`schema_source` in Task 3, and the hash is computed over every file that
changed.

**`dispose()` never cancels accepted work.** `dispose()` releases the map entry
and nothing else: it must not reject, cancel, or drop an operation already
accepted by `run()`. PNH-INV-23's uncancellable cleanup path runs on a cell
chain now, and a disposal that could drop queued work would violate it in a
way that invariant's suite (which has no disposed-cell case) would not catch.

**Cross-cell operations fan out; nothing re-serializes globally.**
`shutdown()` snapshots the **cells** map — not `allocations`, which a launch
enqueued the instant SIGTERM arrives has not yet been written to (`:325`).
Each cell's shutdown operation resolves its allocation from `allocations` *at
run time*, so it lands behind any in-flight launch on that cell's own FIFO and
the newly launched container gets a receipt instead of being dropped silently.
`idle()` awaits `allSettled` of every cell's `flush()`. `handleStreamBytes`
enqueues on the owning allocation's cell.

**The shutdown fan-out must fail closed.** `Promise.allSettled` never rejects,
so a rejected per-cell cleanup would drop out of the receipt list with no entry
and `main()`'s `receipts.some((r) => !r.confirmedAbsent)` check (`:841-844`)
would read false while a container is still running — the process would exit 0.
Today's single chain rejects the whole `shutdown()` promise on any throw and
the process exits 1; that behavior is preserved. After `allSettled`,
`shutdown()` must throw (or otherwise force the `confirmedAbsent` check to
fire) if any settlement rejected **or** if the receipt count does not equal the
snapshot size.

**Shutdown fan-out width is bounded.** The global chain is today the only thing
capping concurrent `spawn("docker", ...)` calls and their 1 MB stdout/stderr
buffers; one cleanup issues up to seven sequential docker invocations. An
unbounded fan-out at SIGTERM with N live allocations would spawn N concurrent
stop/kill/remove chains at peak host pressure, with failures surfacing as
`confirmedAbsent: false`. Cap concurrent per-cell shutdown at a fixed small
width (process the snapshot in bounded batches) rather than `allSettled` over
every cell at once.

**Cell lifecycle is a total function.** A cell is created at `launch` enqueue
time (keyed from the request, before the allocation state exists) and disposed
when `acknowledge` deletes the allocation (`:455`). Terminal cleanup keeps both
the allocation and its cell alive so the receipt stays readable — disposing
inside `settle()` would leave
`pnh/tests/plugin-container-supervisor.test.ts:233-249` with no cell to run on,
and that file is PNH-INV-23's named conformance proof and unmodifiable here.
Two more paths must be closed explicitly:

- A launch operation that settles **without** producing an allocation
  (identity conflict, unadmitted `pluginId`) disposes its own cell — otherwise
  nothing ever will.
- A cell is **never lazily created** for a `requestId` with no live allocation.
  A late `handleStreamBytes` chunk routes to an existing cell or is dropped,
  matching today's terminal check (`:271`).
- The tombstone path creates no cell at all: a post-`acknowledge`
  `status`/`launch` returns `{ status: "acknowledged", ... }` via
  `acknowledgedFor` directly.

Operations for an unknown `requestId` keep failing exactly as they do today —
whatever validation the supervisor performs now must produce byte-identical
command responses.

**The production command loop gets the same treatment, as its own task.**
Celling the supervisor while `runSupervisorCommandLoop` still awaits each
dispatch leaves the shipped behavior unchanged: the broker's frames for plugin
B queue behind plugin A's blocked cleanup at the loop, one layer above the
cells. Task 2 dispatches without awaiting, tracks in-flight command promises in
a set, and drains that set on loop exit and inside `shutdown()`. It is a
separate task because it changes the process's concurrency and shutdown
custody, not just its serialization key.

**No shared arbiter is added.** The explorer map found no cross-plugin
aggregate counter *inside the supervisor factory* that the global queue was
incidentally serializing. One does exist one layer up — `cumulativeBytes` in
the command loop (`:777`, `:780-781`) — and Task 2 records an explicit decision
about it rather than silently preserving or removing it. If implementation
uncovers any other aggregate counter, stop and surface it — do not invent an
arbiter in this step (the options doc reserves aggregate reservations for a
"narrow shared arbiter" that does not exist yet and is not authorized here).

**Ordering contract.** Within one allocation, operation order is unchanged
(today's global chain is a strict superset of the per-cell chain). Across
allocations, no ordering contract exists and none is being added. If any
existing test turns out to encode cross-allocation ordering, stop and
surface it — do not adapt the test to the new behavior silently.

## Non-goals

- No Option B or Option C work; no per-plugin processes, channels, tokens, or
  Docker authority changes. (Decision checkpoint remains open.)
- No unattributable-channel-corruption handling — that is issue #30.
- No gate diagnostics / lifecycle hardening — that is issue #31.
- No wall-clock proof of the 50 ms `max_cross_plugin_stall_ms` bound;
  PNH-INV-38 and PNH-INV-01 stay `proposed` (the suites prove same-turn
  settlement under fake timers, not a timed bound).
- No constitution-gate wiring into `test:pnh`, and no "M3 is green"
  declaration — see Deferred.
- No wire-protocol change: the supervisor command surface (names, shapes,
  receipts) is untouched; PNH-PROTO-02 stays `version: 1`.

## Global constraints

- Never modify `pnh/core/`, `pnh/kernel/`, `pnh/runtime/`, or `pnh/sdk/`.
  This plan touches only `pnh/harness/plugin-container-supervisor.mjs` (cell
  map, call sites, and the command loop), the new
  `pnh/harness/plugin-fault-cell.mjs` + `.d.mts`, `pnh/tests/`,
  `pnh/contracts/invariants.yaml` + lock, and docs.
- The supervisor stays payload-blind; the cell module never parses plugin
  payload bytes.
- No new npm dependencies.
- PNH-INV-23's conformance suite (`plugin-container-supervisor.test.ts`) must
  pass unmodified after every task. If it needs edits, stop and surface why.
- Commit after each task with the exact single-line message given; write
  commit messages with `git commit -m` (single line) or `-F` file — never
  heredocs. Never push.
- Verification for every task: the task's named test commands plus
  `npm run typecheck:pnh` before each commit.
- After each task, dispatch an independent `task-spec-compliance-reviewer`
  (sonnet) on the task's diff before starting the next task.

## Subagent dispatch models

| Task | Model | Rationale |
|---|---|---|
| 1 | opus (xhigh) | supervisor surgery on a pinned security-adjacent file; highest judgment |
| 2 | opus (xhigh) | production concurrency and shutdown custody in the same pinned file |
| 3 | sonnet (high) | mechanical pin/amendment/lock mechanics |
| 4 | sonnet (high) | registry status transitions and conformance wiring |

<!-- model: opus -->

## Task 1: Fault-cell module and per-allocation serialization

**Files:**
- Create: `pnh/harness/plugin-fault-cell.mjs`, `pnh/harness/plugin-fault-cell.d.mts`
- Modify: `pnh/harness/plugin-container-supervisor.mjs`
- Modify: `pnh/tests/m3-plugin-fault-isolation.test.ts` (add cases only)

- [ ] **Step 1: Baseline.** `npx tsx --test pnh/tests/m3-plugin-fault-isolation.test.ts`
  → expect 8/8 red with the head-of-line message. `npx tsx --test
  pnh/tests/plugin-container-supervisor.test.ts` → expect green.
- [ ] **Step 2: Extend the red suite first.** Add six cases:
  - (a) **same-plugin isolation** — two allocations of one plugin, first
    allocation's `remove()` blocked mid-cleanup, second allocation's
    `status`/`writeInput` must settle this turn.
  - (b) **cell reclamation, behaviorally** — N sequential
    launch→cleanup→acknowledge cycles on distinct request IDs, then assert a
    fresh launch's `status`/`writeInput` still settle this turn. Do not assert
    a cell count: the frozen supervisor surface
    (`Object.freeze({launch, cleanup, writeInput, closeInput, status,
    acknowledge, shutdown, idle})`) exposes no such observable, and adding one
    would widen the PROTO-02-pinned `.d.mts` for a test — contradicting this
    plan's own "surface unchanged" justification. The "no leaked cell" claim
    is a **code-review item on the disposal call site**, raised in this task's
    reviewer dispatch, not a test assertion. Add no debug backdoor to
    production paths.
  - (c) **shutdown fails closed** — one cell's cleanup rejects; assert
    `shutdown()` still fails rather than returning a short receipt list that
    `main()`'s `confirmedAbsent` check would read as success.
  - (d) **shutdown does not drop an in-flight launch** — dispatch `launch` and
    `shutdown()` in the same turn; assert the new allocation appears in the
    returned receipts and the receipt count equals the cell-snapshot size.
  - (e) **`dispose()` does not cancel accepted work** — an operation accepted
    by `run()` before `dispose()` fires still settles.
  - (f) **direct module exercise** — import `createFaultCell` from
    `plugin-fault-cell.mjs` in this `.ts` suite and exercise
    `run`/`flush`/`dispose`. This is load-bearing beyond coverage:
    `tsconfig.pnh.json` has no `allowJs`, and `.mjs`/`.d.mts` files enter the
    typecheck program only transitively via a `.ts` importer, so without this
    import a broken declaration passes every task's `typecheck:pnh` silently.

  Run: every new case red (the same-plugin case red for the same head-of-line
  reason; the rest red or failing-to-compile until Step 3).
- [ ] **Step 3: Implement.** Write `plugin-fault-cell.mjs`
  (`createFaultCell`, `run`, `flush`, `dispose` — a per-cell promise chain
  with the same then/catch discipline as today's `enqueue`; `dispose()`
  releases the map entry only). In the supervisor: replace `let queue` /
  `enqueue(operation)` with the `cells` map and per-allocation routing for
  every call site listed in Grounding; fan out `shutdown()` over a snapshot of
  **cells** in bounded-width batches, resolving each allocation at run time,
  failing closed on any rejection or receipt-count mismatch; fan out `idle()`
  over every cell's `flush()`; implement the total create/dispose rules from
  Design (dispose on `acknowledge` at `:455`, dispose an allocation-less
  launch, never lazily create, tombstone path creates no cell). Do not change
  any command validation, receipt content, or event emission. Leave
  `runSupervisorCommandLoop` alone — it is Task 2.
- [ ] **Step 4: Verify.** `npx tsx --test pnh/tests/m3-plugin-fault-isolation.test.ts`
  → green: the 8 committed cases plus every case added in Step 2 (14 total if
  each lands as its own `test()`). `npx tsx --test
  pnh/tests/plugin-container-supervisor.test.ts` and `npx tsx --test
  pnh/tests/broker-gateway-routing.test.ts` → green, unmodified. (Use
  `broker-gateway-routing.test.ts`, not `plugin-broker.test.ts` — the latter
  does not exist on `main`, and `broker.test.ts` never reaches
  `plugin-container-supervisor.mjs`, since the broker talks to the supervisor
  only as a separate process over NDJSON frames.) `npm run typecheck:pnh` →
  clean. Leftover check: `rg -n 'let queue'
  pnh/harness/plugin-container-supervisor.mjs` → exactly one match, the
  `createSerializedFrameWriter` chain (`:732` before this task's edits), and
  none inside `createPluginContainerSupervisor`. Note: `npm run
  test:constitution` is expected red from here until Task 3 restores the
  PROTO-02 pin.
- [ ] **Step 5: Commit** — `feat(pnh): key supervisor serialization by per-allocation fault cells`

<!-- model: opus -->

## Task 2: Unblock the production command loop

Without this task the cells never reach production: the broker's frames for
plugin B still queue behind plugin A's blocked cleanup one layer above them.

**Files:**
- Modify: `pnh/harness/plugin-container-supervisor.mjs` (`runSupervisorCommandLoop` and `main()`'s `shutdown`)
- Modify: `pnh/tests/m3-plugin-fault-isolation.test.ts` (add cases only)

- [ ] **Step 1: Ground in the real loop.** Read `:770-824` (the
  `await dispatchCommand` at `:808-810` is the block), `:777`/`:780-781`
  (`cumulativeBytes`), and `main()`'s `shutdown` (`:838-845`). Confirm
  `pnh/harness/sandbox/broker-gateway.mjs:440-447` is the only production
  writer into this loop's stdin.
- [ ] **Step 2: Red test first.** Add a command-loop-level case to the M3
  suite: drive `runSupervisorCommandLoop` with a fake input stream, block
  plugin A's cleanup, and assert plugin B's buffered command still dispatches
  and its response frame is written this turn. Expect red before Step 3.
  (Put it in the M3 suite, not `plugin-container-supervisor.test.ts` — that
  file is PNH-INV-23's conformance proof and must stay unmodified.)
- [ ] **Step 3: Implement.** Dispatch commands without awaiting each one to
  completion before parsing the next line: hold each in-flight
  `dispatchCommand` promise (with its result/error frame write) in a set,
  removing itself on settle. Drain the set — `await` all of it — both on
  normal loop exit (before the existing `frameWriter.idle()` at `:823`) and
  inside `main()`'s `shutdown` before it returns, so no command is still in
  flight when the process reports custody. Preserve the existing duplicate-ID
  rejection, canonical-JSON check, and per-command error-frame shape exactly.
- [ ] **Step 4: Resolve the `cumulativeBytes` aggregate counter explicitly.**
  **Decision: keep the counter as-is and document the 8 MB ceiling as an
  accepted shared-channel ingest limit — not a per-plugin fault-isolation
  guarantee.** Per-allocation scoping was considered and rejected on
  inspection: the counter increments on raw transport chunks (`:780`) *before*
  any frame is parsed, so a chunk is not attributable to an allocation at the
  point it is counted — one chunk can carry bytes for several allocations or a
  fragment of a single command. Scoping per allocation would mean deleting the
  transport-level ingest bound and designing a new post-`validateCommand`
  per-`requestId` accounting mechanism with its own limit constant, its own
  overflow response (per-command error frame vs. loop teardown), and its own
  invariant bound — a new limit design inside a PROTO-02-pinned error path,
  well outside this plan's authorized narrow step. Record the ceiling and this
  reasoning in the task report, add the Risks entry, and keep PNH-INV-22's
  statement mute on byte limits (Task 4) until a follow-up resolves it. Do not
  silently remove or silently preserve the counter.
- [ ] **Step 5: Verify.** `npx tsx --test pnh/tests/m3-plugin-fault-isolation.test.ts`
  → green including the new command-loop case. `npx tsx --test
  pnh/tests/plugin-container-supervisor.test.ts` and `npx tsx --test
  pnh/tests/broker-gateway-routing.test.ts` → green, unmodified.
  `npm run typecheck:pnh` → clean. `test:constitution` still expected red
  until Task 3.
- [ ] **Step 6: Commit** — `fix(pnh): dispatch supervisor commands concurrently and drain in-flight work on shutdown`

<!-- model: sonnet:high -->

## Task 3: PNH-PROTO-02 amendment for the supervisor and fault-cell edits

**Files:**
- Create: `docs/plans/provider-neutral-harness/2026-08-21-supervisor-fault-cell-amendment.md`
- Modify: `pnh/contracts/invariants.yaml` (PNH-PROTO-02 entry — `schema_source`, `schema_hash`, amendments), `pnh/contracts/invariants.lock` (via `--update-lock`), `docs/plans/provider-neutral-harness/constitution.md` (via `--write`)

- [ ] **Step 1: Read the mechanics first**: `pnh/contracts/registry.ts:88-105`
  (amendment entry shape) and `:288-301` (decision-record existence,
  `from_hash` must equal the **locked binding hash** — `bindingHash({version,
  schema_hash})`, which is *not* the `schema_hash` value printed in
  `invariants.yaml`). Read one existing amendment in `invariants.yaml` as the
  format precedent (PNH-INV-03 / #28 work).
- [ ] **Step 2: Widen `schema_source`.** Add
  `pnh/harness/plugin-fault-cell.mjs` and
  `pnh/harness/plugin-fault-cell.d.mts` to PNH-PROTO-02's `schema_source`
  alongside the supervisor `.mjs`/`.d.mts`. The cell module holds the
  serialization chain PNH-INV-23's uncancellable-cleanup guarantee depends on;
  leaving it unpinned would let a later edit change security behavior with no
  `schema_hash` movement and no amendment.
- [ ] **Step 3: Write the dated decision record** — internal refactor of the
  supervisor's serialization into per-allocation fault cells, plus concurrent
  command dispatch with drained in-flight custody in the command loop, plus
  the `schema_source` widening; command surface, receipts, and event semantics
  unchanged; therefore `version` stays 1 and only `schema_hash` moves. Cite
  this plan and the red-suite result from Tasks 1 and 2.
- [ ] **Step 4: Recompute and pin.** Recompute the PROTO-02 hash with
  `computeSchemaHash([...all four schema_source files...], '.')` and update
  `schema_hash`. **Read the current `from_hash` out of `invariants.lock`'s
  `PNH-PROTO-02` entry at execution time** rather than trusting a constant in
  this plan — the value moves whenever the pin does. As of 2026-08-21 on
  `main` it is
  `sha256:6566f8e88df81546c63fa3f1e1e3b8b7cd4d5164a50f0d28fdce1e463f471c08`;
  verify before use. Append the amendment entry with that `from_hash` and the
  decision record path. Run `--update-lock`, then `--write`, then
  `npx tsx pnh/scripts/generate-constitution.ts --check`.
- [ ] **Step 5: Verify.** `npm run test:constitution` → green.
  `npm run typecheck:pnh` → clean.
- [ ] **Step 6: Commit** — `docs(pnh): amend PNH-PROTO-02 pin for the fault-cell refactor`

<!-- model: sonnet:high -->

## Task 4: Activate PNH-INV-22 with M3 conformance

PNH-INV-22 only. PNH-INV-01 stays `proposed` — see Deferred.

**Files:**
- Modify: `pnh/tests/m3-plugin-fault-isolation.test.ts` (`conformsTo` lines only)
- Modify: `pnh/contracts/invariants.yaml`, `pnh/contracts/invariants.lock`, `docs/plans/provider-neutral-harness/constitution.md` (generated)

- [ ] **Step 1: Read the status-transition rules** in
  `pnh/contracts/registry.ts` (free vs amendment-required transitions) before
  editing. `proposed` → `active` with new conformance is expected to be a
  free transition (activation was done for PNH-INV-03 in #29 — follow that
  commit's pattern, `627d549`). Note separately that an invariant's
  `bindingHash` covers `statement` and `bounds`: the Step 2 statement trim
  moves that hash. If the rules require an amendment for a statement change
  on a `proposed` invariant, follow Task 3's amendment pattern with its own
  decision record and say so in the task report.
- [ ] **Step 2: Trim the statement to what the suites prove, then wire
  conformance.** Scope PNH-INV-22's statement to per-allocation queues,
  timers, cleanup, and evidence as demonstrated by the M3 suite (supervisor
  cells) and its command-loop case (production dispatch). Leave it **mute on
  byte limits** — the 8 MB `cumulativeBytes` ceiling is an accepted
  shared-channel limit per Task 2, not a proven per-allocation bound. Add a
  `conformsTo(...)` registration for PNH-INV-22 to the M3 suite, list
  `pnh/tests/m3-plugin-fault-isolation.test.ts` in its `conformance:` list,
  and flip it to `status: active`. Leave PNH-INV-01, -21, -24 through -27,
  -33, -38, -46 untouched (`proposed`) — the suites do not prove them.
- [ ] **Step 3: Regenerate and verify.** Run `--update-lock`
  **unconditionally**: an invariant's `bindingHash` covers only `statement`
  and `bounds`, never `status`, so a `proposed`→`active` flip on its own
  leaves the hash unchanged and a conditional "update the lock if the diff
  demands it" never fires — the lock would silently stay `proposed`, and a
  later commit reverting the invariant would read as a free
  `proposed`→`proposed` transition instead of an illegal `active`→`proposed`
  one. Then `--write`, then `npm run test:constitution` → green (the gate now
  runs the M3 suite as conformance), `npm run typecheck:pnh` → clean.
  Verification line: the `PNH-INV-22` entry in `pnh/contracts/invariants.lock`
  reads `"status":"active"`.
- [ ] **Step 4: Commit** — `feat(pnh): activate PNH-INV-22 with M3 fault-cell conformance`

## Deferred

Cut from this plan on 2026-08-21, to be picked up by a future milestone-close
plan rather than by this narrow step.

- **Activating PNH-INV-01.** Its `max_cross_plugin_stall_ms: 50` bound is a
  wall-clock claim; the M3 suite runs under fake timers and proves same-turn
  settlement, not a timed bound. Activating it here would attach a conformance
  proof that does not test the bound it names. It stays `proposed`.
- **Wiring the constitution gate into `test:pnh`**, and any "M3 is green"
  declaration. Two things block it. First, the real M3 gate has seven criteria
  (`2026-08-20-m2-hybrid-restart-plan.md:191-199`): unchanged plugin-set digest
  and budget under event-chain validation; broker death, gateway loss, timeout,
  overflow, OOM, nonzero exit, and malformed completion each settling once with
  correct evidence; concurrent fault-injection across every ordinary failure
  class; replay creating no second container or effect; aggregate limits
  holding across concurrent plugins; a fault-isolation threat model recording
  whether logical cells satisfy the invariant; and no container left behind by
  any test. This plan's per-allocation cells and command-loop fix touch the
  concurrent-fault-injection criterion and part of the aggregate-limits one —
  most of the rest is untouched. Second, the Option A/B/C decision checkpoint
  in `2026-08-21-m3-plugin-isolation-architecture-options.md` is still open,
  and the threat-model criterion depends on resolving it.
- **The gate's known diagnostic gaps** (issue #31: spawn failure misreported as
  test failure, discarded stderr). Not a problem while the gate runs
  standalone; re-raise when a future plan makes it the primary CI gate, since
  that changes its blast radius.

## Risks

- **Hidden cross-allocation ordering assumptions** in existing suites — the
  stop-and-surface rule in Design governs; never adapt a test silently.
- **Gate red from Task 1 until Task 3** — accepted on the feature branch; the
  commits are consecutive and Task 3 restores it. This window is now two
  commits wide, not one.
- **Removed Docker CLI concurrency bound** — the global chain was incidentally
  the only cap on concurrent `spawn("docker", ...)` calls and their 1 MB
  stdout/stderr buffers. Task 1's bounded-width shutdown fan-out replaces it
  for the SIGTERM path only. Everywhere else the cap is simply gone, and it is
  worth being precise about how much: not just cleanup's up-to-seven
  invocations per allocation, but `launchInternal`'s inspect/create/`start -a
  -i` sequence too, which is now equally parallel across allocations. Nothing
  upstream re-imposes a bound — the supervisor's `allocations` map has no size
  limit, and the broker and gateway enforce byte limits but no concurrency cap
  at all. Residual risk: more concurrent docker invocations under host
  pressure, surfacing as `confirmedAbsent: false` rather than as a hang.
  Accepted for M3: the natural fix is a shared arbiter, which is explicitly out
  of scope here and would touch the still-open Option A/B/C decision.
- **Accepted 8 MB shared-channel ingest ceiling** — `cumulativeBytes` remains
  cross-plugin per Task 2 Step 4. A byte-heavy plugin can still tear down the
  command loop for every plugin. Documented, deliberately not fixed here, and
  PNH-INV-22 stays mute on byte limits until it is.
- **Cell disposal vs late stream bytes** — a chunk arriving after terminal
  cleanup must hit the same rejection path as today; Task 1 Step 2(b) covers
  reclamation behaviorally and the totality rules in Design close the lazy-
  creation seam, and the reviewer should probe this seam specifically.
- **PNH-INV-23 interplay** — the uncancellable cleanup path now lives on a
  per-cell chain; its unmodified conformance suite passing after Tasks 1 and 2
  is the required evidence, and `dispose()`'s never-cancel rule is what keeps
  it true.
