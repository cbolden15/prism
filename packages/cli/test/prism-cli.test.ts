import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runCli } from "#cli";
import type { RunCommandDependencies } from "../src/commands/run.ts";
import { ProjectPluginRunError } from "../src/project-plugin-run.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const goal = "Count the words in: one two three";
const runId = "123e4567-e89b-42d3-a456-426614174000";
const expected = {
  status: "completed",
  answer: "3 words",
  provider: "local-scripted",
  toolCalls: [
    {
      tool: "text-stats",
      operation: "analyze-text",
      result: {
        text: "one two three",
        characters: 13,
        words: 3,
        lines: 1,
      },
    },
  ],
  events: [
    { seq: 1, type: "goal.accepted" },
    { seq: 2, type: "provider.tool-requested" },
    { seq: 3, type: "policy.allowed" },
    { seq: 4, type: "tool.completed" },
    { seq: 5, type: "provider.finalized" },
    { seq: 6, type: "run.completed" },
  ],
};
const projectDigest = "a".repeat(64);
const projectReceipt = {
  v: 1,
  requestId: "request",
  pluginId: "release-slug",
  containerId: null,
  trigger: "broker-stop",
  hardDeadlineAtMs: 200,
  daemonState: "absent",
  exitCode: 0,
  oomKilled: false,
  confirmedAbsent: true,
  cleanupErrors: [],
  settledAtMs: 150,
} as const;
const admittedProjectRun = {
  kind: "admitted" as const,
  commitments: {
    project: { projectConfigDigest: projectDigest },
    plugin: { id: "release-slug", operation: "slugify" as const, manifestDigest: projectDigest, sourceDigest: projectDigest },
    approval: { approvalDigest: projectDigest },
    registry: { registryDigest: projectDigest },
    runtime: { versionDigest: projectDigest, runnerDigest: projectDigest, imageDigest: projectDigest, profileDigest: projectDigest },
  },
  result: {
    status: "completed" as const,
    answer: "preview-first",
    provider: "deterministic",
    model: null,
    limits: { providerTurns: 2, toolCalls: 1, totalBytes: 2_000_000, perToolBytes: 500_000, deadlineMs: 60_000 },
    usage: { providerTurns: 2, toolCalls: 1, totalBytes: 100 },
    toolCalls: [{ tool: "release-slug", operation: "slugify", inputBytes: 25, outputBytes: 24 }],
    events: [
      { seq: 1, type: "goal.accepted" as const },
      { seq: 2, type: "provider.tool-requested" as const, turn: 1, tool: "release-slug", operation: "slugify" },
      { seq: 3, type: "policy.allowed" as const, call: 1, tool: "release-slug", operation: "slugify" },
      { seq: 4, type: "tool.completed" as const, call: 1, tool: "release-slug", operation: "slugify", inputBytes: 25, outputBytes: 24 },
      { seq: 5, type: "provider.finalized" as const, turn: 2 },
      { seq: 6, type: "run.completed" as const },
    ],
  },
  receipt: projectReceipt,
  lifecycleStartedAtMs: 100,
  lifecycleStarted: true,
};

async function invoke(
  arguments_: readonly string[],
  result: unknown = expected,
  dependencyOverrides: Partial<RunCommandDependencies> = {},
) {
  let stdout = "";
  let stderr = "";
  const goals: string[] = [];
  const records: unknown[] = [];
  const code = await runCli({
    arguments: arguments_,
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    dependencies: {
      async runDeterministic(receivedGoal) {
        goals.push(receivedGoal);
        return result;
      },
      environment: {
        HOME: "/tmp/prism-cli-test-home",
        XDG_CONFIG_HOME: "/tmp/prism-cli-test-config",
        XDG_STATE_HOME: "/tmp/prism-cli-test-state",
      },
      currentWorkingDirectory: () => "/tmp/prism-cli-test-workspace",
      canonicalizeWorkspace: async (path) => path,
      now: () => new Date("2026-08-30T10:00:00.000Z"),
      createRunId: () => runId,
      persistRunRecord: async ({ record }) => {
        records.push(record);
        return "/tmp/prism-cli-test-state/prism/runs/record.json";
      },
      ...dependencyOverrides,
    },
  });
  return { code, stdout, stderr, goals, records };
}

