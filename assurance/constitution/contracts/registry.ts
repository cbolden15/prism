import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export const ID_PATTERN = /^PNH-(INV|PROTO)-\d{2,}$/u;
export const LAW_STATUSES = ["proposed", "ratified", "retired"] as const;
export const PROOF_STATUSES = ["unproven", "partial", "proven"] as const;
export const ENFORCEMENT_KINDS = [
  "runtime-adversarial",
  "static-structure",
  "generated-document-consistency",
  "controlled-performance-qualification",
  "release-or-architecture-gate",
] as const;
export const FIRST_RELEASE_DISPOSITIONS = ["activate", "retain", "defer"] as const;
export const CLOSING_GATES = ["A", "B2", "C", "D", "E", "F", "G", "H"] as const;
export const AMENDMENT_KINDS = [
  "binding-change",
  "law-transition",
  "proof-invalidation",
] as const;
export const CATEGORIES = [
  "doctrine",
  "authority",
  "task",
  "plugin",
  "bridge",
  "isolation",
  "lifecycle",
  "broker",
  "evidence",
  "resource",
  "gate",
  "extraction",
] as const;

export type LawStatus = (typeof LAW_STATUSES)[number];
export type ProofStatus = (typeof PROOF_STATUSES)[number];
export type EnforcementKind = (typeof ENFORCEMENT_KINDS)[number];
export type FirstReleaseDisposition = (typeof FIRST_RELEASE_DISPOSITIONS)[number];
export type ClosingGate = (typeof CLOSING_GATES)[number];
export type AmendmentKind = (typeof AMENDMENT_KINDS)[number];
export type Category = (typeof CATEGORIES)[number];

export interface Amendment {
  readonly date: string;
  readonly decision: string;
  readonly from_hash: `sha256:${string}`;
  readonly kind?: AmendmentKind;
  readonly reason?: string;
  readonly from_proof_status?: ProofStatus;
}

export interface FirstReleaseRule {
  readonly disposition: FirstReleaseDisposition;
  readonly detail?: string;
  readonly closing_gates: readonly ClosingGate[];
}

interface InvariantBase {
  readonly id: string;
  readonly title: string;
  readonly category: Category;
  readonly statement: string;
  readonly bounds?: Readonly<Record<string, number>>;
  readonly law_status: LawStatus;
  readonly enforcement_kind: EnforcementKind;
  readonly first_release: FirstReleaseRule;
  readonly conformance: readonly string[];
  readonly since: string;
  readonly decisions: readonly string[];
  readonly amendments?: readonly Amendment[];
}

export interface IncompleteInvariant extends InvariantBase {
  readonly proof_status: "unproven" | "partial";
  readonly proof_reason: string;
}

export interface ProvenInvariant extends InvariantBase {
  readonly proof_status: "proven";
  readonly proof_reason?: never;
}

export type Invariant = IncompleteInvariant | ProvenInvariant;

export interface ProtocolPin {
  readonly id: string;
  readonly name: string;
  readonly spec: string;
  readonly version: number;
  readonly schema_source: readonly string[];
  readonly schema_hash: `sha256:${string}`;
  readonly conformance: readonly string[];
  readonly amendments?: readonly Amendment[];
}

export interface RatificationBaselinePin {
  readonly path: `assurance/constitution/contracts/ratification-baselines/${string}.json`;
  readonly sha256: `sha256:${string}`;
  readonly decision: string;
}

export interface Registry {
  readonly version: 2;
  readonly ratification_baseline: RatificationBaselinePin;
  readonly invariants: readonly Invariant[];
  readonly protocols: readonly ProtocolPin[];
}

export interface RatificationBaselineSupersedes {
  readonly from_hash: `sha256:${string}`;
  readonly date: string;
  readonly decision: string;
  readonly owner: string;
  readonly reason: string;
}

export interface RatificationBaselineInvariant {
  readonly id: string;
  readonly law_status: LawStatus;
  readonly enforcement_kind: EnforcementKind;
  readonly first_release: FirstReleaseRule;
}

export interface RatificationBaseline {
  readonly schema_version: 1;
  readonly baseline_id: string;
  readonly owner: string;
  readonly ratified_on: string;
  readonly sources: readonly {
    readonly path: string;
    readonly git_blob: string;
    readonly ratified_on: string;
  }[];
  readonly decisions: Readonly<Record<
    "enforcement_baseline" | "proof_status" | "invariant_amendments",
    string
  >>;
  readonly supersedes: RatificationBaselineSupersedes | null;
  readonly invariants: readonly RatificationBaselineInvariant[];
}

