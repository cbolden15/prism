import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runConformance } from "../contracts/coverage.ts";
import { buildProofReport, ProofReportError } from "../contracts/proof-report.ts";
import { loadRegistry, stableStringify } from "../contracts/registry.ts";

interface CliOptions {
  readonly output?: string;
}

function parseArgs(args: readonly string[]): CliOptions {
  let output: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument !== "--output") throw new Error(`unknown argument: ${argument}`);
    const value = args[index + 1];
    if (value === undefined || value.length === 0 || output !== undefined) {
      throw new Error("--output requires exactly one non-empty path");
    }
    output = value;
    index += 1;
  }
  return output === undefined ? {} : { output };
}

export function generateProofReport(repoRoot: string): string {
  const registry = loadRegistry(resolve(repoRoot, "assurance/constitution/contracts/invariants.yaml"));
  const testFiles = [...new Set(
    registry.invariants.flatMap(({ conformance }) => [...conformance]),
  )].sort();
  const result = runConformance(testFiles, repoRoot);
  const report = buildProofReport({
    repoRoot,
    run: result,
  });
  return `${stableStringify(report)}\n`;
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const serialized = generateProofReport(process.cwd());
    if (options.output === undefined) {
      process.stdout.write(serialized);
    } else {
      writeFileSync(options.output, serialized, "utf8");
    }
  } catch (error) {
    const errors = error instanceof ProofReportError ? error.errors : [String(error)];
    process.stderr.write(`${stableStringify({ code: "proof-report-failed", errors })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
