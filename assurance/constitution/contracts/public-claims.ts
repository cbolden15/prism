import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import {
  loadRegistry,
  type FirstReleaseDisposition,
  type LawStatus,
  type ProofStatus,
} from "./registry.ts";

export const MANIFEST_PATH = "assurance/constitution/contracts/public-claims.yaml";
export const REGISTRY_PATH = "assurance/constitution/contracts/invariants.yaml";

export const POSTURES = ["supported", "planned", "limitation", "deferred"] as const;
/** Closed vocabulary from docs/plans/provider-neutral-harness/constitution.md. */
export const EXECUTION_CLASSES = [
  "container-isolated-v1",
  "trusted-subprocess-v1",
  "development-v1",
] as const;
export const EVIDENCE_ENVIRONMENTS = [
  "developer-macos",
  "docker-linux-container",
  "none",
] as const;
export const RELEASE_SCOPES = ["private-incubation", "public-release"] as const;

/**
 * One entry in a closed vocabulary: a stem matched between word boundaries, and
 * the wordings that stem must catch. A flat phrase list let `sandboxes` walk
 * past a list holding `sandbox` and `sandboxed`, so the stem carries its own
 * inflections and a test asserts every listed form still refuses.
 */
export interface SecurityPhrase {
  /** Regular-expression source, matched case-insensitively between `\b` anchors. */
  readonly pattern: string;
  readonly forms: readonly string[];
}

/**
 * Literal paths relative to the repository root that a registered block may
 * cite even though a segment carries isolation vocabulary. Closed by
 * construction and bounded on disk: an entry is honored only while the file
 * exists, so the channel admits real files, not wording, and unregistered
 * prose gets no exemption.
 */
export const REGISTERED_REPOSITORY_PATHS: readonly string[] = Object.freeze([
  "packages/runtime/src/harness/sandbox/broker-gateway.mjs",
]);

/**
 * Sandbox and hostile-code isolation wording. Only a limitation block may use
 * it, and only while negating it: no invariant proves an isolation boundary.
 */
export const SANDBOX_PHRASES: readonly SecurityPhrase[] = [
  { pattern: "sandbox\\w*", forms: ["sandbox", "sandboxed", "sandboxes", "sandboxing"] },
  {
    pattern: "isolat\\w*",
    forms: ["isolate", "isolated", "isolates", "isolating", "isolation", "isolations"],
  },
  { pattern: "jail\\w*", forms: ["jail", "jailed", "jailing", "jails"] },
  {
    pattern: "confin\\w*",
    forms: ["confine", "confined", "confinement", "confines", "confining"],
  },
  // Prefix stems with one suffix class, so an unenumerated inflection cannot
  // walk past the list. `container` and `containers` are carved out: this
  // repository uses the ordinary noun freely.
  {
    pattern: "contain(?!ers?\\b)\\w*",
    forms: ["contain", "contained", "containing", "containment", "contains"],
  },
];

/**
 * Absolutes a supported block may not assert. `no`, `any`, `every`, and `all`
 * stay out: proven-invariant text legitimately uses them.
 */
export const ABSOLUTE_GUARANTEE_PHRASES: readonly SecurityPhrase[] = [
  { pattern: "never", forms: ["never"] },
  { pattern: "always", forms: ["always"] },
  {
    pattern: "guarantee(?:s|d|ing)?",
    forms: ["guarantee", "guaranteed", "guaranteeing", "guarantees"],
  },
];

const OTHER_NORMATIVE_PHRASES: readonly SecurityPhrase[] = [
  { pattern: "adversar(?:y|ies)", forms: ["adversaries", "adversary"] },
  { pattern: "attackers?", forms: ["attacker", "attackers"] },
  { pattern: "container-isolated-v1", forms: ["container-isolated-v1"] },
  { pattern: "cryptographic(?:ally)?", forms: ["cryptographic", "cryptographically"] },
  { pattern: "development-v1", forms: ["development-v1"] },
  { pattern: "drops privileges?", forms: ["drops privilege", "drops privileges"] },
  {
    pattern: "enforc(?:e[sd]?|ing|ement)",
    forms: ["enforce", "enforced", "enforcement", "enforces", "enforcing"],
  },
  { pattern: "fail[ -]closed", forms: ["fail closed", "fail-closed"] },
  { pattern: "fail[ -]open", forms: ["fail open", "fail-open"] },
  { pattern: "hostile", forms: ["hostile"] },
  { pattern: "malicious", forms: ["malicious"] },
  { pattern: "privilege dropping", forms: ["privilege dropping"] },
  { pattern: "security boundary", forms: ["security boundary"] },
  {
    pattern: "tamper[ -](?:evident|proof|resistant)",
    forms: ["tamper resistant", "tamper-evident", "tamper-proof"],
  },
  { pattern: "trust boundary", forms: ["trust boundary"] },
  { pattern: "trusted-subprocess-v1", forms: ["trusted-subprocess-v1"] },
  { pattern: "untrusted", forms: ["untrusted"] },
];

