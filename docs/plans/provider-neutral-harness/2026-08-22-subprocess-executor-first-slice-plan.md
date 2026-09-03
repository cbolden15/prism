# Subprocess executor — first slice implementation plan

Status: draft, pending owner ratification of the decision doc below. Do not
execute Tasks 3-7 until the decision doc's Status moves off "pending owner
ratification."
Date: 2026-08-22
Branch: `worktree-pnh+subprocess-executor-first-slice` (Task 1 is already
committed here as `66d9a3e`; Tasks 3-7 continue on the same branch).

Authorization: decisions 1-3 of `2026-08-22-subprocess-executor-decisions.md`,
which ratify the subprocess executor as a second, additive plugin executor
(decision 1), confirm the README trust-model statement ships unconditionally
(decision 2), and fix the first-slice scope boundary at the mechanical port
contract plus the artifact digest model — no resource caps, no
capability-disclosure UX, no CLI surface (decision 3).

## Goal

Give PNH a second plugin executor — bare `child_process.spawn`, no Docker
requirement — that is mechanically well-understood and safe to merge, while
deferring everything that depends on a genuinely unresolved design fork
(resource caps, capability-disclosure UX, a real CLI flag, the WASM roadmap)
to the decision doc's "Still open" section rather than resolving it
unilaterally inside code. Specifically: a spawn-executor artifact digest
model (Task 3), a digest-gated launch spec (Task 4), a `LifecyclePort`
implementation over `child_process.spawn` (Task 5), an override seam so a
caller can select it (Task 6), and a test proving it leaks no processes
(Task 7).

The Docker executor is not touched. `kernel/plugin-container-port.ts`,
`adapters/docker-broker-plugin-container.ts`,
`harness/plugin-container-supervisor.mjs`, and `contracts/invariants.yaml`
are reused unchanged or received zero edits, across every task in this
slice.

## Grounding (verified 2026-08-22 on `worktree-pnh+subprocess-executor-first-slice` at `66d9a3e`)

Every claim below was read off disk during this task, not assumed from the
source plan.

### No CLI entrypoint exists anywhere in `pnh/`

No `bin/` directory, no CLI-parsing dependency (`yargs`/`commander`), and no
`--sandbox`-shaped flag anywhere in `pnh/`'s `.mjs`/`.ts` source. A
`--sandbox=container` flag has nothing to attach to today. This is why Task
6 delivers an override *parameter*, not a flag — a CLI surface is later,
separate work per decision 3.

### uid/gid drop requires privilege the unprivileged caller doesn't have

`child_process.spawn(..., { uid, gid })` requires the *calling* process to
already hold privilege to switch to an arbitrary target uid. Under the
unprivileged invocation this whole project targets, requesting uid `10101`
throws `EPERM`. The README's Task 1 text (`pnh/README.md:36-58`, "Plugin
runtime trust model") already states this as the common case, not an edge
case — Task 5 is where that framing becomes enforced behavior (a loud,
structured warning, never a silent swallow).

### The Docker supervisor's helpers are module-private, and one is not a named factory at all

`pnh/harness/plugin-container-supervisor.mjs` has one module-private helper
directly reusable in name: `createSerializedFrameWriter` (line 731, not
exported). The source plan's second cited helper, `createInFlightCommands`,
does not exist as a separate named factory in this file — duplicate-command-ID
tracking is inline: a bare `Set` called `commandIds` (line 775) checked and
grown at lines 805-806 inside `runSupervisorCommandLoop`. Task 5 needs to
reimplement the *behavior* (serialized frame writes shared between
`emitEvent` and the command loop; duplicate-ID rejection), not necessarily
under those exact two function names — the source plan's naming is
approximate here and Task 5's implementer should not go looking for a
`createInFlightCommands` export that was never there.

The exact `LifecyclePort` duck-type check `createPluginContainerSupervisor`
runs at construction is at lines 128-129 (loop over
`["create", "startAttached", "inspect", "stop", "kill", "remove"]`,
throwing `TypeError` on any missing method). The reference implementation,
`createDockerCliLifecyclePort`, starts at line 547 and runs to line 644.

### No artifact-digest equivalent to `imageDigest` exists for a spawn plugin

`pnh/runtime/plugin-launch-spec.ts`'s `computeRunnerDigest` (line 118) is
the pattern to mirror: it hashes a fixed list of named files
(`Containerfile`, `image.lock.json`, `entrypoint.mjs`, `protocol.ts`) with
`sha256`, then wraps the `[name, hash]` pairs in one more `sha256` over a
tagged JSON array. `createAdmittedPluginLaunchSpec` (line 142) is the
commitment-cross-check pattern Task 4 mirrors for the spawn executor.

