import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  RUN_RECORD_VERSION,
  RUN_RECORD_VERSION_V2,
  RUN_RECORD_VERSION_V3,
  createProjectPluginRunRecord,
  createRunRecord,
  parseRunRecord,
  prismStatePaths,
  readRunRecord,
  writeRunRecord,
} from "../src/run-store.ts";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const events = [
  { seq: 1, type: "goal.accepted" },
  { seq: 2, type: "provider.tool-requested" },
  { seq: 3, type: "policy.allowed" },
  { seq: 4, type: "tool.completed" },
  { seq: 5, type: "provider.finalized" },
  { seq: 6, type: "run.completed" },
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const digest = "a".repeat(64);
const projectPluginResult = {
  status: "completed",
  answer: "preview-first",
  provider: "deterministic",
  model: null,
  limits: {
    providerTurns: 2,
    toolCalls: 1,
    totalBytes: 2_000_000,
    perToolBytes: 500_000,
    deadlineMs: 60_000,
  },
  usage: { providerTurns: 2, toolCalls: 1, totalBytes: 88 },
  toolCalls: [{ tool: "release-slug", operation: "slugify", inputBytes: 24, outputBytes: 18 }],
  events: [
    { seq: 1, type: "goal.accepted" },
    { seq: 2, type: "provider.tool-requested", turn: 1, tool: "release-slug", operation: "slugify" },
    { seq: 3, type: "policy.allowed", call: 1, tool: "release-slug", operation: "slugify" },
    { seq: 4, type: "tool.completed", call: 1, tool: "release-slug", operation: "slugify", inputBytes: 24, outputBytes: 18 },
    { seq: 5, type: "provider.finalized", turn: 2 },
    { seq: 6, type: "run.completed" },
  ],
} as const;

function projectPluginReceipt(pluginId = "release-slug") {
  return {
    v: 1,
    requestId: "request-1",
    pluginId,
    containerId: null,
    trigger: "process-exit",
    hardDeadlineAtMs: 1_500,
    daemonState: "exited",
    exitCode: 0,
    oomKilled: false,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: 2_000,
  } as const;
}

function createProjectRecord(overrides: Record<string, unknown> = {}) {
  return createProjectPluginRunRecord({
    metadata: {
      runId,
      provider: { name: "deterministic", model: null },
      startedAt: "2026-09-02T10:00:00.000Z",
      endedAt: "2026-09-02T10:00:01.000Z",
    },
    commitments: {
      project: { projectConfigDigest: digest },
      plugin: { id: "release-slug", operation: "slugify", manifestDigest: digest, sourceDigest: digest },
      approval: { approvalDigest: digest },
      registry: { registryDigest: digest },
      runtime: { versionDigest: digest, runnerDigest: digest, imageDigest: digest, profileDigest: digest },
    },
    result: projectPluginResult,
    lifecycleStarted: true,
    receipt: projectPluginReceipt(),
    lifecycleStartedAtMs: 1_000,
    ...overrides,
  });
}

test("project plugin v3 records are exact, measurement-only, private, and reject malformed histories", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-project-run-store-"));
  try {
    const environment = { HOME: join(root, "home"), XDG_STATE_HOME: join(root, "state") };
    const record = createProjectRecord();
    assert.equal(record.version, RUN_RECORD_VERSION_V3);
    assert.deepEqual(record.boundary, {
      executor: "spawn",
      authority: "ambient-host",
      sandboxed: false,
      claim: "identity-and-owner-approval",
    });
    assert.deepEqual(record.trace, [{ seq: 1, tool: "release-slug", operation: "slugify", inputBytes: 24, outputBytes: 18 }]);
    assert.deepEqual(record.cleanup, {
      trigger: "process-exit",
      exitCode: 0,
      oomKilled: false,
      confirmedAbsent: true,
      cleanupErrorCount: 0,
      settlementMs: 1_000,
    });

    const path = await writeRunRecord({ environment, record });
    const serialized = await readFile(path, "utf8");
    assert.deepEqual(parseRunRecord(serialized), record);
    assert.deepEqual(await readRunRecord({ environment, runId }), record);
    for (const forbidden of ["\"workspace\"", "\"goal\"", "Preview First", "raw-input", "/private/plugin", "prompt", "endpoint", "environment", "cleanupErrors"]) {
      assert.equal(serialized.includes(forbidden), false, `serialized v3 leaked ${forbidden}`);
    }

    const unknown = JSON.parse(serialized);
    unknown.plugin.path = "/private/plugin";
    assert.throws(() => parseRunRecord(JSON.stringify(unknown)), /unknown plugin field/);
    const invalidBoundary = JSON.parse(serialized);
    invalidBoundary.boundary.authority = "sandbox";
    assert.throws(() => parseRunRecord(JSON.stringify(invalidBoundary)), /boundary authority/);
    const invalidProvider = JSON.parse(serialized);
    invalidProvider.provider.model = "forbidden";
    assert.throws(() => parseRunRecord(JSON.stringify(invalidProvider)), /provider model/);
    const invalidCommitment = JSON.parse(serialized);
    invalidCommitment.runtime.profileDigest = "UPPERCASE";
    assert.throws(() => parseRunRecord(JSON.stringify(invalidCommitment)), /runtime profile digest/);
    const invalidTimestamp = JSON.parse(serialized);
    invalidTimestamp.startedAt = "2026-09-02T10:00:00Z";
    assert.throws(() => parseRunRecord(JSON.stringify(invalidTimestamp)), /bounded ISO timestamp/);
    const invalidUsage = JSON.parse(serialized);
    invalidUsage.usage.toolCalls = 2;
    assert.throws(() => parseRunRecord(JSON.stringify(invalidUsage)), /usage exceeds limits/);
    const invalidTrace = JSON.parse(serialized);
    invalidTrace.trace[0].input = "raw-input";
    assert.throws(() => parseRunRecord(JSON.stringify(invalidTrace)), /unknown trace field/);
    const multipleTrace = JSON.parse(serialized);
    multipleTrace.trace.push({ ...multipleTrace.trace[0] });
    assert.throws(() => parseRunRecord(JSON.stringify(multipleTrace)), /at most one entry/);
    const invalidCleanup = JSON.parse(serialized);
    invalidCleanup.cleanup.cleanupErrorCount = 1;
    assert.throws(() => parseRunRecord(JSON.stringify(invalidCleanup)), /completed run cleanup/);
    const missingCleanup = JSON.parse(serialized);
    missingCleanup.cleanup = null;
    assert.throws(() => parseRunRecord(JSON.stringify(missingCleanup)), /lifecycle receipt/);
    const invalidHistory = JSON.parse(serialized);
    invalidHistory.events[5] = { seq: 6, type: "provider.finalized", turn: 2 };
    assert.throws(() => parseRunRecord(JSON.stringify(invalidHistory)), /event state/);
    const wrongApprovedTool = JSON.parse(serialized);
    wrongApprovedTool.events[1].tool = "other-tool";
    wrongApprovedTool.events[2].tool = "other-tool";
    wrongApprovedTool.events[3].tool = "other-tool";
    wrongApprovedTool.trace[0].tool = "other-tool";
    assert.throws(() => parseRunRecord(JSON.stringify(wrongApprovedTool)), /approved plugin/);
    const duplicate = serialized.replace('"runId"', `"runId":"${runId}","runId"`);
    assert.throws(() => parseRunRecord(duplicate), /duplicate JSON object key/);
    const nestedDuplicate = serialized.replace(/("plugin":\s*\{\s*"id":\s*"release-slug")/u, '$1,"id":"release-slug"');
    assert.notEqual(nestedDuplicate, serialized);
    assert.throws(() => parseRunRecord(nestedDuplicate), /duplicate JSON object key/);

    const safeFailure = createProjectRecord({
      metadata: {
        runId: "223e4567-e89b-42d3-a456-426614174000",
        provider: { name: "deterministic", model: null },
        startedAt: "2026-09-02T10:00:00.000Z",
        endedAt: "2026-09-02T10:00:01.000Z",
      },
      result: {
        status: "failed",
        code: "provider-failure",
        limits: projectPluginResult.limits,
        usage: { providerTurns: 1, toolCalls: 0, totalBytes: 0 },
        toolCalls: [],
        events: [{ seq: 1, type: "goal.accepted" }],
      },
      receipt: undefined,
      lifecycleStartedAtMs: undefined,
      lifecycleStarted: false,
    });
    assert.deepEqual(safeFailure.cleanup, null);
    await writeRunRecord({ environment, record: safeFailure });
    assert.deepEqual(await readRunRecord({ environment, runId: safeFailure.runId }), safeFailure);
    assert.throws(() => createProjectRecord({ receipt: undefined }), /lifecycle receipt/);
    assert.throws(() => createProjectRecord({ result: { ...projectPluginResult, answer: "not a valid answer!" } }), /terminal answer/);
    assert.throws(() => createProjectRecord({ result: { ...projectPluginResult, limits: { ...projectPluginResult.limits, providerTurns: 3 } } }), /limits providerTurns/);
    assert.throws(() => createProjectRecord({ result: { ...projectPluginResult, toolCalls: [] } }), /tool calls are invalid/);
    assert.throws(() => createProjectRecord({ result: { ...projectPluginResult, error: "raw error" } }), /unknown project plugin result field/);
    assert.throws(() => createProjectRecord({ result: { ...projectPluginResult, toolCalls: [{ ...projectPluginResult.toolCalls[0], input: "raw input" }] } }), /unknown project plugin tool call field/);
    assert.throws(() => createProjectRecord({ receipt: projectPluginReceipt("other-tool") }), /lifecycle receipt/);

    const rejectedBeforeLaunch = createProjectRecord({
      metadata: {
        runId: "323e4567-e89b-42d3-a456-426614174000",
        provider: { name: "deterministic", model: null },
        startedAt: "2026-09-02T10:00:00.000Z",
        endedAt: "2026-09-02T10:00:01.000Z",
      },
      result: {
        status: "failed",
        code: "tool-failure",
        limits: projectPluginResult.limits,
        usage: { providerTurns: 1, toolCalls: 1, totalBytes: 24 },
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
    });
    assert.equal(rejectedBeforeLaunch.cleanup, null);
    assert.deepEqual(parseRunRecord(JSON.stringify(rejectedBeforeLaunch)), rejectedBeforeLaunch);
    assert.throws(() => createProjectRecord({ lifecycleStarted: true, receipt: undefined, lifecycleStartedAtMs: undefined }), /receipt and clock/);
    assert.throws(() => createProjectRecord({ lifecycleStarted: false, lifecycleStartedAtMs: undefined }), /receipt and clock/);
    assert.throws(() => createProjectRecord({ lifecycleStarted: false, receipt: undefined }), /receipt and clock/);
    assert.throws(() => createProjectRecord({ lifecycleStarted: true, receipt: undefined }), /receipt and clock/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run records persist atomically with restrictive modes and a sanitized trace", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-run-store-"));
  try {
    const environment = { HOME: join(root, "home"), XDG_STATE_HOME: join(root, "state") };
    const record = createRunRecord({
      runId,
      workspace: join(root, "workspace"),
      goal: "analyze the fixture",
      provider: "deterministic",
      model: null,
      result: {
        status: "completed",
        answer: "3 words",
        provider: "local-scripted",
        toolCalls: [{
          tool: "text-stats",
          operation: "analyze-text",
          result: { text: "raw tool payload", characters: 16, words: 3, lines: 1 },
        }],
        events,
      },
      startedAt: "2026-08-30T10:00:00.000Z",
      endedAt: "2026-08-30T10:00:01.000Z",
    });

    const path = await writeRunRecord({ environment, record });
    const serialized = await readFile(path, "utf8");
    assert.equal(serialized.includes("raw tool payload"), false);
    assert.equal(serialized.includes("provider response body"), false);
    assert.deepEqual(parseRunRecord(serialized), record);
    assert.deepEqual(await readRunRecord({ environment, runId }), record);

    const paths = prismStatePaths({ environment });
    assert.equal((await lstat(paths.prism)).mode & 0o777, 0o700);
    assert.equal((await lstat(paths.runs)).mode & 0o777, 0o700);
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(paths.runs)).filter((name) => name.includes(".tmp")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("general Runtime records use v2 limits and sanitize repository paths without queries or excerpts", () => {
  const toolInput = { path: ".", query: "secret-query" };
  const toolResult = {
    path: ".",
    matches: [{ path: "README.md", line: 1, text: "secret-excerpt" }],
    filesSearched: 1,
    truncated: false,
  };
  const serializedInput = JSON.stringify(toolInput);
  const serializedOutput = JSON.stringify(toolResult);
  const record = createRunRecord({
    runId,
    workspace: "/tmp/workspace",
    goal: "find the repository fact",
    provider: "ollama",
    model: "qwen2.5:14b",
    result: {
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
      usage: { providerTurns: 2, toolCalls: 1, totalBytes: 1_234 },
      toolCalls: [{
        tool: "repository",
        operation: "search",
        input: toolInput,
        result: toolResult,
        inputBytes: Buffer.byteLength(serializedInput),
        outputBytes: Buffer.byteLength(serializedOutput),
      }],
      events: [
        { seq: 1, type: "goal.accepted" },
        { seq: 2, type: "provider.tool-requested", turn: 1, tool: "repository", operation: "search" },
        { seq: 3, type: "policy.allowed", call: 1, tool: "repository", operation: "search" },
        {
          seq: 4,
          type: "tool.completed",
          call: 1,
          tool: "repository",
          operation: "search",
          inputBytes: Buffer.byteLength(serializedInput),
          outputBytes: Buffer.byteLength(serializedOutput),
        },
        { seq: 5, type: "provider.finalized", turn: 2 },
        { seq: 6, type: "run.completed" },
      ],
    },
    startedAt: "2026-08-30T10:00:00.000Z",
    endedAt: "2026-08-30T10:00:01.000Z",
  });

  assert.equal(record.version, RUN_RECORD_VERSION_V2);
  if (record.version !== RUN_RECORD_VERSION_V2) return;
  assert.deepEqual(record.limits, {
    providerTurns: 8,
    toolCalls: 8,
    totalBytes: 2_000_000,
    perToolBytes: 500_000,
    deadlineMs: 60_000,
  });
  assert.deepEqual(record.usage, { providerTurns: 2, toolCalls: 1, totalBytes: 1_234 });
  assert.deepEqual(record.trace, [{
    seq: 1,
    tool: "repository",
    operation: "search",
    path: ".",
    input: {
      bytes: Buffer.byteLength(serializedInput),
      sha256: sha256(serializedInput),
      redacted: true,
    },
    output: {
      resultCount: 1,
      paths: ["README.md"],
      bytes: Buffer.byteLength(serializedOutput),
      sha256: sha256(serializedOutput),
      redacted: true,
    },
    redactions: { content: true, query: true, excerpts: true },
  }]);
  assert.equal(record.goal, "find the repository fact");
  assert.deepEqual(record.terminal, { status: "completed", answer: "The fact is in README.md." });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("secret-query"), false);
  assert.equal(serialized.includes("secret-excerpt"), false);
  assert.equal(serialized.includes("/tmp/workspace/README.md"), false);
  assert.deepEqual(parseRunRecord(serialized), record);

  const withRawTrace = JSON.parse(serialized);
  withRawTrace.trace[0].query = "forbidden";
  assert.throws(() => parseRunRecord(JSON.stringify(withRawTrace)), /unknown trace field/);
  const withAbsoluteTracePath = JSON.parse(serialized);
  withAbsoluteTracePath.trace[0].path = "/tmp/workspace/README.md";
  assert.throws(() => parseRunRecord(JSON.stringify(withAbsoluteTracePath)), /relative/);
  const withoutRedaction = JSON.parse(serialized);
  withoutRedaction.trace[0].redactions.excerpts = false;
  assert.throws(() => parseRunRecord(JSON.stringify(withoutRedaction)), /redacted/);

  const impossibleCompletedHistory = JSON.parse(serialized);
  impossibleCompletedHistory.usage = { providerTurns: 1, toolCalls: 1, totalBytes: 1_234 };
  impossibleCompletedHistory.events = [
    { seq: 1, type: "goal.accepted" },
    { seq: 2, type: "provider.finalized", turn: 1 },
    { seq: 3, type: "run.completed" },
  ];
  impossibleCompletedHistory.trace = [];
  assert.throws(
    () => parseRunRecord(JSON.stringify(impossibleCompletedHistory)),
    /completed run record history is inconsistent/,
  );

  const failedDuringTool = JSON.parse(serialized);
  failedDuringTool.usage = { providerTurns: 1, toolCalls: 1, totalBytes: 1_234 };
  failedDuringTool.events = [
    { seq: 1, type: "goal.accepted" },
    { seq: 2, type: "provider.tool-requested", turn: 1, tool: "repository", operation: "search" },
    { seq: 3, type: "policy.allowed", call: 1, tool: "repository", operation: "search" },
  ];
  failedDuringTool.trace = [];
  failedDuringTool.terminal = { status: "failed", code: "tool-failure" };
  assert.equal(parseRunRecord(JSON.stringify(failedDuringTool)).terminal.status, "failed");
});

test("run record validation rejects malformed and unknown-version data", () => {
  assert.throws(() => parseRunRecord("{"), /malformed JSON/);
  assert.throws(() => parseRunRecord(JSON.stringify({ version: "prism-run-record-v3" })), /missing run record field: runId/);
  assert.throws(() => parseRunRecord(JSON.stringify({
    version: RUN_RECORD_VERSION,
    runId,
    workspace: "/tmp/workspace",
    goal: "goal",
    provider: "deterministic",
    model: null,
    limits: { providerTurns: 2, toolCalls: 1 },
    events: [],
    trace: [],
    terminal: { status: "failed", code: "provider-failure" },
    startedAt: "2026-08-30T10:00:00.000Z",
    endedAt: "2026-08-30T10:00:01.000Z",
    token: "forbidden",
  })), /unknown run record field/);
});

test("readRunRecord accepts canonical UUIDs only and rejects record symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-run-read-"));
  try {
    const environment = { HOME: join(root, "home"), XDG_STATE_HOME: join(root, "state") };
    await assert.rejects(readRunRecord({ environment, runId: "../record" }), /canonical UUID/);
    await assert.rejects(readRunRecord({ environment, runId: runId.toUpperCase() }), /canonical UUID/);

    const paths = prismStatePaths({ environment });
    await mkdir(paths.runs, { recursive: true });
    const target = join(root, "outside.json");
    await writeFile(target, "{}\n", "utf8");
    await symlink(target, join(paths.runs, `${runId}.json`));
    await assert.rejects(readRunRecord({ environment, runId }), /symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
