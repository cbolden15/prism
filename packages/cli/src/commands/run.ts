import { randomUUID } from "node:crypto";
import { lstat, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  resolvePrismConfig,
  type ConfigEnvironment,
  type ProviderName,
} from "../config.ts";
import { runPrismDemo } from "../deterministic/prism-demo.ts";
import {
  createProjectPluginRunRecord,
  createRunRecord,
  writeRunRecord,
  type RunRecord,
  type StateEnvironment,
} from "../run-store.ts";
import {
  runProjectPlugin,
  ProjectPluginRunError,
  isProjectPluginRunErrorCode,
  type ProjectPluginRunDependencies,
} from "../project-plugin-run.ts";
import { authorizeEndpoint } from "../trust.ts";

export const RUN_USAGE = "Usage: prism run [--provider deterministic|ollama] [--model <name>] [--workspace <path>] [--allow-remote-endpoint <origin>] [--no-plugin] [--json] <goal>\n";

export interface CliWriter {
  write(value: string): unknown;
}

export type DeterministicRunner = (goal: string) => Promise<unknown>;
export type RunEnvironment = ConfigEnvironment & StateEnvironment;

export interface RunCommandDependencies {
  readonly runDeterministic: DeterministicRunner;
  readonly environment?: RunEnvironment;
  readonly currentWorkingDirectory?: () => string;
  readonly now?: () => Date;
  readonly createRunId?: () => string;
  readonly canonicalizeWorkspace?: (path: string) => Promise<string>;
  readonly resolveConfig?: typeof resolvePrismConfig;
  readonly persistRunRecord?: typeof writeRunRecord;
  readonly authorizeEndpoint?: typeof authorizeEndpoint;
  readonly runProjectPlugin?: typeof runProjectPlugin;
  readonly projectPluginDependencies?: ProjectPluginRunDependencies;
  readonly hasProjectPluginDeclaration?: (workspace: string) => Promise<boolean>;
  readonly runOllama?: (input: {
    readonly goal: string;
    readonly endpoint: string;
    readonly model: string;
    readonly workspace: string;
  }) => Promise<unknown>;
}

interface ParsedRunArguments {
  readonly goal: string;
  readonly provider?: ProviderName;
  readonly model?: string;
  readonly workspace?: string;
  readonly allowRemoteEndpoint?: string;
  readonly noPlugin: boolean;
  readonly json: boolean;
}

type ParseRunArgumentsResult =
  | { readonly ok: true; readonly value: ParsedRunArguments }
  | { readonly ok: false; readonly message: string };

