import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDeveloperPreviewCandidate } from "./developer-preview-contract.mjs";
import {
  OSS_RELEASE_PACKAGES,
  OSS_RELEASE_VERSION,
} from "./oss-release-contract.mjs";
import { readCandidateTarballs } from "./publish-oss-release.mjs";

export const NPM_PUBLIC_REGISTRY = "https://registry.npmjs.org";
export const NPM_ATTESTATION_MAX_RESPONSE_BYTES = 256 * 1024;
export const NPM_ATTESTATION_TIMEOUT_MS = 10_000;
export const NPM_BUNDLED_SIGSTORE_VERSION = "4.1.1";
export const NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI = "https://github.com/cbolden15/prism/.github/workflows/release.yml@refs/heads/main";
export const NPM_PROVENANCE_CERTIFICATE_ISSUER = "https://token.actions.githubusercontent.com";
export const NPM_SIGSTORE_TIMEOUT_MS = 5_000;
export const NPM_SIGSTORE_RETRIES = 1;
export const NPM_PROVENANCE_VERIFICATION_POLICY = Object.freeze({
  certificateIdentityURI: NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI,
  certificateIssuer: NPM_PROVENANCE_CERTIFICATE_ISSUER,
  retry: Object.freeze({ retries: NPM_SIGSTORE_RETRIES }),
  timeout: NPM_SIGSTORE_TIMEOUT_MS,
});

const NPM_ATTESTATION_MAX_COUNT = 8;
const NPM_ATTESTATION_MAX_STATEMENT_BYTES = 64 * 1024;
const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";
const IN_TOTO_STATEMENT_V1 = "https://in-toto.io/Statement/v1";
const IN_TOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";
const GITHUB_ACTIONS_BUILD_TYPE = "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const EXPECTED_REPOSITORY = "https://github.com/cbolden15/prism";
const EXPECTED_WORKFLOW_PATH = ".github/workflows/release.yml";
const EXPECTED_REF = "refs/heads/main";
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;

function fail(code) {
  throw new Error(code);
}

export function buildRegistryInstallArguments(version) {
  if (version !== OSS_RELEASE_VERSION) fail("release-version-refused");
  return Object.freeze([
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=true",
    "--registry",
    NPM_PUBLIC_REGISTRY,
    ...OSS_RELEASE_PACKAGES.map(({ name }) => `${name}@${version}`),
  ]);
}

export function buildRegistrySignatureAuditArguments() {
  return Object.freeze([
    "audit",
    "signatures",
    "--registry",
    NPM_PUBLIC_REGISTRY,
  ]);
}

function run(command, arguments_, options) {
  return spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isStrictlyContained(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function manifestVersion(path, errorCode) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(errorCode);
  }
  if (!isRecord(manifest) || typeof manifest.version !== "string") fail(errorCode);
  return manifest.version;
}

