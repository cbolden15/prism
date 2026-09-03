import type { CliWriter } from "./run.ts";
import { runPluginCheckChild, type PluginCheckChildError } from "../plugin-check-child-runner.ts";
import { inspectToolPlugin, staticIdentityUnchanged, type PluginCheckStaticError } from "../plugin-check-static.ts";

export const PLUGIN_CHECK_USAGE = "Usage: prism plugin check <path> [--json]\n";

const AMBIENT_AUTHORITY_WARNING = "Warning: plugin check executes plugin code with ambient host authority; it is not a sandbox.\n";

type PluginCheckError = PluginCheckStaticError | PluginCheckChildError;

type ParsedArguments =
  | { readonly ok: true; readonly path: string; readonly json: boolean }
  | { readonly ok: false; readonly message: string };

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  let json = false;
  let parseOptions = true;
  const positionals: string[] = [];
  for (const argument of arguments_) {
    if (parseOptions && argument === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && argument === "--json") {
      if (json) return { ok: false, message: `Option --json may only be specified once.\n${PLUGIN_CHECK_USAGE}` };
      json = true;
      continue;
    }
    if (parseOptions && argument.startsWith("-")) {
      return { ok: false, message: `Unknown option: ${argument}\n${PLUGIN_CHECK_USAGE}` };
    }
    positionals.push(argument);
  }
  if (positionals.length === 0) return { ok: false, message: `Missing plugin path.\n${PLUGIN_CHECK_USAGE}` };
  if (positionals.length > 1) return { ok: false, message: `Unexpected argument: ${positionals[1]}\n${PLUGIN_CHECK_USAGE}` };
  return { ok: true, path: positionals[0] as string, json };
}

function writeFailure(stderr: CliWriter, code: PluginCheckError): number {
  stderr.write(`Prism plugin check failed: ${code}\n`);
  return 1;
}

function humanSuccess(pluginId: string, operation: string): string {
  return [
    `Plugin ${pluginId} passed authoring checks.`,
    `Fixture operation: ${operation}`,
    "Execution boundary: ambient subprocess (not a sandbox)",
    "Cleanup: original child process group confirmed absent",
    "Detached or re-parented descendants: not controlled",
    "",
  ].join("\n");
}

export async function pluginCheckCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly currentWorkingDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
}): Promise<number> {
  const parsed = parseArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  const staticCheck = await inspectToolPlugin(parsed.path, input.currentWorkingDirectory);
  if (!staticCheck.ok) return writeFailure(input.stderr, staticCheck.code);
  if (!await staticIdentityUnchanged(staticCheck.value)) return writeFailure(input.stderr, "path-changed");

  input.stderr.write(AMBIENT_AUTHORITY_WARNING);
  const child = await runPluginCheckChild(staticCheck.value);
  if (!await staticIdentityUnchanged(staticCheck.value, false)) return writeFailure(input.stderr, "path-changed");
  if (!child.ok) return writeFailure(input.stderr, child.code);

  if (parsed.json) {
    input.stdout.write(`${JSON.stringify({
      version: "prism-plugin-check-result-v1",
      status: "ok",
      pluginId: staticCheck.value.manifest.id,
      kind: "tool",
      operation: child.operation,
      executionBoundary: "ambient-subprocess",
      sandboxed: false,
      cleanup: "original-process-group-confirmed",
      detachedDescendants: "not-controlled",
    })}\n`);
  } else {
    input.stdout.write(humanSuccess(staticCheck.value.manifest.id, child.operation));
  }
  return 0;
}
