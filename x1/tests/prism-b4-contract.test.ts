import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const builder = path.join(root, "pnh/x1-firecracker/b0/make-source-bundle.mjs");
const qualifiedB0 = process.env.B4_QUALIFIED_B0 === "1";

interface SourceEntry {
  bytes: number;
  mode: "0444";
  path: string;
  sha256: string;
}

interface SourceAllowlist {
  entries: SourceEntry[];
  roots: string[];
  schemaVersion: 1;
}

interface Fixture {
  allowlist: string;
  directory: string;
  output: string;
  source: string;
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
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
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new Error("fixture contains a noncanonical JSON value");
}

function entry(relativePath: string, bytes: Buffer): SourceEntry {
  return {
    bytes: bytes.length,
    mode: "0444",
    path: relativePath,
    sha256: sha256(bytes),
  };
}

function writeSourceFile(source: string, relativePath: string, contents: string): SourceEntry {
  const bytes = Buffer.from(contents);
  const target = path.join(source, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes, { mode: 0o644 });
  return entry(relativePath, bytes);
}

function sealTree(target: string): void {
  const metadata = lstatSync(target);
  if (metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    for (const child of readdirSync(target)) sealTree(path.join(target, child));
    chmodSync(target, 0o555);
    return;
  }
  if (metadata.isFile()) chmodSync(target, 0o444);
}

function unlockTree(target: string): void {
  let metadata;
  try {
    metadata = lstatSync(target);
  } catch {
    return;
  }
  if (metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    chmodSync(target, 0o755);
    for (const child of readdirSync(target)) unlockTree(path.join(target, child));
    return;
  }
  if (metadata.isFile()) chmodSync(target, 0o644);
}

function fixture(files: Record<string, string> = { "safe.txt": "safe\n" }): Fixture {
  const directory = mkdtempSync(path.join(os.tmpdir(), "prism-b4-contract-"));
  const source = path.join(directory, "source");
  mkdirSync(source);
  const entries = Object.entries(files)
    .map(([relativePath, contents]) => writeSourceFile(source, relativePath, contents))
    .sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  sealTree(source);
  const allowlist = path.join(directory, "source-allowlist.json");
  const manifest: SourceAllowlist = { entries, roots: ["."], schemaVersion: 1 };
  writeFileSync(allowlist, `${canonicalJson(manifest)}\n`, { mode: 0o444 });
  return { allowlist, directory, output: path.join(directory, "source.tar"), source };
}

function cleanup(item: Fixture): void {
  unlockTree(item.directory);
  rmSync(item.directory, { recursive: true, force: true });
}

function cleanEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    B4_B0_PROFILE: "unit",
    B4_QUALIFIED_B0: "1",
    HOME: "/nonexistent",
    HOSTNAME: "prism-b4",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    SOURCE_DATE_EPOCH: "0",
    TZ: "UTC",
    ...extra,
  };
}

function runBuilder(
  item: Fixture,
  options: { args?: string[]; env?: Record<string, string>; output?: string; source?: string } = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [
    builder,
    "--source-root", options.source ?? item.source,
    "--allowlist", item.allowlist,
    "--output", options.output ?? item.output,
    ...(options.args ?? []),
  ], {
    encoding: "utf8",
    env: cleanEnvironment(options.env),
    stdio: "pipe",
  });
}

function assertRejected(result: SpawnSyncReturns<string>, code: string): void {
  assert.notEqual(result.status, 0, `builder unexpectedly passed (${code})`);
  assert.equal(result.signal, null, `builder terminated by signal (${code})`);
  assert.match(result.stderr, new RegExp(`(?:^|\\n)${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\n|$)`));
}

