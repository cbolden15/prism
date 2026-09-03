import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTHORING_ROOT_MARKER_CONTENTS,
  AUTHORING_ROOT_MARKER_NAME,
  DEFAULT_AUTHORING_ROOT_BASENAME,
  NATIVE_AUTHORING_TARGETS,
  selectNativeAuthoringTarget,
} from "../src/native-authoring.ts";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(cliRoot, "prebuilds", "manifest.json");
const expectedTargets = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
]);

test("managed authoring root metadata is exact", () => {
  assert.equal(DEFAULT_AUTHORING_ROOT_BASENAME, "prism-plugins");
  assert.equal(AUTHORING_ROOT_MARKER_NAME, ".prism-authoring-root-v1");
  assert.equal(AUTHORING_ROOT_MARKER_CONTENTS, "prism-managed-authoring-root-v1\n");
});

test("native authoring target selection is closed over the supported macOS and Linux matrix", () => {
  assert.deepEqual(NATIVE_AUTHORING_TARGETS, expectedTargets);
  assert.equal(selectNativeAuthoringTarget({ platform: "darwin", architecture: "arm64" }), "darwin-arm64");
  assert.equal(selectNativeAuthoringTarget({ platform: "darwin", architecture: "x64" }), "darwin-x64");
  assert.equal(selectNativeAuthoringTarget({ platform: "linux", architecture: "arm64", glibcVersionRuntime: "2.28" }), "linux-arm64-gnu");
  assert.equal(selectNativeAuthoringTarget({ platform: "linux", architecture: "arm64" }), "linux-arm64-musl");
  assert.equal(selectNativeAuthoringTarget({ platform: "linux", architecture: "x64", glibcVersionRuntime: "2.39" }), "linux-x64-gnu");
  assert.equal(selectNativeAuthoringTarget({ platform: "linux", architecture: "x64" }), "linux-x64-musl");
  assert.equal(selectNativeAuthoringTarget({ platform: "win32", architecture: "x64" }), null);
  assert.equal(selectNativeAuthoringTarget({ platform: "darwin", architecture: "ia32" }), null);
  assert.equal(selectNativeAuthoringTarget({ platform: "linux", architecture: "riscv64" }), null);
});

test("the prebuild manifest pins the exact source and every packaged binary", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly version?: unknown;
    readonly nodeApi?: unknown;
    readonly source?: unknown;
    readonly sourceSha256?: unknown;
    readonly targets?: Record<string, { readonly file?: unknown; readonly sha256?: unknown }>;
  };
  assert.equal(manifest.version, "prism-native-authoring-prebuilds-v1");
  assert.equal(manifest.nodeApi, 8);
  assert.equal(manifest.source, "native/prism_authoring.cc");
  assert.match(String(manifest.sourceSha256), /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(manifest.targets ?? {}), expectedTargets);

  const source = await readFile(resolve(cliRoot, String(manifest.source)));
  assert.equal(createHash("sha256").update(source).digest("hex"), manifest.sourceSha256);
  for (const target of expectedTargets) {
    const entry = manifest.targets?.[target];
    assert.deepEqual(Object.keys(entry ?? {}), ["file", "sha256"]);
    assert.equal(entry?.file, `${target}/prism_authoring.node`);
    assert.match(String(entry?.sha256), /^[0-9a-f]{64}$/u);
    const binary = await readFile(resolve(cliRoot, "prebuilds", String(entry?.file)));
    assert.ok(binary.byteLength > 0);
    assert.equal(createHash("sha256").update(binary).digest("hex"), entry?.sha256);
    assert.equal(binary.includes(Buffer.from(cliRoot)), false);
  }
});

test("the CLI package ships prebuilds and has no native install lifecycle", async () => {
  const packageManifest = JSON.parse(await readFile(resolve(cliRoot, "package.json"), "utf8")) as {
    readonly files?: readonly string[];
    readonly scripts?: Readonly<Record<string, string>>;
  };
  assert.ok(packageManifest.files?.includes("prebuilds/"));
  assert.equal(packageManifest.scripts?.preinstall, undefined);
  assert.equal(packageManifest.scripts?.install, undefined);
  assert.equal(packageManifest.scripts?.postinstall, undefined);
});

test("the loader executes the digest-verified descriptor when the package pathname is replaced", async () => {
  const root = await realpath(await mkdtemp(join(cliRoot, ".prism-native-loader-race-")));
  try {
    const packageRoot = join(root, "cli");
    const distRoot = join(packageRoot, "dist");
    await mkdir(distRoot, { recursive: true });
    await cp(resolve(cliRoot, "dist", "native-authoring.js"), join(distRoot, "native-authoring.js"));
    await cp(resolve(cliRoot, "prebuilds"), join(packageRoot, "prebuilds"), { recursive: true });
    await writeFile(join(packageRoot, "package.json"), '{"type":"module"}\n', "utf8");

    const target = selectNativeAuthoringTarget();
    assert.ok(target);
    const modulePath = join(distRoot, "native-authoring.js");
    const binaryPath = join(packageRoot, "prebuilds", target, "prism_authoring.node");
    const backupPath = `${binaryPath}.verified`;
    const authoringRoot = join(root, "managed");
    const scriptPath = join(root, "exercise-loader-race.mjs");
    await writeFile(scriptPath, String.raw`
import { renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [modulePath, binaryPath, backupPath, authoringRoot] = process.argv.slice(2);
const authoring = await import(pathToFileURL(modulePath).href);
const originalDlopen = process.dlopen;
let loadedPath;
process.dlopen = function(module, filename, flags) {
  loadedPath = filename;
  renameSync(binaryPath, backupPath);
  writeFileSync(binaryPath, "replacement is not a native addon\n");
  return flags === undefined
    ? originalDlopen.call(process, module, filename)
    : originalDlopen.call(process, module, filename, flags);
};
try {
  const files = Object.freeze([
    Object.freeze({ path: "README.md", contents: "# loader-tool\n" }),
    Object.freeze({ path: "index.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "index.test.mjs", contents: "export {}\n" }),
    Object.freeze({ path: "manifest.json", contents: "{}\n" }),
  ]);
  authoring.createManagedPlugin({ rootPath: authoringRoot, pluginId: "loader-tool", scaffold: files });
} finally {
  process.dlopen = originalDlopen;
}
const expectedPrefix = process.platform === "linux" ? "/proc/self/fd/" : "/dev/fd/";
if (typeof loadedPath !== "string" || !loadedPath.startsWith(expectedPrefix)) {
  throw new Error("native loader did not use the verified descriptor");
}
`, "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath,
      modulePath,
      binaryPath,
      backupPath,
      authoringRoot,
    ], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