Fixture plugins under `pnh/host-tests/fixtures/registration-plugins/*/`
(checked: `tool-golden/`) are exactly two files on disk:
`manifest.json` and `index.mjs`. That is the flat two-file shape Task 3's
digest function hashes — no build step exists for a spawn plugin the way
`pnh/scripts/build-plugin-image.ts` (confirmed present) builds one for
Docker.

### The Docker launch profile backs every claim in the README's Task 1 section

`pnh/kernel/plugin-runner/launch-profile.json` confirms, field for field,
the README's trust-model claims: `"network": "none"`, `"readOnly": true`,
`"capDrop": ["ALL"]`, `"seccomp": "seccomp.json"`, `"pidsLimit": 64`,
`"memory": "128m"`, `"cpus": "0.5"`, `"user": "10101:10101"`.

### The override seam this slice needs is a single hardcoded path

`pnh/harness/sandbox/broker-gateway.mjs`'s `spawnGatewayChildren` (line
426) destructures its options at lines 427-434 and resolves
`supervisorPath` from a fixed, relative location at line 439
(`resolve(gatewayDirectory, "..", "plugin-container-supervisor.mjs")`).
That single resolved path is the one seam Task 6 needs to make overridable.

### `pnh/host-tests/m2-plugin-registration.test.ts` is the real shape to model Task 7 on

Confirmed present: real `node:test`, a real fixture plugin, a real spawned
gateway process wired via fd-3 startup plus stdio, `try/finally` cleanup.
Task 7's new test follows this same shape against the spawn path instead of
the Docker path.

### No resource-cap primitive exists in the repo

A repo-wide search at `66d9a3e` for rlimit/cgroup/`setrlimit`/`process.resourceUsage`/`ulimit`-shaped
names returns nothing relevant to bounding a spawned child process — the
only matches are an unrelated capability-catalog test file. This backs
decision 3's scope boundary directly: there is no existing primitive this
slice could wire resource caps to even if it wanted to.

## Design decisions to settle before execution

These are genuine forks already visible in the source plan's own text, not
invented for this document. A task implementer should treat the
recommendation below as a starting point, not a resolution — Task 5's own
acceptance criteria say to stop and report `DONE_WITH_CONCERNS` or
`BLOCKED` if this forces a choice bigger than expected.

### D1: how the spawn launch spec satisfies (or bypasses) the supervisor's validator

