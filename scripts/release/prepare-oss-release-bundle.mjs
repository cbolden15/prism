import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDeveloperPreviewCandidate } from "./developer-preview-contract.mjs";

const VERSION = "prism-oss-release-bundle-v1";
const COMMIT = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const MANIFEST_FILE = "release-bundle.json";
const SBOM_FILE = "prism-0.1.0.spdx.json";
const LICENSE_REPORT_FILE = "prism-0.1.0-licenses.json";

function fail(code) {
  throw new Error(code);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function equalLists(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function collectRegularFiles(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(resolve(root, prefix))).sort()) {
    const path = prefix === "" ? entry : `${prefix}/${entry}`;
    const metadata = await lstat(resolve(root, path));
    if (metadata.isSymbolicLink()) fail("release-bundle-symlink");
    if (metadata.isDirectory()) files.push(...await collectRegularFiles(root, path));
    else if (metadata.isFile()) files.push(path.split(sep).join("/"));
    else fail("release-bundle-special-file");
  }
  return files.sort();
}

async function assertRegularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("release-bundle-input-unsafe");
}

function parseManifest(text, sourceCommit) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("release-bundle-manifest-invalid");
  }
  if (canonicalJson(value) !== text
    || !hasExactKeys(value, ["version", "sourceCommit", "files"])
    || value.version !== VERSION
    || value.sourceCommit !== sourceCommit
    || !COMMIT.test(value.sourceCommit)
    || !Array.isArray(value.files)) fail("release-bundle-manifest-invalid");
  const paths = [];
  for (const entry of value.files) {
    if (!hasExactKeys(entry, ["path", "sha256"])
      || typeof entry.path !== "string"
      || !(entry.path.startsWith("candidate/")
        || entry.path === SBOM_FILE
        || entry.path === LICENSE_REPORT_FILE)
      || typeof entry.sha256 !== "string"
      || !DIGEST.test(entry.sha256)) fail("release-bundle-manifest-invalid");
    paths.push(entry.path);
  }
  const sorted = [...paths].sort();
  if (!equalLists(paths, sorted)
    || new Set(paths).size !== paths.length
    || !paths.includes(SBOM_FILE)
    || !paths.includes(LICENSE_REPORT_FILE)) fail("release-bundle-manifest-invalid");
  return Object.freeze({
    version: value.version,
    sourceCommit: value.sourceCommit,
    files: Object.freeze(value.files.map((entry) => Object.freeze({ ...entry }))),
  });
}

export async function createReleaseBundle(input) {
  if (!COMMIT.test(input.sourceCommit)) fail("release-bundle-source-commit-invalid");
  const validateCandidate = input.validateCandidate ?? validateDeveloperPreviewCandidate;
  const candidateRoot = await realpath(resolve(input.candidateRoot));
  const sbomPath = resolve(input.sbomPath);
  const licenseReportPath = resolve(input.licenseReportPath);
  await validateCandidate({ candidateRoot, sourceCommit: input.sourceCommit });
  await Promise.all([assertRegularFile(sbomPath), assertRegularFile(licenseReportPath)]);

  const outputParent = await realpath(dirname(resolve(input.outputPath)));
  const output = resolve(outputParent, relative(outputParent, resolve(input.outputPath)));
  let created = false;
  try {
    await mkdir(output, { mode: 0o700 });
    created = true;
    const candidateFiles = await collectRegularFiles(candidateRoot);
    for (const path of candidateFiles) {
      const destination = resolve(output, "candidate", path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(candidateRoot, path), destination, 0);
    }
    await copyFile(sbomPath, resolve(output, SBOM_FILE), 0);
    await copyFile(licenseReportPath, resolve(output, LICENSE_REPORT_FILE), 0);
    await validateCandidate({
      candidateRoot: resolve(output, "candidate"),
      sourceCommit: input.sourceCommit,
    });
    const payloadFiles = await collectRegularFiles(output);
    const manifest = Object.freeze({
      version: VERSION,
      sourceCommit: input.sourceCommit,
      files: Object.freeze(await Promise.all(payloadFiles.map(async (path) => Object.freeze({
        path,
        sha256: sha256(await readFile(resolve(output, path))),
      })))),
    });
    await writeFile(resolve(output, MANIFEST_FILE), canonicalJson(manifest), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return manifest;
  } catch (error) {
    if (created) await rm(output, { recursive: true, force: true });
    if (error && error.code === "EEXIST") fail("release-bundle-output-exists");
    throw error;
  }
}

export async function verifyReleaseBundle(input) {
  if (!COMMIT.test(input.sourceCommit)) fail("release-bundle-source-commit-invalid");
  const requestedRoot = resolve(input.bundleRoot);
  const rootMetadata = await lstat(requestedRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) fail("release-bundle-root-unsafe");
  const root = await realpath(requestedRoot);
  await assertRegularFile(resolve(root, MANIFEST_FILE));
  const manifest = parseManifest(
    await readFile(resolve(root, MANIFEST_FILE), "utf8"),
    input.sourceCommit,
  );
  const actualFiles = await collectRegularFiles(root);
  const expectedFiles = [...manifest.files.map(({ path }) => path), MANIFEST_FILE].sort();
  if (!equalLists(actualFiles, expectedFiles)) fail("release-bundle-file-set-mismatch");
  for (const entry of manifest.files) {
    if (sha256(await readFile(resolve(root, entry.path))) !== entry.sha256) {
      fail(`release-bundle-digest-mismatch:${entry.path}`);
    }
  }
  const validateCandidate = input.validateCandidate ?? validateDeveloperPreviewCandidate;
  await validateCandidate({
    candidateRoot: resolve(root, "candidate"),
    sourceCommit: input.sourceCommit,
  });
  return manifest;
}

function parsePairs(arguments_, required) {
  if (arguments_.length !== required.length * 2) fail("invalid-arguments");
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!required.includes(key) || values.has(key) || typeof value !== "string" || value === "") {
      fail("invalid-arguments");
    }
    values.set(key, value);
  }
  return values;
}

async function main() {
  if (process.version !== "v26.8.1") fail("node-version-mismatch");
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "create") {
    const values = parsePairs(arguments_, [
      "--candidate",
      "--sbom",
      "--license-report",
      "--output",
      "--source-commit",
    ]);
    await createReleaseBundle({
      candidateRoot: values.get("--candidate"),
      sbomPath: values.get("--sbom"),
      licenseReportPath: values.get("--license-report"),
      outputPath: values.get("--output"),
      sourceCommit: values.get("--source-commit"),
    });
  } else if (command === "verify") {
    const values = parsePairs(arguments_, ["--bundle", "--source-commit"]);
    await verifyReleaseBundle({
      bundleRoot: values.get("--bundle"),
      sourceCommit: values.get("--source-commit"),
    });
  } else {
    fail("invalid-arguments");
  }
  process.stdout.write("Prism OSS release artifact: ok\n");
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Prism OSS release artifact failed: ${error instanceof Error ? error.message : "artifact-failed"}\n`);
    process.exitCode = 1;
  });
}
