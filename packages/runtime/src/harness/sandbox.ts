import { createConnection } from "node:net";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SandboxArgument =
  | JsonValue
  | { kind: "null-prototype-record"; value: Record<string, JsonValue> }
  | { kind: "inherited-record"; inherited: Record<string, JsonValue>; own: Record<string, JsonValue> }
  | { kind: "accessor-record"; key: string; returns: JsonValue; value: Record<string, JsonValue> }
  | { kind: "non-enumerable-record"; hidden: JsonValue; key: string; value: Record<string, JsonValue> };

export interface SandboxCall {
  args: SandboxArgument[];
  entry: string;
  exportName: string;
  port?: {
    argumentIndex: number;
    fixture: "malformed" | "valid";
    name: "sha256";
  };
}

interface WorkerSuccess {
  ok: true;
  value: JsonValue;
}

interface WorkerFailure {
  error: string;
  ok: false;
}

const supervisorSocket = "/tmp/pnh-sandbox-supervisor.sock";

function requireJsonValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("sandbox arguments must contain finite numbers");
    return;
  }
  if (typeof value !== "object") throw new Error("sandbox arguments must be JSON values");
  if (seen.has(value)) throw new Error("sandbox arguments must not contain cycles");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) requireJsonValue(item, seen);
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error("sandbox arguments must not contain symbol keys");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error("sandbox arguments must not contain accessors");
      }
      requireJsonValue(descriptor.value, seen);
    }
  }
  seen.delete(value);
}

function validateRequest(request: SandboxCall): void {
  if (!/^[a-z0-9][a-z0-9./-]*\.ts$/.test(request.entry)) {
    throw new Error("sandbox entry must be a relative TypeScript path");
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(request.exportName)) {
    throw new Error("sandbox exportName must be an identifier");
  }
  if (!Array.isArray(request.args)) throw new Error("sandbox args must be an array");
  for (const argument of request.args) requireJsonValue(argument);
  if (request.port !== undefined) {
    if (
      request.port.name !== "sha256" ||
      !Number.isInteger(request.port.argumentIndex) ||
      request.port.argumentIndex < 0 ||
      request.port.argumentIndex > request.args.length ||
      (request.port.fixture !== "valid" && request.port.fixture !== "malformed")
    ) {
      throw new Error("sandbox port is invalid");
    }
  }
}

function invokeWorker(payload: unknown): Promise<WorkerSuccess> {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection(supervisorSocket);
    let response = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error !== undefined) reject(error);
    };
    const timeout = setTimeout(() => {
      finish(new Error("sandbox supervisor timed out"));
    }, 10_000);

    socket.setEncoding("utf8");
    socket.once("connect", () => socket.end(JSON.stringify(payload)));
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (response.length > 1_000_000) finish(new Error("sandbox supervisor response is too large"));
    });
    socket.once("error", (error) => finish(error));
    socket.once("end", () => {
      if (settled) return;
      try {
        const result = JSON.parse(response) as WorkerSuccess | WorkerFailure;
        if (result.ok !== true) throw new Error(result.error || "sandbox worker failed");
        requireJsonValue(result.value);
        settled = true;
        clearTimeout(timeout);
        resolvePromise(result);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export async function sandboxCall<T extends JsonValue>(request: SandboxCall): Promise<T> {
  validateRequest(request);
  const result = await invokeWorker(request);
  return result.value as T;
}

export async function sandboxWorkerHealth(): Promise<Record<string, string>> {
  const result = await invokeWorker({ kind: "health" });
  if (typeof result.value !== "object" || result.value === null || Array.isArray(result.value)) {
    throw new Error("sandbox health response is invalid");
  }
  return result.value as Record<string, string>;
}

export async function sandboxSupervisorHealth(): Promise<Record<string, string>> {
  const result = await invokeWorker({ kind: "supervisor-health" });
  if (typeof result.value !== "object" || result.value === null || Array.isArray(result.value)) {
    throw new Error("sandbox supervisor health response is invalid");
  }
  return result.value as Record<string, string>;
}
