import type { NpmCommandResult } from "./publish-oss-release.mjs";

export const ALLOWED_RELEASE_LICENSES: readonly string[];

export function assertAllowedDependencyLicenses(sbom: unknown): void;
export function createDependencyLicenseReport(sbom: unknown): string;

export interface ReleaseSpdxPackage extends Record<string, unknown> {
  readonly SPDXID: string;
  readonly name: string;
  readonly versionInfo?: string;
}

export interface ReleaseSpdxRelationship extends Record<string, unknown> {
  readonly spdxElementId: string;
  readonly relationshipType: string;
  readonly relatedSpdxElement: string;
}

export interface ReleaseSetSpdx extends Record<string, unknown> {
  readonly name: string;
  readonly documentDescribes: readonly string[];
  readonly packages: readonly ReleaseSpdxPackage[];
  readonly relationships: readonly ReleaseSpdxRelationship[];
}

export function createReleaseSetSpdx(input: Record<string, unknown>): ReleaseSetSpdx;

export function normalizeSpdxSbom(
  input: Record<string, unknown>,
  options: { readonly created: string; readonly namespace: string },
): string;

export function generateFullDependencySbom(input: {
  readonly repositoryRoot: string;
  readonly outputPath: string;
  readonly licenseReportPath: string;
  readonly created: string;
  readonly namespace: string;
  readonly runNpm?: (
    arguments_: readonly string[],
    options: { readonly cwd: string },
  ) => NpmCommandResult;
}): Promise<{
  readonly sbomPath: string;
  readonly licenseReportPath: string;
}>;
