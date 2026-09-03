import { randomUUID } from "node:crypto";
import {
  MAX_WIRE_BUFFER_BYTES,
  MAX_WIRE_FRAME_BYTES,
} from "@useprism/sdk/protocol/resource-bounds";
import {
  PLUGIN_STREAM_CHUNK_BYTES,
  PLUGIN_STREAM_CUMULATIVE_BYTES,
  type PluginContainerHandle,
  type PluginContainerPort,
  type PluginLifecycleReceipt,
  type PluginLaunchRequest,
} from "../kernel/plugin-container-port.ts";
import {
  isAdmissionTicket,
  resolveAdmittedPlugin,
  type AdmissionTicket,
} from "../runtime/admission-ticket.ts";

const VERSION = 1;
const MAX_FRAME_BYTES = MAX_WIRE_FRAME_BYTES;
const MAX_CUMULATIVE_WIRE_BYTES = MAX_WIRE_BUFFER_BYTES;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const RESPONSE_KEYS = ["v", "type", "operationId", "ok", "result", "code"];
const EVENT_KEYS = ["v", "type", "event"];
const RECEIPT_KEYS = [
  "v",
  "requestId",
  "pluginId",
  "containerId",
  "trigger",
  "hardDeadlineAtMs",
  "daemonState",
  "exitCode",
  "oomKilled",
  "confirmedAbsent",
  "cleanupErrors",
  "settledAtMs",
];
const RECEIPT_TRIGGERS = new Set<PluginLifecycleReceipt["trigger"]>([
  "broker-stop",
  "deadline",
  "launch-failed",
  "supervisor-shutdown",
  "process-exit",
  "stream-overflow",
]);

export interface GatewayByteTransport {
  write(bytes: Uint8Array): Promise<void>;
  onData(listener: (bytes: Uint8Array) => void): void;
  onClose(listener: (error?: Error) => void): void;
}

export interface DockerBrokerPluginContainerOptions {
  readonly ticket: AdmissionTicket;
  readonly token: string;
  readonly transport: GatewayByteTransport;
  readonly clock?: { now(): number };
  readonly randomId?: () => string;
}

type GatewayAction = "launch" | "write" | "close-input" | "cleanup" | "acknowledge";

interface GatewayRequest {
  readonly operationId: string;
  readonly action: GatewayAction;
  readonly requestId: string;
  readonly pluginId: string;
  readonly deadlineMs: number;
  readonly seq?: number;
  readonly dataBase64?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function appendBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left);
  combined.set(right, left.byteLength);
  return combined;
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== value) return null;
  return bytes;
}

function validIdentity(value: Record<string, unknown>, requestId: string, pluginId: string): boolean {
  return value.requestId === requestId && value.pluginId === pluginId;
}

function validateReceipt(value: unknown, requestId: string, pluginId: string): PluginLifecycleReceipt | null {
  if (!hasExactKeys(value, RECEIPT_KEYS) || value.v !== VERSION || !validIdentity(value, requestId, pluginId)) return null;
  if (
    (value.containerId !== null && typeof value.containerId !== "string") ||
    typeof value.trigger !== "string" ||
    !RECEIPT_TRIGGERS.has(value.trigger as PluginLifecycleReceipt["trigger"]) ||
    typeof value.hardDeadlineAtMs !== "number" ||
    !Number.isSafeInteger(value.hardDeadlineAtMs) ||
    typeof value.daemonState !== "string" ||
    (value.exitCode !== null && (!Number.isSafeInteger(value.exitCode) || typeof value.exitCode !== "number")) ||
    (value.oomKilled !== null && typeof value.oomKilled !== "boolean") ||
    typeof value.confirmedAbsent !== "boolean" ||
    !Array.isArray(value.cleanupErrors) ||
    value.cleanupErrors.some((entry) => typeof entry !== "string") ||
    typeof value.settledAtMs !== "number" ||
    !Number.isSafeInteger(value.settledAtMs)
  ) {
    return null;
  }
  return Object.freeze({
    v: 1,
    requestId,
    pluginId,
    containerId: value.containerId as string | null,
    trigger: value.trigger as PluginLifecycleReceipt["trigger"],
    hardDeadlineAtMs: value.hardDeadlineAtMs,
    daemonState: value.daemonState,
    exitCode: value.exitCode as number | null,
    oomKilled: value.oomKilled as boolean | null,
    confirmedAbsent: value.confirmedAbsent,
    cleanupErrors: Object.freeze([...(value.cleanupErrors as string[])]),
    settledAtMs: value.settledAtMs,
  });
}

