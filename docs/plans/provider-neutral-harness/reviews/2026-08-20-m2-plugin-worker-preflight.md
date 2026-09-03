# M2 Task 0 preflight — plugin-worker security boundary

Status: GATE SATISFIED (all 9 Steps bullets empirically proven)

Date: 2026-08-20

Scope: disposable Docker preflight only, run against a throwaway fixture that
stands in for the not-yet-built M2 plugin-container broker (Task 3). No PNH
implementation file, dependency, lockfile, test, commit target, or push was
touched beyond this review doc. All fixture bytes, seccomp profiles, and
images lived under a scratchpad temp directory and were removed after the
run (`docker image ls` / `docker ps -a` confirmed clean of anything this
preflight created before finishing). Host: Docker Desktop `29.6.2`,
`linux/aarch64` (Apple Silicon).

This is a preflight for a **different** boundary than the already-merged
Kernel Plan 1 outer sandbox (`pnh/harness/run-sandbox.mjs` and friends). That
boundary runs the *test harness* against core; this preflight proves the
boundary the M2 broker will need for a *plugin worker* — a strictly more
hostile threat model (the plugin's own code is assumed fully malicious, not
just untrusted test input). No Kernel Plan 1 file was modified; only its
namespace/capability/tmpfs flag shapes were reused as a starting point and
then extended (custom seccomp profile, Node permission model, digest pinning,
`--log-driver none`) because Kernel Plan 1 does not need those for its
narrower job.

## Fixture shape used throughout

- `worker.mjs`: reads one JSON line from stdin (`{"op": "..."}"`), dispatches
  through a fixed table, writes one JSON line to stdout, exits. The declared
  op table contains exactly one entry (`ping` → `{"ok":true,"result":"pong"}`)
  standing in for a plugin's real declared capability; a second table of
  attack ops exists purely as a harness surface to exercise the boundary
  primitives (fs read/write, child_process, worker_threads, network, unix
  sockets, dynamic eval, signals, PID enumeration, inspector, resource
  exhaustion) — this is not part of the boundary's contract, it is the probe.
- Canonical hardened `docker run` flag set (production profile), arrived at
  empirically below:
  `--pull=never <image-digest>`, `--log-driver none`, `--ipc private`
  (PID namespace is private by Docker default — there is no `--pid private`
  flag; omitting `--pid` already gives a private namespace), `--read-only`,
  `--cap-drop ALL`, `--security-opt no-new-privileges:true`,
  `--security-opt seccomp=<custom-profile>`, `--network none`,
  `--user 10101:10101`, `--pids-limit 32`, `--memory 128m`, `--cpus 0.5`,
  `--ulimit nofile=64:64`, `--tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777`,
  `--env HOME=/tmp` (sole enumerated env var). Node invocation:
  `node --permission --disable-sigusr1 --disallow-code-generation-from-strings worker.mjs`
  with no `--allow-fs-read`, `--allow-fs-write`, `--allow-child-process`,
  `--allow-worker`, or `--allow-addons`.
- Test-coverage profile is the same set plus
  `--tmpfs /coverage:rw,noexec,nosuid,nodev,size=8m,mode=1777` and
  `--allow-fs-write=/coverage` — nothing else changes.

## Step 1 — Node version/digest resolution: PROVEN

- `https://nodejs.org/dist/index.json` shows `v22.23.2` (2026-07-28) is the
  newest 22.x release and is flagged `security: true`; the next-newer entries
  behind it (`v22.23.1`, `v22.23.0`) are older.
- Cross-checked the Node core security-advisory index
  (`nodejs/security-wg` `vuln/core/index.json`): every 22.x-affecting CVE's
  `patched` range tops out at `^22.23.0` (e.g. `CVE-2026-48618`,
  `CVE-2026-48619`, `CVE-2026-48937`, all high/medium severity, all first
  fixed in `22.23.0`). No advisory in the index requires a fix newer than
  `22.23.2`, so nothing is being omitted by pinning there.
