# Prism Harness X1 microVM runtime contract v4

- Status: prospective; design closure verified; B4 drafting eligible
- Architecture: `X1FirecrackerBrokerV1`
- Owner decision record: `docs/ai/workstreams/20260829-homelab-setup-goal36-gate-a0r-v4-x1-firecracker-79186c/OWNER-DECISION-RECORD.md`
- Owner decision blob: `60ef258bab3a84a06c7afcc021b9f73ff3992e1d`
- Target: one X1 high-assurance AGE staging migration
- Normative order: this document is the sole source
- Closure rule: every field, byte, source, path, process, descriptor, effect,
  transition, identity, and failure not admitted here and by the exact active
  gate is refused

## 1. Scope and threat model

B4 permits closed source authoring, deterministic build, static inspection,
isolated disposable fixture execution, and construction of Q4/R4/X4 gates. Q4
permits one supervised X1 installation and qualification of a one-shot broker.
R4 permits one consumed microVM attempt. X4 permits exact decommission and is
separately owner-signed before Q4 may install anything.

The design protects against:

- repository, Git-object, worktree, source-path, runtime, image, VMM, unit,
  policy, receipt, parent, ref, or checkpoint substitution;
- caller-, model-, provider-, input-, or output-selected host executable code;
- an unprivileged X1 process fabricating H0 launch or settlement evidence;
- untrusted Git parsing reaching the host-root boundary;
- replay after run consumption, including crash and power loss;
- host or guest network access not explicitly admitted by the run;
- false confinement results caused by missing resources, refusal, timeout, or
  generic exceptions;
- stale-parent promotion, ref collision, object residue, partial result frames,
  and mutable unsigned terminal evidence; and
- scheduler collision with the existing root C3 worker.

The design trusts the external owner key, owner-controlled controller, the X1
operator deliberately acting as administrator, exact X1 firmware/kernel/KVM
and root-owned system runtime, exact H0/J0/F0/G0 bytes, and exact cryptographic
tools. The passwordless-sudo X1 operator account is control-plane authority and
must never run untrusted model, provider, repository hook, plugin, Prism
runtime, dependency build, fixture, mutation, or fuzz code.

Every B4 dynamic build/test runs under a dedicated non-sudo identity in a
disposable VM, optionally with a rootless container as an inner layer, with no
operator home, TTY, sudo timestamp, host credential, X1 connection, production
path, or privileged runtime socket.
Q4 accepts only reviewed content-addressed B4 outputs and performs no compile,
dependency resolution, repository hook, or untrusted fixture generation.

The dedicated Prism client and Firecracker service identities are untrusted
and have no sudo, login shell, Docker/Podman group, KVM group, policy-write,
key-read, ledger-write, scheduler-control, or host-repository authority.

Root/operator compromise, malicious deliberate root action, kernel/KVM or
firmware compromise, stolen owner or H0 private key, cryptographic break, and
compromise of a correctly gate-pinned upstream binary are outside scope.

## 2. Components and trust boundaries

| ID | Component | Privilege | Authority |
|---|---|---|---|
| O0 | external owner signer | external | selects exact stages and run |
| C0 | owner-controlled deployment controller | trusted operator | Q4 deployment only |
| B0 | isolated B4 builder/tester | dedicated non-sudo disposable identity | deterministic build and hostile fixtures only |
| Q0 | H0 qualification-only entrypoint | attended root foreground process | inert Q4 fixture only; no production tombstone, R4 settlement, or run authority |
| H0 | X1 native one-shot broker | attended root foreground process | R4 receipt verification, consumption, VM custody, settlement, U0 handoff, conditional X4 |
| R0 | H0 recovery-only entrypoint | root oneshot from D0 or fixed attended path | consumed-run reconciliation and one non-passing recovery settlement; no launch |
| J0 | matching Firecracker jailer | starts root, drops | chroot, namespaces, cgroup, UID/GID drop |
| F0 | Firecracker VMM | dedicated unprivileged identity | exact KVM microVM only |
| G0 | immutable Linux guest init/runtime | guest root then confined workers | capsule/Git/runtime verification and E1/M1/V1 |
| D0 | deadline/recovery dispatcher | root oneshot on dedicated five-minute timer | invoke only R0 or pre-ratified X4 when a closed predicate is true |
| W0 | independent expiry watchdog | root oneshot on dedicated five-minute timer | read-only drift checks and alerts only |
| U0 | host checkpoint applier | dedicated no-sudo unprivileged identity | reads sealed pack descriptors and proposes create-only ref |
| A2 | offline durability verifier | unprivileged, independent | final checkpoint and settlement verification |

