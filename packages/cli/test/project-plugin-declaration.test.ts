import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  PROJECT_TOOL_PLUGIN_VERSION,
  declareProjectToolPlugin,
  parseProjectToolPluginDeclarationBytes,
  readProjectToolPluginDeclaration,
  undeclareProjectToolPlugin,
} from "../src/project-plugin-declaration.ts";

const encoder = new TextEncoder();

async function workspaceFixture(run: (fixture: { readonly root: string; readonly workspace: string; readonly plugin: string }) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "prism-project-declaration-"));
  const workspace = join(root, "workspace");
  const plugin = join(workspace, "prism-plugins", "release-slug");
  await mkdir(plugin, { recursive: true, mode: 0o755 });
  await mkdir(join(workspace, ".prism"), { mode: 0o755 });
  await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n', "utf8");
  try {
    await run({ root, workspace, plugin });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function declaration(path = "prism-plugins/release-slug"): Uint8Array {
  return encoder.encode(JSON.stringify({
    version: PROJECT_TOOL_PLUGIN_VERSION,
    path,
    operation: "slugify",
  }));
}

test("parses only bounded fatal-UTF8 exact-key declaration bytes into a frozen object", () => {
  const parsed = parseProjectToolPluginDeclarationBytes(declaration());
  assert.deepEqual(parsed, {
    version: "prism-project-tool-plugin-v1",
    path: "prism-plugins/release-slug",
    operation: "slugify",
  });
  assert.ok(Object.isFrozen(parsed));
  assert.throws(() => parseProjectToolPluginDeclarationBytes(encoder.encode("{")), { code: "declaration-invalid-json" });
  assert.throws(() => parseProjectToolPluginDeclarationBytes(new Uint8Array([0xc3, 0x28])), { code: "declaration-invalid-utf8" });
  assert.throws(() => parseProjectToolPluginDeclarationBytes(new Uint8Array((8 * 1024) + 1)), { code: "declaration-too-large" });
  assert.throws(() => parseProjectToolPluginDeclarationBytes(encoder.encode('{"version":"prism-project-tool-plugin-v1","version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify"}')), { code: "declaration-duplicate-member" });
  for (const serialized of [
    '[]',
    '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify","extra":true}',
    '{"version":"prism-project-tool-plugin-v1","operation":"slugify"}',
    '{"version":"wrong","path":"prism-plugins/release-slug","operation":"slugify"}',
    '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"other"}',
    '{"version":"prism-project-tool-plugin-v1","path":42,"operation":"slugify"}',
  ]) {
    assert.throws(() => parseProjectToolPluginDeclarationBytes(encoder.encode(serialized)), { code: "declaration-invalid" });
  }

  let byteLengthAccesses = 0;
  const spoofed = declaration();
  Object.defineProperty(spoofed, "byteLength", {
    configurable: true,
    get: () => {
      byteLengthAccesses += 1;
      return (8 * 1024) + 1;
    },
  });
  assert.deepEqual(parseProjectToolPluginDeclarationBytes(spoofed), parsed);
  assert.equal(byteLengthAccesses, 0);
});

test("rejects every non-normalized workspace-relative declaration path", () => {
  for (const path of ["", "/absolute", "C:/drive", "prism-plugins\\release-slug", "prism-plugins//release-slug", "./release-slug", "prism-plugins/../release-slug", "prism-plugins/\u0000release-slug"]) {
    assert.throws(() => parseProjectToolPluginDeclarationBytes(declaration(path)), { code: "declaration-invalid" }, path);
  }
});

test("declares only the project tool file, preserves provider bytes, and replaces intent", async () => {
  await workspaceFixture(async ({ workspace }) => {
    const configPath = join(workspace, ".prism", "config.json");
    const configBefore = await readFile(configPath);
    await declareProjectToolPlugin({ workspace, path: "prism-plugins/release-slug", operation: "slugify" });
    const declarationPath = join(workspace, ".prism", "tool-plugin.json");
    assert.deepEqual(JSON.parse(await readFile(declarationPath, "utf8")), {
      version: PROJECT_TOOL_PLUGIN_VERSION,
      path: "prism-plugins/release-slug",
      operation: "slugify",
    });
    assert.deepEqual(await readFile(configPath), configBefore);
    assert.equal((await lstat(declarationPath)).mode & 0o777, 0o644);

    await mkdir(join(workspace, "prism-plugins", "next-slug"));
    await declareProjectToolPlugin({ workspace, path: "prism-plugins/next-slug", operation: "slugify" });
    assert.equal((await readProjectToolPluginDeclaration({ workspace }))?.declaration.path, "prism-plugins/next-slug");
    assert.deepEqual(await readFile(configPath), configBefore);
  });
});

test("requires a real safe project config and contains a symlink-free plugin path", async () => {
  await workspaceFixture(async ({ root, workspace }) => {
    const workspaceAlias = join(root, "workspace-alias");
    await symlink(workspace, workspaceAlias);
    await assert.rejects(
      declareProjectToolPlugin({ workspace: workspaceAlias, path: "prism-plugins/release-slug", operation: "slugify" }),
      { code: "project-workspace-invalid" },
    );

    await rm(join(workspace, ".prism", "config.json"));
    await assert.rejects(declareProjectToolPlugin({ workspace, path: "prism-plugins/release-slug", operation: "slugify" }), { code: "project-config-missing" });

    await writeFile(join(workspace, ".prism", "config.json"), '{"version":"wrong"}', "utf8");
    await assert.rejects(declareProjectToolPlugin({ workspace, path: "prism-plugins/release-slug", operation: "slugify" }), { code: "project-config-invalid" });

    await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}', "utf8");
    const outside = join(root, "outside");
    await mkdir(outside);
    await symlink(outside, join(workspace, "prism-plugins", "linked"));
    await assert.rejects(declareProjectToolPlugin({ workspace, path: "prism-plugins/linked", operation: "slugify" }), { code: "plugin-path-symlink" });
    await assert.rejects(declareProjectToolPlugin({ workspace, path: "prism-plugins/missing", operation: "slugify" }), { code: "plugin-path-missing" });
  });
});

test("undeclare removes lookup atomically without touching the provider config", async () => {
  await workspaceFixture(async ({ workspace }) => {
    const configPath = join(workspace, ".prism", "config.json");
    const configBefore = await readFile(configPath);
    await declareProjectToolPlugin({ workspace, path: "prism-plugins/release-slug", operation: "slugify" });
    await rm(configPath);
    await undeclareProjectToolPlugin({ workspace });
    await assert.rejects(lstat(join(workspace, ".prism", "tool-plugin.json")), { code: "ENOENT" });
    await writeFile(configPath, configBefore);
    assert.equal(await readProjectToolPluginDeclaration({ workspace }), undefined);
    assert.deepEqual(await readFile(configPath), configBefore);
  });
});

test("undeclare removes the lookup before reporting tombstone cleanup failure", async () => {
  await workspaceFixture(async ({ workspace }) => {
    await declareProjectToolPlugin({ workspace, path: "prism-plugins/release-slug", operation: "slugify" });
    await assert.rejects(
      undeclareProjectToolPlugin(
        { workspace },
        { removeFile: async () => { throw new Error("injected cleanup failure"); } },
      ),
      { code: "declaration-cleanup-failed" },
    );
    await assert.rejects(lstat(join(workspace, ".prism", "tool-plugin.json")), { code: "ENOENT" });
  });
});
