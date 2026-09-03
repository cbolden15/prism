import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { runConformance, type CoverageResult } from "../../assurance/constitution/contracts/coverage.ts";
import { computeLock, loadRegistry, stableStringify } from "../../assurance/constitution/contracts/registry.ts";
import {
  ProofReportError,
  buildProofReport,
  collectProofEvidence,
  digestFile,
  parseProofReport,
  proofTargetDigest,
  reviewSigningPayload,
  validateIndependentReviewAttestation,
  validateProofReportAgainstRepository,
  validateProofRegistration,
  type IndependentReviewAttestation,
  type ProofRegistration,
  type Sha256Digest,
} from "../../assurance/constitution/contracts/proof-report.ts";
import {
  resolveProofAuthority,
  type ValidatedProofAuthority,
} from "../../assurance/constitution/contracts/transition-authority.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRepoRoot = resolve(here, "..", "..");
const INVARIANT_ID = "PNH-INV-03";
const TEST_FILE = "pnh/tests/proof-fixture.test.ts";
const ENTRYPOINT = "packages/runtime/src/runtime/entrypoint.ts";
const DEPENDENCY = "packages/runtime/src/runtime/dependency.ts";
const BASELINE = "assurance/constitution/contracts/ratification-baselines/fixture-v1.json";
const REVIEW = "docs/reviews/proof-review.json";
const SECOND_REVIEW = "docs/reviews/second-proof-review.json";
const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as Sha256Digest;
const PRODUCER = "pnh:constitution-runner";
const REVIEWER = {
  principal: "worker:claude",
  role: "independent-proof-reviewer",
  keyId: "fixture-reviewer-key",
} as const;
const RUNNER = {
  principal: "runner:node-test",
  role: "constitution-execution-runner",
  keyId: "fixture-runner-key",
} as const;

interface Fixture {
  readonly root: string;
  readonly privateKey: KeyObject;
  readonly publicKeyPem: string;
  readonly runnerPrivateKey: KeyObject;
  readonly runnerPrivateKeyPem: string;
  readonly runnerPublicKeyPem: string;
}

interface ProofSpec {
  readonly name: string;
  readonly reviewPath: string;
}

