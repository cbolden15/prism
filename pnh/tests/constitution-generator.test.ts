import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  computeLock,
  loadRegistry,
} from "../../assurance/constitution/contracts/registry.ts";
import {
  hasProofStatusTransition,
  injectMarkers,
  parseConstitutionCliArgs,
  renderConformanceChapter,
} from "../../assurance/constitution/scripts/generate-constitution.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  resolve(here, "fixtures", "constitution", name);

const registry = loadRegistry(fixture("valid-registry.yaml"));

test("injectMarkers replaces category block content and preserves prose", () => {
  const source = [
    "# Constitution",
    "",
    "Narrative prose stays.",
    "",
    "<!-- pnh:invariants:isolation:begin -->",
    "stale generated content",
    "<!-- pnh:invariants:isolation:end -->",
    "",
    "<!-- pnh:conformance:begin -->",
    "<!-- pnh:conformance:end -->",
    "",
  ].join("\n");
  const output = injectMarkers(source, registry);
  assert.ok(output.includes("Narrative prose stays."));
  assert.ok(!output.includes("stale generated content"));
  assert.ok(output.includes("PNH-INV-01"));
  assert.ok(output.includes("max_faults_per_cell = 1"));
  assert.ok(output.includes("Proof incomplete: The fixture has no production-path"));
  assert.ok(output.includes("Evidence (unproven; not complete proof):"));
  assert.ok(output.includes("First release: activate; gates C, F."));
  assert.equal(injectMarkers(output, registry), output, "idempotent");
});

test("injectMarkers fails loudly on a missing marker pair for a used category", () => {
  assert.throws(() => injectMarkers("# No markers at all", registry), /marker/u);
});

test("conformance chapter lists every id", () => {
  const chapter = renderConformanceChapter(registry);
  assert.ok(chapter.includes("PNH-INV-01"));
  assert.ok(chapter.includes("| ID |"));
  assert.ok(chapter.includes("| Law status | Proof status | Proof reason |"));
  assert.ok(chapter.includes("| Enforcement | First release | Detail | Closing gates |"));
  assert.ok(chapter.includes("The fixture has no production-path fault-injection evidence"));
  assert.ok(!chapter.includes("Proven by"));
});

test("prior registry proof evidence is used only for a proof-status transition", () => {
  const bindingOnly = JSON.parse(JSON.stringify(registry)) as typeof registry;
  (bindingOnly.invariants[0] as unknown as { statement: string }).statement =
    "Prepared live binding with unchanged proof status.";
  const previous = computeLock(registry);
  assert.equal(hasProofStatusTransition(previous, bindingOnly), false);

  const proofTransition = JSON.parse(JSON.stringify(bindingOnly)) as typeof registry;
  const row = proofTransition.invariants[0] as unknown as Record<string, unknown>;
  row.proof_status = "proven";
  delete row.proof_reason;
  assert.equal(hasProofStatusTransition(previous, proofTransition), true);
});

test("update-lock decision inputs are closed, canonical, and duplicate-free", () => {
  const digest =
    "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const priorDigest =
    "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const parsed = parseConstitutionCliArgs([
    "--update-lock",
    "--decision-digest",
    `PNH-PROTO-02=${digest}`,
    "--decision-role",
    "D6, constitution and proof governance",
    "--prior-registry",
    "prior.yaml",
    "--prior-registry-sha256",
    priorDigest,
  ]);
  assert.equal(parsed.mode, "--update-lock");
  assert.deepEqual([...parsed.decisionDigests], [["PNH-PROTO-02", digest]]);
  assert.equal(parsed.decisionRole, "D6, constitution and proof governance");
  assert.equal(parsed.priorRegistryDigest, priorDigest);

  const cases: readonly [string, readonly string[], RegExp][] = [
    ["unknown argument", ["--update-lock", "--unknown"], /unexpected argument/u],
    [
      "duplicate decision digest",
      [
        "--update-lock",
        "--decision-digest",
        `PNH-PROTO-02=${digest}`,
        "--decision-digest",
        `PNH-PROTO-02=${digest}`,
      ],
      /duplicate decision digest/u,
    ],
    [
      "malformed decision assignment",
      ["--update-lock", "--decision-digest", digest],
      /ENTRY_ID=sha256/u,
    ],
    [
      "noncanonical decision digest",
      ["--update-lock", "--decision-digest", "PNH-PROTO-02=sha256:ABC"],
      /canonical sha256/u,
    ],
    [
      "duplicate decision role",
      ["--update-lock", "--decision-role", "D6", "--decision-role", "D6"],
      /decision role may be given once/u,
    ],
    [
      "duplicate prior digest",
      [
        "--update-lock",
        "--prior-registry-sha256",
        priorDigest,
        "--prior-registry-sha256",
        priorDigest,
      ],
      /prior registry sha256 may be given once/u,
    ],
    [
      "decision inputs outside updater",
      ["--check", "--decision-digest", `PNH-PROTO-02=${digest}`],
      /only valid with --update-lock/u,
    ],
  ];
  for (const [name, args, expected] of cases) {
    assert.throws(() => parseConstitutionCliArgs(args), expected, name);
  }
});
