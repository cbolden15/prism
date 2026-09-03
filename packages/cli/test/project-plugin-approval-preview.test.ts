import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { computeSpawnPluginArtifactCommitmentsFromBytes } from "@useprism/runtime";
import { createToolPluginScaffold } from "@useprism/sdk/authoring";
import { generatePluginRegistryFromCapturedBytes } from "@useprism/sdk/node/registry";
import {
  computeProjectPluginApprovalDigest,
  createProjectPluginApprovalPreview,
  prepareProjectPluginApproval,
} from "../src/project-plugin-approval-preview.ts";

const encoder = new TextEncoder();

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function declarationBytes(path = "prism-plugins/release-slug"): Uint8Array {
  return encoder.encode(`${JSON.stringify({
    version: "prism-project-tool-plugin-v1",
    path,
    operation: "slugify",
  })}\n`);
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-plugin-approval-preview-")));
  const workspace = join(root, "workspace");
  const pluginRoot = join(workspace, "prism-plugins", "release-slug");
  const configPath = join(workspace, ".prism", "config.json");
  const declarationPath = join(workspace, ".prism", "tool-plugin.json");
  await Promise.all([
    mkdir(join(workspace, ".prism"), { recursive: true }),
    mkdir(pluginRoot, { recursive: true }),
  ]);
  await writeFile(configPath, '{"version":"prism-config-v1","provider":"deterministic"}\n');
  const projectBytes = declarationBytes();
  await writeFile(declarationPath, projectBytes);
  const scaffold = createToolPluginScaffold("release-slug");
  assert.ok(scaffold);
  await Promise.all(scaffold.map(({ path, contents }) => writeFile(join(pluginRoot, path), contents, "utf8")));
  const authoring = new Map(scaffold.map(({ path, contents }) => [path, contents]));
  return {
    root,
    workspace,
    pluginRoot,
    configPath,
    declarationPath,
    projectBytes,
    manifest: authoring.get("manifest.json") as string,
    entrypoint: authoring.get("index.mjs") as string,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("approval preview is exact, deterministic, frozen, and digest-equivalent to the ADR tuple", async () => {
  const input = await fixture();
  try {
    const preview = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    assert.deepEqual(Object.keys(preview), [
      "version",
      "workspace",
      "projectConfigDigest",
      "declaredPath",
      "canonicalPluginPath",
      "operation",
      "plugin",
      "approvalDigest",
      "executionBoundary",
      "sandboxed",
      "warning",
    ]);
    assert.deepEqual(Object.keys(preview.plugin), [
      "id",
      "manifestDigest",
      "sourceDigest",
      "registryDigest",
      "versionDigest",
      "runnerDigest",
      "imageDigest",
      "profileDigest",
    ]);
    assert.equal(preview.workspace, input.workspace);
    assert.equal(preview.projectConfigDigest, sha256(input.projectBytes));
    assert.equal(preview.declaredPath, "prism-plugins/release-slug");
    assert.equal(preview.canonicalPluginPath, input.pluginRoot);
    assert.equal(preview.operation, "slugify");
    assert.equal(preview.plugin.id, "release-slug");
    for (const digest of [
      preview.projectConfigDigest,
      preview.plugin.manifestDigest,
      preview.plugin.sourceDigest,
      preview.plugin.registryDigest,
      preview.plugin.versionDigest,
      preview.plugin.runnerDigest,
      preview.plugin.imageDigest,
      preview.plugin.profileDigest,
      preview.approvalDigest,
    ]) assert.match(digest, /^[0-9a-f]{64}$/u);
    assert.equal(preview.executionBoundary, "ambient-subprocess");
    assert.equal(preview.sandboxed, false);
    assert.match(preview.warning, /not safety or sandboxing.*ambient host authority/iu);
    assert.equal(preview.approvalDigest, computeProjectPluginApprovalDigest(preview));
    assert.equal(preview.approvalDigest, sha256(JSON.stringify([
      "prism-project-plugin-approval-digest-v1",
      preview.workspace,
      preview.projectConfigDigest,
      preview.declaredPath,
      preview.canonicalPluginPath,
      preview.operation,
      preview.plugin.id,
      preview.plugin.manifestDigest,
      preview.plugin.sourceDigest,
      preview.plugin.registryDigest,
      preview.plugin.versionDigest,
      preview.plugin.runnerDigest,
      preview.plugin.imageDigest,
      preview.plugin.profileDigest,
    ])));
    assert.equal(Object.isFrozen(preview), true);
    assert.equal(Object.isFrozen(preview.plugin), true);
    assert.deepEqual(await createProjectPluginApprovalPreview({ workspace: input.workspace }), preview);
  } finally {
    await input.cleanup();
  }
});

test("approval preparation freezes one captured snapshot and detects declaration or source drift", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    assert.equal(Object.isFrozen(prepared), true);
    assert.deepEqual(prepared.proposal, await createProjectPluginApprovalPreview({ workspace: input.workspace }));
    assert.equal(await prepared.isFresh(), true);

    const captured = prepared.capturedBytes();
    assert.equal(new TextDecoder().decode(captured.manifestBytes), input.manifest);
    assert.deepEqual(captured.runtimeFiles.map(({ name }) => name), ["index.mjs"]);
    assert.ok(captured.registryBytes.byteLength > 0);
    captured.manifestBytes[0] = 0;
    captured.runtimeFiles[0]?.bytes.fill(0);
    captured.registryBytes[0] = 0;
    const copiedAgain = prepared.capturedBytes();
    assert.equal(new TextDecoder().decode(copiedAgain.manifestBytes), input.manifest);
    assert.equal(new TextDecoder().decode(copiedAgain.runtimeFiles[0]?.bytes), input.entrypoint);
    assert.notEqual(copiedAgain.registryBytes[0], 0);

    await writeFile(join(input.pluginRoot, "index.mjs"), `${input.entrypoint}\n// changed after preparation\n`);
    assert.equal(await prepared.isFresh(), false);
    await writeFile(join(input.pluginRoot, "index.mjs"), input.entrypoint);
    await writeFile(input.declarationPath, ` ${new TextDecoder().decode(input.projectBytes)}`);
    assert.equal(await prepared.isFresh(), false);
  } finally {
    await input.cleanup();
  }
});

