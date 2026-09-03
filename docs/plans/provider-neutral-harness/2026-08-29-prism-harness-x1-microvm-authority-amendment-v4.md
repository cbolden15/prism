# Prism Harness X1 microVM authority amendment v4

- Status: prospective; design closure verified; B4 drafting eligible
- Architecture: X1 Firecracker broker v4
- First target: one local high-assurance AGE staging migration on X1
- Owner decision record: `docs/ai/workstreams/20260829-homelab-setup-goal36-gate-a0r-v4-x1-firecracker-79186c/OWNER-DECISION-RECORD.md`
- Owner decision blob: `60ef258bab3a84a06c7afcc021b9f73ff3992e1d`
- Gate eligibility: blocked
- Owner receipt eligibility: blocked
- Host mutation: none

## 1. Purpose

This amendment replaces the closed v3 root-launcher path with an X1-first
microVM authority chain. It authorizes no action by itself. Its purpose is to
separate source/build review, privileged installation, one exact run, and
decommission into four independently ratified authorities. X4 is signed before
Q4 so installation never creates an open-ended privileged lifecycle.

The companion runtime contract is the sole normative source for operation
order. This amendment defines authority, durable identities, and withheld
effects.

## 2. Historical preservation

All v1, v2, and v3 gates, receipts, reviews, reports, findings, and ineligible
run candidates remain historical and unchanged. None grants v4 authority.

V4 inherits every unresolved historical requirement without waiver. In
particular it must preserve the acyclic gate construction, external owner trust
root, exact authority chain, immutable runtime custody, complete acceptance
matrix, fixed checkpoint paths, create-only promotion, offline Gate A2
durability, and zero-unresolved-Critical-or-Important exit rule.

## 3. Authority stages

The stages are:

- **B4**: author and inspect exact H0, guest, build, qualification, acceptance,
  and later-gate artifacts; dynamic work is isolated from the sudo-capable
  operator and X1;
- **Q4**: perform one exact supervised X1 installation and qualification of
  the one-shot broker, VMM, guest assets, trust key, host policy, fixed
  recovery/deadline executor, independent watchdog, and already owner-signed
  decommission path;
- **R4**: consume one exact run ID and perform one exact X1 microVM migration;
  and
- **X4**: automatically decommission the installed v4 trust anchor through H0
  on the clean path or D0 after recovery, terminal settlement, or the signed
  installation-expiry/abandonment condition.

No stage inherits an effect from an earlier stage unless this amendment and
the active gate explicitly grant it.

## 4. Acyclic commit and receipt graph

The prospective authority chain is:

```text
B4 external owner decision
          |
          v
source, build, review, and qualification commit S
          |
          v
X4 gate commit XG and owner-signed X4 authority XA
          |
          v
Q4 gate commit Q
          |
          v
owner-signed Q4 receipt and authority commit QA
          |
          v
installation and qualification evidence commit I
          |
          v
R4 gate commit G
          |
          v
owner-signed R4 receipt and authority commit RA
          |
          v
one X1 run and terminal settlement T
          |
          v
create-only checkpoint C
          |
          v
automatic X4 decommission evidence X
          |
          v
Gate A2 durability evidence D
```

No gate core or pre-gate capsule contains its own final digest, final Git
object ID, owner signature, post-gate authority commit, installation evidence,
run result or checkpoint ID. Every gate uses the existing
canonical JSON self-digest rule, with only its declared top-level self-digest
field zeroed during digest computation.

The owner receipt is external to the gate. It binds the completed gate bytes,
gate digest, capsule bytes, capsule digest, stage transaction or run ID, exact
predicate, and stage-specific identities. X4 binds an exact installed manifest,
retained manifest, deadline, and terminal/abandonment predicate rather than an
unknown future settlement digest. Runtime evidence must satisfy that signed
predicate; it never fills or changes the owner receipt. The later authority
commit binds each receipt and signature. This is the only permitted direction
of dependency.

## 5. B4 grant

B4 may authorize only:

- exact source authoring for H0, guest G0, U0, validators, build tools, test
  fixtures, failure injectors, and decommission tooling;
- deterministic builds, static inspection, and dynamic tests only under a
  dedicated non-sudo identity in a disposable VM, optionally with a rootless
  container as an inner layer, with no operator home, TTY, sudo timestamp, X1
  route, host credential, privileged
  runtime socket, private repository, or production path;
- fetching and retaining exact public upstream source and release artifacts;
- creating SBOM, provenance, license, digest, mutation-corpus, and review
  outputs;
- disposable CI or local QEMU/Firecracker fixture runs that cannot connect to
  X1, production credentials, private repositories, or publication paths; and
- drafting Q4, R4, X4, and Gate A2 artifacts.

