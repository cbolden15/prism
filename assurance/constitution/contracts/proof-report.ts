import { createHash, createPublicKey, verify } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";
import {
  getExecutedConformanceReceipt,
  isExecutedConformanceRun,
  type CoverageResult,
} from "./coverage.ts";
import {
  ENFORCEMENT_KINDS,
  ID_PATTERN,
  bindingHash,
  loadRegistry,
  parseRegistryDocument,
  stableStringify,
  type EnforcementKind,
  type Registry,
} from "./registry.ts";

export const LEGACY_CONFORMANCE_RECORD_TYPE = "legacy-conformance-v1" as const;
export const STRUCTURED_PROOF_RECORD_TYPE = "structured-proof-v1" as const;
export const PROOF_REPORT_TYPE = "pnh-constitution-proof-report-v1" as const;
export const REVIEW_ARTIFACT_TYPE = "independent-proof-review-v1" as const;

const REGISTRY_PATH = "assurance/constitution/contracts/invariants.yaml";
const PROOF_TARGETS_PATH = "assurance/constitution/contracts/proof-targets.json";
const REVIEWER_TRUST_PATH = "assurance/constitution/contracts/reviewer-trust.json";
const EXECUTION_RUNNER_TRUST_PATH = "assurance/constitution/contracts/execution-runner-trust.json";
const PROOF_PRODUCER = Object.freeze({
  principal: "pnh:constitution-runner",
  role: "proof-producer",
});
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as Sha256Digest;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];
const UNSUPPORTED_LOADER_SPECIFIERS = new Set([
  "module",
  "node:module",
  "vm",
  "node:vm",
  "worker_threads",
  "node:worker_threads",
  "child_process",
  "node:child_process",
]);
const UNSUPPORTED_LOADER_PROPERTIES = new Set([
  "Function",
  "_load",
  "_linkedBinding",
  "binding",
  "constructor",
  "createRequire",
  "dlopen",
  "eval",
  "getBuiltinModule",
  "require",
  "runInContext",
  "runInNewContext",
  "runInThisContext",
]);
const UNSUPPORTED_LOADER_IDENTIFIERS = new Set([
  "Function",
  "createRequire",
  "eval",
  "getBuiltinModule",
  "require",
]);

export type Sha256Digest = `sha256:${string}`;

export interface LegacyConformanceRecord {
  readonly record_type: typeof LEGACY_CONFORMANCE_RECORD_TYPE;
  readonly invariant_id: string;
}

export interface FileEvidence {
  readonly path: string;
  readonly sha256: Sha256Digest;
}

export interface NamedTestEvidence extends FileEvidence {
  readonly name: string;
}

export interface BaselineEvidence extends FileEvidence {
  readonly baseline_id: string;
}

export interface DependencyClosure {
  readonly files: readonly FileEvidence[];
  readonly external_specifiers: readonly string[];
  readonly sha256: Sha256Digest;
}

export interface ProofControl {
  readonly kind: "fault-injection" | "disabled-control";
  readonly name: string;
}

export interface ProofProducer {
  readonly principal: string;
  readonly role: string;
}

export interface ProofEvidence {
  readonly invariant_id: string;
  readonly enforcement_kind: EnforcementKind;
  readonly invariant_binding_hash: Sha256Digest;
  readonly registry: FileEvidence;
  readonly ratification_baseline: BaselineEvidence;
  readonly proof_target_manifest: FileEvidence;
  readonly reviewer_trust: FileEvidence;
  readonly execution_runner_trust: FileEvidence;
  readonly test: NamedTestEvidence;
  readonly production_entrypoint: FileEvidence;
  readonly dependency_closure: DependencyClosure;
  readonly control?: ProofControl;
  // The fail-closed checker a static-structure proof exercises. Runtime-
  // adversarial proofs name a control instead; exactly one of the two applies.
  readonly checker?: string;
  // Where the signed independent-proof-review-v1 attestation for this target
  // lives. Carried from the trusted manifest and bound into the proof target
  // digest, so the attestation cannot be repointed by a registration. The
  // digest of its bytes is deliberately not bound: the attestation names the
  // report digest, which depends on this registration.
  readonly review_attestation: string;
  // Known gaps the proof does not close, carried from the trusted manifest and
  // bound into the proof target digest so a gap cannot be dropped silently.
  readonly limitations?: readonly string[];
  readonly producer: ProofProducer;
}

export interface ProofRegistration extends ProofEvidence {
  readonly record_type: typeof STRUCTURED_PROOF_RECORD_TYPE;
  readonly proof_target_digest: Sha256Digest;
  readonly review_artifact: FileEvidence;
}

export interface ProofEvidenceSource {
  readonly invariantId: string;
  readonly testFile: string;
  readonly testName: string;
}

export interface ProofRegistrationSource extends ProofEvidenceSource {
}

export interface ProofEvidenceCandidate {
  readonly source: ProofEvidenceSource;
  readonly evidence: ProofEvidence;
}

export interface ReportParseError {
  readonly line: number;
  readonly code: "invalid-json" | "invalid-record" | "invalid-test-result";
  readonly message: string;
}

export interface ProofExecutionIdentity {
  readonly result: "passed";
  readonly exit_code: 0;
  readonly test_files: readonly FileEvidence[];
  readonly sha256: Sha256Digest;
  readonly authentication?: {
    readonly scheme: "ed25519";
    readonly key_id: string;
    readonly principal: string;
    readonly role: string;
    readonly signature: string;
  };
}

export interface ProofReport {
  readonly schema_version: 1;
  readonly report_type: typeof PROOF_REPORT_TYPE;
  readonly registry: FileEvidence;
  readonly ratification_baseline: BaselineEvidence;
  readonly proof_target_manifest: FileEvidence;
  readonly reviewer_trust: FileEvidence;
  readonly execution_runner_trust: FileEvidence;
  readonly execution: ProofExecutionIdentity;
  readonly proofs: readonly ProofRegistration[];
  readonly report_digest: Sha256Digest;
}

export interface ProofReportBuildInput {
  readonly repoRoot: string;
  readonly run: CoverageResult;
}

export interface IndependentReviewAttestation {
  readonly schema_version: 1;
  readonly artifact_type: typeof REVIEW_ARTIFACT_TYPE;
  readonly reviewer: {
    readonly principal: string;
    readonly role: string;
  };
  readonly proof_producer_principal: string;
  readonly target: {
    readonly invariant_id: string;
    readonly proof_target_digest: Sha256Digest;
    readonly proof_report_digest: Sha256Digest;
  };
  readonly verdict: "accepted";
  readonly unresolved_findings: {
    readonly critical: 0;
    readonly important: 0;
  };
  readonly authentication: {
    readonly scheme: "ed25519";
    readonly key_id: string;
    readonly signature: string;
  };
}

export interface ExpectedReviewTarget {
  readonly invariantId: string;
  readonly proofTargetDigest: Sha256Digest;
  readonly proofReportDigest: Sha256Digest;
  readonly producerPrincipal: string;
}

export interface TrustedReviewer {
  readonly principal: string;
  readonly role: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
}

interface ProofTargetManifestEntry {
  readonly invariant_id: string;
  readonly test_file: string;
  readonly test_name: string;
  readonly review_artifact: string;
  readonly review_attestation: string;
  readonly production_entrypoint: string;
  readonly control?: ProofControl;
  readonly checker?: string;
  readonly limitations?: readonly string[];
}

interface ProofTargetManifest {
  readonly schema_version: 1;
  readonly targets: readonly ProofTargetManifestEntry[];
}

interface ReviewerTrustStore {
  readonly schema_version: 1;
  readonly owner: string;
  readonly reviewers: readonly TrustedReviewer[];
}

interface ExecutionRunnerTrustStore {
  readonly schema_version: 1;
  readonly owner: string;
  readonly runners: readonly TrustedReviewer[];
}

