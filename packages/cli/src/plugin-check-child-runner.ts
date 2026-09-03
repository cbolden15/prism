import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { StaticPluginCheck } from "./plugin-check-static.ts";

const CHILD_RESULT_VERSION = "prism-plugin-check-child-v1";
const CHILD_TIMEOUT_MS = 5_000;
const PROCESS_GROUP_GRACE_MS = 2_000;
const OUTPUT_LIMIT_BYTES = 65_536;
const PROTOCOL_LIMIT_BYTES = 65_536;
const GROUP_POLL_MS = 25;
const CHILD_CLOSE_DRAIN_MS = 500;

export type PluginCheckChildError =
  | "registration-invalid"
  | "fixture-invalid"
  | "fixture-mismatch"
  | "result-invalid"
  | "unexpected-output"
  | "output-limit"
  | "protocol"
  | "protocol-limit"
  | "timeout"
  | "execution"
  | "cleanup-failed";

export type PluginCheckChildResult =
  | { readonly ok: true; readonly operation: string }
  | { readonly ok: false; readonly code: PluginCheckChildError };

type ChildReportedError = Exclude<
  PluginCheckChildError,
  "unexpected-output" | "output-limit" | "timeout" | "cleanup-failed"
>;

interface ChildMessage {
  readonly version: typeof CHILD_RESULT_VERSION;
  readonly status: "ok" | "error";
  readonly pluginId?: string;
  readonly operation?: string;
  readonly code?: ChildReportedError;
}

export interface PluginCheckChildDependencies {
  readonly afterTemporaryHomeCreate?: (root: string) => Promise<void> | void;
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  return actual.length === keys.length
    && actual.every((key) => keys.includes(key))
    && Reflect.ownKeys(record).every((key) => typeof key === "string" && actual.includes(key));
}

function parseChildMessage(value: unknown, pluginId: string): ChildMessage | null {
  if (!isExactRecord(value, ["version", "status", "pluginId", "operation"])) {
    if (!isExactRecord(value, ["version", "status", "code"])) return null;
    if (value.version !== CHILD_RESULT_VERSION || value.status !== "error" || typeof value.code !== "string") return null;
    if (![
      "registration-invalid",
      "fixture-invalid",
      "fixture-mismatch",
      "result-invalid",
      "protocol",
      "protocol-limit",
      "execution",
    ].includes(value.code)) {
      return null;
    }
    return Object.freeze({
      version: CHILD_RESULT_VERSION,
      status: "error",
      code: value.code as ChildReportedError,
    });
  }
  if (
    value.version !== CHILD_RESULT_VERSION
    || value.status !== "ok"
    || value.pluginId !== pluginId
    || typeof value.operation !== "string"
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.operation)
  ) {
    return null;
  }
  return Object.freeze({
    version: CHILD_RESULT_VERSION,
    status: "ok",
    pluginId,
    operation: value.operation,
  });
}

const protocolDecoder = new TextDecoder("utf-8", { fatal: true });

function parseProtocolFrame(bytes: Uint8Array, pluginId: string): ChildMessage | null {
  if (bytes.byteLength === 0 || bytes.at(-1) !== 0x0a) return null;
  let frame: string;
  try {
    frame = protocolDecoder.decode(bytes);
  } catch {
    return null;
  }
  if (frame.indexOf("\n") !== frame.length - 1) return null;
  try {
    return parseChildMessage(JSON.parse(frame.slice(0, -1)), pluginId);
  } catch {
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function groupAbsent(pid: number): boolean {
  if (process.platform === "win32" || pid <= 1) return false;
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    return typeof error === "object" && error !== null && Reflect.get(error, "code") === "ESRCH";
  }
}

async function awaitGroupAbsence(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (groupAbsent(pid)) return true;
    await delay(GROUP_POLL_MS);
  }
  return groupAbsent(pid);
}

function signalGroup(child: ChildProcess, pid: number, signal: NodeJS.Signals): void {
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
    } catch {
      // The absence probe below determines whether the allocation is gone.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // The direct child may have exited while its group remains alive.
  }
}

async function terminateGroup(child: ChildProcess, pid: number): Promise<boolean> {
  if (process.platform === "win32" || pid <= 1) return false;
  signalGroup(child, pid, "SIGTERM");
  if (await awaitGroupAbsence(pid, PROCESS_GROUP_GRACE_MS)) return true;
  signalGroup(child, pid, "SIGKILL");
  return await awaitGroupAbsence(pid, PROCESS_GROUP_GRACE_MS);
}

function childModulePath(): string {
  return fileURLToPath(new URL("./plugin-check-child.js", import.meta.url));
}

