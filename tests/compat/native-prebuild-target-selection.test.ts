import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  parseBuildArguments,
  targetsForFamily,
} from "../../packages/cli/native/prebuild-contract.mjs";

test("native prebuild rebuild modes select only their bounded target family", () => {
  const outputRoot = resolve(".native-prebuild-test-output");

  assert.deepEqual(targetsForFamily("darwin"), ["darwin-arm64", "darwin-x64"]);
  assert.deepEqual(targetsForFamily("linux"), [
    "linux-arm64-gnu",
    "linux-arm64-musl",
    "linux-x64-gnu",
    "linux-x64-musl",
  ]);
  assert.deepEqual(parseBuildArguments([
    "--family",
    "darwin",
    "--output-root",
    outputRoot,
  ]), { family: "darwin", outputRoot });
  assert.throws(
    () => parseBuildArguments(["--family", "windows", "--output-root", outputRoot]),
    /native-prebuild-family-invalid/u,
  );
  assert.throws(
    () => parseBuildArguments(["--family", "linux", "--target", "linux-x64-gnu"]),
    /native-prebuild-argument-invalid/u,
  );
});