test("run composes an authorized Ollama agent with the admitted workspace and persists v2 output", async () => {
  const ollamaInputs: unknown[] = [];
  const ollamaResult = {
    status: "completed",
    answer: "The fact is in README.md.",
    provider: "ollama",
    model: "qwen2.5:14b",
    limits: {
      providerTurns: 8,
      toolCalls: 8,
      totalBytes: 2_000_000,
      perToolBytes: 500_000,
      deadlineMs: 60_000,
    },
    usage: { providerTurns: 1, toolCalls: 0, totalBytes: 512 },
    toolCalls: [],
    events: [
      { seq: 1, type: "goal.accepted" },
      { seq: 2, type: "provider.finalized", turn: 1 },
      { seq: 3, type: "run.completed" },
    ],
  };
  const execution = await invoke([
    "run",
    "--provider",
    "ollama",
    "--model",
    "qwen2.5:14b",
    goal,
  ], expected, {
    async resolveConfig() {
      return {
        config: {
          version: "prism-config-v1",
          provider: "ollama",
          model: "qwen2.5:14b",
          endpoint: "http://127.0.0.1:11434",
        },
        source: "explicit",
        endpointSource: "explicit",
        paths: {
          project: "/tmp/prism-cli-test-workspace/.prism/config.json",
          user: "/tmp/prism-cli-test-config/prism/config.json",
        },
      };
    },
    async authorizeEndpoint() { return { origin: "http://127.0.0.1:11434", method: "loopback" }; },
    async runOllama(input) {
      ollamaInputs.push(input);
      assert.equal(Reflect.get(input, "workspace"), "/tmp/prism-cli-test-workspace");
      return ollamaResult;
    },
  });
  assert.equal(execution.code, 0);
  assert.equal(execution.stderr, "");
  assert.equal(execution.stdout, `The fact is in README.md.\nRun: ${runId}\n`);
  assert.equal(execution.goals.length, 0);
  assert.equal(ollamaInputs.length, 1);
  assert.equal(Reflect.get(execution.records[0] as object, "version"), "prism-run-record-v2");
  assert.equal(
    Reflect.get(Reflect.get(execution.records[0] as object, "terminal") as object, "answer"),
    "The fact is in README.md.",
  );
});

test("run defaults to the deterministic provider and exposes its persisted ID", async () => {
  const execution = await invoke(["run", goal]);
  assert.equal(execution.code, 0);
  assert.equal(execution.stderr, "");
  assert.deepEqual(execution.goals, [goal]);
  assert.equal(execution.records.length, 1);
  assert.equal(execution.stdout, `3 words\nRun: ${runId}\n`);
});

test("run accepts the explicit deterministic provider and -- for dash-prefixed goals", async () => {
  const explicit = await invoke(["run", "--provider", "deterministic", goal]);
  assert.equal(explicit.code, 0);
  assert.deepEqual(explicit.goals, [goal]);

  const dashGoal = await invoke(["run", "--", "-summarize this"]);
  assert.equal(dashGoal.code, 0);
  assert.deepEqual(dashGoal.goals, ["-summarize this"]);
});

test("an explicit provider override still enters the admitted project path and writes only V3 evidence", async () => {
  const projectCalls: unknown[] = [];
  const execution = await invoke(["run", "--provider", "deterministic", "Create a slug for release title: Preview First"], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async runProjectPlugin(input) {
      projectCalls.push(input);
      return admittedProjectRun;
    },
  });
  assert.equal(execution.code, 0, execution.stderr);
  assert.equal(execution.stdout, `preview-first\nRun: ${runId}\n`);
  assert.equal(execution.stderr, "");
  assert.equal(execution.goals.length, 0);
  assert.equal(projectCalls.length, 1);
  assert.equal(Reflect.get(execution.records[0] as object, "version"), "prism-run-record-v3");
  assert.equal(JSON.stringify(execution.records[0]).includes("Preview First"), false);
});

