import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

export const WORKSTREAM = "20260830-prism-phase-5-onboarding-release-143e51";
export const MODEL = "qwen2.5:14b";
export const VERSION = "0.1.0";
export const LIVE_EVIDENCE_PATH = "docs/releases/developer-preview/ollama-live-evidence.json";

const MARKDOWN_DOCUMENTS = Object.freeze([
  "README.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/README.md",
  "docs/architecture/README.md",
  "docs/assurance/README.md",
  "docs/developer-preview/command-reference.md",
  "docs/developer-preview/compatibility.md",
  "docs/developer-preview/concepts.md",
  "docs/developer-preview/data-and-trust.md",
  "docs/developer-preview/diagnostics.md",
  "docs/developer-preview/getting-started.md",
  "docs/developer-preview/plugin-authoring.md",
  "docs/releases/developer-preview/README.md",
  "examples/README.md",
  "examples/deterministic/README.md",
  "examples/failures/README.md",
  "examples/ollama/README.md",
  "examples/project-plugin/README.md",
  "examples/project-plugin/release-slug/README.md",
  "examples/runtime-api/README.md",
  "packages/cli/README.md",
  "packages/provider-ollama/README.md",
  "packages/runtime/README.md",
  "packages/sdk/README.md",
]);

const CANDIDATE_ASSETS = Object.freeze([
  "docs/architecture/diagrams/assurance-lanes.mmd",
  "docs/architecture/diagrams/bounded-run.mmd",
  "docs/architecture/diagrams/local-data-and-evidence.mmd",
  "docs/architecture/diagrams/plugin-admission.mmd",
  "docs/architecture/diagrams/system-and-packages.mmd",
  "examples/failures/policy-denied.mjs",
  "examples/project-plugin/release-slug/index.mjs",
  "examples/project-plugin/release-slug/index.test.mjs",
  "examples/project-plugin/release-slug/manifest.json",
  "examples/runtime-api/run.mjs",
]);

const DOCUMENTS = Object.freeze([
  "LICENSE",
  "NOTICE",
  ...MARKDOWN_DOCUMENTS,
  ...CANDIDATE_ASSETS,
  "THIRD_PARTY_NOTICES.md",
].sort());

const PACKAGES = Object.freeze([
  { name: "@useprism/cli", version: VERSION, file: "useprism-cli-0.1.0.tgz" },
  { name: "@useprism/provider-ollama", version: VERSION, file: "useprism-provider-ollama-0.1.0.tgz" },
  { name: "@useprism/runtime", version: VERSION, file: "useprism-runtime-0.1.0.tgz" },
  { name: "@useprism/sdk", version: VERSION, file: "useprism-sdk-0.1.0.tgz" },
]);
const CANDIDATE_FILES = Object.freeze([
  ...DOCUMENTS,
  ...PACKAGES.map(({ file }) => `packages/${file}`),
  "SHA256SUMS",
  "candidate.json",
].sort());
const DIGEST = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const LIVE_ACCEPTANCE_ROOTS = Object.freeze([
  "packages/cli/package.json",
  "packages/cli/src",
  "packages/cli/dist",
  "packages/provider-ollama/package.json",
  "packages/provider-ollama/src",
  "packages/provider-ollama/dist",
  "packages/runtime/package.json",
  "packages/runtime/src",
  "packages/runtime/dist",
  "packages/sdk/package.json",
  "packages/sdk/src",
  "packages/sdk/dist",
].sort());

