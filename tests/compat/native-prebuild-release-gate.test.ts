import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

import {
  prebuildProvenance,
  targets,
} from "../../packages/cli/native/prebuild-contract.mjs";
import { assemblePrebuilds } from "../../packages/cli/native/assemble-prebuilds.mjs";
import { comparePrebuilds } from "../../packages/cli/native/compare-prebuilds.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const committedRoot = join(repositoryRoot, "packages", "cli", "prebuilds");

test("native prebuild inputs are immutable and close over exactly six targets", async () => {
  const manifest = JSON.parse(await readFile(join(committedRoot, "manifest.json"), "utf8"));
  const dockerfile = await readFile(
    join(repositoryRoot, "packages", "cli", "native", "Dockerfile.prebuilds"),
    "utf8",
  );
  const buildScript = await readFile(
    join(repositoryRoot, "packages", "cli", "native", "build-prebuilds.mjs"),
    "utf8",
  );

  assert.deepEqual(Object.keys(manifest.targets), targets);
  assert.equal(targets.length, 6);
  assert.equal(prebuildProvenance.node, "26.8.1");
  assert.equal(prebuildProvenance.npm, "11.19.0");
  assert.deepEqual(prebuildProvenance.darwin.targets, {
    "darwin-arm64": { compilerArchitecture: "arm64", loadTestRunner: "macos-26" },
    "darwin-x64": { compilerArchitecture: "x86_64", loadTestRunner: "macos-26-intel" },
  });
  assert.deepEqual([
    ...Object.keys(prebuildProvenance.darwin.targets),
    ...Object.keys(prebuildProvenance.linux.targets),
  ], targets);
  assert.deepEqual(
    Object.fromEntries(Object.entries(prebuildProvenance.linux.targets).map(
      ([target, configuration]) => [target, configuration.runtimeImage],
    )),
    {
      "linux-arm64-gnu": "node:26.8.1-bookworm@sha256:975403e9d926e56fb2488a2b280757f319b2ab4fc5e9c364b059e395d480e2b2",
      "linux-arm64-musl": "node:26.8.1-alpine@sha256:0d642590166d10420a0efa32b0db56987aef75eeca82742305b4ac4cfd0210e0",
      "linux-x64-gnu": "node:26.8.1-bookworm@sha256:53eaddc9c421e3e33f5365bb605cb4d85477886745573216219933e22ac13ab0",
      "linux-x64-musl": "node:26.8.1-alpine@sha256:ad6400dee476b06e82d0ee3a088e2d7555f6e6569c346e61d69e14d0f19e8c2b",
    },
  );
  assert.match(buildScript, /prebuildProvenance\.linux\.targets\[target\]\.runtimeImage/u);
  assert.doesNotMatch(buildScript, /prebuildProvenance\.linux\.images\.node(?:Bookworm|Alpine)/u);
  for (const image of Object.values(prebuildProvenance.linux.images)) {
    assert.match(image, /^[a-z0-9./:-]+@sha256:[0-9a-f]{64}$/u);
    assert.ok(dockerfile.includes(image));
  }
  assert.doesNotMatch(dockerfile, /^FROM .*\b(?:node|rockylinux):[^@\s]+(?:\s|$)/mu);
});

