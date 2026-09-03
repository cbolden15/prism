import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  PHASE5_CANDIDATE_DOCUMENTS,
  PHASE5_CANDIDATE_PACKAGES,
  PHASE5_LIVE_ATTEMPT_PATH,
  PHASE5_LIVE_EVIDENCE_PATH,
  PHASE5_MODEL,
  PHASE5_RELEASE_MODULE,
  PHASE5_SOURCE_COMMIT,
  PHASE5_WORKSTREAM,
  canonicalJson,
  sha256,
  type CandidateManifest,
  type LiveAttemptLedger,
  type LiveEvidence,
  type Phase5ReleaseContractModule,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = resolve(repositoryRoot, PHASE5_RELEASE_MODULE);
const fixedStart = "2026-08-30T12:00:00.000Z";
const fixedFinish = "2026-08-30T12:01:00.000Z";

interface SkippableContext {
  skip(message?: string): void;
  after(callback: () => unknown): void;
}

async function loadContract(
  context: SkippableContext,
): Promise<Phase5ReleaseContractModule | undefined> {
  if (!existsSync(modulePath)) {
    context.skip(`awaiting ${PHASE5_RELEASE_MODULE}`);
    return undefined;
  }
  return await import(pathToFileURL(modulePath).href) as Phase5ReleaseContractModule;
}

function digest(character: string): string {
  return character.repeat(64);
}

function evidence(overrides: Partial<LiveEvidence> = {}): LiveEvidence {
  return {
    version: "prism-live-ollama-evidence-v1",
    fixtureSha256: digest("1"),
    expectedFactSha256: digest("2"),
    acceptanceScriptSha256: digest("3"),
    acceptanceInputSha256: digest("4"),
    model: PHASE5_MODEL,
    result: "passed",
    recordedAt: fixedFinish,
    ...overrides,
  };
}

function attempt(overrides: Partial<LiveAttemptLedger> = {}): LiveAttemptLedger {
  return {
    version: "prism-phase-5-live-attempt-v1",
    workstream: PHASE5_WORKSTREAM,
    ordinal: 1,
    model: PHASE5_MODEL,
    startedAt: fixedStart,
    finishedAt: null,
    result: "started",
    evidenceSha256: null,
    ...overrides,
  };
}

function candidateManifest(): CandidateManifest {
  return {
    version: "prism-developer-preview-candidate-v1",
    sourceCommit: PHASE5_SOURCE_COMMIT,
    node: "26.8.1",
    npm: "11.19.0",
    packages: PHASE5_CANDIDATE_PACKAGES.map((entry, index) => ({
      ...entry,
      sha256: String(index + 1).repeat(64),
    })),
    documents: PHASE5_CANDIDATE_DOCUMENTS.map((file, index) => ({
      file,
      sha256: ((index + 5) % 10).toString().repeat(64),
    })),
  };
}

function assertDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

async function writeLiveAcceptanceTree(root: string): Promise<void> {
  for (const directory of ["sdk", "runtime", "provider-ollama", "cli"]) {
    const packageRoot = resolve(root, "packages", directory);
    await mkdir(resolve(packageRoot, "src"), { recursive: true });
    await mkdir(resolve(packageRoot, "dist"), { recursive: true });
    await writeFile(resolve(packageRoot, "package.json"), `{"name":"${directory}"}\n`, "utf8");
    await writeFile(resolve(packageRoot, "src", "index.ts"), `export const source = "${directory}";\n`, "utf8");
    await writeFile(resolve(packageRoot, "dist", "index.js"), `export const built = "${directory}";\n`, "utf8");
  }
}

test("the Phase 5 release-contract module exists at its frozen coordinator-owned path", () => {
  assert.equal(existsSync(modulePath), true, `missing ${PHASE5_RELEASE_MODULE}`);
});

test("the committed live attempt remains consumed and bound to its historical evidence", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const ledgerBytes = await readFile(resolve(repositoryRoot, PHASE5_LIVE_ATTEMPT_PATH), "utf8");
  const evidenceBytes = await readFile(resolve(repositoryRoot, PHASE5_LIVE_EVIDENCE_PATH), "utf8");
  const ledger = contract.parseLiveAttemptLedger(ledgerBytes);

  assert.equal(ledger.result, "passed");
  assert.notEqual(ledger.finishedAt, null);
  assert.equal(ledger.evidenceSha256, sha256(evidenceBytes));
});