function fail(reason) {
  throw new Error(reason);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function validIso(value) {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function parseCanonical(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("invalid-json");
  }
  if (canonicalJson(value) !== text) fail("non-canonical-json");
  return value;
}

function samePackageShape(entry, expected) {
  return exactKeys(entry, ["name", "version", "file", "sha256"])
    && entry.name === expected.name
    && entry.version === expected.version
    && entry.file === expected.file
    && typeof entry.sha256 === "string"
    && DIGEST.test(entry.sha256);
}

export function parseCandidateManifest(text) {
  const value = parseCanonical(text);
  if (!exactKeys(value, ["version", "sourceCommit", "node", "npm", "packages", "documents"])
    || value.version !== "prism-developer-preview-candidate-v1"
    || typeof value.sourceCommit !== "string" || !COMMIT.test(value.sourceCommit)
    || value.node !== "26.8.1" || value.npm !== "11.19.0"
    || !Array.isArray(value.packages) || value.packages.length !== PACKAGES.length
    || !Array.isArray(value.documents) || value.documents.length !== DOCUMENTS.length) fail("invalid-candidate-manifest");
  for (const [index, expected] of PACKAGES.entries()) {
    if (!samePackageShape(value.packages[index], expected)) fail("invalid-candidate-package");
  }
  for (const [index, file] of DOCUMENTS.entries()) {
    const entry = value.documents[index];
    if (!exactKeys(entry, ["file", "sha256"]) || entry.file !== file
      || typeof entry.sha256 !== "string" || !DIGEST.test(entry.sha256)) fail("invalid-candidate-document");
  }
  return deepFreeze(value);
}

export function parseLiveEvidence(text) {
  const value = parseCanonical(text);
  if (!exactKeys(value, [
    "version", "fixtureSha256", "expectedFactSha256", "acceptanceScriptSha256",
    "acceptanceInputSha256", "model", "result", "recordedAt",
  ]) || value.version !== "prism-live-ollama-evidence-v1"
    || value.model !== MODEL || value.result !== "passed" || !validIso(value.recordedAt)
    || ![
      value.fixtureSha256,
      value.expectedFactSha256,
      value.acceptanceScriptSha256,
      value.acceptanceInputSha256,
    ]
      .every((entry) => typeof entry === "string" && DIGEST.test(entry))) fail("invalid-live-evidence");
  return deepFreeze(value);
}

export function assertPinnedToolchain(input) {
  if (input.nodeVersion !== `v${input.expectedNodeVersion}` || input.npmVersion !== "11.19.0") {
    fail("toolchain-mismatch");
  }
}

export function classifyLiveDoctorFailure(stdout) {
  try {
    const value = JSON.parse(stdout);
    if (isPlainObject(value)
      && value.status === "failed"
      && value.provider === "ollama"
      && value.error === `model not found; run ollama pull ${MODEL}`) {
      return "model-missing";
    }
  } catch {
    // A malformed diagnostic is still one bounded doctor failure.
  }
  return "doctor-failed";
}

async function collectRegularFiles(root, path, files) {
  const absolute = resolve(root, path);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) fail("unsafe-live-acceptance-input");
  if (metadata.isFile()) {
    files.push(path.split(sep).join("/"));
    return;
  }
  if (!metadata.isDirectory()) fail("unsafe-live-acceptance-input");
  for (const entry of (await readdir(absolute)).sort()) {
    await collectRegularFiles(root, join(path, entry), files);
  }
}

export async function liveAcceptanceInputDigest(input) {
  const root = await realpath(resolve(input.repositoryRoot));
  const files = [];
  for (const path of LIVE_ACCEPTANCE_ROOTS) await collectRegularFiles(root, path, files);
  files.sort();
  const manifest = await Promise.all(files.map(async (file) => ({
    file,
    sha256: digest(await readFile(resolve(root, file))),
  })));
  return digest(Buffer.from(canonicalJson(manifest), "utf8"));
}

async function assertDirectoryPathWithoutSymlinks(path) {
  const absolute = resolve(path);
  const { root } = parse(absolute);
  let current = root;
  for (const component of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("unsafe-path");
  }
}

export async function validateLiveEvidencePath(input) {
  const root = await realpath(resolve(input.repositoryRoot));
  const evidence = resolve(input.evidencePath);
  const expected = resolve(root, LIVE_EVIDENCE_PATH);
  if (evidence !== expected) fail("invalid-live-evidence-path");
  await assertDirectoryPathWithoutSymlinks(dirname(evidence));
  return evidence;
}

export function parseLiveAttemptLedger(text) {
  const value = parseCanonical(text);
  if (!exactKeys(value, [
    "version", "workstream", "ordinal", "model", "startedAt", "finishedAt", "result", "evidenceSha256",
  ]) || value.version !== "prism-phase-5-live-attempt-v1" || value.workstream !== WORKSTREAM
    || value.ordinal !== 1 || value.model !== MODEL || !validIso(value.startedAt)
    || !["started", "passed", "model-missing", "doctor-failed", "provider-failed", "acceptance-failed", "tooling-failed"].includes(value.result)) {
    fail("invalid-live-attempt");
  }
  const initial = value.result === "started";
  if (initial ? value.finishedAt !== null || value.evidenceSha256 !== null
    : !validIso(value.finishedAt) || (value.result === "passed"
      ? typeof value.evidenceSha256 !== "string" || !DIGEST.test(value.evidenceSha256)
      : value.evidenceSha256 !== null)) fail("invalid-live-attempt-transition");
  return deepFreeze(value);
}

async function readCanonical(path, parser) {
  return parser(await readFile(path, "utf8"));
}

