import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { OSS_RELEASE_PACKAGES } from "../../scripts/release/oss-release-contract.mjs";
import {
  NPM_ATTESTATION_MAX_RESPONSE_BYTES,
  NPM_ATTESTATION_TIMEOUT_MS,
  NPM_BUNDLED_SIGSTORE_VERSION,
  NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI,
  NPM_PROVENANCE_CERTIFICATE_ISSUER,
  NPM_PROVENANCE_VERIFICATION_POLICY,
  NPM_PUBLIC_REGISTRY,
  NPM_SIGSTORE_RETRIES,
  NPM_SIGSTORE_TIMEOUT_MS,
  buildRegistryInstallArguments,
  buildRegistrySignatureAuditArguments,
  loadNpmBundledProvenanceVerifier,
  verifyRegistryPackageMetadata,
  type RegistryAttestationRequest,
  type RegistryAttestationResponse,
  type RegistryProvenanceVerifier,
  type RegistryProvenanceVerificationPolicy,
} from "../../scripts/release/smoke-oss-registry.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const VERSION = "0.1.0";
const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";
const GITHUB_ACTIONS_BUILD_TYPE = "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const REPOSITORY = "https://github.com/cbolden15/prism";
const WORKFLOW_PATH = ".github/workflows/release.yml";
const MAIN_REF = "refs/heads/main";
const FIRST_PACKAGE = OSS_RELEASE_PACKAGES[0]!;
const ACCEPT_PROVENANCE: RegistryProvenanceVerifier = async () => undefined;

async function candidateFixture(context: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-oss-registry-metadata-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "packages"));
  const packages = [];
  const integrityByName = new Map<string, string>();
  for (const entry of OSS_RELEASE_PACKAGES) {
    const bytes = Buffer.from(`candidate:${entry.name}\n`, "utf8");
    await writeFile(resolve(root, "packages", entry.file), bytes);
    packages.push({ ...entry, sha256: createHash("sha256").update(bytes).digest("hex") });
    integrityByName.set(entry.name, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
  }
  return { root, packages, integrityByName };
}

async function npmGlobalFixture(
  context: TestContext,
  input: {
    readonly npmVersion?: string;
    readonly sigstoreVersion?: string;
    readonly externalSigstore?: boolean;
  } = {},
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-npm-global-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const npmRoot = join(root, "npm");
  const nodeModules = join(npmRoot, "node_modules");
  await mkdir(nodeModules, { recursive: true });
  await writeFile(join(npmRoot, "package.json"), JSON.stringify({
    name: "npm",
    version: input.npmVersion ?? "11.19.0",
  }));

  let sigstoreRoot = join(nodeModules, "sigstore");
  if (input.externalSigstore === true) {
    sigstoreRoot = await realpath(await mkdtemp(join(tmpdir(), "prism-external-sigstore-")));
    context.after(() => rm(sigstoreRoot, { recursive: true, force: true }));
  } else {
    await mkdir(sigstoreRoot);
  }
  await writeFile(join(sigstoreRoot, "package.json"), JSON.stringify({
    name: "sigstore",
    version: input.sigstoreVersion ?? NPM_BUNDLED_SIGSTORE_VERSION,
    main: "index.cjs",
  }));
  await writeFile(join(sigstoreRoot, "index.cjs"), "module.exports = { verify: async () => undefined };\n");
  if (input.externalSigstore === true) await symlink(sigstoreRoot, join(nodeModules, "sigstore"));
  return root;
}

function attestationUrl(name: string, version = VERSION): string {
  const [scope, packageName] = name.split("/");
  if (scope === undefined || packageName === undefined || !scope.startsWith("@")) {
    throw new TypeError("test package must be scoped");
  }
  return `${NPM_PUBLIC_REGISTRY}/-/npm/v1/attestations/${scope}%2f${packageName}@${version}`;
}

function packagePurl(name: string, version = VERSION): string {
  const [scope, packageName] = name.split("/");
  if (scope === undefined || packageName === undefined || !scope.startsWith("@")) {
    throw new TypeError("test package must be scoped");
  }
  return `pkg:npm/%40${scope.slice(1)}/${packageName}@${version}`;
}

