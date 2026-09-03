export interface FaultCellIdentity {
  readonly requestId: string;
  readonly pluginId: string;
}

export interface FaultCell {
  readonly requestId: string;
  readonly pluginId: string;
  run<T>(operation: () => T | PromiseLike<T>): Promise<T>;
  flush(): Promise<void>;
  dispose(): void;
}

export function createFaultCell(identity: FaultCellIdentity): FaultCell;
