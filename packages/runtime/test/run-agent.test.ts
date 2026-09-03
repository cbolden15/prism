import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  CAPABILITY_CATALOG_VERSION,
  CAPABILITY_LIMIT_VERSION,
  type PolicyAdmissionOutcome,
} from "@useprism/sdk/policy";
import type {
  Provider,
  ProviderCallContext,
  ProviderRequest,
  ProviderResponse,
} from "@useprism/sdk/provider";
import type { ProviderDecision } from "@useprism/sdk/provider-decision";
import type { JsonValue, Tool } from "@useprism/sdk/tool";
import {
  DEFAULT_AGENT_LIMITS,
  runAgent,
  type AgentPolicyRequest,
  type AgentRunInput,
} from "@useprism/runtime";

const goal = "Find the repository fact.";
const model = "test-model";
const listInput = { path: "." } as const;
const listResult = {
  path: ".",
  entries: [{ path: "README.md", type: "file", bytes: 42 }],
  truncated: false,
} satisfies JsonValue;

function requestDigest(input: JsonValue): string {
  return createHash("sha256")
    .update(JSON.stringify(["pnh-tool-request-v1", "repository", "list", 1, input]))
    .digest("hex");
}

function provider(
  decisions: readonly ProviderDecision[],
  observe?: (request: ProviderRequest, context: ProviderCallContext | undefined, index: number) => void,
): Provider {
  let index = 0;
  return {
    id: "ollama",
    async complete(request, context): Promise<ProviderResponse> {
      observe?.(request, context, index);
      const decision = decisions[index];
      index += 1;
      if (decision === undefined) throw new Error("unexpected provider turn");
      return {
        providerId: "ollama",
        model: request.model,
        text: JSON.stringify(decision),
      };
    },
  };
}

function repositoryTool(result: JsonValue = listResult): Tool {
  return {
    definition: {
      id: "repository",
      description: "Read files below the admitted workspace.",
      operations: [
        { name: "list", description: "List a directory. Input: {path:string}." },
        { name: "read", description: "Read a text file. Input: {path:string}." },
        { name: "search", description: "Search text files. Input: {path:string,query:string}." },
      ],
    },
    async invoke() { return result; },
  };
}

function allowedPolicy(request: AgentPolicyRequest): PolicyAdmissionOutcome {
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

function input(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    goal,
    model,
    ports: {
      provider: provider([
        { kind: "tool", tool: "repository", operation: "list", input: listInput },
        { kind: "final", answer: "The fact is in README.md." },
      ]),
      async policy(request) { return allowedPolicy(request); },
      tools: [repositoryTool()],
    },
    ...overrides,
  };
}

test("runAgent executes a provider-neutral tool loop with ordered payload events", async () => {
  const providerPrompts: string[] = [];
  const policyRequests: AgentPolicyRequest[] = [];
  const toolSignals: AbortSignal[] = [];
  const result = await runAgent(input({
    ports: {
      provider: provider([
        { kind: "tool", tool: "repository", operation: "list", input: listInput },
        { kind: "final", answer: "The fact is in README.md." },
      ], (request, context) => {
        providerPrompts.push(request.prompt);
        assert.equal(context?.signal.aborted, false);
      }),
      async policy(request, context) {
        policyRequests.push(request);
        assert.equal(context.signal.aborted, false);
        return allowedPolicy(request);
      },
      tools: [{
        ...repositoryTool(),
        async invoke(request, context) {
          assert.deepEqual(request, { operation: "list", input: listInput });
          toolSignals.push(context.signal);
          return listResult;
        },
      }],
    },
  }));

  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.answer, "The fact is in README.md.");
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, model);
  assert.deepEqual(result.limits, DEFAULT_AGENT_LIMITS);
  assert.deepEqual(result.usage.providerTurns, 2);
  assert.deepEqual(result.usage.toolCalls, 1);
  assert.equal(result.usage.totalBytes > 0, true);
  assert.deepEqual(policyRequests, [{
    tool: "repository",
    operation: "list",
    callCount: 1,
    input: listInput,
    requestDigest: requestDigest(listInput),
  }]);
  assert.equal(toolSignals.length, 1);
  assert.equal(providerPrompts[0]?.includes(goal), true);
  assert.equal(providerPrompts[0]?.includes("repository"), true);
  assert.equal(providerPrompts[0]?.includes('{"kind":"tool","tool":"TOOL_ID"'), true);
  assert.equal(providerPrompts[0]?.includes('{"kind":"final","answer":"NONEMPTY_ANSWER"}'), true);
  assert.equal(providerPrompts[1]?.includes("README.md"), true);
  assert.deepEqual(result.events.map(({ type }) => type), [
    "goal.accepted",
    "provider.tool-requested",
    "policy.allowed",
    "tool.completed",
    "provider.finalized",
    "run.completed",
  ]);
  assert.deepEqual(result.events[1], {
    seq: 2,
    type: "provider.tool-requested",
    turn: 1,
    tool: "repository",
    operation: "list",
  });
  assert.deepEqual(result.events[2], {
    seq: 3,
    type: "policy.allowed",
    call: 1,
    tool: "repository",
    operation: "list",
  });
  assert.deepEqual(result.events[3], {
    seq: 4,
    type: "tool.completed",
    call: 1,
    tool: "repository",
    operation: "list",
    inputBytes: result.toolCalls[0]?.inputBytes,
    outputBytes: result.toolCalls[0]?.outputBytes,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.events), true);
  assert.equal(Object.isFrozen(result.toolCalls), true);
});

