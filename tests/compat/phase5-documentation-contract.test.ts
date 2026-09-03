import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DOCTOR_USAGE } from "../../packages/cli/src/commands/doctor.ts";
import { INIT_USAGE } from "../../packages/cli/src/commands/init.ts";
import { INSPECT_USAGE } from "../../packages/cli/src/commands/inspect.ts";
import { PLUGIN_CHECK_USAGE } from "../../packages/cli/src/commands/plugin-check.ts";
import { PLUGIN_CREATE_USAGE } from "../../packages/cli/src/commands/plugin-create.ts";
import { PLUGIN_DECLARE_USAGE } from "../../packages/cli/src/commands/plugin-declare.ts";
import { PLUGIN_UNDECLARE_USAGE } from "../../packages/cli/src/commands/plugin-undeclare.ts";
import { PLUGIN_APPROVAL_USAGE } from "../../packages/cli/src/commands/plugin-approval.ts";
import { PLUGIN_APPROVE_USAGE } from "../../packages/cli/src/commands/plugin-approve.ts";
import { PLUGIN_REVOKE_USAGE } from "../../packages/cli/src/commands/plugin-revoke.ts";
import { RUN_USAGE } from "../../packages/cli/src/commands/run.ts";
import {
  PHASE5_CANDIDATE_FILES,
  PHASE5_MARKDOWN_DOCUMENTS,
  PHASE5_PUBLIC_CLAIM_SURFACES,
} from "./support/phase5-release-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicPackages = [
  ["@useprism/sdk", "packages/sdk"],
  ["@useprism/runtime", "packages/runtime"],
  ["@useprism/provider-ollama", "packages/provider-ollama"],
  ["@useprism/cli", "packages/cli"],
] as const;

interface SkippableContext {
  skip(message?: string): void;
}

function missingDocuments(): readonly string[] {
  return PHASE5_MARKDOWN_DOCUMENTS.filter((path) => !existsSync(resolve(repositoryRoot, path)));
}

function readDocuments(context: SkippableContext): ReadonlyMap<string, string> | undefined {
  const missing = missingDocuments();
  if (missing.length > 0) {
    context.skip(`awaiting Phase 5 documentation: ${missing.join(", ")}`);
    return undefined;
  }
  return new Map(PHASE5_MARKDOWN_DOCUMENTS.map((path) => [
    path,
    readFileSync(resolve(repositoryRoot, path), "utf8"),
  ]));
}

function assertExactCase(path: string): void {
  let directory = repositoryRoot;
  for (const component of path.split("/")) {
    assert.ok(
      readdirSync(directory).includes(component),
      `Markdown link path has wrong case: ${path}`,
    );
    directory = resolve(directory, component);
  }
}

function markdownTargets(contents: string): readonly string[] {
  return [
    ...[...contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
      .map((match) => match[1] as string),
    ...[...contents.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gmu)]
      .map((match) => match[1] as string),
  ];
}

function markdownSection(contents: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = contents.indexOf(marker);
  assert.notEqual(start, -1, `missing section: ${marker}`);
  const bodyStart = start + marker.length;
  const remainder = contents.slice(bodyStart);
  const nextHeading = remainder.search(/^#{1,2}\s+/mu);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

function shellHereDocument(contents: string, path: string): string {
  const opening = `cat > ${path} <<'EOF'\n`;
  const start = contents.indexOf(opening);
  assert.notEqual(start, -1, `missing here-document: ${path}`);
  const bodyStart = start + opening.length;
  const end = contents.indexOf("\nEOF\n", bodyStart);
  assert.notEqual(end, -1, `unterminated here-document: ${path}`);
  return `${contents.slice(bodyStart, end)}\n`;
}

function normalizeProseWhitespace(contents: string): string {
  return contents.replace(/\s+/gu, " ").trim();
}

function assertInOrder(contents: string, values: readonly string[], label: string): void {
  let cursor = -1;
  for (const value of values) {
    const next = contents.indexOf(value, cursor + 1);
    assert.ok(next > cursor, `${label} omits or reorders ${value}`);
    cursor = next;
  }
}

function markdownTableRows(section: string): readonly (readonly string[])[] {
  return section.split("\n")
    .filter((line) => /^\s*\|.*\|\s*$/u.test(line))
    .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.trim()));
}