test("approval preparation rejects duplicate manifest JSON members", async () => {
  const input = await fixture();
  try {
    await writeFile(
      join(input.pluginRoot, "manifest.json"),
      `{"id":"release-slug","id":"release-slug",${input.manifest.trim().slice(1)}`,
    );
    await assert.rejects(
      prepareProjectPluginApproval({ workspace: input.workspace }),
      { code: "manifest-invalid" },
    );
  } finally {
    await input.cleanup();
  }
});

test("provider settings and authoring sidecars do not change plugin approval identity", async () => {
  const input = await fixture();
  try {
    const baseline = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    await writeFile(
      input.configPath,
      '{"version":"prism-config-v1","provider":"ollama","model":"qwen","endpoint":"http://127.0.0.1:11434"}\n',
    );
    assert.deepEqual(await createProjectPluginApprovalPreview({ workspace: input.workspace }), baseline);
    await writeFile(join(input.pluginRoot, "README.md"), "changed documentation sidecar\n");
    await writeFile(join(input.pluginRoot, "index.test.mjs"), "throw new Error('changed test sidecar');\n");
    assert.deepEqual(await createProjectPluginApprovalPreview({ workspace: input.workspace }), baseline);
  } finally {
    await input.cleanup();
  }
});

test("source, manifest, and exact declaration bytes invalidate only their intended commitments", async () => {
  const input = await fixture();
  try {
    const baseline = await createProjectPluginApprovalPreview({ workspace: input.workspace });

    await writeFile(join(input.pluginRoot, "index.mjs"), `${input.entrypoint}\n// source mutation\n`);
    const sourceChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    assert.equal(sourceChanged.plugin.manifestDigest, baseline.plugin.manifestDigest);
    assert.notEqual(sourceChanged.plugin.sourceDigest, baseline.plugin.sourceDigest);
    assert.notEqual(sourceChanged.plugin.imageDigest, baseline.plugin.imageDigest);
    assert.equal(sourceChanged.plugin.runnerDigest, baseline.plugin.runnerDigest);
    assert.equal(sourceChanged.plugin.profileDigest, baseline.plugin.profileDigest);
    assert.notEqual(sourceChanged.plugin.versionDigest, baseline.plugin.versionDigest);
    assert.notEqual(sourceChanged.plugin.registryDigest, baseline.plugin.registryDigest);
    assert.notEqual(sourceChanged.approvalDigest, baseline.approvalDigest);

    await writeFile(join(input.pluginRoot, "index.mjs"), input.entrypoint);
    const manifest = JSON.parse(input.manifest) as Record<string, unknown>;
    manifest.license = { spdxId: "MIT", holder: "changed holder" };
    await writeFile(join(input.pluginRoot, "manifest.json"), `${JSON.stringify(manifest)}\n`);
    const manifestChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    assert.notEqual(manifestChanged.plugin.manifestDigest, baseline.plugin.manifestDigest);
    assert.equal(manifestChanged.plugin.sourceDigest, baseline.plugin.sourceDigest);
    assert.notEqual(manifestChanged.plugin.imageDigest, baseline.plugin.imageDigest);
    assert.equal(manifestChanged.plugin.runnerDigest, baseline.plugin.runnerDigest);
    assert.equal(manifestChanged.plugin.profileDigest, baseline.plugin.profileDigest);
    assert.notEqual(manifestChanged.plugin.versionDigest, baseline.plugin.versionDigest);
    assert.notEqual(manifestChanged.plugin.registryDigest, baseline.plugin.registryDigest);
    assert.notEqual(manifestChanged.approvalDigest, baseline.approvalDigest);

    await writeFile(join(input.pluginRoot, "manifest.json"), input.manifest);
    await writeFile(input.declarationPath, '{\n  "operation": "slugify",\n  "path": "prism-plugins/release-slug",\n  "version": "prism-project-tool-plugin-v1"\n}\n');
    const declarationChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    assert.deepEqual(declarationChanged.plugin, baseline.plugin);
    assert.notEqual(declarationChanged.projectConfigDigest, baseline.projectConfigDigest);
    assert.notEqual(declarationChanged.approvalDigest, baseline.approvalDigest);
  } finally {
    await input.cleanup();
  }
});