export class ProofReportError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(errors.join("\n"));
    this.name = "ProofReportError";
    this.errors = Object.freeze([...errors]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function checkUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  where: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${where}: unknown field ${key}`);
  }
}

function canonicalRepoPath(path: unknown): path is string {
  if (!isNonEmptyString(path) || isAbsolute(path) || path.includes("\\") || path.includes("\0")) {
    return false;
  }
  if (posix.normalize(path) !== path) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isContained(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function resolveRepoFile(repoRoot: string, path: string): string {
  if (!canonicalRepoPath(path)) {
    throw new ProofReportError([`${path}: path must be canonical and repository-relative`]);
  }
  try {
    const root = realpathSync(repoRoot);
    const candidate = resolve(root, path);
    if (!isContained(root, candidate)) {
      throw new Error("escape");
    }
    let current = root;
    for (const segment of path.split("/")) {
      current = resolve(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error("symlink");
    }
    const canonical = realpathSync(candidate);
    if (!isContained(root, canonical) || !lstatSync(canonical).isFile()) {
      throw new Error("not file");
    }
    return canonical;
  } catch {
    throw new ProofReportError([`${path}: cannot resolve as a regular repository file`]);
  }
}

function sha256(bytes: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function digestFile(repoRoot: string, path: string): Sha256Digest {
  return sha256(readFileSync(resolveRepoFile(repoRoot, path)));
}

function validateFileEvidence(value: unknown, where: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${where} must be an object`);
    return;
  }
  checkUnknown(value, new Set(["path", "sha256"]), where, errors);
  if (!canonicalRepoPath(value.path)) {
    errors.push(`${where}.path must be canonical and repository-relative`);
  }
  if (!isDigest(value.sha256)) {
    errors.push(`${where}.sha256 must be a canonical sha256 digest`);
  }
}

function validateBaselineEvidence(value: unknown, where: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${where} must be an object`);
    return;
  }
  checkUnknown(value, new Set(["path", "sha256", "baseline_id"]), where, errors);
  validateFileEvidenceProjection(value, where, errors);
  if (!isNonEmptyString(value.baseline_id)) errors.push(`${where}.baseline_id must be non-empty`);
}

function validateFileEvidenceProjection(
  value: Record<string, unknown>,
  where: string,
  errors: string[],
): void {
  if (!canonicalRepoPath(value.path)) {
    errors.push(`${where}.path must be canonical and repository-relative`);
  }
  if (!isDigest(value.sha256)) {
    errors.push(`${where}.sha256 must be a canonical sha256 digest`);
  }
}

function validateTestEvidence(value: unknown, where: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${where} must be an object`);
    return;
  }
  checkUnknown(value, new Set(["path", "sha256", "name"]), where, errors);
  validateFileEvidenceProjection(value, where, errors);
  if (!isNonEmptyString(value.name)) errors.push(`${where}.name must be non-empty`);
}

function closureDigest(
  files: readonly FileEvidence[],
  externalSpecifiers: readonly string[],
): Sha256Digest {
  return sha256(stableStringify({ files, external_specifiers: externalSpecifiers }));
}

function validateDependencyClosure(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("dependency_closure must be an object");
    return;
  }
  checkUnknown(
    value,
    new Set(["files", "external_specifiers", "sha256"]),
    "dependency_closure",
    errors,
  );
  if (!Array.isArray(value.files) || value.files.length === 0) {
    errors.push("dependency_closure.files must be a non-empty array");
  } else {
    for (const [index, file] of value.files.entries()) {
      validateFileEvidence(file, `dependency_closure.files[${index}]`, errors);
    }
    const typed = value.files.filter((file): file is FileEvidence =>
      isRecord(file) && canonicalRepoPath(file.path) && isDigest(file.sha256));
    if (typed.length === value.files.length) {
      const paths = typed.map(({ path }) => path);
      if (new Set(paths).size !== paths.length ||
          paths.some((path, index) =>
            index > 0 && codeUnitCompare(path, paths[index - 1]!) <= 0)) {
        errors.push("dependency_closure.files must be unique and sorted by path");
      }
    }
  }
  const externalSpecifiers = value.external_specifiers;
  if (!Array.isArray(externalSpecifiers) ||
      externalSpecifiers.some((specifier) =>
        typeof specifier !== "string" || !specifier.startsWith("node:"))) {
    errors.push("dependency_closure.external_specifiers must contain only node: specifiers");
  } else if (new Set(externalSpecifiers).size !== externalSpecifiers.length ||
             externalSpecifiers.some((specifier, index) =>
               index > 0 && specifier <= externalSpecifiers[index - 1]!)) {
    errors.push("dependency_closure.external_specifiers must be unique and code-unit sorted");
  }
  if (Array.isArray(value.files) && Array.isArray(value.external_specifiers)) {
    const typed = value.files.filter((file): file is FileEvidence =>
      isRecord(file) && canonicalRepoPath(file.path) && isDigest(file.sha256));
    const external = value.external_specifiers.filter((specifier): specifier is string =>
      typeof specifier === "string");
    if (typed.length === value.files.length && external.length === value.external_specifiers.length &&
        value.sha256 !== closureDigest(typed, external)) {
      errors.push("dependency_closure.sha256 does not match its evidence");
    }
  }
  if (!isDigest(value.sha256)) {
    errors.push("dependency_closure.sha256 must be a canonical sha256 digest");
  }
}

function validateControl(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("control must be an object");
    return;
  }
  checkUnknown(value, new Set(["kind", "name"]), "control", errors);
  if (value.kind !== "fault-injection" && value.kind !== "disabled-control") {
    errors.push("control.kind must be fault-injection or disabled-control");
  }
  if (!isNonEmptyString(value.name)) errors.push("control.name must be non-empty");
}

