import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AMENDMENT_KINDS,
  CATEGORIES,
  CLOSING_GATES,
  ENFORCEMENT_KINDS,
  FIRST_RELEASE_DISPOSITIONS,
  LAW_STATUSES,
  PROOF_STATUSES,
  RegistryError,
  bindingHash,
  computeLock,
  computeSchemaHash,
  diffAgainstLock,
  loadRatificationBaseline,
  parseRegistryDocument,
  loadRegistry,
  stableStringify,
  validateProtocolPins,
  validateAuthorizedBindingDelta,
  validateRatificationBaseline,
  validateRatificationBaselineTransition,
  validateAuthorizedProofDelta,
  validateSemantics,
  type RatificationBaseline,
  type RatificationBaselinePin,
  type BindingChangeAuthorization,
  type Registry,
} from "../../assurance/constitution/contracts/registry.ts";
import { validateInvariantTransition } from "../../assurance/constitution/contracts/invariant-transition.ts";
import type {
  ValidatedDecisionAuthority,
  ValidatedProofAuthority,
} from "../../assurance/constitution/contracts/transition-authority.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixture = (name: string) => resolve(here, "fixtures", "constitution", name);
const registryPath = resolve(repoRoot, "assurance", "constitution", "contracts", "invariants.yaml");
const baselinePath = resolve(
  repoRoot,
  "assurance",
  "constitution",
  "contracts",
  "ratification-baselines",
  "plan-a-v1.json",
);

function sha256File(path: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

test("loads registry v2 with separate law and proof status", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  assert.equal(registry.version, 2);
  assert.equal(registry.ratification_baseline.sha256, sha256File(baselinePath));
  const inv = registry.invariants[0]!;
  assert.equal(inv.law_status, "ratified");
  assert.equal(inv.proof_status, "unproven");
  assert.match(inv.proof_reason, /no production-path/u);
  assert.equal(inv.enforcement_kind, "runtime-adversarial");
  assert.deepEqual(inv.first_release, {
    disposition: "activate",
    closing_gates: ["C", "F"],
  });
  assert.deepEqual(validateSemantics(registry, repoRoot), []);
});

test("law, proof, enforcement, release, gate, category, and amendment vocabularies are closed", () => {
  assert.deepEqual(LAW_STATUSES, ["proposed", "ratified", "retired"]);
  assert.deepEqual(PROOF_STATUSES, ["unproven", "partial", "proven"]);
  assert.deepEqual(ENFORCEMENT_KINDS, [
    "runtime-adversarial",
    "static-structure",
    "generated-document-consistency",
    "controlled-performance-qualification",
    "release-or-architecture-gate",
  ]);
  assert.deepEqual(FIRST_RELEASE_DISPOSITIONS, ["activate", "retain", "defer"]);
  assert.deepEqual(CLOSING_GATES, ["A", "B2", "C", "D", "E", "F", "G", "H"]);
  assert.ok(CATEGORIES.includes("isolation"));
  assert.deepEqual(AMENDMENT_KINDS, [
    "binding-change",
    "law-transition",
    "proof-invalidation",
  ]);
});

test("partial and unproven require proof_reason; proven forbids it", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const invariant = registry.invariants[0]!;
  const { proof_reason: _reason, ...withoutReason } = invariant;
  for (const proof_status of ["unproven", "partial"] as const) {
    assert.throws(
      () => loadRegistry(fixture("valid-registry.yaml"), {
        overlay: { invariants: [{ ...withoutReason, proof_status }] },
      }),
      /proof_reason is required/u,
    );
    for (const proof_reason of ["", "   ", 42]) {
      assert.throws(
        () => loadRegistry(fixture("valid-registry.yaml"), {
          overlay: { invariants: [{ ...invariant, proof_status, proof_reason }] },
        }),
        /proof_reason must be a non-empty string/u,
      );
    }
  }
  assert.throws(
    () => loadRegistry(fixture("valid-registry.yaml"), {
      overlay: { invariants: [{ ...invariant, proof_status: "proven" }] },
    }),
    /proof_reason is forbidden when proof_status is proven/u,
  );
  assert.doesNotThrow(() => loadRegistry(fixture("valid-registry.yaml"), {
    overlay: { invariants: [{ ...withoutReason, proof_status: "proven" }] },
  }));
});

