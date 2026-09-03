import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const defaultAddonPath = resolve(nativeDirectory, "build", "host", "prism_authoring.node");
const markerName = ".prism-authoring-root-v1";
const markerContents = "prism-managed-authoring-root-v1\n";
const stagePattern = /^\.prism-authoring-stage-v1-[0-9a-f]{32}$/u;
const require = createRequire(import.meta.url);

function scaffold(pluginId) {
  return Object.freeze([
    Object.freeze({ path: "README.md", contents: `# ${pluginId}\n` }),
    Object.freeze({ path: "index.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "index.test.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "manifest.json", contents: "{}\n" }),
  ]);
}

function input(rootPath, pluginId, files = scaffold(pluginId)) {
  return { rootPath, pluginId, scaffold: files };
}

function loadAddon(addonPath) {
  return require(addonPath);
}

function assertFailure(action, expectedCode) {
  assert.throws(action, (error) => (
    error instanceof Error && error.message === expectedCode && error.code === expectedCode
  ));
}

async function assertPlugin(rootPath, pluginId) {
  const expected = scaffold(pluginId);
  const pluginRoot = join(rootPath, pluginId);
  assert.deepEqual((await readdir(pluginRoot)).sort(), expected.map(({ path }) => path));
  for (const file of expected) {
    assert.equal(await readFile(join(pluginRoot, file.path), "utf8"), file.contents);
    assert.equal((await stat(join(pluginRoot, file.path))).mode & 0o777, 0o644);
  }
}

function maximumBoundaryScaffold() {
  return Object.freeze([
    Object.freeze({ path: "README.md", contents: "a".repeat(262144) }),
    Object.freeze({ path: "index.mjs", contents: "b".repeat(262144) }),
    Object.freeze({ path: "index.test.mjs", contents: "c".repeat(262144) }),
    Object.freeze({ path: "manifest.json", contents: "d".repeat(65536) }),
  ]);
}

async function assertExactFiles(rootPath, pluginId, files) {
  const pluginRoot = join(rootPath, pluginId);
  assert.deepEqual((await readdir(pluginRoot)).sort(), files.map(({ path }) => path));
  for (const file of files) {
    assert.equal((await readFile(join(pluginRoot, file.path))).byteLength, Buffer.byteLength(file.contents));
  }
}

async function runWorker(addonPath, rootPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker", addonPath, rootPath], {
      stdio: "ignore",
    });
    child.once("error", rejectPromise);
    child.once("close", (status) => resolvePromise(status));
  });
}

