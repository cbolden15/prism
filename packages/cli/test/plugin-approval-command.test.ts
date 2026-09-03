import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createToolPluginScaffold } from "@useprism/sdk/authoring";
import { pluginApproveCommand } from "../src/commands/plugin-approve.ts";
import { pluginApprovalCommand } from "../src/commands/plugin-approval.ts";
import { pluginRevokeCommand } from "../src/commands/plugin-revoke.ts";
import { publishFirstProjectPluginArtifact, projectPluginArtifactPaths } from "../src/project-plugin-artifact.ts";
import { createProjectPluginApprovalPreview, prepareProjectPluginApproval } from "../src/project-plugin-approval-preview.ts";
import { readProjectPluginApprovalState } from "../src/project-plugin-approval-state.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "prism-plugin-approval-command-"));
  const workspace = join(root, "workspace");
  const plugin = join(workspace, "prism-plugins", "release-slug");
  const config = join(root, "config");
  const state = join(root, "state");
  await Promise.all([mkdir(plugin, { recursive: true }), mkdir(config), mkdir(state), mkdir(join(workspace, ".prism"), { recursive: true })]);
  await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
  await writeFile(join(workspace, ".prism", "tool-plugin.json"), '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify"}\n');
  const scaffold = createToolPluginScaffold("release-slug");
  assert.ok(scaffold);
  await Promise.all(scaffold.map(({ path, contents }) => writeFile(join(plugin, path), contents, "utf8")));
  await writeFile(join(plugin, "index.mjs"), 'throw new Error("approval must not import plugin code");\n');
  return { root, workspace, plugin, config, state, environment: { HOME: join(root, "home"), XDG_CONFIG_HOME: config, XDG_STATE_HOME: state } };
}

function writer() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, output: { stdout: { write: (value: string) => stdout.push(value) }, stderr: { write: (value: string) => stderr.push(value) } } };
}

