# Task 3 OS-sandbox replacement design

Status: implemented, audit-remediated, and verified on 2026-08-19. The outer
Docker boundary worked, while global ambient stubs previously broke Node
internals before core loaded. The final design adds a resolved-URL parent guard
and an in-memory supervisor that gives each worker the manifest over a private
descriptor. See the preflight report, replacement loader design, and audit:

- `docs/plans/provider-neutral-harness/reviews/2026-08-19-task3-docker-preflight.md`
- `docs/plans/provider-neutral-harness/2026-08-19-task3-core-scoped-loader-design.md`
- `docs/audits/2026-08-19-kernel-plan-1-audit.md`

## Decision

Replace Plan 1's SES-based locked realm with a Docker OS-sandboxed test runner.
The runner executes every core invocation in a short-lived child Node process
inside a constrained container. It is the enforcement boundary, not
`node:vm`, SES, a monkeypatch, or a lexical convention.

This choice is based on the failed SES acceptance gate:

- SES correctly denied ambient authority and constructor escapes.
- Endo's bundled execution did not attribute executed TypeScript to c8, so it
  cannot satisfy C19's executable coverage proof.
- Docker Engine is present on the planning host. `bwrap` and Podman are absent.
  macOS `sandbox-exec` exists but is not the portable Linux CI boundary.

The Docker daemon, pinned base-image digest, committed npm lockfile, host
launcher, parent resolved-URL guard, in-memory supervisor, worker loader, and
Node runtime are trusted computing base. Core code is not.

## Scope and non-goals

This design replaces only Plan 1 Task 3 and the Task 8 test command. It leaves
the NodeNext graph checker, pure core contracts, CI trigger shape, and all later
Plan 1 work unchanged.

It does not claim to make c8 output cryptographically trustworthy against a
malicious guest. c8 proves execution coverage; Docker contains a guest that
tries to evade or escape it. A future adversarial-test attestation system would
need a separate design.

## Selected architecture

```text
trusted host launcher
  └─ docker run: no network, read-only root, no Linux capabilities
       └─ entrypoint deletes bootstrap manifest before guarded tests start
            ├─ node:test + c8 + tsx under resolved-URL parent guard
            └─ in-memory supervisor
                 └─ fresh child Node worker per core invocation
                      ├─ receives manifest over private descriptor 3
                      ├─ registers a manifest-scoped core loader transform
                      ├─ dynamically loads only a checked core entry
                      ├─ accepts JSON input and returns JSON output
                      └─ is destroyed after the call
```

The parent test process and Node worker retain normal globals inside the outer
container, so test code can calculate expected timestamps and use
`node:assert`. Parent tests run under a resolved-URL guard that rejects direct,
transitive, computed, and symlinked core targets. The worker loader adds denial
bindings only to checked core modules; it never replaces a worker-wide global.
That avoids corrupting Node internals while still preventing a core call from
using ambient authority.

The worker retains its normal Node intrinsics. Transformed core source sees
only its lexical denial bindings, and a malicious core that recovers an
intrinsic through a constructor or callback still remains inside the outer
Docker boundary: no network, no writable host mount, no Docker socket, and no
retained filesystem state.

## Required runtime contract

`pnh/harness/sandbox.ts` exposes one JSON-safe operation:

```ts
interface SandboxCall {
  entry: string;       // a checked relative pnh/core/*.ts path
  exportName: string;  // named function export
  args: SandboxArgument[]; // JSON wire values or declarative local-record fixtures
  port?: {
    name: "sha256";
    argumentIndex: number;
    fixture: "valid" | "malformed";
  };
}

interface SandboxResult {
  ok: true;
  value: unknown;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type SandboxArgument =
  | JsonValue
  | { kind: "null-prototype-record"; value: Record<string, JsonValue> }
  | { kind: "inherited-record"; inherited: Record<string, JsonValue>; own: Record<string, JsonValue> }
  | { kind: "accessor-record"; value: Record<string, JsonValue>; key: string; returns: JsonValue }
  | { kind: "non-enumerable-record"; value: Record<string, JsonValue>; key: string; hidden: JsonValue };
```

Invalid JSON, a malformed fixture, an unlisted entry, a non-function export, a
symlink, an adapter name other than `sha256`, an invalid adapter position, or a
child exit without one JSON result fails the test. The host never passes a
function or object capability across the boundary. The worker materializes the
small declared record-fixture set locally so core can be tested against
null-prototype, inherited, accessor, and non-enumerable inputs. It creates the
SHA-256 adapter locally, inserts it at the declared position, and serializes
the result back to the test. The `malformed` adapter is a local test fixture for
the kernel's hash-output rejection path; it is not a provider option.

The Task 2 graph checker produces the allowed entry manifest after resolving
realpaths. The entrypoint reads and deletes its temporary bootstrap file before
tests start. The supervisor retains the manifest only in memory; `sandbox.ts`
sends it a validated request over a private socket, and each fresh worker gets
the manifest over descriptor 3. Tests and workers receive no manifest path or
manifest environment value.

## Container contract

The implemented container boundary uses these files:

- `pnh/harness/sandbox/Containerfile`
- `pnh/harness/sandbox/image.lock.json`
- `pnh/harness/sandbox/container-entrypoint.mjs`
- `pnh/harness/sandbox/core-loader-preload.mjs`
- `pnh/harness/sandbox/core-policy.mjs`
- `pnh/harness/sandbox/core-transform.mjs`
- `pnh/harness/sandbox/parent-core-guard-preload.mjs`
- `pnh/harness/sandbox/parent-core-guard-policy.mjs`
- `pnh/harness/sandbox/sandbox-supervisor.mjs`
- `pnh/harness/sandbox-worker.mjs`
- `pnh/harness/sandbox.ts`
- `pnh/harness/run-sandbox.mjs`
- `pnh/tests/sandbox-boundary.test.ts`

