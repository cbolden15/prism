import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { stageBundledPackageForPack } from "./release/stage-bundled-package.mjs";

const repositoryRoot = realpathSync(resolve(import.meta.dirname, ".."));
const packageDirectories = Object.freeze(["sdk", "runtime", "provider-ollama", "cli"]);
const candidateArguments = process.argv.slice(2);
if (candidateArguments.length !== 0 && (candidateArguments.length !== 2 || candidateArguments[0] !== "--candidate" || candidateArguments[1].startsWith("-"))) {
  throw new Error("Usage: node scripts/test-packed-install.mjs [--candidate <path>]");
}
const candidateRoot = candidateArguments.length === 0 ? undefined : realpathSync(resolve(candidateArguments[1]));
const goal = "Count the words in: one two three";
const ollamaGoal = "Find the Prism packed acceptance marker and name its file.";
const ollamaMarker = "indigo-orbit-47";
const ollamaModel = "qwen2.5:14b";
const pluginCheckWarning = "Warning: plugin check executes plugin code with ambient host authority; it is not a sandbox.\n";
const pluginFiles = Object.freeze(["README.md", "index.mjs", "index.test.mjs", "manifest.json"]);
const authoringRootBasename = "prism-plugins";
const authoringMarkerName = ".prism-authoring-root-v1";
const authoringMarkerContents = "prism-managed-authoring-root-v1\n";
const nativeTargets = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
]);
const expectedEventTypes = [
  "goal.accepted",
  "provider.tool-requested",
  "policy.allowed",
  "tool.completed",
  "provider.finalized",
  "run.completed",
];

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: 60_000,
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${command} ${arguments_.join(" ")} exited ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function documentedHereDocument(contents, path) {
  const opening = `cat > ${path} <<'EOF'\n`;
  const start = contents.indexOf(opening);
  assert.notEqual(start, -1, `README omits ${path} here-document`);
  const bodyStart = start + opening.length;
  const end = contents.indexOf("\nEOF\n", bodyStart);
  assert.notEqual(end, -1, `README does not terminate ${path} here-document`);
  return `${contents.slice(bodyStart, end)}\n`;
}

function snapshotTree(root) {
  const entries = [];
  const visit = (path) => {
    const metadata = lstatSync(path);
    const name = relative(root, path) || ".";
    if (metadata.isDirectory()) {
      entries.push({ path: name, kind: "directory", mode: metadata.mode & 0o777 });
      for (const entry of readdirSync(path).sort()) visit(resolve(path, entry));
      return;
    }
    if (metadata.isFile()) {
      entries.push({ path: name, kind: "file", mode: metadata.mode & 0o777, sha256: digest(readFileSync(path)) });
      return;
    }
    entries.push({ path: name, kind: metadata.isSymbolicLink() ? "symlink" : "special" });
  };
  visit(root);
  return entries;
}

function hostNativeTarget() {
  if (process.platform === "darwin" && ["arm64", "x64"].includes(process.arch)) {
    return `darwin-${process.arch}`;
  }
  if (process.platform === "linux" && ["arm64", "x64"].includes(process.arch)) {
    const report = process.report.getReport();
    const libc = typeof report.header.glibcVersionRuntime === "string" ? "gnu" : "musl";
    return `linux-${process.arch}-${libc}`;
  }
  throw new Error(`packed acceptance has no native target for ${process.platform}-${process.arch}`);
}

async function startOllamaStub(input) {
  const child = spawn(process.execPath, [resolve(repositoryRoot, "scripts", "support", "ollama-stub.mjs")], {
    cwd: input.cwd,
    env: {
      ...input.environment,
      PRISM_OLLAMA_STUB_MODEL: ollamaModel,
      PRISM_OLLAMA_STUB_STATS: input.statsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const origin = await new Promise((resolvePromise, rejectPromise) => {
      let stdout = "";
      const timeout = setTimeout(() => rejectPromise(new Error(`Ollama stub startup timed out\n${stderr}`)), 5_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const newline = stdout.indexOf("\n");
        if (newline === -1) return;
        clearTimeout(timeout);
        resolvePromise(stdout.slice(0, newline));
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      });
      child.once("exit", (code) => {
        if (stdout.includes("\n")) return;
        clearTimeout(timeout);
        rejectPromise(new Error(`Ollama stub exited ${code}\n${stderr}`));
      });
    });
    return { child, origin };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function stopOllamaStub(stub) {
  if (stub === undefined || stub.child.exitCode !== null) return;
  await new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      stub.child.kill("SIGKILL");
      resolvePromise();
    }, 2_000);
    stub.child.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
    stub.child.kill("SIGTERM");
  });
}

function assertPackList(packageName, packed) {
  assert.equal(packed.length, 1, `${packageName} must produce exactly one tarball`);
  const paths = packed[0].files.map(({ path }) => path);
  const forbidden = paths
    .filter((path) => (
      path.startsWith("/") ||
      path.startsWith("../") ||
      path.includes("/../") ||
      path.startsWith("src/") ||
      path.startsWith("test/") ||
      path.includes("/test/") ||
      path.startsWith("scripts/") ||
      path.startsWith("docs/ai/workstreams/") ||
      path.endsWith(".tsbuildinfo") ||
      path.endsWith(".map") ||
      /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$))/iu.test(path)
  ));
  assert.deepEqual(forbidden, [], `${packageName} packed forbidden build/source files`);
  for (const path of ["package.json", "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(paths.includes(path), `${packageName} tarball omits ${path}`);
  }
  if (packageName === "@useprism/cli") {
    assert.deepEqual(packed[0].bundled, ["acorn", "acorn-walk"]);
    assert.ok(paths.includes("node_modules/acorn/package.json"), "CLI tarball omits bundled Acorn");
    assert.ok(paths.includes("node_modules/acorn-walk/package.json"), "CLI tarball omits bundled Acorn walk");
    assert.ok(paths.includes("node_modules/acorn/LICENSE"), "CLI tarball omits bundled Acorn license");
    assert.ok(paths.includes("node_modules/acorn-walk/LICENSE"), "CLI tarball omits bundled Acorn walk license");
    assert.ok(paths.includes("native/prism_authoring.cc"), "CLI tarball omits native source");
    assert.ok(paths.includes("prebuilds/manifest.json"), "CLI tarball omits native prebuild manifest");
    assert.ok(paths.includes("prebuilds/provenance.json"), "CLI tarball omits native prebuild provenance");
    for (const target of nativeTargets) {
      assert.ok(
        paths.includes(`prebuilds/${target}/prism_authoring.node`),
        `CLI tarball omits native prebuild ${target}`,
      );
    }
  }
}

