import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROVIDER_PROMPT_BYTES,
  MAX_PROVIDER_RESPONSE_BYTES,
  validateProviderRequest,
  validateProviderResponse,
} from "@useprism/sdk/provider";
import {
  MAX_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
} from "@useprism/sdk/protocol";
import {
  MAX_TOOL_DESCRIPTION_BYTES,
  MAX_TOOL_OPERATIONS,
  validateToolDefinition,
  validateToolRequest,
} from "@useprism/sdk/tool";

test("provider request and response byte limits accept the boundary and reject one beyond", () => {
  assert.notEqual(validateProviderRequest({
    prompt: "x".repeat(MAX_PROVIDER_PROMPT_BYTES),
    model: "qwen2.5:14b",
  }), null);
  assert.notEqual(validateProviderRequest({
    prompt: "x",
    model: "hf.co/example/model:latest",
  }), null);
  assert.equal(validateProviderRequest({
    prompt: "x".repeat(MAX_PROVIDER_PROMPT_BYTES + 1),
    model: "qwen2.5:14b",
  }), null);

  assert.notEqual(validateProviderResponse({
    providerId: "ollama",
    model: "qwen2.5:14b",
    text: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES),
  }), null);
  assert.equal(validateProviderResponse({
    providerId: "ollama",
    model: "qwen2.5:14b",
    text: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES + 1),
  }), null);
});

test("tool definition limits accept the boundary and reject one beyond", () => {
  const operations = Array.from({ length: MAX_TOOL_OPERATIONS }, (_unused, index) => ({
    name: `op-${String(index).padStart(2, "0")}`,
    description: "Operate.",
  }));
  assert.notEqual(validateToolDefinition({
    id: "bounded-tool",
    description: "x".repeat(MAX_TOOL_DESCRIPTION_BYTES),
    operations,
  }), null);
  assert.equal(validateToolDefinition({
    id: "bounded-tool",
    description: "x".repeat(MAX_TOOL_DESCRIPTION_BYTES + 1),
    operations,
  }), null);
  assert.equal(validateToolDefinition({
    id: "bounded-tool",
    description: "Bounded.",
    operations: [...operations, { name: "op-64", description: "Operate." }],
  }), null);
});

test("tool JSON limits accept each boundary and reject one beyond", () => {
  assert.notEqual(validateToolRequest({ operation: "run", input: "x".repeat(MAX_STRING_BYTES) }), null);
  assert.equal(validateToolRequest({ operation: "run", input: "x".repeat(MAX_STRING_BYTES + 1) }), null);

  assert.notEqual(validateToolRequest({
    operation: "run",
    input: Array.from({ length: MAX_ARRAY_LENGTH }, () => null),
  }), null);
  assert.equal(validateToolRequest({
    operation: "run",
    input: Array.from({ length: MAX_ARRAY_LENGTH + 1 }, () => null),
  }), null);

  const boundedObject = Object.fromEntries(Array.from(
    { length: MAX_OBJECT_KEYS },
    (_unused, index) => [`key-${String(index).padStart(3, "0")}`, null],
  ));
  assert.notEqual(validateToolRequest({ operation: "run", input: boundedObject }), null);
  assert.equal(validateToolRequest({
    operation: "run",
    input: { ...boundedObject, overflow: null },
  }), null);

  const nested = (depth: number): unknown => {
    let value: unknown = null;
    for (let index = 0; index < depth; index += 1) value = { child: value };
    return value;
  };
  assert.notEqual(validateToolRequest({ operation: "run", input: nested(MAX_JSON_DEPTH) }), null);
  assert.equal(validateToolRequest({ operation: "run", input: nested(MAX_JSON_DEPTH + 1) }), null);
});