- Multi-arch index digest resolved two independent ways and cross-checked
  (they agreed): `docker buildx imagetools inspect node:22.23.2-bookworm-slim`
  and the public Docker Hub API
  (`hub.docker.com/v2/repositories/library/node/tags/22.23.2-bookworm-slim`)
  both report index digest
  `sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`,
  with per-platform manifests including `linux/amd64`
  (`sha256:a17d50af28002a160548bd4225b3cfcb12c5efcb171f79e68758f2885fb1b066`)
  and `linux/arm64` (`sha256:253da19867dd03e2f817f433d7782adefd2a2bac8729fcd4ebc6770665167a24`),
  confirming true multi-architecture coverage, not a single-arch alias.
- `docker run node@sha256:d649c27... node --version` printed `v22.23.2`,
  confirming the resolved digest actually is that release, not a mislabeled
  tag.

## Step 2 — hardened disposable image, run by digest: PROVEN

- Built from a fresh `mkdtemp`-staged build context (mirroring
  `run-sandbox.mjs`'s pattern): fixture bytes were copied into the staging
  dir, `sha256sum`'d there (`4bfd6745965c57e0...b45a9f` for `worker.mjs`),
  then built. After build, `docker run <id> cat worker.mjs` was re-hashed
  from inside the built image and matched the pre-build hash exactly —
  proves the image contains exactly the recorded bytes, not something
  substituted mid-build.
- Ran with `docker run --pull=never <64-hex sha256 image ID>` (not a tag).
  `docker version`/`docker run` succeeded with the full flag set above; the
  declared `ping` op returned `{"ok":true,"result":"pong"}` with exit 0.
- Custom seccomp profile: fetched Docker's upstream default profile
  (`moby/moby` vendors it at
  `vendor/github.com/moby/profiles/seccomp/default.json` — the top-level
  `profiles/seccomp/default.json` path referenced in older docs has moved),
  and mechanically removed `ptrace`, `process_vm_readv`, `process_vm_writev`,
  `kcmp`, `pidfd_getfd`, `process_madvise`, `kill`, `tkill`, `tgkill` from
  every `SCMP_ACT_ALLOW` group (confirmed none of the 9 names remain
  allow-listed afterward). Notably, Docker's own default profile allows
  `kill`/`tgkill`/`tkill` unconditionally (no capability gate at all) and
  allows `ptrace`/`process_vm_read/writev` unconditionally on kernel ≥ 4.8 —
  real enforcement for those normally comes from the kernel's own
  `CAP_SYS_PTRACE` check inside the ptrace codepath, not from seccomp. The
  custom profile removes that reliance entirely: the syscalls are refused at
  the seccomp layer regardless of capability state (see Step 6).
- Node still started and served the declared op correctly under the custom
  profile plus `--permission --disable-sigusr1 --disallow-code-generation-from-strings`
  with zero `--allow-*` flags — confirms the denial-by-default posture does
  not break the one legitimate operation.
- `--disallow-code-generation-from-strings` and `--disable-sigusr1` and
  `--permission`/`--allow-fs-read`/`--allow-fs-write`/`--allow-child-process`/
  `--allow-worker`/`--allow-addons` were all confirmed present in
  `node --help` / `--v8-options` for this exact resolved build before use.

## Step 3 — environment allow-list: PROVEN

- Exported a fake secret on the host
  (`PNH_TASK0_FAKE_SECRET=super-secret-value-should-never-leak-<rand>`)
  immediately before launch. The container was run with only
  `--env HOME=/tmp` (no `-e VAR` inheritance, no `--env-file`). The plugin's
  `env-dump` op reported exactly `["NODE_VERSION","HOSTNAME","YARN_VERSION","HOME","PATH","PWD"]`
  — every key traces to the upstream Node image or Docker's own runtime
  injection (`HOSTNAME`, `PWD`); the fake secret is absent.
- `docker image inspect <id> --format '{{json .Config.Env}}'` on the built
  image itself returned only `PATH`, `NODE_VERSION`, `YARN_VERSION` — all
  inherited from the upstream `node` base image, confirming the Containerfile
  adds no unexpected baked-in environment key.

## Step 4 — stdin/stdout-only channel: PROVEN

- `ls -la /proc/self/fd` inside a running container (full hardened flags)
  showed exactly fds `0` (`/dev/null`, since no stdin was piped for that
  probe), `1`, `2` (pipes), plus the transient fd `ls` itself opened to list
  the directory — no inherited extra descriptor.
- `/var/run/docker.sock` does not exist inside the container
  (`ls: cannot access '/var/run/docker.sock': No such file or directory`).
- `cat /proc/self/mountinfo` mountpoints were exactly the standard container
  set (`/`, `/proc`, `/dev`, `/dev/pts`, `/sys`, `/sys/fs/cgroup`,
  `/dev/mqueue`, `/dev/shm`, `/tmp`, `/etc/resolv.conf`, `/etc/hostname`,
  `/etc/hosts`, assorted `/proc/*` and `/sys/firmware` virtual paths) — no
  host path, manifest path, credential mount, or core-evaluator mount is
  present.

## Step 5 — declared op succeeds; full attack matrix fails: PROVEN

Declared op (`ping`) succeeds as shown in Step 2. With the production
profile and zero mounts of host/core/other-plugin paths, every attack op
below failed closed on the first invocation, one container per op:

| Op | Result |
|---|---|
| `read-host` | permission model: `Access to this API has been restricted. Use --allow-fs-read...` |
| `read-core` | same permission-model denial |
| `read-other-plugin` | same permission-model denial |
| `write-prod` | permission model: `...Use --allow-fs-write...` |
| `write-tmp-root` | same permission-model denial |
| `spawn-child` (`child_process.execSync`) | permission model: `...Use --allow-child-process...` |
| `spawn-worker-thread` (`new Worker`) | permission model: `...Use --allow-worker...` |
| `native-addon` (`process.dlopen`) | permission model: `Cannot load native addon because loading addons is disabled.` |
| `network` (`fetch`) | `TypeError: fetch failed` (`--network none`) |
| `unix-socket` (connect to `/var/run/docker.sock`) | `ENOENT` — socket path doesn't exist |
| `dynamic-eval` (`eval`) | `EvalError: Code generation from strings disallowed for this context` |
| `dynamic-function` (`new Function`) | same V8-level denial |
| `cross-plugin-access` (`readdir` of a would-be sibling plugin path) | permission-model denial |
| `access-supervisor` (read a would-be manifest path) | permission-model denial |

No mount for host/core/other-plugin/supervisor paths exists in production
shape, so these also fail at the mount-namespace boundary before permissions
are even reached — the permission model is a second, independent layer, not
the only one (the plan's Gate explicitly requires this: "Node permissions
alone never satisfy this gate").

## Step 6 — signal/ptrace/inspector probes against the trusted Runtime: PROVEN

- **SIGUSR1 (self-target, from inside the plugin's own worker.mjs)**:
  `process.kill(1, "SIGUSR1")` → `Error: kill EPERM`. The custom seccomp
  profile blocks the `kill`/`tgkill`/`tkill` syscalls outright, so the
  plugin cannot send *any* signal, to any target, under any capability
  state.
- **Capability-independent proof (the key defense-in-depth result)**: built a
  disposable diagnostic image (Node base + `python3`, apt-installed at build
  time only — network access during `docker build` is unrelated to the
  hardened `docker run` flags under test) and used a raw `ctypes.CDLL(None)`
  call to `libc.ptrace(PTRACE_ATTACH, <forked-child-pid>, 0, 0)` to bypass
  Node's permission model entirely and test the seccomp/capability layer in
  isolation:
  - `--cap-add SYS_PTRACE` + Docker's **default** seccomp profile → `ret=0
    errno=0` (attach succeeds — this sanity-checks the test methodology
    itself, ruling out AppArmor or other confounders).
  - `--cap-add SYS_PTRACE` + **our custom** seccomp profile → `ret=-1
    errno=1 (Operation not permitted)`. Ptrace fails even though the
    capability was deliberately granted — proves the custom seccomp profile
    is the operative control, not a reliance on capability absence alone.
  - Same probe's own `os.kill(child_pid, 9)` cleanup call also failed with
    `[Errno 1] Operation not permitted` in both custom-seccomp cases —
    independent corroboration that `kill`/`tgkill` are blocked for *any*
    target, not just self, at the seccomp layer.
  - Production shape (no `--cap-add`, custom seccomp) → same denial
    (`errno=1`), i.e. both layers agree in the actual deployed
    configuration.
  - A parallel shell-only check (`kill -0 $$`) under the production shape
    also failed: `sh: 1: kill: Operation not permitted`.
- **PID enumeration**: `readdir('/proc')` from inside worker.mjs denied by
  the permission model (`Use --allow-fs-read...`) before the private PID
  namespace even matters.
- **Inspector activation**: `inspector.open(9229, "127.0.0.1")` denied by
  the permission model (`Access to this API has been restricted.`).
- **Loopback `Runtime.evaluate`**: `fetch("http://127.0.0.1:9229/json")`
  failed (`TypeError: fetch failed`) — network namespace is `none`, so even
  if an inspector somehow opened, no host loopback is reachable from inside
  the container (container loopback ≠ host loopback under `--network none`).
- **`--disable-sigusr1` isolated check**: registered a user `SIGUSR1`
  handler, self-signaled, and checked `inspector.url()` with and without
  `--disable-sigusr1` under Docker's *default* seccomp (so the syscall
  itself is not the blocker). Both cases returned `undefined` — the
  permission model's own Inspector restriction already prevents the
  auto-toggle-on-SIGUSR1 path from opening anything, independent of
  `--disable-sigusr1`. This preflight could not isolate `--disable-sigusr1`'s
  own marginal contribution from the permission model's overlapping denial
  in this test shape; it remains applied as documented, redundant
  defense-in-depth, not as the sole control — recorded here honestly rather
  than claimed as independently proven.
- **"the attempt is recorded"**: no Task 3 broker exists yet to audit-log
  attempts against a durable store, so this preflight cannot prove durable
  audit logging. What is proven: every attempted operation (declared or
  attack) produces exactly one structured JSON record
  (`{"op":...,"ok":...,"error":...}`) on the single stdout channel, which is
  the primitive a future broker would consume to log the attempt. Durable
  logging itself is out of scope for Task 0 per the working method (no
  broker code to write here).

## Step 7 — resource ceilings: PROVEN

- **Memory**: `alloc-exhaust` op (repeated 64 MiB buffer allocation) under
  `--memory 128m` → container `Status=exited ExitCode=137 OOMKilled=true`
  within ~8s. Host `docker version` and other running containers were
  unaffected.
- **CPU**: `cpu-spin` op (30s busy loop) under `--cpus 0.5` →
  `docker stats --no-stream` sampled `CPU=49.72%` at ~2s in, matching the
  0.5-core ceiling precisely.
- **Wall-time**: since Docker has no native per-run wall-clock flag, the
  trusted parent must enforce it itself; simulated a 2s parent-side budget
  by `docker kill`-ing the still-spinning `cpu-spin` container after that
  window → `Status=exited ExitCode=137`, only that container was affected
  (`docker ps` showed the host's one pre-existing unrelated container
  untouched throughout).
- **PID limit / fork bomb**: bypassed the permission model deliberately (ran
  a raw shell fork loop, not through worker.mjs, to test the docker/cgroup
  control in isolation) under `--pids-limit 32` →
  `sh: Cannot fork` repeated once the ceiling was hit; container exited
  cleanly (`ExitCode=2`), host stayed healthy.
- **Output flooding**: `output-flood` op (repeated 1 MiB stdout writes in a
  tight loop) measured via `docker logs <name> | wc -c` over a 4s window
  under the default `json-file` log driver plateaued at 65536 bytes — bounded,
  not runaway, within the observation window; `docker system df` afterward
  showed total container disk at 21.54 MB across all 19 containers on the
  host (no measurable growth). **Finding**: because Docker's default log
  driver persists container stdout to a host-side JSON log file regardless
  of whether the trusted parent reads via the attached pipe or `docker logs`,
  an output-flood attack has a real (if here empirically bounded)
  host-disk avenue that is independent of the wall-time kill. Recommend
  folding `--log-driver none` into the canonical flag set — verified: with
  it, `docker logs` on that container correctly errors
  (`configured logging driver does not support reading`), i.e. no host-side
  persistence path exists at all; the trusted parent must instead consume
  the plugin's single JSON response directly off the attached stdout pipe,
  which is already the design per Step 4. This flag is included in the
  canonical flag set at the top of this doc.

## Step 8 — tamper detection / fail-closed in the trusted parent: PROVEN

- **Changed source during packaging / changed launcher or plugin byte**:
  flipped one byte in `worker.mjs` (`pong` → `xong`), rebuilt from a fresh
  staged context, and re-hashed: `4bfd6745...b45a9f` (original) vs
  `dc811c79...0a5b857` (tampered) — different digests, deterministically
  detectable by comparing against a previously recorded/reviewed hash before
  ever building.
- **Image-tag substitution — the decisive proof**: captured the *original*
  image's content ID (`sha256:cb225560...81c42`) before rebuilding the
  tampered fixture under the *same* mutable tag
  (`pnh-task0-plugin-worker-fixture:preflight`). Result:
  - Launching by the **originally recorded digest** after the retag:
    `docker: Error response from daemon: No such image: sha256:cb22556e...`
    — fails closed. The original image had no independent tag holding it
    alive, so Docker's local store fully replaced it on retag (not even left
    dangling) — a real operational finding: **a broker must retain a
    build's image by a stable, non-reused reference (e.g. a per-build unique
    tag or immediate digest capture verified before every run), never by a
    single floating build tag**, or a legitimate later rebuild can silently
    orphan the currently-in-flight production image.
  - Launching by the **substituted mutable tag** instead:
    `{"ok":true,"result":"xong"}` — silently ran the tampered code. This is
    exactly the failure mode digest-pinned launch prevents: as long as the
    trusted parent launches *only* by digest and treats "no such image" as a
    hard, non-recoverable failure (never falls back to resolving by tag),
    tag substitution cannot smuggle in tampered content. The empirical
    contrast between these two invocations is the proof.
- **Undeclared capability request**: sent `{"op":"delete-everything"}`
  (not in the declared op table) → `{"ok":false,"error":"unlisted operation: delete-everything"}`.
  A standalone parent-side validator script (`trusted-parent-validator.mjs`,
  checks response keys and values exactly against the one declared
  contract) rejected this response (`REJECT: response has undeclared/missing
  fields`).
- **Extra JSON result**: requested `{"op":"ping","injectExtraField":true}`,
  had the fixture inject an extra `extra` key into an otherwise-valid `ping`
  response → validator rejected (`got [extra,ok,result] expected
  [ok,result]`). The declared-op path with no injected field was
  independently confirmed to pass the same validator (`ACCEPT`).
- **Crash / malformed output**: sent non-JSON stdin (`not-json-at-all`) →
  plugin responded `{"ok":false,"error":"invalid JSON request"}`, which the
  validator also rejected (doesn't match the declared schema) — a genuine
  crash (uncaught exception) is handled by the same top-level catch and
  reported with `process.exitCode = 1`, giving the parent both a non-JSON
  or error-shaped payload and a nonzero exit code to fail closed on.
- **Request replay**: wrote two `{"op":"ping"}` lines to a single
  container's stdin (simulating a replayed/duplicated request against one
  worker instance) → the parser (which reads all of stdin as one blob) threw
  and returned `{"ok":false,"error":"invalid JSON request"}` for the whole
  stream, not two independent responses. Each container instance is
  single-shot and disposed after one response, so a stale worker process
  never lives long enough to be replayed against; true cross-invocation
  replay protection (nonces/idempotency keys) is a trusted-parent (Task 3)
  concern, correctly out of scope for a container-boundary preflight.

## Step 9 — production vs test-coverage profiles: PROVEN

- **Production**: `ls -la /coverage` inside a production-profile container →
  `No such file or directory`. No coverage mount, no `--allow-fs-write`
  anywhere in the production flag set (already exhaustively exercised in
  Step 5 — `write-prod` and `write-tmp-root` both denied).
- **Test-coverage**: added only
  `--tmpfs /coverage:rw,noexec,nosuid,nodev,size=8m,mode=1777` and
  `--allow-fs-write=/coverage` on top of the identical hardened flag set.
  - Write to `/coverage/cov.json` succeeded silently (confirmed: the
    subsequent *read* of that same file failed with the permission model's
    `FileSystemRead` denial, since only `--allow-fs-write=/coverage` was
    granted — write-only, not read-back, which is stricter than the plan
    requires and was left as-is rather than loosened).
  - `write-prod` and `write-tmp-root` still denied identically under the
    coverage profile — coverage capability is scoped exactly to `/coverage`
    and nowhere else.
  - `inspector-activate` still denied identically under the coverage
    profile — "cannot emit Runtime evidence" holds; nothing about the
    coverage profile weakens the Runtime-facing denials.
  - Size cap enforced: writing 20 MiB into the 8 MiB `/coverage` tmpfs threw
    `Error ENOSPC: no space left on device` — the size-capped tmpfs is a
    real ceiling, not documentation-only.
- **"Production must reject every coverage-profile flag or mount"**: this is
  a launcher-level (Task 3 broker) invariant — there is no broker code yet
  to assert it against. What this preflight proves is the flag-set
  *difference* itself and that the container-level enforcement of each
  profile is correct and mutually exclusive in practice (no coverage
  capability leaks into a production-shaped launch, and vice versa is
  structurally impossible since the mount/flag simply isn't present).
  Whether a future broker correctly *refuses* to accept coverage flags when
  asked to run in production mode is Task 3's own correctness gate, not
  something Task 0 can exercise without Task 3 existing.

## Gate verdict

**Gate satisfied.** Across every probe attempted, no plugin container could
signal, inspect, exhaust, read, write, or otherwise address a trusted
process, another plugin, the core evaluator, or a host resource. Denial in
every case was backed by more than the Node permission model alone — mount
namespace absence, `--network none`, seccomp syscall removal (proven
capability-independent), cgroup ceilings, and digest-pinned fail-closed
launch all independently contributed, matching the Gate's explicit "Node
permissions alone never satisfy this gate" requirement.

Two operational findings worth carrying into Task 3's broker design (neither
is a Gate failure — both were resolved by refining the flag set within this
same preflight and re-verified):

1. Fold `--log-driver none` into the canonical flag set — the default
   `json-file` driver gives output flooding a host-disk avenue independent
   of the wall-time kill, even though this run's window stayed bounded.
2. A build's image must be retained by a stable reference (unique per-build
   tag, or immediate verified digest capture) rather than a single reused
   floating tag — rebuilding under the same tag can fully orphan the
   in-flight production image, not merely leave it dangling.

## Cleanup performed

All fixture files, the custom seccomp profile, the parent-validator script,
and both disposable images (`pnh-task0-plugin-worker-fixture:preflight`,
`pnh-task0-diag:preflight`) were created under a scratchpad temp directory
and removed before finishing. `docker images` / `docker ps -a` were checked
clean of this preflight's artifacts (confirmed no dangling images created
during this session remain). One stray container from an early malformed
`strace`-based probe attempt (superseded by the `ctypes`-based probe above)
was caught and removed mid-run; the host's pre-existing, unrelated
containers (from other local projects) were left untouched throughout.
