import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROVIDER_DECISION_BYTES,
  validateProviderDecision,
} from "@useprism/sdk/provider-decision";

test("provider decisions accept only closed tool and final variants", () => {
  const tool = validateProviderDecision({
    kind: "tool",
    tool: "text-stats",
    operation: "analyze-text",
    input: { text: "one two three", options: [true, null] },
  });
  assert.deepEqual(tool, {
    kind: "tool",
    tool: "text-stats",
    operation: "analyze-text",
    input: { options: [true, null], text: "one two three" },
  });
  assert.ok(Object.isFrozen(tool));
  if (tool?.kind === "tool") {
    assert.ok(Object.isFrozen(tool.input));
    assert.ok(Object.isFrozen((tool.input as { options: unknown[] }).options));
  }

  const final = validateProviderDecision({ kind: "final", answer: "3 words" });
  assert.deepEqual(final, { kind: "final", answer: "3 words" });
  assert.ok(Object.isFrozen(final));
});

test("provider decisions reject missing, unknown, and extra fields", () => {
  assert.equal(validateProviderDecision({ kind: "tool", tool: "text-stats", operation: "analyze-text" }), null);
  assert.equal(validateProviderDecision({ kind: "wait" }), null);
  assert.equal(validateProviderDecision({ kind: "final" }), null);
  assert.equal(validateProviderDecision({ kind: "final", answer: "3 words", extra: true }), null);
  assert.equal(validateProviderDecision({
    kind: "tool",
    tool: "text-stats",
    operation: "analyze-text",
    input: "one two three",
    extra: true,
  }), null);
});

test("provider decisions reject accessors, custom prototypes, and hidden keys", () => {
  let kindReads = 0;
  const accessorKind = { answer: "3 words" } as Record<string, unknown>;
  Object.defineProperty(accessorKind, "kind", {
    enumerable: true,
    get() { kindReads += 1; return "final"; },
  });
  assert.equal(validateProviderDecision(accessorKind), null);
  assert.equal(kindReads, 0);

  const accessor = { kind: "final" } as Record<string, unknown>;
  Object.defineProperty(accessor, "answer", { enumerable: true, get: () => "3 words" });
  assert.equal(validateProviderDecision(accessor), null);

  const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
  Object.assign(inherited, { kind: "final", answer: "3 words" });
  assert.equal(validateProviderDecision(inherited), null);

  const hidden = { kind: "final", answer: "3 words" } as Record<PropertyKey, unknown>;
  hidden[Symbol("hidden")] = true;
  assert.equal(validateProviderDecision(hidden), null);

  const nestedAccessor = { text: "one two three" } as Record<string, unknown>;
  Object.defineProperty(nestedAccessor, "words", { enumerable: true, get: () => 3 });
  assert.equal(validateProviderDecision({
    kind: "tool",
    tool: "text-stats",
    operation: "analyze-text",
    input: nestedAccessor,
  }), null);
});

test("provider decisions reject invalid identities and oversized data", () => {
  assert.equal(validateProviderDecision({
    kind: "tool",
    tool: "Text Stats",
    operation: "analyze-text",
    input: "one two three",
  }), null);
  assert.equal(validateProviderDecision({
    kind: "tool",
    tool: "text-stats",
    operation: "analyze_text",
    input: "one two three",
  }), null);
  assert.equal(validateProviderDecision({ kind: "final", answer: "" }), null);
  assert.equal(
    validateProviderDecision({ kind: "final", answer: "x".repeat(MAX_PROVIDER_DECISION_BYTES + 1) }),
    null,
  );
  assert.equal(validateProviderDecision({
    kind: "tool",
    tool: "text-stats",
    operation: "analyze-text",
    input: { first: "x".repeat(60_000), second: "x".repeat(60_000) },
  }), null);
});
