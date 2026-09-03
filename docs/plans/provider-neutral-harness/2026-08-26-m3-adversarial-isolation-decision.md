# M3 adversarial isolation decision

Date: 2026-08-26
Status: ratified by the owner through the instruction to finish the adversarial
tests and mark M3 complete or strengthen the architecture if they exposed a
weakness.

## Decision

Option A, the shared control plane with allocation-keyed logical fault cells,
is sufficient for M3. Option C remains the approved future escalation path but
is not triggered by the evidence below.

The first CPU-pressure run did expose a process-wide scheduling weakness:
near-limit legal traffic monopolized the parser for one event-loop turn. The
smaller correction was an eight-command scheduler quantum. The unchanged red
test passed after that correction, so physical process splitting was not
required by the escalation rule.

## Five-criterion evidence

1. Ordinary fault isolation passes in
   `pnh/tests/m3-plugin-fault-isolation.test.ts`, including concurrent timeout,
   crash, malformed output, excessive output, nonzero and OOM exit, cleanup
   failure, and same-plugin allocation cases.
2. Attributed malformed protocol and forged identity pass in
   `pnh/tests/m3-adversarial-isolation.test.ts`. A malformed or identity-forged
   provider allocation is cleaned and acknowledged while another allocation of
   the same provider completes. A forged supervisor event cannot enter the
   admitted allocation's event chain.
3. CPU and memory pressure pass in that adversarial suite. Near-limit legal
   traffic yields the shared event loop before unrelated progress, and command
   tracker exhaustion refuses excess identities without tearing down already
   tracked work. Aggregate and per-plugin allocation caps provide the companion
   live-state bound.
4. Cross-plugin aggregate accounting and event chains pass in
   `pnh/tests/m3-aggregate-arbiter.test.ts` and the forged-event adversarial
   case. Allocation, per-plugin, lifecycle-concurrency, command-byte, replay,
   and transient-buffer bounds are registry checked.
5. Shared supervisor loss is classified separately in the adversarial suite:
   every pending and future request receives the same control-plane error, and
   no plugin terminal receipt or plugin event is fabricated.

## Claims deliberately not made

- Logical fault cells are still not security boundaries.
- PNH-INV-35 remains proposed because the current arbiter is supervisor-scoped,
  not one shared daemon for every harness instance on a host.
- PNH-INV-38 remains proposed because its universal 50 ms wall-clock bound is
  not proven by this suite. M3 completion proves isolation and bounded progress,
  not that timing claim on every machine and CI load.
