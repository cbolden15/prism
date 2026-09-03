import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_FRAME_BYTES,
  MAX_JSON_DEPTH,
  PLUGIN_PROTOCOL_VERSION,
  NdjsonFrameDecoder,
  encodePluginFrame,
  validatePluginFrame,
} from "@useprism/sdk/protocol";

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

test("canonical request round-trips through the bounded NDJSON decoder", () => {
  const decoder = new NdjsonFrameDecoder();
  const encoded = encodePluginFrame(request);
  const split = Math.floor(encoded.byteLength / 2);

  assert.deepEqual(decoder.push(encoded.subarray(0, split)), { ok: true, frames: [] });
  const result = decoder.push(encoded.subarray(split));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.frames, [request]);
  assert.equal(decoder.finish().ok, true);
});

test("multiple frames settle immediately without waiting for EOF", () => {
  const response = {
    v: 1,
    type: "response",
    requestId: "req-1",
    seq: 2,
    ok: true,
    result: { kind: "tool", operations: ["echo"] },
    error: null,
  } as const;
  const decoder = new NdjsonFrameDecoder();
  const bytes = Buffer.concat([encodePluginFrame(request), encodePluginFrame(response)]);
  const result = decoder.push(bytes);

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.frames, [request, response]);
});

test("fatal UTF-8, oversized unterminated lines, and trailing bytes fail closed", () => {
  const invalidUtf8 = new NdjsonFrameDecoder();
  assert.deepEqual(
    invalidUtf8.push(Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d, 0x0a])),
    { ok: false, code: "invalid-utf8" },
  );

  const oversized = new NdjsonFrameDecoder();
  assert.deepEqual(
    oversized.push(new Uint8Array(MAX_FRAME_BYTES + 1).fill(0x61)),
    { ok: false, code: "oversized-frame" },
  );

  const trailing = new NdjsonFrameDecoder();
  assert.equal(trailing.push(encodePluginFrame(request).subarray(0, -1)).ok, true);
  assert.deepEqual(trailing.finish(), { ok: false, code: "unterminated-frame" });
});

test("exact frame shape, JSON bounds, and sequence are enforced", () => {
  assert.equal(validatePluginFrame({ ...request, extra: true }), null);
  assert.equal(validatePluginFrame({ ...request, requestId: "../escape" }), null);
  assert.equal(validatePluginFrame({ ...request, payload: { __proto__: { polluted: true } } }), null);

  let deep: unknown = "leaf";
  for (let index = 0; index < MAX_JSON_DEPTH + 1; index += 1) deep = [deep];
  assert.equal(validatePluginFrame({ ...request, payload: deep }), null);

  const decoder = new NdjsonFrameDecoder();
  const outOfSequence = { ...request, seq: 2 };
  assert.deepEqual(decoder.push(encodePluginFrame(outOfSequence)), {
    ok: false,
    code: "sequence",
  });
});

test("validatePluginFrame is the only fail-closed checker for the pinned wire vocabulary", () => {
  assert.notEqual(validatePluginFrame(request), null);
  assert.equal(validatePluginFrame({ ...request, v: PLUGIN_PROTOCOL_VERSION + 1 }), null);
  assert.equal(validatePluginFrame({ ...request, v: String(PLUGIN_PROTOCOL_VERSION) }), null);
  assert.equal(validatePluginFrame({ ...request, type: "notification" }), null);
  assert.equal(validatePluginFrame({ ...request, phase: "shutdown" }), null);

  // Every frame the decoder emits is one this checker admitted, so no second
  // vocabulary can enter through the wire.
  const decoder = new NdjsonFrameDecoder();
  const unpinned = JSON.stringify({ ...request, v: PLUGIN_PROTOCOL_VERSION + 1 });
  assert.equal(decoder.push(Buffer.from(unpinned + "\n")).ok, false);
});

test("wire bytes must be canonical so duplicate keys cannot be collapsed", () => {
  const duplicatePayload = [
    '{"v":1,"type":"request","requestId":"req-1","seq":1,',
    '"phase":"register","pluginId":"tool-golden","kind":"tool",',
    '"payload":{},"payload":{"hidden":true}}\n',
  ].join("");
  const duplicateDecoder = new NdjsonFrameDecoder();
  assert.deepEqual(duplicateDecoder.push(Buffer.from(duplicatePayload)), {
    ok: false,
    code: "noncanonical-frame",
  });

  const whitespaceDecoder = new NdjsonFrameDecoder();
  const spaced = JSON.stringify(request).replace(',"type"', ', "type"');
  assert.deepEqual(
    whitespaceDecoder.push(Buffer.from(spaced + "\n")),
    { ok: false, code: "noncanonical-frame" },
  );
});

test("response success and failure envelopes are mutually exclusive", () => {
  const success = {
    v: 1,
    type: "response",
    requestId: "req-1",
    seq: 1,
    ok: true,
    result: { echoed: "hello" },
    error: null,
  };
  const failure = {
    v: 1,
    type: "response",
    requestId: "req-1",
    seq: 1,
    ok: false,
    result: null,
    error: { code: "denied", message: "operation denied" },
  };

  assert.deepEqual(validatePluginFrame(success), success);
  assert.deepEqual(validatePluginFrame(failure), failure);
  assert.equal(validatePluginFrame({ ...success, error: failure.error }), null);
  assert.equal(validatePluginFrame({ ...failure, result: { leaked: true } }), null);
});