export async function validateLiveReleaseEvidence(input) {
  const evidenceBytes = await readFile(input.evidencePath, "utf8");
  const evidence = parseLiveEvidence(evidenceBytes);
  const ledger = await readCanonical(input.ledgerPath, parseLiveAttemptLedger);
  if (ledger.result !== "passed" || ledger.evidenceSha256 !== digest(evidenceBytes)) fail("live-evidence-ledger-mismatch");
  const [fixture, expectedFact, acceptanceScript, acceptanceInputSha256] = await Promise.all([
    readFile(input.fixturePath), readFile(input.expectedFactPath), readFile(input.acceptanceScriptPath),
    liveAcceptanceInputDigest({ repositoryRoot: input.repositoryRoot }),
  ]);
  if (evidence.fixtureSha256 !== digest(fixture)
    || evidence.expectedFactSha256 !== digest(expectedFact)
    || evidence.acceptanceScriptSha256 !== digest(acceptanceScript)
    || evidence.acceptanceInputSha256 !== acceptanceInputSha256) fail("stale-live-evidence");
  return evidence;
}

export async function reserveLiveAttempt(input) {
  if (input.workstream !== WORKSTREAM || input.model !== MODEL || !validIso(input.startedAt)) fail("invalid-live-attempt-input");
  const ledger = {
    version: "prism-phase-5-live-attempt-v1",
    workstream: WORKSTREAM,
    ordinal: 1,
    model: MODEL,
    startedAt: input.startedAt,
    finishedAt: null,
    result: "started",
    evidenceSha256: null,
  };
  await mkdir(dirname(input.ledgerPath), { recursive: true });
  try {
    await writeFile(input.ledgerPath, canonicalJson(ledger), { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error && error.code === "EEXIST") fail("live-attempt-consumed");
    throw error;
  }
  return deepFreeze(ledger);
}

export async function completeLiveAttempt(input) {
  if (!validIso(input.finishedAt) || input.result === "started"
    || !["passed", "model-missing", "doctor-failed", "provider-failed", "acceptance-failed", "tooling-failed"].includes(input.result)) fail("invalid-live-attempt-input");
  const current = await readCanonical(input.ledgerPath, parseLiveAttemptLedger);
  if (current.result !== "started" || current.finishedAt !== null || current.evidenceSha256 !== null) fail("live-attempt-already-complete");
  let evidenceSha256 = null;
  if (input.result === "passed") {
    if (typeof input.evidencePath !== "string") fail("missing-live-evidence");
    evidenceSha256 = digest(await readFile(input.evidencePath, "utf8"));
  }
  const completed = {
    ...current,
    finishedAt: input.finishedAt,
    result: input.result,
    evidenceSha256,
  };
  const temporary = `${input.ledgerPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, canonicalJson(completed), { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, input.ledgerPath);
  } finally {
    await rm(temporary, { force: true });
  }
  return deepFreeze(completed);
}

async function regularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("unsafe-file");
}

async function relativeFiles(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(root)).sort()) {
    const file = join(root, entry);
    const name = prefix === "" ? entry : `${prefix}/${entry}`;
    const metadata = await lstat(file);
    if (metadata.isSymbolicLink()) fail("candidate-symlink");
    if (metadata.isDirectory()) files.push(...await relativeFiles(file, name));
    else if (metadata.isFile()) files.push(name);
    else fail("candidate-special-file");
  }
  return files.sort();
}

function equalLists(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function ensureUnoccupied(path) {
  try {
    await lstat(path);
    fail("output-exists");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function removeIfIdentical(path, identity, recursive) {
  try {
    const current = await lstat(path);
    if (!sameIdentity(current, identity)) return;
    await rm(path, { recursive, force: true });
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

export async function resolveSafeOutputPath(outputPath) {
  const output = resolve(outputPath);
  await assertDirectoryPathWithoutSymlinks(dirname(output));
  return output;
}

export async function publishDirectoryNoReplace(stage, output, hooks = {}) {
  const stageIdentity = await lstat(stage);
  if (stageIdentity.isSymbolicLink() || !stageIdentity.isDirectory()) fail("unsafe-stage");
  const helperRoot = await mkdtemp(join(tmpdir(), "prism-rename-no-replace-"));
  const helper = resolve(helperRoot, "rename-no-replace");
  try {
    const compilation = spawnSync("cc", [
      "-std=c11",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      resolve(import.meta.dirname, "rename-no-replace.c"),
      "-o",
      helper,
    ], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (compilation.error !== undefined || compilation.status !== 0) {
      fail("no-replace-helper-unavailable");
    }
    if (typeof hooks.afterHelperReady === "function") {
      await hooks.afterHelperReady();
    }
    const publication = spawnSync(helper, [stage, output], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (publication.error !== undefined) fail("publication-failed");
    if (publication.status === 3) fail("output-exists");
    if (publication.status !== 0) fail("publication-failed");
    const published = await lstat(output);
    if (!sameIdentity(published, stageIdentity)
      || published.isSymbolicLink() || !published.isDirectory()) fail("publication-failed");
  } finally {
    await rm(helperRoot, { recursive: true, force: true });
  }
}

export async function assembleDeveloperPreviewCandidate(input) {
  const root = await realpath(resolve(input.repositoryRoot));
  const output = await resolveSafeOutputPath(input.outputPath);
  if (!COMMIT.test(input.sourceCommit) || relative(root, output) === "") fail("invalid-candidate-input");
  await ensureUnoccupied(output);
  const parent = dirname(output);
  const parentMetadata = await lstat(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) fail("unsafe-output-parent");
  if (!Array.isArray(input.packageArtifacts) || input.packageArtifacts.length !== PACKAGES.length) fail("invalid-package-artifacts");
  for (const [index, expected] of PACKAGES.entries()) {
    const artifact = input.packageArtifacts[index];
    if (!artifact || artifact.name !== expected.name || artifact.version !== expected.version || artifact.file !== expected.file) fail("invalid-package-artifact");
    await regularFile(artifact.sourcePath);
  }
  const lock = `${output}.lock`;
  let lockIdentity;
  try {
    await writeFile(lock, "", { flag: "wx", mode: 0o600 });
    lockIdentity = await lstat(lock);
  } catch (error) {
    if (error && error.code === "EEXIST") fail("output-exists");
    throw error;
  }
  let stage;
  let stageIdentity;
  try {
    stage = await mkdtemp(join(parent, ".prism-preview-stage-"));
    stageIdentity = await lstat(stage);
    for (const file of DOCUMENTS) {
      const source = resolve(root, file);
      if (relative(root, source).startsWith(`..${sep}`)) fail("unsafe-document-path");
      await regularFile(source);
      const destination = resolve(stage, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination, 0);
    }
    for (const artifact of input.packageArtifacts) {
      const destination = resolve(stage, "packages", artifact.file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(artifact.sourcePath, destination, 0);
    }
    const manifest = {
      version: "prism-developer-preview-candidate-v1",
      sourceCommit: input.sourceCommit,
      node: "26.8.1",
      npm: "11.19.0",
      packages: await Promise.all(PACKAGES.map(async (entry) => ({
        ...entry,
        sha256: digest(await readFile(resolve(stage, "packages", entry.file))),
      }))),
      documents: await Promise.all(DOCUMENTS.map(async (file) => ({
        file,
        sha256: digest(await readFile(resolve(stage, file))),
      }))),
    };
    await writeFile(resolve(stage, "candidate.json"), canonicalJson(manifest), { encoding: "utf8", mode: 0o600 });
    const covered = CANDIDATE_FILES.filter((file) => file !== "SHA256SUMS");
    const checksums = `${(await Promise.all(covered.map(async (file) => (
      `${digest(await readFile(resolve(stage, file)))}  ${file}`
    )))).join("\n")}\n`;
    await writeFile(resolve(stage, "SHA256SUMS"), checksums, { encoding: "utf8", mode: 0o600 });
    await ensureUnoccupied(output);
    await publishDirectoryNoReplace(stage, output);
    stage = undefined;
    stageIdentity = undefined;
  } finally {
    if (stage !== undefined && stageIdentity !== undefined) {
      await removeIfIdentical(stage, stageIdentity, true);
    }
    if (lockIdentity !== undefined) await removeIfIdentical(lock, lockIdentity, false);
  }
}

export async function validateDeveloperPreviewCandidate(input) {
  const root = resolve(input.candidateRoot);
  const manifest = parseCandidateManifest(await readFile(resolve(root, "candidate.json"), "utf8"));
  if (manifest.sourceCommit !== input.sourceCommit) fail("candidate-source-commit-mismatch");
  if (!equalLists(await relativeFiles(root), CANDIDATE_FILES)) fail("candidate-file-set-mismatch");
  for (const entry of manifest.packages) {
    if (digest(await readFile(resolve(root, "packages", entry.file))) !== entry.sha256) fail("candidate-package-digest-mismatch");
  }
  for (const entry of manifest.documents) {
    if (digest(await readFile(resolve(root, entry.file))) !== entry.sha256) fail("candidate-document-digest-mismatch");
  }
  const covered = CANDIDATE_FILES.filter((file) => file !== "SHA256SUMS");
  const expected = `${(await Promise.all(covered.map(async (file) => (
    `${digest(await readFile(resolve(root, file)))}  ${file}`
  )))).join("\n")}\n`;
  if (await readFile(resolve(root, "SHA256SUMS"), "utf8") !== expected) fail("candidate-checksum-mismatch");
  return manifest;
}

export const developerPreview = Object.freeze({
  MARKDOWN_DOCUMENTS,
  CANDIDATE_ASSETS,
  DOCUMENTS,
  PACKAGES,
  CANDIDATE_FILES,
  LIVE_ACCEPTANCE_ROOTS,
  canonicalJson,
  digest,
});
