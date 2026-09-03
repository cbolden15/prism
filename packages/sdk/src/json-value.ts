import {
  MAX_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
  type JsonValue,
} from "./protocol.js";

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const encoder = new TextEncoder();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: string): boolean {
  return encoder.encode(value).byteLength <= MAX_STRING_BYTES;
}

function normalizeJson(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > MAX_JSON_DEPTH) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return boundedString(value) ? value : undefined;
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) return undefined;
    const normalized: JsonValue[] = [];
    for (const item of value) {
      const child = normalizeJson(item, depth + 1);
      if (child === undefined) return undefined;
      normalized.push(child);
    }
    return Object.freeze(normalized) as JsonValue[];
  }
  if (!isPlainRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.length > MAX_OBJECT_KEYS
    || Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return undefined;
  }
  const normalized: Record<string, JsonValue> = {};
  for (const key of keys.sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key) || !boundedString(key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || descriptor.get !== undefined
      || descriptor.set !== undefined
      || !descriptor.enumerable
    ) {
      return undefined;
    }
    const child = normalizeJson(descriptor.value, depth + 1);
    if (child === undefined) return undefined;
    normalized[key] = child;
  }
  return Object.freeze(normalized);
}

export function normalizeJsonValue(value: unknown): JsonValue | undefined {
  return normalizeJson(value);
}
