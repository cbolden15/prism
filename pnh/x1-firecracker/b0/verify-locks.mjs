#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const b4Root = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(b4Root, "../..");
const hex64 = /^[0-9a-f]{64}$/;
const commit40 = /^[0-9a-f]{40}$/;
const digest = /^sha256:[0-9a-f]{64}$/;

function fail(code) {
  process.stderr.write(`B4-CHECK-FAIL ${code}\n`);
  process.exit(1);
}

function json(relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(b4Root, relativePath), "utf8"));
  } catch {
    fail(`invalid-json:${relativePath}`);
  }
}

function sha256(relativePath) {
  const absolutePath = path.resolve(b4Root, relativePath);
  if (!absolutePath.startsWith(`${b4Root}${path.sep}`)) fail("license-path-escape");
  const metadata = lstatSync(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`unsafe-file:${relativePath}`);
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function sortedUnique(items, key, code) {
  const values = items.map((item) => item[key]);
  if (new Set(values).size !== values.length) fail(`duplicate-${code}`);
  const sorted = [...values].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  if (sorted.some((item, index) => item !== values[index])) fail(`noncanonical-${code}-order`);
}

function verifyLicense(row) {
  if (!row.license || typeof row.license.spdx !== "string" || !Array.isArray(row.license.files) || row.license.files.length === 0) {
    fail(`license-coverage:${row.id}`);
  }
  for (const file of row.license.files) {
    if (!hex64.test(file.sha256) || !String(file.sourceUrl).startsWith("https://")) {
      fail(`license-identity:${row.id}`);
    }
    if (sha256(file.path) !== file.sha256) fail(`license-digest:${row.id}`);
  }
}

function verifyArtifact(row) {
  if (!commit40.test(row.commit) || !String(row.sourceUrl).length || !row.verification?.kind) {
    fail(`immutable-identity:${row.id}`);
  }
  if (row.artifactType === "oci-image") {
    for (const key of ["configDigest", "indexDigest", "manifestDigest"]) {
      if (!digest.test(row[key])) fail(`oci-digest:${row.id}:${key}`);
    }
    if (row.sourceUrl !== `docker.io/library/${row.id === "node-b0-image" ? "node" : "rust"}@${row.manifestDigest}`) {
      fail(`oci-source:${row.id}`);
    }
  } else if (!hex64.test(row.sha256)) {
    fail(`artifact-digest:${row.id}`);
  }
  verifyLicense(row);
}

function verifyCandidate(row) {
  if (!commit40.test(row.commit) || !hex64.test(row.sha256) || !String(row.sourceUrl).startsWith("https://")) {
    fail(`candidate-identity:${row.id}`);
  }
  if (!row.verification?.kind || !String(row.status).startsWith("candidate")) fail(`candidate-status:${row.id}`);
  verifyLicense(row);
}

const toolchain = json("b0/toolchain.lock.json");
const upstream = json("firecracker/upstream.lock.json");
const requiredArtifacts = [
  "cargo-1.98.0",
  "cargo-deny-0.20.2",
  "node-b0-image",
  "rust-b0-image",
  "rust-lld-1.98.0",
  "rust-std-musl-1.98.0",
  "rustc-1.98.0",
  "syft-1.51.1",
  "trivy-0.74.0",
];
if (toolchain.schemaVersion !== 1 || toolchain.target?.triple !== "x86_64-unknown-linux-musl") fail("toolchain-schema");
sortedUnique(toolchain.artifacts, "id", "artifact");
if (JSON.stringify(toolchain.artifacts.map((row) => row.id)) !== JSON.stringify(requiredArtifacts)) fail("artifact-set");
for (const row of toolchain.artifacts) verifyArtifact(row);
const rustStd = toolchain.artifacts.find((row) => row.id === "rust-std-musl-1.98.0");
if (
  rustStd.derivedUncompressedSha256 !== "0ad5385c3f64ec3cdc01bc5d4843a698494b92a44e634f8b69784588885adb53"
  || rustStd.verification.derivation !== "xz --decompress --stdout"
) {
  fail("rust-std-derived-input");
}

if (
  toolchain.cargoClosure?.dependencyCount !== 0
  || toolchain.cargoClosure.lockfileSha256 !== sha256("Cargo.lock")
  || json("vendor/MANIFEST.json").cargoLockSha256 !== toolchain.cargoClosure.lockfileSha256
  || json("vendor/MANIFEST.json").dependencyCount !== 0
) {
  fail("cargo-closure");
}

if (upstream.schemaVersion !== 1 || upstream.selection?.firecracker !== "UNSELECTED_UNTIL_MILESTONE_5") {
  fail("upstream-schema");
}
for (const group of [upstream.buildrootCandidates, upstream.firecrackerCandidates, upstream.kernelCandidates]) {
  sortedUnique(group, "id", "candidate");
  for (const row of group) verifyCandidate(row);
}
if (upstream.firecrackerCandidates.length < 2 || upstream.firecrackerCandidates.some((row) => row.status !== "candidate-not-selected")) {
  fail("firecracker-final-selection");
}
if (upstream.firecrackerCandidates.some((row) => JSON.stringify(row.archiveContains) !== '["firecracker","jailer"]')) {
  fail("jailer-candidate-closure");
}

const config = readFileSync(path.join(b4Root, ".cargo/config.toml"), "utf8");
for (const required of ['target = "x86_64-unknown-linux-musl"', "offline = true", 'linker = "rust-lld"', 'directory = "vendor"']) {
  if (!config.includes(required)) fail("cargo-config");
}
const rustToolchain = readFileSync(path.join(b4Root, "rust-toolchain.toml"), "utf8");
for (const required of ['channel = "1.98.0-x86_64-unknown-linux-gnu"', 'targets = ["x86_64-unknown-linux-musl"]']) {
  if (!rustToolchain.includes(required)) fail("rust-toolchain");
}

const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const expectedScripts = {
  "b4:check": "bash pnh/x1-firecracker/b0/run-profile.sh check",
  "b4:reproduce": "bash pnh/x1-firecracker/b0/run-profile.sh reproduce",
  "b4:scan-public": "bash pnh/x1-firecracker/b0/run-profile.sh scan-public",
  "b4:test:acceptance": "bash pnh/x1-firecracker/b0/run-profile.sh acceptance",
  "b4:test:firecracker": "bash pnh/x1-firecracker/b0/run-profile.sh firecracker",
  "b4:test:qemu": "bash pnh/x1-firecracker/b0/run-profile.sh qemu",
  "b4:test:unit": "bash pnh/x1-firecracker/b0/run-profile.sh unit",
  "b4:verify": "bash pnh/x1-firecracker/b0/run-profile.sh verify",
};
const actualScripts = Object.fromEntries(Object.entries(packageJson.scripts).filter(([key]) => key.startsWith("b4:")));
if (JSON.stringify(actualScripts) !== JSON.stringify(expectedScripts)) fail("package-script-set");

const workflow = readFileSync(path.join(repositoryRoot, ".github/workflows/x1-gate-a.yml"), "utf8");
if ((workflow.match(/x1-gate-a-kvm/g) ?? []).length !== 1 || !/qemu-rehearsal:[\s\S]*runs-on: \[self-hosted, linux, x64, x1-gate-a-kvm\]/.test(workflow)) {
  fail("kvm-runner-label-invariant");
}
for (const lock of [toolchain, upstream]) {
  const serialized = JSON.stringify(lock);
  if (new RegExp(`(?:^|[^a-z])${["late", "st"].join("")}(?:[^a-z]|$)`, "i").test(serialized)) fail("mutable-selector");
}

process.stdout.write("B4-LOCKS-PASS artifacts=9 firecracker_candidates=3 buildroot_candidates=1 kernel_candidates=1\n");