test("plugin approval emits one redacted proposal without importing code or writing approval/artifact state", async () => {
  const input = await fixture();
  try {
    const output = writer();
    assert.equal(await pluginApprovalCommand({ arguments: ["--json"], workspace: input.workspace, ...output.output }), 0);
    assert.equal(output.stderr.join(""), "");
    const proposal = JSON.parse(output.stdout.join("")) as Record<string, unknown>;
    assert.equal(proposal.executionBoundary, "ambient-subprocess");
    assert.equal(proposal.sandboxed, false);
    assert.match(String(proposal.warning), /not safety or sandboxing/i);
    assert.equal(output.stdout.join("").includes("approval must not import plugin code"), false);
    assert.deepEqual(await readdir(input.config), []);
    assert.deepEqual(await readdir(input.state), []);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("plugin approval has closed --json-only grammar and typed failure output", async () => {
  const input = await fixture();
  try {
    for (const arguments_ of [[], ["--json", "--json"], ["--wat"], ["extra"]] as const) {
      const output = writer();
      assert.equal(await pluginApprovalCommand({ arguments: arguments_, workspace: input.workspace, ...output.output }), 2);
      assert.equal(output.stdout.join(""), "");
      assert.match(output.stderr.join(""), /Usage: prism plugin approval --json/);
    }
    await rm(join(input.workspace, ".prism", "tool-plugin.json"));
    const output = writer();
    assert.equal(await pluginApprovalCommand({ arguments: ["--json"], workspace: input.workspace, ...output.output }), 1);
    assert.equal(output.stdout.join(""), "");
    assert.equal(output.stderr.join(""), "Prism plugin approval failed: declaration-missing\n");
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("plugin approval fails closed on an invalid runtime import closure without importing it", async () => {
  const input = await fixture();
  try {
    await writeFile(join(input.plugin, "index.mjs"), 'import "node:fs";\nthrow new Error("must not import");\n');
    const output = writer();
    assert.equal(await pluginApprovalCommand({ arguments: ["--json"], workspace: input.workspace, ...output.output }), 1);
    assert.equal(output.stdout.join(""), "");
    assert.equal(output.stderr.join(""), "Prism plugin approval failed: source-closure\n");
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("plugin approve has closed digest grammar and mismatch writes no state", async () => {
  const input = await fixture();
  try {
    for (const arguments_ of [
      [],
      ["--digest"],
      ["--digest", "ABC"],
      ["--digest", "0".repeat(64), "extra"],
      ["--digest", "0".repeat(64), "--digest", "0".repeat(64)],
      ["--wat", "0".repeat(64)],
    ] as const) {
      const output = writer();
      assert.equal(await pluginApproveCommand({
        arguments: arguments_,
        workspace: input.workspace,
        environment: input.environment,
        ...output.output,
      }), 2);
      assert.equal(output.stdout.join(""), "");
      assert.match(output.stderr.join(""), /Usage: prism plugin approve --digest/);
    }

    const mismatch = writer();
    assert.equal(await pluginApproveCommand({
      arguments: ["--digest", "0".repeat(64)],
      workspace: input.workspace,
      environment: input.environment,
      ...mismatch.output,
    }), 1);
    assert.equal(mismatch.stdout.join(""), "");
    assert.equal(mismatch.stderr.join(""), "Prism plugin approve failed: project-plugin-approval-digest-mismatch\n");
    assert.deepEqual(await readdir(input.config), []);
    assert.deepEqual(await readdir(input.state), []);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("plugin approve materializes first, writes exact approval last, and revoke leaves inert cache", async () => {
  const input = await fixture();
  try {
    const proposal = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    const approved = writer();
    assert.equal(await pluginApproveCommand({
      arguments: ["--digest", proposal.approvalDigest],
      workspace: input.workspace,
      environment: input.environment,
      ...approved.output,
    }), 0, approved.stderr.join(""));
    assert.equal(approved.stderr.join(""), "");
    assert.equal(approved.stdout.join(""), `Approved project tool plugin release-slug: ${proposal.approvalDigest}\n`);

    const record = await readProjectPluginApprovalState({ workspace: proposal.workspace, environment: input.environment });
    assert.ok(record);
    const { executionBoundary: _executionBoundary, sandboxed: _sandboxed, warning: _warning, ...authority } = proposal;
    assert.deepEqual(record, { ...authority, version: "prism-project-plugin-approval-v1" });
    const paths = projectPluginArtifactPaths({
      registryDigest: proposal.plugin.registryDigest,
      pluginId: proposal.plugin.id,
      environment: input.environment,
    });
    assert.deepEqual((await readdir(paths.root)).sort(), ["plugin-pins.json", "plugins", "registry.json"]);
    assert.deepEqual((await readdir(paths.pluginRoot)).sort(), ["index.mjs", "manifest.json"]);
    assert.equal((await lstat(paths.root)).mode & 0o777, 0o700);
    assert.equal((await lstat(paths.registryPath)).mode & 0o777, 0o600);
    assert.match(await readFile(join(paths.pluginRoot, "index.mjs"), "utf8"), /approval must not import plugin code/u);

    const revoked = writer();
    assert.equal(await pluginRevokeCommand({
      arguments: [],
      workspace: input.workspace,
      environment: input.environment,
      ...revoked.output,
    }), 0, revoked.stderr.join(""));
    assert.equal(revoked.stdout.join(""), "Revoked project tool plugin approval.\n");
    assert.equal(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment: input.environment }), undefined);
    assert.deepEqual((await readdir(paths.root)).sort(), ["plugin-pins.json", "plugins", "registry.json"]);

    const missing = writer();
    assert.equal(await pluginRevokeCommand({
      arguments: [],
      workspace: input.workspace,
      environment: input.environment,
      ...missing.output,
    }), 1);
    assert.equal(missing.stderr.join(""), "Prism plugin revoke failed: project-plugin-approval-missing\n");
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("source drift after materialization leaves only inert cache and no approval", async () => {
  const input = await fixture();
  try {
    const proposal = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    const output = writer();
    assert.equal(await pluginApproveCommand({
      arguments: ["--digest", proposal.approvalDigest],
      workspace: input.workspace,
      environment: input.environment,
      dependencies: {
        prepare: prepareProjectPluginApproval,
        async publishFirst(publicationInput) {
          const artifact = await publishFirstProjectPluginArtifact(publicationInput);
          await writeFile(join(input.plugin, "index.mjs"), "export const changed = true;\n");
          return artifact;
        },
      },
      ...output.output,
    }), 1);
    assert.equal(output.stderr.join(""), "Prism plugin approve failed: project-plugin-approval-changed\n");
    assert.equal(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment: input.environment }), undefined);
    const paths = projectPluginArtifactPaths({
      registryDigest: proposal.plugin.registryDigest,
      pluginId: proposal.plugin.id,
      environment: input.environment,
    });
    assert.deepEqual((await readdir(paths.root)).sort(), ["plugin-pins.json", "plugins", "registry.json"]);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("approve and revoke reject Windows before preparation, canonicalization, or state I/O", async () => {
  const output = writer();
  let calls = 0;
  assert.equal(await pluginApproveCommand({
    arguments: ["--digest", "0".repeat(64)],
    workspace: "/not-read",
    environment: { XDG_CONFIG_HOME: "/not-read", XDG_STATE_HOME: "/not-read" },
    dependencies: {
      platform: "win32",
      prepare: async () => { calls += 1; throw new Error("must not run"); },
    },
    ...output.output,
  }), 1);
  assert.equal(output.stderr.join(""), "Prism plugin approve failed: project-plugin-unsupported-platform\n");

  const revokeOutput = writer();
  assert.equal(await pluginRevokeCommand({
    arguments: [],
    workspace: "/not-read",
    environment: { XDG_CONFIG_HOME: "/not-read" },
    dependencies: {
      platform: "win32",
      canonicalizeWorkspace: async () => { calls += 1; throw new Error("must not run"); },
    },
    ...revokeOutput.output,
  }), 1);
  assert.equal(revokeOutput.stderr.join(""), "Prism plugin revoke failed: project-plugin-unsupported-platform\n");
  assert.equal(calls, 0);
});
