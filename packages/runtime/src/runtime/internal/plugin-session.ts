import { createHash, randomUUID } from "node:crypto";
import type {
  PluginContainerHandle,
  PluginContainerPort,
  PluginLifecycleReceipt,
} from "../../kernel/plugin-container-port.ts";
import {
  NdjsonFrameDecoder,
  encodePluginFrame,
  type JsonValue,
  type PluginResponseFrame,
} from "@useprism/sdk/protocol";
import {
  validatePluginRegistration,
  type IdentityRegistration,
  type PluginRegistration,
  type ToolRegistration,
} from "@useprism/sdk/registration";
import {
  validateProviderRequest,
  validateProviderResponse,
  type ProviderResponse,
} from "@useprism/sdk/provider";
import {
  validatePolicyAdmissionOutcome,
  type PolicyAdmissionOutcome,
} from "@useprism/sdk/policy";
import {
  isAdmissionTicket,
  resolveAdmittedPlugin,
  resolveAdmittedPluginOrder,
  type AdmissionTicket,
} from "../admission-ticket.ts";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ACK_DEADLINE_MS = 2_000;

export interface RunToolOperationInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly pluginId: string;
  readonly operation: string;
  readonly input: JsonValue;
  readonly deadlineMs: number;
  readonly requestId?: string;
  readonly clock?: { now(): number };
}

export type { ToolRegistration };

export type RunToolOperationResult =
  | {
      readonly ok: true;
      readonly registration: ToolRegistration;
      readonly result: JsonValue;
      readonly receipt: PluginLifecycleReceipt;
    }
  | {
      readonly ok: false;
      readonly code: "admission" | "deadline" | "launch" | "protocol" | "registration" | "operation" | "lifecycle";
      readonly detail?: string;
      readonly receipt?: PluginLifecycleReceipt;
    };

export interface RunProviderCompletionInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly pluginId: string;
  readonly request: unknown;
  readonly deadlineMs: number;
  readonly requestId?: string;
  readonly clock?: { now(): number };
}

export type RunProviderCompletionResult =
  | {
      readonly ok: true;
      readonly registration: IdentityRegistration & { readonly kind: "provider" };
      readonly response: ProviderResponse;
      readonly receipt: PluginLifecycleReceipt;
    }
  | {
      readonly ok: false;
      readonly code:
        | "request"
        | "response"
        | "admission"
        | "deadline"
        | "launch"
        | "protocol"
        | "registration"
        | "operation"
        | "lifecycle";
      readonly detail?: string;
      readonly receipt?: PluginLifecycleReceipt;
    };

export interface RegisterAdmittedPluginsInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly deadlineMs: number;
  readonly clock?: { now(): number };
}

export interface RunPolicyAdmissionInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly pluginId: string;
  readonly admission: JsonValue;
  readonly deadlineMs: number;
  readonly requestId?: string;
  readonly clock?: { now(): number };
}

export type RunPolicyAdmissionResult =
  | {
      readonly ok: true;
      readonly outcome: PolicyAdmissionOutcome;
      readonly receipt: PluginLifecycleReceipt;
    }
  | {
      readonly ok: false;
      readonly code: "admission" | "deadline" | "launch" | "protocol" | "registration" | "policy" | "lifecycle";
      readonly detail?: string;
      readonly receipt?: PluginLifecycleReceipt;
    };

export type RegisterAdmittedPluginsResult =
  | {
      readonly ok: true;
      readonly registrations: readonly PluginRegistration[];
      readonly receipts: readonly PluginLifecycleReceipt[];
    }
  | {
      readonly ok: false;
      readonly code: "admission" | "deadline" | "launch" | "protocol" | "registration" | "lifecycle";
      readonly pluginId?: string;
      readonly detail?: string;
      readonly receipt?: PluginLifecycleReceipt;
    };

interface RunPluginSessionInput {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
  readonly pluginId: string;
  readonly deadlineMs: number;
  readonly requestId?: string;
  readonly clock?: { now(): number };
  readonly admission?: JsonValue;
  readonly operation?: {
    readonly kind: "tool" | "provider";
    readonly name: string;
    readonly input: JsonValue;
  };
}

