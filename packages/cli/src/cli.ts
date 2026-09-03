import {
  RUN_USAGE,
  runCommand,
  type CliWriter,
  type RunCommandDependencies,
} from "./commands/run.ts";
import { INIT_USAGE, initCommand } from "./commands/init.ts";
import { INSPECT_USAGE, inspectCommand } from "./commands/inspect.ts";
import {
  DOCTOR_USAGE,
  doctorCommand,
  type DoctorCommandDependencies,
} from "./commands/doctor.ts";
import {
  PLUGIN_CREATE_USAGE,
  pluginCreateCommand,
} from "./commands/plugin-create.ts";
import {
  PLUGIN_CHECK_USAGE,
  pluginCheckCommand,
} from "./commands/plugin-check.ts";
import {
  PLUGIN_DECLARE_USAGE,
  pluginDeclareCommand,
} from "./commands/plugin-declare.ts";
import {
  PLUGIN_UNDECLARE_USAGE,
  pluginUndeclareCommand,
} from "./commands/plugin-undeclare.ts";
import {
  PLUGIN_APPROVAL_USAGE,
  pluginApprovalCommand,
} from "./commands/plugin-approval.ts";
import {
  PLUGIN_APPROVE_USAGE,
  pluginApproveCommand,
} from "./commands/plugin-approve.ts";
import {
  PLUGIN_REVOKE_USAGE,
  pluginRevokeCommand,
} from "./commands/plugin-revoke.ts";

export interface PrismCliInput {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly dependencies: RunCommandDependencies & DoctorCommandDependencies;
}

const PLUGIN_USAGE = `${PLUGIN_CREATE_USAGE}${PLUGIN_CHECK_USAGE}${PLUGIN_DECLARE_USAGE}${PLUGIN_UNDECLARE_USAGE}${PLUGIN_APPROVAL_USAGE}${PLUGIN_APPROVE_USAGE}${PLUGIN_REVOKE_USAGE}`;
const CLI_USAGE = `${INIT_USAGE}${DOCTOR_USAGE}${RUN_USAGE}${INSPECT_USAGE}${PLUGIN_USAGE}`;

export async function runCli(input: PrismCliInput): Promise<number> {
  const [command, ...commandArguments] = input.arguments;
  if (command === undefined) {
    input.stderr.write(CLI_USAGE);
    return 2;
  }
  if (command === "init") {
    return initCommand({
      arguments: commandArguments,
      stdout: input.stdout,
      stderr: input.stderr,
      workspace: input.dependencies.currentWorkingDirectory?.() ?? process.cwd(),
      environment: input.dependencies.environment ?? process.env,
    });
  }
  if (command === "doctor") {
    return doctorCommand({
      arguments: commandArguments,
      stdout: input.stdout,
      stderr: input.stderr,
      workspace: input.dependencies.currentWorkingDirectory?.() ?? process.cwd(),
      environment: input.dependencies.environment ?? process.env,
      dependencies: input.dependencies,
    });
  }
  if (command === "inspect") {
    return inspectCommand({
      arguments: commandArguments,
      stdout: input.stdout,
      stderr: input.stderr,
      environment: input.dependencies.environment ?? process.env,
    });
  }
  if (command === "plugin") {
    const [pluginCommand, ...pluginArguments] = commandArguments;
    if (pluginCommand === undefined) {
      input.stderr.write(`Missing plugin subcommand.\n${PLUGIN_USAGE}`);
      return 2;
    }
    const currentWorkingDirectory = input.dependencies.currentWorkingDirectory?.() ?? process.cwd();
    const environment = input.dependencies.environment ?? process.env;
    const pluginEnvironment = {
      HOME: environment.HOME,
      XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME,
      XDG_STATE_HOME: environment.XDG_STATE_HOME,
    };
    if (pluginCommand === "create") {
      return pluginCreateCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        currentWorkingDirectory,
      });
    }
    if (pluginCommand === "check") {
      return pluginCheckCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        currentWorkingDirectory,
        environment: {
          ...process.env,
          ...input.dependencies.environment,
        },
      });
    }
    if (pluginCommand === "declare") {
      return pluginDeclareCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        workspace: currentWorkingDirectory,
      });
    }
    if (pluginCommand === "undeclare") {
      return pluginUndeclareCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        workspace: currentWorkingDirectory,
      });
    }
    if (pluginCommand === "approval") {
      return pluginApprovalCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        workspace: currentWorkingDirectory,
      });
    }
    if (pluginCommand === "approve") {
      return pluginApproveCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        workspace: currentWorkingDirectory,
        environment: pluginEnvironment,
      });
    }
    if (pluginCommand === "revoke") {
      return pluginRevokeCommand({
        arguments: pluginArguments,
        stdout: input.stdout,
        stderr: input.stderr,
        workspace: currentWorkingDirectory,
        environment: pluginEnvironment,
      });
    }
    input.stderr.write(`Unknown plugin subcommand: ${pluginCommand}\n${PLUGIN_USAGE}`);
    return 2;
  }
  if (command !== "run") {
    input.stderr.write(`Unknown command: ${command}\n${CLI_USAGE}`);
    return 2;
  }
  return runCommand({
    arguments: commandArguments,
    stdout: input.stdout,
    stderr: input.stderr,
    dependencies: input.dependencies,
  });
}
