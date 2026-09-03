# Prism Harness X1 microVM B4 implementation plan

- Status: reviewed; focused closure recheck passed; B4 execution not started
- Date: 2026-08-29
- Branch: `goal/prism-harness-autonomous-execution`
- Planning base: `5a93779ea2b86a34dcf01c6282b12734626b7823`
- Target: one high-assurance AGE staging migration on physical X1
- Production host order: X1 first; macOS deferred
- Current authority: B4 source authoring and isolated disposable testing only
- X1 mutation authorized: no
- Owner receipt authorized: no

> **For implementation:** execute one milestone at a time in TDD order. Every
> milestone has a red test, a green test, an integration check, a committed
> evidence artifact, and a local commit. Stop at every named gate. Never use X1
> or the local Mac as the B0 dynamic build/test host.

## 1. Goal

Convert the approved X1 Firecracker design into the complete B4 output set:
reviewed source, deterministic binaries and guest images, fixed protocols,
host policies, lifecycle assets, adversarial corpora, acceptance evidence,
SBOMs, provenance, reproducibility evidence, and draft Q4/R4/X4/Gate A2
artifacts.

B4 is complete only when an independent review finds zero unresolved Critical
or Important issues and one content-addressed bundle contains every byte Q4
would later be allowed to install. B4 completion does not itself authorize Q4,
an owner signature, an X1 connection, or a real migration.

## 2. Source of truth

Read these in order before changing B4 code:

1. `2026-08-29-prism-harness-x1-microvm-architecture-decision-v4.md`
2. `2026-08-29-prism-harness-x1-microvm-authority-amendment-v4.md`
3. `2026-08-29-prism-harness-x1-microvm-runtime-contract-v4.md`
4. `2026-08-29-prism-harness-declarative-staging-runtime-contract-v2.md`
5. `docs/x1/qemu-runner-requirements.md`

The v4 runtime contract is the sole normative operation order. This plan may
split that order into build tasks, but it may not reorder or weaken it. If the
implementation exposes a contradiction, amend and re-review the contract
before coding around it.

## 3. Success criteria

B4 is done when all of the following are true:

- Q0/H0/R0 are fixed modes of one reviewed native broker binary; D0, W0, X4,
  U0, and G0 are separate least-authority binaries or guest programs.
- The full host and guest protocol corpus passes, including replay,
  mode-confusion, power-loss, short-write, descriptor, scheduler, checkpoint,
  and interrupted-decommission cases.
- A disposable nested Linux VM runs the exact Firecracker+jailer path with no
  X1 route, no repository credential, no production data, and no local-Mac
  execution.
- A fresh separately authorized read-only X1 host manifest is matched against
  the disposable qualification fixture, and every physical-only Q4 row is
  named without being misreported as B4 proof.
- Two clean offline builds from the same source bundle produce identical
  install-bundle and guest-image digests.
- The B4 manifest binds every source, tool, dependency, upstream archive,
  binary, image, unit, profile, schema, fixture, corpus, test, and expected
  result required by authority amendment v4 §6.
- All mechanical checks and the complete multi-lens plus independent-engine
  review pass with zero unresolved Critical or Important findings.

## 4. Non-goals and withheld effects

B4 does not:

- connect to, install on, start, stop, or otherwise mutate X1;
- run the broker, Firecracker, guest, fuzzers, or hostile fixtures on macOS;
- create a generic host-broker contract or macOS backend;
- request or generate a real Q4, R4, or X4 owner receipt;
- create the production settlement key, checkpoint ref, private repository,
  push, pull request, release, deployment, or real migration artifact;
- alter Gate E, C3, backup, repository-check, sudo, SSH, firewall, Docker, or
  Podman state.

## 5. Selected implementation architecture

### 5.1 Native host boundary

Create a dedicated Rust workspace under `pnh/x1-firecracker/`. Pin Rust
`1.98.0`, the exact target, linker, container base digest, Cargo lock, and
vendored crate tree. Build static PIE x86_64 Linux binaries with panic abort,
integer-overflow checks, stripped deterministic metadata, and no runtime
network dependency. Every build runs with Cargo `--frozen` against the vendored
source tree.

Rust is selected because H0 must safely handle fixed binary frames, no-follow
filesystem operations, fsync ordering, process identity, Unix sockets, vsock,
memfd seals, credential dropping, `fexecve`, seccomp, and bounded cleanup. Go
would add a larger runtime and less direct descriptor control. C would reduce
binary size at the cost of making hostile-frame memory safety part of every
review. Neither alternative improves this one-host implementation enough to
justify its risk.

The binaries are:

| Binary | Contract identity | Purpose |
|---|---|---|
| `prism-x1-broker` | Q0/H0/R0 | `qualify`, `run`, and `recover` modes in the same bytes |
| `prism-x1-deadline` | D0 | closed automatic R0/X4 dispatcher |
| `prism-x1-watchdog` | W0 | independent read-only alert projection |
| `prism-x1-decommission` | X4 | pre-ratified exact cleanup state machine |
| `prism-x1-checkpoint` | U0 | unprivileged sealed-pack importer and create-only ref writer |
| `prism-x1-guest-init` | G0 | PID 1, boot checks, vsock custody, worker supervision |

