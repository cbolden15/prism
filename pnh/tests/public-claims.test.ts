import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AVAILABILITY_PHRASES,
  EMPTY_TEXT_DIGEST,
  EXECUTION_CLASSES,
  NORMATIVE_SECURITY_PHRASES,
  PublicClaimError,
  SANDBOX_PHRASES,
  claimTextDigest,
  firstSecurityPhrase,
  formatClaimFailure,
  normalizeClaimText,
  parsePublicClaimManifest,
  runPublicClaimGate,
  type ClaimFailure,
  type SecurityPhrase,
} from "../../assurance/constitution/contracts/public-claims.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRepoRoot = resolve(here, "..", "..");
const MANIFEST = "assurance/constitution/contracts/public-claims.yaml";
const REGISTRY = "assurance/constitution/contracts/invariants.yaml";
const SURFACE = "pnh/README.md";
const CLAIM = "PNH-CLAIM-01";
const BASELINE_DIGEST = `sha256:${"a".repeat(64)}`;
const PROVEN_ROW = { id: "PNH-INV-02", law: "ratified", proof: "proven", disposition: "retain" } as const;
const DEFER_ROW = {
  id: "PNH-INV-39",
  law: "ratified",
  proof: "unproven",
  disposition: "defer",
} as const;

interface RegistryRow {
  readonly id: string;
  readonly law: "proposed" | "ratified" | "retired";
  readonly proof: "unproven" | "partial" | "proven";
  readonly disposition: "activate" | "retain" | "defer";
}

interface ClaimSpec {
  readonly id?: string;
  readonly file?: string;
  readonly posture?: string;
  readonly digest?: string;
  readonly invariants?: readonly string[];
  readonly classes?: readonly string[];
  readonly environments?: readonly string[];
  readonly scope?: string;
}

