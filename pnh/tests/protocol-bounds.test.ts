import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ARRAY_LENGTH,
  MAX_CUMULATIVE_BYTES,
  MAX_FRAME_BYTES,
  MAX_JSON_DEPTH,
  MAX_MESSAGE_COUNT,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
  NdjsonFrameDecoder,
  encodePluginFrame,
  validatePluginFrame,
} from "@useprism/sdk/protocol";

// One test per bound declared in PNH-INV-03's `bounds:` block. Every input is
// derived from the imported MAX_* constant at runtime — none of the seven
// numbers are hardcoded here — so the tests track the registry/code pin
// automatically if either side is re-pinned.

const encoder = new TextEncoder();

const request = {
  v: 1,
  type: "request",
  requestId: "req-1",
  seq: 1,
  phase: "register",
  pluginId: "tool-golden",
  kind: "tool",
  payload: { apiVersion: 1 },
} as const;

const PADDING_KEY_COUNT = 20;

function paddedPayload(len: number): Record<string, string> {
  const payload: Record<string, string> = {};
  for (let index = 0; index < PADDING_KEY_COUNT; index += 1) {
    payload[`k${String(index).padStart(2, "0")}`] = "a".repeat(len);
  }
  return payload;
}

function frameLineBytes(len: number, seq: number): number {
  const frame = validatePluginFrame({ ...request, seq, payload: paddedPayload(len) });
  assert.ok(frame !== null, "sanity: padded payload must be structurally valid");
  return encoder.encode(JSON.stringify(frame)).byteLength;
}

// Every unit of padding length adds exactly PADDING_KEY_COUNT ascii bytes
// (no JSON escaping), so two measurements are enough to solve for the
// largest padding length whose encoded line still fits MAX_FRAME_BYTES.
function maxPaddingLength(seq: number): number {
  const base = frameLineBytes(0, seq);
  const perUnit = frameLineBytes(1, seq) - base;
  const len = Math.floor((MAX_FRAME_BYTES - base) / perUnit);
  assert.ok(frameLineBytes(len, seq) <= MAX_FRAME_BYTES);
  assert.ok(frameLineBytes(len + 1, seq) > MAX_FRAME_BYTES);
  return len;
}

test("max_frame_bytes: a line at the bound decodes, one byte over fails closed", () => {
  const len = maxPaddingLength(request.seq);

  const accepted = encodePluginFrame({ ...request, payload: paddedPayload(len) });
  const decoder = new NdjsonFrameDecoder();
  assert.equal(decoder.push(accepted).ok, true);

  const overFrame = validatePluginFrame({ ...request, payload: paddedPayload(len + 1) });
  assert.ok(overFrame !== null);
  assert.throws(() => encodePluginFrame(overFrame), RangeError);

  const overLine = encoder.encode(`${JSON.stringify(overFrame)}\n`);
  const overDecoder = new NdjsonFrameDecoder();
  assert.deepEqual(overDecoder.push(overLine), { ok: false, code: "oversized-frame" });
});

test("max_cumulative_bytes: aggregate bytes across pushes are capped independent of frame size", () => {
  const frameCount = MAX_CUMULATIVE_BYTES / MAX_FRAME_BYTES;
  assert.ok(Number.isInteger(frameCount));

  const decoder = new NdjsonFrameDecoder();
  let totalBytes = 0;
  for (let seq = 1; seq <= frameCount; seq += 1) {
    const line = encodePluginFrame({ ...request, seq, payload: paddedPayload(maxPaddingLength(seq)) });
    totalBytes += line.byteLength;
    assert.equal(decoder.push(line).ok, true, `frame ${seq} should decode within cumulative bound`);
  }
  assert.ok(totalBytes <= MAX_CUMULATIVE_BYTES);

  const overflowDecoder = new NdjsonFrameDecoder();
  assert.deepEqual(
    overflowDecoder.push(new Uint8Array(MAX_CUMULATIVE_BYTES + 1)),
    { ok: false, code: "cumulative-bytes" },
  );
});

test("max_message_count: the (N+1)th message in a batch fails closed", () => {
  const lines: Uint8Array[] = [];
  for (let seq = 1; seq <= MAX_MESSAGE_COUNT + 1; seq += 1) {
    lines.push(encodePluginFrame({ ...request, seq }));
  }

  const overDecoder = new NdjsonFrameDecoder();
  assert.deepEqual(overDecoder.push(Buffer.concat(lines)), { ok: false, code: "message-count" });

  const underDecoder = new NdjsonFrameDecoder();
  const underResult = underDecoder.push(Buffer.concat(lines.slice(0, MAX_MESSAGE_COUNT)));
  assert.equal(underResult.ok, true);
  if (underResult.ok) assert.equal(underResult.frames.length, MAX_MESSAGE_COUNT);
  assert.equal(underDecoder.finish().ok, true);
});

test("max_json_depth: nesting at the bound validates, one level deeper fails closed", () => {
  let atBound: unknown = "leaf";
  for (let index = 0; index < MAX_JSON_DEPTH; index += 1) atBound = [atBound];
  assert.notEqual(validatePluginFrame({ ...request, payload: atBound }), null);

  let overBound: unknown = "leaf";
  for (let index = 0; index < MAX_JSON_DEPTH + 1; index += 1) overBound = [overBound];
  assert.equal(validatePluginFrame({ ...request, payload: overBound }), null);
});

test("max_string_bytes: a string at the byte bound validates, one byte over fails closed", () => {
  assert.notEqual(validatePluginFrame({ ...request, payload: "a".repeat(MAX_STRING_BYTES) }), null);
  assert.equal(validatePluginFrame({ ...request, payload: "a".repeat(MAX_STRING_BYTES + 1) }), null);
});

test("max_array_length: an array at the length bound validates, one element over fails closed", () => {
  assert.notEqual(validatePluginFrame({ ...request, payload: new Array(MAX_ARRAY_LENGTH).fill(0) }), null);
  assert.equal(validatePluginFrame({ ...request, payload: new Array(MAX_ARRAY_LENGTH + 1).fill(0) }), null);
});

function objectWithKeys(count: number): Record<string, number> {
  const object: Record<string, number> = {};
  for (let index = 0; index < count; index += 1) object[`k${index}`] = index;
  return object;
}

test("max_object_keys: an object at the key-count bound validates, one key over fails closed", () => {
  assert.notEqual(validatePluginFrame({ ...request, payload: objectWithKeys(MAX_OBJECT_KEYS) }), null);
  assert.equal(validatePluginFrame({ ...request, payload: objectWithKeys(MAX_OBJECT_KEYS + 1) }), null);
});