test("registry v2 rejects legacy fields, unknown fields, invalid enums, and invalid gates", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const invariant = registry.invariants[0]!;
  for (const [change, expected] of [
    [{ status: "active" }, /unknown field status/u],
    [{ proposed_reason: "legacy" }, /unknown field proposed_reason/u],
    [{ law_status: "active" }, /law_status must be one of/u],
    [{ proof_status: "complete" }, /proof_status must be one of/u],
    [{ enforcement_kind: "unit-test" }, /enforcement_kind must be one of/u],
    [
      { first_release: { disposition: "later", closing_gates: ["A"] } },
      /first_release disposition must be one of/u,
    ],
    [
      { first_release: { disposition: "activate", closing_gates: ["Z"] } },
      /closing gate must be one of/u,
    ],
    [{ surprise: true }, /unknown field surprise/u],
  ] as const) {
    assert.throws(
      () => loadRegistry(fixture("valid-registry.yaml"), {
        overlay: { invariants: [{ ...invariant, ...change }] },
      }),
      expected,
    );
  }
});

test("amendment metadata is closed and hash-bound", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const invariant = registry.invariants[0]!;
  const base = {
    date: "2026-08-28",
    decision: "docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md",
    from_hash: bindingHash(invariant),
    kind: "binding-change",
    reason: "Owner-ratified binding change.",
  } as const;
  const loadWith = (amendment: Record<string, unknown>) =>
    loadRegistry(fixture("valid-registry.yaml"), {
      overlay: { invariants: [{ ...invariant, amendments: [amendment] }] },
    });
  assert.doesNotThrow(() => loadWith(base));
  for (const [amendment, expected] of [
    [{ ...base, surprise: true }, /unknown amendment field surprise/u],
    [{ ...base, from_hash: "not-a-hash" }, /malformed amendment entry/u],
    [{ ...base, kind: "reopening" }, /amendment kind must be one of/u],
    [{ ...base, reason: "   " }, /reason must be a non-empty string/u],
    [{ ...base, from_proof_status: "active" }, /from_proof_status must be one of/u],
  ] as const) {
    assert.throws(() => loadWith(amendment), expected);
  }
});

test("stableStringify is key-order independent", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
  );
  assert.equal(stableStringify({ "ä": 1, z: 2 }), '{"z":2,"ä":1}');
});

test("bindingHash covers every binding field and excludes proof_status and display metadata", () => {
  const inv = loadRegistry(fixture("valid-registry.yaml")).invariants[0]!;
  if (inv.proof_status === "proven") throw new Error("fixture invariant must be incomplete");
  const base = bindingHash(inv);
  assert.equal(bindingHash({ ...inv, title: "renamed" }), base);
  assert.equal(bindingHash({ ...inv, proof_status: "partial" }), base);
  assert.notEqual(bindingHash({ ...inv, statement: "weakened" }), base);
  assert.notEqual(bindingHash({ ...inv, bounds: { max_faults_per_cell: 2 } }), base);
  assert.notEqual(bindingHash({ ...inv, law_status: "retired" }), base);
  assert.notEqual(bindingHash({ ...inv, proof_reason: "Different proof gap." }), base);
  assert.notEqual(bindingHash({ ...inv, enforcement_kind: "static-structure" }), base);
  assert.notEqual(bindingHash({
    ...inv,
    first_release: { ...inv.first_release, closing_gates: ["A"] },
  }), base);
});

test("lock v2 stores baseline pin, binding hash, law status, and proof status", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  assert.equal(lock.version, 2);
  assert.deepEqual(lock.ratification_baseline, registry.ratification_baseline);
  assert.deepEqual(lock.entries["PNH-INV-01"], {
    binding_hash: bindingHash(registry.invariants[0]!),
    law_status: "ratified",
    proof_status: "unproven",
  });
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot), []);
});