if (!qualifiedB0) {
  test("Prism B4 dynamic contract requires the qualified B0 boundary", {
    skip: "run with npm run --silent b4:test:unit inside qualified B0",
  }, () => {});
} else {
  test("qualified B0 is Linux x86_64, non-root, non-sudo, offline, and host-closed", () => {
    assert.equal(process.platform, "linux");
    assert.equal(process.arch, "x64");
    assert.notEqual(process.getuid?.(), 0);
    assert.equal(process.stdin.isTTY, undefined);
    assert.equal(process.stdout.isTTY, undefined);
    assert.equal(process.env.HOME, "/nonexistent");
    assert.equal(os.hostname(), "prism-b4");

    const credentialKey = /(?:^|_)(?:API_?KEY|AUTH|COOKIE|CREDENTIAL|PASSWORD|PRIVATE_?KEY|SECRET|SESSION|TOKEN)(?:_|$)/i;
    assert.deepEqual(Object.keys(process.env).filter((key) => credentialKey.test(key)), []);
    assert.deepEqual(readdirSync("/sys/class/net").sort(), ["lo"]);
    const routes = readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1).filter(Boolean);
    assert.deepEqual(routes, []);

    const mounts = readFileSync("/proc/self/mountinfo", "utf8");
    for (const forbidden of ["/.git", "/Users/", "/home/runner", "docker.sock", "podman.sock"]) {
      assert.equal(mounts.includes(forbidden), false, `forbidden mount visible: ${forbidden}`);
    }
    assert.equal(statSync(root).mode & 0o222, 0);
    const sudo = spawnSync("sudo", ["-n", "true"], { env: cleanEnvironment(), stdio: "ignore" });
    assert.notEqual(sudo.status, 0);
  });

  test("source bundle rejects .git metadata", () => {
    const item = fixture({ ".git/HEAD": "ref: refs/heads/main\n", "safe.txt": "safe\n" });
    try {
      assertRejected(runBuilder(item), "source-reject:git-metadata");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects an unlisted path", () => {
    const item = fixture();
    try {
      chmodSync(item.source, 0o755);
      writeFileSync(path.join(item.source, "extra.txt"), "extra\n");
      sealTree(item.source);
      assertRejected(runBuilder(item), "source-reject:unlisted-path");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects a symlink before following it", () => {
    const item = fixture();
    try {
      chmodSync(item.source, 0o755);
      symlinkSync("safe.txt", path.join(item.source, "linked.txt"));
      const parsed = JSON.parse(readFileSync(item.allowlist, "utf8")) as SourceAllowlist;
      parsed.entries.push({ bytes: 0, mode: "0444", path: "linked.txt", sha256: "0".repeat(64) });
      parsed.entries.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
      chmodSync(item.allowlist, 0o644);
      writeFileSync(item.allowlist, `${canonicalJson(parsed)}\n`);
      chmodSync(item.allowlist, 0o444);
      sealTree(item.source);
      assertRejected(runBuilder(item), "source-reject:symlink");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects a device or other special file", () => {
    const item = fixture();
    try {
      const manifest: SourceAllowlist = {
        entries: [{ bytes: 0, mode: "0444", path: "null", sha256: "0".repeat(64) }],
        roots: ["null"],
        schemaVersion: 1,
      };
      chmodSync(item.allowlist, 0o644);
      writeFileSync(item.allowlist, `${canonicalJson(manifest)}\n`);
      chmodSync(item.allowlist, 0o444);
      assertRejected(runBuilder(item, { source: "/dev" }), "source-reject:special-file");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects a credential-shaped environment key without printing its value", () => {
    const item = fixture();
    const secretFixture = "fixture-value-must-not-appear";
    try {
      const result = runBuilder(item, { env: { GITHUB_TOKEN: secretFixture } });
      assert.equal(result.stderr.includes(secretFixture), false);
      assertRejected(result, "environment-reject:credential-key:GITHUB_TOKEN");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects a writable staged ancestor", () => {
    const item = fixture({ "nested/safe.txt": "safe\n" });
    try {
      chmodSync(path.join(item.source, "nested"), 0o755);
      assertRejected(runBuilder(item), "source-reject:writable-ancestor");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects a host identifier without printing it", () => {
    const hostIdentifier = "fixture-host-identity";
    const item = fixture({ "safe.txt": `source=${hostIdentifier}\n` });
    try {
      const result = runBuilder(item, { args: ["--forbidden-host-identifier", hostIdentifier] });
      assert.equal(result.stderr.includes(hostIdentifier), false);
      assertRejected(result, "source-reject:host-identifier");
    } finally {
      cleanup(item);
    }
  });

  test("source bundle rejects noncanonical manifest order instead of normalizing it", () => {
    const item = fixture({ "a.txt": "a\n", "b.txt": "b\n" });
    try {
      const parsed = JSON.parse(readFileSync(item.allowlist, "utf8")) as SourceAllowlist;
      parsed.entries.reverse();
      chmodSync(item.allowlist, 0o644);
      writeFileSync(item.allowlist, `${canonicalJson(parsed)}\n`);
      chmodSync(item.allowlist, 0o444);
      assertRejected(runBuilder(item), "source-reject:noncanonical-manifest-order");
    } finally {
      cleanup(item);
    }
  });

  test("two independently created source bundles are byte-identical", () => {
    const item = fixture({ "a.txt": "alpha\n", "nested/b.txt": "beta\n" });
    const secondOutput = path.join(item.directory, "source-second.tar");
    try {
      const first = runBuilder(item);
      const second = runBuilder(item, { output: secondOutput });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      const firstBytes = readFileSync(item.output);
      const secondBytes = readFileSync(secondOutput);
      assert.deepEqual(firstBytes, secondBytes);
      assert.equal(sha256(firstBytes), sha256(secondBytes));
    } finally {
      cleanup(item);
    }
  });
}