test("the installed CLI grammar remains the documentation baseline", () => {
  assert.deepEqual([
    INIT_USAGE,
    DOCTOR_USAGE,
    RUN_USAGE,
    INSPECT_USAGE,
    PLUGIN_CREATE_USAGE,
    PLUGIN_CHECK_USAGE,
    PLUGIN_DECLARE_USAGE,
    PLUGIN_UNDECLARE_USAGE,
    PLUGIN_APPROVAL_USAGE,
    PLUGIN_APPROVE_USAGE,
    PLUGIN_REVOKE_USAGE,
  ], [
    "Usage: prism init [--provider deterministic|ollama] [--model <name>] [--endpoint <url>] [--scope project|user] [--allow-remote-endpoint <origin>] [--yes]\n",
    "Usage: prism doctor [--allow-remote-endpoint <origin>] [--json]\n",
    "Usage: prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--no-plugin] [--json] <goal>\n",
    "Usage: prism inspect [--json] <run-id>\n",
    "Usage: prism plugin create <name> [--directory <path>]\n",
    "Usage: prism plugin check <path> [--json]\n",
    "Usage: prism plugin declare <workspace-relative-path> --operation slugify\n",
    "Usage: prism plugin undeclare\n",
    "Usage: prism plugin approval --json\n",
    "Usage: prism plugin approve --digest <approval-digest>\n",
    "Usage: prism plugin revoke\n",
  ]);
});

test("Phase 5 has the closed mandatory Markdown map with optional historical live evidence", () => {
  assert.deepEqual(
    missingDocuments(),
    [],
    "Phase 5 release prose must not start until every frozen document path is implemented",
  );

  assert.deepEqual(
    readdirSync(resolve(repositoryRoot, "docs", "developer-preview")).sort(),
    [
      "command-reference.md",
      "concepts.md",
      "data-and-trust.md",
      "diagnostics.md",
      "getting-started.md",
      "plugin-authoring.md",
    ],
  );
  assert.deepEqual(readdirSync(resolve(repositoryRoot, "docs", "assurance")), ["README.md"]);
  const releaseFiles = readdirSync(resolve(repositoryRoot, "docs", "releases", "developer-preview")).sort();
  assert.deepEqual(
    releaseFiles.filter((file) => file !== "ollama-live-evidence.json"),
    ["README.md"],
  );
});

test("the public preview documents exactly four published packages with package legal files", () => {
  const rootLicense = readFileSync(resolve(repositoryRoot, "LICENSE"), "utf8");
  const rootNotice = readFileSync(resolve(repositoryRoot, "NOTICE"), "utf8");
  const release = readFileSync(
    resolve(repositoryRoot, "docs/releases/developer-preview/README.md"),
    "utf8",
  );
  const publishedPackages = markdownSection(release, "Published packages")
    .split("\n")
    .map((line) => /^- `(@useprism\/[a-z-]+)` 0\.1\.0\b/u.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);

  assert.deepEqual(publishedPackages, publicPackages.map(([name]) => name));
  assert.match(release, /`packages\/provider-codex` remains source-visible and unpublished/u);

  for (const [name, directory] of publicPackages) {
    const readme = readFileSync(resolve(repositoryRoot, directory, "README.md"), "utf8");
    assert.ok(readme.startsWith(`# ${name}\n`), `${directory}/README.md has the wrong package title`);
    assert.ok(readme.includes(`${name}@0.1.0`), `${directory}/README.md omits the pinned install coordinate`);
    assert.equal(
      readFileSync(resolve(repositoryRoot, directory, "LICENSE"), "utf8"),
      rootLicense,
      `${directory}/LICENSE diverges from the root Apache-2.0 license`,
    );
    assert.equal(
      readFileSync(resolve(repositoryRoot, directory, "NOTICE"), "utf8"),
      rootNotice,
      `${directory}/NOTICE diverges from the root notice`,
    );
  }
});

