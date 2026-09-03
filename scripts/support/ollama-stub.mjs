import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const model = process.env.PRISM_OLLAMA_STUB_MODEL ?? "qwen2.5:14b";
const statsPath = process.env.PRISM_OLLAMA_STUB_STATS;
const marker = "indigo-orbit-47";
const stats = { tags: 0, generate: 0 };

function persistStats() {
  if (statsPath !== undefined) writeFileSync(statsPath, `${JSON.stringify(stats)}\n`, "utf8");
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

async function requestJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > 2_000_000) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/tags") {
    stats.tags += 1;
    persistStats();
    json(response, 200, { models: [{ name: model }] });
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/generate") {
    json(response, 404, { error: "not found" });
    return;
  }

  try {
    const body = await requestJson(request);
    if (
      body?.model !== model
      || typeof body.prompt !== "string"
      || body.stream !== false
      || body.format !== "json"
    ) {
      json(response, 400, { error: "invalid request" });
      return;
    }
    stats.generate += 1;
    persistStats();
    let decision;
    if (body.prompt.includes("Completed tool calls: []")) {
      decision = {
        kind: "tool",
        tool: "repository",
        operation: "search",
        input: { path: ".", query: marker },
      };
    } else if (body.prompt.includes(marker) && body.prompt.includes("FACTS.md")) {
      decision = { kind: "final", answer: `The packed acceptance marker is ${marker} in FACTS.md.` };
    } else {
      json(response, 422, { error: "missing tool evidence" });
      return;
    }
    json(response, 200, { model, response: JSON.stringify(decision), done: true });
  } catch {
    json(response, 400, { error: "malformed request" });
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") process.exit(1);
  persistStats();
  process.stdout.write(`http://127.0.0.1:${address.port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
