# @useprism/runtime

Bounded agent execution for Prism. Runtime coordinates provider turns, policy
admission, tool calls, limits, events, cleanup, and terminal results. This is a
0.1.0 developer-preview API and may change before a stable release.

## Install

```sh
npm install @useprism/runtime@0.1.0 @useprism/sdk@0.1.0
```

Node.js 26.8.1 and npm 11.19.0 are the tested toolchain.

## Smallest complete run

This example supplies every required port. The provider returns a final answer,
so policy and tools are not called.

```js
import { runAgent } from "@useprism/runtime";

const provider = {
  id: "example",
  async complete(request) {
    return {
      providerId: "example",
      model: request.model,
      text: JSON.stringify({ kind: "final", answer: "Hello from Prism." }),
    };
  },
};

const result = await runAgent({
  goal: "Say hello.",
  model: null,
  ports: {
    provider,
    async policy() { return { decision: "deny" }; },
    tools: [],
  },
});

console.log(result);
```

`runAgent` returns a typed completed or failed result with usage and ordered
events. The package also exports owner-pinned admission, subprocess lifecycle
helpers, provider and policy operations, and disclosure helpers.

The repository's [complete Runtime API example](https://github.com/cbolden15/prism/tree/main/examples/runtime-api)
adds one tool request, exact policy restrictions, expected output, and the
six-event sequence.

## Trust boundary

Local subprocess plugins inherit the launching user's host filesystem, network,
process, and other ambient authority. Digest admission and owner approval bind
plugin identity; they do not establish safety, and the subprocess path is not a
sandbox. Read [data and trust](https://github.com/cbolden15/prism/blob/main/docs/developer-preview/data-and-trust.md)
before executing plugins.

## License

Apache-2.0. See `LICENSE` and `NOTICE` in this package.
