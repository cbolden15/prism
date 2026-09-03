import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runPrismDemo } from "../../packages/cli/src/deterministic/prism-demo.ts";
import {
  runPrismDemoFaultScenario,
  type PrismDemoFaultScenario,
} from "./support/prism-demo-faults.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const goal = "Count the words in: one two three";
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
const expectedStdout = `${JSON.stringify(expected, null, 2)}\n`;

test("the demo policy independently reproduces the request digest before tool execution", { timeout: 45_000 }, async () => {
  const run = await runPrismDemo(goal);
  assert.deepEqual(run.result, expected);
  assert.deepEqual(run.receipts.map((receipt) => receipt.pluginId), [
    "local-scripted",
    "allow-text-stats",
    "text-stats",
    "local-scripted",
  ]);
  assert.equal(run.receipts.length, 4);
  for (const receipt of run.receipts) {
    assert.equal(receipt.confirmedAbsent, true);
    assert.equal(receipt.exitCode, 0);
    assert.notEqual(receipt.oomKilled, true);
    assert.deepEqual(receipt.cleanupErrors, []);
  }
});

test("the package command is byte-identical across runs and prints only the public JSON", { timeout: 60_000 }, async () => {
  const run = () => execFileAsync(
    "npm",
    ["run", "--silent", "prism:demo", "--", goal],
    { cwd: repositoryRoot, env: process.env },
  );
  const first = await run();
  const second = await run();

  assert.equal(first.stderr, "");
  assert.equal(second.stderr, "");
  assert.equal(first.stdout, expectedStdout);
  assert.equal(second.stdout, first.stdout);
  assert.deepEqual(JSON.parse(first.stdout), expected);
});

test("the compatibility command reports the canonical CLI usage", { timeout: 30_000 }, async () => {
  const execution = await new Promise<{ code: string | number | null; stdout: string; stderr: string }>((resolvePromise) => {
    execFile(
      "npm",
      ["run", "--silent", "prism:demo"],
      { cwd: repositoryRoot, env: process.env },
      (error, stdout, stderr) => resolvePromise({ code: error?.code ?? null, stdout, stderr }),
    );
  });
  assert.equal(execution.code, 2);
  assert.equal(execution.stdout, "");
  assert.equal(
    execution.stderr,
    "Missing goal.\nUsage: prism run [--provider deterministic] <goal>\n",
  );
});

test("all required failures use real owner-approved subprocesses and confirm cleanup", { timeout: 60_000 }, async (context) => {
  const scenarios: readonly [PrismDemoFaultScenario, string, readonly string[]][] = [
    ["second-tool", "tool-limit", ["local-scripted", "allow-text-stats", "text-stats", "local-scripted"]],
    ["policy-denied", "policy-denied", ["local-scripted", "allow-text-stats"]],
    ["policy-digest-mismatch", "policy-denied", ["local-scripted", "allow-text-stats"]],
    ["tool-failure", "tool-failure", ["local-scripted", "allow-text-stats", "text-stats"]],
    ["invalid-provider", "provider-response", ["local-scripted"]],
  ];

  for (const [scenario, code, pluginIds] of scenarios) {
    await context.test(scenario, async () => {
      const run = await runPrismDemoFaultScenario(goal, scenario);
      assert.equal(run.result.status, "failed");
      if (run.result.status === "failed") assert.equal(run.result.code, code);
      assert.ok(run.result.events.every((event) => event.type !== "run.completed"));
      assert.deepEqual(run.receipts.map((receipt) => receipt.pluginId), pluginIds);
      for (const receipt of run.receipts) {
        assert.ok(receipt.trigger === "process-exit" || receipt.trigger === "broker-stop");
        assert.equal(receipt.confirmedAbsent, true);
        assert.deepEqual(receipt.cleanupErrors, []);
      }
    });
  }
});