H0 is the only run component that may access the settlement private key,
Firecracker API socket, or host side of the vsock channel. R0 is the only other
entrypoint permitted to open that key, and only after proving an existing
consumed tombstone, absence of a live H0 owner, and a recovery predicate. Q0
uses a disposable fixture key and fixture root and cannot open production key
or ledger paths. H0 and R0 are fixed entrypoints in the same reviewed binary;
mode-confusion tests prove each rejects the other modes' magic, receipt, paths,
and effects.

D0 has no key or direct mutation grammar. Its fixed root-owned service may
invoke only R0 or X4 with gate-bound argv after independently proving the
corresponding status predicate. It cannot invoke the Q0 or H0 run entrypoints.
W0 may read only the gate-bound status projection and may send an alert; it
cannot read H0's key or opaque run inputs, alter scheduler state, launch
Q0/H0/R0/J0/D0, or execute X4.
F0 receives `/dev/kvm` only through J0's qualified launch. G0 receives no host
credential, host directory, Docker socket, SSH agent, provider key, or network
device.

## 3. Primitive encodings

Unless a field definition says otherwise:

- integers are unsigned big-endian;
- SHA-256 values are 32 raw bytes in binary frames and lowercase 64-character
  hexadecimal in text receipts;
- UUIDs are 16 raw RFC 4122 bytes in frames and lowercase canonical text in
  receipts;
- text is UTF-8 without BOM, NUL, CR, non-ASCII control bytes, or trailing
  whitespace;
- paths are absolute normalized byte strings selected by the active gate, not
  caller values;
- symbolic links, hard links, device files, FIFOs, and sockets are refused in
  staged artifact trees unless a named fixture expects rejection; and
- lengths are checked before allocation, addition, copy, hashing, or read.

The H0 request begins with exactly 224 bytes:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 8 | ASCII magic `PRSMX1V4` |
| 8 | 2 | version `1` |
| 10 | 2 | header length `224` |
| 12 | 4 | zero flags |
| 16 | 16 | run UUID |
| 32 | 32 | owner-selected nonce |
| 64 | 4 | receipt length |
| 68 | 4 | SSHSIG length |
| 72 | 8 | capsule length |
| 80 | 8 | input pack length |
| 88 | 8 | maximum result length |
| 96 | 32 | receipt SHA-256 |
| 128 | 32 | SSHSIG SHA-256 |
| 160 | 32 | capsule SHA-256 |
| 192 | 32 | input pack SHA-256 |

Payload bytes follow in that exact order: receipt, SSHSIG, capsule, input pack.
No extension, alternate version, compression, chunk reordering, duplicate,
trailing byte, or unknown flag is accepted. B4 binds exact maxima and a
mutation corpus covering truncation, overflow, overlap, digest mismatch,
duplicate frames, malformed UUID, zero/maximum lengths, premature EOF, slow
delivery, and trailing data.

H0 reads the frame from already-open stdin during the attended one-shot
ceremony and writes only bounded evidence to gate-bound descriptors. It opens
no public request socket. H0 parses only this header and the fixed R4 receipt
line protocol. Capsule and Git pack bytes are opaque to H0.

## 4. Acyclic authority values

Q4, R4, and X4 cores and pre-gate capsules omit their own final gate digest,
Git object ID, owner signature, and post-gate identities. Completed gate bytes
and capsule hashes are bound by external owner receipts, then committed in a
later authority commit.

At R4, H0 requires exact values for:

- source, Q4 gate, Q4 authority, installation, R4 gate, and R4 authority
  commits;
- gate, capsule, receipt, signature, host, plan, policy, input pack, and
  expected path-set hashes;
- `X1FirecrackerBrokerV1`, Q0/H0/R0/D0/W0/U0/J0/F0/G0, every unit/probe,
  AppArmor profile, kernel, KVM, runtime, schema, and settlement-key identities;
- run UUID, nonce, expiry policy, timeout, resource limits, and result bound;
- X4 receipt identity, install-expiry deadline, maintenance deadline,
  maintenance lock, and exact pre-run scheduler state; and
- checkpoint parent, create-only ref, path set, and Gate A2 contract.

