import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  computeLock,
  bindingHash,
  diffAgainstLock,
  loadRegistry,
  loadRatificationBaseline,
  validateRatificationBaseline,
  validateProtocolPins,
  validateSemantics,
  type EnforcementKind,
  type LockFile,
  type Registry,
} from "../../assurance/constitution/contracts/registry.ts";
import { isExecutedConformanceRun, runConformance } from "../../assurance/constitution/contracts/coverage.ts";
import {
  createProofRegistration,
  digestFile,
  proofTargetDigest,
  type ProofRegistration,
  type Sha256Digest,
} from "../../assurance/constitution/contracts/proof-report.ts";
import {
  MANIFEST_PATH,
  formatClaimFailure,
  loadPublicClaimManifest,
  runPublicClaimGate,
} from "../../assurance/constitution/contracts/public-claims.ts";
import {
  evaluateProvenProof,
  injectMarkers,
  provenProofErrors,
  renderConformanceChapter,
  resolveProofTransitions,
  resolveBindingChangeTransitions,
} from "../../assurance/constitution/scripts/generate-constitution.ts";
import {
  deriveRatificationArchitectureIdentities,
} from "../../assurance/constitution/contracts/transition-authority.ts";
import {
  MAX_COMMAND_BYTES_PER_ALLOCATION,
  MAX_COMMAND_IDS_PER_ALLOCATION,
  MAX_COMMANDS_PER_EVENT_LOOP_TURN,
  MAX_CONCURRENT_DOCKER_INVOCATIONS,
  MAX_LIVE_ALLOCATIONS,
  MAX_LIVE_ALLOCATIONS_PER_PLUGIN,
  MAX_RECENT_ACKNOWLEDGED_ALLOCATIONS,
  MAX_RECENT_COMMAND_IDS,
  MAX_TRACKED_COMMAND_ALLOCATIONS,
  MAX_WIRE_BUFFER_BYTES,
  MAX_WIRE_FRAME_BYTES,
} from "@useprism/sdk/protocol/resource-bounds";
import {
  MAX_ARRAY_LENGTH,
  MAX_CUMULATIVE_BYTES,
  MAX_FRAME_BYTES,
  MAX_JSON_DEPTH,
  MAX_MESSAGE_COUNT,
  MAX_OBJECT_KEYS,
  MAX_STRING_BYTES,
} from "@useprism/sdk/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const registry = loadRegistry(
  resolve(repoRoot, "assurance", "constitution", "contracts", "invariants.yaml"),
);
const lock = JSON.parse(
  readFileSync(
    resolve(repoRoot, "assurance", "constitution", "contracts", "invariants.lock"),
    "utf8",
  ),
) as LockFile;

test("check 1: schema and semantic validity", () => {
  assert.deepEqual(validateSemantics(registry, repoRoot), []);
  const baseline = loadRatificationBaseline(
    resolve(repoRoot, registry.ratification_baseline.path),
  );
  assert.deepEqual(
    validateRatificationBaseline(
      registry,
      baseline,
      registry.ratification_baseline,
      repoRoot,
    ),
    [],
  );
});

test("check 2: baseline rule — registry matches the committed lock", () => {
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot), []);
});

const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as Sha256Digest;
const UNRELATED_REVIEW_ARTIFACT = "pnh/tests/fixtures/constitution/gate-review-artifact.md";
// One signed attestation per invariant: the attestation schema names a single
// target invariant, so a shared file could only ever authorize one of them.
const REVIEW_ATTESTATION_PREFIX =
  "docs/plans/provider-neutral-harness/reviews/2026-09-03-oss-release-proof-rotation-review";
const PROOF_TARGET = {
  invariantId: "PNH-INV-02",
  testFile: "pnh/tests/plugin-protocol.test.ts",
  testName: "validatePluginFrame is the only fail-closed checker for the pinned wire vocabulary",
} as const;

interface ManifestTarget {
  readonly invariant_id: string;
  readonly test_file: string;
  readonly test_name: string;
  readonly review_artifact: string;
  readonly review_attestation: string;
  readonly production_entrypoint: string;
  readonly checker?: string;
  readonly control?: { readonly kind: string; readonly name: string };
}

const manifestTargets = (JSON.parse(
  readFileSync(
    resolve(repoRoot, "assurance", "constitution", "contracts", "proof-targets.json"),
    "utf8",
  ),
) as { readonly targets: readonly ManifestTarget[] }).targets;

