import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const architecturePath = "docs/architecture/README.md";
const diagrams = [
  {
    path: "docs/architecture/diagrams/system-and-packages.mmd",
    labels: [
      "@useprism/cli",
      "@useprism/runtime",
      "@useprism/sdk",
      "@useprism/provider-ollama",
      "@useprism/provider-codex",
      "source-only, unpublished",
      "ambient subprocess authority",
      "Optional assurance lanes",
    ],
  },
  {
    path: "docs/architecture/diagrams/bounded-run.mmd",
    labels: [
      "goal.accepted",
      "provider.tool-requested",
      "policy.allowed",
      "tool.completed",
      "provider.finalized",
      "run.completed",
      "Fixed limits",
      "Subprocess cleanup receipt",
    ],
  },
  {
    path: "docs/architecture/diagrams/plugin-admission.mmd",
    labels: [
      ".prism/tool-plugin.json",
      "non-executing proposal",
      "Per-user digest approval",
      "Identity and owner approval",
      "not safety",
      "Ambient subprocess authority",
      "Authoritative cleanup receipt",
      "prism-run-record-v3",
    ],
  },
  {
    path: "docs/architecture/diagrams/local-data-and-evidence.mmd",
    labels: [
      ".prism/config.json",
      ".prism/tool-plugin.json",
      "prism/trust.json",
      "plugin-approvals/v1/",
      "plugin-artifacts/v1/",
      "runs/<run-id>.json",
      "Retained in V3",
      "Omitted from V3 evidence",
      "raw plugin input and output",
      "sensitive local operator data",
    ],
  },
  {
    path: "docs/architecture/diagrams/assurance-lanes.mmd",
    labels: [
      "Normal developer-preview path",
      "Optional Docker assurance",
      "Qualified disposable",
      "Linux x86_64",
      "KVM evidence",
      "QEMU profile",
      "Firecracker",
      "physical X1",
      "evidence unverified",
    ],
  },
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n");
}

function mermaidBlocks(markdown) {
  return [...markdown.matchAll(/```mermaid\n([\s\S]*?)\n```/gu)].map((match) => `${match[1]}\n`);
}

