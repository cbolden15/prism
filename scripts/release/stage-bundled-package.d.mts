export interface StageBundledPackageForPackInput {
  readonly packageRoot: string;
  readonly dependencyRoot: string;
  readonly stagingRoot: string;
}

export function stageBundledPackageForPack(
  input: StageBundledPackageForPackInput,
): Promise<string>;
