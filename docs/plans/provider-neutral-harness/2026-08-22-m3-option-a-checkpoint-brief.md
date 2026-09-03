# M3 isolation checkpoint: what the logical-cells branch settled

Date: 2026-08-22
Status: decision brief, awaiting owner ratification
Revised: 2026-08-22, criterion 1 and recommendation 1 narrowed after re-reading
what the suite actually injects
Subject: the five open decisions in
`2026-08-21-m3-plugin-isolation-architecture-options.md:368-377`

The narrow step authorized at that document's checkpoint is done and merged
(`cb10ead`, nine commits). This brief exists so the checkpoint can be settled
against evidence rather than re-argued from first principles. It recommends but
does not decide.

## What changed about the evidence

The supervisor's single global promise chain is gone, replaced by per-allocation
fault cells, and the production command loop no longer awaits each dispatch
before reading the next line. The M3 fault-isolation suite went from 0/8 to
17/17. PNH-INV-22 is active with that suite as its conformance proof.

Two findings matter more than the green suite, and both came out of review
rather than testing.

First, `cumulativeBytes` is still a single cross-plugin ceiling. The command
loop meters raw transport bytes across every allocation against one 8 MB limit,
and it counts them before any frame is parsed, so a chunk cannot be attributed
to an allocation at the point it is measured. A byte-heavy plugin can still tear
the command channel down for every plugin. This is recorded as accepted, and
PNH-INV-22 is deliberately mute about byte limits rather than quietly narrowing
around the weakness.

Second, the global chain was incidentally the only cap on concurrent
`spawn("docker", ...)` calls. Shutdown now reaps in fixed-width batches, but
everywhere else that cap is gone, for `launchInternal`'s inspect/create/start
sequence as well as for cleanup's up-to-seven invocations. Nothing upstream
re-imposes one: the `allocations` map has no size limit, and the broker and
gateway enforce byte limits but no concurrency bound.

## Option A's five provisional criteria

The options document holds Option A provisional until it passes five criteria
(`:356-362`). One passes, one is now evidenced as failing, one got harder, and
two are untouched.

| # | Criterion | Status after this branch |
|---|---|---|
| 1 | Eight ordinary concurrent isolation cases | **Passes**, but proves less than the count suggests |
| 2 | Attributed malformed-protocol and forged-identity cases | Untested |
| 3 | CPU starvation and memory pressure | Untested, and the surface grew |
| 4 | Cross-plugin aggregate accounting and event chains | **Evidenced as failing** |
| 5 | Shared-process loss classified separately from plugin faults | Untouched |

Criterion 1 passes, and it is worth being precise about what that buys, because
the case count invites over-reading.

All eight named fault classes — deadline timeout, process crash, protocol
failure, malformed output, excessive output, nonzero exit, OOM exit, cleanup
failure — are triggered the same way: a `supervisor.cleanup(...)` call against a
fake Docker whose `remove()` is blocked, under fake timers. They are eight
labelled entry points into one mechanical scenario, not eight distinct
adversarial mechanisms. The suite then adds genuinely different cases around it:
a second allocation of the same plugin, shutdown failing closed instead of
returning a short receipt list, an in-flight launch surviving a concurrent
shutdown, disposal not cancelling accepted work, and the production command loop
answering one plugin while another's cleanup is blocked.

That is the right shape for proving the repair, and it does prove it: the
serialization defect is fixed and the cell implementation is correct. It is not
evidence that logical isolation is *sufficient*. Nothing here injects hostile
input, contends for CPU or memory, or kills the shared process. Because the
timers are fake, it also proves same-turn settlement rather than any wall-clock
bound, which is why PNH-INV-01 and its 50 ms `max_cross_plugin_stall_ms` stayed
`proposed`.

The criteria that would actually discriminate Option A from Option C are 2, 3,
and 5. Those are the untested ones. Criterion 1 is the easiest of the five, and
passing it moves the provisional question very little.

