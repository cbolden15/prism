#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import path from "node:path";

class Rejection extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function reject(code) {
  throw new Rejection(code);
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  reject("source-reject:noncanonical-manifest");
}

function parseArguments(argv) {
  const options = { forbiddenHostIdentifiers: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.length === 0) reject("source-reject:invalid-arguments");
    if (flag === "--source-root") options.sourceRoot = value;
    else if (flag === "--allowlist") options.allowlist = value;
    else if (flag === "--output") options.output = value;
    else if (flag === "--forbidden-host-identifier") options.forbiddenHostIdentifiers.push(value);
    else reject("source-reject:invalid-arguments");
  }
  if (!options.sourceRoot || !options.allowlist || !options.output) {
    reject("source-reject:invalid-arguments");
  }
  return options;
}

function validateEnvironment() {
  if (
    process.env.B4_QUALIFIED_B0 !== "1"
    || !process.env.B4_B0_PROFILE
    || process.platform !== "linux"
    || process.arch !== "x64"
    || process.getuid?.() === 0
  ) {
    reject("environment-reject:not-qualified-b0");
  }

  const credentialKey = /(?:^|_)(?:API_?KEY|AUTH|COOKIE|CREDENTIAL|PASSWORD|PRIVATE_?KEY|SECRET|SESSION|TOKEN)(?:_|$)/i;
  const key = Object.keys(process.env).sort().find((candidate) => credentialKey.test(candidate));
  if (key) reject(`environment-reject:credential-key:${key.replace(/[^A-Za-z0-9_]/g, "?")}`);
}

