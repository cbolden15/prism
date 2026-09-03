# Contributing to Prism

Prism 0.1.0 is a developer preview. Keep changes focused, preserve existing
trust limitations, and treat public APIs as review-sensitive even while they
are allowed to change before a stable release.

## Set up the repository

Use Node.js 26.8.1 and npm 11.19.0:

```sh
npm ci
```

The deterministic test paths need no provider account, credentials, model, or
external service. Do not add secrets, local run records, approval state, or
provider output to a commit.

## Make a change

1. Write or update a focused test that fails for the missing behavior.
2. Make the smallest change that passes it.
3. Run the narrow test and inspect its output.
4. Run the relevant repository checks before opening a pull request.

For documentation and public-claim changes, run:

```sh
npm run test:compat:run
npm run check:public-claims
```

Run `npm test` when a code change crosses package boundaries. B4 and X1 checks
require qualified environments and are not normal contributor checks; follow
`docs/assurance/README.md` when work is explicitly scoped to those profiles.

## Pull requests

Explain the user-visible change, list the exact checks you ran, and call out any
skipped or environment-blocked check. Keep unrelated cleanup in a separate pull
request. Report suspected vulnerabilities through the private process in
`SECURITY.md`, not a public issue.

Contributions are accepted under the repository's Apache-2.0 license. See
`LICENSE` and `NOTICE`.