type RunPluginSessionResult =
  | {
      readonly ok: true;
      readonly registration: PluginRegistration;
      readonly receipt: PluginLifecycleReceipt;
      readonly policyOutcome?: PolicyAdmissionOutcome;
      readonly result?: JsonValue;
    }
  | {
      readonly ok: false;
      readonly code: "admission" | "deadline" | "launch" | "protocol" | "registration" | "policy" | "operation" | "lifecycle";
      readonly detail?: string;
      readonly receipt?: PluginLifecycleReceipt;
    };

function cleanReceipt(receipt: PluginLifecycleReceipt): boolean {
  // `oomKilled` is `boolean | null`: some container ports (a bare subprocess
  // with no cgroup memory verdict, or a Docker inspect that omits the field)
  // honestly report `null` rather than asserting `false`. A clean receipt
  // only requires that OOM-kill was not *confirmed* — `null` and `false`
  // both qualify; only `true` disqualifies.
  return (
    receipt.confirmedAbsent &&
    receipt.exitCode === 0 &&
    receipt.oomKilled !== true &&
    receipt.cleanupErrors.length === 0
  );
}

async function runPluginSession(input: RunPluginSessionInput): Promise<RunPluginSessionResult> {
  const clock = input.clock ?? { now: () => Date.now() };
  if (!isAdmissionTicket(input.ticket)) return { ok: false, code: "admission" };
  const descriptor = resolveAdmittedPlugin(input.ticket, input.pluginId);
  if (
    descriptor === undefined ||
    (input.admission !== undefined && descriptor.kind !== "policy") ||
    (input.admission !== undefined && input.operation !== undefined) ||
    (input.operation !== undefined &&
      (descriptor.kind !== input.operation.kind ||
        !SLUG_RE.test(input.operation.name) ||
        (input.operation.kind === "provider" && input.operation.name !== "complete")))
  ) {
    return { ok: false, code: "admission" };
  }
  const pluginKind = descriptor.kind;
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs <= clock.now()) {
    return { ok: false, code: "deadline" };
  }
  const requestId = input.requestId ?? randomUUID();
  if (!ID_RE.test(requestId)) return { ok: false, code: "admission" };
  const protocolRequestStem = createHash("sha256").update(requestId).digest("hex").slice(0, 32);

  let handle: PluginContainerHandle;
  try {
    handle = await input.containerPort.launch({ requestId, pluginId: input.pluginId, deadlineMs: input.deadlineMs });
  } catch (error) {
    return {
      ok: false,
      code: clock.now() >= input.deadlineMs ? "deadline" : "launch",
      detail: error instanceof Error ? error.message : "plugin launch failed",
    };
  }

  const decoder = new NdjsonFrameDecoder();
  let pending: {
    readonly requestId: string;
    readonly seq: number;
    received: boolean;
    resolve(frame: PluginResponseFrame): void;
    reject(error: Error): void;
  } | undefined;
  let protocolFailure: Error | undefined;
  let rejectProtocol!: (error: Error) => void;
  const failed = new Promise<never>((_resolve, reject) => { rejectProtocol = reject; });
  void failed.catch(() => undefined);

  function fail(error: Error): void {
    if (protocolFailure !== undefined) return;
    protocolFailure = error;
    pending?.reject(error);
    rejectProtocol(error);
  }

  handle.onStdout((bytes) => {
    const decoded = decoder.push(bytes);
    if (!decoded.ok) {
      fail(new Error(`plugin protocol failed: ${decoded.code}`));
      return;
    }
    for (const frame of decoded.frames) {
      if (
        frame.type !== "response" ||
        pending === undefined ||
        pending.received ||
        frame.requestId !== pending.requestId ||
        frame.seq !== pending.seq
      ) {
        fail(new Error("unexpected or duplicate plugin response"));
        return;
      }
      pending.received = true;
      const current = pending;
      queueMicrotask(() => {
        if (protocolFailure === undefined && pending === current) current.resolve(frame);
      });
    }
  });
  handle.onStderr((bytes) => {
    if (bytes.byteLength > 0) fail(new Error("plugin emitted stderr"));
  });

  let receipt: PluginLifecycleReceipt | undefined;
  const exited = handle.waitForExit();
  void exited.then(
    (observed) => {
      receipt = observed;
      if (pending !== undefined) fail(new Error("plugin exited before responding"));
    },
    () => fail(new Error("plugin lifecycle observation failed")),
  );

  async function exchange(
    seq: number,
    phase: "register" | "admit" | "operate",
    payload: JsonValue,
  ): Promise<PluginResponseFrame> {
    if (pending !== undefined) throw new Error("plugin request already pending");
    const frameRequestId = `${protocolRequestStem}-${phase}`;
    const response = new Promise<PluginResponseFrame>((resolvePromise, reject) => {
      pending = { requestId: frameRequestId, seq, received: false, resolve: resolvePromise, reject };
    });
    void response.catch(() => undefined);
    const timeoutMs = input.deadlineMs - clock.now();
    if (timeoutMs <= 0) throw new Error("plugin request deadline exceeded");
    const timer = setTimeout(() => fail(new Error("plugin request deadline exceeded")), timeoutMs);
    try {
      await handle.writeStdin(encodePluginFrame({
        v: 1,
        type: "request",
        requestId: frameRequestId,
        seq,
        phase,
        pluginId: input.pluginId,
        kind: pluginKind,
        payload,
      }));
      return await response;
    } finally {
      clearTimeout(timer);
      pending = undefined;
    }
  }

  async function stopAndAcknowledge(): Promise<PluginLifecycleReceipt | undefined> {
    try {
      receipt = await handle.stop();
    } catch {
      try {
        receipt = await exited;
      } catch {
        return receipt;
      }
    }
    try {
      await handle.acknowledge(Math.max(clock.now() + ACK_DEADLINE_MS, handle.hardDeadlineAtMs));
    } catch {}
    return receipt;
  }

  try {
    const registered = await exchange(1, "register", {});
    if (!registered.ok) {
      await stopAndAcknowledge();
      return { ok: false, code: "registration", ...(receipt === undefined ? {} : { receipt }) };
    }
    const declared = validatePluginRegistration(registered.result);
    if (declared === null || declared.pluginId !== descriptor.id || declared.kind !== descriptor.kind) {
      await stopAndAcknowledge();
      return { ok: false, code: "registration", ...(receipt === undefined ? {} : { receipt }) };
    }

    let policyOutcome: PolicyAdmissionOutcome | undefined;
    if (input.admission !== undefined) {
      const admitted = await exchange(2, "admit", input.admission);
      if (!admitted.ok) {
        await stopAndAcknowledge();
        return { ok: false, code: "policy", ...(receipt === undefined ? {} : { receipt }) };
      }
      policyOutcome = validatePolicyAdmissionOutcome(admitted.result) ?? undefined;
      if (policyOutcome === undefined) {
        await stopAndAcknowledge();
        return { ok: false, code: "policy", ...(receipt === undefined ? {} : { receipt }) };
      }
    }

    let operationResult: JsonValue | undefined;
    if (input.operation !== undefined) {
      const declaredOperation =
        declared.kind === "tool" &&
        input.operation.kind === "tool" &&
        declared.operations.includes(input.operation.name);
      const providerCompletion =
        declared.kind === "provider" &&
        input.operation.kind === "provider" &&
        input.operation.name === "complete";
      if (!declaredOperation && !providerCompletion) {
        await stopAndAcknowledge();
        return { ok: false, code: "registration", ...(receipt === undefined ? {} : { receipt }) };
      }
      const operated = await exchange(2, "operate", {
        input: input.operation.input,
        operation: input.operation.name,
      });
      if (!operated.ok) {
        await stopAndAcknowledge();
        return { ok: false, code: "operation", ...(receipt === undefined ? {} : { receipt }) };
      }
      operationResult = operated.result;
    }
    await handle.closeStdin();
    receipt = await Promise.race([exited, failed]);
    const finished = decoder.finish();
    if (!finished.ok || protocolFailure !== undefined) throw new Error("plugin protocol did not finish cleanly");
    if (!cleanReceipt(receipt)) {
      await handle.acknowledge(Math.max(clock.now() + ACK_DEADLINE_MS, handle.hardDeadlineAtMs));
      return { ok: false, code: "lifecycle", receipt };
    }
    await handle.acknowledge(Math.max(clock.now() + ACK_DEADLINE_MS, handle.hardDeadlineAtMs));
    return {
      ok: true,
      registration: declared,
      ...(policyOutcome === undefined ? {} : { policyOutcome }),
      ...(operationResult === undefined ? {} : { result: operationResult }),
      receipt,
    };
  } catch (error) {
    await stopAndAcknowledge();
    const code = error instanceof Error && /deadline/.test(error.message) ? "deadline" : "protocol";
    return { ok: false, code, ...(receipt === undefined ? {} : { receipt }) };
  }
}

