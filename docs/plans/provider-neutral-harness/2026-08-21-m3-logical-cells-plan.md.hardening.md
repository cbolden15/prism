# Hardening report — 2026-08-21-m3-logical-cells-plan.md

Two-engine adversarial pass (codex, one run) plus a three-lens claude panel
(SECURITY, FEASIBILITY, SCOPE-GUARDIAN). 7 Critical, 10 Important, 5 Minor
findings survived cross-engine reconciliation; several were independently
corroborated by 2-3 engines from different angles (noted per finding). Owner
resolved the two scope-forking findings (G, and the command-loop split) on
2026-08-21 — see Owner decisions below. All findings verified against real
source (`main` @ `c34adc7`); feasibility lens additionally reproduced the
0/8 baseline and the shutdown-drops-in-flight-launch behavior live against
the production supervisor.

## Owner decisions (resolved 2026-08-21, apply exactly)

1. **Cut Task 4 entirely; narrow Task 3 to PNH-INV-22 only, trimmed to what
   the suites actually prove.** PNH-INV-01 stays `proposed` (its
   `max_cross_plugin_stall_ms: 50` bound is unproven under fake timers).
   Gate-wiring (`test:pnh` ← `test:constitution`) and any "M3 is green"
   declaration are deferred to a future milestone-close plan, once real
   production-path coverage exists and the owner has resolved the Option
   A/B/C decision checkpoint. Add a short "Deferred" section listing what
   was cut and why, referencing the M2-hybrid-restart plan's 7 real M3 gate
   criteria and the options doc's open decision checkpoint.
