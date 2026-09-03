#!/usr/bin/env node
import { runPrismDemo } from "./prism-demo.ts";

const goal = process.argv.slice(2).join(" ");
if (goal === "") {
  process.stderr.write("Missing goal.\nUsage: prism run [--provider deterministic] <goal>\n");
  process.exitCode = 2;
} else {
  try {
    const run = await runPrismDemo(goal);
    if (run.result.status === "failed") {
      process.stderr.write(`${JSON.stringify(run.result)}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify(run.result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
