import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const PHASE5_WORKSTREAM = "20260830-prism-phase-5-onboarding-release-143e51";
export const PHASE5_MODEL = "qwen2.5:14b";
export const PHASE5_VERSION = "0.1.0";
export const PHASE5_SOURCE_COMMIT = "a".repeat(40);

export const PHASE5_MARKDOWN_DOCUMENTS = Object.freeze([
  "README.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/README.md",
  "docs/architecture/README.md",
  "docs/assurance/README.md",
  "docs/developer-preview/command-reference.md",
  "docs/developer-preview/compatibility.md",
  "docs/developer-preview/concepts.md",
  "docs/developer-preview/data-and-trust.md",
  "docs/developer-preview/diagnostics.md",
  "docs/developer-preview/getting-started.md",
  "docs/developer-preview/plugin-authoring.md",
  "docs/releases/developer-preview/README.md",
  "examples/README.md",
  "examples/deterministic/README.md",
  "examples/failures/README.md",
  "examples/ollama/README.md",
  "examples/project-plugin/README.md",
  "examples/project-plugin/release-slug/README.md",
  "examples/runtime-api/README.md",
  "packages/cli/README.md",
  "packages/provider-ollama/README.md",
  "packages/runtime/README.md",
  "packages/sdk/README.md",
] as const);

export const PHASE5_CANDIDATE_ASSETS = Object.freeze([
  "docs/architecture/diagrams/assurance-lanes.mmd",
  "docs/architecture/diagrams/bounded-run.mmd",
  "docs/architecture/diagrams/local-data-and-evidence.mmd",
  "docs/architecture/diagrams/plugin-admission.mmd",
  "docs/architecture/diagrams/system-and-packages.mmd",
  "examples/failures/policy-denied.mjs",
  "examples/project-plugin/release-slug/index.mjs",
  "examples/project-plugin/release-slug/index.test.mjs",
  "examples/project-plugin/release-slug/manifest.json",
  "examples/runtime-api/run.mjs",
] as const);

export const PHASE5_LIVE_EVIDENCE_PATH =
  "docs/releases/developer-preview/ollama-live-evidence.json";
export const PHASE5_LIVE_ATTEMPT_PATH =
  `docs/ai/workstreams/${PHASE5_WORKSTREAM}/LIVE_ATTEMPT.json`;
export const PHASE5_LIVE_FIXTURE_PATH =
  "tests/fixtures/ollama-live/LIVE_FIXTURE.md";
export const PHASE5_LIVE_EXPECTED_FACT_PATH =
  "tests/fixtures/ollama-live/EXPECTED_FACT.txt";
export const PHASE5_LIVE_ACCEPTANCE_SCRIPT = "scripts/test-live-ollama.mjs";
export const PHASE5_PACKED_ACCEPTANCE_SCRIPT = "scripts/test-packed-install.mjs";

export const PHASE5_PUBLIC_CLAIM_SURFACES = Object.freeze([
  "README.md",
  "docs/assurance/README.md",
  "docs/developer-preview/command-reference.md",
  "docs/developer-preview/concepts.md",
  "docs/developer-preview/data-and-trust.md",
  "docs/developer-preview/diagnostics.md",
  "docs/developer-preview/getting-started.md",
  "docs/developer-preview/plugin-authoring.md",
  "docs/releases/developer-preview/README.md",
  "pnh/README.md",
].sort());

export const PHASE5_CANDIDATE_DOCUMENTS = Object.freeze([
  "LICENSE",
  "NOTICE",
  ...PHASE5_MARKDOWN_DOCUMENTS,
  ...PHASE5_CANDIDATE_ASSETS,
  "THIRD_PARTY_NOTICES.md",
].sort());

export const PHASE5_CANDIDATE_PACKAGES = Object.freeze([
  {
    name: "@useprism/cli",
    version: PHASE5_VERSION,
    file: "useprism-cli-0.1.0.tgz",
  },
  {
    name: "@useprism/provider-ollama",
    version: PHASE5_VERSION,
    file: "useprism-provider-ollama-0.1.0.tgz",
  },
  {
    name: "@useprism/runtime",
    version: PHASE5_VERSION,
    file: "useprism-runtime-0.1.0.tgz",
  },
  {
    name: "@useprism/sdk",
    version: PHASE5_VERSION,
    file: "useprism-sdk-0.1.0.tgz",
  },
] as const);

export const PHASE5_CANDIDATE_FILES = Object.freeze([
  ...PHASE5_CANDIDATE_DOCUMENTS,
  ...PHASE5_CANDIDATE_PACKAGES.map(({ file }) => `packages/${file}`),
  "SHA256SUMS",
  "candidate.json",
].sort());

