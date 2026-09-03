// PNH plugin application protocol. Pure validation and framing only: no core
// imports, host handles, clocks, filesystem access, or transport authority.

import {
  MAX_WIRE_BUFFER_BYTES,
  MAX_WIRE_FRAME_BYTES,
} from "./protocol/resource-bounds.js";

export const PLUGIN_PROTOCOL_VERSION = 1 as const;
export const MAX_FRAME_BYTES = MAX_WIRE_FRAME_BYTES;
export const MAX_CUMULATIVE_BYTES = MAX_WIRE_BUFFER_BYTES;
export const MAX_MESSAGE_COUNT = 256;
export const MAX_JSON_DEPTH = 16;
export const MAX_STRING_BYTES = 65_536;
export const MAX_ARRAY_LENGTH = 1_024;
export const MAX_OBJECT_KEYS = 128;

export const PLUGIN_KINDS = ["policy", "memory", "tool", "provider", "renderer"] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];
export const REQUEST_PHASES = ["register", "admit", "operate"] as const;
export type RequestPhase = (typeof REQUEST_PHASES)[number];

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PluginRequestFrame {
  v: typeof PLUGIN_PROTOCOL_VERSION;
  type: "request";
  requestId: string;
  seq: number;
  phase: RequestPhase;
  pluginId: string;
  kind: PluginKind;
  payload: JsonValue;
}

export interface PluginProtocolError {
  code: string;
  message: string;
}

export interface PluginResponseFrame {
  v: typeof PLUGIN_PROTOCOL_VERSION;
  type: "response";
  requestId: string;
  seq: number;
  ok: boolean;
  result: JsonValue;
  error: PluginProtocolError | null;
}

export type PluginFrame = PluginRequestFrame | PluginResponseFrame;

export type FrameDecodeCode =
  | "invalid-utf8"
  | "oversized-frame"
  | "cumulative-bytes"
  | "message-count"
  | "malformed-frame"
  | "invalid-frame"
  | "noncanonical-frame"
  | "sequence"
  | "unterminated-frame"
  | "decoder-failed";

export type FrameDecodeResult =
  | { ok: true; frames: PluginFrame[] }
  | { ok: false; code: FrameDecodeCode };

const REQUEST_KEYS = ["v", "type", "requestId", "seq", "phase", "pluginId", "kind", "payload"] as const;
const RESPONSE_KEYS = ["v", "type", "requestId", "seq", "ok", "result", "error"] as const;
const ERROR_KEYS = ["code", "message"] as const;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const encoder = new TextEncoder();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable
    ) {
      return false;
    }
  }
  return true;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function boundedString(value: unknown, pattern?: RegExp): value is string {
  return (
    typeof value === "string" &&
    encoder.encode(value).byteLength <= MAX_STRING_BYTES &&
    (pattern === undefined || pattern.test(value))
  );
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
    keys.length > MAX_OBJECT_KEYS ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return undefined;
  }

  const normalized: Record<string, JsonValue> = {};
  for (const key of keys.sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key) || !boundedString(key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    const child = normalizeJson(descriptor.value, depth + 1);
    if (child === undefined) return undefined;
    normalized[key] = child;
  }
  return Object.freeze(normalized);
}

function normalizeError(value: unknown): PluginProtocolError | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, ERROR_KEYS)) return null;
  if (!boundedString(value.code, SLUG_RE) || !boundedString(value.message) || value.message.length === 0) {
    return null;
  }
  return Object.freeze({ code: value.code, message: value.message });
}