Criterion 4 is the one to act on. It is not merely untested; the mechanism that
fails it is identified and documented. This maps exactly onto open decision 4,
which already anticipated that aggregate limits need one shared arbiter.

Criterion 3 deserves a note. Removing the incidental Docker concurrency cap
enlarged the resource-pressure surface, so a starvation test written today would
be testing a weaker system than the one the criterion was written against.

## Recommendations on the five open decisions

**1. Control-cell topology — ratify Option A narrowly, and keep its provisional
status open.** Two claims get conflated here and should be separated.

The defensible one: Option A is the M3 implementation target and its
implementation is correct. That is already true in practice, since the work is
merged, and criterion 1 supports it. The cell is a small module behind a
portable interface (`createFaultCell` with `run`, `flush`, `dispose`), which is
what the options document asked for so the boundary can later move into a
process without touching admission tickets, capability grants, lifecycle
receipts, or event semantics. Keep Option C as the sole escalation path.

The claim to *withhold*: that Option A is sufficient and can stop being
provisional. The evidence does not reach that yet, for the reasons in the
criterion 1 discussion above, and the options document reads as though passing
its criteria list is a single gate when in practice criterion 1 is much cheaper
than the rest. Ratifying topology should not be read as retiring the provisional
status; that waits on criteria 2, 3, and 5.

One cost to accept knowingly: PNH-INV-22 is now active and scoped to the
*allocation*. A future Option B or C that scopes isolation per *plugin* would be
a weakening of an already-published invariant and would need its own amendment.
That is a paperwork cost, not a design lock.

**2. Docker authority — reject Option B explicitly.** Nothing in this work needed
additional Docker-capable principals. The branch's one real resource regression
argues the opposite direction: having removed a concurrency cap, the project
needs one arbiter bounding Docker invocations, not more independent principals
racing for the daemon.

**3. Protocol parsing — defer, and tie it to criterion 2.** The branch did not
move parsing, and no evidence yet shows bounded attributed input crossing plugin
boundaries through the shared parser. The `cumulativeBytes` finding is adjacent
and worth carrying into that decision: bytes are metered on the shared stream
before parsing, which is precisely a shared-ingest-surface property. Decide this
after the adversarial malformed-protocol and forged-identity cases exist.

**4. Aggregate resource arbitration — this is the next milestone, and it now has
a concrete first target.** Two specific gaps, both documented: per-allocation
ingest accounting to replace the unattributable shared 8 MB ceiling, and a
concurrency bound on Docker invocations to restore what the global chain used to
provide by accident. Both belong to the narrow shared arbiter the options
document reserves, and neither was authorized in the narrow step.

**5. Escalation threshold — adopt the options document's own wording as the
test.** Move to Option C when bounded, attributed plugin input still crashes,
stalls, corrupts, or exhausts the shared trusted process *after* logical cells
and aggregate limits both exist. Logical cells now exist; aggregate limits do
not. Until decision 4 ships, no adversarial result can distinguish "logical
isolation is insufficient" from "the arbiter is missing", so no escalation
evidence gathered before then should count toward this threshold.

## Suggested sequencing

1. Ratify decisions 2 and 5 now, and decision 1 in its narrow form only. These
   are supported by current evidence and unblock the rest. Option A's
   provisional status stays open regardless.
2. Build the aggregate arbiter (decision 4): per-allocation ingest accounting
   plus a Docker concurrency bound.
3. Write the adversarial suite for criteria 2, 3, and 5 against the system that
   has the arbiter, not the one that lacks it.
4. Revisit decision 3 and the escalation threshold with those results.

Milestone close, gate wiring into `test:pnh`, PNH-INV-01 activation, and any
"M3 is green" declaration all wait on step 3. Note separately that
`test:constitution` cannot currently run inside the sandbox runner at all, since
three constitution suites fail there with `Cannot find module 'yaml'` under
`--network none`. That has to be solved before the gate can be wired in.
