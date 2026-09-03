# Task 3 core-scoped loader-transform design

Status: implemented, audit-remediated, and verified on 2026-08-19. The
disposable evidence is recorded in
`reviews/2026-08-19-task3-core-loader-preflight.md`; the final parent guard,
supervisor transport, and strict manifest-policy evidence is recorded in
`../../audits/2026-08-19-kernel-plan-1-audit.md`.

## Decision

Keep the Docker OS boundary and replace the child-wide ambient monkeypatch
with a synchronous Node ESM loader hook. The hook loads and transforms only
the realpath- and digest-verified TypeScript files named in the Task 2 core
manifest. It leaves the Node runtime, c8, `node:test`, tsx, and the sandbox
worker's own globals unchanged.

The pinned guest is Node `22.21.0`. Its `module.registerHooks()` API is
available (introduced in Node `22.15.0`), so the implementation uses the
synchronous hook API rather than the separate-thread asynchronous loader API.
The worker registers the hook through `--import` and dynamically imports the
checked entry only after registration.

The trusted computing base is the Docker policy, the pinned runner image, the
manifest producer, the parent resolved-URL guard, the in-memory supervisor,
the loader/precompiler, the worker, c8, and the Node runtime. `pnh/core/` is
not trusted. The Docker boundary continues to contain any successful
constructor or prototype escape.

## Why this replaces the global preload

The Docker preflight proved that a child-wide `performance` denial crashes a
Node internal dependency before core is imported. A lexical binding inserted
only into a transformed core module does not alter the global binding that
Node, the test runner, or the worker sees. It makes direct names such as
`Date`, `process`, `fetch`, and `performance` resolve to throwing bindings
inside core, and rewrites `globalThis` and `global` to a throwing proxy so
computed access cannot recover the host globals.

This is enforcement in addition to the Task 2 graph checker. The graph
checker rejects forbidden syntax and non-core imports before the container
runs. The loader independently validates the manifest and only resolves its
recorded core-to-core edges while loading guest code. Neither mechanism is a
replacement for the Docker boundary.

## Selected architecture

```text
trusted host launcher
  └─ constrained Docker container
       └─ trusted entrypoint creates, reads, then deletes bootstrap manifest
            ├─ supervisor retains manifest text only in memory
            │    └─ fresh Node worker for each sandbox call
            │         ├─ receives manifest over private descriptor 3
            │         ├─ --import registers synchronous core loader hooks
            │         ├─ dynamically imports the requested manifest entry
            │         ├─ transforms only checked core .ts modules
            │         └─ returns one JSON result, then exits
            └─ c8 + node:test run under the parent resolved-URL core guard
```

The entrypoint creates the manifest at a temporary container path after
re-running the Task 2 graph checker, reads it, and deletes it before tests
start. The read-only `pnh/` mount is never modified. No shared manifest path or
environment value reaches tests or workers. The supervisor receives the text
once over descriptor 3, retains it only in memory, and passes a copy to each
fresh worker over that worker's private descriptor 3. The manifest records
each canonical realpath, SHA-256 of the source bytes, allowed entry, and each
resolved literal core-to-core edge. The loader verifies the source digest
again immediately before compiling it. A changed or malformed manifest,
source digest mismatch, unlisted URL, unlisted edge, symlink, or non-`.ts` file
is a hard failure.

The minimum supported PID limit is **128**, not 64. The preflight showed that
tsx's loader worker cannot start under 64, and the final supervisor/worker
layout is verified at 128. No attempt to reduce the cap is part of Task 3.

## Loader and transform contract

The trusted implementation is split across these files:

- `pnh/harness/sandbox/core-loader-preload.mjs`
- `pnh/harness/sandbox/core-policy.mjs`
- `pnh/harness/sandbox/core-transform.mjs`
- `pnh/harness/sandbox/parent-core-guard-preload.mjs`
- `pnh/harness/sandbox/parent-core-guard-policy.mjs`
- `pnh/harness/sandbox/sandbox-supervisor.mjs`
- `pnh/harness/sandbox-worker.mjs`
- `pnh/harness/sandbox.ts`
- `pnh/harness/sandbox/container-entrypoint.mjs`

