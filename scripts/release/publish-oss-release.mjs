import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDeveloperPreviewCandidate } from "./developer-preview-contract.mjs";
import {
  assertReleaseIdentity,
  orderCandidatePackages,
} from "./oss-release-contract.mjs";

const NPM_REGISTRY = "https://registry.npmjs.org";
const COMMIT = /^[0-9a-f]{40}$/u;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;

function fail(code) {
  throw new Error(code);
}

function defaultRunNpm(arguments_) {
  return spawnSync("npm", arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseRegistryIntegrity(result, name) {
  if (result?.error) fail(`registry-query-failed:${name}`);
  if (result?.status !== 0) {
    if (/\bE404\b/u.test(`${result?.stdout ?? ""}\n${result?.stderr ?? ""}`)) return null;
    fail(`registry-query-failed:${name}`);
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    fail(`registry-response-invalid:${name}`);
  }
  if (typeof value !== "string" || !INTEGRITY.test(value)) {
    fail(`registry-response-invalid:${name}`);
  }
  return value;
}

export async function readCandidateTarballs(candidateRoot, packages) {
  const root = await realpath(resolve(candidateRoot));
  const ordered = orderCandidatePackages(packages);
  return Promise.all(ordered.map(async (entry) => {
    const path = resolve(root, "packages", entry.file);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fail(`candidate-package-unsafe:${entry.name}`);
    }
    const bytes = await readFile(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) fail(`candidate-package-digest-mismatch:${entry.name}`);
    return Object.freeze({
      ...entry,
      path,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }));
}

export async function publishCandidatePackages(input) {
  const runNpm = input.runNpm ?? defaultRunNpm;
  const tarballs = await readCandidateTarballs(input.candidateRoot, input.packages);

  const registryStates = [];
  for (const tarball of tarballs) {
    const publishedIntegrity = parseRegistryIntegrity(runNpm([
      "view",
      "--json",
      `${tarball.name}@${tarball.version}`,
      "dist.integrity",
      "--registry",
      NPM_REGISTRY,
    ]), tarball.name);
    if (publishedIntegrity !== null && publishedIntegrity !== tarball.integrity) {
      fail(`published-integrity-mismatch:${tarball.name}`);
    }
    registryStates.push({ tarball, publishedIntegrity });
  }

  const results = [];
  for (const { tarball, publishedIntegrity } of registryStates) {
    if (publishedIntegrity !== null) {
      results.push(Object.freeze({ name: tarball.name, status: "already-published" }));
      continue;
    }
    const result = runNpm([
      "publish",
      tarball.path,
      "--access",
      "public",
      "--tag",
      "next",
      "--provenance",
      "--ignore-scripts",
      "--registry",
      NPM_REGISTRY,
    ]);
    if (result?.error || result?.status !== 0) fail(`publish-failed:${tarball.name}`);
    results.push(Object.freeze({ name: tarball.name, status: "published" }));
  }
  return Object.freeze(results);
}

function parseArguments(arguments_) {
  const allowed = new Set(["--candidate", "--source-commit", "--version", "--tag", "--ref"]);
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
    candidateRoot: resolve(values.get("--candidate")),
    sourceCommit,
    version: values.get("--version"),
    tag: values.get("--tag"),
    ref: values.get("--ref"),
  };
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  assertReleaseIdentity(input);
  await validateDeveloperPreviewCandidate({
    candidateRoot: input.candidateRoot,
    sourceCommit: input.sourceCommit,
  });
  const manifest = JSON.parse(await readFile(resolve(input.candidateRoot, "candidate.json"), "utf8"));
  const results = await publishCandidatePackages({
    candidateRoot: input.candidateRoot,
    packages: manifest.packages,
  });
  for (const result of results) process.stdout.write(`${result.name}: ${result.status}\n`);
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Prism OSS publish failed: ${error instanceof Error ? error.message : "publish-failed"}\n`);
    process.exitCode = 1;
  });
}
