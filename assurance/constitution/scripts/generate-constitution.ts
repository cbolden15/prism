import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  collectProofEvidence,
  digestFile,
  proofTargetDigest,
  parseProofReport,
  targetReviewArtifact,
  validateProofRegistration,
  validateProofReportAgainstRepository,
  ProofReportError,
  type PriorRegistrySource,
  type ProofRegistration,
} from "../contracts/proof-report.ts";
import {
  CATEGORIES,
  ID_PATTERN,
  bindingHash,
  computeLock,
  diffAgainstLock,
  loadRatificationBaseline,
  loadRegistry,
  parseRegistryDocument,
  stableStringify,
  validateAuthorizedBindingDelta,
  validateAuthorizedProofDelta,
  validateRatificationBaseline,
  validateRatificationBaselineTransition,
  validateSemantics,
  type BindingChangeAuthorization,
  type Category,
  type Invariant,
  type InvariantLockEntryV2,
  type LockFile,
  type RatificationBaseline,
  type Registry,
} from "../contracts/registry.ts";
import { validateInvariantTransition } from "../contracts/invariant-transition.ts";
import {
  consumeDecisionAuthority,
  deriveRatificationArchitectureIdentities,
  resolveDecisionAuthority,
  resolveProofAuthority,
  type ValidatedDecisionAuthority,
} from "../contracts/transition-authority.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const REGISTRY_PATH = resolve(repoRoot, "assurance", "constitution", "contracts", "invariants.yaml");
const LOCK_PATH = resolve(repoRoot, "assurance", "constitution", "contracts", "invariants.lock");
const CONSTITUTION_PATH = resolve(
  repoRoot,
  "docs", "plans", "provider-neutral-harness", "constitution.md",
);

function renderInvariant(inv: Invariant): string {
  const lines = [
    `**${inv.id} — ${inv.title}** (law: ${inv.law_status}; proof: ${inv.proof_status})`,
    "",
    inv.statement.trim(),
    "",
  ];
  const extras: string[] = [];
  if (inv.proof_status !== "proven") {
    extras.push(`Proof incomplete: ${inv.proof_reason.trim()}`);
  }
  if (inv.bounds !== undefined && Object.keys(inv.bounds).length > 0) {
    const bounds = Object.entries(inv.bounds)
      .map(([k, v]) => `\`${k} = ${v}\``)
      .join(", ");
    extras.push(`Bounds: ${bounds}.`);
  }
  extras.push(`Enforcement: ${inv.enforcement_kind}.`);
  const releaseDetail = inv.first_release.detail === undefined
    ? ""
    : `; ${inv.first_release.detail}`;
  extras.push(
    `First release: ${inv.first_release.disposition}${releaseDetail}; ` +
    `gates ${inv.first_release.closing_gates.join(", ")}.`,
  );
  if (inv.conformance.length > 0) {
    const label = inv.proof_status === "proven"
      ? "Structured proof"
      : `Evidence (${inv.proof_status}; not complete proof)`;
    extras.push(`${label}: ${inv.conformance.map((c) => `\`${c}\``).join(", ")}.`);
  }
  if (extras.length > 0) lines.push(extras.join(" "), "");
  return lines.join("\n");
}

function renderCategory(registry: Registry, category: Category): string {
  return registry.invariants
    .filter((inv) => inv.category === category && inv.law_status !== "retired")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(renderInvariant)
    .join("\n");
}

export function renderConformanceChapter(registry: Registry): string {
  const rows = [
    "| ID | Title | Law status | Proof status | Proof reason | Enforcement | First release | Detail | Closing gates | Evidence |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...registry.invariants.map((inv) => {
      const proofReason = inv.proof_status === "proven" ? "—" : inv.proof_reason.trim();
      const evidenceLabel = inv.proof_status === "proven"
        ? "structured proof"
        : `${inv.proof_status} evidence; not complete proof`;
      const conformance = inv.conformance.length === 0
        ? "—"
        : `${evidenceLabel}: ${inv.conformance.join("<br>")}`;
      return (
        `| ${inv.id} | ${inv.title} | ${inv.law_status} | ${inv.proof_status} | ` +
        `${proofReason} | ${inv.enforcement_kind} | ${inv.first_release.disposition} | ` +
        `${inv.first_release.detail ?? "—"} | ${inv.first_release.closing_gates.join(", ")} | ` +
        `${conformance} |`
      );
    }),
  ];
  const pins = [
    "| ID | Name | Version | Spec | Schema hash |",
    "|---|---|---|---|---|",
    ...registry.protocols.map(
      (p) => `| ${p.id} | ${p.name} | ${p.version} | ${p.spec} | \`${p.schema_hash}\` |`,
    ),
  ];
  const amendments = [...registry.invariants, ...registry.protocols]
    .flatMap((entry) =>
      (entry.amendments ?? []).map((a) => ({ id: entry.id, ...a })),
    )
    .sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((a) => `- ${a.date} — ${a.id}: ${a.decision}`);
  return [
    "### Registry",
    "",
    ...rows,
    "",
    "### Protocol pins",
    "",
    ...pins,
    "",
    "### Amendment log",
    "",
    ...(amendments.length > 0 ? amendments : ["(no amendments)"]),
    "",
  ].join("\n");
}