function manifestTarget(invariantId: string): ManifestTarget {
  const targets = manifestTargets.filter((target) => target.invariant_id === invariantId);
  assert.equal(targets.length, 1, `${invariantId} must have exactly one structured proof target`);
  return targets[0]!;
}

function registration(
  source: { readonly invariantId: string; readonly testFile: string; readonly testName: string },
): ProofRegistration {
  return createProofRegistration(source, repoRoot);
}

function retarget(
  proof: ProofRegistration,
  patch: Partial<ProofRegistration>,
): ProofRegistration {
  const next = { ...proof, ...patch };
  return { ...next, proof_target_digest: proofTargetDigest(next) };
}

// Exactly the named invariants are proven, so these cases stay stable whatever
// the committed registry currently proves.
function withProven(ids: readonly string[]): Registry {
  return {
    ...registry,
    invariants: registry.invariants.map((inv) => {
      const { proof_reason: _reason, ...rest } = inv;
      if (ids.includes(inv.id)) return { ...rest, proof_status: "proven" as const };
      if (inv.proof_status !== "proven") return inv;
      return {
        ...rest,
        proof_status: "unproven" as const,
        proof_reason: "not the invariant under test",
      };
    }),
  };
}

test("check 3: executed structured proof for every proven invariant", () => {
  const proven = registry.invariants.filter((inv) => inv.proof_status === "proven");
  // Gate P2 end state, asserted before the branch: an empty proven set would
  // otherwise satisfy this check vacuously and hide a silent revert of the flip.
  assert.deepEqual(
    proven.map(({ id }) => id).sort(),
    ["PNH-INV-02", "PNH-INV-03", "PNH-INV-04", "PNH-INV-18"],
  );
  const files = [...new Set(proven.flatMap((inv) => [...inv.conformance]))];
  const result = runConformance(files, repoRoot);
  assert.ok(isExecutedConformanceRun(result), "proof coverage needs an opaque runner result");
  assert.equal(result.exitCode, 0, "conformance suites must pass");
  assert.deepEqual(result.parseErrors, []);
  assert.deepEqual(
    evaluateProvenProof({
      registry,
      repoRoot,
      executedFiles: result.testFiles,
      legacyLabels: result.legacyLabels,
      structuredProofs: result.structuredProofs,
    }),
    [],
  );
});

test("check 3: an executed structured proof satisfies a proven invariant", () => {
  const proof = registration(PROOF_TARGET);
  assert.deepEqual(
    evaluateProvenProof({
      registry: withProven([PROOF_TARGET.invariantId]),
      repoRoot,
      executedFiles: [PROOF_TARGET.testFile],
      legacyLabels: new Set(),
      structuredProofs: [proof],
    }),
    [],
  );
});

test("check 3: legacy conformance labels never satisfy a proven invariant", () => {
  const errors = evaluateProvenProof({
    registry: withProven([PROOF_TARGET.invariantId]),
    repoRoot,
    executedFiles: [PROOF_TARGET.testFile],
    legacyLabels: new Set([PROOF_TARGET.invariantId]),
    structuredProofs: [],
  });
  assert.ok(
    errors.some((error) =>
      error.includes(PROOF_TARGET.invariantId) && error.includes("legacy")),
    `legacy label must not prove an invariant: ${errors.join("; ")}`,
  );
});

test("check 3: unknown ID, wrong kind, and undeclared test files fail closed", () => {
  const proof = registration(PROOF_TARGET);
  const proven = withProven([PROOF_TARGET.invariantId]);
  const evaluate = (structured: ProofRegistration): string[] =>
    evaluateProvenProof({
      registry: proven,
      repoRoot,
      executedFiles: [PROOF_TARGET.testFile, "pnh/tests/module-graph.test.ts"],
      legacyLabels: new Set(),
      structuredProofs: [structured],
    });

  assert.ok(
    evaluate(retarget(proof, { invariant_id: "PNH-INV-99" }))
      .some((error) => error.includes("unknown invariant")),
  );
  assert.ok(
    evaluate(retarget(proof, { enforcement_kind: "runtime-adversarial" as EnforcementKind }))
      .some((error) => error.includes("enforcement kind")),
  );
  const undeclared = "pnh/tests/module-graph.test.ts";
  assert.ok(
    evaluate(retarget(proof, {
      test: { path: undeclared, sha256: digestFile(repoRoot, undeclared), name: proof.test.name },
    })).some((error) => error.includes("not declared as conformance")),
  );
});

