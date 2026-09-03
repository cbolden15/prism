import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { test } from "node:test";
import {
  MAX_PROVIDER_PROMPT_BYTES,
  type ProviderRequest,
} from "@useprism/sdk/provider";
import {
  OllamaProviderError,
  createOllamaProvider,
} from "@useprism/provider-ollama";

const request: ProviderRequest = {
  prompt: "Return one strict ProviderDecision JSON object.",
  model: "qwen2.5:14b",
};
const responseText = JSON.stringify({ kind: "final", answer: "Done." });

async function readRequestBody(message: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of message) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function stub(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{
  origin: string;
  close(): Promise<void>;
}> {
  const sockets = new Set<Socket>();
  const server = createServer((request_, response) => {
    void Promise.resolve(handler(request_, response)).catch(() => response.destroy());
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function assertProviderError(code: string, forbidden: readonly string[] = []): (error: unknown) => boolean {
  return (error) => {
    assert.equal(error instanceof OllamaProviderError, true);
    assert.equal((error as OllamaProviderError).code, code);
    for (const marker of forbidden) assert.equal(String(error).includes(marker), false);
    return true;
  };
}

function validWireResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: request.model,
    response: responseText,
    done: true,
    ...overrides,
  });
}

test("Ollama calls exactly the configured origin and maps a bounded non-streaming response", async () => {
  let observed: { method?: string; url?: string; body?: unknown; accept?: string; contentType?: string } = {};
  const server = await stub(async (message, response) => {
    observed = {
      method: message.method,
      url: message.url,
      body: JSON.parse(await readRequestBody(message)),
      accept: message.headers.accept,
      contentType: message.headers["content-type"],
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(validWireResponse());
  });
  try {
    const provider = createOllamaProvider({ endpoint: server.origin });
    assert.equal(provider.id, "ollama");
    assert.deepEqual(await provider.complete(request), {
      providerId: "ollama",
      model: request.model,
      text: responseText,
    });
    assert.deepEqual(observed, {
      method: "POST",
      url: "/api/generate",
      body: {
        model: request.model,
        prompt: request.prompt,
        stream: false,
        format: "json",
      },
      accept: "application/json",
      contentType: "application/json",
    });
  } finally {
    await server.close();
  }
});

test("request bytes accept the configured boundary and reject one byte beyond before network", async () => {
  let calls = 0;
  const server = await stub(async (_message, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(validWireResponse());
  });
  try {
    const encoded = Buffer.byteLength(JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      stream: false,
      format: "json",
    }));
    const exact = createOllamaProvider({ endpoint: server.origin, maxRequestBytes: encoded });
    await exact.complete(request);
    const oneBeyond = createOllamaProvider({ endpoint: server.origin, maxRequestBytes: encoded - 1 });
    await assert.rejects(oneBeyond.complete(request), assertProviderError("oversized-request"));
    assert.equal(calls, 1);

    const sdkBeyond = createOllamaProvider({ endpoint: server.origin });
    await assert.rejects(sdkBeyond.complete({
      prompt: "x".repeat(MAX_PROVIDER_PROMPT_BYTES + 1),
      model: request.model,
    }), assertProviderError("invalid-request"));
    assert.equal(calls, 1);
  } finally {
    await server.close();
  }
});

test("the default request bound carries the SDK prompt boundary after JSON escaping", async () => {
  let observedPromptLength = 0;
  const server = await stub(async (message, response) => {
    const body = JSON.parse(await readRequestBody(message)) as { prompt?: unknown };
    const observedPrompt = body.prompt;
    if (typeof observedPrompt !== "string") throw new Error("stub received an invalid prompt");
    observedPromptLength = observedPrompt.length;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(validWireResponse());
  });
  try {
    const prompt = "\0".repeat(MAX_PROVIDER_PROMPT_BYTES);
    const provider = createOllamaProvider({ endpoint: server.origin });
    assert.equal((await provider.complete({ prompt, model: request.model })).text, responseText);
    assert.equal(observedPromptLength, MAX_PROVIDER_PROMPT_BYTES);
  } finally {
    await server.close();
  }
});