interface Scenario {
  readonly rows?: readonly RegistryRow[];
  readonly surfaces?: readonly string[];
  readonly claims: readonly ClaimSpec[];
  readonly files: Readonly<Record<string, string>>;
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function registryDocument(rows: readonly RegistryRow[]): string {
  const lines = [
    "version: 2",
    "ratification_baseline:",
    "  path: assurance/constitution/contracts/ratification-baselines/fixture-v1.json",
    `  sha256: ${BASELINE_DIGEST}`,
    "  decision: docs/plans/provider-neutral-harness/fixture-decision.md",
    "invariants:",
  ];
  for (const row of rows) {
    lines.push(
      `  - id: ${row.id}`,
      `    title: Fixture invariant ${row.id}`,
      "    category: isolation",
      "    statement: |",
      "      Fixture statement.",
      `    law_status: ${row.law}`,
      `    proof_status: ${row.proof}`,
    );
    if (row.proof !== "proven") {
      lines.push("    proof_reason: Fixture proof is incomplete.");
    }
    lines.push(
      "    enforcement_kind: runtime-adversarial",
      "    first_release:",
      `      disposition: ${row.disposition}`,
      "      closing_gates: [A]",
      "    conformance: []",
      "    since: 2026-08-21",
      "    decisions:",
      "      - docs/plans/provider-neutral-harness/fixture-decision.md",
    );
  }
  lines.push("protocols: []", "");
  return lines.join("\n");
}

function yamlList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function manifestDocument(
  surfaces: readonly string[],
  claims: readonly ClaimSpec[],
): string {
  const lines = ["version: 1", `surfaces: ${yamlList(surfaces)}`, "claims:"];
  if (claims.length === 0) lines[2] = "claims: []";
  for (const claim of claims) {
    lines.push(
      `  - id: ${claim.id ?? CLAIM}`,
      `    file: ${claim.file ?? SURFACE}`,
      `    posture: ${claim.posture ?? "supported"}`,
      `    text_digest: ${claim.digest ?? `sha256:${"0".repeat(64)}`}`,
      `    invariants: ${yamlList(claim.invariants ?? [PROVEN_ROW.id])}`,
      `    execution_classes: ${yamlList(claim.classes ?? [])}`,
      `    evidence_environments: ${yamlList(claim.environments ?? ["none"])}`,
      `    release_scope: ${claim.scope ?? "private-incubation"}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function block(
  id: string,
  kind: "claim" | "limitation",
  body: readonly string[],
): readonly string[] {
  return [`<!-- pnh:${kind}:${id}:begin -->`, ...body, `<!-- pnh:${kind}:${id}:end -->`];
}

function digestOf(body: readonly string[]): string {
  return claimTextDigest(normalizeClaimText(body));
}

function markdown(...lines: readonly (string | readonly string[])[]): string {
  return `${lines.flat().join("\n")}\n`;
}

function fixture(t: { after(callback: () => void): void }, scenario: Scenario): string {
  const root = mkdtempSync(join(tmpdir(), "pnh-public-claims-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(root, REGISTRY, registryDocument(scenario.rows ?? [PROVEN_ROW]));
  write(root, MANIFEST, manifestDocument(scenario.surfaces ?? [SURFACE], scenario.claims));
  for (const [path, content] of Object.entries(scenario.files)) write(root, path, content);
  return root;
}

function messages(failures: readonly ClaimFailure[]): readonly string[] {
  return failures.map((failure) => failure.message);
}

// A supported claim whose every backing invariant is ratified, proven, and
// non-deferred is the only shape the gate accepts, so every negative fixture
// below starts from this one and changes exactly one thing.
const SUPPORTED_BODY = [
  "The public core carries no consumer specifics. Enforced, not promised.",
] as const;

function supportedScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    claims: [{ digest: digestOf(SUPPORTED_BODY) }],
    files: { [SURFACE]: markdown("# Fixture surface", "", block(CLAIM, "claim", SUPPORTED_BODY)) },
    ...overrides,
  };
}

test("a supported claim backed by a ratified, proven, non-deferred invariant passes", (t) => {
  const failures = runPublicClaimGate(fixture(t, supportedScenario()));
  assert.deepEqual(failures, []);
});

test("refusal: a supported claim backed by a partial invariant fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-22", law: "ratified", proof: "partial", disposition: "activate" }],
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-22"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "supported claim is backed by PNH-INV-22 whose proof_status is partial; " +
      "a supported claim requires proven",
  ]);
});

test("refusal: a supported claim backed by an unproven invariant fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-25", law: "ratified", proof: "unproven", disposition: "activate" }],
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-25"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "supported claim is backed by PNH-INV-25 whose proof_status is unproven; " +
      "a supported claim requires proven",
  ]);
});

test("refusal: a supported claim backed by proposed law fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-90", law: "proposed", proof: "proven", disposition: "activate" }],
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-90"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "supported claim is backed by PNH-INV-90 whose law_status is proposed; " +
      "a supported claim requires ratified",
  ]);
});

test("refusal: a supported claim backed by retired law fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-91", law: "retired", proof: "proven", disposition: "activate" }],
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-91"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "supported claim is backed by PNH-INV-91 whose law_status is retired; " +
      "a supported claim requires ratified",
  ]);
});

test("refusal: a supported claim backed by a deferred disposition fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-39", law: "ratified", proof: "proven", disposition: "defer" }],
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-39"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "claim is backed by PNH-INV-39 whose first-release disposition is defer; " +
      "posture supported must be deferred or limitation",
    "supported claim is backed by PNH-INV-39 whose first-release disposition is defer; " +
      "a supported claim requires a non-deferred disposition",
  ]);
});

test("refusal: a supported claim with no backing invariant fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: [] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "supported claim registers no backing invariant",
  ]);
});

test("refusal: a deferred claim described as available fails closed", (t) => {
  const body = ["Cell ports are available today for out-of-process plugin cells."] as const;
  const root = fixture(t, {
    rows: [{ id: "PNH-INV-39", law: "ratified", proof: "unproven", disposition: "defer" }],
    claims: [{ posture: "deferred", digest: digestOf(body), invariants: ["PNH-INV-39"] }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'deferred claim describes the behavior as available ("available")',
  ]);
});

test("refusal: a marker whose claim ID is absent from the manifest fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ id: "PNH-CLAIM-02", digest: digestOf(SUPPORTED_BODY) }],
  }));
  const failures = runPublicClaimGate(root);
  assert.ok(
    messages(failures).includes(
      `marker registers claim ${CLAIM}, which the manifest does not contain`,
    ),
    formatFailures(failures),
  );
});

test("refusal: a manifest claim with no marker fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: { [SURFACE]: markdown("# Fixture surface", "", "Ordinary prose with no marker.") },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `manifest claim has no marker in ${SURFACE}`,
  ]);
});

test("refusal: an unknown invariant ID fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(SUPPORTED_BODY), invariants: ["PNH-INV-99"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "claim names unknown invariant PNH-INV-99",
  ]);
});

test("refusal: a manifest file path that does not exist fails closed", (t) => {
  const root = fixture(t, {
    surfaces: [SURFACE, "pnh/MISSING.md"],
    claims: [{ file: "pnh/MISSING.md", digest: digestOf(SUPPORTED_BODY) }],
    files: { [SURFACE]: markdown("# Fixture surface") },
  });
  assert.ok(
    messages(runPublicClaimGate(root)).includes("claim file pnh/MISSING.md does not exist"),
  );
});

test("refusal: duplicate markers for one claim ID fail closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        block(CLAIM, "claim", SUPPORTED_BODY),
      ),
    },
  }));
  assert.ok(
    messages(runPublicClaimGate(root)).includes(`duplicate marker for claim ${CLAIM}`),
  );
});

test("refusal: normalized-text digest drift fails closed", (t) => {
  const drifted = ["The public core carries no consumer specifics. Enforced everywhere."] as const;
  const root = fixture(t, supportedScenario({
    files: { [SURFACE]: markdown(block(CLAIM, "claim", drifted)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `normalized claim text digest ${digestOf(drifted)} does not match the registered digest ` +
      `${digestOf(SUPPORTED_BODY)}`,
  ]);
});

test("refusal: unmarked normative security language in ordinary prose fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "Every plugin runs sandboxed.",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") outside a registered claim block',
  ]);
});

// Fenced code is excluded from claim-text digests, so it is never registered
// text — yet the Gate P4 falsification review (F-01) carried a security claim
// past both the digest and the sweep inside one backtick pair. Fenced lines
// are swept as unregistered content wherever they appear.
test("refusal: a security phrase inside a fence outside registered blocks fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "```text",
        "# trusted-subprocess-v1 is sandboxed and provides a guaranteed isolation boundary",
        "```",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") inside a fenced code block',
  ]);
});

