import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PHASE5_CANDIDATE_DOCUMENTS,
  PHASE5_CANDIDATE_PACKAGES,
  PHASE5_CHECK_SCRIPT,
  PHASE5_CLEAN_CHECKOUT_SCRIPT,
  PHASE5_LIVE_ACCEPTANCE_SCRIPT,
  PHASE5_LIVE_ATTEMPT_PATH,
  PHASE5_LIVE_EVIDENCE_PATH,
  PHASE5_LIVE_EXPECTED_FACT_PATH,
  PHASE5_LIVE_FIXTURE_PATH,
  PHASE5_MODEL,
  PHASE5_PACK_SCRIPT,
  PHASE5_PACKED_ACCEPTANCE_SCRIPT,
  PHASE5_RELEASE_MODULE,
  PHASE5_WORKSTREAM,
  canonicalJson,
  sha256,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cleanScript = resolve(repositoryRoot, PHASE5_CLEAN_CHECKOUT_SCRIPT);
const checkScript = resolve(repositoryRoot, PHASE5_CHECK_SCRIPT);

interface AuditRow {
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly head: string;
  readonly home: string;
  readonly config: string;
  readonly state: string;
  readonly cache: string;
  readonly docker: string;
  readonly dockerEntries: readonly string[];
  readonly pluginEntries: readonly string[];
  readonly pluginTarget: string;
  readonly buildxConfig: string | null;
  readonly buildxBuilder: string | null;
  readonly buildkitHost: string | null;
}

interface GitFixture {
  readonly root: string;
  readonly bin: string;
  readonly audit: string;
  readonly dockerConfig: string;
  readonly executableBuildx: string;
  readonly environment: NodeJS.ProcessEnv;
}

interface ReleaseGateFixture {
  readonly source: string;
  readonly head: string;
  readonly npmAudit: string;
  readonly runnerAudit: string;
  readonly environment: NodeJS.ProcessEnv;
}

interface NpmAuditRow {
  readonly arguments: readonly string[];
  readonly cwd: string;
}

interface RunnerAuditRow {
  readonly arguments: readonly string[];
  readonly candidateRoot: string;
  readonly sourceCommit: string;
  readonly packages: readonly string[];
  readonly documents: readonly string[];
}

