# Prism Harness X1 microVM architecture decision v4

- Status: owner-selected design; focused closure audit passed; B4 drafting eligible
- Direction: A+, with physical X1 as the first qualified host
- Owner decision record: `docs/ai/workstreams/20260829-homelab-setup-goal36-gate-a0r-v4-x1-firecracker-79186c/OWNER-DECISION-RECORD.md`
- Owner decision blob: `60ef258bab3a84a06c7afcc021b9f73ff3992e1d`
- First host: Ubuntu 24.04, x86_64, KVM
- Preferred VMM: Firecracker with its matching jailer
- Host mutation authorized: no
- Source execution authorized: no
- Gate or receipt eligibility: no
- B4 source drafting eligibility: yes
- Predecessor: closed Gate A0R v3 root-launcher target

## 1. Decision

The owner selected the A+ high-assurance path with X1 first in the decision
record named above. The first high-assurance Prism migration will run on X1,
not on the local Mac. This target specifies one concrete Linux/KVM path:

1. a small root-owned host broker, H0, verifies one owner-signed run capsule,
   consumes its run ID durably, and controls one microVM;
2. the broker launches a pinned Firecracker binary through the matching jailer;
3. a pinned Linux guest verifies all repository and runtime content, then runs
   E1, M1, and V1 without a network device;
4. the guest returns one bounded settlement frame over virtio-vsock;
5. H0 signs the launch and terminal settlement, destroys the microVM, and
   passes sealed checkpoint descriptors to a fixed unprivileged U0 child;
6. H0 invokes pre-ratified X4 after the U0 attempt on the clean path; and
7. a separate deadline executor performs recovery and invokes X4 automatically
   after crash or expiry while an independent read-only watchdog alerts on
   failure.

The macOS Virtualization.framework design is deferred. Apple APIs do not
appear in the X1 runtime, guest runtime, provider adapters, checkpoint
semantics, or retained evidence consumers. A separately versioned host-neutral
broker contract will be extracted only when a second host backend is authorized.

## 2. Why this replaces v3

V3 closed the coordinator-identity gap by installing a root launcher, but made
that launcher parse attacker-controlled Git objects and used a root shell for
installation. Its final hardening result was `rethink` with one Critical and
five Important findings.

V4 keeps only the part that still needs host authority: exact launch identity,
durable one-run consumption, microVM custody, and settlement signing. Git,
schema, policy, and runtime parsing move into the disposable guest. H0 accepts
only a fixed-size binary control header plus bounded opaque byte ranges.

This does not pretend a VM removes every privileged component. The corrected
A+ design retains a small one-shot root broker, key, tombstone directory,
installation gate, independent watchdog, and decommission gate. It installs no
broker daemon or listening service. The reduction is in privileged complexity,
not in the existence of a host trust anchor.

## 3. Verified X1 feasibility

Read-only live checks on 2026-08-29 established:

| Capability | Observed state |
|---|---|
| Host | Ubuntu 24.04, Linux 7.0, x86_64 |
| CPU | AMD Ryzen AI 9 HX 470, 12 cores, 24 logical CPUs, AMD-V |
| Memory | about 92 GiB total and 89 GiB available during inspection |
| Storage | about 1.8 TB available on the root ext4/LVM filesystem |
| KVM | `/dev/kvm` present as `root:kvm` mode `0660` |
| Kernel controls | KVM AMD, seccomp, namespaces, user namespaces, cgroups, and vsockets enabled |
| Host confinement | cgroup v2, systemd 255, AppArmor enabled |
| Existing runtimes | containerd, Docker, Podman, and runc installed |
| Missing VMMs | Firecracker, jailer, Cloud Hypervisor, QEMU, and `qemu-img` absent |

The operator account is not in the `kvm` group. H0 and the jailer therefore
own KVM access; an ordinary Prism client never receives `/dev/kvm` access.

The current Firecracker candidate is v1.16.1. Its official x86_64 archive has
published digest
`sha256:382a02a869e4d6d5cb14c40577f9545e8458021ea8b0b2d3fc10ec14d9c242e6`.
B4 must independently fetch, verify, retain, and bind the exact release,
matching jailer, source tag, license, and SBOM before Q4 can exist. This
candidate pin is not installation authority.

## 4. Architecture