async function loadFixtureAuthorityModules(fixture: Fixture): Promise<{
  readonly resolveProofAuthority: typeof resolveProofAuthority;
  readonly consumeProofAuthority: typeof import("../../assurance/constitution/contracts/transition-authority.ts").consumeProofAuthority;
  readonly validateInvariantTransition: typeof import("../../assurance/constitution/contracts/invariant-transition.ts").validateInvariantTransition;
}> {
  for (const file of [
    "coverage.ts",
    "invariant-transition.ts",
    "proof-report.ts",
    "registry.ts",
    "transition-authority.ts",
  ]) {
    copyFileSync(
      resolve(sourceRepoRoot, "assurance/constitution/contracts", file),
      resolve(fixture.root, "assurance/constitution/contracts", file),
    );
  }
  const transition = await import(pathToFileURL(
    resolve(fixture.root, "assurance/constitution/contracts/transition-authority.ts"),
  ).href);
  const invariant = await import(pathToFileURL(
    resolve(fixture.root, "assurance/constitution/contracts/invariant-transition.ts"),
  ).href);
  return {
    resolveProofAuthority: transition.resolveProofAuthority,
    consumeProofAuthority: transition.consumeProofAuthority,
    validateInvariantTransition: invariant.validateInvariantTransition,
  };
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function registryDocument(
  baselineDigest: string,
  statement = "Every malformed frame fails closed.",
): string {
  return [
    "version: 2",
    "ratification_baseline:",
    `  path: ${BASELINE}`,
    `  sha256: ${baselineDigest}`,
    "  decision: docs/plans/provider-neutral-harness/fixture-decision.md",
    "invariants:",
    `  - id: ${INVARIANT_ID}`,
    "    title: Parser bounds",
    "    category: isolation",
    "    statement: |",
    `      ${statement}`,
    "    law_status: ratified",
    "    proof_status: partial",
    "    proof_reason: Structured proof is not registered yet.",
    "    enforcement_kind: runtime-adversarial",
    "    first_release:",
    "      disposition: retain",
    "      closing_gates: [A]",
    "    conformance:",
    `      - ${TEST_FILE}`,
    "    since: 2026-08-21",
    "    decisions:",
    "      - docs/plans/provider-neutral-harness/fixture-decision.md",
    "protocols: []",
    "",
  ].join("\n");
}

function createFixture(t: { after(callback: () => void): void }): Fixture {
  const root = mkdtempSync(join(tmpdir(), "pnh-proof-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(resolve(sourceRepoRoot, "node_modules"), resolve(root, "node_modules"), "dir");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const runnerKeys = generateKeyPairSync("ed25519");
  const runnerPrivateKeyPem = runnerKeys.privateKey
    .export({ type: "pkcs8", format: "pem" }).toString();
  const runnerPublicKeyPem = runnerKeys.publicKey
    .export({ type: "spki", format: "pem" }).toString();
  write(root, BASELINE, `${JSON.stringify({ schema_version: 1, baseline_id: "fixture-v1" })}\n`);
  write(root, "assurance/constitution/contracts/invariants.yaml", registryDocument(digestFile(root, BASELINE)));
  write(root, DEPENDENCY, "export const limit = 8;\n");
  write(root, ENTRYPOINT, 'import { limit } from "./dependency.ts";\nexport const bound = limit;\n');
  // The resolver anchors prior state in the committed lock, so a fixture
  // standing in for a repository must carry one.
  write(root, "assurance/constitution/contracts/invariants.lock", `${stableStringify(
    computeLock(loadRegistry(resolve(root, "assurance/constitution/contracts/invariants.yaml"))),
  )}\n`);
  write(root, "assurance/constitution/contracts/proof-targets.json", `${JSON.stringify({
    schema_version: 1,
    targets: [],
  })}\n`);
  write(root, "assurance/constitution/contracts/reviewer-trust.json", `${JSON.stringify({
    schema_version: 1,
    owner: "Vora Technologies, LLC",
    reviewers: [{
      principal: REVIEWER.principal,
      role: REVIEWER.role,
      key_id: REVIEWER.keyId,
      public_key_pem: publicKeyPem,
    }],
  })}\n`);
  write(root, "assurance/constitution/contracts/execution-runner-trust.json", `${JSON.stringify({
    schema_version: 1,
    owner: "Vora Technologies, LLC",
    runners: [{
      principal: RUNNER.principal,
      role: RUNNER.role,
      key_id: RUNNER.keyId,
      public_key_pem: runnerPublicKeyPem,
    }],
  })}\n`);
  return {
    root,
    privateKey,
    publicKeyPem,
    runnerPrivateKey: runnerKeys.privateKey,
    runnerPrivateKeyPem,
    runnerPublicKeyPem,
  };
}

function source(name: string) {
  return { invariantId: INVARIANT_ID, testFile: TEST_FILE, testName: name } as const;
}

function makeReview(
  proofDigest: Sha256Digest,
  reportDigest: Sha256Digest,
  privateKey: Fixture["privateKey"],
  changes: {
    readonly reviewerPrincipal?: string;
    readonly invariantId?: string;
    readonly proofDigest?: Sha256Digest;
    readonly reportDigest?: Sha256Digest;
    readonly verdict?: string;
    readonly critical?: number;
    readonly important?: number;
  } = {},
): IndependentReviewAttestation {
  const unsigned = {
    schema_version: 1,
    artifact_type: "independent-proof-review-v1",
    reviewer: {
      principal: changes.reviewerPrincipal ?? REVIEWER.principal,
      role: REVIEWER.role,
    },
    proof_producer_principal: PRODUCER,
    target: {
      invariant_id: changes.invariantId ?? INVARIANT_ID,
      proof_target_digest: changes.proofDigest ?? proofDigest,
      proof_report_digest: changes.reportDigest ?? reportDigest,
    },
    verdict: changes.verdict ?? "accepted",
    unresolved_findings: {
      critical: changes.critical ?? 0,
      important: changes.important ?? 0,
    },
    authentication: {
      scheme: "ed25519",
      key_id: REVIEWER.keyId,
      signature: "",
    },
  };
  const signature = sign(
    null,
    Buffer.from(reviewSigningPayload(unsigned)),
    privateKey,
  ).toString("base64");
  return {
    ...unsigned,
    schema_version: 1,
    artifact_type: "independent-proof-review-v1",
    verdict: unsigned.verdict as "accepted",
    unresolved_findings: unsigned.unresolved_findings as { critical: 0; important: 0 },
    authentication: {
      scheme: "ed25519",
      key_id: REVIEWER.keyId,
      signature,
    },
  };
}

function writeProofTargets(fixture: Fixture, specs: readonly ProofSpec[]): void {
  write(fixture.root, "assurance/constitution/contracts/proof-targets.json", `${JSON.stringify({
    schema_version: 1,
    targets: specs.map(({ name, reviewPath }) => ({
      invariant_id: INVARIANT_ID,
      test_file: TEST_FILE,
      test_name: name,
      review_artifact: reviewPath,
      review_attestation: reviewPath,
      production_entrypoint: ENTRYPOINT,
      control: { kind: "fault-injection", name: "oversized-frame" },
    })),
  })}\n`);
}

function writeProofSuite(fixture: Fixture, specs: readonly ProofSpec[]): void {
  writeProofTargets(fixture, specs);
  const calls = [...new Set(specs.map(({ name }) => name))]
    .map((name) => `test(${JSON.stringify(name)}, () => {});`);
  write(fixture.root, TEST_FILE, [
    'import { test } from "node:test";',
    ...calls,
    "",
  ].join("\n"));
}

function runSignedConformance(fixture: Fixture): CoverageResult {
  const previous = {
    keyId: process.env.PNH_EXECUTION_SIGNING_KEY_ID,
    keyPem: process.env.PNH_EXECUTION_SIGNING_KEY_PEM,
    principal: process.env.PNH_EXECUTION_RUNNER_PRINCIPAL,
    role: process.env.PNH_EXECUTION_RUNNER_ROLE,
  };
  process.env.PNH_EXECUTION_SIGNING_KEY_ID = RUNNER.keyId;
  process.env.PNH_EXECUTION_SIGNING_KEY_PEM = fixture.runnerPrivateKeyPem;
  process.env.PNH_EXECUTION_RUNNER_PRINCIPAL = RUNNER.principal;
  process.env.PNH_EXECUTION_RUNNER_ROLE = RUNNER.role;
  try {
    return runConformance([TEST_FILE], fixture.root);
  } finally {
    const restore = (name: string, value: string | undefined): void => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("PNH_EXECUTION_SIGNING_KEY_ID", previous.keyId);
    restore("PNH_EXECUTION_SIGNING_KEY_PEM", previous.keyPem);
    restore("PNH_EXECUTION_RUNNER_PRINCIPAL", previous.principal);
    restore("PNH_EXECUTION_RUNNER_ROLE", previous.role);
  }
}

function prepareRun(
  fixture: Fixture,
  specs: readonly ProofSpec[],
  reportDigest: Sha256Digest = ZERO_DIGEST,
  reviewPrivateKey: Fixture["privateKey"] = fixture.privateKey,
): CoverageResult {
  writeProofSuite(fixture, specs);
  const written = new Set<string>();
  for (const spec of specs) {
    if (written.has(spec.reviewPath)) continue;
    written.add(spec.reviewPath);
    const evidence = collectProofEvidence(source(spec.name), fixture.root);
    write(
      fixture.root,
      spec.reviewPath,
      `${JSON.stringify(makeReview(
        proofTargetDigest(evidence),
        reportDigest,
        reviewPrivateKey,
      ))}\n`,
    );
  }
  return runSignedConformance(fixture);
}

function finalReport(fixture: Fixture, specs: readonly ProofSpec[] = [{
  name: "rejects oversized frames",
  reviewPath: REVIEW,
}], reviewPrivateKey: Fixture["privateKey"] = fixture.privateKey) {
  const first = buildProofReport({
    repoRoot: fixture.root,
    run: prepareRun(fixture, specs, ZERO_DIGEST, reviewPrivateKey),
  });
  const second = buildProofReport({
    repoRoot: fixture.root,
    run: prepareRun(fixture, specs, first.report_digest, reviewPrivateKey),
  });
  assert.equal(second.report_digest, first.report_digest);
  return second;
}

function runRawRecord(fixture: Fixture, record: unknown): CoverageResult {
  write(fixture.root, TEST_FILE, [
    'import { appendFileSync } from "node:fs";',
    'import { test } from "node:test";',
    `const record = ${JSON.stringify(record)};`,
    'test("raw record", () => {',
    '  const path = process.env.PNH_CONSTITUTION_REPORT;',
    '  if (path === undefined) throw new Error("missing report path");',
    '  appendFileSync(path, `${JSON.stringify(record)}\\n`, "utf8");',
    '});',
    "",
  ].join("\n"));
  return runConformance([TEST_FILE], fixture.root);
}

test("runner-produced registration self-hashes trusted targets and emits after success", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const proof = built.proofs[0]!;
  assert.deepEqual(validateProofRegistration(proof), []);
  assert.equal(proof.test.sha256, digestFile(fixture.root, TEST_FILE));
  assert.equal(proof.review_artifact.sha256, digestFile(fixture.root, REVIEW));
  assert.equal(proof.production_entrypoint.path, ENTRYPOINT);
  assert.equal(proof.producer.principal, PRODUCER);
  assert.deepEqual(proof.dependency_closure.files.map(({ path }) => path), [DEPENDENCY, ENTRYPOINT]);
  assert.deepEqual(proof.dependency_closure.external_specifiers, []);
  const ignoredCallerDigest = collectProofEvidence({
    ...source(proof.test.name),
    testDigest: ZERO_DIGEST,
  } as unknown as Parameters<typeof collectProofEvidence>[0], fixture.root);
  assert.equal(ignoredCallerDigest.test.sha256, digestFile(fixture.root, TEST_FILE));
  assert.notEqual(ignoredCallerDigest.test.sha256, ZERO_DIGEST);
  assert.ok(!JSON.stringify(built).includes(fixture.root));
  const corrupted = {
    ...built,
    execution: {
      ...built.execution,
      authentication: {
        ...built.execution.authentication!,
        signature: Buffer.from("invalid").toString("base64"),
      },
    },
  };
  assert.match(
    validateProofReportAgainstRepository(corrupted, fixture.root).join("\n"),
    /execution receipt signature is not authenticated/u,
  );
});

test("skipped proof bodies and unauthenticated raw JSONL cannot register evidence", (t) => {
  const fixture = createFixture(t);
  write(fixture.root, TEST_FILE, [
    'import { test } from "node:test";',
    'test.skip("skipped proof", () => {});',
    "",
  ].join("\n"));
  writeProofTargets(fixture, [{ name: "skipped proof", reviewPath: REVIEW }]);
  const skipped = runSignedConformance(fixture);
  assert.equal(skipped.exitCode, 0);
  assert.deepEqual(skipped.structuredProofs, []);

  const proof = finalReport(fixture).proofs[0]!;
  const raw = runRawRecord(fixture, proof);
  assert.equal(raw.exitCode, 2);
  assert.deepEqual(raw.structuredProofs, []);
  assert.match(raw.parseErrors[0]?.message ?? "", /unknown record_type/u);

  writeProofTargets(fixture, [{ name: "killed proof", reviewPath: REVIEW }]);
  write(fixture.root, TEST_FILE, 'process.kill(process.pid, "SIGKILL");\n');
  const killed = runSignedConformance(fixture);
  assert.equal(killed.exitCode, 1);
  assert.deepEqual(killed.structuredProofs, []);

  const duplicateName = "duplicate proof name";
  writeProofTargets(fixture, [{ name: duplicateName, reviewPath: REVIEW }]);
  write(fixture.root, TEST_FILE, [
    'import { test } from "node:test";',
    `test.skip(${JSON.stringify(duplicateName)}, () => {});`,
    `test(${JSON.stringify(duplicateName)}, () => {});`,
    "",
  ].join("\n"));
  const duplicateEvidence = collectProofEvidence(source(duplicateName), fixture.root);
  write(
    fixture.root,
    REVIEW,
    `${JSON.stringify(makeReview(
      proofTargetDigest(duplicateEvidence),
      ZERO_DIGEST,
      fixture.privateKey,
    ))}\n`,
  );
  const duplicate = runSignedConformance(fixture);
  assert.notEqual(duplicate.exitCode, 0);
  assert.deepEqual(duplicate.structuredProofs, []);
});

test("closed registration rejects unknown keys, malformed digests, and missing trusted evidence", (t) => {
  const fixture = createFixture(t);
  const proof = finalReport(fixture).proofs[0]!;
  const cases: readonly [string, unknown, RegExp][] = [
    ["unknown key", { ...proof, surprise: true }, /unknown field surprise/u],
    ["bad digest", { ...proof, test: { ...proof.test, sha256: "sha256:wrong" } }, /test\.sha256/u],
    [
      "missing entrypoint",
      (({ production_entrypoint: _entrypoint, ...rest }) => rest)(proof),
      /production_entrypoint is required/u,
    ],
    ["missing control", (({ control: _control, ...rest }) => rest)(proof), /control is required/u],
  ];
  for (const [name, value, expected] of cases) {
    assert.match(validateProofRegistration(value).join("\n"), expected, name);
  }
});

test("attestation pointer and checker are closed fields that fail closed when absent", (t) => {
  const fixture = createFixture(t);
  const proof = finalReport(fixture).proofs[0]!;
  const cases: readonly [string, unknown, RegExp][] = [
    [
      "missing attestation pointer",
      (({ review_attestation: _attestation, ...rest }) => rest)(proof),
      /review_attestation must be canonical and repository-relative/u,
    ],
    [
      "absolute attestation pointer",
      { ...proof, review_attestation: "/etc/proof-review.json" },
      /review_attestation must be canonical and repository-relative/u,
    ],
    [
      "escaping attestation pointer",
      { ...proof, review_attestation: "../proof-review.json" },
      /review_attestation must be canonical and repository-relative/u,
    ],
    [
      "checker on a runtime-adversarial proof",
      { ...proof, checker: "validatePluginFrame" },
      /runtime-adversarial proof names a control, not a checker/u,
    ],
    [
      "static-structure proof without a checker",
      (({ control: _control, ...rest }) => ({
        ...rest,
        enforcement_kind: "static-structure",
      }))(proof),
      /checker is required for static-structure proof/u,
    ],
  ];
  for (const [name, value, expected] of cases) {
    assert.match(validateProofRegistration(value).join("\n"), expected, name);
  }

  // A manifest that omits the pointer cannot produce evidence at all, so the
  // attestation cannot be made optional by deleting it.
  write(fixture.root, "assurance/constitution/contracts/proof-targets.json", `${JSON.stringify({
    schema_version: 1,
    targets: [{
      invariant_id: INVARIANT_ID,
      test_file: TEST_FILE,
      test_name: "rejects oversized frames",
      review_artifact: REVIEW,
      production_entrypoint: ENTRYPOINT,
      control: { kind: "fault-injection", name: "oversized-frame" },
    }],
  })}\n`);
  assert.throws(
    () => collectProofEvidence(source("rejects oversized frames"), fixture.root),
    /review_attestation/u,
  );
});

test("builder accepts only opaque runs and rejects failed or malformed execution", (t) => {
  const fixture = createFixture(t);
  assert.throws(
    () => buildProofReport({
      repoRoot: fixture.root,
      run: {
        exitCode: 0,
        testFiles: [TEST_FILE],
        legacyLabels: new Set(),
        structuredProofs: [],
        parseErrors: [],
      } as unknown as CoverageResult,
    }),
    /opaque runner-produced result/u,
  );

  const unsigned = prepareRun(fixture, [{ name: "unsigned proof", reviewPath: REVIEW }]);
  const signingKey = process.env.PNH_EXECUTION_SIGNING_KEY_PEM;
  delete process.env.PNH_EXECUTION_SIGNING_KEY_PEM;
  writeProofSuite(fixture, [{ name: "unsigned proof", reviewPath: REVIEW }]);
  const unsignedRun = runConformance([TEST_FILE], fixture.root);
  if (signingKey !== undefined) process.env.PNH_EXECUTION_SIGNING_KEY_PEM = signingKey;
  assert.equal(unsigned.structuredProofs.length, 1);
  assert.throws(
    () => buildProofReport({ repoRoot: fixture.root, run: unsignedRun }),
    /owner-pinned execution runner signature/u,
  );

  write(fixture.root, TEST_FILE, 'import { test } from "node:test";\ntest("fails", () => { throw new Error("fail"); });\n');
  assert.throws(
    () => buildProofReport({ repoRoot: fixture.root, run: runConformance([TEST_FILE], fixture.root) }),
    /executed conformance run failed/u,
  );
  write(fixture.root, TEST_FILE, [
    'import { appendFileSync } from "node:fs";',
    'import { test } from "node:test";',
    'test("malformed", () => appendFileSync(process.env.PNH_CONSTITUTION_REPORT!, "{bad\\n"));',
    "",
  ].join("\n"));
  assert.throws(
    () => buildProofReport({ repoRoot: fixture.root, run: runConformance([TEST_FILE], fixture.root) }),
    /parse errors/u,
  );
});

test("execution receipt binds pre-run bytes and exposes no arbitrary signing oracle", async (t) => {
  const coverageModule = await import("../../assurance/constitution/contracts/coverage.ts");
  assert.equal("signExecutedConformanceRun" in coverageModule, false);

  const fixture = createFixture(t);
  const testName = "mutates dependency after execution starts";
  writeProofTargets(fixture, [{ name: testName, reviewPath: REVIEW }]);
  write(fixture.root, TEST_FILE, [
    'import { writeFileSync } from "node:fs";',
    'import { test } from "node:test";',
    `test(${JSON.stringify(testName)}, () => {`,
    `  writeFileSync(${JSON.stringify(DEPENDENCY)}, "export const limit = 99;\\n", "utf8");`,
    "});",
    "",
  ].join("\n"));
  const evidence = collectProofEvidence(source(testName), fixture.root);
  write(
    fixture.root,
    REVIEW,
    `${JSON.stringify(makeReview(
      proofTargetDigest(evidence),
      ZERO_DIGEST,
      fixture.privateKey,
    ))}\n`,
  );
  const run = runSignedConformance(fixture);
  assert.equal(run.exitCode, 2);
  assert.throws(
    () => buildProofReport({ repoRoot: fixture.root, run }),
    /executed evidence changed during the conformance run/u,
  );
});

test("builder rejects unknown IDs, kind mismatch, and stale dependency closure", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const valid = built.proofs[0]!;
  const unknown = { ...valid, invariant_id: "PNH-INV-99" };
  unknown.proof_target_digest = proofTargetDigest(unknown);
  assert.match(
    validateProofReportAgainstRepository({ ...built, proofs: [unknown] }, fixture.root).join("\n"),
    /unknown invariant PNH-INV-99/u,
  );
  const wrongKind = { ...valid, enforcement_kind: "static-structure" as const };
  wrongKind.proof_target_digest = proofTargetDigest(wrongKind);
  assert.match(
    validateProofReportAgainstRepository({ ...built, proofs: [wrongKind] }, fixture.root).join("\n"),
    /enforcement kind .* does not match registry/u,
  );

  const run = prepareRun(fixture, [{ name: "rejects oversized frames", reviewPath: REVIEW }]);
  write(fixture.root, DEPENDENCY, "export const limit = 9;\n");
  assert.throws(
    () => buildProofReport({ repoRoot: fixture.root, run }),
    /dependency closure differs/u,
  );
});

test("reports stale after law or production entrypoint changes", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, ENTRYPOINT, "export const bound = 99;\n");
  assert.match(
    validateProofReportAgainstRepository(built, fixture.root).join("\n"),
    /production entrypoint differs from current bytes/u,
  );

  write(fixture.root, ENTRYPOINT, 'import { limit } from "./dependency.ts";\nexport const bound = limit;\n');
  write(
    fixture.root,
    "assurance/constitution/contracts/invariants.yaml",
    registryDocument(digestFile(fixture.root, BASELINE), "Changed ratified law."),
  );
  assert.match(
    validateProofReportAgainstRepository(built, fixture.root).join("\n"),
    /invariant binding hash differs from current law/u,
  );
});