`createPluginContainerSupervisor`'s `validateLaunchSpec` hard-requires a
64-hex `imageDigest` and a non-empty `createArgs` on every launch spec —
both Docker-shaped fields Task 4's `PluginSpawnLaunchSpec` will not have,
by design (decision 1: no `createArgs`-shaped field belongs on this
executor's vocabulary).

- **D1-a. The spawn supervisor owns its own `resolveLaunchSpec`/validation
  path that never routes through the shared Docker-shaped validator.**
  Clean separation; zero risk of accidentally weakening
  `validateLaunchSpec` for the Docker path, since nothing about it changes.
- **D1-b. An adapter maps `PluginSpawnLaunchSpec` into whatever minimal
  shape the supervisor's validator actually requires, without adding
  Docker-specific fields.** Smaller diff if the minimal accepted shape
  turns out to be genuinely minimal, but risks silently depending on
  incidental behavior of a validator that was never designed for a second
  shape.
- **D1-c. Relax `validateLaunchSpec` itself to accept either shape.**
  Rejected outright — Global Constraints (both this doc and the decision
  doc) forbid any edit to `plugin-container-supervisor.mjs`.

**Draft recommendation: D1-a.** A dedicated `resolveLaunchSpec` for the
spawn path keeps the zero-edit constraint on the Docker file trivially true
by construction, rather than by careful auditing of what an adapter happens
to trigger inside a validator built for a different executor.

### D2: the override parameter's name and shape

Task 6 needs an optional override on `spawnGatewayChildren`'s options
object. The source plan names two candidate shapes without picking one.

- **D2-a. `supervisorPath`** — a string path to a module, resolved and
  imported inside `spawnGatewayChildren` exactly the way the hardcoded
  default path already is at line 439.
- **D2-b. `supervisorModule`** — an already-imported module
  object/namespace, passed in directly by the caller, skipping dynamic
  import inside `spawnGatewayChildren`.

**Draft recommendation: D2-a.** Keeping the override as a path preserves
the existing shape exactly — the current hardcoded default is a path
literal, so a path override is the smallest possible change to that one
line, and it keeps `spawnGatewayChildren` as the single place responsible
for resolving module identity for either executor.

## Non-goals

Restated from the source plan's "Explicitly deferred" section — these are
not tasks in this document, and nothing in Tasks 1-7 should be read as
building toward them implicitly:

- Resource caps (memory/cpu/pids/network isolation for the spawn
  executor) — no existing primitive in the repo, needs its own
  decision-doc fork when scheduled.
- Capability-disclosure UX — zero existing surface for either executor,
  genuinely new work.
- A real `--sandbox` CLI flag — blocked on `pnh/` growing a CLI entrypoint
  at all.
- The WASM roadmap doc.
- Flipping the *default* executor. This slice makes the spawn executor
  available and selectable via an override; it does not make it what a
  caller gets without asking.

## Global constraints

Binding across every task below, copied from the source plan and the
decision doc:

- Zero edits to `pnh/harness/plugin-container-supervisor.mjs`,
  `pnh/kernel/plugin-fault-cell.mjs`, or `pnh/contracts/invariants.yaml` in
  any task. No new `PNH-INV-*` entries, no PROTO-02 amendment.
- Never present unshipped behavior as if it's live — README, decision doc,
  and this plan describe only what this slice actually implements; deferred
  items are named as deferred.
- uid/gid drop is framed everywhere as best-effort and typically inert
  under an unprivileged invocation (`EPERM` the common case, not an edge
  case) — never described as reliable privilege dropping.
- The new test file (Task 7) must not use an `m*` prefix — that namespace
  belongs to the separate isolation-topology milestone track
  (`pnh/m3-logical-cells` and its descendants).
- Each task's commit message, given verbatim in the task, is exact —
  conventional-commit format, `pnh` scope.
- `npm run test:pnh` must pass after every task.

## Tasks

### Task 1: README trust-model section — complete

Committed `66d9a3e`, `docs(pnh): state the plugin runtime trust model in
the README`. Restated here only for completeness of the seven-task slice;
no further action.

### Task 2: Decision doc + implementation plan doc — complete

This document and `2026-08-22-subprocess-executor-decisions.md`, committed
under `docs(pnh): ratify the subprocess executor direction and scope the
first slice`.

<!-- model: sonnet:high -->

### Task 3: Spawn artifact-digest model

Resolve what gets hashed for a spawn-executor plugin, since Docker's
`imageDigest` pins a *built image* and spawn has no build step. Read
`pnh/runtime/plugin-launch-spec.ts`'s `computeRunnerDigest` for the pattern
to mirror, and `pnh/scripts/build-plugin-image.ts` for the flat-file shape
a plugin actually has on disk (`manifest.json` + entrypoint file, per
`pnh/host-tests/fixtures/registration-plugins/*/`).

Recommend and implement: hash `manifest.json` + the entrypoint file's raw
bytes, same pattern `computeRunnerDigest` uses for named files. Write this
as a pure, deterministic function with a unit test proving two
byte-identical fixture directories produce the same digest and a one-byte
change in either input file moves it.

No dependencies — can start immediately. Blocks Task 4.

Acceptance:
- Function is pure (no I/O side effects beyond reading the named input
  files) and deterministic.
- Test proves determinism AND sensitivity to a single-byte change in each
  hashed input.
- Header comment documents the digest model decision inline, mirroring
  `computeRunnerDigest`'s own documentation style.

Commit: `feat(pnh): define the spawn-executor artifact digest`

<!-- model: sonnet:high -->

### Task 4: `spawn-profile.json` + `createAdmittedPluginSpawnLaunchSpec`

Depends on Task 3 (the digest function).

Create `pnh/kernel/plugin-runner/spawn-profile.json`, sibling to the
existing `launch-profile.json` in the same directory, but with only fields
meaningful to a bare subprocess: entrypoint-path convention, `cwd`, an env
allowlist, and a `uid`/`gid` field explicitly documented (in an adjacent
comment or the profile-loading code) as best-effort/inert per the Global
Constraints — no network/filesystem/resource-limit claims anywhere in this
file, since the executor doesn't enforce any.

Create `pnh/runtime/plugin-spawn-launch-spec.ts` exporting
`PluginSpawnLaunchSpec` and `createAdmittedPluginSpawnLaunchSpec`, mirroring
`createAdmittedPluginLaunchSpec`'s pattern in `plugin-launch-spec.ts`:
compute commitments from the committed artifacts (via Task 3's digest
function) and cross-check against the `AdmissionTicket`'s admitted
descriptor before returning a frozen spec — reject on any mismatch, exactly
as the Docker path does.

Acceptance:
- `PluginSpawnLaunchSpec` has no `createArgs`-shaped field (that's Docker's
  vocabulary, not this executor's).
- Commitment mismatch throws with a clear error, matching
  `createAdmittedPluginLaunchSpec`'s error-on-mismatch behavior.
- Valid ticket + matching digest produces a frozen, well-typed spec.
- Unit tests cover both the mismatch-throws and success paths.

Commit: `feat(pnh): add a digest-gated launch spec for the spawn executor`

<!-- model: opus -->

### Task 5: `createSpawnLifecyclePort` + `plugin-spawn-supervisor.mjs`

Depends on Task 4 (the spawn profile and launch spec).

Create `pnh/harness/plugin-spawn-supervisor.mjs` (+ `.d.mts`). It must:

1. Implement the exact 6-method `LifecyclePort` duck-type contract that
   `createPluginContainerSupervisor` validates at construction (read
   `pnh/harness/plugin-container-supervisor.mjs` lines 128-129 for the
   exact check, and the `createDockerCliLifecyclePort` reference
   implementation at line 547 for exact per-method signatures/return
   shapes): `create(input)`, `startAttached(containerId, handlers)`,
   `inspect(containerRef)`, `stop(containerId)`, `kill(containerId)`,
   `remove(containerId)`.
2. Implement these over `child_process.spawn`, not `docker`. `create`
   spawns the process (not yet attached); `startAttached` wires
   stdout/stderr/close handlers and returns `{write, closeInput}`;
   `inspect` reports process liveness/exit state; `stop`/`kill`/`remove`
   terminate and reap it.
3. Attempt `uid`/`gid` from Task 4's spawn profile. On `EPERM` (the common
   case under an unprivileged invocation), fall back to the invoking user
   and emit a loud, structured warning event through the same `emitEvent`
   mechanism the supervisor already uses — never a silent swallow.
4. Own its own `main()`/`invokedDirectly` guard, matching
   `plugin-container-supervisor.mjs`'s pattern, and construct
   `createPluginContainerSupervisor` (imported unchanged from the existing
   file) with this new port plugged in as the `docker` param.
5. Reimplement only the minimal serialized-frame-write and duplicate-ID
   tracking behavior needed to share one writer instance between the
   supervisor's `emitEvent` and the command loop — this Grounding section's
   findings on `createSerializedFrameWriter` (module-private, line 731) and
   the inline `commandIds` `Set` (lines 775, 805-806) apply; do NOT export
   anything from `plugin-container-supervisor.mjs`. Keep it small.
6. Resolve D1 above: `validateLaunchSpec` hard-requires `imageDigest`
   (64-hex) and non-empty `createArgs` on every launch spec — Task 4's
   `PluginSpawnLaunchSpec` won't satisfy that shape. This module needs
   either its own `resolveLaunchSpec`/validation path that doesn't route
   through the Docker-shaped validator (D1-a, the draft recommendation), or
   an adapter that maps the spawn spec into whatever minimal shape the
   supervisor's validator actually requires without adding Docker-specific
   fields (D1-b). If this forces a design choice beyond what's specified
   here, stop and report `DONE_WITH_CONCERNS` or `BLOCKED` rather than
   guessing.

Acceptance:
- `git diff --stat` against this task's BASE shows
  `plugin-container-supervisor.mjs` and `plugin-fault-cell.mjs` untouched.
- The new port passes the exact same 6-method duck-type check
  `createPluginContainerSupervisor` runs — verify by constructing it with
  the new port and confirming no `TypeError` is thrown.
- `EPERM` fallback path has a test proving it warns loudly (not silently)
  and continues as the invoking user rather than crashing.

Commit: `feat(pnh): add a bare-subprocess lifecycle port for the plugin supervisor`

<!-- model: sonnet:high -->

### Task 6: Wire the `spawnGatewayChildren` override seam

No dependency on Tasks 3-5 — can run any time after Task 2, in parallel
with the Task 3→4→5 chain if dispatched as a separate task (sequentially,
per this workflow's own rule against parallel implementer dispatch).

Edit `pnh/harness/sandbox/broker-gateway.mjs` (+ `.d.mts`): add an optional
override parameter to `spawnGatewayChildren`'s options object (this
Grounding section confirms the destructuring at lines 427-434 and the
hardcoded `supervisorPath` resolution at line 439), defaulting to today's
hardcoded Docker supervisor path unchanged when not passed. Resolve D2
above when naming the parameter — `supervisorPath` (D2-a, the draft
recommendation) or `supervisorModule` (D2-b). No CLI flag — this delivers
the seam only, consumed directly by Task 7's test.

Acceptance:
- Default behavior (no override passed) is byte-identical to current
  behavior.
- Existing `pnh/tests/broker-gateway-routing.test.ts` passes unmodified.
- New override is typed correctly in the `.d.mts` sibling.

Commit: `feat(pnh): let broker-gateway select an alternate plugin supervisor module`

<!-- model: sonnet:high -->

### Task 7: Zero-leaked-process test

Depends on Task 5 (the spawn port/supervisor) and Task 6 (the override
seam) both being complete.

Create `pnh/host-tests/spawn-lifecycle-port.test.ts`, modeled directly on
`pnh/host-tests/m2-plugin-registration.test.ts`'s shape (confirmed present
in this Grounding section: real `node:test`, real fixture plugin built via
existing fixture-building helpers, real spawned gateway process wired via
fd-3 startup + stdio, `try/finally` cleanup guarantee) but exercising the
spawn path via Task 6's override instead of the Docker path, and asserting
**no child process survives cleanup** (track the spawned PID(s) and assert
none remain alive after teardown — the process-based analogue of the
existing `dockerContainerIds(requestId) === ""` assertion pattern).