test("candidate manifests are canonical, closed, sorted, complete, and deeply frozen", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const expected = candidateManifest();
  const parsed = contract.parseCandidateManifest(canonicalJson(expected));
  assert.deepEqual(parsed, expected);
  assertDeepFrozen(parsed);

  const invalid: unknown[] = [
    { ...expected, version: "prism-developer-preview-candidate-v2" },
    { ...expected, sourceCommit: "A".repeat(40) },
    { ...expected, node: "22.21.0" },
    { ...expected, npm: "10.0.0" },
    { ...expected, packages: expected.packages.slice(1) },
    { ...expected, packages: [...expected.packages].reverse() },
    { ...expected, packages: [...expected.packages, expected.packages[0]] },
    { ...expected, documents: expected.documents.slice(1) },
    { ...expected, documents: [...expected.documents].reverse() },
    { ...expected, extra: true },
  ];
  for (const value of invalid) {
    assert.throws(() => contract.parseCandidateManifest(canonicalJson(value)));
  }
  assert.throws(() => contract.parseCandidateManifest(JSON.stringify(expected)));
});

test("live evidence is canonical, digest-only, schema-closed, and deeply frozen", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const schemaExpected = evidence();
  const parsed = contract.parseLiveEvidence(canonicalJson(schemaExpected));
  assert.deepEqual(parsed, schemaExpected);
  assertDeepFrozen(parsed);

  const invalid: unknown[] = [
    { ...schemaExpected, version: "prism-live-ollama-evidence-v2" },
    { ...schemaExpected, fixtureSha256: "sha256:" + digest("1") },
    { ...schemaExpected, expectedFactSha256: digest("G") },
    { ...schemaExpected, acceptanceScriptSha256: digest("3").slice(1) },
    { ...schemaExpected, acceptanceInputSha256: digest("4").slice(1) },
    { ...schemaExpected, model: "another-model" },
    { ...schemaExpected, result: "failed" },
    { ...schemaExpected, recordedAt: "2026-08-30" },
    { ...schemaExpected, recordedAt: "2026-02-31T12:01:00.000Z" },
    { ...schemaExpected, prompt: "forbidden" },
    { ...schemaExpected, output: "forbidden" },
    { ...schemaExpected, endpoint: "forbidden" },
    { ...schemaExpected, path: "forbidden" },
    { ...schemaExpected, runId: "forbidden" },
    { ...schemaExpected, environment: {} },
  ];
  for (const value of invalid) assert.throws(() => contract.parseLiveEvidence(canonicalJson(value)));
  assert.throws(() => contract.parseLiveEvidence(JSON.stringify(schemaExpected)));

  const root = await mkdtemp(join(tmpdir(), "prism-phase5-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const evidencePath = resolve(root, "ollama-live-evidence.json");
  const ledgerPath = resolve(root, "LIVE_ATTEMPT.json");
  const fixturePath = resolve(root, "LIVE_FIXTURE.md");
  const expectedFactPath = resolve(root, "EXPECTED_FACT.txt");
  const acceptanceScriptPath = resolve(root, "test-live-ollama.mjs");
  const sourceInputs = new Map<string, string>([
    [fixturePath, "The live fixture says cobalt-heron-7319.\n"],
    [expectedFactPath, "cobalt-heron-7319 in LIVE_FIXTURE.md\n"],
    [acceptanceScriptPath, "export const acceptance = true;\n"],
  ]);
  for (const [path, bytes] of sourceInputs) await writeFile(path, bytes, "utf8");
  await writeLiveAcceptanceTree(root);
  const releaseEvidence = evidence({
    fixtureSha256: sha256(sourceInputs.get(fixturePath) as string),
    expectedFactSha256: sha256(sourceInputs.get(expectedFactPath) as string),
    acceptanceScriptSha256: sha256(sourceInputs.get(acceptanceScriptPath) as string),
    acceptanceInputSha256: await contract.liveAcceptanceInputDigest({ repositoryRoot: root }),
  });
  const evidenceBytes = canonicalJson(releaseEvidence);
  const passedLedger = attempt({
    finishedAt: fixedFinish,
    result: "passed",
    evidenceSha256: sha256(evidenceBytes),
  });
  await writeFile(evidencePath, evidenceBytes, "utf8");
  await writeFile(ledgerPath, canonicalJson(passedLedger), "utf8");

  const input = {
    repositoryRoot: root,
    evidencePath,
    ledgerPath,
    fixturePath,
    expectedFactPath,
    acceptanceScriptPath,
  } as const;
  const validated = await contract.validateLiveReleaseEvidence(input);
  assert.deepEqual(validated, releaseEvidence);
  assertDeepFrozen(validated);

  for (const [path, bytes] of sourceInputs) {
    await writeFile(path, `${bytes}stale\n`, "utf8");
    await assert.rejects(contract.validateLiveReleaseEvidence(input));
    await writeFile(path, bytes, "utf8");
  }
  const liveInput = resolve(root, "packages", "cli", "dist", "index.js");
  const liveInputBytes = await readFile(liveInput, "utf8");
  await writeFile(liveInput, `${liveInputBytes}stale\n`, "utf8");
  await assert.rejects(contract.validateLiveReleaseEvidence(input));
  await writeFile(liveInput, liveInputBytes, "utf8");
  await writeFile(ledgerPath, canonicalJson({
    ...passedLedger,
    evidenceSha256: digest("0"),
  }), "utf8");
  await assert.rejects(contract.validateLiveReleaseEvidence(input));
  await writeFile(ledgerPath, canonicalJson(attempt({
    finishedAt: fixedFinish,
    result: "acceptance-failed",
  })), "utf8");
  await assert.rejects(contract.validateLiveReleaseEvidence(input));
  await writeFile(ledgerPath, canonicalJson(passedLedger), "utf8");
  await rm(evidencePath);
  await assert.rejects(contract.validateLiveReleaseEvidence(input));
});

test("the live-attempt ledger accepts only its closed state machine", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const started = attempt();
  assert.deepEqual(contract.parseLiveAttemptLedger(canonicalJson(started)), started);
  const passed = attempt({
    finishedAt: fixedFinish,
    result: "passed",
    evidenceSha256: digest("4"),
  });
  assert.deepEqual(contract.parseLiveAttemptLedger(canonicalJson(passed)), passed);

  const invalid: unknown[] = [
    { ...started, workstream: "another-workstream" },
    { ...started, ordinal: 2 },
    { ...started, model: "another-model" },
    { ...started, result: "passed" },
    { ...started, result: "tooling-failed" },
    { ...started, result: "acceptance-failed", evidenceSha256: digest("4") },
    { ...passed, evidenceSha256: null },
    { ...passed, rawError: "forbidden" },
  ];
  for (const value of invalid) {
    assert.throws(() => contract.parseLiveAttemptLedger(canonicalJson(value)));
  }
});