test("the public repository ships contribution, security, changelog, and ownership guidance", () => {
  const contributing = readFileSync(resolve(repositoryRoot, "CONTRIBUTING.md"), "utf8");
  const security = readFileSync(resolve(repositoryRoot, "SECURITY.md"), "utf8");
  const changelog = readFileSync(resolve(repositoryRoot, "CHANGELOG.md"), "utf8");
  const codeowners = readFileSync(resolve(repositoryRoot, ".github/CODEOWNERS"), "utf8");

  for (const command of ["npm ci", "npm run test:compat:run", "npm run check:public-claims"]) {
    assert.ok(contributing.includes(command), `CONTRIBUTING.md omits ${command}`);
  }
  assert.match(security, /GitHub private vulnerability reporting/u);
  assert.match(security, /Security tab[\s\S]*Report a vulnerability/u);
  assert.doesNotMatch(security, /mailto:|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu);
  assert.match(changelog, /^## \[0\.1\.0\].*developer preview/mu);
  assert.match(codeowners, /^\*\s+@cbolden15\s*$/mu);
});

test("active preview prose uses the Prism brand and public package scope", () => {
  const paths = [
    ...PHASE5_PUBLIC_CLAIM_SURFACES,
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "NOTICE",
    "THIRD_PARTY_NOTICES.md",
    ".env.example",
    ...publicPackages.map(([, directory]) => `${directory}/README.md`),
  ];
  const prose = paths.map((path) => readFileSync(resolve(repositoryRoot, path), "utf8")).join("\n");
  assert.doesNotMatch(prose, /Prism Harness|private-incubation|@prism-harness/iu);
  assert.doesNotMatch(prose, /not approved for public release|not a public release|no package has been published/iu);
});

test("every local Markdown link resolves with exact case inside the candidate tree", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;

  for (const [documentPath, contents] of documents) {
    for (const rawTarget of markdownTargets(contents)) {
      let target = rawTarget.trim().split(/\s+["']/u)[0] as string;
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      target = decodeURIComponent(target.split("#", 1)[0] as string);
      if (target === "") continue;
      assert.equal(target.startsWith("/"), false, `${documentPath}: absolute link ${target}`);
      const absolute = resolve(repositoryRoot, dirname(documentPath), target);
      const fromRoot = relative(repositoryRoot, absolute);
      assert.equal(
        fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith("/"),
        false,
        `${documentPath}: link escapes candidate tree: ${target}`,
      );
      const candidatePath = fromRoot.split(sep).join("/");
      assert.equal(
        candidatePath === "" || PHASE5_CANDIDATE_FILES.some((path) => (
          path === candidatePath || path.startsWith(`${candidatePath}/`)
        )),
        true,
        `${documentPath}: link target is omitted from the candidate: ${target}`,
      );
      assert.equal(existsSync(absolute), true, `${documentPath}: missing link target ${target}`);
      assertExactCase(candidatePath);
    }
  }
});

test("release documentation classifies committed Ollama evidence as historical repository-only evidence", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const release = documents.get("docs/releases/developer-preview/README.md") as string;
  assert.match(release, /`ollama-live-evidence\.json` is committed historical repository-only evidence/u);
  assert.match(release, /not copied into the candidate/u);
  assert.match(release, /`check:release` does not read, validate, mutate, or consume it/u);
});

test("the command reference copies every installed CLI grammar exactly", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const reference = documents.get("docs/developer-preview/command-reference.md") as string;
  for (const usage of [
    INIT_USAGE,
    DOCTOR_USAGE,
    RUN_USAGE,
    INSPECT_USAGE,
    PLUGIN_CREATE_USAGE,
    PLUGIN_CHECK_USAGE,
    PLUGIN_DECLARE_USAGE,
    PLUGIN_UNDECLARE_USAGE,
    PLUGIN_APPROVAL_USAGE,
    PLUGIN_APPROVE_USAGE,
    PLUGIN_REVOKE_USAGE,
  ]) {
    assert.ok(reference.includes(usage.trim()), `missing exact usage: ${usage.trim()}`);
  }
  for (const phrase of [
    "Exit code 0",
    "Exit code 1",
    "Exit code 2",
    "stdout",
    "stderr",
    "one JSON value",
    "Unknown options",
    "--",
    "--no-plugin",
    "Prism run warning: project-plugin-disabled",
    "no run ID",
    "Approved project tool plugin",
    "Revoked project tool plugin approval.",
    "prism-run-record-v3",
  ]) assert.ok(reference.includes(phrase), `command reference omits ${phrase}`);
});

