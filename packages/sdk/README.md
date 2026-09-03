# @useprism/sdk

Public TypeScript contracts and validators for Prism providers, tools, policies,
plugin manifests, registration, and the bounded protocol. This is a 0.1.0
developer-preview API and may change before a stable release.

## Install

```sh
npm install @useprism/sdk@0.1.0
```

Node.js 26.8.1 and npm 11.19.0 are the tested toolchain.

## Use

Import contracts from their explicit subpaths:

```ts
import type { Provider } from "@useprism/sdk/provider";
import { validateProviderResponse } from "@useprism/sdk/provider";
import type { Tool } from "@useprism/sdk/tool";
import type { PolicyAdmissionOutcome } from "@useprism/sdk/policy";
```

The package also exports JSON normalization, provider-decision validation,
plugin registration, authoring helpers, manifest helpers, and Node registry
generation. The SDK defines data contracts; it does not own runtime lifecycle,
local persistence, provider credentials, or plugin installation.

## Trust boundary

Validation establishes that values match Prism's bounded data shapes. It does
not establish that a provider, tool, policy, or plugin is safe to execute. Read
[data and trust](https://github.com/cbolden15/prism/blob/main/docs/developer-preview/data-and-trust.md)
in the Prism repository before building an integration.

## License

Apache-2.0. See `LICENSE` and `NOTICE` in this package.