test("response bytes accept the configured boundary and reject one byte beyond", async () => {
  const wire = validWireResponse();
  const server = await stub(async (_message, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(wire);
  });
  try {
    const bytes = Buffer.byteLength(wire);
    const exact = createOllamaProvider({ endpoint: server.origin, maxResponseBytes: bytes });
    assert.equal((await exact.complete(request)).text, responseText);
    const oneBeyond = createOllamaProvider({ endpoint: server.origin, maxResponseBytes: bytes - 1 });
    await assert.rejects(oneBeyond.complete(request), assertProviderError("oversized-response"));
  } finally {
    await server.close();
  }
});

test("HTTP and malformed responses are classified without leaking bodies, prompts, or headers", async (context) => {
  const marker = "DO-NOT-LEAK-RESPONSE-BODY";
  const cases: readonly [string, number, string, string][] = [
    ["unknown model", 404, JSON.stringify({ error: marker }), "model-not-found"],
    ["other status", 503, marker, "http-error"],
    ["malformed JSON", 200, `{${marker}`, "malformed-response"],
    ["invalid shape", 200, JSON.stringify({ model: request.model, response: marker, done: false }), "invalid-response"],
    ["model mismatch", 200, validWireResponse({ model: "other:latest" }), "invalid-response"],
  ];
  for (const [name, status, body, code] of cases) {
    await context.test(name, async () => {
      const server = await stub(async (_message, response) => {
        response.writeHead(status, {
          "content-type": "application/json",
          "x-private-header": marker,
        });
        response.end(body);
      });
      try {
        const provider = createOllamaProvider({ endpoint: server.origin });
        await assert.rejects(
          provider.complete(request),
          assertProviderError(code, [marker, request.prompt]),
        );
      } finally {
        await server.close();
      }
    });
  }
});

test("timeout and caller abort terminate the request with distinct stable codes", async (context) => {
  await context.test("timeout", async () => {
    const server = await stub(async () => new Promise<void>(() => {}));
    try {
      const provider = createOllamaProvider({ endpoint: server.origin, timeoutMs: 10 });
      await assert.rejects(provider.complete(request), assertProviderError("timeout", [request.prompt]));
    } finally {
      await server.close();
    }
  });

  await context.test("caller abort", async () => {
    const server = await stub(async () => new Promise<void>(() => {}));
    try {
      const controller = new AbortController();
      const provider = createOllamaProvider({ endpoint: server.origin, timeoutMs: 5_000 });
      const completion = provider.complete(request, { signal: controller.signal });
      controller.abort();
      await assert.rejects(completion, assertProviderError("aborted", [request.prompt]));
    } finally {
      await server.close();
    }
  });
});

test("unavailable endpoints and redirects fail without a fallback request", async () => {
  const unavailable = await stub(async (_message, response) => { response.end(); });
  const closedOrigin = unavailable.origin;
  await unavailable.close();
  await assert.rejects(
    createOllamaProvider({ endpoint: closedOrigin, timeoutMs: 100 }).complete(request),
    assertProviderError("unavailable", [request.prompt]),
  );

  let sentinelCalls = 0;
  const sentinel = await stub(async (_message, response) => {
    sentinelCalls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(validWireResponse());
  });
  const redirect = await stub(async (_message, response) => {
    response.writeHead(302, { location: `${sentinel.origin}/api/generate` });
    response.end();
  });
  try {
    await assert.rejects(
      createOllamaProvider({ endpoint: redirect.origin }).complete(request),
      assertProviderError("unavailable"),
    );
    assert.equal(sentinelCalls, 0);
  } finally {
    await Promise.all([redirect.close(), sentinel.close()]);
  }
});

test("invalid endpoints, null models, and endpoint paths fail before network", async () => {
  assert.throws(
    () => createOllamaProvider({ endpoint: "https://user:password@example.com" }),
    assertProviderError("invalid-endpoint", ["password"]),
  );
  assert.throws(
    () => createOllamaProvider({ endpoint: "https://example.com/base" }),
    assertProviderError("invalid-endpoint"),
  );
  const provider = createOllamaProvider({ endpoint: "http://127.0.0.1:11434" });
  await assert.rejects(
    provider.complete({ prompt: "x", model: null }),
    assertProviderError("invalid-request"),
  );
});
