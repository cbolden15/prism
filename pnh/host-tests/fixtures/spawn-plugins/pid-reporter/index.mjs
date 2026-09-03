import { runPluginLoop } from "@useprism/runtime/plugin-runner";

const plugin = {
  async handle(request) {
    if (request.phase === "register") {
      return { kind: "tool", pluginId: "pid-reporter", operations: ["report-pid"] };
    }
    if (request.phase === "operate" && request.payload.operation === "report-pid") {
      return { pid: process.pid };
    }
    throw new Error("unsupported request");
  },
};

await runPluginLoop({ input: process.stdin, output: process.stdout, plugin });