test("refusal: a security phrase fenced inside a registered claim block fails closed", (t) => {
  const body = [...SUPPORTED_BODY, "", "```sh", "# trusted-subprocess-v1 is sandboxed here", "```"];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown("# Fixture surface", "", block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") inside a fenced code block',
  ]);
});

// The whole-surface sweep also covers availability wording and invariant
// references (F-02): status overstatement must live inside a registered block
// where posture rules bind it to the registry.
test("refusal: unregistered availability language outside a registered claim block fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "The broker is production-ready.",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered availability language ("production-ready") outside a registered claim block',
  ]);
});

// A generated-region marker is a plain HTML comment any writer can type, and
// both the digest and the sweep drop its interior (F-13) — the same two-layer
// escape the fence fix closed. No generator owns any registered public
// surface, so the marker itself is refused wherever it appears outside a
// fence.
test("refusal: a generated-region marker outside registered blocks fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "<!-- pnh:conformance:begin -->",
        "trusted-subprocess-v1 is sandboxed and provides a guaranteed isolation boundary.",
        "<!-- pnh:conformance:end -->",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `generated-region marker on public surface ${SURFACE}, which no generator owns`,
    'unregistered normative security language ("sandboxed") outside a registered claim block',
    `generated-region marker on public surface ${SURFACE}, which no generator owns`,
  ]);
});

test("refusal: a generated-region marker inside a registered claim block fails closed", (t) => {
  const body = [
    ...SUPPORTED_BODY,
    "<!-- pnh:invariants:index:begin -->",
    "trusted-subprocess-v1 is sandboxed here.",
    "<!-- pnh:invariants:index:end -->",
  ];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `generated-region marker on public surface ${SURFACE}, which no generator owns`,
    `generated-region marker on public surface ${SURFACE}, which no generator owns`,
  ]);
});

test("a generated marker inside a fence is literal fence content, not a region", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "```text",
        "<!-- pnh:conformance:begin -->",
        "```",
      ),
    },
  }));
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("refusal: an invariant id referenced outside a registered claim block fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "PNH-INV-26 is proven today.",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered invariant reference ("PNH-INV-26") outside a registered claim block',
  ]);
});

test("refusal: an execution class outside the closed vocabulary fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(SUPPORTED_BODY), classes: ["vm-isolated-v1"] }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'claim registers unknown execution class "vm-isolated-v1"',
  ]);
});

