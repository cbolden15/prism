# Narrow shared arbiter — implementation plan (draft)

Status: **complete 2026-08-26.** Implementation and adversarial outcome are
recorded in `2026-08-26-m3-adversarial-isolation-decision.md`.
Date: 2026-08-22, hardened 2026-08-26
Branch: `goal/prism-harness`

Authorization: decision 4 of `2026-08-22-m3-isolation-topology-decisions.md`, which
records the aggregate arbiter as unbuilt work blocking the rest of M3. Decision 5's
ordering constraint is the reason this comes before the adversarial suite: until
the arbiter exists, an escalation failure cannot be attributed to insufficient
logical isolation rather than to a missing arbiter.

## Goal

Give the harness one shared arbiter that reserves and releases aggregate capacity,
and one source of truth for the bound values, so that cross-plugin interference is
quantitatively bounded and enforced rather than incidental. Specifically: an
admission cap on concurrent live allocations, a concurrency bound on Docker CLI
invocations, per-allocation ingest accounting to replace an unattributable
process-lifetime byte cap, and registry-sourced bounds that tests import.

The arbiter reserves and releases capacity **without owning plugin settlement and
without interpreting plugin payloads** (`2026-08-21-m3-plugin-isolation-architecture-options.md:206-211`).

## Grounding (verified 2026-08-22 on `main` at `7badcff`)

Every claim below was read off disk during planning. Note that `.codegraph/`'s
index covers TypeScript only and does not include `pnh/harness/*.mjs`; do not
trust it for this work.

### The four byte counters do not share a source

| Layer | File:line | Frame | Cumulative |
|---|---|---|---|
| SDK protocol | `pnh/sdk/protocol.ts:5-6` | 1 MB | 8 MB |
| Broker | `pnh/harness/plugin-container-broker.mjs:8-9` | 1 MB | 8 MB |
| Gateway | `pnh/harness/sandbox/broker-gateway.mjs:9-10` | 1 MB | 8 MB |
| Adapter | `pnh/adapters/docker-broker-plugin-container.ts:17-18` | 1 MB | **16 MB** |

Four independent declarations, no shared import. Three agree by coincidence; the
adapter's cumulative bound is double the others. Constitution `check 7`
(`pnh/tests/constitution-gate.test.ts:79-85`) pins PNH-INV-03's bounds to
`protocol.ts`'s exports **only** — nothing keeps the three harness-layer copies
equal to it or to each other. This is drift waiting to happen and it is already
half-happened.

### The supervisor's cumulative cap is a process-lifetime cap

`runSupervisorCommandLoop` accumulates `cumulativeBytes += chunk.byteLength` for
every chunk ever received and throws past `MAX_CUMULATIVE_COMMAND_BYTES` (8 MB)
(`pnh/harness/plugin-container-supervisor.mjs:881-885`). It is not a rate limit and
not an in-flight limit. A perfectly well-behaved long-running supervisor tears
itself down after roughly 8 MB of total traffic. The breach path throws out of the
`for await` loop, unwinds `main()`'s `try/finally`, reaps every live container, and
exits the process — it is not a per-command error frame.

It is also counted **before** any frame is parsed, so the bytes are not attributable
to a `requestId` at the point they are measured. That is why PNH-INV-22 was
deliberately left mute on byte limits.

### `commandIds` is an unbounded accumulator, currently masked

The duplicate-ID rejection set (`:879`, `:909-910`) is only ever added to and never
pruned. It retains every command ID for the process lifetime. Today the 8 MB
lifetime byte cap kills the process at roughly 40k commands before the set grows
large, so **fixing the byte cap without addressing this converts a bounded failure
into an unbounded memory leak.** The two are coupled and must be resolved together.

### No admission cap exists anywhere

- `allocations` (`:142`) grows on `launchInternal` (`:339`), shrinks only on
  `acknowledge` (`:503`). No size check before `.set()`.
- `cells` (`:144`) grows in the `launch` handler (`:426-431`), shrinks via
  `releaseCell()` (`:154-158`). No cap.
- Broker `pending` (`plugin-container-broker.mjs:182`), adapter `pending`
  (`docker-broker-plugin-container.ts:385`): no cap.
- Gateway `allocations` (`sandbox/broker-gateway.mjs:242`) is set on launch (`:318`)
  and deleted **only** on `acknowledge` (`:335`). A cleanup that never reaches
  acknowledge leaves the entry behind — a leak distinct from the missing cap.

A repo-wide search for `MAX_ALLOCATIONS` / `maxAllocations` / `MAX_CONCURRENT` /
`MAX_LIVE` / semaphore-shaped names returns nothing outside test filenames.