export function validatePluginFrame(value: unknown): PluginFrame | null {
  if (!isPlainRecord(value)) return null;
  if (value.v !== PLUGIN_PROTOCOL_VERSION || !positiveSafeInteger(value.seq)) return null;
  if (!boundedString(value.requestId, REQUEST_ID_RE)) return null;

  if (value.type === "request") {
    if (!hasExactDataKeys(value, REQUEST_KEYS)) return null;
    if (!(REQUEST_PHASES as readonly unknown[]).includes(value.phase)) return null;
    if (!(PLUGIN_KINDS as readonly unknown[]).includes(value.kind)) return null;
    if (!boundedString(value.pluginId, SLUG_RE)) return null;
    const payload = normalizeJson(value.payload);
    if (payload === undefined) return null;
    return Object.freeze({
      v: PLUGIN_PROTOCOL_VERSION,
      type: "request",
      requestId: value.requestId,
      seq: value.seq,
      phase: value.phase as RequestPhase,
      pluginId: value.pluginId,
      kind: value.kind as PluginKind,
      payload,
    });
  }

  if (value.type !== "response" || !hasExactDataKeys(value, RESPONSE_KEYS) || typeof value.ok !== "boolean") {
    return null;
  }

  if (value.ok) {
    if (value.error !== null) return null;
    const result = normalizeJson(value.result);
    if (result === undefined) return null;
    return Object.freeze({
      v: PLUGIN_PROTOCOL_VERSION,
      type: "response",
      requestId: value.requestId,
      seq: value.seq,
      ok: true,
      result,
      error: null,
    });
  }

  if (value.result !== null) return null;
  const error = normalizeError(value.error);
  if (error === null) return null;
  return Object.freeze({
    v: PLUGIN_PROTOCOL_VERSION,
    type: "response",
    requestId: value.requestId,
    seq: value.seq,
    ok: false,
    result: null,
    error,
  });
}

export function encodePluginFrame(value: unknown): Uint8Array {
  const frame = validatePluginFrame(value);
  if (frame === null) throw new TypeError("invalid plugin frame");
  const bytes = encoder.encode(JSON.stringify(frame) + "\n");
  if (bytes.byteLength - 1 > MAX_FRAME_BYTES) throw new RangeError("plugin frame exceeds byte limit");
  return bytes;
}

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left);
  combined.set(right, left.byteLength);
  return combined;
}

export class NdjsonFrameDecoder {
  #buffer: Uint8Array = new Uint8Array();
  #cumulativeBytes = 0;
  #messageCount = 0;
  #nextSequence = 1;
  #failed = false;

  push(chunk: Uint8Array): FrameDecodeResult {
    if (this.#failed) return { ok: false, code: "decoder-failed" };
    if (!(chunk instanceof Uint8Array)) return this.#fail("malformed-frame");

    this.#cumulativeBytes += chunk.byteLength;
    if (this.#cumulativeBytes > MAX_CUMULATIVE_BYTES) return this.#fail("cumulative-bytes");
    this.#buffer = appendBytes(this.#buffer, chunk);

    const frames: PluginFrame[] = [];
    let consumed = 0;
    for (let index = 0; index < this.#buffer.byteLength; index += 1) {
      if (this.#buffer[index] !== 0x0a) continue;
      const line = this.#buffer.subarray(consumed, index);
      consumed = index + 1;
      if (line.byteLength === 0) return this.#fail("malformed-frame");
      if (line.byteLength > MAX_FRAME_BYTES) return this.#fail("oversized-frame");
      if (line[line.byteLength - 1] === 0x0d) return this.#fail("malformed-frame");

      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(line);
      } catch {
        return this.#fail("invalid-utf8");
      }

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return this.#fail("malformed-frame");
      }
      const frame = validatePluginFrame(raw);
      if (frame === null) return this.#fail("invalid-frame");
      if (text !== JSON.stringify(frame)) return this.#fail("noncanonical-frame");
      if (frame.seq !== this.#nextSequence) return this.#fail("sequence");

      this.#nextSequence += 1;
      this.#messageCount += 1;
      if (this.#messageCount > MAX_MESSAGE_COUNT) return this.#fail("message-count");
      frames.push(frame);
    }

    if (consumed > 0) this.#buffer = this.#buffer.slice(consumed);
    if (this.#buffer.byteLength > MAX_FRAME_BYTES) return this.#fail("oversized-frame");
    return { ok: true, frames };
  }

  finish(): FrameDecodeResult {
    if (this.#failed) return { ok: false, code: "decoder-failed" };
    if (this.#buffer.byteLength !== 0) return this.#fail("unterminated-frame");
    return { ok: true, frames: [] };
  }

  #fail(code: FrameDecodeCode): FrameDecodeResult {
    this.#failed = true;
    this.#buffer = new Uint8Array();
    return { ok: false, code };
  }
}
