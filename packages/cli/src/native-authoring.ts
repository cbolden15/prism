import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolPluginScaffold } from "@useprism/sdk/authoring";

export const DEFAULT_AUTHORING_ROOT_BASENAME = "prism-plugins" as const;
export const AUTHORING_ROOT_MARKER_NAME = ".prism-authoring-root-v1" as const;
export const AUTHORING_ROOT_MARKER_CONTENTS = "prism-managed-authoring-root-v1\n" as const;

export const NATIVE_AUTHORING_TARGETS = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
] as const);

export type NativeAuthoringTarget = (typeof NATIVE_AUTHORING_TARGETS)[number];

export type NativeAuthoringFailureCode =
  | "root-parent-missing"
  | "root-parent-not-directory"
  | "root-parent-symlink"
  | "root-unmanaged"
  | "root-invalid"
  | "root-busy"
  | "root-changed"
  | "destination-exists"
  | "native-unavailable"
  | "native-integrity"
  | "create-failed"
  | "cleanup-failed";

type NativeOperationalFailureCode = Exclude<
  NativeAuthoringFailureCode,
  "native-unavailable" | "native-integrity"
>;

const NATIVE_OPERATIONAL_FAILURE_CODES = new Set<NativeOperationalFailureCode>([
  "root-parent-missing",
  "root-parent-not-directory",
  "root-parent-symlink",
  "root-unmanaged",
  "root-invalid",
  "root-busy",
  "root-changed",
  "destination-exists",
  "create-failed",
  "cleanup-failed",
]);

const PREBUILD_MANIFEST_VERSION = "prism-native-authoring-prebuilds-v1";
const PREBUILD_NODE_API_VERSION = 8;
const PREBUILD_SOURCE = "native/prism_authoring.cc";
const PREBUILD_BINARY_NAME = "prism_authoring.node";
const PREBUILD_MANIFEST_NAME = "manifest.json";
const MAX_PREBUILD_MANIFEST_BYTES = 65_536;
const MAX_PREBUILD_BINARY_BYTES = 64 * 1024 * 1024;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface NativeAuthoringRuntime {
  readonly platform: string;
  readonly architecture: string;
  readonly glibcVersionRuntime?: string;
}

export interface ManagedPluginCreateInput {
  readonly rootPath: string;
  readonly pluginId: string;
  readonly scaffold: ToolPluginScaffold;
}

interface NativeAuthoringBinding {
  readonly createManagedPlugin: (input: ManagedPluginCreateInput) => undefined;
}

interface PrebuildManifestTarget {
  readonly file: string;
  readonly sha256: string;
}

interface PrebuildManifest {
  readonly version: typeof PREBUILD_MANIFEST_VERSION;
  readonly nodeApi: typeof PREBUILD_NODE_API_VERSION;
  readonly source: typeof PREBUILD_SOURCE;
  readonly sourceSha256: string;
  readonly targets: Readonly<Record<NativeAuthoringTarget, PrebuildManifestTarget>>;
}

interface PrebuildAssetIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly realPath: string;
}

interface LoadedPrebuildAsset {
  readonly bytes: Buffer;
  readonly identity: PrebuildAssetIdentity;
  readonly descriptor: number;
}

