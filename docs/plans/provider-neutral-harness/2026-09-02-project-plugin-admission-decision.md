# Project-pinned tool plugin admission

Status: accepted for agent-config issue 65
Date: 2026-09-02
Decision scope: the developer-preview CLI and existing local spawn Runtime

## Context

Prism can create and check a tool plugin, but `plugin check` is only a diagnostic. It executes the plugin with ambient host authority and does not install, approve, or admit it. The CLI has no project plugin declaration or local approval store, and normal runs cannot use a project-authored plugin.

Runtime already has the identity and launch seams this feature needs:

- normalized manifest, source, registry, version, runner, image, and profile digests;
- generated registry admission against an exact owner pin;
- a branded `OwnerApprovedAdmissionTicket`;
- commitment re-derivation before owner-approved spawn;
- bounded coordinator, policy, tool-operation, and cleanup receipt paths.

This slice must compose those seams. It must not create a second trust model or describe the ambient subprocess as a sandbox.

## Decision

Add a project-admission adapter in the CLI. Project configuration records intent, a separate per-user record records approval, and a CLI-managed artifact records the exact bytes Runtime may admit. Runtime remains unaware of workspaces, XDG state, and user approval files.

The first slice has these limits:

- Exactly one active project declaration, represented by one object rather than an array.
- Only a `kind: "tool"` manifest with no plugin dependencies is admissible.
- No user-global plugins, discovery, search, registry installation, updates, signing, publication, or non-tool plugin kinds.
- The mandatory provider is deterministic and offline. Ollama may use the same admitted tool adapter, but no live Ollama call is part of acceptance.

### Forward-compatible composition seam

Issue 65 does not add profiles or a public composition-plan schema. Before a run starts, the CLI resolves its fixed inputs once into a private frozen `ResolvedProjectToolRun` value. It names the trusted in-process provider, policy, and persistence adapters; the one admitted out-of-process tool; exact identity commitments; operation contract; limits; and ambient-authority boundary. Editable config, approval-store paths, and discovery functions are not part of that value.

The participant set is sealed before the provider receives the goal. Runtime receives validated values and a genuine owner-approved ticket, not editable config or a package name to resolve. No participant may be installed, discovered, replaced, or added after sealing. The existing protocol registration handshake may validate the already-sealed plugin and exact operation, but it cannot expand either. This private one-tool value is the narrow precursor to a future canonical composition plan, but it gets no independent plan digest or profile grammar in this slice.

The DSH-inspired follow-on seams are preserved without implementing their roadmap:

| Future pattern | Issue 65 seam | Explicit deferral |
| --- | --- | --- |
| Reversible resource ownership | `withOwnerApprovedSpawnPlugin` remains the single subprocess owner, and persistence waits for its authoritative receipt. | No general resource-scope abstraction. |
| Typed scoped events | `runAgent` retains its closed typed events; run-record v3 is a separate sanitized projection. | No event bus, observers, or authority-changing event handlers. |
| Frozen composition plans | Resolution produces one private immutable run input with a sealed participant set. | No editable profile, bundle, general graph compiler, or public plan schema. |
| Deterministic inspection | Approval preview derives the exact component commitments from captured bytes without executing, approving, or writing an artifact. | General composition inspection comes after issue 65. |
| One-shot action approval | The sequence leaves a boundary between policy/grant derivation and execution. | No interactive or per-action approval; durable plugin-identity approval remains the only approval here. |

Authority order stays explicit: validate request, resolve admitted identity, make the policy decision, derive bounded authority, execute through the declared tool boundary, validate result and cleanup, then persist sanitized evidence. A later one-shot approval may only narrow authority between grant derivation and execution. It may not reorder these stages or convert denial into permission.

### Project declaration

Keep `.prism/config.json` and `prism-config-v1` valid and unchanged. Add a separate project configuration file, `.prism/tool-plugin.json`, with exact-key schema `prism-project-tool-plugin-v1`:

```json
{
  "version": "prism-project-tool-plugin-v1",
  "path": "prism-plugins/release-slug",
  "operation": "slugify"
}
```

