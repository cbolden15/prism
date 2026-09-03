import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PHASE5_CANDIDATE_DOCUMENTS,
  PHASE5_CANDIDATE_FILES,
  PHASE5_CANDIDATE_PACKAGES,
  PHASE5_LIVE_EVIDENCE_PATH,
  PHASE5_MODEL,
  PHASE5_PACK_SCRIPT,
  PHASE5_RELEASE_MODULE,
  PHASE5_SOURCE_COMMIT,
  canonicalJson,
  listRelativeFiles,
  sha256,
  type CandidatePackageArtifact,
  type LiveEvidence,
  type Phase5ReleaseContractModule,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = resolve(repositoryRoot, PHASE5_RELEASE_MODULE);
const packScript = resolve(repositoryRoot, PHASE5_PACK_SCRIPT);

interface Fixture {
  readonly root: string;
  readonly source: string;
  readonly outputParent: string;
  readonly artifacts: readonly CandidatePackageArtifact[];
}

interface PackCliFixture {
  readonly source: string;
  readonly outputPath: string;
  readonly head: string;
  readonly npmAudit: string;
  readonly environment: NodeJS.ProcessEnv;
}

interface PackNpmAuditRow {
  readonly arguments: readonly string[];
  readonly cwd: string;
}

interface SkippableContext {
  skip(message?: string): void;
  after(callback: () => unknown): void;
}

async function loadContract(
  context: SkippableContext,
): Promise<Phase5ReleaseContractModule | undefined> {
  if (!existsSync(modulePath)) {
    context.skip(`awaiting ${PHASE5_RELEASE_MODULE}`);
    return undefined;
  }
  return await import(pathToFileURL(modulePath).href) as Phase5ReleaseContractModule;
}

function liveEvidence(): LiveEvidence {
  return {
    version: "prism-live-ollama-evidence-v1",
    fixtureSha256: "1".repeat(64),
    expectedFactSha256: "2".repeat(64),
    acceptanceScriptSha256: "3".repeat(64),
    acceptanceInputSha256: "4".repeat(64),
    model: PHASE5_MODEL,
    result: "passed",
    recordedAt: "2026-08-30T12:01:00.000Z",
  };
}

function git(root: string, arguments_: readonly string[]): string {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function fixture(context: SkippableContext): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-phase5-candidate-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = resolve(root, "source");
  const artifactsRoot = resolve(root, "artifacts");
  const outputParent = resolve(root, "output");
  await Promise.all([source, artifactsRoot, outputParent].map((path) => mkdir(path, { recursive: true })));

  for (const path of PHASE5_CANDIDATE_DOCUMENTS) {
    const destination = resolve(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `fixture:${path}\n`, "utf8");
  }
  const historicalEvidence = resolve(source, PHASE5_LIVE_EVIDENCE_PATH);
  await mkdir(dirname(historicalEvidence), { recursive: true });
  await writeFile(historicalEvidence, canonicalJson(liveEvidence()), "utf8");
  const artifacts: CandidatePackageArtifact[] = [];
  for (const entry of PHASE5_CANDIDATE_PACKAGES) {
    const sourcePath = resolve(artifactsRoot, entry.file);
    await writeFile(sourcePath, `fixture:${entry.name}\n`, "utf8");
    artifacts.push({ ...entry, sourcePath });
  }
  return { root, source, outputParent, artifacts };
}