export interface ProvenProofInput {
  readonly registry: Registry;
  readonly repoRoot: string;
  readonly executedFiles: readonly string[];
  readonly legacyLabels: ReadonlySet<string>;
  readonly structuredProofs: readonly ProofRegistration[];
  // Supplied only on the update-lock path, and only after the report's registry
  // pin has been byte-verified against these same bytes: evidence re-derivation
  // must then anchor on the registry state the report was minted against.
  readonly prior?: PriorRegistrySource;
}

// Re-derives each registration from the trusted proof-target manifest and the
// current repository bytes, so a registration can never outlive the evidence
// it claims.
function currentEvidenceErrors(
  repoRoot: string,
  proof: ProofRegistration,
  prior?: PriorRegistrySource,
): string[] {
  const errors: string[] = [];
  const source = {
    invariantId: proof.invariant_id,
    testFile: proof.test.path,
    testName: proof.test.name,
  };
  try {
    // The declared path comes from the trusted manifest, never from the
    // registration: this field carries the independent-review authority.
    const declared = targetReviewArtifact(source, repoRoot);
    if (proof.review_artifact.path !== declared) {
      errors.push("review artifact is not the path declared in the trusted manifest");
    }
    if (digestFile(repoRoot, declared) !== proof.review_artifact.sha256) {
      errors.push("review artifact differs from current bytes");
    }
  } catch (error) {
    errors.push(...(error instanceof ProofReportError
      ? error.errors
      : ["review artifact is missing or unreadable"]));
  }
  try {
    const evidence = collectProofEvidence(source, repoRoot, prior);
    if (stableStringify(proof.test) !== stableStringify(evidence.test)) {
      errors.push("test evidence differs from current bytes");
    }
    if (stableStringify(proof.production_entrypoint) !==
        stableStringify(evidence.production_entrypoint)) {
      errors.push("production entrypoint differs from current bytes");
    }
    if (proof.proof_target_digest !== proofTargetDigest(evidence)) {
      errors.push("proof target differs from current trusted evidence");
    }
  } catch (error) {
    errors.push(...(error instanceof ProofReportError ? error.errors : [String(error)]));
  }
  return errors;
}