/**
 * Closed vocabulary of normative security language. Any occurrence outside a
 * registered claim or limitation block is a refusal: prose that makes a
 * security assertion must be bound to an invariant, so the vocabulary is
 * deliberately narrow and stemmed rather than inferred.
 */
export const NORMATIVE_SECURITY_PHRASES: readonly SecurityPhrase[] = [
  ...SANDBOX_PHRASES,
  ...ABSOLUTE_GUARANTEE_PHRASES,
  ...OTHER_NORMATIVE_PHRASES,
];

/** Wording that presents behavior as already available. */
export const AVAILABILITY_PHRASES: readonly SecurityPhrase[] = [
  { pattern: "available", forms: ["available"] },
  { pattern: "generally available", forms: ["generally available"] },
  { pattern: "complete and working today", forms: ["complete and working today"] },
  { pattern: "enforces", forms: ["enforces"] },
  { pattern: "in production", forms: ["in production"] },
  { pattern: "offer(?:s|ed)", forms: ["offered", "offers"] },
  { pattern: "production-ready", forms: ["production-ready"] },
  { pattern: "provide[sd]", forms: ["provided", "provides"] },
  // Present-tense `runs` only: `run` also reads as an infinitive or a noun.
  { pattern: "runs", forms: ["runs"] },
  { pattern: "ship(?:s|ped)", forms: ["shipped", "ships"] },
  { pattern: "has shipped", forms: ["has shipped"] },
  { pattern: "support(?:s|ed)", forms: ["supported", "supports"] },
];

/**
 * Token sequences that turn a sandbox phrase in a limitation block into a
 * disclaimer. Matching is token-exact against the tokens immediately preceding
 * the phrase, so `no-nonsense` is one token and is not the token `no`.
 */
export const NEGATION_PHRASES: readonly (readonly string[])[] = [
  ["no"],
  ["not"],
  ["never"],
  ["makes", "no"],
  ["is", "not"],
  ["without"],
  ["rather", "than"],
];

/** Tokens before an isolation phrase that a negation has to appear within. */
const NEGATION_WINDOW = 3;
/** `.`, `,`, `;`, and `:` end a clause; a negation does not reach across one. */
const CLAUSE_BOUNDARY = /[.,;:]/u;

export type ClaimPosture = (typeof POSTURES)[number];
export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];
export type EvidenceEnvironment = (typeof EVIDENCE_ENVIRONMENTS)[number];
export type ReleaseScope = (typeof RELEASE_SCOPES)[number];
export type MarkerKind = "claim" | "limitation";

export interface PublicClaim {
  readonly id: string;
  readonly file: string;
  readonly posture: ClaimPosture;
  readonly text_digest: string;
  readonly invariants: readonly string[];
  readonly execution_classes: readonly string[];
  readonly evidence_environments: readonly EvidenceEnvironment[];
  readonly release_scope: ReleaseScope;
}

export interface PublicClaimManifest {
  readonly version: 1;
  readonly surfaces: readonly string[];
  readonly claims: readonly PublicClaim[];
}

export interface ClaimBlock {
  readonly claimId: string;
  readonly kind: MarkerKind;
  readonly file: string;
  readonly beginLine: number;
  readonly endLine: number;
  readonly normalizedText: string;
  readonly digest: string;
}

