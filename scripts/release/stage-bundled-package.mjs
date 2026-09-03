import { cp, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

async function readManifest(path, code) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(code);
  }
  if (!isRecord(value)) fail(code);
  return value;
}

async function requireRealDirectory(path, code) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(code);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(code);
  return realpath(path);
}

export async function stageBundledPackageForPack(input) {
  const packageRoot = await requireRealDirectory(resolve(input.packageRoot), "package-root-unsafe");
  const manifest = await readManifest(resolve(packageRoot, "package.json"), "package-manifest-invalid");
  const bundled = manifest.bundleDependencies;
  if (bundled === undefined || (Array.isArray(bundled) && bundled.length === 0)) return packageRoot;
  if (
    !Array.isArray(bundled)
    || bundled.some((name) => typeof name !== "string" || !PACKAGE_NAME.test(name))
    || new Set(bundled).size !== bundled.length
    || !isRecord(manifest.dependencies)
  ) fail("bundled-dependencies-invalid");

  const dependencyRoot = await requireRealDirectory(resolve(input.dependencyRoot), "dependency-root-unsafe");
  const stagingRoot = resolve(input.stagingRoot);
  try {
    await lstat(stagingRoot);
    fail("pack-stage-exists");
  } catch (error) {
    if (error instanceof Error && error.message === "pack-stage-exists") throw error;
    if (!isRecord(error) || error.code !== "ENOENT") fail("pack-stage-unsafe");
  }

  await mkdir(dirname(stagingRoot), { recursive: true, mode: 0o700 });
  const sourceNodeModules = resolve(packageRoot, "node_modules");
  await cp(packageRoot, stagingRoot, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (source) => source !== sourceNodeModules,
  });
  const stagedNodeModules = resolve(stagingRoot, "node_modules");
  await mkdir(stagedNodeModules, { mode: 0o700 });

  for (const name of bundled) {
    const expectedVersion = manifest.dependencies[name];
    if (typeof expectedVersion !== "string" || !/^\d+\.\d+\.\d+$/u.test(expectedVersion)) {
      fail("bundled-dependency-version-invalid");
    }
    const segments = name.split("/");
    const source = resolve(dependencyRoot, ...segments);
    if (!isWithin(dependencyRoot, source)) fail("bundled-dependency-path-invalid");
    const canonicalSource = await requireRealDirectory(source, "bundled-dependency-missing");
    if (!isWithin(dependencyRoot, canonicalSource)) fail("bundled-dependency-path-invalid");
    const dependencyManifest = await readManifest(
      resolve(canonicalSource, "package.json"),
      "bundled-dependency-manifest-invalid",
    );
    if (dependencyManifest.name !== name || dependencyManifest.version !== expectedVersion) {
      fail("bundled-dependency-version-mismatch");
    }
    const destination = resolve(stagedNodeModules, ...segments);
    if (!isWithin(stagedNodeModules, destination)) fail("bundled-dependency-path-invalid");
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await cp(canonicalSource, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  return stagingRoot;
}
