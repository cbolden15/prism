import type { PrebuildFamily } from "./prebuild-contract.mjs";

export function comparePrebuilds(input: {
  family: PrebuildFamily;
  committedRoot: string;
  rebuiltRoot: string;
}): Promise<void>;