// Posture deferred, backed by a defer-disposition row so the posture rule is
// satisfied: naming container-isolated-v1 also states an isolation boundary,
// which only a limitation block may do (fix 5, widened to deferred by NEW-I2).
test("refusal: wording tied to an unregistered execution class fails closed", (t) => {
  const body = ["Plugin bytes run under container-isolated-v1."] as const;
  const root = fixture(t, supportedScenario({
    rows: [DEFER_ROW],
    claims: [{
      posture: "deferred",
      digest: digestOf(body),
      classes: [],
      invariants: [DEFER_ROW.id],
    }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'claim text names execution class "container-isolated-v1", which the claim does not register',
    'deferred claim text states an isolation boundary ("isolated"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: any sandbox claim for trusted-subprocess-v1 fails closed", (t) => {
  const body = ["Owner-reviewed subprocess plugins run sandboxed under trusted-subprocess-v1."];
  const root = fixture(t, supportedScenario({
    rows: [DEFER_ROW],
    claims: [{
      posture: "deferred",
      digest: digestOf(body),
      classes: ["trusted-subprocess-v1"],
      invariants: [DEFER_ROW.id],
    }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'claim text calls trusted-subprocess-v1 sandboxed ("sandboxed"); ' +
      "trusted-subprocess-v1 makes no hostile-code sandbox claim",
    'deferred claim text states an isolation boundary ("sandboxed"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: an empty surface set fails closed", (t) => {
  const root = fixture(t, {
    surfaces: [],
    claims: [],
    files: { [SURFACE]: markdown("# Fixture surface") },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "no public surface is registered; the public-claim gate fails closed",
  ]);
});

test("refusal: a registered surface missing from disk fails closed", (t) => {
  const root = fixture(t, {
    surfaces: ["pnh/GONE.md"],
    claims: [],
    files: { [SURFACE]: markdown("# Fixture surface") },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "public surface pnh/GONE.md does not exist",
  ]);
});

test("refusal: a limitation posture registered with a claim marker fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "limitation", digest: digestOf(SUPPORTED_BODY) }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "posture limitation requires a limitation marker",
  ]);
});

test("a limitation block may disclaim sandboxing for trusted-subprocess-v1", (t) => {
  const body = [
    "Prism makes no sandbox claim for trusted-subprocess-v1: the process runs with the",
    "invoking user's ambient authority.",
  ];
  const root = fixture(t, {
    rows: [{ id: "PNH-INV-25", law: "ratified", proof: "unproven", disposition: "activate" }],
    claims: [{
      posture: "limitation",
      digest: digestOf(body),
      invariants: ["PNH-INV-25"],
      classes: ["trusted-subprocess-v1"],
    }],
    files: { [SURFACE]: markdown(block(CLAIM, "limitation", body)) },
  });
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("normalization ignores fenced code and generated constitution blocks, not prose", () => {
  const digest = claimTextDigest(normalizeClaimText([
    "  The   core   is closed.  ",
    "",
    "```sh",
    "npm run test:pnh",
    "```",
    "<!-- pnh:conformance:begin -->",
    "generated conformance table",
    "<!-- pnh:conformance:end -->",
  ]));
  assert.equal(digest, claimTextDigest(normalizeClaimText(["The core is closed."])));
  assert.notEqual(digest, claimTextDigest(normalizeClaimText(["The core is open."])));
});

test("the manifest parser rejects unknown keys and malformed entries", () => {
  assert.throws(
    () => parsePublicClaimManifest(`${manifestDocument([SURFACE], [{}])}    notes: extra\n`),
    (error: unknown) => error instanceof PublicClaimError &&
      /unknown field notes/u.test((error as Error).message),
  );
  assert.throws(
    () => parsePublicClaimManifest("version: 1\nclaims: []\n"),
    (error: unknown) => error instanceof PublicClaimError &&
      /surfaces must be a string list/u.test((error as Error).message),
  );
  assert.throws(
    () => parsePublicClaimManifest(manifestDocument([SURFACE], [{ posture: "shipped" }])),
    (error: unknown) => error instanceof PublicClaimError &&
      /posture must be one of/u.test((error as Error).message),
  );
});

test("every failure carries a claim ID, a file, and a line", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown("# Fixture surface", "", "Every plugin runs sandboxed.", "",
        block(CLAIM, "claim", SUPPORTED_BODY)),
    },
  }));
  const [failure] = runPublicClaimGate(root);
  assert.equal(failure?.file, SURFACE);
  assert.equal(failure?.line, 3);
  assert.equal(
    formatClaimFailure(failure as ClaimFailure),
    'pnh/README.md:3: -: unregistered normative security language ("sandboxed") ' +
      "outside a registered claim block",
  );
});

test("the committed fixture surface and manifest pass the gate", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pnh-public-claims-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixtures = resolve(sourceRepoRoot, "pnh/tests/fixtures/constitution");
  write(root, REGISTRY, registryDocument([
    PROVEN_ROW,
    { id: "PNH-INV-25", law: "ratified", proof: "unproven", disposition: "activate" },
  ]));
  copyInto(root, MANIFEST, resolve(fixtures, "public-claims-manifest.yaml"));
  copyInto(root, "pnh/tests/fixtures/constitution/public-claim-surface.md",
    resolve(fixtures, "public-claim-surface.md"));
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("the closed execution-class vocabulary matches the constitution", () => {
  assert.deepEqual([...EXECUTION_CLASSES], [
    "container-isolated-v1",
    "trusted-subprocess-v1",
    "development-v1",
  ]);
});

// Normalization holes reported by the falsification review: an inline comment
// pair, an indented pseudo-fence, an unterminated fence, and a zero-width
// character each walked past the digest or the prose scan.
const SMUGGLE_LINE = "<!-- --> Prism Harness runs sandboxed plugin code. <!-- -->";
const VISIBLE_LINE = "Prism Harness runs plugins.";
const ZERO_WIDTH_SPACE = "\u200B";

test("refusal: an inline HTML comment pair inside a block keeps its prose in the digest", (t) => {
  const smuggled = [VISIBLE_LINE, SMUGGLE_LINE];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf([VISIBLE_LINE]) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", smuggled)) },
  }));
  const failures = runPublicClaimGate(root);
  assert.ok(
    messages(failures).includes(
      `normalized claim text digest ${digestOf(smuggled)} does not match the registered digest ` +
        `${digestOf([VISIBLE_LINE])}`,
    ),
    formatFailures(failures),
  );
});