class LiveHandle implements PluginContainerHandle {
  readonly requestId: string;
  readonly pluginId: string;
  hardDeadlineAtMs: number;
  private readonly admissionDeadlineMs: number;
  private readonly requestGateway: (request: Omit<GatewayRequest, "operationId">) => Promise<unknown>;
  private readonly remove: () => void;
  private readonly fatal: (error: Error) => void;
  private inputQueue: Promise<void> = Promise.resolve();
  private inputClosed = false;
  private inputSeq = 0;
  private inputBytes = 0;
  private outputSeq = 0;
  private outputBytes = 0;
  private stdoutListeners: Array<(bytes: Uint8Array) => void> = [];
  private stderrListeners: Array<(bytes: Uint8Array) => void> = [];
  private buffered: Array<{ channel: "stdout" | "stderr"; bytes: Uint8Array }> = [];
  private terminalQueued = false;
  private terminal = false;
  private receipt?: PluginLifecycleReceipt;
  private terminalReceiptBytes?: string;
  private failed?: Error;
  private readonly exitPromise: Promise<PluginLifecycleReceipt>;
  private resolveExit!: (receipt: PluginLifecycleReceipt) => void;
  private rejectExit!: (error: Error) => void;

  constructor(options: {
    requestId: string;
    pluginId: string;
    deadlineMs: number;
    requestGateway: (request: Omit<GatewayRequest, "operationId">) => Promise<unknown>;
    remove: () => void;
    fatal: (error: Error) => void;
  }) {
    this.requestId = options.requestId;
    this.pluginId = options.pluginId;
    this.admissionDeadlineMs = options.deadlineMs;
    this.hardDeadlineAtMs = options.deadlineMs;
    this.requestGateway = options.requestGateway;
    this.remove = options.remove;
    this.fatal = options.fatal;
    this.exitPromise = new Promise((resolvePromise, reject) => {
      this.resolveExit = resolvePromise;
      this.rejectExit = reject;
    });
    void this.exitPromise.catch(() => undefined);
  }

  setHardDeadline(value: number): void {
    this.hardDeadlineAtMs = value;
  }

  writeStdin(bytes: Uint8Array): Promise<void> {
    try {
      this.assertActive();
    } catch (error) {
      return Promise.reject(error);
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > PLUGIN_STREAM_CHUNK_BYTES) {
      return Promise.reject(new TypeError("invalid plugin input chunk"));
    }
    const copy = bytes.slice();
    const operation = this.inputQueue.then(() => this.writeStdinNow(copy));
    this.inputQueue = operation.catch(() => undefined);
    return operation;
  }

  private async writeStdinNow(bytes: Uint8Array): Promise<void> {
    this.assertActive();
    if (this.inputClosed) throw new Error("plugin input is closed");
    const nextBytes = this.inputBytes + bytes.byteLength;
    if (nextBytes > PLUGIN_STREAM_CUMULATIVE_BYTES) throw new Error("plugin input byte limit exceeded");
    const seq = this.inputSeq + 1;
    await this.requestGateway({
      action: "write",
      requestId: this.requestId,
      pluginId: this.pluginId,
      deadlineMs: this.admissionDeadlineMs,
      seq,
      dataBase64: Buffer.from(bytes).toString("base64"),
    });
    this.inputSeq = seq;
    this.inputBytes = nextBytes;
  }

