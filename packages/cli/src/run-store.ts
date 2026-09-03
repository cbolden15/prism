import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import type { AgentRunResult, PluginLifecycleReceipt } from "@useprism/runtime";
import { writeJsonAtomically } from "./atomic-json.ts";

export const RUN_RECORD_VERSION = "prism-run-record-v1" as const;
export const RUN_RECORD_VERSION_V2 = "prism-run-record-v2" as const;
export const RUN_RECORD_VERSION_V3 = "prism-run-record-v3" as const;

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const EVENT_TYPES = new Set([
  "goal.accepted",
  "provider.tool-requested",
  "policy.allowed",
  "tool.completed",
  "provider.finalized",
  "run.completed",
]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
export const PROJECT_PLUGIN_RUN_LIMITS = Object.freeze({
  providerTurns: 2,
  toolCalls: 1,
  totalBytes: 2_000_000,
  perToolBytes: 500_000,
  deadlineMs: 60_000,
});
const PROJECT_PLUGIN_FAILURE_CODES = new Set([
  "invalid-input",
  "provider-turn-limit",
  "tool-call-limit",
  "total-byte-limit",
  "tool-byte-limit",
  "deadline",
  "provider-failure",
  "provider-response",
  "tool-request",
  "policy-failure",
  "policy-denied",
  "tool-failure",
  "tool-result",
]);
const CLEANUP_TRIGGERS = new Set([
  "broker-stop",
  "deadline",
  "launch-failed",
  "supervisor-shutdown",
  "process-exit",
  "stream-overflow",
]);
const MAX_CLEANUP_ERROR_COUNT = 64;
const MAX_SETTLEMENT_MS = 2_147_483_647;

export interface StateEnvironment {
  readonly HOME?: string;
  readonly XDG_STATE_HOME?: string;
}

export interface RunRecordEvent {
  readonly seq: number;
  readonly type: string;
}

export interface SanitizedRunTraceEntry {
  readonly seq: number;
  readonly tool: string;
  readonly operation: string;
  readonly input: {
    readonly bytes: number;
    readonly sha256: string;
    readonly redacted: true;
  };
  readonly output: {
    readonly characters: number;
    readonly words: number;
    readonly lines: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly redacted: true;
  };
}

export type RunRecordEventV2 =
  | { readonly seq: number; readonly type: "goal.accepted" }
  | {
      readonly seq: number;
      readonly type: "provider.tool-requested";
      readonly turn: number;
      readonly tool: string;
      readonly operation: string;
    }
  | {
      readonly seq: number;
      readonly type: "policy.allowed";
      readonly call: number;
      readonly tool: string;
      readonly operation: string;
    }
  | {
      readonly seq: number;
      readonly type: "tool.completed";
      readonly call: number;
      readonly tool: string;
      readonly operation: string;
      readonly inputBytes: number;
      readonly outputBytes: number;
    }
  | { readonly seq: number; readonly type: "provider.finalized"; readonly turn: number }
  | { readonly seq: number; readonly type: "run.completed" };

export interface AgentRunRecordLimits {
  readonly providerTurns: number;
  readonly toolCalls: number;
  readonly totalBytes: number;
  readonly perToolBytes: number;
  readonly deadlineMs: number;
}

export interface AgentRunRecordUsage {
  readonly providerTurns: number;
  readonly toolCalls: number;
  readonly totalBytes: number;
}

export interface SanitizedRunTraceEntryV2 {
  readonly seq: number;
  readonly tool: string;
  readonly operation: string;
  readonly path: string | null;
  readonly input: {
    readonly bytes: number;
    readonly sha256: string;
    readonly redacted: true;
  };
  readonly output: {
    readonly resultCount: number;
    readonly paths: readonly string[];
    readonly bytes: number;
    readonly sha256: string;
    readonly redacted: true;
  };
  readonly redactions: {
    readonly content: true;
    readonly query: true;
    readonly excerpts: true;
  };
}

export type RunRecordTerminal =
  | { readonly status: "completed"; readonly answer: string }
  | { readonly status: "failed"; readonly code: string };

export interface RunRecordV1 {
  readonly version: typeof RUN_RECORD_VERSION;
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly limits: {
    readonly providerTurns: 2;
    readonly toolCalls: 1;
  };
  readonly events: readonly RunRecordEvent[];
  readonly trace: readonly SanitizedRunTraceEntry[];
  readonly terminal: RunRecordTerminal;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface RunRecordV2 {
  readonly version: typeof RUN_RECORD_VERSION_V2;
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly limits: AgentRunRecordLimits;
  readonly usage: AgentRunRecordUsage;
  readonly events: readonly RunRecordEventV2[];
  readonly trace: readonly SanitizedRunTraceEntryV2[];
  readonly terminal: RunRecordTerminal;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface ProjectPluginRunRecordCommitments {
  readonly project: { readonly projectConfigDigest: string };
  readonly plugin: {
    readonly id: string;
    readonly operation: "slugify";
    readonly manifestDigest: string;
    readonly sourceDigest: string;
  };
  readonly approval: { readonly approvalDigest: string };
  readonly registry: { readonly registryDigest: string };
  readonly runtime: {
    readonly versionDigest: string;
    readonly runnerDigest: string;
    readonly imageDigest: string;
    readonly profileDigest: string;
  };
}

export interface ProjectPluginRunRecordV3 {
  readonly version: typeof RUN_RECORD_VERSION_V3;
  readonly runId: string;
  readonly provider: { readonly name: "deterministic" | "ollama"; readonly model: string | null };
  readonly project: { readonly projectConfigDigest: string };
  readonly plugin: ProjectPluginRunRecordCommitments["plugin"];
  readonly approval: { readonly approvalDigest: string };
  readonly registry: { readonly registryDigest: string };
  readonly runtime: ProjectPluginRunRecordCommitments["runtime"];
  readonly boundary: {
    readonly executor: "spawn";
    readonly authority: "ambient-host";
    readonly sandboxed: false;
    readonly claim: "identity-and-owner-approval";
  };
  readonly limits: Readonly<typeof PROJECT_PLUGIN_RUN_LIMITS>;
  readonly usage: AgentRunRecordUsage;
  readonly events: readonly RunRecordEventV2[];
  readonly trace: readonly {
    readonly seq: number;
    readonly tool: string;
    readonly operation: "slugify";
    readonly inputBytes: number;
    readonly outputBytes: number;
  }[];
  readonly terminal: RunRecordTerminal;
  readonly cleanup: {
    readonly trigger: string;
    readonly exitCode: number | null;
    readonly oomKilled: boolean | null;
    readonly confirmedAbsent: boolean;
    readonly cleanupErrorCount: number;
    readonly settlementMs: number;
  } | null;
  readonly startedAt: string;
  readonly endedAt: string;
}

export type RunRecord = RunRecordV1 | RunRecordV2;
export type StoredRunRecord = RunRecord | ProjectPluginRunRecordV3;

function environmentPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function prismStatePaths(input: {
  readonly environment: StateEnvironment;
}): { readonly state: string; readonly prism: string; readonly runs: string } {
  const xdgStateHome = environmentPath(input.environment.XDG_STATE_HOME);
  const home = environmentPath(input.environment.HOME);
  if (xdgStateHome === undefined && home === undefined) {
    throw new Error("XDG_STATE_HOME or HOME is required to resolve Prism run state.");
  }
  const state = resolve(xdgStateHome ?? join(home as string, ".local", "state"));
  const prism = join(state, "prism");
  return { state, prism, runs: join(prism, "runs") };
}

export function isCanonicalRunId(value: string): boolean {
  return RUN_ID_RE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value).find((key) => !expectedSet.has(key));
  if (unknown !== undefined) throw new Error(`unknown ${label} field: ${unknown}`);
  const missing = expected.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) throw new Error(`missing ${label} field: ${missing}`);
  if (Object.keys(value).length !== expected.length) throw new Error(`invalid ${label} fields`);
}

function parseIsoTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

function parseEvents(value: unknown): readonly RunRecordEvent[] {
  if (!Array.isArray(value)) throw new Error("run record events must be an array");
  return value.map((event, index) => {
    if (!isRecord(event)) throw new Error("run record event must be an object");
    exactKeys(event, ["seq", "type"], "event");
    if (event.seq !== index + 1 || typeof event.type !== "string" || !EVENT_TYPES.has(event.type)) {
      throw new Error("run record events must be ordered and recognized");
    }
    return { seq: event.seq, type: event.type };
  });
}

function parseRedactedMeasurement(value: unknown, label: string): {
  readonly bytes: number;
  readonly sha256: string;
  readonly redacted: true;
} {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  exactKeys(value, ["bytes", "sha256", "redacted"], label);
  if (!Number.isSafeInteger(value.bytes) || (value.bytes as number) < 0) throw new Error(`${label} bytes are invalid`);
  if (typeof value.sha256 !== "string" || !DIGEST_RE.test(value.sha256)) throw new Error(`${label} digest is invalid`);
  if (value.redacted !== true) throw new Error(`${label} must be redacted`);
  return { bytes: value.bytes as number, sha256: value.sha256, redacted: true };
}

function parseTrace(value: unknown): readonly SanitizedRunTraceEntry[] {
  if (!Array.isArray(value)) throw new Error("run record trace must be an array");
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error("run trace entry must be an object");
    exactKeys(entry, ["seq", "tool", "operation", "input", "output"], "trace");
    if (entry.seq !== index + 1 || typeof entry.tool !== "string" || typeof entry.operation !== "string") {
      throw new Error("run trace entry identity is invalid");
    }
    const input = parseRedactedMeasurement(entry.input, "trace input");
    if (!isRecord(entry.output)) throw new Error("trace output must be an object");
    exactKeys(entry.output, ["characters", "words", "lines", "bytes", "sha256", "redacted"], "trace output");
    for (const field of ["characters", "words", "lines", "bytes"] as const) {
      if (!Number.isSafeInteger(entry.output[field]) || (entry.output[field] as number) < 0) {
        throw new Error(`trace output ${field} is invalid`);
      }
    }
    if (typeof entry.output.sha256 !== "string" || !DIGEST_RE.test(entry.output.sha256)) {
      throw new Error("trace output digest is invalid");
    }
    if (entry.output.redacted !== true) throw new Error("trace output must be redacted");
    return {
      seq: entry.seq,
      tool: entry.tool,
      operation: entry.operation,
      input,
      output: {
        characters: entry.output.characters as number,
        words: entry.output.words as number,
        lines: entry.output.lines as number,
        bytes: entry.output.bytes as number,
        sha256: entry.output.sha256,
        redacted: true,
      },
    };
  });
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`);
  return value as number;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function parseSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || !SLUG_RE.test(value)) throw new Error(`${label} must be a slug`);
  return value;
}

function parseRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "" || /[\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  if (value === ".") return value;
  if (isAbsolute(value) || /^[A-Za-z]:/u.test(value)) throw new Error(`${label} must be a normalized relative path`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return segments.join("/");
}

function parseEventIdentity(
  event: Record<string, unknown>,
  index: number,
): { readonly seq: number; readonly type: string } {
  if (event.seq !== index + 1 || typeof event.type !== "string") {
    throw new Error("run record events must be ordered and recognized");
  }
  return { seq: event.seq, type: event.type };
}

function parseEventsV2(value: unknown): readonly RunRecordEventV2[] {
  if (!Array.isArray(value)) throw new Error("run record events must be an array");
  return value.map((raw, index): RunRecordEventV2 => {
    if (!isRecord(raw)) throw new Error("run record event must be an object");
    const identity = parseEventIdentity(raw, index);
    if (identity.type === "goal.accepted" || identity.type === "run.completed") {
      exactKeys(raw, ["seq", "type"], "event");
      return { seq: identity.seq, type: identity.type };
    }
    if (identity.type === "provider.tool-requested") {
      exactKeys(raw, ["seq", "type", "turn", "tool", "operation"], "event");
      return {
        seq: identity.seq,
        type: identity.type,
        turn: positiveSafeInteger(raw.turn, "event turn"),
        tool: parseSlug(raw.tool, "event tool"),
        operation: parseSlug(raw.operation, "event operation"),
      };
    }
    if (identity.type === "policy.allowed") {
      exactKeys(raw, ["seq", "type", "call", "tool", "operation"], "event");
      return {
        seq: identity.seq,
        type: identity.type,
        call: positiveSafeInteger(raw.call, "event call"),
        tool: parseSlug(raw.tool, "event tool"),
        operation: parseSlug(raw.operation, "event operation"),
      };
    }
    if (identity.type === "tool.completed") {
      exactKeys(raw, ["seq", "type", "call", "tool", "operation", "inputBytes", "outputBytes"], "event");
      return {
        seq: identity.seq,
        type: identity.type,
        call: positiveSafeInteger(raw.call, "event call"),
        tool: parseSlug(raw.tool, "event tool"),
        operation: parseSlug(raw.operation, "event operation"),
        inputBytes: nonNegativeSafeInteger(raw.inputBytes, "event inputBytes"),
        outputBytes: nonNegativeSafeInteger(raw.outputBytes, "event outputBytes"),
      };
    }
    if (identity.type === "provider.finalized") {
      exactKeys(raw, ["seq", "type", "turn"], "event");
      return {
        seq: identity.seq,
        type: identity.type,
        turn: positiveSafeInteger(raw.turn, "event turn"),
      };
    }
    throw new Error("run record events must be ordered and recognized");
  });
}

function parseLimitsV2(value: unknown): AgentRunRecordLimits {
  if (!isRecord(value)) throw new Error("run record limits must be an object");
  exactKeys(value, ["providerTurns", "toolCalls", "totalBytes", "perToolBytes", "deadlineMs"], "limits");
  return {
    providerTurns: nonNegativeSafeInteger(value.providerTurns, "limits providerTurns"),
    toolCalls: nonNegativeSafeInteger(value.toolCalls, "limits toolCalls"),
    totalBytes: nonNegativeSafeInteger(value.totalBytes, "limits totalBytes"),
    perToolBytes: nonNegativeSafeInteger(value.perToolBytes, "limits perToolBytes"),
    deadlineMs: positiveSafeInteger(value.deadlineMs, "limits deadlineMs"),
  };
}

function parseUsageV2(value: unknown, limits: AgentRunRecordLimits): AgentRunRecordUsage {
  if (!isRecord(value)) throw new Error("run record usage must be an object");
  exactKeys(value, ["providerTurns", "toolCalls", "totalBytes"], "usage");
  const usage = {
    providerTurns: nonNegativeSafeInteger(value.providerTurns, "usage providerTurns"),
    toolCalls: nonNegativeSafeInteger(value.toolCalls, "usage toolCalls"),
    totalBytes: nonNegativeSafeInteger(value.totalBytes, "usage totalBytes"),
  };
  if (
    usage.providerTurns > limits.providerTurns
    || usage.toolCalls > limits.toolCalls
    || usage.totalBytes > limits.totalBytes
  ) {
    throw new Error("run record usage exceeds limits");
  }
  return usage;
}

function parseTraceV2(value: unknown): readonly SanitizedRunTraceEntryV2[] {
  if (!Array.isArray(value)) throw new Error("run record trace must be an array");
  return value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error("run trace entry must be an object");
    exactKeys(raw, ["seq", "tool", "operation", "path", "input", "output", "redactions"], "trace");
    if (raw.seq !== index + 1) throw new Error("run trace entries must be ordered");
    const input = parseRedactedMeasurement(raw.input, "trace input");
    if (!isRecord(raw.output)) throw new Error("trace output must be an object");
    exactKeys(raw.output, ["resultCount", "paths", "bytes", "sha256", "redacted"], "trace output");
    if (!Array.isArray(raw.output.paths)) throw new Error("trace output paths must be an array");
    const paths = raw.output.paths.map((path, pathIndex) => parseRelativePath(path, `trace output path ${pathIndex}`));
    if (new Set(paths).size !== paths.length || paths.some((path, pathIndex) => pathIndex > 0 && path <= (paths[pathIndex - 1] as string))) {
      throw new Error("trace output paths must be sorted and unique");
    }
    if (typeof raw.output.sha256 !== "string" || !DIGEST_RE.test(raw.output.sha256)) {
      throw new Error("trace output digest is invalid");
    }
    if (raw.output.redacted !== true) throw new Error("trace output must be redacted");
    if (!isRecord(raw.redactions)) throw new Error("trace redactions must be an object");
    exactKeys(raw.redactions, ["content", "query", "excerpts"], "redactions");
    if (raw.redactions.content !== true || raw.redactions.query !== true || raw.redactions.excerpts !== true) {
      throw new Error("trace fields must be redacted");
    }
    return {
      seq: raw.seq,
      tool: parseSlug(raw.tool, "trace tool"),
      operation: parseSlug(raw.operation, "trace operation"),
      path: raw.path === null ? null : parseRelativePath(raw.path, "trace path"),
      input,
      output: {
        resultCount: nonNegativeSafeInteger(raw.output.resultCount, "trace output resultCount"),
        paths: Object.freeze(paths),
        bytes: nonNegativeSafeInteger(raw.output.bytes, "trace output bytes"),
        sha256: raw.output.sha256,
        redacted: true,
      },
      redactions: { content: true, query: true, excerpts: true },
    };
  });
}

function parseTerminal(value: unknown): RunRecordTerminal {
  if (!isRecord(value)) throw new Error("run record terminal must be an object");
  if (value.status === "completed") {
    exactKeys(value, ["status", "answer"], "terminal");
    if (typeof value.answer !== "string") throw new Error("completed terminal answer must be a string");
    return { status: "completed", answer: value.answer };
  }
  if (value.status === "failed") {
    exactKeys(value, ["status", "code"], "terminal");
    if (typeof value.code !== "string" || value.code === "") throw new Error("failed terminal code must be a string");
    return { status: "failed", code: value.code };
  }
  throw new Error("run record terminal status is invalid");
}

function validateCommonRecordFields(value: Record<string, unknown>): {
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
} {
  if (typeof value.runId !== "string" || !isCanonicalRunId(value.runId)) throw new Error("run record ID must be a canonical UUID");
  if (typeof value.workspace !== "string" || !isAbsolute(value.workspace)) throw new Error("run record workspace must be absolute");
  if (typeof value.goal !== "string" || value.goal === "") throw new Error("run record goal must be non-empty");
  if (value.provider !== "deterministic" && value.provider !== "ollama") throw new Error("run record provider is invalid");
  if (
    (value.provider === "deterministic" && value.model !== null)
    || (value.provider === "ollama" && (typeof value.model !== "string" || value.model === ""))
  ) throw new Error("run record model is invalid");
  const startedAt = parseIsoTimestamp(value.startedAt, "startedAt");
  const endedAt = parseIsoTimestamp(value.endedAt, "endedAt");
  if (Date.parse(endedAt) < Date.parse(startedAt)) throw new Error("run record end precedes start");
  return {
    runId: value.runId,
    workspace: value.workspace,
    goal: value.goal,
    provider: value.provider,
    model: value.model === null ? null : value.model as string,
    startedAt,
    endedAt,
  };
}

function validateTerminalEvents(
  terminal: RunRecordTerminal,
  events: readonly { readonly type: string }[],
): void {
  if (terminal.status === "completed" && !events.some((event) => event.type === "run.completed")) {
    throw new Error("completed run record lacks run.completed event");
  }
  if (terminal.status === "failed" && events.some((event) => event.type === "run.completed")) {
    throw new Error("failed run record contains run.completed event");
  }
}

function parseRunRecordV1(value: Record<string, unknown>): RunRecordV1 {
  exactKeys(value, [
    "version",
    "runId",
    "workspace",
    "goal",
    "provider",
    "model",
    "limits",
    "events",
    "trace",
    "terminal",
    "startedAt",
    "endedAt",
  ], "run record");
  const common = validateCommonRecordFields(value);
  if (!isRecord(value.limits)) throw new Error("run record limits must be an object");
  exactKeys(value.limits, ["providerTurns", "toolCalls"], "limits");
  if (value.limits.providerTurns !== 2 || value.limits.toolCalls !== 1) throw new Error("run record limits are invalid");
  const events = parseEvents(value.events);
  const trace = parseTrace(value.trace);
  const terminal = parseTerminal(value.terminal);
  validateTerminalEvents(terminal, events);
  return {
    version: RUN_RECORD_VERSION,
    ...common,
    limits: { providerTurns: 2, toolCalls: 1 },
    events,
    trace,
    terminal,
  };
}

function validateV2History(
  events: readonly RunRecordEventV2[],
  usage: AgentRunRecordUsage,
  trace: readonly SanitizedRunTraceEntryV2[],
  terminal: RunRecordTerminal,
): void {
  if (events.length === 0) {
    if (terminal.status !== "failed" || usage.providerTurns !== 0 || usage.toolCalls !== 0 || trace.length !== 0) {
      throw new Error("run record history is inconsistent");
    }
    return;
  }
  if (events[0]?.type !== "goal.accepted") throw new Error("run record history must begin with goal.accepted");

  type State = "provider" | "policy" | "tool" | "finalized" | "completed";
  let state: State = "provider";
  let expectedTurn = 1;
  let expectedCall = 1;
  let completedCalls = 0;
  let pendingTool = "";
  let pendingOperation = "";

  for (const event of events.slice(1)) {
    if (state === "provider" && event.type === "provider.tool-requested") {
      if (event.turn !== expectedTurn) throw new Error("run record provider turns are inconsistent");
      expectedTurn += 1;
      pendingTool = event.tool;
      pendingOperation = event.operation;
      state = "policy";
      continue;
    }
    if (state === "provider" && event.type === "provider.finalized") {
      if (event.turn !== expectedTurn) throw new Error("run record provider turns are inconsistent");
      expectedTurn += 1;
      state = "finalized";
      continue;
    }
    if (state === "policy" && event.type === "policy.allowed") {
      if (
        event.call !== expectedCall
        || event.tool !== pendingTool
        || event.operation !== pendingOperation
      ) {
        throw new Error("run record policy history is inconsistent");
      }
      state = "tool";
      continue;
    }
    if (state === "tool" && event.type === "tool.completed") {
      if (
        event.call !== expectedCall
        || event.tool !== pendingTool
        || event.operation !== pendingOperation
      ) {
        throw new Error("run record tool history is inconsistent");
      }
      expectedCall += 1;
      completedCalls += 1;
      state = "provider";
      continue;
    }
    if (state === "finalized" && event.type === "run.completed") {
      state = "completed";
      continue;
    }
    throw new Error("run record event state is inconsistent");
  }

  const decisionTurns = expectedTurn - 1;
  if (terminal.status === "completed") {
    if (
      state !== "completed"
      || usage.providerTurns !== decisionTurns
      || usage.toolCalls !== completedCalls
      || trace.length !== completedCalls
    ) {
      throw new Error("completed run record history is inconsistent");
    }
    return;
  }

  if (state === "finalized" || state === "completed") throw new Error("failed run record finalized successfully");
  const expectedToolCalls = completedCalls + (state === "tool" ? 1 : 0);
  const providerUsageIsValid = state === "provider"
    ? usage.providerTurns === decisionTurns || usage.providerTurns === decisionTurns + 1
    : usage.providerTurns === decisionTurns;
  if (
    !providerUsageIsValid
    || usage.toolCalls !== expectedToolCalls
    || trace.length !== completedCalls
  ) {
    throw new Error("failed run record history is inconsistent");
  }
}

function parseRunRecordV2(value: Record<string, unknown>): RunRecordV2 {
  exactKeys(value, [
    "version",
    "runId",
    "workspace",
    "goal",
    "provider",
    "model",
    "limits",
    "usage",
    "events",
    "trace",
    "terminal",
    "startedAt",
    "endedAt",
  ], "run record");
  const common = validateCommonRecordFields(value);
  const limits = parseLimitsV2(value.limits);
  const usage = parseUsageV2(value.usage, limits);
  const events = parseEventsV2(value.events);
  const trace = parseTraceV2(value.trace);
  const terminal = parseTerminal(value.terminal);
  validateV2History(events, usage, trace, terminal);
  const completedEvents = events.filter((event): event is Extract<RunRecordEventV2, { type: "tool.completed" }> => (
    event.type === "tool.completed"
  ));
  if (completedEvents.length !== trace.length) throw new Error("run record trace does not match completed tools");
  let tracedBytes = 0;
  for (let index = 0; index < trace.length; index += 1) {
    const entry = trace[index] as SanitizedRunTraceEntryV2;
    const event = completedEvents[index] as Extract<RunRecordEventV2, { type: "tool.completed" }>;
    if (
      event.call !== index + 1
      || event.tool !== entry.tool
      || event.operation !== entry.operation
      || event.inputBytes !== entry.input.bytes
      || event.outputBytes !== entry.output.bytes
    ) {
      throw new Error("run record trace does not match completed tools");
    }
    if (entry.input.bytes + entry.output.bytes > limits.perToolBytes) {
      throw new Error("run record trace exceeds per-tool byte limit");
    }
    tracedBytes += entry.input.bytes + entry.output.bytes;
  }
  if (tracedBytes > usage.totalBytes) throw new Error("run record trace exceeds total byte usage");
  validateTerminalEvents(terminal, events);
  return {
    version: RUN_RECORD_VERSION_V2,
    ...common,
    limits,
    usage,
    events,
    trace,
    terminal,
  };
}

function parseProjectPluginTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new Error(`${label} must be a bounded ISO timestamp`);
  }
  return parseIsoTimestamp(value, label);
}

function parseDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw new Error(`${label} must be a digest`);
  return value;
}

function parseProjectProvider(value: unknown): ProjectPluginRunRecordV3["provider"] {
  if (!isRecord(value)) throw new Error("run record provider must be an object");
  exactKeys(value, ["name", "model"], "provider");
  if (value.name !== "deterministic" && value.name !== "ollama") throw new Error("run record provider name is invalid");
  if (
    (value.name === "deterministic" && value.model !== null)
    || (value.name === "ollama" && (typeof value.model !== "string" || !MODEL_RE.test(value.model)))
  ) {
    throw new Error("run record provider model is invalid");
  }
  return { name: value.name, model: value.model === null ? null : value.model as string };
}

function parseProjectCommitments(value: unknown): ProjectPluginRunRecordCommitments {
  if (!isRecord(value)) throw new Error("run record commitments must be an object");
  exactKeys(value, ["project", "plugin", "approval", "registry", "runtime"], "commitments");
  if (!isRecord(value.project)) throw new Error("run record project must be an object");
  exactKeys(value.project, ["projectConfigDigest"], "project");
  if (!isRecord(value.plugin)) throw new Error("run record plugin must be an object");
  exactKeys(value.plugin, ["id", "operation", "manifestDigest", "sourceDigest"], "plugin");
  if (value.plugin.operation !== "slugify") throw new Error("run record plugin operation is invalid");
  if (!isRecord(value.approval)) throw new Error("run record approval must be an object");
  exactKeys(value.approval, ["approvalDigest"], "approval");
  if (!isRecord(value.registry)) throw new Error("run record registry must be an object");
  exactKeys(value.registry, ["registryDigest"], "registry");
  if (!isRecord(value.runtime)) throw new Error("run record runtime must be an object");
  exactKeys(value.runtime, ["versionDigest", "runnerDigest", "imageDigest", "profileDigest"], "runtime");
  return {
    project: { projectConfigDigest: parseDigest(value.project.projectConfigDigest, "project config digest") },
    plugin: {
      id: parseSlug(value.plugin.id, "plugin ID"),
      operation: "slugify",
      manifestDigest: parseDigest(value.plugin.manifestDigest, "plugin manifest digest"),
      sourceDigest: parseDigest(value.plugin.sourceDigest, "plugin source digest"),
    },
    approval: { approvalDigest: parseDigest(value.approval.approvalDigest, "approval digest") },
    registry: { registryDigest: parseDigest(value.registry.registryDigest, "registry digest") },
    runtime: {
      versionDigest: parseDigest(value.runtime.versionDigest, "runtime version digest"),
      runnerDigest: parseDigest(value.runtime.runnerDigest, "runtime runner digest"),
      imageDigest: parseDigest(value.runtime.imageDigest, "runtime image digest"),
      profileDigest: parseDigest(value.runtime.profileDigest, "runtime profile digest"),
    },
  };
}

function parseProjectLimits(value: unknown): Readonly<typeof PROJECT_PLUGIN_RUN_LIMITS> {
  const limits = parseLimitsV2(value);
  for (const key of Object.keys(PROJECT_PLUGIN_RUN_LIMITS) as (keyof typeof PROJECT_PLUGIN_RUN_LIMITS)[]) {
    if (limits[key] !== PROJECT_PLUGIN_RUN_LIMITS[key]) throw new Error(`run record limits ${key} are invalid`);
  }
  return PROJECT_PLUGIN_RUN_LIMITS;
}

function parseProjectTrace(value: unknown): ProjectPluginRunRecordV3["trace"] {
  if (!Array.isArray(value) || value.length > 1) throw new Error("run record trace must contain at most one entry");
  return value.map((entry): ProjectPluginRunRecordV3["trace"][number] => {
    if (!isRecord(entry)) throw new Error("run trace entry must be an object");
    exactKeys(entry, ["seq", "tool", "operation", "inputBytes", "outputBytes"], "trace");
    if (entry.seq !== 1) throw new Error("run trace sequence is invalid");
    if (entry.operation !== "slugify") throw new Error("run trace operation is invalid");
    return {
      seq: 1,
      tool: parseSlug(entry.tool, "trace tool"),
      operation: "slugify",
      inputBytes: nonNegativeSafeInteger(entry.inputBytes, "trace inputBytes"),
      outputBytes: nonNegativeSafeInteger(entry.outputBytes, "trace outputBytes"),
    };
  });
}

function parseProjectTerminal(value: unknown): RunRecordTerminal {
  if (!isRecord(value)) throw new Error("run record terminal must be an object");
  if (value.status === "completed") {
    exactKeys(value, ["status", "answer"], "terminal");
    return { status: "completed", answer: parseSlug(value.answer, "terminal answer") };
  }
  if (value.status === "failed") {
    exactKeys(value, ["status", "code"], "terminal");
    if (typeof value.code !== "string" || !PROJECT_PLUGIN_FAILURE_CODES.has(value.code)) {
      throw new Error("run record failure code is invalid");
    }
    return { status: "failed", code: value.code };
  }
  throw new Error("run record terminal status is invalid");
}

function parseProjectCleanup(value: unknown): ProjectPluginRunRecordV3["cleanup"] {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("run record cleanup must be an object or null");
  exactKeys(value, ["trigger", "exitCode", "oomKilled", "confirmedAbsent", "cleanupErrorCount", "settlementMs"], "cleanup");
  if (typeof value.trigger !== "string" || !CLEANUP_TRIGGERS.has(value.trigger)) throw new Error("run record cleanup trigger is invalid");
  const exitCode = value.exitCode;
  if (exitCode !== null && (typeof exitCode !== "number" || !Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255)) {
    throw new Error("run record cleanup exit code is invalid");
  }
  if (value.oomKilled !== null && typeof value.oomKilled !== "boolean") throw new Error("run record cleanup oom state is invalid");
  if (typeof value.confirmedAbsent !== "boolean") throw new Error("run record cleanup absence state is invalid");
  const cleanupErrorCount = nonNegativeSafeInteger(value.cleanupErrorCount, "cleanup error count");
  if (cleanupErrorCount > MAX_CLEANUP_ERROR_COUNT) throw new Error("run record cleanup error count is invalid");
  const settlementMs = nonNegativeSafeInteger(value.settlementMs, "cleanup settlement milliseconds");
  if (settlementMs > MAX_SETTLEMENT_MS) throw new Error("run record cleanup settlement milliseconds are invalid");
  return {
    trigger: value.trigger,
    exitCode: exitCode === null ? null : exitCode,
    oomKilled: value.oomKilled === null ? null : value.oomKilled as boolean,
    confirmedAbsent: value.confirmedAbsent,
    cleanupErrorCount,
    settlementMs,
  };
}

function validateProjectHistory(input: {
  readonly events: readonly RunRecordEventV2[];
  readonly usage: AgentRunRecordUsage;
  readonly trace: ProjectPluginRunRecordV3["trace"];
  readonly terminal: RunRecordTerminal;
  readonly cleanup: ProjectPluginRunRecordV3["cleanup"];
  readonly plugin: ProjectPluginRunRecordCommitments["plugin"];
}): void {
  validateV2History(input.events, input.usage, input.trace as unknown as readonly SanitizedRunTraceEntryV2[], input.terminal);
  const completed = input.events.filter((event): event is Extract<RunRecordEventV2, { type: "tool.completed" }> => event.type === "tool.completed");
  if (completed.length !== input.trace.length) throw new Error("run record trace does not match completed tools");
  for (let index = 0; index < completed.length; index += 1) {
    const event = completed[index] as Extract<RunRecordEventV2, { type: "tool.completed" }>;
    const trace = input.trace[index] as ProjectPluginRunRecordV3["trace"][number];
    if (
      event.call !== trace.seq || event.tool !== trace.tool || event.operation !== trace.operation
      || event.inputBytes !== trace.inputBytes || event.outputBytes !== trace.outputBytes
    ) throw new Error("run record trace does not match completed tools");
    if (trace.inputBytes + trace.outputBytes > PROJECT_PLUGIN_RUN_LIMITS.perToolBytes) {
      throw new Error("run record trace exceeds per-tool byte limit");
    }
  }
  for (const event of input.events) {
    if (
      (event.type === "provider.tool-requested" || event.type === "policy.allowed" || event.type === "tool.completed")
      && (event.tool !== input.plugin.id || event.operation !== input.plugin.operation)
    ) {
      throw new Error("run record history does not match the approved plugin");
    }
  }
  if (input.trace.some((entry) => entry.tool !== input.plugin.id || entry.operation !== input.plugin.operation)) {
    throw new Error("run record trace does not match the approved plugin");
  }
  const tracedBytes = input.trace.reduce((total, entry) => total + entry.inputBytes + entry.outputBytes, 0);
  if (tracedBytes > input.usage.totalBytes) throw new Error("run record trace exceeds total byte usage");

  const policyAllowed = input.events.some((event) => event.type === "policy.allowed");
  if (input.cleanup === null && (completed.length > 0 || input.terminal.status === "completed")) {
    throw new Error("run record lifecycle receipt is required");
  }
  if (input.cleanup !== null && !policyAllowed && completed.length === 0) {
    throw new Error("run record cleanup lacks a plugin lifecycle");
  }
  if (input.terminal.status === "completed") {
    if (
      input.usage.providerTurns !== 2 || input.usage.toolCalls !== 1 || input.trace.length !== 1
      || input.cleanup === null || !input.cleanup.confirmedAbsent || input.cleanup.cleanupErrorCount !== 0
      || input.cleanup.exitCode !== 0 || input.cleanup.oomKilled === true
    ) throw new Error("completed run cleanup or history is inconsistent");
  }
}

function parseRunRecordV3(value: Record<string, unknown>): ProjectPluginRunRecordV3 {
  exactKeys(value, [
    "version", "runId", "provider", "project", "plugin", "approval", "registry", "runtime", "boundary", "limits",
    "usage", "events", "trace", "terminal", "cleanup", "startedAt", "endedAt",
  ], "run record");
  if (typeof value.runId !== "string" || !isCanonicalRunId(value.runId)) throw new Error("run record ID must be a canonical UUID");
  const provider = parseProjectProvider(value.provider);
  const commitments = parseProjectCommitments({
    project: value.project,
    plugin: value.plugin,
    approval: value.approval,
    registry: value.registry,
    runtime: value.runtime,
  });
  if (!isRecord(value.boundary)) throw new Error("run record boundary must be an object");
  exactKeys(value.boundary, ["executor", "authority", "sandboxed", "claim"], "boundary");
  if (
    value.boundary.executor !== "spawn" || value.boundary.authority !== "ambient-host"
    || value.boundary.sandboxed !== false || value.boundary.claim !== "identity-and-owner-approval"
  ) throw new Error("run record boundary authority is invalid");
  const limits = parseProjectLimits(value.limits);
  const usage = parseUsageV2(value.usage, limits);
  const events = parseEventsV2(value.events);
  const trace = parseProjectTrace(value.trace);
  const terminal = parseProjectTerminal(value.terminal);
  const cleanup = parseProjectCleanup(value.cleanup);
  const startedAt = parseProjectPluginTimestamp(value.startedAt, "startedAt");
  const endedAt = parseProjectPluginTimestamp(value.endedAt, "endedAt");
  if (Date.parse(endedAt) < Date.parse(startedAt)) throw new Error("run record end precedes start");
  validateProjectHistory({ events, usage, trace, terminal, cleanup, plugin: commitments.plugin });
  return {
    version: RUN_RECORD_VERSION_V3,
    runId: value.runId,
    provider,
    ...commitments,
    boundary: { executor: "spawn", authority: "ambient-host", sandboxed: false, claim: "identity-and-owner-approval" },
    limits,
    usage,
    events,
    trace,
    terminal,
    cleanup,
    startedAt,
    endedAt,
  };
}

export function parseRunRecord(serialized: string): StoredRunRecord {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Run record contains malformed JSON.");
  }
  if (!isRecord(value)) throw new Error("run record must be a JSON object");
  if (value.version === RUN_RECORD_VERSION) return parseRunRecordV1(value);
  if (value.version === RUN_RECORD_VERSION_V2) return parseRunRecordV2(value);
  if (value.version === RUN_RECORD_VERSION_V3) {
    parseJsonWithoutDuplicateMembers(serialized);
    return parseRunRecordV3(value);
  }
  throw new Error(`unsupported run record version: ${String(value.version)}`);
}

function parseJsonWithoutDuplicateMembers(text: string): unknown {
  let offset = 0;
  const whitespace = /[\t\n\r ]/y;
  const string = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const skip = (): void => {
    while (true) {
      whitespace.lastIndex = offset;
      if (whitespace.exec(text) === null) return;
      offset = whitespace.lastIndex;
    }
  };
  const value = (): unknown => {
    skip();
    if (text[offset] === "{") {
      offset += 1;
      skip();
      const object: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset += 1;
        return object;
      }
      while (true) {
        string.lastIndex = offset;
        const keyToken = string.exec(text);
        if (keyToken === null) throw new SyntaxError("invalid JSON object key");
        offset = string.lastIndex;
        const key = JSON.parse(keyToken[0]) as string;
        if (keys.has(key)) throw new SyntaxError("duplicate JSON object key");
        keys.add(key);
        skip();
        if (text[offset] !== ":") throw new SyntaxError("invalid JSON object");
        offset += 1;
        object[key] = value();
        skip();
        if (text[offset] === "}") {
          offset += 1;
          return object;
        }
        if (text[offset] !== ",") throw new SyntaxError("invalid JSON object");
        offset += 1;
        skip();
      }
    }
    if (text[offset] === "[") {
      offset += 1;
      const result: unknown[] = [];
      skip();
      if (text[offset] === "]") {
        offset += 1;
        return result;
      }
      while (true) {
        result.push(value());
        skip();
        if (text[offset] === "]") {
          offset += 1;
          return result;
        }
        if (text[offset] !== ",") throw new SyntaxError("invalid JSON array");
        offset += 1;
      }
    }
    string.lastIndex = offset;
    const stringToken = string.exec(text);
    if (stringToken !== null) {
      offset = string.lastIndex;
      return JSON.parse(stringToken[0]);
    }
    number.lastIndex = offset;
    const numberToken = number.exec(text);
    if (numberToken !== null) {
      offset = number.lastIndex;
      return JSON.parse(numberToken[0]);
    }
    for (const literal of ["true", "false", "null"] as const) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return JSON.parse(literal);
      }
    }
    throw new SyntaxError("invalid JSON value");
  };
  const parsed = value();
  skip();
  if (offset !== text.length) throw new SyntaxError("invalid trailing JSON");
  return parsed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function runtimeEvents(result: Record<string, unknown>): readonly RunRecordEvent[] {
  return parseEvents(result.events);
}

function serializeJson(value: unknown, label: string): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (serialized === undefined) throw new Error(`${label} must be JSON serializable`);
  return serialized;
}

function terminalFromResult(result: Record<string, unknown>): RunRecordTerminal {
  if (result.status === "completed" && typeof result.answer === "string") {
    return { status: "completed", answer: result.answer };
  }
  if (result.status === "failed" && typeof result.code === "string" && result.code !== "") {
    return { status: "failed", code: result.code };
  }
  throw new Error("invalid runtime result");
}

function normalizedTracePath(call: Record<string, unknown>): string | null {
  if (isRecord(call.result) && typeof call.result.path === "string") {
    return parseRelativePath(call.result.path, "runtime tool result path");
  }
  if (isRecord(call.input) && typeof call.input.path === "string") {
    return parseRelativePath(call.input.path, "runtime tool input path");
  }
  return null;
}

function traceOutputPaths(call: Record<string, unknown>): readonly string[] {
  if (!isRecord(call.result)) return [];
  const candidates: unknown[] = [];
  if (call.operation === "read" && Object.hasOwn(call.result, "path")) candidates.push(call.result.path);
  for (const field of ["entries", "matches"] as const) {
    const collection = call.result[field];
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!isRecord(item) || !Object.hasOwn(item, "path")) {
        throw new Error(`runtime tool result ${field} path is invalid`);
      }
      candidates.push(item.path);
    }
  }
  return [...new Set(candidates.map((path, index) => (
    parseRelativePath(path, `runtime tool output path ${index}`)
  )))].sort();
}

function traceResultCount(call: Record<string, unknown>): number {
  if (!isRecord(call.result)) return call.result === null ? 0 : 1;
  if (Array.isArray(call.result.entries)) return call.result.entries.length;
  if (Array.isArray(call.result.matches)) return call.result.matches.length;
  return 1;
}

function createGeneralTrace(result: Record<string, unknown>): readonly SanitizedRunTraceEntryV2[] {
  if (!Array.isArray(result.toolCalls)) throw new Error("invalid general runtime tool calls");
  return result.toolCalls.map((raw, index): SanitizedRunTraceEntryV2 => {
    if (
      !isRecord(raw)
      || typeof raw.tool !== "string"
      || typeof raw.operation !== "string"
      || !Object.hasOwn(raw, "input")
      || !Object.hasOwn(raw, "result")
    ) {
      throw new Error("invalid general runtime tool call");
    }
    const serializedInput = serializeJson(raw.input, "runtime tool input");
    const serializedOutput = serializeJson(raw.result, "runtime tool result");
    const inputBytes = Buffer.byteLength(serializedInput, "utf8");
    const outputBytes = Buffer.byteLength(serializedOutput, "utf8");
    if (raw.inputBytes !== inputBytes || raw.outputBytes !== outputBytes) {
      throw new Error("runtime tool byte measurements do not match payloads");
    }
    return {
      seq: index + 1,
      tool: raw.tool,
      operation: raw.operation,
      path: normalizedTracePath(raw),
      input: { bytes: inputBytes, sha256: sha256(serializedInput), redacted: true },
      output: {
        resultCount: traceResultCount(raw),
        paths: traceOutputPaths(raw),
        bytes: outputBytes,
        sha256: sha256(serializedOutput),
        redacted: true,
      },
      redactions: { content: true, query: true, excerpts: true },
    };
  });
}

function createRunRecordV2(input: {
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly result: Record<string, unknown>;
  readonly startedAt: string;
  readonly endedAt: string;
}): RunRecordV2 {
  const terminal = terminalFromResult(input.result);
  const trace = createGeneralTrace(input.result);
  return parseRunRecordV2({
    version: RUN_RECORD_VERSION_V2,
    runId: input.runId,
    workspace: input.workspace,
    goal: input.goal,
    provider: input.provider,
    model: input.model,
    limits: input.result.limits,
    usage: input.result.usage,
    events: input.result.events,
    trace,
    terminal,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  });
}

function createRunRecordV1(input: {
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly result: Record<string, unknown>;
  readonly startedAt: string;
  readonly endedAt: string;
}): RunRecordV1 {
  const events = runtimeEvents(input.result);
  let trace: readonly SanitizedRunTraceEntry[] = [];
  const terminal = terminalFromResult(input.result);
  if (terminal.status === "completed") {
    if (!Array.isArray(input.result.toolCalls) || input.result.toolCalls.length !== 1) {
      throw new Error("invalid completed runtime result");
    }
    const call = input.result.toolCalls[0];
    if (!isRecord(call) || typeof call.tool !== "string" || typeof call.operation !== "string" || !isRecord(call.result)) {
      throw new Error("invalid completed runtime tool result");
    }
    exactKeys(call.result, ["text", "characters", "words", "lines"], "tool result");
    if (
      typeof call.result.text !== "string"
      || !Number.isSafeInteger(call.result.characters)
      || !Number.isSafeInteger(call.result.words)
      || !Number.isSafeInteger(call.result.lines)
    ) {
      throw new Error("invalid completed runtime tool result");
    }
    const rawOutput = JSON.stringify(call.result);
    trace = [{
      seq: 1,
      tool: call.tool,
      operation: call.operation,
      input: {
        bytes: Buffer.byteLength(call.result.text, "utf8"),
        sha256: sha256(call.result.text),
        redacted: true,
      },
      output: {
        characters: call.result.characters as number,
        words: call.result.words as number,
        lines: call.result.lines as number,
        bytes: Buffer.byteLength(rawOutput, "utf8"),
        sha256: sha256(rawOutput),
        redacted: true,
      },
    }];
  }
  return parseRunRecordV1({
    version: RUN_RECORD_VERSION,
    runId: input.runId,
    workspace: input.workspace,
    goal: input.goal,
    provider: input.provider,
    model: input.model,
    limits: { providerTurns: 2, toolCalls: 1 },
    events,
    trace,
    terminal,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  });
}

export type ProjectPluginAgentRunResult = AgentRunResult;
export type ProjectPluginLifecycleReceipt = PluginLifecycleReceipt;

export interface ProjectPluginRunRecordInput {
  readonly metadata: {
    readonly runId: string;
    readonly provider: { readonly name: "deterministic" | "ollama"; readonly model: string | null };
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly commitments: ProjectPluginRunRecordCommitments;
  readonly result: ProjectPluginAgentRunResult;
  readonly lifecycleStarted: boolean;
  readonly receipt?: ProjectPluginLifecycleReceipt;
  readonly lifecycleStartedAtMs?: number;
}

function parseProjectConstructorResult(
  value: unknown,
  provider: ProjectPluginRunRecordV3["provider"],
): {
  readonly terminal: RunRecordTerminal;
  readonly limits: unknown;
  readonly usage: unknown;
  readonly events: unknown;
  readonly trace: unknown;
} {
  if (!isRecord(value)) throw new Error("project plugin result must be an object");
  if (value.status === "completed") {
    exactKeys(value, ["status", "answer", "provider", "model", "limits", "usage", "toolCalls", "events"], "project plugin result");
    if (value.provider !== provider.name || value.model !== provider.model) throw new Error("project plugin result provider is invalid");
    if (!Array.isArray(value.toolCalls) || value.toolCalls.length !== 1 || !isRecord(value.toolCalls[0])) {
      throw new Error("project plugin result tool calls are invalid");
    }
    const call = value.toolCalls[0];
    exactKeys(call, ["tool", "operation", "inputBytes", "outputBytes"], "project plugin tool call");
    return {
      terminal: { status: "completed", answer: parseSlug(value.answer, "terminal answer") },
      limits: value.limits,
      usage: value.usage,
      events: value.events,
      trace: [{ seq: 1, tool: call.tool, operation: call.operation, inputBytes: call.inputBytes, outputBytes: call.outputBytes }],
    };
  }
  if (value.status === "failed") {
    exactKeys(value, ["status", "code", "limits", "usage", "toolCalls", "events"], "project plugin result");
    if (!Array.isArray(value.toolCalls) || value.toolCalls.length > 1) throw new Error("project plugin result tool calls are invalid");
    const trace = value.toolCalls.map((call, index) => {
      if (!isRecord(call)) throw new Error("project plugin result tool calls are invalid");
      exactKeys(call, ["tool", "operation", "inputBytes", "outputBytes"], "project plugin tool call");
      return { seq: index + 1, tool: call.tool, operation: call.operation, inputBytes: call.inputBytes, outputBytes: call.outputBytes };
    });
    return {
      terminal: { status: "failed", code: value.code as string },
      limits: value.limits,
      usage: value.usage,
      events: value.events,
      trace,
    };
  }
  throw new Error("project plugin result status is invalid");
}

function sanitizeProjectCleanup(
  receipt: unknown,
  lifecycleStartedAtMs: unknown,
  expectedPluginId: string,
): ProjectPluginRunRecordV3["cleanup"] {
  if (!isRecord(receipt)) throw new Error("project plugin lifecycle receipt is invalid");
  exactKeys(receipt, [
    "v", "requestId", "pluginId", "containerId", "trigger", "hardDeadlineAtMs", "daemonState", "exitCode", "oomKilled",
    "confirmedAbsent", "cleanupErrors", "settledAtMs",
  ], "project plugin lifecycle receipt");
  if (
    receipt.v !== 1
    || typeof receipt.requestId !== "string"
    || receipt.pluginId !== expectedPluginId
    || typeof receipt.daemonState !== "string"
  ) {
    throw new Error("project plugin lifecycle receipt is invalid");
  }
  if (receipt.containerId !== null && typeof receipt.containerId !== "string") throw new Error("project plugin lifecycle receipt is invalid");
  const settledAtMs = receipt.settledAtMs;
  const startedAtMs = lifecycleStartedAtMs;
  if (
    typeof receipt.hardDeadlineAtMs !== "number" || !Number.isSafeInteger(receipt.hardDeadlineAtMs)
    || typeof settledAtMs !== "number" || !Number.isSafeInteger(settledAtMs)
  ) {
    throw new Error("project plugin lifecycle receipt is invalid");
  }
  if (!Array.isArray(receipt.cleanupErrors) || receipt.cleanupErrors.some((entry) => typeof entry !== "string")) {
    throw new Error("project plugin lifecycle receipt is invalid");
  }
  if (typeof startedAtMs !== "number" || !Number.isSafeInteger(startedAtMs) || startedAtMs < 0 || settledAtMs < startedAtMs) {
    throw new Error("project plugin lifecycle clock is invalid");
  }
  return parseProjectCleanup({
    trigger: receipt.trigger,
    exitCode: receipt.exitCode,
    oomKilled: receipt.oomKilled,
    confirmedAbsent: receipt.confirmedAbsent,
    cleanupErrorCount: receipt.cleanupErrors.length,
    settlementMs: settledAtMs - startedAtMs,
  });
}

export function createProjectPluginRunRecord(input: ProjectPluginRunRecordInput): ProjectPluginRunRecordV3 {
  if (!isRecord(input)) throw new Error("project plugin run input must be an object");
  const inputKeys = Object.keys(input);
  if (inputKeys.some((key) => !["metadata", "commitments", "result", "lifecycleStarted", "receipt", "lifecycleStartedAtMs"].includes(key))) {
    throw new Error("unknown project plugin run input field");
  }
  for (const key of ["metadata", "commitments", "result", "lifecycleStarted"] as const) {
    if (!Object.hasOwn(input, key)) throw new Error(`missing project plugin run input field: ${key}`);
  }
  if (!isRecord(input.metadata)) throw new Error("project plugin metadata must be an object");
  exactKeys(input.metadata, ["runId", "provider", "startedAt", "endedAt"], "project plugin metadata");
  const provider = parseProjectProvider(input.metadata.provider);
  const commitments = parseProjectCommitments(input.commitments);
  const result = parseProjectConstructorResult(input.result, provider);
  if (typeof input.lifecycleStarted !== "boolean") {
    throw new Error("project plugin lifecycle state is invalid");
  }
  const hasReceipt = input.receipt !== undefined;
  const hasLifecycleClock = input.lifecycleStartedAtMs !== undefined;
  const lifecycleStarted = input.lifecycleStarted;
  if (hasReceipt !== hasLifecycleClock || lifecycleStarted !== hasReceipt) {
    throw new Error("project plugin lifecycle receipt and clock must match lifecycle state");
  }
  const cleanup = lifecycleStarted
    ? sanitizeProjectCleanup(input.receipt, input.lifecycleStartedAtMs, commitments.plugin.id)
    : null;
  return parseRunRecordV3({
    version: RUN_RECORD_VERSION_V3,
    runId: input.metadata.runId,
    provider,
    ...commitments,
    boundary: { executor: "spawn", authority: "ambient-host", sandboxed: false, claim: "identity-and-owner-approval" },
    limits: result.limits,
    usage: result.usage,
    events: result.events,
    trace: result.trace,
    terminal: result.terminal,
    cleanup,
    startedAt: input.metadata.startedAt,
    endedAt: input.metadata.endedAt,
  });
}

export function createRunRecord(input: {
  readonly runId: string;
  readonly workspace: string;
  readonly goal: string;
  readonly provider: "deterministic" | "ollama";
  readonly model: string | null;
  readonly result: unknown;
  readonly startedAt: string;
  readonly endedAt: string;
}): RunRecord {
  if (!isRecord(input.result)) throw new Error("invalid runtime result");
  if (Object.hasOwn(input.result, "limits") || Object.hasOwn(input.result, "usage")) {
    return createRunRecordV2({ ...input, result: input.result });
  }
  return createRunRecordV1({ ...input, result: input.result });
}

async function assertSafeDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory`);
}

