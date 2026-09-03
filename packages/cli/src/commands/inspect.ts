import {
  isCanonicalRunId,
  readRunRecord,
  RUN_RECORD_VERSION_V3,
  type StoredRunRecord,
  type StateEnvironment,
} from "../run-store.ts";
import type { CliWriter } from "./run.ts";

export const INSPECT_USAGE = "Usage: prism inspect [--json] <run-id>\n";

type ParseInspectResult =
  | { readonly ok: true; readonly runId: string; readonly json: boolean }
  | { readonly ok: false; readonly message: string };

function parseInspectArguments(arguments_: readonly string[]): ParseInspectResult {
  let json = false;
  let parseOptions = true;
  const positionals: string[] = [];
  for (const argument of arguments_) {
    if (parseOptions && argument === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && argument === "--json") {
      if (json) return { ok: false, message: `Option --json may only be specified once.\n${INSPECT_USAGE}` };
      json = true;
      continue;
    }
    if (parseOptions && argument.startsWith("-")) {
      return { ok: false, message: `Unknown option: ${argument}\n${INSPECT_USAGE}` };
    }
    positionals.push(argument);
  }
  if (positionals.length === 0) return { ok: false, message: `Missing run ID.\n${INSPECT_USAGE}` };
  if (positionals.length > 1) return { ok: false, message: `Unexpected argument: ${positionals[1]}\n${INSPECT_USAGE}` };
  const runId = positionals[0] as string;
  if (!isCanonicalRunId(runId)) {
    return { ok: false, message: `Run ID must be a canonical UUID.\n${INSPECT_USAGE}` };
  }
  return { ok: true, runId, json };
}

function renderHuman(record: StoredRunRecord): string {
  if (record.version === RUN_RECORD_VERSION_V3) {
    const terminal = record.terminal.status === "completed"
      ? `Answer: ${record.terminal.answer}`
      : `Failure: ${record.terminal.code}`;
    const cleanup = record.cleanup === null
      ? "Cleanup: none (no plugin lifecycle began)"
      : [
        `Cleanup: ${record.cleanup.trigger}`,
        `Cleanup exit: ${record.cleanup.exitCode ?? "-"}`,
        `Cleanup OOM killed: ${record.cleanup.oomKilled ?? "-"}`,
        `Cleanup confirmed absent: ${record.cleanup.confirmedAbsent}`,
        `Cleanup errors: ${record.cleanup.cleanupErrorCount}`,
        `Cleanup settlement ms: ${record.cleanup.settlementMs}`,
      ].join("\n");
    return [
      `Run: ${record.runId}`,
      `Status: ${record.terminal.status}`,
      `Provider: ${record.provider.name}`,
      `Model: ${record.provider.model ?? "-"}`,
      `Project config digest: ${record.project.projectConfigDigest}`,
      `Plugin: ${record.plugin.id}#${record.plugin.operation}`,
      `Plugin manifest digest: ${record.plugin.manifestDigest}`,
      `Plugin source digest: ${record.plugin.sourceDigest}`,
      `Approval digest: ${record.approval.approvalDigest}`,
      `Registry digest: ${record.registry.registryDigest}`,
      `Runtime version digest: ${record.runtime.versionDigest}`,
      `Runtime runner digest: ${record.runtime.runnerDigest}`,
      `Runtime image digest: ${record.runtime.imageDigest}`,
      `Runtime profile digest: ${record.runtime.profileDigest}`,
      `Usage: ${record.usage.providerTurns} provider turns, ${record.usage.toolCalls} tool calls, ${record.usage.totalBytes} bytes`,
      `Trace entries: ${record.trace.length}`,
      `Started: ${record.startedAt}`,
      `Ended: ${record.endedAt}`,
      terminal,
      cleanup,
      "",
    ].join("\n");
  }
  const terminal = record.terminal.status === "completed"
    ? `Answer: ${record.terminal.answer}`
    : `Failure: ${record.terminal.code}`;
  return [
    `Run: ${record.runId}`,
    `Status: ${record.terminal.status}`,
    `Provider: ${record.provider}`,
    `Model: ${record.model ?? "-"}`,
    `Workspace: ${record.workspace}`,
    `Goal: ${record.goal}`,
    `Started: ${record.startedAt}`,
    `Ended: ${record.endedAt}`,
    terminal,
    "",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}

export async function inspectCommand(input: {
  readonly arguments: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly environment: StateEnvironment;
}): Promise<number> {
  const parsed = parseInspectArguments(input.arguments);
  if (!parsed.ok) {
    input.stderr.write(parsed.message);
    return 2;
  }
  try {
    const record = await readRunRecord({
      environment: input.environment,
      runId: parsed.runId,
    });
    input.stdout.write(parsed.json ? `${JSON.stringify(record)}\n` : renderHuman(record));
    return 0;
  } catch (error) {
    input.stderr.write(`Prism inspect failed: ${errorMessage(error)}\n`);
    return 1;
  }
}
