import { createHash } from "node:crypto";
import {
  validatePolicyAdmissionOutcome,
  type PolicyAdmissionOutcome,
} from "@useprism/sdk/policy";
import {
  validateProviderDecision,
} from "@useprism/sdk/provider-decision";
import {
  validateProviderRequest,
  validateProviderResponse,
  type Provider,
} from "@useprism/sdk/provider";
import { normalizeJsonValue } from "@useprism/sdk/json";
import type { JsonValue } from "@useprism/sdk/protocol";
import {
  validateToolDefinition,
  validateToolRequest,
  type Tool,
  type ToolDefinition,
} from "@useprism/sdk/tool";

const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const encoder = new TextEncoder();

export const TOOL_REQUEST_DIGEST_VERSION = "pnh-tool-request-v1" as const;

export interface AgentLimits {
  readonly providerTurns: number;
  readonly toolCalls: number;
  readonly totalBytes: number;
  readonly perToolBytes: number;
  readonly deadlineMs: number;
}

export const DEFAULT_AGENT_LIMITS: Readonly<AgentLimits> = Object.freeze({
  providerTurns: 8,
  toolCalls: 8,
  totalBytes: 2_000_000,
  perToolBytes: 500_000,
  deadlineMs: 60_000,
});

export interface AgentPolicyRequest {
  readonly tool: string;
  readonly operation: string;
  readonly callCount: number;
  readonly input: JsonValue;
  readonly requestDigest: string;
}

export function computeToolRequestDigest(request: {
  readonly tool: string;
  readonly operation: string;
  readonly callCount: number;
  readonly input: JsonValue;
}): string {
  return createHash("sha256").update(JSON.stringify([
    TOOL_REQUEST_DIGEST_VERSION,
    request.tool,
    request.operation,
    request.callCount,
    request.input,
  ])).digest("hex");
}

export interface AgentCallContext {
  readonly signal: AbortSignal;
  readonly deadlineAtMs: number;
}

export interface AgentRunPorts {
  readonly provider: Provider;
  policy(request: AgentPolicyRequest, context: AgentCallContext): Promise<PolicyAdmissionOutcome>;
  readonly tools: readonly Tool[];
}

export interface AgentRunInput {
  readonly goal: string;
  readonly model: string | null;
  readonly limits?: AgentLimits;
  readonly ports: AgentRunPorts;
}

export interface AgentRunUsage {
  readonly providerTurns: number;
  readonly toolCalls: number;
  readonly totalBytes: number;
}

export interface AgentGoalAcceptedEvent {
  readonly seq: number;
  readonly type: "goal.accepted";
}

export interface AgentProviderToolRequestedEvent {
  readonly seq: number;
  readonly type: "provider.tool-requested";
  readonly turn: number;
  readonly tool: string;
  readonly operation: string;
}

export interface AgentPolicyAllowedEvent {
  readonly seq: number;
  readonly type: "policy.allowed";
  readonly call: number;
  readonly tool: string;
  readonly operation: string;
}

export interface AgentToolCompletedEvent {
  readonly seq: number;
  readonly type: "tool.completed";
  readonly call: number;
  readonly tool: string;
  readonly operation: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
}

export interface AgentProviderFinalizedEvent {
  readonly seq: number;
  readonly type: "provider.finalized";
  readonly turn: number;
}

export interface AgentCompletedEvent {
  readonly seq: number;
  readonly type: "run.completed";
}

export type AgentRunEvent =
  | AgentGoalAcceptedEvent
  | AgentProviderToolRequestedEvent
  | AgentPolicyAllowedEvent
  | AgentToolCompletedEvent
  | AgentProviderFinalizedEvent
  | AgentCompletedEvent;

type AgentRunEventPayload =
  | Omit<AgentGoalAcceptedEvent, "seq">
  | Omit<AgentProviderToolRequestedEvent, "seq">
  | Omit<AgentPolicyAllowedEvent, "seq">
  | Omit<AgentToolCompletedEvent, "seq">
  | Omit<AgentProviderFinalizedEvent, "seq">
  | Omit<AgentCompletedEvent, "seq">;

export interface AgentToolCall {
  readonly tool: string;
  readonly operation: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
}

export type AgentRunFailureCode =
  | "invalid-input"
  | "provider-turn-limit"
  | "tool-call-limit"
  | "total-byte-limit"
  | "tool-byte-limit"
  | "deadline"
  | "provider-failure"
  | "provider-response"
  | "tool-request"
  | "policy-failure"
  | "policy-denied"
  | "tool-failure"
  | "tool-result";