export class RegistryError extends Error {
  constructor(messages: readonly string[]) {
    super(`invalid registry:\n- ${messages.join("\n- ")}`);
    this.name = "RegistryError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_BLOB_PATTERN = /^[0-9a-f]{40}$/u;
const BASELINE_PATH_PATTERN = /^assurance\/constitution\/contracts\/ratification-baselines\/[^/]+\.json$/u;
const PLAN_A_IDS = Array.from(
  { length: 46 },
  (_, index) => `PNH-INV-${String(index + 1).padStart(2, "0")}`,
);
const PLAN_A_ID_SET = new Set(PLAN_A_IDS);

const ROOT_FIELDS = new Set(["version", "ratification_baseline", "invariants", "protocols"]);
const PIN_FIELDS = new Set(["path", "sha256", "decision"]);
const AMENDMENT_FIELDS = new Set([
  "date",
  "decision",
  "from_hash",
  "kind",
  "reason",
  "from_proof_status",
]);
const FIRST_RELEASE_FIELDS = new Set(["disposition", "detail", "closing_gates"]);
const INVARIANT_FIELDS = new Set([
  "id",
  "title",
  "category",
  "statement",
  "bounds",
  "law_status",
  "proof_status",
  "proof_reason",
  "enforcement_kind",
  "first_release",
  "conformance",
  "since",
  "decisions",
  "amendments",
]);
const PROTOCOL_FIELDS = new Set([
  "id",
  "name",
  "spec",
  "version",
  "schema_source",
  "schema_hash",
  "conformance",
  "amendments",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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

function checkPin(value: unknown, where: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${where}: must be a mapping`);
    return;
  }
  checkUnknownFields(value, PIN_FIELDS, where, errors);
  if (typeof value.path !== "string" || !BASELINE_PATH_PATTERN.test(value.path)) {
    errors.push(`${where}: path must name an immutable ratification-baseline JSON artifact`);
  }
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    errors.push(`${where}: sha256 must be a full sha256: digest`);
  }
  if (typeof value.decision !== "string" || value.decision.trim().length === 0) {
    errors.push(`${where}: decision must be a non-empty path`);
  }
}

function checkFirstRelease(value: unknown, where: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${where}: first_release must be a mapping`);
    return;
  }
  checkUnknownFields(value, FIRST_RELEASE_FIELDS, `${where}.first_release`, errors);
  if (!FIRST_RELEASE_DISPOSITIONS.includes(value.disposition as FirstReleaseDisposition)) {
    errors.push(
      `${where}: first_release disposition must be one of ${FIRST_RELEASE_DISPOSITIONS.join(", ")}`,
    );
  }
  if (value.detail !== undefined &&
      (typeof value.detail !== "string" || value.detail.trim().length === 0)) {
    errors.push(`${where}: first_release detail must be a non-empty string`);
  }
  if (!Array.isArray(value.closing_gates) || value.closing_gates.length === 0) {
    errors.push(`${where}: first_release closing_gates must be a non-empty list`);
  } else {
    for (const gate of value.closing_gates) {
      if (!CLOSING_GATES.includes(gate as ClosingGate)) {
        errors.push(`${where}: closing gate must be one of ${CLOSING_GATES.join(", ")}`);
      }
    }
    if (new Set(value.closing_gates).size !== value.closing_gates.length) {
      errors.push(`${where}: closing gates must not contain duplicates`);
    }
  }
}

function checkAmendments(value: unknown, where: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${where}: amendments must be a list`);
    return;
  }
  for (const entry of value) {
    if (!isRecord(entry)) {
      errors.push(`${where}: malformed amendment entry`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!AMENDMENT_FIELDS.has(key)) {
        errors.push(`${where}: unknown amendment field ${key}`);
      }
    }
    if (typeof entry.date !== "string" || !DATE_PATTERN.test(entry.date) ||
        typeof entry.decision !== "string" || entry.decision.trim().length === 0 ||
        typeof entry.from_hash !== "string" || !SHA256_PATTERN.test(entry.from_hash)) {
      errors.push(`${where}: malformed amendment entry`);
    }
    if (entry.kind !== undefined &&
        !AMENDMENT_KINDS.includes(entry.kind as AmendmentKind)) {
      errors.push(`${where}: amendment kind must be one of ${AMENDMENT_KINDS.join(", ")}`);
    }
    if (entry.reason !== undefined &&
        (typeof entry.reason !== "string" || entry.reason.trim().length === 0)) {
      errors.push(`${where}: amendment reason must be a non-empty string`);
    }
    if (entry.from_proof_status !== undefined &&
        !PROOF_STATUSES.includes(entry.from_proof_status as ProofStatus)) {
      errors.push(
        `${where}: amendment from_proof_status must be one of ${PROOF_STATUSES.join(", ")}`,
      );
    }
  }
}

function validateStructure(doc: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(doc)) return ["registry root must be a mapping"];
  checkUnknownFields(doc, ROOT_FIELDS, "registry", errors);
  if (doc.version !== 2) errors.push("version must be 2");
  checkPin(doc.ratification_baseline, "ratification_baseline", errors);
  for (const [listName, fields] of [
    ["invariants", INVARIANT_FIELDS],
    ["protocols", PROTOCOL_FIELDS],
  ] as const) {
    const list = doc[listName];
    if (!Array.isArray(list)) {
      errors.push(`${listName} must be a list`);
      continue;
    }
    list.forEach((entry, index) => {
      const where = `${listName}[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${where}: must be a mapping`);
        return;
      }
      checkUnknownFields(entry, fields, where, errors);
      if (typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
        errors.push(`${where}: id must match ${String(ID_PATTERN)}`);
      }
      if (!isStringArray(entry.conformance)) {
        errors.push(`${where}: conformance must be a string list`);
      }
      checkAmendments(entry.amendments, where, errors);
      if (listName === "invariants") {
        if (typeof entry.title !== "string" || entry.title.trim().length === 0) {
          errors.push(`${where}: title required`);
        }
        if (typeof entry.statement !== "string" || entry.statement.trim().length === 0) {
          errors.push(`${where}: statement required`);
        }
        if (!CATEGORIES.includes(entry.category as Category)) {
          errors.push(`${where}: category must be one of ${CATEGORIES.join(", ")}`);
        }
        if (!LAW_STATUSES.includes(entry.law_status as LawStatus)) {
          errors.push(`${where}: law_status must be one of ${LAW_STATUSES.join(", ")}`);
        }
        if (!PROOF_STATUSES.includes(entry.proof_status as ProofStatus)) {
          errors.push(`${where}: proof_status must be one of ${PROOF_STATUSES.join(", ")}`);
        }
        if (entry.proof_status === "partial" || entry.proof_status === "unproven") {
          if (entry.proof_reason === undefined) {
            errors.push(`${where}: proof_reason is required when proof_status is ${entry.proof_status}`);
          } else if (typeof entry.proof_reason !== "string" ||
              entry.proof_reason.trim().length === 0) {
            errors.push(`${where}: proof_reason must be a non-empty string`);
          }
        } else if (entry.proof_status === "proven" && Object.hasOwn(entry, "proof_reason")) {
          errors.push(`${where}: proof_reason is forbidden when proof_status is proven`);
        }
        if (!ENFORCEMENT_KINDS.includes(entry.enforcement_kind as EnforcementKind)) {
          errors.push(
            `${where}: enforcement_kind must be one of ${ENFORCEMENT_KINDS.join(", ")}`,
          );
        }
        checkFirstRelease(entry.first_release, where, errors);
        if (typeof entry.since !== "string" || !DATE_PATTERN.test(entry.since)) {
          errors.push(`${where}: since must be YYYY-MM-DD`);
        }
        if (!isStringArray(entry.decisions) || entry.decisions.length === 0) {
          errors.push(`${where}: decisions must be a non-empty string list`);
        }
        if (entry.bounds !== undefined &&
            (!isRecord(entry.bounds) ||
             !Object.values(entry.bounds).every((value) =>
               typeof value === "number" && Number.isFinite(value)))) {
          errors.push(`${where}: bounds must map names to finite numbers`);
        }
      } else {
        if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
          errors.push(`${where}: name required`);
        }
        if (typeof entry.spec !== "string" || entry.spec.trim().length === 0) {
          errors.push(`${where}: spec required`);
        }
        if (typeof entry.version !== "number" || !Number.isInteger(entry.version) ||
            entry.version < 1) {
          errors.push(`${where}: version must be a positive integer`);
        }
        if (!isStringArray(entry.schema_source) || entry.schema_source.length === 0) {
          errors.push(`${where}: schema_source must be a non-empty string list`);
        }
        if (typeof entry.schema_hash !== "string" || !SHA256_PATTERN.test(entry.schema_hash)) {
          errors.push(`${where}: schema_hash must be a full sha256: digest`);
        }
      }
    });
  }
  return errors;
}

export interface LoadOptions {
  /** test-only: shallow-merge extra fields into parsed doc before validation */
  readonly overlay?: Record<string, unknown>;
}

export function parseRegistryDocument(text: string, options: LoadOptions = {}): Registry {
  const parsed: unknown = parse(text);
  const doc = options.overlay && isRecord(parsed)
    ? { ...parsed, ...options.overlay }
    : parsed;
  const errors = validateStructure(doc);
  if (errors.length > 0) throw new RegistryError(errors);
  return doc as unknown as Registry;
}

export function loadRegistry(path: string, options: LoadOptions = {}): Registry {
  return parseRegistryDocument(readFileSync(path, "utf8"), options);
}

export function validateSemantics(registry: Registry, repoRoot: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const allEntries = [...registry.invariants, ...registry.protocols];
  for (const entry of allEntries) {
    if (seen.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
    seen.add(entry.id);
  }
  const pathFields = (entry: Invariant | ProtocolPin): string[] => {
    const paths = [...entry.conformance];
    if ("decisions" in entry) paths.push(...entry.decisions);
    if ("spec" in entry) paths.push(entry.spec, ...entry.schema_source);
    for (const amendment of entry.amendments ?? []) paths.push(amendment.decision);
    return paths;
  };
  for (const entry of allEntries) {
    for (const relative of pathFields(entry)) {
      if (!existsSync(resolve(repoRoot, relative))) {
        errors.push(`${entry.id}: path does not exist: ${relative}`);
      }
    }
  }
  for (const relative of [
    registry.ratification_baseline.path,
    registry.ratification_baseline.decision,
  ]) {
    if (!existsSync(resolve(repoRoot, relative))) {
      errors.push(`ratification baseline path does not exist: ${relative}`);
    }
  }
  return errors;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(input: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function isInvariant(entry: Invariant | ProtocolPin): entry is Invariant {
  return "statement" in entry;
}

export function bindingHash(entry: Invariant | ProtocolPin): `sha256:${string}` {
  const binding = isInvariant(entry)
    ? {
        statement: entry.statement,
        bounds: entry.bounds ?? {},
        law_status: entry.law_status,
        proof_reason: entry.proof_reason,
        enforcement_kind: entry.enforcement_kind,
        first_release: entry.first_release,
      }
    : { version: entry.version, schema_hash: entry.schema_hash };
  return sha256(stableStringify(binding));
}

const BASELINE_ROOT_FIELDS = new Set([
  "schema_version",
  "baseline_id",
  "owner",
  "ratified_on",
  "sources",
  "decisions",
  "supersedes",
  "invariants",
]);
const BASELINE_SOURCE_FIELDS = new Set(["path", "git_blob", "ratified_on"]);
const BASELINE_DECISION_FIELDS = new Set([
  "enforcement_baseline",
  "proof_status",
  "invariant_amendments",
]);
const BASELINE_SUPERSEDES_FIELDS = new Set([
  "from_hash",
  "date",
  "decision",
  "owner",
  "reason",
]);
const BASELINE_INVARIANT_FIELDS = new Set([
  "id",
  "law_status",
  "enforcement_kind",
  "first_release",
]);

function validateBaselineStructure(doc: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(doc)) return ["ratification baseline root must be a mapping"];
  checkUnknownFields(doc, BASELINE_ROOT_FIELDS, "ratification baseline", errors);
  if (doc.schema_version !== 1) errors.push("ratification baseline schema_version must be 1");
  if (typeof doc.baseline_id !== "string" || doc.baseline_id.trim().length === 0) {
    errors.push("ratification baseline baseline_id must be non-empty");
  }
  if (typeof doc.owner !== "string" || doc.owner.trim().length === 0) {
    errors.push("ratification baseline owner must be non-empty");
  }
  if (typeof doc.ratified_on !== "string" || !DATE_PATTERN.test(doc.ratified_on)) {
    errors.push("ratification baseline ratified_on must be YYYY-MM-DD");
  }
  if (!Array.isArray(doc.sources) || doc.sources.length === 0) {
    errors.push("ratification baseline sources must be a non-empty list");
  } else {
    doc.sources.forEach((source, index) => {
      const where = `ratification baseline sources[${index}]`;
      if (!isRecord(source)) {
        errors.push(`${where}: must be a mapping`);
        return;
      }
      checkUnknownFields(source, BASELINE_SOURCE_FIELDS, where, errors);
      if (typeof source.path !== "string" || source.path.trim().length === 0 ||
          typeof source.git_blob !== "string" || !GIT_BLOB_PATTERN.test(source.git_blob) ||
          typeof source.ratified_on !== "string" || !DATE_PATTERN.test(source.ratified_on)) {
        errors.push(`${where}: malformed source record`);
      }
    });
  }
  if (!isRecord(doc.decisions)) {
    errors.push("ratification baseline decisions must be a mapping");
  } else {
    checkUnknownFields(doc.decisions, BASELINE_DECISION_FIELDS, "ratification baseline decisions", errors);
    for (const field of BASELINE_DECISION_FIELDS) {
      if (typeof doc.decisions[field] !== "string" ||
          (doc.decisions[field] as string).trim().length === 0) {
        errors.push(`ratification baseline decisions.${field} must be a non-empty path`);
      }
    }
  }
  if (doc.supersedes !== null) {
    if (!isRecord(doc.supersedes)) {
      errors.push("ratification baseline supersedes must be null or a mapping");
    } else {
      checkUnknownFields(
        doc.supersedes,
        BASELINE_SUPERSEDES_FIELDS,
        "ratification baseline supersedes",
        errors,
      );
      if (typeof doc.supersedes.from_hash !== "string" ||
          !SHA256_PATTERN.test(doc.supersedes.from_hash) ||
          typeof doc.supersedes.date !== "string" ||
          !DATE_PATTERN.test(doc.supersedes.date) ||
          typeof doc.supersedes.decision !== "string" ||
          doc.supersedes.decision.trim().length === 0 ||
          typeof doc.supersedes.owner !== "string" ||
          doc.supersedes.owner.trim().length === 0 ||
          typeof doc.supersedes.reason !== "string" ||
          doc.supersedes.reason.trim().length === 0) {
        errors.push("ratification baseline supersedes record is malformed");
      }
    }
  }
  if (!Array.isArray(doc.invariants)) {
    errors.push("ratification baseline invariants must be a list");
    return errors;
  }
  const seen = new Set<string>();
  doc.invariants.forEach((entry, index) => {
    const where = `ratification baseline invariants[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${where}: must be a mapping`);
      return;
    }
    checkUnknownFields(entry, BASELINE_INVARIANT_FIELDS, where, errors);
    if (typeof entry.id !== "string") {
      errors.push(`${where}: id required`);
    } else {
      if (seen.has(entry.id)) errors.push(`duplicate ${entry.id}`);
      seen.add(entry.id);
      if (!PLAN_A_ID_SET.has(entry.id)) {
        errors.push(`${entry.id}: outside exact PNH-INV-01 through PNH-INV-46 baseline`);
      }
    }
    if (!LAW_STATUSES.includes(entry.law_status as LawStatus)) {
      errors.push(`${where}: law_status must be one of ${LAW_STATUSES.join(", ")}`);
    }
    if (!ENFORCEMENT_KINDS.includes(entry.enforcement_kind as EnforcementKind)) {
      errors.push(`${where}: enforcement_kind must be one of ${ENFORCEMENT_KINDS.join(", ")}`);
    }
    checkFirstRelease(entry.first_release, where, errors);
  });
  for (const id of PLAN_A_IDS) {
    if (!seen.has(id)) errors.push(`missing ${id}`);
  }
  return errors;
}

export function loadRatificationBaseline(path: string): RatificationBaseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new RegistryError([
      `unable to read ratification baseline ${path}: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  const errors = validateBaselineStructure(parsed);
  if (errors.length > 0) throw new RegistryError(errors);
  return parsed as RatificationBaseline;
}

export function validateRatificationBaseline(
  registry: Registry,
  baseline: RatificationBaseline,
  pin: RatificationBaselinePin,
  repoRoot: string,
): string[] {
  const errors: string[] = [];
  const baselineFile = resolve(repoRoot, pin.path);
  if (!existsSync(baselineFile)) {
    errors.push(`ratification baseline does not exist: ${pin.path}`);
  } else {
    const actual = sha256(readFileSync(baselineFile));
    if (actual !== pin.sha256) {
      errors.push(`ratification baseline hash drift: pinned ${pin.sha256}, actual ${actual}`);
    }
  }
  if (pin.decision !== baseline.decisions.enforcement_baseline) {
    errors.push("ratification baseline pin decision does not match baseline enforcement decision");
  }
  for (const relative of [
    pin.decision,
    ...baseline.sources.map((source) => source.path),
    ...Object.values(baseline.decisions),
  ]) {
    if (!existsSync(resolve(repoRoot, relative))) {
      errors.push(`ratification baseline bound path does not exist: ${relative}`);
    }
  }
  const registryById = new Map(registry.invariants.map((entry) => [entry.id, entry]));
  const baselineById = new Map(baseline.invariants.map((entry) => [entry.id, entry]));
  for (const id of PLAN_A_IDS) {
    const invariant = registryById.get(id);
    const expected = baselineById.get(id);
    if (invariant === undefined || expected === undefined) continue;
    if (invariant.law_status !== expected.law_status) {
      errors.push(`${id}: law_status differs from ratification baseline`);
    }
    if (invariant.enforcement_kind !== expected.enforcement_kind) {
      errors.push(`${id}: enforcement_kind differs from ratification baseline`);
    }
    if (stableStringify(invariant.first_release) !== stableStringify(expected.first_release)) {
      errors.push(`${id}: first_release differs from ratification baseline`);
    }
  }
  for (const id of registryById.keys()) {
    if (!PLAN_A_ID_SET.has(id)) {
      errors.push(`${id}: migrated registry is outside exact PNH-INV-01 through PNH-INV-46 set`);
    }
  }
  for (const id of PLAN_A_IDS) {
    if (!registryById.has(id)) errors.push(`${id}: missing from migrated registry`);
  }
  return errors;
}

export function validateRatificationBaselineTransition(
  nextPin: RatificationBaselinePin,
  nextBaseline: RatificationBaseline,
  previousPin: RatificationBaselinePin,
  repoRoot: string,
): string[] {
  const errors: string[] = [];
  if (nextPin.path === previousPin.path) {
    if (nextPin.sha256 !== previousPin.sha256) {
      errors.push("same-path baseline mutation is forbidden; use a new immutable artifact path");
    }
    return errors;
  }
  const previousPath = resolve(repoRoot, previousPin.path);
  if (!existsSync(previousPath)) {
    errors.push(`predecessor baseline does not exist: ${previousPin.path}`);
  } else if (sha256(readFileSync(previousPath)) !== previousPin.sha256) {
    errors.push(`predecessor baseline hash drift: ${previousPin.path}`);
  }
  const supersedes = nextBaseline.supersedes;
  if (supersedes === null) {
    errors.push("supersedes record is required for a new baseline path");
    return errors;
  }
  if (!SHA256_PATTERN.test(supersedes.from_hash) ||
      !DATE_PATTERN.test(supersedes.date) ||
      supersedes.decision.trim().length === 0 ||
      supersedes.owner.trim().length === 0 ||
      supersedes.reason.trim().length === 0) {
    errors.push("supersedes record is malformed");
  }
  if (supersedes.from_hash !== previousPin.sha256) {
    errors.push(
      `supersedes from_hash ${supersedes.from_hash} does not match predecessor ${previousPin.sha256}`,
    );
  }
  if (nextPin.decision !== supersedes.decision) {
    errors.push("new baseline pin decision does not match supersedes decision");
  }
  if (nextBaseline.owner !== supersedes.owner) {
    errors.push("baseline owner does not match supersedes owner");
  }
  if (!existsSync(resolve(repoRoot, supersedes.decision))) {
    errors.push(`baseline supersession decision does not exist: ${supersedes.decision}`);
  }
  return errors;
}

export interface InvariantLockEntryV2 {
  readonly binding_hash: `sha256:${string}`;
  readonly law_status: LawStatus;
  readonly proof_status: ProofStatus;
}

export interface ProtocolLockEntryV2 {
  readonly binding_hash: `sha256:${string}`;
  readonly protocol_version: number;
}

export type LockEntryV2 = InvariantLockEntryV2 | ProtocolLockEntryV2;

export interface LockFile {
  readonly version: 2;
  readonly ratification_baseline: RatificationBaselinePin;
  readonly entries: Readonly<Record<string, LockEntryV2>>;
}

export interface BindingChangeAuthorization {
  readonly entryId: string;
  readonly priorBindingHash: string;
  readonly newBindingHash: string;
  readonly decisionPath: string;
  readonly reason: string;
}

export interface LockUpdateAuthorizations {
  readonly proofTransitions?: ReadonlySet<string>;
  readonly bindingChanges?: ReadonlyMap<string, BindingChangeAuthorization>;
}

interface LegacyLockFile {
  readonly version: 1;
  readonly entries: Readonly<Record<string, { readonly hash: string; readonly status: string }>>;
}

export function computeLock(registry: Registry): LockFile {
  const entries: Record<string, LockEntryV2> = {};
  for (const invariant of registry.invariants) {
    entries[invariant.id] = {
      binding_hash: bindingHash(invariant),
      law_status: invariant.law_status,
      proof_status: invariant.proof_status,
    };
  }
  for (const protocol of registry.protocols) {
    entries[protocol.id] = {
      binding_hash: bindingHash(protocol),
      protocol_version: protocol.version,
    };
  }
  return {
    version: 2,
    ratification_baseline: registry.ratification_baseline,
    entries,
  };
}

function isLegacyLock(lock: LockFile | LegacyLockFile): lock is LegacyLockFile {
  return lock.version === 1;
}

/**
 * Strict-diff guardrail for the guarded updater. A proof transition may change
 * exactly three things on an authorized row — proof_status, removal of
 * proof_reason, and appended amendments — and nothing anywhere else. Without
 * this, a validated proof authority for one invariant would license arbitrary
 * edits riding along in the same lock update.
 */
export function validateAuthorizedProofDelta(
  prior: Registry,
  live: Registry,
  authorizedIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const priorById = new Map<string, Invariant | ProtocolPin>();
  for (const entry of [...prior.invariants, ...prior.protocols]) priorById.set(entry.id, entry);
  const liveById = new Map<string, Invariant | ProtocolPin>();
  for (const entry of [...live.invariants, ...live.protocols]) liveById.set(entry.id, entry);

  const withoutDelta = (entry: Invariant | ProtocolPin): string => {
    const { proof_status, proof_reason, amendments, ...rest } =
      entry as unknown as Record<string, unknown>;
    return stableStringify(rest);
  };

  for (const [id, priorEntry] of priorById) {
    const liveEntry = liveById.get(id);
    if (liveEntry === undefined) {
      errors.push(`${id}: removed from the registry by an authorized proof transition`);
      continue;
    }
    if (stableStringify(priorEntry) === stableStringify(liveEntry)) continue;
    if (!authorizedIds.has(id)) {
      errors.push(`${id}: changed without proof authority`);
      continue;
    }
    if (withoutDelta(priorEntry) !== withoutDelta(liveEntry)) {
      errors.push(`${id}: changed outside the authorized proof delta`);
    }
    const priorAmendments = priorEntry.amendments ?? [];
    const liveAmendments = liveEntry.amendments ?? [];
    if (liveAmendments.length < priorAmendments.length ||
        stableStringify(liveAmendments.slice(0, priorAmendments.length)) !==
          stableStringify(priorAmendments)) {
      errors.push(`${id}: existing amendments were rewritten, not appended to`);
    }
    if (isInvariant(priorEntry) && isInvariant(liveEntry)) {
      if (liveEntry.proof_reason !== undefined &&
          liveEntry.proof_reason !== priorEntry.proof_reason) {
        errors.push(`${id}: proof_reason may be removed but not rewritten`);
      }
    }
  }
  for (const id of liveById.keys()) {
    if (!priorById.has(id)) errors.push(`${id}: added by an authorized proof transition`);
  }

  const registryShell = (registry: Registry): string => {
    const { invariants, protocols, ...rest } = registry as unknown as Record<string, unknown>;
    return stableStringify(rest);
  };
  if (registryShell(prior) !== registryShell(live)) {
    errors.push("registry-level fields changed under a proof transition");
  }
  return errors;
}

/**
 * A decision-authorized binding update may alter only the binding payload the
 * decision names and append exactly one matching amendment. All other rows,
 * metadata, ordering, and registry-level fields remain byte-equivalent under
 * stable serialization. Protocol updates are deliberately narrower: only the
 * schema hash may move, so version and every declared surface stay fixed.
 */
export function validateAuthorizedBindingDelta(
  prior: Registry,
  live: Registry,
  authorizations: ReadonlyMap<string, BindingChangeAuthorization>,
): string[] {
  const errors: string[] = [];
  const priorEntries = [...prior.invariants, ...prior.protocols];
  const liveEntries = [...live.invariants, ...live.protocols];
  const priorById = new Map(priorEntries.map((entry) => [entry.id, entry]));
  const liveById = new Map(liveEntries.map((entry) => [entry.id, entry]));

  const registryShell = (registry: Registry): string => {
    const { invariants, protocols, ...rest } = registry as unknown as Record<string, unknown>;
    return stableStringify(rest);
  };
  if (registryShell(prior) !== registryShell(live)) {
    errors.push("registry-level fields changed under a binding-change decision");
  }
  if (stableStringify(prior.invariants.map(({ id }) => id)) !==
      stableStringify(live.invariants.map(({ id }) => id)) ||
      stableStringify(prior.protocols.map(({ id }) => id)) !==
      stableStringify(live.protocols.map(({ id }) => id))) {
    errors.push("registry entry membership or ordering changed under a binding-change decision");
  }

  const invariantRemainder = (entry: Invariant): string => {
    const { statement, bounds, amendments, ...rest } =
      entry as unknown as Record<string, unknown>;
    return stableStringify(rest);
  };
  const protocolRemainder = (entry: ProtocolPin): string => {
    const { schema_hash, amendments, ...rest } =
      entry as unknown as Record<string, unknown>;
    return stableStringify(rest);
  };

  for (const priorEntry of priorEntries) {
    const liveEntry = liveById.get(priorEntry.id);
    if (liveEntry === undefined) {
      errors.push(`${priorEntry.id}: removed under a binding-change decision`);
      continue;
    }
    const authorization = authorizations.get(priorEntry.id);
    if (stableStringify(priorEntry) === stableStringify(liveEntry)) {
      if (authorization !== undefined) {
        errors.push(`${priorEntry.id}: binding-change authority targets an unchanged entry`);
      }
      continue;
    }
    if (authorization === undefined) {
      errors.push(`${priorEntry.id}: changed without binding-change authority`);
      continue;
    }
    if (authorization.entryId !== priorEntry.id) {
      errors.push(
        `${priorEntry.id}: binding-change authority names ${authorization.entryId}`,
      );
    }
    const priorHash = bindingHash(priorEntry);
    const liveHash = bindingHash(liveEntry);
    if (priorHash === liveHash) {
      errors.push(`${priorEntry.id}: changed outside the binding payload`);
    }
    if (authorization.priorBindingHash !== priorHash) {
      errors.push(
        `${priorEntry.id}: authority prior binding hash ${authorization.priorBindingHash} does not match ${priorHash}`,
      );
    }
    if (authorization.newBindingHash !== liveHash) {
      errors.push(
        `${priorEntry.id}: authority new binding hash ${authorization.newBindingHash} does not match ${liveHash}`,
      );
    }

    if (isInvariant(priorEntry) !== isInvariant(liveEntry)) {
      errors.push(`${priorEntry.id}: entry kind changed under binding authority`);
    } else if (isInvariant(priorEntry) && isInvariant(liveEntry)) {
      if (invariantRemainder(priorEntry) !== invariantRemainder(liveEntry)) {
        errors.push(`${priorEntry.id}: changed outside the authorized binding delta`);
      }
    } else if (!isInvariant(priorEntry) && !isInvariant(liveEntry) &&
        protocolRemainder(priorEntry) !== protocolRemainder(liveEntry)) {
      errors.push(`${priorEntry.id}: changed outside the authorized binding delta`);
    }

    const priorAmendments = priorEntry.amendments ?? [];
    const liveAmendments = liveEntry.amendments ?? [];
    if (stableStringify(liveAmendments.slice(0, priorAmendments.length)) !==
        stableStringify(priorAmendments)) {
      errors.push(`${priorEntry.id}: existing amendments were rewritten`);
    }
    if (liveAmendments.length !== priorAmendments.length + 1) {
      errors.push(`${priorEntry.id}: binding change requires exactly one appended amendment`);
      continue;
    }
    const amendment = liveAmendments.at(-1)!;
    if (amendment.kind !== "binding-change" ||
        amendment.from_hash !== authorization.priorBindingHash ||
        amendment.decision !== authorization.decisionPath ||
        amendment.reason !== authorization.reason) {
      errors.push(`${priorEntry.id}: appended amendment does not match decision authority`);
    }
  }
  for (const id of liveById.keys()) {
    if (!priorById.has(id)) errors.push(`${id}: added under a binding-change decision`);
  }
  for (const id of authorizations.keys()) {
    if (!priorById.has(id)) errors.push(`${id}: binding-change authority names an unknown entry`);
  }
  return errors;
}

export function diffAgainstLock(
  registry: Registry,
  lock: LockFile | LegacyLockFile,
  repoRoot: string,
  authorizations: LockUpdateAuthorizations = {},
): string[] {
  const errors = new Set<string>();
  const current = new Map<string, Invariant | ProtocolPin>();
  for (const entry of [...registry.invariants, ...registry.protocols]) current.set(entry.id, entry);
  const requireAmendment = (
    entry: Invariant | ProtocolPin,
    reason: string,
    lockedHash: string,
  ): void => {
    const amendment = entry.amendments?.at(-1);
    if (amendment === undefined) {
      errors.add(`${entry.id}: ${reason} requires an amendment entry citing a decision record`);
      return;
    }
    if (!existsSync(resolve(repoRoot, amendment.decision))) {
      errors.add(`${entry.id}: amendment decision does not exist: ${amendment.decision}`);
    }
    if (amendment.from_hash !== lockedHash) {
      errors.add(
        `${entry.id}: amendment from_hash ${amendment.from_hash} does not match locked hash ${lockedHash}`,
      );
    }
  };

  if (!isLegacyLock(lock) &&
      stableStringify(lock.ratification_baseline) !==
        stableStringify(registry.ratification_baseline)) {
    errors.add("ratification baseline pin differs from lock");
  }

  for (const [id, locked] of Object.entries(lock.entries)) {
    const entry = current.get(id);
    if (entry === undefined) {
      errors.add(`${id}: deleted from registry; ids are permanent, retire instead`);
      continue;
    }
    const lockedHash = isLegacyLock(lock) ? locked.hash : locked.binding_hash;
    const currentHash = bindingHash(entry);
    if (!isLegacyLock(lock) && isInvariant(entry)) {
      if (!("law_status" in locked) || !("proof_status" in locked)) {
        errors.add(`${id}: invariant lock entry is malformed`);
      } else {
        if (entry.law_status !== locked.law_status) {
          requireAmendment(entry, "law-status transition", lockedHash);
          errors.add(`${id}: law-status transition requires trusted transition authority`);
        }
        if (entry.proof_status !== locked.proof_status) {
          requireAmendment(entry, "proof-status transition", lockedHash);
          // A resolved proof authority is the only thing that satisfies this;
          // law-status transitions below are never satisfied by one.
          if (!authorizations.proofTransitions?.has(id)) {
            errors.add(`${id}: proof-status transition requires trusted transition authority`);
          }
        }
      }
    }
    if (currentHash !== lockedHash) {
      requireAmendment(entry, "binding-field change", lockedHash);
      // proof_reason is a binding field, so dropping it on a proven transition
      // moves the binding hash. That decision rides with the proof authority
      // (see invariant-transition.ts, which validates proof_reason itself); the
      // authorized-delta guardrail bounds what else may move with it.
      const bindingAuthorization = authorizations.bindingChanges?.get(id);
      const exactBindingAuthorization = bindingAuthorization !== undefined &&
        bindingAuthorization.entryId === id &&
        bindingAuthorization.priorBindingHash === lockedHash &&
        bindingAuthorization.newBindingHash === currentHash;
      if (!isLegacyLock(lock) &&
          !authorizations.proofTransitions?.has(id) &&
          !exactBindingAuthorization) {
        errors.add(`${id}: binding-field change requires trusted decision authority`);
      }
      errors.add(`stale lock: ${id} changed (run generate-constitution --update-lock)`);
    }
  }
  for (const id of current.keys()) {
    if (!(id in lock.entries)) errors.add(`new id ${id} (run --update-lock)`);
  }
  return [...errors];
}

export function computeSchemaHash(
  sources: readonly string[],
  repoRoot: string,
): `sha256:${string}` {
  const hash = createHash("sha256");
  for (const relative of sources) {
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(readFileSync(resolve(repoRoot, relative)));
  }
  return `sha256:${hash.digest("hex")}`;
}

export function validateProtocolPins(registry: Registry, repoRoot: string): string[] {
  const errors: string[] = [];
  for (const pin of registry.protocols) {
    const actual = computeSchemaHash(pin.schema_source, repoRoot);
    if (actual !== pin.schema_hash) {
      errors.push(
        `${pin.id}: schema hash mismatch — wire schema changed without a registry version bump`,
      );
    }
    const specPath = resolve(repoRoot, pin.spec);
    const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
    if (!spec.split("\n").some((line) => line.trim() === `Version: ${pin.version}`)) {
      errors.push(`${pin.id}: spec ${pin.spec} does not declare Version: ${pin.version}`);
    }
  }
  return errors;
}