test("the attempt ledger is consumed before work and refuses concurrent or later starts", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const root = await mkdtemp(join(tmpdir(), "prism-phase5-attempt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = resolve(root, "LIVE_ATTEMPT.json");
  const input = {
    ledgerPath,
    workstream: PHASE5_WORKSTREAM,
    model: PHASE5_MODEL,
    startedAt: fixedStart,
  } as const;

  const results = await Promise.allSettled([
    contract.reserveLiveAttempt(input),
    contract.reserveLiveAttempt(input),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(await readFile(ledgerPath, "utf8"), canonicalJson(attempt()));
  await assert.rejects(contract.reserveLiveAttempt(input));
});

test("terminal ledger updates are atomic, redacted, and evidence-bound", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const root = await mkdtemp(join(tmpdir(), "prism-phase5-complete-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = resolve(root, "LIVE_ATTEMPT.json");
  const evidencePath = resolve(root, "ollama-live-evidence.json");
  await contract.reserveLiveAttempt({
    ledgerPath,
    workstream: PHASE5_WORKSTREAM,
    model: PHASE5_MODEL,
    startedAt: fixedStart,
  });
  const evidenceBytes = canonicalJson(evidence());
  await writeFile(evidencePath, evidenceBytes, "utf8");
  const completed = await contract.completeLiveAttempt({
    ledgerPath,
    result: "passed",
    finishedAt: fixedFinish,
    evidencePath,
  });
  const expected = attempt({
    finishedAt: fixedFinish,
    result: "passed",
    evidenceSha256: sha256(evidenceBytes),
  });
  assert.deepEqual(completed, expected);
  assert.equal(await readFile(ledgerPath, "utf8"), canonicalJson(expected));
  assert.equal((await readFile(ledgerPath, "utf8")).includes(root), false);
  await assert.rejects(contract.completeLiveAttempt({
    ledgerPath,
    result: "tooling-failed",
    finishedAt: fixedFinish,
  }));
});

test("the frozen repository paths separate release evidence from private attempt state", () => {
  assert.equal(PHASE5_LIVE_EVIDENCE_PATH.startsWith("docs/releases/"), true);
  assert.equal(PHASE5_LIVE_ATTEMPT_PATH.startsWith("docs/ai/workstreams/"), true);
  assert.notEqual(PHASE5_LIVE_EVIDENCE_PATH, PHASE5_LIVE_ATTEMPT_PATH);
});