function provenanceBody(input: {
  readonly name: string;
  readonly integrity: string;
  readonly repository?: string;
  readonly workflowPath?: string;
  readonly ref?: string;
  readonly sourceCommit?: string;
  readonly subjectName?: string;
  readonly subjectSha512?: string;
  readonly encodedPayload?: string;
}): string {
  const repository = input.repository ?? REPOSITORY;
  const workflowPath = input.workflowPath ?? WORKFLOW_PATH;
  const ref = input.ref ?? MAIN_REF;
  const sourceCommit = input.sourceCommit ?? SOURCE_COMMIT;
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{
      name: input.subjectName ?? packagePurl(input.name),
      digest: {
        sha512: input.subjectSha512
          ?? Buffer.from(input.integrity.slice("sha512-".length), "base64").toString("hex"),
      },
    }],
    predicateType: SLSA_PROVENANCE_V1,
    predicate: {
      buildDefinition: {
        buildType: GITHUB_ACTIONS_BUILD_TYPE,
        externalParameters: {
          workflow: { ref, repository, path: workflowPath },
        },
        internalParameters: {
          github: { event_name: "workflow_dispatch", repository_id: "1", repository_owner_id: "2" },
        },
        resolvedDependencies: [{
          uri: `git+${repository}@${ref}`,
          digest: { gitCommit: sourceCommit },
        }],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: `${REPOSITORY}/actions/runs/1/attempts/1` },
      },
    },
  };
  return JSON.stringify({
    attestations: [{
      predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
      bundle: {},
    }, {
      predicateType: SLSA_PROVENANCE_V1,
      bundle: {
        mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        dsseEnvelope: {
          payloadType: "application/vnd.in-toto+json",
          payload: input.encodedPayload ?? Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
          signatures: [{ keyid: "", sig: Buffer.alloc(64, 1).toString("base64") }],
        },
        verificationMaterial: {},
      },
    }],
  });
}

function provenanceResponse(
  request: RegistryAttestationRequest,
  input: Parameters<typeof provenanceBody>[0],
): RegistryAttestationResponse {
  return {
    status: 200,
    url: request.url,
    redirected: false,
    contentType: "application/json",
    body: provenanceBody(input),
  };
}

function runRegistryMetadata(
  integrityByName: ReadonlyMap<string, string>,
  options: {
    readonly metadataUrl?: (name: string) => string;
    readonly includeProvenance?: boolean;
    readonly next?: string;
  } = {},
) {
  return (arguments_: readonly string[]) => {
    if (arguments_[3] === "dist-tags") {
      return { status: 0, stdout: JSON.stringify({ next: options.next ?? VERSION }), stderr: "" };
    }
    const specification = arguments_[2] as string;
    const name = specification.slice(0, specification.lastIndexOf("@"));
    return {
      status: 0,
      stdout: JSON.stringify({
        integrity: integrityByName.get(name),
        ...(options.includeProvenance === false ? {} : {
          attestations: {
            url: options.metadataUrl?.(name) ?? attestationUrl(name),
            provenance: { predicateType: SLSA_PROVENANCE_V1 },
          },
        }),
      }),
      stderr: "",
    };
  };
}

test("constructs one exact registry install for the closed 0.1.0 package set", () => {
  const arguments_ = buildRegistryInstallArguments(VERSION);
  assert.deepEqual(arguments_, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=true",
    "--registry",
    NPM_PUBLIC_REGISTRY,
    "@useprism/sdk@0.1.0",
    "@useprism/runtime@0.1.0",
    "@useprism/provider-ollama@0.1.0",
    "@useprism/cli@0.1.0",
  ]);
  assert.equal(arguments_.some((value) => value.includes("provider-codex")), false);
  assert.deepEqual(buildRegistrySignatureAuditArguments(), [
    "audit",
    "signatures",
    "--registry",
    NPM_PUBLIC_REGISTRY,
  ]);
});