export interface ClaimFailure {
  readonly claimId: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface InvariantStatus {
  readonly id: string;
  readonly lawStatus: LawStatus;
  readonly proofStatus: ProofStatus;
  readonly disposition: FirstReleaseDisposition;
}

export interface PublicClaimGateInput {
  readonly manifest: PublicClaimManifest;
  /** Registered surfaces that exist on disk, keyed by repository-relative path. */
  readonly documents: ReadonlyMap<string, string>;
  readonly invariants: readonly InvariantStatus[];
  /** The REGISTERED_REPOSITORY_PATHS entries that exist on disk at gate time. */
  readonly repositoryPaths: ReadonlySet<string>;
}

export class PublicClaimError extends Error {
  constructor(messages: readonly string[]) {
    super(`invalid public-claim manifest:\n- ${messages.join("\n- ")}`);
    this.name = "PublicClaimError";
  }
}

const CLAIM_ID_PATTERN = /^PNH-CLAIM-\d{2,}$/u;
const INVARIANT_ID_PATTERN = /^PNH-INV-\d{2,}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MARKER_PATTERN =
  /^<!--\s*pnh:(claim|limitation):([A-Za-z0-9-]+):(begin|end)\s*-->$/u;
const GENERATED_BEGIN =
  /^<!--\s*pnh:(?:invariants:[a-z-]+|conformance):begin\s*-->$/u;
const GENERATED_END = /^<!--\s*pnh:(?:invariants:[a-z-]+|conformance):end\s*-->$/u;
/**
 * A whole line that is exactly one HTML comment. The interior may not contain a
 * terminator: CommonMark ends an HTML block at the first `-->`, so a line
 * carrying two comments renders the text between them as ordinary prose and
 * must be hashed and scanned like any other prose.
 */
const HTML_COMMENT_LINE = /^<!--(?:(?!-->)[\s\S])*-->$/u;
/** Tested against the raw line: CommonMark bounds a fence opener at 3 spaces. */
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const NO_CLAIM = "-";
/**
 * The sha256 of the empty string. Any body that normalizes away hashes to it,
 * so registering it would pin no text at all: the manifest rejects it and a
 * block that normalizes to nothing is refused.
 */
export const EMPTY_TEXT_DIGEST =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const ROOT_FIELDS = new Set(["version", "surfaces", "claims"]);
const CLAIM_FIELDS = new Set([
  "id",
  "file",
  "posture",
  "text_digest",
  "invariants",
  "execution_classes",
  "evidence_environments",
  "release_scope",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRepositoryRelative(value: string): boolean {
  return value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..");
}

function checkUnknownFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  where: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) errors.push(`${where}: unknown field ${key}`);
  }
}

