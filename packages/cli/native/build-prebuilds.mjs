import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  nodeVersion,
  npmVersion,
  parseBuildArguments,
  prebuildProvenance,
  serializePrebuildProvenance,
  targetConfigurations,
  targetsForFamily,
} from "./prebuild-contract.mjs";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(nativeDirectory, "..");
const defaultPrebuildsDirectory = join(cliRoot, "prebuilds");
const nodePrefix = dirname(dirname(process.execPath));
const source = join(nativeDirectory, "prism_authoring.cc");

function run(label, command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: cliRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 600_000,
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
      SOURCE_DATE_EPOCH: prebuildProvenance.sourceDateEpoch,
      TZ: "UTC",
      ZERO_AR_DATE: "1",
    },
    ...options,
  });
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error(`native-prebuild-${label}-failed`);
  }
  return result;
}

function captured(label, command, arguments_) {
  const result = run(label, command, arguments_);
  return `${result.stdout}${result.stderr}`.trim();
}

function firstLine(value) {
  return value.split(/\r?\n/u)[0];
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`native-prebuild-${label}-mismatch`);
}

function validateVersions() {
  requireEqual(process.version, `v${nodeVersion}`, "node-version");
  requireEqual(captured("npm-version", "npm", ["--version"]), npmVersion, "npm-version");
}

function validateDarwinToolchain() {
  const xcode = captured("xcode-version", "xcodebuild", ["-version"]).split(/\r?\n/u);
  requireEqual(xcode[0], `Xcode ${prebuildProvenance.darwin.xcode}`, "xcode-version");
  requireEqual(xcode[1], `Build version ${prebuildProvenance.darwin.xcodeBuild}`, "xcode-build");
  requireEqual(
    firstLine(captured("clang-version", "xcrun", ["clang++", "--version"])),
    prebuildProvenance.darwin.compiler,
    "clang-version",
  );
  requireEqual(
    captured("sdk-version", "xcrun", ["--show-sdk-version"]),
    prebuildProvenance.darwin.sdk,
    "sdk-version",
  );
  requireEqual(
    firstLine(captured("linker-version", "xcrun", ["ld", "-v"])),
    prebuildProvenance.darwin.linker,
    "linker-version",
  );
}

async function buildDarwin(target, outputRoot) {
  const configuration = targetConfigurations[target];
  const output = join(outputRoot, target, "prism_authoring.node");
  await mkdir(dirname(output), { recursive: true });
  run(target, "xcrun", [
    "clang++",
    ...prebuildProvenance.commonCompilerFlags,
    `-fdebug-prefix-map=${cliRoot}=.`,
    `-ffile-prefix-map=${cliRoot}=.`,
    `-fmacro-prefix-map=${cliRoot}=.`,
    `-mmacosx-version-min=${prebuildProvenance.darwin.deploymentTarget}`,
    "-arch",
    configuration.architecture,
    "-I",
    join(nodePrefix, "include", "node"),
    ...prebuildProvenance.darwin.linkerFlags,
    "-o",
    output,
    source,
  ]);
  run(`${target}-strip`, "xcrun", ["strip", "-x", output]);
}

function expectedLinuxToolchain(toolchain) {
  const expected = prebuildProvenance.linux[toolchain];
  return `compiler=${expected.compiler}\nlinker=${expected.linker}\nstrip=${expected.strip}\n`;
}

async function buildLinux(target, outputRoot) {
  const configuration = targetConfigurations[target];
  const output = join(outputRoot, target);
  await mkdir(output, { recursive: true });
  run(target, "docker", [
    "buildx",
    "build",
    "--pull",
    "--platform",
    configuration.platform,
    "--target",
    configuration.stage,
    "--provenance=false",
    "--output",
    `type=local,dest=${output}`,
    "-f",
    "native/Dockerfile.prebuilds",
    ".",
  ]);
  const metadataPath = join(output, "toolchain.txt");
  requireEqual(
    await readFile(metadataPath, "utf8"),
    expectedLinuxToolchain(configuration.toolchain),
    `${target}-toolchain`,
  );
  await rm(metadataPath);
}

function exerciseDarwin(targetsToBuild, outputRoot, legacyAllMode) {
  const hostTarget = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  if (targetsToBuild.includes(hostTarget)) {
    run(`${hostTarget}-exercise`, process.execPath, [
      join(nativeDirectory, "exercise-addon.cjs"),
      join(outputRoot, hostTarget, "prism_authoring.node"),
    ]);
  }
  if (legacyAllMode && process.arch === "arm64") {
    run("darwin-x64-exercise", "arch", [
      "-x86_64",
      process.env.PRISM_NODE_X64 ?? process.execPath,
      join(nativeDirectory, "exercise-addon.cjs"),
      join(outputRoot, "darwin-x64", "prism_authoring.node"),
    ]);
  }
}

function exerciseLinux(target, outputRoot) {
  const configuration = targetConfigurations[target];
  const musl = configuration.toolchain === "musl";
  const image = prebuildProvenance.linux.targets[target].runtimeImage;
  const binary = `/prebuilds/${target}/prism_authoring.node`;
  const arguments_ = [
    "run",
    "--rm",
    "--platform",
    configuration.platform,
    "-v",
    `${outputRoot}:/prebuilds:ro`,
    "-v",
    `${join(nativeDirectory, "exercise-addon.cjs")}:/exercise-addon.cjs:ro`,
  ];
  if (musl) arguments_.push("-e", "PRISM_EXPECT_MUSL=1");
  arguments_.push(image, "node", "/exercise-addon.cjs", binary);
  run(`${target}-exercise`, "docker", arguments_);
}

async function main() {
  const { family, outputRoot } = parseBuildArguments(
    process.argv.slice(2),
    defaultPrebuildsDirectory,
  );
  validateVersions();
  if (family === "darwin" && process.platform !== "darwin") {
    throw new Error("native-prebuild-darwin-host-required");
  }
  if (family === "all" && process.platform !== "darwin") {
    throw new Error("native-prebuild-darwin-host-required");
  }

  const targetsToBuild = targetsForFamily(family);
  await mkdir(outputRoot, { recursive: true });
  if (targetsToBuild.some((target) => target.startsWith("darwin-"))) {
    validateDarwinToolchain();
    for (const target of targetsToBuild.filter((candidate) => candidate.startsWith("darwin-"))) {
      await buildDarwin(target, outputRoot);
    }
  }
  for (const target of targetsToBuild.filter((candidate) => candidate.startsWith("linux-"))) {
    await buildLinux(target, outputRoot);
  }

  await writeFile(join(outputRoot, "provenance.json"), serializePrebuildProvenance(), "utf8");
  if (family === "all") {
    run("manifest", process.execPath, [
      join(nativeDirectory, "write-prebuild-manifest.mjs"),
      "--prebuilds-root",
      outputRoot,
    ]);
  }

  if (family === "darwin" || family === "all") {
    exerciseDarwin(targetsToBuild, outputRoot, family === "all");
  }
  for (const target of targetsToBuild.filter((candidate) => candidate.startsWith("linux-"))) {
    exerciseLinux(target, outputRoot);
  }
  if (family === "all") {
    run("verify", process.execPath, [
      join(nativeDirectory, "verify-prebuilds.mjs"),
      "--prebuilds-root",
      outputRoot,
    ]);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "native-prebuild-failed"}\n`);
  process.exitCode = 1;
});