function validateLimitations(value: unknown, where: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${where}.limitations must be a non-empty array`);
    return;
  }
  if (!value.every((entry) => isNonEmptyString(entry))) {
    errors.push(`${where}.limitations entries must be non-empty strings`);
  }
}

function validateProducer(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("producer must be an object");
    return;
  }
  checkUnknown(value, new Set(["principal", "role"]), "producer", errors);
  if (!isNonEmptyString(value.principal)) errors.push("producer.principal must be non-empty");
  if (!isNonEmptyString(value.role)) errors.push("producer.role must be non-empty");
}

const PROOF_FIELDS = new Set([
  "record_type",
  "invariant_id",
  "enforcement_kind",
  "invariant_binding_hash",
  "registry",
  "ratification_baseline",
  "proof_target_manifest",
  "reviewer_trust",
  "execution_runner_trust",
  "test",
  "production_entrypoint",
  "dependency_closure",
  "control",
  "checker",
  "review_attestation",
  "limitations",
  "producer",
  "proof_target_digest",
  "review_artifact",
]);

export function proofTargetDigest(value: ProofEvidence | ProofRegistration): Sha256Digest {
  const projection = {
    invariant_id: value.invariant_id,
    enforcement_kind: value.enforcement_kind,
    invariant_binding_hash: value.invariant_binding_hash,
    registry: value.registry,
    ratification_baseline: value.ratification_baseline,
    proof_target_manifest: value.proof_target_manifest,
    reviewer_trust: value.reviewer_trust,
    execution_runner_trust: value.execution_runner_trust,
    test: value.test,
    production_entrypoint: value.production_entrypoint,
    dependency_closure: value.dependency_closure,
    ...(value.control === undefined ? {} : { control: value.control }),
    ...(value.checker === undefined ? {} : { checker: value.checker }),
    review_attestation: value.review_attestation,
    ...(value.limitations === undefined ? {} : { limitations: value.limitations }),
    producer: value.producer,
  };
  return sha256(stableStringify(projection));
}

export function validateProofRegistration(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["proof registration must be an object"];
  checkUnknown(value, PROOF_FIELDS, "proof registration", errors);
  if (value.record_type !== STRUCTURED_PROOF_RECORD_TYPE) {
    errors.push(`record_type must be ${STRUCTURED_PROOF_RECORD_TYPE}`);
  }
  if (typeof value.invariant_id !== "string" || !ID_PATTERN.test(value.invariant_id)) {
    errors.push("invariant_id must be a canonical PNH invariant ID");
  }
  if (!ENFORCEMENT_KINDS.includes(value.enforcement_kind as EnforcementKind)) {
    errors.push("enforcement_kind is invalid");
  }
  if (!isDigest(value.invariant_binding_hash)) {
    errors.push("invariant_binding_hash must be a canonical sha256 digest");
  }
  validateFileEvidence(value.registry, "registry", errors);
  validateBaselineEvidence(value.ratification_baseline, "ratification_baseline", errors);
  validateFileEvidence(value.proof_target_manifest, "proof_target_manifest", errors);
  validateFileEvidence(value.reviewer_trust, "reviewer_trust", errors);
  validateFileEvidence(value.execution_runner_trust, "execution_runner_trust", errors);
  validateTestEvidence(value.test, "test", errors);
  if (!("production_entrypoint" in value)) {
    errors.push("production_entrypoint is required");
  } else {
    validateFileEvidence(value.production_entrypoint, "production_entrypoint", errors);
  }
  validateDependencyClosure(value.dependency_closure, errors);
  if (value.enforcement_kind === "runtime-adversarial" && !("control" in value)) {
    errors.push("control is required for runtime-adversarial proof");
  } else if (value.control !== undefined) {
    validateControl(value.control, errors);
  }
  if (value.enforcement_kind === "static-structure" && !("checker" in value)) {
    errors.push("checker is required for static-structure proof");
  } else if (value.checker !== undefined) {
    if (value.enforcement_kind === "runtime-adversarial") {
      errors.push("runtime-adversarial proof names a control, not a checker");
    }
    if (!isNonEmptyString(value.checker)) errors.push("checker must be a non-empty string");
  }
  if (!canonicalRepoPath(value.review_attestation)) {
    errors.push("review_attestation must be canonical and repository-relative");
  }
  if (value.limitations !== undefined) {
    validateLimitations(value.limitations, "proof registration", errors);
  }
  validateProducer(value.producer, errors);
  if (!isDigest(value.proof_target_digest)) {
    errors.push("proof_target_digest must be a canonical sha256 digest");
  }
  validateFileEvidence(value.review_artifact, "review_artifact", errors);
  if (errors.length === 0 &&
      value.proof_target_digest !== proofTargetDigest(value as unknown as ProofRegistration)) {
    errors.push("proof_target_digest does not match registration evidence");
  }
  return errors;
}

function resolveImportPath(repoRoot: string, fromPath: string, specifier: string): string {
  const parent = posix.dirname(fromPath);
  const unresolved = posix.normalize(posix.join(parent, specifier));
  if (!canonicalRepoPath(unresolved)) {
    throw new ProofReportError([`${fromPath}: import ${specifier} escapes the repository`]);
  }
  const candidates = [unresolved];
  const extension = posix.extname(unresolved);
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    const stem = unresolved.slice(0, -extension.length);
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`);
  }
  for (const suffix of SOURCE_EXTENSIONS) candidates.push(`${unresolved}${suffix}`);
  for (const suffix of SOURCE_EXTENSIONS) candidates.push(`${unresolved}/index${suffix}`);
  for (const candidate of candidates) {
    try {
      resolveRepoFile(repoRoot, candidate);
      return candidate;
    } catch {
      // Try the next source resolution candidate.
    }
  }
  throw new ProofReportError([`${fromPath}: relative import ${specifier} cannot be resolved`]);
}

function resolveWorkspacePackageImport(
  repoRoot: string,
  specifier: string,
): { readonly sourcePath: string; readonly manifestPath: string } | null {
  const match = /^@useprism\/([a-z0-9-]+)(\/.*)?$/u.exec(specifier);
  if (match === null) return null;
  const packageName = match[1]!;
  const manifestPath = `packages/${packageName}/package.json`;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(resolveRepoFile(repoRoot, manifestPath), "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(manifest) || manifest.name !== `@useprism/${packageName}` ||
      !isRecord(manifest.exports)) {
    return null;
  }
  const subpath = match[2] === undefined ? "." : `.${match[2]}`;
  const exported = manifest.exports[subpath];
  const emitted = typeof exported === "string"
    ? exported
    : isRecord(exported) && typeof exported.import === "string"
    ? exported.import
    : null;
  if (emitted === null || !emitted.startsWith("./dist/") || !emitted.endsWith(".js")) {
    return null;
  }
  const sourceStem = emitted.slice("./dist/".length, -".js".length);
  const candidates = [
    `packages/${packageName}/src/${sourceStem}.ts`,
    `packages/${packageName}/src/${sourceStem}.mts`,
  ];
  for (const candidate of candidates) {
    try {
      resolveRepoFile(repoRoot, candidate);
      return { sourcePath: candidate, manifestPath };
    } catch {
      // Try the next source form.
    }
  }
  return null;
}

function sourceImports(path: string, source: string): readonly string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly !== true &&
          ts.isStringLiteral(node.moduleSpecifier)) {
        if (UNSUPPORTED_LOADER_SPECIFIERS.has(node.moduleSpecifier.text)) {
          throw new ProofReportError([
            `${path}: executable loader module ${node.moduleSpecifier.text} is unsupported`,
          ]);
        }
        imports.add(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier !== undefined &&
          ts.isStringLiteral(node.moduleSpecifier)) {
        imports.add(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node) &&
               ts.isExternalModuleReference(node.moduleReference) &&
               node.moduleReference.expression !== undefined &&
               ts.isStringLiteral(node.moduleReference.expression)) {
      imports.add(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) &&
               (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]!)) {
        throw new ProofReportError([`${path}: dynamic dependency specifier is not a string literal`]);
      }
      imports.add(node.arguments[0]!.text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
               ["createRequire", "eval", "Function"].includes(node.expression.text)) {
      throw new ProofReportError([
        `${path}: executable loader ${node.expression.text} is unsupported`,
      ]);
    } else if (ts.isPropertyAccessExpression(node) &&
               UNSUPPORTED_LOADER_PROPERTIES.has(node.name.text)) {
      throw new ProofReportError([
        `${path}: executable loader property ${node.name.text} is unsupported`,
      ]);
    } else if (ts.isElementAccessExpression(node) &&
               node.argumentExpression !== undefined &&
               (ts.isStringLiteral(node.argumentExpression) ||
                ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) &&
               UNSUPPORTED_LOADER_PROPERTIES.has(node.argumentExpression.text)) {
      throw new ProofReportError([
        `${path}: executable loader property ${node.argumentExpression.text} is unsupported`,
      ]);
    } else if (ts.isBindingElement(node)) {
      const property = node.propertyName ?? node.name;
      if ((ts.isIdentifier(property) || ts.isStringLiteral(property)) &&
          UNSUPPORTED_LOADER_PROPERTIES.has(property.text)) {
        throw new ProofReportError([
          `${path}: executable loader property ${property.text} is unsupported`,
        ]);
      }
    } else if (ts.isIdentifier(node) && UNSUPPORTED_LOADER_IDENTIFIERS.has(node.text)) {
      const directLiteralRequire = node.text === "require" &&
        ts.isCallExpression(node.parent) && node.parent.expression === node &&
        node.parent.arguments.length === 1 && ts.isStringLiteral(node.parent.arguments[0]!);
      if (!directLiteralRequire) {
        throw new ProofReportError([
          `${path}: executable loader reference ${node.text} is unsupported`,
        ]);
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
               node.expression.text === "Function") {
      throw new ProofReportError([`${path}: executable loader Function is unsupported`]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...imports].sort(codeUnitCompare);
}

export function collectDependencyClosure(
  repoRoot: string,
  productionEntrypoint: string,
): DependencyClosure {
  const pending = [productionEntrypoint];
  const seen = new Set<string>();
  const externalSpecifiers = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    const absolute = resolveRepoFile(repoRoot, current);
    seen.add(current);
    const source = readFileSync(absolute, "utf8");
    for (const specifier of sourceImports(current, source)) {
      if (UNSUPPORTED_LOADER_SPECIFIERS.has(specifier)) {
        throw new ProofReportError([
          `${current}: executable loader module ${specifier} is unsupported`,
        ]);
      } else if (specifier.startsWith(".")) {
        const imported = resolveImportPath(repoRoot, current, specifier);
        if (!seen.has(imported)) pending.push(imported);
      } else if (specifier.startsWith("node:")) {
        externalSpecifiers.add(specifier);
      } else {
        const workspaceImport = resolveWorkspacePackageImport(repoRoot, specifier);
        if (workspaceImport === null) {
          throw new ProofReportError([
            `${current}: external package dependency ${specifier} is not pinned by the proof contract`,
          ]);
        }
        seen.add(workspaceImport.manifestPath);
        if (!seen.has(workspaceImport.sourcePath)) pending.push(workspaceImport.sourcePath);
      }
    }
  }
  const files = [...seen].sort(codeUnitCompare)
    .map((path) => ({ path, sha256: digestFile(repoRoot, path) }));
  const external = [...externalSpecifiers].sort(codeUnitCompare);
  return Object.freeze({
    files: Object.freeze(files),
    external_specifiers: Object.freeze(external),
    sha256: closureDigest(files, external),
  });
}

