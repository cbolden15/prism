import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  ID_PATTERN,
  loadRegistry,
  type AmendmentKind,
  type LawStatus,
  type ProofStatus,
  type RatificationBaseline,
  type RatificationBaselinePin,
} from "./registry.ts";
import {
  ProofReportError,
  loadTrustedExecutionRunner,
  loadTrustedReviewer,
  parseProofReport,
  publicKeyFingerprint,
  readIndependentReview,
  validateProofReportAgainstRepository,
  verifyIndependentReviewAttestation,
  type TrustedReviewer,
} from "./proof-report.ts";

const DECISION_ROOT = "docs/plans/provider-neutral-harness";
const HARNESS_REPO_ROOT = realpathSync(resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
));
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const validatedDecisionAuthorityBrand: unique symbol = Symbol(
  "ValidatedDecisionAuthority",
);
const validatedProofAuthorityBrand: unique symbol = Symbol(
  "ValidatedProofAuthority",
);
const issuedDecisionAuthorities = new WeakMap<object, DecisionAuthorityRequest>();
const issuedProofAuthorities = new WeakMap<object, ProofAuthorityRequest>();

export interface ValidatedDecisionAuthority {
  readonly [validatedDecisionAuthorityBrand]: true;
  readonly invariantId: string;
  readonly amendmentKind: AmendmentKind;
  readonly priorBindingHash: string;
  readonly newBindingHash: string;
  readonly priorProofStatus?: ProofStatus;
  readonly reason: string;
  readonly decisionPath: string;
  readonly decisionDigest: string;
}

export interface ValidatedProofAuthority {
  readonly [validatedProofAuthorityBrand]: true;
  readonly invariantId: string;
  readonly authorityKind: "proof-upgrade" | "partial-evidence";
  readonly priorProofStatus: ProofStatus;
  readonly newProofStatus: ProofStatus;
  readonly invariantBindingHash: string;
  readonly registryDigest: string;
  readonly ratificationBaselineId: string;
  readonly ratificationBaselineDigest: string;
  readonly productionEntrypointDigests: readonly string[];
  readonly dependencyClosureDigests: readonly string[];
  readonly executionDigest: string;
  readonly executionRunnerTrustDigest: string;
  readonly proofTargetDigests: readonly string[];
  readonly proofReportDigest: string;
  readonly reviewArtifactDigests: readonly string[];
  readonly reviewerPrincipals: readonly string[];
  readonly reviewerTrustDigest: string;
}

export interface DecisionTransitionBinding {
  readonly invariantId: string;
  readonly amendmentKind: AmendmentKind;
  readonly priorBindingHash: string;
  readonly newBindingHash: string;
  readonly priorProofStatus?: ProofStatus;
  readonly reason: string;
}

export interface DecisionAuthorityRequest {
  readonly repoRoot: string;
  readonly decisionPath: string;
  readonly expectedContentDigest: string;
  readonly expectedOwner: string;
  readonly expectedDecisionRole: string;
  readonly expectedArchitectureIdentities: readonly string[];
  readonly transition: DecisionTransitionBinding;
}

export type DecisionAuthorityResolution =
  | { readonly ok: true; readonly authority: ValidatedDecisionAuthority }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface ProofAuthorityRequest {
  readonly proofReportPath: string;
  readonly invariantId: string;
  readonly priorProofStatus: ProofStatus;
  readonly newProofStatus: ProofStatus;
  /**
   * Repository-relative or absolute path to the registry bytes the proof report
   * was generated against. Supplied only by the guarded updater, whose live
   * registry has already moved to the post-transition state. The bytes are
   * evidence, never authority: they are accepted only if they hash to the
   * report's own registry pin, and prior state still comes from the lock.
   */
  readonly priorRegistryPath?: string;
}

export interface LockedInvariantState {
  readonly binding_hash: string;
  readonly law_status: LawStatus;
  readonly proof_status: ProofStatus;
}

/**
 * Prior state of an invariant as recorded in the committed lock. The lock is the
 * anchor for what the constitution currently says; a proof report cannot be
 * allowed to supply its own notion of "prior".
 */