`core-loader-preload.mjs` reads the manifest text from fixed file descriptor 3,
validates it, then calls `registerHooks({ resolve, load })`. It does not read a
manifest path, replace globals, or expose an endowment object. The worker is
plain `.mjs` so it can start without relying on tsx; it dynamically imports
the requested entry after the preload has completed.

`resolve` has these rules:

1. A core importer may resolve only an exact manifest-recorded literal edge.
   Bare specifiers, `node:` specifiers, URLs, and unrecorded relative paths
   fail before Node resolution.
2. The trusted worker may dynamically import only a manifest-listed entry.
3. An importer outside the trusted worker or core that resolves to a core URL
   fails. Test code therefore cannot import core directly.
4. Non-core module resolution delegates unchanged to `nextResolve`.

`load` delegates unchanged unless the canonical URL is a manifest-listed core
file. For a core file it reads the verified bytes itself, parses the source
with the pinned TypeScript compiler, rejects any dynamic `import()` expression,
`require` call, `import.meta`, or syntax inconsistent with the manifest, then
uses a TypeScript AST transformer to prepend synthetic declarations and rewrite
ambient identifier references to those bindings. It returns compiled ESM
JavaScript with an inline, original-TypeScript source map and
`shortCircuit: true`. The image installs the compiler from the committed root lockfile; no
compiler package is loaded from the PNH bind mount.

The prelude captures the runtime intrinsics it needs before creating core-local
bindings. The transform rewrites these names to throw on use inside transformed
core: `Date`, `crypto`, `fetch`, `process`, `performance`, `Intl`,
`WebSocket`, `navigator`, `WeakRef`, `FinalizationRegistry`,
`SharedArrayBuffer`, `Atomics`, `console`, `require`, `eval`, `Function`, and
the timer APIs. It rewrites `globalThis`, `global`, `self`, and `window` to a
throwing proxy. `Math` is a frozen copy of the captured intrinsic with only
`random` replaced by a throwing function. `WebAssembly` is also denied as a
dynamic-code facility.

The transform does not receive, proxy, or mutate a Node global. It only places
lexical bindings in the generated core module.
`--disallow-code-generation-from-strings` remains on every worker invocation,
so the permitted local SHA-256 adapter cannot be used as a constructor route
back to `process`.

## Source-map requirement

The loader must not prepend a raw string to TypeScript. That shifts V8 lines
and was the kind of unproven coverage behavior that blocked the SES route.

Instead, the TypeScript AST transformer inserts synthetic prelude statements
with no source range and compiles in a single pass with inline source maps and
embedded original sources. The original core AST nodes retain their TypeScript
source positions. c8 must report original core TypeScript with nonzero execution
attributed to a loaded file. Generated loader URLs, generated JavaScript paths,
missing maps, zero execution for a loaded file, or a summary with no matched
source file block the task.

If the single-pass compiler does not produce that evidence, the proper fallback
is a trusted image-local precompiler that writes JavaScript plus composed inline
source maps into `/tmp` and then imports those artifacts through the same
manifest policy. It remains core-scoped and Docker-contained. Do not fall back
to raw source prepending, an ignore pragma, global monkeypatching, SES, or
`node:vm`.

## Core-call contract

`sandbox.ts` serializes a JSON-safe request and sends it over the
container-private supervisor socket. The supervisor starts a fresh worker with:

```bash
node --disallow-code-generation-from-strings \
  --import /sandbox/pnh/harness/sandbox/core-loader-preload.mjs \
  /sandbox/pnh/harness/sandbox-worker.mjs
```

The worker validates the requested entry and export against the manifest,
materializes only the declared JSON record fixtures locally, creates the
SHA-256 adapter locally when requested, inserts it at the declared argument
index, and returns one JSON result. The fixture set is limited to
null-prototype, inherited, accessor, and non-enumerable records. It exists so
core validation can be tested without admitting a host object across the
process boundary. A `malformed` SHA-256 adapter is likewise local and exists
only for the kernel's hash-output rejection test.