There is no public `Broker` trait and no provider-neutral host abstraction.
Tests may use a crate-private `FirecrackerProcess` seam whose only production
implementation is the exact X1 Firecracker adapter.

### 5.2 Guest semantic boundary

G0 is a native Rust PID 1 inside a Buildroot-produced read-only image. E1 is a
native guest coordinator. M1 and V1 are separate, exact Python programs under a
pinned supported CPython runtime. They share protocol types and immutable input
bytes, but no semantic implementation module. V1 independently re-derives the
M1 result.

The prior macOS contract's Python 3.9 runtime is not copied forward blindly.
No executable v2 E1/M1/V1 corpus exists in the repository. Milestone 6 first
turns every normative v2 example and acceptance row into a reviewed executable
corpus with independently authored expected outputs, then selects a supported
exact CPython release and regenerates the static source-policy corpus for that
interpreter. Missing, ambiguous, or disputed expected behavior blocks B4
rather than being invented by the implementation under test.

Guest Git and schema tools are part of the guest image closure. Host-root code
never parses Git, JSON, YAML, model output, provider data, or checkpoint
objects. U0 may invoke only the gate-bound host Git binary and transitive
library closure after its complete privilege drop and confinement.

### 5.3 Firecracker control

H0 uses the matching jailer and Firecracker API socket. It emits fixed
canonical JSON requests from typed gate-bound values, but parses no JSON. It
accepts only exact bounded HTTP status responses and signs launch evidence
before the single `InstanceStart` request.

The `--config-file --no-api` path is retained as a negative test, not used in
production, because it auto-starts the VM and would bypass the contract's
pre-start launch-evidence boundary. Milestone 0 locks an immutable candidate
set led by Firecracker `v1.16.1`. Milestone 5 selects and locks the one final
Firecracker/jailer release only after real jailer and symlink-path tests pass.

### 5.4 Build and test isolation

B0 runs inside a disposable Linux VM under a dedicated non-sudo identity. A
rootless, network-disabled inner container receives only a content-addressed
source bundle. It receives no `.git`, home directory, TTY, SSH agent, GitHub
token, cloud credential, X1 route, private repository, production fixture, or
privileged host socket.

Root-only broker and jailer tests run as PID 1 or a fixed boot service inside a
nested disposable test VM. The outer B0 identity remains non-sudo. Root inside
that destroyed VM is fixture authority only; it is not X1, Mac, CI-host, or
operator root.

The existing EX44 `x1-gate-a-kvm` runner remains exclusive to the existing
`qemu-rehearsal` job. Milestone 0 may add a nested-KVM B4 phase inside that job
only after proving the B0 source bundle is credential-free and the nested VM
contains `/dev/kvm`. Do not add the runner label to another job. If nested KVM
is unavailable, stop at gate `B4-KVM-ENV` and provision a separate ephemeral
x86_64 KVM runner. Never substitute X1 or macOS.

Treat the self-hosted runner as a high-blast-radius boundary: untrusted B4
source never executes in the runner container itself, receives no runner or
repository credential, and sees only the closed source bundle inside the
nested disposable VM. A failed nested-VM containment test blocks use of EX44.

### 5.5 Installation assets

Keep implementation and build inputs under `pnh/x1-firecracker/`. Keep X1
infrastructure integration under `x1/prism/` and
`x1/ansible/roles/prism_microvm/`. Q4 uses typed Ansible modules only.
Purpose-built modules may expose closed enum actions and fixed manifest paths;
no module may expose arbitrary command, argv, shell, source path, destination
path, or executable selection.

## 6. Planned repository layout

```text
pnh/x1-firecracker/
  Cargo.toml
  Cargo.lock
  rust-toolchain.toml
  deny.toml
  .cargo/config.toml
  vendor/
  crates/
    prism-wire/                  # request/result/receipt/status encodings
    prism-host-state/            # no-follow/fsync/lock/process/scheduler primitives
    prism-x1-broker/             # one Q0/H0/R0 binary
    prism-x1-deadline/           # D0
    prism-x1-watchdog/           # W0
    prism-x1-decommission/       # X4
    prism-x1-checkpoint/         # U0
    prism-x1-guest-init/         # G0 PID 1 and vsock supervisor
  guest/
    semantics/e1/
    semantics/m1/
    semantics/v1/
    schemas/
    buildroot/
    kernel/
  firecracker/
    upstream.lock.json
    api-requests/
    expected-responses/
  policy/
    apparmor/
    seccomp/
  systemd/
  gates/
    schemas/
    fixtures/
    generate/
  acceptance/
    matrix.json
    oracles/wire-oracle.mjs
    runner/
    fixtures/
    corpora/
  b0/
    source-allowlist.json
    toolchain.lock.json
    Containerfile
    make-source-bundle.mjs
    verify-environment.sh
    build.sh
    reproduce.sh
  dist/                           # gitignored B4 bundles and raw evidence

x1/prism/
  install-manifest.schema.json
  host-manifest.schema.json
  status-projection.schema.json
  retention-manifest.schema.json
  fixtures/

x1/ansible/
  plugins/modules/
    prism_artifact_install.py
    prism_apparmor.py
    prism_host_manifest.py
    prism_broker_action.py
  roles/prism_microvm/
    defaults/main.yml
    tasks/preflight.yml
    tasks/install.yml
    tasks/verify.yml
    tasks/rollback.yml
  playbooks/prism-q4.yml

x1/tests/
  prism-b4-contract.test.ts
  prism-ansible-contract.test.ts
  prism-systemd-contract.test.ts
  prism-host-qualification.test.ts
  prism-acceptance-contract.test.ts
```

