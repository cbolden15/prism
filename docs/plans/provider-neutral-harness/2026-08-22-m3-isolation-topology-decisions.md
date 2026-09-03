# M3 isolation topology: recorded decisions

Date: 2026-08-22
Status: ratified by the owner
Supersedes the open items at
`2026-08-21-m3-plugin-isolation-architecture-options.md:368-377`
Evidence: `2026-08-22-m3-option-a-checkpoint-brief.md`

Three of the five open checkpoint decisions are settled. Two remain open, and
this record says why.

## Decision 1: control-cell topology — Option A, ratified narrowly

**Option A (shared control plane with plugin-keyed logical cells) is the M3
implementation target, and its implementation is accepted as correct.** Option C
(per-plugin unprivileged control cells with one lifecycle daemon) is the sole
approved escalation path.

The ratification is deliberately narrow, and the boundary matters. What is
accepted is that the cell implementation works: per-allocation fault cells
contain ordinary faults, including a second allocation of the same plugin, and
the M3 suite is green and gate-enforced through PNH-INV-22.

**Option A's provisional status is not retired by this decision.** Criterion 1 of
the five in `:356-362` is the cheapest of them, and all eight of its named fault
classes are triggered through one mechanical scenario: a `supervisor.cleanup(...)`
call against a fake Docker with a blocked `remove()`, under fake timers. Nothing
in it injects hostile input, contends for CPU or memory, or kills the shared
process. The criteria that would discriminate Option A from Option C are 2, 3,
and 5, and those remain untested.

Read the options document's criteria list as five separate gates rather than one,
because criterion 1 is far cheaper to pass than the rest and clearing it moves
the sufficiency question very little.

Known cost, accepted: PNH-INV-22 is now `active` and scoped to the *allocation*.
A future Option C that scopes isolation per *plugin* would weaken a published
invariant and would need its own amendment. That is paperwork, not a design lock.

## Decision 2: Docker authority placement — Option B rejected

**Option B (one Docker-capable control plane per plugin) is explicitly rejected.**
Docker authority stays in one minimal lifecycle daemon.

Three reasons, none of which depend on further test results:

1. Option B multiplies the number of principals holding the most dangerous
   authority in the system. No current evidence calls for that.
2. The M3 work removed the incidental cap on concurrent `spawn("docker", ...)`
   that the old global chain provided. The system now needs one component
   bounding Docker invocations. Option B moves in the opposite direction.
3. On the options document's own comparison (`:338-345`), Option B is rated
   hardest for aggregate budget coordination, which is exactly the criterion now
   evidenced as failing.

This rejection stands unless a future constraint makes a single lifecycle daemon
impossible. Physical isolation does not require distributed Docker authority;
that is what Option C exists to provide.

## Decision 5: escalation threshold — adopted, with an ordering constraint

**Move to Option C when bounded, attributed plugin input still crashes, stalls,
corrupts, or exhausts the shared trusted process after logical cells and
aggregate limits both exist.**

The ordering in that sentence is a load-bearing condition, not a schedule.
Logical cells now exist; aggregate limits do not. Run the escalation test today
and a failure has two indistinguishable causes: logical isolation is genuinely
insufficient, or the aggregate arbiter is simply missing. Both produce the same
symptoms.

**Therefore no adversarial evidence gathered before the aggregate arbiter ships
counts toward this threshold**, however bad the result looks. Escalating on
confounded evidence would buy per-plugin processes to fix a missing-arbiter
problem.

## Still open

**Decision 3: plugin protocol parsing.** No evidence yet shows bounded attributed
input crossing plugin boundaries through the shared parser, so there is nothing
to decide on. Carry one adjacent finding into it when the time comes: the command
loop's `cumulativeBytes` counter meters bytes on the shared stream *before* any
frame is parsed, which is a shared-ingest-surface property. Decide after the
adversarial malformed-protocol and forged-identity cases exist.

**Decision 4: aggregate resource arbitration.** Not a choice so much as unbuilt
work, and it is the binding constraint on everything else. Two specific gaps are
documented:

- Per-allocation ingest accounting to replace the shared 8 MB `cumulativeBytes`
  ceiling, which cannot attribute a chunk to an allocation because it counts
  before parsing.
- A concurrency bound on Docker invocations, restoring what the removed global
  chain provided by accident, covering `launchInternal`'s inspect/create/start
  sequence as well as cleanup.

Both belong to the narrow shared arbiter the options document reserves. Neither
was authorized in the M3 narrow step. Decision 5's ordering constraint means the
adversarial suite for criteria 2, 3, and 5 should be written against the system
that has this arbiter, not the one that lacks it.
