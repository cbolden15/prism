import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeJsonValue as normalizeJsonValueFromRoot,
  validateProviderRequest as validateProviderRequestFromRoot,
} from "@useprism/sdk";
import {
  MAX_DECLARED_PLUGIN_FILES,
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_ID_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  MAX_TOOL_AUTHORING_JSON_BYTES,
  TOOL_AUTHORING_FIXTURE_VERSION,
  createToolPluginScaffold,
  parseToolPluginManifest,
  validateToolAuthoringFixture,
  validateToolPluginScaffold,
} from "@useprism/sdk/authoring";
import { normalizeJsonValue } from "@useprism/sdk/json";
import { validateRegistryDocument } from "@useprism/sdk/manifest";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";
import { validatePolicyAdmissionOutcome } from "@useprism/sdk/policy";
import { PLUGIN_PROTOCOL_VERSION } from "@useprism/sdk/protocol";
import { MAX_WIRE_FRAME_BYTES } from "@useprism/sdk/protocol/resource-bounds";
import { validateProviderRequest } from "@useprism/sdk/provider";
import { validateProviderDecision } from "@useprism/sdk/provider-decision";
import { validatePluginRegistration } from "@useprism/sdk/registration";
import {
  validatePluginRegistration as validateToolRegistration,
  validateToolDefinition,
  validateToolRequest,
} from "@useprism/sdk/tool";

test("every supported SDK export resolves through the package export map", () => {
  assert.equal(MAX_PLUGIN_ID_BYTES, 64);
  assert.equal(MAX_PLUGIN_MANIFEST_BYTES, 65_536);
  assert.equal(MAX_DECLARED_PLUGIN_FILES, 16);
  assert.equal(MAX_PLUGIN_FILE_BYTES, 262_144);
  assert.equal(MAX_PLUGIN_SCAFFOLD_BYTES, 1_000_000);
  assert.equal(MAX_TOOL_AUTHORING_JSON_BYTES, 65_536);
  assert.equal(TOOL_AUTHORING_FIXTURE_VERSION, "prism-tool-authoring-fixture-v1");
  assert.equal(typeof createToolPluginScaffold, "function");
  assert.equal(typeof parseToolPluginManifest, "function");
  assert.equal(typeof validateToolAuthoringFixture, "function");
  assert.equal(typeof validateToolPluginScaffold, "function");
  assert.equal(PLUGIN_PROTOCOL_VERSION, 1);
  assert.equal(MAX_WIRE_FRAME_BYTES, 1_000_000);
  assert.equal(typeof generatePluginRegistry, "function");
  assert.equal(typeof validateRegistryDocument, "function");
  assert.equal(typeof validatePolicyAdmissionOutcome, "function");
  assert.equal(typeof validateProviderRequest, "function");
  assert.equal(validateProviderRequestFromRoot, validateProviderRequest);
  assert.equal(normalizeJsonValueFromRoot, normalizeJsonValue);
  assert.equal(typeof validateProviderDecision, "function");
  assert.equal(typeof validatePluginRegistration, "function");
  assert.equal(validateToolRegistration, validatePluginRegistration);
  assert.equal(typeof normalizeJsonValue, "function");
  assert.equal(typeof validateToolDefinition, "function");
  assert.equal(typeof validateToolRequest, "function");
});

test("tool definitions and requests are strict, sorted, and deeply normalized", () => {
  assert.deepEqual(validateToolDefinition({
    id: "repository",
    description: "Read files below the admitted workspace.",
    operations: [
      { name: "list", description: "List one directory." },
      { name: "read", description: "Read one text file." },
      { name: "search", description: "Search text files." },
    ],
  }), {
    id: "repository",
    description: "Read files below the admitted workspace.",
    operations: [
      { name: "list", description: "List one directory." },
      { name: "read", description: "Read one text file." },
      { name: "search", description: "Search text files." },
    ],
  });
  assert.equal(validateToolDefinition({
    id: "repository",
    description: "Read files.",
    operations: [
      { name: "read", description: "Read." },
      { name: "list", description: "List." },
    ],
  }), null);
  assert.deepEqual(validateToolRequest({
    operation: "read",
    input: { path: "README.md", options: [null, true] },
  }), {
    operation: "read",
    input: { options: [null, true], path: "README.md" },
  });
  assert.equal(validateToolRequest({ operation: "read", input: undefined }), null);
  assert.equal(validateToolRequest({ operation: "read", input: null, extra: true }), null);
});
