import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { runPluginLoop } from "@useprism/runtime/plugin-runner";
import {
  NdjsonFrameDecoder,
  encodePluginFrame,
  type PluginRequestFrame,
  type PluginResponseFrame,
} from "@useprism/sdk/protocol";

function request(seq: number, requestId: string, phase: "register" | "operate"): PluginRequestFrame {
  return {
    v: 1,
    type: "request",
    requestId,
    seq,
    phase,
    pluginId: "tool-golden",
    kind: "tool",
    payload: phase === "register" ? {} : { operation: "echo", input: "golden" },
  };
}

async function exchange(
  input: PassThrough,
  output: PassThrough,
  decoder: NdjsonFrameDecoder,
  frame: PluginRequestFrame,
): Promise<PluginResponseFrame> {
  const data = once(output, "data");
  input.write(encodePluginFrame(frame));
  const [chunk] = await data;
  const decoded = decoder.push(chunk as Uint8Array);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error("response decoding failed");
  assert.equal(decoded.frames.length, 1);
  const response = decoded.frames[0];
  assert.equal(response?.type, "response");
  return response as PluginResponseFrame;
}

test("each complete request line is handled before transport EOF", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const responseDecoder = new NdjsonFrameDecoder();
  const phases: string[] = [];
  const loop = runPluginLoop({
    input,
    output,
    plugin: {
      async handle(frame: PluginRequestFrame) {
        phases.push(frame.phase);
        if (frame.phase === "register") {
          return { kind: "tool", pluginId: frame.pluginId, operations: ["echo"] };
        }
        return { echoed: (frame.payload as { input: string }).input };
      },
    },
  });

  const registration = await exchange(input, output, responseDecoder, request(1, "register-1", "register"));
  assert.deepEqual(registration, {
    v: 1,
    type: "response",
    requestId: "register-1",
    seq: 1,
    ok: true,
    result: { kind: "tool", operations: ["echo"], pluginId: "tool-golden" },
    error: null,
  });
  assert.equal(input.writableEnded, false);

  const operation = await exchange(input, output, responseDecoder, request(2, "operate-1", "operate"));
  assert.deepEqual(operation, {
    v: 1,
    type: "response",
    requestId: "operate-1",
    seq: 2,
    ok: true,
    result: { echoed: "golden" },
    error: null,
  });
  input.end();
  await loop;
  assert.deepEqual(phases, ["register", "operate"]);
  assert.deepEqual(responseDecoder.finish(), { ok: true, frames: [] });
});

test("duplicate request IDs fail closed before a second plugin call", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let calls = 0;
  const loop = runPluginLoop({
    input,
    output,
    plugin: {
      async handle() {
        calls += 1;
        return {};
      },
    },
  });

  input.end(Buffer.concat([
    Buffer.from(encodePluginFrame(request(1, "duplicate", "register"))),
    Buffer.from(encodePluginFrame(request(2, "duplicate", "operate"))),
  ]));
  await assert.rejects(loop, /duplicate request ID/);
  assert.equal(calls, 1);
});

test("plugin failures become one matched canonical failure response", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const responseDecoder = new NdjsonFrameDecoder();
  const loop = runPluginLoop({
    input,
    output,
    plugin: {
      async handle() {
        throw new Error("untrusted detail");
      },
    },
  });

  const response = await exchange(input, output, responseDecoder, request(1, "failed-1", "operate"));
  assert.deepEqual(response, {
    v: 1,
    type: "response",
    requestId: "failed-1",
    seq: 1,
    ok: false,
    result: null,
    error: { code: "plugin-error", message: "plugin request failed" },
  });
  input.end();
  await loop;
});

test("unterminated transport input fails without invoking the plugin", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let calls = 0;
  const loop = runPluginLoop({
    input,
    output,
    plugin: {
      async handle() {
        calls += 1;
        return {};
      },
    },
  });

  input.end(Buffer.from('{"v":1'));
  await assert.rejects(loop, /plugin protocol failed: unterminated-frame/);
  assert.equal(calls, 0);
});
