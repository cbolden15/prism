import {
  ProjectToolPluginDeclarationError,
  undeclareProjectToolPlugin,
} from "../project-plugin-declaration.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_UNDECLARE_USAGE = "Usage: prism plugin undeclare\n";

function parseArguments(arguments_: readonly string[]): string | undefined {
  const argument = arguments_[0];
  if (argument === undefined) return undefined;
  return `${argument.startsWith("-") ? "Unknown option" : "Unexpected argument"}: ${argument}\n${PLUGIN_UNDECLARE_USAGE}`;
}

export async function pluginUndeclareCommand(input: {
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
    await undeclareProjectToolPlugin({ workspace: input.workspace });
    input.stdout.write("Undeclared project tool plugin.\n");
    return 0;
  } catch (error) {
    const code = error instanceof ProjectToolPluginDeclarationError ? error.code : "unknown-error";
    input.stderr.write(`Prism plugin undeclare failed: ${code}\n`);
    return 1;
  }
}
