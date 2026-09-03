import { resolve } from "node:path";
import {
  admitPinnedRegistryBytes,
  runBoundedLocalCoordinator,
  runPolicyAdmission,
  runProviderCompletion,
  runToolOperation,
  withOwnerApprovedSpawnPlugin,
  type CoordinatorPluginResult,
  type OwnerApprovedAdmissionTicket,
  type PluginLifecycleReceipt,
} from "@useprism/runtime";
import type { PolicyAdmissionOutcome } from "@useprism/sdk/policy";
import type { JsonValue } from "@useprism/sdk/protocol";
import {
  deterministicPinPath,
  deterministicPluginsRoot,
  generateDeterministicPluginRegistry,
} from "../../../packages/cli/src/deterministic/registry.ts";
import type { PrismDemoRun } from "../../../packages/cli/src/deterministic/prism-demo.ts";

const PROVIDER_ID = "local-scripted";
const POLICY_ID = "allow-text-stats";
const TOOL_ID = "text-stats";
const OPERATION = "analyze-text";
const SESSION_TIMEOUT_MS = 15_000;

export type PrismDemoFaultScenario =
  | "second-tool"
  | "policy-denied"
  | "policy-digest-mismatch"
  | "tool-failure"
  | "invalid-provider";

async function withPlugin<T>(
  ticket: OwnerApprovedAdmissionTicket,
  pluginId: string,
  run: Parameters<typeof withOwnerApprovedSpawnPlugin<T>>[0]["run"],
): Promise<T> {
  return withOwnerApprovedSpawnPlugin({
    ticket,
    pluginId,
    pluginRoot: resolve(deterministicPluginsRoot, pluginId),
    run,
  });
}

function failed(
  code: string,
  receipt: PluginLifecycleReceipt | undefined,
): CoordinatorPluginResult<never> {
  return { ok: false, code, ...(receipt === undefined ? {} : { receipt }) };
}

export async function runPrismDemoFaultScenario(
  goal: string,
  scenario: PrismDemoFaultScenario,
): Promise<PrismDemoRun> {
  const generated = generateDeterministicPluginRegistry();
  if (!generated.ok) throw new Error(`fault registry generation failed: ${generated.error.code}`);
  const admitted = admitPinnedRegistryBytes({
    bytes: generated.bytes,
    pinPath: deterministicPinPath,
    pluginsRoot: deterministicPluginsRoot,
  });
  if (!admitted.ok) throw new Error(`fault owner-pinned admission failed: ${admitted.code}`);
  const receipts: PluginLifecycleReceipt[] = [];

  const result = await runBoundedLocalCoordinator({
    goal,
    providerId: PROVIDER_ID,
    ports: {
      async provider(request) {
        const operation = await withPlugin(admitted.ticket, PROVIDER_ID, async ({ ticket, containerPort }) => (
          runProviderCompletion({
            ticket,
            containerPort,
            pluginId: PROVIDER_ID,
            request: { prompt: JSON.stringify(request), model: null },
            deadlineMs: Date.now() + SESSION_TIMEOUT_MS,
            requestId: `prism-fault-${scenario}-provider-${request.turn}`,
          })
        ));
        if (operation.receipt !== undefined) receipts.push(operation.receipt);
        if (!operation.ok) return failed(operation.code, operation.receipt);
        let decision: unknown;
        try {
          decision = JSON.parse(operation.response.text);
        } catch {
          decision = null;
        }
        if (scenario === "invalid-provider" && request.turn === 1) decision = { kind: "wait" };
        if (scenario === "policy-denied" && request.turn === 1) {
          decision = {
            kind: "tool",
            tool: TOOL_ID,
            operation: OPERATION,
            input: "same operation, disallowed input",
          };
        }
        if (scenario === "second-tool" && request.turn === 2) {
          decision = {
            kind: "tool",
            tool: TOOL_ID,
            operation: OPERATION,
            input: "second call",
          };
        }
        return { ok: true, value: decision, receipt: operation.receipt };
      },
      async policy(request): Promise<CoordinatorPluginResult<PolicyAdmissionOutcome>> {
        const admission = scenario === "policy-digest-mismatch"
          ? { ...request, requestDigest: "0".repeat(64) }
          : request;
        const operation = await withPlugin(admitted.ticket, POLICY_ID, async ({ ticket, containerPort }) => (
          runPolicyAdmission({
            ticket,
            containerPort,
            pluginId: POLICY_ID,
            admission: admission as unknown as JsonValue,
            deadlineMs: Date.now() + SESSION_TIMEOUT_MS,
            requestId: `prism-fault-${scenario}-policy`,
          })
        ));
        if (operation.receipt !== undefined) receipts.push(operation.receipt);
        return operation.ok
          ? { ok: true, value: operation.outcome, receipt: operation.receipt }
          : failed(operation.code, operation.receipt);
      },
      async tool(request) {
        const operation = await withPlugin(admitted.ticket, TOOL_ID, async ({ ticket, containerPort }) => (
          runToolOperation({
            ticket,
            containerPort,
            pluginId: TOOL_ID,
            operation: OPERATION,
            input: scenario === "tool-failure" ? 42 : request.input,
            deadlineMs: Date.now() + SESSION_TIMEOUT_MS,
            requestId: `prism-fault-${scenario}-tool`,
          })
        ));
        if (operation.receipt !== undefined) receipts.push(operation.receipt);
        return operation.ok
          ? { ok: true, value: operation.result, receipt: operation.receipt }
          : failed(operation.code, operation.receipt);
      },
    },
  });
  return Object.freeze({ result, receipts: Object.freeze([...receipts]) });
}
