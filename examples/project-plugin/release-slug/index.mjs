export function slugify(title) {
  return title.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export const prismToolAuthoringFixture = Object.freeze({
  version: "prism-tool-authoring-fixture-v1",
  operation: "slugify",
  input: Object.freeze({ title: "Preview First" }),
  expected: Object.freeze({ slug: "preview-first" }),
});

export async function handle(request) {
  if (request?.phase === "register") {
    return { kind: "tool", operations: ["slugify"], pluginId: "release-slug" };
  }
  if (request?.phase === "operate" && request.payload?.operation === "slugify") {
    const { title } = request.payload.input ?? {};
    if (typeof title !== "string") throw new Error("slugify requires a title string");
    return { slug: slugify(title) };
  }
  throw new Error("unsupported tool request");
}

async function runToolLoop() {
  process.stdin.setEncoding("utf8");
  let pending = "";
  for await (const chunk of process.stdin) {
    pending += chunk;
    while (true) {
      const newline = pending.indexOf("\n");
      if (newline === -1) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line === "") continue;
      const request = JSON.parse(line);
      try {
        const result = await handle(request);
        process.stdout.write(`${JSON.stringify({
          v: 1,
          type: "response",
          requestId: request.requestId,
          seq: request.seq,
          ok: true,
          result,
          error: null,
        })}\n`);
      } catch {
        process.stdout.write(`${JSON.stringify({
          v: 1,
          type: "response",
          requestId: request.requestId,
          seq: request.seq,
          ok: false,
          result: null,
          error: { code: "plugin-error", message: "plugin request failed" },
        })}\n`);
      }
    }
  }
}

if (process.argv[1]?.endsWith("/index.mjs") || process.argv[1] === "index.mjs") {
  void runToolLoop();
}