function checkVocabularyList(
  value: unknown,
  vocabulary: readonly string[],
  where: string,
  field: string,
  errors: string[],
): void {
  if (!isStringArray(value) || value.length === 0) {
    errors.push(`${where}: ${field} must be a non-empty string list`);
    return;
  }
  for (const entry of value) {
    if (!vocabulary.includes(entry)) {
      errors.push(`${where}: ${field} must be one of ${vocabulary.join(", ")}`);
    }
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${where}: ${field} must not contain duplicates`);
  }
}

function validateManifest(doc: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(doc)) return ["manifest root must be a mapping"];
  checkUnknownFields(doc, ROOT_FIELDS, "manifest", errors);
  if (doc.version !== 1) errors.push("version must be 1");
  if (!isStringArray(doc.surfaces)) {
    errors.push("surfaces must be a string list");
  } else {
    doc.surfaces.forEach((surface, index) => {
      if (!isRepositoryRelative(surface)) {
        errors.push(`surfaces[${index}]: must be a repository-relative path`);
      }
    });
    if (new Set(doc.surfaces).size !== doc.surfaces.length) {
      errors.push("surfaces must not contain duplicates");
    }
  }
  if (!Array.isArray(doc.claims)) {
    errors.push("claims must be a list");
    return errors;
  }
  const seen = new Set<string>();
  doc.claims.forEach((entry, index) => {
    const where = `claims[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${where}: must be a mapping`);
      return;
    }
    checkUnknownFields(entry, CLAIM_FIELDS, where, errors);
    if (typeof entry.id !== "string" || !CLAIM_ID_PATTERN.test(entry.id)) {
      errors.push(`${where}: id must match ${String(CLAIM_ID_PATTERN)}`);
    } else {
      if (seen.has(entry.id)) errors.push(`${where}: duplicate claim id ${entry.id}`);
      seen.add(entry.id);
    }
    if (typeof entry.file !== "string" || !isRepositoryRelative(entry.file)) {
      errors.push(`${where}: file must be a repository-relative path`);
    }
    if (!POSTURES.includes(entry.posture as ClaimPosture)) {
      errors.push(`${where}: posture must be one of ${POSTURES.join(", ")}`);
    }
    if (typeof entry.text_digest !== "string" || !DIGEST_PATTERN.test(entry.text_digest)) {
      errors.push(`${where}: text_digest must be a full sha256: digest`);
    } else if (entry.text_digest === EMPTY_TEXT_DIGEST) {
      errors.push(`${where}: text_digest must not be the empty-text digest`);
    }
    if (!isStringArray(entry.invariants) ||
        !entry.invariants.every((id) => INVARIANT_ID_PATTERN.test(id))) {
      errors.push(`${where}: invariants must be a list of PNH-INV ids`);
    } else if (new Set(entry.invariants).size !== entry.invariants.length) {
      errors.push(`${where}: invariants must not contain duplicates`);
    }
    // The execution-class vocabulary is checked by the gate so that a
    // violation is reported with its claim ID, file, and line.
    if (!isStringArray(entry.execution_classes)) {
      errors.push(`${where}: execution_classes must be a string list`);
    } else if (new Set(entry.execution_classes).size !== entry.execution_classes.length) {
      errors.push(`${where}: execution_classes must not contain duplicates`);
    }
    checkVocabularyList(
      entry.evidence_environments,
      EVIDENCE_ENVIRONMENTS,
      where,
      "evidence_environments",
      errors,
    );
    if (!RELEASE_SCOPES.includes(entry.release_scope as ReleaseScope)) {
      errors.push(`${where}: release_scope must be one of ${RELEASE_SCOPES.join(", ")}`);
    }
  });
  return errors;
}

export function parsePublicClaimManifest(text: string): PublicClaimManifest {
  const doc: unknown = parse(text);
  const errors = validateManifest(doc);
  if (errors.length > 0) throw new PublicClaimError(errors);
  return doc as unknown as PublicClaimManifest;
}

export function loadPublicClaimManifest(path: string): PublicClaimManifest {
  return parsePublicClaimManifest(readFileSync(path, "utf8"));
}

/** The fence run a line carries, or nothing when the line is ordinary text. */
interface FenceEdge {
  readonly char: string;
  readonly length: number;
  /** Whether the line carries nothing else: a closing fence has no info string. */
  readonly bare: boolean;
}

function fenceEdge(raw: string): FenceEdge | undefined {
  const match = FENCE_PATTERN.exec(raw);
  if (!match) return undefined;
  const [, run = "", info = ""] = match;
  // A backtick fence's info string may not contain a backtick, so such a line
  // is a paragraph rather than a fence.
  if (run.startsWith("`") && info.includes("`")) return undefined;
  return { char: run.charAt(0), length: run.length, bare: info.trim().length === 0 };
}

/**
 * CommonMark 0.31.2 section 4.5 closes a fence only on a bare run of the
 * opener's own character that is at least as long. Toggling on any fence-looking
 * line instead let a body alternate the two characters and desynchronize the
 * gate from the text a reader sees.
 */
function closesFence(open: FenceEdge, edge: FenceEdge | undefined): boolean {
  return edge !== undefined && edge.char === open.char && edge.length >= open.length && edge.bare;
}

/**
 * One line reduced to the wording a reader sees: NFKC folds compatibility
 * forms, format characters are removed so a zero-width character cannot split
 * a word, and whitespace runs collapse.
 */
function normalizeLine(raw: string): string {
  return raw.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
}

/**
 * Deterministic Markdown normalization. Fenced code and generated constitution
 * blocks carry no handwritten claim, so they are dropped; ordinary prose is
 * kept and only its wording is normalized.
 */
export function normalizeClaimText(lines: readonly string[]): string {
  const kept: string[] = [];
  let fence: FenceEdge | undefined;
  let inGenerated = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inGenerated) {
      if (GENERATED_END.test(line)) inGenerated = false;
      continue;
    }
    if (fence === undefined && GENERATED_BEGIN.test(line)) {
      inGenerated = true;
      continue;
    }
    const edge = fenceEdge(raw);
    if (fence !== undefined) {
      if (closesFence(fence, edge)) fence = undefined;
      continue;
    }
    if (edge !== undefined) {
      fence = edge;
      continue;
    }
    if (HTML_COMMENT_LINE.test(line)) continue;
    const collapsed = normalizeLine(raw);
    if (collapsed.length > 0) kept.push(collapsed);
  }
  return kept.join("\n");
}

/**
 * Index of a fence opener that the given lines never close. A block or surface
 * that ends inside a fence has text the digest and the prose scan cannot see,
 * so the gate refuses it rather than normalizing the remainder away.
 */
function unclosedFenceIndex(lines: readonly string[]): number | undefined {
  let fence: FenceEdge | undefined;
  let openedAt: number | undefined;
  let inGenerated = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (inGenerated) {
      if (GENERATED_END.test(line)) inGenerated = false;
      return;
    }
    if (fence === undefined && GENERATED_BEGIN.test(line)) {
      inGenerated = true;
      return;
    }
    const edge = fenceEdge(raw);
    if (edge === undefined) return;
    if (fence === undefined) {
      fence = edge;
      openedAt = index;
      return;
    }
    if (closesFence(fence, edge)) {
      fence = undefined;
      openedAt = undefined;
    }
  });
  return openedAt;
}

export function claimTextDigest(normalized: string): string {
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function phrasePattern(source: string): RegExp {
  return new RegExp(`\\b${source}\\b`, "iu");
}

function literalPattern(literal: string): RegExp {
  return phrasePattern(literal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
}

/**
 * An allowlisted path literal, bounded on both sides by non-path characters so
 * a suffixed or prefixed variant (a different file) never matches.
 */
function boundedPathPattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\w/.\\-])${escaped}(?![\\w/.\\-])`, "gu");
}

/** The first wording in `text` matched by the vocabulary, quoted as it appears. */
export function firstSecurityPhrase(
  text: string,
  vocabulary: readonly SecurityPhrase[],
): string | undefined {
  for (const entry of vocabulary) {
    const match = phrasePattern(entry.pattern).exec(text);
    if (match) return match[0];
  }
  return undefined;
}

/** Whitespace-separated words stripped of the punctuation around them. */
function tokenize(clause: string): readonly string[] {
  return clause
    .split(/\s+/u)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 0);
}

