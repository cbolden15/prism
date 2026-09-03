import {
  executeCapabilityRequest,
  type CapabilityIntent,
  type CapabilityIntentPort,
  type ExecuteCapabilityRequestResult,
} from "../kernel/capability-rpc.ts";
import type { PluginContainerPort } from "../kernel/plugin-container-port.ts";
import {
  isAuthorityForAdmissionTicket,
  type AdmittedPluginAuthority,
} from "../kernel/plugin-kernel.ts";
import type { JsonValue } from "@useprism/sdk/protocol";
import type { AdmissionTicket } from "./admission-ticket.ts";
import {
  runToolOperation,
  type RunToolOperationResult,
} from "./internal/plugin-session.ts";

export {
  registerAdmittedPlugins,
  runPolicyAdmission,
  type RegisterAdmittedPluginsInput,
  type RegisterAdmittedPluginsResult,
  type RunPolicyAdmissionInput,
  type RunPolicyAdmissionResult,
  type ToolRegistration,
} from "./internal/plugin-session.ts";

export interface RunToolTaskInput {
  readonly ticket: AdmissionTicket;
  readonly authority: AdmittedPluginAuthority;
  readonly containerPort: PluginContainerPort;
  readonly intentPort: CapabilityIntentPort;
  readonly pluginId: string;
  readonly operation: string;
  readonly input: unknown;
  readonly deadlineMs: number;
  readonly requestId?: string;
  readonly clock?: { now(): number };
}

type RunToolOperationSuccess = Extract<RunToolOperationResult, { readonly ok: true }>;
type RunToolOperationFailure = Extract<RunToolOperationResult, { readonly ok: false }>;
type CapabilityFailure = Extract<
  ExecuteCapabilityRequestResult<RunToolOperationResult>,
  { readonly ok: false }
>;

export type RunToolTaskResult =
  | (RunToolOperationSuccess & { readonly intent: CapabilityIntent })
  | RunToolOperationFailure
  | CapabilityFailure;

export async function runToolTask(input: RunToolTaskInput): Promise<RunToolTaskResult> {
  if (!isAuthorityForAdmissionTicket(input.authority, input.ticket)) {
    return { ok: false, code: "authority" };
  }

  const ticket = input.ticket;
  const containerPort = input.containerPort;
  const pluginId = input.pluginId;
  const operation = input.operation;
  const deadlineMs = input.deadlineMs;
  const requestId = input.requestId;
  const clock = input.clock;
  const execution = await executeCapabilityRequest<RunToolOperationResult>({
    authority: input.authority,
    pluginId,
    request: input.input,
    intentPort: input.intentPort,
    dispatchPort: {
      async dispatch(intent) {
        return runToolOperation({
          ticket,
          containerPort,
          pluginId,
          operation,
          input: {
            capabilityId: intent.capabilityId,
            requested: intent.requested,
          } as unknown as JsonValue,
          deadlineMs,
          ...(requestId === undefined ? {} : { requestId }),
          ...(clock === undefined ? {} : { clock }),
        });
      },
    },
  });
  if (!execution.ok) return execution;
  if (!execution.result.ok) return execution.result;
  return { ...execution.result, intent: execution.intent };
}