export function evaluateProvenProof(input: ProvenProofInput): string[] {
  const errors: string[] = [];
  const executed = new Set(input.executedFiles);
  const proved = new Set<string>();
  const serializedByKey = new Map<string, string>();
  for (const proof of input.structuredProofs) {
    const local = validateProofRegistration(proof);
    const key = `${proof.invariant_id}\0${proof.test.path}\0${proof.test.name}`;
    const serialized = stableStringify(proof);
    const prior = serializedByKey.get(key);
    if (prior !== undefined && prior !== serialized) {
      local.push("conflicting duplicate proof registration");
    } else if (prior === undefined) {
      serializedByKey.set(key, serialized);
    }
    const invariant = input.registry.invariants.find(({ id }) => id === proof.invariant_id);
    if (invariant === undefined) {
      local.push(`unknown invariant ${proof.invariant_id}`);
    } else {
      if (proof.enforcement_kind !== invariant.enforcement_kind) {
        local.push(
          `enforcement kind ${proof.enforcement_kind} does not match registry ` +
          `${invariant.enforcement_kind}`,
        );
      }
      if (!invariant.conformance.includes(proof.test.path)) {
        local.push("test file is not declared as conformance");
      }
    }
    if (!executed.has(proof.test.path)) local.push("proof test was not executed");
    local.push(...currentEvidenceErrors(input.repoRoot, proof, input.prior));
    if (local.length === 0) proved.add(proof.invariant_id);
    errors.push(...local.map((error) => `${proof.invariant_id}: ${error}`));
  }
  for (const invariant of input.registry.invariants) {
    if (invariant.proof_status !== "proven" || proved.has(invariant.id)) continue;
    errors.push(input.legacyLabels.has(invariant.id)
      ? `${invariant.id}: a legacy conformance label is not structured proof`
      : `${invariant.id}: proven status requires an executed structured proof`);
  }
  return errors;
}

export function hasProofStatusTransition(
  previous: LockFile,
  live: Registry,
): boolean {
  return live.invariants.some((entry) => {
    const locked = previous.entries[entry.id];
    return locked !== undefined && "proof_status" in locked &&
      locked.proof_status !== entry.proof_status;
  });
}

// Every mode that renders or locks a proven invariant must first see an
// executed structured proof for it. Without a report, any proven status is an
// error, so a proven row can never be produced by the generator alone.
export function provenProofErrors(
  registry: Registry,
  proofReportPath: string | undefined,
  priorRegistryPath?: string,
): string[] {
  const proven = registry.invariants.filter((inv) => inv.proof_status === "proven");
  if (proofReportPath === undefined) {
    return proven.map((inv) =>
      `${inv.id}: proven status requires --proof-report naming an executed structured proof report`);
  }
  // A supplied report is always read and authenticated, even when nothing is
  // proven: silently accepting an unreadable one is the failure mode worth
  // removing.
  let report: ReturnType<typeof parseProofReport>;
  try {
    report = parseProofReport(JSON.parse(readFileSync(resolve(repoRoot, proofReportPath), "utf8")));
  } catch (error) {
    const detail = error instanceof ProofReportError ? error.errors.join("; ") : String(error);
    return [`proof report ${proofReportPath} is unusable: ${detail}`];
  }
  // The update-lock path validates a report minted before the transition landed,
  // so it supplies the registry bytes that report pinned; the injection stays
  // byte-strict inside validateProofReportAgainstRepository, which refuses any
  // prior bytes that do not hash to the report's own registry pin.
  let prior: PriorRegistrySource | undefined;
  if (priorRegistryPath !== undefined) {
    try {
      prior = { contents: readFileSync(resolve(repoRoot, priorRegistryPath), "utf8") };
    } catch (error) {
      return [`prior registry cannot be read: ${String(error)}`];
    }
  }
  // Authenticate the report against the reference bytes and its owner-pinned
  // execution receipt before its executed-file set is trusted for anything.
  const repositoryErrors = validateProofReportAgainstRepository(report, repoRoot, prior);
  if (repositoryErrors.length > 0) {
    return repositoryErrors.map((error) => `proof report ${proofReportPath}: ${error}`);
  }
  if (proven.length === 0) return [];
  return evaluateProvenProof({
    registry,
    repoRoot,
    executedFiles: report.execution.test_files.map(({ path }) => path),
    legacyLabels: new Set(),
    structuredProofs: report.proofs,
    prior,
  });
}

