import {
  ProjectToolPluginDeclarationError,
  canonicalizeProjectPluginWorkspace,
} from "../project-plugin-declaration.ts";
import {
  ProjectPluginApprovalStateError,
  revokeProjectPluginApprovalState,
} from "../project-plugin-approval-state.ts";
import { ProjectPluginPrivateStateError } from "../project-plugin-private-state.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_REVOKE_USAGE = "Usage: prism plugin revoke\n";

type PluginRevokeCommandErrorCode =
  | "project-plugin-unsupported-platform"
  | "project-plugin-approval-missing";

class PluginRevokeCommandError extends Error {
  readonly code: PluginRevokeCommandErrorCode;

  constructor(code: PluginRevokeCommandErrorCode) {
    super(code);
    this.name = "PluginRevokeCommandError";
    this.code = code;
  }
}

export interface PluginRevokeCommandDependencies {
  readonly platform?: string;
  readonly canonicalizeWorkspace?: typeof canonicalizeProjectPluginWorkspace;
  readonly revokeApproval?: typeof revokeProjectPluginApprovalState;
}

function parseArguments(arguments_: readonly string[]): string | undefined {
  const argument = arguments_[0];
  if (argument === undefined) return undefined;
  return `${argument.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${PLUGIN_REVOKE_USAGE}`;
}

function fail(code: PluginRevokeCommandErrorCode): never {
  throw new PluginRevokeCommandError(code);
}

function errorCode(error: unknown): string {
  if (
    error instanceof PluginRevokeCommandError
    || error instanceof ProjectToolPluginDeclarationError
    || error instanceof ProjectPluginApprovalStateError
    || error instanceof ProjectPluginPrivateStateError
  ) return error.code;
  return "unknown-error";
}

export async function pluginRevokeCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: PluginRevokeCommandDependencies;
}): Promise<number> {
  const grammarError = parseArguments(input.arguments);
  if (grammarError !== undefined) {
    input.stderr.write(grammarError);
    return 2;
  }

  const dependencies = input.dependencies ?? {};
  const currentPlatform = dependencies.platform ?? process.platform;
  try {
    if (currentPlatform === "win32") fail("project-plugin-unsupported-platform");
    const workspace = await (dependencies.canonicalizeWorkspace ?? canonicalizeProjectPluginWorkspace)({
      workspace: input.workspace,
    });
    const revoked = await (dependencies.revokeApproval ?? revokeProjectPluginApprovalState)({
      workspace,
      environment: input.environment,
      dependencies: { platform: currentPlatform },
    });
    if (!revoked) fail("project-plugin-approval-missing");
    input.stdout.write("Revoked project tool plugin approval.\n");
    return 0;
  } catch (error) {
    input.stderr.write(`Prism plugin revoke failed: ${errorCode(error)}\n`);
    return 1;
  }
}
