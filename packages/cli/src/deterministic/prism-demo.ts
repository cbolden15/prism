import { resolve } from "node:path";
import {
  admitPinnedRegistryBytes,
  runBoundedLocalCoordinator,
  runPolicyAdmission,
  runProviderCompletion,
  runToolOperation,
  withOwnerApprovedSpawnPlugin,
  type BoundedLocalCoordinatorResult,
  type CoordinatorPluginResult,
  type PluginLifecycleReceipt,
  type OwnerApprovedAdmissionTicket,
} from "@useprism/runtime";
import type { PolicyAdmissionOutcome } from "@useprism/sdk/policy";
import type { JsonValue } from "@useprism/sdk/protocol";
import {
  deterministicPinPath,
  deterministicPluginsRoot,
  generateDeterministicPluginRegistry,
} from "./registry.ts";

const PROVIDER_ID = "local-scripted";
const POLICY_ID = "allow-text-stats";
const TOOL_ID = "text-stats";
const OPERATION = "analyze-text";
const SESSION_TIMEOUT_MS = 15_000;

export interface PrismDemoRun {
  readonly result: BoundedLocalCoordinatorResult;
  readonly receipts: readonly PluginLifecycleReceipt[];
}

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

function recordReceipt(
  receipts: PluginLifecycleReceipt[],
  receipt: PluginLifecycleReceipt | undefined,
): void {
  if (receipt !== undefined) receipts.push(receipt);
}

function failed(
  code: string,
  receipt: PluginLifecycleReceipt | undefined,
): CoordinatorPluginResult<never> {
  return { ok: false, code, ...(receipt === undefined ? {} : { receipt }) };
}

export async function runPrismDemo(goal: string): Promise<PrismDemoRun> {
  const generated = generateDeterministicPluginRegistry();
  if (!generated.ok) throw new Error(`demo registry generation failed: ${generated.error.code}`);
  const admitted = admitPinnedRegistryBytes({
    bytes: generated.bytes,
    pinPath: deterministicPinPath,
    pluginsRoot: deterministicPluginsRoot,
  });
  if (!admitted.ok) throw new Error(`demo owner-pinned admission failed: ${admitted.code}`);

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
            requestId: `prism-demo-provider-turn-${request.turn}`,
          })
        ));
        recordReceipt(receipts, operation.receipt);
        if (!operation.ok) return failed(operation.code, operation.receipt);
        let decision: unknown;
        try {
          decision = JSON.parse(operation.response.text);
        } catch {
          decision = null;
        }
        return { ok: true, value: decision, receipt: operation.receipt };
      },
      async policy(request): Promise<CoordinatorPluginResult<PolicyAdmissionOutcome>> {
        const operation = await withPlugin(admitted.ticket, POLICY_ID, async ({ ticket, containerPort }) => (
          runPolicyAdmission({
            ticket,
            containerPort,
            pluginId: POLICY_ID,
            admission: request as unknown as JsonValue,
            deadlineMs: Date.now() + SESSION_TIMEOUT_MS,
            requestId: "prism-demo-policy",
          })
        ));
        recordReceipt(receipts, operation.receipt);
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
            input: request.input,
            deadlineMs: Date.now() + SESSION_TIMEOUT_MS,
            requestId: "prism-demo-tool",
          })
        ));
        recordReceipt(receipts, operation.receipt);
        return operation.ok
          ? { ok: true, value: operation.result, receipt: operation.receipt }
          : failed(operation.code, operation.receipt);
      },
    },
  });
  return Object.freeze({ result, receipts: Object.freeze([...receipts]) });
}
