# @useprism/cli

The `prism` command for the Prism 0.1.0 developer preview. It provides local
configuration, diagnostics, deterministic and Ollama runs, run inspection, and
the project-pinned tool-plugin workflow.

## Install

Install the CLI locally in a project:

```sh
npm install --save-dev @useprism/cli@0.1.0
```

Node.js 26.8.1 and npm 11.19.0 are the tested toolchain.

## Deterministic first run

```sh
./node_modules/.bin/prism init --provider deterministic --scope project --yes
./node_modules/.bin/prism doctor
./node_modules/.bin/prism run 'Count the words in: one two three'
```

The deterministic path needs no provider account, credentials, model, daemon,
or Docker after installation. Ollama is optional and requires an
operator-managed endpoint and model.

## Trust boundary

Project-plugin approval binds reviewed bytes and owner intent. It is not a
safety guarantee. Project plugins and `plugin check` run with the launching
user's ambient host authority, and the subprocess path is not a sandbox. Read
[data and trust](https://github.com/cbolden15/prism/blob/main/docs/developer-preview/data-and-trust.md)
before using repository content or executing a plugin.

## License

Apache-2.0. See `LICENSE` and `NOTICE` in this package.