test("sorting is code-unit deterministic, exact duplicates collapse, and conflicts fail", (t) => {
  const fixture = createFixture(t);
  const specs = [
    { name: "ä case", reviewPath: "docs/reviews/unicode.json" },
    { name: "z case", reviewPath: REVIEW },
    { name: "z case", reviewPath: REVIEW },
  ] as const;
  const built = finalReport(fixture, specs);
  assert.deepEqual(built.proofs.map(({ test: evidence }) => evidence.name), ["z case", "ä case"]);
  assert.equal(built.proofs.length, 2);

  assert.throws(
    () => prepareRun(fixture, [
      { name: "same case", reviewPath: REVIEW },
      { name: "same case", reviewPath: SECOND_REVIEW },
    ]),
    /conflicting duplicate trusted proof target/u,
  );
});

test("review attestation binds the exact report and rejects prose, self-review, and findings", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const proof = built.proofs[0]!;
  const valid = JSON.parse(readFileSync(join(fixture.root, REVIEW), "utf8")) as unknown;
  assert.deepEqual(validateIndependentReviewAttestation(valid, {
    invariantId: INVARIANT_ID,
    proofTargetDigest: proof.proof_target_digest,
    proofReportDigest: built.report_digest,
    producerPrincipal: PRODUCER,
  }), []);
  const cases: readonly [string, unknown, RegExp][] = [
    ["prose", "accepted", /must be an object/u],
    ["unknown", { ...(valid as object), note: "ok" }, /unknown field note/u],
    [
      "self-review",
      { ...(valid as IndependentReviewAttestation), reviewer: { principal: PRODUCER, role: REVIEWER.role } },
      /reviewer must be distinct/u,
    ],
    [
      "wrong report",
      {
        ...(valid as IndependentReviewAttestation),
        target: { ...(valid as IndependentReviewAttestation).target, proof_report_digest: ZERO_DIGEST },
      },
      /exact report target/u,
    ],
    [
      "critical",
      { ...(valid as IndependentReviewAttestation), unresolved_findings: { critical: 1, important: 0 } },
      /zero unresolved Critical and Important/u,
    ],
  ];
  for (const [name, value, expected] of cases) {
    assert.match(validateIndependentReviewAttestation(value, {
      invariantId: INVARIANT_ID,
      proofTargetDigest: proof.proof_target_digest,
      proofReportDigest: built.report_digest,
      producerPrincipal: PRODUCER,
    }).join("\n"), expected, name);
  }
});