function replaceBlock(source: string, begin: string, end: string, body: string): string {
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`missing or malformed marker pair: ${begin}`);
  }
  return (
    source.slice(0, beginIndex + begin.length) +
    "\n" + body.trimEnd() + "\n" +
    source.slice(endIndex)
  );
}

export function injectMarkers(source: string, registry: Registry): string {
  let output = source;
  const usedCategories = new Set(registry.invariants.map((inv) => inv.category));
  for (const category of CATEGORIES) {
    const begin = `<!-- pnh:invariants:${category}:begin -->`;
    const end = `<!-- pnh:invariants:${category}:end -->`;
    if (!output.includes(begin)) {
      if (usedCategories.has(category)) {
        throw new Error(`missing or malformed marker pair for used category: ${begin}`);
      }
      continue;
    }
    output = replaceBlock(output, begin, end, renderCategory(registry, category));
  }
  output = replaceBlock(
    output,
    "<!-- pnh:conformance:begin -->",
    "<!-- pnh:conformance:end -->",
    renderConformanceChapter(registry),
  );
  return output;
}

/**
 * Resolves trusted proof authority for every invariant whose proof status has
 * moved away from the lock, and bounds what else the same update may carry.
 * Returns the ids that carry authority, or the refusals that block the update.
 */
export function resolveProofTransitions(
  registry: Registry,
  previous: ReturnType<typeof computeLock>,
  proofReportPath: string | undefined,
  priorRegistryPath: string | undefined,
): { readonly authorizedIds: ReadonlySet<string>; readonly errors: readonly string[] } {
  const moved: { invariant: Invariant; locked: InvariantLockEntryV2 }[] = [];
  for (const invariant of registry.invariants) {
    const locked = previous.entries[invariant.id];
    if (locked === undefined || !("proof_status" in locked)) continue;
    if (locked.proof_status !== invariant.proof_status) moved.push({ invariant, locked });
  }
  if (moved.length === 0) return { authorizedIds: new Set(), errors: [] };
  if (proofReportPath === undefined) {
    return {
      authorizedIds: new Set(),
      errors: ["proof-status transitions require --proof-report"],
    };
  }
  // The authorized-delta guardrail anchors on the prior registry; without it the
  // guardrail would be droppable by omitting a flag, so its absence refuses.
  if (priorRegistryPath === undefined) {
    return {
      authorizedIds: new Set(),
      errors: ["proof-status transitions require --prior-registry"],
    };
  }
  const authorizedIds = new Set<string>();
  const errors: string[] = [];
  for (const { invariant, locked } of moved) {
    const resolution = resolveProofAuthority({
      proofReportPath,
      invariantId: invariant.id,
      priorProofStatus: locked.proof_status,
      newProofStatus: invariant.proof_status,
      priorRegistryPath,
    });
    if (!resolution.ok) {
      errors.push(...resolution.errors.map((error) => `${invariant.id}: ${error}`));
      continue;
    }
    errors.push(...validateInvariantTransition({
      id: invariant.id,
      lockedHash: locked.binding_hash,
      newBindingHash: bindingHash(invariant),
      oldProofStatus: locked.proof_status,
      newProofStatus: invariant.proof_status,
      oldLawStatus: locked.law_status,
      newLawStatus: invariant.law_status,
      proofReason: invariant.proof_reason,
      authorities: { proof: resolution.authority },
    }).filter((error) => !error.startsWith("stale lock")));
    authorizedIds.add(invariant.id);
  }
  // Authority for a proof transition licenses that row's flip, its proof_reason
  // removal, and its appended amendments — nothing else in the registry.
  if (priorRegistryPath !== undefined) {
    try {
      const prior = parseRegistryDocument(
        readFileSync(resolve(repoRoot, priorRegistryPath), "utf8"),
      );
      errors.push(...validateAuthorizedProofDelta(prior, registry, authorizedIds));
    } catch (error) {
      errors.push(`prior registry cannot be read: ${String(error)}`);
    }
  }
  return { authorizedIds, errors };
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export interface BindingChangeTransitionInput {
  readonly registry: Registry;
  readonly previous: LockFile;
  readonly baseline: RatificationBaseline;
  readonly decisionDigests: ReadonlyMap<string, string>;
  readonly decisionRole: string | undefined;
  readonly priorRegistryPath: string | undefined;
  readonly priorRegistryDigest: string | undefined;
  readonly repoRoot: string;
  readonly proofAuthorizedIds: ReadonlySet<string>;
}

export interface BindingChangeTransitionResolution {
  readonly authorizations: ReadonlyMap<string, BindingChangeAuthorization>;
  readonly errors: readonly string[];
}

function sha256(input: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

/**
 * Resolves one exact, owner-pinned decision authority for every binding change
 * not already explained by proof authority. The prior registry is separately
 * digest-pinned so the delta guard cannot be supplied a rewritten history.
 */
export function resolveBindingChangeTransitions(
  input: BindingChangeTransitionInput,
): BindingChangeTransitionResolution {
  const empty = (): BindingChangeTransitionResolution => ({
    authorizations: new Map(),
    errors,
  });
  const errors: string[] = [];
  const liveById = new Map(
    [...input.registry.invariants, ...input.registry.protocols]
      .map((entry) => [entry.id, entry] as const),
  );
  const changed = new Map<string, {
    readonly entry: Invariant | Registry["protocols"][number];
    readonly lockedHash: string;
  }>();
  for (const [id, locked] of Object.entries(input.previous.entries)) {
    const entry = liveById.get(id);
    if (entry === undefined || input.proofAuthorizedIds.has(id)) continue;
    if (bindingHash(entry) !== locked.binding_hash) {
      changed.set(id, { entry, lockedHash: locked.binding_hash });
    }
  }

  for (const [id, digest] of input.decisionDigests) {
    if (!ID_PATTERN.test(id)) {
      errors.push(`${id}: decision digest key is not a canonical constitution entry ID`);
    }
    if (!SHA256_PATTERN.test(digest)) {
      errors.push(`${id}: decision digest must be a canonical sha256 digest`);
    }
    if (!changed.has(id)) {
      errors.push(`${id}: decision digest targets an unchanged entry`);
    }
  }
  for (const id of changed.keys()) {
    if (!input.decisionDigests.has(id)) {
      errors.push(`${id}: binding change requires an owner-pinned decision digest`);
    }
  }
  if (changed.size === 0) {
    if (input.decisionRole !== undefined && input.decisionDigests.size === 0) {
      errors.push("decision role was supplied without a binding-change decision digest");
    }
    if (input.priorRegistryDigest !== undefined && input.decisionDigests.size === 0) {
      errors.push("prior registry digest was supplied without a binding-change decision digest");
    }
    return empty();
  }
  if (input.decisionRole === undefined || input.decisionRole.trim().length === 0) {
    errors.push("binding changes require one non-empty owner-pinned decision role");
  }
  if (input.priorRegistryPath === undefined) {
    errors.push("binding changes require --prior-registry");
  }
  if (input.priorRegistryDigest === undefined) {
    errors.push("binding changes require --prior-registry-sha256");
  } else if (!SHA256_PATTERN.test(input.priorRegistryDigest)) {
    errors.push("prior registry digest must be a canonical sha256 digest");
  }
  if (errors.length > 0 || input.priorRegistryPath === undefined ||
      input.priorRegistryDigest === undefined || input.decisionRole === undefined) {
    return empty();
  }

  let prior: Registry;
  try {
    const priorPath = resolve(input.repoRoot, input.priorRegistryPath);
    const stat = lstatSync(priorPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      errors.push("prior registry path must name a regular, non-symlink file");
      return empty();
    }
    const priorBytes = readFileSync(priorPath, "utf8");
    const actualDigest = sha256(priorBytes);
    if (actualDigest !== input.priorRegistryDigest) {
      errors.push(
        `prior registry digest ${actualDigest} does not match owner-pinned digest ${input.priorRegistryDigest}`,
      );
      return empty();
    }
    prior = parseRegistryDocument(priorBytes);
  } catch (error) {
    errors.push(`prior registry cannot be read: ${String(error)}`);
    return empty();
  }
  if (stableStringify(computeLock(prior)) !== stableStringify(input.previous)) {
    errors.push("prior registry does not match the committed lock state");
    return empty();
  }

  const expectedArchitectureIdentities = deriveRatificationArchitectureIdentities(
    input.baseline,
    input.registry.ratification_baseline,
  );
  const issued = new Map<string, ValidatedDecisionAuthority>();
  for (const [id, { entry, lockedHash }] of changed) {
    const amendment = entry.amendments?.at(-1);
    if (amendment === undefined) {
      errors.push(`${id}: binding change requires one appended amendment`);
      continue;
    }
    if (amendment.kind !== "binding-change") {
      errors.push(`${id}: latest amendment must have kind binding-change`);
      continue;
    }
    if (amendment.reason === undefined || amendment.reason.trim().length === 0) {
      errors.push(`${id}: latest binding-change amendment requires an exact reason`);
      continue;
    }
    const decisionDigest = input.decisionDigests.get(id);
    if (decisionDigest === undefined) continue;
    const resolution = resolveDecisionAuthority({
      repoRoot: input.repoRoot,
      decisionPath: amendment.decision,
      expectedContentDigest: decisionDigest,
      expectedOwner: input.baseline.owner,
      expectedDecisionRole: input.decisionRole,
      expectedArchitectureIdentities,
      transition: {
        invariantId: id,
        amendmentKind: "binding-change",
        priorBindingHash: lockedHash,
        newBindingHash: bindingHash(entry),
        reason: amendment.reason,
      },
    });
    if (!resolution.ok) {
      errors.push(...resolution.errors.map((error) => `${id}: ${error}`));
      continue;
    }
    issued.set(id, resolution.authority);
  }

  const authorizations = new Map<string, BindingChangeAuthorization>();
  for (const [id, authority] of issued) {
    errors.push(...consumeDecisionAuthority(authority).map((error) => `${id}: ${error}`));
    authorizations.set(id, {
      entryId: authority.invariantId,
      priorBindingHash: authority.priorBindingHash,
      newBindingHash: authority.newBindingHash,
      decisionPath: authority.decisionPath,
      reason: authority.reason,
    });
  }
  errors.push(...validateAuthorizedBindingDelta(prior, input.registry, authorizations));
  if (errors.length > 0) return empty();
  return { authorizations, errors: [] };
}

interface UpdateLockOptions {
  readonly proofReportPath?: string;
  readonly priorRegistryPath?: string;
  readonly priorRegistryDigest?: string;
  readonly decisionDigests: ReadonlyMap<string, string>;
  readonly decisionRole?: string;
}

function updateLock(
  registry: Registry,
  baseline: ReturnType<typeof loadRatificationBaseline>,
  options: UpdateLockOptions,
): number {
  const nextLock = computeLock(registry);
  let previous: ReturnType<typeof computeLock> | undefined;
  try {
    previous = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as typeof nextLock;
  } catch {
    previous = undefined;
  }
  if (previous !== undefined) {
    const transitions = resolveProofTransitions(
      registry,
      previous,
      options.proofReportPath,
      options.priorRegistryPath,
    );
    if (transitions.errors.length > 0) {
      console.error(`refusing to update lock:\n- ${transitions.errors.join("\n- ")}`);
      return 1;
    }
    const bindingTransitions = resolveBindingChangeTransitions({
      registry,
      previous,
      baseline,
      decisionDigests: options.decisionDigests,
      decisionRole: options.decisionRole,
      priorRegistryPath: options.priorRegistryPath,
      priorRegistryDigest: options.priorRegistryDigest,
      repoRoot,
      proofAuthorizedIds: transitions.authorizedIds,
    });
    if (bindingTransitions.errors.length > 0) {
      console.error(
        `refusing to update lock:\n- ${bindingTransitions.errors.join("\n- ")}`,
      );
      return 1;
    }
    const baselineChanged = previous.version === 2 &&
      stableStringify(previous.ratification_baseline) !==
        stableStringify(registry.ratification_baseline);
    const baselineTransitionErrors = baselineChanged
      ? validateRatificationBaselineTransition(
          registry.ratification_baseline,
          baseline,
          previous.ratification_baseline,
          repoRoot,
        )
      : [];
    const blocking = diffAgainstLock(
      registry,
      previous,
      repoRoot,
      {
        proofTransitions: transitions.authorizedIds,
        bindingChanges: bindingTransitions.authorizations,
      },
    ).filter(
      (e) =>
        !e.startsWith("stale lock") &&
        !e.includes("run --update-lock") &&
        !(baselineChanged && baselineTransitionErrors.length === 0 &&
          e === "ratification baseline pin differs from lock"),
    );
    blocking.push(...baselineTransitionErrors);
    if (blocking.length > 0) {
      console.error(`refusing to update lock:\n- ${blocking.join("\n- ")}`);
      return 1;
    }
  }
  writeFileSync(LOCK_PATH, `${stableStringify(nextLock)}\n`, "utf8");
  console.log(`lock updated: ${LOCK_PATH}`);
  return 0;
}

export interface ConstitutionCliArgs {
  readonly mode: string | undefined;
  readonly proofReport: string | undefined;
  readonly priorRegistry: string | undefined;
  readonly priorRegistryDigest: string | undefined;
  readonly decisionDigests: ReadonlyMap<string, string>;
  readonly decisionRole: string | undefined;
}

export function parseConstitutionCliArgs(
  args: readonly string[],
): ConstitutionCliArgs {
  let mode: string | undefined;
  let proofReport: string | undefined;
  let priorRegistry: string | undefined;
  let priorRegistryDigest: string | undefined;
  let decisionRole: string | undefined;
  const decisionDigests = new Map<string, string>();
  const modes = new Set(["--check", "--write", "--update-lock"]);
  const valueAfter = (index: number, option: string): string => {
    const value = args[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new Error(`${option} requires one non-empty value`);
    }
    return value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (modes.has(argument)) {
      if (mode !== undefined) throw new Error("constitution mode may be given once");
      mode = argument;
    } else if (argument === "--proof-report") {
      const value = valueAfter(index, "--proof-report");
      if (proofReport !== undefined) throw new Error("--proof-report may be given once");
      proofReport = value;
      index += 1;
    } else if (argument === "--prior-registry") {
      const value = valueAfter(index, "--prior-registry");
      if (priorRegistry !== undefined) throw new Error("--prior-registry may be given once");
      priorRegistry = value;
      index += 1;
    } else if (argument === "--prior-registry-sha256") {
      const value = valueAfter(index, "--prior-registry-sha256");
      if (priorRegistryDigest !== undefined) {
        throw new Error("prior registry sha256 may be given once");
      }
      if (!SHA256_PATTERN.test(value)) {
        throw new Error("--prior-registry-sha256 requires one canonical sha256 digest");
      }
      priorRegistryDigest = value;
      index += 1;
    } else if (argument === "--decision-role") {
      const value = valueAfter(index, "--decision-role");
      if (decisionRole !== undefined) throw new Error("decision role may be given once");
      decisionRole = value;
      index += 1;
    } else if (argument === "--decision-digest") {
      const value = valueAfter(index, "--decision-digest");
      const separator = value.indexOf("=");
      if (separator <= 0) {
        throw new Error("--decision-digest requires ENTRY_ID=sha256:<64 lowercase hex>");
      }
      const id = value.slice(0, separator);
      const digest = value.slice(separator + 1);
      if (!ID_PATTERN.test(id)) {
        throw new Error("--decision-digest requires a canonical constitution entry ID");
      }
      if (!SHA256_PATTERN.test(digest)) {
        throw new Error("--decision-digest requires one canonical sha256 digest");
      }
      if (decisionDigests.has(id)) {
        throw new Error(`duplicate decision digest for ${id}`);
      }
      decisionDigests.set(id, digest);
      index += 1;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  if (mode !== "--update-lock" &&
      (priorRegistry !== undefined || priorRegistryDigest !== undefined ||
       decisionDigests.size > 0 || decisionRole !== undefined)) {
    throw new Error(
      "prior-registry and decision-authority inputs are only valid with --update-lock",
    );
  }
  return {
    mode,
    proofReport,
    priorRegistry,
    priorRegistryDigest,
    decisionDigests,
    decisionRole,
  };
}

function main(): number {
  let args: ConstitutionCliArgs;
  try {
    args = parseConstitutionCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    return 2;
  }
  const mode = args.mode;
  const registry = loadRegistry(REGISTRY_PATH);
  const baseline = loadRatificationBaseline(
    resolve(repoRoot, registry.ratification_baseline.path),
  );
  const validationErrors = [
    ...validateSemantics(registry, repoRoot),
    ...validateRatificationBaseline(
      registry,
      baseline,
      registry.ratification_baseline,
      repoRoot,
    ),
  ];
  if (validationErrors.length > 0) {
    console.error(`refusing to generate from invalid registry:\n- ${validationErrors.join("\n- ")}`);
    return 1;
  }
  if (mode !== "--check" && mode !== "--write" && mode !== "--update-lock") {
    console.error(
      "usage: generate-constitution.ts --check | --write | --update-lock " +
      "[--proof-report <path>] [--prior-registry <path>] " +
      "[--prior-registry-sha256 <digest>] " +
      "[--decision-role <role>] [--decision-digest <ENTRY_ID=digest>]...",
    );
    return 2;
  }
  let proofPriorRegistry: string | undefined;
  if (mode === "--update-lock" && args.priorRegistry !== undefined) {
    try {
      const previous = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as LockFile;
      if (previous.version === 2 && hasProofStatusTransition(previous, registry)) {
        proofPriorRegistry = args.priorRegistry;
      }
    } catch {
      // Without a parseable v2 lock there is no prior proof-status identity to
      // select here; updateLock retains its existing lock-file handling.
    }
  }
  const proofErrors = provenProofErrors(
    registry,
    args.proofReport,
    proofPriorRegistry,
  );
  if (proofErrors.length > 0) {
    console.error(`refusing to ${mode.slice(2)}, proven status is not backed by structured proof:\n- ${proofErrors.join("\n- ")}`);
    return 1;
  }
  if (mode === "--update-lock") {
    return updateLock(registry, baseline, {
      proofReportPath: args.proofReport,
      priorRegistryPath: args.priorRegistry,
      priorRegistryDigest: args.priorRegistryDigest,
      decisionDigests: args.decisionDigests,
      decisionRole: args.decisionRole,
    });
  }
  const source = readFileSync(CONSTITUTION_PATH, "utf8");
  const regenerated = injectMarkers(source, registry);
  if (mode === "--write") {
    writeFileSync(CONSTITUTION_PATH, regenerated, "utf8");
    console.log(`constitution written: ${CONSTITUTION_PATH}`);
    return 0;
  }
  if (regenerated !== source) {
    console.error("constitution drift: regenerated output differs from committed file");
    return 1;
  }
  console.log("constitution matches registry");
  return 0;
}

if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
