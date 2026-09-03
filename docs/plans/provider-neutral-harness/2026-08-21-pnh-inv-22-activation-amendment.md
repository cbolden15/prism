# PNH-INV-22 amendment: activation with M3 fault-cell conformance

Date: 2026-08-21

Related sources:

- [M3 logical fault cells plan](2026-08-21-m3-logical-cells-plan.md) (Tasks 1-3)
- [M3 plugin fault-isolation threat model](2026-08-21-m3-plugin-fault-isolation-threat-model.md)
- [PNH-PROTO-02 amendment](2026-08-21-supervisor-fault-cell-amendment.md) (the M3 refactor this
  conformance suite exercises)

## What changed

`pnh/contracts/invariants.yaml`'s `PNH-INV-22` entry moves from `proposed` to
`active` and gains its first `conformance:` entry,
`pnh/tests/m3-plugin-fault-isolation.test.ts` (17 cases, all green). That
suite is the M3 milestone's fault-cell conformance proof: `plugin-fault-cell.mjs`
gives each plugin allocation its own serialized queue, and
`plugin-container-supervisor.mjs` keys those cells by `requestId` rather than
sharing one supervisor-wide promise chain.

The invariant's `statement` is trimmed at the same time, because activating
it attaches a conformance proof and that proof must not be read as covering
more than it does.

## Why this is an amendment, not a free `proposed` → `active` transition

`bindingHash` (`pnh/contracts/registry.ts`) covers only `statement` and
`bounds`, never `status` or `conformance`. `diffAgainstLock` calls
`requireAmendment` unconditionally whenever `bindingHash` changes, regardless
of whether the status transition itself is free — the `proposed` → `active`
transition alone (as done for PNH-INV-03 in `627d549`, closes #29) does not
move the hash and needs no amendment, because that activation left INV-03's
statement and bounds untouched. This activation is different: narrowing the
statement is exactly what makes the new conformance proof honest, so the hash
moves and the free-transition path does not apply. This entry follows the
same amendment mechanics as `PNH-PROTO-02`'s (`2026-08-21-supervisor-fault-cell-amendment.md`):
an `amendments:` entry citing this record and the hash it supersedes.

## Statement narrowing — what the suite proves and what it does not

Before:

> Queues, timers, byte limits, concurrency, cleanup, and evidence are scoped
> to the authenticated plugin allocation that owns them; no shared
> unattributed path may sequence one plugin's work behind another's.

After:

> Each plugin allocation's queue, timers, and cleanup path are scoped to its
> own fault cell; a blocked or failing cell, including a second allocation of
> the same plugin, never stalls another allocation's queued work or the
> evidence it produces, and cleanup once accepted cannot be cancelled by a
> concurrent shutdown or dispose.

Three things are dropped, deliberately:

- **Byte limits.** The 8 MB `cumulativeBytes` ceiling enforced in
  `runSupervisorCommandLoop` remains a cross-plugin shared-channel ingest
  limit (Task 2 of the M3 plan recorded this as accepted, not fixed): a
  byte-heavy plugin can still tear down the command loop for every plugin
  sharing it. The old statement's "byte limits ... scoped to the ... plugin
  allocation" claim was never true of that ceiling and the suite does not
  prove it true now.
- **Concurrency as an allocation-scoped property.** The M3 suite proves that
  independent cells do not serialize behind each other and that reclaimed
  cells serve fresh launches in their own turn; it does not prove any bound
  on how many cells may run concurrently or fence resource use across them.
  That is a different claim than "cleanup, once accepted, is not
  cancellable," which the suite does prove directly.
- **"Authenticated ... no shared unattributed path."** Attribution is
  PNH-INV-21's claim (`proposed`, unchanged by this amendment), not this
  suite's. The M3 suite constructs allocations with a `requestId`/`pluginId`
  already assigned; it never exercises how that identity was established or
  what happens to an unattributed frame.

What is added is what the suite's 17 cases actually demonstrate: same-turn
independence across every ordinary fault class and across two allocations of
the *same* plugin (not just different plugins), reclamation across
sequential launch/cleanup/acknowledge cycles, `shutdown()` failing closed
rather than returning a short receipt list, an in-flight launch surviving a
concurrent shutdown, and `dispose()` never cancelling already-accepted work
— plus, at the production command-loop level, a second plugin's buffered
command still dispatching and its response frame still being written while
another plugin's cleanup is blocked.

The suite runs under fake timers (`FakeTimers` / `ClearFailingTimers`
implementing `SupervisorTimerPort`). It proves same-turn settlement, not any
wall-clock bound. `PNH-INV-01`'s `max_cross_plugin_stall_ms: 50` bound is a
wall-clock claim this suite cannot support and stays `proposed`.

## Outcome

- `status`: `proposed` → `active`.
- `conformance`: `[]` → `[pnh/tests/m3-plugin-fault-isolation.test.ts]`.
- `bindingHash` moves from `sha256:77ced1ccf042f4a3008af83c6949f5fe4ee1f7c32eae331b1c438955f1a65af9`
  to the value recorded by `generate-constitution.ts --update-lock` for the
  trimmed statement above (`bounds` remains unset on both sides).
- An amendment entry citing this decision record and the superseded hash is
  appended to `PNH-INV-22` in `pnh/contracts/invariants.yaml`.
- `PNH-INV-01`, `PNH-INV-21`, `PNH-INV-24` through `PNH-INV-27`, `PNH-INV-33`,
  `PNH-INV-38`, and `PNH-INV-46` are untouched at `status: proposed`; none of
  them are proven by this suite.

## Correction, same day: the shutdown fan-out is a bounded exception

The statement as first activated said, without qualification, that a blocked or
failing cell never stalls another allocation's queued work. The final
whole-branch review found a reading that the code does not survive, and it is
right.

`supervisor.shutdown()` reaps cells in fixed-width batches
(`SHUTDOWN_FANOUT_WIDTH = 4`), awaiting each batch before starting the next.
That bounding is deliberate: the supervisor-wide chain this branch removed was
also the only cap on concurrent `spawn("docker", ...)` calls, and an unbounded
fan-out at SIGTERM would issue one stop/kill/remove chain per live allocation
at peak host pressure. But it means a cell that *hangs* during shutdown — as
opposed to rejecting, which the suite does inject and which the fail-closed
path handles — delays the reaping of every cell in a later batch. That is
cross-allocation coupling, and the original wording read as excluding it.

This is not a regression. The old behavior was total serialization of every
operation of every plugin, so the bounded batch is strictly better. Nor is it
covered by a test: the M3 suite injects a rejecting cleanup, never a hanging
one, so the counterexample is unprobed rather than contradicted.

The honest fix is to scope the claim rather than to widen the code, because
removing the bound would trade a shutdown delay for unbounded concurrent Docker
teardown, and designing a per-cell shutdown deadline is a new limit inside a
PROTO-02-pinned path — outside this plan's authorized narrow step. The
statement now names supervisor shutdown as the bounded exception and says what
it costs.

`bindingHash` therefore moves a second time, from
`sha256:08f2ef018a9aeeec876cd3314c4388180bf912fd3522ff18392009df25a3146c` to
the value recorded for the scoped statement. A second amendment entry citing
this record and that superseded hash is appended to `PNH-INV-22`. Correcting
the sentence before merge costs one entry; correcting it afterward would cost
an amendment against an invariant already published as active.