test("resolver uses its canonical root, and its capability is current, opaque, and one-shot", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  const request = {
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial" as const,
    newProofStatus: "proven" as const,
  };
  assert.equal(resolveProofAuthority({
    ...request,
    proofReportPath: join(fixture.root, "proof-report.json"),
  }).ok, false, "the public resolver must not accept a caller-selected repository");
  const modules = await loadFixtureAuthorityModules(fixture);
  const resolved = modules.resolveProofAuthority(request);
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  const transition = {
    id: INVARIANT_ID,
    oldLawStatus: "ratified" as const,
    newLawStatus: "ratified" as const,
    oldProofStatus: "partial" as const,
    newProofStatus: "proven" as const,
    lockedHash: resolved.authority.invariantBindingHash,
    newBindingHash: resolved.authority.invariantBindingHash,
    proofReason: undefined,
    authorities: { proof: resolved.authority },
  };
  assert.deepEqual(modules.validateInvariantTransition(transition), [
    `stale lock: ${INVARIANT_ID} law/proof status changed (run generate-constitution --update-lock)`,
  ]);
  assert.match(
    modules.validateInvariantTransition(transition).join("\n"),
    /not issued by the trusted resolver/u,
  );

  const fake = {
    invariantId: INVARIANT_ID,
    authorityKind: "proof-upgrade",
    priorProofStatus: "partial",
    newProofStatus: "proven",
  } as unknown as ValidatedProofAuthority;
  assert.match(modules.consumeProofAuthority(fake).join("\n"), /not issued by the trusted resolver/u);

  const stale = modules.resolveProofAuthority(request);
  assert.equal(stale.ok, true);
  if (!stale.ok) return;
  write(fixture.root, DEPENDENCY, "export const limit = 10;\n");
  assert.match(
    modules.consumeProofAuthority(stale.authority).join("\n"),
    /dependency closure differs/u,
  );
});

