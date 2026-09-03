import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OSS_RELEASE_PACKAGES,
  assertReleaseIdentity,
  orderCandidatePackages,
} from "../../scripts/release/oss-release-contract.mjs";

const candidatePackages = Object.freeze([
  { name: "@useprism/cli", version: "0.1.0", file: "useprism-cli-0.1.0.tgz", sha256: "a".repeat(64) },
  { name: "@useprism/provider-ollama", version: "0.1.0", file: "useprism-provider-ollama-0.1.0.tgz", sha256: "b".repeat(64) },
  { name: "@useprism/runtime", version: "0.1.0", file: "useprism-runtime-0.1.0.tgz", sha256: "c".repeat(64) },
  { name: "@useprism/sdk", version: "0.1.0", file: "useprism-sdk-0.1.0.tgz", sha256: "d".repeat(64) },
]);

test("closes the OSS package set and returns dependency publish order", () => {
  assert.deepEqual(
    OSS_RELEASE_PACKAGES.map(({ name }) => name),
    [
      "@useprism/sdk",
      "@useprism/runtime",
      "@useprism/provider-ollama",
      "@useprism/cli",
    ],
  );
  assert.deepEqual(
    orderCandidatePackages([...candidatePackages].reverse()).map(({ name }) => name),
    OSS_RELEASE_PACKAGES.map(({ name }) => name),
  );

  assert.throws(
    () => orderCandidatePackages(candidatePackages.slice(1)),
    /release-package-set-mismatch/u,
  );
  assert.throws(
    () => orderCandidatePackages([...candidatePackages, candidatePackages[0]!]),
    /release-package-set-mismatch/u,
  );
});

test("refuses provider-codex and any unreviewed package", () => {
  for (const name of ["@useprism/provider-codex", "@useprism/extra"]) {
    assert.throws(
      () => orderCandidatePackages([...candidatePackages.slice(0, -1), {
        ...candidatePackages.at(-1)!,
        name,
      }]),
      /release-package-refused/u,
    );
  }
});

test("accepts only exact 0.1.0 coordinates dispatched from protected main", () => {
  assert.doesNotThrow(() => assertReleaseIdentity({
    version: "0.1.0",
    tag: "v0.1.0",
    ref: "refs/heads/main",
  }));

  for (const input of [
    { version: "0.1.1", tag: "v0.1.1", ref: "refs/tags/v0.1.1" },
    { version: "0.1.0", tag: "latest", ref: "refs/heads/main" },
    { version: "0.1.0", tag: "v0.1.0", ref: "refs/tags/v0.1.0" },
  ]) {
    assert.throws(() => assertReleaseIdentity(input), /release-identity-mismatch/u);
  }
});
