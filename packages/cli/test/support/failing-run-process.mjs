import { runCli } from "../../dist/cli.js";

process.exitCode = await runCli({
  arguments: ["run", "--json", "deterministic failure"],
  stdout: process.stdout,
  stderr: process.stderr,
  dependencies: {
    async runDeterministic() {
      return { status: "failed", code: "policy-denied", events: [] };
    },
    environment: process.env,
    currentWorkingDirectory: () => process.cwd(),
  },
});
