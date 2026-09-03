import type { CandidatePackage } from "./oss-release-contract.mjs";

export interface NpmCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export interface CandidateTarball extends CandidatePackage {
  readonly path: string;
  readonly integrity: string;
}

export function readCandidateTarballs(
  candidateRoot: string,
  packages: readonly CandidatePackage[],
): Promise<readonly CandidateTarball[]>;

export function publishCandidatePackages(input: {
  readonly candidateRoot: string;
  readonly packages: readonly CandidatePackage[];
  readonly runNpm?: (arguments_: readonly string[]) => NpmCommandResult;
}): Promise<readonly {
  readonly name: string;
  readonly status: "already-published" | "published";
}[]>;
