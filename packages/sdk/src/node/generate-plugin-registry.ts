import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REGISTRY_VERSION,
  validateRegistryDocument,
  type PluginDescriptor,
  type PluginRegistry,
  type RegistryCapabilityCatalog,
  type RegistryEnvironment,
} from "../manifest/registry.js";
import {
  isPluginId,
  normalizeCapabilityCatalog,
  normalizeManifest,
  type NormalizedManifest,
} from "../manifest/plugin-manifest.js";

export { normalizeManifest } from "../manifest/plugin-manifest.js";
export type { NormalizedManifest } from "../manifest/plugin-manifest.js";

const COMMITMENT_KEYS = ["runnerDigest", "imageDigest", "profileDigest"] as const;
const DIGEST_RE = /^[0-9a-f]{64}$/;

export interface PluginArtifactCommitments {
  readonly runnerDigest: string;
  readonly imageDigest: string;
  readonly profileDigest: string;
}

export interface GeneratePluginRegistryOptions {
  readonly pluginsRoot: string;
  readonly environment: RegistryEnvironment;
  readonly capabilityCatalog: RegistryCapabilityCatalog;
  readonly artifactCommitments: Readonly<Record<string, PluginArtifactCommitments>>;
}

export interface CapturedPluginRuntimeFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface CapturedPluginBytes {
  readonly pluginId: string;
  readonly manifestBytes: Uint8Array;
  readonly runtimeFiles: readonly CapturedPluginRuntimeFile[];
}

export interface GeneratePluginRegistryFromCapturedBytesOptions {
  readonly plugins: readonly CapturedPluginBytes[];
  readonly environment: RegistryEnvironment;
  readonly capabilityCatalog: RegistryCapabilityCatalog;
  readonly artifactCommitments: Readonly<Record<string, PluginArtifactCommitments>>;
}

export type GeneratePluginRegistryError =
  | { code: "plugins-root" }
  | { code: "empty-registry" }
  | { code: "plugin-directory"; pluginId: string }
  | { code: "manifest-read"; pluginId: string }
  | { code: "manifest-json"; pluginId: string }
  | { code: "manifest-shape"; pluginId: string }
  | { code: "plugin-id-mismatch"; pluginId: string }
  | { code: "artifact-commitment"; pluginId: string }
  | { code: "source-tree"; pluginId: string }
  | { code: "registry-schema" };

export type GeneratePluginRegistryResult =
  | {
      ok: true;
      registry: PluginRegistry;
      bytes: Uint8Array;
      registryDigest: string;
    }
  | { ok: false; error: GeneratePluginRegistryError };

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key)) &&
    Reflect.ownKeys(record).every((key) => typeof key === "string" && keys.includes(key)) &&
    expected.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable;
    })
  );
}

function hasOnlyDataStringKeys(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record);
  return (
    Reflect.ownKeys(record).every((key) => typeof key === "string" && keys.includes(key)) &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable;
    })
  );
}

function normalizeCommitments(value: unknown): PluginArtifactCommitments | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, COMMITMENT_KEYS)) return null;
  if (
    typeof value.runnerDigest !== "string" ||
    typeof value.imageDigest !== "string" ||
    typeof value.profileDigest !== "string" ||
    !DIGEST_RE.test(value.runnerDigest) ||
    !DIGEST_RE.test(value.imageDigest) ||
    !DIGEST_RE.test(value.profileDigest)
  ) {
    return null;
  }
  return Object.freeze({
    runnerDigest: value.runnerDigest,
    imageDigest: value.imageDigest,
    profileDigest: value.profileDigest,
  });
}

function readManifest(pluginDirectory: string, pluginId: string):
  | { ok: true; manifest: NormalizedManifest; bytes: Uint8Array }
  | { ok: false; error: GeneratePluginRegistryError } {
  const manifestPath = join(pluginDirectory, "manifest.json");
  let bytes: Uint8Array;
  try {
    if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) {
      return { ok: false, error: { code: "manifest-read", pluginId } };
    }
    bytes = readFileSync(manifestPath);
  } catch {
    return { ok: false, error: { code: "manifest-read", pluginId } };
  }

  const parsed = parseManifestBytes(bytes, pluginId);
  if (!parsed.ok) return parsed;
  return { ok: true, manifest: parsed.manifest, bytes };
}

