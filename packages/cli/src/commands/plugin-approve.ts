import {
  ProjectPluginArtifactError,
  publishFirstProjectPluginArtifact,
} from "../project-plugin-artifact.ts";
import {
  ProjectPluginApprovalPreviewError,
  prepareProjectPluginApproval,
} from "../project-plugin-approval-preview.ts";
import {
  ProjectPluginApprovalStateError,
  writeProjectPluginApprovalState,
} from "../project-plugin-approval-state.ts";
import { ProjectPluginPrivateStateError } from "../project-plugin-private-state.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_APPROVE_USAGE = "Usage: prism plugin approve --digest <approval-digest>\n";

type PluginApproveCommandErrorCode =
  | "project-plugin-unsupported-platform"
  | "project-plugin-approval-digest-mismatch"
  | "project-plugin-approval-changed";

class PluginApproveCommandError extends Error {
  readonly code: PluginApproveCommandErrorCode;

  constructor(code: PluginApproveCommandErrorCode) {
    super(code);
    this.name = "PluginApproveCommandError";
    this.code = code;
  }
}

export interface PluginApproveCommandDependencies {
  readonly platform?: string;
  readonly prepare?: typeof prepareProjectPluginApproval;
  readonly publishFirst?: typeof publishFirstProjectPluginArtifact;
  readonly writeApproval?: typeof writeProjectPluginApprovalState;
}

type ParseResult =
  | { readonly ok: true; readonly digest: string }
  | { readonly ok: false; readonly message: string };

function parseArguments(arguments_: readonly string[]): ParseResult {
  if (arguments_.length === 0) {
    return { ok: false, message: `Missing required option: --digest.\n${PLUGIN_APPROVE_USAGE}` };
  }
  if (arguments_[0] !== "--digest") {
    const argument = arguments_[0] as string;
    return {
      ok: false,
      message: `${argument.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${PLUGIN_APPROVE_USAGE}`,
    };
  }
  if (arguments_.length === 1 || arguments_[1]?.startsWith("-")) {
    return { ok: false, message: `Option --digest requires a value.\n${PLUGIN_APPROVE_USAGE}` };
  }
  if (arguments_.length > 2) {
    const argument = arguments_[2] as string;
    const duplicate = argument === "--digest" || arguments_.slice(2).includes("--digest");
    return {
      ok: false,
      message: duplicate
        ? `Option --digest may only be specified once.\n${PLUGIN_APPROVE_USAGE}`
        : `Unexpected argument: ${argument}\n${PLUGIN_APPROVE_USAGE}`,
    };
  }
  const digest = arguments_[1] as string;
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    return { ok: false, message: `Option --digest requires a lowercase SHA-256 value.\n${PLUGIN_APPROVE_USAGE}` };
  }
  return { ok: true, digest };
}

function fail(code: PluginApproveCommandErrorCode): never {
  throw new PluginApproveCommandError(code);
}

function errorCode(error: unknown): string {
  if (
    error instanceof PluginApproveCommandError
    || error instanceof ProjectPluginApprovalPreviewError
    || error instanceof ProjectPluginArtifactError
    || error instanceof ProjectPluginApprovalStateError
    || error instanceof ProjectPluginPrivateStateError
  ) return error.code;
  return "unknown-error";
}

export async function pluginApproveCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: PluginApproveCommandDependencies;
}): Promise<number> {
  const parsed = parseArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  const dependencies = input.dependencies ?? {};
  const currentPlatform = dependencies.platform ?? process.platform;
  try {
    if (currentPlatform === "win32") fail("project-plugin-unsupported-platform");
    const prepared = await (dependencies.prepare ?? prepareProjectPluginApproval)({ workspace: input.workspace });
    if (prepared.proposal.approvalDigest !== parsed.digest) fail("project-plugin-approval-digest-mismatch");
    await (dependencies.publishFirst ?? publishFirstProjectPluginArtifact)({
      prepared,
      confirmedApprovalDigest: parsed.digest,
      environment: input.environment,
      dependencies: { platform: currentPlatform },
    });
    if (!await prepared.isFresh()) fail("project-plugin-approval-changed");
    await (dependencies.writeApproval ?? writeProjectPluginApprovalState)({
      proposal: prepared.proposal,
      environment: input.environment,
      isFresh: prepared.isFresh,
      dependencies: { platform: currentPlatform },
    });
    input.stdout.write(`Approved project tool plugin ${prepared.proposal.plugin.id}: ${prepared.proposal.approvalDigest}\n`);
    return 0;
  } catch (error) {
    input.stderr.write(`Prism plugin approve failed: ${errorCode(error)}\n`);
    return 1;
  }
}
