# Task 3 Docker preflight result

Status: BLOCKED

Date: 2026-08-19

Scope: disposable Docker preflight only. The fixture directory and temporary
runner image were removed after the run. No PNH implementation file,
dependency, lockfile, test, commit, or push was added to the repository.

## Verified outer boundary

- Docker Desktop Engine `29.6.2` was available locally.
- The base image was pinned to Node `22.21.0` index digest
  `sha256:f9f7f95dcf1f007b007c4dcd44ea8f7773f931b71dc79d57c216e731c87a090b`.
- The temporary image built with `npm ci --ignore-scripts` and ran as UID/GID
  `10001`.
- A container with `--network none`, `--read-only`, `--cap-drop ALL`,
  `--security-opt no-new-privileges:true`, a read-only PNH-only bind mount,
  tmpfs `/tmp`, no inherited sentinel environment variable, and no Docker
  socket passed these probes:
  - the host sentinel environment variable was absent;
  - a host sentinel file was absent;
  - writing into the mounted PNH directory failed;
  - a network fetch failed.

## Required denial and coverage proof — failed

The preflight used a fresh child Node process for each core call. Its preload
attempted to install throwing globals before importing core, including
`Date`, `process`, `performance`, `require`, `eval`, and `Function`.

Two implementation details were discovered and fixed inside the disposable
fixture only:

1. c8's default `coverage/` directory conflicts with a read-only worktree, so
   `--temp-directory /tmp/coverage` is required.
2. The isolated PNH bind mount cannot resolve image-local `tsx`; the runner
   must use its absolute image-local loader path.

The decisive failure remained: the initial PID cap of 64 was too low for the
tsx loader's worker thread. At 128 PIDs, the outer test process started, but
the child failed before importing core because Node lazily initialized an
internal dependency that reads global `performance`; the throwing proxy caused
`Error: ambient denied: performance`.

That means global monkeypatching in the child is not a valid core-denial
mechanism. The run never reached the mandatory nonzero TypeScript coverage
attribution proof, so C19 cannot be credited.

## Required next design change

Keep the Docker outer boundary. Replace the global child preload with a
core-scoped source transform or ESM loader that injects denial bindings only
into checked core modules, while leaving Node and the test worker globals
intact. The revised loader must first prove all ambient/dynamic-load probes and
then prove c8 reports nonzero execution for loaded original TypeScript before
any Plan 1 implementation resumes.