// The next three tests isolate the lock-derived refusals: each drives exactly
// one divergence against an otherwise-valid fixture and asserts the specific
// message, so deleting any one of the checks fails its test.
test("proof authority refuses to anchor on a missing committed lock", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  const modules = await loadFixtureAuthorityModules(fixture);
  rmSync(join(fixture.root, "assurance/constitution/contracts/invariants.lock"));
  const resolved = modules.resolveProofAuthority({
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.ok(
    resolved.errors.includes(`${INVARIANT_ID}: no committed lock entry to anchor prior state`),
    resolved.errors.join("; "),
  );
});

test("proof authority refuses law-status drift between registry and lock", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  const modules = await loadFixtureAuthorityModules(fixture);
  const lockPath = join(fixture.root, "assurance/constitution/contracts/invariants.lock");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
    entries: Record<string, { law_status: string; proof_status: string }>;
  };
  lock.entries[INVARIANT_ID]!.law_status = "retired";
  writeFileSync(lockPath, `${stableStringify(lock)}\n`, "utf8");
  const resolved = modules.resolveProofAuthority({
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.ok(
    resolved.errors.includes(`${INVARIANT_ID}: law status changed under a proof transition`),
    resolved.errors.join("; "),
  );
});

test("proof authority refuses a lock-derived prior status mismatch on a valid report", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  const modules = await loadFixtureAuthorityModules(fixture);
  const lockPath = join(fixture.root, "assurance/constitution/contracts/invariants.lock");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
    entries: Record<string, { law_status: string; proof_status: string }>;
  };
  lock.entries[INVARIANT_ID]!.proof_status = "proven";
  writeFileSync(lockPath, `${stableStringify(lock)}\n`, "utf8");
  const resolved = modules.resolveProofAuthority({
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.ok(
    resolved.errors.includes("locked proof status proven does not match requested prior status partial"),
    resolved.errors.join("; "),
  );
});

async function loadFixtureGenerator(fixture: Fixture): Promise<{
  readonly provenProofErrors:
    typeof import("../../assurance/constitution/scripts/generate-constitution.ts").provenProofErrors;
}> {
  await loadFixtureAuthorityModules(fixture);
  mkdirSync(resolve(fixture.root, "assurance/constitution/scripts"), { recursive: true });
  copyFileSync(
    resolve(sourceRepoRoot, "assurance/constitution/scripts/generate-constitution.ts"),
    resolve(fixture.root, "assurance/constitution/scripts/generate-constitution.ts"),
  );
  return await import(pathToFileURL(
    resolve(fixture.root, "assurance/constitution/scripts/generate-constitution.ts"),
  ).href);
}

test("update-lock proof pre-gate validates the pinned prior bytes byte-strictly", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  // Mint the report against the fixture's original registry bytes, then flip the
  // row to proven the way a real transition does, keeping the pre-flip bytes.
  const registryPath = resolve(fixture.root, "assurance/constitution/contracts/invariants.yaml");
  const preflip = readFileSync(registryPath, "utf8");
  write(fixture.root, "invariants.preflip.yaml", preflip);
  const flipped = preflip.replace(
    "    proof_status: partial\n    proof_reason: Structured proof is not registered yet.\n",
    "    proof_status: proven\n",
  );
  assert.notEqual(flipped, preflip, "the flip must change the registry bytes");
  writeFileSync(registryPath, flipped, "utf8");
  const registry = loadRegistry(registryPath);
  const generator = await loadFixtureGenerator(fixture);

  const withoutPrior = generator.provenProofErrors(registry, "proof-report.json");
  assert.ok(
    withoutPrior.some((error) => error.includes("registry identity differs from current bytes")),
    `without prior bytes the minting report must be refused: ${withoutPrior.join("; ")}`,
  );

  assert.deepEqual(
    generator.provenProofErrors(registry, "proof-report.json", "invariants.preflip.yaml"),
    [],
  );

  write(fixture.root, "invariants.wrong.yaml", flipped);
  const wrongBytes =
    generator.provenProofErrors(registry, "proof-report.json", "invariants.wrong.yaml");
  assert.ok(
    wrongBytes.some((error) =>
      error.includes("prior registry bytes do not match the proof report registry digest")),
    `prior bytes that do not hash to the pin must be refused: ${wrongBytes.join("; ")}`,
  );

  const unreadable =
    generator.provenProofErrors(registry, "proof-report.json", "missing-prior.yaml");
  assert.ok(
    unreadable.some((error) => error.startsWith("prior registry cannot be read")),
    unreadable.join("; "),
  );
});

