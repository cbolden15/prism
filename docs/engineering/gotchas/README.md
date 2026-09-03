# Gotcha registry

Non-obvious behaviors, sharp edges, and lessons learned belong here as they
are discovered.

## Registry

### BUILD-001: Composite build state can outlive cleaned output

**Symptom:** A package build exits successfully after deleting `dist/`, but a dependent package cannot resolve its declarations.
**Cause:** TypeScript's `tsconfig.tsbuildinfo` still marks the deleted outputs as current, so a composite `tsc -p` run skips emission.
**Fix:** Package clean scripts must remove both `dist/` and `tsconfig.tsbuildinfo` before compiling.
**Discovered:** 2026-08-30.

### TEST-001: c8 absolute source roots can match no files

**Symptom:** Tests pass, but `c8 --all` reports `0/0` files after source moves outside the test working directory.
**Cause:** With c8 12, an absolute `--src` launched from another repository subtree can leave the include glob with no matches.
**Fix:** Run c8 with the source directory as `cwd`, use `--src .`, and keep the include glob relative to that directory.
**Discovered:** 2026-08-30.

### CLI-001: The compatibility demo cannot share the human run formatter

**Symptom:** `prism:demo` gains a random run ID or human-oriented output, so its byte-identical compatibility test fails.
**Cause:** The supported `prism run` command persists records and exposes `Run: <uuid>`, while the historical demo contract is deterministic JSON with no local state.
**Fix:** Keep `prism:demo` on `dist/deterministic/run-prism-demo.js`; route the installed `prism` binary through the persisted human/JSON command contract.
**Discovered:** 2026-08-30.

### PROTO-001: General SDK helpers can move a wire-protocol pin

**Symptom:** Constitution protocol-pin checks fail even though no serialized frame field or version changed.
**Cause:** `packages/sdk/src/protocol.ts` is hashed as a complete schema source, so adding an unrelated export changes the pin.
**Fix:** Keep general JSON helpers in a sibling SDK module such as `json-value.ts`. Change the pinned protocol source only with an intentional protocol amendment.
**Discovered:** 2026-08-30.

### TEST-002: A resident live Ollama model can starve Docker gates

**Symptom:** Existing container tests stretch from seconds to their 20–60 second deadlines after live Ollama acceptance.
**Cause:** Ollama keeps the 9.3 GB `qwen2.5:14b` model resident for several minutes after the request, competing with Docker Desktop for local resources.
**Fix:** Run live acceptance after deterministic gates. Before retrying a Docker gate, use `ollama ps`, stop only the model loaded by the acceptance run, and remove only test containers created by the failed run.
**Discovered:** 2026-08-30.

### TOOL-001: CodeGraph indexing requires a different Node version

**Symptom:** `codegraph index` warns about Node 25+ and fails to open its WASM SQLite database when Prism's required Node 26.8.1 is active.
**Cause:** The current CodeGraph release has an upstream V8 WASM compiler issue on Node 25+ and recommends Node 22 LTS.
**Fix:** Keep every Prism install, build, test, and pack gate on Node 26.8.1. Run only the machine-local CodeGraph navigation index under Node 22, and never treat that index as product verification.
**Discovered:** 2026-08-30.

### NATIVE-001: A held parent descriptor does not prove its path is still attached

**Symptom:** Native creation succeeds after an ancestor of the requested authoring root is renamed, and the complete plugin appears below the moved path.
**Cause:** `fstat` proves that a held descriptor still names the same directory, but it does not prove that each original parent-to-child namespace edge still exists.
**Fix:** Retain the full descriptor and identity chain from `/` to the root parent. Revalidate every named edge before publication and immediately before success.
**Discovered:** 2026-08-30.

### NATIVE-002: Verifying an addon before `require()` leaves a load race

**Symptom:** The loader hashes one `.node` file, but a replacement at the same pathname executes after the final identity check.
**Cause:** `require()` opens the pathname again. The verified descriptor has already been closed, so verification and execution refer to different filesystem lookups.
**Fix:** Keep the verified descriptor open and call `process.dlopen()` through `/dev/fd/<n>` on macOS or `/proc/self/fd/<n>` on Linux. Module-resolution hooks do not observe this load, so packed audits must record `process.dlopen()` separately.
**Discovered:** 2026-08-30.

### BUILD-002: Mach-O Node addons require an LC_UUID load command

**Symptom:** A deterministic macOS `.node` bundle builds, but Node rejects it with `ERR_DLOPEN_FAILED` because the Mach-O image has no UUID.
**Cause:** Passing `-Wl,-no_uuid` removes the `LC_UUID` command required by the current macOS loader behavior.
**Fix:** Keep the normal linker UUID. Verify determinism by rebuilding and comparing the generated prebuild manifest instead of stripping the command.
**Discovered:** 2026-08-30.

