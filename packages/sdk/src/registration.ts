import { PLUGIN_KINDS, type PluginKind } from "./protocol.js";

export interface IdentityRegistration {
  readonly kind: Exclude<PluginKind, "tool">;
  readonly pluginId: string;
}

export interface ToolRegistration {
  readonly kind: "tool";
  readonly pluginId: string;
  readonly operations: readonly string[];
}

export type PluginRegistration = IdentityRegistration | ToolRegistration;

const IDENTITY_KEYS = ["kind", "pluginId"] as const;
const TOOL_KEYS = ["kind", "pluginId", "operations"] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable;
  });
}

export function validatePluginRegistration(value: unknown): PluginRegistration | null {
  if (!isPlainRecord(value) || typeof value.kind !== "string") return null;
  if (!(PLUGIN_KINDS as readonly string[]).includes(value.kind)) return null;
  if (typeof value.pluginId !== "string" || !SLUG_RE.test(value.pluginId)) return null;

  if (value.kind !== "tool") {
    if (!hasExactDataKeys(value, IDENTITY_KEYS)) return null;
    return Object.freeze({ kind: value.kind as Exclude<PluginKind, "tool">, pluginId: value.pluginId });
  }

  if (!hasExactDataKeys(value, TOOL_KEYS) || !Array.isArray(value.operations) || value.operations.length === 0) {
    return null;
  }
  const operations = value.operations as unknown[];
  if (operations.some((operation) => typeof operation !== "string" || !SLUG_RE.test(operation))) return null;
  if (new Set(operations).size !== operations.length) return null;
  const sorted = [...operations].sort();
  if (operations.some((operation, index) => operation !== sorted[index])) return null;
  return Object.freeze({
    kind: "tool",
    pluginId: value.pluginId,
    operations: Object.freeze([...(operations as string[])]),
  });
}