test("resolver rejects unpinned, unauthenticated, and retargeted reviewers", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  write(fixture.root, "proof-report.json", `${JSON.stringify(built)}\n`);
  const request = {
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial" as const,
    newProofStatus: "proven" as const,
  };
  write(fixture.root, "assurance/constitution/contracts/reviewer-trust.json", `${JSON.stringify({
    schema_version: 1,
    owner: "Vora Technologies, LLC",
    reviewers: [],
  })}\n`);
  const fixtureModules = await loadFixtureAuthorityModules(fixture);
  assert.equal(
    fixtureModules.resolveProofAuthority(request).ok,
    false,
    "caller cannot inject a trust key",
  );

  const refreshed = createFixture(t);
  const report = finalReport(refreshed);
  const proof = report.proofs[0]!;
  const retargeted = makeReview(
    proof.proof_target_digest,
    report.report_digest,
    refreshed.privateKey,
    { reportDigest: ZERO_DIGEST },
  );
  writeProofSuite(refreshed, [{ name: proof.test.name, reviewPath: REVIEW }]);
  write(refreshed.root, REVIEW, `${JSON.stringify(retargeted)}\n`);
  const run = runSignedConformance(refreshed);
  const retargetedReport = buildProofReport({ repoRoot: refreshed.root, run });
  write(refreshed.root, "proof-report.json", `${JSON.stringify(retargetedReport)}\n`);
  const refreshedModules = await loadFixtureAuthorityModules(refreshed);
  const result = refreshedModules.resolveProofAuthority(request);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join("\n"), /exact report target/u);
});

