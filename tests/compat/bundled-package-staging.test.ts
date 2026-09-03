import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stageBundledPackageForPack } from "../../scripts/release/stage-bundled-package.mjs";

async function fixture(context: { after(callback: () => unknown): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-bundled-package-stage-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, "package");
  const dependencyRoot = join(root, "dependencies");
  const dependency = join(dependencyRoot, "parser");
  const stagingRoot = join(root, "staging", "package");
  await Promise.all([mkdir(packageRoot), mkdir(dependency, { recursive: true })]);
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    dependencies: { parser: "1.2.3" },
    bundleDependencies: ["parser"],
  }));
  await writeFile(join(packageRoot, "index.mjs"), "export {};\n");
  await writeFile(join(dependency, "package.json"), JSON.stringify({ name: "parser", version: "1.2.3" }));
  await writeFile(join(dependency, "parser.mjs"), "export const parser = true;\n");
  return { packageRoot, dependencyRoot, dependency, stagingRoot };
}

test("stages exact bundled dependencies without mutating the source package", async (context) => {
  const input = await fixture(context);
  assert.equal(await stageBundledPackageForPack(input), input.stagingRoot);
  assert.equal(await readFile(join(input.stagingRoot, "index.mjs"), "utf8"), "export {};\n");
  assert.deepEqual(
    JSON.parse(await readFile(join(input.stagingRoot, "node_modules", "parser", "package.json"), "utf8")),
    { name: "parser", version: "1.2.3" },
  );
  await assert.rejects(readFile(join(input.packageRoot, "node_modules", "parser", "package.json")), { code: "ENOENT" });
});

test("fails closed when bundled dependency identity differs from the manifest", async (context) => {
  const input = await fixture(context);
  await writeFile(join(input.dependency, "package.json"), JSON.stringify({ name: "parser", version: "1.2.4" }));
  await assert.rejects(stageBundledPackageForPack(input), /bundled-dependency-version-mismatch/u);
});

test("returns an unbundled package root without creating a stage", async (context) => {
  const input = await fixture(context);
  await writeFile(join(input.packageRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  assert.equal(await stageBundledPackageForPack(input), input.packageRoot);
  await assert.rejects(readFile(join(input.stagingRoot, "package.json")), { code: "ENOENT" });
});