Provider, model, and endpoint resolution retain their current precedence. A project-declaration reader loads the exact declaration bytes independently of provider resolution. It runs even when the existing provider resolver would short-circuit for an explicit `--provider`, `--model`, or endpoint option. Explicit provider options never suppress a declaration. A declared plugin that cannot be resolved is a typed closed failure, not a fallback to a no-plugin run.

The declaration exists only at that exact project path. No user-level location is read. The plugin path uses normalized `/`-separated relative segments. Absolute paths, drive prefixes, backslashes, empty segments, `.` or `..` segments, control characters, symlinked components, and any canonical path outside the workspace are rejected. The first slice accepts only the literal operation `slugify`, with exact input `{ "title": string }` and exact output `{ "slug": string }`; both strings are byte-bounded and the output must match Prism's slug grammar.

`prism plugin declare <workspace-relative-path> --operation slugify` requires an existing `.prism/config.json`. A missing config fails with a typed message directing the user to run `prism init --scope project --provider deterministic`. The command writes only `.prism/tool-plugin.json` atomically and never writes approval. A second declaration replaces project intent but immediately leaves the project unapproved because the exact project tool-config digest changes. `prism plugin undeclare` atomically moves that file out of its lookup path before deleting it; previous Prism versions continue to read the untouched v1 provider config whether the declaration file exists or not.

Normal `prism run` fails closed when a declaration exists without a matching local approval. `prism run --no-plugin` is the explicit collaborator and CI opt-out: it emits a typed warning, ignores the declaration for that run, and cannot execute or emit evidence for the project plugin. It is forbidden in the packed plugin acceptance. Blindly piping an unexamined proposal into approval is an unsupported anti-pattern.

The packed gate uses the normal commands with no test-only bypass. It creates and tests its own fixture under private temporary HOME/XDG roots, parses `plugin approval --json`, asserts the expected temporary workspace binding, project tool-config digest, plugin ID, operation, digest shapes, and ambient-authority warning, then passes only that asserted `approvalDigest` to `plugin approve --digest`. CI may use this pattern only for code and expected commitments owned by the gate; executing an arbitrary committed project plugin still requires an owner-reviewed proposal.

### Per-user approval

Approval uses a separate exact-key schema, `prism-project-plugin-approval-v1`. One record exists per canonical workspace at:

```text
$XDG_CONFIG_HOME/prism/plugin-approvals/v1/<workspace-key>.json
```

`<workspace-key>` is SHA-256 over the canonical workspace string and is only a lookup key. The record contains:

```json
{
  "version": "prism-project-plugin-approval-v1",
  "workspace": "/canonical/workspace",
  "projectConfigDigest": "<sha256 of exact .prism/tool-plugin.json bytes>",
  "declaredPath": "prism-plugins/release-slug",
  "canonicalPluginPath": "/canonical/workspace/prism-plugins/release-slug",
  "operation": "slugify",
  "plugin": {
    "id": "release-slug",
    "manifestDigest": "<sha256>",
    "sourceDigest": "<sha256>",
    "registryDigest": "<sha256>",
    "versionDigest": "<sha256>",
    "runnerDigest": "<sha256>",
    "imageDigest": "<sha256>",
    "profileDigest": "<sha256>"
  },
  "approvalDigest": "<sha256>"
}
```

The human-facing `approvalDigest` is:

```text
sha256(JSON.stringify([
  "prism-project-plugin-approval-digest-v1",
  canonicalWorkspace,
  projectConfigDigest,
  declaredPath,
  canonicalPluginPath,
  operation,
  pluginId,
  manifestDigest,
  sourceDigest,
  registryDigest,
  versionDigest,
  runnerDigest,
  imageDigest,
  profileDigest
]))
```

It is one compact confirmation over both local authorization context and Runtime identity. Here `projectConfigDigest` means the exact separately versioned project tool configuration at `.prism/tool-plugin.json`; unrelated provider, model, and endpoint settings are not part of plugin identity. The fields remain separate and inspectable. `plugin check --json` reports the Runtime commitments and ambient-authority warning. After declaration, the non-executing `prism plugin approval --json` command reports the canonical path, project tool-config digest, operation, every Runtime commitment, and the final approval digest.