Generated binaries, root filesystems, kernels, and raw evidence stay out of
Git. Git commits their lock manifest, hashes, SBOMs, provenance, license set,
expected acceptance results, and two-build reproducibility record. The exact
bundle is retained as a non-release workflow artifact until Q4 is separately
authorized.

## 7. Standard verification commands

Milestone 0 adds these package scripts. The scripts refuse execution unless
`b0/verify-environment.sh` proves the qualified B0 environment.

```bash
npm run --silent b4:check
npm run --silent b4:test:unit
npm run --silent b4:test:qemu
npm run --silent b4:test:firecracker
npm run --silent b4:test:acceptance
npm run --silent b4:reproduce
npm run --silent b4:scan-public
npm run --silent b4:verify
```

`b4:verify` runs every applicable check and verifies imported KVM and
reproducibility evidence. It never silently skips a profile. A profile that
cannot run is `BLOCKED`, not passing.

Every milestone also runs the existing repository checks:

```bash
npm run typecheck:pnh
npm run check:pnh-graph
npm run check:public-claims
npm exec -- tsx x1/scripts/validate-config.ts --allow-expired-gate-a-evidence
node x1/backup/validate-contract.mjs
npm run test:x1
```

The known missing DeepSeek Harness (DSH) source archive may remain the sole
`test:x1` failure only while its path and error are byte-for-byte unchanged.
Any new failure blocks the milestone. CI fetches that pinned archive before
its full X1 test run.

## 8. Milestone plan

### Milestone 0: B0 environment, source closure, and upstream locks

**Produces:** isolated build harness, source allowlist, toolchain lock, upstream
lock, baseline CI wiring, and `B4-KVM-ENV` decision evidence.

**Files:**

- Create `pnh/x1-firecracker/{Cargo.toml,Cargo.lock,rust-toolchain.toml,deny.toml}`.
- Create `pnh/x1-firecracker/b0/*` and `firecracker/upstream.lock.json`.
- Modify `package.json` with the eight `b4:*` commands.
- Extend `.github/workflows/x1-gate-a.yml` without creating a new
  `x1-gate-a-kvm` job or changing its runner selector.
- Create `x1/tests/prism-b4-contract.test.ts`.

**Steps:**

- [ ] Write failing tests that reject a source bundle containing `.git`, an
  unlisted path, symlink, device, credential-shaped environment key, writable
  ancestor, host identifier, or noncanonical manifest order.
- [ ] Implement deterministic source-bundle creation from a closed allowlist.
- [ ] Pin Rust, target, linker, base image, Buildroot/kernel candidates, an
  immutable Firecracker/jailer candidate set, Cargo dependencies, SBOM tools,
  and scanners. Do not declare one final Firecracker release in this milestone.
- [ ] Verify official upstream hashes/signatures and retain license text. Treat
  Firecracker `v1.16.1` as a candidate until the jailer symlink regression test
  passes; do not select “latest” at runtime.
- [ ] Prove the B0 process is non-sudo, credential-free, X1-unroutable,
  network-disabled during build/test, and running outside macOS and X1.
- [ ] In the existing EX44 rehearsal job, boot a disposable nested Linux
  fixture and prove whether nested `/dev/kvm` is available. Persist PASS or
  BLOCKED evidence; do not weaken the check.

**Gate `B4-00`:** source-bundle negatives pass; two source bundles are
byte-identical; every upstream-candidate row has immutable identity and
license; and `B4-KVM-ENV` is either PASS or a named external-runner blocker.

**Commit:** `build(pnh): establish isolated X1 B4 toolchain`

### Milestone 1: fixed wire protocols and authority parsing

**Produces:** `prism-wire`, request/result/status schemas, corpora, SSHSIG
verification wrapper, and Q0/H0/R0 mode separation.

**Files:**

- Create `crates/prism-wire/src/{lib,request,result,receipt,status}.rs`.
- Create `crates/prism-wire/tests/*.rs`.
- Create `acceptance/oracles/wire-oracle.mjs` without importing Rust output or
  generated code.