test("lock v2 rejects deletion, baseline drift, and silent binding changes", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  assert.ok(diffAgainstLock({ ...registry, invariants: [] }, lock, repoRoot)
    .some((error) => error.includes("deleted")));
  assert.ok(diffAgainstLock(registry, {
    ...lock,
    ratification_baseline: { ...lock.ratification_baseline, sha256: "sha256:wrong" },
  }, repoRoot).some((error) => error.includes("baseline pin")));
  const changed = {
    ...registry,
    invariants: [{ ...registry.invariants[0]!, statement: "Changed without authority." }],
  };
  const errors = diffAgainstLock(changed, lock, repoRoot);
  assert.ok(errors.some((error) => error.includes("requires an amendment")));
  assert.ok(errors.some((error) => error.includes("trusted decision authority")));
  assert.ok(errors.some((error) => error.startsWith("stale lock")));
  const amended = {
    ...changed,
    invariants: [{
      ...changed.invariants[0]!,
      amendments: [{
        date: "2026-08-28",
        decision:
          "docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md",
        from_hash: lock.entries["PNH-INV-01"]!.binding_hash,
        kind: "binding-change" as const,
        reason: "Test-only owner decision.",
      }],
    }],
  };
  assert.ok(diffAgainstLock(amended, lock, repoRoot)
    .some((error) => error.includes("trusted decision authority")));
  const proofInvariant = registry.invariants[0]!;
  if (proofInvariant.proof_status === "proven") {
    throw new Error("fixture invariant must be incomplete");
  }
  const proofChanged = {
    ...registry,
    invariants: [{ ...proofInvariant, proof_status: "partial" as const }],
  };
  assert.ok(diffAgainstLock(proofChanged, lock, repoRoot)
    .some((error) => error.includes("proof-status transition requires trusted")));
});

test("Plan A baseline is exact, complete, and matches the migrated registry", () => {
  const baseline = loadRatificationBaseline(baselinePath);
  assert.equal(baseline.invariants.length, 46);
  assert.deepEqual(
    baseline.invariants.map(({ id }) => id),
    Array.from({ length: 46 }, (_, index) =>
      `PNH-INV-${String(index + 1).padStart(2, "0")}`),
  );
  const registry = loadRegistry(registryPath);
  assert.deepEqual(
    validateRatificationBaseline(
      registry,
      baseline,
      registry.ratification_baseline,
      repoRoot,
    ),
    [],
  );
  const mismatched = {
    ...registry,
    invariants: [{
      ...registry.invariants[0]!,
      enforcement_kind: "static-structure" as const,
    }, ...registry.invariants.slice(1)],
  };
  assert.ok(validateRatificationBaseline(
    mismatched,
    baseline,
    registry.ratification_baseline,
    repoRoot,
  ).some((error) =>
    error.includes("PNH-INV-01") && error.includes("enforcement_kind")));
});