export async function runToolOperation(input: RunToolOperationInput): Promise<RunToolOperationResult> {
  const result = await runPluginSession({
    ticket: input.ticket,
    containerPort: input.containerPort,
    pluginId: input.pluginId,
    deadlineMs: input.deadlineMs,
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    operation: { kind: "tool", name: input.operation, input: input.input },
  });
  if (!result.ok) {
    const code = result.code === "policy" ? "protocol" : result.code;
    return {
      ok: false,
      code,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
    };
  }
  if (result.registration.kind !== "tool" || result.result === undefined) {
    return { ok: false, code: "registration", receipt: result.receipt };
  }
  return {
    ok: true,
    registration: result.registration,
    result: result.result,
    receipt: result.receipt,
  };
}

export async function runProviderCompletion(
  input: RunProviderCompletionInput,
): Promise<RunProviderCompletionResult> {
  const request = validateProviderRequest(input.request);
  if (request === null) return { ok: false, code: "request" };

  const result = await runPluginSession({
    ticket: input.ticket,
    containerPort: input.containerPort,
    pluginId: input.pluginId,
    deadlineMs: input.deadlineMs,
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    operation: {
      kind: "provider",
      name: "complete",
      input: request as unknown as JsonValue,
    },
  });
  if (!result.ok) {
    const code = result.code === "policy" ? "protocol" : result.code;
    return {
      ok: false,
      code,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
    };
  }
  if (result.registration.kind !== "provider" || result.result === undefined) {
    return { ok: false, code: "registration", receipt: result.receipt };
  }
  const response = validateProviderResponse(result.result);
  if (
    response === null ||
    response.providerId !== input.pluginId ||
    (request.model !== null && response.model !== request.model)
  ) {
    return { ok: false, code: "response", receipt: result.receipt };
  }
  return {
    ok: true,
    registration: result.registration as IdentityRegistration & { readonly kind: "provider" },
    response,
    receipt: result.receipt,
  };
}