/** Whether the tokens preceding an isolation phrase negate it. */
function isNegated(window: readonly string[]): boolean {
  const lowered = window.map((token) => token.toLowerCase());
  return NEGATION_PHRASES.some((phrase) =>
    lowered.some((_, index) => phrase.every((token, offset) => lowered[index + offset] === token)));
}

/**
 * Isolation phrases in a limitation block that no negation scopes. A negation
 * anywhere on the line was enough to excuse an assertion riding along with an
 * unrelated disclaimer, so every occurrence now needs one in its own clause.
 */
function unnegatedIsolationPhrases(normalizedText: string): readonly string[] {
  const found: string[] = [];
  for (const line of normalizedText.split("\n")) {
    for (const clause of line.split(CLAUSE_BOUNDARY)) {
      const tokens = tokenize(clause);
      tokens.forEach((token, index) => {
        const phrase = firstSecurityPhrase(token, SANDBOX_PHRASES);
        if (phrase === undefined) return;
        if (isNegated(tokens.slice(Math.max(0, index - NEGATION_WINDOW), index))) return;
        found.push(phrase);
      });
    }
  }
  return found;
}

export interface SurfaceScan {
  readonly blocks: readonly ClaimBlock[];
  readonly failures: readonly ClaimFailure[];
}

/**
 * Splits a public surface into registered marker blocks and ordinary prose,
 * then lints the prose for unregistered normative security language.
 */