test("Plan A baseline rejects missing, duplicate, draft, and invalid-gate rows", () => {
  const baseline = loadRatificationBaseline(baselinePath);
  const cases: Array<[string, unknown, RegExp]> = [
    ["missing", { ...baseline, invariants: baseline.invariants.slice(1) }, /missing PNH-INV-01/u],
    [
      "duplicate",
      { ...baseline, invariants: [...baseline.invariants, baseline.invariants[0]!] },
      /duplicate PNH-INV-01/u,
    ],
    [
      "draft",
      {
        ...baseline,
        invariants: [...baseline.invariants.slice(0, -1), {
          ...baseline.invariants.at(-1)!,
          id: "PNH-INV-47",
        }],
      },
      /outside exact PNH-INV-01 through PNH-INV-46/u,
    ],
    [
      "invalid-gate",
      {
        ...baseline,
        invariants: [{
          ...baseline.invariants[0]!,
          first_release: {
            ...baseline.invariants[0]!.first_release,
            closing_gates: ["Z" as "A"],
          },
        }, ...baseline.invariants.slice(1)],
      },
      /closing gate must be one of/u,
    ],
    [
      "malformed-supersedes",
      {
        ...baseline,
        supersedes: {
          from_hash: "not-a-hash",
          date: "tomorrow",
          owner: "",
          reason: "",
        },
      },
      /supersedes record is malformed/u,
    ],
  ];
  for (const [name, document, expected] of cases) {
    const directory = mkdtempSync(resolve(tmpdir(), `pnh-baseline-${name}-`));
    const path = resolve(directory, "baseline.json");
    writeFileSync(path, `${JSON.stringify(document)}\n`, "utf8");
    assert.throws(() => loadRatificationBaseline(path), expected);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("baseline transitions reject same-path mutation, missing predecessor, and invalid supersession", () => {
  const baseline = loadRatificationBaseline(baselinePath);
  const previousPin: RatificationBaselinePin = {
    path: "assurance/constitution/contracts/ratification-baselines/plan-a-v1.json",
    sha256: sha256File(baselinePath),
    decision: "docs/plans/provider-neutral-harness/2026-08-26-plan-a-enforcement-baseline-decision.md",
  };
  assert.ok(validateRatificationBaselineTransition(
    { ...previousPin, sha256: "sha256:changed" },
    baseline,
    previousPin,
    repoRoot,
  ).some((error) => error.includes("same-path baseline mutation")));

  const tempRoot = mkdtempSync(resolve(tmpdir(), "pnh-baseline-transition-"));
  const nextPin: RatificationBaselinePin = {
    path: "assurance/constitution/contracts/ratification-baselines/plan-a-v2.json",
    sha256: "sha256:next",
    decision: previousPin.decision,
  };
  const next = { ...baseline, baseline_id: "plan-a-v2", supersedes: null };
  assert.ok(validateRatificationBaselineTransition(nextPin, next, previousPin, tempRoot)
    .some((error) => error.includes("predecessor baseline does not exist")));
  mkdirSync(resolve(tempRoot, "assurance/constitution/contracts/ratification-baselines"), { recursive: true });
  writeFileSync(resolve(tempRoot, previousPin.path), "preserved\n", "utf8");
  assert.ok(validateRatificationBaselineTransition(nextPin, next, previousPin, tempRoot)
    .some((error) => error.includes("supersedes record is required")));
  const wrongHash = {
    ...next,
    supersedes: {
      from_hash: "sha256:wrong" as const,
      date: "2026-08-28",
      decision: previousPin.decision,
      owner: "Vora Technologies, LLC",
      reason: "Ratified successor baseline.",
    },
  };
  assert.ok(validateRatificationBaselineTransition(
    nextPin,
    wrongHash,
    previousPin,
    tempRoot,
  ).some((error) => error.includes("from_hash")));
  assert.ok(validateRatificationBaselineTransition(
    nextPin,
    {
      ...wrongHash,
      supersedes: {
        ...wrongHash.supersedes,
        from_hash: previousPin.sha256,
      },
    },
    previousPin,
    tempRoot,
  ).some((error) => error.includes("supersession decision does not exist")));
  rmSync(tempRoot, { recursive: true, force: true });
});

test("proof invalidation requires a hash-bound owner decision and reason", () => {
  const lockedHash =
    "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const forgedAuthority = Object.freeze({
    invariantId: "PNH-INV-22",
    amendmentKind: "proof-invalidation",
    priorBindingHash: lockedHash,
    newBindingHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    reason: "The old test does not exercise every admitted execution class.",
    priorProofStatus: "proven",
    decisionPath: "docs/plans/provider-neutral-harness/test-only-decision.md",
    decisionDigest:
      "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  }) as unknown as ValidatedDecisionAuthority;
  const base = {
    id: "PNH-INV-22",
    oldLawStatus: "ratified" as const,
    newLawStatus: "ratified" as const,
    oldProofStatus: "proven" as const,
    newProofStatus: "partial" as const,
    lockedHash,
    newBindingHash: forgedAuthority.newBindingHash,
    proofReason: "Production-constructor coverage is incomplete by execution class.",
    authorities: {},
  };
  assert.match(
    validateInvariantTransition({
      ...base,
      authorities: { proofInvalidation: forgedAuthority },
    }).join("\n"),
    /not issued by the trusted resolver/u,
  );
  for (const [input, expected] of [
    [base, "requires validated proof-invalidation authority"],
    [{ ...base, proofReason: undefined }, "requires a non-empty proof_reason"],
    [{
      ...base,
      authorities: { proofInvalidation: {
        ...forgedAuthority,
        priorBindingHash: "sha256:wrong",
      } as unknown as typeof forgedAuthority },
    }, "does not match locked hash"],
  ] as const) {
    assert.ok(validateInvariantTransition(input).some((error) => error.includes(expected)));
  }
});

test("proof upgrades require accepted evidence and always stale the lock", () => {
  const base = {
    id: "PNH-INV-02",
    oldLawStatus: "ratified" as const,
    newLawStatus: "ratified" as const,
    oldProofStatus: "partial" as const,
    newProofStatus: "proven" as const,
    lockedHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    newBindingHash:
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    proofReason: undefined,
    authorities: {},
  };
  assert.ok(validateInvariantTransition(base).some((error) =>
    error.includes("validated proof-upgrade authority")));
  const forged = Object.freeze({
    invariantId: base.id,
    authorityKind: "proof-upgrade",
    priorProofStatus: base.oldProofStatus,
    newProofStatus: base.newProofStatus,
  }) as unknown as ValidatedProofAuthority;
  assert.ok(validateInvariantTransition({
    ...base,
    authorities: { proof: forged },
  }).some((error) => error.includes("not issued by the trusted resolver")));
});

test("law transitions require an owner-ratified hash-bound amendment", () => {
  const lockedHash =
    "sha256:3333333333333333333333333333333333333333333333333333333333333333";
  const base = {
    id: "PNH-INV-47",
    oldLawStatus: "proposed" as const,
    newLawStatus: "ratified" as const,
    oldProofStatus: "unproven" as const,
    newProofStatus: "unproven" as const,
    lockedHash,
    newBindingHash:
      "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    proofReason: "Implementation has not started.",
    authorities: {},
  };
  assert.ok(validateInvariantTransition(base).some((error) =>
    error.includes("requires validated law-transition authority")));
  const forged = {
    invariantId: base.id,
    amendmentKind: "law-transition",
    priorBindingHash: lockedHash,
    newBindingHash:
      "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    reason: "The owner ratified the invariant as constitutional law.",
  } as unknown as ValidatedDecisionAuthority;
  assert.match(validateInvariantTransition({
    ...base,
    authorities: { law: forged },
  }).join("\n"), /not issued by the trusted resolver/u);
});

test("protocol pin validation remains unchanged in registry v2", () => {
  const base = loadRegistry(fixture("valid-registry.yaml"));
  const hash = computeSchemaHash(["packages/sdk/src/protocol.ts"], repoRoot);
  const registry: ReturnType<typeof loadRegistry> = {
    ...base,
    invariants: [],
    protocols: [{
      id: "PNH-PROTO-01",
      name: "plugin-protocol",
      spec: "pnh/tests/fixtures/constitution/spec-v1.md",
      version: 1,
      schema_source: ["packages/sdk/src/protocol.ts"],
      schema_hash: hash,
      conformance: ["pnh/tests/plugin-protocol.test.ts"],
    }],
  };
  assert.deepEqual(validateProtocolPins(registry, repoRoot), []);
  const stale = {
    ...registry,
    protocols: [{
      ...registry.protocols[0]!,
      version: 2,
      schema_hash: "sha256:0000" as const,
    }],
  };
  const errors = validateProtocolPins(stale, repoRoot);
  assert.ok(errors.some((error) => error.includes("schema hash mismatch")));
  assert.ok(errors.some((error) => error.includes("does not declare Version: 2")));
});

test("RegistryError remains the structural validation boundary", () => {
  assert.throws(
    () => loadRegistry(fixture("valid-registry.yaml"), { overlay: { version: 1 } }),
    RegistryError,
  );
});

test("parseRegistryDocument parses in-memory bytes and validates like loadRegistry", () => {
  const bytes = readFileSync(registryPath, "utf8");
  const fromBytes = parseRegistryDocument(bytes);
  const fromDisk = loadRegistry(registryPath);
  assert.deepEqual(fromBytes, fromDisk);
});

test("parseRegistryDocument rejects structurally invalid bytes", () => {
  assert.throws(() => parseRegistryDocument("invariants: not-a-list\n"), RegistryError);
});

test("parseRegistryDocument honours the overlay option", () => {
  const bytes = readFileSync(registryPath, "utf8");
  const parsed = parseRegistryDocument(bytes, { overlay: { protocols: [] } });
  assert.deepEqual(parsed.protocols, []);
});

function cloneRegistry(source: ReturnType<typeof loadRegistry>) {
  return JSON.parse(JSON.stringify(source)) as ReturnType<typeof loadRegistry>;
}

test("authorized proof delta accepts only the flip, proof_reason removal, and amendment appends", () => {
  const prior = loadRegistry(registryPath);
  const target = prior.invariants[0]!.id;

  assert.deepEqual(validateAuthorizedProofDelta(prior, cloneRegistry(prior), new Set()), []);

  const flipped = cloneRegistry(prior);
  const row = flipped.invariants[0]! as unknown as Record<string, unknown>;
  row.proof_status = "proven";
  delete row.proof_reason;
  row.amendments = [
    ...(prior.invariants[0]!.amendments ?? []),
    {
      kind: "binding-change",
      from_hash: bindingHash(prior.invariants[0]!),
      decision: "docs/plans/provider-neutral-harness/reviews/2026-08-27-plan-a-proof-upgrade-review.md",
      reason: "Structured proof registered under independent review.",
    },
  ];
  assert.deepEqual(validateAuthorizedProofDelta(prior, flipped, new Set([target])), []);
});

test("authorized proof delta refuses changes outside the authorized rows and fields", () => {
  const prior = loadRegistry(registryPath);
  const target = prior.invariants[0]!.id;

  const unauthorizedRow = cloneRegistry(prior);
  (unauthorizedRow.invariants[1]! as unknown as Record<string, unknown>).statement =
    "Restated without any authority at all.";
  assert.match(
    validateAuthorizedProofDelta(prior, unauthorizedRow, new Set([target])).join("\n"),
    /changed without proof authority/u,
  );

  const smuggledField = cloneRegistry(prior);
  const row = smuggledField.invariants[0]! as unknown as Record<string, unknown>;
  row.proof_status = "proven";
  delete row.proof_reason;
  row.statement = "Smuggled restatement of the law.";
  assert.match(
    validateAuthorizedProofDelta(prior, smuggledField, new Set([target])).join("\n"),
    /changed outside the authorized proof delta/u,
  );

  const droppedRow = cloneRegistry(prior);
  (droppedRow as unknown as { invariants: unknown[] }).invariants.splice(1, 1);
  assert.match(
    validateAuthorizedProofDelta(prior, droppedRow, new Set([target])).join("\n"),
    /changed without proof authority|removed/u,
  );
});

test("authorized binding delta permits only the exact target hash and one appended amendment", () => {
  const base = loadRegistry(fixture("valid-registry.yaml"));
  const protocol = {
    id: "PNH-PROTO-02",
    name: "supervisor-command-channel",
    spec: "pnh/tests/fixtures/constitution/spec-v1.md",
    version: 1,
    schema_source: ["packages/sdk/src/protocol.ts"],
    schema_hash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformance: ["pnh/tests/plugin-protocol.test.ts"],
    amendments: [{
      date: "2026-08-26",
      decision: "docs/plans/provider-neutral-harness/2026-08-26-command-scheduler-fairness-amendment.md",
      from_hash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }],
  } as const;
  const prior: Registry = { ...base, protocols: [protocol] };
  const priorBindingHash = bindingHash(protocol);
  const decisionPath =
    "docs/plans/provider-neutral-harness/2026-08-26-plan-a-invariant-amendments.md";
  const reason = "Pin the exact source-byte-only package coordinate update.";
  const changedProtocol = {
    ...protocol,
    schema_hash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const,
    amendments: [...protocol.amendments, {
      date: "2026-09-03",
      decision: decisionPath,
      from_hash: priorBindingHash,
      kind: "binding-change" as const,
      reason,
    }],
  };
  const live: Registry = { ...prior, protocols: [changedProtocol] };
  const authorization: BindingChangeAuthorization = {
    entryId: protocol.id,
    priorBindingHash,
    newBindingHash: bindingHash(changedProtocol),
    decisionPath,
    reason,
  };
  const authorizations = new Map([[protocol.id, authorization]]);

  assert.deepEqual(validateAuthorizedBindingDelta(prior, live, authorizations), []);
  assert.deepEqual(
    diffAgainstLock(live, computeLock(prior), repoRoot, {
      bindingChanges: authorizations,
    }).filter((error) => !error.startsWith("stale lock")),
    [],
  );

  const cases: readonly [string, (registry: Registry) => void, RegExp][] = [
    ["version", (registry) => {
      (registry.protocols[0] as unknown as { version: number }).version = 2;
    }, /outside the authorized binding delta/u],
    ["schema source", (registry) => {
      (registry.protocols[0] as unknown as { schema_source: string[] }).schema_source = [
        "packages/sdk/src/protocol/resource-bounds.ts",
      ];
    }, /outside the authorized binding delta/u],
    ["spec", (registry) => {
      (registry.protocols[0] as unknown as { spec: string }).spec = "changed.md";
    }, /outside the authorized binding delta/u],
    ["conformance", (registry) => {
      (registry.protocols[0] as unknown as { conformance: string[] }).conformance = [];
    }, /outside the authorized binding delta/u],
    ["another row", (registry) => {
      (registry.invariants[0] as unknown as { statement: string }).statement = "Smuggled law.";
    }, /changed without binding-change authority/u],
    ["rewritten amendment", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments[0]!.decision = decisionPath;
    }, /existing amendments were rewritten/u],
    ["extra amendment", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments.push({ ...changedProtocol.amendments.at(-1)! });
    }, /exactly one (?:appended )?amendment/u],
    ["wrong amendment kind", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments.at(-1)!.kind = "law-transition";
    }, /does not match decision authority/u],
    ["wrong amendment prior hash", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments.at(-1)!.from_hash =
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    }, /does not match decision authority/u],
    ["wrong amendment decision", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments.at(-1)!.decision = "docs/plans/provider-neutral-harness/other.md";
    }, /does not match decision authority/u],
    ["wrong amendment reason", (registry) => {
      (registry.protocols[0] as unknown as { amendments: Array<Record<string, unknown>> })
        .amendments.at(-1)!.reason = "A broader change than the owner approved.";
    }, /does not match decision authority/u],
  ];
  for (const [name, mutate, expected] of cases) {
    const smuggled = cloneRegistry(live);
    mutate(smuggled);
    assert.match(
      validateAuthorizedBindingDelta(prior, smuggled, authorizations).join("\n"),
      expected,
      name,
    );
  }

  const wrongTarget = new Map([[protocol.id, {
    ...authorization,
    newBindingHash:
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  }]]);
  assert.match(
    validateAuthorizedBindingDelta(prior, live, wrongTarget).join("\n"),
    /new binding hash/u,
  );
});

