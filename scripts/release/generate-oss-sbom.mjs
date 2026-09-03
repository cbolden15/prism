import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OSS_RELEASE_PACKAGES } from "./oss-release-contract.mjs";

export const ALLOWED_RELEASE_LICENSES = Object.freeze([
  "Apache-2.0",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "MIT",
]);

const ALLOWED_LICENSE_SET = new Set(ALLOWED_RELEASE_LICENSES);
const RELEASE_PACKAGE_NAMES = new Set(OSS_RELEASE_PACKAGES.map(({ name }) => name));

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
  );
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

function sortByCanonicalJson(values) {
  values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
}

function normalizeSetLikeArrays(sbom) {
  if (Array.isArray(sbom.documentDescribes)) sbom.documentDescribes.sort();
  if (Array.isArray(sbom.packages)) {
    for (const entry of sbom.packages) {
      if (!isRecord(entry)) fail("spdx-package-invalid");
      for (const key of ["checksums", "externalRefs", "hasFiles", "attributionTexts"]) {
        if (Array.isArray(entry[key])) sortByCanonicalJson(entry[key]);
      }
    }
    sbom.packages.sort((left, right) => {
      const leftId = typeof left.SPDXID === "string" ? left.SPDXID : "";
      const rightId = typeof right.SPDXID === "string" ? right.SPDXID : "";
      return leftId.localeCompare(rightId, "en");
    });
  }
  if (Array.isArray(sbom.relationships)) sortByCanonicalJson(sbom.relationships);
  if (Array.isArray(sbom.files)) sortByCanonicalJson(sbom.files);
  if (Array.isArray(sbom.externalDocumentRefs)) sortByCanonicalJson(sbom.externalDocumentRefs);
  if (Array.isArray(sbom.creationInfo.creators)) sbom.creationInfo.creators.sort();
}

function selectedLicense(entry) {
  if (
    typeof entry.licenseConcluded === "string"
    && entry.licenseConcluded !== "NOASSERTION"
    && entry.licenseConcluded !== "NONE"
  ) return entry.licenseConcluded;
  return entry.licenseDeclared;
}

export function assertAllowedDependencyLicenses(sbom) {
  if (!isRecord(sbom) || !Array.isArray(sbom.packages) || sbom.packages.length === 0) {
    fail("spdx-packages-invalid");
  }
  for (const entry of sbom.packages) {
    if (!isRecord(entry)) fail("spdx-package-invalid");
    const license = selectedLicense(entry);
    if (typeof license !== "string" || !ALLOWED_LICENSE_SET.has(license)) {
      const name = typeof entry.name === "string" ? entry.name : "unknown";
      const version = typeof entry.versionInfo === "string" ? entry.versionInfo : "unknown";
      const reported = typeof license === "string" ? license : "NOASSERTION";
      fail(`dependency-license-refused:${name}@${version}:${reported}`);
    }
  }
}

