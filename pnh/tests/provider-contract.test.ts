import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROVIDER_PROMPT_BYTES,
  MAX_PROVIDER_RESPONSE_BYTES,
  validateProviderRequest,
  validateProviderResponse,
} from "@useprism/sdk/provider";

test("provider requests normalize to exact deeply-frozen data", () => {
  const request = validateProviderRequest({ prompt: "Explain the result.", model: null });
  assert.deepEqual(request, { prompt: "Explain the result.", model: null });
  assert.ok(Object.isFrozen(request));

  const selected = validateProviderRequest({ prompt: "Explain the result.", model: "gpt-5.4-mini" });
  assert.deepEqual(selected, { prompt: "Explain the result.", model: "gpt-5.4-mini" });
});

test("provider requests reject extra fields, invalid models, and unbounded prompts", () => {
  assert.equal(validateProviderRequest({ prompt: "ok", model: null, extra: true }), null);
  assert.equal(validateProviderRequest({ prompt: "", model: null }), null);
  assert.equal(validateProviderRequest({ prompt: "ok", model: "bad model" }), null);
  assert.equal(validateProviderRequest({ prompt: "x".repeat(MAX_PROVIDER_PROMPT_BYTES + 1), model: null }), null);
});

test("provider responses bind provider, model provenance, and bounded text", () => {
  const response = validateProviderResponse({
    providerId: "codex-chatgpt",
    model: null,
    text: "A bounded answer.",
  });
  assert.deepEqual(response, {
    providerId: "codex-chatgpt",
    model: null,
    text: "A bounded answer.",
  });
  assert.ok(Object.isFrozen(response));

  assert.equal(validateProviderResponse({ providerId: "codex-chatgpt", model: null, text: "" }), null);
  assert.equal(validateProviderResponse({ providerId: "Codex", model: null, text: "ok" }), null);
  assert.equal(
    validateProviderResponse({ providerId: "codex-chatgpt", model: null, text: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES + 1) }),
    null,
  );
});
