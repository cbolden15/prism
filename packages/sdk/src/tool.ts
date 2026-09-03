import {
  MAX_STRING_BYTES,
  type JsonValue,
} from "./protocol.js";
import { normalizeJsonValue } from "./json-value.js";

export const MAX_TOOL_DESCRIPTION_BYTES = 4_096;
export const MAX_TOOL_OPERATIONS = 64;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEFINITION_KEYS = ["id", "description", "operations"] as const;
const OPERATION_KEYS = ["name", "description"] as const;
const REQUEST_KEYS = ["operation", "input"] as const;
const encoder = new TextEncoder();

export interface ToolOperationDefinition {
  readonly name: string;
  readonly description: string;
}

export interface ToolDefinition {
  readonly id: string;
  readonly description: string;
  readonly operations: readonly ToolOperationDefinition[];
}

export interface ToolRequest {
  readonly operation: string;
  readonly input: JsonValue;
}

export interface ToolCallContext {
  readonly signal: AbortSignal;
  readonly deadlineAtMs: number;
}

export interface Tool {
  readonly definition: ToolDefinition;
  invoke(request: ToolRequest, context: ToolCallContext): Promise<JsonValue>;
}

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

function boundedDescription(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && encoder.encode(value).byteLength <= MAX_TOOL_DESCRIPTION_BYTES
    && encoder.encode(value).byteLength <= MAX_STRING_BYTES
  );
}

export function validateToolDefinition(value: unknown): ToolDefinition | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, DEFINITION_KEYS)) return null;
  if (
    typeof value.id !== "string"
    || !SLUG_RE.test(value.id)
    || !boundedDescription(value.description)
    || !Array.isArray(value.operations)
    || value.operations.length === 0
    || value.operations.length > MAX_TOOL_OPERATIONS
  ) {
    return null;
  }
  const operations: ToolOperationDefinition[] = [];
  let previousName = "";
  for (const raw of value.operations) {
    if (!isPlainRecord(raw) || !hasExactDataKeys(raw, OPERATION_KEYS)) return null;
    if (
      typeof raw.name !== "string"
      || !SLUG_RE.test(raw.name)
      || raw.name <= previousName
      || !boundedDescription(raw.description)
    ) {
      return null;
    }
    operations.push(Object.freeze({ name: raw.name, description: raw.description }));
    previousName = raw.name;
  }
  return Object.freeze({
    id: value.id,
    description: value.description,
    operations: Object.freeze(operations),
  });
}

export function validateToolRequest(value: unknown): ToolRequest | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, REQUEST_KEYS)) return null;
  if (typeof value.operation !== "string" || !SLUG_RE.test(value.operation)) return null;
  const input = normalizeJsonValue(value.input);
  return input === undefined ? null : Object.freeze({ operation: value.operation, input });
}

export type { JsonValue } from "./protocol.js";
export type { ToolRegistration } from "./registration.js";
export { validatePluginRegistration } from "./registration.js";