B4 may not authorize any X1 connection that changes state, any root action,
key generation, installation, scheduler change, Gate E change, private
repository creation, artifact migration, checkpoint, push, PR, or deployment.

## 6. Closed B4 output set

Before Q4 can be drafted, B4 must close and commit:

1. exact `X1FirecrackerBrokerV1`, Q0/H0/R0/D0/W0/U0, G0, validator, build,
   acceptance, and decommission sources;
2. exact compiler, linker, runtime, package, container, and upstream inputs;
3. Firecracker and jailer release, archive digest, source tag, signature or
   published checksum, license, and SBOM;
4. exact guest kernel source/config/build, rootfs build, runtime closure, and
   reproducibility evidence;
5. fixed binary host and guest frame grammars plus adversarial corpora;
6. exact Q0/H0/R0 entrypoints, D0 and W0 services/timers, every AppArmor
   profile in enforce mode, users/groups, paths, modes, resource limits,
   maintenance lock, 15-minute alert deadline, and scheduler
   inhibit/restore procedure;
7. root tombstone, launch measurement, settlement key, terminal state, sealed
   memfd U0 handoff, checkpoint, recovery actor, and retention protocols;
8. pre-Q4 X4 receipt grammar, 24-hour installation expiry, automatic H0/D0
   decommission plan, independent W0 alert path, and successful disposable
   rehearsal;
9. host qualification and drift manifest for physical X1; and
10. complete authority, security, correctness, feasibility, scope, design,
    and independent second-engine review with no unresolved Critical or
    Important finding.

Unknown, mutable, unreviewed, unpinned, or missing output keeps Q4 ineligible.

## 7. Q4 grant

Q4 may authorize one exact owner-supervised installation transaction on X1.
The Q4 receipt must bind:

- Q4 gate and capsule hashes;
- transaction ID and exact parent authority;
- X1 host identity and qualification manifest;
- every source, package, binary, guest image, unit, profile, path, mode, user,
  group, resource limit, and installer input digest;
- the exact owner-controlled Ansible invocation and approval values;
- the trusted controller and operator identities;
- effective sudo `timestamp_type`, `sudo -K` before/after evidence, and proof
  no other operator login/session or non-allowlisted process tree exists;
- rollback arms for every pre-success failure;
- post-install attestation and qualification outputs; and
- the complete owner-signed X4 authority, exact D0 dispatch and W0 alert routes,
  15-minute maintenance deadline, install expiry no later than 24 hours after
  Q4 begins, and exact Q0 qualification-only authority.

Q4 may install only default-deny components. H0 and R0 are one-shot binary
entrypoints; Q4 may not register an H0/R0 service, listening socket, or
unattended run start path. D0 is a persistent root one-shot timer that can
invoke only R0 or pre-ratified X4 under closed predicates. W0 is a separate
persistent read-only timer with status and alert authority, never broker,
scheduler, VM, key, recovery, or X4 authority. Q4 may run bounded qualification
fixtures through Q0, the qualification-only entrypoint of exact H0 bytes, using
the Q4 receipt, distinct request magic, disposable key/root, and no real
migration artifact, provider credential, private repository content, or R4
receipt. Q0 cannot create a production tombstone or terminal R4 settlement.
Q4 may generate the settlement key, initialize an empty root tombstone root,
exercise replay and failure fixtures, and prove decommission in a disposable
equivalent target.
It installs only reviewed content-addressed B4 outputs and performs no source
build or untrusted dependency/fixture execution under the operator or root.

Q4 success ends rollback authority for installed trust-anchor state. Removal
after success requires the already owner-signed X4 predicate; no later owner
action is required for automatic clean-path, crash-path, or expiry cleanup.
Q4 grants no real migration run and no checkpoint. R4 is refused after
installation expiry.

## 8. R4 grant

R4 may authorize exactly one attempt for one run ID. Its receipt must bind:

- R4 gate and capsule hashes;
- the owner key, principal, signature namespace, run ID, and expiry policy;
- exact authority chain `S -> XG -> XA -> Q -> QA -> I -> G -> RA`;
- X1 host, kernel, KVM, systemd, AppArmor enforce state, Q0/H0/R0/D0/W0/U0,
  jailer, Firecracker, guest kernel, rootfs, guest runtime, schema, policy, and
  settlement-key identities;
- exact input object IDs, byte hashes, authority parents, plan, effect set,
  checkpoint path set, and expected output bounds;
- maintenance lock, scheduler state, resource limits, timeout, cleanup, and
  recovery policy;
- D0/W0 identities, dispatch/alert routes, 15-minute maintenance deadline,
  install expiry, and the pre-ratified X4 gate/receipt identities; and
- exact terminal and Gate A2 verification rules.

H0 consumes the run ID durably before jailer launch. R4 grants no retry after
consumption, including after crash, power loss, timeout, indeterminate result,
or missing settlement. A new attempt requires a new reviewed gate and owner
receipt; it cannot reuse R4 identities.