No runtime output may retroactively fill a pre-run gate field.

## 5. Receipt verification

H0 reads a fixed number of R4 receipt lines in a fixed order. The receipt binds
the values listed in the authority amendment. Unknown, omitted, duplicated,
reordered, noncanonical, or trailing bytes fail before host state changes.

H0 invokes exact root-owned `ssh-keygen -Y verify` with fixed argv, namespace
`prism-age-stage-r-v4`, principal `vora-owner`, a gate-bound public key, a clean
fixed environment, closed inherited descriptors, and the exact held receipt
bytes on stdin. No shell or mutable allowed-signers file is used. Verification
failure creates no tombstone and launches no child.

Q0 is not an R4 caller. It accepts only the distinct fixed magic `PRSMQ4V4`,
fixed qualification argv, exact prebuilt fixture digests, and the owner-signed
Q4 receipt under namespace `prism-age-stage-q-v2`. It refuses the R4 magic,
R4 namespace, production ledger/key paths, real artifact fields, and every
terminal R4 arm. H0's run entrypoint symmetrically refuses Q0 inputs. The Q4
acceptance corpus proves both mode-confusion directions. This lets Q4 exercise
the installed H0 code without requiring R4 authority that can exist only after
Q4 evidence is committed.

G0 independently verifies the same receipt, signature, capsule digest, run
UUID, nonce, authority chain, and input pack before E1.

## 6. X1 host qualification

Q4 records a host manifest. R4 rechecks it immediately before consumption.
The exact active gate sets values, but qualification includes:

- firmware, CPU model/family, microcode, architecture, AMD-V, kernel release,
  boot identity, KVM module, `/dev/kvm` owner/group/mode, and KVM API version;
- systemd, cgroup-v2, seccomp, namespace, AppArmor, OpenSSH, `ssh-keygen`,
  sudo `timestamp_type`, hashing, filesystem, and clock identities and behavior;
- root filesystem type, free bytes/inodes, memory/swap, CPU availability, load,
  and configured resource reservation;
- Q0/H0/R0/D0/W0/U0/J0/F0/G0 and every unit/profile/config/path owner, group,
  mode, inode type, size, and digest;
- every required AppArmor profile loaded in enforce mode, with complain,
  unloaded, stale, replaced, or parser-warning state rejected;
- no writable ancestor, symlink, unexpected mount, overlay, ACL, capability,
  file privilege, or unlisted executable in the trust path;
- exact C3, backup, repository-check, Docker/containerd, D0 deadline route, W0
  alert route, operator login/session and process census, and conflicting
  scheduler states; and
- no stale run UUID, tombstone conflict, process, namespace, cgroup, API/vsock
  socket, chroot, scratch image, or checkpoint ref.

The two unrelated `fwupd` failed units observed during design discovery are not
silently accepted or used as a generic host-health failure. B4 must decide and
test an exact relevance rule. Any failed unit in the qualified KVM, storage,
security, scheduler, broker, or evidence closure blocks R4.

## 7. Q4 installation state machine

This is the sole normative installation order:

1. Verify Q4 and pre-ratified X4 gates, receipts, signatures, authority parent,
   transaction ID, controller identity, SSH host key, operator identity,
   install-expiry deadline no more than 24 hours away, and pre-state.
2. From the trusted controller run `sudo -K`, record the effective sudo
   `timestamp_type`, and prove no other `cbolden15` login/session or process
   exists outside the gate-bound controller process tree. Treat timestamp
   invalidation as hygiene because the account has passwordless sudo. Acquire
   the Q4 maintenance lock and inhibit conflicting root agent starts without
   disabling their unit files.
3. Re-run the read-only host qualification and compare exact expected state.
4. Prove every installed input is a reviewed content-addressed B4 output and
   that Q4 will perform no source build, dependency resolution, or hostile test.
5. Create dedicated non-login H0 support and per-VM UID/GID identities with no
   supplemental groups.
6. Create root-only immutable install, policy, key, ledger, evidence, chroot,
   and transient parent directories with gate-bound ancestors and modes.
7. Copy exact prebuilt Q0/H0/R0 code, D0 and W0 units/probes, U0, jailer,
   Firecracker, kernel, rootfs, guest-runtime, AppArmor profiles,
   configuration, acceptance, and X4 bytes through the trusted controller's
   SSH/Ansible path. No Q0/H0/R0 unit or request socket is installed.