function parseRunArguments(arguments_: readonly string[]): ParseRunArgumentsResult {
  let parseOptions = true;
  let json = false;
  let noPlugin = false;
  const values: Partial<Record<"--provider" | "--model" | "--workspace" | "--allow-remote-endpoint", string>> = {};
  const positionals: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (parseOptions && argument === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && argument === "--json") {
      if (json) return { ok: false, message: `Option --json may only be specified once.\n${RUN_USAGE}` };
      json = true;
      continue;
    }
    if (parseOptions && argument === "--no-plugin") {
      if (noPlugin) return { ok: false, message: `Option --no-plugin may only be specified once.\n${RUN_USAGE}` };
      noPlugin = true;
      continue;
    }
    if (
      parseOptions
      && (argument === "--provider" || argument === "--model" || argument === "--workspace" || argument === "--allow-remote-endpoint")
    ) {
      if (values[argument] !== undefined) {
        return { ok: false, message: `Option ${argument} may only be specified once.\n${RUN_USAGE}` };
      }
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ok: false, message: `Option ${argument} requires a value.\n${RUN_USAGE}` };
      }
      values[argument] = value;
      index += 1;
      continue;
    }
    if (parseOptions && argument.startsWith("-")) {
      return { ok: false, message: `Unknown option: ${argument}\n${RUN_USAGE}` };
    }
    positionals.push(argument);
  }

  if (positionals.length === 0) return { ok: false, message: `Missing goal.\n${RUN_USAGE}` };
  if (positionals.length > 1) return { ok: false, message: `Unexpected argument: ${positionals[1]}\n${RUN_USAGE}` };
  const provider = values["--provider"];
  if (provider !== undefined && provider !== "deterministic" && provider !== "ollama") {
    return { ok: false, message: `Unsupported provider: ${provider}\n${RUN_USAGE}` };
  }
  if (provider === "deterministic" && values["--model"] !== undefined) {
    return { ok: false, message: `--model requires provider ollama.\n${RUN_USAGE}` };
  }
  return {
    ok: true,
    value: {
      goal: positionals[0] as string,
      ...(provider === undefined ? {} : { provider }),
      ...(values["--model"] === undefined ? {} : { model: values["--model"] }),
      ...(values["--workspace"] === undefined ? {} : { workspace: values["--workspace"] }),
      ...(values["--allow-remote-endpoint"] === undefined
        ? {}
        : { allowRemoteEndpoint: values["--allow-remote-endpoint"] }),
      noPlugin,
      json,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}

async function canonicalWorkspace(path: string): Promise<string> {
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error("workspace must be a directory");
  return canonical;
}

function failedResult(code: string, accepted = false): unknown {
  return {
    status: "failed",
    code,
    events: accepted ? [{ seq: 1, type: "goal.accepted" }] : [],
  };
}

function buildRecordWithFallback(input: Parameters<typeof createRunRecord>[0]): RunRecord {
  try {
    return createRunRecord(input);
  } catch {
    return createRunRecord({
      ...input,
      result: failedResult("invalid-runtime-result"),
    });
  }
}

async function hasExactProjectPluginDeclaration(workspace: string): Promise<boolean> {
  try {
    await lstat(join(workspace, ".prism", "tool-plugin.json"));
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") return false;
    throw error;
  }
}

async function authorizeOllamaEndpoint(input: {
  readonly config: Extract<Awaited<ReturnType<typeof resolvePrismConfig>>["config"], { readonly provider: "ollama" }>;
  readonly resolvedConfig: Awaited<ReturnType<typeof resolvePrismConfig>>;
  readonly environment: RunEnvironment;
  readonly workspace: string;
  readonly allowRemoteEndpoint: string | undefined;
  readonly authorize: typeof authorizeEndpoint;
}): Promise<void> {
  if (input.resolvedConfig.endpointSource === null) throw new Error("remote endpoint not authorized");
  await input.authorize({
    environment: input.environment,
    endpoint: input.config.endpoint,
    workspace: input.workspace,
    endpointSource: input.resolvedConfig.endpointSource,
    projectConfigPath: input.resolvedConfig.endpointSource === "project" ? input.resolvedConfig.paths.project : undefined,
    allowRemoteEndpoint: input.allowRemoteEndpoint,
  });
}

export async function runCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly dependencies: RunCommandDependencies;
}): Promise<number> {
  const parsed = parseRunArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }

  const environment = input.dependencies.environment ?? process.env;
  const cwd = input.dependencies.currentWorkingDirectory?.() ?? process.cwd();
  const canonicalize = input.dependencies.canonicalizeWorkspace ?? canonicalWorkspace;
  const resolveConfig = input.dependencies.resolveConfig ?? resolvePrismConfig;
  const persist = input.dependencies.persistRunRecord ?? writeRunRecord;
  const now = input.dependencies.now ?? (() => new Date());
  const makeRunId = input.dependencies.createRunId ?? randomUUID;

  let workspace: string;
  let resolvedConfig: Awaited<ReturnType<typeof resolvePrismConfig>>;
  const startedAt = now().toISOString();
  try {
    workspace = await canonicalize(resolve(cwd, parsed.value.workspace ?? "."));
    resolvedConfig = await resolveConfig({
      workspace,
      environment,
      explicit: {
        ...(parsed.value.provider === undefined ? {} : { provider: parsed.value.provider }),
        ...(parsed.value.model === undefined ? {} : { model: parsed.value.model }),
      },
    });
  } catch (error) {
    input.stderr.write(`Prism run failed: ${errorMessage(error)}\n`);
    return 1;
  }

  const config = resolvedConfig.config;
  if (parsed.value.allowRemoteEndpoint !== undefined && config.provider !== "ollama") {
    input.stderr.write(`--allow-remote-endpoint requires provider ollama.\n${RUN_USAGE}`);
    return 2;
  }

  let declarationPresent: boolean;
  try {
    declarationPresent = await (input.dependencies.hasProjectPluginDeclaration ?? hasExactProjectPluginDeclaration)(workspace);
  } catch {
    input.stderr.write("Prism run failed: project-plugin-admission-failed\n");
    return 1;
  }
  if (parsed.value.noPlugin && declarationPresent) input.stderr.write("Prism run warning: project-plugin-disabled\n");

  if (!parsed.value.noPlugin && declarationPresent) {
    if (config.provider === "ollama") {
      try {
        await authorizeOllamaEndpoint({
          config,
          resolvedConfig,
          environment,
          workspace,
          allowRemoteEndpoint: parsed.value.allowRemoteEndpoint,
          authorize: input.dependencies.authorizeEndpoint ?? authorizeEndpoint,
        });
      } catch {
        input.stderr.write("Prism run failed: project-plugin-admission-failed\n");
        return 1;
      }
    }
    try {
      const projectRun = await (input.dependencies.runProjectPlugin ?? runProjectPlugin)({
        workspace,
        environment: {
          HOME: environment.HOME,
          XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME,
          XDG_STATE_HOME: environment.XDG_STATE_HOME,
        },
        goal: parsed.value.goal,
        provider: {
          name: config.provider,
          model: config.provider === "ollama" ? config.model : null,
          ...(config.provider === "ollama" ? { endpoint: config.endpoint } : {}),
        },
      }, input.dependencies.projectPluginDependencies);
      const endedAt = now().toISOString();
      const runId = makeRunId();
      let record;
      try {
        record = createProjectPluginRunRecord({
          metadata: {
            runId,
            provider: { name: config.provider, model: config.provider === "ollama" ? config.model : null },
            startedAt,
            endedAt,
          },
          commitments: projectRun.commitments,
          result: projectRun.result,
          lifecycleStarted: projectRun.lifecycleStarted,
          ...(projectRun.receipt === undefined ? {} : { receipt: projectRun.receipt }),
          ...(projectRun.lifecycleStartedAtMs === undefined ? {} : { lifecycleStartedAtMs: projectRun.lifecycleStartedAtMs }),
        });
      } catch {
        input.stderr.write("Prism run failed: project-plugin-evidence-invalid\n");
        return 1;
      }
      try {
        await persist({ environment, record });
      } catch (error) {
        input.stderr.write(`Prism run failed: could not save run record: ${errorMessage(error)}\n`);
        return 1;
      }
      if (record.terminal.status === "failed") {
        if (parsed.value.json) input.stdout.write(`${JSON.stringify({ runId, status: "failed", code: record.terminal.code })}\n`);
        else input.stderr.write(`Prism run failed: ${record.terminal.code}\nRun: ${runId}\n`);
        return 1;
      }
      if (parsed.value.json) {
        input.stdout.write(`${JSON.stringify({
          runId,
          status: "completed",
          answer: record.terminal.answer,
          provider: record.provider.name,
          model: record.provider.model,
        })}\n`);
      } else input.stdout.write(`${record.terminal.answer}\nRun: ${runId}\n`);
      return 0;
    } catch (error) {
      const candidate = error instanceof ProjectPluginRunError
        ? error.code
        : typeof error === "object" && error !== null && typeof Reflect.get(error, "code") === "string"
          ? Reflect.get(error, "code")
          : undefined;
      const code = isProjectPluginRunErrorCode(candidate) ? candidate : "project-plugin-admission-failed";
      input.stderr.write(`Prism run failed: ${code}\n`);
      return 1;
    }
  }

  let result: unknown;
  let failureDetail: string | undefined;
  const runOllama = input.dependencies.runOllama;
  let endpointAuthorized = config.provider !== "ollama";
  if (config.provider === "ollama") {
    try {
      await authorizeOllamaEndpoint({
        config,
        resolvedConfig,
        environment,
        workspace,
        allowRemoteEndpoint: parsed.value.allowRemoteEndpoint,
        authorize: input.dependencies.authorizeEndpoint ?? authorizeEndpoint,
      });
      endpointAuthorized = true;
    } catch (error) {
      failureDetail = errorMessage(error);
      result = failedResult(
        failureDetail === "remote endpoint not authorized"
          ? "remote-endpoint-not-authorized"
          : "endpoint-authorization-failed",
        true,
      );
    }
  }

  if (endpointAuthorized) {
    if (config.provider === "ollama") {
      if (runOllama === undefined) {
        result = failedResult("provider-not-implemented", true);
      } else {
        try {
          result = await runOllama({
            goal: parsed.value.goal,
            endpoint: config.endpoint,
            model: config.model,
            workspace,
          });
        } catch {
          result = failedResult("provider-failure", true);
        }
      }
    } else {
      try {
        result = await input.dependencies.runDeterministic(parsed.value.goal);
      } catch {
        result = failedResult("runtime-error");
      }
    }
  }
  const endedAt = now().toISOString();
  const runId = makeRunId();
  const record = buildRecordWithFallback({
    runId,
    workspace,
    goal: parsed.value.goal,
    provider: config.provider,
    model: config.provider === "ollama" ? config.model : null,
    result,
    startedAt,
    endedAt,
  });

  try {
    await persist({ environment, record });
  } catch (error) {
    input.stderr.write(`Prism run failed: could not save run record: ${errorMessage(error)}\n`);
    return 1;
  }

  if (record.terminal.status === "failed") {
    if (parsed.value.json) {
      input.stdout.write(`${JSON.stringify({
        runId,
        status: "failed",
        code: record.terminal.code,
      })}\n`);
    } else {
      input.stderr.write(`Prism run failed: ${failureDetail ?? record.terminal.code}\nRun: ${runId}\n`);
    }
    return 1;
  }

  if (parsed.value.json) {
    input.stdout.write(`${JSON.stringify({
      runId,
      status: "completed",
      answer: record.terminal.answer,
      provider: record.provider,
      model: record.model,
    })}\n`);
  } else {
    input.stdout.write(`${record.terminal.answer}\nRun: ${runId}\n`);
  }
  return 0;
}

export async function runCurrentDeterministicDemo(goal: string): Promise<unknown> {
  return (await runPrismDemo(goal)).result;
}