async function runSuite(addonPath) {
  const addon = loadAddon(addonPath);
  assert.deepEqual(Object.getOwnPropertyNames(addon), ["createManagedPlugin"]);
  assert.deepEqual(Object.keys(addon), ["createManagedPlugin"]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(addon, "createManagedPlugin"), {
    value: addon.createManagedPlugin,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  assert.equal(typeof addon.createManagedPlugin, "function");

  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-native-authoring-")));
  try {
    const rootPath = join(temporary, "managed");
    assert.equal(addon.createManagedPlugin(input(rootPath, "first-tool")), undefined);
    assert.equal((await stat(rootPath)).mode & 0o777, 0o700);
    assert.equal(await readFile(join(rootPath, markerName), "utf8"), markerContents);
    assert.equal((await stat(join(rootPath, markerName))).mode & 0o777, 0o600);
    await assertPlugin(rootPath, "first-tool");

    assert.equal(addon.createManagedPlugin(input(rootPath, "second-tool")), undefined);
    await assertPlugin(rootPath, "second-tool");

    const maximumPluginId = "a".repeat(64);
    assert.equal(addon.createManagedPlugin(input(rootPath, maximumPluginId)), undefined);
    await assertPlugin(rootPath, maximumPluginId);

    const boundaryFiles = maximumBoundaryScaffold();
    assert.equal(addon.createManagedPlugin(input(rootPath, "boundary-tool", boundaryFiles)), undefined);
    await assertExactFiles(rootPath, "boundary-tool", boundaryFiles);

    const unmanaged = join(temporary, "unmanaged");
    await mkdir(unmanaged, { mode: 0o700 });
    assertFailure(() => addon.createManagedPlugin(input(unmanaged, "third-tool")), "root-unmanaged");

    const invalid = join(temporary, "invalid");
    await mkdir(invalid, { mode: 0o700 });
    await writeFile(join(invalid, markerName), "incorrect\n", { mode: 0o600 });
    assertFailure(() => addon.createManagedPlugin(input(invalid, "third-tool")), "root-invalid");

    const realParent = join(temporary, "real-parent");
    const linkedParent = join(temporary, "linked-parent");
    const linkedRoot = join(temporary, "linked-root");
    await mkdir(realParent, { mode: 0o700 });
    await symlink(realParent, linkedParent);
    await symlink(realParent, linkedRoot);
    assertFailure(() => addon.createManagedPlugin(input(join(linkedParent, "root"), "third-tool")), "root-parent-symlink");
    assertFailure(() => addon.createManagedPlugin(input(linkedRoot, "third-tool")), "root-parent-symlink");

    await writeFile(join(rootPath, "taken-tool"), "keep\n");
    assertFailure(() => addon.createManagedPlugin(input(rootPath, "taken-tool")), "destination-exists");
    assert.equal((await readdir(rootPath)).some((entry) => stagePattern.test(entry)), false);

    let accessorRead = false;
    const accessorInput = { pluginId: "accessor-tool", scaffold: scaffold("accessor-tool") };
    Object.defineProperty(accessorInput, "rootPath", {
      enumerable: true,
      get() {
        accessorRead = true;
        return rootPath;
      },
    });
    assertFailure(() => addon.createManagedPlugin(accessorInput), "create-failed");
    assert.equal(accessorRead, false);

    const customPrototypeInput = Object.assign(Object.create({ inherited: true }), input(rootPath, "prototype-tool"));
    assertFailure(() => addon.createManagedPlugin(customPrototypeInput), "create-failed");

    const assertRejectedBeforeMutation = async (name, candidate) => {
      const rejectedRoot = join(temporary, name);
      assertFailure(() => addon.createManagedPlugin(candidate(rejectedRoot)), "create-failed");
      assert.equal((await readdir(temporary)).includes(name), false);
    };
    await assertRejectedBeforeMutation("unknown-input", (rejectedRoot) => ({
      ...input(rejectedRoot, "unknown-tool"),
      unknown: true,
    }));
    await assertRejectedBeforeMutation("nul-input", (rejectedRoot) => ({
      ...input(`${rejectedRoot}\0`, "nul-tool"),
    }));
    await assertRejectedBeforeMutation("long-plugin", (rejectedRoot) => input(rejectedRoot, `a${"a".repeat(64)}`));
    await assertRejectedBeforeMutation("long-root", () => input(`/${"a".repeat(4096)}`, "root-tool"));
    await assertRejectedBeforeMutation("unfrozen-scaffold", (rejectedRoot) => ({
      rootPath: rejectedRoot,
      pluginId: "unfrozen-tool",
      scaffold: scaffold("unfrozen-tool").map((file) => ({ ...file })),
    }));
    await assertRejectedBeforeMutation("wrong-order", (rejectedRoot) => ({
      rootPath: rejectedRoot,
      pluginId: "order-tool",
      scaffold: Object.freeze([...scaffold("order-tool")].reverse()),
    }));
    await assertRejectedBeforeMutation("separator-name", (rejectedRoot) => ({
      rootPath: rejectedRoot,
      pluginId: "separator-tool",
      scaffold: Object.freeze([
        Object.freeze({ path: "README.md", contents: "readme\n" }),
        Object.freeze({ path: "index/nested.mjs", contents: "source\n" }),
        Object.freeze({ path: "index.test.mjs", contents: "test\n" }),
        Object.freeze({ path: "manifest.json", contents: "{}\n" }),
      ]),
    }));
    await assertRejectedBeforeMutation("file-bound", (rejectedRoot) => ({
      rootPath: rejectedRoot,
      pluginId: "bound-tool",
      scaffold: Object.freeze([
        Object.freeze({ path: "README.md", contents: "a".repeat(262145) }),
        Object.freeze({ path: "index.mjs", contents: "source\n" }),
        Object.freeze({ path: "index.test.mjs", contents: "test\n" }),
        Object.freeze({ path: "manifest.json", contents: "{}\n" }),
      ]),
    }));
    await assertRejectedBeforeMutation("manifest-bound", (rejectedRoot) => ({
      rootPath: rejectedRoot,
      pluginId: "manifest-tool",
      scaffold: Object.freeze([
        Object.freeze({ path: "README.md", contents: "readme\n" }),
        Object.freeze({ path: "index.mjs", contents: "source\n" }),
        Object.freeze({ path: "index.test.mjs", contents: "test\n" }),
        Object.freeze({ path: "manifest.json", contents: "m".repeat(65537) }),
      ]),
    }));

    await chmod(rootPath, 0o755);
    assertFailure(() => addon.createManagedPlugin(input(rootPath, "mode-tool")), "root-invalid");
    await chmod(rootPath, 0o700);

    const concurrentRoot = join(temporary, "concurrent");
    const statuses = await Promise.all(Array.from({ length: 8 }, () => runWorker(addonPath, concurrentRoot)));
    assert.equal(statuses.filter((status) => status === 0).length, 1);
    assert.equal(statuses.filter((status) => status === 10 || status === 11).length, 7);
    await assertPlugin(concurrentRoot, "race-tool");
    assert.equal((await readdir(concurrentRoot)).some((entry) => stagePattern.test(entry)), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function waitForReady(stream) {
  return Promise.race([
    new Promise((resolvePromise, rejectPromise) => {
      stream.once("data", (chunk) => resolvePromise(Buffer.from(chunk)));
      stream.once("end", () => rejectPromise(new Error("parent-race-ready-ended")));
      stream.once("error", rejectPromise);
    }),
    new Promise((_, rejectPromise) => setTimeout(() => rejectPromise(new Error("parent-race-ready-timeout")), 5000)),
  ]);
}

async function waitForStatus(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", resolvePromise);
  });
}

async function runParentRenameSuite(addonPath, parentRaceAddonPath) {
  const addon = loadAddon(addonPath);
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-native-authoring-parent-race-")));
  let child;
  try {
    const parentPath = join(temporary, "authoring-parent");
    const movedParentPath = join(temporary, "moved-parent");
    const rootPath = join(parentPath, "managed");
    await mkdir(parentPath, { mode: 0o700 });
    assert.equal(addon.createManagedPlugin(input(rootPath, "first-tool")), undefined);

    child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), "--parent-race-worker", parentRaceAddonPath, rootPath],
      { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
    );
    const ready = child.stdio[3];
    const resume = child.stdio[4];
    assert.ok(ready && resume);
    assert.deepEqual(await waitForReady(ready), Buffer.from("R"));
    await rename(parentPath, movedParentPath);
    resume.end("C");
    assert.equal(await waitForStatus(child), 13);
    child = undefined;

    const movedRoot = join(movedParentPath, "managed");
    await assertPlugin(movedRoot, "first-tool");
    assert.equal((await readdir(movedRoot)).includes("race-tool"), false);
    assert.equal((await readdir(movedRoot)).some((entry) => stagePattern.test(entry)), false);
    assert.equal((await readdir(temporary)).includes("authoring-parent"), false);
  } finally {
    if (child !== undefined) child.kill("SIGKILL");
    await rm(temporary, { recursive: true, force: true });
  }
}

async function runSyncFaultSuite(addonPath) {
  const addon = loadAddon(addonPath);
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-native-authoring-fault-")));
  try {
    const rootPath = join(temporary, "managed");
    assertFailure(() => addon.createManagedPlugin(input(rootPath, "fault-tool")), "cleanup-failed");
    assert.deepEqual(await readdir(temporary), []);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--worker" || process.argv[2] === "--parent-race-worker") {
  const mode = process.argv[2];
  const addonPath = process.argv[3];
  const rootPath = process.argv[4];
  if (addonPath === undefined || rootPath === undefined) process.exitCode = 2;
  else {
    try {
      loadAddon(addonPath).createManagedPlugin(input(rootPath, "race-tool"));
    } catch (error) {
      if (error instanceof Error && error.code === "root-busy") process.exitCode = 10;
      else if (error instanceof Error && error.code === "destination-exists") process.exitCode = 11;
      else if (mode === "--parent-race-worker" && error instanceof Error && error.code === "root-changed") process.exitCode = 13;
      else process.exitCode = 12;
    }
  }
} else {
  test("native managed authoring creates only a complete managed root", async () => {
    await runSuite(process.env.PRISM_NATIVE_ADDON ?? defaultAddonPath);
  });
  if (process.env.PRISM_NATIVE_SYNC_FAILURE_ADDON !== undefined) {
    test("native sync uncertainty is reported as cleanup-failed", async () => {
      await runSyncFaultSuite(process.env.PRISM_NATIVE_SYNC_FAILURE_ADDON);
    });
  }
  if (process.env.PRISM_NATIVE_PARENT_RACE_ADDON !== undefined) {
    test("native create rejects an ancestor renamed after staging", async () => {
      await runParentRenameSuite(
        process.env.PRISM_NATIVE_ADDON ?? defaultAddonPath,
        process.env.PRISM_NATIVE_PARENT_RACE_ADDON,
      );
    });
  }
}
