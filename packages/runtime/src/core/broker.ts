// PNH broker protocol core. The broker owns credentials and transports outside
// core. Core validates exact synthetic route/provider/model identity, digests,
// telemetry, and returns a normalized copy of the receipt.
import { DIGEST_RE, SLUG_RE } from "./grant.ts";

export interface BrokerRequest {
  grantDigest: string;
  routeClass: string;
  providerId: string;
  modelId: string;
  inputDigest: string;
}

export interface BrokerTelemetry {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  durationMs: number | null;
}

export interface BrokerReceipt {
  grantDigest: string;
  requestedRouteClass: string;
  observedRouteClass: string;
  requestedProviderId: string;
  observedProviderId: string;
  requestedModelId: string;
  observedModelId: string;
  inputDigest: string;
  resultDigest: string;
  telemetry: BrokerTelemetry;
}

export type ReceiptRejectCode =
  | "shape"
  | "unknown-key"
  | "grant-mismatch"
  | "route-drift"
  | "provider-drift"
  | "model-drift"
  | "input-mismatch"
  | "digest-format"
  | "telemetry";

const RECEIPT_KEYS = [
  "grantDigest",
  "requestedRouteClass",
  "observedRouteClass",
  "requestedProviderId",
  "observedProviderId",
  "requestedModelId",
  "observedModelId",
  "inputDigest",
  "resultDigest",
  "telemetry",
] as const;

const TELEMETRY_KEYS = [
  "inputTokens",
  "outputTokens",
  "cachedTokens",
  "durationMs",
] as const;

function countOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function durationOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(record);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(record);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return null;
  }
  return record;
}

export function checkReceipt(
  request: BrokerRequest,
  value: unknown,
): { ok: true; receipt: BrokerReceipt } | { ok: false; code: ReceiptRejectCode } {
  const record = plainRecord(value);
  if (record === null) {
    return { ok: false, code: "shape" };
  }
  for (const key of Object.keys(record)) {
    if (!(RECEIPT_KEYS as readonly string[]).includes(key)) {
      return { ok: false, code: "unknown-key" };
    }
  }
  for (const key of RECEIPT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return { ok: false, code: "shape" };
  }
  const telemetry = record["telemetry"];
  const telemetryRecord = plainRecord(telemetry);
  if (telemetryRecord === null) {
    return { ok: false, code: "telemetry" };
  }
  for (const key of Object.keys(telemetryRecord)) {
    if (!(TELEMETRY_KEYS as readonly string[]).includes(key)) {
      return { ok: false, code: "telemetry" };
    }
  }
  for (const key of TELEMETRY_KEYS) {
    const valid = key === "durationMs" ? durationOrNull(telemetryRecord[key]) : countOrNull(telemetryRecord[key]);
    if (!Object.prototype.hasOwnProperty.call(telemetryRecord, key) || !valid) {
      return { ok: false, code: "telemetry" };
    }
  }
  for (const key of ["grantDigest", "inputDigest", "resultDigest"] as const) {
    if (typeof record[key] !== "string" || !DIGEST_RE.test(record[key] as string)) {
      return { ok: false, code: "digest-format" };
    }
  }
  for (const key of [
    "requestedRouteClass", "observedRouteClass", "requestedProviderId", "observedProviderId",
    "requestedModelId", "observedModelId",
  ] as const) {
    if (typeof record[key] !== "string" || !SLUG_RE.test(record[key] as string)) {
      return { ok: false, code: "shape" };
    }
  }
  if (record["grantDigest"] !== request.grantDigest) {
    return { ok: false, code: "grant-mismatch" };
  }
  if (
    record["requestedRouteClass"] !== request.routeClass ||
    record["observedRouteClass"] !== request.routeClass
  ) {
    return { ok: false, code: "route-drift" };
  }
  if (record["requestedProviderId"] !== request.providerId || record["observedProviderId"] !== request.providerId) {
    return { ok: false, code: "provider-drift" };
  }
  if (record["requestedModelId"] !== request.modelId || record["observedModelId"] !== request.modelId) {
    return { ok: false, code: "model-drift" };
  }
  if (record["inputDigest"] !== request.inputDigest) {
    return { ok: false, code: "input-mismatch" };
  }
  return {
    ok: true,
    receipt: {
      grantDigest: record.grantDigest as string,
      requestedRouteClass: record.requestedRouteClass as string,
      observedRouteClass: record.observedRouteClass as string,
      requestedProviderId: record.requestedProviderId as string,
      observedProviderId: record.observedProviderId as string,
      requestedModelId: record.requestedModelId as string,
      observedModelId: record.observedModelId as string,
      inputDigest: record.inputDigest as string,
      resultDigest: record.resultDigest as string,
      telemetry: {
        inputTokens: telemetryRecord.inputTokens as number | null,
        outputTokens: telemetryRecord.outputTokens as number | null,
        cachedTokens: telemetryRecord.cachedTokens as number | null,
        durationMs: telemetryRecord.durationMs as number | null,
      },
    },
  };
}