Prove the test is real, not vacuous: temporarily break the cleanup path,
confirm the test goes red, then restore it and confirm green. Report both
runs' output in the implementer report as TDD evidence.

Acceptance:
- Test uses real spawned processes, not mocks.
- Test is proven to fail when cleanup is broken (RED evidence in the
  report) and pass when cleanup works (GREEN evidence).
- File does not use an `m*` prefix (Global Constraints).

Commit: `test(pnh): prove the spawn executor leaks no processes on cleanup`

## Deferred

Restated from the source plan, unchanged: resource caps (memory/cpu/pids/network
isolation — no existing primitive in the repo, needs its own decision-doc
fork), capability-disclosure UX (zero existing surface, genuinely new), a
real `--sandbox` CLI flag (blocked on `pnh/` growing a CLI entrypoint at
all), the WASM roadmap doc, and flipping the *default* executor (this slice
makes spawn available, not default).

## Risks

- **Two supervisor implementations drift apart over time.** Task 5
  reimplements frame-writer and duplicate-ID-tracking behavior instead of
  importing it (decision 1's known-cost, accepted). If the Docker
  supervisor's behavior in this area changes later, nothing forces the
  spawn supervisor to change with it. Mitigation: keep the reimplemented
  surface as small as the Grounding section's findings show it needs to
  be, and note the duplication explicitly in Task 5's code comments so a
  future editor of one file remembers to check the other.
- **The `EPERM` fallback silently doesn't fire.** If Task 5's uid/gid
  attempt is wrapped in error handling that's too broad, a real
  privilege-drop failure could be swallowed instead of warned loudly,
  which is exactly the failure mode Global Constraints forbid. Task 5's
  required test (warns loudly, doesn't crash) is the direct mitigation —
  treat it as non-negotiable, not optional coverage.
- **D1 turns out to need more than a `resolveLaunchSpec` swap.** If
  `validateLaunchSpec`'s Docker-shaped requirements are more deeply
  entangled with `createPluginContainerSupervisor`'s internals than this
  Grounding section's read suggests, Task 5 may hit a design question
  bigger than D1-a vs. D1-b. Task 5's own acceptance criteria already
  require stopping and reporting `DONE_WITH_CONCERNS`/`BLOCKED` in that
  case rather than guessing — this is a known possibility, not a hidden
  one.
- **Task 7's TDD evidence gets skipped under time pressure.** A test that
  is never proven to fail on broken cleanup is indistinguishable from a
  vacuous one. This is already a stated acceptance criterion, not a new
  risk invented here, but it is the single most likely task in this slice
  to get shortcut.

## Verification

Restated from the source plan:

- `npm run test:pnh` (root `package.json`: `typecheck:pnh && check:pnh-graph
  && node pnh/harness/run-sandbox.mjs`) passes after every task.
- Task 5: `git diff --stat` shows `plugin-container-supervisor.mjs` and
  `plugin-fault-cell.mjs` untouched; the new port passes the same duck-type
  check `createPluginContainerSupervisor` runs at construction.
- Task 6: existing `pnh/tests/broker-gateway-routing.test.ts` passes
  unmodified with no override passed (default behavior byte-identical).
- Task 7: new `pnh/host-tests/spawn-lifecycle-port.test.ts` passes with
  real spawned processes (not mocks), and is confirmed to fail red when
  cleanup is intentionally broken.
- Confirm `pnh/contracts/invariants.yaml` is untouched across all seven
  tasks — no `PNH-INV-*` additions, no PROTO-02 amendment triggered.
