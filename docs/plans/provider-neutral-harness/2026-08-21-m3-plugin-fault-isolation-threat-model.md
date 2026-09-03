# M3 plugin fault-isolation threat model

Status: active Milestone 3 design gate

Date: 2026-08-21

Scope: plugin fault containment and control-plane topology. This document does
not approve physical process splitting, broaden plugin authority, or replace the
artifact and sandbox hardening required by Milestone 4.

## Security boundary decision

> Logical fault cells are not security boundaries; the plugin container and the
> privileged lifecycle daemon are.

The plugin container is the untrusted-code boundary. Plugin code is assumed
fully malicious and receives no Docker authority. Container identity, resource
limits, launch profile, and artifact commitments are fixed outside the plugin.

The privileged lifecycle daemon is the authority boundary. The current
`plugin-container-supervisor.mjs` fills this role as the sole Docker lifecycle
writer. It must remain minimal, accept only authenticated ticket-resolved
identities and closed launch specifications, and never accept caller-supplied
Docker arguments.

A logical fault cell is trusted in-process state partitioning: plugin-keyed
queues, timers, lifecycle state, accounting, cleanup, and evidence. It is an
availability and correctness mechanism. It does not contain compromise of the
shared process, memory corruption, event-loop starvation, or a vulnerability in
shared parsing or routing code.

## Threat classification

| Threat | Required scope and response |
|---|---|
| Attributed ordinary plugin fault | Timeout, crash, protocol failure, malformed or excessive output, nonzero or OOM exit, and cleanup failure settle only that plugin's cell. Unrelated plugins continue. |
| Unattributable authenticated-channel corruption | Fail the affected shared transport closed because ownership cannot be proven safely. Record a control-plane failure, not an ordinary plugin fault. |
| Runtime, broker, or gateway process loss | Treat as shared control-plane failure. Reject affected pending work and preserve supervisor cleanup custody. |
| Lifecycle-daemon compromise | Treat as catastrophic loss of the privileged authority boundary. M3 logical cells do not mitigate it. |
| Plugin container escape | Treat as catastrophic loss of the untrusted-code boundary. Evaluate rootless custody and a stronger sandbox before hostile third-party distribution. |

## M3 topology decision

M3 retains one privileged lifecycle daemon and implements plugin-keyed logical
fault cells. The committed 0/8 red suite proves that the current global queue
violates the invariant; it does not prove that logical cells are architecturally
insufficient.

Do not create one Docker-capable supervisor per plugin. If later threat evidence
requires physical control-cell isolation, split only unprivileged per-plugin
workers and keep one minimal lifecycle daemon as the sole Docker authority.

## Required controls and evidence

1. Establish allocation identity outside plugin-controlled bytes before routing
   output or failure into a cell.
2. Scope queues, timers, byte limits, concurrency, cleanup, and evidence to the
   authenticated plugin allocation; enforce aggregate limits in a narrow shared
   arbiter.
3. Keep the lifecycle daemon payload-blind. It transports bounded opaque bytes
   and enforces lifecycle state but does not parse the plugin application
   protocol.
4. Preserve an independent hard deadline and daemon-confirmed cleanup path that
   plugin, Runtime, and broker failure cannot cancel.
5. Make the eight concurrent isolation tests pass, then add attributed parser,
   CPU starvation, memory pressure, forged identity, resource-accounting, and
   event-chain isolation tests as those M3 surfaces exist.

## Physical-split escalation rule

Physical splitting requires evidence that bounded attributed plugin input can
still crash, stall, corrupt, or exhaust the shared trusted process after logical
cells and aggregate limits are implemented. The review must identify the failed
control, show why a smaller correction is insufficient, and account for process,
channel, key-management, receipt-reconciliation, and Docker-authority changes.

Without that evidence, physical process splitting is out of scope for M3.