test("binds all four packages to exact npm SLSA GitHub release provenance", async (context) => {
  const fixture = await candidateFixture(context);
  const npmCalls: string[][] = [];
  const fetchRequests: RegistryAttestationRequest[] = [];
  const verificationCalls: Array<{
    readonly bundle: Readonly<Record<string, unknown>>;
    readonly policy: Readonly<RegistryProvenanceVerificationPolicy>;
  }> = [];
  await verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    runNpm(arguments_: readonly string[]) {
      npmCalls.push([...arguments_]);
      return runRegistryMetadata(fixture.integrityByName)(arguments_);
    },
    async fetchAttestations(request) {
      fetchRequests.push(request);
      const entry = OSS_RELEASE_PACKAGES.find(({ name }) => attestationUrl(name) === request.url);
      assert.ok(entry);
      return provenanceResponse(request, {
        name: entry.name,
        integrity: fixture.integrityByName.get(entry.name) as string,
      });
    },
    async verifyProvenanceBundle(bundle, policy) {
      verificationCalls.push({ bundle, policy });
    },
    wait: async () => undefined,
  });
  assert.deepEqual(npmCalls, OSS_RELEASE_PACKAGES.flatMap(({ name }) => [[
    "view", "--json", `${name}@${VERSION}`, "dist", "--registry", NPM_PUBLIC_REGISTRY,
  ], [
    "view", "--json", name, "dist-tags", "--registry", NPM_PUBLIC_REGISTRY,
  ]]));
  assert.deepEqual(fetchRequests, OSS_RELEASE_PACKAGES.map(({ name }) => ({
    url: attestationUrl(name),
    timeoutMs: NPM_ATTESTATION_TIMEOUT_MS,
    maxBytes: NPM_ATTESTATION_MAX_RESPONSE_BYTES,
  })));
  assert.equal(verificationCalls.length, OSS_RELEASE_PACKAGES.length);
  for (const { bundle, policy } of verificationCalls) {
    assert.equal(typeof bundle.dsseEnvelope, "object");
    assert.equal(policy, NPM_PROVENANCE_VERIFICATION_POLICY);
    assert.deepEqual(policy, {
      certificateIdentityURI: NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI,
      certificateIssuer: NPM_PROVENANCE_CERTIFICATE_ISSUER,
      retry: { retries: NPM_SIGSTORE_RETRIES },
      timeout: NPM_SIGSTORE_TIMEOUT_MS,
    });
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(Object.isFrozen(policy.retry), true);
  }
});

test("rejects a cryptographically invalid bundle with self-declared expected provenance", async (context) => {
  const fixture = await candidateFixture(context);
  let verificationCalls = 0;
  await assert.rejects(verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    attempts: 1,
    runNpm: runRegistryMetadata(fixture.integrityByName),
    async fetchAttestations(request) {
      return provenanceResponse(request, {
        name: FIRST_PACKAGE.name,
        integrity: fixture.integrityByName.get(FIRST_PACKAGE.name) as string,
      });
    },
    async verifyProvenanceBundle(_bundle, policy) {
      verificationCalls += 1;
      assert.equal(policy, NPM_PROVENANCE_VERIFICATION_POLICY);
      throw new Error("cryptographic-rejection");
    },
    wait: async () => undefined,
  }), /registry-provenance-signature-invalid:@useprism\/sdk/u);
  assert.equal(verificationCalls, 1);
});

test("loads only npm 11.19.0 bundled sigstore 4.1.1 and fails closed on loader drift", async (context) => {
  const exactRoot = await npmGlobalFixture(context);
  const rootCalls: string[][] = [];
  const verifier = await loadNpmBundledProvenanceVerifier({
    runNpmRoot(arguments_) {
      rootCalls.push([...arguments_]);
      return { status: 0, stdout: `${exactRoot}\n`, stderr: "" };
    },
  });
  assert.equal(typeof verifier, "function");
  assert.deepEqual(rootCalls, [["root", "--global"]]);

  await assert.rejects(loadNpmBundledProvenanceVerifier({
    runNpmRoot: () => ({ status: 1, stdout: "", stderr: "failed" }),
  }), /registry-provenance-verifier-tooling-failed/u);

  const wrongNpmRoot = await npmGlobalFixture(context, { npmVersion: "11.18.0" });
  await assert.rejects(loadNpmBundledProvenanceVerifier({
    runNpmRoot: () => ({ status: 0, stdout: `${wrongNpmRoot}\n`, stderr: "" }),
  }), /registry-provenance-verifier-npm-version-invalid/u);

  const wrongSigstoreRoot = await npmGlobalFixture(context, { sigstoreVersion: "4.1.0" });
  await assert.rejects(loadNpmBundledProvenanceVerifier({
    runNpmRoot: () => ({ status: 0, stdout: `${wrongSigstoreRoot}\n`, stderr: "" }),
  }), /registry-provenance-verifier-sigstore-version-invalid/u);

  const escapedSigstoreRoot = await npmGlobalFixture(context, { externalSigstore: true });
  await assert.rejects(loadNpmBundledProvenanceVerifier({
    runNpmRoot: () => ({ status: 0, stdout: `${escapedSigstoreRoot}\n`, stderr: "" }),
  }), /registry-provenance-verifier-path-invalid/u);

  const fixture = await candidateFixture(context);
  await assert.rejects(verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    attempts: 1,
    runNpm: runRegistryMetadata(fixture.integrityByName),
    async fetchAttestations(request) {
      return provenanceResponse(request, {
        name: FIRST_PACKAGE.name,
        integrity: fixture.integrityByName.get(FIRST_PACKAGE.name) as string,
      });
    },
    loadProvenanceVerifier: async () => {
      throw new Error("loader-failed");
    },
    wait: async () => undefined,
  }), /registry-provenance-verifier-unavailable:@useprism\/sdk/u);
});

