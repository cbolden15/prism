import { deepFreeze } from "./deep-freeze.ts";
import {
  isAdmittedPluginAuthority,
  type AdmittedPluginAuthority,
  type PluginGrantValue,
} from "./plugin-kernel.ts";

export const CAPABILITY_REQUEST_VERSION = "pnh-capability-request-v1" as const;
export const CAPABILITY_INTENT_VERSION = "pnh-capability-intent-v1" as const;

export interface IntegerMaxRequest {
  readonly schema: "integer-max";
  readonly version: typeof CAPABILITY_REQUEST_VERSION;
  readonly value: number;
}

export interface StringSetRequest {
  readonly schema: "string-set";
  readonly version: typeof CAPABILITY_REQUEST_VERSION;
  readonly values: readonly string[];
}

export interface BooleanGateRequest {
  readonly schema: "boolean-gate";
  readonly version: typeof CAPABILITY_REQUEST_VERSION;
  readonly enabled: boolean;
}

export type CapabilityRequestedValue = IntegerMaxRequest | StringSetRequest | BooleanGateRequest;

export interface NormalizedCapabilityRequest {
  readonly capabilityId: string;
  readonly requested: CapabilityRequestedValue;
}

export type CapabilityRequestRejectCode =
  | "capability-not-granted"
  | "request-shape"
  | "request-widening"
  | "schema-mismatch";

export type CapabilityRequestValidationResult =
  | { readonly ok: true; readonly request: NormalizedCapabilityRequest }
  | { readonly ok: false; readonly code: CapabilityRequestRejectCode };

export interface CapabilityIntent extends NormalizedCapabilityRequest {
  readonly version: typeof CAPABILITY_INTENT_VERSION;
  readonly pluginId: string;
  readonly taskDigest: string;
  readonly pluginSetDigest: string;
  readonly catalogDigest: string;
  readonly grantDigest: string;
}

export interface CapabilityIntentPort {
  append(intent: CapabilityIntent): Promise<void>;
}

export interface CapabilityDispatchPort<Result = unknown> {
  dispatch(intent: CapabilityIntent): Promise<Result>;
}

export interface ExecuteCapabilityRequestInput<Result = unknown> {
  readonly authority: AdmittedPluginAuthority;
  readonly pluginId: string;
  readonly request: unknown;
  readonly intentPort: CapabilityIntentPort;
  readonly dispatchPort: CapabilityDispatchPort<Result>;
}

export type ExecuteCapabilityRequestResult<Result = unknown> =
  | { readonly ok: true; readonly intent: CapabilityIntent; readonly result: Result }
  | {
      readonly ok: false;
      readonly code: CapabilityRequestRejectCode | "authority" | "plugin-not-admitted" | "intent-append" | "dispatch";
    };

const REQUEST_KEYS = ["capabilityId", "requested"] as const;
const INTEGER_KEYS = ["schema", "version", "value"] as const;
const STRING_SET_KEYS = ["schema", "version", "values"] as const;
const BOOLEAN_KEYS = ["schema", "version", "enabled"] as const;
const REQUEST_SCHEMAS = ["integer-max", "string-set", "boolean-gate"] as const;
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