function git(root: string, arguments_: readonly string[]): string {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function fixture(context: { after(callback: () => unknown): void }): Promise<GitFixture> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-phase5-clean-gate-")));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = resolve(temporary, "repository");
  const bin = resolve(temporary, "bin");
  const audit = resolve(temporary, "npm-audit.jsonl");
  const dockerConfig = resolve(temporary, "source-docker");
  const fakeHome = resolve(temporary, "source-home");
  await Promise.all([root, bin].map((path) => mkdir(path)));
  await mkdir(resolve(dockerConfig, "cli-plugins"), { recursive: true });
  await mkdir(resolve(fakeHome, ".docker", "cli-plugins"), { recursive: true });
  const inaccessibleBuildx = resolve(dockerConfig, "cli-plugins", "docker-buildx");
  const executableBuildx = resolve(fakeHome, ".docker", "cli-plugins", "docker-buildx");
  await writeFile(inaccessibleBuildx, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(inaccessibleBuildx, 0o001);
  await writeFile(executableBuildx, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executableBuildx, 0o755);
  await writeFile(resolve(root, ".node-version"), "26.8.1\n", "utf8");
  await writeFile(resolve(root, "tracked.txt"), "tracked\n", "utf8");
  git(root, ["init", "--quiet"]);
  git(root, ["add", ".node-version", "tracked.txt"]);
  git(root, [
    "-c",
    "user.name=Prism Fixture",
    "-c",
    "user.email=prism@localhost",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);

  const fakeNpm = resolve(bin, "npm");
  await writeFile(fakeNpm, [
    "#!/usr/bin/env node",
    'import { appendFileSync, readdirSync, realpathSync } from "node:fs";',
    'import { execFileSync } from "node:child_process";',
    'import { resolve } from "node:path";',
    "const args = process.argv.slice(2);",
    "appendFileSync(process.env.PRISM_RELEASE_AUDIT_LOG, JSON.stringify({",
    "  arguments: args,",
    "  cwd: process.cwd(),",
    '  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),',
    "  home: process.env.HOME,",
    "  config: process.env.XDG_CONFIG_HOME,",
    "  state: process.env.XDG_STATE_HOME,",
    "  cache: process.env.npm_config_cache,",
    "  docker: process.env.DOCKER_CONFIG,",
    "  dockerEntries: readdirSync(process.env.DOCKER_CONFIG).sort(),",
    '  pluginEntries: readdirSync(resolve(process.env.DOCKER_CONFIG, "cli-plugins")).sort(),',
    '  pluginTarget: realpathSync(resolve(process.env.DOCKER_CONFIG, "cli-plugins", "docker-buildx")),',
    "  buildxConfig: process.env.BUILDX_CONFIG ?? null,",
    "  buildxBuilder: process.env.BUILDX_BUILDER ?? null,",
    "  buildkitHost: process.env.BUILDKIT_HOST ?? null,",
    "}) + \"\\n\");",
    'if (args.length === 1 && args[0] === "--version") { process.stdout.write("11.19.0\\n"); process.exit(0); }',
    'if (process.env.PRISM_RELEASE_FAKE_FAIL === args.join(" ")) process.exitCode = 7;',
    "",
  ].join("\n"), "utf8");
  await chmod(fakeNpm, 0o755);
  return {
    root,
    bin,
    audit,
    dockerConfig,
    executableBuildx,
    environment: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      DOCKER_CONFIG: dockerConfig,
      BUILDX_CONFIG: "sentinel-buildx-config",
      BUILDX_BUILDER: "sentinel-buildx-builder",
      BUILDKIT_HOST: "sentinel-buildkit-host",
      PRISM_RELEASE_AUDIT_LOG: audit,
    },
  };
}

function runGate(setup: GitFixture, extraEnvironment: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [cleanScript, "--root", setup.root], {
    cwd: repositoryRoot,
    env: { ...setup.environment, ...extraEnvironment },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function readAudit(path: string): readonly AuditRow[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(
    (line) => JSON.parse(line) as AuditRow,
  );
}

function readJsonLines<T>(path: string): readonly T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(
    (line) => JSON.parse(line) as T,
  );
}

function releaseDocumentContents(path: string): string {
  const documents: Readonly<Record<string, string>> = {
    "README.md": `# Prism developer preview

Local candidate only. This private-incubation preview requires Node 26.8.1 and npm 11.19.0.

## Deterministic

Start with the deterministic first run.

## Ollama

The direct Ollama path is optional.

## Assurance

Assurance profiles are optional.
`,
    "docs/assurance/README.md": `# Optional assurance

Normal local execution does not require assurance infrastructure. See \`pnh/README.md\` and
\`pnh/x1-firecracker/b0/run-profile.sh\` for the existing profiles. Qualified Linux x86_64,
KVM, and physical X1 evidence remains unverified when those environments were not run.
`,
    "docs/developer-preview/command-reference.md": `# Command reference

Usage: prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--allow-remote-endpoint <origin>] [--yes]
Usage: prism doctor [--allow-remote-endpoint <origin>] [--json]
Usage: prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--json] <goal>
Usage: prism inspect [--json] <run-id>
Usage: prism plugin create <name> [--directory <path>]
Usage: prism plugin check <path> [--json]

Exit code 0 is success. Exit code 1 is an operational failure. Exit code 2 is usage failure.
Human stdout and stderr stay separate. JSON mode writes one JSON value. Unknown options are
rejected. Use \`--\` before a goal beginning with \`-\`.
`,
    "docs/developer-preview/concepts.md": `# Concepts

The SDK defines public contracts. Runtime owns the bounded loop. Providers implement SDK
contracts. The CLI owns configuration and local records. The repository tool is read-only.
The local candidate remains private-incubation at version 0.1.0.
`,
    "docs/developer-preview/data-and-trust.md": `# Local data and trust

- Project config: \`<workspace>/.prism/config.json\`
- User config: \`\${XDG_CONFIG_HOME:-~/.config}/prism/config.json\`
- Run records: \`\${XDG_STATE_HOME:-~/.local/state}/prism/runs/<run-id>.json\`
- Default authoring root: \`<cwd>/prism-plugins\`

Goals and final answers can be sensitive. The selected provider receives the prompt and
repository content read for the run. The repository tool is not a confidentiality boundary.
Native digests are not signatures. Native Windows and WSL remain unverified.
`,
    "docs/developer-preview/diagnostics.md": `# Diagnostics

## Diagnostic matrix

| Symptom | Bounded cause | Next command |
| --- | --- | --- |
| unsupported Node; unsupported npm | The pinned toolchain is not active. | \`node --version && npm --version\` |
| config root or state root unwritable | A local data root cannot be written. | \`prism doctor\` |
| remote endpoint not authorized | The exact non-loopback origin was not approved. | \`prism doctor --allow-remote-endpoint <origin>\` |
| Ollama unavailable; model not found | The local service or selected model is absent. | \`prism doctor\` |
| malformed-response; oversized-response; timeout | The provider response violated a bound. | \`prism doctor\` |
| invalid run ID; invalid record | The requested local record is absent or malformed. | \`prism inspect --json <run-id>\` |
| repository path rejected | The requested path leaves the workspace. | \`prism run <goal>\` |
| native-unavailable; native-integrity | The host target is unsupported or its bytes changed. | \`prism plugin create packed-tool\` |
| root-unmanaged; destination-exists | The authoring root is unmanaged or occupied. | \`prism plugin create packed-tool\` |
| manifest-invalid; execution; output-limit; cleanup-failed | Plugin checking rejected one bounded stage. | \`prism plugin check prism-plugins/packed-tool\` |
`,
    "docs/developer-preview/getting-started.md": `# Getting started

## Deterministic first run

\`npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz\`
\`./node_modules/.bin/prism init --provider deterministic --scope project --yes\`
\`./node_modules/.bin/prism doctor\`
\`RUN_OUTPUT="$(./node_modules/.bin/prism run 'Count the words in: one two three')"\`
\`RUN_ID="$(printf '%s\\n' "$RUN_OUTPUT" | sed -n 's/^Run: //p')"\`
\`./node_modules/.bin/prism inspect --json "$RUN_ID"\`

## Optional Ollama first run

Use an already running loopback service with the already installed \`qwen2.5:14b\` model.
\`./node_modules/.bin/prism init --provider ollama --model qwen2.5:14b --endpoint http://127.0.0.1:11434 --scope project --yes\`
\`./node_modules/.bin/prism doctor\`
\`OLLAMA_OUTPUT="$(./node_modules/.bin/prism run 'Find the Prism packed acceptance marker and name its file.')"\`
\`OLLAMA_RUN_ID="$(printf '%s\\n' "$OLLAMA_OUTPUT" | sed -n 's/^Run: //p')"\`
\`./node_modules/.bin/prism inspect --json "$OLLAMA_RUN_ID"\`
`,
    "docs/developer-preview/plugin-authoring.md": `# Plugin authoring

## Create and check a tool plugin

The default \`prism-plugins\` managed root receives exactly \`README.md\`, \`index.mjs\`,
\`index.test.mjs\`, and \`manifest.json\`. Checks run with ambient host authority and are
not a sandbox. A pass does not prove safety.

\`./node_modules/.bin/prism plugin create packed-tool\`
\`node --test prism-plugins/packed-tool/index.test.mjs\`
\`./node_modules/.bin/prism plugin check prism-plugins/packed-tool\`
`,
    "docs/releases/developer-preview/README.md": `# Local developer-preview candidate

This version 0.1.0 candidate is local-only and private-incubation. It is not published,
signed, or distributed. Committed Ollama evidence is historical repository-only evidence.
It is not copied into the candidate, and check:release does not consume it.
`,
    "LICENSE": "fixture license\n",
    "NOTICE": "fixture notice\n",
    "THIRD_PARTY_NOTICES.md": "# Fixture third-party notices\n",
  };
  const contents = documents[path];
  return contents ?? `fixture:${path}\n`;
}

async function releaseGateFixture(
  context: { after(callback: () => unknown): void },
  mode: "valid" | "documentation-invalid" | "stale-evidence" | "ledger-mismatch" | "live-state-absent" = "valid",
): Promise<ReleaseGateFixture> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-phase5-release-gate-")));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = resolve(temporary, "source");
  const bin = resolve(temporary, "bin");
  const npmAudit = resolve(temporary, "npm-audit.jsonl");
  const runnerAudit = resolve(temporary, "runner-audit.jsonl");
  await Promise.all([source, bin].map((path) => mkdir(path, { recursive: true })));

  await mkdir(resolve(source, "node_modules"));
  await writeFile(resolve(source, ".node-version"), "26.8.1\n", "utf8");
  await writeFile(resolve(source, ".gitignore"), "node_modules/\n", "utf8");
  await writeFile(resolve(source, "package.json"), canonicalJson({
    name: "prism-phase5-release-gate-fixture",
    version: "0.1.0",
    private: true,
    workspaces: ["packages/*"],
    scripts: { "check:public-claims": "fixture" },
  }), "utf8");
  for (const path of PHASE5_CANDIDATE_DOCUMENTS) {
    if (path === PHASE5_LIVE_EVIDENCE_PATH) continue;
    const destination = resolve(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, releaseDocumentContents(path), "utf8");
  }
  for (const entry of PHASE5_CANDIDATE_PACKAGES) {
    const packageRoot = resolve(source, "packages", entry.name.split("/")[1] as string);
    await mkdir(resolve(packageRoot, "src"), { recursive: true });
    await mkdir(resolve(packageRoot, "dist"), { recursive: true });
    await writeFile(resolve(packageRoot, "package.json"), canonicalJson({
      name: entry.name,
      version: entry.version,
      type: "module",
      files: ["index.js"],
    }), "utf8");
    await writeFile(resolve(packageRoot, "index.js"), "export {};\n", "utf8");
    await writeFile(resolve(packageRoot, "src", "index.ts"), "export const source = true;\n", "utf8");
    await writeFile(resolve(packageRoot, "dist", "index.js"), "export const built = true;\n", "utf8");
  }

  const liveFixtureBytes = "The live fixture says cobalt-heron-7319.\n";
  const expectedFactBytes = "cobalt-heron-7319 in LIVE_FIXTURE.md\n";
  const acceptanceScriptBytes = "export const acceptance = true;\n";
  for (const [path, bytes] of [
    [PHASE5_LIVE_FIXTURE_PATH, liveFixtureBytes],
    [PHASE5_LIVE_EXPECTED_FACT_PATH, expectedFactBytes],
    [PHASE5_LIVE_ACCEPTANCE_SCRIPT, acceptanceScriptBytes],
  ] as const) {
    const destination = resolve(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, "utf8");
  }
  const contract = await import(pathToFileURL(resolve(repositoryRoot, PHASE5_RELEASE_MODULE)).href) as {
    liveAcceptanceInputDigest(input: { readonly repositoryRoot: string }): Promise<string>;
  };
  const evidence = {
    version: "prism-live-ollama-evidence-v1",
    fixtureSha256: sha256(liveFixtureBytes),
    expectedFactSha256: sha256(expectedFactBytes),
    acceptanceScriptSha256: sha256(acceptanceScriptBytes),
    acceptanceInputSha256: await contract.liveAcceptanceInputDigest({ repositoryRoot: source }),
    model: PHASE5_MODEL,
    result: "passed",
    recordedAt: "2026-08-30T12:01:00.000Z",
  } as const;
  const evidenceBytes = canonicalJson(evidence);
  const evidencePath = resolve(source, PHASE5_LIVE_EVIDENCE_PATH);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, evidenceBytes, "utf8");
  const ledger = {
    version: "prism-phase-5-live-attempt-v1",
    workstream: PHASE5_WORKSTREAM,
    ordinal: 1,
    model: PHASE5_MODEL,
    startedAt: "2026-08-30T12:00:00.000Z",
    finishedAt: "2026-08-30T12:01:00.000Z",
    result: "passed",
    evidenceSha256: sha256(evidenceBytes),
  } as const;
  const ledgerPath = resolve(source, PHASE5_LIVE_ATTEMPT_PATH);
  await mkdir(dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, canonicalJson(ledger), "utf8");

  const packedRunner = resolve(source, PHASE5_PACKED_ACCEPTANCE_SCRIPT);
  await mkdir(dirname(packedRunner), { recursive: true });
  await writeFile(packedRunner, [
    'import { appendFileSync, readFileSync } from "node:fs";',
    'import { resolve } from "node:path";',
    "const args = process.argv.slice(2);",
    'if (args.length !== 2 || args[0] !== "--candidate") process.exit(2);',
    "const candidateRoot = args[1];",
    'const manifest = JSON.parse(readFileSync(resolve(candidateRoot, "candidate.json"), "utf8"));',
    "appendFileSync(process.env.PRISM_RELEASE_RUNNER_AUDIT, JSON.stringify({",
    "  arguments: args,",
    "  candidateRoot,",
    "  sourceCommit: manifest.sourceCommit,",
    "  packages: manifest.packages.map(({ name }) => name),",
    "  documents: manifest.documents.map(({ file }) => file),",
    '}) + "\\n");',
    'if (process.env.PRISM_RELEASE_FAKE_RUNNER_FAIL === "1") process.exit(7);',
    'process.stdout.write("packed candidate acceptance: ok\\n");',
    "",
  ].join("\n"), "utf8");

  const fakeNpm = resolve(bin, "npm");
  await writeFile(fakeNpm, [
    "#!/usr/bin/env node",
    'import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";',
    'import { resolve } from "node:path";',
    "const args = process.argv.slice(2);",
    "appendFileSync(process.env.PRISM_RELEASE_NPM_AUDIT, JSON.stringify({",
    "  arguments: args,",
    "  cwd: process.cwd(),",
    '}) + "\\n");',
    'if (args.length === 1 && args[0] === "--version") { process.stdout.write("11.19.0\\n"); process.exit(0); }',
    'if (args.join(" ") === "ci") process.exit(0);',
    'if (args.join(" ") === "run test:phase5:red") process.exit(0);',
    'if (args.join(" ") === "run build:packages") process.exit(0);',
    'if (args.join(" ") === "run check:public-claims") {',
    '  if (process.env.PRISM_RELEASE_FAKE_CLAIMS_FAIL === "1") process.exit(7);',
    "  process.exit(0);",
    "}",
    'if (args[0] !== "pack") process.exit(2);',
    'const destinationIndex = args.indexOf("--pack-destination");',
    'if (destinationIndex < 0 || !args.includes("--json") || !args.includes("--ignore-scripts")) process.exit(2);',
    'const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));',
    'const filename = `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;',
    "const destination = args[destinationIndex + 1];",
    "mkdirSync(destination, { recursive: true });",
    'writeFileSync(resolve(destination, filename), `fixture:${manifest.name}\\n`);',
    'const files = [',
    '  { path: "package.json" },',
    '  { path: "index.js" },',
    '  { path: "README.md" },',
    '  { path: "LICENSE" },',
    '  { path: "NOTICE" },',
    '  { path: "THIRD_PARTY_NOTICES.md" },',
    "];",
    'if (manifest.name === "@useprism/cli") files.push(',
    '  { path: "node_modules/acorn/LICENSE" },',
    '  { path: "node_modules/acorn-walk/LICENSE" },',
    '  { path: "prebuilds/provenance.json" },',
    ");",
    'if (process.env.PRISM_RELEASE_FAKE_PACK_FORBIDDEN === "1") files.push({ path: "src/secret.ts" });',
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
  if (mode === "documentation-invalid") {
    await writeFile(
      resolve(source, "docs/developer-preview/command-reference.md"),
      "# Command reference\n\nRequired command coverage is missing.\n",
      "utf8",
    );
  } else if (mode === "stale-evidence") {
    await writeFile(resolve(source, PHASE5_LIVE_EXPECTED_FACT_PATH), `${expectedFactBytes}changed\n`, "utf8");
  } else if (mode === "ledger-mismatch") {
    await writeFile(ledgerPath, canonicalJson({ ...ledger, evidenceSha256: "0".repeat(64) }), "utf8");
  } else if (mode === "live-state-absent") {
    await rm(evidencePath);
    await rm(ledgerPath);
  }
  if (mode !== "valid") {
    git(source, ["add", "."]);
    git(source, [
      "-c",
      "user.name=Prism Fixture",
      "-c",
      "user.email=prism@localhost",
      "commit",
      "--quiet",
      "-m",
      mode,
    ]);
  }
  return {
    source,
    head: git(source, ["rev-parse", "HEAD"]),
    npmAudit,
    runnerAudit,
    environment: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      PRISM_RELEASE_NPM_AUDIT: npmAudit,
      PRISM_RELEASE_RUNNER_AUDIT: runnerAudit,
    },
  };
}

function runReleaseGate(
  setup: ReleaseGateFixture,
  extraEnvironment: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [checkScript, "--root", setup.source], {
    cwd: setup.source,
    env: { ...setup.environment, ...extraEnvironment },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function assertReleaseFailure(result: ReturnType<typeof runReleaseGate>): void {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Prism developer-preview release gate failed: [a-z0-9-]+\n$/u);
}

function assertReleaseSuccess(result: ReturnType<typeof runReleaseGate>): void {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "Prism developer-preview release gate: ok\n");
  assert.equal(result.stderr, "");
}

test("Phase 5 freezes the local pack, final release, and clean-checkout commands", () => {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["test:phase5:red"], [
    "tsx --test",
    "tests/compat/phase5-documentation-contract.test.ts",
    "tests/compat/phase5-public-claims-contract.test.ts",
    "tests/compat/phase5-release-contract.test.ts",
    "tests/compat/phase5-candidate-contract.test.ts",
    "tests/compat/phase5-clean-checkout-contract.test.ts",
    "tests/compat/phase5-review-fixes.test.ts",
  ].join(" "));
  assert.equal(packageJson.scripts["pack:preview"], `node ${PHASE5_PACK_SCRIPT}`);
  assert.equal(packageJson.scripts["check:release"], `node ${PHASE5_CHECK_SCRIPT}`);
  assert.equal(
    packageJson.scripts["check:release:clean"],
    `node ${PHASE5_CLEAN_CHECKOUT_SCRIPT}`,
  );
  for (const path of [PHASE5_PACK_SCRIPT, PHASE5_CHECK_SCRIPT, PHASE5_CLEAN_CHECKOUT_SCRIPT]) {
    assert.equal(existsSync(resolve(repositoryRoot, path)), true, `missing ${path}`);
  }
});

