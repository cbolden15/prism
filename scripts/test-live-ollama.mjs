import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  assertPinnedToolchain,
  classifyLiveDoctorFailure,
  completeLiveAttempt,
  developerPreview,
  liveAcceptanceInputDigest,
  reserveLiveAttempt,
  validateLiveEvidencePath,
} from "./release/developer-preview-contract.mjs";

if (process.env.PRISM_LIVE_OLLAMA !== "1") {
  throw new Error("Set PRISM_LIVE_OLLAMA=1 to run the opt-in live Ollama acceptance.");
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const binary = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");
const endpoint = "http://127.0.0.1:11434";
const model = "qwen2.5:14b";
const fixture = resolve(repositoryRoot, "tests", "fixtures", "ollama-live", "LIVE_FIXTURE.md");
const expectedFact = resolve(repositoryRoot, "tests", "fixtures", "ollama-live", "EXPECTED_FACT.txt");
const ledgerPath = resolve(repositoryRoot, "docs", "ai", "workstreams", "20260830-prism-phase-5-onboarding-release-143e51", "LIVE_ATTEMPT.json");
const arguments_ = process.argv.slice(2);
if (arguments_.length !== 2 || arguments_[0] !== "--write-evidence" || arguments_[1].startsWith("-")) {
  throw new Error("Usage: PRISM_LIVE_OLLAMA=1 node scripts/test-live-ollama.mjs --write-evidence <path>");
}
const evidencePath = await validateLiveEvidencePath({
  repositoryRoot,
  evidencePath: resolve(arguments_[1]),
});
try {
  const metadata = lstatSync(evidencePath);
  if (metadata.isSymbolicLink()) throw new Error("Evidence path must not be a symlink.");
  throw new Error("Evidence path already exists.");
} catch (error) {
  if (error && error.code !== "ENOENT") throw error;
}

const expectedNodeVersion = readFileSync(resolve(repositoryRoot, ".node-version"), "utf8").trim();
const npmVersion = spawnSync("npm", ["--version"], {
  encoding: "utf8",
  timeout: 10_000,
  stdio: ["ignore", "pipe", "pipe"],
});
if (npmVersion.error !== undefined || npmVersion.status !== 0) throw new Error("toolchain-mismatch");
assertPinnedToolchain({
  nodeVersion: process.version,
  npmVersion: npmVersion.stdout.trim(),
  expectedNodeVersion,
});

function now() {
  return new Date().toISOString();
}

function execute(arguments_, options) {
  const result = spawnSync(process.execPath, [binary, ...arguments_], {
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

function run(arguments_, options) {
  const result = execute(arguments_, options);
  if (result.status !== 0) throw new Error("provider-command-failed");
  return result;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid-command-json");
  }
}

const root = mkdtempSync(resolve(tmpdir(), "prism-live-ollama-"));
let attemptReserved = false;
let resultClass = "tooling-failed";
try {
  await reserveLiveAttempt({
    ledgerPath,
    workstream: "20260830-prism-phase-5-onboarding-release-143e51",
    model,
    startedAt: now(),
  });
  attemptReserved = true;
  const workspace = resolve(root, "workspace");
  const home = resolve(root, "home");
  const config = resolve(root, "config");
  const state = resolve(root, "state");
  for (const directory of [workspace, home, config, state]) mkdirSync(directory, { recursive: true });
  const match = readFileSync(expectedFact, "utf8").trim().match(/^([a-z0-9-]+) in ([A-Za-z0-9._-]+)$/u);
  assert.ok(match, "expected fact has an invalid bounded format");
  const [, codename, filename] = match;
  assert.equal(readFileSync(fixture, "utf8").includes(codename), true);
  copyFileSync(fixture, resolve(workspace, "LIVE_FIXTURE.md"));
  const environment = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_STATE_HOME: state,
  };
  const options = { cwd: workspace, env: environment };

  run([
    "init",
    "--provider",
    "ollama",
    "--model",
    model,
    "--endpoint",
    endpoint,
    "--scope",
    "project",
    "--yes",
  ], options);
  resultClass = "doctor-failed";
  const doctorResult = execute(["doctor", "--json"], options);
  if (doctorResult.status !== 0) {
    resultClass = classifyLiveDoctorFailure(doctorResult.stdout);
    throw new Error("doctor-command-failed");
  }
  const doctor = parseJson(doctorResult.stdout);
  assert.equal(doctor.status, "ok");
  assert.equal(doctor.provider, "ollama");

  const goal = "Use the repository tool to find the live acceptance codename in LIVE_FIXTURE.md. Return the codename and filename.";
  resultClass = "provider-failed";
  const execution = parseJson(run(["run", "--json", goal], options).stdout);
  resultClass = "acceptance-failed";
  assert.equal(execution.status, "completed");
  assert.equal(execution.provider, "ollama");
  assert.equal(execution.model, model);
  assert.equal(execution.answer.includes(codename), true);
  assert.equal(execution.answer.includes(filename), true);

  const inspection = run(["inspect", "--json", execution.runId], options);
  const record = parseJson(inspection.stdout);
  assert.equal(record.version, "prism-run-record-v2");
  assert.equal(
    record.terminal.answer === execution.answer,
    true,
    "inspection answer did not match the run result",
  );
  assert.equal(record.trace.some((entry) => (
    entry.tool === "repository"
    && (entry.operation === "read" || entry.operation === "search")
    && entry.output.paths.includes(filename)
  )), true);
  assert.equal(JSON.stringify(record.trace).includes(codename), false);
  const evidence = {
    version: "prism-live-ollama-evidence-v1",
    fixtureSha256: developerPreview.digest(readFileSync(fixture)),
    expectedFactSha256: developerPreview.digest(readFileSync(expectedFact)),
    acceptanceScriptSha256: developerPreview.digest(readFileSync(resolve(repositoryRoot, "scripts", "test-live-ollama.mjs"))),
    acceptanceInputSha256: await liveAcceptanceInputDigest({ repositoryRoot }),
    model,
    result: "passed",
    recordedAt: now(),
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, developerPreview.canonicalJson(evidence), { encoding: "utf8", flag: "wx", mode: 0o600 });
  resultClass = "passed";
} finally {
  try {
    if (attemptReserved) await completeLiveAttempt({
      ledgerPath,
      result: resultClass,
      finishedAt: now(),
      ...(resultClass === "passed" ? { evidencePath } : {}),
    });
  } finally {
    if (process.env.PRISM_KEEP_LIVE_OLLAMA !== "1") rmSync(root, { recursive: true, force: true });
  }
}
process.stdout.write("live Ollama evidence recorded\n");