async function packCliFixture(context: SkippableContext): Promise<PackCliFixture> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-phase5-pack-success-")));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = resolve(temporary, "source");
  const bin = resolve(temporary, "bin");
  const npmAudit = resolve(temporary, "npm-audit.jsonl");
  const outputPath = resolve(temporary, "prism-developer-preview-0.1.0");
  await Promise.all([source, bin].map((path) => mkdir(path)));
  await mkdir(resolve(source, "node_modules"));
  await mkdir(resolve(source, "node_modules", "parser"));
  await writeFile(
    resolve(source, "node_modules", "parser", "package.json"),
    canonicalJson({ name: "parser", version: "1.2.3" }),
    "utf8",
  );
  await writeFile(resolve(source, "node_modules", "parser", "index.mjs"), "export {};\n", "utf8");
  await writeFile(resolve(source, ".node-version"), "26.8.1\n", "utf8");
  await writeFile(resolve(source, ".gitignore"), "node_modules/\npackages/*/dist/\n", "utf8");
  await writeFile(resolve(source, "package.json"), canonicalJson({
    name: "prism-phase5-pack-fixture",
    version: "0.1.0",
    private: true,
    workspaces: ["packages/*"],
  }), "utf8");
  for (const path of PHASE5_CANDIDATE_DOCUMENTS) {
    const destination = resolve(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `fixture:${path}\n`, "utf8");
  }
  for (const entry of PHASE5_CANDIDATE_PACKAGES) {
    const directory = entry.name.slice(entry.name.indexOf("/") + 1);
    const packageRoot = resolve(source, "packages", directory);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(resolve(packageRoot, "package.json"), canonicalJson({
      name: entry.name,
      version: entry.version,
      type: "module",
      files: ["dist", "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"],
      ...(entry.name === "@useprism/cli"
        ? { dependencies: { parser: "1.2.3" }, bundleDependencies: ["parser"] }
        : {}),
    }), "utf8");
    for (const file of ["README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
      await writeFile(resolve(packageRoot, file), `fixture:${entry.name}:${file}\n`, "utf8");
    }
    await mkdir(resolve(packageRoot, "dist"));
    await writeFile(resolve(packageRoot, "dist", "index.js"), "stale ignored build\n", "utf8");
  }

  const fakeNpm = resolve(bin, "npm");
  await writeFile(fakeNpm, [
    "#!/usr/bin/env node",
    'import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";',
    'import { resolve } from "node:path";',
    "const args = process.argv.slice(2);",
    'appendFileSync(process.env.PRISM_PACK_NPM_AUDIT, `${JSON.stringify({ arguments: args, cwd: process.cwd() })}\\n`);',
    'if (args.length === 1 && args[0] === "--version") { process.stdout.write("11.19.0\\n"); process.exit(0); }',
    'if (args.length === 1 && args[0] === "ci") process.exit(0);',
    'if (args.length === 2 && args[0] === "run" && args[1] === "build:packages") {',
    '  for (const directory of readdirSync(resolve(process.cwd(), "packages"))) {',
    '    mkdirSync(resolve(process.cwd(), "packages", directory, "dist"), { recursive: true });',
    '    writeFileSync(resolve(process.cwd(), "packages", directory, "dist", "index.js"), "fresh reviewed build\\n");',
    "  }",
    "  process.exit(0);",
    "}",
    'if (args[0] !== "pack") { process.stderr.write("unexpected fake npm command\\n"); process.exit(2); }',
    'const destinationIndex = args.indexOf("--pack-destination");',
    'if (destinationIndex < 0 || !args.includes("--json") || !args.includes("--ignore-scripts")) process.exit(2);',
    'const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));',
    'const built = readFileSync(resolve(process.cwd(), "dist", "index.js"), "utf8");',
    'if (built !== "fresh reviewed build\\n") { process.stderr.write("stale build output\\n"); process.exit(2); }',
    'const filename = `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;',
    "const destination = args[destinationIndex + 1];",
    "mkdirSync(destination, { recursive: true });",
    'writeFileSync(resolve(destination, filename), `fixture:${manifest.name}:${built}`);',
    'const files = [{ path: "package.json" }, { path: "dist/index.js" }, { path: "README.md" }, { path: "LICENSE" }, { path: "NOTICE" }, { path: "THIRD_PARTY_NOTICES.md" }];',
    'if (manifest.name === "@useprism/cli") files.push({ path: "node_modules/acorn/LICENSE" }, { path: "node_modules/acorn-walk/LICENSE" }, { path: "prebuilds/provenance.json" });',
    'process.stdout.write(`${JSON.stringify([{ filename, files }])}\\n`);',
    "",
  ].join("\n"), "utf8");
  await chmod(fakeNpm, 0o755);
  git(source, ["init", "--quiet"]);
  git(source, ["add", "."]);
  git(source, [
    "-c",
    "user.name=Prism Fixture",
    "-c",
    "user.email=prism@localhost",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  return {
    source,
    outputPath,
    head: git(source, ["rev-parse", "HEAD"]),
    npmAudit,
    environment: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      PRISM_PACK_NPM_AUDIT: npmAudit,
    },
  };
}

test("the candidate package set matches the reviewed 0.1.0 workspace manifests", () => {
  const workspaceManifests = new Map<string, { readonly version: string; readonly private: boolean }>();
  for (const directory of ["cli", "provider-codex", "provider-ollama", "runtime", "sdk"]) {
    const manifest = JSON.parse(readFileSync(
      resolve(repositoryRoot, "packages", directory, "package.json"),
      "utf8",
    ));
    workspaceManifests.set(manifest.name as string, {
      version: manifest.version as string,
      private: manifest.private === true,
    });
  }
  assert.deepEqual(
    [...workspaceManifests.keys()].sort(),
    [
      "@useprism/cli",
      "@useprism/provider-codex",
      "@useprism/provider-ollama",
      "@useprism/runtime",
      "@useprism/sdk",
    ],
  );
  for (const name of ["@useprism/cli", "@useprism/provider-ollama", "@useprism/runtime", "@useprism/sdk"]) {
    assert.equal(workspaceManifests.get(name)?.private, false, `${name} must remain publishable`);
  }
  assert.equal(workspaceManifests.get("@useprism/provider-codex")?.private, true);
  assert.deepEqual(
    PHASE5_CANDIDATE_PACKAGES.map(({ name }) => name),
    [
      "@useprism/cli",
      "@useprism/provider-ollama",
      "@useprism/runtime",
      "@useprism/sdk",
    ],
  );
  for (const { name, version } of PHASE5_CANDIDATE_PACKAGES) {
    assert.equal(workspaceManifests.get(name)?.version, version);
  }
  assert.equal(
    new Set<string>(PHASE5_CANDIDATE_PACKAGES.map(({ name }) => name))
      .has("@useprism/provider-codex"),
    false,
  );
});

test("the local candidate pack command freezes usage, dirty refusal, and source HEAD", async (context) => {
  assert.equal(existsSync(packScript), true, `missing ${PHASE5_PACK_SCRIPT}`);
  if (!existsSync(packScript)) return;
  const missingOutput = spawnSync(process.execPath, [packScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(missingOutput.status, 2);
  assert.equal(missingOutput.stdout, "");
  assert.equal(
    missingOutput.stderr,
    "Missing --output.\nUsage: node scripts/release/pack-developer-preview.mjs --output <path>\n",
  );

  const temporary = await mkdtemp(join(tmpdir(), "prism-phase5-pack-dirty-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = resolve(temporary, "source");
  const outputPath = resolve(temporary, "candidate");
  await mkdir(source);
  await writeFile(resolve(source, ".node-version"), "26.8.1\n", "utf8");
  await writeFile(resolve(source, "package.json"), canonicalJson({
    name: "prism-phase5-pack-fixture",
    version: "0.1.0",
    private: true,
  }), "utf8");
  git(source, ["init", "--quiet"]);
  git(source, ["add", ".node-version", "package.json"]);
  git(source, [
    "-c",
    "user.name=Prism Fixture",
    "-c",
    "user.email=prism@localhost",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  await writeFile(resolve(source, "dirty.txt"), "dirty\n", "utf8");
  const dirty = spawnSync(process.execPath, [packScript, "--output", outputPath], {
    cwd: source,
    encoding: "utf8",
  });
  assert.equal(dirty.status, 1);
  assert.equal(dirty.stdout, "");
  assert.equal(dirty.stderr, "Prism preview pack failed: source-dirty\n");
  assert.equal(existsSync(outputPath), false);

  const clean = await packCliFixture(context);
  const succeeded = spawnSync(process.execPath, [packScript, "--output", clean.outputPath], {
    cwd: clean.source,
    env: clean.environment,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(succeeded.status, 0, `${succeeded.stdout}\n${succeeded.stderr}`);
  assert.equal(succeeded.stderr, "");
  const manifest = JSON.parse(await readFile(resolve(clean.outputPath, "candidate.json"), "utf8"));
  assert.equal(manifest.sourceCommit, clean.head);
  const npmAudit = (await readFile(clean.npmAudit, "utf8")).trim().split("\n").map(
    (line) => JSON.parse(line) as PackNpmAuditRow,
  );
  const ciRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "ci");
  const buildRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "run build:packages");
  const packRows = npmAudit.filter(({ arguments: args }) => args[0] === "pack");
  assert.equal(ciRows.length, 0);
  assert.equal(buildRows.length, 1);
  assert.equal(packRows.length, PHASE5_CANDIDATE_PACKAGES.length);
  const isolatedRoot = buildRows[0]?.cwd as string;
  assert.notEqual(isolatedRoot, clean.source);
  assert.deepEqual(
    packRows.map(({ cwd }) => cwd).sort(),
    PHASE5_CANDIDATE_PACKAGES.map(({ name }) => (
      name === "@useprism/cli"
        ? resolve(isolatedRoot, ".prism-pack-staging", "cli")
        : resolve(isolatedRoot, "packages", name.split("/")[1] as string)
    )).sort(),
  );
  assert.equal(
    await readFile(resolve(clean.source, "packages", "cli", "dist", "index.js"), "utf8"),
    "stale ignored build\n",
  );
  assert.equal(
    git(clean.source, ["worktree", "list", "--porcelain"]).split("\n").filter(
      (line) => line.startsWith("worktree "),
    ).length,
    1,
  );
  for (const entry of PHASE5_CANDIDATE_PACKAGES) {
    assert.match(
      await readFile(resolve(clean.outputPath, "packages", entry.file), "utf8"),
      /fresh reviewed build/u,
    );
  }
});

test("candidate assembly publishes the exact closed tree, manifest, and sorted checksums", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const setup = await fixture(context);
  const outputPath = resolve(setup.outputParent, "prism-developer-preview-0.1.0");
  await contract.assembleDeveloperPreviewCandidate({
    repositoryRoot: setup.source,
    outputPath,
    sourceCommit: PHASE5_SOURCE_COMMIT,
    packageArtifacts: setup.artifacts,
  });

  assert.deepEqual(await listRelativeFiles(outputPath), PHASE5_CANDIDATE_FILES);
  assert.equal(existsSync(resolve(outputPath, PHASE5_LIVE_EVIDENCE_PATH)), false);
  const expectedManifest = {
    version: "prism-developer-preview-candidate-v1",
    sourceCommit: PHASE5_SOURCE_COMMIT,
    node: "26.8.1",
    npm: "11.19.0",
    packages: await Promise.all(setup.artifacts.map(async ({ sourcePath, ...entry }) => ({
      ...entry,
      sha256: sha256(await readFile(sourcePath)),
    }))),
    documents: await Promise.all(PHASE5_CANDIDATE_DOCUMENTS.map(async (file) => ({
      file,
      sha256: sha256(await readFile(resolve(setup.source, file))),
    }))),
  };
  assert.equal(await readFile(resolve(outputPath, "candidate.json"), "utf8"), canonicalJson(expectedManifest));

  const covered = PHASE5_CANDIDATE_FILES.filter((path) => path !== "SHA256SUMS");
  const expectedSums = `${(await Promise.all(covered.map(async (path) => (
    `${sha256(await readFile(resolve(outputPath, path)))}  ${path}`
  )))).join("\n")}\n`;
  assert.equal(await readFile(resolve(outputPath, "SHA256SUMS"), "utf8"), expectedSums);
  assert.deepEqual(
    await contract.validateDeveloperPreviewCandidate({
      candidateRoot: outputPath,
      sourceCommit: PHASE5_SOURCE_COMMIT,
    }),
    expectedManifest,
  );
});

test("candidate assembly refuses files, directories, symlinks, and concurrent replacement", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const setup = await fixture(context);
  const outside = resolve(setup.root, "outside");
  await mkdir(outside);
  await writeFile(resolve(outside, "sentinel.txt"), "outside-sentinel\n", "utf8");

  const occupiedFile = resolve(setup.outputParent, "occupied-file");
  const occupiedDirectory = resolve(setup.outputParent, "occupied-directory");
  const occupiedLink = resolve(setup.outputParent, "occupied-link");
  await writeFile(occupiedFile, "keep-file\n", "utf8");
  await mkdir(occupiedDirectory);
  await writeFile(resolve(occupiedDirectory, "sentinel.txt"), "keep-directory\n", "utf8");
  await symlink(outside, occupiedLink);
  for (const outputPath of [occupiedFile, occupiedDirectory, occupiedLink]) {
    await assert.rejects(contract.assembleDeveloperPreviewCandidate({
      repositoryRoot: setup.source,
      outputPath,
      sourceCommit: PHASE5_SOURCE_COMMIT,
      packageArtifacts: setup.artifacts,
    }));
  }
  assert.equal(await readFile(occupiedFile, "utf8"), "keep-file\n");
  assert.equal(await readFile(resolve(occupiedDirectory, "sentinel.txt"), "utf8"), "keep-directory\n");
  assert.equal(await readFile(resolve(outside, "sentinel.txt"), "utf8"), "outside-sentinel\n");

  const concurrent = resolve(setup.outputParent, "concurrent");
  const outcomes = await Promise.allSettled([
    contract.assembleDeveloperPreviewCandidate({
      repositoryRoot: setup.source,
      outputPath: concurrent,
      sourceCommit: PHASE5_SOURCE_COMMIT,
      packageArtifacts: setup.artifacts,
    }),
    contract.assembleDeveloperPreviewCandidate({
      repositoryRoot: setup.source,
      outputPath: concurrent,
      sourceCommit: PHASE5_SOURCE_COMMIT,
      packageArtifacts: setup.artifacts,
    }),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
  assert.deepEqual(await listRelativeFiles(concurrent), PHASE5_CANDIDATE_FILES);
  assert.deepEqual(
    (await readdir(setup.outputParent)).filter((entry) => entry.includes("stage")),
    [],
  );
});

test("candidate validation rejects content tampering and open file sets", async (context) => {
  const contract = await loadContract(context);
  if (contract === undefined) return;
  const setup = await fixture(context);
  const tamperedCandidate = resolve(setup.outputParent, "tamper");
  await contract.assembleDeveloperPreviewCandidate({
    repositoryRoot: setup.source,
    outputPath: tamperedCandidate,
    sourceCommit: PHASE5_SOURCE_COMMIT,
    packageArtifacts: setup.artifacts,
  });
  await writeFile(resolve(tamperedCandidate, "README.md"), "tampered\n", "utf8");
  await assert.rejects(contract.validateDeveloperPreviewCandidate({
    candidateRoot: tamperedCandidate,
    sourceCommit: PHASE5_SOURCE_COMMIT,
  }));

  const openCandidate = resolve(setup.outputParent, "open-set");
  await contract.assembleDeveloperPreviewCandidate({
    repositoryRoot: setup.source,
    outputPath: openCandidate,
    sourceCommit: PHASE5_SOURCE_COMMIT,
    packageArtifacts: setup.artifacts,
  });
  await writeFile(resolve(openCandidate, "unexpected.txt"), "unexpected\n", "utf8");
  await assert.rejects(contract.validateDeveloperPreviewCandidate({
    candidateRoot: openCandidate,
    sourceCommit: PHASE5_SOURCE_COMMIT,
  }));
});
