# @useprism/provider-ollama

A direct, bounded Ollama provider adapter for Prism. It implements the provider
contract from `@useprism/sdk` and sends non-streaming JSON requests to an
operator-selected Ollama endpoint. This is a 0.1.0 developer-preview API and may
change before a stable release.

## Install

```sh
npm install @useprism/provider-ollama@0.1.0 @useprism/sdk@0.1.0
```

Node.js 26.8.1 and npm 11.19.0 are the tested toolchain.

## Use

```ts
import { createOllamaProvider } from "@useprism/provider-ollama";

const provider = createOllamaProvider({
  endpoint: "http://127.0.0.1:11434",
  timeoutMs: 60_000,
});

const response = await provider.complete({
  prompt: "Return a JSON object with one short answer.",
  model: "qwen2.5:14b",
});
```

The adapter does not install Ollama or download models. Direct library callers
choose and authorize the endpoint themselves; the Prism CLI's exact-origin
remote-endpoint approval is a separate CLI boundary. Prompts and any selected
repository content are disclosed to the configured provider.

Read [data and trust](https://github.com/cbolden15/prism/blob/main/docs/developer-preview/data-and-trust.md)
before sending repository content to a provider.

## License

Apache-2.0. See `LICENSE` and `NOTICE` in this package.