2. **The production command-loop fix (Critical A) becomes its own separate
   task**, not folded into Task 1. Insert it as a new task between the
   renamed Task 1 (direct-method cell surface) and the renamed Task 2 (the
   PROTO-02 amendment) — i.e. new numbering: Task 1 (cells, as before but
   with the Critical/Important fixes below), Task 2 (command-loop fix,
   NEW), Task 3 (PROTO-02 amendment — must now cover whichever of Task 1
   and Task 2's files actually change the pinned schema source), Task 4
   (activate PNH-INV-22 only — was Task 3). Renumber all cross-references.

## Critical

- [x] **Shutdown fan-out can report false custody** — `Promise.allSettled`
  never rejects; a rejected per-cell cleanup drops out of the receipt list
  with no entry, `main()`'s only failure signal
  (`receipts.some((r) => !r.confirmedAbsent)`, `plugin-container-supervisor.mjs:841-844`)
  reads false, and the supervisor exits 0 while a container is still
  running. Today's single `enqueue` chain rejects the whole `shutdown()`
  promise on any throw and the process exits 1 — this is a real regression
  in daemon-confirmed stop evidence. Corroborated 3-way (security Critical
  1, feasibility Critical 2, codex Important 2). — fix: specify in Task 1
  that the fan-out must, after `allSettled`, throw (or otherwise force
  `receipts.some(!confirmedAbsent)` to fire) if any settlement rejected or
  if the receipt count doesn't equal the snapshot size. Add a shutdown test
  where one cell's cleanup rejects and assert `shutdown()` still fails
  closed. [security/feasibility/codex]

- [x] **Shutdown can drop an in-flight launch entirely** — the plan
  conflates two maps populated at different times: cells exist from launch
  *enqueue* time, `allocations.set(...)` only runs inside the queued turn
  (`:325`). A naive fan-out iterating `allocations` (today's loop, `:463`,
  literally translated) misses a launch enqueued the instant SIGTERM
  arrives — that container comes up with zero shutdown receipt, zero
  cleanup, zero evidence. Feasibility reproduced this live against the real
  supervisor. Corroborated 2-way (security Critical 2, feasibility Critical
  3). — fix: specify that shutdown snapshots the **cells** map (not
  `allocations`), each cell's shutdown operation resolves its allocation
  from `allocations` *at run time* (landing behind any in-flight launch on
  that cell's own FIFO), and the receipt count must equal the snapshot size
  before `shutdown()` returns. Add a test: dispatch `launch` and `shutdown()`
  in the same turn, assert the new allocation appears in the returned
  receipts. [security/feasibility]

- [x] **The fault-cell module is left outside the PNH-PROTO-02 pin** — the
  plan frames keeping `plugin-fault-cell.mjs` out of `schema_source` as a
  *benefit* ("keeps new logic out of the pinned file"), but that module
  will hold the serialization chain PNH-INV-23's uncancellable-cleanup
  guarantee depends on. An unpinned edit to it changes security behavior
  with no `schema_hash` movement, no amendment required, and a green
  `test:constitution`. — fix: add `pnh/harness/plugin-fault-cell.mjs` and
  `.d.mts` to PNH-PROTO-02's `schema_source` (in whichever task performs
  the amendment) and compute the hash over all files that change. Delete
  the "keeps new logic out of the pinned file" rationale from Design.
  [security]

- [x] **Task 2's amendment `from_hash` is the wrong value** — the plan's
  literal constant (`sha256:15a4b363...`) is PNH-PROTO-02's `schema_hash`,
  not its locked binding hash. `requireAmendment` compares against
  `bindingHash({version, schema_hash})`, which is
  `sha256:6566f8e88df81546c63fa3f1e1e3b8b7cd4d5164a50f0d28fdce1e463f471c08`
  — confirmed directly against `pnh/contracts/invariants.lock` by two
  independent engines and by me. `--update-lock` refuses outright with this
  constant; the task cannot complete as written. — fix: replace the
  constant with the correct locked hash above, and reword the step to read
  the current `from_hash` from `invariants.lock`'s `PNH-PROTO-02` entry at
  execution time rather than hardcoding it in the plan (the value may shift
  again if Task 1's edits land before this task runs). [feasibility, and
  independently verified in-session]

- [x] **The production command loop is untouched and still globally
  serializes every plugin** — `runSupervisorCommandLoop` (the real entry
  point the broker drives over stdin,
  `pnh/harness/sandbox/broker-gateway.mjs:440-447` spawns the supervisor
  and writes every command frame to it) awaits each `dispatchCommand` before
  parsing the next line (`plugin-container-supervisor.mjs:808-810`). The M3
  suite never exercises this path — it calls `createPluginContainerSupervisor`
  directly. Task 1's cell design (as originally scoped) does not reach
  production. Corroborated 2-way (codex Critical 1, feasibility Critical
  4, the latter run live). — fix per owner decision 2: this becomes its own
  task (new Task 2), not folded into the cell task. That task must: (a)
  dispatch commands without awaiting each one to completion before parsing
  the next line, tracking in-flight command promises in a set; (b) drain
  that set (await all) both on normal loop exit and inside `shutdown()`
  before returning; (c) add a command-loop-level test that blocks plugin
  A's cleanup and asserts plugin B's buffered command still dispatches and
  responds. [codex/feasibility]

- [x] **A real global aggregate counter exists and is not covered by "no
  shared counters"** — `cumulativeBytes` in `runSupervisorCommandLoop`
  (`:780-781`) sums bytes across every allocation on the shared input
  stream and throws past `MAX_CUMULATIVE_COMMAND_BYTES` (8MB), tearing down
  the entire command loop — every plugin, not just the byte-heavy one. The
  plan's Design section asserts no such counter exists; it does, in the
  same file the new command-loop task (above) must touch. — fix: fold into
  the new command-loop task (Task 2): either scope the byte limit per
  allocation instead of cumulative-across-all, or explicitly document the
  cumulative 8MB ceiling as an accepted shared-channel limit (not a
  per-plugin fault-isolation violation) and leave PNH-INV-22 mute on byte
  limits until that's resolved. State the choice explicitly rather than
  silently preserving or removing the counter. [codex]

## Important

- [x] **Cell creation/disposal is not a total function** — pre-allocation
  launch failures (identity conflict, unadmitted pluginId) create a cell at
  enqueue time with no allocation ever created to trigger disposal; late
  `handleStreamBytes` chunks after `acknowledge` deletes the allocation can
  lazily resurrect a cell nothing will dispose. Corroborated 2-way (codex
  Important, security Important). — fix: specify cell creation/disposal as
  total: dispose whenever a launch operation settles without producing an
  allocation; never lazily create a cell for a requestId with no live
  allocation (route a late stream chunk to an existing cell or drop it,
  matching today's terminal check at `:271`). [codex/security]

- [x] **Cell reclamation test (Step 2b) has no legal assertion** — the
  frozen supervisor surface (`Object.freeze({launch, cleanup, writeInput,
  closeInput, status, acknowledge, shutdown, idle})`) exposes no cell-count
  observable, and adding one widens the PROTO-02-pinned `.d.mts` for a test
  — contradicting the plan's own "surface unchanged" justification.
  Corroborated 2-way (codex Important, feasibility Important). — fix:
  replace 2b with a behavioral case: N sequential
  launch→cleanup→acknowledge cycles on distinct request IDs, then assert a
  fresh launch's `status`/`writeInput` still settle this turn. Move any
  "no leaked cell" claim to a code-review item on the disposal call site,
  not a test assertion. [codex/feasibility]

- [x] **Design mis-describes disposal timing, and the literal reading
  breaks PNH-INV-23's unmodifiable suite** — "disposed when its allocation
  is removed after terminal cleanup settles" is wrong on both halves:
  `settle()` (`:248-267`) removes nothing from the map, and the only actual
  removal is inside `acknowledge` (`:455`). An implementer following the
  literal sentence disposes the cell inside `settle`, and
  `plugin-container-supervisor.test.ts:233-249` (status/acknowledge after
  terminal cleanup) then has no cell to run on — that file is PNH-INV-23's
  named conformance proof and the plan forbids modifying it. — fix: reword
  to "disposed when `acknowledge` deletes the allocation (`:455`); terminal
  cleanup keeps both the allocation and its cell alive so the receipt stays
  readable." Also specify the tombstone path explicitly: a
  post-acknowledge `status`/`launch` call must return `{status:
  "acknowledged", ...}` via `acknowledgedFor` without ever creating a cell.
  [feasibility]

- [x] **Removing the global chain also removes the de-facto Docker CLI
  concurrency cap, with no replacement** — the shared queue today is
  incidentally the only thing bounding concurrent `spawn("docker", ...)`
  calls and their 1MB stdout/stderr buffers; one cleanup issues up to seven
  sequential docker invocations. An unbounded shutdown fan-out at SIGTERM
  with N live allocations spawns N concurrent stop/kill/remove chains at
  peak host pressure, with failures surfacing as `confirmedAbsent: false`.
  — fix: cap concurrent per-cell shutdown width at a fixed small number
  rather than an unbounded `Promise.allSettled` over every cell; add an
  explicit residual-risk note in the plan's Risks section naming the
  removed one-at-a-time bound. [security]

- [x] **Task 3's (now Task 4's) status-only activation never triggers
  `--update-lock`** — an invariant's `bindingHash` covers only `statement`
  and `bounds`, not `status`; a `proposed`→`active` flip alone leaves the
  hash unchanged, so the plan's conditional "`--update-lock` if the diff
  demands it" never fires and the lock silently stays `proposed`. A later
  commit that silently reverts the invariant then reads as a free
  `proposed`→`proposed` transition instead of an illegal `active`→`proposed`
  one — the gate cannot detect de-activation of the exact invariant this
  milestone establishes. — fix: make `--update-lock` unconditional in this
  task, and add a verification line checking the lock's PNH-INV-22 entry
  reads `"status":"active"`. [feasibility]

- [ ] **(Moot per owner decision 1 — Task 4 cut.)** Original finding: Task 4
  wires the constitution gate's known diagnostic gaps (issue #31: spawn
  failure misreported as test failure, discarded stderr) into the primary
  CI gate without acknowledging the blast-radius change. No action needed
  now; re-raise when a future plan reinstates gate-wiring. [scope]
  **Resolution (2026-08-21):** left unticked as agreed. Task 4 was cut; the
  plan's new "Deferred" section carries the re-raise note verbatim as its
  third bullet, so the concern is recorded rather than lost.