export class NativeAuthoringFailure extends Error {
  constructor(readonly code: NativeAuthoringFailureCode) {
    super(code);
    this.name = "NativeAuthoringFailure";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function currentNativeAuthoringRuntime(): NativeAuthoringRuntime {
  let glibcVersionRuntime: string | undefined;
  try {
    const report = process.report?.getReport();
    if (isPlainRecord(report) && isPlainRecord(report.header) && typeof report.header.glibcVersionRuntime === "string") {
      glibcVersionRuntime = report.header.glibcVersionRuntime;
    }
  } catch {
    // Some supported runtimes do not expose a report. That selects musl on Linux.
  }
  return {
    platform: process.platform,
    architecture: process.arch,
    ...(glibcVersionRuntime === undefined ? {} : { glibcVersionRuntime }),
  };
}

export function selectNativeAuthoringTarget(runtime: NativeAuthoringRuntime = currentNativeAuthoringRuntime()): NativeAuthoringTarget | null {
  if (runtime.platform === "darwin" && runtime.architecture === "arm64") return "darwin-arm64";
  if (runtime.platform === "darwin" && runtime.architecture === "x64") return "darwin-x64";
  if (runtime.platform !== "linux") return null;
  if (runtime.architecture !== "arm64" && runtime.architecture !== "x64") return null;
  const libc = runtime.glibcVersionRuntime === undefined ? "musl" : "gnu";
  return `linux-${runtime.architecture}-${libc}` as NativeAuthoringTarget;
}

function parsePrebuildManifest(bytes: Uint8Array): PrebuildManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!isPlainRecord(value) || !hasExactDataKeys(value, ["version", "nodeApi", "source", "sourceSha256", "targets"])) {
    return null;
  }
  if (
    value.version !== PREBUILD_MANIFEST_VERSION
    || value.nodeApi !== PREBUILD_NODE_API_VERSION
    || value.source !== PREBUILD_SOURCE
    || typeof value.sourceSha256 !== "string"
    || !SHA256_RE.test(value.sourceSha256)
    || !isPlainRecord(value.targets)
  ) {
    return null;
  }
  const targetKeys = Object.keys(value.targets);
  if (
    targetKeys.length !== NATIVE_AUTHORING_TARGETS.length
    || targetKeys.some((target, index) => target !== NATIVE_AUTHORING_TARGETS[index])
  ) {
    return null;
  }
  const targets = {} as Record<NativeAuthoringTarget, PrebuildManifestTarget>;
  for (const target of NATIVE_AUTHORING_TARGETS) {
    const entry = value.targets[target];
    if (!isPlainRecord(entry) || !hasExactDataKeys(entry, ["file", "sha256"])) return null;
    if (
      entry.file !== `${target}/${PREBUILD_BINARY_NAME}`
      || typeof entry.sha256 !== "string"
      || !SHA256_RE.test(entry.sha256)
    ) {
      return null;
    }
    targets[target] = Object.freeze({ file: entry.file, sha256: entry.sha256 });
  }
  return Object.freeze({
    version: PREBUILD_MANIFEST_VERSION,
    nodeApi: PREBUILD_NODE_API_VERSION,
    source: PREBUILD_SOURCE,
    sourceSha256: value.sourceSha256,
    targets: Object.freeze(targets),
  });
}

function getOwnDataString(value: unknown, key: string): string | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined && typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}

function nativeOperationalCode(error: unknown): NativeOperationalFailureCode | null {
  const code = getOwnDataString(error, "code") ?? getOwnDataString(error, "message");
  return code !== undefined && NATIVE_OPERATIONAL_FAILURE_CODES.has(code as NativeOperationalFailureCode)
    ? code as NativeOperationalFailureCode
    : null;
}

function isNativeAuthoringBinding(value: unknown): value is NativeAuthoringBinding {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, ["createManagedPlugin"])) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "createManagedPlugin");
  return descriptor !== undefined && typeof descriptor.value === "function";
}

function cliPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function isContainedBy(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function sameAssetIdentity(identity: PrebuildAssetIdentity, stat: Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino && stat.size === identity.size;
}

function readPrebuildAsset(path: string, prebuildRoot: string, maximumBytes: number): LoadedPrebuildAsset {
  const before = lstatSync(path);
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || !Number.isSafeInteger(before.size)
    || before.size < 0
    || before.size > maximumBytes
  ) {
    throw new Error("invalid prebuild asset");
  }
  const realPath = realpathSync(path);
  if (!isContainedBy(prebuildRoot, realPath)) throw new Error("prebuild asset escaped package root");
  const identity: PrebuildAssetIdentity = {
    dev: before.dev,
    ino: before.ino,
    size: before.size,
    realPath,
  };

  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!sameAssetIdentity(identity, fstatSync(descriptor))) throw new Error("prebuild asset changed before read");
    const bytes = Buffer.alloc(identity.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
      if (read === 0) throw new Error("prebuild asset ended during read");
      offset += read;
    }
    if (!sameAssetIdentity(identity, fstatSync(descriptor))) throw new Error("prebuild asset changed during read");
    assertPrebuildAssetIdentity(path, prebuildRoot, identity);
    return Object.freeze({ bytes, identity, descriptor });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function closePrebuildAsset(asset: LoadedPrebuildAsset | undefined): boolean {
  if (asset === undefined) return true;
  try {
    closeSync(asset.descriptor);
    return true;
  } catch {
    return false;
  }
}