export async function loadNpmBundledProvenanceVerifier(input = {}) {
  const rootArguments = Object.freeze(["root", "--global"]);
  const runNpmRoot = input.runNpmRoot
    ?? ((arguments_) => run("npm", arguments_, { cwd: process.cwd() }));
  let rootResult;
  try {
    rootResult = runNpmRoot(rootArguments);
  } catch {
    fail("registry-provenance-verifier-tooling-failed");
  }
  const rootOutput = rootResult?.stdout?.trim();
  if (rootResult?.error || rootResult?.status !== 0 || typeof rootOutput !== "string"
      || rootOutput === "" || rootOutput.includes("\n") || !isAbsolute(rootOutput)) {
    fail("registry-provenance-verifier-tooling-failed");
  }

  let globalRoot;
  let npmRoot;
  let npmManifestPath;
  try {
    globalRoot = await realpath(rootOutput);
    npmRoot = await realpath(join(globalRoot, "npm"));
    npmManifestPath = await realpath(join(npmRoot, "package.json"));
  } catch {
    fail("registry-provenance-verifier-path-invalid");
  }
  if (!isStrictlyContained(globalRoot, npmRoot)
      || npmManifestPath !== join(npmRoot, "package.json")) {
    fail("registry-provenance-verifier-path-invalid");
  }
  if (await manifestVersion(npmManifestPath, "registry-provenance-verifier-npm-version-invalid") !== "11.19.0") {
    fail("registry-provenance-verifier-npm-version-invalid");
  }

  let requireFromNpm;
  let sigstoreRoot;
  let sigstoreManifestPath;
  let sigstoreEntryPath;
  try {
    requireFromNpm = createRequire(npmManifestPath);
    sigstoreRoot = await realpath(join(npmRoot, "node_modules", "sigstore"));
    sigstoreManifestPath = await realpath(requireFromNpm.resolve("sigstore/package.json"));
    sigstoreEntryPath = await realpath(requireFromNpm.resolve("sigstore"));
  } catch {
    fail("registry-provenance-verifier-path-invalid");
  }
  if (!isStrictlyContained(npmRoot, sigstoreRoot)
      || sigstoreManifestPath !== join(sigstoreRoot, "package.json")
      || !isStrictlyContained(sigstoreRoot, sigstoreEntryPath)) {
    fail("registry-provenance-verifier-path-invalid");
  }
  if (await manifestVersion(
    sigstoreManifestPath,
    "registry-provenance-verifier-sigstore-version-invalid",
  ) !== NPM_BUNDLED_SIGSTORE_VERSION) {
    fail("registry-provenance-verifier-sigstore-version-invalid");
  }

  let sigstore;
  try {
    sigstore = requireFromNpm("sigstore");
  } catch {
    fail("registry-provenance-verifier-module-invalid");
  }
  if (!isRecord(sigstore) || typeof sigstore.verify !== "function") {
    fail("registry-provenance-verifier-module-invalid");
  }
  return async (bundle, policy) => {
    await sigstore.verify(bundle, policy);
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return null;
  }
  try {
    const bytes = Buffer.from(value, "base64");
    return bytes.toString("base64") === value ? bytes : null;
  } catch {
    return null;
  }
}

function expectedAttestationUrl(name, version) {
  const segments = name.split("/");
  const registryName = segments.length === 2 && segments[0].startsWith("@")
    ? `${segments[0]}%2f${segments[1]}`
    : encodeURIComponent(name);
  return `${NPM_PUBLIC_REGISTRY}/-/npm/v1/attestations/${registryName}@${version}`;
}

function provenanceMetadataUrl(value, tarball) {
  if (!isRecord(value) || typeof value.url !== "string" || !isRecord(value.provenance)
      || value.provenance.predicateType !== SLSA_PROVENANCE_V1) {
    throw new Error("registry-provenance-missing");
  }
  const expected = expectedAttestationUrl(tarball.name, tarball.version);
  try {
    const url = new URL(value.url);
    if (url.href !== expected || url.origin !== NPM_PUBLIC_REGISTRY || url.username !== ""
        || url.password !== "" || url.port !== "" || url.search !== "" || url.hash !== "") {
      throw new Error("registry-provenance-url-invalid");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "registry-provenance-url-invalid") throw error;
    throw new Error("registry-provenance-url-invalid");
  }
  return expected;
}