test("rejects wrong repository, workflow, ref, and source commit identities", async (context) => {
  const fixture = await candidateFixture(context);
  const cases = [
    { repository: "https://github.com/example/prism" },
    { workflowPath: ".github/workflows/other.yml" },
    { ref: "refs/tags/v0.1.0" },
    { sourceCommit: "b".repeat(40) },
  ];
  for (const change of cases) {
    await assert.rejects(verifyRegistryPackageMetadata({
      candidateRoot: fixture.root,
      packages: fixture.packages,
      sourceCommit: SOURCE_COMMIT,
      attempts: 1,
      runNpm: runRegistryMetadata(fixture.integrityByName),
      verifyProvenanceBundle: ACCEPT_PROVENANCE,
      async fetchAttestations(request) {
        const name = OSS_RELEASE_PACKAGES.find(({ name: candidate }) => attestationUrl(candidate) === request.url)?.name;
        assert.ok(name);
        return provenanceResponse(request, {
          name,
          integrity: fixture.integrityByName.get(name) as string,
          ...change,
        });
      },
      wait: async () => undefined,
    }), /registry-provenance-identity-mismatch:@useprism\/sdk/u);
  }
});

test("rejects a wrong package subject or tarball digest", async (context) => {
  const fixture = await candidateFixture(context);
  for (const change of [
    { subjectName: "pkg:npm/%40useprism/other@0.1.0" },
    { subjectSha512: "0".repeat(128) },
  ]) {
    await assert.rejects(verifyRegistryPackageMetadata({
      candidateRoot: fixture.root,
      packages: fixture.packages,
      sourceCommit: SOURCE_COMMIT,
      attempts: 1,
      runNpm: runRegistryMetadata(fixture.integrityByName),
      verifyProvenanceBundle: ACCEPT_PROVENANCE,
      async fetchAttestations(request) {
        const name = FIRST_PACKAGE.name;
        return provenanceResponse(request, {
          name,
          integrity: fixture.integrityByName.get(name) as string,
          ...change,
        });
      },
      wait: async () => undefined,
    }), /registry-provenance-identity-mismatch:@useprism\/sdk/u);
  }
});

test("rejects malformed and unbounded registry attestation payloads", async (context) => {
  const fixture = await candidateFixture(context);
  const firstName = FIRST_PACKAGE.name;
  const validInput = {
    name: firstName,
    integrity: fixture.integrityByName.get(firstName) as string,
  };
  const responses: Array<{ readonly body: string; readonly error: RegExp }> = [{
    body: "{not-json",
    error: /registry-provenance-payload-invalid:@useprism\/sdk/u,
  }, {
    body: "x".repeat(NPM_ATTESTATION_MAX_RESPONSE_BYTES + 1),
    error: /registry-provenance-payload-too-large:@useprism\/sdk/u,
  }, {
    body: provenanceBody({ ...validInput, encodedPayload: Buffer.alloc(70 * 1024).toString("base64") }),
    error: /registry-provenance-payload-too-large:@useprism\/sdk/u,
  }];
  for (const response of responses) {
    await assert.rejects(verifyRegistryPackageMetadata({
      candidateRoot: fixture.root,
      packages: fixture.packages,
      sourceCommit: SOURCE_COMMIT,
      attempts: 1,
      runNpm: runRegistryMetadata(fixture.integrityByName),
      verifyProvenanceBundle: ACCEPT_PROVENANCE,
      fetchAttestations: async (request) => ({
        status: 200,
        url: request.url,
        redirected: false,
        contentType: "application/json",
        body: response.body,
      }),
      wait: async () => undefined,
    }), response.error);
  }
});