function readBaselineId(repoRoot: string, path: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolveRepoFile(repoRoot, path), "utf8"));
  } catch {
    throw new ProofReportError([`${path}: ratification baseline is not valid JSON`]);
  }
  if (!isRecord(parsed) || !isNonEmptyString(parsed.baseline_id)) {
    throw new ProofReportError([`${path}: ratification baseline has no baseline_id`]);
  }
  return parsed.baseline_id;
}

function readJsonObject(repoRoot: string, path: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolveRepoFile(repoRoot, path), "utf8"));
  } catch {
    throw new ProofReportError([`${path}: ${label} is not valid JSON`]);
  }
  if (!isRecord(parsed)) throw new ProofReportError([`${path}: ${label} must be an object`]);
  return parsed;
}

function loadProofTargetManifest(repoRoot: string): ProofTargetManifest {
  const parsed = readJsonObject(repoRoot, PROOF_TARGETS_PATH, "proof target manifest");
  const errors: string[] = [];
  const normalized: ProofTargetManifestEntry[] = [];
  checkUnknown(parsed, new Set(["schema_version", "targets"]), "proof target manifest", errors);
  if (parsed.schema_version !== 1) errors.push("proof target manifest schema_version must be 1");
  if (!Array.isArray(parsed.targets)) {
    errors.push("proof target manifest targets must be an array");
  } else {
    const seen = new Map<string, string>();
    for (const [index, target] of parsed.targets.entries()) {
      const where = `proof target manifest targets[${index}]`;
      if (!isRecord(target)) {
        errors.push(`${where} must be an object`);
        continue;
      }
      checkUnknown(
        target,
        new Set([
          "invariant_id",
          "test_file",
          "test_name",
          "review_artifact",
          "review_attestation",
          "production_entrypoint",
          "control",
          "checker",
          "limitations",
        ]),
        where,
        errors,
      );
      if (typeof target.invariant_id !== "string" || !ID_PATTERN.test(target.invariant_id)) {
        errors.push(`${where}.invariant_id is invalid`);
      }
      if (!canonicalRepoPath(target.test_file)) {
        errors.push(`${where}.test_file must be canonical and repository-relative`);
      }
      if (!isNonEmptyString(target.test_name)) errors.push(`${where}.test_name must be non-empty`);
      if (!canonicalRepoPath(target.review_artifact)) {
        errors.push(`${where}.review_artifact must be canonical and repository-relative`);
      }
      if (!canonicalRepoPath(target.review_attestation)) {
        errors.push(`${where}.review_attestation must be canonical and repository-relative`);
      }
      if (!canonicalRepoPath(target.production_entrypoint)) {
        errors.push(`${where}.production_entrypoint must be canonical and repository-relative`);
      }
      if (target.control !== undefined) validateControl(target.control, errors);
      if (target.checker !== undefined && !isNonEmptyString(target.checker)) {
        errors.push(`${where}.checker must be a non-empty string`);
      }
      if (target.limitations !== undefined) validateLimitations(target.limitations, where, errors);
      if (typeof target.invariant_id === "string" && typeof target.test_file === "string" &&
          typeof target.test_name === "string") {
        const key = `${target.invariant_id}\0${target.test_file}\0${target.test_name}`;
        const serialized = stableStringify(target);
        const prior = seen.get(key);
        if (prior !== undefined && prior !== serialized) {
          errors.push(`${where}: conflicting duplicate trusted proof target`);
        } else if (prior === undefined) {
          seen.set(key, serialized);
          normalized.push(target as unknown as ProofTargetManifestEntry);
        }
      }
    }
  }
  if (errors.length > 0) throw new ProofReportError(errors);
  return { schema_version: 1, targets: normalized };
}

/**
 * Registry bytes supplied by a caller instead of the working tree. Only the
 * guarded updater path uses this, so a lock transition can be judged against the
 * registry state its proof report actually pinned. The caller must have proved
 * the bytes hash to that pin before handing them over.
 */
export interface PriorRegistrySource {
  readonly contents: string;
}

function currentRegistryEvidence(repoRoot: string, prior?: PriorRegistrySource): {
  readonly registry: Registry;
  readonly registryEvidence: FileEvidence;
  readonly baselineEvidence: BaselineEvidence;
  readonly targetManifest: ProofTargetManifest;
  readonly targetManifestEvidence: FileEvidence;
  readonly reviewerTrustEvidence: FileEvidence;
  readonly executionRunnerTrustEvidence: FileEvidence;
} {
  const registry = prior === undefined
    ? loadRegistry(resolveRepoFile(repoRoot, REGISTRY_PATH))
    : parseRegistryDocument(prior.contents);
  const registryEvidence = {
    path: REGISTRY_PATH,
    sha256: prior === undefined ? digestFile(repoRoot, REGISTRY_PATH) : sha256(prior.contents),
  };
  const baselinePath = registry.ratification_baseline.path;
  const baselineDigest = digestFile(repoRoot, baselinePath);
  if (baselineDigest !== registry.ratification_baseline.sha256) {
    throw new ProofReportError([`${baselinePath}: bytes do not match the registry baseline pin`]);
  }
  return {
    registry,
    registryEvidence,
    baselineEvidence: {
      path: baselinePath,
      sha256: baselineDigest,
      baseline_id: readBaselineId(repoRoot, baselinePath),
    },
    targetManifest: loadProofTargetManifest(repoRoot),
    targetManifestEvidence: {
      path: PROOF_TARGETS_PATH,
      sha256: digestFile(repoRoot, PROOF_TARGETS_PATH),
    },
    reviewerTrustEvidence: {
      path: REVIEWER_TRUST_PATH,
      sha256: digestFile(repoRoot, REVIEWER_TRUST_PATH),
    },
    executionRunnerTrustEvidence: {
      path: EXECUTION_RUNNER_TRUST_PATH,
      sha256: digestFile(repoRoot, EXECUTION_RUNNER_TRUST_PATH),
    },
  };
}