test("onboarding makes the registry deterministic path primary and preserves tarball acceptance", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const rootReadme = documents.get("README.md") as string;
  const gettingStarted = documents.get("docs/developer-preview/getting-started.md") as string;
  const all = [...documents.values()].join("\n");
  const deterministic = markdownSection(gettingStarted, "Deterministic first run");
  const ollama = markdownSection(gettingStarted, "Optional Ollama first run");

  assert.ok(rootReadme.indexOf("Deterministic") >= 0);
  assert.ok(rootReadme.indexOf("Ollama") > rootReadme.indexOf("Deterministic"));
  assert.ok(rootReadme.indexOf("Assurance") > rootReadme.indexOf("Ollama"));
  assertInOrder(rootReadme, [
    "npm install --save-dev @useprism/cli@0.1.0",
    "./node_modules/.bin/prism init --provider deterministic --scope project --yes",
    "./node_modules/.bin/prism doctor",
    "./node_modules/.bin/prism run 'Count the words in: one two three'",
    "./node_modules/.bin/prism inspect --json \"$RUN_ID\"",
  ], "README deterministic first run");
  assert.ok(
    rootReadme.indexOf("npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz")
      > rootReadme.indexOf("npm install --save-dev @useprism/cli@0.1.0"),
    "README must keep tarball acceptance after registry onboarding",
  );
  assert.match(rootReadme, /RUN_ID=/u);
  assert.ok(
    gettingStarted.indexOf("## Optional Ollama first run")
      > gettingStarted.indexOf("## Deterministic first run"),
  );
  assertInOrder(deterministic, [
    "npm install --save-dev @useprism/cli@0.1.0",
    "./node_modules/.bin/prism init --provider deterministic --scope project --yes",
    "./node_modules/.bin/prism doctor",
    "./node_modules/.bin/prism run 'Count the words in: one two three'",
    "./node_modules/.bin/prism inspect --json \"$RUN_ID\"",
  ], "deterministic first run");
  assert.ok(
    gettingStarted.indexOf("npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz")
      > gettingStarted.indexOf("npm install --save-dev @useprism/cli@0.1.0"),
    "getting started must keep tarball acceptance after registry onboarding",
  );
  assert.match(deterministic, /RUN_ID=/u);
  assertInOrder(ollama, [
    "./node_modules/.bin/prism init --provider ollama --model qwen2.5:14b --endpoint http://127.0.0.1:11434 --scope project --yes",
    "./node_modules/.bin/prism doctor",
    "printf '%s\\n' 'The Prism packed acceptance marker is indigo-orbit-47.' > FACTS.md",
    "./node_modules/.bin/prism run --no-plugin 'Find the Prism packed acceptance marker and name its file.'",
    "./node_modules/.bin/prism inspect --json \"$OLLAMA_RUN_ID\"",
  ], "optional Ollama first run");
  assert.match(ollama, /OLLAMA_RUN_ID=/u);
  assert.equal(/ollama\s+pull/iu.test(all), false, "Phase 5 automation must not pull a model");
  assert.equal(/prism\s+run\s+--provider\s+codex/iu.test(all), false);
  assert.equal(/npm\s+(?:install|i)\s+(?:-g\s+)?@prism-harness/iu.test(all), false);
  assert.equal(/\bTBD\b|example\.com|npmjs\.com\/package\/@prism-harness/iu.test(all), false);
});

