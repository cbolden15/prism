import { readFile } from "node:fs/promises";
import { createOllamaProvider } from "@useprism/provider-ollama";
import {
  admitPinnedRegistryBytes,
  computeToolRequestDigest,
  runAgent,
  runToolOperation,
  withOwnerApprovedSpawnPlugin,
  type AgentRunInput,
  type AgentPolicyRequest,
  type AgentRunResult,
  type OwnerApprovedAdmissionTicket,
  type OwnerApprovedSpawnContext,
  type PinnedRegistryAdmissionResult,
  type PluginLifecycleReceipt,
} from "@useprism/runtime";
import {
  CAPABILITY_CATALOG_VERSION,
  CAPABILITY_LIMIT_VERSION,
  type PolicyAdmissionOutcome,
} from "@useprism/sdk/policy";
import { MAX_STRING_BYTES, type JsonValue } from "@useprism/sdk/protocol";
import type { Provider } from "@useprism/sdk/provider";
import type { Tool, ToolCallContext, ToolRequest } from "@useprism/sdk/tool";
import {
  prepareProjectPluginApproval,
  ProjectPluginApprovalPreviewError,
  type PreparedProjectPluginApproval,
} from "./project-plugin-approval-preview.ts";
import {
  validateOrRepairActiveProjectPluginArtifact,
  ProjectPluginArtifactError,
  type ProjectPluginArtifact,
} from "./project-plugin-artifact.ts";
import {
  projectPluginApprovalRecordMatchesProposal,
  readProjectPluginApprovalState,
  withProjectPluginApprovalLock,
} from "./project-plugin-approval-state.ts";
import { PROJECT_PLUGIN_RUN_LIMITS, type ProjectPluginRunRecordCommitments } from "./run-store.ts";

type RunToolOperationInput = Parameters<typeof runToolOperation>[0];

const ACCEPTANCE_GOAL = "Create a slug for release title: Preview First";
const ACCEPTANCE_TITLE = "Preview First";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const encoder = new TextEncoder();

export type ProjectPluginRunErrorCode =
  | "project-plugin-admission-failed"
  | "project-plugin-artifact-read-failed"
  | "project-plugin-artifact-mismatch"
  | "project-plugin-runtime-admission-failed"
  | "project-plugin-commitment-mismatch"
  | "project-plugin-lifecycle-receipt-missing"
  | "project-plugin-approval-mismatch"
  | "project-plugin-approval-missing"
  | "project-plugin-approval-record-invalid"
  | "project-plugin-approval-record-mismatch"
  | "project-plugin-artifact-unsafe"
  | "project-plugin-artifact-invalid"
  | "project-plugin-artifact-lock-timeout"
  | "project-plugin-approval-digest-mismatch"
  | "project-plugin-unsupported-platform";

const PROJECT_PLUGIN_RUN_ERROR_CODES = new Set<ProjectPluginRunErrorCode>([
  "project-plugin-admission-failed",
  "project-plugin-artifact-read-failed",
  "project-plugin-artifact-mismatch",
  "project-plugin-runtime-admission-failed",
  "project-plugin-commitment-mismatch",
  "project-plugin-lifecycle-receipt-missing",
  "project-plugin-approval-mismatch",
  "project-plugin-approval-missing",
  "project-plugin-approval-record-invalid",
  "project-plugin-approval-record-mismatch",
  "project-plugin-artifact-unsafe",
  "project-plugin-artifact-invalid",
  "project-plugin-artifact-lock-timeout",
  "project-plugin-approval-digest-mismatch",
  "project-plugin-unsupported-platform",
]);

export function isProjectPluginRunErrorCode(value: unknown): value is ProjectPluginRunErrorCode {
  return typeof value === "string" && PROJECT_PLUGIN_RUN_ERROR_CODES.has(value as ProjectPluginRunErrorCode);
}

export class ProjectPluginRunError extends Error {
  readonly code: ProjectPluginRunErrorCode;

  constructor(code: ProjectPluginRunErrorCode) {
    super(code);
    this.name = "ProjectPluginRunError";
    this.code = code;
  }
}