function parseManifestBytes(bytes: unknown, pluginId: string):
  | { ok: true; manifest: NormalizedManifest }
  | { ok: false; error: GeneratePluginRegistryError } {
  if (!(bytes instanceof Uint8Array)) return { ok: false, error: { code: "manifest-read", pluginId } };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: { code: "manifest-read", pluginId } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "manifest-json", pluginId } };
  }
  const manifest = normalizeManifest(raw);
  if (manifest === null) return { ok: false, error: { code: "manifest-shape", pluginId } };
  return { ok: true, manifest };
}

function readRuntimeFiles(pluginDirectory: string, pluginId: string, files: readonly string[]):
  | { ok: true; runtimeFiles: CapturedPluginRuntimeFile[] }
  | { ok: false; error: GeneratePluginRegistryError } {
  let entries: string[];
  try {
    entries = readdirSync(pluginDirectory).sort();
  } catch {
    return { ok: false, error: { code: "source-tree", pluginId } };
  }
  const expectedEntries = ["manifest.json", ...files].sort();
  if (entries.length !== expectedEntries.length || entries.some((entry, index) => entry !== expectedEntries[index])) {
    return { ok: false, error: { code: "source-tree", pluginId } };
  }

  const runtimeFiles: CapturedPluginRuntimeFile[] = [];
  try {
    for (const name of files) {
      const path = join(pluginDirectory, name);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        return { ok: false, error: { code: "source-tree", pluginId } };
      }
      runtimeFiles.push({ name, bytes: readFileSync(path) });
    }
  } catch {
    return { ok: false, error: { code: "source-tree", pluginId } };
  }
  return { ok: true, runtimeFiles };
}

function sourceDigestFromRuntimeFiles(
  pluginId: string,
  files: readonly string[],
  runtimeFiles: unknown,
): { ok: true; digest: string } | { ok: false; error: GeneratePluginRegistryError } {
  if (!Array.isArray(runtimeFiles) || runtimeFiles.length !== files.length) {
    return { ok: false, error: { code: "source-tree", pluginId } };
  }

  const fileDigests: Array<readonly [string, string]> = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = runtimeFiles[index];
    if (!isPlainRecord(file) || !hasExactKeys(file, ["name", "bytes"])) {
      return { ok: false, error: { code: "source-tree", pluginId } };
    }
    const { name, bytes } = file;
    if (typeof name !== "string" || name !== files[index] || !(bytes instanceof Uint8Array)) {
      return { ok: false, error: { code: "source-tree", pluginId } };
    }
    fileDigests.push([name, sha256(bytes)]);
  }
  return { ok: true, digest: sha256(JSON.stringify(["pnh-plugin-source-v1", fileDigests])) };
}

export function sourceDigest(pluginDirectory: string, pluginId: string, files: readonly string[]):
  | { ok: true; digest: string }
  | { ok: false; error: GeneratePluginRegistryError } {
  const runtimeFiles = readRuntimeFiles(pluginDirectory, pluginId, files);
  if (!runtimeFiles.ok) return runtimeFiles;
  return sourceDigestFromRuntimeFiles(pluginId, files, runtimeFiles.runtimeFiles);
}

export function computeManifestDigest(manifest: NormalizedManifest): string {
  return sha256(JSON.stringify(["pnh-plugin-manifest-v2", manifest]));
}

export function computeVersionDigest(
  manifestDigest: string,
  sourceDigest: string,
  commitments: PluginArtifactCommitments,
): string {
  return sha256(JSON.stringify([
    "pnh-plugin-version-v2",
    manifestDigest,
    sourceDigest,
    commitments.runnerDigest,
    commitments.imageDigest,
    commitments.profileDigest,
  ]));
}

