import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nativeDirectory = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(nativeDirectory, "..");
const buildRoot = join(nativeDirectory, "build");
const nodePrefix = dirname(dirname(process.execPath));
const source = join(nativeDirectory, "prism_authoring.cc");

function run(label, command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: cliRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120_000,
    ...options,
  });
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error(`native-test-${label}-failed`);
  }
}

function compile(name, extraDefinitions = []) {
  const output = join(buildRoot, name, "prism_authoring.node");
  mkdirSync(dirname(output), { recursive: true });
  const common = [
    "-std=c++17",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-Wpedantic",
    "-O2",
    "-fPIC",
    `-fdebug-prefix-map=${cliRoot}=.`,
    `-ffile-prefix-map=${cliRoot}=.`,
    `-fmacro-prefix-map=${cliRoot}=.`,
    "-DNAPI_VERSION=8",
    "-DNODE_GYP_MODULE_NAME=prism_authoring",
    ...extraDefinitions,
    "-I",
    join(nodePrefix, "include", "node"),
  ];
  const platform = process.platform === "darwin"
    ? [
      "-mmacosx-version-min=13.5",
      "-arch",
      process.arch === "x64" ? "x86_64" : process.arch,
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-Wl,-dead_strip",
    ]
    : ["-shared", "-Wl,--build-id=none"];
  run(`compile-${name}`, process.env.CXX ?? "c++", [
    ...common,
    ...platform,
    "-o",
    output,
    source,
  ]);
  return output;
}

function main() {
  if (process.version !== "v26.8.1") throw new Error("native-test-node-version-failed");
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error("native-test-platform-failed");
  }
  rmSync(buildRoot, { recursive: true, force: true });
  const host = compile("host");
  const fault = compile("fault", ["-DPRISM_AUTHORING_TEST_FORCE_FIRST_SYNC_FAILURE=1"]);
  const parentRace = compile("parent-race", ["-DPRISM_AUTHORING_TEST_PAUSE_BEFORE_PUBLICATION=1"]);
  run("suite", process.execPath, ["--test", join(nativeDirectory, "test-native.mjs")], {
    env: {
      ...process.env,
      PRISM_NATIVE_ADDON: host,
      PRISM_NATIVE_SYNC_FAILURE_ADDON: fault,
      PRISM_NATIVE_PARENT_RACE_ADDON: parentRace,
    },
    stdio: "inherit",
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "native-test-failed"}\n`);
  process.exitCode = 1;
}
