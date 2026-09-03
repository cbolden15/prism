import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { serializePrebuildProvenance, targets, targetsForFamily } from "./prebuild-contract.mjs";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const defaultCommittedRoot = resolve(nativeDirectory, "..", "prebuilds");

function fail(code) {
  throw new Error(code);
}

function parseArguments(arguments_) {
  let family = "all";
  let committedRoot = defaultCommittedRoot;
  let rebuiltRoot;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--family") {
      family = value;
      index += 1;
    } else if (argument === "--committed-root") {
      committedRoot = value;
      index += 1;
    } else if (argument === "--rebuilt-root") {
      rebuiltRoot = value;
      index += 1;
    } else {
      fail("native-prebuild-compare-argument-invalid");
    }
  }

  targetsForFamily(family);
  if (typeof committedRoot !== "string" || typeof rebuiltRoot !== "string") {
    fail("native-prebuild-compare-root-required");
  }
  return { family, committedRoot: resolve(committedRoot), rebuiltRoot: resolve(rebuiltRoot) };
}

async function assertOutputClosure(root, family) {
  const expected = [
    ...targetsForFamily(family),
    "provenance.json",
    ...(family === "all" ? ["manifest.json"] : []),
  ].sort();
  const actual = (await readdir(root)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("native-prebuild-output-closure-mismatch");
  }
}

async function readManifest(root) {
  const bytes = await readFile(join(root, "manifest.json"));
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (JSON.stringify(Object.keys(manifest.targets ?? {})) !== JSON.stringify(targets)) {
    fail("native-prebuild-target-closure-mismatch");
  }
  for (const target of targets) {
    if (manifest.targets[target]?.file !== `${target}/prism_authoring.node`) {
      fail(`native-prebuild-manifest-target-invalid:${target}`);
    }
  }
  return { bytes, manifest };
}

export async function comparePrebuilds({ family, committedRoot, rebuiltRoot }) {
  const selectedTargets = targetsForFamily(family);
  await assertOutputClosure(rebuiltRoot, family);
  const committedManifest = await readManifest(committedRoot);

  for (const target of selectedTargets) {
    const relativePath = committedManifest.manifest.targets[target].file;
    const [committed, rebuilt] = await Promise.all([
      readFile(join(committedRoot, relativePath)),
      readFile(join(rebuiltRoot, relativePath)),
    ]);
    if (!committed.equals(rebuilt)) fail(`native-prebuild-byte-mismatch:${target}`);
  }

  const [committedProvenance, rebuiltProvenance] = await Promise.all([
    readFile(join(committedRoot, "provenance.json"), "utf8"),
    readFile(join(rebuiltRoot, "provenance.json"), "utf8"),
  ]);
  if (committedProvenance !== serializePrebuildProvenance()) {
    fail("native-prebuild-committed-provenance-invalid");
  }
  if (rebuiltProvenance !== committedProvenance) fail("native-prebuild-provenance-mismatch");

  if (family === "all") {
    const rebuiltManifestBytes = await readFile(join(rebuiltRoot, "manifest.json"));
    if (!rebuiltManifestBytes.equals(committedManifest.bytes)) {
      fail("native-prebuild-manifest-mismatch");
    }
    await readManifest(rebuiltRoot);
  }
}

async function main() {
  await comparePrebuilds(parseArguments(process.argv.slice(2)));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "native-prebuild-compare-failed"}\n`);
    process.exitCode = 1;
  });
}
