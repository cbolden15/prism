import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

function fail(reason) { throw new Error(reason); }
function run(command, commandArguments, options) {
  const result = spawnSync(command, commandArguments, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  if (result.error || result.status !== 0) fail("gate-failed");
  return result.stdout;
}
function rootFromArguments(arguments_) {
  if (arguments_.length === 0) return process.cwd();
  if (arguments_.length !== 2 || arguments_[0] !== "--root" || arguments_[1].startsWith("-")) fail("invalid-arguments");
  return resolve(arguments_[1]);
}
function findBuildx() {
  const candidates = [];
  if (process.env.DOCKER_CONFIG) candidates.push(resolve(process.env.DOCKER_CONFIG, "cli-plugins", "docker-buildx"));
  if (process.env.HOME) candidates.push(resolve(process.env.HOME, ".docker", "cli-plugins", "docker-buildx"));
  candidates.push(
    "/Applications/Docker.app/Contents/Resources/cli-plugins/docker-buildx",
    "/usr/local/lib/docker/cli-plugins/docker-buildx",
    "/usr/local/libexec/docker/cli-plugins/docker-buildx",
    "/usr/lib/docker/cli-plugins/docker-buildx",
    "/usr/libexec/docker/cli-plugins/docker-buildx",
  );
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    candidates.push(resolve(directory, "docker-buildx"));
  }
  for (const candidate of candidates) {
    try {
      const physical = realpathSync(candidate);
      const metadata = statSync(physical);
      if (!metadata.isFile()) continue;
      accessSync(physical, constants.X_OK);
      return physical;
    } catch {
      // Try the next closed plugin location.
    }
  }
  fail("buildx-unavailable");
}
async function main() {
  const root = rootFromArguments(process.argv.slice(2));
  if (run("git", ["status", "--porcelain"], { cwd: root }).trim() !== "") fail("source-dirty");
  const expectedNodeVersion = readFileSync(resolve(root, ".node-version"), "utf8").trim();
  if (process.version !== `v${expectedNodeVersion}`
    || run("npm", ["--version"], { cwd: root }).trim() !== "11.19.0") fail("toolchain-mismatch");
  const head = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const temporary = await mkdtemp(join(realpathSync(root), "..", ".prism-clean-checkout-"));
  const checkout = resolve(temporary, "checkout");
  const home = resolve(temporary, "home");
  const config = resolve(temporary, "config");
  const state = resolve(temporary, "state");
  const cache = resolve(temporary, "npm-cache");
  const docker = resolve(temporary, "docker");
  try {
    const pluginDirectory = resolve(docker, "cli-plugins");
    await mkdir(pluginDirectory, { recursive: true, mode: 0o700 });
    await symlink(findBuildx(), resolve(pluginDirectory, "docker-buildx"), "file");
    run("git", ["worktree", "add", "--detach", checkout, head], { cwd: root });
    const environment = { ...process.env };
    for (const variable of ["BUILDX_CONFIG", "BUILDX_BUILDER", "BUILDKIT_HOST"]) delete environment[variable];
    Object.assign(environment, { HOME: home, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state, DOCKER_CONFIG: docker, npm_config_cache: cache, npm_config_update_notifier: "false" });
    for (const arguments_ of [["ci"], ["run", "build"], ["test"], ["run", "pack:check"], ["run", "check:release"]]) {
      run("npm", arguments_, { cwd: checkout, env: environment });
    }
  } finally {
    try { run("git", ["worktree", "remove", "--force", checkout], { cwd: root }); } catch { /* the temporary directory cleanup is the fallback */ }
    await rm(temporary, { recursive: true, force: true });
  }
  process.stdout.write("Prism clean-checkout release gate: ok\n");
}
main().catch((error) => {
  process.stderr.write(`Prism clean-checkout release gate failed: ${error instanceof Error ? error.message : "gate-failed"}\n`);
  process.exitCode = 1;
});