export function generatePluginRegistryFromCapturedBytes(
  options: GeneratePluginRegistryFromCapturedBytesOptions,
): GeneratePluginRegistryResult {
  if (!Array.isArray(options.plugins)) return { ok: false, error: { code: "registry-schema" } };
  if (options.plugins.length === 0) return { ok: false, error: { code: "empty-registry" } };
  if (!isPlainRecord(options.artifactCommitments) || !hasOnlyDataStringKeys(options.artifactCommitments)) {
    return { ok: false, error: { code: "registry-schema" } };
  }

  const capturedPlugins: CapturedPluginBytes[] = [];
  const pluginIds = new Set<string>();
  for (const captured of options.plugins) {
    if (!isPlainRecord(captured) || !hasExactKeys(captured, ["pluginId", "manifestBytes", "runtimeFiles"])) {
      return { ok: false, error: { code: "registry-schema" } };
    }
    if (typeof captured.pluginId !== "string") return { ok: false, error: { code: "registry-schema" } };
    if (!isPluginId(captured.pluginId)) {
      return { ok: false, error: { code: "plugin-directory", pluginId: captured.pluginId } };
    }
    if (pluginIds.has(captured.pluginId)) return { ok: false, error: { code: "registry-schema" } };
    pluginIds.add(captured.pluginId);
    capturedPlugins.push(captured as unknown as CapturedPluginBytes);
  }
  capturedPlugins.sort((left, right) => left.pluginId.localeCompare(right.pluginId));

  const capabilityCatalog = normalizeCapabilityCatalog(options.capabilityCatalog);
  if (capabilityCatalog === null) return { ok: false, error: { code: "registry-schema" } };
  const plugins: PluginDescriptor[] = [];
  for (const captured of capturedPlugins) {
    const manifestResult = parseManifestBytes(captured.manifestBytes, captured.pluginId);
    if (!manifestResult.ok) return manifestResult;
    const { manifest } = manifestResult;
    if (manifest.id !== captured.pluginId) {
      return { ok: false, error: { code: "plugin-id-mismatch", pluginId: captured.pluginId } };
    }

    const commitments = normalizeCommitments(options.artifactCommitments[captured.pluginId]);
    if (commitments === null) return { ok: false, error: { code: "artifact-commitment", pluginId: captured.pluginId } };
    const sourceResult = sourceDigestFromRuntimeFiles(captured.pluginId, manifest.files, captured.runtimeFiles);
    if (!sourceResult.ok) return sourceResult;

    const manifestDigest = computeManifestDigest(manifest);
    const versionDigest = computeVersionDigest(manifestDigest, sourceResult.digest, commitments);
    plugins.push({
      ...manifest,
      manifestDigest,
      sourceDigest: sourceResult.digest,
      versionDigest,
      ...commitments,
    });
  }

  if (Object.keys(options.artifactCommitments).some((pluginId) => !pluginIds.has(pluginId))) {
    return { ok: false, error: { code: "registry-schema" } };
  }

  const registry = validateRegistryDocument({
    version: REGISTRY_VERSION,
    environment: options.environment,
    capabilityCatalog,
    plugins,
  });
  if (registry === null) return { ok: false, error: { code: "registry-schema" } };

  const bytes = new TextEncoder().encode(`${JSON.stringify(registry)}\n`);
  return { ok: true, registry, bytes, registryDigest: sha256(bytes) };
}

export function generatePluginRegistry(options: GeneratePluginRegistryOptions): GeneratePluginRegistryResult {
  let pluginEntries: Array<{
    name: string;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;
  try {
    pluginEntries = readdirSync(options.pluginsRoot, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return { ok: false, error: { code: "plugins-root" } };
  }
  pluginEntries.sort((left, right) => left.name.localeCompare(right.name));
  if (pluginEntries.length === 0) return { ok: false, error: { code: "empty-registry" } };

  const capabilityCatalog = normalizeCapabilityCatalog(options.capabilityCatalog);
  if (capabilityCatalog === null) return { ok: false, error: { code: "registry-schema" } };
  const plugins: CapturedPluginBytes[] = [];
  const artifactCommitments: Record<string, PluginArtifactCommitments> = {};
  for (const entry of pluginEntries) {
    const pluginId = entry.name;
    if (!isPluginId(pluginId) || !entry.isDirectory() || entry.isSymbolicLink()) {
      return { ok: false, error: { code: "plugin-directory", pluginId } };
    }
    const pluginDirectory = join(options.pluginsRoot, pluginId);
    const manifestResult = readManifest(pluginDirectory, pluginId);
    if (!manifestResult.ok) return manifestResult;
    const { manifest } = manifestResult;
    if (manifest.id !== pluginId) return { ok: false, error: { code: "plugin-id-mismatch", pluginId } };

    const commitments = normalizeCommitments(options.artifactCommitments[pluginId]);
    if (commitments === null) return { ok: false, error: { code: "artifact-commitment", pluginId } };
    artifactCommitments[pluginId] = commitments;
    const runtimeFiles = readRuntimeFiles(pluginDirectory, pluginId, manifest.files);
    if (!runtimeFiles.ok) return runtimeFiles;
    plugins.push({
      pluginId,
      manifestBytes: manifestResult.bytes,
      runtimeFiles: runtimeFiles.runtimeFiles,
    });
  }

  return generatePluginRegistryFromCapturedBytes({
    plugins,
    environment: options.environment,
    capabilityCatalog,
    artifactCommitments,
  });
}
