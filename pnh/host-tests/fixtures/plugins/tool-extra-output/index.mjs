export async function handle(request) {
  if (request.phase === "register") {
    const registration = { kind: "tool", operations: ["echo"], pluginId: "tool-extra-output" };
    process.stdout.write(`${JSON.stringify({
      v: 1,
      type: "response",
      requestId: request.requestId,
      seq: request.seq,
      ok: true,
      result: registration,
      error: null,
    })}\n`);
    return registration;
  }
  throw new Error("unsupported Tool request");
}
