import { echo } from "./tool.mjs";

export async function handle(request) {
  if (request.phase === "register") {
    return { kind: "tool", pluginId: "tool-golden", operations: ["echo"] };
  }
  if (request.phase === "operate" && request.payload.operation === "echo") {
    return echo(request.payload.input);
  }
  throw new Error("unsupported Tool request");
}
