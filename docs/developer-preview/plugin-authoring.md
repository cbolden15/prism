# Plugin authoring

Plugin authoring is limited to one local tool scaffold. It has no discovery,
installation, registry search, update, signing, trust inheritance, or
publication flow.

## Create and check a tool plugin

The default managed root is `prism-plugins` under the current directory. An
authoring scaffold has exactly four files: `README.md`, `index.mjs`,
`index.test.mjs`, and `manifest.json`.

```sh
./node_modules/.bin/prism plugin create packed-tool
node --test prism-plugins/packed-tool/index.test.mjs
./node_modules/.bin/prism plugin check prism-plugins/packed-tool
```

Creation refuses an occupied destination. An existing root must already be a
valid managed root; unmanaged roots are refused rather than claimed. There is
no overwrite mode.

The four authoring files are not the runtime closure. `README.md` and
`index.test.mjs` are authoring sidecars. `manifest.json` and the runtime files
named by `manifest.files` define the runtime closure that can be captured and
admitted. In the `release-slug` workflow that closure is only `index.mjs`.

Static closure validation accepts only declared `.mjs` runtime files, an
entrypoint that is declared and reachable, and static relative imports or
re-exports that resolve exactly to another declared runtime file. Exact `node:`
specifiers are allowed only when they are in the code-owned allowlist, which is
empty for this slice. Validation rejects bare specifiers, absolute paths,
Windows paths, URL specifiers, query or fragment suffixes, path escapes,
unresolved imports, dynamic `import()`, `require`, `import.meta`, invalid module
syntax, and declared runtime files unreachable from the entrypoint.

The generated scaffold is authoring-focused: it exports `handle` for its sidecar
test and `plugin check`. A runtime-ready entrypoint must also service Prism's
bounded NDJSON request loop. The complete `runToolLoop` example is in
[getting started](getting-started.md#deterministic-project-plugin-workflow).

Any later runtime-closure mutation needs reapproval before normal admission.
There is no direct execution bypass.

<!-- pnh:limitation:PNH-CLAIM-20:begin -->
`plugin check` executes plugin code with ambient host authority and is
not a sandbox. It validates one authoring fixture, the static contract, the
bounded child execution, and original process-group cleanup. A passing check
does not prove safety, installation, trust, Runtime admission, or control of
deliberately detached descendants.
<!-- pnh:limitation:PNH-CLAIM-20:end -->

## Declare and admit a project tool

After the fixture test and check pass, declare it from its workspace-relative
path:

```sh
./node_modules/.bin/prism plugin declare prism-plugins/release-slug --operation slugify
./node_modules/.bin/prism plugin approval --json
```

Declaration records project intent only. Approval preview captures and validates
the runtime closure without importing or executing plugin code. Read its exact
bytes and commitments before using `plugin approve --digest`; a direct execution
bypass does not exist. The normal `prism run` route is the only route that asks
Runtime to admit and run the project plugin.

Any source, manifest, operation, declared path, project tool configuration,
registry, Runtime runner, image, profile, or approval binding mutation makes the
old approval unusable. Run `plugin approval --json`, review the changed proposal,
and explicitly reapprove its new digest. This is reapproval. `plugin revoke`
removes the current approval; `plugin undeclare` removes project intent. Neither
command makes an artifact executable on its own.
