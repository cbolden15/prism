#!/usr/bin/env node
import { runLocalTextStats } from "./local-text-stats.ts";

const input = process.argv.slice(2).join(" ");
if (input === "") {
  process.stderr.write('Usage: npm run prism:example -- "text to analyze"\n');
  process.exitCode = 2;
} else {
  try {
    const result = await runLocalTextStats(input);
    process.stdout.write(`${JSON.stringify(result.stats, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
