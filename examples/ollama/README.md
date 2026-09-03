# Ollama example

Use this after the deterministic path. It needs a running Ollama service at
`http://127.0.0.1:11434` and an already installed `qwen2.5:14b` model. Prism
does not install or pull the model.

```sh
./node_modules/.bin/prism init --provider ollama --model qwen2.5:14b --endpoint http://127.0.0.1:11434 --scope project --yes
./node_modules/.bin/prism doctor
printf '%s\n' 'The Prism packed acceptance marker is indigo-orbit-47.' > FACTS.md
OLLAMA_OUTPUT="$(./node_modules/.bin/prism run --no-plugin 'Find the Prism packed acceptance marker and name its file.')"
printf '%s\n' "$OLLAMA_OUTPUT"
OLLAMA_RUN_ID="$(printf '%s\n' "$OLLAMA_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$OLLAMA_RUN_ID"
```

The repository tool is read-only and bounded to the selected workspace. It is
not a confidentiality boundary. The selected model receives the prompt and
repository content read for the run. A non-loopback endpoint needs explicit
origin authorization; see [Getting started](../../docs/developer-preview/getting-started.md#optional-ollama-first-run).