function markdownFiles() {
  const files = [
    "README.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "GOVERNANCE.md",
    "SECURITY.md",
    "SUPPORT.md",
    "packages/cli/README.md",
    "packages/provider-ollama/README.md",
    "packages/runtime/README.md",
    "packages/sdk/README.md",
  ];
  const visit = (base) => {
    for (const entry of readdirSync(resolve(root, base), { withFileTypes: true })) {
      const path = `${base}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
    }
  };
  for (const directory of ["docs/architecture", "docs/assurance", "docs/developer-preview", "docs/releases/developer-preview", "examples"]) {
    visit(directory);
  }
  return [...new Set(files)].sort();
}

function markdownTargets(contents) {
  return [
    ...[...contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)].map((match) => match[1]),
    ...[...contents.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gmu)].map((match) => match[1]),
  ];
}

function assertExactCase(path) {
  let directory = root;
  for (const component of path.split("/")) {
    if (!readdirSync(directory).includes(component)) fail(`wrong-case link target: ${path}`);
    directory = resolve(directory, component);
  }
}

function checkLinks() {
  for (const file of markdownFiles()) {
    for (const raw of markdownTargets(read(file))) {
      let target = raw.trim().split(/\s+["']/u)[0];
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      target = decodeURIComponent(target.split("#", 1)[0]);
      if (target === "") continue;
      if (target.startsWith("/")) fail(`${file}: absolute local link: ${target}`);
      const absolute = resolve(root, dirname(file), target);
      const fromRoot = relative(root, absolute);
      if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith("/")) {
        fail(`${file}: link escapes repository: ${target}`);
      }
      if (!existsSync(absolute)) fail(`${file}: missing link target: ${target}`);
      assertExactCase(fromRoot.split(sep).join("/"));
    }
  }
}

function checkDiagrams() {
  const architecture = read(architecturePath);
  const blocks = mermaidBlocks(architecture);
  if (blocks.length !== diagrams.length) fail(`${architecturePath}: expected ${diagrams.length} Mermaid blocks`);
  diagrams.forEach((diagram, index) => {
    const source = read(diagram.path);
    if (!source.startsWith("flowchart ")) fail(`${diagram.path}: expected a flowchart declaration`);
    if (blocks[index] !== source) fail(`${architecturePath}: Mermaid block ${index + 1} differs from ${diagram.path}`);
    for (const label of diagram.labels) {
      if (!source.includes(label)) fail(`${diagram.path}: missing critical label: ${label}`);
    }
  });
  const rootBlocks = mermaidBlocks(read("README.md"));
  if (rootBlocks.length !== 1 || rootBlocks[0] !== read(diagrams[0].path)) {
    fail("README.md: architecture diagram differs from system-and-packages.mmd");
  }
  if ((architecture.match(/Text equivalent:/gu) ?? []).length !== diagrams.length) {
    fail(`${architecturePath}: every diagram needs one text equivalent`);
  }
}

function checkVersions() {
  const rootManifest = JSON.parse(read("package.json"));
  const version = rootManifest.version;
  const packagePaths = [
    "packages/cli/package.json",
    "packages/provider-ollama/package.json",
    "packages/runtime/package.json",
    "packages/sdk/package.json",
  ];
  for (const path of packagePaths) {
    const manifest = JSON.parse(read(path));
    if (manifest.version !== version) fail(`${path}: version differs from root ${version}`);
  }
  if (read(".node-version").trim() !== "26.8.1") fail(".node-version: expected 26.8.1");
  for (const file of markdownFiles()) {
    for (const match of read(file).matchAll(/@useprism\/[a-z-]+@(\d+\.\d+\.\d+)/gu)) {
      if (match[1] !== version) fail(`${file}: package coordinate differs from ${version}: ${match[0]}`);
    }
  }
}

function checkDocumentedCommands() {
  const contributing = read("CONTRIBUTING.md");
  for (const command of ["npm ci", "npm run docs:check", "npm run test:compat", "npm run check:public-claims"]) {
    if (!contributing.includes(command)) fail(`CONTRIBUTING.md: missing ${command}`);
  }
  if (contributing.includes("npm run test:compat:run")) {
    fail("CONTRIBUTING.md: use the self-contained npm run test:compat command");
  }

  const implementation = read("pnh/README.md");
  const commands = ["npm ci", "npm run build:packages", "npm run prism:example -- \"one two three\""];
  let cursor = -1;
  for (const command of commands) {
    const next = implementation.indexOf(command, cursor + 1);
    if (next <= cursor) fail(`pnh/README.md: missing or reordered ${command}`);
    cursor = next;
  }

  const runtime = read("packages/runtime/README.md");
  for (const phrase of ["const provider =", "async policy()", "tools: []", "complete Runtime API example"]) {
    if (!runtime.includes(phrase)) fail(`packages/runtime/README.md: incomplete example, missing ${phrase}`);
  }
}

function checkRequiredArtifacts() {
  for (const path of [
    "CODE_OF_CONDUCT.md",
    "GOVERNANCE.md",
    ".github/ISSUE_TEMPLATE/documentation.yml",
    "docs/README.md",
    "docs/developer-preview/compatibility.md",
    "examples/README.md",
    "examples/deterministic/README.md",
    "examples/runtime-api/run.mjs",
    "examples/project-plugin/release-slug/index.mjs",
    "examples/ollama/README.md",
    "examples/failures/policy-denied.mjs",
  ]) {
    const absolute = resolve(root, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) fail(`missing required repository artifact: ${path}`);
  }
}

checkRequiredArtifacts();
checkDiagrams();
checkLinks();
checkVersions();
checkDocumentedCommands();
process.stdout.write("Prism documentation checks: ok\n");
