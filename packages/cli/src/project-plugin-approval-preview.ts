import { createHash } from "node:crypto";
import { computeSpawnPluginArtifactCommitmentsFromBytes } from "@useprism/runtime";
import {
  generatePluginRegistryFromCapturedBytes,
  type CapturedPluginBytes,
  type PluginArtifactCommitments,
} from "@useprism/sdk/node/registry";
import {
  ProjectToolPluginDeclarationError,
  projectToolPluginDeclarationUnchanged,
  readProjectToolPluginDeclaration,
} from "./project-plugin-declaration.ts";
import { validateProjectPluginSourceClosure } from "./project-plugin-source-closure.ts";
import { inspectToolPlugin, staticIdentityUnchanged, type PluginCheckStaticError, type StaticPluginCheck } from "./plugin-check-static.ts";

const APPROVAL_DIGEST_VERSION = "prism-project-plugin-approval-digest-v1";

const PRODUCTION_CAPABILITY_CATALOG = Object.freeze({
  version: "pnh-capability-catalog-v1",
  capabilities: Object.freeze([
    Object.freeze({
      id: "tool-operation",
      limit: Object.freeze({ schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled: true }),
    }),
  ]),
});

export interface ProjectPluginApprovalProposal {
  readonly version: "prism-project-plugin-approval-proposal-v1";
  readonly workspace: string;
  readonly projectConfigDigest: string;
  readonly declaredPath: string;
  readonly canonicalPluginPath: string;
  readonly operation: "slugify";
  readonly plugin: {
    readonly id: string;
    readonly manifestDigest: string;
    readonly sourceDigest: string;
    readonly registryDigest: string;
    readonly versionDigest: string;
    readonly runnerDigest: string;
    readonly imageDigest: string;
    readonly profileDigest: string;
  };
  readonly approvalDigest: string;
  readonly executionBoundary: "ambient-subprocess";
  readonly sandboxed: false;
  readonly warning: "Plugin admission and approval are not safety or sandboxing; plugin execution has ambient host authority.";
}

export interface ProjectPluginApprovalPreviewDependencies {
  readonly computeSpawnCommitments?: typeof computeSpawnPluginArtifactCommitmentsFromBytes;
  readonly generateRegistry?: typeof generatePluginRegistryFromCapturedBytes;
}

export interface ProjectPluginApprovalCapturedBytes {
  readonly manifestBytes: Uint8Array;
  readonly runtimeFiles: readonly { readonly name: string; readonly bytes: Uint8Array }[];
  readonly registryBytes: Uint8Array;
}

export interface PreparedProjectPluginApproval {
  readonly proposal: ProjectPluginApprovalProposal;
  capturedBytes(): ProjectPluginApprovalCapturedBytes;
  isFresh(): Promise<boolean>;
}

export type ProjectPluginApprovalPreviewErrorCode =
  | "declaration-missing"
  | ProjectToolPluginDeclarationError["code"]
  | PluginCheckStaticError
  | "source-closure"
  | "registry-generation"
  | "declaration-changed";

export class ProjectPluginApprovalPreviewError extends Error {
  readonly code: ProjectPluginApprovalPreviewErrorCode;

