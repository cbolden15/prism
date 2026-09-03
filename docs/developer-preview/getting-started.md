# Getting started

Prism 0.1.0 is a public developer preview distributed through the npm registry.
Use Node.js 26.8.1 and npm 11.19.0.

## Deterministic first run

The deterministic path needs no provider account, credentials, model, daemon,
or Docker. Registry installation needs network access; the deterministic
commands after installation do not. Install the CLI in a blank project.

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

The final command accepts the canonical run ID emitted by `prism run`. Legacy
run records retain the goal and final answer, so treat them as local operator
data.

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

Use this complete project-pinned workflow after the simple run. There is no
direct execution bypass: `plugin check` is an execution diagnostic, while
declaration, inspected digest approval, and normal `prism run` perform
admission.

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

The JSON proposal is non-executing, not approval state, and must be inspected
before approval. It has `"version": "prism-project-plugin-approval-proposal-v1"`,
`"declaredPath": "prism-plugins/release-slug"`, `"operation": "slugify"`,
`"id": "release-slug"`, component digests, and `approvalDigest`. The assertion
checks the execution-boundary boolean and warning. The final inspect output is a
`prism-run-record-v3` JSON record.

## Optional Ollama first run

Use this path only after the deterministic path. It requires an already running
Ollama service at the loopback endpoint and an already installed `qwen2.5:14b`
model. Prism does not install models for this flow.

The project declaration from the previous workflow is still present. This
repository-tool example passes `--no-plugin` deliberately, prints the expected
`project-plugin-disabled` warning, and writes a legacy run record.

```sh
./node_modules/.bin/prism init --provider ollama --model qwen2.5:14b --endpoint http://127.0.0.1:11434 --scope project --yes
./node_modules/.bin/prism doctor
printf '%s\n' 'The Prism packed acceptance marker is indigo-orbit-47.' > FACTS.md
OLLAMA_OUTPUT="$(./node_modules/.bin/prism run --no-plugin 'Find the Prism packed acceptance marker and name its file.')"
OLLAMA_RUN_ID="$(printf '%s\n' "$OLLAMA_OUTPUT" | sed -n 's/^Run: //p')"
./node_modules/.bin/prism inspect --json "$OLLAMA_RUN_ID"
```

Project-plugin admission is provider-neutral: an Ollama project run uses the
same admitted Tool boundary as the deterministic project workflow. This optional
path still requires the configured local service and model described above.

The repository tool is read-only and bounded to the selected workspace. It is
not a confidentiality boundary: the selected local model receives the prompt
and repository content that the tool reads for that run.

For a non-loopback endpoint, `init` requires `--yes` plus
`--allow-remote-endpoint <origin>` whose normalized value exactly matches the
endpoint origin. Pass that same exact origin to `prism doctor` and `prism run`.