- Create `acceptance/corpora/{frame,receipt,mode-confusion}/`.
- Create `gates/schemas/` and fixture owner keys containing no production key.

**Steps:**

- [ ] Write table-driven red tests for the exact 224-byte H0 header, payload
  order, bounds-before-allocation, digest checks, EOF, slow input, and trailing
  bytes.
- [ ] Implement exact encoders/decoders with closed enums and no lossy text
  normalization.
- [ ] Implement a separately authored TypeScript wire oracle from the normative
  byte tables. It may share corpus bytes but no encoder, parser, constants
  module, generated source, or implementation dependency with `prism-wire`.
- [ ] Implement fixed-line Q4/R4/X4 receipt parsers and the direct
  `ssh-keygen -Y verify` child contract with clean environment and descriptor
  closure.
- [ ] Prove Q0 accepts only `PRSMQ4V4`; H0 accepts only `PRSMX1V4`; R0 accepts
  no request frame; every cross-mode combination fails before mutation.
- [ ] Add deterministic mutation generation plus bounded fuzz targets. Commit
  corpus inputs and expected outcomes, not transient fuzzer state.

**Gate `B4-01`:** all valid vectors round-trip; every invalid vector fails at
the expected phase; Rust and TypeScript implementations independently agree on
every byte, digest, and length; zero mutation reaches a filesystem/process
seam.

**Commit:** `feat(pnh): define X1 broker wire protocols`

### Milestone 2: host-state primitives and permanent consumption

**Produces:** safe filesystem primitives, durable ledger, maintenance lock,
process identity, status projection, and scheduler snapshot/restore logic.

**Files:**

- Create `crates/prism-host-state/src/{lib,fs,ledger,lock,process,scheduler,status}.rs`.
- Create `crates/prism-host-state/tests/` and `acceptance/fixtures/host-state/`.
- Create synthetic C3/systemd fixtures; do not invoke live systemd.

**Steps:**

- [ ] Write red tests for symlink/hardlink/wrong-type/writable-ancestor
  rejection, partial write, short write, fsync failure, rename ambiguity,
  duplicate run IDs, and concurrent consumers.
- [ ] Implement directory-FD-relative, no-follow, exclusive creation and exact
  fsync ordering for the immutable tombstone.
- [ ] Implement PID plus start-time plus cgroup ownership proofs; a PID alone
  never establishes custody.
- [ ] Implement C3 timer/service snapshot, stop-not-disable inhibition, active
  worker refusal, restoration, and reboot-state projection against a fake
  systemd adapter.
- [ ] Implement root-owned status projection writes and a separate read-only
  parser for W0. Unknown fields and incomplete records remain quarantined.

**Gate `B4-02`:** power-cut fault injection at every persistence boundary
produces either no consumption or one permanent consumed tombstone; scheduler
state is restored exactly on every pre-consumption failure.

**Commit:** `feat(pnh): add X1 durable host state primitives`

### Milestone 3: one broker binary with Q0, H0, and R0

**Produces:** the foreground broker state machine, qualification mode, run
preflight/consumption, recovery-only mode, settlement signing, and bounded
cleanup orchestration against fake Firecracker.

**Files:**

- Create `crates/prism-x1-broker/src/{main,mode,qualify,run,recover,settlement}.rs`.
- Create `crates/prism-x1-broker/tests/`.
- Create fixed process and failure fixtures under `acceptance/fixtures/broker/`.

**Steps:**

- [ ] Write red tests for the runtime contract's Q4 §7, R4 §§8-9, settlement
  §14, and recovery §16 orders using a recording fake seam.
- [ ] Implement mode selection from exact fixed argv. Reject environment,
  current directory, stdin shape, path, or argument drift.
- [ ] Implement Q0 with disposable roots/keys and no production ledger,
  production settlement, R4 arm, or checkpoint effect.
- [ ] Implement H0 preflight through permanent consumption, then the exact
  terminal arms and cleanup ordering with one settlement signature.
- [ ] Implement R0 as the sole recovery actor. It never starts J0/F0/G0,
  retries work, imports a checkpoint, or emits a passing settlement.
- [ ] Verify no host-root module imports a Git, JSON, YAML, model, provider, or
  checkpoint parser.

**Gate `B4-03`:** the state-machine trace for every test equals the normative
order; mode-confusion tests have no side effect; crash recovery never restarts
or reuses consumed work.

**Commit:** `feat(pnh): implement X1 broker modes`

### Milestone 4: D0, W0, and X4 lifecycle closure

**Produces:** automatic deadline/recovery dispatcher, independent watchdog,
decommission state machine, status grammar, systemd assets, and interruption
fixtures.

**Files:**

