import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RuntimeArtifactPathOverrides {
  readonly runtimeRoot?: string;
  readonly sdkProtocolPath?: string;
  readonly sdkResourceBoundsPath?: string;
}

export interface RuntimeArtifactPaths {
  readonly runtimeRoot: string;
  readonly sdkProtocolPath: string;
  readonly sdkResourceBoundsPath: string;
}

export function resolveRuntimeArtifactPaths(
  overrides: RuntimeArtifactPathOverrides = {},
): RuntimeArtifactPaths {
  return Object.freeze({
    runtimeRoot: resolve(overrides.runtimeRoot ?? resolve(import.meta.dirname, "..")),
    sdkProtocolPath: resolve(
      overrides.sdkProtocolPath ?? fileURLToPath(import.meta.resolve("@useprism/sdk/protocol")),
    ),
    sdkResourceBoundsPath: resolve(
      overrides.sdkResourceBoundsPath ??
        fileURLToPath(import.meta.resolve("@useprism/sdk/protocol/resource-bounds")),
    ),
  });
}