```text
external owner key
       |
       | signed R4 capsule and one run ID
       v
trusted owner controller -----> root-owned H0 on X1
                                      |
                                      +--> root tombstone + launch signature
                                      |
                                      +--> jailer --> Firecracker/KVM
                                                       |
                                              no NIC, read-only rootfs
                                                       |
                                            guest G0: E1 -> M1 -> V1
                                                       |
                                      <------ bounded virtio-vsock frame
                                      |
                                      +--> root-signed terminal settlement
                                      +--> destroy VM and transient state
                                      +--> sealed-FD handoff --> unprivileged U0
                                      +--> execute pre-ratified X4 cleanup

deadline executor ------------> fixed recovery/X4 predicates only
independent watchdog ---------> alert on deadline/executor failure
```

`X1FirecrackerBrokerV1` is the only host contract in this target. The portable
seam is the already-defined E1/M1/V1 input and output semantics, fixed
settlement evidence, and checkpoint rules. Firecracker, KVM, systemd,
AppArmor, recovery, and installation mechanics remain X1-local. A future
macOS or other Linux backend requires a new reviewed target; only then may a
shared host-broker contract be extracted from two real implementations.

## 5. Components

### H0: X1 host broker

H0 is a native, root-owned, hardened one-shot binary installed by Q4 and
invoked in the foreground by one attended, fixed `sudo` ceremony. Q4 installs
no H0 service or request socket. H0:

- verifies the owner SSHSIG over exact R4 receipt bytes;
- validates a fixed binary capsule header and exact length limits;
- creates an exclusive root-only run tombstone and fsyncs it before launch;
- hashes exact root-owned Firecracker, jailer, kernel, rootfs, configuration,
  guest-runtime, and policy bytes;
- invokes only fixed argv for the matching jailer and Firecracker;
- retains exclusive custody of the Firecracker API and vsock Unix sockets;
- signs the launch and exactly one terminal settlement; and
- kills and reaps the VM before releasing the host maintenance lock.

H0 does not invoke Git, parse Git objects, parse JSON or YAML, run a shell,
load plugins, follow user-controlled symlinks, resolve user-selected paths, or
execute a caller-selected command.

### Q0, R0, D0, and W0: bounded lifecycle paths

Q0 is a qualification-only entrypoint compiled into the exact H0 binary. Q4
invokes it with one fixed argv and a distinct fixed request magic under Q4
authority. Q0 accepts only prebuilt inert fixture digests, uses a disposable
fixture key and root, cannot create a production tombstone or R4 settlement,
and is removed from the process tree before Q4 succeeds.

R0 is the recovery-only entrypoint of the exact H0 binary. It starts only from
the root-owned D0 service or the attended fixed controller path, requires an
existing consumed tombstone, cannot accept a run request or start J0/F0/G0,
and may only reconcile resources, restore or quarantine scheduler state, and
sign one non-passing recovery settlement.

D0 is a root one-shot deadline executor on a dedicated five-minute systemd
timer. It has no listening socket and no launch authority. It may invoke only
R0 or the pre-ratified X4 path when their closed predicates are true. W0 is a
separate root one-shot timer with read-only status and alert authority. W0
cannot invoke H0, R0, D0, or X4, so failure or compromise of the mutating
deadline path does not suppress the independent alert path.

### J0/F0: jailer and Firecracker

The matching release pair is installed root-owned and immutable to non-root
accounts. J0 creates a unique chroot, PID namespace, cgroup-v2 subtree, and
dedicated UID/GID for the one VM, then drops F0 to that identity. Firecracker's
default seccomp filters remain enabled. No snapshot, MMDS, balloon, GPU, USB,
host filesystem share, or network interface is configured.

### G0: immutable Linux guest

G0 consists of an exact guest kernel, initramfs or read-only ext4 root image,
guest init, E1/M1/V1 sources, runtimes, schemas, policies, and trust material.
Every component is bound by SHA-256 and a source/build provenance record.

The guest gets:

- one read-only root filesystem;
- one bounded ephemeral scratch device or tmpfs;
- one virtio-vsock device;
- fixed CPU, memory, process, file-size, and wall-clock limits; and
- no network device and no host directory share.

The guest verifies the owner capsule, repository objects, authority ancestry,
runtime bytes, inputs, and expected plan before E1 starts. It creates the
checkpoint object set in guest custody and emits the exact pack, ref proposal,
evidence, and terminal result as a bounded settlement frame.

### U0: unprivileged checkpoint applier

After H0 signs a successful settlement, it seals the settlement-bound pack and
metadata in anonymous Linux memfds and launches exact root-owned U0 bytes only
after dropping to the dedicated no-sudo checkpoint UID/GID, clearing
supplemental groups, setting `no_new_privs`, applying the U0 confinement
profile, and closing every descriptor except the fixed read-only handoff and
bounded result descriptors. No group-readable root file or permissive drop
directory crosses the boundary. U0 may import only those sealed descriptors
into the gate-bound quarantine object directory and perform the create-only
checkpoint ref update. H0 treats U0's semantic output as opaque; Gate A2
independently verifies the signed settlement, pack, resulting commit, ref,
parent, path set, and offline durability. U0 cannot turn an unsigned or failed
settlement into a passing checkpoint.

