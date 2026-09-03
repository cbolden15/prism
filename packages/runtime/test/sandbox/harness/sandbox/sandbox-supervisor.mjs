import { spawn } from "node:child_process";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";

const manifestText = readFileSync(3, "utf8");
const manifest = JSON.parse(manifestText);
const socketPath = "/tmp/pnh-sandbox-supervisor.sock";
const workerPath = "/sandbox/packages/runtime/test/sandbox/harness/sandbox-worker.mjs";
const preloadPath = "/sandbox/packages/runtime/test/sandbox/harness/sandbox/core-loader-preload.mjs";
const maxMessageBytes = 1_000_000;

function workerEnvironment() {
  return {
    HOME: "/tmp",
    NODE_OPTIONS: "--disable-proto=throw",
    NODE_V8_COVERAGE: "/coverage/raw",
    PATH: process.env.PATH,
  };
}

function invokeWorker(request) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["--disallow-code-generation-from-strings", "--import", preloadPath, workerPath],
      {
        env: workerEnvironment(),
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) reject(error);
      else resolvePromise(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("sandbox worker timed out"));
    }, 10_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxMessageBytes) {
        child.kill("SIGKILL");
        finish(new Error("sandbox worker output is too large"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > maxMessageBytes) {
        child.kill("SIGKILL");
        finish(new Error("sandbox worker error output is too large"));
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error(stderr.trim() || `sandbox worker exited with ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.ok !== true) throw new Error("sandbox worker returned an invalid result");
        finish(undefined, result);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdio[3].end(manifestText);
    child.stdin.end(JSON.stringify(request));
  });
}

function writeResponse(socket, response) {
  socket.end(JSON.stringify(response));
}

try {
  rmSync(socketPath, { force: true });
} catch {}

const server = createServer({ allowHalfOpen: true }, (socket) => {
  socket.setEncoding("utf8");
  let requestText = "";
  socket.on("data", (chunk) => {
    requestText += chunk;
    if (requestText.length > maxMessageBytes) socket.destroy(new Error("sandbox request is too large"));
  });
  socket.once("end", async () => {
    try {
      const request = JSON.parse(requestText);
      if (request.kind === "supervisor-health") {
        writeResponse(socket, {
          ok: true,
          value: { manifestTransport: "fd-memory", uid: String(process.getuid()) },
        });
        return;
      }
      writeResponse(socket, await invokeWorker(request));
    } catch (error) {
      writeResponse(socket, {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  });
});

function close() {
  server.close(() => {
    rmSync(socketPath, { force: true });
    process.exit(0);
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
server.listen(socketPath, () => {
  chmodSync(socketPath, 0o666);
  process.stdout.write("ready\n");
});