After a passing terminal settlement, R4 authorizes H0 to pass only sealed
pack/metadata descriptors to exact U0 after a complete privilege drop, record
the bounded U0 result without trusting its labels, then execute only the
matching pre-ratified X4 predicate. Failed or indeterminate settlements skip
U0 and proceed to X4. A consumed run with no terminal settlement authorizes
only R0's fixed reconciliation path; R0 may sign one non-passing recovery
settlement but cannot launch or resume work. D0 may invoke R0/X4 under their
closed predicates. Incomplete X4 cleanup does not rewrite the immutable R4 or
R0 arm, but it leaves W0 alerting and blocks Gate A2 and lifecycle completion.

## 9. X4 grant

X4 is mandatory lifecycle authority, not an optional future note. Its gate and
owner receipt are completed before Q4 and bind the expected installation
manifest, settlement public key derivation rule, every removable or retained
path, scheduler state, retention decisions, fixed removal operations,
post-removal checks, a deadline no later than 24 hours after Q4 begins, and the
only two execution predicates:

1. a valid terminal R4 settlement for the bound run; or
2. the signed deadline/abandonment condition with proof no active run exists.

The actual installation attestation, terminal settlement, and later Gate A2
result are runtime evidence checked against those predicates. They are not
unknown values inserted into the signed X4 receipt.

X4 may prove H0/R0 has no registered service/socket, remove runtime binaries
and assets, destroy private key material, reconcile root tombstones into the
approved retained evidence form, restore prior scheduler state, remove D0 and
then W0 last, and prove no broker, VMM, namespace, cgroup, socket, unit, policy,
expiry sentinel, or writable runtime path remains.

X4 cannot erase historical gate, receipt, signature, public key, settlement,
checkpoint, durability, or decommission evidence required by the retention
contract.

## 10. Owner signature protocols

B4 retains an explicit external owner-channel trust root and selects one exact
SSH Ed25519 owner public key.

X4, Q4, and R4 receipts are fixed UTF-8 line protocols. X4 may be signed before
Q4 because it binds predicates and manifests, not unknown result digests. Unknown, missing,
duplicated, reordered, noncanonical, or trailing bytes fail. The owner signs
the exact bytes using SSHSIG namespaces:

- Q4: `prism-age-stage-q-v2`
- R4: `prism-age-stage-r-v4`
- X4: `prism-age-stage-x-v1`

Verification uses the B4-selected public key, principal `vora-owner`, exact
root-owned or gate-pinned `ssh-keygen`, and no mutable allowed-signers file.

`Not ratified` grants no effect. `Ratified with amendments` grants no effect
unless the amendment bytes, amended capsule, amended gate, and new signature
form a new reviewed authority target.

## 11. Invalidation

Any of the following invalidates the active stage before its first effect:

- branch, parent, source, gate, capsule, signature, host, tool, binary, image,
  unit, profile, policy, key, path, mode, scheduler, or resource drift;
- AppArmor complain/unloaded state, another operator login/session, or any
  process outside the gate-bound controller tree under `cbolden15`;
- incomplete review or unresolved Critical or Important finding;
- failed maintenance inhibit, stale run state, prior tombstone, active
  conflicting worker, or ambiguous scheduler state;
- missing pre-ratified X4 authority, expired installation, failed D0 dispatch
  or W0 alert route, missing rollback, or missing decommission evidence;
- inability to prove exclusive Firecracker API/vsock custody;
- network device or host share appearing in the VM configuration; or
- any unlisted field, operation, executable, descriptor, or effect.

After H0 durably consumes R4, drift produces a terminal non-passing result and
does not restore authority.

## 12. Withheld authority

Unless a later active stage explicitly grants it, all of the following remain
forbidden:

- running authored source or fixtures against X1 before Q4;
- installing Firecracker, jailer, H0, guest assets, users, groups, units,
  profiles, keys, or policies, except the exact Q4-granted one-shot artifacts
  and the exact D0/W0 lifecycle units;
- changing sudo, SSH, firewall, Docker, Podman, Gate E, C3, backup, repository-
  check, or scheduler configuration;
- granting `/dev/kvm` to the operator or Prism client;
- adding a VM NIC, host filesystem share, mutable rootfs, snapshot, MMDS, or
  unbounded console;
- creating private repositories, branches, commits, refs, pushes, PRs,
  releases, deployments, or owner receipts; and
- retrying, waiving, relabeling, or treating incomplete review as clean.

## 13. Non-authority

This prospective amendment is not B4, Q4, R4, or X4. Repository presence,
review, build success, Firecracker release availability, KVM availability,
root access, existing X1 infrastructure, or an owner design preference does
not substitute for a stage-specific signed receipt.