test("README and getting started document the deterministic project plugin workflow", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const rootReadme = documents.get("README.md") as string;
  const documentedSource = shellHereDocument(rootReadme, "prism-plugins/release-slug/index.mjs");
  const documentedTest = shellHereDocument(rootReadme, "prism-plugins/release-slug/index.test.mjs");

  for (const [path, contents] of [
    ["README.md", rootReadme],
    ["docs/developer-preview/getting-started.md", documents.get("docs/developer-preview/getting-started.md") as string],
  ] as const) {
    assert.equal(
      shellHereDocument(contents, "prism-plugins/release-slug/index.mjs"),
      documentedSource,
      `${path} source diverges from the packed workflow`,
    );
    assert.equal(
      shellHereDocument(contents, "prism-plugins/release-slug/index.test.mjs"),
      documentedTest,
      `${path} test diverges from the packed workflow`,
    );
    assertInOrder(contents, [
      "npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false ../packages/*.tgz",
      "./node_modules/.bin/prism init --provider deterministic --scope project --yes",
      "./node_modules/.bin/prism plugin create release-slug",
      "export function slugify(title)",
      "node --test prism-plugins/release-slug/index.test.mjs",
      "./node_modules/.bin/prism plugin check prism-plugins/release-slug",
      "./node_modules/.bin/prism plugin declare prism-plugins/release-slug --operation slugify",
      "./node_modules/.bin/prism plugin approval --json > approval.json",
      "APPROVAL_DIGEST=",
      "./node_modules/.bin/prism plugin approve --digest \"$APPROVAL_DIGEST\"",
      "./node_modules/.bin/prism run 'Create a slug for release title: Preview First'",
      "preview-first",
      "./node_modules/.bin/prism inspect --json \"$RUN_ID\"",
    ], `${path} project plugin workflow`);
    for (const phrase of [
      '"version": "prism-project-plugin-approval-proposal-v1"',
      '"declaredPath": "prism-plugins/release-slug"',
      '"operation": "slugify"',
      '"id": "release-slug"',
      'return { kind: "tool", operations: ["slugify"], pluginId: "release-slug" };',
      "async function runToolLoop()",
      "approvalDigest",
      '["sand" + "boxed"] !== false',
      "prism-run-record-v3",
    ]) assert.ok(contents.includes(phrase), `${path} does not assert ${phrase}`);
    assert.equal(/plugin approval --json\s*\|/u.test(contents), false, `${path} must not teach blind approval piping`);
  }
});