### BUILD-003: Buildx local output exports the complete final stage

**Symptom:** A native prebuild output directory contains build-system files in addition to the expected `.node` asset.
**Cause:** `docker buildx --output type=local` exports the entire filesystem of the selected final stage.
**Fix:** End each prebuild target with a `scratch` export stage that copies only `prism_authoring.node` into the output tree.
**Discovered:** 2026-08-30.

### TEST-003: Directory timestamps make path-identity checks flaky

**Symptom:** `plugin check` intermittently reports `path-changed` when another test creates an unrelated temporary sibling.
**Cause:** Adding or removing a directory entry changes the parent directory's mtime or ctime even though its device, inode, mode, and pathname identity are unchanged.
**Fix:** Compare directory components by device, inode, and mode. Reserve size and timestamp comparisons for admitted files, and separately verify the plugin's closed entry set.
**Discovered:** 2026-08-30.

### TEST-004: New public-claim surfaces need constitution-container mounts

**Symptom:** Public-claim checks pass on the host but fail inside the constitution sandbox after a release-facing document is registered.
**Cause:** The sandbox mounts claim surfaces explicitly. A newly registered README or documentation directory is absent until the harness adds its read-only mount.
**Fix:** Whenever the public-claim manifest gains a surface, add the same path to the read-only mount list in `packages/runtime/test/sandbox/harness/run-sandbox.mjs`.
**Discovered:** 2026-08-31.

### RELEASE-001: Node has no portable atomic no-replace directory rename

**Symptom:** Candidate publication can overwrite or race with a destination created after a vacancy check.
**Cause:** Ordinary Node directory rename does not provide portable no-replace semantics, and placeholder-then-rename designs retain a check/use gap.
**Fix:** Use a private temporary helper for `renamex_np(RENAME_EXCL)` on macOS or `renameat2(RENAME_NOREPLACE)` on Linux, then verify the published inode. Never copy the helper into the candidate.
**Discovered:** 2026-08-31.

### RELEASE-002: A clean Git tree does not bind ignored package output to HEAD

**Symptom:** A candidate names the current commit but can package stale or concurrently changed `dist` bytes.
**Cause:** Git cleanliness ignores `dist`, and building in the source checkout leaves a race before later packages are packed.
**Fix:** Capture clean `HEAD`, create a private detached worktree at that commit, rebind workspace dependencies there, and build, pack, and assemble only from that tree.
**Discovered:** 2026-08-31.

### TEST-005: Isolated HOME hides Docker CLI plugins

**Symptom:** A clean-checkout Docker test falls back to the legacy builder and rejects `--provenance` even though Buildx works in the normal shell.
**Cause:** Buildx is often discovered below the operator HOME. Inherited Buildx selector variables can also bypass a temporary Docker config.
**Fix:** Create a plugin-only temporary `DOCKER_CONFIG`, link one effectively executable `docker-buildx`, and remove inherited `BUILDX_CONFIG`, `BUILDX_BUILDER`, and `BUILDKIT_HOST` from child gates.
**Discovered:** 2026-08-31.

### RUNTIME-001: Cleanup command failure can precede the authoritative receipt

**Symptom:** A failed plugin operation omits cleanup evidence even though the allocation later reaches a confirmed terminal state.
**Cause:** `handle.stop()` can reject or time out before the already-established exit promise publishes the authoritative lifecycle receipt.
**Fix:** After a stop failure, retain the receipt from the existing exit promise, attempt acknowledgement after terminal publication, and return that exact receipt without inferring cleanup success.
**Discovered:** 2026-09-02.

### TEST-006: Real-Docker test files contend under default file concurrency

**Symptom:** Host tests pass alone but fail or time out in the full suite while building images and operating Docker resources concurrently.
**Cause:** Node's test runner executes separate test files concurrently unless the command sets an explicit file-concurrency limit.
**Fix:** Run every real-Docker host-test file invocation with `--test-concurrency=1` and freeze the commands with compatibility coverage.
**Discovered:** 2026-09-02.

### TEST-007: Restrictive shell umask makes Docker plugin fixtures unreadable

**Symptom:** Docker-backed host tests return `code: "protocol"` with plugin `exitCode: 1`; running the fixture image directly reports that `/pnh/node_modules/@useprism/sdk/dist/protocol.js` cannot be loaded.
**Cause:** A shell umask of `077` makes TypeScript build directories and files owner-only. The fixture image copies those modes unchanged, so its non-root plugin user cannot traverse or read the SDK build.
**Fix:** Build and run the Docker-backed tests with `umask 022`, or normalize the copied SDK artifact modes before building the fixture image.
**Discovered:** 2026-09-03.

<!--
### CATEGORY-NNN: Title

**Symptom:** What is observed.
**Cause:** Why it happens.
**Fix:** What to do.
**Discovered:** YYYY-MM-DD.
-->
