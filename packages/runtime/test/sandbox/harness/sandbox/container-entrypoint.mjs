import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pnhRoot = "/sandbox/pnh";
const runtimeRoot = "/sandbox/packages/runtime";
const coreDirectory = `${runtimeRoot}/src/core`;
const manifestPath = `/tmp/pnh-core-manifest-${process.pid}.json`;
const coverageDirectory = "/coverage/raw";
const reportDirectory = "/tmp/report";
const node = process.execPath;
const parentGuardPreload = `${runtimeRoot}/test/sandbox/harness/sandbox/parent-core-guard-preload.mjs`;
const supervisorPath = "/runner/sandbox-supervisor.mjs";
const tsxPreload = "/runner/tsx-preload.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return discoverTests(path);
      return entry.isFile() && /\.test\.(?:mjs|ts)$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function verifyCoverage(manifest) {
  const summary = JSON.parse(
    readFileSync(join(reportDirectory, "coverage-summary.json"), "utf8"),
  );
  const reportedFiles = Object.entries(summary).filter(([path]) => path !== "total");
  if (reportedFiles.length === 0) {
    throw new Error("c8 matched no original TypeScript source files");
  }
  for (const entry of Object.keys(manifest.files)) {
    const record = reportedFiles.find(([path]) => path.endsWith(`/${entry}`) || path === entry);
    if (record === undefined) throw new Error(`c8 omitted core source ${entry}`);
    const coverage = record[1];
    if (coverage.lines.total === 0 || coverage.lines.pct !== 100) {
      throw new Error(`c8 did not fully attribute ${entry}`);
    }
  }
}

function startSupervisor(manifest) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(node, [supervisorPath], {
      env: { HOME: "/tmp", PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "inherit", "pipe"],
    });
    let ready = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("sandbox supervisor did not become ready"));
    }, 5_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      ready += chunk;
      if (ready.includes("ready\n")) {
        clearTimeout(timeout);
        resolvePromise(child);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdio[3].end(JSON.stringify(manifest));
  });
}

function stopSupervisor(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null) {
      resolvePromise();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise();
    }, 2_000);
    child.once("close", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
    child.kill("SIGTERM");
  });
}

run(node, [
  "--import",
  tsxPreload,
  `${runtimeRoot}/test/sandbox/harness/sandbox/write-core-manifest.ts`,
  manifestPath,
], { env: { ...process.env, PNH_RUNNER_PACKAGE: "/runner/package.json" } });
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
rmSync(manifestPath);

const tests = process.argv.slice(2);
const testFiles = tests.length > 0 ? tests : discoverTests(`${pnhRoot}/tests`);
if (testFiles.length === 0) throw new Error("no PNH tests selected");
const unitTests = testFiles.filter((path) => path.endsWith(".test.mjs"));
const coverageTests = testFiles.filter((path) => path.endsWith(".test.ts"));

const supervisor = await startSupervisor(manifest);
try {
  if (unitTests.length > 0) {
    run(node, ["--import", parentGuardPreload, "--import", tsxPreload, "--test", ...unitTests], {
      env: { HOME: "/tmp", PATH: process.env.PATH, PNH_RUNNER_PACKAGE: "/runner/package.json" },
    });
  }
  if (coverageTests.length === 0) {
    throw new Error("no TypeScript PNH tests selected for coverage");
  }

  run("/runner/node_modules/.bin/c8", [
    "--all",
    "--extension",
    ".ts",
    "--100",
    "--merge-async",
    "--src",
    ".",
    "--include",
    "**/*.ts",
    "--temp-directory",
    coverageDirectory,
    "--reports-dir",
    reportDirectory,
    "--reporter",
    "text",
    "--reporter",
    "text-summary",
    "--reporter",
    "json-summary",
    node,
    "--import",
    parentGuardPreload,
    "--import",
    tsxPreload,
    "--test",
    ...coverageTests,
  ], {
    cwd: coreDirectory,
    env: { HOME: "/tmp", PATH: process.env.PATH, PNH_RUNNER_PACKAGE: "/runner/package.json" },
  });

  verifyCoverage(manifest);
} finally {
  await stopSupervisor(supervisor);
}