async function readBoundedResponse(response, maximumBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > maximumBytes)) {
    throw new Error("registry-provenance-payload-too-large");
  }
  if (response.body === null) return new Uint8Array();
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maximumBytes) throw new Error("registry-provenance-payload-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function fetchRegistryAttestations(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = response.status === 200 && response.redirected === false && response.url === request.url
      ? await readBoundedResponse(response, request.maxBytes)
      : new Uint8Array();
    return Object.freeze({
      status: response.status,
      url: response.url,
      redirected: response.redirected,
      contentType,
      body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function bodyBytes(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return value instanceof Uint8Array ? Buffer.from(value) : null;
}

function expectedPackagePurl(name, version) {
  const segments = name.split("/");
  return segments.length === 2 && segments[0].startsWith("@")
    ? `pkg:npm/%40${encodeURIComponent(segments[0].slice(1))}/${encodeURIComponent(segments[1])}@${version}`
    : `pkg:npm/${encodeURIComponent(name)}@${version}`;
}

function expectedIntegrityHex(integrity) {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) return null;
  const bytes = canonicalBase64(integrity.slice("sha512-".length));
  return bytes?.byteLength === 64 ? bytes.toString("hex") : null;
}

function verifyProvenancePayload(response, expectedUrl, tarball, sourceCommit) {
  if (!isRecord(response) || response.status !== 200 || response.redirected !== false
      || response.url !== expectedUrl || typeof response.contentType !== "string"
      || response.contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new Error("registry-provenance-response-invalid");
  }
  const bytes = bodyBytes(response.body);
  if (bytes === null || bytes.byteLength === 0) throw new Error("registry-provenance-payload-invalid");
  if (bytes.byteLength > NPM_ATTESTATION_MAX_RESPONSE_BYTES) {
    throw new Error("registry-provenance-payload-too-large");
  }
  let document;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("registry-provenance-payload-invalid");
  }
  if (!isRecord(document) || !Array.isArray(document.attestations)
      || document.attestations.length < 1 || document.attestations.length > NPM_ATTESTATION_MAX_COUNT) {
    throw new Error("registry-provenance-payload-invalid");
  }
  const provenance = document.attestations.filter((entry) =>
    isRecord(entry) && entry.predicateType === SLSA_PROVENANCE_V1);
  if (provenance.length !== 1 || !isRecord(provenance[0].bundle)
      || !isRecord(provenance[0].bundle.dsseEnvelope)) {
    throw new Error("registry-provenance-missing");
  }
  const envelope = provenance[0].bundle.dsseEnvelope;
  if (envelope.payloadType !== IN_TOTO_PAYLOAD_TYPE || !Array.isArray(envelope.signatures)
      || envelope.signatures.length !== 1 || !isRecord(envelope.signatures[0])
      || canonicalBase64(envelope.signatures[0].sig) === null) {
    throw new Error("registry-provenance-payload-invalid");
  }
  const statementBytes = canonicalBase64(envelope.payload);
  if (statementBytes === null || statementBytes.byteLength > NPM_ATTESTATION_MAX_STATEMENT_BYTES) {
    throw new Error(statementBytes === null
      ? "registry-provenance-payload-invalid"
      : "registry-provenance-payload-too-large");
  }
  let statement;
  try {
    statement = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(statementBytes));
  } catch {
    throw new Error("registry-provenance-payload-invalid");
  }
  const expectedHex = expectedIntegrityHex(tarball.integrity);
  const subject = Array.isArray(statement?.subject) && statement.subject.length === 1
    ? statement.subject[0]
    : undefined;
  const buildDefinition = statement?.predicate?.buildDefinition;
  const workflow = buildDefinition?.externalParameters?.workflow;
  const dependency = Array.isArray(buildDefinition?.resolvedDependencies)
      && buildDefinition.resolvedDependencies.length === 1
    ? buildDefinition.resolvedDependencies[0]
    : undefined;
  if (statement?._type !== IN_TOTO_STATEMENT_V1 || statement?.predicateType !== SLSA_PROVENANCE_V1
      || subject?.name !== expectedPackagePurl(tarball.name, tarball.version)
      || subject?.digest?.sha512 !== expectedHex
      || buildDefinition?.buildType !== GITHUB_ACTIONS_BUILD_TYPE
      || workflow?.repository !== EXPECTED_REPOSITORY
      || workflow?.path !== EXPECTED_WORKFLOW_PATH
      || workflow?.ref !== EXPECTED_REF
      || dependency?.uri !== `git+${EXPECTED_REPOSITORY}@${EXPECTED_REF}`
      || dependency?.digest?.gitCommit !== sourceCommit) {
    throw new Error("registry-provenance-identity-mismatch");
  }
  return provenance[0].bundle;
}

