import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { validateInvariantTransition } from "../../assurance/constitution/contracts/invariant-transition.ts";
import {
  consumeDecisionAuthority,
  resolveDecisionAuthority,
  lockedInvariantState,
  resolveProofAuthority,
  type DecisionAuthorityRequest,
} from "../../assurance/constitution/contracts/transition-authority.ts";

const DECISION_PATH =
  "docs/plans/provider-neutral-harness/2026-08-28-test-transition-decision.md";
const OWNER = "Vora Technologies, LLC";
const DECISION_ROLE = "D6, constitution and proof governance";
const LOCKED_HASH =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const NEW_BINDING_HASH =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const REASON = "The prior proof omitted an admitted execution class.";
const ARCHITECTURE_IDENTITIES = [
  "architecture-spec:04e8e79a8cb89186da7032b696e832e1cf2d994d",
  "plan-a:1c33a814f1324e67cf53a6fe860bdbdd175031ed",
] as const;

interface TestTransitionEntry {
  readonly invariantId: string;
  readonly amendmentKind: string;
  readonly priorBindingHash: string;
  readonly newBindingHash: string;
  readonly priorProofStatus?: string;
  readonly reason: string;
}

function digest(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function decisionDocument(overrides: {
  readonly status?: string;
  readonly owner?: string;
  readonly decisionRole?: string;
  readonly invariantId?: string;
  readonly amendmentKind?: string;
  readonly priorBindingHash?: string;
  readonly newBindingHash?: string;
  readonly priorProofStatus?: string;
  readonly reason?: string;
  readonly architectureIdentities?: readonly string[];
  readonly transitions?: readonly TestTransitionEntry[];
} = {}): string {
  const architectureIdentities =
    overrides.architectureIdentities ?? ARCHITECTURE_IDENTITIES;
  const transitions = overrides.transitions ?? [{
    invariantId: overrides.invariantId ?? "PNH-INV-22",
    amendmentKind: overrides.amendmentKind ?? "proof-invalidation",
    priorBindingHash: overrides.priorBindingHash ?? LOCKED_HASH,
    newBindingHash: overrides.newBindingHash ?? NEW_BINDING_HASH,
    priorProofStatus: overrides.priorProofStatus ?? "proven",
    reason: overrides.reason ?? REASON,
  }];
  return [
    "# Synthetic transition decision",
    "",
    `Status: ${overrides.status ?? "Ratified"}`,
    "",
    `Owner: ${overrides.owner ?? OWNER}`,
    "",
    `Decision owner: ${overrides.decisionRole ?? DECISION_ROLE}`,
    "",
    ...transitions.flatMap((transition) => {
      const entry = {
        invariant_id: transition.invariantId,
        amendment_kind: transition.amendmentKind,
        prior_binding_hash: transition.priorBindingHash,
        new_binding_hash: transition.newBindingHash,
        ...(transition.priorProofStatus === undefined
          ? {}
          : { prior_proof_status: transition.priorProofStatus }),
        reason: transition.reason,
      };
      return [`Transition entry: ${JSON.stringify(entry)}`, ""];
    }),
    ...architectureIdentities.flatMap((identity) => [
      `Bound architecture identity: ${identity}`,
      "",
    ]),
    "## Decision",
    "",
    "Invalidate the prior proof while preserving the ratified law.",
    "",
  ].join("\n");
}

function writeDecision(repoRoot: string, content: string, path = DECISION_PATH): void {
  const absolute = join(repoRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function request(repoRoot: string, content: string): DecisionAuthorityRequest {
  return {
    repoRoot,
    decisionPath: DECISION_PATH,
    expectedContentDigest: digest(content),
    expectedOwner: OWNER,
    expectedDecisionRole: DECISION_ROLE,
    expectedArchitectureIdentities: ARCHITECTURE_IDENTITIES,
    transition: {
      invariantId: "PNH-INV-22",
      amendmentKind: "proof-invalidation",
      priorBindingHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      priorProofStatus: "proven",
      reason: REASON,
    },
  };
}

test("trusted decision resolution is required before a proof downgrade", (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "pnh-transition-authority-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const content = decisionDocument();
  writeDecision(repoRoot, content);

  const resolved = resolveDecisionAuthority(request(repoRoot, content));
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.deepEqual(
    validateInvariantTransition({
      id: "PNH-INV-22",
      oldLawStatus: "ratified",
      newLawStatus: "ratified",
      oldProofStatus: "proven",
      newProofStatus: "partial",
      lockedHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      proofReason: "Coverage remains incomplete by execution class.",
      authorities: { proofInvalidation: resolved.authority },
    }),
    [
      "stale lock: PNH-INV-22 law/proof status changed (run generate-constitution --update-lock)",
    ],
  );

  const mismatched = resolveDecisionAuthority(request(repoRoot, content));
  assert.equal(mismatched.ok, true);
  if (!mismatched.ok) return;
  assert.match(
    validateInvariantTransition({
      id: "PNH-INV-22",
      oldLawStatus: "ratified",
      newLawStatus: "ratified",
      oldProofStatus: "proven",
      newProofStatus: "partial",
      lockedHash: LOCKED_HASH,
      newBindingHash:
        "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      proofReason: "Coverage remains incomplete by execution class.",
      authorities: { proofInvalidation: mismatched.authority },
    }).join("\n"),
    /does not match target hash/u,
  );
});

test("one owner-pinned decision can authorize a closed batch of transitions", (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "pnh-transition-authority-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const secondHash =
    "sha256:3333333333333333333333333333333333333333333333333333333333333333";
  const bindingHash =
    "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const transitions = [
    {
      invariantId: "PNH-INV-22",
      amendmentKind: "proof-invalidation",
      priorBindingHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      priorProofStatus: "proven",
      reason: REASON,
    },
    {
      invariantId: "PNH-INV-23",
      amendmentKind: "law-transition",
      priorBindingHash: secondHash,
      newBindingHash:
        "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      reason: "The owner ratified the migrated invariant as constitutional law.",
    },
    {
      invariantId: "PNH-INV-25",
      amendmentKind: "binding-change",
      priorBindingHash: bindingHash,
      newBindingHash:
        "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      reason: "The owner ratified the exact replacement statement.",
    },
  ] as const;
  const content = decisionDocument({ transitions });
  writeDecision(repoRoot, content);

  for (const transition of transitions) {
    const resolved = resolveDecisionAuthority({
      ...request(repoRoot, content),
      transition,
    });
    assert.equal(resolved.ok, true, `${transition.invariantId} must resolve`);
  }

  const duplicate = decisionDocument({
    transitions: [transitions[0], transitions[0]],
  });
  writeDecision(repoRoot, duplicate);
  assert.equal(resolveDecisionAuthority(request(repoRoot, duplicate)).ok, false);
});

test("decision authority rejects untrusted paths, prose, identity, and transition drift", async (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "pnh-transition-authority-"));
  const outsideRoot = mkdtempSync(join(tmpdir(), "pnh-transition-outside-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  t.after(() => rmSync(outsideRoot, { recursive: true, force: true }));

  const cases: readonly [string, string, Partial<DecisionAuthorityRequest>][] = [
    ["unratified Markdown", decisionDocument({ status: "Draft" }), {}],
    ["wrong owner", decisionDocument({ owner: "Untrusted Owner" }), {}],
    ["wrong decision role", decisionDocument({ decisionRole: "D8" }), {}],
    ["wrong amendment kind", decisionDocument({ amendmentKind: "law-transition" }), {}],
    ["wrong invariant", decisionDocument({ invariantId: "PNH-INV-23" }), {}],
    ["wrong prior hash", decisionDocument({ priorBindingHash: "sha256:wrong" }), {}],
    [
      "wrong new hash",
      decisionDocument({
        newBindingHash:
          "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      }),
      {},
    ],
    [
      "missing new hash",
      decisionDocument().replace(`,"new_binding_hash":"${NEW_BINDING_HASH}"`, ""),
      {},
    ],
    ["wrong proof state", decisionDocument({ priorProofStatus: "partial" }), {}],
    ["wrong reason", decisionDocument({ reason: "Different transition." }), {}],
    [
      "wrong architecture identity",
      decisionDocument({ architectureIdentities: ["architecture-spec:wrong"] }),
      {},
    ],
    ["absolute path", decisionDocument(), { decisionPath: "/etc/hosts" }],
    [
      "traversal",
      decisionDocument(),
      { decisionPath: "docs/plans/provider-neutral-harness/../../../../etc/hosts" },
    ],
  ];

  for (const [name, content, overrides] of cases) {
    await t.test(name, () => {
      writeDecision(repoRoot, content);
      const result = resolveDecisionAuthority({
        ...request(repoRoot, content),
        ...overrides,
      });
      assert.equal(result.ok, false, `${name} must fail closed`);
    });
  }

  await t.test("symlink escape", () => {
    const outsideDecision = join(outsideRoot, "decision.md");
    const content = decisionDocument();
    writeFileSync(outsideDecision, content);
    const linkPath = join(repoRoot, DECISION_PATH);
    mkdirSync(dirname(linkPath), { recursive: true });
    rmSync(linkPath, { force: true });
    symlinkSync(outsideDecision, linkPath);
    assert.equal(resolveDecisionAuthority(request(repoRoot, content)).ok, false);
    rmSync(linkPath, { force: true });
  });

  await t.test("decision digest drift", () => {
    const original = decisionDocument();
    writeDecision(repoRoot, `${original}\nChanged after owner pin.\n`);
    assert.equal(resolveDecisionAuthority(request(repoRoot, original)).ok, false);
  });
});

test("protocol binding authority is exact and one-shot", (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "pnh-transition-authority-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const protocolReason = "Pin the exact source-byte-only package coordinate update.";
  const content = decisionDocument({
    transitions: [{
      invariantId: "PNH-PROTO-02",
      amendmentKind: "binding-change",
      priorBindingHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      reason: protocolReason,
    }],
  });
  writeDecision(repoRoot, content);

  const resolved = resolveDecisionAuthority({
    ...request(repoRoot, content),
    transition: {
      invariantId: "PNH-PROTO-02",
      amendmentKind: "binding-change",
      priorBindingHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      reason: protocolReason,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.deepEqual(consumeDecisionAuthority(resolved.authority), []);
  assert.match(
    consumeDecisionAuthority(resolved.authority).join("\n"),
    /not issued by the trusted resolver/u,
  );

  const stale = resolveDecisionAuthority({
    ...request(repoRoot, content),
    transition: {
      invariantId: "PNH-PROTO-02",
      amendmentKind: "binding-change",
      priorBindingHash: LOCKED_HASH,
      newBindingHash: NEW_BINDING_HASH,
      reason: protocolReason,
    },
  });
  assert.equal(stale.ok, true);
  if (!stale.ok) return;
  writeDecision(repoRoot, `${content}\nChanged after authority resolution.\n`);
  assert.match(
    consumeDecisionAuthority(stale.authority).join("\n"),
    /content digest/u,
  );
});

test("proof authority fails closed without a validated report and reviewer", () => {
  const result = resolveProofAuthority({
    proofReportPath: resolve(tmpdir(), "missing-proof-report.json"),
    invariantId: "PNH-INV-02",
    priorProofStatus: "partial",
    newProofStatus: "proven",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.length > 0);
});

test("locked invariant state reads prior state from the committed lock, not the registry", () => {
  const root = mkdtempSync(join(tmpdir(), "pnh-locked-state-"));
  try {
    // The fixture root carries only a lock — no registry — so every value the
    // reader returns is provably anchored on the lock alone, and the assertions
    // stay true regardless of the live repository's lock state.
    const lockPath = join(root, "assurance", "constitution", "contracts", "invariants.lock");
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({
      version: 2,
      entries: {
        "PNH-INV-02": {
          binding_hash: LOCKED_HASH,
          law_status: "ratified",
          proof_status: "partial",
        },
      },
    }), "utf8");
    const locked = lockedInvariantState(root, "PNH-INV-02");
    assert.ok(locked !== undefined, "the fixture lock entry must resolve");
    assert.equal(locked.proof_status, "partial");
    assert.equal(locked.law_status, "ratified");
    assert.equal(locked.binding_hash, LOCKED_HASH);
    assert.equal(lockedInvariantState(root, "PNH-INV-NOPE"), undefined);
    rmSync(lockPath);
    assert.equal(lockedInvariantState(root, "PNH-INV-02"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proof authority rejects a prior status that disagrees with the lock", () => {
  const result = resolveProofAuthority({
    proofReportPath: resolve(tmpdir(), "missing-proof-report.json"),
    invariantId: "PNH-INV-02",
    priorProofStatus: "proven",
    newProofStatus: "proven",
  });
  assert.equal(result.ok, false);
});