  constructor(code: ProjectPluginApprovalPreviewErrorCode) {
    super(code);
    this.name = "ProjectPluginApprovalPreviewError";
    this.code = code;
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function failure(code: ProjectPluginApprovalPreviewErrorCode): never {
  throw new ProjectPluginApprovalPreviewError(code);
}

export function computeProjectPluginApprovalDigest(input: Omit<
  ProjectPluginApprovalProposal,
  "version" | "approvalDigest" | "executionBoundary" | "sandboxed" | "warning"
>): string {
  return sha256(JSON.stringify([
    APPROVAL_DIGEST_VERSION,
    input.workspace,
    input.projectConfigDigest,
    input.declaredPath,
    input.canonicalPluginPath,
    input.operation,
    input.plugin.id,
    input.plugin.manifestDigest,
    input.plugin.sourceDigest,
    input.plugin.registryDigest,
    input.plugin.versionDigest,
    input.plugin.runnerDigest,
    input.plugin.imageDigest,
    input.plugin.profileDigest,
  ]));
}

function capturedPluginFromStaticCheck(plugin: StaticPluginCheck): CapturedPluginBytes {
  const requiredFiles = ["manifest.json", ...plugin.manifest.files];
  const files = new Map(plugin.files.map((file) => [file.path, file]));
  if (files.size !== plugin.files.length || files.size !== requiredFiles.length) failure("source-tree");

  const manifest = files.get("manifest.json");
  if (manifest === undefined) failure("source-tree");
  const runtimeFiles = plugin.manifest.files.map((name) => {
    const file = files.get(name);
    if (file === undefined) failure("source-tree");
    return Object.freeze({ name, bytes: new Uint8Array(file.bytes) });
  });
  return Object.freeze({
    pluginId: plugin.manifest.id,
    manifestBytes: new Uint8Array(manifest.bytes),
    runtimeFiles: Object.freeze(runtimeFiles),
  });
}

function commitmentsFromCapturedPlugin(
  plugin: CapturedPluginBytes,
  entrypoint: string,
  computeSpawnCommitments: typeof computeSpawnPluginArtifactCommitmentsFromBytes,
): PluginArtifactCommitments {
  const entrypointBytes = plugin.runtimeFiles.find((file) => file.name === entrypoint)?.bytes;
  if (entrypointBytes === undefined) failure("source-tree");
  return computeSpawnCommitments({
    manifestBytes: plugin.manifestBytes,
    entrypointBytes,
  });
}

function copiedCapturedBytes(
  plugin: CapturedPluginBytes,
  registryBytes: Uint8Array,
): ProjectPluginApprovalCapturedBytes {
  return Object.freeze({
    manifestBytes: new Uint8Array(plugin.manifestBytes),
    runtimeFiles: Object.freeze(plugin.runtimeFiles.map((file) => Object.freeze({
      name: file.name,
      bytes: new Uint8Array(file.bytes),
    }))),
    registryBytes: new Uint8Array(registryBytes),
  });
}

export async function prepareProjectPluginApproval(
  input: { readonly workspace: string },
  dependencies: ProjectPluginApprovalPreviewDependencies = {},
): Promise<PreparedProjectPluginApproval> {
  let declaration;
  try {
    declaration = await readProjectToolPluginDeclaration({ workspace: input.workspace });
  } catch (error) {
    if (error instanceof ProjectToolPluginDeclarationError) failure(error.code);
    throw error;
  }
  if (declaration === undefined) failure("declaration-missing");

  const staticCheck = await inspectToolPlugin(declaration.canonicalPluginPath, declaration.workspace);
  if (!staticCheck.ok) failure(staticCheck.code);
  const capturedPlugin = capturedPluginFromStaticCheck(staticCheck.value);
  const closure = validateProjectPluginSourceClosure(capturedPlugin);
  if (!closure.ok) failure("source-closure");

  const commitments = commitmentsFromCapturedPlugin(
    capturedPlugin,
    staticCheck.value.manifest.entrypoint,
    dependencies.computeSpawnCommitments ?? computeSpawnPluginArtifactCommitmentsFromBytes,
  );
  const registry = (dependencies.generateRegistry ?? generatePluginRegistryFromCapturedBytes)({
    plugins: [capturedPlugin],
    environment: "production",
    capabilityCatalog: PRODUCTION_CAPABILITY_CATALOG,
    artifactCommitments: { [capturedPlugin.pluginId]: commitments },
  });
  if (!registry.ok || registry.registry.plugins.length !== 1) failure("registry-generation");
  const descriptor = registry.registry.plugins[0];
  if (descriptor === undefined) failure("registry-generation");

  const projectConfigDigest = sha256(declaration.bytes);
  const plugin = Object.freeze({
    id: descriptor.id,
    manifestDigest: descriptor.manifestDigest,
    sourceDigest: descriptor.sourceDigest,
    registryDigest: registry.registryDigest,
    versionDigest: descriptor.versionDigest,
    runnerDigest: descriptor.runnerDigest,
    imageDigest: descriptor.imageDigest,
    profileDigest: descriptor.profileDigest,
  });
  const approvalIdentity = Object.freeze({
    workspace: declaration.workspace,
    projectConfigDigest,
    declaredPath: declaration.declaration.path,
    canonicalPluginPath: declaration.canonicalPluginPath,
    operation: declaration.declaration.operation,
    plugin,
  });
  const approvalDigest = computeProjectPluginApprovalDigest(approvalIdentity);
  if (!await staticIdentityUnchanged(staticCheck.value)) failure("path-changed");
  if (!await projectToolPluginDeclarationUnchanged(declaration)) failure("declaration-changed");
  const proposal = Object.freeze({
    version: "prism-project-plugin-approval-proposal-v1",
    ...approvalIdentity,
    approvalDigest,
    executionBoundary: "ambient-subprocess",
    sandboxed: false,
    warning: "Plugin admission and approval are not safety or sandboxing; plugin execution has ambient host authority.",
  });
  return Object.freeze({
    proposal,
    capturedBytes: () => copiedCapturedBytes(capturedPlugin, registry.bytes),
    isFresh: async () => (
      await staticIdentityUnchanged(staticCheck.value)
      && await projectToolPluginDeclarationUnchanged(declaration)
    ),
  });
}

export async function createProjectPluginApprovalPreview(
  input: { readonly workspace: string },
  dependencies: ProjectPluginApprovalPreviewDependencies = {},
): Promise<ProjectPluginApprovalProposal> {
  return (await prepareProjectPluginApproval(input, dependencies)).proposal;
}
