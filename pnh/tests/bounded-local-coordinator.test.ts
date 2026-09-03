import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { PluginLifecycleReceipt } from "../../packages/runtime/src/kernel/plugin-container-port.ts";
import type { PolicyAdmissionOutcome } from "@useprism/sdk/policy";
import type { JsonValue } from "@useprism/sdk/protocol";
import {
  runBoundedLocalCoordinator,
  type BoundedLocalCoordinatorPorts,
  type CoordinatorPolicyRequest,
  type CoordinatorPluginResult,
} from "../../packages/runtime/src/runtime/bounded-local-coordinator.ts";

const goal = "Count the words in: one two three";
const stats = { text: "one two three", characters: 13, words: 3, lines: 1 };

function requestDigest(input: JsonValue): string {
  return createHash("sha256")
    .update(JSON.stringify(["pnh-tool-request-v1", "text-stats", "analyze-text", 1, input]))
    .digest("hex");
}

function receipt(pluginId: string): PluginLifecycleReceipt {
  return {
    v: 1,
    requestId: `${pluginId}-request`,
    pluginId,
    containerId: `${pluginId}-process`,
    trigger: "process-exit",
    hardDeadlineAtMs: Date.now() + 10_000,
    daemonState: "exited",
    exitCode: 0,
    oomKilled: null,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: Date.now(),
  };
}

function success<T>(pluginId: string, value: T): CoordinatorPluginResult<T> {
  return { ok: true, value, receipt: receipt(pluginId) };
}

function allowedPolicy(request: CoordinatorPolicyRequest): PolicyAdmissionOutcome {
  return {
    decision: "restrict",
    catalog: {
      version: "pnh-capability-catalog-v1",
      capabilities: [
        {
          id: "operations",
          limit: {
            schema: "string-set",
            version: "pnh-capability-limit-v1",
            values: ["analyze-text"],
          },
        },
        {
          id: "request-digests",
          limit: {
            schema: "string-set",
            version: "pnh-capability-limit-v1",
            values: [request.requestDigest],
          },
        },
        {
          id: "tool-calls",
          limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 1 },
        },
        {
          id: "tools",
          limit: {
            schema: "string-set",
            version: "pnh-capability-limit-v1",
            values: ["text-stats"],
          },
        },
      ],
    },
  };
}

function ports(overrides: Partial<BoundedLocalCoordinatorPorts> = {}): BoundedLocalCoordinatorPorts {
  return {
    async provider(request) {
      return request.turn === 1
        ? success("local-scripted", {
            kind: "tool",
            tool: "text-stats",
            operation: "analyze-text",
            input: "one two three",
          })
        : success("local-scripted", { kind: "final", answer: "3 words" });
    },
    async policy(request) { return success("allow-text-stats", allowedPolicy(request)); },
    async tool() { return success("text-stats", stats); },
    ...overrides,
  };
}

test("the bounded coordinator produces the exact deterministic success contract", async () => {
  const calls: string[] = [];
  let reviewedInput: JsonValue | undefined;
  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: "local-scripted",
    ports: ports({
      async provider(request) {
        calls.push(`provider:${request.turn}`);
        return request.turn === 1
          ? success("local-scripted", {
              kind: "tool",
              tool: "text-stats",
              operation: "analyze-text",
              input: "one two three",
            })
          : success("local-scripted", { kind: "final", answer: "3 words" });
      },
      async policy(request) {
        assert.equal(request.input, "one two three");
        assert.equal(request.requestDigest, requestDigest("one two three"));
        assert.equal(Object.isFrozen(request), true);
        reviewedInput = request.input;
        calls.push(`policy:${request.tool}/${request.operation}:${request.callCount}`);
        return success("allow-text-stats", allowedPolicy(request));
      },
      async tool(request) {
        assert.equal(request.input, reviewedInput);
        assert.equal(Object.isFrozen(request), true);
        calls.push(`tool:${request.tool}/${request.operation}`);
        return success("text-stats", stats);
      },
    }),
  });

  assert.deepEqual(calls, [
    "provider:1",
    "policy:text-stats/analyze-text:1",
    "tool:text-stats/analyze-text",
    "provider:2",
  ]);
  assert.deepEqual(result, {
    status: "completed",
    answer: "3 words",
    provider: "local-scripted",
    toolCalls: [{ tool: "text-stats", operation: "analyze-text", result: stats }],
    events: [
      { seq: 1, type: "goal.accepted" },
      { seq: 2, type: "provider.tool-requested" },
      { seq: 3, type: "policy.allowed" },
      { seq: 4, type: "tool.completed" },
      { seq: 5, type: "provider.finalized" },
      { seq: 6, type: "run.completed" },
    ],
  });
});

