import { spawnSync } from "node:child_process";
import {
  sign as signBytes,
} from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectProofEvidenceForExecutedFiles,
  createProofRegistration,
  digestFile,
  executionDigest,
  executionSigningPayload,
  LEGACY_CONFORMANCE_RECORD_TYPE,
  proofTargetDigest,
  type FileEvidence,
  type ProofExecutionIdentity,
  type ProofRegistration,
  type ReportParseError,
  type Sha256Digest,
} from "./proof-report.ts";
import { stableStringify } from "./registry.ts";

const executedConformanceRunBrand: unique symbol = Symbol("ExecutedConformanceRun");
const executedConformanceRuns = new WeakSet<object>();
const executedConformanceReceipts = new WeakMap<object, ExecutedConformanceReceipt>();
const TEST_EVENT_RUNNER = fileURLToPath(new URL("../scripts/run-test-events.ts", import.meta.url));

type ExecutionAuthentication = NonNullable<ProofExecutionIdentity["authentication"]>;

export interface ExecutedConformanceReceipt {
  readonly testFiles: readonly FileEvidence[];
  readonly structuredProofs: readonly ProofRegistration[];
  readonly executionDigest: Sha256Digest;
  readonly authentication?: ExecutionAuthentication;
}

export interface CoverageResult {
  readonly [executedConformanceRunBrand]: true;
  readonly exitCode: number;
  readonly testFiles: readonly string[];
  readonly legacyLabels: ReadonlySet<string>;
  readonly structuredProofs: readonly ProofRegistration[];
  readonly parseErrors: readonly ReportParseError[];
}

export function isExecutedConformanceRun(value: unknown): value is CoverageResult {
  return typeof value === "object" && value !== null && executedConformanceRuns.has(value);
}

export function getExecutedConformanceReceipt(
  run: CoverageResult,
): ExecutedConformanceReceipt | undefined {
  return isExecutedConformanceRun(run) ? executedConformanceReceipts.get(run) : undefined;
}

function immutableJson<T>(value: T): T {
  const clone = JSON.parse(stableStringify(value)) as T;
  const freeze = (current: unknown): void => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current)) return;
    for (const child of Object.values(current)) freeze(child);
    Object.freeze(current);
  };
  freeze(clone);
  return clone;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(line: string, lineNumber: number):
  | { readonly legacy: string }
  | { readonly proof: ProofRegistration }
  | { readonly error: ReportParseError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      error: {
        line: lineNumber,
        code: "invalid-json",
        message: "report line is not valid JSON",
      },
    };
  }
  if (!isRecord(parsed)) {
    return {
      error: {
        line: lineNumber,
        code: "invalid-record",
        message: "report line must be an object",
      },
    };
  }
  if (parsed.record_type === LEGACY_CONFORMANCE_RECORD_TYPE) {
    const keys = Object.keys(parsed).sort();
    if (keys.length !== 2 || keys[0] !== "invariant_id" || keys[1] !== "record_type" ||
        typeof parsed.invariant_id !== "string") {
      return {
        error: {
          line: lineNumber,
          code: "invalid-record",
          message: "legacy conformance record is malformed",
        },
      };
    }
    return { legacy: parsed.invariant_id };
  }
  return {
    error: {
      line: lineNumber,
      code: "invalid-record",
      message: "report line has an unknown record_type",
    },
  };
}

function passedTestNames(raw: string, expectedFile: string): readonly string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !==
      "file,passed,schema_version,success" || parsed.schema_version !== 1 ||
      parsed.file !== expectedFile || parsed.success !== true || !Array.isArray(parsed.passed) ||
      parsed.passed.some((name) => typeof name !== "string" || name.length === 0)) {
    return undefined;
  }
  return parsed.passed as string[];
}

