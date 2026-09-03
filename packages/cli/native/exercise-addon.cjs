const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const addonPath = process.argv[2];
if (addonPath === undefined) process.exit(2);

const addon = require(addonPath);
const markerName = ".prism-authoring-root-v1";
const markerContents = "prism-managed-authoring-root-v1\n";

if (process.env.PRISM_EXPECT_MUSL === "1") {
  assert.equal(process.report.getReport().header.glibcVersionRuntime, undefined);
}

function scaffold(pluginId) {
  return Object.freeze([
    Object.freeze({ path: "README.md", contents: `# ${pluginId}\n` }),
    Object.freeze({ path: "index.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "index.test.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "manifest.json", contents: "{}\n" }),
  ]);
}

function input(rootPath, pluginId) {
  return { rootPath, pluginId, scaffold: scaffold(pluginId) };
}

const temporary = realpathSync(mkdtempSync(join(tmpdir(), "prism-native-prebuild-")));
try {
  const rootPath = join(temporary, "managed");
  assert.equal(addon.createManagedPlugin(input(rootPath, "first-tool")), undefined);
  assert.equal(addon.createManagedPlugin(input(rootPath, "second-tool")), undefined);
  assert.equal(readFileSync(join(rootPath, markerName), "utf8"), markerContents);
  assert.deepEqual(readdirSync(rootPath).sort(), [markerName, "first-tool", "second-tool"]);
  for (const pluginId of ["first-tool", "second-tool"]) {
    assert.deepEqual(readdirSync(join(rootPath, pluginId)).sort(), [
      "README.md",
      "index.mjs",
      "index.test.mjs",
      "manifest.json",
    ]);
  }
  assert.equal(statSync(rootPath).mode & 0o777, 0o700);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