export function scanSurface(file: string, text: string): SurfaceScan {
  const blocks: ClaimBlock[] = [];
  const failures: ClaimFailure[] = [];
  const lines = text.split("\n");
  let fence: FenceEdge | undefined;
  let fenceLine = 0;
  let open: {
    claimId: string;
    kind: MarkerKind;
    beginLine: number;
    body: string[];
    fence?: FenceEdge;
  } | undefined;
  // Fenced code never joins a claim-text digest, so it is unregistered content
  // even inside a registered block: sweep it with the same closed vocabularies
  // as ordinary unregistered prose. One failure per line, sharpest family
  // first, so a single violation does not fan out into three messages.
  const sweepLine = (raw: string, lineNumber: number, context: "prose" | "fence"): void => {
    const where = context === "fence"
      ? "inside a fenced code block"
      : "outside a registered claim block";
    const normalized = normalizeLine(raw);
    const security = firstSecurityPhrase(normalized, NORMATIVE_SECURITY_PHRASES);
    if (security !== undefined) {
      failures.push({
        claimId: NO_CLAIM,
        file,
        line: lineNumber,
        message: `unregistered normative security language ("${security}") ${where}`,
      });
      return;
    }
    const availability = firstSecurityPhrase(normalized, AVAILABILITY_PHRASES);
    if (availability !== undefined) {
      failures.push({
        claimId: NO_CLAIM,
        file,
        line: lineNumber,
        message: `unregistered availability language ("${availability}") ${where}`,
      });
      return;
    }
    const invariant = /pnh-inv-\d{2}/iu.exec(normalized);
    if (invariant) {
      failures.push({
        claimId: NO_CLAIM,
        file,
        line: lineNumber,
        message: `unregistered invariant reference ("${invariant[0].toUpperCase()}") ${where}`,
      });
    }
  };
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNumber = index + 1;
    const marker = fence === undefined ? MARKER_PATTERN.exec(line) : null;
    if (marker) {
      const [, kind, claimId, edge] = marker as unknown as [string, MarkerKind, string, string];
      if (edge === "begin") {
        if (open) {
          failures.push({
            claimId,
            file,
            line: lineNumber,
            message: `marker for claim ${claimId} opens inside claim ${open.claimId}`,
          });
          return;
        }
        open = { claimId, kind, beginLine: lineNumber, body: [] };
        return;
      }
      if (!open) {
        failures.push({
          claimId,
          file,
          line: lineNumber,
          message: `marker end for claim ${claimId} has no matching begin`,
        });
        return;
      }
      if (open.claimId !== claimId || open.kind !== kind) {
        failures.push({
          claimId: open.claimId,
          file,
          line: lineNumber,
          message: `marker for claim ${open.claimId} is closed by ${kind}:${claimId}`,
        });
        open = undefined;
        return;
      }
      const unclosed = unclosedFenceIndex(open.body);
      if (unclosed !== undefined) {
        const openedAt = open.beginLine + 1 + unclosed;
        failures.push({
          claimId,
          file,
          line: openedAt,
          message: `claim ${claimId} in ${file} ends inside a fenced code block ` +
            `opened at line ${openedAt}`,
        });
      }
      const normalizedText = normalizeClaimText(open.body);
      blocks.push({
        claimId,
        kind,
        file,
        beginLine: open.beginLine,
        endLine: lineNumber,
        normalizedText,
        digest: claimTextDigest(normalizedText),
      });
      open = undefined;
      return;
    }
    if (open) {
      open.body.push(raw);
      const bodyEdge = fenceEdge(raw);
      if (open.fence !== undefined) {
        if (closesFence(open.fence, bodyEdge)) open.fence = undefined;
        else sweepLine(raw, lineNumber, "fence");
        return;
      }
      if (bodyEdge !== undefined) {
        open.fence = bodyEdge;
        return;
      }
      if (GENERATED_BEGIN.test(line) || GENERATED_END.test(line)) {
        failures.push({
          claimId: NO_CLAIM,
          file,
          line: lineNumber,
          message: `generated-region marker on public surface ${file}, ` +
            "which no generator owns",
        });
      }
      return;
    }
    const edge = fenceEdge(raw);
    if (fence !== undefined) {
      if (closesFence(fence, edge)) fence = undefined;
      else sweepLine(raw, lineNumber, "fence");
      return;
    }
    if (edge !== undefined) {
      fence = edge;
      fenceLine = lineNumber;
      return;
    }
    // A generated-region marker is a plain HTML comment whose interior both
    // the digest and this scan would drop — the F-13 two-layer escape. No
    // generator owns any registered public surface, so outside a fence the
    // marker itself is refused rather than honored as a skip region.
    if (GENERATED_BEGIN.test(line) || GENERATED_END.test(line)) {
      failures.push({
        claimId: NO_CLAIM,
        file,
        line: lineNumber,
        message: `generated-region marker on public surface ${file}, ` +
          "which no generator owns",
      });
      return;
    }
    if (HTML_COMMENT_LINE.test(line)) return;
    sweepLine(raw, lineNumber, "prose");
  });
  if (open) {
    failures.push({
      claimId: open.claimId,
      file,
      line: open.beginLine,
      message: `marker for claim ${open.claimId} is never closed`,
    });
  }
  if (fence !== undefined) {
    failures.push({
      claimId: NO_CLAIM,
      file,
      line: fenceLine,
      message: `public surface ${file} ends inside a fenced code block ` +
        `opened at line ${fenceLine}`,
    });
  }
  return { blocks, failures };
}

