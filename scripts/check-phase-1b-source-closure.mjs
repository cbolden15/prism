import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  repositoryRoot,
  "docs/plans/developer-preview/2026-08-30-phase-1b-source-closure.json",
);
const mode = process.argv[2] ?? "--current";
if (!["--initial", "--current", "--final"].includes(mode)) {
  throw new Error("usage: check-phase-1b-source-closure.mjs [--initial|--current|--final]");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.sourceRoots) || !Array.isArray(manifest.entries)) {
  throw new Error("invalid source-closure manifest shape");
}

function repositoryPath(path) {
  if (typeof path !== "string" || path === "" || path.startsWith("/") || path.includes("..")) {
    throw new Error(`unsafe repository path: ${String(path)}`);
  }
  const absolute = resolve(repositoryRoot, path);
  if (absolute !== repositoryRoot && !absolute.startsWith(`${repositoryRoot}${sep}`)) {
    throw new Error(`path escapes repository: ${path}`);
  }
  return absolute;
}

function listFiles(root) {
  const absoluteRoot = repositoryPath(root);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (absoluteDirectory, relativeDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`;
      const absolute = resolve(absoluteDirectory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`source root contains symlink: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else throw new Error(`source root contains unsupported entry: ${relative}`);
    }
  };
  visit(absoluteRoot, root);
  return files.sort();
}

const roots = [...manifest.sourceRoots];
if (roots.length === 0 || new Set(roots).size !== roots.length) {
  throw new Error("source roots must be a non-empty unique array");
}
for (const root of roots) repositoryPath(root);

const sources = new Set();
const destinationGroups = new Map();
let previousSource = "";
for (const entry of manifest.entries) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    typeof entry.source !== "string" ||
    typeof entry.destination !== "string" ||
    typeof entry.owner !== "string" ||
    !["move", "merge"].includes(entry.action)
  ) {
    throw new Error("invalid source-closure entry");
  }
  repositoryPath(entry.source);
  repositoryPath(entry.destination);
  if (entry.source <= previousSource) throw new Error(`entries are not source-sorted: ${entry.source}`);
  previousSource = entry.source;
  if (!roots.some((root) => entry.source.startsWith(`${root}/`))) {
    throw new Error(`source is outside declared roots: ${entry.source}`);
  }
  if (roots.some((root) => entry.destination === root || entry.destination.startsWith(`${root}/`))) {
    throw new Error(`destination remains in a legacy root: ${entry.destination}`);
  }
  if (sources.has(entry.source)) throw new Error(`duplicate source: ${entry.source}`);
  sources.add(entry.source);
  const group = destinationGroups.get(entry.destination) ?? [];
  group.push(entry);
  destinationGroups.set(entry.destination, group);
}

for (const [destination, entries] of destinationGroups) {
  if (entries.length === 1) continue;
  const mergeGroup = entries[0].mergeGroup;
  if (
    typeof mergeGroup !== "string" ||
    entries.some((entry) => entry.action !== "merge" || entry.mergeGroup !== mergeGroup)
  ) {
    throw new Error(`duplicate destination without one merge group: ${destination}`);
  }
}

const discoveredSources = roots.flatMap(listFiles);
for (const source of discoveredSources) {
  if (!sources.has(source)) throw new Error(`unassigned source file: ${source}`);
}

for (const source of sources) {
  const sourceExists = existsSync(repositoryPath(source));
  const entry = manifest.entries.find((candidate) => candidate.source === source);
  const destinationExists = existsSync(repositoryPath(entry.destination));
  if (sourceExists && !lstatSync(repositoryPath(source)).isFile()) {
    throw new Error(`source is not a regular file: ${source}`);
  }
  if (destinationExists && !lstatSync(repositoryPath(entry.destination)).isFile()) {
    throw new Error(`destination is not a regular file: ${entry.destination}`);
  }
  if (mode === "--initial" && (!sourceExists || destinationExists)) {
    throw new Error(`initial state mismatch: ${source}`);
  }
  if (mode === "--final" && (sourceExists || !destinationExists)) {
    throw new Error(`final state mismatch: ${source}`);
  }
}

if (mode === "--current") {
  for (const [destination, entries] of destinationGroups) {
    const destinationExists = existsSync(repositoryPath(destination));
    const existingSources = entries.filter((entry) => existsSync(repositoryPath(entry.source)));
    if (destinationExists && existingSources.length > 0) {
      throw new Error(`source and destination both exist: ${destination}`);
    }
    if (!destinationExists && existingSources.length !== entries.length) {
      throw new Error(`source group is incomplete without destination: ${destination}`);
    }
  }
}

const state = mode.slice(2);
process.stdout.write(`source closure ok: ${manifest.entries.length} entries (${state})\n`);
