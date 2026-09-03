export interface ReleaseBundleFile {
  readonly path: string;
  readonly sha256: string;
}

export interface ReleaseBundleManifest {
  readonly version: "prism-oss-release-bundle-v1";
  readonly sourceCommit: string;
  readonly files: readonly ReleaseBundleFile[];
}

export type CandidateValidator = (input: {
  readonly candidateRoot: string;
  readonly sourceCommit: string;
}) => Promise<unknown>;

export function createReleaseBundle(input: {
  readonly candidateRoot: string;
  readonly sbomPath: string;
  readonly licenseReportPath: string;
  readonly outputPath: string;
  readonly sourceCommit: string;
  readonly validateCandidate?: CandidateValidator;
}): Promise<ReleaseBundleManifest>;

export function verifyReleaseBundle(input: {
  readonly bundleRoot: string;
  readonly sourceCommit: string;
  readonly validateCandidate?: CandidateValidator;
}): Promise<ReleaseBundleManifest>;
