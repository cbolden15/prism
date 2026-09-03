# @useprism/runtime

Bounded agent execution for Prism. Runtime coordinates provider turns, policy
admission, tool calls, limits, events, cleanup, and terminal results. This is a
0.1.0 developer-preview API and may change before a stable release.

## Install

```sh
npm install @useprism/runtime@0.1.0 @useprism/sdk@0.1.0
```

Node.js 26.8.1 and npm 11.19.0 are the tested toolchain.

## Use

Supply a provider, a policy function, and explicit tools to one bounded run:

```ts
import { runAgent } from "@useprism/runtime";

const result = await runAgent({
  goal: "Count the words in: one two three",
  model: null,
  ports: { provider, policy, tools },
});
```

`runAgent` returns a typed completed or failed result with usage and ordered
events. The package also exports owner-pinned admission, subprocess plugin
lifecycle helpers, provider and policy operations, and disclosure helpers.

## Trust boundary

Local subprocess plugins inherit the launching user's host filesystem, network,
process, and other ambient authority. Digest admission and owner approval bind
plugin identity; they do not establish safety, and the subprocess path is not a
sandbox. Read [data and trust](https://github.com/cbolden15/prism/blob/main/docs/developer-preview/data-and-trust.md)
in the Prism repository before executing plugins.

## License

Apache-2.0. See `LICENSE` and `NOTICE` in this package.