export function lockedInvariantState(
  repoRoot: string,
  invariantId: string,
): LockedInvariantState | undefined {
  let lock: unknown;
  try {
    lock = JSON.parse(readFileSync(
      resolve(repoRoot, "assurance/constitution/contracts/invariants.lock"),
      "utf8",
    ));
  } catch {
    return undefined;
  }
  if (typeof lock !== "object" || lock === null) return undefined;
  const entries = (lock as { entries?: unknown }).entries;
  if (typeof entries !== "object" || entries === null) return undefined;
  const entry = (entries as Record<string, unknown>)[invariantId];
  if (typeof entry !== "object" || entry === null) return undefined;
  const { binding_hash, law_status, proof_status } = entry as Record<string, unknown>;
  if (typeof binding_hash !== "string" ||
      typeof law_status !== "string" ||
      typeof proof_status !== "string") {
    return undefined;
  }
  return {
    binding_hash,
    law_status: law_status as LawStatus,
    proof_status: proof_status as ProofStatus,
  };
}

export type ProofAuthorityResolution =
  | { readonly ok: true; readonly authority: ValidatedProofAuthority }
  | { readonly ok: false; readonly errors: readonly string[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== "" &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot);
}

function isCanonicalDecisionPath(decisionPath: string): boolean {
  if (!isNonEmptyString(decisionPath) ||
      isAbsolute(decisionPath) ||
      decisionPath.includes("\\") ||
      decisionPath.includes("\0") ||
      !decisionPath.endsWith(".md") ||
      posix.normalize(decisionPath) !== decisionPath) {
    return false;
  }
  const segments = decisionPath.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    decisionPath.startsWith(`${DECISION_ROOT}/`);
}

function resolveContainedDecision(
  repoRoot: string,
  decisionPath: string,
): { readonly ok: true; readonly path: string } |
   { readonly ok: false; readonly error: string } {
  if (!isCanonicalDecisionPath(decisionPath)) {
    return {
      ok: false,
      error: "decision path must be canonical and repository-relative under docs/plans/provider-neutral-harness/",
    };
  }

  try {
    const canonicalRepoRoot = realpathSync(repoRoot);
    const allowedRoot = resolve(canonicalRepoRoot, DECISION_ROOT);
    const candidate = resolve(canonicalRepoRoot, decisionPath);
    if (!isContained(allowedRoot, candidate)) {
      return { ok: false, error: "decision path escapes the trusted decision root" };
    }

    let current = canonicalRepoRoot;
    for (const segment of decisionPath.split("/")) {
      current = join(current, segment);
      if (lstatSync(current).isSymbolicLink()) {
        return { ok: false, error: "decision path contains a symbolic link" };
      }
    }

    const canonicalAllowedRoot = realpathSync(allowedRoot);
    const canonicalCandidate = realpathSync(candidate);
    if (!isContained(canonicalAllowedRoot, canonicalCandidate)) {
      return { ok: false, error: "resolved decision path escapes the trusted decision root" };
    }
    if (!lstatSync(canonicalCandidate).isFile()) {
      return { ok: false, error: "decision path is not a regular file" };
    }
    return { ok: true, path: canonicalCandidate };
  } catch {
    return { ok: false, error: "decision path cannot be resolved as a trusted file" };
  }
}