- Create `crates/prism-x1-{deadline,watchdog,decommission}/`.
- Create `systemd/prism-x1-{deadline,watchdog}.{service,timer}`.
- Create `acceptance/fixtures/{deadline,watchdog,decommission}/`.
- Create `x1/tests/prism-systemd-contract.test.ts`.

**Steps:**

- [ ] Write red tests for D0's closed dispatch table, including no-state,
  terminal-cleanup, overdue tombstone, R0-then-X4, ambiguity, reboot, and expiry.
- [ ] Implement D0 with no key, request input, launch path, scheduler grammar,
  or executable choice beyond exact R0/X4.
- [ ] Implement W0 against a read-only status projection and a fake notification
  endpoint. Prove W0 cannot invoke any Prism or scheduler mutation.
- [ ] Implement X4's twelve-step order, retained-evidence commitment, private
  key destruction, D0-before-W0 shutdown order, and exact unrelated-path
  preservation.
- [ ] Test process kill, power loss, missing path, stale mount, retained-file
  tampering, partial systemd removal, and alert continuation after failed X4.

**Gate `B4-04`:** every clean, crash, reboot, and 24-hour expiry simulation
reaches completed X4 or explicit quarantine with W0 still alerting. No scenario
depends on an operator to trigger cleanup.

**Commit:** `feat(pnh): close X1 broker lifecycle`

### Milestone 5: Firecracker, jailer, and host/guest transport

**Produces:** exact Firecracker API client, jailer launch, launch measurement,
socket custody, bounded serial handling, and fake plus real KVM tests.

**Files:**

- Add `crates/prism-x1-broker/src/{firecracker,jailer,launch,vsock}.rs`.
- Create `firecracker/api-requests/` and `expected-responses/`.
- Create `acceptance/fixtures/firecracker/`.

**Steps:**

- [ ] Write red tests for exact API requests, HTTP response bounds, request
  order, unexpected API path, caller-selected value, duplicate start, and
  `--config-file --no-api` rejection.
- [ ] Implement canonical request emission without a host JSON parser and an
  exact bounded HTTP status parser without a general HTTP client dependency.
- [ ] Implement jailer argv, chroot, PID namespace, cgroup-v2, UID/GID drop,
  descriptor limits, seccomp-required state, AppArmor state, and no-NIC
  configuration.
- [ ] Sign/fsync launch evidence before the single `InstanceStart`; bind direct
  process identity, binary/config digests, run ID, nonce, and socket roots.
- [ ] Run fake-API tests in ordinary B0, then run Firecracker+jailer only inside
  the nested disposable KVM VM. Test the selected release's symlink behavior
  against root-owned and hostile path fixtures.
- [ ] Select exactly one candidate only after those tests pass, then replace
  the candidate set with the final Firecracker/jailer archive, source tag,
  checksum/signature, license, SBOM, and behavior-evidence identities.

**Gate `B4-05`:** real Firecracker boots once through the matching jailer with
default seccomp, exact cgroup/namespace/chroot/identity, no NIC/MMDS/share/
snapshot, and exclusive API/vsock custody. Failure tears down only run-bound
resources.

**Commit:** `feat(pnh): add exact Firecracker jailer cell`

### Milestone 6: immutable guest image and E1/M1/V1 semantics

**Produces:** pinned Linux kernel, read-only Buildroot image, G0 PID 1, exact
supported CPython runtime, E1/M1/V1 programs, schemas, and semantic parity
evidence.

**Files:**

- Create `guest/{buildroot,kernel,schemas,semantics}/`.
- Implement `crates/prism-x1-guest-init/`.
- Create `acceptance/fixtures/guest/v2-contract-corpus/` and its independent
  expected-output manifest.

**Steps:**

- [ ] Before selecting the guest runtime or writing semantic production code,
  translate every normative v2 example, boundary, terminal arm, and acceptance
  row into executable fixture bytes with a clause-to-fixture traceability
  table. Have a separate reviewer derive and approve expected outputs without
  consulting M1/V1 code.
- [ ] Pin kernel source/config, Buildroot, BusyBox, CPython, Git, OpenSSH
  verification tool, C library, certificates policy, and every transitive
  package. Disable package managers, login, SSH server, DHCP, DNS, NIC drivers,
  modules, debug shells, unused devices, and mutable executable paths.
- [ ] Write G0 red tests for read-only root, exact devices/processes/mounts,
  nonce handshake, one request, one result, bounded tmpfs/scratch, timeout, and
  shutdown-only terminal behavior.
- [ ] Port E1/M1/V1 to the selected CPython runtime. Keep M1 and V1 semantic
  implementations separate; share only framing constants and immutable schema
  bytes.
- [ ] Rebuild the source-policy AST corpus for the selected interpreter and run
  the complete new v2 contract corpus through E1/M1, independent V1, and the
  fixture oracle. No prior implementation is claimed as a parity oracle.
- [ ] Build the guest kernel and rootfs twice with fixed locale, timezone,
  umask, owner, path, and `SOURCE_DATE_EPOCH`; require identical digests.