export function collectProofEvidence(
  source: ProofEvidenceSource,
  repoRoot: string,
  prior?: PriorRegistrySource,
): ProofEvidence {
  if (!ID_PATTERN.test(source.invariantId)) {
    throw new ProofReportError(["proof source invariantId is invalid"]);
  }
  if (!isNonEmptyString(source.testName)) throw new ProofReportError(["proof source testName is empty"]);
  const current = currentRegistryEvidence(repoRoot, prior);
  const invariant = current.registry.invariants.find(({ id }) => id === source.invariantId);
  if (invariant === undefined) throw new ProofReportError([`unknown invariant ${source.invariantId}`]);
  if (!invariant.conformance.includes(source.testFile)) {
    throw new ProofReportError([`${source.invariantId}: test file is not declared as conformance`]);
  }
  const target = current.targetManifest.targets.find((entry) =>
    entry.invariant_id === source.invariantId && entry.test_file === source.testFile &&
    entry.test_name === source.testName);
  if (target === undefined) throw new ProofReportError([`${source.invariantId}: no trusted proof target`]);
  if (invariant.enforcement_kind === "runtime-adversarial" && target.control === undefined) {
    throw new ProofReportError(["control is required for runtime-adversarial proof"]);
  }
  if (invariant.enforcement_kind === "static-structure" && target.checker === undefined) {
    throw new ProofReportError(["checker is required for static-structure proof"]);
  }
  const evidence: ProofEvidence = {
    invariant_id: invariant.id,
    enforcement_kind: invariant.enforcement_kind,
    invariant_binding_hash: bindingHash(invariant),
    registry: current.registryEvidence,
    ratification_baseline: current.baselineEvidence,
    proof_target_manifest: current.targetManifestEvidence,
    reviewer_trust: current.reviewerTrustEvidence,
    execution_runner_trust: current.executionRunnerTrustEvidence,
    test: {
      path: source.testFile,
      sha256: digestFile(repoRoot, source.testFile),
      name: source.testName,
    },
    production_entrypoint: {
      path: target.production_entrypoint,
      sha256: digestFile(repoRoot, target.production_entrypoint),
    },
    dependency_closure: collectDependencyClosure(repoRoot, target.production_entrypoint),
    ...(target.control === undefined ? {} : { control: Object.freeze({ ...target.control }) }),
    ...(target.checker === undefined ? {} : { checker: target.checker }),
    review_attestation: target.review_attestation,
    ...(target.limitations === undefined
      ? {}
      : { limitations: Object.freeze([...target.limitations]) }),
    producer: PROOF_PRODUCER,
  };
  return Object.freeze(evidence);
}

export function createProofRegistration(
  source: ProofRegistrationSource,
  repoRoot: string,
): ProofRegistration {
  const evidence = collectProofEvidence(source, repoRoot);
  const registration: ProofRegistration = {
    record_type: STRUCTURED_PROOF_RECORD_TYPE,
    ...evidence,
    proof_target_digest: proofTargetDigest(evidence),
    review_artifact: {
      path: targetReviewArtifact(source, repoRoot),
      sha256: digestFile(repoRoot, targetReviewArtifact(source, repoRoot)),
    },
  };
  const errors = validateProofRegistration(registration);
  if (errors.length > 0) throw new ProofReportError(errors);
  return Object.freeze(registration);
}

export function targetReviewArtifact(source: ProofEvidenceSource, repoRoot: string): string {
  return exactTarget(source, repoRoot).review_artifact;
}

export function targetReviewAttestation(source: ProofEvidenceSource, repoRoot: string): string {
  return exactTarget(source, repoRoot).review_attestation;
}

function exactTarget(source: ProofEvidenceSource, repoRoot: string): ProofTargetManifestEntry {
  const target = loadProofTargetManifest(repoRoot).targets.find((entry) =>
    entry.invariant_id === source.invariantId && entry.test_file === source.testFile &&
    entry.test_name === source.testName);
  if (target === undefined) {
    throw new ProofReportError([`${source.invariantId}: no exact trusted proof target`]);
  }
  return target;
}

export function createPassedProofRegistrations(
  repoRoot: string,
  executedFiles: readonly string[],
  passedTests: readonly {
    readonly testFile: string;
    readonly testName: string;
  }[],
): readonly ProofRegistration[] {
  const executed = new Set(executedFiles);
  const passed = new Set(passedTests.map(({ testFile, testName }) =>
    `${testFile}\0${testName}`));
  return Object.freeze(loadProofTargetManifest(repoRoot).targets
    .filter((target) => executed.has(target.test_file) &&
      passed.has(`${target.test_file}\0${target.test_name}`))
    .map((target) => createProofRegistration({
      invariantId: target.invariant_id,
      testFile: target.test_file,
      testName: target.test_name,
    }, repoRoot)));
}

export function collectProofEvidenceForExecutedFiles(
  repoRoot: string,
  executedFiles: readonly string[],
): readonly ProofEvidenceCandidate[] {
  const executed = new Set(executedFiles);
  return Object.freeze(loadProofTargetManifest(repoRoot).targets
    .filter((target) => executed.has(target.test_file))
    .map((target) => {
      const source = Object.freeze({
        invariantId: target.invariant_id,
        testFile: target.test_file,
        testName: target.test_name,
      });
      return Object.freeze({
        source,
        evidence: collectProofEvidence(source, repoRoot),
      });
    }));
}


function reportProjection(report: Omit<ProofReport, "report_digest">): unknown {
  return {
    ...report,
    proofs: report.proofs.map((proof) => ({
      ...proof,
      review_artifact: { path: proof.review_artifact.path, sha256: ZERO_DIGEST },
    })),
  };
}

export function executionDigest(
  testFiles: readonly FileEvidence[],
  proofs: readonly ProofRegistration[],
): Sha256Digest {
  const normalizedProofs = [...new Map(
    proofs.map((proof) => [stableStringify(proof), proof] as const),
  ).values()].sort(compareProofs);
  return sha256(stableStringify({
    result: "passed",
    exit_code: 0,
    test_files: testFiles,
    proofs: normalizedProofs.map((proof) => ({
      ...proof,
      review_artifact: { path: proof.review_artifact.path, sha256: ZERO_DIGEST },
    })),
  }));
}

