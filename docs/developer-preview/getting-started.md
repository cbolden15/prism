# Getting started

Prism 0.1.0 is a public developer preview distributed through the npm registry.
Use Node.js 26.8.1 and npm 11.19.0.

## Deterministic first run

The deterministic path needs no provider account, credential, model, daemon,
or Docker. Registry installation needs network access; the commands after
installation do not. Install the CLI in a blank project.

```sh
mkdir prism-first-run
cd prism-first-run
npm init -y
npm install --save-dev @useprism/cli@0.1.0
./node_modules/.bin/prism init --provider deterministic --scope project --yes
./node_modules/.bin/prism doctor
RUN_OUTPUT="$(./node_modules/.bin/prism run 'Count the words in: one two three')"
printf '%s\n' "$RUN_OUTPUT"
RUN_ID="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$RUN_ID"
```

The first output line is `3 words`; the next line carries the run ID. The
inspect command returns the local record for that ID. Legacy records keep the
goal and final answer, so treat them as sensitive local operator data.

## Deterministic tarball acceptance

Registry installation is the normal path. To verify an extracted release
candidate without registry access, create `first-run` inside the candidate so
`../packages` holds its four package tarballs.

```sh
mkdir first-run
cd first-run
npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz
./node_modules/.bin/prism init --provider deterministic --scope project --yes
./node_modules/.bin/prism doctor
RUN_OUTPUT="$(./node_modules/.bin/prism run 'Count the words in: one two three')"
RUN_ID="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$RUN_ID"
```

## Deterministic project plugin workflow

The complete source, test, manifest, proposal assertion, and approval flow live
in the [project-plugin example](../../examples/project-plugin/README.md). Read
the source first. `plugin check` executes the plugin with the launching user's
ambient filesystem, network, process, and other host access.

From `first-run` inside an extracted candidate:

```sh
./node_modules/.bin/prism plugin create release-slug
cp ../examples/project-plugin/release-slug/index.mjs prism-plugins/release-slug/index.mjs
cp ../examples/project-plugin/release-slug/index.test.mjs prism-plugins/release-slug/index.test.mjs
cp ../examples/project-plugin/release-slug/manifest.json prism-plugins/release-slug/manifest.json
node --test prism-plugins/release-slug/index.test.mjs
./node_modules/.bin/prism plugin check prism-plugins/release-slug
./node_modules/.bin/prism plugin declare prism-plugins/release-slug --operation slugify
./node_modules/.bin/prism plugin approval --json > approval.json
```

`approval.json` is a non-executing proposal, not approval state. Verify its
declaration, identity, operation, component commitments, warning, and
`approvalDigest` before approval. The example shows the exact assertion and
the remaining commands. The final inspection returns a
`prism-run-record-v3` record.

## Optional Ollama first run

Use this path only after the deterministic path. It requires an already running
Ollama service at the loopback endpoint and an already installed `qwen2.5:14b`
model. Prism does not install models for this flow.

If the project declaration from the previous workflow is still present, pass
`--no-plugin` for this repository-tool example. Prism prints the expected
`project-plugin-disabled` warning and writes a legacy run record.

```sh
./node_modules/.bin/prism init --provider ollama --model qwen2.5:14b --endpoint http://127.0.0.1:11434 --scope project --yes
./node_modules/.bin/prism doctor
printf '%s\n' 'The Prism packed acceptance marker is indigo-orbit-47.' > FACTS.md
OLLAMA_OUTPUT="$(./node_modules/.bin/prism run --no-plugin 'Find the Prism packed acceptance marker and name its file.')"
printf '%s\n' "$OLLAMA_OUTPUT"
OLLAMA_RUN_ID="$(printf '%s\n' "$OLLAMA_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$OLLAMA_RUN_ID"
```

Project-plugin admission is provider-neutral: an Ollama project execution uses
the same admitted Tool interface as the deterministic project workflow. This
path still needs the configured local service and model described above.

The repository tool is read-only and bounded to the selected workspace. It is
not a confidentiality boundary: the selected local model receives the prompt
and repository content read for that execution.

For a non-loopback endpoint, `init` needs `--yes` plus
`--allow-remote-endpoint <origin>` whose normalized value exactly matches the
endpoint origin. Pass that same exact origin to `prism doctor` and `prism run`.

## Next paths

- [Architecture](../architecture/README.md)
- [Command reference](command-reference.md)
- [Compatibility](compatibility.md)
- [Examples](../../examples/README.md)
- [Local data and trust](data-and-trust.md)