function assertNoCheckoutReferences(directory) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(resolve(path, entry));
      return;
    }
    if (!stat.isFile() || stat.size > 20_000_000) return;
    if (path.endsWith(".node")) {
      const contents = readFileSync(path);
      assert.equal(
        contents.includes(Buffer.from(repositoryRoot)),
        false,
        `installed native binary references source checkout: ${path}`,
      );
      return;
    }
    if (/\.(?:c?js|mjs|json|d\.ts|cc|h)$/u.test(path)) {
      const contents = readFileSync(path, "utf8");
      assert.equal(contents.includes(repositoryRoot), false, `installed file references source checkout: ${path}`);
    }
  };
  visit(directory);
}

function assertNoCheckoutSymlinks(directory) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      assert.equal(isWithin(repositoryRoot, target), false, `installed symlink resolves into checkout: ${path}`);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path)) visit(resolve(path, entry));
  };
  visit(directory);
}

function candidateTarballs(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, "candidate.json"), "utf8"));
  const expected = [
    "@useprism/cli",
    "@useprism/provider-ollama",
    "@useprism/runtime",
    "@useprism/sdk",
  ];
  assert.equal(manifest.version, "prism-developer-preview-candidate-v1");
  assert.deepEqual(manifest.packages.map(({ name }) => name), expected);
  return manifest.packages.map(({ file }) => {
    const path = resolve(root, "packages", file);
    assert.equal(isWithin(root, path), true, "candidate package path escapes candidate root");
    assert.equal(lstatSync(path).isSymbolicLink(), false, "candidate package must not be a symlink");
    return path;
  });
}

