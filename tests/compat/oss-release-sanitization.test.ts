import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { OSS_RELEASE_PACKAGES } from "../../scripts/release/oss-release-contract.mjs";
import {
  buildGitleaksCommands,
  prepareCandidateScanTree,
} from "../../scripts/release/scan-oss-release.mjs";

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function tar(entries: readonly { readonly path: string; readonly contents: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const contents = Buffer.from(entry.contents, "utf8");
    const header = Buffer.alloc(512);
    header.write(entry.path, 0, 100, "utf8");
    header.write(octal(0o644, 8), 100, 8, "ascii");
    header.write(octal(0, 8), 108, 8, "ascii");
    header.write(octal(0, 8), 116, 8, "ascii");
    header.write(octal(contents.length, 12), 124, 12, "ascii");
    header.write(octal(0, 12), 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header, contents, Buffer.alloc((512 - (contents.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(context: { after(callback: () => unknown): void }) {
  const root = await mkdtemp(join(tmpdir(), "prism-oss-scan-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidateRoot = resolve(root, "candidate");
  const packagesRoot = resolve(candidateRoot, "packages");
  const outputRoot = resolve(root, "scan-input");
  await mkdir(packagesRoot, { recursive: true });
  await writeFile(resolve(candidateRoot, "README.md"), "# Prism release\n", "utf8");
  const packages = [];
  for (const entry of OSS_RELEASE_PACKAGES) {
    const bytes = tar([{
      path: "package/package.json",
      contents: `${JSON.stringify({ name: entry.name, version: entry.version })}\n`,
    }]);
    await writeFile(resolve(packagesRoot, entry.file), bytes);
    packages.push({ ...entry, sha256: sha256(bytes) });
  }
  return { root, candidateRoot, outputRoot, packages };
}

test("stages candidate documents and every safely extracted tarball for scanning", async (context) => {
  const input = await fixture(context);
  await prepareCandidateScanTree(input);

  assert.equal(
    await readFile(resolve(input.outputRoot, "candidate", "README.md"), "utf8"),
    "# Prism release\n",
  );
  for (const entry of OSS_RELEASE_PACKAGES) {
    const manifest = JSON.parse(await readFile(
      resolve(input.outputRoot, "packages", entry.name.split("/")[1]!, "package.json"),
      "utf8",
    ));
    assert.deepEqual(manifest, { name: entry.name, version: entry.version });
  }
});

test("rejects an unsafe tar path before extracting any candidate package", async (context) => {
  const input = await fixture(context);
  const unsafe = tar([{ path: "package/../../escaped.txt", contents: "secret\n" }]);
  const sdk = input.packages.find(({ name }) => name === "@useprism/sdk")!;
  await writeFile(resolve(input.candidateRoot, "packages", sdk.file), unsafe);
  const packages = input.packages.map((entry) => (
    entry.name === sdk.name ? { ...entry, sha256: sha256(unsafe) } : entry
  ));

  await assert.rejects(
    prepareCandidateScanTree({ ...input, packages }),
    /candidate-tar-path-unsafe/u,
  );
  await assert.rejects(lstat(input.outputRoot), { code: "ENOENT" });
  await assert.rejects(lstat(resolve(input.root, "escaped.txt")), { code: "ENOENT" });
});

test("requires redacted scans of exact-commit history and extracted candidate contents", () => {
  const sourceCommit = "a".repeat(40);
  assert.deepEqual(buildGitleaksCommands({
    repositoryRoot: "/repo",
    candidateScanRoot: "/scan-input",
    sourceCommit,
  }), [
    [
      "git",
      "--redact=100",
      "--no-banner",
      "--exit-code=1",
      `--log-opts=${sourceCommit}`,
      "/repo",
    ],
    [
      "dir",
      "--redact=100",
      "--no-banner",
      "--exit-code=1",
      "/scan-input",
    ],
  ]);
});
