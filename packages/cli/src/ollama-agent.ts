import { createOllamaProvider } from "@useprism/provider-ollama";
import {
  computeToolRequestDigest,
  runAgent,
  type AgentPolicyRequest,
  type AgentRunResult,
} from "@useprism/runtime";
import {
  CAPABILITY_CATALOG_VERSION,
  CAPABILITY_LIMIT_VERSION,
  type PolicyAdmissionOutcome,
} from "@useprism/sdk/policy";
import { normalizeJsonValue } from "@useprism/sdk/json";
import type { JsonValue } from "@useprism/sdk/protocol";
import type { Tool, ToolCallContext, ToolRequest } from "@useprism/sdk/tool";
import { createRepositoryTool } from "./repository-tool.ts";

interface CapturedToolExchange {
  readonly input: JsonValue;
  readonly result: JsonValue;
}

const REPOSITORY_OPERATIONS = new Set(["list", "read", "search"]);

function admitRepositoryRequest(request: AgentPolicyRequest): PolicyAdmissionOutcome {
  if (
    request.tool !== "repository"
    || !REPOSITORY_OPERATIONS.has(request.operation)
    || !Number.isSafeInteger(request.callCount)
    || request.callCount < 1
    || request.requestDigest !== computeToolRequestDigest(request)
  ) {
    return { decision: "deny" };
  }
  return {
    decision: "restrict",
    catalog: {
      version: CAPABILITY_CATALOG_VERSION,
      capabilities: [
        {
          id: "operations",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.operation],
          },
        },
        {
          id: "request-digests",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.requestDigest],
          },
        },
        {
          id: "tool-calls",
          limit: {
            schema: "integer-max",
            version: CAPABILITY_LIMIT_VERSION,
            max: request.callCount,
          },
        },
        {
          id: "tools",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.tool],
          },
        },
      ],
    },
  };
}

function withSanitizedTraceCapture(tool: Tool, captures: CapturedToolExchange[]): Tool {
  return Object.freeze({
    definition: tool.definition,
    async invoke(request: ToolRequest, context: ToolCallContext): Promise<JsonValue> {
      const rawResult = await tool.invoke(request, context);
      const result = normalizeJsonValue(rawResult);
      if (result === undefined) throw new Error("repository tool returned an invalid result");
      captures.push(Object.freeze({ input: request.input, result }));
      return result;
    },
  });
}

export async function runCurrentOllamaAgent(input: {
  readonly goal: string;
  readonly endpoint: string;
  readonly model: string;
  readonly workspace: string;
}): Promise<AgentRunResult & { readonly toolCalls: readonly Record<string, unknown>[] }> {
  const captures: CapturedToolExchange[] = [];
  const repository = withSanitizedTraceCapture(
    await createRepositoryTool({ workspaceRoot: input.workspace }),
    captures,
  );
  const result = await runAgent({
    goal: input.goal,
    model: input.model,
    ports: {
      provider: createOllamaProvider({ endpoint: input.endpoint }),
      async policy(request) { return admitRepositoryRequest(request); },
      tools: [repository],
    },
  });
  return {
    ...result,
    toolCalls: result.toolCalls.map((call, index) => {
      const capture = captures[index];
      if (capture === undefined) throw new Error("runtime trace capture is incomplete");
      return Object.freeze({ ...call, input: capture.input, result: capture.result });
    }),
  };
}