test("plugin, data, diagnostics, and assurance docs preserve the reviewed boundaries", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const plugin = documents.get("docs/developer-preview/plugin-authoring.md") as string;
  const trust = documents.get("docs/developer-preview/data-and-trust.md") as string;
  const diagnostics = documents.get("docs/developer-preview/diagnostics.md") as string;
  const assurance = documents.get("docs/assurance/README.md") as string;
  const pluginSequence = markdownSection(plugin, "Create and check a tool plugin");
  const normalizedPluginSequence = normalizeProseWhitespace(pluginSequence);

  for (const value of [
    "README.md",
    "index.mjs",
    "index.test.mjs",
    "manifest.json",
    "prism-plugins",
    "ambient host authority",
    "not a sandbox",
    "does not prove safety",
    "runtime closure",
    "static relative imports",
    "`node:` specifiers",
    "import()",
    "require",
    "import.meta",
    "declare",
    "reapproval",
    "no direct execution bypass",
    "runtime-ready entrypoint",
    "runToolLoop",
  ]) assert.ok(normalizedPluginSequence.includes(value), `plugin authoring section omits ${value}`);
  assertInOrder(pluginSequence, [
    "./node_modules/.bin/prism plugin create packed-tool",
    "node --test prism-plugins/packed-tool/index.test.mjs",
    "./node_modules/.bin/prism plugin check prism-plugins/packed-tool",
  ], "plugin authoring sequence");

  const normalizedTrust = normalizeProseWhitespace(trust);
  for (const value of [
    "<workspace>/.prism/config.json",
    "${XDG_CONFIG_HOME:-~/.config}/prism/config.json",
    "${XDG_CONFIG_HOME:-~/.config}/prism/trust.json",
    "${XDG_STATE_HOME:-~/.local/state}/prism/runs/<run-id>.json",
    "<cwd>/prism-plugins",
    "Goals and final answers",
    "selected provider",
    "not a confidentiality boundary",
    "not signatures",
    "Windows",
    "WSL",
    "Project tool declaration",
    "Per-user approval",
    "Artifact cache",
    "prism-project-tool-plugin-v1",
    "prism-project-plugin-approval-v1",
    "plugin-artifacts/v1/<registry-digest>",
    "prism-run-record-v3",
    "raw plugin input",
    "raw plugin output",
    "raw paths",
    "cleanup: null",
    "no plugin lifecycle began",
    "identity-and-owner-approval",
    "not a safety guarantee",
    "not a sandbox",
  ]) assert.ok(normalizedTrust.includes(value), `data and trust omits ${value}`);

  const diagnosticRows = markdownTableRows(markdownSection(diagnostics, "Diagnostic matrix"));
  assert.deepEqual(diagnosticRows.slice(0, 2), [
    ["Symptom", "Bounded cause", "Next command"],
    ["---", "---", "---"],
  ]);
  const cases = diagnosticRows.slice(2);
  assert.ok(cases.length >= 16, "diagnostics must retain old cases and add project-plugin recovery cases");
  for (const row of cases) {
    assert.equal(row.length, 3);
    assert.match(row[2] as string, /`[^`]+`/u, "each diagnostic needs one concrete next command");
  }
  for (const expectedTerms of [
    ["unsupported node", "unsupported npm"],
    ["config root", "state root", "unwritable"],
    ["remote endpoint not authorized"],
    ["ollama unavailable", "model not found"],
    ["malformed-response", "oversized-response", "timeout"],
    ["invalid run id", "invalid record"],
    ["repository path"],
    ["native-unavailable", "native-integrity"],
    ["root-unmanaged", "destination-exists"],
    ["manifest-invalid", "execution", "output-limit", "cleanup-failed"],
    ["project-plugin-approval-missing", "approval"],
    ["project-plugin-approval-mismatch", "approval"],
    ["project-plugin-approval-digest-mismatch", "approval"],
    ["source-closure", "import"],
    ["project-plugin-artifact", "artifact"],
    ["project-plugin-disabled", "--no-plugin"],
    ["cleanup", "evidence"],
    ["reapprove", "changed"],
  ]) {
    assert.ok(cases.some((row) => {
      const symptomAndCause = row.slice(0, 2).join(" ").toLowerCase();
      return expectedTerms.every((term) => symptomAndCause.includes(term));
    }), `diagnostics omit one structured case: ${expectedTerms.join(", ")}`);
  }
  const lifecycleReceiptRow = cases.find((row) => (
    (row[0] as string).includes("project-plugin-lifecycle-receipt-missing")
  ));
  assert.deepEqual(lifecycleReceiptRow, [
    "`project-plugin-lifecycle-receipt-missing`; evidence cleanup",
    "The child lifecycle began but its authoritative cleanup receipt was unavailable.",
    "`prism plugin revoke`",
  ]);
  assert.ok(diagnostics.includes("produces no run ID or stored record"));

  for (const value of [
    "optional",
    "pnh/README.md",
    "pnh/x1-firecracker/b0/run-profile.sh",
    "qualified Linux x86_64",
    "KVM",
    "physical X1",
    "unverified",
  ]) assert.ok(assurance.includes(value), `assurance docs omit ${value}`);
});

test("concepts document project admission as identity, ownership, and bounded evidence", (context) => {
  const documents = readDocuments(context);
  if (documents === undefined) return;
  const concepts = documents.get("docs/developer-preview/concepts.md") as string;
  const normalizedConcepts = normalizeProseWhitespace(concepts);
  for (const phrase of [
    "project intent",
    "per-user approval",
    "captured-byte commitments",
    "inert digest-addressed artifact",
    "owner-approved admission ticket",
    "one sealed participant",
    "restrictive policy",
    "ambient subprocess authority",
    "observe-only events",
    "authoritative cleanup receipt",
    "profiles",
    "general loader",
    "resource scopes",
    "event infrastructure",
    "HMR",
    "resume",
    "one-shot approval",
  ]) assert.ok(normalizedConcepts.includes(phrase), `concepts omit ${phrase}`);
});