export interface AgentRunSuccess {
  readonly status: "completed";
  readonly answer: string;
  readonly provider: string;
  readonly model: string | null;
  readonly limits: AgentLimits;
  readonly usage: AgentRunUsage;
  readonly toolCalls: readonly AgentToolCall[];
  readonly events: readonly AgentRunEvent[];
}

export interface AgentRunFailure {
  readonly status: "failed";
  readonly code: AgentRunFailureCode;
  readonly limits: AgentLimits;
  readonly usage: AgentRunUsage;
  readonly toolCalls: readonly AgentToolCall[];
  readonly events: readonly AgentRunEvent[];
}

export type AgentRunResult = AgentRunSuccess | AgentRunFailure;

interface PreparedInput {
  readonly goal: string;
  readonly model: string | null;
  readonly limits: AgentLimits;
  readonly provider: Provider;
  readonly policy: AgentRunPorts["policy"];
  readonly tools: ReadonlyMap<string, { readonly tool: Tool; readonly definition: ToolDefinition }>;
}

interface ToolExchange {
  readonly tool: string;
  readonly operation: string;
  readonly result: JsonValue;
}

type CallSettlement<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "failed" }
  | { readonly status: "aborted" };

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

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseLimits(value: unknown): AgentLimits | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, [
    "providerTurns",
    "toolCalls",
    "totalBytes",
    "perToolBytes",
    "deadlineMs",
  ])) {
    return null;
  }
  if (
    !isNonNegativeSafeInteger(value.providerTurns)
    || !isNonNegativeSafeInteger(value.toolCalls)
    || !isNonNegativeSafeInteger(value.totalBytes)
    || !isNonNegativeSafeInteger(value.perToolBytes)
    || typeof value.deadlineMs !== "number"
    || !Number.isSafeInteger(value.deadlineMs)
    || value.deadlineMs < 1
    || value.deadlineMs > MAX_TIMER_DELAY_MS
  ) {
    return null;
  }
  return Object.freeze({
    providerTurns: value.providerTurns,
    toolCalls: value.toolCalls,
    totalBytes: value.totalBytes,
    perToolBytes: value.perToolBytes,
    deadlineMs: value.deadlineMs,
  });
}

function prepareInput(input: unknown): PreparedInput | null {
  if (!isPlainRecord(input) || typeof input.goal !== "string" || input.goal.length === 0) return null;
  if (!Object.hasOwn(input, "model") || !Object.hasOwn(input, "ports")) return null;
  if (validateProviderRequest({ prompt: "validate", model: input.model }) === null) return null;

  const limits = Object.hasOwn(input, "limits")
    ? parseLimits(input.limits)
    : DEFAULT_AGENT_LIMITS;
  if (limits === null) return null;

  if (!isPlainRecord(input.ports)) return null;
  const provider = input.ports.provider;
  const policy = input.ports.policy;
  const rawTools = input.ports.tools;
  if (
    !isPlainRecord(provider)
    || typeof provider.id !== "string"
    || !PROVIDER_ID_RE.test(provider.id)
    || typeof provider.complete !== "function"
    || typeof policy !== "function"
    || !Array.isArray(rawTools)
  ) {
    return null;
  }

  const tools = new Map<string, { readonly tool: Tool; readonly definition: ToolDefinition }>();
  for (const tool of rawTools) {
    if (!isPlainRecord(tool) || typeof tool.invoke !== "function") return null;
    const definition = validateToolDefinition(tool.definition);
    if (definition === null || tools.has(definition.id)) return null;
    tools.set(definition.id, { tool: tool as unknown as Tool, definition });
  }

  return Object.freeze({
    goal: input.goal,
    model: input.model as string | null,
    limits,
    provider: provider as unknown as Provider,
    policy: policy as AgentRunPorts["policy"],
    tools,
  });
}

function bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function jsonBytes(value: JsonValue): number {
  return bytes(JSON.stringify(value));
}

function buildPrompt(input: {
  readonly goal: string;
  readonly tools: ReadonlyMap<string, { readonly tool: Tool; readonly definition: ToolDefinition }>;
  readonly exchanges: readonly ToolExchange[];
}): string {
  const tools = [...input.tools.values()].map(({ definition }) => ({
    id: definition.id,
    description: definition.description,
    operations: definition.operations.map((operation) => ({
      name: operation.name,
      description: operation.description,
    })),
  }));
  const exchanges = input.exchanges.map(({ tool, operation, result }) => ({ tool, operation, result }));
  return [
    "Return exactly one JSON ProviderDecision object. Return no markdown, prose, or wrapper object.",
    "A tool decision has exactly this shape: {\"kind\":\"tool\",\"tool\":\"TOOL_ID\",\"operation\":\"OPERATION_NAME\",\"input\":{}}.",
    "A final decision has exactly this shape: {\"kind\":\"final\",\"answer\":\"NONEMPTY_ANSWER\"}.",
    "Replace uppercase placeholders with real values. Add no other keys.",
    "Use only a listed tool and operation. Repository facts are available only through completed tool calls.",
    "If the goal needs repository facts that are not in completed tool calls, request a tool instead of guessing.",
    `Goal: ${input.goal}`,
    `Tools: ${JSON.stringify(tools)}`,
    `Completed tool calls: ${JSON.stringify(exchanges)}`,
  ].join("\n");
}