test("policy receives normalized input and its commitment, and the tool receives that exact frozen input", async () => {
  const normalizedInput = {
    a: { c: 3, d: 4 },
    z: [{ x: 1, y: 2 }],
  } satisfies JsonValue;
  let reviewedInput: JsonValue | undefined;
  let invokedInput: JsonValue | undefined;
  const result = await runAgent(input({
    ports: {
      provider: provider([
        {
          kind: "tool",
          tool: "repository",
          operation: "list",
          input: { z: [{ y: 2, x: 1 }], a: { d: 4, c: 3 } },
        },
        { kind: "final", answer: "Normalized input was preserved." },
      ]),
      async policy(request) {
        assert.deepEqual(request.input, normalizedInput);
        assert.equal(request.requestDigest, requestDigest(normalizedInput));
        assert.equal(Object.isFrozen(request), true);
        assert.equal(Object.isFrozen(request.input), true);
        assert.equal(Object.isFrozen((request.input as { a: object }).a), true);
        assert.equal(Object.isFrozen((request.input as { z: object[] }).z), true);
        assert.equal(Object.isFrozen((request.input as { z: object[] }).z[0]), true);
        reviewedInput = request.input;
        return {
          decision: "restrict",
          catalog: {
            version: CAPABILITY_CATALOG_VERSION,
            capabilities: [
              {
                id: "operations",
                limit: { schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values: [request.operation] },
              },
              {
                id: "request-digests",
                limit: { schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values: [request.requestDigest] },
              },
              {
                id: "tool-calls",
                limit: { schema: "integer-max", version: CAPABILITY_LIMIT_VERSION, max: request.callCount },
              },
              {
                id: "tools",
                limit: { schema: "string-set", version: CAPABILITY_LIMIT_VERSION, values: [request.tool] },
              },
            ],
          },
        };
      },
      tools: [{
        ...repositoryTool(),
        async invoke(request) {
          invokedInput = request.input;
          assert.equal(Object.isFrozen(request), true);
          return listResult;
        },
      }],
    },
  }));

  assert.equal(result.status, "completed");
  assert.equal(invokedInput, reviewedInput);
});

test("unbound and mismatched policy restrictions are denied before tool invocation", async (context) => {
  for (const [name, policy] of [
    ["missing request digest", (request: AgentPolicyRequest): PolicyAdmissionOutcome => {
      const admission = allowedPolicy(request);
      assert.equal(admission.decision, "restrict");
      return {
        decision: "restrict",
        catalog: {
          ...admission.catalog,
          capabilities: admission.catalog.capabilities.filter(({ id }) => id !== "request-digests"),
        },
      };
    }],
    ["mismatched request digest", (request: AgentPolicyRequest): PolicyAdmissionOutcome => {
      const admission = allowedPolicy(request);
      assert.equal(admission.decision, "restrict");
      return {
        decision: "restrict",
        catalog: {
          ...admission.catalog,
          capabilities: admission.catalog.capabilities.map((capability) => capability.id === "request-digests"
            ? { ...capability, limit: { ...capability.limit, values: ["0".repeat(64)] } }
            : capability),
        },
      } as PolicyAdmissionOutcome;
    }],
  ] as const) {
    await context.test(name, async () => {
      let toolCalls = 0;
      const result = await runAgent(input({
        ports: {
          provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
          async policy(request) { return policy(request); },
          tools: [{ ...repositoryTool(), async invoke() { toolCalls += 1; return listResult; } }],
        },
      }));
      assert.equal(result.status, "failed");
      if (result.status === "failed") assert.equal(result.code, "policy-denied");
      assert.equal(toolCalls, 0);
    });
  }
});

test("policy denies disallowed input for the same tool and operation before tool invocation", async () => {
  let toolCalls = 0;
  const disallowedInput = { path: "private" } as const;
  const result = await runAgent(input({
    ports: {
      provider: provider([{
        kind: "tool",
        tool: "repository",
        operation: "list",
        input: disallowedInput,
      }]),
      async policy(request) {
        return request.input === null
          || typeof request.input !== "object"
          || Array.isArray(request.input)
          || request.input.path !== "."
          ? { decision: "deny" }
          : allowedPolicy(request);
      },
      tools: [{ ...repositoryTool(), async invoke() { toolCalls += 1; return listResult; } }],
    },
  }));

  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "policy-denied");
  assert.equal(toolCalls, 0);
});

