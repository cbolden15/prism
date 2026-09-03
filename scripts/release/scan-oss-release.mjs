import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { validateDeveloperPreviewCandidate } from "./developer-preview-contract.mjs";
import { orderCandidatePackages } from "./oss-release-contract.mjs";

const BLOCK_SIZE = 512;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_CANDIDATE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const COMMIT = /^[0-9a-f]{40}$/u;

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function isZeroBlock(block) {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

function fieldString(header, start, length) {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  const bytes = end === -1 ? field : field.subarray(0, end);
  const value = bytes.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(bytes)) fail("candidate-tar-header-invalid");
  return value;
}

function parseOctal(header, start, length) {
  const value = fieldString(header, start, length).trim();
  if (!/^[0-7]+$/u.test(value)) fail("candidate-tar-header-invalid");
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("candidate-tar-header-invalid");
  return parsed;
}

function assertHeaderChecksum(header) {
  const expected = parseOctal(header, 148, 8);
  let actual = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) fail("candidate-tar-checksum-invalid");
}

function parsePax(contents) {
  const fields = new Map();
  let offset = 0;
  while (offset < contents.length) {
    const space = contents.indexOf(0x20, offset);
    if (space === -1) fail("candidate-tar-pax-invalid");
    const lengthText = contents.subarray(offset, space).toString("ascii");
    if (!/^[1-9][0-9]*$/u.test(lengthText)) fail("candidate-tar-pax-invalid");
    const length = Number.parseInt(lengthText, 10);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > contents.length || contents[end - 1] !== 0x0a) {
      fail("candidate-tar-pax-invalid");
    }
    const record = contents.subarray(space + 1, end - 1);
    const equals = record.indexOf(0x3d);
    if (equals < 1) fail("candidate-tar-pax-invalid");
    const key = record.subarray(0, equals).toString("utf8");
    const valueBytes = record.subarray(equals + 1);
    const value = valueBytes.toString("utf8");
    if (!Buffer.from(value, "utf8").equals(valueBytes) || fields.has(key)) {
      fail("candidate-tar-pax-invalid");
    }
    fields.set(key, value);
    offset = end;
  }
  return fields;
}

function safeArchivePath(path, type) {
  if (
    typeof path !== "string"
    || path.length === 0
    || path.length > 1024
    || path.includes("\\")
    || path.includes("\0")
    || !path.startsWith("package/")
  ) fail("candidate-tar-path-unsafe");
  let stripped = path.slice("package/".length);
  if (type === "directory" && stripped.endsWith("/")) stripped = stripped.slice(0, -1);
  if (stripped === "" && type === "directory") return [];
  const segments = stripped.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("candidate-tar-path-unsafe");
  }
  return segments;
}

