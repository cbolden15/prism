import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serializePrebuildProvenance, targets } from "./prebuild-contract.mjs";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(nativeDirectory, "..");
const defaultPrebuildsDirectory = join(cliRoot, "prebuilds");
const forbiddenBuildPathPrefixes = [
  cliRoot,
  "/Users/",
  "/home/",
  "/workspace/",
  "/workspaces/",
  "/private/var/folders/",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(arguments_) {
  let prebuildsDirectory = defaultPrebuildsDirectory;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--prebuilds-root" || arguments_[index + 1] === undefined) {
      throw new Error("native-prebuild-verify-argument-invalid");
    }
    prebuildsDirectory = resolve(arguments_[index + 1]);
    index += 1;
  }
  return prebuildsDirectory;
}

function offset(binary, value) {
  assert.ok(value <= BigInt(Number.MAX_SAFE_INTEGER));
  const result = Number(value);
  assert.ok(result >= 0 && result <= binary.byteLength);
  return result;
}

function cString(binary, start, end) {
  const terminator = binary.indexOf(0, start);
  assert.ok(terminator >= start && terminator < end);
  return binary.subarray(start, terminator).toString("ascii");
}

function requiredElfVersions(binary, prefix) {
  assert.equal(binary.subarray(0, 4).toString("latin1"), "\x7fELF");
  assert.equal(binary[4], 2);
  assert.equal(binary[5], 1);
  const sectionOffset = offset(binary, binary.readBigUInt64LE(0x28));
  const sectionEntrySize = binary.readUInt16LE(0x3a);
  const sectionCount = binary.readUInt16LE(0x3c);
  assert.equal(sectionEntrySize, 64);
  assert.ok(sectionOffset + sectionEntrySize * sectionCount <= binary.byteLength);

  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const position = sectionOffset + index * sectionEntrySize;
    const section = {
      type: binary.readUInt32LE(position + 4),
      offset: offset(binary, binary.readBigUInt64LE(position + 0x18)),
      size: offset(binary, binary.readBigUInt64LE(position + 0x20)),
      link: binary.readUInt32LE(position + 0x28),
    };
    assert.ok(section.offset + section.size <= binary.byteLength);
    sections.push(section);
  }

  const versionNeed = sections.find((section) => section.type === 0x6ffffffe);
  if (versionNeed === undefined) return [];
  const stringTable = sections[versionNeed.link];
  assert.ok(stringTable !== undefined);
  const result = [];
  let position = versionNeed.offset;
  const end = versionNeed.offset + versionNeed.size;
  while (position < end) {
    assert.ok(position + 16 <= end);
    const count = binary.readUInt16LE(position + 2);
    const auxiliaryOffset = binary.readUInt32LE(position + 8);
    const nextOffset = binary.readUInt32LE(position + 12);
    let auxiliary = position + auxiliaryOffset;
    for (let index = 0; index < count; index += 1) {
      assert.ok(auxiliary + 16 <= end);
      const nameOffset = binary.readUInt32LE(auxiliary + 8);
      const name = cString(
        binary,
        stringTable.offset + nameOffset,
        stringTable.offset + stringTable.size,
      );
      if (name.startsWith(prefix)) result.push(name.slice(prefix.length));
      const nextAuxiliary = binary.readUInt32LE(auxiliary + 12);
      if (index + 1 < count) {
        assert.notEqual(nextAuxiliary, 0);
        auxiliary += nextAuxiliary;
      }
    }
    if (nextOffset === 0) break;
    position += nextOffset;
  }
  return result;
}

function parseVersion(value) {
  return value.split(".").map((part) => Number(part));
}

function atMost(actual, expected) {
  const parts = Math.max(actual.length, expected.length);
  for (let index = 0; index < parts; index += 1) {
    const left = actual[index] ?? 0;
    const right = expected[index] ?? 0;
    if (left !== right) return left < right;
  }
  return true;
}

const prebuildsDirectory = parseArguments(process.argv.slice(2));
assert.equal(
  await readFile(join(prebuildsDirectory, "provenance.json"), "utf8"),
  serializePrebuildProvenance(),
);
const manifest = JSON.parse(await readFile(join(prebuildsDirectory, "manifest.json"), "utf8"));
assert.deepEqual(Object.keys(manifest), ["version", "nodeApi", "source", "sourceSha256", "targets"]);
assert.equal(manifest.version, "prism-native-authoring-prebuilds-v1");
assert.equal(manifest.nodeApi, 8);
assert.equal(manifest.source, "native/prism_authoring.cc");
assert.deepEqual(Object.keys(manifest.targets), targets);
assert.equal(manifest.sourceSha256, sha256(await readFile(join(cliRoot, manifest.source))));

for (const target of targets) {
  const entry = manifest.targets[target];
  assert.deepEqual(Object.keys(entry), ["file", "sha256"]);
  assert.equal(entry.file, `${target}/prism_authoring.node`);
  const binary = await readFile(join(prebuildsDirectory, entry.file));
  assert.equal(entry.sha256, sha256(binary));
  for (const prefix of forbiddenBuildPathPrefixes) {
    assert.equal(binary.includes(Buffer.from(prefix)), false);
  }
  if (target.endsWith("-gnu")) {
    for (const version of requiredElfVersions(binary, "GLIBC_")) {
      assert.ok(atMost(parseVersion(version), [2, 28]));
    }
    for (const version of requiredElfVersions(binary, "GLIBCXX_")) {
      assert.ok(atMost(parseVersion(version), [3, 4, 25]));
    }
  }
  if (process.platform === "darwin" && target.startsWith("darwin-")) {
    const result = spawnSync("otool", ["-l", join(prebuildsDirectory, entry.file)], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /minos 13\.5/u);
    assert.match(result.stdout, /cmd LC_UUID/u);
  }
}