test("provider-turn and tool-call limits hold at the boundary and fail one beyond", async (context) => {
  await context.test("one provider turn may finalize", async () => {
    const result = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, providerTurns: 1 },
      ports: {
        provider: provider([{ kind: "final", answer: "Done." }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }));
    assert.equal(result.status, "completed");
    assert.equal(result.usage.providerTurns, 1);
    assert.equal(result.usage.toolCalls, 0);
  });

  await context.test("a required second provider turn is one beyond", async () => {
    let providerCalls = 0;
    const result = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, providerTurns: 1 },
      ports: {
        provider: provider([
          { kind: "tool", tool: "repository", operation: "list", input: listInput },
        ], () => { providerCalls += 1; }),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }));
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.code, "provider-turn-limit");
    assert.equal(providerCalls, 1);
    assert.equal(result.usage.toolCalls, 1);
  });

  await context.test("zero tool calls permits finalization and rejects the first request", async () => {
    const final = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, toolCalls: 0 },
      ports: {
        provider: provider([{ kind: "final", answer: "No tool required." }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }));
    assert.equal(final.status, "completed");

    let policyCalls = 0;
    const requested = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, toolCalls: 0 },
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
        async policy(request) { policyCalls += 1; return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }));
    assert.equal(requested.status, "failed");
    if (requested.status === "failed") assert.equal(requested.code, "tool-call-limit");
    assert.equal(policyCalls, 0);
  });

  await context.test("one tool call succeeds and the second is one beyond", async () => {
    let toolCalls = 0;
    const result = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, toolCalls: 1 },
      ports: {
        provider: provider([
          { kind: "tool", tool: "repository", operation: "list", input: listInput },
          { kind: "tool", tool: "repository", operation: "read", input: { path: "README.md" } },
        ]),
        async policy(request) { return allowedPolicy(request); },
        tools: [{ ...repositoryTool(), async invoke() { toolCalls += 1; return listResult; } }],
      },
    }));
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.code, "tool-call-limit");
    assert.equal(toolCalls, 1);
  });
});

test("total and per-tool byte limits hold at the measured boundary and fail one byte beyond", async () => {
  const baseline = await runAgent(input());
  assert.equal(baseline.status, "completed");
  if (baseline.status !== "completed") return;
  const call = baseline.toolCalls[0];
  assert.ok(call);
  const toolBytes = call.inputBytes + call.outputBytes;

  const exactTool = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, perToolBytes: toolBytes },
  }));
  assert.equal(exactTool.status, "completed");
  const beyondTool = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, perToolBytes: toolBytes - 1 },
  }));
  assert.equal(beyondTool.status, "failed");
  if (beyondTool.status === "failed") assert.equal(beyondTool.code, "tool-byte-limit");

  const exactTotal = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, totalBytes: baseline.usage.totalBytes },
  }));
  assert.equal(exactTotal.status, "completed");
  const beyondTotal = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, totalBytes: baseline.usage.totalBytes - 1 },
  }));
  assert.equal(beyondTotal.status, "failed");
  if (beyondTotal.status === "failed") assert.equal(beyondTotal.code, "total-byte-limit");
});

test("a valid tool result above the former 100 KB prompt ceiling reaches the next provider turn", async () => {
  const prompts: string[] = [];
  const largeResult = { first: "x".repeat(60_000), second: "y".repeat(60_000) };
  const result = await runAgent(input({
    ports: {
      provider: provider([
        { kind: "tool", tool: "repository", operation: "list", input: listInput },
        { kind: "final", answer: "Large result accepted." },
      ], (request) => prompts.push(request.prompt)),
      async policy(request) { return allowedPolicy(request); },
      tools: [repositoryTool(largeResult)],
    },
  }));
  assert.equal(result.status, "completed");
  assert.equal(Buffer.byteLength(prompts[1] ?? "", "utf8") > 100_000, true);
});

