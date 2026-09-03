import {
  MAX_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
  type JsonValue,
} from "./protocol.js";

export const MAX_PROVIDER_DECISION_BYTES = 100_000;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOOL_KEYS = ["kind", "tool", "operation", "input"] as const;
const FINAL_KEYS = ["kind", "answer"] as const;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const encoder = new TextEncoder();

export interface ProviderToolDecision {
  readonly kind: "tool";
  readonly tool: string;
  readonly operation: string;
  readonly input: JsonValue;
}

export interface ProviderFinalDecision {
  readonly kind: "final";
  readonly answer: string;
}

export type ProviderDecision = ProviderToolDecision | ProviderFinalDecision;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function boundedString(value: unknown): value is string {
  return typeof value === "string" && encoder.encode(value).byteLength <= MAX_STRING_BYTES;
}

function normalizeArray(value: unknown[], depth: number): JsonValue[] | undefined {
  if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_LENGTH) return undefined;
  const expectedKeys = Array.from({ length: value.length }, (_unused, index) => String(index));
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length + 1 ||
    ownKeys.some((key) => key !== "length" && (typeof key !== "string" || !expectedKeys.includes(key)))
  ) {
    return undefined;
  }
  const normalized: JsonValue[] = [];
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      return undefined;
    }
    const child = normalizeJson(descriptor.value, depth + 1);
    if (child === undefined) return undefined;
    normalized.push(child);
  }
  return Object.freeze(normalized) as JsonValue[];
}

function normalizeJson(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > MAX_JSON_DEPTH) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return boundedString(value) ? value : undefined;
  if (Array.isArray(value)) return normalizeArray(value, depth);
  if (!isPlainRecord(value)) return undefined;

  const keys = Object.keys(value);
  if (
    keys.length > MAX_OBJECT_KEYS ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return undefined;
  }
  const normalized: Record<string, JsonValue> = {};
  for (const key of keys.sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key) || !boundedString(key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      return undefined;
    }
    const child = normalizeJson(descriptor.value, depth + 1);
    if (child === undefined) return undefined;
    normalized[key] = child;
  }
  return Object.freeze(normalized);
}

function withinDecisionBound(decision: ProviderDecision): boolean {
  return encoder.encode(JSON.stringify(decision)).byteLength <= MAX_PROVIDER_DECISION_BYTES;
}

export function validateProviderDecision(value: unknown): ProviderDecision | null {
  if (!isPlainRecord(value)) return null;
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (
    kindDescriptor === undefined ||
    !kindDescriptor.enumerable ||
    kindDescriptor.get !== undefined ||
    kindDescriptor.set !== undefined
  ) {
    return null;
  }
  const kind = kindDescriptor.value;
  if (kind === "tool") {
    if (!hasExactDataKeys(value, TOOL_KEYS)) return null;
    if (
      typeof value.tool !== "string" ||
      !SLUG_RE.test(value.tool) ||
      typeof value.operation !== "string" ||
      !SLUG_RE.test(value.operation)
    ) {
      return null;
    }
    const input = normalizeJson(value.input);
    if (input === undefined) return null;
    const decision = Object.freeze({
      kind: "tool" as const,
      tool: value.tool,
      operation: value.operation,
      input,
    });
    return withinDecisionBound(decision) ? decision : null;
  }
  if (kind !== "final" || !hasExactDataKeys(value, FINAL_KEYS)) return null;
  if (!boundedString(value.answer) || value.answer.length === 0) return null;
  const decision = Object.freeze({ kind: "final" as const, answer: value.answer });
  return withinDecisionBound(decision) ? decision : null;
}
