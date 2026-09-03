import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { OSS_RELEASE_PACKAGES } from "../../scripts/release/oss-release-contract.mjs";
import { publishCandidatePackages } from "../../scripts/release/publish-oss-release.mjs";

const REGISTRY = "https://registry.npmjs.org";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function integrity(value: Buffer): string {
  return `sha512-${createHash("sha512").update(value).digest("base64")}`;
}

async function fixture(context: { after(callback: () => unknown): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-oss-publisher-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packagesRoot = resolve(root, "packages");
  await mkdir(packagesRoot);
  const bytes = new Map<string, Buffer>();
  const packages = [];
  for (const entry of [...OSS_RELEASE_PACKAGES].reverse()) {
    const value = Buffer.from(`candidate:${entry.name}\n`, "utf8");
    bytes.set(entry.name, value);
    await writeFile(resolve(packagesRoot, entry.file), value);
    packages.push({ ...entry, sha256: sha256(value) });
  }
  return { root, packages, bytes };
}

test("publishes exact candidate tarballs in dependency order and skips integrity matches", async (context) => {
  const input = await fixture(context);
  const calls: string[][] = [];
  const sdkBytes = input.bytes.get("@useprism/sdk")!;
  const result = await publishCandidatePackages({
    candidateRoot: input.root,
    packages: input.packages,
    runNpm(arguments_: readonly string[]) {
      calls.push([...arguments_]);
      if (arguments_[0] === "view") {
        return arguments_[2] === "@useprism/sdk@0.1.0"
          ? { status: 0, stdout: `${JSON.stringify(integrity(sdkBytes))}\n`, stderr: "" }
          : { status: 1, stdout: "", stderr: "npm error code E404" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.deepEqual(result, [
    { name: "@useprism/sdk", status: "already-published" },
    { name: "@useprism/runtime", status: "published" },
    { name: "@useprism/provider-ollama", status: "published" },
    { name: "@useprism/cli", status: "published" },
  ]);
  const publishes = calls.filter(([command]) => command === "publish");
  assert.deepEqual(
    publishes.map((arguments_) => arguments_[1]),
    OSS_RELEASE_PACKAGES.slice(1).map(({ file }) => resolve(input.root, "packages", file)),
  );
  for (const arguments_ of publishes) {
    assert.deepEqual(arguments_.slice(2), [
      "--access", "public",
      "--tag", "next",
      "--provenance",
      "--ignore-scripts",
      "--registry", REGISTRY,
    ]);
  }
  assert.equal(calls.some((arguments_) => arguments_.join(" ").includes("provider-codex")), false);
});

test("refuses a published version whose registry integrity differs", async (context) => {
  const input = await fixture(context);
  let publishCalls = 0;
  await assert.rejects(
    publishCandidatePackages({
      candidateRoot: input.root,
      packages: input.packages,
      runNpm(arguments_: readonly string[]) {
        if (arguments_[0] === "publish") publishCalls += 1;
        return { status: 0, stdout: JSON.stringify("sha512-wrong"), stderr: "" };
      },
    }),
    /published-integrity-mismatch:@useprism\/sdk/u,
  );
  assert.equal(publishCalls, 0);
});

test("validates every candidate digest before making a registry request", async (context) => {
  const input = await fixture(context);
  await writeFile(
    resolve(input.root, "packages", OSS_RELEASE_PACKAGES.at(-1)!.file),
    "tampered\n",
  );
  let calls = 0;
  await assert.rejects(
    publishCandidatePackages({
      candidateRoot: input.root,
      packages: input.packages,
      runNpm() {
        calls += 1;
        return { status: 1, stdout: "", stderr: "npm error code E404" };
      },
    }),
    /candidate-package-digest-mismatch:@useprism\/cli/u,
  );
  assert.equal(calls, 0);
});

test("a partial publish never attempts to mutate latest", async (context) => {
  const input = await fixture(context);
  const calls: string[][] = [];
  await assert.rejects(publishCandidatePackages({
    candidateRoot: input.root,
    packages: input.packages,
    runNpm(arguments_: readonly string[]) {
      calls.push([...arguments_]);
      if (arguments_[0] === "view") return { status: 1, stdout: "", stderr: "npm error code E404" };
      return arguments_[1]?.includes("runtime")
        ? { status: 1, stdout: "", stderr: "publish failed" }
        : { status: 0, stdout: "", stderr: "" };
    },
  }), /publish-failed:@useprism\/runtime/u);
  assert.equal(calls.some((arguments_) => arguments_.includes("latest")), false);
  assert.equal(calls.some(([command]) => command === "dist-tag"), false);
});