export function executionSigningPayload(
  execution: Pick<ProofExecutionIdentity, "result" | "exit_code" | "test_files" | "sha256">,
): unknown {
  return {
    schema_version: 1,
    result: execution.result,
    exit_code: execution.exit_code,
    test_files: execution.test_files,
    sha256: execution.sha256,
  };
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function proofKey(proof: ProofRegistration): string {
  return `${proof.invariant_id}\0${proof.test.path}\0${proof.test.name}`;
}

function compareProofs(left: ProofRegistration, right: ProofRegistration): number {
  return codeUnitCompare(proofKey(left), proofKey(right)) ||
    codeUnitCompare(left.proof_target_digest, right.proof_target_digest);
}

export function validateProofReportAgainstRepository(
  report: ProofReport,
  repoRoot: string,
  prior?: PriorRegistrySource,
): string[] {
  const errors: string[] = [];
  if (prior !== undefined && sha256(prior.contents) !== report.registry.sha256) {
    return ["prior registry bytes do not match the proof report registry digest"];
  }
  let current: ReturnType<typeof currentRegistryEvidence>;
  try {
    current = currentRegistryEvidence(repoRoot, prior);
  } catch (error) {
    return error instanceof ProofReportError ? [...error.errors] : [String(error)];
  }
  if (stableStringify(report.registry) !== stableStringify(current.registryEvidence)) {
    errors.push("proof report registry identity differs from current bytes");
  }
  if (stableStringify(report.ratification_baseline) !== stableStringify(current.baselineEvidence)) {
    errors.push("proof report baseline identity differs from current bytes");
  }
  if (stableStringify(report.proof_target_manifest) !==
      stableStringify(current.targetManifestEvidence)) {
    errors.push("proof report target manifest identity differs from current bytes");
  }
  if (stableStringify(report.reviewer_trust) !==
      stableStringify(current.reviewerTrustEvidence)) {
    errors.push("proof report reviewer trust identity differs from current bytes");
  }
  if (stableStringify(report.execution_runner_trust) !==
      stableStringify(current.executionRunnerTrustEvidence)) {
    errors.push("proof report execution runner trust identity differs from current bytes");
  }
  for (const proof of report.proofs) {
    const invariant = current.registry.invariants.find(({ id }) => id === proof.invariant_id);
    if (invariant === undefined) {
      errors.push(`unknown invariant ${proof.invariant_id}`);
      continue;
    }
    if (proof.enforcement_kind !== invariant.enforcement_kind) {
      errors.push(
        `${proof.invariant_id}: enforcement kind ${proof.enforcement_kind} does not match registry ${invariant.enforcement_kind}`,
      );
    }
    if (!invariant.conformance.includes(proof.test.path)) {
      errors.push(`${proof.invariant_id}: test file is not declared as conformance`);
    }
    if (!report.execution.test_files.some(({ path }) => path === proof.test.path)) {
      errors.push(`${proof.invariant_id}: proof test was not in the executed file set`);
    }
    try {
      const evidence = collectProofEvidence({
        invariantId: proof.invariant_id,
        testFile: proof.test.path,
        testName: proof.test.name,
      }, repoRoot, prior);
      if (proof.invariant_binding_hash !== evidence.invariant_binding_hash) {
        errors.push(`${proof.invariant_id}: invariant binding hash differs from current law`);
      }
      if (stableStringify(proof.registry) !== stableStringify(evidence.registry)) {
        errors.push(`${proof.invariant_id}: registry identity differs from current bytes`);
      }
      if (stableStringify(proof.ratification_baseline) !== stableStringify(evidence.ratification_baseline)) {
        errors.push(`${proof.invariant_id}: ratification baseline identity differs from current bytes`);
      }
      if (stableStringify(proof.proof_target_manifest) !==
          stableStringify(evidence.proof_target_manifest)) {
        errors.push(`${proof.invariant_id}: proof target manifest differs from current bytes`);
      }
      if (stableStringify(proof.execution_runner_trust) !==
          stableStringify(evidence.execution_runner_trust)) {
        errors.push(`${proof.invariant_id}: execution runner trust differs from current bytes`);
      }
      if (stableStringify(proof.test) !== stableStringify(evidence.test)) {
        errors.push(`${proof.invariant_id}: test evidence differs from current bytes`);
      }
      if (stableStringify(proof.production_entrypoint) !== stableStringify(evidence.production_entrypoint)) {
        errors.push(`${proof.invariant_id}: production entrypoint differs from current bytes`);
      }
      if (stableStringify(proof.dependency_closure) !== stableStringify(evidence.dependency_closure)) {
        errors.push(`${proof.invariant_id}: dependency closure differs from current bytes`);
      }
      if (proof.proof_target_digest !== proofTargetDigest(evidence)) {
        errors.push(`${proof.invariant_id}: proof target differs from current evidence`);
      }
      // The declared path comes from the trusted manifest, never from the
      // registration: this field carries the independent-review authority.
      const declaredReview = targetReviewArtifact({
        invariantId: proof.invariant_id,
        testFile: proof.test.path,
        testName: proof.test.name,
      }, repoRoot);
      if (proof.review_artifact.path !== declaredReview) {
        errors.push(
          `${proof.invariant_id}: review artifact is not the path declared in the trusted manifest`,
        );
      }
      if (proof.review_artifact.sha256 !== digestFile(repoRoot, declaredReview)) {
        errors.push(`${proof.invariant_id}: review artifact differs from current bytes`);
      }
    } catch (error) {
      const messages = error instanceof ProofReportError ? error.errors : [String(error)];
      errors.push(...messages.map((message) => `${proof.invariant_id}: ${message}`));
    }
  }
  for (const file of report.execution.test_files) {
    try {
      if (file.sha256 !== digestFile(repoRoot, file.path)) {
        errors.push(`${file.path}: executed test bytes differ from current bytes`);
      }
    } catch (error) {
      const messages = error instanceof ProofReportError ? error.errors : [String(error)];
      errors.push(...messages);
    }
  }
  try {
    errors.push(...verifyExecutionReceipt(report, repoRoot));
  } catch (error) {
    errors.push(...(error instanceof ProofReportError ? error.errors : [String(error)]));
  }
  return errors;
}

export function buildProofReport(input: ProofReportBuildInput): ProofReport {
  const errors: string[] = [];
  if (!isExecutedConformanceRun(input.run)) {
    throw new ProofReportError(["proof report requires an opaque runner-produced result"]);
  }
  const receipt = getExecutedConformanceReceipt(input.run);
  if (receipt === undefined) {
    throw new ProofReportError(["proof report requires an immutable executed-result receipt"]);
  }
  if (input.run.exitCode !== 0) errors.push("executed conformance run failed");
  if (input.run.parseErrors.length > 0) {
    errors.push("executed conformance report contains parse errors");
    errors.push(...input.run.parseErrors.map(({ message }) => message));
  }

  const unique = new Map<string, ProofRegistration>();
  const byKey = new Map<string, string>();
  for (const proof of receipt.structuredProofs) {
    errors.push(...validateProofRegistration(proof).map((error) => `${proof.invariant_id}: ${error}`));
    const serialized = stableStringify(proof);
    const key = proofKey(proof);
    const prior = byKey.get(key);
    if (prior !== undefined && prior !== serialized) {
      errors.push(`${proof.invariant_id}: conflicting duplicate proof registration`);
    } else {
      byKey.set(key, serialized);
      unique.set(serialized, proof);
    }
  }
  const proofs = [...unique.values()].sort(compareProofs);
  let current: ReturnType<typeof currentRegistryEvidence> | undefined;
  try {
    current = currentRegistryEvidence(input.repoRoot);
  } catch (error) {
    errors.push(...(error instanceof ProofReportError ? error.errors : [String(error)]));
  }

  const testFiles = receipt.testFiles;

  if (current !== undefined) {
    const unsigned: Omit<ProofReport, "report_digest"> = {
      schema_version: 1,
      report_type: PROOF_REPORT_TYPE,
      registry: current.registryEvidence,
      ratification_baseline: current.baselineEvidence,
      proof_target_manifest: current.targetManifestEvidence,
      reviewer_trust: current.reviewerTrustEvidence,
      execution_runner_trust: current.executionRunnerTrustEvidence,
      execution: {
        result: "passed",
        exit_code: 0,
        test_files: testFiles,
        sha256: receipt.executionDigest,
        ...(receipt.authentication === undefined
          ? {}
          : { authentication: receipt.authentication }),
      },
      proofs,
    };
    if (unsigned.execution.sha256 !== executionDigest(testFiles, proofs)) {
      errors.push("immutable execution receipt does not match its proof evidence");
    }
    if (proofs.length > 0 && receipt.authentication === undefined) {
      errors.push("structured proofs require an owner-pinned execution runner signature");
    }
    const provisional: Omit<ProofReport, "report_digest"> = unsigned;
    errors.push(...validateProofReportAgainstRepository(
      { ...provisional, report_digest: sha256(stableStringify(reportProjection(provisional))) },
      input.repoRoot,
    ));
    if (errors.length === 0) {
      return Object.freeze({
        ...provisional,
        report_digest: sha256(stableStringify(reportProjection(provisional))),
      });
    }
  }
  throw new ProofReportError(errors);
}

function validateExecution(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("execution must be an object");
    return;
  }
  checkUnknown(
    value,
    new Set(["result", "exit_code", "test_files", "sha256", "authentication"]),
    "execution",
    errors,
  );
  if (value.result !== "passed" || value.exit_code !== 0) {
    errors.push("execution must record a passed run with exit code 0");
  }
  if (!Array.isArray(value.test_files)) {
    errors.push("execution.test_files must be an array");
  } else {
    for (const [index, file] of value.test_files.entries()) {
      validateFileEvidence(file, `execution.test_files[${index}]`, errors);
    }
    const paths = value.test_files.flatMap((file) =>
      isRecord(file) && typeof file.path === "string" ? [file.path] : []);
    if (paths.length === value.test_files.length &&
        (new Set(paths).size !== paths.length ||
         paths.some((path, index) => index > 0 && codeUnitCompare(path, paths[index - 1]!) <= 0))) {
      errors.push("execution.test_files must be unique and code-unit sorted");
    }
  }
  if (!isDigest(value.sha256)) errors.push("execution.sha256 must be a canonical sha256 digest");
  if (value.authentication !== undefined) {
    if (!isRecord(value.authentication)) {
      errors.push("execution.authentication must be an object");
    } else {
      checkUnknown(
        value.authentication,
        new Set(["scheme", "key_id", "principal", "role", "signature"]),
        "execution.authentication",
        errors,
      );
      if (value.authentication.scheme !== "ed25519") {
        errors.push("execution authentication scheme must be ed25519");
      }
      for (const field of ["key_id", "principal", "role", "signature"] as const) {
        if (!isNonEmptyString(value.authentication[field])) {
          errors.push(`execution.authentication.${field} must be non-empty`);
        }
      }
    }
  }
}

