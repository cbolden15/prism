import {
  MAX_PROVIDER_PROMPT_BYTES,
  validateProviderRequest,
  validateProviderResponse,
  type Provider,
  type ProviderCallContext,
  type ProviderRequest,
  type ProviderResponse,
} from "@useprism/sdk/provider";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_JSON_STRING_BYTE_EXPANSION = 6;
const MAX_REQUEST_ENVELOPE_BYTES = 1_024;
const DEFAULT_MAX_REQUEST_BYTES =
  MAX_PROVIDER_PROMPT_BYTES * MAX_JSON_STRING_BYTE_EXPANSION + MAX_REQUEST_ENVELOPE_BYTES;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ENDPOINT_ORIGIN_CHARS = 2_048;
const MAX_CONFIGURED_BYTES = 8_000_000;
const MAX_TIMEOUT_MS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type OllamaProviderErrorCode =
  | "aborted"
  | "http-error"
  | "invalid-endpoint"
  | "invalid-options"
  | "invalid-request"
  | "invalid-response"
  | "malformed-response"
  | "model-not-found"
  | "oversized-request"
  | "oversized-response"
  | "timeout"
  | "unavailable";

export interface OllamaProviderErrorMetadata {
  readonly endpointOrigin?: string;
  readonly model?: string;
  readonly status?: number;
}

export class OllamaProviderError extends Error {
  readonly code: OllamaProviderErrorCode;
  readonly metadata: Readonly<OllamaProviderErrorMetadata>;

  constructor(code: OllamaProviderErrorCode, metadata: OllamaProviderErrorMetadata = {}) {
    super(`Ollama provider error: ${code}`);
    this.name = "OllamaProviderError";
    this.code = code;
    this.metadata = Object.freeze({ ...metadata });
  }
}

export interface OllamaProviderOptions {
  readonly endpoint: string;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
}

interface ValidatedOptions {
  readonly endpointOrigin: string;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

interface OllamaWireResponse {
  readonly model: string;
  readonly response: string;
  readonly done: true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function optionByteLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CONFIGURED_BYTES) {
    throw new OllamaProviderError("invalid-options");
  }
  return limit;
}

function optionTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new OllamaProviderError("invalid-options");
  }
  return timeoutMs;
}

function endpointOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ENDPOINT_ORIGIN_CHARS) {
    throw new OllamaProviderError("invalid-endpoint");
  }
  try {
    const endpoint = new URL(value);
    if (
      (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.pathname !== "/" ||
      endpoint.search !== "" ||
      endpoint.hash !== "" ||
      endpoint.origin.length > MAX_ENDPOINT_ORIGIN_CHARS
    ) {
      throw new OllamaProviderError("invalid-endpoint");
    }
    return endpoint.origin;
  } catch (error) {
    if (error instanceof OllamaProviderError) throw error;
    throw new OllamaProviderError("invalid-endpoint");
  }
}

function validateOptions(options: OllamaProviderOptions): ValidatedOptions {
  if (!isPlainRecord(options)) throw new OllamaProviderError("invalid-options");
  return Object.freeze({
    endpointOrigin: endpointOrigin(options.endpoint),
    maxRequestBytes: optionByteLimit(options.maxRequestBytes, DEFAULT_MAX_REQUEST_BYTES),
    maxResponseBytes: optionByteLimit(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES),
    timeoutMs: optionTimeout(options.timeoutMs),
  });
}

function metadata(options: ValidatedOptions, model: string, status?: number): OllamaProviderErrorMetadata {
  return Object.freeze({
    endpointOrigin: options.endpointOrigin,
    model,
    ...(status === undefined ? {} : { status }),
  });
}

async function cancel(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {}
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const nextLength = byteLength + result.value.byteLength;
      if (nextLength > maxBytes) {
        await cancel(reader);
        throw new OllamaProviderError("oversized-response");
      }
      chunks.push(result.value);
      byteLength = nextLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseWireResponse(bytes: Uint8Array, expectedModel: string): OllamaWireResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new OllamaProviderError("malformed-response");
  }
  if (
    !isPlainRecord(parsed) ||
    typeof parsed.model !== "string" ||
    parsed.model !== expectedModel ||
    typeof parsed.response !== "string" ||
    parsed.response.length === 0 ||
    parsed.done !== true
  ) {
    throw new OllamaProviderError("invalid-response");
  }
  try {
    JSON.parse(parsed.response);
  } catch {
    throw new OllamaProviderError("malformed-response");
  }
  return Object.freeze({
    model: parsed.model,
    response: parsed.response,
    done: true,
  });
}

function asProviderResponse(model: string, text: string): ProviderResponse {
  const response = validateProviderResponse({ providerId: "ollama", model, text });
  if (response === null) throw new OllamaProviderError("invalid-response");
  return response;
}

async function complete(
  options: ValidatedOptions,
  request: ProviderRequest,
  context?: ProviderCallContext,
): Promise<ProviderResponse> {
  const validatedRequest = validateProviderRequest(request);
  if (validatedRequest === null || validatedRequest.model === null) {
    throw new OllamaProviderError("invalid-request");
  }

  const body = JSON.stringify({
    model: validatedRequest.model,
    prompt: validatedRequest.prompt,
    stream: false,
    format: "json",
  });
  if (encoder.encode(body).byteLength > options.maxRequestBytes) {
    throw new OllamaProviderError("oversized-request", metadata(options, validatedRequest.model));
  }

  if (context?.signal.aborted) {
    throw new OllamaProviderError("aborted", metadata(options, validatedRequest.model));
  }

  const timeoutController = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const onCallerAbort = () => { callerAborted = true; };
  context?.signal.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, options.timeoutMs);
  const signal = context === undefined
    ? timeoutController.signal
    : AbortSignal.any([context.signal, timeoutController.signal]);

  try {
    const response = await fetch(`${options.endpointOrigin}/api/generate`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status >= 300 && response.status < 400) {
        throw new OllamaProviderError("unavailable", metadata(options, validatedRequest.model, response.status));
      }
      throw new OllamaProviderError(
        response.status === 404 ? "model-not-found" : "http-error",
        metadata(options, validatedRequest.model, response.status),
      );
    }
    const wire = parseWireResponse(await readResponseBytes(response, options.maxResponseBytes), validatedRequest.model);
    return asProviderResponse(wire.model, wire.response);
  } catch (error) {
    if (error instanceof OllamaProviderError) throw error;
    if (callerAborted || context?.signal.aborted) {
      throw new OllamaProviderError("aborted", metadata(options, validatedRequest.model));
    }
    if (timedOut) throw new OllamaProviderError("timeout", metadata(options, validatedRequest.model));
    throw new OllamaProviderError("unavailable", metadata(options, validatedRequest.model));
  } finally {
    clearTimeout(timeout);
    context?.signal.removeEventListener("abort", onCallerAbort);
  }
}

export function createOllamaProvider(options: OllamaProviderOptions): Provider {
  const validatedOptions = validateOptions(options);
  return Object.freeze({
    id: "ollama",
    complete(request: ProviderRequest, context?: ProviderCallContext): Promise<ProviderResponse> {
      return complete(validatedOptions, request, context);
    },
  });
}
