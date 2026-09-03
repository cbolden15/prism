# Task 3 core-scoped loader preflight result

Status: PASS

Date: 2026-08-19

Scope: disposable Docker fixture only. No `pnh/` implementation file,
repository dependency, lockfile, test, commit, or push was added. The temporary
fixture and runner image are removed after this report is written.

## Environment

- Docker Desktop Engine: `29.6.2` on `linux/arm64`.
- Base image: Node `22.21.0-bookworm-slim` pinned to index digest
  `sha256:f9f7f95dcf1f007b007c4dcd44ea8f7773f931b71dc79d57c216e731c87a090b`.
- The runner installed `c8@12.0.0`, `tsx@4.19.2`, and `typescript@5.7.2` with
  `npm ci --ignore-scripts` from a temporary lock created by the pinned Node
  22 image. The repository lockfile was not used or changed.

The fixture ran as UID/GID `10001` with `--network none`, `--read-only`,
`--cap-drop ALL`, `--security-opt no-new-privileges:true`, `--pids-limit 128`,
`--memory 256m`, `--cpus 1`, a noexec tmpfs `/tmp`, and only a read-only PNH
bind mount. It had no Docker socket, published port, host worktree mount, or
environment pass-through.

## Loader result

The fixture used Node `module.registerHooks({ resolve, load })` through
`--import`. It processed only manifest-listed TypeScript URLs, verified each
realpath and SHA-256 digest, allowed only recorded core edges and worker
entrypoints, and rejected dynamic import expressions, `require`, unlisted
edges/entries, `node:` imports, and digest changes.

Its TypeScript AST transform emitted synthetic core-local denial bindings and
rewrote ambient identifier references, including `globalThis`, to them. Worker
`Date`, `performance`, `process`, and timer globals worked before core import.
Inside transformed core, direct/computed ambient access, `Math.random`,
`eval`, `Function`, timers, and WebAssembly threw. The hostile local SHA-256
adapter constructor probe was rejected by `--disallow-code-generation-from-strings`.

## Coverage result

The passing command shape is:

```bash
/runner/node_modules/.bin/c8 --all --extension .ts --100 \
  --src /sandbox/pnh/core \
  --temp-directory /tmp/coverage \
  --reporter text --reporter json-summary \
  node --import /runner/tsx-preload.mjs \
  --import /sandbox/pnh/harness/core-loader-preload.mjs \
  --test /sandbox/pnh/tests/coverage.test.mjs
```

The partial run executed one branch in `loaded.ts` and did not import
`unloaded.ts`. It failed at `--100` with original TypeScript attribution:

```text
All files    | 33.33 | 60 | 37.5 | 33.33
dep.ts       | 100   | 100 | 100  | 100
loaded.ts    | 30.76 | 66.66 | 33.33 | 30.76
unloaded.ts  | 0     | 0 | 0 | 0
```

The full run executed both branches and the previously unloaded file. It
passed at `100/100/100/100` over `dep.ts`, `loaded.ts`, and `unloaded.ts`.

Absolute `--include /sandbox/pnh/core/*.ts` patterns matched no remapped
`file:///...` V8 URLs and let `--100` pass vacuously with zero files. The
implementation must use `--all --src /sandbox/pnh/core` and assert that the
summary includes a loaded original TypeScript file with nonzero coverage.

## Boundary result

1. Worker globals work before core load; the transform is core-scoped.
2. Dynamic import, `require`, `node:` import, unlisted edge/entry, and digest
   mismatch fail closed; two calls use different child PIDs.
3. Local JSON fixture descriptors materialize null-prototype, inherited, and
   accessor records in the worker. No host object or callback enters core.
4. The container had no inherited sentinel environment variable or host
   sentinel file, no Docker socket, no writable PNH mount or root, and no
   network access.

## Outcome

The Docker core-loader acceptance gate is satisfied. Task 3 implementation is
still not authorized. Preserve the pinned Docker policy, AST transform,
manifest/digest checks, `--pids-limit 128`, and the c8 `--all --src` assertion.
Do not restore global stubs, a raw source prefix, SES, or `node:vm`.
