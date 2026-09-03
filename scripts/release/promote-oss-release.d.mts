import type { NpmCommandResult } from "./publish-oss-release.mjs";

export function promoteReleaseTags(input: {
  readonly version: string;
  readonly runNpm?: (arguments_: readonly string[]) => NpmCommandResult;
}): readonly {
  readonly name: string;
  readonly status: "already-latest" | "promoted";
}[];
