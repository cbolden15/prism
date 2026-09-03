import { runPluginLoop } from "@useprism/runtime/plugin-runner";

function analyzeText(input) {
  if (typeof input !== "string") throw new TypeError("analyze-text input must be a string");
  const trimmed = input.trim();
  return {
    text: input,
    characters: [...input].length,
    words: trimmed === "" ? 0 : trimmed.split(/\s+/u).length,
    lines: input === "" ? 0 : input.split(/\r\n|\r|\n/u).length,
  };
}

const plugin = {
  async handle(request) {
    if (request.phase === "register") {
      return { kind: "tool", pluginId: "text-stats", operations: ["analyze-text"] };
    }
    if (request.phase === "operate" && request.payload.operation === "analyze-text") {
      return analyzeText(request.payload.input);
    }
    throw new Error("unsupported text-stats request");
  },
};

await runPluginLoop({ input: process.stdin, output: process.stdout, plugin });
