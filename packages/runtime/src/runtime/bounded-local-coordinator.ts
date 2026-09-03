import type { PluginLifecycleReceipt } from "../kernel/plugin-container-port.ts";
import { normalizeJsonValue } from "@useprism/sdk/json";
import {
  validateProviderDecision,
  type ProviderDecision,
} from "@useprism/sdk/provider-decision";
import type { PolicyAdmissionOutcome } from "@useprism/sdk/policy";
import type { JsonValue } from "@useprism/sdk/protocol";
import { computeToolRequestDigest } from "./run-agent.ts";

const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQUIRED_TOOL = "text-stats";
const REQUIRED_OPERATION = "analyze-text";

export interface ProviderTurnOneRequest {
  readonly goal: string;
  readonly turn: 1;
}

export interface ProviderTurnTwoRequest {
  readonly goal: string;
  readonly turn: 2;
  readonly toolResult: TextStatsResult;
}

export type ProviderTurnRequest = ProviderTurnOneRequest | ProviderTurnTwoRequest;

export interface CoordinatorPolicyRequest {
  readonly tool: string;
  readonly operation: string;
  readonly callCount: number;
  readonly input: JsonValue;
  readonly requestDigest: string;
}

export interface CoordinatorToolRequest {
  readonly tool: string;
  readonly operation: string;
  readonly input: JsonValue;
}

export type CoordinatorPluginResult<T> =
  | { readonly ok: true; readonly value: T; readonly receipt: PluginLifecycleReceipt }
  | { readonly ok: false; readonly code: string; readonly receipt?: PluginLifecycleReceipt };

export interface BoundedLocalCoordinatorPorts {
  provider(request: ProviderTurnRequest): Promise<CoordinatorPluginResult<unknown>>;
  policy(request: CoordinatorPolicyRequest): Promise<CoordinatorPluginResult<PolicyAdmissionOutcome>>;
  tool(request: CoordinatorToolRequest): Promise<CoordinatorPluginResult<unknown>>;
}

export interface TextStatsResult {
  readonly text: string;
  readonly characters: number;
  readonly words: number;
  readonly lines: number;
}

export type CoordinatorEventType =
  | "goal.accepted"
  | "provider.tool-requested"
  | "policy.allowed"
  | "tool.completed"
  | "provider.finalized"
  | "run.completed";

export interface CoordinatorEvent {
  readonly seq: number;
  readonly type: CoordinatorEventType;
}

export type CoordinatorFailureCode =
  | "goal"
  | "provider-failure"
  | "provider-response"
  | "tool-request"
  | "tool-limit"
  | "policy-failure"
  | "policy-denied"
  | "tool-failure"
  | "tool-result"
  | "lifecycle";

export interface BoundedLocalCoordinatorSuccess {
  readonly status: "completed";
  readonly answer: string;
  readonly provider: string;
  readonly toolCalls: readonly [{
    readonly tool: "text-stats";
    readonly operation: "analyze-text";
    readonly result: TextStatsResult;
  }];
  readonly events: readonly CoordinatorEvent[];
}

export interface BoundedLocalCoordinatorFailure {
  readonly status: "failed";
  readonly code: CoordinatorFailureCode;
  readonly events: readonly CoordinatorEvent[];
}

export type BoundedLocalCoordinatorResult =
  | BoundedLocalCoordinatorSuccess
  | BoundedLocalCoordinatorFailure;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function validateTextStatsResult(value: unknown, expectedText: string): TextStatsResult | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, ["text", "characters", "words", "lines"])) return null;
  if (
    value.text !== expectedText ||
    typeof value.characters !== "number" ||
    !Number.isSafeInteger(value.characters) ||
    value.characters < 0 ||
    typeof value.words !== "number" ||
    !Number.isSafeInteger(value.words) ||
    value.words < 0 ||
    typeof value.lines !== "number" ||
    !Number.isSafeInteger(value.lines) ||
    value.lines < 0
  ) {
    return null;
  }
  return Object.freeze({
    text: value.text,
    characters: value.characters,
    words: value.words,
    lines: value.lines,
  });
}

function receiptConfirmsAbsence(receipt: PluginLifecycleReceipt): boolean {
  return receipt.confirmedAbsent && receipt.cleanupErrors.length === 0;
}

function successfulReceipt(receipt: PluginLifecycleReceipt): boolean {
  return receiptConfirmsAbsence(receipt) && receipt.exitCode === 0 && receipt.oomKilled !== true;
}

function policyAllowsExactRequest(
  outcome: PolicyAdmissionOutcome,
  request: CoordinatorPolicyRequest,
): boolean {
  if (outcome.decision !== "restrict") return false;
  const capabilities = outcome.catalog.capabilities;
  if (capabilities.length !== 4) return false;
  const [operations, requestDigests, toolCalls, tools] = capabilities;
  return (
    operations?.id === "operations" &&
    operations.limit.schema === "string-set" &&
    operations.limit.values.length === 1 &&
    operations.limit.values[0] === request.operation &&
    requestDigests?.id === "request-digests" &&
    requestDigests.limit.schema === "string-set" &&
    requestDigests.limit.values.length === 1 &&
    requestDigests.limit.values[0] === request.requestDigest &&
    toolCalls?.id === "tool-calls" &&
    toolCalls.limit.schema === "integer-max" &&
    toolCalls.limit.max === request.callCount &&
    tools?.id === "tools" &&
    tools.limit.schema === "string-set" &&
    tools.limit.values.length === 1 &&
    tools.limit.values[0] === request.tool
  );
}

