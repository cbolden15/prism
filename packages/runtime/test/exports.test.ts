import assert from "node:assert/strict";
import { test } from "node:test";
import {
  admitPinnedRegistryBytes,
  computeToolRequestDigest,
  computeSpawnArtifactDigestFromBytes,
  computeSpawnPluginArtifactCommitments,
  computeSpawnPluginArtifactCommitmentsFromBytes,
  runAgent,
  runBoundedLocalCoordinator,
  TOOL_REQUEST_DIGEST_VERSION,
  withOwnerApprovedSpawnPlugin,
} from "@useprism/runtime";
import { runPluginLoop } from "@useprism/runtime/plugin-runner";

test("the Runtime export map exposes the supported composition surface", () => {
  assert.equal(typeof runBoundedLocalCoordinator, "function");
  assert.equal(typeof runAgent, "function");
  assert.equal(typeof computeToolRequestDigest, "function");
  assert.equal(TOOL_REQUEST_DIGEST_VERSION, "pnh-tool-request-v1");
  assert.equal(typeof admitPinnedRegistryBytes, "function");
  assert.equal(typeof computeSpawnArtifactDigestFromBytes, "function");
  assert.equal(typeof computeSpawnPluginArtifactCommitments, "function");
  assert.equal(typeof computeSpawnPluginArtifactCommitmentsFromBytes, "function");
  assert.equal(typeof withOwnerApprovedSpawnPlugin, "function");
  assert.equal(typeof runPluginLoop, "function");
});