- [ ] Boot under QEMU TCG first, then through the real Firecracker fixture.

**Gate `B4-06`:** every normative v2 clause has an executable fixture and exact
expected result; E1/M1, independent V1, and the fixture oracle agree; and no
unsupported interpreter feature, extra process/device/mount, writable
executable path, network capability, host credential, or nondeterministic
image byte remains.

**Commit:** `feat(pnh): build immutable X1 Prism guest`

### Milestone 7: settlement, sealed U0 handoff, and Gate A2

**Produces:** guest result frame, H0 settlement custody, sealed memfd privilege
drop, U0 create-only checkpoint, and independent offline verifier.

**Files:**

- Extend `prism-wire` with guest result and U0 result frames.
- Implement `crates/prism-x1-checkpoint/`.
- Add H0 handoff code under `prism-x1-broker`.
- Create `gates/generate/gate-a2.*` and checkpoint fixtures.

**Steps:**

- [ ] Write red tests for partial/duplicate/oversized/wrong-run/wrong-nonce/
  trailing guest frames and for timeout, guest crash, broker crash, and
  settlement-persistence failure.
- [ ] Implement H0's exact result custody and one signed terminal settlement.
- [ ] Implement anonymous memfd creation, all four seals, writable-mapping
  refusal, FD 3/4/5 allowlist, complete UID/GID/group drop, `no_new_privs`,
  seccomp/AppArmor entry, and fixed `fexecve`.
- [ ] Implement U0's Git quarantine import, object/path/parent verification,
  exact commit construction, and one create-only ref update. U0 never retries,
  deletes existing objects, or chooses another ref.
- [ ] Implement Gate A2 as a separately runnable, unprivileged, read-only
  verifier that distrusts U0 labels and exit status.
- [ ] Fault-inject every seal, drop, exec, Git, ref, result-frame, and cleanup
  boundary. Prove no group-readable pack file is ever created.

**Gate `B4-07`:** the valid path creates exactly one expected checkpoint; every
negative path creates no ref and no ambiguous retry; offline A2 verifies
durability after the declared maintenance operation.

**Commit:** `feat(pnh): seal X1 checkpoint and durability path`

### Milestone 8: X1 qualification, AppArmor, and typed Q4 assets

**Produces:** host manifest collector, fresh read-only physical-X1 parity
packet, AppArmor/seccomp policies, closed custom Ansible modules, Q4
role/playbook, rollback, and disposable Ubuntu rehearsal.

**Files:**

- Create `x1/prism/*.schema.json` and fixtures.
- Create `x1/ansible/plugins/modules/prism_*.py`.
- Create `x1/ansible/roles/prism_microvm/` and `playbooks/prism-q4.yml`.
- Create `x1/tests/prism-{ansible,host-qualification}.test.ts`.

**Steps:**

- [ ] Write host-manifest red tests for every runtime contract §6 field,
  relevant failed-unit rule, AppArmor enforce/complain/unloaded state,
  operator session/process census, scheduler collision, stale tombstone, and
  writable/symlinked trust path.
- [ ] Implement read-only host qualification with a closed relevance rule for
  failed units. The unrelated observed `fwupd` units are neither globally
  ignored nor treated as automatic failure.
- [ ] At external gate `B4-X1-READ`, obtain separate authority for one fresh
  read-only physical-X1 qualification collection. Record kernel, KVM, cgroup,
  AppArmor parser/enforce state, systemd, filesystem, tool, scheduler, and
  capacity identities without installing or executing B4 source on X1.
- [ ] Configure the disposable Ubuntu fixture to match every reproducible X1
  identity and run the host/policy rows there. Mark firmware, physical KVM,
  boot, and other non-reproducible rows as Q4-only; never convert proxy success
  into physical-X1 proof.
- [ ] Author exact AppArmor profiles and precompiled seccomp inputs for each
  authority boundary. Test complain/unloaded/replaced/parser-warning refusal.
- [ ] Implement purpose-built Ansible modules with closed enum actions and
  manifest-bound paths. Do not use `shell`, `raw`, `script`, or generic
  `command`; do not expose arbitrary argv through a custom module.
- [ ] Implement the fourteen-step Q4 role, exact rollback for every pre-success
  boundary, H0/R0 no-service rule, D0/W0 enablement, Q0 fixture, key
  attestation, and 24-hour expiry sentinel.
- [ ] Rehearse install, qualification, rollback, reinstall, and X4 in a
  disposable Ubuntu 24.04 VM only. Verify no X1 address or production path is
  present in inventory or logs.

**Gate `B4-08`:** Ansible syntax/lint and custom-module tests pass; fresh
read-only X1 evidence and proxy-parity results are complete; every Q4 failure
point restores exact pre-state; successful rehearsal leaves only the declared
pre-ratified lifecycle state and then decommissions cleanly; and every
physical-only row remains visibly pending Q4.

**Commit:** `feat(x1): define typed Prism microVM installation`