8. Verify every installed byte, owner, group, mode, file type, link count,
   capability, and ancestor before first execution.
9. Load every exact AppArmor policy and prove each is in enforce mode. Install
   and enable D0's fixed recovery/decommission service and five-minute timer
   plus W0's separate read-only five-minute watchdog timer. Prove D0 can invoke
   only R0 or X4 after a closed predicate and cannot invoke Q0/H0/J0/F0/G0.
   Verify W0's existing X1 notification route and prove W0 cannot launch or
   mutate any Prism or scheduler component.
10. Generate the H0 Ed25519 settlement key with fixed direct argv, root-only
   custody, no agent, no passphrase transport, and post-generation public-key
   attestation. Initialize an empty root ledger, write the signed X4 identity
   and expiry sentinel, and fsync their parents.
11. Invoke Q0 once with fixed qualification argv, `PRSMQ4V4`, the Q4 receipt,
    inert prebuilt fixture inputs, a disposable fixture key/root, and a
    disposable guest with no real Prism artifact or provider credential. Run
    the Q0/H0 mode-confusion corpus and prove Q0 cannot create a production
    tombstone or R4 settlement.
12. Stop and reap Q0/J0/F0, destroy the fixture key, remove fixture transient
    state, restore exact prior
    scheduler state, and prove no broker listener or daemon exists.
13. Emit and commit the installation attestation, host manifest, acceptance
    results, rollback result, public key, D0 and W0 results, AppArmor enforce
    proof, expiry sentinel, and X4 rehearsal evidence.
14. Run `sudo -K` again and mark Q4 successful. Failure before
    this point executes exact rollback; success leaves only the pre-ratified X4
    path and its 24-hour deadline.

Ansible uses SSH host-key verification, pipelining, explicit approval values,
and typed modules. Q4 forbids `shell`, `raw`, `script`, caller-selected
`command`, remote Git checkout, curl-to-shell, package-manager latest-version
selection, and execution from an operator-writable path.

## 8. R4 maintenance and pre-consumption order

The attended controller runs `sudo -K`, repeats the exclusive
login/session/process census, and invokes the fixed root-owned H0 run
entrypoint with no caller-selected argv. H0 performs:

1. read and hold the exact request bytes from already-open stdin;
2. validate framing, lengths, digests, fixed receipt grammar, and owner SSHSIG;
3. validate authority chain, X4 receipt, install expiry, gate/capsule
   identities, current parent, and host qualification;
4. prove W0 and its alert route healthy, then acquire the root maintenance lock;
5. record exact enabled/active state for C3 and every gate-bound conflicting
   scheduler;
6. stop but never disable the C3 timer, inhibit conflicting starts, stop any
   inactive-between-runs oneshot safely, and prove no root worker is active;
7. prove backup/repository-check policy and available capacity still match the
   gate;
8. atomically publish the 15-minute W0 maintenance deadline and exact scheduler
   pre-state;
9. prove no prior run state or output exists; and
10. only then create the run tombstone.

Failure in steps 1 through 9 releases the maintenance lock, restores any
changed scheduler state, and consumes nothing. No VM starts.

## 9. Permanent run consumption

The root ledger parent is a root-owned, non-symlinked, gate-bound filesystem
path. H0 creates one directory named by the canonical run UUID using an
exclusive no-follow operation. Inside it H0 writes held request hashes,
authority identities, host manifest hash, nonce, start timestamp, and state
`consumed`, fsyncs every file, fsyncs the run directory, and fsyncs the ledger
parent.

Existing path, symlink, wrong type, unexpected link count, write failure,
short write, fsync failure, storage error, or ambiguous persistence fails
closed. Once parent fsync succeeds, the run is consumed permanently. No code
path removes or renames the tombstone under R4, rollback, cleanup, recovery, or
ordinary operation.

## 10. Firecracker launch configuration

After consumption, H0:

1. creates a unique root-controlled per-run chroot and socket root;
2. copies or bind-mounts only gate-bound read-only F0, kernel, rootfs, and fixed
   configuration bytes into J0's expected custody;
3. creates one bounded scratch image or declares a fixed tmpfs-only guest;
4. invokes exact J0 with fixed argv, unique run-derived ID, dedicated UID/GID,
   cgroup-v2 parent, PID namespace, chroot root, file-size/descriptor limits,
   and no network namespace containing an interface;
