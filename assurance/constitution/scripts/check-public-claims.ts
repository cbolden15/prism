import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatClaimFailure,
  runPublicClaimGate,
  type ClaimFailure,
} from "../contracts/public-claims.ts";

interface CliOptions {
  readonly root: string;
}

function parseArgs(args: readonly string[]): CliOptions {
  let root: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument !== "--root") throw new Error(`unknown argument: ${argument}`);
    const value = args[index + 1];
    if (value === undefined || value.length === 0 || root !== undefined) {
      throw new Error("--root requires exactly one non-empty path");
    }
    root = value;
    index += 1;
  }
  return { root: root ?? process.cwd() };
}

function main(): void {
  let failures: readonly ClaimFailure[];
  try {
    failures = runPublicClaimGate(parseArgs(process.argv.slice(2)).root);
  } catch (error) {
    process.stderr.write(`public-claim gate failed closed: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  if (failures.length === 0) {
    process.stdout.write("public-claim gate: 0 failures\n");
    return;
  }
  for (const failure of failures) process.stderr.write(`${formatClaimFailure(failure)}\n`);
  process.stderr.write(`public-claim gate: ${failures.length} failure(s)\n`);
  process.exitCode = 1;
}

// Path comparison, not URL-string comparison: a checkout path that needs URL
// escaping would make the template form compare unequal and skip main(),
// letting the gate exit 0 without running.
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
