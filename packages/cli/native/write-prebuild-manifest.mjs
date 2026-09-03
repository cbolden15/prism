import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { targets } from "./prebuild-contract.mjs";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(nativeDirectory, "..");
const defaultPrebuildsDirectory = join(cliRoot, "prebuilds");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(arguments_) {
  let prebuildsDirectory = defaultPrebuildsDirectory;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--prebuilds-root" || arguments_[index + 1] === undefined) {
      throw new Error("native-prebuild-manifest-argument-invalid");
    }
    prebuildsDirectory = resolve(arguments_[index + 1]);
    index += 1;
  }
  return prebuildsDirectory;
}

async function main() {
  const prebuildsDirectory = parseArguments(process.argv.slice(2));
  const source = await readFile(join(nativeDirectory, "prism_authoring.cc"));
  const targetEntries = {};
  for (const target of targets) {
    const file = `${target}/prism_authoring.node`;
    targetEntries[target] = { file, sha256: sha256(await readFile(join(prebuildsDirectory, file))) };
  }

  await writeFile(join(prebuildsDirectory, "manifest.json"), `${JSON.stringify({
    version: "prism-native-authoring-prebuilds-v1",
    nodeApi: 8,
    source: "native/prism_authoring.cc",
    sourceSha256: sha256(source),
    targets: targetEntries,
  }, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "native-prebuild-manifest-failed"}\n`);
  process.exitCode = 1;
});
