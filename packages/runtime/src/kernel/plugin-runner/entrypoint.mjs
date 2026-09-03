import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NdjsonFrameDecoder, encodePluginFrame } from "@useprism/sdk/protocol";

async function writeFrame(output, frame) {
  const bytes = encodePluginFrame(frame);
  if (!output.write(bytes)) await once(output, "drain");
}

export async function runPluginLoop({ input, output, plugin }) {
  if (input === null || typeof input?.[Symbol.asyncIterator] !== "function") {
    throw new TypeError("plugin runner input must be an async byte stream");
  }
  if (output === null || typeof output?.write !== "function") {
    throw new TypeError("plugin runner output must be writable");
  }
  if (plugin === null || typeof plugin?.handle !== "function") {
    throw new TypeError("plugin must export handle(request)");
  }

  const decoder = new NdjsonFrameDecoder();
  const requestIds = new Set();
  for await (const chunk of input) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError("plugin runner input must contain bytes");
    const decoded = decoder.push(chunk);
    if (!decoded.ok) throw new Error(`plugin protocol failed: ${decoded.code}`);

    for (const frame of decoded.frames) {
      if (frame.type !== "request") throw new Error("plugin runner received a non-request frame");
      if (requestIds.has(frame.requestId)) throw new Error("duplicate request ID");
      requestIds.add(frame.requestId);

      let response;
      try {
        response = {
          v: 1,
          type: "response",
          requestId: frame.requestId,
          seq: frame.seq,
          ok: true,
          result: await plugin.handle(frame),
          error: null,
        };
      } catch {
        response = {
          v: 1,
          type: "response",
          requestId: frame.requestId,
          seq: frame.seq,
          ok: false,
          result: null,
          error: { code: "plugin-error", message: "plugin request failed" },
        };
      }
      await writeFrame(output, response);
    }
  }

  const finished = decoder.finish();
  if (!finished.ok) throw new Error(`plugin protocol failed: ${finished.code}`);
}

async function main() {
  const plugin = await import(new URL("./plugin/entrypoint.mjs", import.meta.url));
  await runPluginLoop({ input: process.stdin, output: process.stdout, plugin });
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write("plugin runner failed\n");
    process.exitCode = 1;
  });
}
