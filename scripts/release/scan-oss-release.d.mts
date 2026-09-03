import type { CandidatePackage } from "./oss-release-contract.mjs";

export function prepareCandidateScanTree(input: {
  readonly candidateRoot: string;
  readonly outputRoot: string;
  readonly packages: readonly CandidatePackage[];
}): Promise<string>;

export function buildGitleaksCommands(input: {
  readonly repositoryRoot: string;
  readonly candidateScanRoot: string;
  readonly sourceCommit: string;
}): readonly (readonly string[])[];