function assertPrebuildAssetIdentity(path: string, prebuildRoot: string, identity: PrebuildAssetIdentity): void {
  const current = lstatSync(path);
  if (!sameAssetIdentity(identity, current)) throw new Error("prebuild asset changed");
  if (realpathSync(path) !== identity.realPath || !isContainedBy(prebuildRoot, identity.realPath)) {
    throw new Error("prebuild asset path changed");
  }
}

function realPrebuildRoot(packageRoot: string): { readonly path: string; readonly realPath: string } {
  const realPackageRoot = realpathSync(packageRoot);
  const path = resolve(packageRoot, "prebuilds");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid prebuild root");
  const realPath = realpathSync(path);
  if (realPath !== resolve(realPackageRoot, "prebuilds")) throw new Error("prebuild root escaped package root");
  return Object.freeze({ path, realPath });
}

function loadNativeAuthoringBinding(): NativeAuthoringBinding {
  const target = selectNativeAuthoringTarget();
  if (target === null) throw new NativeAuthoringFailure("native-unavailable");

  let manifestAsset: LoadedPrebuildAsset | undefined;
  let binaryAsset: LoadedPrebuildAsset | undefined;
  let binding: NativeAuthoringBinding | undefined;
  try {
    const packageRoot = cliPackageRoot();
    const prebuildRoot = realPrebuildRoot(packageRoot);
    const manifestPath = resolve(prebuildRoot.path, PREBUILD_MANIFEST_NAME);
    manifestAsset = readPrebuildAsset(
      manifestPath,
      prebuildRoot.realPath,
      MAX_PREBUILD_MANIFEST_BYTES,
    );
    const parsed = parsePrebuildManifest(manifestAsset.bytes);
    if (parsed === null) throw new Error("invalid prebuild manifest");
    const entry = parsed.targets[target];
    const binaryPath = resolve(prebuildRoot.path, entry.file);
    binaryAsset = readPrebuildAsset(binaryPath, prebuildRoot.realPath, MAX_PREBUILD_BINARY_BYTES);
    const digest = createHash("sha256").update(binaryAsset.bytes).digest("hex");
    if (digest !== entry.sha256) throw new Error("native prebuild digest mismatch");
    assertPrebuildAssetIdentity(manifestPath, prebuildRoot.realPath, manifestAsset.identity);
    assertPrebuildAssetIdentity(binaryPath, prebuildRoot.realPath, binaryAsset.identity);

    const nativeModule: { exports: unknown } = { exports: {} };
    const descriptorPath = process.platform === "linux"
      ? `/proc/self/fd/${binaryAsset.descriptor}`
      : `/dev/fd/${binaryAsset.descriptor}`;
    process.dlopen(nativeModule, descriptorPath);
    if (!sameAssetIdentity(binaryAsset.identity, fstatSync(binaryAsset.descriptor))) {
      throw new Error("native prebuild changed during load");
    }
    if (!isNativeAuthoringBinding(nativeModule.exports)) throw new Error("invalid native authoring binding");
    binding = nativeModule.exports;
  } catch {
    binding = undefined;
  }

  const binaryClosed = closePrebuildAsset(binaryAsset);
  const manifestClosed = closePrebuildAsset(manifestAsset);
  if (binding === undefined || !binaryClosed || !manifestClosed) {
    throw new NativeAuthoringFailure("native-integrity");
  }
  return binding;
}

let loadedBinding: NativeAuthoringBinding | undefined;

export function createManagedPlugin(input: ManagedPluginCreateInput): void {
  const binding = loadedBinding ?? loadNativeAuthoringBinding();
  loadedBinding = binding;
  try {
    const result = binding.createManagedPlugin(input);
    if (result !== undefined) throw new Error("native authoring binding returned a value");
  } catch (error) {
    const code = nativeOperationalCode(error);
    throw new NativeAuthoringFailure(code ?? "create-failed");
  }
}
