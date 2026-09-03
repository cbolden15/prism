export function createFaultCell(identity) {
  if (identity === null || typeof identity !== "object") throw new TypeError("fault cell identity is required");
  const { requestId, pluginId } = identity;
  if (typeof requestId !== "string" || typeof pluginId !== "string") {
    throw new TypeError("fault cell identity is required");
  }

  let chain = Promise.resolve();
  let disposed = false;

  return Object.freeze({
    requestId,
    pluginId,
    run(operation) {
      if (disposed) return Promise.reject(new Error("fault cell is disposed"));
      const result = chain.then(operation, operation);
      chain = result.then(() => undefined, () => undefined);
      return result;
    },
    flush() {
      return chain;
    },
    // Releases the cell as a routing target and nothing else: work already
    // accepted by run() still runs, and flush() still drains it.
    dispose() {
      disposed = true;
    },
  });
}