function parseTarball(bytes, expected) {
  let archive;
  try {
    archive = gunzipSync(bytes, { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch {
    fail(`candidate-tar-invalid:${expected.name}`);
  }
  if (archive.length < BLOCK_SIZE * 2 || archive.length > MAX_ARCHIVE_BYTES) {
    fail(`candidate-tar-invalid:${expected.name}`);
  }

  const entries = [];
  const seen = new Set();
  let offset = 0;
  let pendingPax;
  let pendingLongPath;
  let ended = false;
  while (offset + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE);
    if (isZeroBlock(header)) {
      const second = archive.subarray(offset + BLOCK_SIZE, offset + (2 * BLOCK_SIZE));
      if (second.length !== BLOCK_SIZE || !isZeroBlock(second)) fail("candidate-tar-terminator-invalid");
      for (const byte of archive.subarray(offset + (2 * BLOCK_SIZE))) {
        if (byte !== 0) fail("candidate-tar-trailing-data");
      }
      ended = true;
      break;
    }
    assertHeaderChecksum(header);
    const size = parseOctal(header, 124, 12);
    const dataStart = offset + BLOCK_SIZE;
    const dataEnd = dataStart + size;
    const nextOffset = dataStart + (Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE);
    if (dataEnd > archive.length || nextOffset > archive.length) fail("candidate-tar-truncated");
    const contents = archive.subarray(dataStart, dataEnd);
    const typeFlag = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    const name = fieldString(header, 0, 100);
    const prefix = fieldString(header, 345, 155);
    const headerPath = prefix === "" ? name : `${prefix}/${name}`;

    if (typeFlag === "x" || typeFlag === "g") {
      const fields = parsePax(contents);
      if (typeFlag === "g") {
        if (["path", "linkpath", "size"].some((key) => fields.has(key))) fail("candidate-tar-pax-invalid");
      } else {
        if (pendingPax !== undefined || pendingLongPath !== undefined || fields.has("linkpath")) {
          fail("candidate-tar-pax-invalid");
        }
        if (fields.has("size") && fields.get("size") !== String(size)) fail("candidate-tar-pax-invalid");
        pendingPax = fields;
      }
      offset = nextOffset;
      continue;
    }
    if (typeFlag === "L") {
      if (pendingPax !== undefined || pendingLongPath !== undefined) fail("candidate-tar-header-invalid");
      pendingLongPath = contents.subarray(0, contents.indexOf(0) === -1 ? contents.length : contents.indexOf(0)).toString("utf8");
      if (pendingLongPath === "" || !Buffer.from(`${pendingLongPath}\0`).subarray(0, contents.length).equals(contents)) {
        fail("candidate-tar-header-invalid");
      }
      offset = nextOffset;
      continue;
    }

    const path = pendingPax?.get("path") ?? pendingLongPath ?? headerPath;
    pendingPax = undefined;
    pendingLongPath = undefined;
    const type = typeFlag === "0" ? "file" : typeFlag === "5" ? "directory" : undefined;
    if (type === undefined || (type === "directory" && size !== 0)) fail("candidate-tar-entry-unsafe");
    const segments = safeArchivePath(path, type);
    const relativePath = segments.join("/");
    if (relativePath !== "") {
      if (seen.has(relativePath)) fail("candidate-tar-entry-duplicate");
      seen.add(relativePath);
      entries.push({ type, segments, contents });
      if (entries.length > MAX_ENTRIES) fail("candidate-tar-entry-limit");
    }
    offset = nextOffset;
  }
  if (!ended || pendingPax !== undefined || pendingLongPath !== undefined) fail("candidate-tar-invalid");

  const manifestEntry = entries.find((entry) => (
    entry.type === "file" && entry.segments.length === 1 && entry.segments[0] === "package.json"
  ));
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.contents.toString("utf8"));
  } catch {
    fail(`candidate-tar-package-invalid:${expected.name}`);
  }
  if (
    !isRecord(manifest)
    || manifest.name !== expected.name
    || manifest.version !== expected.version
    || manifest.private === true
  ) fail(`candidate-tar-package-invalid:${expected.name}`);
  return entries;
}

async function collectCandidateDocuments(root, packagePaths) {
  const documents = [];
  let totalBytes = 0;
  async function visit(path, relativePath) {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) fail("candidate-scan-symlink");
    if (metadata.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) {
        await visit(resolve(path, entry), relativePath === "" ? entry : `${relativePath}/${entry}`);
      }
      return;
    }
    if (!metadata.isFile()) fail("candidate-scan-special-file");
    if (packagePaths.has(relativePath)) return;
    if (relativePath.startsWith("packages/")) fail("candidate-scan-file-set-mismatch");
    const contents = await readFile(path);
    totalBytes += contents.length;
    if (documents.length >= MAX_ENTRIES || totalBytes > MAX_CANDIDATE_BYTES) {
      fail("candidate-scan-limit");
    }
    documents.push({ relativePath, contents });
  }
  await visit(root, "");
  return documents;
}

async function assertAbsent(path) {
  try {
    await lstat(path);
    fail("candidate-scan-output-exists");
  } catch (error) {
    if (error instanceof Error && error.message === "candidate-scan-output-exists") throw error;
    if (!isRecord(error) || error.code !== "ENOENT") fail("candidate-scan-output-invalid");
  }
}

async function writeScanFile(root, segments, contents) {
  const destination = resolve(root, ...segments);
  if (!isWithin(root, destination)) fail("candidate-tar-path-unsafe");
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, contents, { flag: "wx", mode: 0o600 });
}