test("rejects attestation metadata and response redirect, host, or path drift", async (context) => {
  const fixture = await candidateFixture(context);
  for (const metadataUrl of [
    () => "https://example.com/-/npm/v1/attestations/@useprism%2fsdk@0.1.0",
    () => `${NPM_PUBLIC_REGISTRY}/-/npm/v1/attestations/@useprism%2fsdk@0.1.0/other`,
  ]) {
    let fetched = false;
    await assert.rejects(verifyRegistryPackageMetadata({
      candidateRoot: fixture.root,
      packages: fixture.packages,
      sourceCommit: SOURCE_COMMIT,
      attempts: 1,
      runNpm: runRegistryMetadata(fixture.integrityByName, { metadataUrl }),
      verifyProvenanceBundle: ACCEPT_PROVENANCE,
      fetchAttestations: async () => {
        fetched = true;
        throw new Error("must-not-fetch");
      },
      wait: async () => undefined,
    }), /registry-provenance-url-invalid:@useprism\/sdk/u);
    assert.equal(fetched, false);
  }

  const drifts = [
    { redirected: true },
    { url: "https://example.com/-/npm/v1/attestations/@useprism%2fsdk@0.1.0" },
    { url: `${NPM_PUBLIC_REGISTRY}/-/npm/v1/attestations/@useprism%2fsdk@0.1.0/other` },
  ];
  for (const drift of drifts) {
    await assert.rejects(verifyRegistryPackageMetadata({
      candidateRoot: fixture.root,
      packages: fixture.packages,
      sourceCommit: SOURCE_COMMIT,
      attempts: 1,
      runNpm: runRegistryMetadata(fixture.integrityByName),
      verifyProvenanceBundle: ACCEPT_PROVENANCE,
      async fetchAttestations(request) {
        const response = provenanceResponse(request, {
          name: FIRST_PACKAGE.name,
          integrity: fixture.integrityByName.get(FIRST_PACKAGE.name) as string,
        });
        return { ...response, ...drift };
      },
      wait: async () => undefined,
    }), /registry-provenance-response-invalid:@useprism\/sdk/u);
  }
});

test("fails closed when registry provenance is absent", async (context) => {
  const fixture = await candidateFixture(context);
  await assert.rejects(verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    runNpm: runRegistryMetadata(fixture.integrityByName, { includeProvenance: false }),
    verifyProvenanceBundle: ACCEPT_PROVENANCE,
    fetchAttestations: async () => { throw new Error("must-not-fetch"); },
    wait: async () => undefined,
    attempts: 1,
  }), /registry-provenance-missing:@useprism\/sdk/u);

  await assert.rejects(verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    runNpm: runRegistryMetadata(fixture.integrityByName),
    verifyProvenanceBundle: ACCEPT_PROVENANCE,
    fetchAttestations: async (request) => ({
      status: 200,
      url: request.url,
      redirected: false,
      contentType: "application/json",
      body: JSON.stringify({ attestations: [{
        predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
        bundle: {},
      }] }),
    }),
    wait: async () => undefined,
    attempts: 1,
  }), /registry-provenance-missing:@useprism\/sdk/u);
});

test("fails closed before release creation when the next tag is not the exact version", async (context) => {
  const fixture = await candidateFixture(context);
  await assert.rejects(verifyRegistryPackageMetadata({
    candidateRoot: fixture.root,
    packages: fixture.packages,
    sourceCommit: SOURCE_COMMIT,
    attempts: 1,
    runNpm: runRegistryMetadata(fixture.integrityByName, { next: "0.1.1" }),
    verifyProvenanceBundle: ACCEPT_PROVENANCE,
    async fetchAttestations(request) {
      return provenanceResponse(request, {
        name: FIRST_PACKAGE.name,
        integrity: fixture.integrityByName.get(FIRST_PACKAGE.name) as string,
      });
    },
    wait: async () => undefined,
  }), /registry-next-tag-mismatch:@useprism\/sdk/u);
});

test("refuses every registry smoke version except 0.1.0", () => {
  for (const version of ["0.1.1", "latest", "^0.1.0", "0.1.0-beta.1"]) {
    assert.throws(() => buildRegistryInstallArguments(version), /release-version-refused/u);
  }
});