  closeStdin(): Promise<void> {
    try {
      this.assertActive();
    } catch (error) {
      return Promise.reject(error);
    }
    const operation = this.inputQueue.then(async () => {
      this.assertActive();
      if (this.inputClosed) return;
      await this.requestGateway({
        action: "close-input",
        requestId: this.requestId,
        pluginId: this.pluginId,
        deadlineMs: this.admissionDeadlineMs,
      });
      this.inputClosed = true;
    });
    this.inputQueue = operation.catch(() => undefined);
    return operation;
  }

  onStdout(listener: (bytes: Uint8Array) => void): void {
    if (typeof listener !== "function") throw new TypeError("stdout listener must be a function");
    this.stdoutListeners.push(listener);
    this.flushBuffered("stdout", listener);
  }

  onStderr(listener: (bytes: Uint8Array) => void): void {
    if (typeof listener !== "function") throw new TypeError("stderr listener must be a function");
    this.stderrListeners.push(listener);
    this.flushBuffered("stderr", listener);
  }

  waitForExit(): Promise<PluginLifecycleReceipt> {
    return this.exitPromise;
  }

  async stop(): Promise<PluginLifecycleReceipt> {
    if (this.receipt !== undefined) return this.receipt;
    this.assertNotFailed();
    const result = await this.requestGateway({
      action: "cleanup",
      requestId: this.requestId,
      pluginId: this.pluginId,
      deadlineMs: this.hardDeadlineAtMs,
    });
    const value = result as { status?: unknown; receipt?: unknown };
    const receipt = validateReceipt(value.receipt, this.requestId, this.pluginId);
    if (value.status !== "terminal" || receipt === null || !receipt.confirmedAbsent) {
      throw new Error("cleanup did not return daemon-confirmed absence");
    }
    this.receiveTerminal(receipt);
    return this.exitPromise;
  }

  async acknowledge(deadlineMs: number): Promise<void> {
    this.assertNotFailed();
    if (!this.terminal || this.receipt === undefined) throw new Error("plugin lifecycle is not terminal");
    await this.requestGateway({
      action: "acknowledge",
      requestId: this.requestId,
      pluginId: this.pluginId,
      deadlineMs,
    });
    this.remove();
  }

  receiveStream(event: Record<string, unknown>): void {
    if (this.failed !== undefined) return;
    if (this.terminalQueued || this.terminal) {
      this.fatal(new Error("plugin output after terminal receipt"));
      return;
    }
    if (event.seq !== this.outputSeq + 1 || (event.channel !== "stdout" && event.channel !== "stderr")) {
      this.fatal(new Error("invalid plugin output sequence"));
      return;
    }
    const bytes = decodeBase64(event.dataBase64);
    if (bytes === null || bytes.byteLength > PLUGIN_STREAM_CHUNK_BYTES) {
      this.fatal(new Error("invalid plugin output bytes"));
      return;
    }
    this.outputBytes += bytes.byteLength;
    if (this.outputBytes > PLUGIN_STREAM_CUMULATIVE_BYTES) {
      this.fatal(new Error("plugin output byte limit exceeded"));
      return;
    }
    this.outputSeq = event.seq as number;
    const channel = event.channel as "stdout" | "stderr";
    const listeners = channel === "stdout" ? this.stdoutListeners : this.stderrListeners;
    if (listeners.length === 0) {
      this.buffered.push({ channel, bytes });
      return;
    }
    for (const listener of listeners) listener(bytes.slice());
  }

  receiveTerminal(receipt: PluginLifecycleReceipt): void {
    if (this.failed !== undefined) return;
    const receiptBytes = JSON.stringify(receipt);
    if (this.terminalQueued || this.terminal) {
      if (receiptBytes === this.terminalReceiptBytes) return;
      this.fatal(new Error("divergent terminal receipt"));
      return;
    }
    if (!receipt.confirmedAbsent) {
      this.fatal(new Error("terminal receipt lacks daemon-confirmed absence"));
      return;
    }
    this.terminalQueued = true;
    this.terminalReceiptBytes = receiptBytes;
    queueMicrotask(() => {
      if (this.failed !== undefined || !this.terminalQueued) return;
      this.terminal = true;
      this.receipt = receipt;
      this.resolveExit(receipt);
    });
  }

