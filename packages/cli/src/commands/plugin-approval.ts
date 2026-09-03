import {
  ProjectPluginApprovalPreviewError,
  createProjectPluginApprovalPreview,
} from "../project-plugin-approval-preview.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_APPROVAL_USAGE = "Usage: prism plugin approval --json\n";

function parseArguments(arguments_: readonly string[]): string | undefined {
  if (arguments_.length === 0) return `Missing required option: --json.\n${PLUGIN_APPROVAL_USAGE}`;
  if (arguments_.length > 1 && arguments_.filter((argument) => argument === "--json").length > 1) {
    return `Option --json may only be specified once.\n${PLUGIN_APPROVAL_USAGE}`;
  }
  const argument = arguments_[0];
  if (argument !== "--json") {
    return `${argument?.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${PLUGIN_APPROVAL_USAGE}`;
  }
  if (arguments_.length > 1) return `Unexpected argument: ${arguments_[1]}\n${PLUGIN_APPROVAL_USAGE}`;
  return undefined;
}

export async function pluginApprovalCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
}): Promise<number> {
  const grammarError = parseArguments(input.arguments);
  if (grammarError !== undefined) {
    input.stderr.write(grammarError);
    return 2;
  }
  try {
    const proposal = await createProjectPluginApprovalPreview({ workspace: input.workspace });
    input.stdout.write(`${JSON.stringify(proposal)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof ProjectPluginApprovalPreviewError ? error.code : "unknown-error";
    input.stderr.write(`Prism plugin approval failed: ${code}\n`);
    return 1;
  }
}