function normalizeRequested(
  granted: PluginGrantValue["capabilities"][number]["limit"],
  value: unknown,
): { ok: true; requested: CapabilityRequestedValue } | { ok: false; code: CapabilityRequestRejectCode } {
  if (!isPlainRecord(value)) return { ok: false, code: "request-shape" };
  if (
    value.version !== CAPABILITY_REQUEST_VERSION ||
    typeof value.schema !== "string" ||
    !(REQUEST_SCHEMAS as readonly string[]).includes(value.schema)
  ) {
    return { ok: false, code: "request-shape" };
  }
  if (value.schema !== granted.schema) return { ok: false, code: "schema-mismatch" };

  if (value.schema === "integer-max" && granted.schema === "integer-max") {
    if (!hasExactDataKeys(value, INTEGER_KEYS)) return { ok: false, code: "request-shape" };
    if (typeof value.value !== "number" || !Number.isSafeInteger(value.value) || value.value < 0) {
      return { ok: false, code: "request-shape" };
    }
    if (value.value > granted.max) return { ok: false, code: "request-widening" };
    return {
      ok: true,
      requested: Object.freeze({ schema: "integer-max", version: CAPABILITY_REQUEST_VERSION, value: value.value }),
    };
  }

  if (value.schema === "string-set" && granted.schema === "string-set") {
    if (!hasExactDataKeys(value, STRING_SET_KEYS) || !Array.isArray(value.values)) {
      return { ok: false, code: "request-shape" };
    }
    if (value.values.some((entry) => typeof entry !== "string" || !SLUG_RE.test(entry))) {
      return { ok: false, code: "request-shape" };
    }
    const values = value.values as string[];
    if (new Set(values).size !== values.length) return { ok: false, code: "request-shape" };
    if (values.some((entry) => !granted.values.includes(entry))) {
      return { ok: false, code: "request-widening" };
    }
    return {
      ok: true,
      requested: Object.freeze({
        schema: "string-set",
        version: CAPABILITY_REQUEST_VERSION,
        values: Object.freeze([...values].sort()),
      }),
    };
  }

  if (value.schema === "boolean-gate" && granted.schema === "boolean-gate") {
    if (!hasExactDataKeys(value, BOOLEAN_KEYS) || typeof value.enabled !== "boolean") {
      return { ok: false, code: "request-shape" };
    }
    if (value.enabled && !granted.enabled) return { ok: false, code: "request-widening" };
    return {
      ok: true,
      requested: Object.freeze({ schema: "boolean-gate", version: CAPABILITY_REQUEST_VERSION, enabled: value.enabled }),
    };
  }

  return { ok: false, code: "schema-mismatch" };
}

export function validateCapabilityRequest(
  grant: PluginGrantValue,
  value: unknown,
): CapabilityRequestValidationResult {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, REQUEST_KEYS)) {
    return { ok: false, code: "request-shape" };
  }
  if (typeof value.capabilityId !== "string" || !SLUG_RE.test(value.capabilityId)) {
    return { ok: false, code: "request-shape" };
  }
  const capability = grant.capabilities.find((entry) => entry.id === value.capabilityId);
  if (capability === undefined) return { ok: false, code: "capability-not-granted" };
  const normalized = normalizeRequested(capability.limit, value.requested);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    request: deepFreeze({ capabilityId: value.capabilityId, requested: normalized.requested }),
  };
}

export async function executeCapabilityRequest<Result = unknown>(
  input: ExecuteCapabilityRequestInput<Result>,
): Promise<ExecuteCapabilityRequestResult<Result>> {
  if (!isAdmittedPluginAuthority(input.authority)) return { ok: false, code: "authority" };
  const plugin = input.authority.plugins.find((entry) => entry.descriptor.id === input.pluginId);
  if (plugin === undefined) return { ok: false, code: "plugin-not-admitted" };
  const validated = validateCapabilityRequest(plugin.grant, input.request);
  if (!validated.ok) return validated;

  const intent = deepFreeze({
    version: CAPABILITY_INTENT_VERSION,
    pluginId: plugin.descriptor.id,
    taskDigest: plugin.grant.taskDigest,
    pluginSetDigest: input.authority.pluginSetDigest,
    catalogDigest: plugin.grant.catalogDigest,
    grantDigest: plugin.grantDigest,
    capabilityId: validated.request.capabilityId,
    requested: validated.request.requested,
  });
  try {
    await input.intentPort.append(intent);
  } catch {
    return { ok: false, code: "intent-append" };
  }
  try {
    return { ok: true, intent, result: await input.dispatchPort.dispatch(intent) };
  } catch {
    return { ok: false, code: "dispatch" };
  }
}