`prism plugin approve --digest <approvalDigest>` reads the declaration, resolves the canonical path, performs static closure validation, derives every commitment again, and requires the supplied digest to match. It does not import or execute plugin code. It writes the artifact first and the owner-only approval record last, using the existing atomic JSON writer and restrictive directory and file modes. There is no `--yes`, implicit approval, inherited approval, or digest rewrite.

`plugin check` remains an explicitly warned execution diagnostic, not the source of approval authority. The packed acceptance runs it because the fixture author owns the code. A user evaluating unknown code can run `plugin approval --json` and approve without executing it first.

`prism plugin revoke` atomically moves the active approval record out of its lookup path before deleting it. Revocation takes effect even if final tombstone cleanup fails. Artifacts may remain as inert cache entries because no artifact can execute without a matching active approval. Approvals do not expire automatically; explicit revoke or any binding change invalidates them. Automatic artifact garbage collection is deferred.

Approval writes, revocation, and the final approval recheck plus plugin operation share one private per-workspace lock. The operation holds that lock through its authoritative Runtime receipt, so a successful revoke linearizes before or after execution and never reports success while a previously approved plugin process is still active. Contention is bounded and fails closed; lock files are identity-checked and never stolen. This does not add cancellation or one-shot approval semantics.

Approval reads fail closed unless the file is regular, each Prism-owned parent is a directory, the path is symlink-free, the entries are owned by the current user, and none is group- or world-writable. Artifact reuse applies the same ownership, type, symlink, and write-permission checks. This approval feature is POSIX-only in the first slice; Windows returns `project-plugin-unsupported-platform` before reading or writing approval state, while existing v1 no-plugin commands continue to work. Tests always redirect HOME and XDG roots to private temporary directories.

A clone at another path fails because its canonical workspace does not match. A second user fails because the approval store is per-user. A source, manifest, operation, path, project tool configuration, Runtime runner, registry environment/catalog, or spawn-profile change fails until the user reviews the new proposal and explicitly confirms its digest. Provider, model, and endpoint edits do not invalidate plugin identity approval; a future whole-plan approval may bind them. The mechanism proves confirmation of the displayed context and commitments, not source-code review.

### Authoring tree and runtime closure

Keep manifest API version 1 and its existing digest algorithms. For an admissible project tool, `manifest.files` is the runtime source closure. The first slice keeps Runtime's flat-file contract and accepts only `.mjs` runtime files. The entrypoint must be present, and all declared runtime files must be reachable from it.

New scaffolds still write `README.md`, `index.mjs`, `index.test.mjs`, and `manifest.json`, but only `index.mjs` is declared in `manifest.files`. Change `packages/sdk/src/authoring.ts` so scaffold validation treats the two fixed authoring sidecars separately from `manifest.files` while preserving the exact four-file scaffold and all current byte bounds. The CLI's native addon still receives the same sorted four names and contents, so `packages/cli/native/prism_authoring.cc`, its six prebuild binaries, and `prism-native-authoring-prebuilds-v1` do not change. SDK, native loader, native contract, plugin-create, and packed tests must prove this parity; any unexpected C++ source edit instead requires rebuilding all six prebuilds and regenerating their manifest before release.

The static authoring checker accepts exactly the manifest, declared files, `README.md`, and the generated entrypoint test sidecar. Existing v1 scaffolds that declared README and test files remain checkable for compatibility, but they are not admissible until their manifest names a valid runtime-only closure.

`acorn@8.18.0` plus `acorn-walk@8.3.5` are the selected production parser and traversal. They are MIT-licensed and total about 620 KB unpacked. Every captured runtime file is parsed from memory with `ecmaVersion: 2025` and `sourceType: "module"`, then the full AST is walked rather than scanning source text. This deliberately accepts a conservative ECMAScript subset supported by Prism's required `>=26.8.1 <27` Node engine and keeps approval preview free of temporary files or code execution. Both dependencies still must pass the packed offline gate.