5. requires Firecracker default seccomp and refuses all seccomp-disable or
   custom unreviewed filter options;
6. configures exact vCPU, memory, boot args, read-only root drive, scratch,
   vsock CID/path, serial-output bound, and no other device;
7. signs and fsyncs launch evidence before issuing `InstanceStart`; and
8. starts the VM once.

No snapshot load/save, MMDS, NIC, TAP, bridge, host share, writable root disk,
GPU, entropy source beyond the qualified device, balloon, hotplug, USB, block
backend process, or user-selected API request is permitted.

## 11. Guest boot and execution

G0 boots directly to a fixed init. It:

1. mounts the root filesystem read-only and creates only gate-bound tmpfs or
   scratch paths;
2. proves no NIC, route, DNS configuration, host share, unexpected block
   device, extra process, writable executable path, or ambient credential;
3. opens the exact vsock port and performs a nonce-bound handshake;
4. receives exactly one bounded request payload;
5. re-hashes and independently verifies receipt, signature, capsule, input
   pack, authority chain, object IDs, tree/path closure, schemas, runtime,
   policy, and plan;
6. constructs held immutable E1/M1/V1 inputs before any model/runtime effect;
7. runs the complete positive and negative confinement matrix;
8. executes exact E1, M1, and V1 in the existing accepted semantic order;
9. builds the fixed checkpoint object pack in guest custody without host Git;
10. emits exactly one terminal settlement frame; and
11. requests shutdown and performs no further work.

The guest may use a gate-pinned, independently qualified Git implementation.
Git parser defects remain correctness/security findings but do not execute in
host-root context. The guest never trusts host-provided path names, worktree
state, ancestry claims, or object labels without re-derivation from held bytes.

## 12. Vsock request and result custody

H0 owns the Firecracker API socket and base vsock Unix path in a root-only
directory. Guest-to-host settlement uses one gate-bound port and one listener
created by H0 before VM start. No other host process can create, connect to, or
replace those sockets.

The guest result uses a separately specified fixed binary grammar with:

- magic, version, exact terminal arm, run UUID, nonce, sequence `1`, and zero
  flags;
- lengths and SHA-256 values for launch echo, execution evidence, M1/V1 frames,
  checkpoint pack, checkpoint metadata, and diagnostics;
- a total length not exceeding the R4 maximum; and
- one final frame digest.

H0 reads to the exact declared end, rejects EOF/timeout/trailing bytes,
re-hashes every section, checks run UUID/nonce/sequence/terminal grammar, and
signs the complete held frame digest. H0 does not interpret model output,
checkpoint Git objects, JSON evidence, or provider data. Those are verified by
G0 before emission and independently by Gate A2 after settlement.

## 13. Confinement and acceptance matrix

Every row has a successful positive control and an operation-specific negative
control. Missing resources, connection refusal, timeout, generic exception, or
test skip never counts as denial.

Required matrix families include:

- `HOST-*`: exact host, KVM, tool, file, ancestor, mode, unit, profile, and
  scheduler qualification plus drift rejection;
- `FRAME-*`: valid request/result framing plus all mutation-corpus rejection;
- `OWNER-*`: valid SSHSIG plus wrong key, principal, namespace, bytes, order,
  duplicate, and trailing-data rejection;
- `REPLAY-*`: first exclusive consumption plus duplicate, crash, stale path,
  symlink, fsync, and concurrent-claim rejection;
- `JAIL-*`: UID/GID drop, chroot, PID namespace, cgroup, seccomp, AppArmor
  enforce-mode proof plus complain/unloaded rejection, descriptor, API-socket,
  vsock-socket, and resource-limit checks;
- `VM-*`: exact kernel/rootfs/config and absence of NIC, MMDS, host share,
  snapshot, extra disk/device, and writable root;
- `GUEST-*`: read-only runtime, fixed process tree, no network, no host
  credential, input verification, held-source execution, and denied effects;
- `SETTLE-*`: one complete frame plus partial, duplicate, oversized, wrong
  nonce/run, timeout, crash, and trailing-frame rejection;
- `SCHED-*`: exact inhibit, active-worker refusal, lock contention, and exact
  restoration on pre-consumption failure and every terminal arm, W0 alert
  within 15 minutes, and reboot restoration of a previously enabled C3 timer;
