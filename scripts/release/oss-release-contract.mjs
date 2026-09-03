export const OSS_RELEASE_VERSION = "0.1.0";
export const OSS_RELEASE_TAG = `v${OSS_RELEASE_VERSION}`;

export const OSS_RELEASE_PACKAGES = Object.freeze([
  Object.freeze({
    name: "@useprism/sdk",
    version: OSS_RELEASE_VERSION,
    file: "useprism-sdk-0.1.0.tgz",
  }),
  Object.freeze({
    name: "@useprism/runtime",
    version: OSS_RELEASE_VERSION,
    file: "useprism-runtime-0.1.0.tgz",
  }),
  Object.freeze({
    name: "@useprism/provider-ollama",
    version: OSS_RELEASE_VERSION,
    file: "useprism-provider-ollama-0.1.0.tgz",
  }),
  Object.freeze({
    name: "@useprism/cli",
    version: OSS_RELEASE_VERSION,
    file: "useprism-cli-0.1.0.tgz",
  }),
]);

const DIGEST = /^[0-9a-f]{64}$/u;
const RELEASE_PACKAGE_BY_NAME = new Map(OSS_RELEASE_PACKAGES.map((entry) => [entry.name, entry]));

function fail(code) {
  throw new Error(code);
}

export function assertReleaseIdentity(input) {
  if (
    input?.version !== OSS_RELEASE_VERSION
    || input.tag !== OSS_RELEASE_TAG
    || input.ref !== "refs/heads/main"
  ) fail("release-identity-mismatch");
}

export function orderCandidatePackages(entries) {
  if (!Array.isArray(entries)) fail("release-package-set-mismatch");
  const candidateByName = new Map();
  for (const entry of entries) {
    const expected = RELEASE_PACKAGE_BY_NAME.get(entry?.name);
    if (expected === undefined) fail("release-package-refused");
    if (
      entry.version !== expected.version
      || entry.file !== expected.file
      || typeof entry.sha256 !== "string"
      || !DIGEST.test(entry.sha256)
    ) fail("release-package-entry-mismatch");
    candidateByName.set(entry.name, entry);
  }
  if (
    entries.length !== OSS_RELEASE_PACKAGES.length
    || candidateByName.size !== OSS_RELEASE_PACKAGES.length
  ) fail("release-package-set-mismatch");
  return Object.freeze(OSS_RELEASE_PACKAGES.map(({ name }) => candidateByName.get(name)));
}