The closure accepts only:

- static relative imports or re-exports that resolve exactly to another declared `.mjs` file;
- exact `node:` specifiers in a code-owned allowlist, which is empty for this first workflow.

It rejects bare specifiers, absolute and Windows paths, URL schemes including `file:`, query or fragment suffixes, path escapes, unresolved imports, dynamic `import()`, `require`, `import.meta`, invalid module syntax, and a declared file that is unreachable from the entrypoint. Plugin-to-plugin manifest dependencies remain empty and are not JavaScript module resolution.

This is an import-closure and content-identity rule, not a hostile-code boundary. JavaScript still runs as a local subprocess with ambient host filesystem, network, process, and inherited-user authority. Static import validation does not make `eval`, globals, native behavior, or other same-process capabilities safe.

### Digest-addressed artifact

Static inspection captures the manifest and runtime file bytes through bounded, no-symlink reads. Factor the existing domain-separated source, spawn-artifact, descriptor, and registry encodings behind shared pure byte-input helpers; the current on-disk SDK and Runtime functions delegate to those helpers and retain identical outputs. `plugin approval --json` uses the captured bytes and trusted installed runner/profile bytes, so it does not import, execute, approve, or materialize the plugin.

Only a matching `plugin approve --digest` or an approved run repairing cache may materialize. The materializer writes the captured bytes into a private sibling staging directory, then verifies the same commitments against that exact tree before publishing it. Runtime admission independently re-derives them from the published artifact. No parallel digest formula is introduced.

The final layout is:

```text
$XDG_STATE_HOME/prism/plugin-artifacts/v1/<registryDigest>/
  registry.json
  plugin-pins.json
  plugins/
    <plugin-id>/
      manifest.json
      <every manifest.files entry>
```

The plugin directory has Runtime's exact listing. README, tests, fixtures, and artifact metadata stay outside it. The generated pin file uses the existing `pnh-plugin-pins-v1` schema and contains the one manifest/source pair that the user approved. The final address is the existing `registryDigest`, which folds the registry environment and capability catalog around the descriptor's existing content and spawn commitments. No second materialization digest is added.

Every check, approval preview, approval write, and run generates the registry with these fixed inputs:

```json
{
  "environment": "production",
  "capabilityCatalog": {
    "version": "pnh-capability-catalog-v1",
    "capabilities": [
      {
        "id": "tool-operation",
        "limit": {
          "schema": "boolean-gate",
          "version": "pnh-capability-limit-v1",
          "enabled": true
        }
      }
    ]
  }
}
```

These values are code-owned constants, not project options. A future environment or catalog change alters `registryDigest` and therefore requires explicit reapproval.

The materializer re-hashes and validates the completed staging tree before an atomic rename. An exclusive lock file keyed by `registryDigest` serializes writers. A concurrent loser validates and reuses the winner. If an existing destination fails validation, the lock holder atomically renames it to a random quarantine name, installs a freshly validated stage, and removes only that quarantined cache entry. The sequence has bounded lock acquisition and one replacement retry. Digest addressing detects mutation but does not make same-user files immutable.

The artifact is cache, not authority. If it is missing while config, declaration, authoring bytes, and approval all still match, the run rematerializes it from the already captured approved bytes, validates it against the approval, and continues without reapproval. A mutated artifact follows the same quarantine-and-rebuild path. Changed authoring bytes or approval context still fail closed and are never used to repair an approved artifact.

### Admission and execution

Every run fails closed in this order:

1. Parse arguments, canonicalize the workspace, and independently validate the exact provider config and project tool-config bytes, regardless of provider overrides. Honor `--no-plugin` only as an explicit no-execution branch.
2. Resolve and contain the declared path without following a symlinked path component.
3. Load the per-user approval and match workspace, project tool-config digest, relative path, operation, and canonical plugin path.
4. Inspect the authoring bytes and import closure without importing or executing them.
5. Derive the candidate registry and all commitments from captured bytes through the shared pure helpers; compare every field and `approvalDigest` with the approval record.
6. Validate or safely rematerialize the durable digest-addressed artifact, generated registry, and generated owner pin against the same approved values.
7. Call `admitPinnedRegistryBytes`, then use its genuine `OwnerApprovedAdmissionTicket` with `withOwnerApprovedSpawnPlugin` and the artifact plugin root.
8. Run the configured operation through `runAgent`, its bounded limits, an in-process policy that permits only the one approved plugin/operation, an adapter that rejects any input outside the exact `slugify` contract before spawn, and `runToolOperation`. Validate the plugin result before returning it to the provider.
9. Await the authoritative lifecycle receipt, including late terminal publication and acknowledgement, before persisting the result.

No plugin process starts before step 7. Admission mismatch, missing approval, closure failure, source mutation, artifact mutation, or runner/profile drift produces a typed failure and an empty execution trace.

The deterministic provider remains a normal `runAgent` provider port. For the acceptance goal it requests the configured `release-slug.slugify` operation with `{"title":"Preview First"}`, receives the validated JSON result, and returns `preview-first`. It cannot call the plugin around the coordinator, policy, input/output validators, or owner-approved spawn path. The optional Ollama provider receives the same fixed tool definition and invokes the same adapter, so model-selected arguments cannot exceed the bounded title-only contract.

### Persisted evidence

Keep run records v1 and v2 readable. Add exact-key `prism-run-record-v3` for project-plugin runs. It records:

- project tool-config digest, plugin ID, approval digest, registry identity, and every underlying Runtime commitment;
- the explicit boundary values `executor: "spawn"`, `authority: "ambient-host"`, `sandboxed: false`, and `claim: "identity-and-owner-approval"`;
- bounded coordinator limits, usage, typed events, and a measurement-only trace containing operation names and byte/count measurements;
- the validated terminal answer or a closed failure code;
- sanitized cleanup evidence: trigger, exit code, OOM state, `confirmedAbsent`, cleanup-error count, and settlement timing.

The v3 run record does not contain canonical workspace or plugin paths, raw tool input, raw plugin output, raw plugin errors, stderr, cleanup error strings, environment values, or provider prompts. The terminal answer is the coordinator's validated final answer, not the raw plugin response. The local approval record necessarily retains canonical paths for authorization, but `inspect --json` does not expose them. Input reconstruction is deliberately traded for privacy; the fixed operation schema, bounded byte counts, policy event, and cleanup receipt prove the accepted shape and execution path without storing the title.

## Options considered

### Execute the mutable authoring tree and store approval in config

Rejected. It mixes project intent with owner approval, makes approval cloneable, includes authoring sidecars in Runtime's exact tree, and leaves a wider check-to-use window.

### CLI project adapter plus digest-addressed artifact

Chosen. It satisfies the project and per-user boundaries while preserving Runtime's existing brands and commitment model. Provider config remains v1, older clients ignore the separate declaration file, and rollback can run `plugin undeclare` before removing the new CLI. Approval and artifact state can then be ignored.

### Recommended follow-on: sealed composition graph

After this one-tool path is stable, compile ergonomic profiles into one canonical, inspectable graph of trusted in-process adapters and admitted out-of-process tools. Bind approval to the graph digest and its exact component commitments, then give Runtime only an opaque validated plan. Package discovery, profile interpretation, and participant mutation remain outside Runtime and outside the active run.

Pending: a separate decision on profile grammar, canonical encoding, graph dependencies, adapter identities, plan-version migration, and whether durable identity approval binds a whole plan or its component lattice. None is required to implement issue 65.

### Best architecture: sealed capability-isolated plugin fabric

This would add signed or locked composition records, immutable artifact handles in the supervisor, and process, WASM, container, or microVM boundaries with independently mediated filesystem, network, process, credential, and resource capabilities. Trusted policy, provider, and persistence adapters would still not share a universal dynamic loader with untrusted tools.