function policyAllowsExactRequest(outcome: PolicyAdmissionOutcome, request: AgentPolicyRequest): boolean {
  if (outcome.decision !== "restrict") return false;
  const capabilities = outcome.catalog.capabilities;
  if (capabilities.length !== 4) return false;
  const [operations, requestDigests, toolCalls, tools] = capabilities;
  return (
    operations?.id === "operations"
    && operations.limit.schema === "string-set"
    && operations.limit.values.length === 1
    && operations.limit.values[0] === request.operation
    && requestDigests?.id === "request-digests"
    && requestDigests.limit.schema === "string-set"
    && requestDigests.limit.values.length === 1
    && requestDigests.limit.values[0] === request.requestDigest
    && toolCalls?.id === "tool-calls"
    && toolCalls.limit.schema === "integer-max"
    && toolCalls.limit.max === request.callCount
    && tools?.id === "tools"
    && tools.limit.schema === "string-set"
    && tools.limit.values.length === 1
    && tools.limit.values[0] === request.tool
  );
}

function freezeResult<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) freezeResult(descriptor.value);
  }
  return Object.freeze(value);
}

async function settleBeforeAbort<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<CallSettlement<T>> {
  if (signal.aborted) return { status: "aborted" };
  let pending: Promise<T>;
  try {
    pending = operation();
  } catch {
    return { status: "failed" };
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CallSettlement<T>): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish({ status: "aborted" });
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    pending.then(
      (value) => finish({ status: "completed", value }),
      () => finish({ status: "failed" }),
    );
  });
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  let prepared: PreparedInput | null;
  try {
    prepared = prepareInput(input);
  } catch {
    prepared = null;
  }
  if (prepared === null) {
    return freezeResult({
      status: "failed" as const,
      code: "invalid-input" as const,
      limits: DEFAULT_AGENT_LIMITS,
      usage: { providerTurns: 0, toolCalls: 0, totalBytes: 0 },
      toolCalls: [],
      events: [],
    });
  }

  const events: AgentRunEvent[] = [];
  const usage = { providerTurns: 0, toolCalls: 0, totalBytes: 0 };
  const toolCalls: AgentToolCall[] = [];
  const exchanges: ToolExchange[] = [];
  const controller = new AbortController();
  const deadlineAtMs = Date.now() + prepared.limits.deadlineMs;
  const timeout = setTimeout(() => controller.abort(), prepared.limits.deadlineMs);
  const context = Object.freeze({ signal: controller.signal, deadlineAtMs });

  const failure = (code: AgentRunFailureCode): AgentRunFailure => freezeResult({
    status: "failed" as const,
    code,
    limits: prepared.limits,
    usage: { ...usage },
    toolCalls: toolCalls.map((call) => ({ ...call })),
    events: events.map((event) => ({ ...event })) as AgentRunEvent[],
  });
  const deadlineFailure = (): AgentRunFailure | null => {
    if (!controller.signal.aborted && Date.now() >= deadlineAtMs) controller.abort();
    return controller.signal.aborted ? failure("deadline") : null;
  };
  const addBytes = (count: number): boolean => {
    if (usage.totalBytes + count > prepared.limits.totalBytes) return false;
    usage.totalBytes += count;
    return true;
  };
  const pushEvent = (event: AgentRunEventPayload): void => {
    events.push({ ...event, seq: events.length + 1 } as AgentRunEvent);
  };

  try {
    pushEvent({ type: "goal.accepted" });

    while (true) {
      const expired = deadlineFailure();
      if (expired !== null) return expired;
      if (usage.providerTurns >= prepared.limits.providerTurns) return failure("provider-turn-limit");

      const prompt = buildPrompt({ goal: prepared.goal, tools: prepared.tools, exchanges });
      const request = validateProviderRequest({ prompt, model: prepared.model });
      if (request === null) return failure("invalid-input");
      if (!addBytes(bytes(request.prompt))) return failure("total-byte-limit");

      usage.providerTurns += 1;
      const providerCall = await settleBeforeAbort(
        () => prepared.provider.complete(request, Object.freeze({ signal: controller.signal })),
        controller.signal,
      );
      const providerDeadline = deadlineFailure();
      if (providerDeadline !== null) return providerDeadline;
      if (providerCall.status === "aborted") return failure("deadline");
      if (providerCall.status === "failed") return failure("provider-failure");
      const rawResponse: unknown = providerCall.value;

      let response;
      try {
        response = validateProviderResponse(rawResponse);
      } catch {
        response = null;
      }
      if (response === null || response.providerId !== prepared.provider.id || response.model !== prepared.model) {
        return failure("provider-response");
      }
      if (!addBytes(bytes(response.text))) return failure("total-byte-limit");

      let rawDecision: unknown;
      try {
        rawDecision = JSON.parse(response.text);
      } catch {
        return failure("provider-response");
      }
      const decision = validateProviderDecision(rawDecision);
      if (decision === null) return failure("provider-response");

      const turn = usage.providerTurns;
      if (decision.kind === "final") {
        pushEvent({ type: "provider.finalized", turn });
        pushEvent({ type: "run.completed" });
        return freezeResult({
          status: "completed" as const,
          answer: decision.answer,
          provider: prepared.provider.id,
          model: prepared.model,
          limits: prepared.limits,
          usage: { ...usage },
          toolCalls: toolCalls.map((call) => ({ ...call })),
          events: events.map((event) => ({ ...event })) as AgentRunEvent[],
        });
      }

      pushEvent({
        type: "provider.tool-requested",
        turn,
        tool: decision.tool,
        operation: decision.operation,
      });
      if (usage.toolCalls >= prepared.limits.toolCalls) return failure("tool-call-limit");

      const selected = prepared.tools.get(decision.tool);
      if (selected === undefined || !selected.definition.operations.some(({ name }) => name === decision.operation)) {
        return failure("tool-request");
      }

      const requestForTool = validateToolRequest({ operation: decision.operation, input: decision.input });
      if (requestForTool === null) return failure("tool-request");
      const inputBytes = jsonBytes(requestForTool.input);
      if (inputBytes > prepared.limits.perToolBytes) return failure("tool-byte-limit");
      if (!addBytes(inputBytes)) return failure("total-byte-limit");

      const callCount = usage.toolCalls + 1;
      const policyRequest = Object.freeze({
        tool: decision.tool,
        operation: requestForTool.operation,
        callCount,
        input: requestForTool.input,
        requestDigest: computeToolRequestDigest({
          tool: decision.tool,
          operation: requestForTool.operation,
          callCount,
          input: requestForTool.input,
        }),
      });
      const policyCall = await settleBeforeAbort(
        () => prepared.policy(policyRequest, context),
        controller.signal,
      );
      const policyDeadline = deadlineFailure();
      if (policyDeadline !== null) return policyDeadline;
      if (policyCall.status === "aborted") return failure("deadline");
      if (policyCall.status === "failed") return failure("policy-failure");
      const rawAdmission: unknown = policyCall.value;

      let admission;
      try {
        admission = validatePolicyAdmissionOutcome(rawAdmission);
      } catch {
        admission = null;
      }
      if (admission === null || !policyAllowsExactRequest(admission, policyRequest)) {
        return failure("policy-denied");
      }
      pushEvent({
        type: "policy.allowed",
        call: callCount,
        tool: decision.tool,
        operation: decision.operation,
      });

      usage.toolCalls = callCount;
      const toolCall = await settleBeforeAbort(
        () => selected.tool.invoke(requestForTool, context),
        controller.signal,
      );
      const toolDeadline = deadlineFailure();
      if (toolDeadline !== null) return toolDeadline;
      if (toolCall.status === "aborted") return failure("deadline");
      if (toolCall.status === "failed") return failure("tool-failure");
      const rawResult: unknown = toolCall.value;

      let result: JsonValue | undefined;
      try {
        result = normalizeJsonValue(rawResult);
      } catch {
        result = undefined;
      }
      if (result === undefined) return failure("tool-result");
      const outputBytes = jsonBytes(result);
      if (inputBytes + outputBytes > prepared.limits.perToolBytes) return failure("tool-byte-limit");
      if (!addBytes(outputBytes)) return failure("total-byte-limit");

      toolCalls.push({
        tool: decision.tool,
        operation: decision.operation,
        inputBytes,
        outputBytes,
      });
      exchanges.push({ tool: decision.tool, operation: decision.operation, result });
      pushEvent({
        type: "tool.completed",
        call: callCount,
        tool: decision.tool,
        operation: decision.operation,
        inputBytes,
        outputBytes,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}
