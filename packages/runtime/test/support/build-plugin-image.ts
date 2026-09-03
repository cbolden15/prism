import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FLAT_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const PLUGIN_KINDS = new Set(["policy", "memory", "tool", "provider", "renderer"]);

export interface PluginImageBuildResult {
  readonly imageDigest: string;
  readonly imageReference: string;
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly inherit?: boolean },
) => CommandResult;

export function defaultCommandRunner(
  command: string,
  args: readonly string[],
  options: { readonly inherit?: boolean } = {},
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...(options.inherit ? { stdio: "inherit" } : {}),
  });
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function requireSuccess(result: CommandResult, operation: string): string {
  if (result.status !== 0) throw new Error(`${operation} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function buildPluginImage(options: {
  readonly runtimeRoot: string;
  readonly pluginsRoot: string;
  readonly sdkPackageRoot?: string;
  readonly pluginId: string;
  readonly imageReference?: string;
  readonly commandRunner?: CommandRunner;
}): PluginImageBuildResult {
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const { pluginId } = options;
  if (!PLUGIN_ID_RE.test(pluginId)) throw new TypeError("invalid plugin ID");
  const pluginsRoot = options.pluginsRoot;
  const imageReference = options.imageReference ?? `pnh-${pluginId}:plugin`;
  const runnerRoot = resolve(options.runtimeRoot, "kernel", "plugin-runner");
  const sdkPackageRoot = options.sdkPackageRoot ?? resolve(
    dirname(fileURLToPath(import.meta.resolve("@useprism/sdk/protocol"))),
    "..",
  );
  const lock = JSON.parse(readFileSync(resolve(runnerRoot, "image.lock.json"), "utf8")) as {
    indexDigest?: unknown;
  };
  const containerfile = readFileSync(resolve(runnerRoot, "Containerfile"), "utf8");
  if (typeof lock.indexDigest !== "string" || !containerfile.includes(lock.indexDigest)) {
    throw new Error("plugin Containerfile base image does not match its lock");
  }
  const fixtureRoot = resolve(pluginsRoot, pluginId);
  const manifestPath = resolve(fixtureRoot, "manifest.json");
  const manifestStat = lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("invalid plugin manifest file");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    id?: unknown;
    kind?: unknown;
    entrypoint?: unknown;
    files?: unknown;
  };
  if (
    manifest.id !== pluginId ||
    typeof manifest.kind !== "string" ||
    !PLUGIN_KINDS.has(manifest.kind) ||
    typeof manifest.entrypoint !== "string" ||
    !FLAT_FILE_RE.test(manifest.entrypoint) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.some((file) => typeof file !== "string" || !FLAT_FILE_RE.test(file)) ||
    new Set(manifest.files).size !== manifest.files.length ||
    !manifest.files.includes(manifest.entrypoint) ||
    (manifest.entrypoint !== "entrypoint.mjs" && manifest.files.includes("entrypoint.mjs"))
  ) {
    throw new Error("invalid plugin image manifest");
  }
  const files = manifest.files as string[];
  const expectedEntries = ["manifest.json", ...files].sort();
  const actualEntries = readdirSync(fixtureRoot).sort();
  if (
    actualEntries.length !== expectedEntries.length ||
    actualEntries.some((entry, index) => entry !== expectedEntries[index])
  ) {
    throw new Error("plugin image source tree contains undeclared entries");
  }

  const context = mkdtempSync(resolve(tmpdir(), "pnh-plugin-image-"));
  try {
    mkdirSync(resolve(context, "sdk", "dist", "protocol"), { recursive: true });
    mkdirSync(resolve(context, "runner"), { recursive: true });
    mkdirSync(resolve(context, "plugin"), { recursive: true });
    copyFileSync(resolve(runnerRoot, "Containerfile"), resolve(context, "Containerfile"));
    copyFileSync(resolve(sdkPackageRoot, "package.json"), resolve(context, "sdk", "package.json"));
    copyFileSync(resolve(sdkPackageRoot, "dist", "protocol.js"), resolve(context, "sdk", "dist", "protocol.js"));
    copyFileSync(
      resolve(sdkPackageRoot, "dist", "protocol", "resource-bounds.js"),
      resolve(context, "sdk", "dist", "protocol", "resource-bounds.js"),
    );
    copyFileSync(resolve(runnerRoot, "entrypoint.mjs"), resolve(context, "runner", "entrypoint.mjs"));
    for (const file of files) {
      const source = resolve(fixtureRoot, file);
      const stat = lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid plugin image source file");
      const target = file === manifest.entrypoint ? "entrypoint.mjs" : file;
      copyFileSync(source, resolve(context, "plugin", target));
    }

    requireSuccess(commandRunner("docker", [
      "build",
      "--pull=false",
      "--provenance=false",
      "--tag",
      imageReference,
      "--file",
      resolve(context, "Containerfile"),
      context,
    ], { inherit: true }), "plugin image build");
  } finally {
    rmSync(context, { recursive: true, force: true });
  }

  const inspected = requireSuccess(
    commandRunner("docker", ["image", "inspect", "--format", "{{.Id}}", imageReference]),
    "plugin image inspection",
  ).trim();
  const imageDigest = inspected.replace(/^sha256:/, "");
  if (!DIGEST_RE.test(imageDigest)) throw new Error("Docker returned an invalid plugin image digest");
  return Object.freeze({ imageDigest, imageReference });
}
