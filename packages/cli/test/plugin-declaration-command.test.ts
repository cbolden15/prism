import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pluginDeclareCommand } from "../src/commands/plugin-declare.ts";
import { pluginUndeclareCommand } from "../src/commands/plugin-undeclare.ts";

async function fixture(run: (workspace: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "prism-plugin-command-"));
  const workspace = join(root, "workspace");
  await mkdir(join(workspace, "prism-plugins", "release-slug"), { recursive: true });
  await mkdir(join(workspace, ".prism"));
  await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
  try { await run(workspace); } finally { await rm(root, { recursive: true, force: true }); }
}

function writers(): { readonly stdout: string[]; readonly stderr: string[]; readonly output: { readonly stdout: { write(value: string): void }; readonly stderr: { write(value: string): void } } } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, output: { stdout: { write: (value) => stdout.push(value) }, stderr: { write: (value) => stderr.push(value) } } };
}

test("declare command has closed grammar and writes no approval or provider data", async () => {
  await fixture(async (workspace) => {
    const writer = writers();
    assert.equal(await pluginDeclareCommand({ arguments: ["prism-plugins/release-slug", "--operation", "slugify"], workspace, ...writer.output }), 0);
    assert.equal(writer.stderr.join(""), "");
    assert.equal(writer.stdout.join(""), "Declared project tool plugin: prism-plugins/release-slug (slugify)\n");
    assert.deepEqual(JSON.parse(await readFile(join(workspace, ".prism", "tool-plugin.json"), "utf8")), {
      version: "prism-project-tool-plugin-v1", path: "prism-plugins/release-slug", operation: "slugify",
    });
    for (const arguments_ of [[], ["prism-plugins/release-slug"], ["prism-plugins/release-slug", "--operation", "other"], ["prism-plugins/release-slug", "--operation", "slugify", "--operation", "slugify"], ["prism-plugins/release-slug", "--approval"]]) {
      const invalid = writers();
      assert.equal(await pluginDeclareCommand({ arguments: arguments_, workspace, ...invalid.output }), 2);
      assert.equal(invalid.stdout.join(""), "");
      assert.match(invalid.stderr.join(""), /^((Missing plugin path|Option --operation requires a value|Unsupported operation|Option --operation may only be specified once|Unknown option):? )?.*Usage: prism plugin declare/m);
    }

    const terminated = writers();
    assert.equal(await pluginDeclareCommand({
      arguments: ["--operation", "slugify", "--", "prism-plugins/release-slug"],
      workspace,
      ...terminated.output,
    }), 0);
  });
});

test("declare reports missing project config and undeclare has closed grammar", async () => {
  await fixture(async (workspace) => {
    await rm(join(workspace, ".prism", "config.json"));
    const missing = writers();
    assert.equal(await pluginDeclareCommand({ arguments: ["prism-plugins/release-slug", "--operation", "slugify"], workspace, ...missing.output }), 1);
    assert.equal(missing.stderr.join(""), [
      "Prism plugin declare failed: project-config-missing\n",
      "Run: prism init --scope project --provider deterministic\n",
    ].join(""));

    const invalid = writers();
    assert.equal(await pluginUndeclareCommand({ arguments: ["--approval"], workspace, ...invalid.output }), 2);
    assert.equal(invalid.stderr.join(""), "Unknown option: --approval\nUsage: prism plugin undeclare\n");
  });
});

test("undeclare removes only the lookup declaration", async () => {
  await fixture(async (workspace) => {
    const declared = writers();
    await pluginDeclareCommand({ arguments: ["prism-plugins/release-slug", "--operation", "slugify"], workspace, ...declared.output });
    const writer = writers();
    assert.equal(await pluginUndeclareCommand({ arguments: [], workspace, ...writer.output }), 0);
    assert.equal(writer.stdout.join(""), "Undeclared project tool plugin.\n");
    await assert.rejects(readFile(join(workspace, ".prism", "tool-plugin.json")));
  });
});
