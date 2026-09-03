# Prism developer preview

<!-- pnh:limitation:PNH-CLAIM-17:begin -->
Prism 0.1.0 is a public developer preview for running bounded, goal-oriented
agent workflows. The APIs and behavior may change before a stable release.
<!-- pnh:limitation:PNH-CLAIM-17:end -->

Use Node.js 26.8.1 and npm 11.19.0. The deterministic paths below need no
provider account, credentials, model, service, or Docker. Registry installation
needs network access; the deterministic commands after installation do not.

## Deterministic first run

Install the CLI from the npm registry in a blank project, then run this simple
check with no declared plugin.

```sh
mkdir prism-first-run
cd prism-first-run
npm init -y
npm install --save-dev @useprism/cli@0.1.0
./node_modules/.bin/prism init --provider deterministic --scope project --yes
./node_modules/.bin/prism doctor
RUN_OUTPUT="$(./node_modules/.bin/prism run 'Count the words in: one two three')"
RUN_ID="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$RUN_ID"
```

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

This complete project-pinned `release-slug` workflow creates code you own,
checks it, declares workspace intent, inspects a non-executing proposal, and
approves only the digest you asserted. Do not pipe an unexamined proposal into
`prism plugin approve`.

```sh
./node_modules/.bin/prism plugin create release-slug
cat > prism-plugins/release-slug/index.mjs <<'EOF'
export function slugify(title) {
  return title.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export const prismToolAuthoringFixture = Object.freeze({
  version: "prism-tool-authoring-fixture-v1",
  operation: "slugify",
  input: Object.freeze({ title: "Preview First" }),
  expected: Object.freeze({ slug: "preview-first" }),
});

export async function handle(request) {
  if (request?.phase === "register") {
    return { kind: "tool", operations: ["slugify"], pluginId: "release-slug" };
  }
  if (request?.phase === "operate" && request.payload?.operation === "slugify") {
    const { title } = request.payload.input ?? {};
    if (typeof title !== "string") throw new Error("slugify requires a title string");
    return { slug: slugify(title) };
  }
  throw new Error("unsupported tool request");
}

async function runToolLoop() {
  process.stdin.setEncoding("utf8");
  let pending = "";
  for await (const chunk of process.stdin) {
    pending += chunk;
    while (true) {
      const newline = pending.indexOf("\n");
      if (newline === -1) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line === "") continue;
      const request = JSON.parse(line);
      try {
        const result = await handle(request);
        process.stdout.write(JSON.stringify({
          v: 1,
          type: "response",
          requestId: request.requestId,
          seq: request.seq,
          ok: true,
          result,
          error: null,
        }) + "\n");
      } catch {
        process.stdout.write(JSON.stringify({
          v: 1,
          type: "response",
          requestId: request.requestId,
          seq: request.seq,
          ok: false,
          result: null,
          error: { code: "plugin-error", message: "plugin request failed" },
        }) + "\n");
      }
    }
  }
}

if (process.argv[1]?.endsWith("/index.mjs") || process.argv[1] === "index.mjs") {
  void runToolLoop();
}
EOF
cat > prism-plugins/release-slug/index.test.mjs <<'EOF'
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, prismToolAuthoringFixture, slugify } from "./index.mjs";

test("slugify handles the release title", async () => {
  assert.equal(slugify("Preview First"), "preview-first");
  assert.deepEqual(await handle({ phase: "register" }), {
    kind: "tool", operations: ["slugify"], pluginId: "release-slug",
  });
  assert.deepEqual(await handle({
    phase: "operate",
    payload: { operation: "slugify", input: prismToolAuthoringFixture.input },
  }), prismToolAuthoringFixture.expected);
});
EOF
node --test prism-plugins/release-slug/index.test.mjs
./node_modules/.bin/prism plugin check prism-plugins/release-slug
./node_modules/.bin/prism plugin declare prism-plugins/release-slug --operation slugify
./node_modules/.bin/prism plugin approval --json > approval.json
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

`approval.json` is an inspected proposal, not approval state. It holds
`"version": "prism-project-plugin-approval-proposal-v1"`,
`"declaredPath": "prism-plugins/release-slug"`, `"operation": "slugify"`,
`"id": "release-slug"`, component commitments, and `approvalDigest`. The
assertion checks the execution-boundary boolean and warning before approval.
The inspected admitted run is a
`prism-run-record-v3` JSON record.

The [optional Ollama path](docs/developer-preview/getting-started.md#optional-ollama-first-run)
comes after the deterministic paths. It uses an operator-managed loopback
service and an already installed `qwen2.5:14b` model.

## Start here

- [Getting started](docs/developer-preview/getting-started.md)
- [Concepts](docs/developer-preview/concepts.md)
- [Command reference](docs/developer-preview/command-reference.md)
- [Plugin authoring](docs/developer-preview/plugin-authoring.md)
- [Local data and trust](docs/developer-preview/data-and-trust.md)
- [Diagnostics](docs/developer-preview/diagnostics.md)
- [0.1.0 release notes](docs/releases/developer-preview/README.md)

## Assurance

[Optional assurance](docs/assurance/README.md) is separate from normal local
execution. It is not required for either deterministic workflow.