const temporaryRoot = realpathSync(mkdtempSync(join(repositoryRoot, "..", ".prism-packed-install-")));
let ollamaStub;
try {
  const tarballRoot = resolve(temporaryRoot, "tarballs");
  const installRoot = resolve(temporaryRoot, "install");
  const workingRoot = resolve(temporaryRoot, "work");
  const homeRoot = resolve(temporaryRoot, "home");
  const configRoot = resolve(temporaryRoot, "xdg-config");
  const stateRoot = resolve(temporaryRoot, "xdg-state");
  const cacheRoot = resolve(temporaryRoot, "npm-cache");
  const ollamaStatsPath = resolve(temporaryRoot, "ollama-stub-stats.json");
  for (const directory of [tarballRoot, installRoot, workingRoot, homeRoot, configRoot, stateRoot, cacheRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(resolve(installRoot, "package.json"), JSON.stringify({
    name: "prism-packed-acceptance",
    version: "1.0.0",
    private: true,
    type: "module",
  }, null, 2));

  const npmEnvironment = {
    ...process.env,
    HOME: homeRoot,
    XDG_CONFIG_HOME: configRoot,
    XDG_STATE_HOME: stateRoot,
    npm_config_cache: cacheRoot,
    npm_config_update_notifier: "false",
  };
  const tarballs = candidateRoot === undefined ? [] : candidateTarballs(candidateRoot);
  if (candidateRoot === undefined) {
    for (const directory of packageDirectories) {
      const packageRoot = resolve(repositoryRoot, "packages", directory);
      const packRoot = await stageBundledPackageForPack({
        packageRoot,
        dependencyRoot: resolve(repositoryRoot, "node_modules"),
        stagingRoot: resolve(temporaryRoot, "pack-staging", directory),
      });
      const result = run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot], {
        cwd: packRoot,
        env: npmEnvironment,
      });
      const packed = JSON.parse(result.stdout);
      assertPackList(`@useprism/${directory}`, packed);
      tarballs.push(resolve(tarballRoot, packed[0].filename));
    }
  }

  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    ...tarballs,
  ], { cwd: installRoot, env: npmEnvironment });

  const installedModules = resolve(installRoot, "node_modules");
  assertNoCheckoutSymlinks(installedModules);
  assertNoCheckoutReferences(installedModules);
  const installedCliRoot = resolve(installedModules, "@useprism", "cli");
  const installedPrebuildManifest = JSON.parse(readFileSync(
    resolve(installedCliRoot, "prebuilds", "manifest.json"),
    "utf8",
  ));
  assert.equal(installedPrebuildManifest.version, "prism-native-authoring-prebuilds-v1");
  assert.equal(installedPrebuildManifest.nodeApi, 8);
  assert.equal(installedPrebuildManifest.source, "native/prism_authoring.cc");
  assert.deepEqual(Object.keys(installedPrebuildManifest.targets), nativeTargets);
  assert.equal(
    digest(readFileSync(resolve(installedCliRoot, installedPrebuildManifest.source))),
    installedPrebuildManifest.sourceSha256,
  );
  for (const target of nativeTargets) {
    const entry = installedPrebuildManifest.targets[target];
    assert.deepEqual(Object.keys(entry), ["file", "sha256"]);
    assert.equal(entry.file, `${target}/prism_authoring.node`);
    assert.equal(
      digest(readFileSync(resolve(installedCliRoot, "prebuilds", entry.file))),
      entry.sha256,
    );
  }
  const installedNativeTarget = hostNativeTarget();
  const installedNativeEntry = installedPrebuildManifest.targets[installedNativeTarget];
  assert.deepEqual(Object.keys(installedNativeEntry), ["file", "sha256"]);
  assert.equal(installedNativeEntry.file, `${installedNativeTarget}/prism_authoring.node`);
  const installedNativeAddon = resolve(installedCliRoot, "prebuilds", installedNativeEntry.file);
  assert.equal(digest(readFileSync(installedNativeAddon)), installedNativeEntry.sha256);

  const auditLog = resolve(temporaryRoot, "module-audit.log");
  const guardPath = resolve(temporaryRoot, "source-checkout-guard.mjs");
  writeFileSync(guardPath, `
import { appendFileSync, realpathSync } from "node:fs";
import { registerHooks } from "node:module";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = realpathSync(process.env.PRISM_SOURCE_CHECKOUT);
const auditLog = process.env.PRISM_MODULE_AUDIT_LOG;
const isWithin = (parent, candidate) => candidate === parent || candidate.startsWith(parent + sep);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.startsWith("file:")) {
      const path = realpathSync(fileURLToPath(result.url));
      appendFileSync(auditLog, path + "\\n");
      if (isWithin(sourceRoot, path)) throw new Error("loaded module resolved into source checkout: " + path);
    }
    return result;
  },
});

const originalDlopen = process.dlopen;
process.dlopen = function(module, filename, flags) {
  appendFileSync(auditLog, "native-descriptor:" + filename + "\\n");
  return flags === undefined
    ? originalDlopen.call(process, module, filename)
    : originalDlopen.call(process, module, filename, flags);
};
`);

  const binary = resolve(installRoot, "node_modules", ".bin", "prism");
  const cliEnvironment = {
    ...npmEnvironment,
    NODE_PATH: "",
    NODE_OPTIONS: `--import=${pathToFileURL(guardPath).href}`,
    PRISM_SOURCE_CHECKOUT: repositoryRoot,
    PRISM_MODULE_AUDIT_LOG: auditLog,
  };

  const init = run(binary, ["init", "--provider", "deterministic", "--scope", "user", "--yes"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(init.stderr, "");
  assert.match(init.stdout, /^Initialized user config for deterministic\./);
  const configPath = resolve(configRoot, "prism", "config.json");
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), {
    version: "prism-config-v1",
    provider: "deterministic",
  });
  assert.equal(lstatSync(configPath).mode & 0o777, 0o600);

  const doctor = run(binary, ["doctor"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(doctor.stderr, "");
  assert.match(doctor.stdout, /^Prism doctor: ok\n/);

  const execution = run(binary, ["run", goal], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(execution.stderr, "");
  const runId = execution.stdout.match(/^3 words\nRun: ([0-9a-f-]{36})\n$/)?.[1];
  assert.ok(runId, "packed run did not expose its run ID");
  const recordPath = resolve(stateRoot, "prism", "runs", `${runId}.json`);
  assert.equal(lstatSync(recordPath).mode & 0o777, 0o600);

  const inspection = run(binary, ["inspect", "--json", runId], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(inspection.stderr, "");
  const record = JSON.parse(inspection.stdout);
  assert.equal(record.version, "prism-run-record-v1");
  assert.equal(record.runId, runId);
  assert.equal(record.workspace, workingRoot);
  assert.equal(record.provider, "deterministic");
  assert.equal(record.terminal.status, "completed");
  assert.equal(record.terminal.answer, "3 words");
  assert.deepEqual(record.events.map(({ type }) => type), expectedEventTypes);
  assert.equal(JSON.stringify(record.trace).includes("one two three"), false);

  writeFileSync(resolve(workingRoot, "FACTS.md"), `The Prism packed acceptance marker is ${ollamaMarker}.\n`, "utf8");
  ollamaStub = await startOllamaStub({
    cwd: temporaryRoot,
    environment: npmEnvironment,
    statsPath: ollamaStatsPath,
  });
  const ollamaInit = run(binary, [
    "init",
    "--provider",
    "ollama",
    "--model",
    ollamaModel,
    "--endpoint",
    ollamaStub.origin,
    "--scope",
    "project",
    "--yes",
  ], { cwd: workingRoot, timeout: 30_000, env: cliEnvironment });
  assert.equal(ollamaInit.stderr, "");
  assert.match(ollamaInit.stdout, /^Initialized project config for ollama\./);

  const ollamaDoctor = run(binary, ["doctor"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(ollamaDoctor.stderr, "");
  assert.match(ollamaDoctor.stdout, /^Prism doctor: ok\n/);
  assert.match(ollamaDoctor.stdout, /Provider: ollama\n/);

  const ollamaExecution = run(binary, ["run", ollamaGoal], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(ollamaExecution.stderr, "");
  const ollamaRunId = ollamaExecution.stdout.match(new RegExp(
    `^The packed acceptance marker is ${ollamaMarker} in FACTS\\.md\\.\\nRun: ([0-9a-f-]{36})\\n$`,
  ))?.[1];
  assert.ok(ollamaRunId, "packed Ollama run did not expose its run ID");

  const ollamaInspection = run(binary, ["inspect", "--json", ollamaRunId], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(ollamaInspection.stderr, "");
  const ollamaRecord = JSON.parse(ollamaInspection.stdout);
  assert.equal(ollamaRecord.version, "prism-run-record-v2");
  assert.equal(ollamaRecord.provider, "ollama");
  assert.equal(ollamaRecord.model, ollamaModel);
  assert.equal(ollamaRecord.terminal.status, "completed");
  assert.equal(ollamaRecord.terminal.answer, `The packed acceptance marker is ${ollamaMarker} in FACTS.md.`);
  assert.deepEqual(ollamaRecord.events.map(({ type }) => type), expectedEventTypes);
  assert.equal(ollamaRecord.trace.length, 1);
  assert.equal(ollamaRecord.trace[0].tool, "repository");
  assert.equal(ollamaRecord.trace[0].operation, "search");
  assert.equal(ollamaRecord.trace[0].path, ".");
  assert.equal(ollamaRecord.trace[0].output.resultCount, 1);
  assert.deepEqual(ollamaRecord.trace[0].output.paths, ["FACTS.md"]);
  assert.deepEqual(ollamaRecord.trace[0].redactions, { content: true, query: true, excerpts: true });
  assert.equal(JSON.stringify(ollamaRecord.trace).includes(ollamaMarker), false);
  const ollamaStats = JSON.parse(readFileSync(ollamaStatsPath, "utf8"));
  assert.equal(ollamaStats.tags, 1);
  assert.equal(ollamaStats.generate, 2);

  const projectDeterministicInit = run(binary, [
    "init",
    "--provider",
    "deterministic",
    "--scope",
    "project",
    "--yes",
  ], { cwd: workingRoot, timeout: 30_000, env: cliEnvironment });
  assert.equal(projectDeterministicInit.stderr, "");
  assert.equal(
    projectDeterministicInit.stdout,
    `Initialized project config for deterministic.\n${resolve(workingRoot, ".prism", "config.json")}\n`,
  );
  assert.deepEqual(JSON.parse(readFileSync(resolve(workingRoot, ".prism", "config.json"), "utf8")), {
    version: "prism-config-v1",
    provider: "deterministic",
  });

  const pluginId = "release-slug";
  const pluginSentinel = resolve(workingRoot, "outside-plugin-sentinel.txt");
  const pluginSideEffectPath = resolve(homeRoot, "plugin-side-effect.txt");
  writeFileSync(pluginSentinel, "outside-plugin-sentinel\n", "utf8");
  const pluginCreate = run(binary, ["plugin", "create", pluginId], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginCreate.stderr, "");
  assert.equal(pluginCreate.stdout, `Created tool plugin: ${pluginId}\n`);
  const authoringRoot = resolve(workingRoot, authoringRootBasename);
  assert.equal(lstatSync(authoringRoot).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(authoringRoot).sort(), [authoringMarkerName, pluginId].sort());
  const authoringMarkerPath = resolve(authoringRoot, authoringMarkerName);
  assert.equal(lstatSync(authoringMarkerPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(authoringMarkerPath, "utf8"), authoringMarkerContents);
  const authoringMarkerSnapshot = {
    contents: readFileSync(authoringMarkerPath, "utf8"),
    sha256: digest(readFileSync(authoringMarkerPath)),
  };
  const pluginRoot = resolve(authoringRoot, pluginId);
  assert.deepEqual(readdirSync(pluginRoot).sort(), pluginFiles);
  for (const file of pluginFiles) {
    assert.equal(lstatSync(resolve(pluginRoot, file)).mode & 0o777, 0o644);
  }
  const workflowDocumentation = readFileSync(resolve(candidateRoot ?? repositoryRoot, "README.md"), "utf8");
  const slugPluginSource = documentedHereDocument(
    workflowDocumentation,
    "prism-plugins/release-slug/index.mjs",
  );
  const slugPluginTest = documentedHereDocument(
    workflowDocumentation,
    "prism-plugins/release-slug/index.test.mjs",
  );
  writeFileSync(resolve(pluginRoot, "index.mjs"), slugPluginSource, "utf8");
  writeFileSync(resolve(pluginRoot, "index.test.mjs"), slugPluginTest, "utf8");
  const slugPluginSnapshot = Object.fromEntries(pluginFiles.map((file) => {
    const contents = readFileSync(resolve(pluginRoot, file), "utf8");
    return [file, { contents, sha256: digest(contents) }];
  }));
  assert.deepEqual(readdirSync(pluginRoot).sort(), pluginFiles);
  assert.deepEqual(JSON.parse(readFileSync(resolve(pluginRoot, "manifest.json"), "utf8")).files, ["index.mjs"]);
  assert.equal(slugPluginSnapshot["index.mjs"].contents.includes('operation: "slugify"'), true);

  const generatedTest = run(process.execPath, ["--test", "index.test.mjs"], {
    cwd: pluginRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.match(generatedTest.stdout, /pass 1/u);

  const pluginCheckRoot = resolve(temporaryRoot, "plugin-check-work");
  mkdirSync(pluginCheckRoot);
  const pluginCheck = run(binary, ["plugin", "check", pluginRoot, "--json"], {
    cwd: pluginCheckRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginCheck.stderr, pluginCheckWarning);
  assert.deepEqual(JSON.parse(pluginCheck.stdout), {
    version: "prism-plugin-check-result-v1",
    status: "ok",
    pluginId,
    kind: "tool",
    operation: "slugify",
    executionBoundary: "ambient-subprocess",
    sandboxed: false,
    cleanup: "original-process-group-confirmed",
    detachedDescendants: "not-controlled",
  });
  assert.deepEqual(Object.fromEntries(pluginFiles.map((file) => {
    const contents = readFileSync(resolve(pluginRoot, file), "utf8");
    return [file, { contents, sha256: digest(contents) }];
  })), slugPluginSnapshot);
  assert.deepEqual({
    contents: readFileSync(authoringMarkerPath, "utf8"),
    sha256: digest(readFileSync(authoringMarkerPath)),
  }, authoringMarkerSnapshot);
  assert.deepEqual(readdirSync(authoringRoot).sort(), [authoringMarkerName, pluginId].sort());
  assert.equal(readFileSync(pluginSentinel, "utf8"), "outside-plugin-sentinel\n");

  const pluginDeclaration = run(binary, [
    "plugin",
    "declare",
    `${authoringRootBasename}/${pluginId}`,
    "--operation",
    "slugify",
  ], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginDeclaration.stderr, "");
  assert.equal(pluginDeclaration.stdout, `Declared project tool plugin: ${authoringRootBasename}/${pluginId} (slugify)\n`);
  const declarationPath = resolve(workingRoot, ".prism", "tool-plugin.json");
  const entrypointPath = resolve(pluginRoot, "index.mjs");
  assert.deepEqual(JSON.parse(readFileSync(declarationPath, "utf8")), {
    version: "prism-project-tool-plugin-v1",
    path: "prism-plugins/release-slug",
    operation: "slugify",
  });
  const beforeApproval = {
    workspace: snapshotTree(workingRoot),
    config: snapshotTree(configRoot),
    state: snapshotTree(stateRoot),
  };
  const pluginApproval = run(binary, ["plugin", "approval", "--json"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginApproval.stderr, "");
  const proposalPath = resolve(temporaryRoot, "release-slug-approval-proposal.json");
  writeFileSync(proposalPath, pluginApproval.stdout, "utf8");
  const approval = JSON.parse(readFileSync(proposalPath, "utf8"));
  assert.deepEqual(Object.keys(approval), [
    "version",
    "workspace",
    "projectConfigDigest",
    "declaredPath",
    "canonicalPluginPath",
    "operation",
    "plugin",
    "approvalDigest",
    "executionBoundary",
    "sandboxed",
    "warning",
  ]);
  assert.equal(approval.version, "prism-project-plugin-approval-proposal-v1");
  assert.equal(approval.workspace, workingRoot);
  assert.equal(approval.projectConfigDigest, digest(readFileSync(declarationPath)));
  assert.equal(approval.declaredPath, `${authoringRootBasename}/${pluginId}`);
  assert.equal(approval.canonicalPluginPath, pluginRoot);
  assert.equal(approval.operation, "slugify");
  assert.equal(approval.plugin.id, pluginId);
  assert.deepEqual(Object.keys(approval.plugin), [
    "id",
    "manifestDigest",
    "sourceDigest",
    "registryDigest",
    "versionDigest",
    "runnerDigest",
    "imageDigest",
    "profileDigest",
  ]);
  for (const commitment of [
    approval.plugin.manifestDigest,
    approval.plugin.sourceDigest,
    approval.plugin.registryDigest,
    approval.plugin.versionDigest,
    approval.plugin.runnerDigest,
    approval.plugin.imageDigest,
    approval.plugin.profileDigest,
    approval.approvalDigest,
  ]) assert.match(commitment, /^[0-9a-f]{64}$/u);
  assert.equal(approval.executionBoundary, "ambient-subprocess");
  assert.equal(approval.sandboxed, false);
  assert.equal(approval.warning, "Plugin admission and approval are not safety or sandboxing; plugin execution has ambient host authority.");
  assert.equal(approval.approvalDigest, digest(JSON.stringify([
    "prism-project-plugin-approval-digest-v1",
    workingRoot,
    digest(readFileSync(declarationPath)),
    "prism-plugins/release-slug",
    pluginRoot,
    "slugify",
    pluginId,
    approval.plugin.manifestDigest,
    approval.plugin.sourceDigest,
    approval.plugin.registryDigest,
    approval.plugin.versionDigest,
    approval.plugin.runnerDigest,
    approval.plugin.imageDigest,
    approval.plugin.profileDigest,
  ])));
  assert.deepEqual({
    workspace: snapshotTree(workingRoot),
    config: snapshotTree(configRoot),
    state: snapshotTree(stateRoot),
  }, beforeApproval);

  const pluginApprove = run(binary, ["plugin", "approve", "--digest", approval.approvalDigest], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginApprove.stderr, "");
  assert.equal(pluginApprove.stdout, `Approved project tool plugin ${pluginId}: ${approval.approvalDigest}\n`);
  assert.deepEqual(snapshotTree(workingRoot), beforeApproval.workspace);

  const workspaceKey = digest(approval.workspace);
  const approvalRoot = resolve(configRoot, "prism", "plugin-approvals", "v1");
  const approvalRecordPath = resolve(approvalRoot, `${workspaceKey}.json`);
  const approvalRecord = JSON.parse(readFileSync(approvalRecordPath, "utf8"));
  assert.deepEqual(approvalRecord, {
    version: "prism-project-plugin-approval-v1",
    workspace: approval.workspace,
    projectConfigDigest: approval.projectConfigDigest,
    declaredPath: approval.declaredPath,
    canonicalPluginPath: approval.canonicalPluginPath,
    operation: approval.operation,
    plugin: approval.plugin,
    approvalDigest: approval.approvalDigest,
  });
  for (const directory of [
    resolve(configRoot, "prism"),
    resolve(configRoot, "prism", "plugin-approvals"),
    approvalRoot,
  ]) assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  assert.equal(lstatSync(approvalRecordPath).mode & 0o777, 0o600);

  const artifactVersionRoot = resolve(stateRoot, "prism", "plugin-artifacts", "v1");
  const artifactRoot = resolve(artifactVersionRoot, approval.plugin.registryDigest);
  const artifactRegistryPath = resolve(artifactRoot, "registry.json");
  const artifactPinPath = resolve(artifactRoot, "plugin-pins.json");
  const artifactPluginsRoot = resolve(artifactRoot, "plugins");
  const artifactPluginRoot = resolve(artifactPluginsRoot, pluginId);
  const artifactEntrypointPath = resolve(artifactPluginRoot, "index.mjs");
  assert.deepEqual(readdirSync(artifactRoot).sort(), ["plugin-pins.json", "plugins", "registry.json"]);
  assert.deepEqual(readdirSync(artifactPluginsRoot), [pluginId]);
  assert.deepEqual(readdirSync(artifactPluginRoot).sort(), ["index.mjs", "manifest.json"]);
  for (const directory of [
    resolve(stateRoot, "prism"),
    resolve(stateRoot, "prism", "plugin-artifacts"),
    artifactVersionRoot,
    artifactRoot,
    artifactPluginsRoot,
    artifactPluginRoot,
  ]) assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  for (const file of [artifactRegistryPath, artifactPinPath, resolve(artifactPluginRoot, "manifest.json"), artifactEntrypointPath]) {
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
  }
  assert.equal(digest(readFileSync(artifactRegistryPath)), approval.plugin.registryDigest);
  assert.equal(readFileSync(artifactEntrypointPath, "utf8"), readFileSync(entrypointPath, "utf8"));
  assert.deepEqual(JSON.parse(readFileSync(artifactPinPath, "utf8")), {
    version: "pnh-plugin-pins-v1",
    environment: "production",
    plugins: [{
      id: pluginId,
      manifestDigest: approval.plugin.manifestDigest,
      sourceDigest: approval.plugin.sourceDigest,
    }],
  });
  const artifactRegistry = JSON.parse(readFileSync(artifactRegistryPath, "utf8"));
  assert.equal(artifactRegistry.environment, "production");
  assert.equal(artifactRegistry.plugins.length, 1);
  assert.deepEqual({
    id: artifactRegistry.plugins[0].id,
    manifestDigest: artifactRegistry.plugins[0].manifestDigest,
    sourceDigest: artifactRegistry.plugins[0].sourceDigest,
    versionDigest: artifactRegistry.plugins[0].versionDigest,
    runnerDigest: artifactRegistry.plugins[0].runnerDigest,
    imageDigest: artifactRegistry.plugins[0].imageDigest,
    profileDigest: artifactRegistry.plugins[0].profileDigest,
  }, {
    id: approval.plugin.id,
    manifestDigest: approval.plugin.manifestDigest,
    sourceDigest: approval.plugin.sourceDigest,
    versionDigest: approval.plugin.versionDigest,
    runnerDigest: approval.plugin.runnerDigest,
    imageDigest: approval.plugin.imageDigest,
    profileDigest: approval.plugin.profileDigest,
  });
  rmSync(pluginSideEffectPath, { force: true });
  assert.equal(existsSync(pluginSideEffectPath), false);
  const projectPluginExecution = run(binary, ["run", "Create a slug for release title: Preview First"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(projectPluginExecution.stderr, "");
  assert.equal(existsSync(pluginSideEffectPath), false);
  const projectPluginRunId = projectPluginExecution.stdout.match(/^preview-first\nRun: ([0-9a-f-]{36})\n$/)?.[1];
  assert.ok(projectPluginRunId, "installed admitted run did not expose a canonical run ID");
  const projectPluginInspection = run(binary, ["inspect", "--json", projectPluginRunId], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(projectPluginInspection.stderr, "");
  const projectPluginRecord = JSON.parse(projectPluginInspection.stdout);
  assert.deepEqual(Object.keys(projectPluginRecord), [
    "version", "runId", "provider", "project", "plugin", "approval", "registry", "runtime", "boundary", "limits",
    "usage", "events", "trace", "terminal", "cleanup", "startedAt", "endedAt",
  ]);
  assert.equal(projectPluginRecord.version, "prism-run-record-v3");
  assert.equal(projectPluginRecord.runId, projectPluginRunId);
  assert.deepEqual(projectPluginRecord.provider, { name: "deterministic", model: null });
  assert.deepEqual(projectPluginRecord.project, { projectConfigDigest: approval.projectConfigDigest });
  assert.deepEqual(projectPluginRecord.plugin, {
    id: pluginId,
    operation: "slugify",
    manifestDigest: approval.plugin.manifestDigest,
    sourceDigest: approval.plugin.sourceDigest,
  });
  assert.deepEqual(projectPluginRecord.approval, { approvalDigest: approval.approvalDigest });
  assert.deepEqual(projectPluginRecord.registry, { registryDigest: approval.plugin.registryDigest });
  assert.deepEqual(projectPluginRecord.runtime, {
    versionDigest: approval.plugin.versionDigest,
    runnerDigest: approval.plugin.runnerDigest,
    imageDigest: approval.plugin.imageDigest,
    profileDigest: approval.plugin.profileDigest,
  });
  assert.deepEqual(projectPluginRecord.boundary, {
    executor: "spawn",
    authority: "ambient-host",
    sandboxed: false,
    claim: "identity-and-owner-approval",
  });
  assert.deepEqual(projectPluginRecord.limits, {
    providerTurns: 2,
    toolCalls: 1,
    totalBytes: 2_000_000,
    perToolBytes: 500_000,
    deadlineMs: 60_000,
  });
  assert.deepEqual(projectPluginRecord.usage.providerTurns, 2);
  assert.deepEqual(projectPluginRecord.usage.toolCalls, 1);
  assert.deepEqual(projectPluginRecord.events, [
    { seq: 1, type: "goal.accepted" },
    { seq: 2, type: "provider.tool-requested", turn: 1, tool: pluginId, operation: "slugify" },
    { seq: 3, type: "policy.allowed", call: 1, tool: pluginId, operation: "slugify" },
    { seq: 4, type: "tool.completed", call: 1, tool: pluginId, operation: "slugify", inputBytes: 25, outputBytes: 24 },
    { seq: 5, type: "provider.finalized", turn: 2 },
    { seq: 6, type: "run.completed" },
  ]);
  assert.deepEqual(projectPluginRecord.trace, [{ seq: 1, tool: pluginId, operation: "slugify", inputBytes: 25, outputBytes: 24 }]);
  assert.deepEqual(projectPluginRecord.terminal, { status: "completed", answer: "preview-first" });
  assert.equal(projectPluginRecord.cleanup.trigger, "process-exit");
  assert.equal(projectPluginRecord.cleanup.exitCode, 0);
  assert.equal(projectPluginRecord.cleanup.oomKilled, null);
  assert.equal(projectPluginRecord.cleanup.confirmedAbsent, true);
  assert.equal(projectPluginRecord.cleanup.cleanupErrorCount, 0);
  assert.ok(Number.isSafeInteger(projectPluginRecord.cleanup.settlementMs) && projectPluginRecord.cleanup.settlementMs >= 0);
  const projectPluginRecordPath = resolve(stateRoot, "prism", "runs", `${projectPluginRunId}.json`);
  const serializedProjectPluginRecord = readFileSync(projectPluginRecordPath, "utf8");
  for (const forbiddenValue of [
    workingRoot,
    pluginRoot,
    "Create a slug for release title: Preview First",
    "Preview First",
    '{"title":"Preview First"}',
    '{"slug":"preview-first"}',
  ]) assert.equal(
    serializedProjectPluginRecord.includes(forbiddenValue),
    false,
    `v3 record leaked ${forbiddenValue}`,
  );
  for (const forbiddenField of [
    "workspace",
    "canonicalPluginPath",
    "goal",
    "endpoint",
    "environment",
    "processId",
    "containerId",
    "requestId",
    "stderr",
    "daemonState",
    "cleanupErrors",
  ]) assert.equal(
    serializedProjectPluginRecord.includes(JSON.stringify(forbiddenField)),
    false,
    `v3 record leaked field ${forbiddenField}`,
  );

  const stateBeforeMutation = snapshotTree(stateRoot);
  const mutatedSlugPluginSource = `${slugPluginSource}process.getBuiltinModule("node:fs").writeFileSync(
  process.env.HOME + "/plugin-side-effect.txt",
  "release-slug executed\\n",
  "utf8",
);
// reviewed source mutation
`;
  writeFileSync(entrypointPath, mutatedSlugPluginSource, "utf8");
  const mutationFailure = spawnSync(binary, ["run", "Create a slug for release title: Preview First"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
    encoding: "utf8",
  });
  if (mutationFailure.error !== undefined) throw mutationFailure.error;
  assert.equal(mutationFailure.status, 1);
  assert.equal(mutationFailure.stdout, "");
  assert.equal(mutationFailure.stderr, "Prism run failed: project-plugin-approval-mismatch\n");
  assert.equal(existsSync(pluginSideEffectPath), false, "mutated plugin executed before admission rejection");
  assert.deepEqual(snapshotTree(stateRoot), stateBeforeMutation);

  writeFileSync(entrypointPath, `import "./outside-closure.mjs";\n${mutatedSlugPluginSource}`, "utf8");
  const closureFailure = spawnSync(binary, ["run", "Create a slug for release title: Preview First"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
    encoding: "utf8",
  });
  if (closureFailure.error !== undefined) throw closureFailure.error;
  assert.equal(closureFailure.status, 1);
  assert.equal(closureFailure.stdout, "");
  assert.equal(closureFailure.stderr, "Prism run failed: project-plugin-admission-failed\n");
  assert.equal(existsSync(pluginSideEffectPath), false, "out-of-closure plugin executed before static rejection");
  assert.deepEqual(snapshotTree(stateRoot), stateBeforeMutation);

  writeFileSync(entrypointPath, mutatedSlugPluginSource, "utf8");
  const changedApprovalOutput = run(binary, ["plugin", "approval", "--json"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(changedApprovalOutput.stderr, "");
  const changedApproval = JSON.parse(changedApprovalOutput.stdout);
  assert.equal(changedApproval.workspace, approval.workspace);
  assert.equal(changedApproval.declaredPath, approval.declaredPath);
  assert.equal(changedApproval.canonicalPluginPath, approval.canonicalPluginPath);
  assert.equal(changedApproval.operation, "slugify");
  assert.equal(changedApproval.plugin.id, pluginId);
  assert.notEqual(changedApproval.plugin.sourceDigest, approval.plugin.sourceDigest);
  assert.notEqual(changedApproval.approvalDigest, approval.approvalDigest);
  assert.equal(changedApproval.approvalDigest, digest(JSON.stringify([
    "prism-project-plugin-approval-digest-v1",
    changedApproval.workspace,
    changedApproval.projectConfigDigest,
    changedApproval.declaredPath,
    changedApproval.canonicalPluginPath,
    changedApproval.operation,
    changedApproval.plugin.id,
    changedApproval.plugin.manifestDigest,
    changedApproval.plugin.sourceDigest,
    changedApproval.plugin.registryDigest,
    changedApproval.plugin.versionDigest,
    changedApproval.plugin.runnerDigest,
    changedApproval.plugin.imageDigest,
    changedApproval.plugin.profileDigest,
  ])));
  const reapprove = run(binary, ["plugin", "approve", "--digest", changedApproval.approvalDigest], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(reapprove.stderr, "");
  assert.equal(reapprove.stdout, `Approved project tool plugin ${pluginId}: ${changedApproval.approvalDigest}\n`);
  assert.equal(existsSync(pluginSideEffectPath), false, "approval executed changed source");
  const reapprovedExecution = run(binary, ["run", "Create a slug for release title: Preview First"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(reapprovedExecution.stderr, "");
  assert.equal(readFileSync(pluginSideEffectPath, "utf8"), "release-slug executed\n");
  rmSync(pluginSideEffectPath);
  const reapprovedRunId = reapprovedExecution.stdout.match(/^preview-first\nRun: ([0-9a-f-]{36})\n$/)?.[1];
  assert.ok(reapprovedRunId, "changed source did not run after explicit reapproval");
  const reapprovedInspection = run(binary, ["inspect", "--json", reapprovedRunId], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(reapprovedInspection.stderr, "");
  const reapprovedRecord = JSON.parse(reapprovedInspection.stdout);
  assert.equal(reapprovedRecord.version, "prism-run-record-v3");
  assert.equal(reapprovedRecord.approval.approvalDigest, changedApproval.approvalDigest);
  assert.equal(reapprovedRecord.plugin.sourceDigest, changedApproval.plugin.sourceDigest);
  assert.deepEqual(reapprovedRecord.terminal, { status: "completed", answer: "preview-first" });
  assert.equal(reapprovedRecord.cleanup.confirmedAbsent, true);
  assert.equal(reapprovedRecord.cleanup.cleanupErrorCount, 0);

  const pluginRevoke = run(binary, ["plugin", "revoke"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginRevoke.stderr, "");
  assert.equal(pluginRevoke.stdout, "Revoked project tool plugin approval.\n");
  assert.equal(existsSync(approvalRecordPath), false);
  const stateBeforeRevokedRun = snapshotTree(stateRoot);
  const revokedRun = spawnSync(binary, ["run", "Create a slug for release title: Preview First"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
    encoding: "utf8",
  });
  if (revokedRun.error !== undefined) throw revokedRun.error;
  assert.equal(revokedRun.status, 1);
  assert.equal(revokedRun.stdout, "");
  assert.equal(revokedRun.stderr, "Prism run failed: project-plugin-approval-missing\n");
  assert.equal(existsSync(pluginSideEffectPath), false, "inert artifact executed after approval revocation");
  assert.deepEqual(snapshotTree(stateRoot), stateBeforeRevokedRun);

  const pluginUndeclaration = run(binary, ["plugin", "undeclare"], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
  });
  assert.equal(pluginUndeclaration.stderr, "");
  assert.equal(pluginUndeclaration.stdout, "Undeclared project tool plugin.\n");
  assert.equal(existsSync(declarationPath), false);

  const installedCheckChild = resolve(
    installRoot,
    "node_modules",
    "@useprism",
    "cli",
    "dist",
    "plugin-check-child.js",
  );
  const installedCheckWorker = resolve(
    installRoot,
    "node_modules",
    "@useprism",
    "cli",
    "dist",
    "plugin-check-worker.js",
  );
  const childAudit = spawnSync(process.execPath, [
    installedCheckChild,
    pathToFileURL(resolve(pluginRoot, "index.mjs")).href,
    pluginId,
  ], {
    cwd: pluginRoot,
    timeout: 30_000,
    encoding: "utf8",
    env: {
      HOME: homeRoot,
      PATH: "",
      NODE_OPTIONS: `--import=${pathToFileURL(guardPath).href}`,
      XDG_CACHE_HOME: cacheRoot,
      XDG_CONFIG_HOME: configRoot,
      XDG_STATE_HOME: stateRoot,
      PRISM_SOURCE_CHECKOUT: repositoryRoot,
      PRISM_MODULE_AUDIT_LOG: auditLog,
    },
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });
  if (childAudit.error !== undefined) throw childAudit.error;
  assert.equal(childAudit.status, 0);
  assert.equal(childAudit.stdout, "");
  assert.equal(childAudit.stderr, "");
  assert.deepEqual(JSON.parse(String(childAudit.output[3]).trim()), {
    version: "prism-plugin-check-child-v1",
    status: "ok",
    pluginId,
    operation: "slugify",
  });

  const importMarker = resolve(workingRoot, "plugin-imported.txt");
  writeFileSync(entrypointPath, [
    'import { writeFileSync } from "node:fs";',
    `writeFileSync(${JSON.stringify(importMarker)}, "imported");`,
    mutatedSlugPluginSource,
  ].join("\n"), "utf8");
  const manifestPath = resolve(pluginRoot, "manifest.json");
  const invalidManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  invalidManifest.apiVersion = 2;
  writeFileSync(manifestPath, `${JSON.stringify(invalidManifest, null, 2)}\n`, "utf8");
  const invalidCheck = spawnSync(binary, ["plugin", "check", pluginRoot], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
    encoding: "utf8",
  });
  if (invalidCheck.error !== undefined) throw invalidCheck.error;
  assert.equal(invalidCheck.status, 1);
  assert.equal(invalidCheck.stdout, "");
  assert.equal(invalidCheck.stderr, "Prism plugin check failed: manifest-invalid\n");
  assert.equal(existsSync(importMarker), false, "invalid packed plugin imported code before static rejection");
  assert.equal(readFileSync(pluginSentinel, "utf8"), "outside-plugin-sentinel\n");

  const nativeBytes = readFileSync(installedNativeAddon);
  const tamperedNativeBytes = Buffer.from(nativeBytes);
  tamperedNativeBytes[tamperedNativeBytes.byteLength - 1] ^= 0xff;
  writeFileSync(installedNativeAddon, tamperedNativeBytes);
  const integrityRoot = resolve(workingRoot, "native-integrity-root");
  const integrityCreate = spawnSync(binary, [
    "plugin",
    "create",
    "integrity-tool",
    "--directory",
    integrityRoot,
  ], {
    cwd: workingRoot,
    timeout: 30_000,
    env: cliEnvironment,
    encoding: "utf8",
  });
  if (integrityCreate.error !== undefined) throw integrityCreate.error;
  assert.equal(integrityCreate.status, 1);
  assert.equal(integrityCreate.stdout, "");
  assert.equal(integrityCreate.stderr, "Prism plugin create failed: native-integrity\n");
  assert.equal(existsSync(integrityRoot), false, "tampered native asset reached create execution");
  assert.equal(readFileSync(pluginSentinel, "utf8"), "outside-plugin-sentinel\n");
  writeFileSync(installedNativeAddon, nativeBytes);

  const loadedModules = readFileSync(auditLog, "utf8").trim().split("\n").filter(Boolean);
  assert.ok(loadedModules.some((path) => isWithin(installRoot, path)), "module guard did not observe installed Prism modules");
  assert.ok(
    loadedModules.some((path) => path.includes("@useprism/provider-ollama")),
    "module guard did not observe the installed Ollama provider",
  );
  assert.ok(
    loadedModules.includes(realpathSync(installedCheckChild)),
    "module guard did not observe the installed plugin-check child",
  );
  assert.ok(
    loadedModules.includes(realpathSync(installedCheckWorker)),
    "module guard did not observe the installed plugin-check worker",
  );
  assert.ok(
    loadedModules.some((path) => isWithin(resolve(installedCliRoot, "node_modules", "acorn"), path)),
    "module guard did not observe bundled Acorn",
  );
  assert.ok(
    loadedModules.some((path) => isWithin(resolve(installedCliRoot, "node_modules", "acorn-walk"), path)),
    "module guard did not observe bundled Acorn walk",
  );
  assert.ok(
    loadedModules.some((entry) => entry.startsWith(
      process.platform === "linux" ? "native-descriptor:/proc/self/fd/" : "native-descriptor:/dev/fd/",
    )),
    "module guard did not observe the descriptor-bound native authoring load",
  );
  assert.ok(
    loadedModules.includes(realpathSync(entrypointPath)),
    "module guard did not observe the generated plugin entrypoint",
  );
  assert.equal(loadedModules.some((path) => isWithin(repositoryRoot, path)), false);

  process.stdout.write(`packed deterministic, Ollama, and plugin-authoring runs ok: ${tarballs.length} tarballs, ${loadedModules.length} audited modules\n`);
} finally {
  await stopOllamaStub(ollamaStub);
  if (process.env.PRISM_KEEP_PACKED_TEST !== "1") rmSync(temporaryRoot, { recursive: true, force: true });
}
