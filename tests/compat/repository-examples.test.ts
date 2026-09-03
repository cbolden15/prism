import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseToolPluginManifest } from "@useprism/sdk/authoring";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function runExample(path: string): Promise<unknown> {
  const execution = await execFileAsync(process.execPath, [resolve(repositoryRoot, path)], {
    cwd: repositoryRoot,
    timeout: 30_000,
  });
  assert.equal(execution.stderr, "");
  return JSON.parse(execution.stdout);
}

test("the complete Runtime API example emits the documented six-event result", async () => {
  assert.deepEqual(await runExample("examples/runtime-api/run.mjs"), {
    status: "completed",
    answer: "README.md is the first entry.",
    events: [
      "goal.accepted",
      "provider.tool-requested",
      "policy.allowed",
      "tool.completed",
      "provider.finalized",
      "run.completed",
    ],
  });
});

test("the policy-denial example refuses the request before tool invocation", async () => {
  assert.deepEqual(await runExample("examples/failures/policy-denied.mjs"), {
    status: "failed",
    code: "policy-denied",
    toolInvoked: false,
  });
});

test("the release-slug source, test, and manifest stay executable and admissible", async () => {
  const pluginRoot = resolve(repositoryRoot, "examples/project-plugin/release-slug");
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const execution = await execFileAsync(process.execPath, ["--test", "index.test.mjs"], {
    cwd: pluginRoot,
    env: environment,
    timeout: 30_000,
  });
  assert.equal(execution.stderr, "");
  assert.match(execution.stdout, /pass 1/u);
  const manifest = parseToolPluginManifest(new Uint8Array(await readFile(resolve(pluginRoot, "manifest.json"))));
  assert.notEqual(manifest, null);
  assert.deepEqual(
    manifest === null ? undefined : { id: manifest.id, entrypoint: manifest.entrypoint, files: manifest.files },
    { id: "release-slug", entrypoint: "index.mjs", files: ["index.mjs"] },
  );
});