test("native prebuild comparison rejects byte, manifest, provenance, and closure drift", async (context) => {
  await comparePrebuilds({ family: "all", committedRoot, rebuiltRoot: committedRoot });

  const temporary = await mkdtemp(join(tmpdir(), "prism-native-prebuild-compare-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const rebuiltRoot = join(temporary, "prebuilds");
  await cp(committedRoot, rebuiltRoot, { recursive: true });

  const binaryPath = join(rebuiltRoot, manifestTargetFile("darwin-arm64"));
  const binary = await readFile(binaryPath);
  await writeFile(binaryPath, Buffer.concat([binary, Buffer.of(0)]));
  await assert.rejects(
    comparePrebuilds({ family: "all", committedRoot, rebuiltRoot }),
    /native-prebuild-byte-mismatch:darwin-arm64/u,
  );
  await writeFile(binaryPath, binary);

  await writeFile(join(rebuiltRoot, "manifest.json"), "{}\n", "utf8");
  await assert.rejects(
    comparePrebuilds({ family: "all", committedRoot, rebuiltRoot }),
    /native-prebuild-manifest-mismatch/u,
  );
  await cp(join(committedRoot, "manifest.json"), join(rebuiltRoot, "manifest.json"));

  await writeFile(join(rebuiltRoot, "provenance.json"), "{}\n", "utf8");
  await assert.rejects(
    comparePrebuilds({ family: "all", committedRoot, rebuiltRoot }),
    /native-prebuild-provenance-mismatch/u,
  );
  await cp(join(committedRoot, "provenance.json"), join(rebuiltRoot, "provenance.json"));

  await writeFile(join(rebuiltRoot, "unexpected.txt"), "unexpected\n", "utf8");
  await assert.rejects(
    comparePrebuilds({ family: "all", committedRoot, rebuiltRoot }),
    /native-prebuild-output-closure-mismatch/u,
  );
});

test("native prebuild assembly rejects divergent family provenance before merging", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "prism-native-prebuild-assemble-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const darwinRoot = join(temporary, "darwin");
  const linuxRoot = join(temporary, "linux");
  const outputRoot = join(temporary, "complete");

  for (const [root, family] of [[darwinRoot, "darwin"], [linuxRoot, "linux"]] as const) {
    await mkdir(root, { recursive: true });
    for (const target of targets.filter((candidate) => candidate.startsWith(`${family}-`))) {
      const relativePath = manifestTargetFile(target);
      await mkdir(join(root, target), { recursive: true });
      await cp(join(committedRoot, relativePath), join(root, relativePath));
    }
    await cp(join(committedRoot, "provenance.json"), join(root, "provenance.json"));
  }

  await writeFile(join(linuxRoot, "provenance.json"), "{}\n", "utf8");
  await assert.rejects(
    assemblePrebuilds({ darwinRoot, linuxRoot, outputRoot }),
    /native-prebuild-provenance-input-mismatch/u,
  );

  await cp(join(committedRoot, "provenance.json"), join(linuxRoot, "provenance.json"));
  await assemblePrebuilds({ darwinRoot, linuxRoot, outputRoot });
  assert.deepEqual((await readdir(outputRoot)).sort(), [...targets, "provenance.json"].sort());

  const manifestResult = spawnSync(process.execPath, [
    join(repositoryRoot, "packages", "cli", "native", "write-prebuild-manifest.mjs"),
    "--prebuilds-root",
    outputRoot,
  ], { encoding: "utf8" });
  assert.equal(manifestResult.status, 0, manifestResult.stderr);
  await comparePrebuilds({ family: "all", committedRoot, rebuiltRoot: outputRoot });

  const verifyResult = spawnSync(process.execPath, [
    join(repositoryRoot, "packages", "cli", "native", "verify-prebuilds.mjs"),
    "--prebuilds-root",
    outputRoot,
  ], { encoding: "utf8" });
  assert.equal(verifyResult.status, 0, verifyResult.stderr);
});

test("native prebuild workflow splits hosted rebuilds and attests only verified binaries", async () => {
  const workflow = await readFile(
    join(repositoryRoot, ".github", "workflows", "native-prebuilds.yml"),
    "utf8",
  );

  assert.match(workflow, /rebuild-darwin:[\s\S]*runs-on: macos-26/u);
  assert.match(workflow, /rebuild-linux:[\s\S]*runs-on: ubuntu-24\.04/u);
  assert.match(workflow, /exercise-darwin-x64:[\s\S]*runs-on: macos-26-intel/u);
  assert.match(workflow, /exercise-darwin-x64:[\s\S]*exercise-addon\.cjs[\s\S]*darwin-x64\/prism_authoring\.node/u);
  assert.match(workflow, /--family darwin/u);
  assert.match(workflow, /--family linux/u);
  assert.match(workflow, /assemble-prebuilds\.mjs --darwin-root/u);
  assert.match(workflow, /verify-native-prebuilds:[\s\S]*needs: \[exercise-darwin-x64, rebuild-linux\]/u);
  assert.match(workflow, /attest:[\s\S]*needs: verify-native-prebuilds/u);
  const document = parse(workflow) as {
    jobs?: { attest?: { if?: unknown } };
  };
  assert.equal(
    document.jobs?.attest?.if,
    "github.ref == 'refs/heads/main' && github.event.repository.private == false && (github.event_name == 'workflow_dispatch' || github.event_name == 'push')",
  );
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(workflow, /attest:[\s\S]*permissions:\n      contents: read\n      id-token: write\n      attestations: write\n      artifact-metadata: write/u);
  assert.doesNotMatch(workflow, /^\s+paths:/mu);
  assert.doesNotMatch(workflow, /node-version:/u);
  assert.ok([...workflow.matchAll(/node-version-file: \.node-version/gmu)].length >= 4);
  assert.ok(workflow.includes(prebuildProvenance.workflow.qemuImage));
  assert.ok(workflow.includes(prebuildProvenance.workflow.buildkitImage));

  const expectedActions = new Map([
    ["actions/checkout", ["d23441a48e516b6c34aea4fa41551a30e30af803", "v6"]],
    ["actions/setup-node", ["249970729cb0ef3589644e2896645e5dc5ba9c38", "v6"]],
    ["actions/upload-artifact", ["ea165f8d65b6e75b540449e92b4886f43607fa02", "v4"]],
    ["actions/download-artifact", ["018cc2cf5baa6db3ef3c5f8a56943fffe632ef53", "v6"]],
    ["actions/attest", ["1e69f48acb82d1966a394da916b4c1698aa569d6", "v4"]],
    ["docker/setup-qemu-action", ["1f40c72289eff860ee54a304f1438e3cff362e0a", "v4"]],
    ["docker/setup-buildx-action", ["37fe631027851001ddb9b187196cc803df7f5f0e", "v4"]],
  ]);
  const actionReferences = [...workflow.matchAll(
    /^\s*- uses: ([^@\s]+)@([0-9a-f]{40}) # (v\d+)$/gmu,
  )];
  assert.equal(actionReferences.length, [...workflow.matchAll(/^\s*- uses:/gmu)].length);
  for (const [, action, sha, version] of actionReferences) {
    assert.ok(action !== undefined && sha !== undefined && version !== undefined);
    assert.deepEqual([sha, version], expectedActions.get(action));
  }
  assert.ok(actionReferences.some((reference) => reference[1] === "actions/attest"));
  for (const target of targets) {
    assert.match(workflow, new RegExp(`${target}/prism_authoring\\.node`, "u"));
  }
});

function manifestTargetFile(target: string): string {
  return `${target}/prism_authoring.node`;
}