export interface ProjectPluginRunDependencies {
  readonly prepareProjectPluginApproval?: typeof prepareProjectPluginApproval;
  readonly validateOrRepairActiveProjectPluginArtifact?: typeof validateOrRepairActiveProjectPluginArtifact;
  readonly readProjectPluginApprovalState?: typeof readProjectPluginApprovalState;
  readonly projectPluginApprovalRecordMatchesProposal?: typeof projectPluginApprovalRecordMatchesProposal;
  readonly withProjectPluginApprovalLock?: typeof withProjectPluginApprovalLock;
  readonly readFile?: (path: string) => Promise<Uint8Array>;
  readonly admitPinnedRegistryBytes?: (input: {
    readonly bytes: Uint8Array;
    readonly pinPath: string;
    readonly pluginsRoot: string;
  }) => PinnedRegistryAdmissionResult;
  readonly withOwnerApprovedSpawnPlugin?: <T>(input: {
    readonly ticket: OwnerApprovedAdmissionTicket;
    readonly pluginId: string;
    readonly pluginRoot: string;
    readonly run: (context: OwnerApprovedSpawnContext) => Promise<T>;
  }) => Promise<T>;
  readonly runToolOperation?: (input: RunToolOperationInput) => ReturnType<typeof runToolOperation>;
  readonly runAgent?: (input: AgentRunInput) => Promise<AgentRunResult>;
  readonly createOllamaProvider?: typeof createOllamaProvider;
  readonly nowMs?: () => number;
}

export type ProjectPluginRunResult = {
  readonly kind: "admitted";
  readonly commitments: ProjectPluginRunRecordCommitments;
  readonly result: AgentRunResult;
  readonly lifecycleStarted: boolean;
  readonly receipt?: PluginLifecycleReceipt;
  readonly lifecycleStartedAtMs?: number;
};

function fail(code: ProjectPluginRunErrorCode): never {
  throw new ProjectPluginRunError(code);
}

