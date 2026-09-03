# Subprocess executor: recorded decisions

Date: 2026-08-22
Status: draft, pending owner ratification
Supersedes: N/A — new initiative
Evidence: `pnh/README.md`'s "Plugin runtime trust model" section (added in
this slice's Task 1, committed `66d9a3e`) plus direct repository
verification at `66d9a3e` — see the implementation plan's Grounding
section for the exact file:line facts.

This slice adds a second, additive plugin executor (bare
`child_process.spawn`, no Docker requirement) alongside the existing Docker
executor. Three of the direction's open questions are settled here.
Five more are named as still open, each with a recommendation.

## Decision 1: the subprocess executor is ratified as a second, additive executor

**The subprocess executor is ratified as a second, additive plugin
executor — the Docker executor is not replaced, deprecated, or made
second-class.**

1. Docker is the adoption wall for the "average GitHub user" — the exact
   audience a competing harness won by making plugins trivial to write and
   run. Adding a no-Docker-required path addresses that without touching
   what already works.
2. The generic port layer already doesn't know Docker exists: `kernel/plugin-container-port.ts`
   and `adapters/docker-broker-plugin-container.ts` are reused unchanged by
   this slice, confirmed by direct read. That is the architectural reason
   this can be additive rather than a rewrite — the seam the harness already has
   is exactly the seam a second executor needs.
3. `pnh/harness/plugin-container-supervisor.mjs` and
   `pnh/kernel/plugin-fault-cell.mjs` receive zero edits anywhere in this
   slice (Global Constraints, both docs). The Docker path is not just kept
   working — it is provably untouched.

**Known cost, accepted:** the new spawn supervisor duplicates a small
amount of frame-writer and command-loop logic from the pinned Docker
supervisor file rather than importing it, because exporting those helpers
would move that file's pinned digest and trigger the PROTO-02
amendment process for a change that is otherwise purely additive. Two
supervisor implementations now exist to keep behaviorally aligned over
time. That is a real, ongoing maintenance cost, not a one-time one.

## Decision 2: the README trust-model statement ships unconditionally

**The README's plugin runtime trust-model statement (Task 1, committed
`66d9a3e`) is a standalone, unconditional disclosure — it ships regardless
of whether Tasks 3-7 of this slice land, are changed in scope, or are
abandoned.**

1. The statement's claims about the Docker executor (network none,
   read-only rootfs, `capDrop: ["ALL"]`, seccomp, resource caps, non-root
   `10101:10101`) are already true today, cited directly against
   `kernel/plugin-runner/launch-profile.json`. Nothing about that half of
   the statement depends on future work.
2. Its claims about the subprocess executor are framed as direction, not
   as shipped behavior: "it does not exist in code yet," Network and
   Filesystem are explicitly named as not closed, and uid/gid drop is
   named as best-effort and typically inert (`EPERM` the common case)
   rather than reliable privilege dropping. None of that requires Tasks
   3-7 to be true — it is true of the direction whether or not the
   direction is ever finished.
3. The statement is honest about what doesn't exist yet even for the
   *shipped* Docker side: it says supply-chain trust UX (signed/pinned
   manifest digests, install-time capability disclosure) "doesn't exist as
   a human-facing UX yet" for either executor. Nothing in it needs walking
   back if this slice stalls after Task 2.

**Known cost, accepted:** if Tasks 3-7 never land, the README permanently
describes a subprocess executor that "is being added in a later task of
this slice" while no later task exists. That reads as slightly stale but
not false — the statement never claims the executor is shipped, and
re-wording it to remove the forward reference is a one-line follow-up if
the slice is abandoned, not a hidden risk in the statement itself.

## Decision 3: first-slice scope boundary

**The first slice ships only the mechanical port contract (a `LifecyclePort`
duck-type implementation over `child_process.spawn`, wired through an
override seam) and the spawn-executor artifact digest model — explicitly
not resource caps, not capability-disclosure UX, and not a CLI surface.**

1. No resource-cap primitive (rlimit, cgroup, memory/cpu/pids limiting on a
   spawned child) exists anywhere in the repo today — confirmed by a
   repo-wide search at `66d9a3e` for rlimit/cgroup/`setrlimit`/`ulimit`-shaped
   names, which returns nothing relevant. There is nothing to wire this
   slice's spawn profile to even if resource caps were in scope.
2. Capability-disclosure UX (an install-time or launch-time surface telling
   an operator what a plugin is asking for) doesn't exist for either
   executor today. Building it for spawn only, ahead of Docker, would
   invert the order this project has actually earned it in.
3. No CLI entrypoint exists anywhere in `pnh/` today — confirmed directly
   (no `bin/` directory, no CLI dependency, no `--sandbox`-shaped flag
   parsing anywhere in the source tree). A `--sandbox=container` flag has
   nothing to attach to yet. This slice delivers the executor-selection
   *seam* (`spawnGatewayChildren`'s override parameter, Task 6) that a
   future CLI flag would call into — not the flag itself.

**Known cost, accepted:** the subprocess executor becomes selectable
programmatically (via the Task 6 override and Task 7's test) before it is
operator-facing. Nobody outside a test harness or a direct code caller can
actually choose it until a CLI exists. That gap is named here as deferred,
not silently left implicit.

## Still open

Each item below carries a recommendation. None is resolved by this
document — each needs its own decision when the work it blocks is
actually scheduled.

**Resource caps.** No existing primitive anywhere in the repo (rlimit,
cgroups, or equivalent) — confirmed by repo-wide search, same finding as
Decision 3 above. Recommendation: treat this as its own decision-doc fork
when it's scheduled, not an assumption smuggled into the spawn profile's
shape now. The spawn profile this slice ships (Task 4) should have no
field that implies a cap it doesn't enforce.

**uid/gid framing.** Recommendation: describe the drop everywhere as
"usually inert under an unprivileged invocation," not "sometimes
unavailable" — the latter undersells how routine the `EPERM` fallback
actually is (see Global Constraints in both this slice's tasks and the
implementation plan). This framing choice is carried forward rather than
re-litigated per task, but it stays open in the sense that no code
enforcing or reporting on it exists yet — Task 5 is where it becomes real.

**Capability disclosure.** Blocking prompt at install/launch time vs. an
advisory log line — undecided. Recommendation: advisory log first,
because a blocking prompt requires a CLI surface (Decision 3, still open
below) and an operator identity model this project doesn't have yet;
advisory logging can ship independently of both.

*Update 2026-08-24:* the advisory-log half shipped as library code
(`pnh/runtime/plugin-disclosure.ts`, per the supply-chain trust slice plan).
Blocking prompt vs. advisory remains open as described above and still waits
on a CLI surface and an operator identity model.

**CLI flag surface.** No entrypoint exists yet (Decision 3). Recommendation:
design the flag's shape only after `pnh/` actually grows a CLI entrypoint
for some other reason — don't build a CLI just to host `--sandbox`. Until
then, callers select the executor programmatically via Task 6's override
parameter.

**WASM roadmap.** Deferred, non-blocking. A WASM runtime could eventually
close the Network/Filesystem boundaries a bare subprocess cannot, without
Docker's adoption cost — but no exploration of it exists in this repo yet.
Recommendation: leave it as a named future direction in this document
only; do not let it delay or gate the subprocess-executor slice, which
solves a real, immediate adoption problem on its own.