test("refusal: an inline HTML comment pair in ordinary prose is still scanned", (t) => {
  const root = fixture(t, supportedScenario({
    files: { [SURFACE]: markdown(block(CLAIM, "claim", SUPPORTED_BODY), "", SMUGGLE_LINE) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") outside a registered claim block',
  ]);
});

test("refusal: a four-space-indented fence marker does not silence the prose scan", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "Prism Harness is a harness.",
        "    ```",
        "Prism Harness is sandboxed.",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") outside a registered claim block',
  ]);
});

test("refusal: a surface that ends inside a fence fails closed", (t) => {
  const root = fixture(t, {
    claims: [],
    files: {
      [SURFACE]: markdown("# Fixture surface", "", "```", "Prism Harness is sandboxed."),
    },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `public surface ${SURFACE} ends inside a fenced code block opened at line 3`,
    'unregistered normative security language ("sandboxed") inside a fenced code block',
  ]);
});

test("refusal: a registered block that ends inside a fence fails closed", (t) => {
  const body = [VISIBLE_LINE, "```", "Prism Harness is sandboxed."];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `claim ${CLAIM} in ${SURFACE} ends inside a fenced code block opened at line 3`,
    'unregistered normative security language ("sandboxed") inside a fenced code block',
  ]);
});

test("refusal: a zero-width character does not hide a normative phrase", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        `Every plugin runs sand${ZERO_WIDTH_SPACE}boxed.`,
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxed") outside a registered claim block',
  ]);
});

// Vocabulary holes reported by the falsification review: `sandboxes` walked
// past a flat phrase list, a supported block could assert an isolation boundary
// the registry never proves, and a planned block could present unbuilt behavior
// as operational.
function claimId(index: number): string {
  return `PNH-CLAIM-${String(index + 1).padStart(2, "0")}`;
}

function vocabularyForms(vocabulary: readonly SecurityPhrase[]): readonly string[] {
  return vocabulary.flatMap((entry) => entry.forms);
}

test("refusal: a supported claim that calls the trusted subprocess sandboxed fails closed", (t) => {
  const body = ["Prism Harness sandboxes hostile plugin code in the trusted-subprocess-v1 worker."];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body), classes: ["trusted-subprocess-v1"] }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'claim text calls trusted-subprocess-v1 sandboxed ("sandboxes"); ' +
      "trusted-subprocess-v1 makes no hostile-code sandbox claim",
    'supported claim text states an isolation boundary ("sandboxes"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: unregistered prose saying the harness sandboxes hostile code fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "Prism Harness sandboxes plugin code.",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'unregistered normative security language ("sandboxes") outside a registered claim block',
  ]);
});

test("every normative security phrase is refused in unregistered prose", (t) => {
  const forms = vocabularyForms(NORMATIVE_SECURITY_PHRASES);
  const root = fixture(t, {
    claims: [],
    files: { [SURFACE]: markdown(...forms.map((form) => `A sentence about ${form} here.`)) },
  });
  const failures = runPublicClaimGate(root);
  assert.deepEqual(
    failures.map((failure) => failure.line),
    forms.map((_, index) => index + 1),
    formatFailures(failures),
  );
  for (const failure of failures) {
    assert.match(failure.message, /^unregistered normative security language /u);
  }
});

test("every sandbox phrase is refused inside a supported block", (t) => {
  const forms = vocabularyForms(SANDBOX_PHRASES);
  const bodies = forms.map((form) => [`Plugin code is ${form} by the harness.`]);
  const root = fixture(t, {
    claims: bodies.map((body, index) => ({ id: claimId(index), digest: digestOf(body) })),
    files: {
      [SURFACE]: markdown(...bodies.map((body, index) => block(claimId(index), "claim", body))),
    },
  });
  const failures = runPublicClaimGate(root);
  assert.equal(failures.length, forms.length, formatFailures(failures));
  for (const failure of failures) {
    assert.match(failure.message, /^supported claim text states an isolation boundary /u);
  }
});

