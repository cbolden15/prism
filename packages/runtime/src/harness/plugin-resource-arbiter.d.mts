export class ResourceCapacityError extends Error {
  readonly code: "resource-capacity-exhausted";
}

export interface AllocationResourceLease {
  readonly requestId: string;
  readonly pluginId: string;
  release(): void;
}

export interface PluginResourceArbiter {
  reserveAllocation(identity: { readonly requestId: string; readonly pluginId: string }): AllocationResourceLease;
  runDocker<T>(operation: () => T | Promise<T>): Promise<T>;
  snapshot(): Readonly<{
    liveAllocations: number;
    activeDockerInvocations: number;
    queuedDockerInvocations: number;
  }>;
}

export function createPluginResourceArbiter(options?: {
  readonly maxLiveAllocations?: number;
  readonly maxLiveAllocationsPerPlugin?: number;
  readonly maxConcurrentDockerInvocations?: number;
}): PluginResourceArbiter;
