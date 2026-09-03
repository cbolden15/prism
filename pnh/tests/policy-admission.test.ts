import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePolicyAdmissionOutcome } from "@useprism/sdk/policy";

const catalog = {
  version: "pnh-capability-catalog-v1",
  capabilities: [
    {
      id: "allowed-hosts",
      limit: { schema: "string-set", version: "pnh-capability-limit-v1", values: ["api-a", "api-b"] },
    },
    {
      id: "model-calls",
      limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 2 },
    },
    {
      id: "network",
      limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: false },
    },
  ],
};

test("Policy admission accepts only explicit denial or a deeply frozen canonical restriction", () => {
  assert.deepEqual(validatePolicyAdmissionOutcome({ decision: "deny" }), { decision: "deny" });
  const restricted = validatePolicyAdmissionOutcome({ decision: "restrict", catalog });
  assert.notEqual(restricted, null);
  assert.equal(Object.isFrozen(restricted), true);
  if (restricted?.decision !== "restrict") return;
  assert.equal(Object.isFrozen(restricted.catalog.capabilities), true);
  assert.equal(Object.isFrozen(restricted.catalog.capabilities[0]?.limit), true);
});

test("Policy admission rejects ambiguous decisions, extra keys, and noncanonical catalogs", () => {
  assert.equal(validatePolicyAdmissionOutcome({ decision: "allow" }), null);
  assert.equal(validatePolicyAdmissionOutcome({ decision: "deny", reason: "extra" }), null);
  assert.equal(validatePolicyAdmissionOutcome({ decision: "restrict", catalog, extra: true }), null);
  assert.equal(validatePolicyAdmissionOutcome({
    decision: "restrict",
    catalog: { ...catalog, capabilities: [...catalog.capabilities].reverse() },
  }), null);
  assert.equal(validatePolicyAdmissionOutcome({
    decision: "restrict",
    catalog: {
      ...catalog,
      capabilities: [{
        id: "allowed-hosts",
        limit: { schema: "string-set", version: "pnh-capability-limit-v1", values: ["api-b", "api-a"] },
      }],
    },
  }), null);
});
