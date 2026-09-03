# Aggregate resource bounds and protocol-pin amendment

Date: 2026-08-26

## Decision

Prism Harness now uses one supervisor-scoped, payload-blind resource arbiter
to bound live allocations, per-plugin allocation share, and concurrent Docker
lifecycle calls. Command-channel ingest is accounted after authentication and
validation to the owning allocation. Exceeding that allocation's byte or
command-ID budget settles only that allocation; the shared channel continues.

The arbiter is deliberately described as supervisor-scoped. The current
composition starts one lifecycle supervisor per harness session, so this work
does not satisfy or activate PNH-INV-35's stronger host-wide claim.

## Shared bounds

`pnh/contracts/resource-bounds.mjs` is the runtime source imported by the
TypeScript and `.mjs` protocol layers. PNH-INV-38 carries the same values, and
the constitution gate checks them for exact equality.

The adapter's previous 16 MB cumulative wire limit was unintentional drift.
It now uses the shared 8 MB transient-buffer bound. Broker, gateway, adapter,
and supervisor lifetime counters were replaced with transient unparsed-buffer
checks, so valid long-running traffic does not exhaust a process-wide counter.

## Replay retention

Command IDs are retained exactly while an allocation is live. A successful
acknowledgement moves them into a bounded recent replay window. This replaces
the unbounded process-lifetime set. Duplicate rejection outside the documented
window is not guaranteed. The supervisor also bounds acknowledged-allocation
tombstones instead of retaining them forever.

## Protocol versions

PNH-PROTO-01 and PNH-PROTO-02 remain at version 1. Their accepted frame fields,
result fields, authentication requirements, and canonical encoding are
unchanged. Capacity refusal uses the existing attributable `command-failed`
result. The pins move because their source files changed and because the new
bounds and arbiter modules are security-relevant schema sources.

- PNH-PROTO-01 schema hash:
  `sha256:adc39037010531e690121b933d44fb1066660d5d9bd97207a6dd3d865d12a316`
  to `sha256:84eb725669f6866c723a7c3cd740adcb5077ad11814950f8f42d5805a34d9bb6`
- PNH-PROTO-02 schema hash:
  `sha256:8888419e84d74a7031bdfb5ac0593b0df5c4629224242ce1e119f24b752e8d59`
  to `sha256:7afec88ac39f321692cb79d8e6efa651621537672afba0284031526d8b5ba8ed`
