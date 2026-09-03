export async function handle(request) {
  if (request.phase === "register") return { kind: "renderer", pluginId: "renderer-golden" };
  throw new Error("unsupported Renderer request");
}
