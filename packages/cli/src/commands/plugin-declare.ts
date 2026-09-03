import {
  ProjectToolPluginDeclarationError,
  declareProjectToolPlugin,
} from "../project-plugin-declaration.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_DECLARE_USAGE = "Usage: prism plugin declare <workspace-relative-path> --operation slugify\n";

type ParseResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message: string };

function parseArguments(arguments_: readonly string[]): ParseResult {
  let operation: string | undefined;
  let parseOptions = true;
  const positionals: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (parseOptions && argument === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && argument === "--operation") {
      if (operation !== undefined) return { ok: false, message: `Option --operation may only be specified once.\n${PLUGIN_DECLARE_USAGE}` };
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) return { ok: false, message: `Option --operation requires a value.\n${PLUGIN_DECLARE_USAGE}` };
      operation = value;
      index += 1;
      continue;
    }
    if (parseOptions && argument.startsWith("-")) return { ok: false, message: `Unknown option: ${argument}\n${PLUGIN_DECLARE_USAGE}` };
    positionals.push(argument);
  }
  if (positionals.length === 0) return { ok: false, message: `Missing plugin path.\n${PLUGIN_DECLARE_USAGE}` };
  if (positionals.length > 1) return { ok: false, message: `Unexpected argument: ${positionals[1]}\n${PLUGIN_DECLARE_USAGE}` };
  if (operation === undefined) return { ok: false, message: `Missing required option: --operation.\n${PLUGIN_DECLARE_USAGE}` };
  if (operation !== "slugify") return { ok: false, message: `Unsupported operation: ${operation}\n${PLUGIN_DECLARE_USAGE}` };
  return { ok: true, path: positionals[0] as string };
}

function errorCode(error: unknown): string {
  return error instanceof ProjectToolPluginDeclarationError ? error.code : "unknown-error";
}

export async function pluginDeclareCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly workspace: string;
}): Promise<number> {
  const parsed = parseArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }
  try {
    const result = await declareProjectToolPlugin({ workspace: input.workspace, path: parsed.path, operation: "slugify" });
    input.stdout.write(`Declared project tool plugin: ${result.declaration.path} (${result.declaration.operation})\n`);
    return 0;
  } catch (error) {
    const code = errorCode(error);
    input.stderr.write(`Prism plugin declare failed: ${code}\n`);
    if (code === "project-config-missing") {
      input.stderr.write("Run: prism init --scope project --provider deterministic\n");
    }
    return 1;
  }
}