export async function verifyRegistryPackageMetadata(input) {
  if (!SOURCE_COMMIT.test(input.sourceCommit)) fail("registry-source-commit-invalid");
  const tarballs = await readCandidateTarballs(input.candidateRoot, input.packages);
  const attempts = input.attempts ?? 4;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) fail("registry-attempts-invalid");
  const runNpm = input.runNpm ?? ((arguments_) => run("npm", arguments_, { cwd: process.cwd() }));
  const fetchAttestations = input.fetchAttestations ?? fetchRegistryAttestations;
  const wait = input.wait ?? delay;
  let verifierPromise;
  const loadVerifier = input.loadProvenanceVerifier ?? loadNpmBundledProvenanceVerifier;
  const getVerifier = async () => {
    if (input.verifyProvenanceBundle !== undefined) return input.verifyProvenanceBundle;
    verifierPromise ??= loadVerifier();
    let verifier;
    try {
      verifier = await verifierPromise;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("registry-provenance-verifier-")) {
        throw error;
      }
      throw new Error("registry-provenance-verifier-unavailable");
    }
    if (typeof verifier !== "function") throw new Error("registry-provenance-verifier-unavailable");
    return verifier;
  };
  let pendingFailure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    pendingFailure = undefined;
    for (const tarball of tarballs) {
      const result = runNpm([
        "view",
        "--json",
        `${tarball.name}@${tarball.version}`,
        "dist",
        "--registry",
        NPM_PUBLIC_REGISTRY,
      ]);
      if (result?.error || result?.status !== 0) {
        pendingFailure = `registry-package-unavailable:${tarball.name}`;
        break;
      }
      let dist;
      try {
        dist = JSON.parse(result.stdout);
      } catch {
        pendingFailure = `registry-metadata-invalid:${tarball.name}`;
        break;
      }
      if (typeof dist !== "object" || dist === null || Array.isArray(dist)) {
        pendingFailure = `registry-metadata-invalid:${tarball.name}`;
        break;
      }
      if (typeof dist.integrity === "string" && dist.integrity !== tarball.integrity) {
        fail(`registry-integrity-mismatch:${tarball.name}`);
      }
      if (dist.integrity !== tarball.integrity) {
        pendingFailure = `registry-integrity-missing:${tarball.name}`;
        break;
      }
      let attestationUrl;
      try {
        attestationUrl = provenanceMetadataUrl(dist.attestations, tarball);
        const response = await fetchAttestations(Object.freeze({
          url: attestationUrl,
          timeoutMs: NPM_ATTESTATION_TIMEOUT_MS,
          maxBytes: NPM_ATTESTATION_MAX_RESPONSE_BYTES,
        }));
        const bundle = verifyProvenancePayload(response, attestationUrl, tarball, input.sourceCommit);
        const verifyProvenanceBundle = await getVerifier();
        try {
          await verifyProvenanceBundle(bundle, NPM_PROVENANCE_VERIFICATION_POLICY);
        } catch {
          throw new Error("registry-provenance-signature-invalid");
        }
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith("registry-provenance-")
          ? error.message
          : "registry-provenance-fetch-failed";
        pendingFailure = `${code}:${tarball.name}`;
        break;
      }
      const tagsResult = runNpm([
        "view",
        "--json",
        tarball.name,
        "dist-tags",
        "--registry",
        NPM_PUBLIC_REGISTRY,
      ]);
      if (tagsResult?.error || tagsResult?.status !== 0) {
        pendingFailure = `registry-next-tag-unavailable:${tarball.name}`;
        break;
      }
      let tags;
      try {
        tags = JSON.parse(tagsResult.stdout);
      } catch {
        pendingFailure = `registry-next-tag-invalid:${tarball.name}`;
        break;
      }
      if (typeof tags !== "object" || tags === null || Array.isArray(tags)) {
        pendingFailure = `registry-next-tag-invalid:${tarball.name}`;
        break;
      }
      if (tags.next !== OSS_RELEASE_VERSION) {
        pendingFailure = `registry-next-tag-mismatch:${tarball.name}`;
        break;
      }
    }
    if (pendingFailure === undefined) return;
    if (attempt === attempts) fail(pendingFailure);
    await wait(15_000);
  }
}

async function assertInstalledPackages(root, version) {
  for (const expected of OSS_RELEASE_PACKAGES) {
    const manifestPath = resolve(root, "node_modules", ...expected.name.split("/"), "package.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      fail(`registry-package-missing:${expected.name}`);
    }
    if (manifest.name !== expected.name || manifest.version !== version || manifest.private === true) {
      fail(`registry-package-identity-mismatch:${expected.name}`);
    }
  }
  try {
    await lstat(resolve(root, "node_modules", "@useprism", "provider-codex"));
    fail("registry-package-refused:@useprism/provider-codex");
  } catch (error) {
    if (error instanceof Error && error.message === "registry-package-refused:@useprism/provider-codex") throw error;
    if (typeof error !== "object" || error === null || error.code !== "ENOENT") {
      fail("registry-smoke-filesystem-failed");
    }
  }
}