test("--no-plugin warns, takes the unchanged legacy path, and cannot write V3 evidence", async () => {
  let projectCalls = 0;
  const execution = await invoke(["run", "--no-plugin", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async runProjectPlugin() { projectCalls += 1; return admittedProjectRun; },
  });
  assert.equal(execution.code, 0);
  assert.equal(execution.stderr, "Prism run warning: project-plugin-disabled\n");
  assert.deepEqual(execution.goals, [goal]);
  assert.equal(projectCalls, 0);
  assert.notEqual(Reflect.get(execution.records[0] as object, "version"), "prism-run-record-v3");
});

test("--no-plugin ignores missing and malformed project declarations and always preserves legacy execution", async (context) => {
  for (const [name, present, warning] of [
    ["missing", false, ""],
    ["malformed exact path", true, "Prism run warning: project-plugin-disabled\n"],
  ] as const) {
    await context.test(name, async () => {
      const execution = await invoke(["run", "--no-plugin", goal], expected, {
        async hasProjectPluginDeclaration() { return present; },
      });
      assert.equal(execution.code, 0);
      assert.deepEqual(execution.goals, [goal]);
      assert.equal(execution.records.length, 1);
      assert.equal(execution.stderr, warning);
    });
  }
});

test("--no-plugin bypasses malformed declaration bytes through the real presence probe", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-no-plugin-malformed-"));
  try {
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(join(root, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
    await writeFile(join(root, ".prism", "tool-plugin.json"), "{malformed\n");
    const execution = await invoke(["run", "--no-plugin", goal], expected, {
      currentWorkingDirectory: () => root,
    });
    assert.equal(execution.code, 0, execution.stderr);
    assert.equal(execution.stderr, "Prism run warning: project-plugin-disabled\n");
    assert.deepEqual(execution.goals, [goal]);
    assert.equal(execution.records.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an indeterminate declaration-presence probe fails closed without a record or run ID", async () => {
  const execution = await invoke(["run", goal], expected, {
    async hasProjectPluginDeclaration() { throw Object.assign(new Error("probe failed"), { code: "EACCES" }); },
  });
  assert.equal(execution.code, 1);
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, "Prism run failed: project-plugin-admission-failed\n");
  assert.deepEqual(execution.goals, []);
  assert.deepEqual(execution.records, []);
});

test("a declared Ollama plugin closes endpoint authorization before any legacy record or call", async () => {
  let projectCalls = 0;
  let legacyCalls = 0;
  const execution = await invoke(["run", "--provider", "ollama", "--model", "test-model", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async resolveConfig() {
      return {
        config: { version: "prism-config-v1", provider: "ollama", model: "test-model", endpoint: "https://example.invalid" },
        source: "explicit", endpointSource: "explicit",
        paths: { project: "/tmp/prism-cli-test-workspace/.prism/config.json", user: "/tmp/prism-cli-test-config/prism/config.json" },
      };
    },
    async authorizeEndpoint() { throw new Error("remote endpoint not authorized"); },
    async runProjectPlugin() { projectCalls += 1; return admittedProjectRun; },
    async runOllama() { legacyCalls += 1; return expected; },
  });
  assert.equal(execution.code, 1);
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, "Prism run failed: project-plugin-admission-failed\n");
  assert.equal(projectCalls, 0);
  assert.equal(legacyCalls, 0);
  assert.deepEqual(execution.records, []);
});

test("project error reporting maps unknown thrown project-plugin strings to the closed generic code", async () => {
  const execution = await invoke(["run", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async runProjectPlugin() { throw new ProjectPluginRunError("project-plugin-untrusted-injected-code" as never); },
  });
  assert.equal(execution.code, 1);
  assert.equal(execution.stderr, "Prism run failed: project-plugin-admission-failed\n");
  assert.deepEqual(execution.records, []);
});

test("an admitted Ollama project run uses the one-tool path and emits exact V3 JSON without a legacy call", async () => {
  let legacyCalls = 0;
  const execution = await invoke(["run", "--json", "--provider", "ollama", "--model", "test-model", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async resolveConfig() {
      return {
        config: { version: "prism-config-v1", provider: "ollama", model: "test-model", endpoint: "http://127.0.0.1:11434" },
        source: "explicit", endpointSource: "explicit",
        paths: { project: "/tmp/prism-cli-test-workspace/.prism/config.json", user: "/tmp/prism-cli-test-config/prism/config.json" },
      };
    },
    async authorizeEndpoint() { return { origin: "http://127.0.0.1:11434", method: "loopback" } as never; },
    async runProjectPlugin() { return { ...admittedProjectRun, result: { ...admittedProjectRun.result, provider: "ollama", model: "test-model" } } as never; },
    async runOllama() { legacyCalls += 1; return expected; },
  });
  assert.equal(execution.code, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  assert.equal(execution.stdout, `${JSON.stringify({ runId, status: "completed", answer: "preview-first", provider: "ollama", model: "test-model" })}\n`);
  assert.equal(legacyCalls, 0);
  assert.equal(Reflect.get(execution.records[0] as object, "version"), "prism-run-record-v3");
});

test("a pre-launch tool rejection persists V3 cleanup-null evidence", async () => {
  const execution = await invoke(["run", "--json", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async runProjectPlugin() {
      return {
        ...admittedProjectRun,
        result: {
          status: "failed",
          code: "tool-failure",
          limits: admittedProjectRun.result.limits,
          usage: { providerTurns: 1, toolCalls: 1, totalBytes: 100 },
          toolCalls: [],
          events: [
            { seq: 1, type: "goal.accepted" },
            { seq: 2, type: "provider.tool-requested", turn: 1, tool: "release-slug", operation: "slugify" },
            { seq: 3, type: "policy.allowed", call: 1, tool: "release-slug", operation: "slugify" },
          ],
        },
        lifecycleStarted: false,
        receipt: undefined,
        lifecycleStartedAtMs: undefined,
      } as never;
    },
  });
  assert.equal(execution.code, 1);
  assert.equal(execution.stderr, "");
  assert.equal(execution.stdout, `${JSON.stringify({ runId, status: "failed", code: "tool-failure" })}\n`);
  assert.equal(Reflect.get(execution.records[0] as object, "version"), "prism-run-record-v3");
  assert.equal(Reflect.get(execution.records[0] as object, "cleanup"), null);
});

test("project admission failures do not spawn legacy work, persist a record, or claim a run ID", async () => {
  const execution = await invoke(["run", goal], expected, {
    async hasProjectPluginDeclaration() { return true; },
    async runProjectPlugin() { throw new ProjectPluginRunError("project-plugin-approval-missing"); },
  });
  assert.equal(execution.code, 1);
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, "Prism run failed: project-plugin-approval-missing\n");
  assert.deepEqual(execution.goals, []);
  assert.deepEqual(execution.records, []);
});

test("top-level CLI routes project declaration and undeclaration without invoking the runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-cli-declaration-"));
  try {
    await mkdir(join(root, ".prism"));
    await mkdir(join(root, "prism-plugins", "release-slug"), { recursive: true });
    await writeFile(join(root, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
    const currentWorkingDirectory = () => root;
    const declared = await invoke(
      ["plugin", "declare", "prism-plugins/release-slug", "--operation", "slugify"],
      expected,
      { currentWorkingDirectory },
    );
    assert.equal(declared.code, 0, declared.stderr);
    assert.deepEqual(declared.goals, []);
    assert.deepEqual(declared.records, []);
    assert.equal(
      JSON.parse(await readFile(join(root, ".prism", "tool-plugin.json"), "utf8")).version,
      "prism-project-tool-plugin-v1",
    );

    const undeclared = await invoke(["plugin", "undeclare"], expected, { currentWorkingDirectory });
    assert.equal(undeclared.code, 0);
    assert.deepEqual(undeclared.goals, []);
    assert.deepEqual(undeclared.records, []);
    await assert.rejects(readFile(join(root, ".prism", "tool-plugin.json")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("top-level CLI routes plugin approval, approve, and revoke without invoking the runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-cli-approval-"));
  try {
    const plugin = join(root, "prism-plugins", "release-slug");
    await mkdir(join(root, ".prism"), { recursive: true });
    await mkdir(plugin, { recursive: true });
    await writeFile(join(root, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
    await writeFile(join(root, ".prism", "tool-plugin.json"), '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify"}\n');
    const manifest = {
      id: "release-slug", version: "1.0.0", apiVersion: 1, kind: "tool",
      compatibility: { kernelApiVersion: "pnh-kernel-v1" }, entrypoint: "index.mjs", files: ["index.mjs"], dependencies: [],
      requestedCapabilities: [{ id: "tool-operation", limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true } }],
      license: { spdxId: "MIT", holder: "test" },
    };
    await writeFile(join(plugin, "manifest.json"), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(plugin, "index.mjs"), "throw new Error('must not import');\n");
    const environment = {
      HOME: join(root, "home"),
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_STATE_HOME: join(root, "state"),
    };
    const dependencies = { currentWorkingDirectory: () => root, environment };
    const execution = await invoke(["plugin", "approval", "--json"], expected, dependencies);
    assert.equal(execution.code, 0, execution.stderr);
    assert.equal(execution.stderr, "");
    assert.equal(execution.goals.length, 0);
    assert.equal(execution.records.length, 0);
    const proposal = JSON.parse(execution.stdout);
    assert.equal(proposal.plugin.id, "release-slug");

    const approved = await invoke(["plugin", "approve", "--digest", proposal.approvalDigest], expected, dependencies);
    assert.equal(approved.code, 0, approved.stderr);
    assert.equal(approved.stderr, "");
    assert.deepEqual(approved.goals, []);
    assert.deepEqual(approved.records, []);

    const revoked = await invoke(["plugin", "revoke"], expected, dependencies);
    assert.equal(revoked.code, 0, revoked.stderr);
    assert.equal(revoked.stderr, "");
    assert.deepEqual(revoked.goals, []);
    assert.deepEqual(revoked.records, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("usage failures return 2 without invoking the runtime", async (context) => {
  const cases: readonly [string, readonly string[], RegExp][] = [
    ["missing command", [], /^Usage: prism init/],
    ["unknown command", ["bogus"], /^Unknown command: bogus/],
    ["missing goal", ["run"], /^Missing goal/],
    ["missing provider", ["run", "--provider"], /^Option --provider requires a value/],
    ["unknown provider", ["run", "--provider", "codex", goal], /^Unsupported provider: codex/],
    ["unknown option", ["run", "--wat", goal], /^Unknown option: --wat/],
    ["duplicate provider", ["run", "--provider", "deterministic", "--provider", "deterministic", goal], /^Option --provider may only be specified once/],
    ["duplicate no-plugin", ["run", "--no-plugin", "--no-plugin", goal], /^Option --no-plugin may only be specified once/],
    ["unused remote authorization", ["run", "--provider", "deterministic", "--allow-remote-endpoint", "https://example.com", goal], /^--allow-remote-endpoint requires provider ollama/],
    ["extra positional", ["run", goal, "extra"], /^Unexpected argument: extra/],
  ];

  for (const [name, arguments_, expectedError] of cases) {
    await context.test(name, async () => {
      const execution = await invoke(arguments_);
      assert.equal(execution.code, 2);
      assert.equal(execution.stdout, "");
      assert.match(execution.stderr, expectedError);
      assert.deepEqual(execution.goals, []);
      assert.deepEqual(execution.records, []);
    });
  }
});

test("runtime failures return 1 and keep stdout clean", async () => {
  const failed = { status: "failed", code: "policy-denied", events: [] };
  const execution = await invoke(["run", goal], failed);
  assert.equal(execution.code, 1);
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, `Prism run failed: policy-denied\nRun: ${runId}\n`);
  assert.equal(Reflect.get(Reflect.get(execution.records[0] as object, "terminal") as object, "code"), "policy-denied");
});

test("the workspace bin executes the real deterministic subprocess path outside the checkout", { timeout: 30_000 }, async () => {
  const bin = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");

  const workingDirectory = await mkdtemp(join(tmpdir(), "prism-cli-"));
  try {
    const home = join(workingDirectory, "home");
    const config = join(workingDirectory, "config");
    const state = join(workingDirectory, "state");
    await Promise.all([home, config, state].map(async (path) => mkdir(path, { recursive: true })));
    const execution = await execFileAsync(process.execPath, [bin, "run", goal], {
      cwd: workingDirectory,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: config,
        XDG_STATE_HOME: state,
      },
    });
    assert.equal(execution.stderr, "");
    assert.match(execution.stdout, /^3 words\nRun: [0-9a-f-]{36}\n$/);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});