- `CHECKPOINT-*`: sealed memfd creation, all four seals, fixed FD allowlist,
  privilege drop, U0 confinement, exact pack, path set, parent, create-only
  ref, collision, residue, import failure, and offline durability; and
- `X4-*`: pre-Q4 signature, 24-hour expiry, automatic H0 and D0 triggers,
  recovery-before-removal, missing-path handling, retained-evidence
  protection, interrupted removal alerting, and no-residual-runtime proof.

B4 binds exact test source, fixture bytes, expected outcomes, timeouts, resource
limits, and mutation/fuzz corpus digests. Q4 executes host/fixture rows. R4
executes only the gate-declared safe subset plus preflight rows; it does not
discover behavior on the real artifact.

## 14. Terminal settlement and cleanup

H0 permits exactly one signed terminal arm:

- `passed`: complete valid guest frame, successful VM stop, cleanup, scheduler
  restoration, and settlement persistence;
- `failed`: defined guest/policy/runtime failure with complete bounded frame,
  followed by cleanup and scheduler restoration; or
- `indeterminate`: crash, timeout, power ambiguity, invalid/partial frame,
  broker/VMM failure, cleanup ambiguity, or evidence-persistence failure.

H0 kills and reaps F0/J0, removes transient sockets, cgroups, namespaces,
chroot copies, and scratch, verifies no process or mount remains, restores the
exact pre-run scheduler state, writes cleanup evidence, then signs and fsyncs
the terminal settlement. For `passed`, H0 performs the bounded U0 handoff in
section 15. After the U0 attempt returns, H0 executes only the pre-ratified X4
predicate for that run and publishes X4 disposition. For `failed` or
`indeterminate`, H0 proceeds directly to X4. If settlement signing,
persistence, or scheduler restoration fails, no passing arm exists and D0
owns later recovery. If X4 cleanup fails, the immutable R4 arm remains but Gate
A2 and lifecycle completion are blocked; the durable tombstone remains and W0
alerts after the deadline.

The settlement binds the request and guest frame hashes, launch measurement,
host manifest, direct H0/J0/F0 process identities, exit cause, cleanup result,
scheduler before/after state, terminal arm, and checkpoint pack/meta hashes.

## 15. Checkpoint and Gate A2

Only `passed` permits U0 to import the exact settlement-bound pack. H0 creates
anonymous memfds with `MFD_ALLOW_SEALING`, writes the held pack and metadata,
re-hashes them against the signed settlement, rejects writable mappings, and
adds `F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL`. H0 forks,
clears supplemental groups, sets the dedicated U0 GID/UID, sets
`PR_SET_NO_NEW_PRIVS`, enters the exact U0 AppArmor/seccomp confinement, closes
every inherited descriptor except sealed read-only pack FD 3, sealed metadata
FD 4, and bounded result FD 5, then `fexecve`s the exact root-owned U0 binary
with fixed argv and environment. H0 never publishes the pack in a
group-readable filesystem path and never parses Git objects or U0's semantic
labels.

U0 can write only the gate-bound target repository's quarantine object
directory and create-only checkpoint namespace. It checks expected object
closure, proposes the exact checkpoint commit, and performs one create-only
ref update from the R4-bound parent. It emits one bounded result frame; H0
records only its bytes, digest, and process identity. Existing ref, parent
drift, unexpected object/path, import error, privilege-drop or seal failure,
result-frame error, or ambiguous ref update fails without retry. H0 invokes X4
after U0 exits on every arm, so raw pack custody does not survive the runtime.

Gate A2 independently verifies owner and H0 signatures, authority ancestry,
host/launch identities, terminal settlement, guest evidence, E1/M1/V1 outputs,
checkpoint pack, commit, tree/path set, parent/ref, absence of residue, and
offline object durability after the declared maintenance operation. A2 does
not trust U0's labels or successful exit code.

## 16. Recovery

Recovery is inspect-and-reconcile only. It never restarts G0 or reuses R4. R0,
the recovery-only entrypoint of the exact H0 binary, is the sole recovery actor.
D0 invokes R0 automatically after the 15-minute maintenance deadline, or on
boot, when a consumed tombstone exists and no live H0 owns the maintenance
lock. An attended controller may invoke the same fixed path, but cannot add
arguments or widen authority.

The sole normative R0 order is:

1. verify the R4/X4 gates, installed attestation, exact R0/D0 bytes, tombstone,
   maintenance deadline, and root-owned status projection;