### Milestone 9: complete acceptance matrix and failure injection

**Produces:** executable matrix for every `HOST`, `FRAME`, `OWNER`, `REPLAY`,
`JAIL`, `VM`, `GUEST`, `SETTLE`, `SCHED`, `CHECKPOINT`, and `X4` row.

**Files:**

- Complete `acceptance/matrix.json`, runner, fixtures, and corpora.
- Add `x1/tests/prism-acceptance-contract.test.ts`.
- Add B0 unit, QEMU, and Firecracker evidence importers.

**Steps:**

- [ ] Give every row a stable ID, exact source digest, fixture digest, expected
  outcome, timeout, resource ceiling, positive control, operation-specific
  negative control, and evidence schema.
- [ ] Make missing resource, refusal, timeout, exception, skip, empty output,
  stale evidence, and wrong runner identity explicit failures.
- [ ] Run unit rows in the credential-free B0 container, guest rows under QEMU
  TCG, and jailer/KVM rows in the disposable nested KVM VM.
- [ ] Reboot or hard-stop fixtures at every durable boundary and prove R0/D0/W0
  behavior from retained state.
- [ ] Run the matrix twice from clean state and reject changed row count,
  ordering, source, expected result, or evidence identity.

**Gate `B4-09`:** every required family has passing positive and negative
controls; no skipped or simulated-only row is represented as real KVM proof;
all evidence is complete, fresh, bounded, and runner-bound.

**Commit:** `test(pnh): close X1 B4 acceptance matrix`

### Milestone 10: reproducible bundle, review, and B4 closure

**Produces:** exact install bundle, manifest, SBOM, license/provenance set,
reproducibility result, source-to-requirement trace, draft later-stage gates,
and final B4 review packet.

**Files:**

- Create committed `pnh/x1-firecracker/b4.lock.json`.
- Create committed SBOM, license, provenance, traceability, and acceptance
  summaries under `pnh/x1-firecracker/evidence/`.
- Generate draft Q4/R4/X4/Gate A2 schemas and inert fixtures under `gates/`.
- Update the active workstream phase, finding matrix, and handoff.

**Steps:**

- [ ] Produce two clean offline builds on fresh qualified B0 instances and
  require identical source bundle, binaries, kernel, rootfs, policy, unit,
  Ansible, corpus, and final install-bundle digests.
- [ ] Generate CycloneDX SBOMs for Rust, guest packages, Firecracker/jailer,
  kernel/rootfs, host tool closure, and the aggregate install bundle. Verify
  every component has retained license evidence.
- [ ] Prove `b4.lock.json` closes all ten authority-amendment §6 outputs and
  contains no mutable tag, URL-only identity, omitted file, secret, private
  host value, or post-B4 unknown.
- [ ] Run `b4:scan-public` over every committed B4 source, lock, SBOM, license,
  provenance, traceability, acceptance, gate, review, and evidence artifact.
  Reject credentials, private host values, absolute operator paths, mutable
  upstream selectors, and unreviewed machine identifiers anywhere in the set.
- [ ] Generate inert later-stage gate/receipt fixtures and test acyclic
  construction. Do not generate a real owner signature or production key.
- [ ] Run mechanical checks, the complete document/code security review, an
  independent second-engine review, and a post-execution plan audit. Resolve
  every Critical and Important finding in a new reviewed commit.
- [ ] Mark B4 complete only after all evidence is committed and the exact
  non-release bundle is retained for a later separately authorized Q4.

**Gate `B4-10`:** `npm run --silent b4:verify` returns PASS with two-build
reproducibility, every B4 output row closed, zero unresolved Critical or
Important findings, no B4-source execution or mutation on X1, and no macOS
dynamic execution evidence.

**Commit:** `docs(pnh): close X1 Firecracker B4`

## 9. Requirement traceability

| Authority amendment v4 §6 output | Closing milestone |
|---|---|
| 1. Exact Q0/H0/R0/D0/W0/U0/G0 and tooling source | 1-8, including M6's executable v2 corpus |
| 2. Compiler/linker/runtime/package/container inputs | 0, 6, 10 |
| 3. Firecracker/jailer identity, license, SBOM | 0, 5, 10 |
| 4. Kernel/rootfs/runtime closure and reproducibility | 6, 10 |
| 5. Host/guest grammars and adversarial corpora | 1, 7, 9 |
| 6. Entry points, units, profiles, identities, limits, scheduler procedure | 2-5, 8 |
| 7. Tombstone, launch, settlement, memfd, checkpoint, recovery, retention | 2-4, 7 |
| 8. X4 grammar, expiry, automation, alerting, rehearsal | 4, 8, 9 |
| 9. Physical-X1 qualification and drift manifest | 8 through explicit `B4-X1-READ`; physical-only execution rows remain Q4 |
| 10. Complete review with zero Critical/Important | 10 |

## 10. Dependency and stopping gates