## 6. Trust model

Trusted for the one migration:

- the external owner signing key and owner-controlled controller session;
- the X1 operator acting deliberately as administrator during Q4 and R4;
- the X1 firmware, host kernel, KVM, systemd, AppArmor, and root-owned system
  files bound by the active gates;
- exact root-owned H0, jailer, Firecracker, guest assets, and settlement key;
- the cryptographic primitives and exact system tools named by the gates; and
- the independently reviewed G0 runtime.

B4 build, dependency, fixture, mutation, and fuzz execution is not trusted
operator work. It runs only as a dedicated non-sudo build identity inside a
disposable VM, optionally with a rootless container as an inner layer, with no
operator home, TTY, sudo timestamp, host credential, X1 connection, or
production path. Q4 installs only reviewed,
content-addressed B4 outputs and never compiles or executes untrusted build
inputs under `cbolden15` or root. The attended Q4/R4 ceremony runs `sudo -K`
immediately before and after the fixed privileged step and records the
effective sudo `timestamp_type`. Because the existing operator has passwordless
sudo, timestamp invalidation is hygiene, not the security boundary.
Qualification refuses the ceremony unless every other `cbolden15`
login/session and every process outside the gate-bound controller process tree
is absent. The actual boundary is that no untrusted code runs under the trusted
operator identity.

Untrusted:

- repository content and Git objects;
- Prism request, provider, model, and tool output;
- the dedicated unprivileged Prism client and VM service identities;
- unrelated non-root X1 processes;
- all bytes received through H0's stdin except the fixed header H0 validates;
  and
- U0 until Gate A2 re-verifies its result.

The existing `cbolden15` X1 account has passwordless sudo and is therefore a
trusted operator account, not an adversarial workload identity. No model,
provider, repository hook, plugin, E1/M1/V1 process, or untrusted build step may
run under that account during B4, Q4, or R4. A dedicated no-login/no-sudo VM
identity runs Firecracker after the jailer drops privileges. A separate
no-sudo build identity owns every B4 dynamic test.

Root compromise, malicious deliberate operator action as root, kernel/KVM or
firmware compromise, stolen owner or settlement private keys, cryptographic
break, or compromise of a correctly gate-pinned upstream binary is outside the
one-run threat model.

## 7. Host coexistence and maintenance window

X1 already runs a root C3 worker on an hourly timer. R4 therefore requires a
bounded maintenance window:

1. prove the independent five-minute expiry watchdog and alert route healthy;
2. acquire one root-owned Prism maintenance lock;
3. record C3's exact active/enabled state, then stop but never disable its timer;
4. inhibit new C3 and other root agent starts without deleting their state;
5. prove the C3 service and any other conflicting worker are inactive;
6. prove no stale Firecracker, jailer, broker run, API socket, vsock socket, or
   run directory exists;
7. execute one R4 attempt;
8. run the bounded U0 checkpoint attempt for a passing settlement; and
9. restore prior scheduler state only after terminal settlement and cleanup
   verification.

Unexpected root work, failed inhibit, ambiguous prior activity, or inability
to restore the previous scheduler state fails R4 before consumption. Existing
backup and repository-check timers remain active unless resource qualification
shows a concrete collision; they are not silently disabled. The watchdog alerts
through the existing X1 notification route when the maintenance lock or
tombstone remains unresolved for 15 minutes. Because C3 is stopped but never
disabled, an X1 reboot restores the previously enabled timer; the tombstone
still remains quarantined and cannot authorize a retry. D0 runs independently
after reboot and invokes R0 or X4 only when the corresponding fixed predicate
is proven; W0 continues alerting until D0 completes or the state is explicitly
quarantined.

## 8. Launch measurement and settlement identity

Firecracker does not provide hardware-backed guest attestation for this design.
The evidence is therefore called an H0 launch measurement, not measured boot.
H0 hashes the exact bytes and configuration it launches and signs that
measurement with the Q4-installed settlement key.

This is sufficient under the stated trust model because H0, root custody, KVM,
and the host kernel are trusted. The guest does not carry an extractable key and
does not claim to attest itself. A same-user host process cannot forge a valid
H0 signature, replace root-owned launch inputs, or access H0's Firecracker and
vsock sockets.

## 9. Replay and failure semantics

