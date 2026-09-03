#!/usr/bin/env node
import { runCli } from "./cli.ts";
import { runCurrentDeterministicDemo } from "./commands/run.ts";
import { runCurrentOllamaAgent } from "./ollama-agent.ts";

process.exitCode = await runCli({
  arguments: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
  dependencies: {
    runDeterministic: runCurrentDeterministicDemo,
    runOllama: runCurrentOllamaAgent,
    environment: process.env,
    currentWorkingDirectory: () => process.cwd(),
  },
});