### Docker concurrency is now entirely unbounded during live traffic

Two spawn sites, both in `plugin-container-supervisor.mjs`: `defaultRunDocker`
(`:542-575`, one-shot `create`/`inspect`/`stop`/`kill`/`remove`, capped at
`MAX_DOCKER_OUTPUT_BYTES` = 1 MB of stdout+stderr per invocation) and
`defaultSpawnAttached` (`:577-603`, the long-lived `docker start -a -i`, which does
no buffering at the spawn layer at all).

One cleanup issues up to seven sequential invocations (the code says so at
`:18-19`). A launch issues inspect, create, inspect, then attach. Per-allocation
fault cells serialize operations **within** one `requestId` and nothing serializes
across cells, so every live allocation runs its Docker chain fully in parallel with
every other. The M3 branch removed the global promise chain that used to provide
this bound incidentally; `SHUTDOWN_FANOUT_WIDTH = 4` (`:20`) restored it for the
SIGTERM path only and never applies to live traffic.

One layer up, `pnh/runtime/internal/plugin-session.ts:403-421` drives a task's
admitted plugin set through a sequential `for...of` with an `await` inside, so
within one task-runtime process only one plugin session is in flight at a time.
That is an emergent property of loop structure, not a cap, and it says nothing
about two concurrent tasks each spawning their own supervisor/broker/gateway trio.

### Existing coverage

`pnh/tests/protocol-bounds.test.ts:63,80,126` exercises frame, cumulative, and
string bounds — but against `pnh/sdk/protocol.ts`'s `NdjsonFrameDecoder`, a
different layer that never touches `pnh/harness/*.mjs`. The per-allocation stream
overflow path is covered at `pnh/tests/plugin-container-supervisor.test.ts:385-396`.

**No test anywhere exercises** the shared wire-byte counters under concurrent
multi-plugin load, unbounded growth of any map, or admission-time rejection —
because no rejection path exists.

### Invariant targets

`PNH-INV-38` "Bounded cross-plugin interference" (`pnh/contracts/invariants.yaml:493-507`)
is the invariant this work exists to satisfy. Its statement already demands the
architecture: *"the bound values live in this registry and tests import them."* Its
only current bound is `max_cross_plugin_stall_ms: 50`, which is a wall-clock claim
— see decision D3 below. `PNH-INV-26` ("fault cells are not security boundaries")
constrains how the arbiter may be described.

## Design decisions

These forks were challenged against the current process topology on 2026-08-26.

### D1: where the shared bound constants live

The values must be importable by `.mjs` harness files, `.ts` adapter and SDK files,
and the constitution gate.

- **D1-a. Extend `pnh/sdk/protocol.ts` and import it everywhere.** Smallest diff,
  and check 7 already pins it. But it makes the harness depend on the SDK wire
  protocol module for unrelated limits, and conflates two layers that the grounding
  above shows are genuinely distinct.
- **D1-b. New `pnh/contracts/bounds.ts`, generated from or checked against the
  registry, imported by all four layers.** Matches PNH-INV-38's "bound values live
  in this registry" most literally, and puts one file under the gate. Costs a new
  module and a new constitution check.
- **D1-c. Leave the constants where they are and add a constitution check that
  asserts all four declarations are equal.** Cheapest, changes no runtime code,
  and catches drift. But it enforces sameness without establishing a source of
  truth, and it cannot stop a fifth copy from appearing.

**Selected: D1-b.** Use an ESM contracts module that both `.mjs` and TypeScript
can import, and make the constitution gate compare it to the registry. The
registry remains authoritative; drift fails the gate.

### D2: `commandIds` retention

Duplicate-command-ID rejection is a correctness property; bounding the set weakens
it somewhere. Pick the weakening deliberately.

- **D2-a. Retain IDs only for in-flight plus a bounded recently-completed window.**
  Bounded memory; duplicate detection becomes best-effort beyond the window.
- **D2-b. Tie ID retention to allocation lifetime**, dropping IDs when their
  allocation is acknowledged. Attributable and self-cleaning, but commands that
  carry no allocation have no natural owner.
- **D2-c. Keep the set unbounded and add an explicit cap that fails closed.**
  Preserves detection exactly; converts a silent leak into a loud, bounded failure.

**Selected: a D2-a/D2-b combination.** Retain command IDs while their allocation
is live, release them when that allocation is acknowledged, and keep only a
bounded recent replay window afterward. A global fail-closed command-ID cap was
rejected because one busy allocation could exhaust it and deny every unrelated
plugin. Replay detection outside the documented window is intentionally not a
process-lifetime guarantee.