test("deadline validation accepts its minimum and aborts a provider that runs beyond it", async (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
  try {
    const immediate = await runAgent(input({
      limits: { ...DEFAULT_AGENT_LIMITS, deadlineMs: 1 },
      ports: {
        provider: provider([{ kind: "final", answer: "Done." }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }));
    assert.equal(immediate.status, "completed");
  } finally {
    context.mock.timers.reset();
  }

  const invalid = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, deadlineMs: 0 },
  }));
  assert.equal(invalid.status, "failed");
  if (invalid.status === "failed") assert.equal(invalid.code, "invalid-input");

  let observedAbort = false;
  const startedAt = Date.now();
  const timedOut = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, deadlineMs: 10 },
    ports: {
      provider: {
        id: "ollama",
        async complete(_request, context) {
          await new Promise<void>((resolve) => {
            context?.signal.addEventListener("abort", () => {
              observedAbort = true;
              resolve();
            }, { once: true });
          });
          await delay(0);
          throw new Error("aborted");
        },
      },
      async policy(request) { return allowedPolicy(request); },
      tools: [repositoryTool()],
    },
  }));
  assert.equal(timedOut.status, "failed");
  if (timedOut.status === "failed") assert.equal(timedOut.code, "deadline");
  assert.equal(observedAbort, true);
  assert.equal(Date.now() - startedAt < 500, true);
});

test("the coordinator deadline stops provider, policy, and tool calls that ignore abort", async (context) => {
  const never = async (): Promise<never> => new Promise(() => {});
  const cases: readonly [string, AgentRunInput["ports"]][] = [
    ["provider", {
      provider: { id: "ollama", complete: never },
      async policy(request) { return allowedPolicy(request); },
      tools: [repositoryTool()],
    }],
    ["policy", {
      provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
      policy: never,
      tools: [repositoryTool()],
    }],
    ["tool", {
      provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
      async policy(request) { return allowedPolicy(request); },
      tools: [{ ...repositoryTool(), invoke: never }],
    }],
  ];

  for (const [name, ports] of cases) {
    await context.test(name, async () => {
      const startedAt = Date.now();
      const result = await runAgent(input({
        limits: { ...DEFAULT_AGENT_LIMITS, deadlineMs: 10 },
        ports,
      }));
      assert.equal(result.status, "failed");
      if (result.status === "failed") assert.equal(result.code, "deadline");
      assert.equal(Date.now() - startedAt < 500, true);
    });
  }
});

test("a synchronously blocking port cannot report success after the deadline", async () => {
  const result = await runAgent(input({
    limits: { ...DEFAULT_AGENT_LIMITS, deadlineMs: 5 },
    ports: {
      provider: {
        id: "ollama",
        async complete(request) {
          const stopAt = Date.now() + 20;
          while (Date.now() < stopAt) {}
          return { providerId: "ollama", model: request.model, text: JSON.stringify({ kind: "final", answer: "late" }) };
        },
      },
      async policy(request) { return allowedPolicy(request); },
      tools: [repositoryTool()],
    },
  }));
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "deadline");
});

test("provider, policy, tool, and response failures remain typed and never claim completion", async (context) => {
  const cases: readonly [
    string,
    Partial<AgentRunInput>,
    string,
  ][] = [
    ["provider throw", {
      ports: {
        provider: { id: "ollama", async complete() { throw new Error("private body"); } },
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }, "provider-failure"],
    ["malformed provider JSON", {
      ports: {
        provider: {
          id: "ollama",
          async complete() { return { providerId: "ollama", model, text: "not-json" }; },
        },
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }, "provider-response"],
    ["mismatched provider id", {
      ports: {
        provider: {
          id: "ollama",
          async complete() {
            return { providerId: "other", model, text: JSON.stringify({ kind: "final", answer: "No." }) };
          },
        },
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }, "provider-response"],
    ["policy denied", {
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
        async policy() { return { decision: "deny" }; },
        tools: [repositoryTool()],
      },
    }, "policy-denied"],
    ["policy throw", {
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
        async policy() { throw new Error("policy details"); },
        tools: [repositoryTool()],
      },
    }, "policy-failure"],
    ["unknown tool", {
      ports: {
        provider: provider([{ kind: "tool", tool: "shell", operation: "run", input: null }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }, "tool-request"],
    ["unknown operation", {
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "write", input: null }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [repositoryTool()],
      },
    }, "tool-request"],
    ["tool throw", {
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [{ ...repositoryTool(), async invoke() { throw new Error("raw file"); } }],
      },
    }, "tool-failure"],
    ["invalid tool result", {
      ports: {
        provider: provider([{ kind: "tool", tool: "repository", operation: "list", input: listInput }]),
        async policy(request) { return allowedPolicy(request); },
        tools: [{ ...repositoryTool(), async invoke() { return undefined as unknown as JsonValue; } }],
      },
    }, "tool-result"],
  ];

  for (const [name, overrides, expectedCode] of cases) {
    await context.test(name, async () => {
      const result = await runAgent(input(overrides));
      assert.equal(result.status, "failed");
      if (result.status === "failed") assert.equal(result.code, expectedCode);
      assert.equal(result.events.some((event) => event.type === "run.completed"), false);
      assert.equal(JSON.stringify(result).includes("private body"), false);
      assert.equal(JSON.stringify(result).includes("raw file"), false);
    });
  }
});