export function validateProofReport(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["proof report must be an object"];
  checkUnknown(
    value,
    new Set([
      "schema_version",
      "report_type",
      "registry",
      "ratification_baseline",
      "proof_target_manifest",
      "reviewer_trust",
      "execution_runner_trust",
      "execution",
      "proofs",
      "report_digest",
    ]),
    "proof report",
    errors,
  );
  if (value.schema_version !== 1) errors.push("proof report schema_version must be 1");
  if (value.report_type !== PROOF_REPORT_TYPE) errors.push(`proof report report_type must be ${PROOF_REPORT_TYPE}`);
  validateFileEvidence(value.registry, "registry", errors);
  validateBaselineEvidence(value.ratification_baseline, "ratification_baseline", errors);
  validateFileEvidence(value.proof_target_manifest, "proof_target_manifest", errors);
  validateFileEvidence(value.reviewer_trust, "reviewer_trust", errors);
  validateFileEvidence(value.execution_runner_trust, "execution_runner_trust", errors);
  validateExecution(value.execution, errors);
  if (!Array.isArray(value.proofs)) {
    errors.push("proofs must be an array");
  } else {
    const exact = new Set<string>();
    const keyed = new Map<string, string>();
    for (const [index, proof] of value.proofs.entries()) {
      const registrationErrors = validateProofRegistration(proof);
      errors.push(...registrationErrors.map((error) => `proofs[${index}]: ${error}`));
      if (registrationErrors.length === 0 && isRecord(proof) &&
          proof.record_type === STRUCTURED_PROOF_RECORD_TYPE) {
        const typed = proof as unknown as ProofRegistration;
        const serialized = stableStringify(typed);
        const key = proofKey(typed);
        if (exact.has(serialized)) errors.push(`proofs[${index}]: duplicate proof registration`);
        exact.add(serialized);
        const prior = keyed.get(key);
        if (prior !== undefined && prior !== serialized) {
          errors.push(`proofs[${index}]: conflicting duplicate proof registration`);
        } else {
          keyed.set(key, serialized);
        }
      }
    }
  }
  if (!isDigest(value.report_digest)) {
    errors.push("report_digest must be a canonical sha256 digest");
  }
  if (errors.length === 0) {
    const report = value as unknown as ProofReport;
    if (report.proofs.length > 0 && report.execution.authentication === undefined) {
      errors.push("structured proofs require authenticated executed-result identity");
    }
    if (report.execution.sha256 !== executionDigest(report.execution.test_files, report.proofs)) {
      errors.push("execution.sha256 does not match executed result identity");
    }
    const { report_digest: _digest, ...projection } = report;
    if (report.report_digest !== sha256(stableStringify(reportProjection(projection)))) {
      errors.push("report_digest does not match report content");
    }
    const sorted = [...report.proofs].sort(compareProofs);
    if (stableStringify(sorted) !== stableStringify(report.proofs)) {
      errors.push("proofs must be deterministically sorted");
    }
  }
  return errors;
}

export function parseProofReport(value: unknown): ProofReport {
  const errors = validateProofReport(value);
  if (errors.length > 0) throw new ProofReportError(errors);
  return Object.freeze(value as ProofReport);
}

const REVIEW_FIELDS = new Set([
  "schema_version",
  "artifact_type",
  "reviewer",
  "proof_producer_principal",
  "target",
  "verdict",
  "unresolved_findings",
  "authentication",
]);

export function reviewSigningPayload(value: unknown): string {
  if (!isRecord(value)) return stableStringify(value);
  const authentication = isRecord(value.authentication)
    ? {
        scheme: value.authentication.scheme,
        key_id: value.authentication.key_id,
      }
    : value.authentication;
  return stableStringify({ ...value, authentication });
}

export function validateIndependentReviewAttestation(
  value: unknown,
  expected?: ExpectedReviewTarget,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["independent review attestation must be an object"];
  checkUnknown(value, REVIEW_FIELDS, "independent review attestation", errors);
  if (value.schema_version !== 1) errors.push("review schema_version must be 1");
  if (value.artifact_type !== REVIEW_ARTIFACT_TYPE) {
    errors.push(`review artifact_type must be ${REVIEW_ARTIFACT_TYPE}`);
  }
  if (!isRecord(value.reviewer)) {
    errors.push("reviewer must be an object");
  } else {
    checkUnknown(value.reviewer, new Set(["principal", "role"]), "reviewer", errors);
    if (!isNonEmptyString(value.reviewer.principal)) errors.push("reviewer.principal must be non-empty");
    if (!isNonEmptyString(value.reviewer.role)) errors.push("reviewer.role must be non-empty");
    if (value.reviewer.principal === value.proof_producer_principal) {
      errors.push("reviewer must be distinct from proof producer");
    }
  }
  if (!isNonEmptyString(value.proof_producer_principal)) {
    errors.push("proof_producer_principal must be non-empty");
  }
  if (!isRecord(value.target)) {
    errors.push("review target must be an object");
  } else {
    checkUnknown(
      value.target,
      new Set(["invariant_id", "proof_target_digest", "proof_report_digest"]),
      "review target",
      errors,
    );
    if (typeof value.target.invariant_id !== "string" || !ID_PATTERN.test(value.target.invariant_id)) {
      errors.push("review target invariant must be canonical");
    }
    if (!isDigest(value.target.proof_target_digest)) {
      errors.push("review target digest must be a canonical sha256 digest");
    }
    if (!isDigest(value.target.proof_report_digest)) {
      errors.push("review proof report digest must be a canonical sha256 digest");
    }
  }
  if (value.verdict !== "accepted") errors.push("review verdict must be accepted");
  if (!isRecord(value.unresolved_findings)) {
    errors.push("unresolved_findings must be an object");
  } else {
    checkUnknown(value.unresolved_findings, new Set(["critical", "important"]), "unresolved_findings", errors);
    if (value.unresolved_findings.critical !== 0 || value.unresolved_findings.important !== 0) {
      errors.push("review must contain zero unresolved Critical and Important findings");
    }
  }
  if (!isRecord(value.authentication)) {
    errors.push("review authentication must be an object");
  } else {
    checkUnknown(value.authentication, new Set(["scheme", "key_id", "signature"]), "authentication", errors);
    if (value.authentication.scheme !== "ed25519") errors.push("review authentication scheme must be ed25519");
    if (!isNonEmptyString(value.authentication.key_id)) errors.push("authentication.key_id must be non-empty");
    if (!isNonEmptyString(value.authentication.signature) ||
        !BASE64_PATTERN.test(value.authentication.signature)) {
      errors.push("authentication.signature must be canonical base64");
    }
  }
  if (expected !== undefined) {
    if (isRecord(value.target) && value.target.invariant_id !== expected.invariantId) {
      errors.push("review target invariant does not match proof");
    }
    if (isRecord(value.target) && value.target.proof_target_digest !== expected.proofTargetDigest) {
      errors.push("review target digest does not match proof target");
    }
    if (isRecord(value.target) && value.target.proof_report_digest !== expected.proofReportDigest) {
      errors.push("review proof report digest does not match exact report target");
    }
    if (value.proof_producer_principal !== expected.producerPrincipal) {
      errors.push("review proof producer does not match registration producer");
    }
  }
  return errors;
}