test("proof authority suppresses only proof and binding refusals, never law transitions", () => {
  const registry = loadRegistry(fixture("valid-registry.yaml"));
  const lock = computeLock(registry);
  const target = registry.invariants[0]!.id;
  const authorized = new Set([target]);

  // Baseline: registry and lock agree, so nothing is reported either way.
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot), []);
  assert.deepEqual(diffAgainstLock(registry, lock, repoRoot, {
    proofTransitions: authorized,
  }), []);

  const flipped = JSON.parse(JSON.stringify(registry)) as typeof registry;
  const row = flipped.invariants[0]! as unknown as Record<string, unknown>;
  row.proof_status = "proven";
  delete row.proof_reason;

  const withoutAuthority = diffAgainstLock(flipped, lock, repoRoot).join("\n");
  assert.match(withoutAuthority, /proof-status transition requires trusted transition authority/u);
  assert.match(withoutAuthority, /binding-field change requires trusted decision authority/u);

  const withAuthority = diffAgainstLock(flipped, lock, repoRoot, {
    proofTransitions: authorized,
  }).join("\n");
  assert.doesNotMatch(withAuthority, /requires trusted transition authority/u);
  assert.doesNotMatch(withAuthority, /requires trusted decision authority/u);
  assert.match(withAuthority, /stale lock/u);

  // A law-status transition is never satisfied by proof authority.
  const retired = JSON.parse(JSON.stringify(registry)) as typeof registry;
  (retired.invariants[0]! as unknown as Record<string, unknown>).law_status = "retired";
  assert.match(
    diffAgainstLock(retired, lock, repoRoot, {
      proofTransitions: authorized,
    }).join("\n"),
    /law-status transition requires trusted transition authority/u,
  );
});
