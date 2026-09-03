import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
const runtimePackageDirectory = realpathSync.native(resolve(harnessDirectory, "..", "..", ".."));
const repositoryRoot = realpathSync.native(resolve(runtimePackageDirectory, "..", ".."));
const pnhDirectory = realpathSync.native(resolve(repositoryRoot, "pnh"));
const packagesDirectory = realpathSync.native(resolve(repositoryRoot, "packages"));
const assuranceDirectory = realpathSync.native(resolve(repositoryRoot, "assurance"));
const sandboxDirectory = joinHarness("sandbox");
const lock = JSON.parse(readFileSync(joinSandbox("image.lock.json"), "utf8"));
const image = "prism-sandbox:node-26.8.1";

function joinHarness(path) {
  return resolve(harnessDirectory, path);
}

function joinSandbox(path) {
  return resolve(sandboxDirectory, path);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr ?? result.stdout ?? ""}`);
  }
  return result.stdout;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function selectedTests(arguments_) {
  return arguments_.map((value) => {
    const path = resolve(repositoryRoot, value);
    if (!isInside(pnhDirectory, path) || !path.endsWith(".test.ts") || !existsSync(path)) {
      throw new Error(`invalid PNH test path: ${value}`);
    }
    return `/sandbox/pnh/${relative(pnhDirectory, path).split(sep).join("/")}`;
  });
}

function buildImage() {
  const containerfile = readFileSync(joinSandbox("Containerfile"), "utf8");
  if (!containerfile.includes(lock.indexDigest)) {
    throw new Error("Containerfile base digest does not match image.lock.json");
  }
  run("docker", ["version", "--format", "{{.Server.Version}}"]);

  const context = mkdtempSync(join(tmpdir(), "pnh-sandbox-context-"));
  try {
    copyFileSync(joinSandbox("Containerfile"), resolve(context, "Containerfile"));
    copyFileSync(joinSandbox("container-entrypoint.mjs"), resolve(context, "container-entrypoint.mjs"));
    copyFileSync(joinSandbox("sandbox-supervisor.mjs"), resolve(context, "sandbox-supervisor.mjs"));
    copyFileSync(joinSandbox("tsx-preload.mjs"), resolve(context, "tsx-preload.mjs"));
    copyFileSync(resolve(repositoryRoot, "package.json"), resolve(context, "package.json"));
    copyFileSync(resolve(repositoryRoot, "package-lock.json"), resolve(context, "package-lock.json"));
    run("docker", ["build", "--pull=false", "--tag", image, "--file", resolve(context, "Containerfile"), context], {
      stdio: "inherit",
    });
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
}

function runSandbox() {
  const tests = selectedTests(process.argv.slice(2));
  buildImage();
  run("docker", [
    "run",
    "--rm",
    "--init",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "128",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--user",
    "10001:10001",
    "--workdir",
    "/sandbox/pnh",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777",
    "--mount",
    "type=volume,destination=/coverage",
    "--env",
    "HOME=/tmp",
    "--env",
    "NODE_OPTIONS=--disable-proto=throw",
    "--mount",
    `type=bind,src=${pnhDirectory},dst=/sandbox/pnh,readonly`,
    "--mount",
    `type=bind,src=${packagesDirectory},dst=/sandbox/packages,readonly`,
    "--mount",
    `type=bind,src=${assuranceDirectory},dst=/sandbox/assurance,readonly`,
    "--mount",
    `type=bind,src=${resolve(repositoryRoot, "docs", "plans", "provider-neutral-harness")},dst=/sandbox/docs/plans/provider-neutral-harness,readonly`,
    "--mount",
    `type=bind,src=${resolve(repositoryRoot, "README.md")},dst=/sandbox/README.md,readonly`,
    "--mount",
    `type=bind,src=${resolve(repositoryRoot, "docs", "assurance")},dst=/sandbox/docs/assurance,readonly`,
    "--mount",
    `type=bind,src=${resolve(repositoryRoot, "docs", "developer-preview")},dst=/sandbox/docs/developer-preview,readonly`,
    "--mount",
    `type=bind,src=${resolve(repositoryRoot, "docs", "releases", "developer-preview")},dst=/sandbox/docs/releases/developer-preview,readonly`,
    image,
    "node",
    "/runner/container-entrypoint.mjs",
    ...tests,
  ], { stdio: "inherit" });
}

run(resolve(repositoryRoot, "node_modules", ".bin", "tsx"), [
  "--test",
  "--test-concurrency=1",
  resolve(pnhDirectory, "host-tests", "m1-tool-vertical-slice.test.ts"),
  resolve(pnhDirectory, "host-tests", "m1-tool-failure-paths.test.ts"),
  resolve(pnhDirectory, "host-tests", "m2-plugin-registration.test.ts"),
  resolve(pnhDirectory, "host-tests", "spawn-lifecycle-port.test.ts"),
], { stdio: "inherit" });
runSandbox();