function isCanonicalPath(value, { allowDot = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
    return false;
  }
  if (allowDot && value === ".") return true;
  if (value.startsWith("/") || value.endsWith("/") || path.posix.normalize(value) !== value) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function hasGitSegment(relativePath) {
  return relativePath.split("/").includes(".git");
}

function comparePaths(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

function validateAllowlist(allowlistPath) {
  const bytes = readFileSync(allowlistPath);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    reject("source-reject:invalid-manifest");
  }
  if (`${canonicalJson(manifest)}\n` !== bytes.toString("utf8")) {
    reject("source-reject:noncanonical-manifest");
  }
  if (
    manifest === null
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || Object.keys(manifest).sort().join(",") !== "entries,roots,schemaVersion"
    || manifest.schemaVersion !== 1
    || !Array.isArray(manifest.entries)
    || !Array.isArray(manifest.roots)
    || manifest.roots.length === 0
  ) {
    reject("source-reject:invalid-manifest");
  }

  const roots = [];
  for (const root of manifest.roots) {
    if (!isCanonicalPath(root, { allowDot: true }) || hasGitSegment(root)) {
      reject(hasGitSegment(String(root)) ? "source-reject:git-metadata" : "source-reject:invalid-manifest");
    }
    roots.push(root);
  }
  if (new Set(roots).size !== roots.length || [...roots].sort(comparePaths).some((item, index) => item !== roots[index])) {
    reject("source-reject:noncanonical-manifest-order");
  }
  if (roots.includes(".") && roots.length !== 1) reject("source-reject:overlapping-roots");

  const entries = [];
  for (const item of manifest.entries) {
    if (
      item === null
      || typeof item !== "object"
      || Array.isArray(item)
      || Object.keys(item).sort().join(",") !== "bytes,mode,path,sha256"
      || !Number.isSafeInteger(item.bytes)
      || item.bytes < 0
      || item.mode !== "0444"
      || !isCanonicalPath(item.path)
      || !/^[0-9a-f]{64}$/.test(item.sha256)
    ) {
      reject("source-reject:invalid-manifest");
    }
    if (hasGitSegment(item.path)) reject("source-reject:git-metadata");
    if (item.path === ".b4/source-allowlist.json") reject("source-reject:reserved-path");
    if (!roots.some((root) => root === "." || item.path === root || item.path.startsWith(`${root}/`))) {
      reject("source-reject:path-outside-roots");
    }
    entries.push(item);
  }
  if (new Set(entries.map((item) => item.path)).size !== entries.length) {
    reject("source-reject:duplicate-path");
  }
  if ([...entries].sort((left, right) => comparePaths(left.path, right.path)).some((item, index) => item !== entries[index])) {
    reject("source-reject:noncanonical-manifest-order");
  }
  return { bytes, entries, roots };
}

function expectedDirectories(entries, roots, implicitManifestPaths) {
  const directories = new Set(["."]);
  for (const root of roots) {
    if (root !== ".") directories.add(root);
  }
  for (const item of entries) {
    let directory = path.posix.dirname(item.path);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  for (const manifestPath of implicitManifestPaths) {
    let directory = path.posix.dirname(manifestPath);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return directories;
}

function implicitManifestPaths(sourceRoot, allowlistPath) {
  const candidates = new Set([".b4/source-allowlist.json", "pnh/x1-firecracker/b0/source-allowlist.json"]);
  const relativeAllowlist = path.relative(sourceRoot, allowlistPath).split(path.sep).join("/");
  if (isCanonicalPath(relativeAllowlist)) candidates.add(relativeAllowlist);
  return new Set([...candidates].filter((candidate) => existsSync(path.join(sourceRoot, ...candidate.split("/")))));
}

function readClosedSource(sourceRoot, manifest, forbiddenHostIdentifiers, implicitPaths) {
  const expected = new Map(manifest.entries.map((item) => [item.path, item]));
  const allowedDirectories = expectedDirectories(manifest.entries, manifest.roots, implicitPaths);
  const found = new Map();
  const implicitFiles = new Map();

  function walk(relativePath) {
    if (relativePath !== "." && hasGitSegment(relativePath)) reject("source-reject:git-metadata");
    const absolutePath = relativePath === "." ? sourceRoot : path.join(sourceRoot, ...relativePath.split("/"));
    const before = lstatSync(absolutePath);
    if (before.isSymbolicLink()) reject("source-reject:symlink");
    if (before.isDirectory()) {
      if ((before.mode & 0o222) !== 0) reject("source-reject:writable-ancestor");
      if (!allowedDirectories.has(relativePath)) reject("source-reject:unlisted-path");
      for (const name of readdirSync(absolutePath).sort(comparePaths)) {
        walk(relativePath === "." ? name : `${relativePath}/${name}`);
      }
      return;
    }
    if (!before.isFile()) reject("source-reject:special-file");
    if (before.nlink !== 1) reject("source-reject:hardlink");
    if (implicitPaths.has(relativePath)) {
      if ((before.mode & 0o777) !== 0o444) reject("source-reject:mode-mismatch");
      const bytes = readFileSync(absolutePath);
      if (!bytes.equals(manifest.bytes)) reject("source-reject:implicit-manifest-mismatch");
      implicitFiles.set(relativePath, bytes);
      return;
    }
    const declared = expected.get(relativePath);
    if (!declared) reject("source-reject:unlisted-path");
    if ((before.mode & 0o777) !== 0o444) reject("source-reject:mode-mismatch");

    const bytes = readFileSync(absolutePath);
    const after = lstatSync(absolutePath);
    if (
      !after.isFile()
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
    ) {
      reject("source-reject:changed-during-read");
    }
    if (bytes.length !== declared.bytes || createHash("sha256").update(bytes).digest("hex") !== declared.sha256) {
      reject("source-reject:digest-mismatch");
    }
    for (const identifier of forbiddenHostIdentifiers) {
      if (identifier.length > 0 && bytes.includes(Buffer.from(identifier))) reject("source-reject:host-identifier");
    }
    found.set(relativePath, bytes);
  }

  for (const root of manifest.roots) walk(root);
  if (found.size !== expected.size || [...expected.keys()].some((item) => !found.has(item))) {
    reject("source-reject:missing-path");
  }
  return { files: found, implicitFiles };
}

function writeString(target, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) reject("source-reject:path-too-long");
  bytes.copy(target, offset);
}

function writeOctal(target, offset, length, value) {
  const octal = value.toString(8);
  if (octal.length > length - 1) reject("source-reject:archive-field-overflow");
  writeString(target, offset, length, `${octal.padStart(length - 1, "0")}\0`);
}

function splitTarPath(relativePath) {
  if (Buffer.byteLength(relativePath) <= 100) return { name: relativePath, prefix: "" };
  for (let index = relativePath.lastIndexOf("/"); index > 0; index = relativePath.lastIndexOf("/", index - 1)) {
    const prefix = relativePath.slice(0, index);
    const name = relativePath.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  reject("source-reject:path-too-long");
}

function tarHeader(relativePath, size) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(relativePath);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o444);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function buildArchive(manifest, files, implicitFiles) {
  const archiveEntries = [
    [".b4/source-allowlist.json", manifest.bytes],
    ...[...implicitFiles.entries()].filter(([relativePath]) => relativePath !== ".b4/source-allowlist.json"),
    ...manifest.entries.map((item) => [item.path, files.get(item.path)]),
  ].sort(([left], [right]) => comparePaths(left, right));
  const chunks = [];
  for (const [relativePath, bytes] of archiveEntries) {
    chunks.push(tarHeader(relativePath, bytes.length), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function writeAtomic(outputPath, bytes) {
  const absoluteOutput = path.resolve(outputPath);
  if (existsSync(absoluteOutput)) {
    const metadata = lstatSync(absoluteOutput);
    if (!metadata.isFile() || metadata.isSymbolicLink()) reject("source-reject:unsafe-output");
  }
  const temporary = `${absoluteOutput}.tmp-${process.pid}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o444);
    renameSync(temporary, absoluteOutput);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

try {
  validateEnvironment();
  const options = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(options.sourceRoot);
  const output = path.resolve(options.output);
  if (output === sourceRoot || output.startsWith(`${sourceRoot}${path.sep}`)) {
    reject("source-reject:output-inside-source");
  }
  const allowlistPath = path.resolve(options.allowlist);
  const manifest = validateAllowlist(allowlistPath);
  const implicitPaths = implicitManifestPaths(sourceRoot, allowlistPath);
  const { files, implicitFiles } = readClosedSource(
    sourceRoot,
    manifest,
    options.forbiddenHostIdentifiers,
    implicitPaths,
  );
  writeAtomic(output, buildArchive(manifest, files, implicitFiles));
} catch (error) {
  const code = error instanceof Rejection ? error.code : "source-reject:internal";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