export async function prepareCandidateScanTree(input) {
  const candidateRoot = await realpath(resolve(input.candidateRoot));
  const outputRoot = resolve(input.outputRoot);
  await assertAbsent(outputRoot);
  const packages = orderCandidatePackages(input.packages);
  const parsedPackages = [];
  let totalBytes = 0;
  for (const entry of packages) {
    const path = resolve(candidateRoot, "packages", entry.file);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`candidate-package-unsafe:${entry.name}`);
    const bytes = await readFile(path);
    totalBytes += bytes.length;
    if (totalBytes > MAX_CANDIDATE_BYTES) fail("candidate-scan-limit");
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      fail(`candidate-package-digest-mismatch:${entry.name}`);
    }
    parsedPackages.push({ entry, entries: parseTarball(bytes, entry) });
  }
  const packagePaths = new Set(packages.map(({ file }) => `packages/${file}`));
  const documents = await collectCandidateDocuments(candidateRoot, packagePaths);

  await mkdir(outputRoot, { mode: 0o700 });
  for (const document of documents) {
    await writeScanFile(
      resolve(outputRoot, "candidate"),
      document.relativePath.split("/"),
      document.contents,
    );
  }
  for (const { entry, entries } of parsedPackages) {
    const packageRoot = resolve(outputRoot, "packages", entry.name.split("/")[1]);
    for (const archiveEntry of entries) {
      const destination = resolve(packageRoot, ...archiveEntry.segments);
      if (!isWithin(packageRoot, destination)) fail("candidate-tar-path-unsafe");
      if (archiveEntry.type === "directory") {
        await mkdir(destination, { recursive: true, mode: 0o700 });
      } else {
        await writeScanFile(packageRoot, archiveEntry.segments, archiveEntry.contents);
      }
    }
  }
  return outputRoot;
}

export function buildGitleaksCommands(input) {
  if (!COMMIT.test(input.sourceCommit)) fail("invalid-source-commit");
  return Object.freeze([
    Object.freeze([
      "git",
      "--redact=100",
      "--no-banner",
      "--exit-code=1",
      `--log-opts=${input.sourceCommit}`,
      resolve(input.repositoryRoot),
    ]),
    Object.freeze([
      "dir",
      "--redact=100",
      "--no-banner",
      "--exit-code=1",
      resolve(input.candidateScanRoot),
    ]),
  ]);
}

function run(command, arguments_, options) {
  return spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function scanOssRelease(input) {
  const repositoryRoot = await realpath(resolve(input.repositoryRoot));
  const candidateRoot = await realpath(resolve(input.candidateRoot));
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const status = run("git", ["status", "--porcelain"], { cwd: repositoryRoot });
  if (
    head.error || head.status !== 0 || head.stdout.trim() !== input.sourceCommit
    || status.error || status.status !== 0 || status.stdout.trim() !== ""
  ) fail("release-source-not-exact");
  await validateDeveloperPreviewCandidate({ candidateRoot, sourceCommit: input.sourceCommit });
  const manifest = JSON.parse(await readFile(resolve(candidateRoot, "candidate.json"), "utf8"));
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-oss-secret-scan-")));
  await chmod(temporary, 0o700);
  try {
    const scanRoot = await prepareCandidateScanTree({
      candidateRoot,
      outputRoot: resolve(temporary, "input"),
      packages: manifest.packages,
    });
    for (const arguments_ of buildGitleaksCommands({
      repositoryRoot,
      candidateScanRoot: scanRoot,
      sourceCommit: input.sourceCommit,
    })) {
      const result = run(input.gitleaksPath, arguments_, { cwd: repositoryRoot });
      if (result.error || result.status !== 0) fail("gitleaks-scan-failed");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(arguments_) {
  const allowed = new Set(["--repository", "--candidate", "--source-commit", "--gitleaks"]);
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
    repositoryRoot: values.get("--repository"),
    candidateRoot: values.get("--candidate"),
    sourceCommit: values.get("--source-commit"),
    gitleaksPath: resolve(values.get("--gitleaks")),
  };
}

async function main() {
  await scanOssRelease(parseArguments(process.argv.slice(2)));
  process.stdout.write("Prism OSS sanitization gate: ok\n");
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Prism OSS sanitization gate failed: ${error instanceof Error ? error.message : "scan-failed"}\n`);
    process.exitCode = 1;
  });
}
