#!/usr/bin/env node
import { createCodexProvider } from "./index.ts";

const prompt = process.argv.slice(2).join(" ");
if (prompt === "") {
  process.stderr.write('Usage: npm run prism:codex -- "prompt"\n');
  process.exitCode = 2;
} else {
  try {
    const response = await createCodexProvider().complete({ prompt, model: null });
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