### D3: PNH-INV-38's `max_cross_plugin_stall_ms: 50`

This bound is wall-clock and the suites run under fake timers, so it cannot be
proven by anything in this plan. It currently blocks activating PNH-INV-38 honestly.

- **D3-a. Leave PNH-INV-38 `proposed`.** Add the arbiter's bounds to it, prove what
  can be proven, and activate later once a timed harness exists. Nothing is
  overclaimed; the invariant stays unenforced meanwhile.
- **D3-b. Move the stall bound to PNH-INV-01** (which already carries the same
  value) and activate PNH-INV-38 on the arbiter bounds alone. Removing a bound is a
  weakening and needs an amendment with its own decision record.
- **D3-c. Build a real-timer stall test and prove the 50 ms bound.** The honest
  route to activation, and the only one that discharges the claim, but timing tests
  are flaky under CI load and a flaky constitution gate is worse than an unactivated
  invariant.

**Selected: D3-a for this plan, with D3-c as its own follow-up.** Adding bounds
is additive and provable; removing one to unlock activation is the kind of move
the constitution exists to prevent.

### D4: arbiter scope

The current composition starts one lifecycle supervisor for each harness
session. An arbiter instantiated by that supervisor therefore cannot satisfy
PNH-INV-35's stronger host-wide claim across all harness instances.

**Selected: implement and describe the arbiter as supervisor-scoped.** This
closes the concrete M3 gaps for cross-plugin allocations sharing that lifecycle
principal. PNH-INV-35 remains proposed until a real host-shared daemon exists;
this plan must not activate it or describe the module as host-wide.

## Non-goals

- No physical splitting, no Option C work, no per-plugin processes. Decision 1
  ratified Option A narrowly and its provisional status stays open.
- No additional Docker-capable principals. Decision 2 rejected Option B.
- No adversarial suite for criteria 2, 3, or 5 — decision 5's ordering constraint
  puts that after this work, not inside it.
- No wall-clock proof of the 50 ms stall bound (see D3).
- No "M3 is green" declaration and no constitution-gate wiring into `test:pnh`.
  The sandbox module-resolution and docs-mount blockers that used to prevent the
  gate from running there are fixed (0e4f7ce); wiring it into `test:pnh` is still
  out of scope for this narrow arbiter plan.
- The arbiter must not become a security boundary in its description or its tests
  (PNH-INV-26).

## Global constraints

- Never modify `pnh/core/` or `pnh/runtime/`. Whether `pnh/kernel/` and
  `pnh/sdk/` may be touched depends on D1 and must be settled before Task 1.
- The supervisor stays payload-blind; the arbiter never parses plugin payload bytes
  and never owns settlement.
- No new npm dependencies.
- `pnh/tests/plugin-container-supervisor.test.ts` is PNH-INV-23's conformance proof
  and must pass unmodified after every task. `pnh/tests/m3-plugin-fault-isolation.test.ts`
  is PNH-INV-22's and must keep passing; add cases only.
- Editing `plugin-container-supervisor.mjs` or `plugin-fault-cell.mjs` moves the
  PNH-PROTO-02 pinned hash and requires an amendment (Task 6). Read the current
  `from_hash` out of `invariants.lock` at execution time; do not trust a constant
  written here.
- Commit after each task with the message given. `git commit -m` or `-F` file,
  never a heredoc. Never push.
- Verification per task: the task's named suites plus `npm run typecheck:pnh`.
- After each task, perform a focused main-session spec-compliance review before
  starting the next. Implementation is not delegated.

## Tasks

<!-- model: sonnet:high -->

### Task 1: Red suite for the aggregate gaps

New file `pnh/tests/m3-aggregate-arbiter.test.ts`. Every case must fail against
current `main` for the stated reason, and each must assert a behaviour rather than
an implementation detail.

- Unbounded admission: N concurrent launches across distinct plugins all succeed
  with no rejection at any N.
- Unbounded Docker concurrency: N concurrent launches produce N overlapping Docker
  invocations, observed through a fake Docker that records overlap depth.
- Lifetime byte cap: a supervisor fed well-formed traffic totalling more than 8 MB
  tears down, with no plugin having misbehaved.
- `commandIds` growth: the set retains IDs for commands whose allocations have long
  since been acknowledged.
- Constant drift: the adapter's cumulative bound differs from the other three
  layers'.

Commit: `test(pnh): add red suite for unbounded aggregate resource use`

<!-- model: sonnet:high -->

