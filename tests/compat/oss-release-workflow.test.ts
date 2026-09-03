import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const release = () => readFileSync(resolve(repositoryRoot, ".github/workflows/release.yml"), "utf8");

type RunStep = {
  env: Record<string, unknown>;
  name: string;
  run: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectRunSteps(value: unknown): RunStep[] {
  if (Array.isArray(value)) return value.flatMap(collectRunSteps);
  if (!isRecord(value)) return [];

  const nested = Object.entries(value)
    .filter(([key]) => key !== "run")
    .flatMap(([, child]) => collectRunSteps(child));
  if (typeof value.run !== "string") return nested;

  return [{
    env: isRecord(value.env) ? value.env : {},
    name: typeof value.name === "string" ? value.name : "unnamed run step",
    run: value.run,
  }, ...nested];
}

function expansionIndexes(text: string, variable: string): number[] {
  const pattern = new RegExp(`\\$(?:\\{${variable}\\}|${variable}\\b)`, "gu");
  return [...text.matchAll(pattern)].map((match) => match.index);
}

function assertOrdered(text: string, labels: readonly string[]): void {
  let previous = -1;
  for (const label of labels) {
    const index = text.indexOf(label);
    assert.ok(index > previous, `${label} must be present in release order`);
    previous = index;
  }
}

test("release workflow verifies without secrets before the protected publish job consumes the exact artifact", () => {
  const workflow = release();
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.doesNotMatch(workflow, /provider-codex/u);

  const verifyStart = workflow.indexOf("  verify:");
  const publishStart = workflow.indexOf("  publish:");
  assert.ok(verifyStart >= 0 && publishStart > verifyStart, "verify must precede publish");
  const verifyJob = workflow.slice(verifyStart, publishStart);
  const publishJob = workflow.slice(publishStart);
  assert.match(verifyJob, /permissions:\n\s+contents: read/u);
  assert.doesNotMatch(verifyJob, /environment:/u);
  assert.doesNotMatch(verifyJob, /secrets\./u);
  assert.match(publishJob, /needs: verify/u);
  assert.match(publishJob, /environment: npm-release/u);
  assert.match(publishJob, /permissions:\n\s+actions: read\n\s+contents: write\n\s+id-token: write\n\s+attestations: write\n\s+artifact-metadata: write/u);
  assert.match(verifyJob, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4/u);
  assert.match(verifyJob, /id: verified-artifact/u);
  assert.match(workflow, /artifact-id: \$\{\{ steps\.verified-artifact\.outputs\.artifact-id \}\}/u);
  assert.match(workflow, /artifact-digest: \$\{\{ steps\.verified-artifact\.outputs\.artifact-digest \}\}/u);
  assert.match(publishJob, /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53 # v6/u);
  assert.match(publishJob, /artifact-ids: \$\{\{ needs\.verify\.outputs\.artifact-id \}\}/u);
  assert.match(verifyJob, /prepare-oss-release-bundle\.mjs create/u);
  assert.match(publishJob, /prepare-oss-release-bundle\.mjs verify/u);
  assert.match(verifyJob, /npm audit --audit-level=low --include=dev --include=optional --include=peer/u);
  assert.doesNotMatch(verifyJob, /--omit=dev/u);

  const provenanceStart = publishJob.indexOf("Attest complete release asset set with build provenance");
  const sbomStart = publishJob.indexOf("Attest four package tarballs with release-set SBOM");
  const npmPublishStart = publishJob.indexOf("Publish exact candidate packages to next");
  assert.ok(
    provenanceStart >= 0 && sbomStart > provenanceStart && npmPublishStart > sbomStart,
    "provenance and SBOM attestations must be separate and precede npm publication",
  );
  const provenanceStep = publishJob.slice(provenanceStart, sbomStart);
  const sbomStep = publishJob.slice(sbomStart, npmPublishStart);
  assert.match(provenanceStep, /actions\/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a # v3\.0\.0/u);
  for (const asset of [
    "useprism-sdk-0.1.0.tgz",
    "useprism-runtime-0.1.0.tgz",
    "useprism-provider-ollama-0.1.0.tgz",
    "useprism-cli-0.1.0.tgz",
    "SHA256SUMS",
    "prism-0.1.0.spdx.json",
    "prism-0.1.0-licenses.json",
  ]) assert.match(provenanceStep, new RegExp(asset.replaceAll(".", "\\."), "u"));
  assert.match(sbomStep, /actions\/attest-sbom@4651f806c01d8637787e274ac3bdf724ef169f34 # v3\.0\.0/u);
  for (const packageFile of [
    "useprism-sdk-0.1.0.tgz",
    "useprism-runtime-0.1.0.tgz",
    "useprism-provider-ollama-0.1.0.tgz",
    "useprism-cli-0.1.0.tgz",
  ]) assert.match(sbomStep, new RegExp(packageFile.replaceAll(".", "\\."), "u"));
  assert.doesNotMatch(sbomStep, /SHA256SUMS|licenses\.json/u);
  assert.match(sbomStep, /sbom-path: .*prism-0\.1\.0\.spdx\.json/u);

  assertOrdered(workflow, [
    "Validate exact release identity",
    "Audit locked full dependency graph",
    "Run full verification",
    "Build exact release candidate",
    "Generate full dependency SBOM and enforce licenses",
    "Install pinned Gitleaks",
    "Scan full history and extracted candidate",
    "Prepare closed verified release artifact",
    "Upload exact verified release artifact",
    "Download exact verified release artifact",
    "Revalidate downloaded release closure and digests",
    "Attest complete release asset set with build provenance",
    "Attest four package tarballs with release-set SBOM",
    "Publish exact candidate packages to next",
    "Verify registry integrity, provenance, and installation",
    "Create or refresh draft GitHub release",
    "Publish immutable GitHub release",
    "Verify immutable GitHub release and assets",
    "Promote closed npm set to latest",
  ]);

  assert.match(workflow, /GITLEAKS_VERSION: "8\.30\.1"/u);
  assert.match(workflow, /GITLEAKS_SHA256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"/u);
  assert.match(workflow, /GH_CLI_VERSION: "2\.99\.0"/u);
  assert.match(workflow, /GH_CLI_SHA256: "ed4960225d2833e04a61590d9fa2b5773d147f3aa375459e5466a40c102f3832"/u);
  assert.match(workflow, /node scripts\/release\/scan-oss-release\.mjs/u);
  assert.match(workflow, /node scripts\/release\/publish-oss-release\.mjs/u);
  assert.match(workflow, /node scripts\/release\/smoke-oss-registry\.mjs/u);
  assert.match(workflow, /node scripts\/release\/promote-oss-release\.mjs/u);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/u);
  assert.match(workflow, /gh release create[\s\S]*--draft[\s\S]*--target "\$GITHUB_SHA"/u);
  assert.match(workflow, /gh release edit[\s\S]*--draft=false/u);
  assert.match(workflow, /gh release verify "\$RELEASE_TAG"/u);
  assert.match(workflow, /gh release verify-asset "\$RELEASE_TAG"/u);
  assert.match(workflow, /prism-0\.1\.0-licenses\.json/u);
  assert.match(workflow, /npm stage publish/u);
  assert.match(workflow, /human approval/u);
  assert.match(workflow, /OIDC does not authorize dist-tag mutation/u);
});

test("workflow dispatch inputs enter every shell run only through quoted step env variables", () => {
  const steps = collectRunSteps(parse(release()) as unknown);
  assert.ok(steps.length > 0, "release workflow must contain parsed run steps");

  const directInputExpression = /\$\{\{\s*(?:github\.event\.)?inputs(?:\.|\[)/u;
  const inputVariables = new Map([
    ["RELEASE_TAG", {
      inputExpression: "${{ inputs.tag }}",
      quotedForms: ['"$RELEASE_TAG"'],
    }],
    ["RELEASE_VERSION", {
      inputExpression: "${{ inputs.version }}",
      quotedForms: ['"$RELEASE_VERSION"', '"Prism $RELEASE_VERSION"'],
    }],
  ]);

  for (const step of steps) {
    assert.doesNotMatch(
      step.run,
      directInputExpression,
      `${step.name} must not interpolate workflow inputs into shell source`,
    );

    for (const [variable, { inputExpression, quotedForms }] of inputVariables) {
      const indexes = expansionIndexes(step.run, variable);
      if (indexes.length === 0) continue;
      assert.equal(
        step.env[variable],
        inputExpression,
        `${step.name} must bind ${variable} from its exact workflow input`,
      );
      let withoutQuotedExpansions = step.run;
      for (const quotedForm of quotedForms) {
        withoutQuotedExpansions = withoutQuotedExpansions.replaceAll(quotedForm, "");
      }
      assert.deepEqual(
        expansionIndexes(withoutQuotedExpansions, variable),
        [],
        `${step.name} must use only approved double-quoted $${variable} expansions`,
      );
    }
  }
});

test("every workflow action is immutable and the release uses the reviewed action identities", () => {
  for (const file of ["ci.yml", "release.yml"]) {
    const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows", file), "utf8");
    const uses = [...workflow.matchAll(/^\s+(?:- )?uses: ([^\s]+)(?:\s+#.*)?$/gmu)]
      .map((match) => match[1] ?? "");
    assert.ok(uses.length > 0, `${file} must use reviewed actions`);
    for (const identity of uses) {
      assert.match(identity, /^[^@\s]+@[0-9a-f]{40}$/u, `${identity} must use a full commit SHA`);
    }
  }
  const workflow = release();
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6/u);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/u);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4/u);
  assert.match(workflow, /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53 # v6/u);
  assert.match(workflow, /actions\/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a # v3\.0\.0/u);
  assert.match(workflow, /actions\/attest-sbom@4651f806c01d8637787e274ac3bdf724ef169f34 # v3\.0\.0/u);
  assert.doesNotMatch(workflow, /^\s+(?:- )?uses: actions\/attest@/gmu);
});

test("CI runs full dependency vulnerability and license gates plus release-focused tests", () => {
  const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /package-manager-cache: false/u);
  assert.match(workflow, /npm audit --audit-level=low --include=dev --include=optional --include=peer/u);
  assert.doesNotMatch(workflow, /--omit=dev/u);
  assert.match(workflow, /node scripts\/release\/generate-oss-sbom\.mjs/u);
  assert.match(workflow, /--license-report/u);
  assert.match(workflow, /npm test/u);
  assert.match(workflow, /npm run pack:check/u);
});

test("Dependabot covers npm and pinned GitHub Actions dependencies", () => {
  const config = readFileSync(resolve(repositoryRoot, ".github/dependabot.yml"), "utf8");
  assert.match(config, /package-ecosystem: "npm"/u);
  assert.match(config, /package-ecosystem: "github-actions"/u);
  assert.equal((config.match(/interval: "weekly"/gu) ?? []).length, 2);
});