function checkBlock(
  claim: PublicClaim,
  block: ClaimBlock,
  invariants: ReadonlyMap<string, InvariantStatus>,
  repositoryPaths: ReadonlySet<string>,
  failures: ClaimFailure[],
): void {
  const at = (message: string): void => {
    failures.push({ claimId: claim.id, file: block.file, line: block.beginLine, message });
  };
  if (claim.file !== block.file) {
    at(`claim is registered for ${claim.file} but its marker is in ${block.file}`);
  }
  const expectedKind: MarkerKind = claim.posture === "limitation" ? "limitation" : "claim";
  if (block.kind !== expectedKind) {
    at(`posture ${claim.posture} requires a ${expectedKind} marker`);
  }
  // Text that normalizes away is pinned by no digest and read by no vocabulary
  // rule, so an empty block is refused however it came to be empty.
  if (block.normalizedText.length === 0) {
    at(`claim ${claim.id} normalizes to no text; a registered block must carry the text ` +
      "its digest pins");
  }
  if (block.digest !== claim.text_digest) {
    at(`normalized claim text digest ${block.digest} does not match the registered digest ` +
      `${claim.text_digest}`);
  }
  for (const id of claim.invariants) {
    if (!invariants.has(id)) at(`claim names unknown invariant ${id}`);
  }
  for (const executionClass of claim.execution_classes) {
    if (!EXECUTION_CLASSES.includes(executionClass as ExecutionClass)) {
      at(`claim registers unknown execution class "${executionClass}"`);
    }
  }
  for (const executionClass of EXECUTION_CLASSES) {
    if (literalPattern(executionClass).test(block.normalizedText) &&
        !claim.execution_classes.includes(executionClass)) {
      at(`claim text names execution class "${executionClass}", ` +
        "which the claim does not register");
    }
  }
  // A real repository path may carry isolation vocabulary in a segment name.
  // The closed allowlist removes the cited literal from the isolation scans
  // below; a cited entry that is missing on disk is refused instead, so the
  // channel admits only files that exist. The match is bounded on both sides
  // by non-path characters, so a suffixed or prefixed variant naming a
  // different file never rides an allowlisted entry.
  let isolationText = block.normalizedText;
  for (const path of REGISTERED_REPOSITORY_PATHS) {
    const stripped = isolationText.replace(boundedPathPattern(path), " ");
    if (stripped === isolationText) continue;
    if (!repositoryPaths.has(path)) {
      at(`claim cites repository path ${path}, which does not exist`);
    }
    isolationText = stripped;
  }
  // A registered limitation block exists to disclaim, so sandbox wording there
  // is the disclaimer itself; every other posture asserts, and no assertion may
  // present trusted-subprocess-v1 as a hostile-code boundary.
  if (claim.posture !== "limitation" &&
      claim.execution_classes.includes("trusted-subprocess-v1")) {
    const phrase = firstSecurityPhrase(isolationText, SANDBOX_PHRASES);
    if (phrase !== undefined) {
      at(`claim text calls trusted-subprocess-v1 sandboxed ("${phrase}"); ` +
        "trusted-subprocess-v1 makes no hostile-code sandbox claim");
    }
  }
  // Isolation is the family no invariant proves, so an asserting posture may
  // not use it at all, and the disclaiming posture may use it only negated.
  if (claim.posture !== "limitation") {
    const phrase = firstSecurityPhrase(isolationText, SANDBOX_PHRASES);
    if (phrase !== undefined) {
      at(`${claim.posture} claim text states an isolation boundary ("${phrase}"); ` +
        "only a limitation block may use isolation vocabulary");
    }
  } else {
    for (const phrase of unnegatedIsolationPhrases(isolationText)) {
      at(`limitation claim text uses isolation vocabulary ("${phrase}") without negating it`);
    }
  }
  // A defer disposition is a promise about a later release: only a posture that
  // says so can carry one without asserting present behavior.
  if (claim.posture !== "deferred" && claim.posture !== "limitation") {
    for (const id of claim.invariants) {
      if (invariants.get(id)?.disposition === "defer") {
        at(`claim is backed by ${id} whose first-release disposition is defer; ` +
          `posture ${claim.posture} must be deferred or limitation`);
      }
    }
  }
  if (claim.posture === "supported") {
    const phrase = firstSecurityPhrase(block.normalizedText, ABSOLUTE_GUARANTEE_PHRASES);
    if (phrase !== undefined) {
      at(`supported claim text asserts an absolute ("${phrase}"); ` +
        "a supported claim states only what its proven invariants state");
    }
    if (claim.invariants.length === 0) at("supported claim registers no backing invariant");
    for (const id of claim.invariants) {
      const invariant = invariants.get(id);
      if (!invariant) continue;
      if (invariant.lawStatus !== "ratified") {
        at(`supported claim is backed by ${id} whose law_status is ${invariant.lawStatus}; ` +
          "a supported claim requires ratified");
      }
      if (invariant.proofStatus !== "proven") {
        at(`supported claim is backed by ${id} whose proof_status is ${invariant.proofStatus}; ` +
          "a supported claim requires proven");
      }
      if (invariant.disposition === "defer") {
        at(`supported claim is backed by ${id} whose first-release disposition is defer; ` +
          "a supported claim requires a non-deferred disposition");
      }
    }
  }
  if (claim.posture === "planned") {
    const phrase = firstSecurityPhrase(block.normalizedText, AVAILABILITY_PHRASES);
    if (phrase !== undefined) {
      at(`planned claim describes the behavior as already available ("${phrase}")`);
    }
  }
  if (claim.posture === "deferred") {
    const phrase = firstSecurityPhrase(block.normalizedText, AVAILABILITY_PHRASES);
    if (phrase !== undefined) {
      at(`deferred claim describes the behavior as available ("${phrase}")`);
    }
    // The posture exists to defer something the registry actually defers.
    if (!claim.invariants.some((id) => invariants.get(id)?.disposition === "defer")) {
      at(`deferred claim ${claim.id} registers no invariant whose first-release ` +
        "disposition is defer");
    }
  }
}

