export async function handle(request) {
  if (request.phase === "register") return { kind: "memory", pluginId: "memory-golden" };
  throw new Error("unsupported Memory request");
}