test("the bounded coordinator passes one normalized frozen input object from policy to tool", async () => {
  let toolCalls = 0;
  let reviewedInput: JsonValue | undefined;
  const normalizedInput = { a: { c: 3, d: 4 }, z: [{ x: 1, y: 2 }] } satisfies JsonValue;
  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: "local-scripted",
    ports: ports({
      async provider() {
        return success("local-scripted", {
          kind: "tool",
          tool: "text-stats",
          operation: "analyze-text",
          input: { z: [{ y: 2, x: 1 }], a: { d: 4, c: 3 } },
        });
      },
      async policy(request) {
        assert.deepEqual(request.input, normalizedInput);
        assert.equal(request.requestDigest, requestDigest(normalizedInput));
        assert.equal(Object.isFrozen(request.input), true);
        assert.equal(Object.isFrozen((request.input as { a: object }).a), true);
        assert.equal(Object.isFrozen((request.input as { z: object[] }).z), true);
        assert.equal(Object.isFrozen((request.input as { z: object[] }).z[0]), true);
        reviewedInput = request.input;
        return success("allow-text-stats", allowedPolicy(request));
      },
      async tool(request) {
        toolCalls += 1;
        assert.equal(request.input, reviewedInput);
        assert.equal(Object.isFrozen(request), true);
        assert.equal(Object.isFrozen(request.input), true);
        throw new Error("test stop after exact invocation");
      },
    }),
  });

  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "tool-failure");
  assert.equal(toolCalls, 1);
});

test("the bounded coordinator refuses unbound and mismatched request digests", async (context) => {
  const policies: readonly [string, (request: CoordinatorPolicyRequest) => PolicyAdmissionOutcome][] = [
    ["missing request digest", (request) => {
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
    ["mismatched request digest", (request) => {
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
  ];

  for (const [name, policy] of policies) {
    await context.test(name, async () => {
      let toolCalls = 0;
      const result = await runBoundedLocalCoordinator({
        goal,
        providerId: "local-scripted",
        ports: ports({
          async policy(request) {
            return success("allow-text-stats", policy(request));
          },
          async tool() { toolCalls += 1; return success("text-stats", stats); },
        }),
      });

      assert.equal(result.status, "failed");
      if (result.status === "failed") assert.equal(result.code, "policy-denied");
      assert.equal(toolCalls, 0);
    });
  }
});

test("the bounded policy denies disallowed input for the same tool and operation", async () => {
  let toolCalls = 0;
  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: "local-scripted",
    ports: ports({
      async provider() {
        return success("local-scripted", {
          kind: "tool",
          tool: "text-stats",
          operation: "analyze-text",
          input: "same operation, disallowed input",
        });
      },
      async policy(request) {
        return success("allow-text-stats", request.input === "one two three"
          ? allowedPolicy(request)
          : { decision: "deny" });
      },
      async tool() { toolCalls += 1; return success("text-stats", stats); },
    }),
  });

  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "policy-denied");
  assert.equal(toolCalls, 0);
});

test("unknown tools and second tool requests fail before another operation", async (context) => {
  await context.test("unknown tool", async () => {
    let policyCalls = 0;
    const result = await runBoundedLocalCoordinator({
      goal,
      providerId: "local-scripted",
      ports: ports({
        async provider() {
          return success("local-scripted", {
            kind: "tool",
            tool: "unknown-tool",
            operation: "analyze-text",
            input: "one two three",
          });
        },
        async policy(request) { policyCalls += 1; return success("allow-text-stats", allowedPolicy(request)); },
      }),
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.code, "tool-request");
    assert.equal(policyCalls, 0);
    assert.ok(result.events.every((event) => event.type !== "run.completed"));
  });

  await context.test("second tool request", async () => {
    const result = await runBoundedLocalCoordinator({
      goal,
      providerId: "local-scripted",
      ports: ports({
        async provider(request) {
          return success("local-scripted", {
            kind: "tool",
            tool: "text-stats",
            operation: "analyze-text",
            input: request.turn === 1 ? "one two three" : "second call",
          });
        },
      }),
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.code, "tool-limit");
    assert.ok(result.events.some((event) => event.type === "tool.completed"));
    assert.ok(result.events.every((event) => event.type !== "run.completed"));
  });
});

test("policy denial returns a typed failure with no false completion", async () => {
  let toolCalls = 0;
  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: "local-scripted",
    ports: ports({
      async policy() { return success("allow-text-stats", { decision: "deny" }); },
      async tool() { toolCalls += 1; return success("text-stats", stats); },
    }),
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "policy-denied");
  assert.equal(toolCalls, 0);
  assert.ok(result.events.every((event) => event.type !== "run.completed"));
});

test("malformed and unsuccessful tool results return typed failures after cleanup", async (context) => {
  for (const [name, toolResult, code] of [
    ["malformed", success("text-stats", { words: "three" }), "tool-result"],
    ["unsuccessful", { ok: false, code: "operation", receipt: receipt("text-stats") }, "tool-failure"],
  ] as const) {
    await context.test(name, async () => {
      const result = await runBoundedLocalCoordinator({
        goal,
        providerId: "local-scripted",
        ports: ports({ async tool() { return toolResult; } }),
      });
      assert.equal(result.status, "failed");
      if (result.status === "failed") assert.equal(result.code, code);
      assert.ok(result.events.every((event) => event.type !== "run.completed"));
    });
  }
});

test("a provider response that is neither tool nor final fails closed after cleanup", async () => {
  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: "local-scripted",
    ports: ports({ async provider() { return success("local-scripted", { kind: "wait" }); } }),
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") assert.equal(result.code, "provider-response");
  assert.deepEqual(result.events, [{ seq: 1, type: "goal.accepted" }]);
});
