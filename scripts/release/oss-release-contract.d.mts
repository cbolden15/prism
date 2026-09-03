export interface OssReleasePackage {
  readonly name: string;
  readonly version: "0.1.0";
  readonly file: string;
}

export interface CandidatePackage {
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly sha256: string;
}

export const OSS_RELEASE_VERSION: "0.1.0";
export const OSS_RELEASE_TAG: "v0.1.0";
export const OSS_RELEASE_PACKAGES: readonly OssReleasePackage[];

export function assertReleaseIdentity(input: {
  readonly version: string;
  readonly tag: string;
  readonly ref: string;
}): void;

export function orderCandidatePackages<T extends CandidatePackage>(
  entries: readonly T[],
): readonly T[];