H0 creates the root tombstone before launching J0. Consumption is permanent
even if the broker, VM, host, or power fails. A consumed run ID cannot be
retried under the same R4 receipt.

Exactly one terminal outcome exists:

- `passed`: H0 received one complete valid guest frame and signed it;
- `failed`: H0 observed a defined guest or policy failure and signed it; or
- `indeterminate`: H0 could not prove a complete result before cleanup.

A crash may leave only the durable tombstone and launch evidence. That is a
terminal non-passing outcome, not authorization to rerun. D0 invokes R0 after
the maintenance deadline when no live H0 owns the run. R0 reconciles processes,
sockets, cgroups, files, scheduler state, and evidence and signs a non-passing
recovery settlement without executing recovered work.

## 10. Installation and decommission

Q4 uses the existing owner-controlled X1 Ansible path with SSH host-key
verification, pipelining, explicit approval variables, and root-owned
destinations. This is valid only because the controller session and X1
operator account are trusted control-plane identities. Q4 cannot run model or
repository code under that operator account.

Q4 may place root-owned binaries, assets, policy, key, ledger, evidence, one
small D0 deadline service/timer, and one independent W0 watchdog service/timer,
but it may not register H0 as a daemon or socket-activated service. Before Q4
starts, the owner must separately sign X4
authority that names every removable and retained path, requires an install
expiry no later than 24 hours after Q4 begins, and permits cleanup only after a
matching terminal R4 settlement or explicit abandonment condition.

H0 executes the pre-ratified X4 cleanup after terminal evidence is durable and
the bounded U0 attempt has returned. If H0 crashes, D0 invokes R0 as needed and
then invokes X4 automatically at the signed terminal or installation-expiry
predicate. X4 removes private key material, broker/VMM/guest assets, AppArmor,
D0, and W0 units, transient state, and dedicated identities while preserving
the declared public evidence. W0 alerts every five minutes after the bound
deadline until D0/X4 completes or the state is explicitly quarantined. R4 is
refused after the installation expiry.

## 11. Options considered

### Selected: Firecracker with jailer

Firecracker is purpose-built for KVM microVMs, supports x86_64, has a matching
jailer, default seccomp filters, cgroup and namespace controls, minimal device
emulation, and a virtio-vsock channel. It best matches a one-shot, no-network,
small-attack-surface execution cell.

### Correct alternative: Cloud Hypervisor

Cloud Hypervisor also provides a modern Rust KVM VMM with minimal emulation and
vsock. It remains architecturally sound. It is not selected because the first
run needs fewer devices and no migration or hotplug, while Firecracker has the
more directly matched jailer and production-host guidance. A switch requires a
new target and independent qualification.

### Qualification fallback only: QEMU/KVM

QEMU is mature and the repository already has a disposable QEMU rehearsal. Its
larger emulation surface makes it a useful pre-gate reference and failure-
recovery fixture, not the R4 VMM. Firecracker unavailability does not silently
promote QEMU; it blocks this target or requires a new reviewed target.

### Rejected for strict A+: Docker or Podman alone

Containers share the X1 kernel with the workload. They remain useful for
deterministic builds and tests but do not supply the selected workload boundary.

## 12. Scope reconciliation

The adopted OSS MVP reset remains in force. `prism:demo` must remain runnable
without constitutional gates, owner receipts, immutable evidence, Firecracker,
or X1. Gate A0R v4 governs only the one high-assurance migration and its exact
X1 Firecracker runtime. No generic host-broker or macOS backend is implemented
in this target.

Provider-neutral goal execution, Codex and Claude adapters, private repository
creation, recovery proof, and exact artifact migration remain Goal #36 work.
This decision changes the first qualified host; it does not remove or redefine
those outcomes.

## 13. Entry and exit conditions

Before B4 can be drafted, the v4 authority and runtime contracts must close all
historical Critical and Important findings, including complete independent
review requirements.

Before Q4 can be requested, exact source, binary, image, unit, profile, tool,
host, acceptance-corpus, rollback, and decommission identities must be built,
reviewed, and gate-bound.

Before R4 can be requested, Q4 installation evidence, host drift checks,
maintenance-window rehearsal, guest qualification, failure injection, replay
rejection, cleanup, and decommission rehearsal must pass.

No owner receipt is requested until every named review lens and an independent
second engine return complete results with zero unresolved Critical or
Important findings.

## 14. Non-authority

This decision authorizes design work only. It does not authorize source
execution, Firecracker download or installation, X1 mutation, user or group
creation, systemd or AppArmor changes, scheduler inhibition, key generation,
Gate E changes, repository creation, checkpoint creation, a migration run, or
any owner receipt request.
