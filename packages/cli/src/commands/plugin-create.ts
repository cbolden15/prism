import { resolve } from "node:path";
import { createToolPluginScaffold } from "@useprism/sdk/authoring";
import {
  createManagedPlugin,
  DEFAULT_AUTHORING_ROOT_BASENAME,
  NativeAuthoringFailure,
  type ManagedPluginCreateInput,
} from "../native-authoring.ts";
import type { CliWriter } from "./run.ts";

export const PLUGIN_CREATE_USAGE = "Usage: prism plugin create <name> [--directory <path>]\n";

interface PluginCreateDependencies {
  readonly createManagedPlugin?: (input: ManagedPluginCreateInput) => void;
}

interface ParsedCreateArguments {
  readonly name: string;
  readonly directory?: string;
}

type ParseResult =
  | { readonly ok: true; readonly value: ParsedCreateArguments }
  | { readonly ok: false; readonly message: string };

function parseCreateArguments(arguments_: readonly string[]): ParseResult {
  let directory: string | undefined;
  let parseOptions = true;
  const positionals: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (parseOptions && argument === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && argument === "--directory") {
      if (directory !== undefined) {
        return { ok: false, message: `Option --directory may only be specified once.\n${PLUGIN_CREATE_USAGE}` };
      }
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ok: false, message: `Option --directory requires a value.\n${PLUGIN_CREATE_USAGE}` };
      }
      directory = value;
      index += 1;
      continue;
    }
    if (parseOptions && argument.startsWith("-")) {
      return { ok: false, message: `Unknown option: ${argument}\n${PLUGIN_CREATE_USAGE}` };
    }
    positionals.push(argument);
  }

  if (positionals.length === 0) return { ok: false, message: `Missing plugin name.\n${PLUGIN_CREATE_USAGE}` };
  if (positionals.length > 1) {
    return { ok: false, message: `Unexpected argument: ${positionals[1]}\n${PLUGIN_CREATE_USAGE}` };
  }
  return {
    ok: true,
    value: {
      name: positionals[0] as string,
      ...(directory === undefined ? {} : { directory }),
    },
  };
}

export async function pluginCreateCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly currentWorkingDirectory: string;
  readonly dependencies?: PluginCreateDependencies;
}): Promise<number> {
  const parsed = parseCreateArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  const scaffold = createToolPluginScaffold(parsed.value.name);
  if (scaffold === null) {
    input.stderr.write(`Invalid plugin name.\n${PLUGIN_CREATE_USAGE}`);
    return 2;
  }

  const rootPath = resolve(
    input.currentWorkingDirectory,
    parsed.value.directory ?? DEFAULT_AUTHORING_ROOT_BASENAME,
  );
  try {
    (input.dependencies?.createManagedPlugin ?? createManagedPlugin)({
      rootPath,
      pluginId: parsed.value.name,
      scaffold,
    });
  } catch (error) {
    const code = error instanceof NativeAuthoringFailure ? error.code : "create-failed";
    input.stderr.write(`Prism plugin create failed: ${code}\n`);
    return 1;
  }

  input.stdout.write(`Created tool plugin: ${parsed.value.name}\n`);
  return 0;
}