export function createDependencyLicenseReport(sbom) {
  assertAllowedDependencyLicenses(sbom);
  const packages = sbom.packages.map((entry) => {
    const license = selectedLicense(entry);
    if (
      typeof entry.name !== "string"
      || typeof entry.versionInfo !== "string"
      || typeof entry.SPDXID !== "string"
      || typeof license !== "string"
    ) fail("spdx-package-invalid");
    return {
      name: entry.name,
      version: entry.versionInfo,
      license,
      spdxId: entry.SPDXID,
    };
  });
  packages.sort((left, right) => {
    const leftKey = `${left.name}\0${left.version}\0${left.spdxId}`;
    const rightKey = `${right.name}\0${right.version}\0${right.spdxId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return canonicalJson({
    version: "prism-oss-license-report-v1",
    scope: "full-installed-dependency-graph-including-dev-build",
    allowedLicenses: ALLOWED_RELEASE_LICENSES,
    packages,
  });
}

export function createReleaseSetSpdx(input) {
  if (!isRecord(input)
    || !Array.isArray(input.packages)
    || !Array.isArray(input.relationships)
    || !Array.isArray(input.documentDescribes)
    || input.documentDescribes.some((entry) => typeof entry !== "string")) {
    fail("release-spdx-document-invalid");
  }
  const sbom = JSON.parse(JSON.stringify(input));
  for (const entry of sbom.packages) {
    if (!isRecord(entry) || typeof entry.SPDXID !== "string" || typeof entry.name !== "string") {
      fail("release-spdx-package-invalid");
    }
    if (entry.name.startsWith("@useprism/") && !RELEASE_PACKAGE_NAMES.has(entry.name)) {
      fail(`release-spdx-package-refused:${entry.name}`);
    }
  }
  const releaseEntries = OSS_RELEASE_PACKAGES.map((expected) => {
    const matches = sbom.packages.filter((entry) => (
      entry.name === expected.name && entry.versionInfo === expected.version
    ));
    if (matches.length !== 1) fail(`release-spdx-package-mismatch:${expected.name}`);
    return matches[0];
  });
  const releaseIds = releaseEntries.map(({ SPDXID }) => SPDXID);
  const releaseIdSet = new Set(releaseIds);
  const rootIds = new Set(sbom.documentDescribes.filter((id) => !releaseIdSet.has(id)));
  for (const rootId of rootIds) {
    if (!sbom.packages.some(({ SPDXID }) => SPDXID === rootId)) {
      fail("release-spdx-document-invalid");
    }
  }
  sbom.packages = sbom.packages.filter(({ SPDXID }) => !rootIds.has(SPDXID));
  sbom.relationships = sbom.relationships.filter((entry) => {
    if (!isRecord(entry)
      || typeof entry.spdxElementId !== "string"
      || typeof entry.relatedSpdxElement !== "string"
      || typeof entry.relationshipType !== "string") fail("release-spdx-relationship-invalid");
    return entry.relationshipType !== "DESCRIBES"
      && !rootIds.has(entry.spdxElementId)
      && !rootIds.has(entry.relatedSpdxElement);
  });
  sbom.documentDescribes = releaseIds;
  sbom.relationships.push(...releaseIds.map((relatedSpdxElement) => ({
    spdxElementId: "SPDXRef-DOCUMENT",
    relationshipType: "DESCRIBES",
    relatedSpdxElement,
  })));
  sbom.name = `prism-oss-release-set@${OSS_RELEASE_PACKAGES[0].version}`;
  return sbom;
}

export function normalizeSpdxSbom(input, options) {
  if (
    !isRecord(input)
    || input.spdxVersion !== "SPDX-2.3"
    || input.dataLicense !== "CC0-1.0"
    || !isRecord(input.creationInfo)
    || !Array.isArray(input.packages)
  ) fail("spdx-document-invalid");
  let created;
  try {
    created = new Date(options.created).toISOString();
  } catch {
    fail("spdx-created-invalid");
  }
  if (created === "Invalid Date") fail("spdx-created-invalid");
  let namespace;
  try {
    namespace = new URL(options.namespace).href;
  } catch {
    fail("spdx-namespace-invalid");
  }
  if (namespace !== options.namespace) fail("spdx-namespace-invalid");

  const sbom = JSON.parse(JSON.stringify(input));
  sbom.documentNamespace = namespace;
  sbom.creationInfo.created = created;
  normalizeSetLikeArrays(sbom);
  return canonicalJson(sbom);
}

function defaultRunNpm(arguments_, options) {
  return spawnSync("npm", arguments_, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function generateFullDependencySbom(input) {
  const root = resolve(input.repositoryRoot);
  const runNpm = input.runNpm ?? defaultRunNpm;
  const versionResult = runNpm(["--version"], { cwd: root });
  if (versionResult?.error || versionResult?.status !== 0 || versionResult.stdout.trim() !== "11.19.0") {
    fail("npm-version-mismatch");
  }
  const fullResult = runNpm([
    "sbom",
    "--sbom-format",
    "spdx",
    "--sbom-type",
    "application",
    "--include",
    "dev",
    "--include",
    "optional",
    "--include",
    "peer",
  ], { cwd: root });
  if (fullResult?.error || fullResult?.status !== 0) fail("npm-sbom-failed");
  let fullSbom;
  try {
    fullSbom = JSON.parse(fullResult.stdout);
  } catch {
    fail("npm-sbom-invalid");
  }
  assertAllowedDependencyLicenses(fullSbom);
  const licenseReport = createDependencyLicenseReport(fullSbom);

  const releaseResult = runNpm([
    "sbom",
    "--sbom-format",
    "spdx",
    "--sbom-type",
    "application",
    ...OSS_RELEASE_PACKAGES.flatMap(({ name }) => [
      "--workspace",
      `packages/${name.slice("@useprism/".length)}`,
    ]),
    "--omit",
    "dev",
  ], { cwd: root });
  if (releaseResult?.error || releaseResult?.status !== 0) fail("npm-release-sbom-failed");
  let releaseSbom;
  try {
    releaseSbom = JSON.parse(releaseResult.stdout);
  } catch {
    fail("npm-release-sbom-invalid");
  }
  const normalized = normalizeSpdxSbom(createReleaseSetSpdx(releaseSbom), {
    created: input.created,
    namespace: input.namespace,
  });
  const output = resolve(input.outputPath);
  const licenseOutput = resolve(input.licenseReportPath);
  await Promise.all([
    mkdir(dirname(output), { recursive: true, mode: 0o700 }),
    mkdir(dirname(licenseOutput), { recursive: true, mode: 0o700 }),
  ]);
  await Promise.all([
    writeFile(output, normalized, { encoding: "utf8", mode: 0o600 }),
    writeFile(licenseOutput, licenseReport, { encoding: "utf8", mode: 0o600 }),
  ]);
  return Object.freeze({ sbomPath: output, licenseReportPath: licenseOutput });
}

function parseArguments(arguments_) {
  const allowed = new Set(["--root", "--output", "--license-report", "--created", "--namespace"]);
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
    repositoryRoot: values.get("--root"),
    outputPath: values.get("--output"),
    licenseReportPath: values.get("--license-report"),
    created: values.get("--created"),
    namespace: values.get("--namespace"),
  };
}

async function main() {
  const output = await generateFullDependencySbom(parseArguments(process.argv.slice(2)));
  process.stdout.write(`Prism OSS dependency SBOM: ${output.sbomPath}\n`);
  process.stdout.write(`Prism OSS license report: ${output.licenseReportPath}\n`);
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Prism OSS dependency gate failed: ${error instanceof Error ? error.message : "sbom-failed"}\n`);
    process.exitCode = 1;
  });
}
