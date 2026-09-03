export async function handle(request) {
  if (request.phase === "register") return { kind: "provider", pluginId: "provider-golden" };
  throw new Error("unsupported Provider request");
}