function isPlainExactRecord(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || !expected.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function exactTitleInput(value: unknown): { readonly title: string } | undefined {
  if (!isPlainExactRecord(value, ["title"]) || typeof value.title !== "string") return undefined;
  return encoder.encode(value.title).byteLength <= MAX_STRING_BYTES ? Object.freeze({ title: value.title }) : undefined;
}

function exactSlugOutput(value: unknown): { readonly slug: string } | undefined {
  if (!isPlainExactRecord(value, ["slug"]) || typeof value.slug !== "string") return undefined;
  return encoder.encode(value.slug).byteLength <= MAX_STRING_BYTES && SLUG_RE.test(value.slug)
    ? Object.freeze({ slug: value.slug })
    : undefined;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function commitments(prepared: PreparedProjectPluginApproval): ProjectPluginRunRecordCommitments {
  const proposal = prepared.proposal;
  return Object.freeze({
    project: Object.freeze({ projectConfigDigest: proposal.projectConfigDigest }),
    plugin: Object.freeze({
      id: proposal.plugin.id,
      operation: proposal.operation,
      manifestDigest: proposal.plugin.manifestDigest,
      sourceDigest: proposal.plugin.sourceDigest,
    }),
    approval: Object.freeze({ approvalDigest: proposal.approvalDigest }),
    registry: Object.freeze({ registryDigest: proposal.plugin.registryDigest }),
    runtime: Object.freeze({
      versionDigest: proposal.plugin.versionDigest,
      runnerDigest: proposal.plugin.runnerDigest,
      imageDigest: proposal.plugin.imageDigest,
      profileDigest: proposal.plugin.profileDigest,
    }),
  });
}

function admissionMatches(prepared: PreparedProjectPluginApproval, admitted: PinnedRegistryAdmissionResult): admitted is Extract<PinnedRegistryAdmissionResult, { readonly ok: true }> {
  if (!admitted.ok) return false;
  const proposal = prepared.proposal;
  const ticket = admitted.ticket.ticket;
  if (ticket.registryDigest !== proposal.plugin.registryDigest || admitted.ticket.pinnedPluginIds.length !== 1 || admitted.ticket.pinnedPluginIds[0] !== proposal.plugin.id) return false;
  if (ticket.plugins.length !== 1) return false;
  const plugin = ticket.plugins[0];
  return plugin !== undefined
    && plugin.id === proposal.plugin.id
    && plugin.manifestDigest === proposal.plugin.manifestDigest
    && plugin.sourceDigest === proposal.plugin.sourceDigest
    && plugin.versionDigest === proposal.plugin.versionDigest
    && plugin.runnerDigest === proposal.plugin.runnerDigest
    && plugin.imageDigest === proposal.plugin.imageDigest
    && plugin.profileDigest === proposal.plugin.profileDigest;
}

function fixedPolicy(pluginId: string): (request: AgentPolicyRequest) => Promise<PolicyAdmissionOutcome> {
  const policy = async (request: AgentPolicyRequest) => {
    const title = exactTitleInput(request.input);
    if (
      request.tool !== pluginId
      || request.operation !== "slugify"
      || request.callCount !== 1
      || title?.title !== ACCEPTANCE_TITLE
      || request.requestDigest !== computeToolRequestDigest(request)
    ) return Object.freeze({ decision: "deny" });
    return Object.freeze({
      decision: "restrict",
      catalog: Object.freeze({
        version: CAPABILITY_CATALOG_VERSION,
        capabilities: Object.freeze([
          Object.freeze({ id: "operations", limit: Object.freeze({ schema: "string-set" as const, version: CAPABILITY_LIMIT_VERSION, values: Object.freeze(["slugify"]) }) }),
          Object.freeze({ id: "request-digests", limit: Object.freeze({ schema: "string-set" as const, version: CAPABILITY_LIMIT_VERSION, values: Object.freeze([request.requestDigest]) }) }),
          Object.freeze({ id: "tool-calls", limit: Object.freeze({ schema: "integer-max" as const, version: CAPABILITY_LIMIT_VERSION, max: 1 }) }),
          Object.freeze({ id: "tools", limit: Object.freeze({ schema: "string-set" as const, version: CAPABILITY_LIMIT_VERSION, values: Object.freeze([pluginId]) }) }),
        ]),
      }),
    });
  };
  return Object.freeze(policy);
}

function deterministicProvider(goal: string, pluginId: string, validatedSlug: () => string | undefined): Provider {
  let turn = 0;
  return Object.freeze({
    id: "deterministic",
    async complete() {
      turn += 1;
      if (goal !== ACCEPTANCE_GOAL) throw new Error("unsupported deterministic project-plugin goal");
      const slug = validatedSlug();
      const text = turn === 1
        ? JSON.stringify({ kind: "tool", tool: pluginId, operation: "slugify", input: { title: ACCEPTANCE_TITLE } })
        : turn === 2 && slug !== undefined
          ? JSON.stringify({ kind: "final", answer: slug })
          : "{}";
      return Object.freeze({ providerId: "deterministic", model: null, text });
    },
  });
}

async function recheckActiveApproval(input: {
  readonly prepared: PreparedProjectPluginApproval;
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies: ProjectPluginRunDependencies;
}): Promise<void> {
  let approval;
  try {
    approval = await (input.dependencies.readProjectPluginApprovalState ?? readProjectPluginApprovalState)({
      workspace: input.workspace,
      environment: input.environment,
    });
  } catch {
    fail("project-plugin-admission-failed");
  }
  if (
    approval === undefined
    || !(input.dependencies.projectPluginApprovalRecordMatchesProposal ?? projectPluginApprovalRecordMatchesProposal)(
      approval,
      input.prepared.proposal,
    )
  ) fail("project-plugin-approval-mismatch");
  try {
    if (!await input.prepared.isFresh()) fail("project-plugin-approval-mismatch");
  } catch (error) {
    if (error instanceof ProjectPluginRunError) throw error;
    fail("project-plugin-approval-mismatch");
  }
}

function toolRegistrationMatches(value: unknown, pluginId: string): boolean {
  return isPlainExactRecord(value, ["kind", "pluginId", "operations"])
    && value.kind === "tool"
    && value.pluginId === pluginId
    && Array.isArray(value.operations)
    && value.operations.length === 1
    && value.operations[0] === "slugify";
}

export async function runProjectPlugin(input: {
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly goal: string;
  readonly provider: { readonly name: "deterministic" | "ollama"; readonly model: string | null; readonly endpoint?: string };
}, dependencies: ProjectPluginRunDependencies = {}): Promise<ProjectPluginRunResult> {
  const prepare = dependencies.prepareProjectPluginApproval ?? prepareProjectPluginApproval;
  let prepared: PreparedProjectPluginApproval;
  try {
    prepared = await prepare({ workspace: input.workspace });
  } catch (error) {
    if (error instanceof ProjectPluginApprovalPreviewError) fail("project-plugin-admission-failed");
    fail("project-plugin-admission-failed");
  }

  const validateArtifact = dependencies.validateOrRepairActiveProjectPluginArtifact ?? validateOrRepairActiveProjectPluginArtifact;
  let artifact: ProjectPluginArtifact;
  try {
    artifact = await validateArtifact({ prepared, workspace: input.workspace, environment: input.environment });
  } catch (error) {
    if (error instanceof ProjectPluginArtifactError) fail(error.code);
    fail("project-plugin-admission-failed");
  }

  const captured = prepared.capturedBytes();
  let registryBytes: Uint8Array;
  try {
    registryBytes = await (dependencies.readFile ?? readFile)(artifact.registryPath);
  } catch {
    fail("project-plugin-artifact-read-failed");
  }
  if (!sameBytes(registryBytes, captured.registryBytes) || artifact.registryDigest !== prepared.proposal.plugin.registryDigest) {
    fail("project-plugin-artifact-mismatch");
  }
  const admitted = (dependencies.admitPinnedRegistryBytes ?? admitPinnedRegistryBytes)({
    bytes: registryBytes,
    pinPath: artifact.pinPath,
    pluginsRoot: artifact.pluginsRoot,
  });
  if (!admitted.ok) fail("project-plugin-runtime-admission-failed");
  if (!admissionMatches(prepared, admitted)) fail("project-plugin-commitment-mismatch");

  const proposal = prepared.proposal;
  const policy = fixedPolicy(proposal.plugin.id);
  let receipt: PluginLifecycleReceipt | undefined;
  let lifecycleStartedAtMs: number | undefined;
  let lifecycleStarted = false;
  let validatedSlug: string | undefined;
  const tool: Tool = Object.freeze({
    definition: Object.freeze({
      id: proposal.plugin.id,
      description: "Create a slug from a release title.",
      operations: Object.freeze([Object.freeze({ name: "slugify", description: "Create a Prism slug." })]),
    }),
    async invoke(request: ToolRequest, context: ToolCallContext): Promise<JsonValue> {
      if (request.operation !== "slugify") throw new Error("project plugin tool request rejected");
      const title = exactTitleInput(request.input);
      if (title === undefined) throw new Error("project plugin tool input rejected");
      await recheckActiveApproval({ prepared, workspace: input.workspace, environment: input.environment, dependencies });
      lifecycleStarted = true;
      lifecycleStartedAtMs = (dependencies.nowMs ?? Date.now)();
      const operation = await (dependencies.runToolOperation ?? runToolOperation)({
        ticket: spawnContext.ticket,
        containerPort: spawnContext.containerPort,
        pluginId: proposal.plugin.id,
        operation: "slugify",
        input: title,
        deadlineMs: context.deadlineAtMs,
      });
      if ("receipt" in operation && operation.receipt !== undefined) receipt = operation.receipt;
      if (!operation.ok || !toolRegistrationMatches(operation.registration, proposal.plugin.id)) throw new Error("project plugin tool operation failed");
      const slug = exactSlugOutput(operation.result);
      if (slug === undefined) throw new Error("project plugin tool result rejected");
      validatedSlug = slug.slug;
      return slug;
    },
  });

  let spawnContext: OwnerApprovedSpawnContext;
  const provider = input.provider.name === "deterministic"
    ? deterministicProvider(input.goal, proposal.plugin.id, () => validatedSlug)
    : input.provider.endpoint === undefined || input.provider.model === null
      ? fail("project-plugin-admission-failed")
      : (dependencies.createOllamaProvider ?? createOllamaProvider)({ endpoint: input.provider.endpoint });
  const agentInput: AgentRunInput = Object.freeze({
    goal: input.goal,
    model: input.provider.model,
    limits: PROJECT_PLUGIN_RUN_LIMITS,
    ports: Object.freeze({ provider, policy, tools: Object.freeze([tool]) }),
  });

  let result: AgentRunResult;
  try {
    result = await (dependencies.withProjectPluginApprovalLock ?? withProjectPluginApprovalLock)({
      workspace: input.workspace,
      environment: input.environment,
      async run() {
        await recheckActiveApproval({ prepared, workspace: input.workspace, environment: input.environment, dependencies });
        return (dependencies.withOwnerApprovedSpawnPlugin ?? withOwnerApprovedSpawnPlugin)({
          ticket: admitted.ticket,
          pluginId: proposal.plugin.id,
          pluginRoot: artifact.pluginRoot,
          async run(context) {
            spawnContext = context;
            return (dependencies.runAgent ?? runAgent)(agentInput);
          },
        });
      },
    });
  } catch (error) {
    if (lifecycleStarted && receipt === undefined) fail("project-plugin-lifecycle-receipt-missing");
    if (error instanceof ProjectPluginRunError) throw error;
    fail("project-plugin-admission-failed");
  }
  if (lifecycleStarted && receipt === undefined) fail("project-plugin-lifecycle-receipt-missing");
  return Object.freeze({
    kind: "admitted",
    commitments: commitments(prepared),
    result,
    lifecycleStarted,
    ...(receipt === undefined ? {} : { receipt }),
    ...(lifecycleStartedAtMs === undefined ? {} : { lifecycleStartedAtMs }),
  });
}