Pending: a cross-platform immutable/open-by-handle design, boundary-specific capability enforcement, and a separate owner decision about hostile-code isolation. It is not selected here because issue 65 explicitly targets the ambient local spawn Runtime and forbids presenting it as a sandbox. Adding workspace and XDG semantics to Runtime now would also duplicate the CLI's authorization role instead of strengthening the requested identity boundary.

### Bundle the plugin into one generated module

Rejected. A bundler adds a second build identity, version/config commitments, and source-map policy while hiding the declared import graph that this slice must expose.

## Implementation slices

1. Source identity foundation: update SDK scaffold/sidecar validation, add AST-based ESM closure validation, factor shared pure byte-input commitment helpers, and prove digest parity plus unchanged native four-file/prebuild contracts.
2. Project admission: add the separate project tool configuration independent of provider overrides, declare/undeclare grammar, explicit `--no-plugin`, canonical containment, approval preview/approve/revoke paths, digest-addressed materialization, POSIX ownership checks, and compatibility tests.
3. Admitted run: resolve one private frozen run input, compose existing Runtime admission/spawn/tool seams with `runAgent`, add v3 records and inspection, and prove the sealed participant set and cleanup on success and failure.
4. Packed workflow and docs: install tarballs offline, run project `init`, create/test/check/declare/approval-preview/assert/approve/run/inspect `release-slug`, add mutation and import negatives, and document deterministic and optional Ollama paths.
5. Release: verify native prebuild integrity, run Node.js 26.8.1 gates, obtain independent read-only review and private CI, then prove reviewed-SHA merge-tree identity and post-merge CI while X1 stays disabled.

The coordinator owns integration, schema compatibility, full suites, git, remote state, and release evidence. Workers may own disjoint implementation or review files, but they do not commit, push, alter GitHub settings, use real user XDG state, or run X1/B4 infrastructure.

## Verification map

| Claim | Required proof |
| --- | --- |
| Project-only, one-plugin scope | unchanged v1 config and older-client tests; exact declaration path; explicit-provider preservation; `--no-plugin`; array, second-plugin, and non-tool rejection |
| Exact path binding | canonical containment, traversal, absolute path, symlink root/component/file, clone, second-user, and unsupported-Windows tests |
| Exact runtime closure | valid transitive imports; bare, absolute, URL, escape, unresolved, dynamic, `require`, `import.meta`, invalid syntax, unreachable, undeclared, and sidecar-exclusion tests |
| Explicit local approval | static preview without execution or artifact writes; missing/revoked approval; project tool-config, source, runner/profile, and registry-constant mutation; provider-config non-invalidation; wrong digest; atomic write; ownership/mode; and explicit reapproval tests |
| Runtime seam reuse | byte-helper parity with existing disk digests; generated registry/pin admission; genuine ticket; sealed participants; owner-approved spawn; policy decision; bounded tool call; and no-spawn-on-mismatch tests |
| Evidence and privacy | v1/v2 compatibility; v3 exact-key validation; commitment, boundary, terminal, measurement, and cleanup assertions; forbidden raw/path scans |
| Installed workflow | fresh offline tarball install, project init, asserted approval proposal, and exact `Preview First` to `preview-first` acceptance without `--no-plugin` or a test-only bypass in `npm run pack:check` |
| Release | `npm test`, `npm run pack:check`, `npm run check:release:clean`, process/container residue checks, private CI, independent review, and merge-tree identity |

## Consequences

Approval is intentionally invalidated by exact project tool-config edits, registry environment/catalog edits, and Runtime upgrades, even when plugin source is unchanged. Provider settings are outside this component-level approval. This costs an explicit reapproval when the approved component changes but keeps its path, operation, bytes, and launch implementation aligned.

The artifact store is local cacheable state, not a package registry. There is no discovery or update protocol. Clearing it does not revoke approval and triggers safe rematerialization only from still-approved bytes. Rollback first undeclares with the new CLI, then removes only issue-owned product commits; existing v1 config, endpoint trust, v1/v2 run records, and the quarantined private remote remain valid.