test("the final release gate closes deterministic candidate, claim, and packed-acceptance integration", async (context) => {
  for (const path of [PHASE5_RELEASE_MODULE, PHASE5_PACK_SCRIPT, PHASE5_CHECK_SCRIPT]) {
    if (!existsSync(resolve(repositoryRoot, path))) {
      context.skip(`awaiting ${path}`);
      return;
    }
  }

  const setup = await releaseGateFixture(context);
  const result = runReleaseGate(setup);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "Prism developer-preview release gate: ok\n");
  assert.equal(result.stderr, "");

  const npmAudit = readJsonLines<NpmAuditRow>(setup.npmAudit);
  const claimRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "run check:public-claims");
  assert.equal(claimRows.length, 1);
  assert.equal(claimRows[0]?.cwd, setup.source);
  const documentationRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "run test:phase5:red");
  assert.equal(documentationRows.length, 1);
  assert.equal(documentationRows[0]?.cwd, setup.source);
  const ciRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "ci");
  assert.equal(ciRows.length, 0);
  const buildRows = npmAudit.filter(({ arguments: args }) => args.join(" ") === "run build:packages");
  assert.equal(buildRows.length, 1);
  const isolatedRoot = buildRows[0]?.cwd as string;
  assert.notEqual(isolatedRoot, setup.source);
  const packRows = npmAudit.filter(({ arguments: args }) => args[0] === "pack");
  assert.equal(packRows.length, 4);
  assert.deepEqual(
    packRows.map(({ cwd }) => cwd).sort(),
    PHASE5_CANDIDATE_PACKAGES.map(({ name }) => (
      resolve(isolatedRoot, "packages", name.split("/")[1] as string)
    )).sort(),
  );
  for (const { arguments: args } of packRows) {
    assert.equal(args.includes("--json"), true);
    assert.equal(args.includes("--ignore-scripts"), true);
    assert.notEqual(args.indexOf("--pack-destination"), -1);
  }
  const runnerAudit = readJsonLines<RunnerAuditRow>(setup.runnerAudit);
  assert.equal(runnerAudit.length, 1);
  const runner = runnerAudit[0] as RunnerAuditRow;
  assert.deepEqual(runner.arguments, ["--candidate", runner.candidateRoot]);
  assert.match(runner.candidateRoot, /prism-preview-copy-/u);
  assert.equal(runner.sourceCommit, setup.head);
  assert.deepEqual(runner.packages, PHASE5_CANDIDATE_PACKAGES.map(({ name }) => name));
  assert.deepEqual(runner.documents, PHASE5_CANDIDATE_DOCUMENTS);
  const candidateRelative = relative(setup.source, runner.candidateRoot);
  assert.equal(
    candidateRelative === ".." || candidateRelative.startsWith(`..${sep}`),
    true,
    "packed acceptance must consume a candidate outside the checkout",
  );
  assert.equal(existsSync(runner.candidateRoot), false, "release gate did not remove its candidate workspace");
  assert.equal(
    npmAudit.some(({ arguments: args }) => args.some((value) => /(?:ollama\s+pull|install|ci)/u.test(value))),
    false,
  );

  for (const environment of [
    { PRISM_RELEASE_FAKE_PACK_FORBIDDEN: "1" },
    { PRISM_RELEASE_FAKE_CLAIMS_FAIL: "1" },
    { PRISM_RELEASE_FAKE_RUNNER_FAIL: "1" },
  ]) assertReleaseFailure(runReleaseGate(setup, environment));

  const invalidDocumentation = await releaseGateFixture(context, "documentation-invalid");
  assertReleaseFailure(runReleaseGate(invalidDocumentation));
  for (const mode of ["stale-evidence", "ledger-mismatch", "live-state-absent"] as const) {
    const liveState = await releaseGateFixture(context, mode);
    const paths = [
      PHASE5_LIVE_EVIDENCE_PATH,
      PHASE5_LIVE_ATTEMPT_PATH,
      PHASE5_LIVE_FIXTURE_PATH,
      PHASE5_LIVE_EXPECTED_FACT_PATH,
      PHASE5_LIVE_ACCEPTANCE_SCRIPT,
    ];
    const before = paths.map((path) => {
      const absolute = resolve(liveState.source, path);
      return existsSync(absolute) ? readFileSync(absolute, "utf8") : undefined;
    });
    assertReleaseSuccess(runReleaseGate(liveState));
    assert.deepEqual(paths.map((path) => {
      const absolute = resolve(liveState.source, path);
      return existsSync(absolute) ? readFileSync(absolute, "utf8") : undefined;
    }), before);
  }
});

