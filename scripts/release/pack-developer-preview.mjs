import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assembleDeveloperPreviewCandidate, developerPreview } from "./developer-preview-contract.mjs";
import { stageBundledPackageForPack } from "./stage-bundled-package.mjs";

function fail(reason) {
  throw new Error(reason);
}

function run(command, commandArguments, options) {
  try {
    return execFileSync(command, commandArguments, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch {
    fail("tooling-failed");
  }
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) {
    process.stderr.write("Missing --output.\nUsage: node scripts/release/pack-developer-preview.mjs --output <path>\n");
    process.exitCode = 2;
    return undefined;
  }
  if (arguments_.length !== 2 || arguments_[0] !== "--output" || arguments_[1].startsWith("-")) fail("invalid-arguments");
  return resolve(arguments_[1]);
}

function assertPackList(packed, expected) {
  if (!Array.isArray(packed) || packed.length !== 1 || packed[0]?.filename !== expected.file || !Array.isArray(packed[0]?.files)) fail("invalid-package-pack");
  const paths = packed[0].files.map(({ path }) => path);
  const forbidden = paths.some((path) => typeof path !== "string" && path !== "package.json"
    || /^(?:src|test|scripts|docs\/ai\/workstreams)\//u.test(path)
    || /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$))/iu.test(path)
    || path.includes("../") || path.startsWith("/") || path.endsWith(".map"));
  if (forbidden) fail("forbidden-package-entry");
  for (const path of ["package.json", "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    if (!paths.includes(path)) fail("required-package-entry-missing");
  }
  if (expected.name === "@useprism/cli") {
    for (const path of [
      "node_modules/acorn/LICENSE",
      "node_modules/acorn-walk/LICENSE",
      "prebuilds/provenance.json",
    ]) {
      if (!paths.includes(path)) fail("required-package-entry-missing");
    }
  }
}

async function linkBuildDependencies(root, checkout) {
  const source = resolve(root, "node_modules");
  const metadata = await lstat(source);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("tooling-failed");
  const target = resolve(checkout, "node_modules");
  await mkdir(target, { mode: 0o700 });
  for (const entry of (await readdir(source, { withFileTypes: true })).sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    if (entry.name === "@useprism" || entry.name === ".package-lock.json") continue;
    if (!entry.isDirectory() && !entry.isFile()) fail("tooling-failed");
    await symlink(resolve(source, entry.name), resolve(target, entry.name), entry.isDirectory() ? "dir" : "file");
  }
  const workspaceScope = resolve(target, "@useprism");
  await mkdir(workspaceScope, { mode: 0o700 });
  for (const directory of ["cli", "provider-codex", "provider-ollama", "runtime", "sdk"]) {
    await symlink(resolve(checkout, "packages", directory), resolve(workspaceScope, directory), "dir");
  }
}

async function main() {
  const output = parseArguments(process.argv.slice(2));
  if (output === undefined) return;
  const root = process.cwd();
  if (run("git", ["status", "--porcelain"], { cwd: root }).trim() !== "") fail("source-dirty");
  const node = process.version;
  const expectedNode = (await import("node:fs/promises")).readFile(resolve(root, ".node-version"), "utf8");
  if (node !== `v${(await expectedNode).trim()}` || run("npm", ["--version"], { cwd: root }).trim() !== "11.19.0") fail("toolchain-mismatch");
  const sourceCommit = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const temporary = await mkdtemp(join(tmpdir(), "prism-preview-pack-"));
  await chmod(temporary, 0o700);
  const checkout = resolve(temporary, "checkout");
  const tarballRoot = resolve(temporary, "tarballs");
  let checkoutAdded = false;
  let cleanupFailed = false;
  try {
    run("git", ["worktree", "add", "--detach", checkout, sourceCommit], { cwd: root });
    checkoutAdded = true;
    await mkdir(tarballRoot, { mode: 0o700 });
    if (run("git", ["rev-parse", "HEAD"], { cwd: checkout }).trim() !== sourceCommit
      || run("git", ["status", "--porcelain"], { cwd: checkout }).trim() !== "") fail("source-dirty");
    await linkBuildDependencies(root, checkout);
    run("npm", ["run", "build:packages"], { cwd: checkout });
    if (run("git", ["status", "--porcelain"], { cwd: checkout }).trim() !== "") fail("source-dirty");
    const artifacts = [];
    for (const entry of developerPreview.PACKAGES) {
      const directory = entry.name.split("/")[1];
      const packageRoot = resolve(checkout, "packages", directory);
      const cwd = await stageBundledPackageForPack({
        packageRoot,
        dependencyRoot: resolve(root, "node_modules"),
        stagingRoot: resolve(checkout, ".prism-pack-staging", directory),
      });
      const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot], { cwd }));
      assertPackList(packed, entry);
      artifacts.push({ ...entry, sourcePath: resolve(tarballRoot, entry.file) });
    }
    await assembleDeveloperPreviewCandidate({ repositoryRoot: checkout, outputPath: output, sourceCommit, packageArtifacts: artifacts });
  } finally {
    if (checkoutAdded) {
      try {
        run("git", ["worktree", "remove", "--force", checkout], { cwd: root });
      } catch {
        cleanupFailed = true;
      }
    }
    await rm(temporary, { recursive: true, force: true });
    if (cleanupFailed) {
      try {
        run("git", ["worktree", "prune"], { cwd: root });
      } catch {
        // The bounded cleanup failure below remains authoritative.
      }
      fail("cleanup-failed");
    }
  }
  process.stdout.write("Prism developer-preview candidate: ok\n");
}

main().catch((error) => {
  process.stderr.write(`Prism preview pack failed: ${error instanceof Error ? error.message : "tooling-failed"}\n`);
  process.exitCode = 1;
});
