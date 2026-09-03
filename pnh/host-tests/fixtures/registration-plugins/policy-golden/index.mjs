export async function handle(request) {
  if (request.phase === "register") return { kind: "policy", pluginId: "policy-golden" };
  if (request.phase === "admit") {
    return { decision: "restrict", catalog: request.payload.effectiveCatalog };
  }
  throw new Error("unsupported Policy request");
}