export function verifyIndependentReviewAttestation(
  value: unknown,
  expected: ExpectedReviewTarget,
  trustedReviewer: TrustedReviewer,
): string[] {
  const errors = validateIndependentReviewAttestation(value, expected);
  if (!isRecord(value) || !isRecord(value.reviewer) || !isRecord(value.authentication)) {
    return errors;
  }
  if (value.reviewer.principal !== trustedReviewer.principal) {
    errors.push("reviewer principal is not trusted");
  }
  if (value.reviewer.role !== trustedReviewer.role) errors.push("reviewer role is not trusted");
  if (value.authentication.key_id !== trustedReviewer.keyId) errors.push("reviewer key is not trusted");
  if (errors.length > 0) return errors;
  try {
    const authenticated = verify(
      null,
      Buffer.from(reviewSigningPayload(value)),
      createPublicKey(trustedReviewer.publicKeyPem),
      Buffer.from(value.authentication.signature as string, "base64"),
    );
    if (!authenticated) errors.push("review signature is not authenticated");
  } catch {
    errors.push("review signature is not authenticated");
  }
  return errors;
}

export function readIndependentReview(repoRoot: string, path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolveRepoFile(repoRoot, path), "utf8"));
  } catch (error) {
    if (error instanceof ProofReportError) throw error;
    throw new ProofReportError([`${path}: independent review artifact is not valid JSON`]);
  }
}

export function publicKeyFingerprint(publicKeyPem: string): Sha256Digest {
  try {
    return sha256(createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }));
  } catch {
    throw new ProofReportError(["trusted public key cannot be canonicalized"]);
  }
}

export function loadTrustedExecutionRunner(
  repoRoot: string,
  authentication: NonNullable<ProofExecutionIdentity["authentication"]>,
): { readonly runner: TrustedReviewer; readonly trustStoreDigest: Sha256Digest } {
  const parsed = readJsonObject(
    repoRoot,
    EXECUTION_RUNNER_TRUST_PATH,
    "execution runner trust store",
  );
  const errors: string[] = [];
  checkUnknown(
    parsed,
    new Set(["schema_version", "owner", "runners"]),
    "execution runner trust store",
    errors,
  );
  if (parsed.schema_version !== 1) {
    errors.push("execution runner trust store schema_version must be 1");
  }
  if (!isNonEmptyString(parsed.owner)) {
    errors.push("execution runner trust store owner must be non-empty");
  }
  const runners: TrustedReviewer[] = [];
  if (!Array.isArray(parsed.runners)) {
    errors.push("execution runner trust store runners must be an array");
  } else {
    const seen = new Set<string>();
    for (const [index, runner] of parsed.runners.entries()) {
      const where = `execution runner trust store runners[${index}]`;
      if (!isRecord(runner)) {
        errors.push(`${where} must be an object`);
        continue;
      }
      checkUnknown(
        runner,
        new Set(["principal", "role", "key_id", "public_key_pem"]),
        where,
        errors,
      );
      for (const field of ["principal", "role", "key_id", "public_key_pem"] as const) {
        if (!isNonEmptyString(runner[field])) errors.push(`${where}.${field} must be non-empty`);
      }
      if (typeof runner.key_id === "string" && seen.has(runner.key_id)) {
        errors.push(`${where}: duplicate key_id ${runner.key_id}`);
      } else if (typeof runner.key_id === "string") {
        seen.add(runner.key_id);
      }
      if (isNonEmptyString(runner.principal) && isNonEmptyString(runner.role) &&
          isNonEmptyString(runner.key_id) && isNonEmptyString(runner.public_key_pem)) {
        runners.push({
          principal: runner.principal,
          role: runner.role,
          keyId: runner.key_id,
          publicKeyPem: runner.public_key_pem,
        });
      }
    }
  }
  if (errors.length > 0) throw new ProofReportError(errors);
  const match = runners.find((runner) =>
    runner.principal === authentication.principal &&
    runner.role === authentication.role &&
    runner.keyId === authentication.key_id);
  if (match === undefined) {
    throw new ProofReportError(["execution runner identity and key are not owner-pinned"]);
  }
  return {
    runner: match,
    trustStoreDigest: digestFile(repoRoot, EXECUTION_RUNNER_TRUST_PATH),
  };
}

function verifyExecutionReceipt(report: ProofReport, repoRoot: string): string[] {
  const authentication = report.execution.authentication;
  if (authentication === undefined) {
    return report.proofs.length === 0
      ? []
      : ["structured proofs have no authenticated execution receipt"];
  }
  let trusted: ReturnType<typeof loadTrustedExecutionRunner>;
  try {
    trusted = loadTrustedExecutionRunner(repoRoot, authentication);
  } catch (error) {
    return error instanceof ProofReportError ? [...error.errors] : [String(error)];
  }
  const errors: string[] = [];
  try {
    const authenticated = verify(
      null,
      Buffer.from(stableStringify(executionSigningPayload(report.execution))),
      createPublicKey(trusted.runner.publicKeyPem),
      Buffer.from(authentication.signature, "base64"),
    );
    if (!authenticated) errors.push("execution receipt signature is not authenticated");
  } catch {
    errors.push("execution receipt signature is not authenticated");
  }
  return errors;
}

export function loadTrustedReviewer(
  repoRoot: string,
  attestation: unknown,
): { readonly reviewer: TrustedReviewer; readonly trustStoreDigest: Sha256Digest } {
  const parsed = readJsonObject(repoRoot, REVIEWER_TRUST_PATH, "reviewer trust store");
  const errors: string[] = [];
  checkUnknown(parsed, new Set(["schema_version", "owner", "reviewers"]), "reviewer trust store", errors);
  if (parsed.schema_version !== 1) errors.push("reviewer trust store schema_version must be 1");
  if (!isNonEmptyString(parsed.owner)) errors.push("reviewer trust store owner must be non-empty");
  const reviewers: TrustedReviewer[] = [];
  if (!Array.isArray(parsed.reviewers)) {
    errors.push("reviewer trust store reviewers must be an array");
  } else {
    const seenKeys = new Set<string>();
    for (const [index, reviewer] of parsed.reviewers.entries()) {
      const where = `reviewer trust store reviewers[${index}]`;
      if (!isRecord(reviewer)) {
        errors.push(`${where} must be an object`);
        continue;
      }
      checkUnknown(
        reviewer,
        new Set(["principal", "role", "key_id", "public_key_pem"]),
        where,
        errors,
      );
      if (!isNonEmptyString(reviewer.principal)) errors.push(`${where}.principal must be non-empty`);
      if (!isNonEmptyString(reviewer.role)) errors.push(`${where}.role must be non-empty`);
      if (!isNonEmptyString(reviewer.key_id)) errors.push(`${where}.key_id must be non-empty`);
      if (!isNonEmptyString(reviewer.public_key_pem)) {
        errors.push(`${where}.public_key_pem must be non-empty`);
      }
      if (typeof reviewer.key_id === "string" && seenKeys.has(reviewer.key_id)) {
        errors.push(`${where}: duplicate key_id ${reviewer.key_id}`);
      } else if (typeof reviewer.key_id === "string") {
        seenKeys.add(reviewer.key_id);
      }
      if (isNonEmptyString(reviewer.principal) && isNonEmptyString(reviewer.role) &&
          isNonEmptyString(reviewer.key_id) && isNonEmptyString(reviewer.public_key_pem)) {
        reviewers.push({
          principal: reviewer.principal,
          role: reviewer.role,
          keyId: reviewer.key_id,
          publicKeyPem: reviewer.public_key_pem,
        });
      }
    }
  }
  if (errors.length > 0) throw new ProofReportError(errors);
  if (!isRecord(attestation) || !isRecord(attestation.reviewer) ||
      !isRecord(attestation.authentication)) {
    throw new ProofReportError(["review artifact cannot select a trusted reviewer"]);
  }
  const attestedReviewer = attestation.reviewer;
  const authentication = attestation.authentication;
  const match = reviewers.find((reviewer) =>
    reviewer.principal === attestedReviewer.principal &&
    reviewer.role === attestedReviewer.role &&
    reviewer.keyId === authentication.key_id);
  if (match === undefined) {
    throw new ProofReportError(["reviewer identity and key are not owner-pinned"]);
  }
  return {
    reviewer: match,
    trustStoreDigest: digestFile(repoRoot, REVIEWER_TRUST_PATH),
  };
}