function contentDigest(content: Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

interface DecisionMetadata {
  readonly values: ReadonlyMap<string, string>;
  readonly architectureIdentities: readonly string[];
  readonly transitions: readonly DecisionTransitionBinding[];
  readonly errors: readonly string[];
}

const AMENDMENT_KIND_VALUES = new Set<AmendmentKind>([
  "binding-change",
  "law-transition",
  "proof-invalidation",
]);
const PROOF_STATUS_VALUES = new Set<ProofStatus>([
  "unproven",
  "partial",
  "proven",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTransitionEntry(
  encoded: string,
): { readonly transition?: DecisionTransitionBinding; readonly errors: readonly string[] } {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return { errors: ["decision transition entry must be valid JSON"] };
  }
  if (!isRecord(value)) {
    return { errors: ["decision transition entry must be a JSON object"] };
  }

  const allowed = new Set([
    "invariant_id",
    "amendment_kind",
    "prior_binding_hash",
    "new_binding_hash",
    "prior_proof_status",
    "reason",
  ]);
  const required = [
    "invariant_id",
    "amendment_kind",
    "prior_binding_hash",
    "new_binding_hash",
    "reason",
  ];
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`decision transition entry has unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push(`decision transition entry is missing ${key}`);
  }
  if (typeof value.invariant_id !== "string" ||
      !ID_PATTERN.test(value.invariant_id)) {
    errors.push("decision transition invariant_id must be a canonical constitution entry ID");
  }
  if (typeof value.amendment_kind !== "string" ||
      !AMENDMENT_KIND_VALUES.has(value.amendment_kind as AmendmentKind)) {
    errors.push("decision transition amendment_kind is invalid");
  }
  if (typeof value.prior_binding_hash !== "string" ||
      !SHA256_PATTERN.test(value.prior_binding_hash)) {
    errors.push("decision transition prior_binding_hash must be a canonical sha256 digest");
  }
  if (typeof value.new_binding_hash !== "string" ||
      !SHA256_PATTERN.test(value.new_binding_hash)) {
    errors.push("decision transition new_binding_hash must be a canonical sha256 digest");
  }
  if (!isNonEmptyString(value.reason)) {
    errors.push("decision transition reason must be a non-empty string");
  }

  const amendmentKind = value.amendment_kind as AmendmentKind;
  if (amendmentKind === "proof-invalidation") {
    if (typeof value.prior_proof_status !== "string" ||
        !PROOF_STATUS_VALUES.has(value.prior_proof_status as ProofStatus)) {
      errors.push("proof-invalidation transition requires a valid prior_proof_status");
    }
  } else if (Object.hasOwn(value, "prior_proof_status")) {
    errors.push(`${String(amendmentKind)} transition must not declare prior_proof_status`);
  }
  if (errors.length > 0) return { errors };

  return {
    transition: {
      invariantId: value.invariant_id as string,
      amendmentKind,
      priorBindingHash: value.prior_binding_hash as string,
      newBindingHash: value.new_binding_hash as string,
      ...(value.prior_proof_status === undefined
        ? {}
        : { priorProofStatus: value.prior_proof_status as ProofStatus }),
      reason: value.reason as string,
    },
    errors: [],
  };
}

function parseDecisionMetadata(content: string): DecisionMetadata {
  const fields = [
    "Status",
    "Owner",
    "Decision owner",
  ] as const;
  const values = new Map<string, string>();
  const architectureIdentities: string[] = [];
  const transitions: DecisionTransitionBinding[] = [];
  const transitionKeys = new Set<string>();
  const errors: string[] = [];

  let inFence = false;
  for (const line of content.split(/\r?\n/u)) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^##\s/u.test(line)) break;
    if (inFence) continue;
    if (line.startsWith("Transition entry: ")) {
      const parsed = parseTransitionEntry(line.slice("Transition entry: ".length));
      errors.push(...parsed.errors);
      if (parsed.transition !== undefined) {
        const key = `${parsed.transition.invariantId}\0${parsed.transition.amendmentKind}`;
        if (transitionKeys.has(key)) {
          errors.push(
            `decision transition entry duplicates ${parsed.transition.invariantId} ${parsed.transition.amendmentKind}`,
          );
        } else {
          transitionKeys.add(key);
          transitions.push(parsed.transition);
        }
      }
      continue;
    }
    if (line.startsWith("Bound architecture identity: ")) {
      architectureIdentities.push(line.slice("Bound architecture identity: ".length));
      continue;
    }
    for (const field of fields) {
      const prefix = `${field}: `;
      if (!line.startsWith(prefix)) continue;
      if (values.has(field)) {
        errors.push(`decision metadata field ${field} appears more than once`);
      } else {
        values.set(field, line.slice(prefix.length));
      }
    }
  }
  if (transitions.length === 0) {
    errors.push("decision must contain at least one transition entry");
  }

  return { values, architectureIdentities, transitions, errors };
}

function compareField(
  metadata: DecisionMetadata,
  field: string,
  expected: string,
  errors: string[],
): void {
  const actual = metadata.values.get(field);
  if (actual !== expected) {
    errors.push(`decision ${field} ${String(actual)} does not match expected ${expected}`);
  }
}

function compareArchitectureIdentities(
  actual: readonly string[],
  expected: readonly string[],
  errors: string[],
): void {
  if (expected.length === 0 || expected.some((identity) => !isNonEmptyString(identity))) {
    errors.push("expected architecture identities must be a non-empty list of non-empty strings");
    return;
  }
  if (new Set(expected).size !== expected.length) {
    errors.push("expected architecture identities contain duplicates");
    return;
  }
  if (new Set(actual).size !== actual.length) {
    errors.push("decision bound architecture identities contain duplicates");
    return;
  }
  if (actual.length !== expected.length ||
      actual.some((identity, index) => identity !== expected[index])) {
    errors.push("decision bound architecture identities do not match the owner-pinned identities");
  }
}

export function resolveDecisionAuthority(
  request: DecisionAuthorityRequest,
): DecisionAuthorityResolution {
  const errors: string[] = [];
  if (!SHA256_PATTERN.test(request.expectedContentDigest)) {
    errors.push("expected decision content digest must be a canonical sha256 digest");
  }
  if (!isNonEmptyString(request.expectedOwner)) {
    errors.push("expected decision owner must be a non-empty string");
  }
  if (!isNonEmptyString(request.expectedDecisionRole)) {
    errors.push("expected decision role must be a non-empty string");
  }
  if (!isNonEmptyString(request.transition.reason)) {
    errors.push("expected transition reason must be a non-empty string");
  }
  if (!SHA256_PATTERN.test(request.transition.priorBindingHash)) {
    errors.push("expected prior binding hash must be a canonical sha256 digest");
  }
  if (!SHA256_PATTERN.test(request.transition.newBindingHash)) {
    errors.push("expected new binding hash must be a canonical sha256 digest");
  }
  if (!AMENDMENT_KIND_VALUES.has(request.transition.amendmentKind)) {
    errors.push("expected amendment kind is invalid");
  }
  if (request.transition.amendmentKind === "proof-invalidation" &&
      request.transition.priorProofStatus === undefined) {
    errors.push("proof-invalidation authority requires the prior proof status");
  }
  if (request.transition.amendmentKind !== "proof-invalidation" &&
      request.transition.priorProofStatus !== undefined) {
    errors.push(`${request.transition.amendmentKind} authority must not bind a prior proof status`);
  }

  const resolved = resolveContainedDecision(request.repoRoot, request.decisionPath);
  if (!resolved.ok) {
    errors.push(resolved.error);
    return { ok: false, errors };
  }

  const contentBytes = readFileSync(resolved.path);
  const actualDigest = contentDigest(contentBytes);
  if (actualDigest !== request.expectedContentDigest) {
    errors.push(
      `decision content digest ${actualDigest} does not match owner-pinned digest ${request.expectedContentDigest}`,
    );
  }

  const content = contentBytes.toString("utf8");
  const metadata = parseDecisionMetadata(content);
  errors.push(...metadata.errors);
  compareField(metadata, "Status", "Ratified", errors);
  compareField(metadata, "Owner", request.expectedOwner, errors);
  compareField(metadata, "Decision owner", request.expectedDecisionRole, errors);
  const documentTransition = metadata.transitions.find((transition) =>
    transition.invariantId === request.transition.invariantId &&
    transition.amendmentKind === request.transition.amendmentKind
  );
  if (documentTransition === undefined) {
    errors.push(
      `decision has no ${request.transition.amendmentKind} transition for ${request.transition.invariantId}`,
    );
  } else {
    if (documentTransition.priorBindingHash !== request.transition.priorBindingHash) {
      errors.push(
        `decision prior binding hash ${documentTransition.priorBindingHash} does not match expected ${request.transition.priorBindingHash}`,
      );
    }
    if (documentTransition.newBindingHash !== request.transition.newBindingHash) {
      errors.push(
        `decision new binding hash ${documentTransition.newBindingHash} does not match expected ${request.transition.newBindingHash}`,
      );
    }
    if (documentTransition.priorProofStatus !== request.transition.priorProofStatus) {
      errors.push(
        `decision prior proof status ${String(documentTransition.priorProofStatus)} does not match expected ${String(request.transition.priorProofStatus)}`,
      );
    }
    if (documentTransition.reason !== request.transition.reason) {
      errors.push("decision transition reason does not match the expected reason");
    }
  }

  compareArchitectureIdentities(
    metadata.architectureIdentities,
    request.expectedArchitectureIdentities,
    errors,
  );
  if (errors.length > 0) return { ok: false, errors };

  const authority = Object.freeze({
    [validatedDecisionAuthorityBrand]: true as const,
    invariantId: request.transition.invariantId,
    amendmentKind: request.transition.amendmentKind,
    priorBindingHash: request.transition.priorBindingHash,
    newBindingHash: request.transition.newBindingHash,
    priorProofStatus: request.transition.priorProofStatus,
    reason: request.transition.reason,
    decisionPath: request.decisionPath,
    decisionDigest: request.expectedContentDigest,
  });
  issuedDecisionAuthorities.set(authority, Object.freeze({
    ...request,
    expectedArchitectureIdentities: Object.freeze([
      ...request.expectedArchitectureIdentities,
    ]),
    transition: Object.freeze({ ...request.transition }),
  }));
  return { ok: true, authority };
}

export function deriveRatificationArchitectureIdentities(
  baseline: RatificationBaseline,
  pin: RatificationBaselinePin,
): readonly string[] {
  return Object.freeze([
    `ratification-baseline:${baseline.baseline_id}:${pin.sha256}`,
    ...baseline.sources.map(({ path, git_blob }) =>
      `ratified-source:${path}:${git_blob}`),
  ]);
}

function decisionAuthorityFingerprint(authority: ValidatedDecisionAuthority): string {
  return JSON.stringify({
    invariantId: authority.invariantId,
    amendmentKind: authority.amendmentKind,
    priorBindingHash: authority.priorBindingHash,
    newBindingHash: authority.newBindingHash,
    priorProofStatus: authority.priorProofStatus,
    reason: authority.reason,
    decisionPath: authority.decisionPath,
    decisionDigest: authority.decisionDigest,
  });
}

export function consumeDecisionAuthority(
  authority: ValidatedDecisionAuthority,
): string[] {
  const request = issuedDecisionAuthorities.get(authority);
  if (request === undefined) {
    return ["decision authority was not issued by the trusted resolver"];
  }
  issuedDecisionAuthorities.delete(authority);
  const refreshed = resolveDecisionAuthority(request);
  if (!refreshed.ok) return [...refreshed.errors];
  issuedDecisionAuthorities.delete(refreshed.authority);
  if (decisionAuthorityFingerprint(refreshed.authority) !==
      decisionAuthorityFingerprint(authority)) {
    return ["decision authority no longer matches current decision state"];
  }
  return [];
}

export function resolveProofAuthority(
  request: ProofAuthorityRequest,
): ProofAuthorityResolution {
  const errors: string[] = [];
  let authorityKind: ValidatedProofAuthority["authorityKind"] | undefined;
  if (request.newProofStatus === "proven" && request.priorProofStatus !== "proven") {
    authorityKind = "proof-upgrade";
  } else if (request.priorProofStatus === "unproven" && request.newProofStatus === "partial") {
    authorityKind = "partial-evidence";
  } else {
    errors.push(
      `proof transition ${request.priorProofStatus}->${request.newProofStatus} does not accept proof authority`,
    );
  }

  let report: ReturnType<typeof parseProofReport> | undefined;
  try {
    if (!isNonEmptyString(request.proofReportPath)) {
      throw new ProofReportError(["proof report path must be non-empty"]);
    }
    const path = isAbsolute(request.proofReportPath)
      ? request.proofReportPath
      : resolve(HARNESS_REPO_ROOT, request.proofReportPath);
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
      throw new ProofReportError(["proof report path must name a regular, non-symlink file"]);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new ProofReportError(["proof report is not valid JSON"]);
    }
    report = parseProofReport(parsed);
    // The updater validates a report minted before the transition landed, so it
    // supplies the registry bytes that report pinned. validateProofReport-
    // AgainstRepository still refuses them unless they hash to that pin.
    const prior = request.priorRegistryPath === undefined
      ? undefined
      : {
        contents: readFileSync(
          isAbsolute(request.priorRegistryPath)
            ? request.priorRegistryPath
            : resolve(HARNESS_REPO_ROOT, request.priorRegistryPath),
          "utf8",
        ),
      };
    errors.push(...validateProofReportAgainstRepository(report, HARNESS_REPO_ROOT, prior));
  } catch (error) {
    errors.push(...(error instanceof ProofReportError ? error.errors : [String(error)]));
  }

  let invariantBindingHash: string | undefined;
  if (report !== undefined) {
    try {
      const registry = loadRegistry(resolve(
        HARNESS_REPO_ROOT,
        "assurance/constitution/contracts/invariants.yaml",
      ));
      const invariant = registry.invariants.find(({ id }) => id === request.invariantId);
      const locked = lockedInvariantState(HARNESS_REPO_ROOT, request.invariantId);
      if (invariant === undefined) {
        errors.push(`unknown invariant ${request.invariantId}`);
      } else if (locked === undefined) {
        errors.push(`${request.invariantId}: no committed lock entry to anchor prior state`);
      } else {
        invariantBindingHash = report.proofs.find(({ invariant_id }) =>
          invariant_id === request.invariantId)?.invariant_binding_hash;
        // Prior state is read from the lock, never from the registry or the
        // report: the lock is what the constitution currently commits to.
        if (locked.proof_status !== request.priorProofStatus) {
          errors.push(
            `locked proof status ${locked.proof_status} does not match requested prior status ${request.priorProofStatus}`,
          );
        }
        if (locked.law_status !== "ratified") {
          errors.push(`${request.invariantId}: proof authority requires ratified law`);
        }
        if (invariant.law_status !== locked.law_status) {
          errors.push(
            `${request.invariantId}: law status changed under a proof transition`,
          );
        }
      }
    } catch (error) {
      errors.push(`current registry cannot be loaded: ${String(error)}`);
    }
  }

  const matching = report?.proofs.filter(({ invariant_id }) =>
    invariant_id === request.invariantId) ?? [];
  if (report !== undefined && matching.length === 0) {
    errors.push(`${request.invariantId}: proof report contains no structured proof`);
  }
  let executionRunner: TrustedReviewer | undefined;
  if (report?.execution.authentication !== undefined) {
    try {
      executionRunner = loadTrustedExecutionRunner(
        HARNESS_REPO_ROOT,
        report.execution.authentication,
      ).runner;
    } catch (error) {
      errors.push(...(error instanceof ProofReportError ? error.errors : [String(error)]));
    }
  }
  const reviewerPrincipals = new Set<string>();
  const reviewerTrustDigests = new Set<string>();
  for (const proof of matching) {
    try {
      // The signed attestation lives at its own manifest-declared path; the
      // prose review the registration digests is a separate document.
      const review = readIndependentReview(HARNESS_REPO_ROOT, proof.review_attestation);
      const trusted = loadTrustedReviewer(HARNESS_REPO_ROOT, review);
      const reviewErrors = verifyIndependentReviewAttestation(
        review,
        {
          invariantId: proof.invariant_id,
          proofTargetDigest: proof.proof_target_digest,
          proofReportDigest: report!.report_digest,
          producerPrincipal: proof.producer.principal,
        },
        trusted.reviewer,
      );
      if (executionRunner !== undefined) {
        if (trusted.reviewer.principal === executionRunner.principal) {
          reviewErrors.push("reviewer principal matches execution runner");
        }
        if (trusted.reviewer.keyId === executionRunner.keyId) {
          reviewErrors.push("reviewer key ID matches execution runner");
        }
        try {
          if (publicKeyFingerprint(trusted.reviewer.publicKeyPem) ===
              publicKeyFingerprint(executionRunner.publicKeyPem)) {
            reviewErrors.push("reviewer public key matches execution runner");
          }
        } catch (error) {
          reviewErrors.push(...(error instanceof ProofReportError
            ? error.errors
            : [String(error)]));
        }
      }
      errors.push(...reviewErrors.map((message) => `${proof.invariant_id}: ${message}`));
      if (reviewErrors.length === 0 &&
          typeof review === "object" && review !== null &&
          "reviewer" in review && typeof review.reviewer === "object" &&
          review.reviewer !== null && "principal" in review.reviewer &&
          typeof review.reviewer.principal === "string") {
        reviewerPrincipals.add(review.reviewer.principal);
        reviewerTrustDigests.add(trusted.trustStoreDigest);
      }
    } catch (error) {
      errors.push(...(error instanceof ProofReportError
        ? error.errors.map((message) => `${proof.invariant_id}: ${message}`)
        : [`${proof.invariant_id}: ${String(error)}`]));
    }
  }

  if (errors.length > 0 || report === undefined || authorityKind === undefined ||
      invariantBindingHash === undefined) {
    return { ok: false, errors };
  }
  const sortedUnique = (values: readonly string[]): readonly string[] =>
    Object.freeze([...new Set(values)].sort());
  if (reviewerTrustDigests.size !== 1) {
    return { ok: false, errors: ["proof reviews do not resolve through one owner-pinned trust store"] };
  }
  const authority = Object.freeze({
    [validatedProofAuthorityBrand]: true as const,
    invariantId: request.invariantId,
    authorityKind,
    priorProofStatus: request.priorProofStatus,
    newProofStatus: request.newProofStatus,
    invariantBindingHash,
    registryDigest: report.registry.sha256,
    ratificationBaselineId: report.ratification_baseline.baseline_id,
    ratificationBaselineDigest: report.ratification_baseline.sha256,
    productionEntrypointDigests: sortedUnique(
      matching.map(({ production_entrypoint }) => production_entrypoint.sha256),
    ),
    dependencyClosureDigests: sortedUnique(
      matching.map(({ dependency_closure }) => dependency_closure.sha256),
    ),
    executionDigest: report.execution.sha256,
    executionRunnerTrustDigest: report.execution_runner_trust.sha256,
    proofTargetDigests: sortedUnique(matching.map(({ proof_target_digest }) => proof_target_digest)),
    proofReportDigest: report.report_digest,
    reviewArtifactDigests: sortedUnique(
      matching.map(({ review_artifact }) => review_artifact.sha256),
    ),
    reviewerPrincipals: sortedUnique([...reviewerPrincipals]),
    reviewerTrustDigest: [...reviewerTrustDigests][0]!,
  });
  issuedProofAuthorities.set(authority, Object.freeze({ ...request }));
  return { ok: true, authority };
}

function proofAuthorityFingerprint(authority: ValidatedProofAuthority): string {
  return JSON.stringify({
    invariantId: authority.invariantId,
    authorityKind: authority.authorityKind,
    priorProofStatus: authority.priorProofStatus,
    newProofStatus: authority.newProofStatus,
    invariantBindingHash: authority.invariantBindingHash,
    registryDigest: authority.registryDigest,
    ratificationBaselineId: authority.ratificationBaselineId,
    ratificationBaselineDigest: authority.ratificationBaselineDigest,
    productionEntrypointDigests: authority.productionEntrypointDigests,
    dependencyClosureDigests: authority.dependencyClosureDigests,
    executionDigest: authority.executionDigest,
    executionRunnerTrustDigest: authority.executionRunnerTrustDigest,
    proofTargetDigests: authority.proofTargetDigests,
    proofReportDigest: authority.proofReportDigest,
    reviewArtifactDigests: authority.reviewArtifactDigests,
    reviewerPrincipals: authority.reviewerPrincipals,
    reviewerTrustDigest: authority.reviewerTrustDigest,
  });
}

export function consumeProofAuthority(authority: ValidatedProofAuthority): string[] {
  const request = issuedProofAuthorities.get(authority);
  if (request === undefined) return ["proof authority was not issued by the trusted resolver"];
  issuedProofAuthorities.delete(authority);
  const refreshed = resolveProofAuthority(request);
  if (!refreshed.ok) return [...refreshed.errors];
  issuedProofAuthorities.delete(refreshed.authority);
  if (proofAuthorityFingerprint(refreshed.authority) !== proofAuthorityFingerprint(authority)) {
    return ["proof authority no longer matches current repository and review state"];
  }
  return [];
}