function frozenEvents(events: readonly CoordinatorEvent[]): readonly CoordinatorEvent[] {
  return Object.freeze(events.map((event) => Object.freeze({ ...event })));
}

function failure(
  code: CoordinatorFailureCode,
  events: readonly CoordinatorEvent[],
): BoundedLocalCoordinatorFailure {
  return Object.freeze({ status: "failed", code, events: frozenEvents(events) });
}

function pushEvent(events: CoordinatorEvent[], type: CoordinatorEventType): void {
  events.push({ seq: events.length + 1, type });
}

function pluginFailure(
  code: Exclude<CoordinatorFailureCode, "lifecycle">,
  result: Extract<CoordinatorPluginResult<unknown>, { ok: false }>,
  events: readonly CoordinatorEvent[],
): BoundedLocalCoordinatorFailure {
  if (result.receipt !== undefined && !receiptConfirmsAbsence(result.receipt)) {
    return failure("lifecycle", events);
  }
  return failure(code, events);
}

function readDecision(
  result: CoordinatorPluginResult<unknown>,
  events: readonly CoordinatorEvent[],
): ProviderDecision | BoundedLocalCoordinatorFailure {
  if (!result.ok) return pluginFailure("provider-failure", result, events);
  if (!successfulReceipt(result.receipt)) return failure("lifecycle", events);
  return validateProviderDecision(result.value) ?? failure("provider-response", events);
}

export async function runBoundedLocalCoordinator(input: {
  readonly goal: string;
  readonly providerId: string;
  readonly ports: BoundedLocalCoordinatorPorts;
}): Promise<BoundedLocalCoordinatorResult> {
  const events: CoordinatorEvent[] = [];
  if (
    typeof input?.goal !== "string" ||
    input.goal.length === 0 ||
    typeof input.providerId !== "string" ||
    !PROVIDER_ID_RE.test(input.providerId)
  ) {
    return failure("goal", events);
  }
  pushEvent(events, "goal.accepted");

  let firstResult: CoordinatorPluginResult<unknown>;
  try {
    firstResult = await input.ports.provider(Object.freeze({ goal: input.goal, turn: 1 }));
  } catch {
    return failure("provider-failure", events);
  }
  const firstDecision = readDecision(firstResult, events);
  if ("status" in firstDecision) return firstDecision;
  if (firstDecision.kind !== "tool") return failure("provider-response", events);
  pushEvent(events, "provider.tool-requested");
  if (firstDecision.tool !== REQUIRED_TOOL || firstDecision.operation !== REQUIRED_OPERATION) {
    return failure("tool-request", events);
  }

  const normalizedInput = normalizeJsonValue(firstDecision.input);
  if (normalizedInput === undefined) return failure("tool-request", events);
  const toolRequest: CoordinatorToolRequest = Object.freeze({
    tool: firstDecision.tool,
    operation: firstDecision.operation,
    input: normalizedInput,
  });

  const policyRequest = Object.freeze({
    tool: toolRequest.tool,
    operation: toolRequest.operation,
    callCount: 1,
    input: toolRequest.input,
    requestDigest: computeToolRequestDigest({ ...toolRequest, callCount: 1 }),
  });
  let policyResult: CoordinatorPluginResult<PolicyAdmissionOutcome>;
  try {
    policyResult = await input.ports.policy(policyRequest);
  } catch {
    return failure("policy-failure", events);
  }
  if (!policyResult.ok) return pluginFailure("policy-failure", policyResult, events);
  if (!successfulReceipt(policyResult.receipt)) return failure("lifecycle", events);
  if (!policyAllowsExactRequest(policyResult.value, policyRequest)) {
    return failure("policy-denied", events);
  }
  pushEvent(events, "policy.allowed");

  let toolResult: CoordinatorPluginResult<unknown>;
  try {
    toolResult = await input.ports.tool(toolRequest);
  } catch {
    return failure("tool-failure", events);
  }
  if (!toolResult.ok) return pluginFailure("tool-failure", toolResult, events);
  if (!successfulReceipt(toolResult.receipt)) return failure("lifecycle", events);
  if (typeof toolRequest.input !== "string") return failure("tool-request", events);
  const stats = validateTextStatsResult(toolResult.value, toolRequest.input);
  if (stats === null) return failure("tool-result", events);
  pushEvent(events, "tool.completed");

  let secondResult: CoordinatorPluginResult<unknown>;
  try {
    secondResult = await input.ports.provider(Object.freeze({
      goal: input.goal,
      turn: 2,
      toolResult: stats,
    }));
  } catch {
    return failure("provider-failure", events);
  }
  const secondDecision = readDecision(secondResult, events);
  if ("status" in secondDecision) return secondDecision;
  if (secondDecision.kind === "tool") {
    pushEvent(events, "provider.tool-requested");
    return failure("tool-limit", events);
  }
  if (secondDecision.answer !== `${stats.words} words`) return failure("provider-response", events);
  pushEvent(events, "provider.finalized");
  pushEvent(events, "run.completed");

  return Object.freeze({
    status: "completed",
    answer: secondDecision.answer,
    provider: input.providerId,
    toolCalls: Object.freeze([Object.freeze({
      tool: REQUIRED_TOOL,
      operation: REQUIRED_OPERATION,
      result: stats,
    })] as const),
    events: frozenEvents(events),
  });
}