export function runConformance(files: string[], repoRoot: string): CoverageResult {
  const reportDir = mkdtempSync(join(tmpdir(), "pnh-constitution-"));
  const reportPath = join(reportDir, "report.jsonl");
  try {
    // Strip NODE_TEST_CONTEXT: when this runner is itself invoked from inside
    // a `node --test` run, node:test treats an inherited context as a
    // recursive re-entry and silently skips executing the child files.
    const {
      NODE_TEST_CONTEXT: _omit,
      PNH_EXECUTION_SIGNING_KEY_ID: signingKeyId,
      PNH_EXECUTION_SIGNING_KEY_PEM: signingKeyPem,
      PNH_EXECUTION_RUNNER_PRINCIPAL: signingPrincipal,
      PNH_EXECUTION_RUNNER_ROLE: signingRole,
      ...childEnv
    } = process.env;
    const uniqueFiles = [...new Set(files)].sort();
    const parseErrors: ReportParseError[] = [];
    let preRunTestFiles: readonly FileEvidence[] = [];
    let proofCandidates: ReturnType<typeof collectProofEvidenceForExecutedFiles> = [];
    try {
      preRunTestFiles = uniqueFiles.map((path) => ({
        path,
        sha256: digestFile(repoRoot, path),
      }));
      proofCandidates = collectProofEvidenceForExecutedFiles(repoRoot, uniqueFiles);
    } catch {
      parseErrors.push({
        line: 0,
        code: "invalid-record",
        message: "trusted proof evidence could not be captured before execution",
      });
    }
    const results = files.map((file) => ({
      file,
      result: spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        TEST_EVENT_RUNNER,
        resolve(repoRoot, file),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...childEnv,
          PNH_CONSTITUTION_REPORT: reportPath,
        },
      },
    ) }));
    const legacyLabels = new Set<string>();
    const structuredProofs: ProofRegistration[] = [];
    let raw = "";
    try {
      raw = readFileSync(reportPath, "utf8");
    } catch {
      raw = "";
    }
    let lineNumber = 0;
    for (const line of raw.split("\n")) {
      lineNumber += 1;
      if (line.trim().length === 0) continue;
      const parsed = parseLine(line, lineNumber);
      if ("legacy" in parsed) legacyLabels.add(parsed.legacy);
      else if ("proof" in parsed) structuredProofs.push(parsed.proof);
      else parseErrors.push(parsed.error);
    }
    const passedTests: { readonly testFile: string; readonly testName: string }[] = [];
    for (const { file, result } of results) {
      if (result.error !== undefined || result.signal !== null || result.status === null ||
          result.status !== 0) continue;
      const names = passedTestNames(result.stdout, resolve(repoRoot, file));
      if (names === undefined) {
        parseErrors.push({
          line: 0,
          code: "invalid-test-result",
          message: `${file}: test event runner did not emit a valid result`,
        });
      } else {
        passedTests.push(...names.map((testName) => ({ testFile: file, testName })));
      }
    }
    const passed = new Set(passedTests.map(({ testFile, testName }) =>
      `${testFile}\0${testName}`));
    let evidenceChanged = false;
    for (const candidate of proofCandidates) {
      if (!passed.has(`${candidate.source.testFile}\0${candidate.source.testName}`)) continue;
      try {
        const registration = createProofRegistration(candidate.source, repoRoot);
        if (registration.proof_target_digest !== proofTargetDigest(candidate.evidence)) {
          evidenceChanged = true;
        } else {
          structuredProofs.push(registration);
        }
      } catch {
        evidenceChanged = true;
      }
    }
    for (const file of preRunTestFiles) {
      try {
        if (digestFile(repoRoot, file.path) !== file.sha256) evidenceChanged = true;
      } catch {
        evidenceChanged = true;
      }
    }
    if (evidenceChanged) {
      parseErrors.push({
        line: 0,
        code: "invalid-test-result",
        message: "executed evidence changed during the conformance run",
      });
    }
    const failedChild = results.find(({ result }) =>
      result.error !== undefined || result.signal !== null || result.status === null ||
      result.status !== 0)?.result;
    const childExitCode = failedChild === undefined
      ? 0
      : typeof failedChild.status === "number" && failedChild.status !== 0
      ? failedChild.status
      : 1;
    const exitCode = childExitCode !== 0 ? childExitCode : parseErrors.length > 0 ? 2 : 0;
    const receiptTestFiles = immutableJson(preRunTestFiles);
    const receiptProofs = immutableJson(structuredProofs);
    const receiptDigest = executionDigest(receiptTestFiles, receiptProofs);
    const executionIdentity = {
      result: "passed" as const,
      exit_code: 0 as const,
      test_files: receiptTestFiles,
      sha256: receiptDigest,
    };
    let authentication: ExecutionAuthentication | undefined;
    if (exitCode === 0 && signingKeyId !== undefined && signingKeyId.length > 0 &&
        signingKeyPem !== undefined && signingKeyPem.length > 0 &&
        signingPrincipal !== undefined && signingPrincipal.length > 0 &&
        signingRole !== undefined && signingRole.length > 0) {
      authentication = immutableJson({
        scheme: "ed25519" as const,
        key_id: signingKeyId,
        principal: signingPrincipal,
        role: signingRole,
        signature: signBytes(
          null,
          Buffer.from(stableStringify(executionSigningPayload(executionIdentity))),
          signingKeyPem,
        ).toString("base64"),
      });
    }
    const coverageResult: CoverageResult = Object.freeze({
      [executedConformanceRunBrand]: true as const,
      exitCode,
      testFiles: Object.freeze(uniqueFiles),
      legacyLabels,
      structuredProofs: receiptProofs,
      parseErrors: immutableJson(parseErrors),
    });
    executedConformanceRuns.add(coverageResult);
    executedConformanceReceipts.set(coverageResult, Object.freeze({
      testFiles: receiptTestFiles,
      structuredProofs: receiptProofs,
      executionDigest: receiptDigest,
      ...(authentication === undefined ? {} : { authentication }),
    }));
    return coverageResult;
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
