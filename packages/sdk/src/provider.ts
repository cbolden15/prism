export const MAX_PROVIDER_PROMPT_BYTES = 1_000_000;
export const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;

const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const REQUEST_KEYS = ["prompt", "model"] as const;
const RESPONSE_KEYS = ["providerId", "model", "text"] as const;
const encoder = new TextEncoder();

export interface ProviderRequest {
  readonly prompt: string;
  readonly model: string | null;
}

export interface ProviderResponse {
  readonly providerId: string;
  readonly model: string | null;
  readonly text: string;
}

export interface ProviderCallContext {
  readonly signal: AbortSignal;
}

export interface Provider {
  readonly id: string;
  complete(request: ProviderRequest, context?: ProviderCallContext): Promise<ProviderResponse>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function validModel(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && MODEL_ID_RE.test(value));
}

export function validateProviderRequest(value: unknown): ProviderRequest | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, REQUEST_KEYS)) return null;
  if (
    typeof value.prompt !== "string" ||
    value.prompt.length === 0 ||
    encoder.encode(value.prompt).byteLength > MAX_PROVIDER_PROMPT_BYTES ||
    !validModel(value.model)
  ) {
    return null;
  }
  return Object.freeze({ prompt: value.prompt, model: value.model });
}

export function validateProviderResponse(value: unknown): ProviderResponse | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, RESPONSE_KEYS)) return null;
  if (
    typeof value.providerId !== "string" ||
    !PROVIDER_ID_RE.test(value.providerId) ||
    !validModel(value.model) ||
    typeof value.text !== "string" ||
    value.text.length === 0 ||
    encoder.encode(value.text).byteLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    return null;
  }
  return Object.freeze({ providerId: value.providerId, model: value.model, text: value.text });
}
