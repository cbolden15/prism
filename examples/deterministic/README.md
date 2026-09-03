# Deterministic CLI example

This is the canonical first run. It needs no provider account, API key, model,
daemon, or Docker. Installing from npm needs network access; the commands after
installation do not.

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

The first output line is `3 words`. A later line begins with `Run:` and carries
the ID accepted by `prism inspect`. The stored run record contains the goal and
final answer, so treat it as sensitive local operator data.

Next, read [Getting started](../../docs/developer-preview/getting-started.md)
for release-tarball acceptance and the optional Ollama path.
