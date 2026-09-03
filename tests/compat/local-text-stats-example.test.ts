import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runLocalTextStats } from "../../packages/cli/src/deterministic/local-text-stats.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("the local example runs an owner-approved plugin through a real subprocess", { timeout: 30_000 }, async () => {
  const result = await runLocalTextStats("one two\nthree");

  assert.deepEqual(result.stats, {
    text: "one two\nthree",
    characters: 13,
    words: 3,
    lines: 2,
  });
  assert.deepEqual(result.registration, {
    kind: "tool",
    pluginId: "text-stats",
    operations: ["analyze-text"],
  });
  assert.equal(result.receipt.confirmedAbsent, true);
  assert.deepEqual(result.receipt.cleanupErrors, []);
  assert.ok(result.disclosureLines.some((line) => /text-stats@1\.0\.0/.test(line)));
  assert.ok(result.disclosureLines.every((line) => !line.includes("ownerApproved=false")));
});

test("the supported package command prints only deterministic example output", { timeout: 30_000 }, async () => {
  const { stdout } = await execFileAsync(
    "npm",
    ["run", "--silent", "prism:example", "--", "one two\nthree"],
    { cwd: repositoryRoot, env: process.env },
  );

  assert.deepEqual(JSON.parse(stdout), {
    text: "one two\nthree",
    characters: 13,
    words: 3,
    lines: 2,
  });
});
