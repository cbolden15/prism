export async function handle(request) {
  if (request.phase === "register") {
    return { kind: "tool", pluginId: "tool-timeout", operations: ["echo"] };
  }
  if (request.phase === "operate" && request.payload.operation === "echo") {
    await new Promise(() => {});
  }
  throw new Error("unsupported Tool request");
}