test("every availability phrase is refused inside a deferred block", (t) => {
  const forms = vocabularyForms(AVAILABILITY_PHRASES);
  const bodies = forms.map((form) => [`The mechanism ${form} for callers today.`]);
  const root = fixture(t, {
    rows: [DEFER_ROW],
    claims: bodies.map((body, index) => ({
      id: claimId(index),
      posture: "deferred",
      digest: digestOf(body),
      invariants: [DEFER_ROW.id],
    })),
    files: {
      [SURFACE]: markdown(...bodies.map((body, index) => block(claimId(index), "claim", body))),
    },
  });
  const failures = runPublicClaimGate(root);
  assert.equal(failures.length, forms.length, formatFailures(failures));
  for (const failure of failures) {
    assert.match(failure.message, /^deferred claim describes the behavior as available /u);
  }
});

test("the sandbox family is a subset of the normative security vocabulary", () => {
  const normative = new Set(vocabularyForms(NORMATIVE_SECURITY_PHRASES));
  for (const form of vocabularyForms(SANDBOX_PHRASES)) assert.ok(normative.has(form), form);
  assert.equal(firstSecurityPhrase("A container image", SANDBOX_PHRASES), undefined);
  assert.equal(firstSecurityPhrase("Two containers start", SANDBOX_PHRASES), undefined);
  assert.equal(firstSecurityPhrase("Workers are contained", SANDBOX_PHRASES), "contained");
  assert.equal(firstSecurityPhrase("Full containment holds", SANDBOX_PHRASES), "containment");
});

test("refusal: a supported claim using isolation vocabulary fails closed", (t) => {
  const body = ["Core code runs in fresh Docker-contained workers."];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'supported claim text states an isolation boundary ("contained"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: a planned claim using isolation vocabulary fails closed", (t) => {
  const body = ["The Docker executor's isolation comes from its launch profile."];
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "planned", digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'planned claim text states an isolation boundary ("isolation"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: a supported claim asserting an absolute fails closed", (t) => {
  const body = ["Workers never receive a writable manifest path."];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'supported claim text asserts an absolute ("never"); ' +
      "a supported claim states only what its proven invariants state",
  ]);
});

// The shape of PNH-CLAIM-14's restored sentence: an absolute inside a
// limitation narrows what the project claims, so the rule stays supported-only.
test("a limitation claim may state an absolute", (t) => {
  const body = [
    "Normal test runs use a deterministic fake `codex` executable and never call a cloud service.",
  ];
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "limitation", digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "limitation", body)) },
  }));
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("a supported claim may still use no, any, every, and all", (t) => {
  const body = ["No consumer specific reaches any module: every import, all of it, stays inside."];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("refusal: an un-negated sandbox phrase in a limitation block fails closed", (t) => {
  const body = ["Subprocess plugins are sandboxed by the harness."];
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "limitation", digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "limitation", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'limitation claim text uses isolation vocabulary ("sandboxed") without negating it',
  ]);
});

test("refusal: a planned claim described as available fails closed", (t) => {
  const body = ["Prism Harness runs Docker-container plugins today."];
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "planned", digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'planned claim describes the behavior as already available ("runs")',
  ]);
});

test("refusal: a planned claim backed by a deferred disposition fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-39", law: "ratified", proof: "unproven", disposition: "defer" }],
    claims: [{
      posture: "planned",
      digest: digestOf(SUPPORTED_BODY),
      invariants: ["PNH-INV-39"],
    }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "claim is backed by PNH-INV-39 whose first-release disposition is defer; " +
      "posture planned must be deferred or limitation",
  ]);
});

test("a limitation claim may bound a deferred-disposition invariant", (t) => {
  const body = ["Cell ports are not built; nothing in this release depends on them."];
  const root = fixture(t, supportedScenario({
    rows: [{ id: "PNH-INV-39", law: "ratified", proof: "unproven", disposition: "defer" }],
    claims: [{
      posture: "limitation",
      digest: digestOf(body),
      invariants: ["PNH-INV-39"],
    }],
    files: { [SURFACE]: markdown(block(CLAIM, "limitation", body)) },
  }));
  assert.deepEqual(runPublicClaimGate(root), []);
});

// Marker-structure and surface-membership refusals the review's mutation probes
// found uncovered: deleting any of the six left the suite green. One isolating
// fixture each, so a future refactor cannot drop them silently.
const OTHER_SURFACE = "pnh/GUIDE.md";

test("refusal: a marker in a file other than the registered one fails closed", (t) => {
  const root = fixture(t, {
    surfaces: [SURFACE, OTHER_SURFACE],
    claims: [{ digest: digestOf(SUPPORTED_BODY) }],
    files: {
      [SURFACE]: markdown("# Fixture surface"),
      [OTHER_SURFACE]: markdown(block(CLAIM, "claim", SUPPORTED_BODY)),
    },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `claim is registered for ${SURFACE} but its marker is in ${OTHER_SURFACE}`,
  ]);
});

test("refusal: a begin marker opening inside an open block fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        `<!-- pnh:claim:${CLAIM}:begin -->`,
        SUPPORTED_BODY,
        "<!-- pnh:claim:PNH-CLAIM-02:begin -->",
        `<!-- pnh:claim:${CLAIM}:end -->`,
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `marker for claim PNH-CLAIM-02 opens inside claim ${CLAIM}`,
  ]);
});