export async function runPolicyAdmission(
  input: RunPolicyAdmissionInput,
): Promise<RunPolicyAdmissionResult> {
  const result = await runPluginSession({
    ticket: input.ticket,
    containerPort: input.containerPort,
    pluginId: input.pluginId,
    deadlineMs: input.deadlineMs,
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    admission: input.admission,
  });
  if (!result.ok) {
    const code = result.code === "operation" ? "protocol" : result.code;
    return {
      ok: false,
      code,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
    };
  }
  if (result.registration.kind !== "policy" || result.policyOutcome === undefined) {
    return { ok: false, code: "registration", receipt: result.receipt };
  }
  return { ok: true, outcome: result.policyOutcome, receipt: result.receipt };
}

export async function registerAdmittedPlugins(
  input: RegisterAdmittedPluginsInput,
): Promise<RegisterAdmittedPluginsResult> {
  const clock = input.clock ?? { now: () => Date.now() };
  if (!isAdmissionTicket(input.ticket)) return { ok: false, code: "admission" };
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs <= clock.now()) {
    return { ok: false, code: "deadline" };
  }

  const registrations: PluginRegistration[] = [];
  const receipts: PluginLifecycleReceipt[] = [];
  for (const descriptor of resolveAdmittedPluginOrder(input.ticket)) {
    const result = await runPluginSession({
      ticket: input.ticket,
      containerPort: input.containerPort,
      pluginId: descriptor.id,
      deadlineMs: input.deadlineMs,
      clock,
    });
    if (!result.ok) {
      const code = result.code === "operation" || result.code === "policy" ? "protocol" : result.code;
      return {
        ...result,
        code,
        pluginId: descriptor.id,
      };
    }
    registrations.push(result.registration);
    receipts.push(result.receipt);
  }
  return {
    ok: true,
    registrations: Object.freeze(registrations),
    receipts: Object.freeze(receipts),
  };
}