Every request gets a new process, so an ESM module cache cannot cross calls.
The worker, not the parent test, passes the local adapter into core. It must
include a hostile-callback probe showing that
`adapter.constructor("return process")` is rejected by the Node flag.

Core tests call the trusted `sandboxCall()` helper. They may calculate expected
values in the test process, but they never statically or dynamically import a
core module. A return value crossing the process boundary is JSON, not a
function or a host object.

## Container command and loader order

The container image includes a stable `/runner/tsx-preload.mjs` wrapper that
imports the image's `tsx` package. It avoids referring to tsx's internal
distribution paths from the read-only PNH mount. The entrypoint creates a
uniquely named bootstrap manifest, reads and deletes it, starts the supervisor
with the manifest on descriptor 3, and runs both `.test.mjs` and TypeScript
tests under the resolved-URL parent core guard. TypeScript tests run under this
equivalent c8 command:

```bash
/runner/node_modules/.bin/c8 --all --extension .ts --100 \
  --src /sandbox/pnh/core \
  --include '**/core/**/*.ts' \
  --temp-directory /tmp/coverage \
  --reporter text --reporter text-summary \
  node --import /runner/tsx-preload.mjs \
  --test /sandbox/pnh/tests/*.test.ts
```

The parent test process does not preload the synchronous core loader: tsx's
loader chain does not provide source for that hook's non-core hand-off. It
instead preloads `parent-core-guard-preload.mjs`, whose resolved-URL policy
rejects direct, transitive, computed, and symlinked attempts to load core in
the parent. Each fresh child worker preloads the core loader before importing
its manifest-listed entry. The entrypoint asserts that c8's summary names every
manifest core file. `--src` must be combined with the relative globbed include
above; an absolute `--include` path can match no remapped V8 `file:///...` URLs
and make `--100` pass vacuously.

## Required disposable preflight

Run this before changing any PNH implementation file, dependency, lockfile, or
test. Record complete commands and relevant output in a new review report.

1. Build a temporary runner from the pinned base image and run it with the
   existing Docker policy except `--pids-limit 128` and c8's
   `--temp-directory /tmp/coverage`.
2. Generate a two-file manifest-backed fixture. Execute one branch in the
   loaded core TypeScript file and leave the other core file unimported. Prove
   c8 attributes nonzero execution to the loaded original `.ts` file and fails
   at `--100` for both the uncovered branch and unimported file.
3. Probe every denied direct and computed global inside core, including
   `globalThis["pro" + "cess"]`, `Math.random`, a timer, `eval`, and
   `Function`. Confirm the same globals still work for the Node worker before
   its dynamic core import.
4. Prove direct and computed dynamic imports, `require`, `node:` imports,
   unlisted core edges, outside-core imports, an unlisted entry, and a
   digest-mismatched source all fail closed. Prove the local record fixtures
   never arrive as host objects and that a new worker gives a new core module
   identity.
5. Re-run the existing Docker boundary probes: no network, no host sentinel or
   inherited secret, no write to the PNH mount, no Docker socket, and no
   writable root. Remove the fixture and temporary image afterwards.

Passing only the outer boundary or only the ambient probes is insufficient.
The preflight passed all five checks on 2026-08-19 and proved original
TypeScript coverage. The implemented runner also proved the final parent/worker
loader split, resolved-URL parent guard, private descriptor transport, strict
manifest validation, and 100% original-TypeScript coverage.

## Alternatives considered

| Option | Decision | Reason |
| --- | --- | --- |
| AST transform in synchronous `module.registerHooks` loader | Selected | Core-only enforcement, no separate hook thread, and a path to original-TypeScript source maps on the pinned Node runtime. |
| Trusted precompiler plus composed maps | Proper fallback | Use only if the selected transform cannot prove c8 source attribution; it preserves the same Docker and manifest boundary. |
| Raw string prelude | Rejected | It shifts source locations and has no verified c8 attribution. |
| Child-wide global monkeypatch | Rejected | It crashed Node internals during the Docker preflight. |
| SES or `node:vm` | Rejected | SES failed C19 coverage attribution; `node:vm` is not a security boundary. |
