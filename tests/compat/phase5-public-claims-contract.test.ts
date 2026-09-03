import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { runPublicClaimGate } from "../../assurance/constitution/contracts/public-claims.ts";
import {
  PHASE5_MARKDOWN_DOCUMENTS,
  PHASE5_PUBLIC_CLAIM_SURFACES,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = resolve(
  repositoryRoot,
  "assurance",
  "constitution",
  "contracts",
  "public-claims.yaml",
);
const unchangedClaimsDigest = "caf915ba79859393f1586962116648c281719ea7a136721be60a7770634af8c9";
const releaseTextClaimIds = new Set([
  "PNH-CLAIM-01",
  "PNH-CLAIM-07",
  "PNH-CLAIM-12",
  "PNH-CLAIM-16",
  "PNH-CLAIM-17",
  "PNH-CLAIM-22",
]);

interface ClaimRow {
  readonly id: string;
  readonly file: string;
  readonly posture: string;
  readonly text_digest: string;
  readonly invariants: readonly string[];
  readonly execution_classes: readonly string[];
  readonly evidence_environments: readonly string[];
  readonly release_scope: string;
}

interface ClaimManifest {
  readonly surfaces: readonly string[];
  readonly claims: readonly ClaimRow[];
}

function manifest(): ClaimManifest {
  return parse(readFileSync(manifestPath, "utf8")) as ClaimManifest;
}

test("public preview onboarding leads with the registry and retains tarball acceptance", () => {
  for (const path of [
    "README.md",
    "docs/developer-preview/getting-started.md",
  ]) {
    const contents = readFileSync(resolve(repositoryRoot, path), "utf8");
    const registryInstall = contents.indexOf("npm install --save-dev @useprism/cli@0.1.0");
    const tarballInstall = contents.indexOf(
      "npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz",
    );
    assert.notEqual(registryInstall, -1, `${path} omits registry installation`);
    assert.ok(tarballInstall > registryInstall, `${path} does not keep tarball acceptance after registry installation`);
  }
});

test("the public-claim manifest scans the exact closed Phase 5 release surface", () => {
  assert.deepEqual([...manifest().surfaces].sort(), PHASE5_PUBLIC_CLAIM_SURFACES);
});

test("the public preview preserves trust metadata while publishing every claim scope", () => {
  const claims = manifest().claims;
  assert.equal(claims.length, 22);
  assert.equal(
    createHash("sha256").update(JSON.stringify(
      claims
        .filter(({ id }) => !releaseTextClaimIds.has(id))
        .map(({ release_scope: _releaseScope, ...claim }) => claim),
    )).digest("hex"),
    unchangedClaimsDigest,
  );
  assert.deepEqual(
    claims
      .filter(({ id }) => releaseTextClaimIds.has(id))
      .map(({ text_digest: _textDigest, release_scope: _releaseScope, ...claim }) => claim),
    [
      {
        id: "PNH-CLAIM-01",
        file: "pnh/README.md",
        posture: "limitation",
        invariants: ["PNH-INV-17", "PNH-INV-20"],
        execution_classes: [],
        evidence_environments: ["none"],
      },
      {
        id: "PNH-CLAIM-07",
        file: "pnh/README.md",
        posture: "planned",
        invariants: ["PNH-INV-25", "PNH-INV-27"],
        execution_classes: ["container-isolated-v1"],
        evidence_environments: ["docker-linux-container"],
      },
      {
        id: "PNH-CLAIM-12",
        file: "pnh/README.md",
        posture: "limitation",
        invariants: ["PNH-INV-29"],
        execution_classes: [],
        evidence_environments: ["none"],
      },
      {
        id: "PNH-CLAIM-16",
        file: "pnh/README.md",
        posture: "planned",
        invariants: [],
        execution_classes: ["trusted-subprocess-v1"],
        evidence_environments: ["developer-macos"],
      },
      {
        id: "PNH-CLAIM-17",
        file: "README.md",
        posture: "limitation",
        invariants: ["PNH-INV-17", "PNH-INV-20"],
        execution_classes: [],
        evidence_environments: ["none"],
      },
      {
        id: "PNH-CLAIM-22",
        file: "docs/releases/developer-preview/README.md",
        posture: "limitation",
        invariants: ["PNH-INV-17", "PNH-INV-20"],
        execution_classes: [],
        evidence_environments: ["none"],
      },
    ],
  );
  for (const claim of claims) {
    assert.equal(claim.release_scope, "public-release", `${claim.id} is not public-release`);
  }
});

test("the minimum trust surfaces carry registered claims and the exact repository gate passes", (context) => {
  const missing = PHASE5_MARKDOWN_DOCUMENTS.filter((path) => !existsSync(resolve(repositoryRoot, path)));
  if (missing.length > 0) {
    context.skip(`awaiting Phase 5 documentation: ${missing.join(", ")}`);
    return;
  }
  const claims = manifest().claims;
  for (const path of [
    "README.md",
    "docs/developer-preview/data-and-trust.md",
    "docs/assurance/README.md",
    "docs/releases/developer-preview/README.md",
  ]) assert.ok(claims.some(({ file }) => file === path), `${path} has no registered claim`);
  assert.deepEqual(runPublicClaimGate(repositoryRoot), []);
});
