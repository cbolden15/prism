import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { serializePrebuildProvenance, targetsForFamily } from "./prebuild-contract.mjs";

function fail(code) {
  throw new Error(code);
}

async function assertFamilyClosure(root, family) {
  const expected = [...targetsForFamily(family), "provenance.json"].sort();
  const actual = (await readdir(root)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`native-prebuild-${family}-input-closure-mismatch`);
  }
}

export async function assemblePrebuilds({ darwinRoot, linuxRoot, outputRoot }) {
  await Promise.all([
    assertFamilyClosure(darwinRoot, "darwin"),
    assertFamilyClosure(linuxRoot, "linux"),
  ]);
  const [darwinProvenance, linuxProvenance] = await Promise.all([
    readFile(join(darwinRoot, "provenance.json"), "utf8"),
    readFile(join(linuxRoot, "provenance.json"), "utf8"),
  ]);
  if (darwinProvenance !== linuxProvenance) {
    fail("native-prebuild-provenance-input-mismatch");
  }
  if (darwinProvenance !== serializePrebuildProvenance()) {
    fail("native-prebuild-provenance-input-invalid");
  }

  await mkdir(outputRoot, { recursive: true });
  if ((await readdir(outputRoot)).length !== 0) fail("native-prebuild-output-not-empty");
  for (const family of ["darwin", "linux"]) {
    const inputRoot = family === "darwin" ? darwinRoot : linuxRoot;
    for (const target of targetsForFamily(family)) {
      const outputDirectory = join(outputRoot, target);
      await mkdir(outputDirectory);
      await copyFile(
        join(inputRoot, target, "prism_authoring.node"),
        join(outputDirectory, "prism_authoring.node"),
      );
    }
  }
  await writeFile(join(outputRoot, "provenance.json"), darwinProvenance, "utf8");
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (!["--darwin-root", "--linux-root", "--output-root"].includes(argument) || value === undefined) {
      fail("native-prebuild-assemble-argument-invalid");
    }
    values[argument.slice(2)] = resolve(value);
    index += 1;
  }
  if (Object.keys(values).length !== 3) fail("native-prebuild-assemble-root-required");
  return {
    darwinRoot: values["darwin-root"],
    linuxRoot: values["linux-root"],
    outputRoot: values["output-root"],
  };
}

async function main() {
  await assemblePrebuilds(parseArguments(process.argv.slice(2)));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "native-prebuild-assemble-failed"}\n`);
    process.exitCode = 1;
  });
}
