# Command scheduler fairness amendment

Date: 2026-08-26

## Finding

The M3 adversarial suite fed one allocation 32 individually valid 180 KB input
commands, just under its 8 MB command budget. Before this amendment, the shared
command parser processed the entire sequence without yielding a macrotask turn.
An unrelated allocation's result was produced before a zero-delay timer could
run. The red test completed in about 62 ms on the trusted Mac.

This was bounded input causing a process-wide scheduling effect. It required a
control correction before Option A could be accepted.

## Correction

The supervisor now processes at most eight validated commands per event-loop
turn, then yields with `setImmediate`. Dispatch remains concurrent and each
allocation's fault cell still owns operation ordering. The quantum is exported
from `pnh/contracts/resource-bounds.mjs`, recorded on PNH-INV-38, and checked by
the constitution gate.

The unchanged adversarial test passes with the scheduler. This is the smaller
correction required by the physical-split escalation rule, so the initial
failure does not trigger Option C.

## Protocol pins

No frame fields, result fields, authentication rules, or encodings changed.
PNH-PROTO-01 and PNH-PROTO-02 remain version 1. Their schema hashes move because
the shared bound module and supervisor implementation changed.

- PNH-PROTO-01 schema hash:
  `sha256:84eb725669f6866c723a7c3cd740adcb5077ad11814950f8f42d5805a34d9bb6`
  to `sha256:b85d983cef28c89bb1229bea97368d9e32eb2c4d90626dde07cc4b27696d4a4a`
- PNH-PROTO-02 schema hash:
  `sha256:7afec88ac39f321692cb79d8e6efa651621537672afba0284031526d8b5ba8ed`
  to `sha256:0bf77253b868cbf37d249b5ec875c4c5430f5709f70baa09b54ad5562bf7de07`
