import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertReleaseIdentity, OSS_RELEASE_PACKAGES } from "./oss-release-contract.mjs";

const COMMIT = /^[0-9a-f]{40}$/u;

function fail(code) {
  throw new Error(code);
}

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) fail("release-identity-tooling-failed");
  return result.stdout.trim();
}

function parseArguments(arguments_) {
  const allowed = new Set(["--root", "--version", "--tag", "--ref", "--source-commit"]);
  if (arguments_.length !== allowed.size * 2) fail("invalid-arguments");
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!allowed.has(key) || values.has(key) || typeof value !== "string" || value === "") {
      fail("invalid-arguments");
    }
    values.set(key, value);
  }
  const sourceCommit = values.get("--source-commit");
  if (!COMMIT.test(sourceCommit)) fail("invalid-source-commit");
  return {
    root: resolve(values.get("--root")),
    version: values.get("--version"),
    tag: values.get("--tag"),
    ref: values.get("--ref"),
    sourceCommit,
  };
}

async function assertPackageCoordinates(root) {
  const expected = [
    ...OSS_RELEASE_PACKAGES.map((entry) => ({ ...entry, private: false })),
    { name: "@useprism/provider-codex", version: "0.1.0", private: true },
  ];
  for (const entry of expected) {
    const directory = entry.name.split("/")[1];
    const manifest = JSON.parse(await readFile(resolve(root, "packages", directory, "package.json"), "utf8"));
    if (
      manifest.name !== entry.name
      || manifest.version !== entry.version
      || (manifest.private === true) !== entry.private
    ) fail(`release-package-coordinate-mismatch:${entry.name}`);
  }
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  assertReleaseIdentity(input);
  if (process.version !== "v26.8.1" || run("npm", ["--version"], input.root) !== "11.19.0") {
    fail("release-toolchain-mismatch");
  }
  if (
    run("git", ["rev-parse", "HEAD"], input.root) !== input.sourceCommit
    || run("git", ["rev-list", "-n", "1", input.tag], input.root) !== input.sourceCommit
    || run("git", ["status", "--porcelain"], input.root) !== ""
  ) fail("release-source-not-exact");
  await assertPackageCoordinates(input.root);
  process.stdout.write("Prism OSS release identity: ok\n");
}

main().catch((error) => {
  process.stderr.write(`Prism OSS release identity failed: ${error instanceof Error ? error.message : "identity-failed"}\n`);
  process.exitCode = 1;
});
