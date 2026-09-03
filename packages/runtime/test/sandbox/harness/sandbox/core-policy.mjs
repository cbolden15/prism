import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformCoreSource } from "./core-transform.mjs";

function fail(message) {
  throw new Error(`PNH core loader: ${message}`);
}

function plainRecord(value, exactKeys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value).sort();
  return keys.length === exactKeys.length && keys.every((key, index) => key === exactKeys[index]);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function validEntryName(name) {
  return (
    typeof name === "string" &&
    /^[a-z0-9][a-z0-9._/-]*\.ts$/.test(name) &&
    !name.endsWith(".d.ts") &&
    !name.includes("//") &&
    !name.split("/").includes("..")
  );
}

function validateManifest(manifest) {
  if (!plainRecord(manifest, ["coreRoot", "edges", "entries", "files"])) {
    fail("manifest must be an object");
  }
  if (typeof manifest.coreRoot !== "string" || !Array.isArray(manifest.entries)) {
    fail("manifest is missing coreRoot or entries");
  }
  if (typeof manifest.files !== "object" || manifest.files === null || Array.isArray(manifest.files)) {
    fail("manifest files must be an object");
  }
  if (!Array.isArray(manifest.edges)) fail("manifest edges must be an array");
  let coreRoot;
  try {
    coreRoot = realpathSync.native(manifest.coreRoot);
  } catch {
    fail("manifest coreRoot is invalid");
  }
  if (coreRoot !== manifest.coreRoot || !lstatSync(coreRoot).isDirectory()) {
    fail("manifest coreRoot is not canonical");
  }

  const fileUrls = new Set();
  for (const [name, file] of Object.entries(manifest.files)) {
    if (
      !validEntryName(name) ||
      !plainRecord(file, ["path", "sha256", "url"]) ||
      typeof file.path !== "string" ||
      typeof file.url !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    ) {
      fail("manifest contains an invalid file record");
    }
    let canonicalPath;
    try {
      canonicalPath = realpathSync.native(file.path);
    } catch {
      fail("manifest file does not exist");
    }
    const relativeName = relative(coreRoot, canonicalPath).split(sep).join("/");
    if (
      canonicalPath !== file.path ||
      !isInside(coreRoot, canonicalPath) ||
      relativeName !== name ||
      !lstatSync(canonicalPath).isFile()
    ) {
      fail("manifest file is outside core root");
    }
    if (pathToFileURL(canonicalPath).href !== file.url || fileUrls.has(file.url)) {
      fail("manifest file URL is invalid");
    }
    const digest = createHash("sha256").update(readFileSync(canonicalPath)).digest("hex");
    if (digest !== file.sha256) fail("manifest source digest mismatch");
    fileUrls.add(file.url);
  }

  const fileNames = Object.keys(manifest.files).sort();
  if (
    fileNames.length === 0 ||
    manifest.entries.length !== fileNames.length ||
    [...new Set(manifest.entries)].sort().join("\u0000") !== fileNames.join("\u0000")
  ) {
    fail("manifest entries must name every core file exactly once");
  }

  const edgeKeys = new Set();
  for (const edge of manifest.edges) {
    if (
      !plainRecord(edge, ["parent", "specifier", "target"]) ||
      typeof edge.parent !== "string" ||
      typeof edge.specifier !== "string" ||
      typeof edge.target !== "string" ||
      !fileUrls.has(edge.parent) ||
      !fileUrls.has(edge.target) ||
      !edge.specifier.startsWith("./") && !edge.specifier.startsWith("../") ||
      !edge.specifier.endsWith(".ts") ||
      new URL(edge.specifier, edge.parent).href !== edge.target
    ) {
      fail("invalid manifest edge");
    }
    const key = `${edge.parent}\u0000${edge.specifier}`;
    if (edgeKeys.has(key)) fail("duplicate manifest edge");
    edgeKeys.add(key);
  }
  return manifest;
}

export function createCorePolicy({ manifest, ts, workerPath }) {
  const checked = validateManifest(manifest);
  const workerUrl = pathToFileURL(workerPath).href;
  const filesByUrl = new Map(Object.values(checked.files).map((file) => [file.url, file]));
  const entries = new Set(
    checked.entries.map((name) => checked.files[name]?.url).filter((url) => url !== undefined),
  );
  const edges = new Map(
    checked.edges.map((edge) => [`${edge.parent}\u0000${edge.specifier}`, edge.target]),
  );

  return {
    resolve(specifier, context, nextResolve) {
      if (filesByUrl.has(context.parentURL)) {
        const target = edges.get(`${context.parentURL}\u0000${specifier}`);
        if (target === undefined) fail(`unlisted core edge ${specifier}`);
        return { format: "module", shortCircuit: true, url: target };
      }

      const resolved = nextResolve(specifier, context);
      if (filesByUrl.has(resolved.url)) {
        if (context.parentURL === workerUrl && entries.has(resolved.url)) {
          return { format: "module", shortCircuit: true, url: resolved.url };
        }
        fail(`outside importer attempted core URL ${resolved.url}`);
      }
      return resolved;
    },

    load(url, context, nextLoad) {
      const file = filesByUrl.get(url);
      if (file === undefined) return nextLoad(url, context);
      const canonicalPath = realpathSync.native(fileURLToPath(url));
      if (canonicalPath !== file.path) fail(`realpath mismatch for ${url}`);
      const source = readFileSync(canonicalPath, "utf8");
      const digest = createHash("sha256").update(source).digest("hex");
      if (digest !== file.sha256) fail(`source digest mismatch for ${url}`);
      return {
        format: "module",
        shortCircuit: true,
        source: transformCoreSource(ts, file, source),
      };
    },
  };
}
