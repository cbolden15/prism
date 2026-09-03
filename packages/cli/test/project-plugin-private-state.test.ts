import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ensureProjectPluginPrivateStateDirectories,
  MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES,
  ProjectPluginPrivateStateError,
  projectPluginPrivateStatePaths,
  readProjectPluginPrivateStateBytes,
  validateProjectPluginPrivateState,
  writeProjectPluginPrivateStateJson,
} from "../src/project-plugin-private-state.ts";

test("approval state uses the exact XDG config path and canonical workspace key", () => {
  const workspace = "/private/workspace";
  const key = createHash("sha256").update(workspace).digest("hex");
  assert.deepEqual(projectPluginPrivateStatePaths({
    workspace,
    environment: { XDG_CONFIG_HOME: "/private/config", HOME: "/ignored" },
    platform: "darwin",
  }), {
    base: "/private/config",
    prism: "/private/config/prism",
    approvals: "/private/config/prism/plugin-approvals",
    version: "/private/config/prism/plugin-approvals/v1",
    record: `/private/config/prism/plugin-approvals/v1/${key}.json`,
  });
});

test("private state rejects Windows before filesystem access and rejects unsafe owned components", async () => {
  assert.throws(() => projectPluginPrivateStatePaths({
    workspace: "/workspace",
    environment: { XDG_CONFIG_HOME: "/config" },
    platform: "win32",
  }), { code: "project-plugin-unsupported-platform" });

  const paths = projectPluginPrivateStatePaths({
    workspace: "/workspace",
    environment: { XDG_CONFIG_HOME: "/config" },
    platform: "darwin",
  });
  const stat = (kind: "directory" | "file", uid = 42, mode = 0o700, symlink = false) => ({
    uid,
    mode,
    dev: 1,
    ino: 1,
    size: 1,
    mtimeMs: 1,
    ctimeMs: 1,
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
    isSymbolicLink: () => symlink,
  });
  const states = new Map([
    [paths.base, stat("directory", 501, 0o755)],
    [paths.prism, stat("directory")],
    [paths.approvals, stat("directory")],
    [paths.version, stat("directory")],
    [paths.record, stat("file", 42, 0o600)],
  ]);
  const dependencies = { platform: "darwin", uid: 42, lstat: async (path: string) => states.get(path)! };
  await validateProjectPluginPrivateState({ paths, includeRecord: true, dependencies });
  states.set(paths.prism, stat("directory", 7));
  await assert.rejects(validateProjectPluginPrivateState({ paths, includeRecord: true, dependencies }), ProjectPluginPrivateStateError);
  states.set(paths.prism, stat("directory"));
  states.set(paths.record, stat("file", 42, 0o644));
  await assert.rejects(validateProjectPluginPrivateState({ paths, includeRecord: true, dependencies }), ProjectPluginPrivateStateError);
  states.set(paths.record, stat("file", 42, 0o600));
  states.set(paths.base, stat("directory", 501, 0o755, true));
  await assert.rejects(validateProjectPluginPrivateState({ paths, includeRecord: true, dependencies }), ProjectPluginPrivateStateError);
});

test("private state writes and reads bounded no-follow bytes without repairing unsafe owned directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-private-state-"));
  const config = join(root, "config");
  const paths = projectPluginPrivateStatePaths({
    workspace: "/canonical/workspace",
    environment: { XDG_CONFIG_HOME: config },
    platform: process.platform,
  });
  try {
    await mkdir(config, { mode: 0o700 });
    await ensureProjectPluginPrivateStateDirectories({ paths });
    for (const path of [paths.prism, paths.approvals, paths.version]) {
      assert.equal((await lstat(path)).mode & 0o777, 0o700);
    }

    await writeProjectPluginPrivateStateJson({ paths, value: { ok: true } });
    assert.deepEqual(JSON.parse(new TextDecoder().decode(await readProjectPluginPrivateStateBytes({ paths }))), { ok: true });

    await chmod(paths.approvals, 0o770);
    await assert.rejects(ensureProjectPluginPrivateStateDirectories({ paths }), { code: "project-plugin-private-state-unsafe" });
    assert.equal((await lstat(paths.approvals)).mode & 0o777, 0o770);
    await chmod(paths.approvals, 0o700);

    await chmod(paths.record, 0o620);
    await assert.rejects(readProjectPluginPrivateStateBytes({ paths }), { code: "project-plugin-private-state-unsafe" });
    await assert.rejects(writeProjectPluginPrivateStateJson({ paths, value: {} }), { code: "project-plugin-private-state-unsafe" });
    await chmod(paths.record, 0o600);

    await assert.rejects(writeProjectPluginPrivateStateJson({
      paths,
      value: "x".repeat(MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES + 1),
    }), { code: "project-plugin-private-state-unsafe" });
    await writeFile(paths.record, "x".repeat(MAX_PROJECT_PLUGIN_APPROVAL_RECORD_BYTES + 1), { mode: 0o600 });
    await assert.rejects(readProjectPluginPrivateStateBytes({ paths }), { code: "project-plugin-private-state-unsafe" });

    await writeFile(paths.record, "{}\n", { mode: 0o600 });
    const original = join(paths.version, "original.json");
    await assert.rejects(readProjectPluginPrivateStateBytes({
      paths,
      dependencies: {
        beforeFileOpen: async () => {
          await rename(paths.record, original);
          await symlink(original, paths.record);
        },
      },
    }), { code: "project-plugin-private-state-unsafe" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("private state rejects a symlinked selected base and Windows before filesystem access", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-private-state-base-"));
  try {
    const real = join(root, "real");
    const linked = join(root, "linked");
    await mkdir(real);
    await symlink(real, linked);
    const paths = projectPluginPrivateStatePaths({
      workspace: "/canonical/workspace",
      environment: { XDG_CONFIG_HOME: linked },
      platform: process.platform,
    });
    await assert.rejects(readProjectPluginPrivateStateBytes({ paths }), { code: "project-plugin-private-state-unsafe" });

    let calls = 0;
    await assert.rejects(readProjectPluginPrivateStateBytes({
      paths,
      dependencies: {
        platform: "win32",
        lstat: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      },
    }), { code: "project-plugin-unsupported-platform" });
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