async function installWithBoundedRetry(root, version, hooks) {
  const arguments_ = buildRegistryInstallArguments(version);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = hooks.runNpm(arguments_, { cwd: root });
    if (!result?.error && result?.status === 0) return;
    if (attempt === 4) fail("registry-install-failed");
    await hooks.wait(15_000);
  }
}

export async function smokeRegistryRelease(input) {
  const version = input.version;
  buildRegistryInstallArguments(version);
  await verifyRegistryPackageMetadata({
    candidateRoot: input.candidateRoot,
    packages: input.packages,
    sourceCommit: input.sourceCommit,
    runNpm: input.runNpm,
    fetchAttestations: input.fetchAttestations,
    verifyProvenanceBundle: input.verifyProvenanceBundle,
    loadProvenanceVerifier: input.loadProvenanceVerifier,
    wait: input.wait,
  });
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-oss-registry-smoke-")));
  await chmod(temporary, 0o700);
  const hooks = {
    runNpm: input.runNpm ?? ((arguments_, options) => run("npm", arguments_, options)),
    runNode: input.runNode ?? ((arguments_, options) => run(process.execPath, arguments_, options)),
    wait: input.wait ?? delay,
  };
  try {
    await writeFile(resolve(temporary, "package.json"), `${JSON.stringify({
      name: "prism-oss-registry-smoke",
      version: "0.0.0",
      private: true,
      type: "module",
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await installWithBoundedRetry(temporary, version, hooks);
    await assertInstalledPackages(temporary, version);

    const auditResult = hooks.runNpm(buildRegistrySignatureAuditArguments(), { cwd: temporary });
    if (auditResult?.error || auditResult?.status !== 0) fail("registry-signature-audit-failed");

    const imports = OSS_RELEASE_PACKAGES
      .filter(({ name }) => name !== "@useprism/cli")
      .map(({ name }) => name);
    const importResult = hooks.runNode([
      "--input-type=module",
      "--eval",
      `await Promise.all(${JSON.stringify(imports)}.map((specifier) => import(specifier)));`,
    ], { cwd: temporary });
    if (importResult?.error || importResult?.status !== 0) fail("registry-import-smoke-failed");

    const cliResult = hooks.runNode([
      resolve(temporary, "node_modules", "@useprism", "cli", "dist", "bin.js"),
    ], { cwd: temporary });
    if (cliResult?.error || cliResult?.status !== 2 || !cliResult.stderr.includes("Usage: prism")) {
      fail("registry-cli-smoke-failed");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(arguments_) {
  const allowed = new Set(["--candidate", "--source-commit", "--version"]);
  if (arguments_.length !== allowed.size * 2) fail("invalid-arguments");
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!allowed.has(key) || values.has(key) || typeof value !== "string" || value === "") {
      fail("invalid-arguments");
    }
    values.set(key, value);
  }
  return {
    candidateRoot: resolve(values.get("--candidate")),
    sourceCommit: values.get("--source-commit"),
    version: values.get("--version"),
  };
}

async function main() {
  if (process.version !== "v26.8.1") fail("node-version-mismatch");
  const input = parseArguments(process.argv.slice(2));
  const npmVersion = run("npm", ["--version"], { cwd: process.cwd() });
  if (npmVersion.error || npmVersion.status !== 0 || npmVersion.stdout.trim() !== "11.19.0") {
    fail("npm-version-mismatch");
  }
  await validateDeveloperPreviewCandidate({
    candidateRoot: input.candidateRoot,
    sourceCommit: input.sourceCommit,
  });
  const manifest = JSON.parse(await readFile(resolve(input.candidateRoot, "candidate.json"), "utf8"));
  await smokeRegistryRelease({
    candidateRoot: input.candidateRoot,
    packages: manifest.packages,
    sourceCommit: input.sourceCommit,
    version: input.version,
  });
  process.stdout.write("Prism OSS registry smoke: ok\n");
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Prism OSS registry smoke failed: ${error instanceof Error ? error.message : "smoke-failed"}\n`);
    process.exitCode = 1;
  });
}
