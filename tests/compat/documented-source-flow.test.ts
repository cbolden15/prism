import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function run(command: string, arguments_: readonly string[], cwd: string): Promise<string> {
  const execution = await execFileAsync(command, arguments_, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return execution.stdout;
}

test("the documented source-checkout example works after a clean install and explicit build", {
  timeout: 180_000,
}, async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "prism-documented-source-flow-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const archive = resolve(temporary, "source.tar");
  const checkout = resolve(temporary, "checkout");
  await mkdir(checkout);

  await run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"], repositoryRoot);
  await run("tar", ["-xf", archive, "-C", checkout], repositoryRoot);
  await run("npm", ["ci"], checkout);
  await run("npm", ["run", "build:packages"], checkout);
  const output = await run("npm", ["run", "--silent", "prism:example", "--", "one two three"], checkout);

  assert.deepEqual(JSON.parse(output), {
    text: "one two three",
    characters: 13,
    words: 3,
    lines: 1,
  });
});
