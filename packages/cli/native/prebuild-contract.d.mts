export type PrebuildFamily = "all" | "darwin" | "linux";
export type PrebuildTarget =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-arm64-gnu"
  | "linux-arm64-musl"
  | "linux-x64-gnu"
  | "linux-x64-musl";

export const nodeVersion: "26.8.1";
export const npmVersion: "11.19.0";
export const targets: readonly PrebuildTarget[];
export const targetConfigurations: Readonly<Record<PrebuildTarget, Readonly<{
  architecture?: string;
  family: "darwin" | "linux";
  platform?: string;
  stage?: string;
  toolchain?: "gnu" | "musl";
}>>>;
export const prebuildProvenance: Readonly<{
  version: string;
  node: string;
  npm: string;
  nodeApi: number;
  sourceDateEpoch: string;
  commonCompilerFlags: readonly string[];
  darwin: Readonly<{
    ciBuildRunner: string;
    targets: Readonly<Record<"darwin-arm64" | "darwin-x64", Readonly<{
      compilerArchitecture: string;
      loadTestRunner: string;
    }>>>;
    xcode: string;
    xcodeBuild: string;
    sdk: string;
    compiler: string;
    linker: string;
    deploymentTarget: string;
    compilerCommand: string;
    stripCommand: string;
    linkerFlags: readonly string[];
  }>;
  linux: Readonly<{
    ciBuildRunner: string;
    targets: Readonly<Record<Exclude<PrebuildTarget, "darwin-arm64" | "darwin-x64">, Readonly<{
      dockerPlatform: string;
      runtimeImage: string;
      toolchain: "gnu" | "musl";
    }>>>;
    images: Readonly<Record<string, string>>;
    gnu: Readonly<{ packages: readonly string[]; compiler: string; linker: string; strip: string }>;
    musl: Readonly<{ packages: readonly string[]; compiler: string; linker: string; strip: string }>;
    linkerFlags: readonly string[];
  }>;
  workflow: Readonly<{ buildx: string; qemuImage: string; buildkitImage: string }>;
}>;

export function serializePrebuildProvenance(): string;
export function targetsForFamily(family: PrebuildFamily | string): PrebuildTarget[];
export function parseBuildArguments(
  arguments_: string[],
  defaultOutputRoot?: string,
): { family: PrebuildFamily; outputRoot: string };