async function ensureRunDirectories(paths: ReturnType<typeof prismStatePaths>): Promise<void> {
  await mkdir(paths.prism, { recursive: true, mode: 0o700 });
  await assertSafeDirectory(paths.prism, "Prism state directory");
  await mkdir(paths.runs, { recursive: true, mode: 0o700 });
  await assertSafeDirectory(paths.runs, "Prism runs directory");
}

function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

export async function writeRunRecord(input: {
  readonly environment: StateEnvironment;
  readonly record: StoredRunRecord;
}): Promise<string> {
  const record = parseRunRecord(JSON.stringify(input.record));
  const paths = prismStatePaths(input);
  await ensureRunDirectories(paths);
  const path = join(paths.runs, `${record.runId}.json`);
  try {
    await lstat(path);
    throw new Error(`run record already exists: ${record.runId}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("run record already exists:")) throw error;
    if (typeof error !== "object" || error === null || Reflect.get(error, "code") !== "ENOENT") throw error;
  }
  await writeJsonAtomically({
    path,
    value: record,
    directoryMode: 0o700,
    fileMode: 0o600,
  });
  return path;
}

export async function readRunRecord(input: {
  readonly environment: StateEnvironment;
  readonly runId: string;
}): Promise<StoredRunRecord> {
  if (!isCanonicalRunId(input.runId)) throw new Error("run ID must be a canonical UUID");
  const paths = prismStatePaths(input);
  await assertSafeDirectory(paths.prism, "Prism state directory");
  await assertSafeDirectory(paths.runs, "Prism runs directory");
  const path = join(paths.runs, `${input.runId}.json`);
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error("run record must not be a symlink");
  if (!stat.isFile()) throw new Error("run record must be a regular file");
  const [realRuns, realRecord] = await Promise.all([realpath(paths.runs), realpath(path)]);
  if (!isWithin(realRuns, realRecord)) throw new Error("run record escapes the state root");
  const record = parseRunRecord(await readFile(realRecord, "utf8"));
  if (record.runId !== input.runId) throw new Error("run record ID does not match its filename");
  return record;
}
