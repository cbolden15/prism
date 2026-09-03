import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const binary = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");
const failingRunProcess = resolve(repositoryRoot, "packages", "cli", "test", "support", "failing-run-process.mjs");
const goal = "Count the words in: one two three";

async function withIsolatedCli(run: (input: {
  workspace: string;
  stateHome: string;
  environment: NodeJS.ProcessEnv;
}) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "prism-run-process-"));
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const configHome = join(root, "config");
  const stateHome = join(root, "state");
  await Promise.all([workspace, home, configHome, stateHome].map(async (path) => mkdir(path, { recursive: true })));
  try {
    await run({
      workspace,
      stateHome,
      environment: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: configHome,
        XDG_STATE_HOME: stateHome,
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("successful human run exposes a UUID and writes a sanitized CLI-owned record", { timeout: 30_000 }, async () => {
  await withIsolatedCli(async ({ workspace, stateHome, environment }) => {
    const execution = await execFileAsync(process.execPath, [binary, "run", goal], {
      cwd: workspace,
      env: environment,
    });
    assert.equal(execution.stderr, "");
    assert.match(execution.stdout, /^3 words\nRun: [0-9a-f-]{36}\n$/);
    const runId = execution.stdout.match(/Run: ([0-9a-f-]{36})/)?.[1];
    assert.ok(runId);
    const record = JSON.parse(await readFile(join(stateHome, "prism", "runs", `${runId}.json`), "utf8"));
    assert.equal(record.runId, runId);
    assert.equal(record.workspace, await realpath(workspace));
    assert.equal(record.goal, goal);
    assert.equal(record.provider, "deterministic");
    assert.equal(record.model, null);
    assert.equal(JSON.stringify(record).includes('"text":"one two three"'), false);
    assert.deepEqual(record.limits, { providerTurns: 2, toolCalls: 1 });
  });
});

test("JSON run output is one value with a top-level runId", { timeout: 30_000 }, async () => {
  await withIsolatedCli(async ({ workspace, environment }) => {
    const execution = await execFileAsync(process.execPath, [binary, "run", "--json", goal], {
      cwd: workspace,
      env: environment,
    });
    assert.equal(execution.stderr, "");
    assert.equal(execution.stdout.endsWith("\n"), true);
    assert.equal(execution.stdout.trim().includes("\n"), false);
    const output = JSON.parse(execution.stdout);
    assert.match(output.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(output.status, "completed");
    assert.equal(output.answer, "3 words");
  });
});

test("a failed record write makes run fail without claiming a run ID", { timeout: 30_000 }, async () => {
  await withIsolatedCli(async ({ workspace, stateHome, environment }) => {
    await rm(stateHome, { recursive: true, force: true });
    await writeFile(stateHome, "not a directory", "utf8");
    await assert.rejects(execFileAsync(process.execPath, [binary, "run", goal], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stdout"), "");
      const stderr = String(Reflect.get(error as object, "stderr"));
      assert.match(stderr, /^Prism run failed: could not save run record:/);
      assert.equal(stderr.includes("Run:"), false);
      return true;
    });
  });
});

test("deterministic JSON failure is one stdout value with a persisted runId", async () => {
  await withIsolatedCli(async ({ workspace, stateHome, environment }) => {
    let runId: string | undefined;
    await assert.rejects(execFileAsync(process.execPath, [failingRunProcess], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stderr"), "");
      const stdout = String(Reflect.get(error as object, "stdout"));
      assert.equal(stdout.trim().includes("\n"), false);
      const output = JSON.parse(stdout);
      assert.equal(output.status, "failed");
      assert.equal(output.code, "policy-denied");
      assert.match(output.runId, /^[0-9a-f-]{36}$/);
      runId = output.runId;
      return true;
    });
    assert.ok(runId);
    const record = JSON.parse(await readFile(join(stateHome, "prism", "runs", `${runId}.json`), "utf8"));
    assert.equal(record.terminal.code, "policy-denied");
  });
});

test("unavailable authorized Ollama endpoint is one JSON provider-failure record", async () => {
  await withIsolatedCli(async ({ workspace, stateHome, environment }) => {
    await execFileAsync(process.execPath, [
      binary,
      "init",
      "--provider",
      "ollama",
      "--model",
      "test-model",
      "--endpoint",
      "http://127.0.0.1:1",
      "--scope",
      "project",
      "--yes",
    ], { cwd: workspace, env: environment });

    let runId: string | undefined;
    await assert.rejects(execFileAsync(process.execPath, [binary, "run", "--json", goal], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stderr"), "");
      const stdout = String(Reflect.get(error as object, "stdout"));
      const output = JSON.parse(stdout);
      assert.equal(output.status, "failed");
      assert.equal(output.code, "provider-failure");
      assert.match(output.runId, /^[0-9a-f-]{36}$/);
      runId = output.runId;
      return true;
    });
    assert.ok(runId);
    const record = JSON.parse(await readFile(join(stateHome, "prism", "runs", `${runId}.json`), "utf8"));
    assert.equal(record.provider, "ollama");
    assert.equal(record.terminal.code, "provider-failure");
  });
});

test("deterministic run rejects an unused remote-authorization flag before writing a record", async () => {
  await withIsolatedCli(async ({ workspace, stateHome, environment }) => {
    await assert.rejects(execFileAsync(process.execPath, [
      binary,
      "run",
      "--provider",
      "deterministic",
      "--allow-remote-endpoint",
      "https://example.com",
      goal,
    ], { cwd: workspace, env: environment }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 2);
      assert.equal(Reflect.get(error as object, "stdout"), "");
      assert.match(String(Reflect.get(error as object, "stderr")), /^--allow-remote-endpoint requires provider ollama/);
      return true;
    });
    await assert.rejects(access(join(stateHome, "prism", "runs")));
  });
});