test("resolver rejects an unauthenticated independent review", async (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const review = JSON.parse(readFileSync(join(fixture.root, REVIEW), "utf8")) as
    IndependentReviewAttestation;
  write(fixture.root, REVIEW, `${JSON.stringify({
    ...review,
    authentication: {
      ...review.authentication,
      signature: Buffer.from("invalid").toString("base64"),
    },
  })}\n`);
  const refreshed = buildProofReport({
    repoRoot: fixture.root,
    run: runSignedConformance(fixture),
  });
  assert.equal(refreshed.report_digest, built.report_digest);
  write(fixture.root, "proof-report.json", `${JSON.stringify(refreshed)}\n`);
  const modules = await loadFixtureAuthorityModules(fixture);
  const result = modules.resolveProofAuthority({
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join("\n"), /review signature is not authenticated/u);
});

test("resolver rejects a reviewer that shares the execution runner key", async (t) => {
  const fixture = createFixture(t);
  write(fixture.root, "assurance/constitution/contracts/reviewer-trust.json", `${JSON.stringify({
    schema_version: 1,
    owner: "Vora Technologies, LLC",
    reviewers: [{
      principal: REVIEWER.principal,
      role: REVIEWER.role,
      key_id: REVIEWER.keyId,
      public_key_pem: fixture.runnerPublicKeyPem,
    }],
  })}\n`);
  const report = finalReport(fixture, [{
    name: "rejects shared execution and review key",
    reviewPath: REVIEW,
  }], fixture.runnerPrivateKey);
  write(fixture.root, "proof-report.json", `${JSON.stringify(report)}\n`);
  const modules = await loadFixtureAuthorityModules(fixture);
  const result = modules.resolveProofAuthority({
    proofReportPath: "proof-report.json",
    invariantId: INVARIANT_ID,
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /reviewer public key matches execution runner/u);
  }
});

test("parser rejects duplicate and conflicting reports before authority resolution", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const duplicate = { ...built, proofs: [built.proofs[0]!, built.proofs[0]!] };
  assert.throws(() => parseProofReport(duplicate), /duplicate proof registration/u);
  const conflictProof = {
    ...built.proofs[0]!,
    review_artifact: { ...built.proofs[0]!.review_artifact, path: SECOND_REVIEW },
  };
  const conflicting = { ...built, proofs: [built.proofs[0]!, conflictProof] };
  assert.throws(() => parseProofReport(conflicting), /conflicting duplicate proof registration/u);
});