```text
B4-00 environment/source closure
  -> B4-01 wire/authority
     -> B4-02 durable host state
        -> B4-03 broker modes
           -> B4-04 lifecycle -----------+
           -> B4-05 Firecracker/jailer --+---> B4-07 settlement/checkpoint/A2
     -> B4-06 guest semantics/image -----+

B4-02 + B4-04 + B4-05 + B4-06 + B4-07 + B4-X1-READ
  -> B4-08 qualification/policy/Q4 assets

B4-01 through B4-08 -> B4-09 integrated acceptance
B4-09 PASS -> B4-10 reproducible bundle and review
```

B4-10 cannot start, build the final bundle, or run closure review until B4-09
has committed a PASS for the complete acceptance matrix and all three evidence
importers.

Stop immediately when:

- `B4-KVM-ENV` cannot provide disposable nested KVM without X1 or macOS;
- a required upstream archive lacks immutable verification or acceptable
  license evidence;
- the v2 contract cannot be converted into complete unambiguous executable
  fixtures, or the three semantic evaluators disagree;
- Firecracker/jailer cannot satisfy path, seccomp, cgroup, namespace, socket,
  or no-device assertions;
- deterministic builds disagree after normalizing only explicitly declared
  nondeterministic metadata;
- any review leaves a Critical or Important finding unresolved.

## 11. External decisions and authority gates

No decision is needed to write Milestones 0-4 source. Before running the real
KVM profile, the owner must approve one of these in order:

1. **Preferred:** qualify nested KVM inside the existing dedicated EX44 Gate A
   rehearsal boundary without creating another runner job.
2. **Correct fallback:** provision a separate short-lived x86_64 KVM or bare-
   metal runner with no persistent credentials and destroy it after evidence
   export.
3. **Not acceptable for B4 closure:** count QEMU TCG, X1, the local Mac, a
   generic shared runner, or a container-only Firecracker simulation as the
   required jailer/KVM positive control.

Before B4-08 can close, the owner must separately authorize `B4-X1-READ`, one
bounded read-only physical-X1 qualification collection. It grants no source
execution, installation, key generation, scheduler change, or other mutation.

Any paid runner provisioning, GitHub push/workflow dispatch, public artifact
publication, or X1 read/write action remains an explicit outward-facing gate.

## 12. Risks that remain after this plan

- A microVM reduces workload exposure but does not protect against a malicious
  X1 root administrator, kernel/KVM compromise, firmware compromise, stolen
  owner or settlement keys, or a correctly pinned malicious upstream binary.
- Python and Git inside G0 remain substantial guest attack surfaces. Their
  compromise must still fail V1, H0 framing, checkpoint verification, or A2;
  the microVM keeps that parsing away from host root.
- Firecracker `v1.16.1` changed jailer symlink handling. The plan treats the
  release as a candidate and requires path-custody tests before it can be
  locked.
- Bit-for-bit kernel/rootfs reproducibility may expose timestamps, archive
  order, host paths, or toolchain drift. B4 stops rather than weakening the
  requirement to “functionally equivalent.”
- The active X1 Gate A evidence expired on 2026-08-15. B4-08 therefore requires
  a fresh separately authorized read-only parity packet. Q4 must still repeat
  physical host qualification immediately before any installation effect.

## 13. Deferred until after B4

- real Q4/X4 owner signing and supervised X1 installation;
- real R4 receipt, production settlement key, and one consumed migration;
- Gate A2 against the real checkpoint and decommission evidence;
- macOS backend or generic host-broker extraction;
- private repository creation, push, pull request, release, or deployment;
- generalized provider adapters or recurring multi-run service behavior.

## 14. Final handoff condition

The B4 implementation handoff must state:

- exact branch and commit;
- exact qualified B0 and KVM runner identities;
- install-bundle digest and retention location;
- every verification command and result;
- reproducibility result and SBOM/license status;
- unresolved blocker, if any;
- explicit confirmation that X1 and macOS were not execution hosts;
- the one next action: draft and review the exact Q4/X4 owner decision packet.

Do not start Q4 in the same milestone.

## 15. Upstream facts checked during planning

- The official Firecracker release page listed `v1.16.1` as current on
  2026-08-29. The version remains a candidate until B4 locks its exact archive
  and tests its jailer behavior:
  <https://github.com/firecracker-microvm/firecracker/releases>
- Firecracker's production guidance requires the matching jailer or an equal
  or stronger boundary:
  <https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md>
- Firecracker can auto-start from `--config-file`, which is why B4 must prove
  that path is not used to bypass pre-start launch evidence:
  <https://github.com/firecracker-microvm/firecracker/blob/main/FAQ.md>
- Rust `1.98.0` was the current stable release when this plan was drafted:
  <https://blog.rust-lang.org/releases/latest/>
- Cargo's `--frozen` mode combines locked and offline resolution, and vendored
  source replacement still requires committed checksum review:
  <https://doc.rust-lang.org/stable/cargo/commands/cargo-vendor.html>