### Task 2: One source of truth for bound values

Implements D1. Whichever option is chosen, the outcome is that every layer reads
the same values from one place and a constitution check fails if a copy drifts.
Resolve the adapter's 16 MB divergence explicitly: either it was deliberate, in
which case it needs a name and a recorded reason, or it was drift and it converges.

Commit: `refactor(pnh): source transport bound values from one place`

<!-- model: opus -->

### Task 3: The arbiter module

New `pnh/harness/plugin-resource-arbiter.mjs` + `.d.mts`. A reserve/release
primitive with no knowledge of settlement, receipts, or payloads. It must express
at least: maximum concurrent live allocations, and maximum concurrent Docker
invocations. Reservations must be released on every path including failure, and the
module must be independently testable in isolation the way `plugin-fault-cell.mjs`
is.

Deadlock is the hazard to design against: a cleanup that needs a Docker reservation
must never be blocked behind an admission reservation held by the allocation it is
trying to clean up. State the ordering rule explicitly and test it.

Commit: `feat(pnh): add the shared resource arbiter`

<!-- model: opus -->

### Task 4: Wire admission and Docker concurrency

Apply the arbiter at launch admission and around both spawn sites. Rejection at
admission must produce a well-formed, attributable refusal — not a teardown — and
must not leave a cell or allocation behind. PNH-INV-23's uncancellable cleanup path
must remain uncancellable: cleanup work already accepted cannot be starved by
admission pressure.

Commit: `feat(pnh): bound concurrent allocations and Docker invocations`

<!-- model: opus -->

### Task 5: Per-allocation ingest accounting

Replace the process-lifetime cumulative cap with a bounded unparsed-buffer limit at
the transport (which is attributable to a connection, not a plugin) plus
per-allocation decoded-byte accounting after `validateCommand`. Resolve D2 in the
same task, since the two are coupled. A byte-heavy plugin must degrade its own
allocation rather than the channel.

Commit: `fix(pnh): scope command ingest accounting to the owning allocation`

<!-- model: sonnet:high -->

### Task 6: PNH-PROTO-02 amendment

The supervisor and the new arbiter module are pinned schema sources after Tasks 3
through 5. Follow the pattern of `2026-08-21-supervisor-fault-cell-amendment.md`:
widen `schema_source` to include the arbiter, recompute over every pinned file,
read `from_hash` out of the lock at execution time, and write a dated decision
record. Judge honestly whether admission rejection is an observable protocol change
that moves `version` past 1 — unlike the M3 refactor, this one adds a new refusal
the caller can see.

Commit: `docs(pnh): amend PNH-PROTO-02 for the arbiter`

<!-- model: sonnet:high -->

### Task 7: Registry bounds and PNH-INV-38

Add the arbiter's bounds to PNH-INV-38 and make the tests import them, which is
what its statement demands. Follow D3: leave it `proposed` unless the hardening
pass overturns that, and do not remove the stall bound to unlock activation.

Commit: `feat(pnh): register the arbiter bounds on PNH-INV-38`

## Deferred

- The wall-clock 50 ms stall proof and any PNH-INV-38 or PNH-INV-01 activation that
  depends on it (D3-c).
- The gateway `allocations` leak at `sandbox/broker-gateway.mjs:318,335`. Real, but
  a different defect from the missing cap; worth its own small fix so it is not
  buried inside this plan's diff.
- The adversarial suite for criteria 2, 3, and 5, which decision 5 orders after this
  work.
- Making `test:constitution` runnable inside the sandbox runner.

## Risks

- **Deadlock between admission and cleanup reservations.** The most likely way this
  plan produces an outage rather than a bound. Task 3's ordering rule is the
  mitigation and it needs an explicit test, not an argument.
- **A cap that is too low turns a bound into an outage.** The bound values are a
  product decision as much as a technical one; a hardening pass should challenge
  whatever numbers Task 2 picks, and they should be registry-sourced so changing
  them is an amendment rather than an edit.
- **Fixing the byte cap unmasks the `commandIds` leak.** Tasks 4 and 5 must land
  together or the branch is briefly worse than `main`.
- **PROTO-02 `version` may genuinely need to move.** Admission rejection is a new
  caller-visible outcome. If it moves, downstream consumers need review, and that is
  a larger blast radius than the M3 amendment had.
- **Scope creep toward Option C.** The arbiter is explicitly a narrow reserve and
  release primitive. If implementation starts wanting per-plugin processes or its
  own Docker authority, stop and surface it — that is the escalation decision, and
  decision 5 says the evidence for it does not exist yet.