test("refusal: an end marker with no matching begin fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        block(CLAIM, "claim", SUPPORTED_BODY),
        "",
        "<!-- pnh:claim:PNH-CLAIM-02:end -->",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "marker end for claim PNH-CLAIM-02 has no matching begin",
  ]);
});

test("refusal: a block closed by a different kind or claim ID fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(
        `<!-- pnh:claim:${CLAIM}:begin -->`,
        SUPPORTED_BODY,
        "<!-- pnh:limitation:PNH-CLAIM-02:end -->",
      ),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `manifest claim has no marker in ${SURFACE}`,
    `marker for claim ${CLAIM} is closed by limitation:PNH-CLAIM-02`,
  ]);
});

test("refusal: a begin marker that is never closed fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    files: {
      [SURFACE]: markdown(`<!-- pnh:claim:${CLAIM}:begin -->`, SUPPORTED_BODY),
    },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `manifest claim has no marker in ${SURFACE}`,
    `marker for claim ${CLAIM} is never closed`,
  ]);
});

test("refusal: a claim file that is not a registered surface fails closed", (t) => {
  const root = fixture(t, {
    surfaces: [SURFACE],
    claims: [{ file: OTHER_SURFACE, digest: digestOf(SUPPORTED_BODY) }],
    files: {
      [SURFACE]: markdown("# Fixture surface"),
      [OTHER_SURFACE]: markdown(block(CLAIM, "claim", SUPPORTED_BODY)),
    },
  });
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `claim file ${OTHER_SURFACE} is not a registered public surface`,
  ]);
});

// NEW-I1: the phase 2 rule asked only for a negation somewhere on the same
// line, so each of the delta review's four shapes (N1a-N1d) asserted an
// isolation boundary while a negation elsewhere in the sentence excused it.
const LAUNDERED_LIMITATIONS = [
  "The trusted subprocess is not merely sandboxed, it is fully sandboxed from the host.",
  "Without exception, the trusted subprocess is sandboxed from the host filesystem.",
  "There is no cost to this: the trusted subprocess isolates hostile plugin code completely.",
  "Our no-nonsense runner sandboxes every hostile plugin.",
] as const;

function limitationScenario(bodies: readonly (readonly string[])[]): Scenario {
  return {
    claims: bodies.map((body, index) => ({
      id: claimId(index),
      posture: "limitation",
      digest: digestOf(body),
    })),
    files: {
      [SURFACE]: markdown(
        ...bodies.map((body, index) => block(claimId(index), "limitation", body)),
      ),
    },
  };
}

test("refusal: a negation that does not scope the isolation phrase fails closed", (t) => {
  const bodies = LAUNDERED_LIMITATIONS.map((line) => [line]);
  const root = fixture(t, limitationScenario(bodies));
  const failures = runPublicClaimGate(root);
  assert.equal(failures.length, bodies.length, formatFailures(failures));
  for (const failure of failures) {
    assert.match(failure.message, /^limitation claim text uses isolation vocabulary /u);
  }
});

test("a limitation block may use isolation vocabulary its own clause negates", (t) => {
  const root = fixture(t, limitationScenario([
    ["Prism makes no sandbox claim for this path."],
    ["The real boundary is supply-chain trust, not runtime sandboxing."],
    ["The subprocess path runs without a sandbox."],
  ]));
  assert.deepEqual(runPublicClaimGate(root), []);
});

// A real repository path may carry isolation vocabulary in a segment name.
// The closed allowlist admits the cited literal inside registered blocks only,
// and only while the file actually exists on disk.
test("a registered block may cite an allowlisted repository path", (t) => {
  const body = ["Plugin transport is wired through `packages/runtime/src/harness/sandbox/broker-gateway.mjs`."];
  const root = fixture(t, limitationScenario([body]));
  write(root, "packages/runtime/src/harness/sandbox/broker-gateway.mjs", "// fixture stub\n");
  assert.deepEqual(runPublicClaimGate(root), []);
});

test("refusal: an allowlisted repository path that does not exist fails closed", (t) => {
  const body = ["Plugin transport is wired through `packages/runtime/src/harness/sandbox/broker-gateway.mjs`."];
  const root = fixture(t, limitationScenario([body]));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    "claim cites repository path packages/runtime/src/harness/sandbox/broker-gateway.mjs, which does not exist",
  ]);
});

test("a repository path outside the allowlist still trips the isolation scan", (t) => {
  const body = ["Plugin transport is wired through `packages/runtime/src/harness/sandbox/evil-gateway.mjs`."];
  const root = fixture(t, limitationScenario([body]));
  write(root, "packages/runtime/src/harness/sandbox/evil-gateway.mjs", "// fixture stub\n");
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'limitation claim text uses isolation vocabulary ("sandbox") without negating it',
  ]);
});