export function evaluatePublicClaims(input: PublicClaimGateInput): readonly ClaimFailure[] {
  const failures: ClaimFailure[] = [];
  const { manifest, documents } = input;
  const invariants = new Map(input.invariants.map((entry) => [entry.id, entry]));
  if (manifest.surfaces.length === 0) {
    failures.push({
      claimId: NO_CLAIM,
      file: MANIFEST_PATH,
      line: 0,
      message: "no public surface is registered; the public-claim gate fails closed",
    });
  }
  const blocks = new Map<string, ClaimBlock>();
  for (const surface of manifest.surfaces) {
    const text = documents.get(surface);
    if (text === undefined) {
      failures.push({
        claimId: NO_CLAIM,
        file: surface,
        line: 0,
        message: `public surface ${surface} does not exist`,
      });
      continue;
    }
    const scan = scanSurface(surface, text);
    failures.push(...scan.failures);
    for (const block of scan.blocks) {
      if (blocks.has(block.claimId)) {
        failures.push({
          claimId: block.claimId,
          file: block.file,
          line: block.beginLine,
          message: `duplicate marker for claim ${block.claimId}`,
        });
        continue;
      }
      blocks.set(block.claimId, block);
    }
  }
  const claims = new Map(manifest.claims.map((claim) => [claim.id, claim]));
  for (const [claimId, block] of blocks) {
    const claim = claims.get(claimId);
    if (!claim) {
      failures.push({
        claimId,
        file: block.file,
        line: block.beginLine,
        message: `marker registers claim ${claimId}, which the manifest does not contain`,
      });
      continue;
    }
    checkBlock(claim, block, invariants, input.repositoryPaths, failures);
  }
  for (const claim of manifest.claims) {
    if (blocks.has(claim.id)) continue;
    if (!manifest.surfaces.includes(claim.file)) {
      failures.push({
        claimId: claim.id,
        file: claim.file,
        line: 0,
        message: `claim file ${claim.file} is not a registered public surface`,
      });
    } else if (!documents.has(claim.file)) {
      failures.push({
        claimId: claim.id,
        file: claim.file,
        line: 0,
        message: `claim file ${claim.file} does not exist`,
      });
    } else {
      failures.push({
        claimId: claim.id,
        file: claim.file,
        line: 0,
        message: `manifest claim has no marker in ${claim.file}`,
      });
    }
  }
  return failures.sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.claimId.localeCompare(right.claimId) ||
    left.message.localeCompare(right.message));
}

export function formatClaimFailure(failure: ClaimFailure): string {
  return `${failure.file}:${failure.line}: ${failure.claimId}: ${failure.message}`;
}

/** Composed gate over a repository root: manifest, registry, and real surfaces. */
export function runPublicClaimGate(repoRoot: string): readonly ClaimFailure[] {
  const manifest = loadPublicClaimManifest(resolve(repoRoot, MANIFEST_PATH));
  const registry = loadRegistry(resolve(repoRoot, REGISTRY_PATH));
  const documents = new Map<string, string>();
  for (const surface of manifest.surfaces) {
    const absolute = resolve(repoRoot, surface);
    if (existsSync(absolute)) documents.set(surface, readFileSync(absolute, "utf8"));
  }
  const repositoryPaths = new Set(
    REGISTERED_REPOSITORY_PATHS.filter((path) => existsSync(resolve(repoRoot, path))),
  );
  return evaluatePublicClaims({
    manifest,
    documents,
    repositoryPaths,
    invariants: registry.invariants.map((invariant) => ({
      id: invariant.id,
      lawStatus: invariant.law_status,
      proofStatus: invariant.proof_status,
      disposition: invariant.first_release.disposition,
    })),
  });
}
