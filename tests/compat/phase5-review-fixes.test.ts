import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PHASE5_LIVE_EVIDENCE_PATH,
  PHASE5_RELEASE_MODULE,
  type Phase5ReleaseContractModule,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = resolve(repositoryRoot, PHASE5_RELEASE_MODULE);

async function loadContract(): Promise<Phase5ReleaseContractModule> {
  assert.equal(existsSync(modulePath), true, `missing ${PHASE5_RELEASE_MODULE}`);
  return await import(pathToFileURL(modulePath).href) as Phase5ReleaseContractModule;
}

async function temporaryRoot(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

async function writeLiveAcceptanceTree(root: string): Promise<void> {
  for (const directory of ["sdk", "runtime", "provider-ollama", "cli"]) {
    const packageRoot = resolve(root, "packages", directory);
    await mkdir(resolve(packageRoot, "src"), { recursive: true });
    await mkdir(resolve(packageRoot, "dist"), { recursive: true });
    await writeFile(resolve(packageRoot, "package.json"), `{"name":"${directory}"}\n`, "utf8");
    await writeFile(resolve(packageRoot, "src", "index.ts"), `export const source = "${directory}";\n`, "utf8");
    await writeFile(resolve(packageRoot, "dist", "index.js"), `export const built = "${directory}";\n`, "utf8");
  }
}

test("live evidence binds the closed executed package input tree", async (context) => {
  const contract = await loadContract();
  const root = await temporaryRoot("prism-phase5-live-inputs-");
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeLiveAcceptanceTree(root);
  const original = await contract.liveAcceptanceInputDigest({ repositoryRoot: root });
  for (const path of [
    "packages/sdk/src/index.ts",
    "packages/runtime/dist/index.js",
    "packages/provider-ollama/src/index.ts",
    "packages/cli/dist/index.js",
  ]) {
    const absolute = resolve(root, path);
    const bytes = await readFile(absolute, "utf8");
    await writeFile(absolute, `${bytes}changed\n`, "utf8");
    assert.notEqual(await contract.liveAcceptanceInputDigest({ repositoryRoot: root }), original, path);
    await writeFile(absolute, bytes, "utf8");
  }
});

test("live evidence path is exact, canonical, and rejects symlinked ancestors", async (context) => {
  const contract = await loadContract();
  const root = await temporaryRoot("prism-phase5-live-path-");
  context.after(() => rm(root, { recursive: true, force: true }));
  const parent = resolve(root, "docs", "releases", "developer-preview");
  await mkdir(parent, { recursive: true });
  const expected = resolve(root, PHASE5_LIVE_EVIDENCE_PATH);
  assert.equal(
    await contract.validateLiveEvidencePath({ repositoryRoot: root, evidencePath: expected }),
    expected,
  );
  await assert.rejects(contract.validateLiveEvidencePath({
    repositoryRoot: root,
    evidencePath: resolve(parent, "wrong.json"),
  }));

  const linkedRoot = await temporaryRoot("prism-phase5-live-link-");
  context.after(() => rm(linkedRoot, { recursive: true, force: true }));
  const outside = await temporaryRoot("prism-phase5-live-outside-");
  context.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(resolve(linkedRoot, "docs"), { recursive: true });
  await mkdir(resolve(outside, "developer-preview"), { recursive: true });
  await symlink(outside, resolve(linkedRoot, "docs", "releases"));
  await assert.rejects(contract.validateLiveEvidencePath({
    repositoryRoot: linkedRoot,
    evidencePath: resolve(linkedRoot, PHASE5_LIVE_EVIDENCE_PATH),
  }));
});

test("live preflight and failure classes are bounded before reservation", async () => {
  const contract = await loadContract();
  assert.doesNotThrow(() => contract.assertPinnedToolchain({
    nodeVersion: "v26.8.1",
    npmVersion: "11.19.0",
    expectedNodeVersion: "26.8.1",
  }));
  assert.throws(() => contract.assertPinnedToolchain({
    nodeVersion: "v22.21.0",
    npmVersion: "11.19.0",
    expectedNodeVersion: "26.8.1",
  }));
  assert.throws(() => contract.assertPinnedToolchain({
    nodeVersion: "v26.8.1",
    npmVersion: "10.9.4",
    expectedNodeVersion: "26.8.1",
  }));
  assert.equal(
    contract.classifyLiveDoctorFailure(JSON.stringify({
      status: "failed",
      provider: "ollama",
      checks: [],
      error: "model not found; run ollama pull qwen2.5:14b",
    })),
    "model-missing",
  );
  assert.equal(contract.classifyLiveDoctorFailure("{"), "doctor-failed");
});

test("candidate publication is no-clobber and safe output paths reject symlink ancestors", async (context) => {
  const contract = await loadContract();
  const root = await temporaryRoot("prism-phase5-publish-");
  context.after(() => rm(root, { recursive: true, force: true }));
  const stage = resolve(root, "stage");
  const output = resolve(root, "output");
  await mkdir(stage);
  await writeFile(resolve(stage, "sentinel.txt"), "stage\n", "utf8");
  await mkdir(output);
  await assert.rejects(contract.publishDirectoryNoReplace(stage, output));
  assert.equal(await readFile(resolve(stage, "sentinel.txt"), "utf8"), "stage\n");
  await rm(output, { recursive: true });
  await contract.publishDirectoryNoReplace(stage, output);
  assert.equal(existsSync(stage), false);
  assert.equal(await readFile(resolve(output, "sentinel.txt"), "utf8"), "stage\n");

  const racedStage = resolve(root, "raced-stage");
  const racedOutput = resolve(root, "raced-output");
  await mkdir(racedStage);
  await writeFile(resolve(racedStage, "sentinel.txt"), "staged\n", "utf8");
  await assert.rejects(contract.publishDirectoryNoReplace(racedStage, racedOutput, {
    afterHelperReady: async () => {
      await mkdir(racedOutput);
      await writeFile(resolve(racedOutput, "sentinel.txt"), "competing\n", "utf8");
    },
  }));
  assert.equal(await readFile(resolve(racedStage, "sentinel.txt"), "utf8"), "staged\n");
  assert.equal(await readFile(resolve(racedOutput, "sentinel.txt"), "utf8"), "competing\n");

  const outside = resolve(root, "outside");
  const linked = resolve(root, "linked");
  await mkdir(resolve(outside, "nested"), { recursive: true });
  await symlink(outside, linked);
  await assert.rejects(contract.resolveSafeOutputPath(resolve(linked, "nested", "candidate")));
});