## Minor

- [x] **`dispose()` semantics are undefined against PNH-INV-23** — no
  stated behavior toward operations already queued on the chain when
  `dispose()` fires; if implemented as "reject/clear everything queued," a
  future disposal trigger could cancel a queued cleanup, and the active
  invariant's suite (which has no disposed-cell case) wouldn't catch it. —
  fix: specify that `dispose()` only releases the map entry and never
  rejects, cancels, or drops an operation already accepted by `run()`; add
  one M3-suite case asserting an operation queued before disposal still
  settles. [security]

- [x] **`npm run typecheck:pnh` gives zero coverage of the new module** —
  `tsconfig.pnh.json` has no `allowJs`, and `.mjs`/`.d.mts` files enter the
  typecheck program only transitively via a `.ts` importer; nothing
  currently imports `plugin-fault-cell.mjs`/`.d.mts` from a `.ts` file, so
  a broken declaration would pass every task's verification silently. —
  fix: require the M3 suite (a `.ts` test) to import `createFaultCell`
  directly and exercise `run`/`flush`/`dispose`, forcing the declaration
  into the typecheck program. [feasibility]

- [x] **The broker regression check in the cell task targets the wrong
  suite** — `plugin-broker.test.ts` never reaches
  `plugin-container-supervisor.mjs` (the broker talks to the supervisor
  only as a separate process over NDJSON frames); the suite that actually
  crosses that seam is `broker-gateway-routing.test.ts`. — fix: replace or
  supplement with `pnh/tests/broker-gateway-routing.test.ts` in the cell
  task's verification step. [feasibility]

- [x] **Task 1's subagent model (`fable`) violates the active model
  policy** — the global policy requires implementers/reviewers to use
  sonnet or opus, explicitly excluding fable. — fix: change to `opus` at
  high/xhigh effort. [codex]

- [ ] **(Minor, framing only, no code change needed)** Design section frames
  the fault-cell module as "deliberately shaped" for a future Option C
  escalation — itself a second still-open decision-checkpoint item. No
  actual Option C scaffolding ships, so this is a documentation concern:
  reword to justify the separate module purely by keeping new logic
  legible/scoped, dropping the Option C escalation framing until that
  decision is recorded. [scope]
  **Resolution (2026-08-21):** left unticked as agreed, but the reword *was*
  applied — Design's cell-module paragraph now justifies the separate module
  purely as "keeping the new serialization logic legible and independently
  testable; it makes no claim on any future architecture option," and the
  Option C escalation sentence is gone.
