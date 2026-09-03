import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admitRegistryBytes, type AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  computeSpawnArtifactDigest,
  computeSpawnArtifactDigestFromBytes,
  computeSpawnPluginArtifactCommitments,
  computeSpawnPluginArtifactCommitmentsFromBytes,
  createAdmittedPluginSpawnLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";
import type { PluginArtifactCommitments } from "@useprism/sdk/node/registry";

const MANIFEST = JSON.stringify({
  id: "spawn-golden",
  version: "1.0.0",
  apiVersion: 1,
  kind: "tool",
  compatibility: { kernelApiVersion: "pnh-kernel-v1" },
  entrypoint: "index.mjs",
  files: ["index.mjs"],
  dependencies: [],
  requestedCapabilities: [],
  license: { spdxId: "MIT", holder: "PNH" },
});

const ENTRYPOINT = 'export async function handle(request) {\n  return request;\n}\n';

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function makePluginRoot(options: { readonly manifest?: string; readonly entrypoint?: string } = {}): string {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-spawn-artifact-digest-"));
  writeFileSync(resolve(root, "manifest.json"), options.manifest ?? MANIFEST);
  writeFileSync(resolve(root, "index.mjs"), options.entrypoint ?? ENTRYPOINT);
  return root;
}

test("the byte helper preserves the spawn artifact digest formula", () => {
  const manifestBytes = new TextEncoder().encode(MANIFEST);
  const entrypointBytes = new TextEncoder().encode(ENTRYPOINT);
  const expectedDigest = "6dfbc3351b2c03743c04a4d986c3275d55677f57805e0f1e2722a5835371c509";
  const root = makePluginRoot();
  try {
    assert.equal(sha256(manifestBytes), "b733cc0a20a32c910c51c4c890ae73887f0f53c2cd82f5437a3f62ebb974ae3b");
    assert.equal(sha256(entrypointBytes), "030020a29cc0bc086890116991956147de95e5c0bf4942e51d9e51b974fb1f2b");
    assert.equal(
      computeSpawnArtifactDigestFromBytes({ manifestBytes, entrypointBytes }),
      expectedDigest,
    );
    assert.equal(computeSpawnArtifactDigest({ pluginRoot: root }), expectedDigest);

    const mutatedManifestBytes = Uint8Array.from(manifestBytes);
    mutatedManifestBytes[0] = mutatedManifestBytes[0]! ^ 1;
    assert.notEqual(
      computeSpawnArtifactDigestFromBytes({ manifestBytes: mutatedManifestBytes, entrypointBytes }),
      expectedDigest,
    );

    const mutatedEntrypointBytes = Uint8Array.from(entrypointBytes);
    mutatedEntrypointBytes[0] = mutatedEntrypointBytes[0]! ^ 1;
    assert.notEqual(
      computeSpawnArtifactDigestFromBytes({ manifestBytes, entrypointBytes: mutatedEntrypointBytes }),
      expectedDigest,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("byte-identical plugin directories produce the same spawn artifact digest", () => {
  const first = makePluginRoot();
  const second = makePluginRoot();
  try {
    const firstDigest = computeSpawnArtifactDigest({ pluginRoot: first });
    const secondDigest = computeSpawnArtifactDigest({ pluginRoot: second });
    assert.match(firstDigest, /^[0-9a-f]{64}$/);
    assert.equal(firstDigest, secondDigest);
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("a single-byte change in manifest.json moves the digest", () => {
  const baseline = makePluginRoot();
  const mutated = makePluginRoot({ manifest: MANIFEST.replace('"1.0.0"', '"1.0.1"') });
  try {
    const baselineDigest = computeSpawnArtifactDigest({ pluginRoot: baseline });
    const mutatedDigest = computeSpawnArtifactDigest({ pluginRoot: mutated });
    assert.notEqual(baselineDigest, mutatedDigest);
  } finally {
    rmSync(baseline, { recursive: true, force: true });
    rmSync(mutated, { recursive: true, force: true });
  }
});

test("a single-byte change in the entrypoint file moves the digest", () => {
  const baseline = makePluginRoot();
  const mutated = makePluginRoot({ entrypoint: ENTRYPOINT.replace("request;", "request ;") });
  try {
    const baselineDigest = computeSpawnArtifactDigest({ pluginRoot: baseline });
    const mutatedDigest = computeSpawnArtifactDigest({ pluginRoot: mutated });
    assert.notEqual(baselineDigest, mutatedDigest);
  } finally {
    rmSync(baseline, { recursive: true, force: true });
    rmSync(mutated, { recursive: true, force: true });
  }
});

test("a plugin manifest naming a different entrypoint file hashes that file instead", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-spawn-artifact-digest-"));
  try {
    const manifest = JSON.parse(MANIFEST) as Record<string, unknown>;
    manifest.entrypoint = "runner.mjs";
    manifest.files = ["runner.mjs"];
    writeFileSync(resolve(root, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(resolve(root, "runner.mjs"), ENTRYPOINT);
    const digest = computeSpawnArtifactDigest({ pluginRoot: root });
    assert.match(digest, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a manifest missing a string entrypoint field is rejected", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-spawn-artifact-digest-"));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(resolve(root, "manifest.json"), JSON.stringify({ id: "broken" }));
    assert.throws(
      () => computeSpawnArtifactDigest({ pluginRoot: root }),
      /entrypoint/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const pluginId = "spawn-golden";
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

function makePluginsRoot(): { pluginsRoot: string; pluginRoot: string } {
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-spawn-launch-spec-"));
  const pluginRoot = resolve(pluginsRoot, pluginId);
  mkdirSync(pluginRoot, { recursive: true });
  writeFileSync(resolve(pluginRoot, "manifest.json"), MANIFEST);
  writeFileSync(resolve(pluginRoot, "index.mjs"), ENTRYPOINT);
  return { pluginsRoot, pluginRoot };
}

test("captured plugin bytes produce the exact disk spawn commitments without a plugin root", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const manifestBytes = new TextEncoder().encode(MANIFEST);
    const entrypointBytes = new TextEncoder().encode(ENTRYPOINT);
    const diskCommitments = computeSpawnPluginArtifactCommitments({ pluginRoot });

    rmSync(pluginsRoot, { recursive: true, force: true });

    const capturedCommitments = computeSpawnPluginArtifactCommitmentsFromBytes({
      manifestBytes,
      entrypointBytes,
    });
    assert.deepEqual(capturedCommitments, diskCommitments);
    assert.ok(Object.isFrozen(capturedCommitments));

    const mutatedManifestBytes = Uint8Array.from(manifestBytes);
    mutatedManifestBytes[0] = mutatedManifestBytes[0]! ^ 1;
    const manifestMutation = computeSpawnPluginArtifactCommitmentsFromBytes({
      manifestBytes: mutatedManifestBytes,
      entrypointBytes,
    });
    assert.notEqual(manifestMutation.imageDigest, capturedCommitments.imageDigest);
    assert.equal(manifestMutation.runnerDigest, capturedCommitments.runnerDigest);
    assert.equal(manifestMutation.profileDigest, capturedCommitments.profileDigest);

    const mutatedEntrypointBytes = Uint8Array.from(entrypointBytes);
    mutatedEntrypointBytes[0] = mutatedEntrypointBytes[0]! ^ 1;
    const entrypointMutation = computeSpawnPluginArtifactCommitmentsFromBytes({
      manifestBytes,
      entrypointBytes: mutatedEntrypointBytes,
    });
    assert.notEqual(entrypointMutation.imageDigest, capturedCommitments.imageDigest);
    assert.equal(entrypointMutation.runnerDigest, capturedCommitments.runnerDigest);
    assert.equal(entrypointMutation.profileDigest, capturedCommitments.profileDigest);
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});

function ticketWith(pluginsRoot: string, commitments: PluginArtifactCommitments): AdmissionTicket {
  const generated = generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog,
    artifactCommitments: { [pluginId]: commitments },
  });
  if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error(`registry admission failed: ${admitted.code}`);
  return admitted.ticket;
}

test("a ticket committed to the on-disk spawn artifacts produces one frozen launch specification", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const commitments = computeSpawnPluginArtifactCommitments({ pluginRoot });
    const ticket = ticketWith(pluginsRoot, commitments);
    const launch = createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId, pluginRoot });

    assert.equal(launch.pluginId, pluginId);
    assert.equal(launch.artifactDigest, commitments.imageDigest);
    assert.equal(launch.artifactDigest, computeSpawnArtifactDigest({ pluginRoot }));
    assert.equal(launch.entrypointPath, resolve(pluginRoot, "index.mjs"));
    assert.equal(launch.cwd, pluginRoot);
    assert.deepEqual(launch.env, { NODE_OPTIONS: "--disable-proto=throw" });
    assert.deepEqual(launch.envAllowlist, ["HOME", "PATH"]);
    assert.equal(launch.uid, 10101);
    assert.equal(launch.gid, 10101);

    assert.ok(Object.isFrozen(launch));
    assert.ok(Object.isFrozen(launch.env));
    assert.ok(Object.isFrozen(launch.envAllowlist));
    assert.equal(Object.hasOwn(launch, "createArgs"), false);
    assert.equal(Object.hasOwn(launch, "imageDigest"), false);
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});

test("the spawn launch resolver rejects a ticket committed to different artifacts", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const ticket = ticketWith(pluginsRoot, {
      runnerDigest: "c".repeat(64),
      imageDigest: "b".repeat(64),
      profileDigest: "d".repeat(64),
    });
    assert.throws(
      () => createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId, pluginRoot }),
      /commitment mismatch/,
    );
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});

test("the spawn launch resolver rejects a ticket whose artifact digest alone is wrong", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const commitments = computeSpawnPluginArtifactCommitments({ pluginRoot });
    const ticket = ticketWith(pluginsRoot, { ...commitments, imageDigest: "b".repeat(64) });
    assert.throws(
      () => createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId, pluginRoot }),
      /commitment mismatch/,
    );
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});

test("editing a plugin file after admission invalidates its spawn launch specification", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const commitments = computeSpawnPluginArtifactCommitments({ pluginRoot });
    const ticket = ticketWith(pluginsRoot, commitments);
    assert.ok(createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId, pluginRoot }));

    writeFileSync(resolve(pluginRoot, "index.mjs"), `${ENTRYPOINT}// tampered\n`);
    assert.throws(
      () => createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId, pluginRoot }),
      /commitment mismatch/,
    );
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});

test("the spawn launch resolver rejects an unissued ticket and an unadmitted plugin", () => {
  const { pluginsRoot, pluginRoot } = makePluginsRoot();
  try {
    const commitments = computeSpawnPluginArtifactCommitments({ pluginRoot });
    const ticket = ticketWith(pluginsRoot, commitments);
    assert.throws(
      () =>
        createAdmittedPluginSpawnLaunchSpec({
          ticket: { ...ticket } as AdmissionTicket,
          pluginId,
          pluginRoot,
        }),
      /unverified admission ticket/,
    );
    assert.throws(
      () => createAdmittedPluginSpawnLaunchSpec({ ticket, pluginId: "absent-plugin", pluginRoot }),
      /admitted plugin not found/,
    );
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
  }
});
