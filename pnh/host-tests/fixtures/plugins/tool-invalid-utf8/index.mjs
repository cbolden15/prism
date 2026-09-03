export async function handle(request) {
  if (request.phase === "register") {
    process.stdout.write(Buffer.from([0xc3, 0x28, 0x0a]));
    await new Promise(() => {});
  }
  throw new Error("unsupported Tool request");
}