test("check 3: missing review artifacts, conflicting duplicates, and skipped suites fail closed", () => {
  const proof = registration(PROOF_TARGET);
  const proven = withProven([PROOF_TARGET.invariantId]);
  const evaluate = (
    structuredProofs: readonly ProofRegistration[],
    executedFiles: readonly string[] = [PROOF_TARGET.testFile],
  ): string[] =>
    evaluateProvenProof({
      registry: proven,
      repoRoot,
      executedFiles,
      legacyLabels: new Set(),
      structuredProofs,
    });

  assert.ok(
    evaluate([{
      ...proof,
      review_artifact: {
        path: "docs/plans/provider-neutral-harness/reviews/absent-review.md",
        sha256: proof.review_artifact.sha256,
      },
    }]).some((error) => error.includes("review artifact")),
  );
  assert.ok(
    evaluate([proof, {
      ...proof,
      review_artifact: { path: proof.review_artifact.path, sha256: ZERO_DIGEST },
    }]).some((error) => error.includes("conflicting duplicate")),
  );
  assert.ok(
    evaluate([proof], []).some((error) => error.includes("was not executed")),
  );
});

test("check 3: the review artifact path comes from the manifest, not the registration", () => {
  const proof = registration(PROOF_TARGET);
  const proven = withProven([PROOF_TARGET.invariantId]);
  const substitute = (path: string): string[] =>
    evaluateProvenProof({
      registry: proven,
      repoRoot,
      executedFiles: [PROOF_TARGET.testFile],
      legacyLabels: new Set(),
      structuredProofs: [{
        ...proof,
        review_artifact: { path, sha256: digestFile(repoRoot, path) },
      }],
    });

  for (const path of [UNRELATED_REVIEW_ARTIFACT, PROOF_TARGET.testFile]) {
    const errors = substitute(path);
    assert.ok(
      errors.some((error) => error.includes("not the path declared in the trusted manifest")),
      `substituted review artifact ${path} must fail: ${errors.join("; ")}`,
    );
  }
});

test("check 3: proof artifact digests must match current repository bytes", () => {
  const proof = registration(PROOF_TARGET);
  const errors = evaluateProvenProof({
    registry: withProven([PROOF_TARGET.invariantId]),
    repoRoot,
    executedFiles: [PROOF_TARGET.testFile],
    legacyLabels: new Set(),
    structuredProofs: [retarget(proof, {
      test: { path: proof.test.path, sha256: ZERO_DIGEST, name: proof.test.name },
    })],
  });
  assert.ok(
    errors.some((error) => error.includes("differs from current bytes")),
    `stale artifact digests must fail: ${errors.join("; ")}`,
  );
});

test("check 3: --update-lock refuses proven rows without an executed proof report", () => {
  const ids = ["PNH-INV-02", "PNH-INV-03", "PNH-INV-04", "PNH-INV-18"];
  const proven = withProven(ids);

  const absent = provenProofErrors(proven, undefined);
  assert.equal(absent.length, ids.length);
  for (const id of ids) {
    assert.ok(
      absent.some((error) => error.startsWith(`${id}:`) && error.includes("--proof-report")),
      `${id} must be refused without a proof report: ${absent.join("; ")}`,
    );
  }

  const missing = resolve(tmpdir(), "pnh-gate-absent-proof-report.json");
  assert.ok(
    provenProofErrors(proven, missing).some((error) => error.includes("is unusable")),
    "a proof report path that does not resolve must be refused",
  );

  // A report carrying real registrations for only three of the four proven rows.
  // The gate authenticates the report before it trusts any executed-file set, so
  // this is refused for want of a signed execution receipt rather than silently
  // accepted; the omitted-registration message is asserted below, at the layer
  // that emits it.
  const omitted = "PNH-INV-18";
  const partial = ids.filter((id) => id !== omitted).map((id) => {
    const target = manifestTarget(id);
    return registration({
      invariantId: id,
      testFile: target.test_file,
      testName: target.test_name,
    });
  });
  const stale = join(mkdtempSync(join(tmpdir(), "pnh-gate-stale-")), "proof-report.json");
  writeFileSync(stale, `${JSON.stringify({ schema_version: 1, proofs: partial })}\n`, "utf8");
  try {
    assert.ok(
      provenProofErrors(proven, stale).length > 0,
      "a proof report that does not carry the proven registrations must be refused",
    );
  } finally {
    rmSync(dirname(stale), { recursive: true, force: true });
  }

  const evaluated = evaluateProvenProof({
    registry: proven,
    repoRoot,
    executedFiles: [...new Set(partial.map((proof) => proof.test.path))],
    legacyLabels: new Set(),
    structuredProofs: partial,
  });
  assert.ok(
    evaluated.some((error) => error.startsWith(`${omitted}:`)),
    `the omitted registration must be named: ${evaluated.join("; ")}`,
  );
});

