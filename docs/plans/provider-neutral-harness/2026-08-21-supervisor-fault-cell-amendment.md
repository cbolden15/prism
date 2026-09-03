# PNH-PROTO-02 amendment: supervisor fault-cell refactor

Date: 2026-08-21

Related sources:

- [M3 logical fault cells plan](2026-08-21-m3-logical-cells-plan.md) (Tasks 1-3)
- [PNH constitution design](2026-08-21-pnh-constitution-design.md)

## What changed

Task 1 of the M3 plan (`feat(pnh): key supervisor serialization by
per-allocation fault cells`) replaced
`pnh/harness/plugin-container-supervisor.mjs`'s supervisor-wide
`let queue = Promise.resolve()` promise chain with a `cells` map keyed by
`requestId`, each cell owning its own FIFO queue. It introduced a new module,
`pnh/harness/plugin-fault-cell.mjs` (plus `pnh/harness/plugin-fault-cell.d.mts`),
exporting `createFaultCell({requestId, pluginId})` which returns
`{requestId, pluginId, run(), flush(), dispose()}`. The supervisor's
`shutdown()` now fans out over a snapshot of the cells map in bounded batches
(width 4), failing closed on any rejection or unaccounted cell; `idle()` awaits
every cell's `flush()`.

Task 2 (`fix(pnh): dispatch supervisor commands concurrently and drain
in-flight work on shutdown`, plus a follow-up fix `fix(pnh): reap containers
even when the in-flight drain fails`) changed `runSupervisorCommandLoop` to
dispatch commands without awaiting each one before parsing the next stdin
line, tracking in-flight work in a module-private registry that is drained on
loop exit and again inside `main()`'s shutdown path before it reports custody
back to the caller.

## Why this is an amendment, not a version bump

The command surface and receipt shapes of the supervisor command channel are
unchanged by either task: what a caller sends and what a receipt contains are
byte-identical, as are the duplicate-ID rejection, the canonical-JSON check,
and the per-command error-frame shape.

One observable did change, and it is worth stating plainly rather than
glossing. Before Task 2 the command loop awaited each dispatch and its frame
write before parsing the next line, so result frames were always emitted in
command-issuance order. They no longer are: a command issued later can now
have its result frame written first while an earlier command is still blocked.
That is not incidental to the refactor, it is the point of it, and the new
`m3-plugin-fault-isolation.test.ts` case "the command loop answers a second
plugin while another plugin's cleanup is blocked" exists to prove it.

`PNH-PROTO-02`'s `version` nonetheless stays `1`, because response ordering
was never part of the contract that version numbers protect. Every frame
carries its `commandId`, the channel's spec documents no ordering guarantee,
and both consumers correlate by map lookup on that id rather than by arrival
position (`pnh/harness/sandbox/broker-gateway.mjs`, `pnh/harness/plugin-container-broker.mjs`).
The pinned conformance suite asserts no response ordering either. Only the
pinned `schema_hash` moves, because the pinned source files themselves changed
byte for byte.

Test evidence from Tasks 1 and 2: `m3-plugin-fault-isolation.test.ts` went
from 0/8 to 17/17 passing; `pnh/tests/plugin-container-supervisor.test.ts` —
PNH-INV-23's conformance proof — passed 13/13 **byte-unmodified** across both
tasks; `pnh/tests/broker-gateway-routing.test.ts` passed 7/7. `npm run
test:constitution` went red on exactly one check (`check 6: protocol pins`)
because Tasks 1 and 2 moved the pinned files' bytes without amending the pin;
this record and the accompanying registry update restore it.

## `schema_source` widening

`pnh/harness/plugin-fault-cell.mjs` and `pnh/harness/plugin-fault-cell.d.mts`
are added to `PNH-PROTO-02`'s `schema_source` alongside the existing
supervisor `.mjs`/`.d.mts` pair. The fault-cell module now holds the
per-allocation serialization chain that PNH-INV-23's uncancellable-cleanup
guarantee depends on. Leaving it unpinned would let a later edit to that
module change security-relevant behavior (ordering, cleanup guarantees)
without moving `schema_hash`, without triggering an amendment, and with
`test:constitution` staying green — a silent gap in the pin's coverage. The
new `schema_hash` is computed over all four files, in this order:

1. `pnh/harness/plugin-container-supervisor.mjs`
2. `pnh/harness/plugin-container-supervisor.d.mts`
3. `pnh/harness/plugin-fault-cell.mjs`
4. `pnh/harness/plugin-fault-cell.d.mts`

## Outcome

- `version`: unchanged at `1`.
- `schema_hash`: moves from `sha256:15a4b363f1c6ef80e4befba0d91e1d6fd923285fc7849e4b991365c920f54a65`
  to `sha256:8888419e84d74a7031bdfb5ac0593b0df5c4629224242ce1e119f24b752e8d59`.
- `schema_source`: widened from two files to four (see above).
- An amendment entry citing this decision record and the locked binding hash
  it supersedes is appended to `PNH-PROTO-02` in `pnh/contracts/invariants.yaml`.
