# Task 3 SES acceptance-gate result

Status: BLOCKED

Date: 2026-08-19

Scope: Task 3's acceptance gate only. The probes ran in disposable `/tmp`
fixtures, which were removed after the run. No PNH implementation files,
dependencies, lockfile entries, tests, commits, or pushes were added to the
repository.

## Pinned probe environment

- Node `22.21.0`
- `ses` `2.3.0`
- `@endo/bundle-source` `4.3.2`
- `@endo/import-bundle` `1.7.0`
- `c8` `12.0.0`
- `tsx` `4.19.2`

## Isolation results

Passed under a Node process preloaded with `import "ses"; lockdown()` before
`tsx` and `node:test`:

- A bundled TypeScript module could not read `process.env`.
- A host callback's `.constructor` could not recover the host `process`.
- Host ordinary and null-prototype records retained the expected prototype
  identity in the SES compartment.
- Dynamic `import("node:fs")` rejected at execution.

## Required coverage proof — failed

The exact threshold command was:

```bash
npx c8 --all --extension .ts --100 --include 'core/**/*.ts' \
  --reporter text --reporter text-summary \
  node --import ./preload.mjs --import tsx --test test/coverage.test.ts
```

The bundled test itself passed after executing `core/loaded.ts`'s `branch(true)`
path. c8 listed the original `.ts` paths, but reported all of them as 0%,
including the executed `loaded.ts`:

```text
All files    |       0 |        0 |       0 |       0
loaded.ts    |       0 |        0 |       0 |       0 | 1-3
unloaded.ts  |       0 |        0 |       0 |       0 | 1-3
```

The command exited 1 because the required `--100` thresholds failed. This does
not prove coverage of compartment-executed TypeScript and therefore cannot
credit C19.

## Required next decision

Task 3's stop condition applies: do not weaken the coverage check or replace
SES with `node:vm`. The next design must be the OS-sandboxed subprocess or
container approach, with an independently proven coverage collector, and needs
explicit approval before planning or implementation.