async function isolatedEnvironment(
  plugin: StaticPluginCheck,
  dependencies: PluginCheckChildDependencies,
): Promise<{
  readonly root: string;
  readonly pluginRoot: string;
  readonly entrypointPath: string;
  readonly environment: NodeJS.ProcessEnv;
}> {
  const root = await mkdtemp(join(tmpdir(), "prism-plugin-check-home-"));
  try {
    await dependencies.afterTemporaryHomeCreate?.(root);
    const config = join(root, "config");
    const cache = join(root, "cache");
    const data = join(root, "data");
    const state = join(root, "state");
    const pluginRoot = join(root, "plugin");
    for (const path of [config, cache, data, state, pluginRoot]) await mkdir(path, { mode: 0o700 });
    for (const file of plugin.files) {
      const path = join(pluginRoot, file.path);
      if (dirname(path) !== pluginRoot) throw new Error("invalid static plugin snapshot path");
      await writeFile(path, file.contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    return Object.freeze({
      root,
      pluginRoot,
      entrypointPath: join(pluginRoot, plugin.manifest.entrypoint),
      environment: Object.freeze({
        HOME: root,
        PATH: "",
        XDG_CACHE_HOME: cache,
        XDG_CONFIG_HOME: config,
        XDG_DATA_HOME: data,
        XDG_STATE_HOME: state,
      }),
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function outputBytes(chunk: string | Buffer): number {
  return typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
}

export async function runPluginCheckChild(
  plugin: StaticPluginCheck,
  dependencies: PluginCheckChildDependencies = {},
): Promise<PluginCheckChildResult> {
  let isolated: Awaited<ReturnType<typeof isolatedEnvironment>>;
  try {
    isolated = await isolatedEnvironment(plugin, dependencies);
  } catch {
    return { ok: false, code: "cleanup-failed" };
  }

  let result: PluginCheckChildResult;
  try {
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [
        childModulePath(),
        pathToFileURL(isolated.entrypointPath).href,
        plugin.manifest.id,
      ], {
        cwd: isolated.pluginRoot,
        detached: true,
        env: isolated.environment,
        stdio: ["ignore", "pipe", "pipe", "pipe"],
      });
    } catch {
      return { ok: false, code: "execution" };
    }

    const pid = child.pid;
    if (pid === undefined || pid <= 1 || process.platform === "win32") {
      try { child.kill("SIGKILL"); } catch {}
      return { ok: false, code: "cleanup-failed" };
    }

    let stdoutBytes = 0;
    let stderrBytes = 0;
    let protocolBytes = 0;
    let protocolLimit = false;
    let protocolEnded = false;
    let protocolStreamError = false;
    const protocolChunks: Buffer[] = [];
    let timedOut = false;
    let terminated: Promise<boolean> | undefined;
    const requestTermination = (): Promise<boolean> => {
      terminated ??= terminateGroup(child, pid);
      return terminated;
    };
    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdoutBytes += outputBytes(chunk);
      if (stdoutBytes > OUTPUT_LIMIT_BYTES) void requestTermination();
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderrBytes += outputBytes(chunk);
      if (stderrBytes > OUTPUT_LIMIT_BYTES) void requestTermination();
    });
    const protocol = child.stdio[3] as Readable | null;
    if (protocol === null) {
      void requestTermination();
      return { ok: false, code: "protocol" };
    }
    protocol.on("data", (chunk: string | Buffer) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      const available = Math.max(0, PROTOCOL_LIMIT_BYTES - protocolBytes);
      if (available > 0) protocolChunks.push(bytes.subarray(0, available));
      protocolBytes += bytes.byteLength;
      if (protocolBytes > PROTOCOL_LIMIT_BYTES) {
        protocolLimit = true;
        void requestTermination();
      }
    });
    protocol.once("end", () => {
      protocolEnded = true;
    });
    protocol.once("error", () => {
      protocolStreamError = true;
      void requestTermination();
    });

    let closeObserved = false;
    const closed = new Promise<void>((resolve) => {
      child.once("close", () => {
        closeObserved = true;
        resolve();
      });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      void requestTermination();
    }, CHILD_TIMEOUT_MS);
    const completion = await new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly errored: boolean }>((resolve) => {
      let settled = false;
      const settle = (value: { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly errored: boolean }) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", () => settle({ code: null, signal: null, errored: true }));
      child.once("exit", (code, signal) => settle({ code, signal, errored: false }));
    });
    clearTimeout(timer);

    let cleanupConfirmed = groupAbsent(pid);
    if (!cleanupConfirmed) cleanupConfirmed = await requestTermination();
    const streamsClosed = closeObserved || await Promise.race([
      closed.then(() => true),
      delay(CHILD_CLOSE_DRAIN_MS).then(() => false),
    ]);
    if (!streamsClosed) {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      protocol.destroy();
    }
    const reported = !protocolLimit && protocolEnded && !protocolStreamError
      ? parseProtocolFrame(Buffer.concat(protocolChunks, protocolBytes), plugin.manifest.id) ?? undefined
      : undefined;
    if (!cleanupConfirmed || !streamsClosed) {
      result = { ok: false, code: "cleanup-failed" };
    } else if (timedOut) {
      result = { ok: false, code: "timeout" };
    } else if (stdoutBytes > OUTPUT_LIMIT_BYTES || stderrBytes > OUTPUT_LIMIT_BYTES) {
      result = { ok: false, code: "output-limit" };
    } else if (protocolLimit) {
      result = { ok: false, code: "protocol-limit" };
    } else if (stdoutBytes > 0 || stderrBytes > 0) {
      result = { ok: false, code: "unexpected-output" };
    } else if (completion.errored || completion.code !== 0 || completion.signal !== null) {
      result = { ok: false, code: "execution" };
    } else if (!protocolEnded || protocolStreamError || reported === undefined) {
      result = { ok: false, code: "protocol" };
    } else if (reported.status === "error") {
      result = { ok: false, code: reported.code as ChildReportedError };
    } else {
      result = { ok: true, operation: reported.operation as string };
    }
  } finally {
    try {
      await rm(isolated.root, { recursive: true, force: true });
    } catch {
      result = { ok: false, code: "cleanup-failed" };
    }
  }
  return result!;
}