test("refusal: a suffixed variant of an allowlisted path is not exempt", (t) => {
  const body = ["Plugin transport is wired through `packages/runtime/src/harness/sandbox/broker-gateway.mjsx`."];
  const root = fixture(t, limitationScenario([body]));
  write(root, "packages/runtime/src/harness/sandbox/broker-gateway.mjs", "// fixture stub\n");
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'limitation claim text uses isolation vocabulary ("sandbox") without negating it',
  ]);
});

// NEW-I2: `deferred` was exempt from the isolation rule and needed no backing
// invariant, so the posture that exists to defer what the registry defers could
// assert an isolation boundary over nothing.
test("refusal: a deferred claim using isolation vocabulary fails closed", (t) => {
  const body = ["Cell ports will confine plugin code in a later release."];
  const root = fixture(t, supportedScenario({
    rows: [DEFER_ROW],
    claims: [{ posture: "deferred", digest: digestOf(body), invariants: [DEFER_ROW.id] }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'deferred claim text states an isolation boundary ("confine"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: a deferred claim backed by no deferred disposition fails closed", (t) => {
  const root = fixture(t, supportedScenario({
    claims: [{ posture: "deferred", digest: digestOf(SUPPORTED_BODY) }],
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `deferred claim ${CLAIM} registers no invariant whose first-release disposition is defer`,
  ]);
});

// NEW-Mi1: per-stem inflection lists left `isolations`, `jailing`, `confining`,
// `confinement`, and `containment` uncovered. The iteration tests above refuse
// every listed form, so listing them here is what makes them refuse.
test("the isolation family lists the inflections a per-stem list missed", () => {
  const forms = new Set(vocabularyForms(SANDBOX_PHRASES));
  for (const form of ["isolations", "jailing", "confining", "confinement", "containment"]) {
    assert.ok(forms.has(form), form);
  }
});

// NEW-C1: the fence model ignored CommonMark 0.31.2 §4.5 fence-type parity, so
// a body alternating the two fence characters desynchronized the gate from what
// a reader sees, and the excluded lines normalized to the empty string, whose
// one fixed digest matched any such body.
const FENCE_PARITY_BODY = [
  "~~~",
  "```",
  "~~~",
  "The trusted subprocess is sandboxed from the host filesystem.",
  "```",
  "~~~",
  "```",
] as const;

test("alternating fence characters do not hide prose from the digest or the scan", (t) => {
  assert.equal(
    normalizeClaimText(FENCE_PARITY_BODY),
    "The trusted subprocess is sandboxed from the host filesystem.",
  );
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(FENCE_PARITY_BODY) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", FENCE_PARITY_BODY)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    'supported claim text states an isolation boundary ("sandboxed"); ' +
      "only a limitation block may use isolation vocabulary",
  ]);
});

test("refusal: a fence closed by the other fence character fails closed", (t) => {
  const body = ["~~~", "```", "~~~", "Ordinary prose line.", "```"];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf(body) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `claim ${CLAIM} in ${SURFACE} ends inside a fenced code block opened at line 6`,
  ]);
});

test("refusal: a registered block that normalizes to no text fails closed", (t) => {
  const body = ["```", "The trusted subprocess is sandboxed from the host filesystem.", "```"];
  const root = fixture(t, supportedScenario({
    claims: [{ digest: digestOf([VISIBLE_LINE]) }],
    files: { [SURFACE]: markdown(block(CLAIM, "claim", body)) },
  }));
  assert.equal(normalizeClaimText(body), "");
  assert.deepEqual(messages(runPublicClaimGate(root)), [
    `claim ${CLAIM} normalizes to no text; a registered block must carry the text ` +
      "its digest pins",
    `normalized claim text digest ${EMPTY_TEXT_DIGEST} does not match the registered ` +
      `digest ${digestOf([VISIBLE_LINE])}`,
    'unregistered normative security language ("sandboxed") inside a fenced code block',
  ]);
});

test("the manifest parser rejects the empty-text digest", () => {
  assert.equal(EMPTY_TEXT_DIGEST, claimTextDigest(""));
  assert.throws(
    () => parsePublicClaimManifest(manifestDocument([SURFACE], [{ digest: EMPTY_TEXT_DIGEST }])),
    (error: unknown) => error instanceof PublicClaimError &&
      /text_digest must not be the empty-text digest/u.test((error as Error).message),
  );
});

function copyInto(root: string, path: string, source: string): void {
  write(root, path, readFileSync(source, "utf8"));
}

function formatFailures(failures: readonly ClaimFailure[]): string {
  return failures.map(formatClaimFailure).join("\n");
}