2. acquire the same maintenance lock without waiting and prove no live H0
   process, PID/start-time identity, or run cgroup owns it;
3. enumerate only run-ID-bound H0/J0/F0 processes, sockets, namespaces,
   cgroups, mounts, chroot, scratch, and held-frame evidence;
4. stop surviving processes and remove only resources whose custody is proven;
5. record the absence or hash of any complete guest frame and any U0 result;
6. restore the exact prior scheduler state when provable, otherwise record the
   exact quarantine reason and make no guessed scheduler change;
7. sign and fsync one `RecoverySettlementV1` with the H0 settlement key and a
   non-passing terminal arm; and
8. publish the fixed status projection for D0/X4 and release the lock.

Ambiguous ownership, mount, process, ref, scheduler, or output state remains
quarantined. W0 reads only the fixed status projection and alerts through the
qualified X1 route every five minutes after the deadline until R0/D0 restores
or explicitly quarantines scheduler state.

D0's sole dispatch order is: do nothing when no v4 state exists; invoke X4 for
a valid terminal settlement with incomplete cleanup; invoke R0 for an overdue
unresolved tombstone with no live H0; after R0, invoke X4 only if the signed
terminal or install-expiry/abandonment predicate is true and no active run
remains; otherwise make no mutation and leave W0 alerting. D0 has no request
input, key access, VM-launch path, or scheduler grammar of its own.

Host reboot qualification scans every tombstone and transient root before new
authority is accepted. R4 stops but never disables a previously enabled C3
timer, so systemd restores it on reboot; D0 and W0 are persistent across reboot
and act on the retained expiry/tombstone projection. A stale resource never
becomes a new run and is never silently deleted.

## 17. X4 decommission order

X4 is separately owner-signed before Q4. It may execute only after a matching
terminal R4 or R0 recovery settlement, or the signed
install-expiry/abandonment predicate. H0 invokes it after the bounded U0
attempt; D0 invokes it automatically after crash recovery, a terminal
settlement, or expiry. An operator may invoke the same fixed one-shot path as
an emergency path, but automatic lifecycle closure does not depend on that.
The sole normative X4 order is:

1. verify X4 gate, receipt, signature, installed attestation, matching terminal
   or recovery evidence or signed expiry/abandonment predicate, retention
   policy, and exact current host state;
2. acquire maintenance lock and inhibit new H0 and conflicting starts;
3. prove no active or recoverable v4 run remains;
4. prove no Q0/H0/R0 service/socket was registered and keep D0/W0 active until
   every other removal and post-check succeeds;
5. archive required public key, gate, receipt, settlement, tombstone summary,
   and X4 inputs to the exact retained paths;
6. construct and fsync the exact expected post-state, sign its digest with the
   H0 key, and retain that pre-removal commitment for Gate A2;
7. remove exact H0/J0/F0/G0 binaries, images, configs, users/groups, transient
   roots, and ledger private state, then destroy the H0 private key;
8. unload/remove the AppArmor policy only after no process uses it;
9. restore exact prior scheduler state;
10. verify no broker, VMM, socket, namespace, cgroup, mount, capability, ACL,
    private key, or writable runtime path remains outside the retained set;
11. atomically mark the X4 status projection complete, then stop/remove D0,
    W0, their service/timers, and the expiry sentinel and reload systemd; and
12. have the unprivileged controller verify the final host projection, commit
    decommission evidence linked to the signed pre-removal commitment, and run
    `sudo -K`. Gate A2 later verifies both records.

Unexpected state blocks destructive removal until reconciled. X4 never deletes
unrelated X1 state or historical proof.

## 18. Review and exit rule

V4 cannot become B4-eligible until authority, security, correctness,
feasibility, scope, and design lenses plus an independent second engine all
return complete results. A failed or unavailable lens does not consume the
target's review budget and cannot count as clean.

Every finding is evidence-located and independently audited. Eligibility
requires zero unresolved Critical and Important findings, all mechanical
checks passing, no document-order contradiction, and an explicit feasibility
result for physical X1. Review may recommend rethink at any cycle; no prose
waiver converts a surviving blocker into eligibility.

## 19. Withheld authority and non-authority

This contract grants no source execution, download, build, installation, X1
mutation, scheduler action, key generation, microVM launch, Gate E change,
private repository operation, checkpoint, migration, decommission, or owner
receipt request. Those require the exact active stage defined by the authority
amendment.
