import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createProjectPluginRunRecord, createRunRecord, writeRunRecord } from "../src/run-store.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const binary = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");
const runId = "123e4567-e89b-42d3-a456-426614174000";
const digest = "a".repeat(64);

function projectPluginRecord() {
  return createProjectPluginRunRecord({
    metadata: { runId, provider: { name: "deterministic", model: null }, startedAt: "2026-09-02T10:00:00.000Z", endedAt: "2026-09-02T10:00:01.000Z" },
    commitments: {
      project: { projectConfigDigest: digest },
      plugin: { id: "release-slug", operation: "slugify", manifestDigest: digest, sourceDigest: digest },
      approval: { approvalDigest: digest },
      registry: { registryDigest: digest },
      runtime: { versionDigest: digest, runnerDigest: digest, imageDigest: digest, profileDigest: digest },
    },
    result: {
      status: "failed",
      code: "provider-failure",
      limits: { providerTurns: 2, toolCalls: 1, totalBytes: 2_000_000, perToolBytes: 500_000, deadlineMs: 60_000 },
      usage: { providerTurns: 1, toolCalls: 0, totalBytes: 0 },
      toolCalls: [],
      events: [{ seq: 1, type: "goal.accepted" }],
    },
    lifecycleStarted: false,
  });
}

test("inspect emits validated human and JSON output and rejects arbitrary paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-inspect-"));
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const configHome = join(root, "config");
  const stateHome = join(root, "state");
  await Promise.all([workspace, home, configHome, stateHome].map(async (path) => mkdir(path, { recursive: true })));
  const environment = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
  };
  try {
    const record = createRunRecord({
      runId,
      workspace,
      goal: "inspect me",
      provider: "deterministic",
      model: null,
      result: { status: "failed", code: "policy-denied", events: [{ seq: 1, type: "goal.accepted" }] },
      startedAt: "2026-08-30T10:00:00.000Z",
      endedAt: "2026-08-30T10:00:01.000Z",
    });
    await writeRunRecord({ environment, record });

    const json = await execFileAsync(process.execPath, [binary, "inspect", "--json", runId], {
      cwd: workspace,
      env: environment,
    });
    assert.equal(json.stderr, "");
    assert.deepEqual(JSON.parse(json.stdout), record);
    assert.equal(json.stdout.trim().includes("\n"), false);

    const human = await execFileAsync(process.execPath, [binary, "inspect", runId], {
      cwd: workspace,
      env: environment,
    });
    assert.equal(human.stderr, "");
    assert.match(human.stdout, new RegExp(`^Run: ${runId}\\nStatus: failed\\n`));
    assert.match(human.stdout, /Provider: deterministic\n/);

    for (const invalid of ["../outside", "/tmp/record.json", runId.toUpperCase(), "not-a-uuid"]) {
      await assert.rejects(execFileAsync(process.execPath, [binary, "inspect", invalid], {
        cwd: workspace,
        env: environment,
      }), (error: unknown) => {
        assert.equal(Reflect.get(error as object, "code"), 2);
        assert.equal(Reflect.get(error as object, "stdout"), "");
        assert.match(String(Reflect.get(error as object, "stderr")), /canonical UUID/);
        return true;
      });
    }

    const recordPath = join(stateHome, "prism", "runs", `${runId}.json`);
    await writeFile(recordPath, "{", "utf8");
    await assert.rejects(execFileAsync(process.execPath, [binary, "inspect", runId], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.match(String(Reflect.get(error as object, "stderr")), /malformed JSON/);
      return true;
    });

    await writeFile(recordPath, '{"version":"prism-run-record-v3"}\n', "utf8");
    await assert.rejects(execFileAsync(process.execPath, [binary, "inspect", runId], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.match(String(Reflect.get(error as object, "stderr")), /missing run record field: runId/);
      return true;
    });

    await unlink(recordPath);
    const outside = join(root, "outside.json");
    await writeFile(outside, JSON.stringify(record), "utf8");
    await symlink(outside, recordPath);
    await assert.rejects(execFileAsync(process.execPath, [binary, "inspect", runId], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.match(String(Reflect.get(error as object, "stderr")), /symlink/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspect renders only safe v3 fields and makes cleanup:null explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-v3-inspect-"));
  const workspace = join(root, "workspace");
  const environment = { ...process.env, HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state") };
  try {
    await mkdir(workspace, { recursive: true });
    const record = projectPluginRecord();
    await writeRunRecord({ environment, record });
    const json = await execFileAsync(process.execPath, [binary, "inspect", "--json", runId], { cwd: workspace, env: environment });
    assert.deepEqual(JSON.parse(json.stdout), record);
    const human = await execFileAsync(process.execPath, [binary, "inspect", runId], { cwd: workspace, env: environment });
    assert.match(human.stdout, /Plugin: release-slug#slugify\n/);
    assert.match(human.stdout, /Cleanup: none \(no plugin lifecycle began\)\n/);
    for (const forbidden of ["Workspace:", "Goal:", "prompt", "endpoint", "environment", "cleanupErrors"]) {
      assert.equal(human.stdout.includes(forbidden), false, `human v3 leaked ${forbidden}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