test("dependency closure fails closed on packages and nonliteral dynamic imports", (t) => {
  const fixture = createFixture(t);
  write(fixture.root, TEST_FILE, "export const exercised = true;\n");
  writeProofTargets(fixture, [{ name: "package dependency", reviewPath: REVIEW }]);
  write(fixture.root, ENTRYPOINT, 'import yaml from "yaml";\nexport const parser = yaml;\n');
  assert.throws(
    () => collectProofEvidence(source("package dependency"), fixture.root),
    /external package dependency yaml is not pinned/u,
  );
  writeProofTargets(fixture, [{ name: "workspace package dependency", reviewPath: REVIEW }]);
  write(fixture.root, ENTRYPOINT, 'import { value } from "@useprism/sdk/manifest";\nexport { value };\n');
  write(fixture.root, "packages/sdk/package.json", JSON.stringify({
    name: "@useprism/sdk",
    exports: { "./manifest": { import: "./dist/manifest.js" } },
  }));
  write(fixture.root, "packages/sdk/src/manifest.ts", "export const value = 1;\n");
  const workspaceEvidence = collectProofEvidence(source("workspace package dependency"), fixture.root);
  assert.deepEqual(
    workspaceEvidence.dependency_closure.files.map(({ path }) => path),
    [ENTRYPOINT, "packages/sdk/package.json", "packages/sdk/src/manifest.ts"].sort(),
  );
  writeProofTargets(fixture, [{ name: "dynamic dependency", reviewPath: REVIEW }]);
  write(fixture.root, ENTRYPOINT, 'const path = "./dependency.ts";\nexport const loaded = import(path);\n');
  assert.throws(
    () => collectProofEvidence(source("dynamic dependency"), fixture.root),
    /dynamic dependency specifier is not a string literal/u,
  );
  write(
    fixture.root,
    ENTRYPOINT,
    'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nexport const ts = load("typescript");\n',
  );
  writeProofTargets(fixture, [{ name: "createRequire dependency", reviewPath: REVIEW }]);
  assert.throws(
    () => collectProofEvidence(source("createRequire dependency"), fixture.root),
    /executable loader (?:module node:module|property createRequire) is unsupported/u,
  );
  write(
    fixture.root,
    ENTRYPOINT,
    'const { createRequire: loadFactory } = await import("node:module");\nconst load = loadFactory(import.meta.url);\nexport const ts = load("typescript");\n',
  );
  assert.throws(
    () => collectProofEvidence(source("createRequire dependency"), fixture.root),
    /executable loader (?:module node:module|property createRequire) is unsupported/u,
  );
  write(
    fixture.root,
    ENTRYPOINT,
    'const load = process["getBuiltinModule"];\nexport const child = load("child_process");\n',
  );
  assert.throws(
    () => collectProofEvidence(source("createRequire dependency"), fixture.root),
    /executable loader property getBuiltinModule is unsupported/u,
  );
  write(
    fixture.root,
    ENTRYPOINT,
    'const load = (async () => {}).constructor;\nexport const loaded = load("return import(\\"yaml\\")")();\n',
  );
  assert.throws(
    () => collectProofEvidence(source("createRequire dependency"), fixture.root),
    /executable loader property constructor is unsupported/u,
  );
  write(
    fixture.root,
    ENTRYPOINT,
    'const load = eval;\nexport const loaded = load("import(\\"./dependency.ts\\")");\n',
  );
  assert.throws(
    () => collectProofEvidence(source("createRequire dependency"), fixture.root),
    /executable loader reference eval is unsupported/u,
  );
});

test("proof report errors retain every validation failure", () => {
  const error = new ProofReportError(["first", "second"]);
  assert.deepEqual(error.errors, ["first", "second"]);
});

test("injected prior registry bytes are accepted only when they match the report pin", (t) => {
  const fixture = createFixture(t);
  const built = finalReport(fixture);
  const registryFile = resolve(
    fixture.root,
    "assurance",
    "constitution",
    "contracts",
    "invariants.yaml",
  );
  const priorBytes = readFileSync(registryFile, "utf8");
  assert.deepEqual(validateProofReportAgainstRepository(built, fixture.root), []);

  // Drift the live registry away from the bytes the report pinned.
  writeFileSync(registryFile, `${priorBytes}\n# drift\n`, "utf8");
  assert.match(
    validateProofReportAgainstRepository(built, fixture.root).join("\n"),
    /registry identity differs from current bytes/u,
  );

  // The authentic prior bytes restore validation without touching the live tree.
  assert.deepEqual(
    validateProofReportAgainstRepository(built, fixture.root, { contents: priorBytes }),
    [],
  );

  // Bytes that do not hash to the report's pin are refused, never trusted.
  assert.match(
    validateProofReportAgainstRepository(built, fixture.root, {
      contents: `${priorBytes}\n# forged\n`,
    }).join("\n"),
    /prior registry bytes do not match the proof report registry digest/u,
  );
});