test("check 3: --update-lock refuses proof transitions without --prior-registry", () => {
  // A moved row is synthesized against computeLock of the live registry, so the
  // test holds no matter which rows the committed lock currently carries.
  const previous = computeLock(registry);
  const [target] = registry.invariants;
  assert.ok(target !== undefined, "the registry must carry at least one invariant");
  const locked = previous.entries[target.id];
  assert.ok(locked !== undefined && "proof_status" in locked);
  const transitions = resolveProofTransitions(
    registry,
    {
      ...previous,
      entries: {
        ...previous.entries,
        [target.id]: {
          ...locked,
          proof_status: target.proof_status === "partial" ? "proven" : "partial",
        },
      },
    },
    "docs/reviews/nonexistent-proof-report.json",
    undefined,
  );
  assert.deepEqual(transitions.errors, ["proof-status transitions require --prior-registry"]);
  assert.equal(transitions.authorizedIds.size, 0);
});

test("update-lock resolves exact binding authority and rejects unpinned or unrelated deltas", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pnh-binding-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prior = JSON.parse(JSON.stringify(registry)) as Registry;
  const previous = computeLock(prior);
  const protocolIndex = prior.protocols.findIndex(({ id }) => id === "PNH-PROTO-02");
  assert.notEqual(protocolIndex, -1);
  const priorProtocol = prior.protocols[protocolIndex]!;
  const locked = previous.entries[priorProtocol.id];
  assert.ok(locked !== undefined && "protocol_version" in locked);
  const decisionPath =
    "docs/plans/provider-neutral-harness/2026-09-03-test-binding-change.md";
  const reason = "Pin the exact source-byte-only package coordinate update.";
  const changedProtocol = {
    ...priorProtocol,
    schema_hash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const,
  };
  const newBindingHash = bindingHash(changedProtocol);
  const live: Registry = {
    ...prior,
    protocols: prior.protocols.map((protocol, index) => index === protocolIndex
      ? {
          ...changedProtocol,
          amendments: [...(protocol.amendments ?? []), {
            date: "2026-09-03",
            decision: decisionPath,
            from_hash: locked.binding_hash,
            kind: "binding-change",
            reason,
          }],
        }
      : protocol),
  };
  const baseline = loadRatificationBaseline(
    resolve(repoRoot, registry.ratification_baseline.path),
  );
  const role = "D6, constitution and proof governance";
  const identities = deriveRatificationArchitectureIdentities(
    baseline,
    registry.ratification_baseline,
  );
  const decision = [
    "# Synthetic binding decision",
    "",
    "Status: Ratified",
    "",
    `Owner: ${baseline.owner}`,
    "",
    `Decision owner: ${role}`,
    "",
    `Transition entry: ${JSON.stringify({
      invariant_id: priorProtocol.id,
      amendment_kind: "binding-change",
      prior_binding_hash: locked.binding_hash,
      new_binding_hash: newBindingHash,
      reason,
    })}`,
    "",
    ...identities.flatMap((identity) => [
      `Bound architecture identity: ${identity}`,
      "",
    ]),
    "## Decision",
    "",
    "Authorize only the exact target binding.",
    "",
  ].join("\n");
  const priorBytes = `${JSON.stringify(prior)}\n`;
  mkdirSync(resolve(root, "docs/plans/provider-neutral-harness"), { recursive: true });
  writeFileSync(resolve(root, decisionPath), decision, "utf8");
  writeFileSync(resolve(root, "prior.json"), priorBytes, "utf8");
  const sha256 = (value: string) =>
    `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
  const input = {
    registry: live,
    previous,
    baseline,
    decisionDigests: new Map([[priorProtocol.id, sha256(decision)]]),
    decisionRole: role,
    priorRegistryPath: "prior.json",
    priorRegistryDigest: sha256(priorBytes),
    repoRoot: root,
    proofAuthorizedIds: new Set<string>(),
  };

  const resolved = resolveBindingChangeTransitions(input);
  assert.deepEqual(resolved.errors, []);
  assert.deepEqual([...resolved.authorizations.keys()], [priorProtocol.id]);

  for (const [name, patch, expected] of [
    ["missing digest", { decisionDigests: new Map() }, /requires an owner-pinned decision digest/u],
    ["wrong role", { decisionRole: "D8" }, /Decision owner/u],
    [
      "wrong prior digest",
      { priorRegistryDigest: `sha256:${"f".repeat(64)}` },
      /prior registry digest/u,
    ],
    [
      "unrelated digest",
      { decisionDigests: new Map([["PNH-PROTO-01", sha256(decision)]]) },
      /unchanged entry/u,
    ],
  ] as const) {
    const attempt = resolveBindingChangeTransitions({ ...input, ...patch });
    assert.match(attempt.errors.join("\n"), expected, name);
  }
});

test("check 3: the four revalidated invariants carry structured proof targets", () => {
  const expectedEntrypoints: Record<string, string> = {
    "PNH-INV-02": "packages/sdk/src/protocol.ts",
    "PNH-INV-03": "packages/sdk/src/protocol.ts",
    "PNH-INV-04": "packages/runtime/src/runtime/admission-ticket.ts",
    "PNH-INV-18": "packages/runtime/src/core/plugin-grant.ts",
  };
  const expectedCheckers: Record<string, string> = {
    "PNH-INV-02": "validatePluginFrame",
    "PNH-INV-18": "checkModuleGraph",
  };
  for (const [id, entrypoint] of Object.entries(expectedEntrypoints)) {
    const invariant = registry.invariants.find((inv) => inv.id === id);
    assert.ok(invariant, `${id} must exist`);
    const target = manifestTarget(id);
    assert.ok(
      invariant.conformance.includes(target.test_file),
      `${id}: proof target must name a declared conformance file`,
    );
    assert.equal(
      target.production_entrypoint,
      entrypoint,
      `${id}: repointing the production entrypoint must be deliberate`,
    );
    assert.deepEqual(
      evaluateProvenProof({
        registry: withProven([id]),
        repoRoot,
        executedFiles: [target.test_file],
        legacyLabels: new Set(),
        structuredProofs: [registration({
          invariantId: id,
          testFile: target.test_file,
          testName: target.test_name,
        })],
      }),
      [],
      `${id}: registered proof target must satisfy the gate`,
    );
    assert.equal(
      target.review_attestation,
      `${REVIEW_ATTESTATION_PREFIX}.${id}.attestation.json`,
      `${id}: the signed attestation pointer must be deliberate and invariant-specific`,
    );
    if (invariant.enforcement_kind === "runtime-adversarial") {
      assert.ok(
        target.control !== undefined && target.control.name.length > 0,
        `${id}: runtime-adversarial proof must name its injected fault or disabled control`,
      );
      assert.equal(
        target.checker,
        undefined,
        `${id}: runtime-adversarial proof names a control, not a checker`,
      );
    } else {
      assert.equal(
        target.control,
        undefined,
        `${id}: static-structure proof names its fail-closed checker, not a control`,
      );
      assert.equal(
        target.checker,
        expectedCheckers[id],
        `${id}: repointing the fail-closed checker must be deliberate`,
      );
    }
  }
  // Sharing one attestation across targets would silently authorize a single
  // invariant and fail the rest closed, so the paths must stay distinct.
  const attestations = Object.keys(expectedEntrypoints)
    .map((id) => manifestTarget(id).review_attestation);
  assert.equal(new Set(attestations).size, attestations.length);
});

test("check 4: orphan rule — proven invariants have conformance entries", () => {
  for (const inv of registry.invariants) {
    if (inv.proof_status === "proven") {
      assert.ok(inv.conformance.length > 0, `orphan invariant: ${inv.id}`);
    }
  }
});

test("check 5: drift rule — committed constitution matches regeneration", () => {
  const constitutionPath = resolve(
    repoRoot, "docs", "plans", "provider-neutral-harness", "constitution.md",
  );
  const source = readFileSync(constitutionPath, "utf8");
  assert.equal(injectMarkers(source, registry), source);
});

test("check 6: protocol pins — hashes and spec versions", () => {
  assert.deepEqual(validateProtocolPins(registry, repoRoot), []);
});

test("check 7: bound sync — INV-03 bounds equal the MAX_* exports of protocol.ts", () => {
  const inv03 = registry.invariants.find((inv) => inv.id === "PNH-INV-03");
  assert.ok(inv03, "PNH-INV-03 must exist in the registry");
  const bounds = inv03.bounds ?? {};
  const expected: Record<string, number> = {
    max_frame_bytes: MAX_FRAME_BYTES,
    max_cumulative_bytes: MAX_CUMULATIVE_BYTES,
    max_message_count: MAX_MESSAGE_COUNT,
    max_json_depth: MAX_JSON_DEPTH,
    max_string_bytes: MAX_STRING_BYTES,
    max_array_length: MAX_ARRAY_LENGTH,
    max_object_keys: MAX_OBJECT_KEYS,
  };
  const mismatches = Object.entries(expected)
    .filter(([name, value]) => bounds[name] !== value)
    .map(([name, value]) => `${name}: registry=${bounds[name]} protocol.ts=${value}`);
  assert.deepEqual(mismatches, [], `INV-03 bounds drifted from packages/sdk/src/protocol.ts: ${mismatches.join(", ")}`);
});

test("check 8: bound sync — INV-38 bounds equal the shared resource-bound exports", () => {
  const inv38 = registry.invariants.find((inv) => inv.id === "PNH-INV-38");
  assert.ok(inv38, "PNH-INV-38 must exist in the registry");
  const bounds = inv38.bounds ?? {};
  const expected: Record<string, number> = {
    max_live_allocations: MAX_LIVE_ALLOCATIONS,
    max_live_allocations_per_plugin: MAX_LIVE_ALLOCATIONS_PER_PLUGIN,
    max_concurrent_docker_invocations: MAX_CONCURRENT_DOCKER_INVOCATIONS,
    max_command_bytes_per_allocation: MAX_COMMAND_BYTES_PER_ALLOCATION,
    max_command_ids_per_allocation: MAX_COMMAND_IDS_PER_ALLOCATION,
    max_commands_per_event_loop_turn: MAX_COMMANDS_PER_EVENT_LOOP_TURN,
    max_tracked_command_allocations: MAX_TRACKED_COMMAND_ALLOCATIONS,
    max_recent_command_ids: MAX_RECENT_COMMAND_IDS,
    max_recent_acknowledged_allocations: MAX_RECENT_ACKNOWLEDGED_ALLOCATIONS,
    max_wire_frame_bytes: MAX_WIRE_FRAME_BYTES,
    max_wire_buffer_bytes: MAX_WIRE_BUFFER_BYTES,
  };
  const mismatches = Object.entries(expected)
    .filter(([name, value]) => bounds[name] !== value)
    .map(([name, value]) => `${name}: registry=${bounds[name]} resource-bounds.mjs=${value}`);
  assert.deepEqual(mismatches, [], `INV-38 resource bounds drifted: ${mismatches.join(", ")}`);
  assert.equal(
    Object.hasOwn(bounds, "max_cross_plugin_stall_ms"),
    false,
    "INV-38 must not bind the removed cross-plugin stall constant",
  );
});

test("check 9: proven structured proof renders separately from partial evidence", () => {
  const mixed = loadRegistry(
    resolve(repoRoot, "pnh", "tests", "fixtures", "constitution", "proven-registry.yaml"),
  );
  const source = [
    "<!-- pnh:invariants:isolation:begin -->",
    "<!-- pnh:invariants:isolation:end -->",
    "",
    "<!-- pnh:conformance:begin -->",
    "<!-- pnh:conformance:end -->",
    "",
  ].join("\n");
  const rendered = injectMarkers(source, mixed);
  const chapter = renderConformanceChapter(mixed);

  assert.match(rendered, /Structured proof: `pnh\/tests\/plugin-protocol\.test\.ts`\./u);
  assert.match(rendered, /Evidence \(partial; not complete proof\)/u);
  assert.ok(
    !rendered.includes("Structured proof: `pnh/tests/m3-plugin-fault-isolation.test.ts`"),
    "partial evidence must never render as structured proof",
  );
  assert.ok(chapter.includes("structured proof: pnh/tests/plugin-protocol.test.ts"));
  assert.ok(chapter.includes("partial evidence; not complete proof"));
});

test("check 10: public claims match invariant status on the real repository surfaces", () => {
  const failures = runPublicClaimGate(repoRoot);
  assert.deepEqual(failures.map(formatClaimFailure), []);
  const manifest = loadPublicClaimManifest(resolve(repoRoot, MANIFEST_PATH));
  assert.ok(manifest.surfaces.length > 0, "an empty surface set fails the gate closed");
});
