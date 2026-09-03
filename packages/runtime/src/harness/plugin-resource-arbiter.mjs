import {
  MAX_CONCURRENT_DOCKER_INVOCATIONS,
  MAX_LIVE_ALLOCATIONS,
  MAX_LIVE_ALLOCATIONS_PER_PLUGIN,
} from "@useprism/sdk/protocol/resource-bounds";

const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class ResourceCapacityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResourceCapacityError";
    this.code = "resource-capacity-exhausted";
  }
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateIdentity(identity) {
  if (
    identity === null ||
    typeof identity !== "object" ||
    typeof identity.requestId !== "string" ||
    !REQUEST_ID_RE.test(identity.requestId) ||
    typeof identity.pluginId !== "string" ||
    !PLUGIN_ID_RE.test(identity.pluginId)
  ) {
    throw new TypeError("invalid resource reservation identity");
  }
}

export function createPluginResourceArbiter(options = {}) {
  const maxLiveAllocations = positiveInteger(
    options.maxLiveAllocations ?? MAX_LIVE_ALLOCATIONS,
    "maxLiveAllocations",
  );
  const maxLiveAllocationsPerPlugin = positiveInteger(
    options.maxLiveAllocationsPerPlugin ?? MAX_LIVE_ALLOCATIONS_PER_PLUGIN,
    "maxLiveAllocationsPerPlugin",
  );
  const maxConcurrentDockerInvocations = positiveInteger(
    options.maxConcurrentDockerInvocations ?? MAX_CONCURRENT_DOCKER_INVOCATIONS,
    "maxConcurrentDockerInvocations",
  );
  if (maxLiveAllocationsPerPlugin > maxLiveAllocations) {
    throw new TypeError("per-plugin allocation limit cannot exceed the aggregate limit");
  }

  const allocations = new Map();
  const pluginCounts = new Map();
  const dockerWaiters = [];
  let activeDockerInvocations = 0;

  function reserveAllocation(identity) {
    validateIdentity(identity);
    const existing = allocations.get(identity.requestId);
    if (existing !== undefined) {
      if (existing.pluginId !== identity.pluginId) throw new Error("allocation reservation identity conflict");
      return existing.lease;
    }
    if (allocations.size >= maxLiveAllocations) {
      throw new ResourceCapacityError("aggregate live-allocation capacity exhausted");
    }
    const pluginCount = pluginCounts.get(identity.pluginId) ?? 0;
    if (pluginCount >= maxLiveAllocationsPerPlugin) {
      throw new ResourceCapacityError("plugin live-allocation capacity exhausted");
    }

    let released = false;
    const lease = Object.freeze({
      requestId: identity.requestId,
      pluginId: identity.pluginId,
      release() {
        if (released) return;
        released = true;
        if (allocations.get(identity.requestId)?.lease !== lease) return;
        allocations.delete(identity.requestId);
        const nextCount = (pluginCounts.get(identity.pluginId) ?? 1) - 1;
        if (nextCount === 0) pluginCounts.delete(identity.pluginId);
        else pluginCounts.set(identity.pluginId, nextCount);
      },
    });
    allocations.set(identity.requestId, { pluginId: identity.pluginId, lease });
    pluginCounts.set(identity.pluginId, pluginCount + 1);
    return lease;
  }

  function releaseDockerSlot() {
    const next = dockerWaiters.shift();
    if (next !== undefined) {
      next();
      return;
    }
    activeDockerInvocations -= 1;
  }

  function acquireDockerSlot() {
    if (activeDockerInvocations < maxConcurrentDockerInvocations) {
      activeDockerInvocations += 1;
      return Promise.resolve();
    }
    return new Promise((resolvePromise) => dockerWaiters.push(resolvePromise));
  }

  async function runDocker(operation) {
    if (typeof operation !== "function") throw new TypeError("Docker operation must be a function");
    await acquireDockerSlot();
    try {
      return await operation();
    } finally {
      releaseDockerSlot();
    }
  }

  return Object.freeze({
    reserveAllocation,
    runDocker,
    snapshot() {
      return Object.freeze({
        liveAllocations: allocations.size,
        activeDockerInvocations,
        queuedDockerInvocations: dockerWaiters.length,
      });
    },
  });
}