export const PHASE5_RELEASE_MODULE = "scripts/release/developer-preview-contract.mjs";
export const PHASE5_PACK_SCRIPT = "scripts/release/pack-developer-preview.mjs";
export const PHASE5_CHECK_SCRIPT = "scripts/release/check-developer-preview.mjs";
export const PHASE5_CLEAN_CHECKOUT_SCRIPT = "scripts/release/check-clean-checkout.mjs";

export interface CandidatePackageEntry {
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly sha256: string;
}

export interface CandidateDocumentEntry {
  readonly file: string;
  readonly sha256: string;
}

export interface CandidateManifest {
  readonly version: "prism-developer-preview-candidate-v1";
  readonly sourceCommit: string;
  readonly node: "26.8.1";
  readonly npm: "11.19.0";
  readonly packages: readonly CandidatePackageEntry[];
  readonly documents: readonly CandidateDocumentEntry[];
}

export interface LiveEvidence {
  readonly version: "prism-live-ollama-evidence-v1";
  readonly fixtureSha256: string;
  readonly expectedFactSha256: string;
  readonly acceptanceScriptSha256: string;
  readonly acceptanceInputSha256: string;
  readonly model: "qwen2.5:14b";
  readonly result: "passed";
  readonly recordedAt: string;
}

export interface LiveAttemptLedger {
  readonly version: "prism-phase-5-live-attempt-v1";
  readonly workstream: typeof PHASE5_WORKSTREAM;
  readonly ordinal: 1;
  readonly model: "qwen2.5:14b";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly result:
    | "started"
    | "passed"
    | "model-missing"
    | "doctor-failed"
    | "provider-failed"
    | "acceptance-failed"
    | "tooling-failed";
  readonly evidenceSha256: string | null;
}

export interface CandidatePackageArtifact {
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly sourcePath: string;
}

export interface Phase5ReleaseContractModule {
  parseCandidateManifest(text: string): CandidateManifest;
  parseLiveEvidence(text: string): LiveEvidence;
  parseLiveAttemptLedger(text: string): LiveAttemptLedger;
  validateLiveReleaseEvidence(input: {
    readonly repositoryRoot: string;
    readonly evidencePath: string;
    readonly ledgerPath: string;
    readonly fixturePath: string;
    readonly expectedFactPath: string;
    readonly acceptanceScriptPath: string;
  }): Promise<LiveEvidence>;
  liveAcceptanceInputDigest(input: {
    readonly repositoryRoot: string;
  }): Promise<string>;
  validateLiveEvidencePath(input: {
    readonly repositoryRoot: string;
    readonly evidencePath: string;
  }): Promise<string>;
  assertPinnedToolchain(input: {
    readonly nodeVersion: string;
    readonly npmVersion: string;
    readonly expectedNodeVersion: string;
  }): void;
  classifyLiveDoctorFailure(stdout: string): "model-missing" | "doctor-failed";
  publishDirectoryNoReplace(
    stage: string,
    output: string,
    hooks?: { readonly afterHelperReady?: () => Promise<void> },
  ): Promise<void>;
  resolveSafeOutputPath(outputPath: string): Promise<string>;
  reserveLiveAttempt(input: {
    readonly ledgerPath: string;
    readonly workstream: string;
    readonly model: string;
    readonly startedAt: string;
  }): Promise<LiveAttemptLedger>;
  completeLiveAttempt(input: {
    readonly ledgerPath: string;
    readonly result: Exclude<LiveAttemptLedger["result"], "started">;
    readonly finishedAt: string;
    readonly evidencePath?: string;
  }): Promise<LiveAttemptLedger>;
  assembleDeveloperPreviewCandidate(input: {
    readonly repositoryRoot: string;
    readonly outputPath: string;
    readonly sourceCommit: string;
    readonly packageArtifacts: readonly CandidatePackageArtifact[];
  }): Promise<void>;
  validateDeveloperPreviewCandidate(input: {
    readonly candidateRoot: string;
    readonly sourceCommit: string;
  }): Promise<CandidateManifest>;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function listRelativeFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory);
    for (const entry of entries.sort()) {
      const relative = prefix === "" ? entry : `${prefix}/${entry}`;
      const path = resolve(directory, entry);
      const metadata = await stat(path);
      if (metadata.isDirectory()) await visit(path, relative);
      else files.push(relative);
    }
  };
  await visit(root, "");
  return files.sort();
}