test("canonical workspace and declared path bind identical plugin bytes to different approvals", async () => {
  const input = await fixture();
  try {
    const baseline = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    const clone = join(input.root, "clone");
    await cp(input.workspace, clone, { recursive: true });
    const cloned = await createProjectPluginApprovalPreview({ workspace: clone });
    assert.equal(cloned.projectConfigDigest, baseline.projectConfigDigest);
    assert.deepEqual(cloned.plugin, baseline.plugin);
    assert.notEqual(cloned.workspace, baseline.workspace);
    assert.notEqual(cloned.canonicalPluginPath, baseline.canonicalPluginPath);
    assert.notEqual(cloned.approvalDigest, baseline.approvalDigest);

    const alternate = join(input.workspace, "alternate", "release-slug");
    await mkdir(join(input.workspace, "alternate"));
    await cp(input.pluginRoot, alternate, { recursive: true });
    await writeFile(input.declarationPath, declarationBytes("alternate/release-slug"));
    const pathChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    assert.deepEqual(pathChanged.plugin, baseline.plugin);
    assert.notEqual(pathChanged.projectConfigDigest, baseline.projectConfigDigest);
    assert.equal(pathChanged.declaredPath, "alternate/release-slug");
    assert.equal(pathChanged.canonicalPluginPath, alternate);
    assert.notEqual(pathChanged.approvalDigest, baseline.approvalDigest);
  } finally {
    await input.cleanup();
  }
});

test("fixed registry, runner, and profile inputs are visible in and bound by the proposal", async () => {
  const input = await fixture();
  try {
    const baseline = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    let observedEnvironment: unknown;
    let observedCatalog: unknown;
    const observed = await createProjectPluginApprovalPreview({ workspace: input.workspace }, {
      generateRegistry(options) {
        observedEnvironment = options.environment;
        observedCatalog = structuredClone(options.capabilityCatalog);
        return generatePluginRegistryFromCapturedBytes(options);
      },
    });
    assert.deepEqual(observed, baseline);
    assert.equal(observedEnvironment, "production");
    assert.deepEqual(observedCatalog, {
      version: "pnh-capability-catalog-v1",
      capabilities: [{
        id: "tool-operation",
        limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true },
      }],
    });

    const catalogChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace }, {
      generateRegistry(options) {
        return generatePluginRegistryFromCapturedBytes({
          ...options,
          capabilityCatalog: {
            version: "pnh-capability-catalog-v1",
            capabilities: [
              ...options.capabilityCatalog.capabilities,
              { id: "model-calls", limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 1 } },
            ],
          },
        });
      },
    });
    assert.equal(catalogChanged.plugin.versionDigest, baseline.plugin.versionDigest);
    assert.notEqual(catalogChanged.plugin.registryDigest, baseline.plugin.registryDigest);
    assert.notEqual(catalogChanged.approvalDigest, baseline.approvalDigest);

    const runnerChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace }, {
      computeSpawnCommitments(options) {
        return { ...computeSpawnPluginArtifactCommitmentsFromBytes(options), runnerDigest: "a".repeat(64) };
      },
    });
    assert.notEqual(runnerChanged.plugin.runnerDigest, baseline.plugin.runnerDigest);
    assert.equal(runnerChanged.plugin.imageDigest, baseline.plugin.imageDigest);
    assert.equal(runnerChanged.plugin.profileDigest, baseline.plugin.profileDigest);
    assert.notEqual(runnerChanged.plugin.versionDigest, baseline.plugin.versionDigest);
    assert.notEqual(runnerChanged.plugin.registryDigest, baseline.plugin.registryDigest);
    assert.notEqual(runnerChanged.approvalDigest, baseline.approvalDigest);

    const profileChanged = await createProjectPluginApprovalPreview({ workspace: input.workspace }, {
      computeSpawnCommitments(options) {
        return { ...computeSpawnPluginArtifactCommitmentsFromBytes(options), profileDigest: "b".repeat(64) };
      },
    });
    assert.equal(profileChanged.plugin.runnerDigest, baseline.plugin.runnerDigest);
    assert.equal(profileChanged.plugin.imageDigest, baseline.plugin.imageDigest);
    assert.notEqual(profileChanged.plugin.profileDigest, baseline.plugin.profileDigest);
    assert.notEqual(profileChanged.plugin.versionDigest, baseline.plugin.versionDigest);
    assert.notEqual(profileChanged.plugin.registryDigest, baseline.plugin.registryDigest);
    assert.notEqual(profileChanged.approvalDigest, baseline.approvalDigest);
  } finally {
    await input.cleanup();
  }
});

