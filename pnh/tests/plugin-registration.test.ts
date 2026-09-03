import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePluginRegistration } from "@useprism/sdk/registration";

test("all five plugin kinds have exact kind-specific registration shapes", () => {
  for (const kind of ["policy", "memory", "provider", "renderer"] as const) {
    const registration = validatePluginRegistration({ kind, pluginId: `${kind}-golden` });
    assert.deepEqual(registration, { kind, pluginId: `${kind}-golden` });
    assert.equal(Object.isFrozen(registration), true);
  }

  const tool = validatePluginRegistration({
    kind: "tool",
    pluginId: "tool-golden",
    operations: ["echo", "search"],
  });
  assert.deepEqual(tool, { kind: "tool", pluginId: "tool-golden", operations: ["echo", "search"] });
  assert.equal(Object.isFrozen(tool), true);
  assert.equal(Object.isFrozen(tool?.kind === "tool" ? tool.operations : []), true);
});

test("registration rejects unknown fields, identity drift, and malformed Tool operations", () => {
  const cases = [
    null,
    { kind: "hook", pluginId: "hook-golden" },
    { kind: "policy", pluginId: "Bad_ID" },
    { kind: "memory", pluginId: "memory-golden", extra: true },
    { kind: "tool", pluginId: "tool-golden" },
    { kind: "tool", pluginId: "tool-golden", operations: [] },
    { kind: "tool", pluginId: "tool-golden", operations: ["echo", "echo"] },
    { kind: "tool", pluginId: "tool-golden", operations: ["search", "echo"] },
  ];
  for (const value of cases) assert.equal(validatePluginRegistration(value), null, JSON.stringify(value));
});
