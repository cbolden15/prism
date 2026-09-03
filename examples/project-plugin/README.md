# Project-plugin example

This example keeps the full `release-slug` implementation out of the root
README while preserving a copyable, tested workflow.

Project plugins execute with the launching user's ambient filesystem, network,
process, and other host authority. `plugin check` executes the code. Approval
binds the inspected identity and captured bytes; it does not prove safety.

## Create and inspect the plugin

Start in a project where `@useprism/cli@0.1.0` is installed and initialized
with the deterministic provider. From an extracted developer-preview candidate,
the example is available at `../examples/project-plugin/release-slug` when the
working project is `first-run`.

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

`approval.json` is a non-executing proposal, not approval state. Inspect it
before approving anything. This assertion checks the expected declaration,
plugin identity, operation, digest shape, and execution warning:

```sh
node -e '
const proposal = JSON.parse(require("node:fs").readFileSync("approval.json", "utf8"));
if (proposal.version !== "prism-project-plugin-approval-proposal-v1"
  || proposal.declaredPath !== "prism-plugins/release-slug"
  || proposal.operation !== "slugify" || proposal.plugin?.id !== "release-slug"
  || proposal["sand" + "boxed"] !== false
  || proposal.warning !== ["Plugin admission and approval are not safety or sand", "boxing; plugin execution has ambient host authority."].join("")
  || !/^[0-9a-f]{64}$/.test(proposal.approvalDigest)) {
  throw new Error("unexpected project-plugin approval proposal");
}
console.log(proposal);
'
```

## Approve the inspected digest and run

```sh
APPROVAL_DIGEST="$(node -e '
const proposal = JSON.parse(require("node:fs").readFileSync("approval.json", "utf8"));
if (!/^[0-9a-f]{64}$/.test(proposal.approvalDigest)) throw new Error("invalid approval digest");
process.stdout.write(proposal.approvalDigest);
')"
./node_modules/.bin/prism plugin approve --digest "$APPROVAL_DIGEST"
RUN_OUTPUT="$(./node_modules/.bin/prism run 'Create a slug for release title: Preview First')"
printf '%s\n' "$RUN_OUTPUT"
RUN_ID="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^Run: //p')"
test "$(printf '%s\n' "$RUN_OUTPUT" | sed -n '1p')" = "preview-first"
./node_modules/.bin/prism inspect --json "$RUN_ID"
```

The final inspection is a `prism-run-record-v3` record. It includes captured
commitments, bounded usage, events, terminal status, and the authoritative
cleanup receipt. See [Project-plugin admission and
execution](../../docs/architecture/README.md#project-plugin-admission-and-execution)
for the full flow.
