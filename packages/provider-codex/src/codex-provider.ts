import { spawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  validateProviderRequest,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
} from "@useprism/sdk/provider";

const MAX_CAPTURE_BYTES = 1_000_000;
const MAX_ERROR_CHARS = 4_096;

export interface CodexSpawnChild extends EventEmitter {
  readonly stdin: NodeJS.WritableStream;
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  readonly pid?: number | undefined;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface CodexSpawnOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
  readonly detached: true;
}

export type CodexSpawnProcess = (
  command: string,
  args: readonly string[],
  options: CodexSpawnOptions,
) => CodexSpawnChild;

export interface CodexProviderOptions {
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly spawnProcess?: CodexSpawnProcess;
}

function defaultSpawnProcess(
  command: string,
  args: readonly string[],
  options: CodexSpawnOptions,
): CodexSpawnChild {
  return spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    detached: options.detached,
  });
}

function allowedEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const allowed: Record<string, string> = {};
  for (const key of ["HOME", "PATH", "NODE_OPTIONS"]) {
    if (typeof source[key] === "string") allowed[key] = source[key];
  }
  if (typeof allowed.HOME !== "string" || typeof allowed.PATH !== "string") {
    throw new Error("Codex requires HOME and PATH");
  }
  return allowed;
}

function appendBounded(chunks: Buffer[], bytes: Uint8Array, state: { bytes: number }): void {
  state.bytes += bytes.byteLength;
  if (state.bytes <= MAX_CAPTURE_BYTES) chunks.push(Buffer.from(bytes));
}

function signalProcessGroup(child: CodexSpawnChild): void {
  if (typeof child.pid === "number" && child.pid > 1) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {}
  }
  child.kill?.("SIGKILL");
}

function safeErrorText(bytes: Buffer): string {
  return bytes
    .toString("utf8")
    .replace(/[^\x20-\x7e\n\t]/g, "?")
    .slice(0, MAX_ERROR_CHARS)
    .trim();
}

async function runCodexExec({
  prompt,
  model,
  timeoutMs = 120_000,
  environment = process.env,
  spawnProcess = defaultSpawnProcess,
}: CodexProviderOptions & ProviderRequest): Promise<string> {
  if (typeof prompt !== "string" || prompt.length === 0) throw new TypeError("Codex prompt must be non-empty");
  if (model !== null && (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model))) {
    throw new TypeError("Codex model must be null or a valid model id");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new TypeError("Codex timeout must be between 1 and 600 seconds");
  }

  const workDirectory = mkdtempSync(resolve(tmpdir(), "prism-codex-"));
  const outputPath = resolve(workDirectory, "last-message.txt");
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--output-last-message",
    outputPath,
    ...(model === null ? [] : ["--model", model]),
    "-",
  ];

  try {
    const child = spawnProcess("codex", args, {
      cwd: workDirectory,
      env: allowedEnvironment(environment),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    child.stdout?.on("data", (bytes) => appendBounded(stdout, bytes, stdoutState));
    child.stderr?.on("data", (bytes) => appendBounded(stderr, bytes, stderrState));

    const completion = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        signalProcessGroup(child);
        reject(new Error("codex exec timed out"));
      }, timeoutMs);
      child.once("error", (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({ code, signal });
      });
      child.stdin.end(prompt, "utf8");
    });

    if (stdoutState.bytes > MAX_CAPTURE_BYTES || stderrState.bytes > MAX_CAPTURE_BYTES) {
      signalProcessGroup(child);
      throw new Error("codex exec exceeded its output limit");
    }
    if (completion.code !== 0) {
      const detail = safeErrorText(Buffer.concat(stderr));
      throw new Error(`codex exec failed${detail === "" ? "" : `: ${detail}`}`);
    }

    const message = readFileSync(outputPath);
    if (message.byteLength === 0 || message.byteLength > MAX_CAPTURE_BYTES) {
      throw new Error("codex exec returned an invalid final message");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(message).trim();
    if (text === "") throw new Error("codex exec returned an empty final message");
    return text;
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

export function createCodexProvider(options: CodexProviderOptions = {}): Provider {
  return Object.freeze({
    id: "codex-chatgpt",
    async complete(request: ProviderRequest): Promise<ProviderResponse> {
      const validated = validateProviderRequest(request);
      if (validated === null) throw new TypeError("invalid Codex provider request");
      const text = await runCodexExec({ ...options, ...validated });
      return Object.freeze({
        providerId: "codex-chatgpt",
        model: validated.model,
        text,
      });
    },
  });
}