  fail(error: Error): void {
    if (this.failed !== undefined) return;
    this.failed = error;
    this.rejectExit(error);
  }

  private assertActive(): void {
    this.assertNotFailed();
    if (this.terminalQueued || this.terminal) throw new Error("plugin lifecycle is terminal");
  }

  private assertNotFailed(): void {
    if (this.failed !== undefined) throw this.failed;
  }

  private flushBuffered(channel: "stdout" | "stderr", listener: (bytes: Uint8Array) => void): void {
    const remaining: typeof this.buffered = [];
    for (const entry of this.buffered) {
      if (entry.channel === channel) listener(entry.bytes.slice());
      else remaining.push(entry);
    }
    this.buffered = remaining;
  }
}

export function createDockerBrokerPluginContainer(options: DockerBrokerPluginContainerOptions): PluginContainerPort {
  if (!isAdmissionTicket(options?.ticket)) throw new TypeError("unverified admission ticket");
  if (typeof options.token !== "string" || !TOKEN_RE.test(options.token)) throw new TypeError("invalid gateway token");
  if (
    options.transport === null ||
    typeof options.transport !== "object" ||
    typeof options.transport.write !== "function" ||
    typeof options.transport.onData !== "function" ||
    typeof options.transport.onClose !== "function"
  ) {
    throw new TypeError("invalid gateway byte transport");
  }

  const clock = options.clock ?? { now: () => Date.now() };
  const randomId = options.randomId ?? randomUUID;
  const pending = new Map<string, {
    request: GatewayRequest;
    resolve(value: unknown): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
    settlementQueued: boolean;
    response?: Record<string, unknown>;
  }>();
  const seenOperations = new Set<string>();
  const handles = new Map<string, LiveHandle>();
  let buffer = new Uint8Array();
  let failed: Error | undefined;

  function fail(error: Error): void {
    if (failed !== undefined) return;
    failed = error;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    for (const handle of handles.values()) handle.fail(error);
  }

  function validateResult(result: unknown, request: GatewayRequest): unknown {
    if (!isPlainRecord(result) || typeof result.status !== "string") {
      throw new Error("gateway result identity mismatch");
    }
    if (request.action === "cleanup") {
      const receipt = validateReceipt(result.receipt, request.requestId, request.pluginId);
      if (result.status !== "terminal" || receipt === null || !receipt.confirmedAbsent) {
        throw new Error("invalid gateway cleanup result");
      }
      return { status: "terminal", receipt };
    }
    if (!validIdentity(result, request.requestId, request.pluginId)) throw new Error("gateway result identity mismatch");
    if (request.action === "launch") {
      if (
        result.status !== "running" ||
        typeof result.hardDeadlineAtMs !== "number" ||
        !Number.isSafeInteger(result.hardDeadlineAtMs)
      ) {
        throw new Error("invalid gateway launch result");
      }
      return result;
    }
    if (request.action === "write") {
      if (result.status !== "input-written" || result.seq !== request.seq) throw new Error("invalid gateway write result");
      return result;
    }
    if (request.action === "close-input") {
      if (result.status !== "input-closed") throw new Error("invalid gateway input-close result");
      return result;
    }
    if (result.status !== "acknowledged") throw new Error("invalid gateway acknowledgement");
    return result;
  }

  function handleResponse(frame: Record<string, unknown>): void {
    if (
      !hasExactKeys(frame, RESPONSE_KEYS) ||
      frame.v !== VERSION ||
      frame.type !== "response" ||
      typeof frame.operationId !== "string" ||
      typeof frame.ok !== "boolean" ||
      (frame.ok ? frame.code !== null : typeof frame.code !== "string") ||
      (frame.ok ? frame.result === null : frame.result !== null)
    ) {
      fail(new Error("invalid gateway response"));
      return;
    }
    const entry = pending.get(frame.operationId);
    if (entry === undefined || entry.settlementQueued) {
      fail(new Error("duplicate gateway response"));
      return;
    }
    entry.settlementQueued = true;
    entry.response = frame;
    queueMicrotask(() => {
      if (failed !== undefined || !pending.has(frame.operationId as string)) return;
      pending.delete(frame.operationId as string);
      clearTimeout(entry.timer);
      if (!frame.ok) {
        entry.reject(new Error(`gateway request failed: ${frame.code as string}`));
        return;
      }
      try {
        entry.resolve(validateResult(frame.result, entry.request));
      } catch (error) {
        entry.reject(error instanceof Error ? error : new Error("invalid gateway result"));
      }
    });
  }

  function handleEvent(frame: Record<string, unknown>): void {
    if (!hasExactKeys(frame, EVENT_KEYS) || frame.v !== VERSION || frame.type !== "event" || !isPlainRecord(frame.event)) {
      fail(new Error("invalid gateway event"));
      return;
    }
    const event = frame.event;
    if (event.type === "stream") {
      if (
        !hasExactKeys(event, ["v", "type", "requestId", "pluginId", "channel", "seq", "dataBase64"]) ||
        event.v !== VERSION ||
        typeof event.requestId !== "string" ||
        typeof event.pluginId !== "string"
      ) {
        fail(new Error("invalid gateway stream event"));
        return;
      }
      const handle = handles.get(event.requestId);
      if (handle === undefined || handle.pluginId !== event.pluginId) {
        fail(new Error("gateway event has no active allocation"));
        return;
      }
      handle.receiveStream(event);
      return;
    }
    if (event.type !== "terminal" || !hasExactKeys(event, ["v", "type", "receipt"]) || event.v !== VERSION) {
      fail(new Error("invalid gateway terminal event"));
      return;
    }
    const rawReceipt = event.receipt;
    if (!isPlainRecord(rawReceipt) || typeof rawReceipt.requestId !== "string" || typeof rawReceipt.pluginId !== "string") {
      fail(new Error("invalid gateway terminal receipt"));
      return;
    }
    const handle = handles.get(rawReceipt.requestId);
    if (handle === undefined || handle.pluginId !== rawReceipt.pluginId) {
      fail(new Error("gateway terminal has no active allocation"));
      return;
    }
    const receipt = validateReceipt(rawReceipt, handle.requestId, handle.pluginId);
    if (receipt === null) {
      fail(new Error("invalid gateway terminal receipt"));
      return;
    }
    handle.receiveTerminal(receipt);
  }

  function handleFrame(value: unknown): void {
    if (!isPlainRecord(value) || typeof value.type !== "string") {
      fail(new Error("invalid gateway frame"));
      return;
    }
    if (value.type === "response") handleResponse(value);
    else if (value.type === "event") handleEvent(value);
    else fail(new Error("unexpected gateway frame"));
  }

  function receive(bytes: Uint8Array): void {
    if (failed !== undefined) return;
    if (!(bytes instanceof Uint8Array)) {
      fail(new Error("gateway transport yielded non-bytes"));
      return;
    }
    if (buffer.byteLength + bytes.byteLength > MAX_CUMULATIVE_WIRE_BYTES) {
      fail(new Error("gateway transport buffer limit exceeded"));
      return;
    }
    buffer = appendBytes(buffer, bytes);
    let consumed = 0;
    for (let index = 0; index < buffer.byteLength; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      const line = buffer.subarray(consumed, index);
      consumed = index + 1;
      if (line.byteLength === 0 || line.byteLength > MAX_FRAME_BYTES || line[line.byteLength - 1] === 0x0d) {
        fail(new Error("invalid gateway frame boundary"));
        return;
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(line);
      } catch {
        fail(new Error("invalid gateway frame UTF-8"));
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        fail(new Error("malformed gateway frame"));
        return;
      }
      if (text !== JSON.stringify(raw)) {
        fail(new Error("noncanonical gateway frame"));
        return;
      }
      handleFrame(raw);
      if (failed !== undefined) return;
    }
    if (consumed > 0) buffer = buffer.slice(consumed);
    if (buffer.byteLength > MAX_FRAME_BYTES) fail(new Error("gateway frame exceeded limit"));
  }

  async function requestGateway(input: Omit<GatewayRequest, "operationId">): Promise<unknown> {
    if (failed !== undefined) throw failed;
    const operationId = randomId();
    if (!ID_RE.test(operationId) || seenOperations.has(operationId)) throw new Error("invalid or duplicate operation ID");
    if (input.deadlineMs <= clock.now()) throw new Error("adapter request deadline exceeded");
    seenOperations.add(operationId);
    const request: GatewayRequest = { ...input, operationId };
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        const entry = pending.get(operationId);
        if (entry === undefined) return;
        pending.delete(operationId);
        reject(new Error("adapter request deadline exceeded"));
      }, input.deadlineMs - clock.now());
      timer.unref?.();
      pending.set(operationId, {
        request,
        resolve: resolvePromise,
        reject,
        timer,
        settlementQueued: false,
      });
      const frame = { v: VERSION, type: "request", token: options.token, operationId, ...input };
      const encoded = Buffer.from(`${JSON.stringify(frame)}\n`);
      if (encoded.byteLength - 1 > MAX_FRAME_BYTES) {
        clearTimeout(timer);
        pending.delete(operationId);
        reject(new Error("gateway request frame exceeded limit"));
        return;
      }
      void options.transport.write(encoded).catch((error) => {
        const writeError = error instanceof Error ? error : new Error("gateway transport write failed");
        fail(writeError);
      });
    });
  }

  options.transport.onData(receive);
  options.transport.onClose((error) => fail(error ?? new Error("gateway transport closed")));

  return Object.freeze({
    async launch(request: PluginLaunchRequest): Promise<PluginContainerHandle> {
      if (failed !== undefined) throw failed;
      if (
        !isPlainRecord(request) ||
        !hasExactKeys(request, ["requestId", "pluginId", "deadlineMs"]) ||
        !ID_RE.test(request.requestId) ||
        !PLUGIN_ID_RE.test(request.pluginId) ||
        !Number.isSafeInteger(request.deadlineMs) ||
        request.deadlineMs <= clock.now()
      ) {
        throw new TypeError("invalid plugin launch request");
      }
      if (resolveAdmittedPlugin(options.ticket, request.pluginId) === undefined) {
        throw new Error("plugin is not present in the admission ticket");
      }
      if (handles.has(request.requestId)) throw new Error("duplicate plugin request ID");
      const handle = new LiveHandle({
        ...request,
        requestGateway,
        remove: () => handles.delete(request.requestId),
        fatal: fail,
      });
      handles.set(request.requestId, handle);
      try {
        const result = await requestGateway({ action: "launch", ...request }) as { hardDeadlineAtMs: number };
        handle.setHardDeadline(result.hardDeadlineAtMs);
        return handle;
      } catch (error) {
        handles.delete(request.requestId);
        handle.fail(error instanceof Error ? error : new Error("plugin launch failed"));
        throw error;
      }
    },
  });
}

export function createNodeStreamGatewayTransport(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): GatewayByteTransport {
  const dataListeners: Array<(bytes: Uint8Array) => void> = [];
  const closeListeners: Array<(error?: Error) => void> = [];
  let closed = false;
  let closeError: Error | undefined;
  const close = (error?: Error) => {
    if (closed) return;
    closed = true;
    closeError = error ?? new Error("gateway transport closed");
    for (const listener of closeListeners) listener(error);
  };
  input.on("data", (chunk: Uint8Array) => {
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    for (const listener of dataListeners) listener(bytes);
  });
  input.on("end", () => close());
  input.on("close", () => close());
  input.on("error", (error) => close(error));
  output.on("error", (error) => close(error));
  return Object.freeze({
    write(bytes: Uint8Array) {
      if (closed) return Promise.reject(new Error("gateway transport closed"));
      return new Promise<void>((resolvePromise, reject) => {
        output.write(bytes, (error?: Error | null) => {
          if (error) reject(error);
          else resolvePromise();
        });
      });
    },
    onData(listener: (bytes: Uint8Array) => void) { dataListeners.push(listener); },
    onClose(listener: (error?: Error) => void) {
      closeListeners.push(listener);
      if (closed) listener(closeError);
    },
  });
}