test("the clean-checkout gate avoids system temp and runs five exact commands at one detached clean commit", async (context) => {
  if (!existsSync(cleanScript)) {
    context.skip(`awaiting ${PHASE5_CLEAN_CHECKOUT_SCRIPT}`);
    return;
  }
  const setup = await fixture(context);
  const expectedHead = git(setup.root, ["rev-parse", "HEAD"]);
  const forbiddenTemporary = resolve(dirname(setup.root), "system-temp-is-not-a-directory");
  await writeFile(forbiddenTemporary, "clean checkout must not use system temp\n", "utf8");
  const result = runGate(setup, {
    TMPDIR: forbiddenTemporary,
    TMP: forbiddenTemporary,
    TEMP: forbiddenTemporary,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "Prism clean-checkout release gate: ok\n");
  assert.equal(result.stderr, "");

  const audit = readAudit(setup.audit);
  assert.deepEqual(audit.map(({ arguments: arguments_ }) => arguments_), [
    ["--version"],
    ["ci"],
    ["run", "build"],
    ["test"],
    ["run", "pack:check"],
    ["run", "check:release"],
  ]);
  const gateRows = audit.slice(1);
  assert.equal(audit[0]?.cwd, setup.root);
  assert.equal(audit[0]?.docker, setup.dockerConfig);
  assert.equal(audit[0]?.buildxConfig, "sentinel-buildx-config");
  assert.equal(audit[0]?.buildxBuilder, "sentinel-buildx-builder");
  assert.equal(audit[0]?.buildkitHost, "sentinel-buildkit-host");
  assert.equal(new Set(gateRows.map(({ cwd }) => cwd)).size, 1);
  const checkout = gateRows[0]?.cwd as string;
  assert.notEqual(checkout, setup.root);
  const checkoutSegments = relative(dirname(setup.root), checkout).split(sep);
  assert.equal(checkoutSegments.length, 2);
  assert.match(checkoutSegments[0] ?? "", /^\.prism-clean-checkout-[A-Za-z0-9]+$/u);
  assert.equal(checkoutSegments[1], "checkout");
  assert.equal(existsSync(resolve(checkout, "tracked.txt")), false, "temporary checkout was not removed");
  for (const row of gateRows) {
    assert.equal(row.head, expectedHead);
    assert.notEqual(row.home, setup.environment.HOME);
    assert.notEqual(row.config, process.env.XDG_CONFIG_HOME);
    assert.notEqual(row.state, process.env.XDG_STATE_HOME);
    assert.notEqual(row.cache, process.env.npm_config_cache);
    assert.notEqual(row.docker, setup.dockerConfig);
    assert.deepEqual(row.dockerEntries, ["cli-plugins"]);
    assert.deepEqual(row.pluginEntries, ["docker-buildx"]);
    assert.equal(row.pluginTarget, setup.executableBuildx);
    assert.equal(row.buildxConfig, null);
    assert.equal(row.buildxBuilder, null);
    assert.equal(row.buildkitHost, null);
    assert.ok(row.home.length > 0 && row.config.length > 0 && row.state.length > 0 && row.cache.length > 0 && row.docker.length > 0);
  }
  assert.equal(existsSync(gateRows[0]?.docker as string), false, "temporary Docker config was not removed");
});

test("the clean-checkout gate refuses dirty source before invoking npm", async (context) => {
  if (!existsSync(cleanScript)) {
    context.skip(`awaiting ${PHASE5_CLEAN_CHECKOUT_SCRIPT}`);
    return;
  }
  const setup = await fixture(context);
  await writeFile(resolve(setup.root, "untracked.txt"), "dirty\n", "utf8");
  const result = runGate(setup);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Prism clean-checkout release gate failed: source-dirty\n");
  assert.equal(existsSync(setup.audit), false);
});

test("the clean-checkout gate removes its detached checkout after a child gate fails", async (context) => {
  if (!existsSync(cleanScript)) {
    context.skip(`awaiting ${PHASE5_CLEAN_CHECKOUT_SCRIPT}`);
    return;
  }
  const setup = await fixture(context);
  const result = runGate(setup, { PRISM_RELEASE_FAKE_FAIL: "run build" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Prism clean-checkout release gate failed: gate-failed\n");
  const audit = readAudit(setup.audit);
  assert.deepEqual(audit.map(({ arguments: arguments_ }) => arguments_), [
    ["--version"],
    ["ci"],
    ["run", "build"],
  ]);
  assert.equal(existsSync(audit[1]?.cwd as string), false, "failed checkout was not removed");
});