test("a declaration or project-directory swap during preview fails closed", async () => {
  const declarationSwap = await fixture();
  try {
    await assert.rejects(
      createProjectPluginApprovalPreview({ workspace: declarationSwap.workspace }, {
        computeSpawnCommitments(options) {
          writeFileSync(declarationSwap.declarationPath, declarationBytes("alternate/release-slug"));
          return computeSpawnPluginArtifactCommitmentsFromBytes(options);
        },
      }),
      { code: "declaration-changed" },
    );
  } finally {
    await declarationSwap.cleanup();
  }

  const parentSwap = await fixture();
  try {
    const prism = join(parentSwap.workspace, ".prism");
    await assert.rejects(
      createProjectPluginApprovalPreview({ workspace: parentSwap.workspace }, {
        computeSpawnCommitments(options) {
          renameSync(prism, join(parentSwap.workspace, ".prism-replaced"));
          mkdirSync(prism);
          writeFileSync(parentSwap.configPath, '{"version":"prism-config-v1","provider":"deterministic"}\n');
          writeFileSync(parentSwap.declarationPath, parentSwap.projectBytes);
          return computeSpawnPluginArtifactCommitmentsFromBytes(options);
        },
      }),
      { code: "declaration-changed" },
    );
  } finally {
    await parentSwap.cleanup();
  }
});

test("the pure approval digest binds every inspectable context and commitment field", () => {
  const identity = {
    workspace: "/workspace",
    projectConfigDigest: "1".repeat(64),
    declaredPath: "prism-plugins/release-slug",
    canonicalPluginPath: "/workspace/prism-plugins/release-slug",
    operation: "slugify" as const,
    plugin: {
      id: "release-slug",
      manifestDigest: "2".repeat(64),
      sourceDigest: "3".repeat(64),
      registryDigest: "4".repeat(64),
      versionDigest: "5".repeat(64),
      runnerDigest: "6".repeat(64),
      imageDigest: "7".repeat(64),
      profileDigest: "8".repeat(64),
    },
  };
  const digest = computeProjectPluginApprovalDigest(identity);
  assert.equal(digest, sha256(JSON.stringify([
    "prism-project-plugin-approval-digest-v1",
    identity.workspace,
    identity.projectConfigDigest,
    identity.declaredPath,
    identity.canonicalPluginPath,
    identity.operation,
    identity.plugin.id,
    identity.plugin.manifestDigest,
    identity.plugin.sourceDigest,
    identity.plugin.registryDigest,
    identity.plugin.versionDigest,
    identity.plugin.runnerDigest,
    identity.plugin.imageDigest,
    identity.plugin.profileDigest,
  ])));
  for (const field of ["workspace", "projectConfigDigest", "declaredPath", "canonicalPluginPath"] as const) {
    assert.notEqual(computeProjectPluginApprovalDigest({ ...identity, [field]: `${identity[field]}-changed` }), digest, field);
  }
  for (const field of Object.keys(identity.plugin) as Array<keyof typeof identity.plugin>) {
    assert.notEqual(computeProjectPluginApprovalDigest({
      ...identity,
      plugin: { ...identity.plugin, [field]: `${identity.plugin[field]}-changed` },
    }), digest, field);
  }
});