`image.lock.json` records the verified multi-architecture index digest for the
Node `22.21.0` base image. The Containerfile uses that digest in `FROM`, not a
mutable tag. It copies only the root package manifests plus the container
entrypoint, runs `npm ci --ignore-scripts`, and uses a non-root runtime user.
It must never copy the repository source or credentials into the image.

At runtime, `run-sandbox.mjs` resolves the repository's `pnh/` directory and
launches this exact policy shape. It rejects a missing Docker Engine or a base
digest mismatch; it never runs tests directly on the host.

```bash
docker run --rm --init \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 256m \
  --cpus 1 \
  --user 10001:10001 \
  --workdir /sandbox/pnh \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777 \
  --env HOME=/tmp \
  --env NODE_OPTIONS=--disable-proto=throw \
  --mount type=bind,src=<realpath-pnh>,dst=/sandbox/pnh,readonly \
  <pinned-image> \
  /runner/container-entrypoint.mjs
```

No host directory besides the realpath-validated `pnh/` subtree is mounted.
There is no Docker socket, working-directory write mount, environment pass-
through, published port, `--privileged`, capability add, or network exception.
All temporary and V8 coverage files live in the container tmpfs and disappear
when it exits. c8's text report is returned over stdout only.

## Core-child contract

The approved replacement is the core-scoped transform in
`2026-08-19-task3-core-scoped-loader-design.md`. It uses Node's synchronous
`module.registerHooks()` loader API to compile and add lexical denials only to
manifest-checked core TypeScript. Its worker stays `.mjs`, dynamically imports
the manifest-approved entry only after hook registration, and emits one JSON
result. It has no host import, no object/function bridge, and no global
monkeypatch.

Each call starts a new worker process. That proves fresh module identity and
prevents cross-test ESM cache state. The outer container, not the child, is the
security boundary.

## Test and coverage command

Task 8 replaces the SES command with this container-owned command:

```json
"test:pnh": "npm run typecheck:pnh && npm run check:pnh-graph && node pnh/harness/run-sandbox.mjs"
```

Inside the container, the entrypoint runs:

```bash
/runner/node_modules/.bin/c8 --all --extension .ts --100 \
  --src /sandbox/pnh/core \
  --include '**/core/**/*.ts' \
  --temp-directory /tmp/coverage \
  --reporter text --reporter text-summary \
  node --import /runner/tsx-preload.mjs \
  --test /sandbox/pnh/tests/*.test.ts
```

The parent test process runs without the synchronous core loader because its
non-core tsx hand-off lacks a usable source. It instead preloads the resolved-
URL parent guard. Each fresh worker preloads the core loader before its only
core import and receives the manifest over private descriptor 3 from the
supervisor. Worker processes inherit c8's coverage environment. The entrypoint
fails if coverage is not merged, if its summary does not name a loaded original
core TypeScript file, or if any statement, function, branch, or line is below
100%. Use `--src` with the relative globbed include above, not an absolute
`--include` path: the latter can match no remapped V8 `file:///...` URLs and
make `--100` pass with zero files. The 256 MiB tmpfs is required for V8 coverage
output; 64 MiB exhausted while running the real worker suite.

## Mandatory implementation preflight

Before replacing the blocked Task 3, implement this disposable fixture and
record its output under `docs/plans/provider-neutral-harness/reviews/`:

1. Build the pinned image after recording and verifying its index digest.
2. Run a core fixture that executes exactly one branch and leaves one core file
   unimported. Confirm c8 names the original `.ts` files, attributes nonzero
   execution to the loaded file, and fails at `--100` for the uncovered branch
   and unloaded file.
3. Run boundary probes: no network; no read access to a sentinel outside the
   mounted `pnh/`; read-only root; no inherited environment secret; worker
   globals still usable before core import; core-only denied globals; denied
   direct/computed dynamic imports; denied `require`; manifest/digest rejection;
   and a constructor escape that remains contained.
4. Remove the fixture, rerun the real core tests, then make the deliberate
   branch/unloaded-file regression fail and recover.

Any failure blocks implementation. Do not weaken flags, add a writable host
mount, accept a mutable image tag, exclude a file, or fall back to host, SES,
or `node:vm` execution.

## CI and portability

CI remains `ubuntu-latest` but first runs `docker version` and verifies the
recorded image digest. It builds with `--pull=false` and runs the same
`npm run test:pnh` command as local development. Docker Desktop is the supported
local macOS backend. A Linux-only `bwrap` backend may be evaluated later, but
is not a fallback and is not part of this plan.

## Alternatives considered

| Option | Decision | Reason |
| --- | --- | --- |
| Docker OS sandbox | Selected | Available locally, portable to Linux CI, and contains constructor escapes outside the host process. |
| `bwrap` subprocess | Not selected | A strong Linux option, but absent locally and would create a separate macOS/CI implementation. |
| macOS `sandbox-exec` | Rejected | Available locally but does not provide the Linux CI boundary. |
| SES or `node:vm` | Rejected | SES failed executed-TypeScript c8 attribution; `node:vm` is not a security boundary. |

## Implementation success criteria

- Every PNH core runtime test runs through the constrained Docker launcher;
  host-side typechecking and graph resolution remain trusted preconditions.
- The graph checker, resolved-URL parent guard, strict child manifest
  validation, and c8 gate all fail closed.
- The bootstrap manifest is deleted before tests; the supervisor keeps it in
  memory and workers receive it only over private descriptors.
- The coverage report shows original TypeScript source with 100/100/100/100.
- Boundary regressions prove that core cannot gain network, host filesystem,
  host environment, or lasting write authority.
- `npm run test:x1` remains green after the final PNH gate is added.
