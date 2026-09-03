import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { CONFIG_VERSION, writePrismConfig } from "../src/config.ts";
import { doctorCommand } from "../src/commands/doctor.ts";
import { runCommand, runCurrentDeterministicDemo } from "../src/commands/run.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const binary = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");

async function makeContext(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const configHome = join(root, "config");
  const stateHome = join(root, "state");
  await Promise.all([workspace, home, configHome, stateHome].map(async (path) => mkdir(path, { recursive: true })));
  return {
    root,
    workspace: await realpath(workspace),
    environment: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: configHome,
      XDG_STATE_HOME: stateHome,
    },
  };
}

test("denied remote doctor and run make zero network/provider calls", async () => {
  const context = await makeContext("prism-doctor-denial-");
  try {
    await writePrismConfig({
      workspace: context.workspace,
      environment: context.environment,
      scope: "project",
      config: {
        version: CONFIG_VERSION,
        provider: "ollama",
        model: "qwen2.5:0.5b",
        endpoint: "http://169.254.169.254",
      },
    });
    let doctorNetworkCalls = 0;
    let stdout = "";
    let stderr = "";
    const doctorCode = await doctorCommand({
      arguments: [],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      workspace: context.workspace,
      environment: context.environment,
      dependencies: {
        nodeVersion: "26.8.1",
        async inspectOllama() {
          doctorNetworkCalls += 1;
          return { models: ["qwen2.5:0.5b"] };
        },
      },
    });
    assert.equal(doctorCode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /remote endpoint not authorized/);
    assert.equal(doctorNetworkCalls, 0);

    let providerCalls = 0;
    stdout = "";
    stderr = "";
    const runCode = await runCommand({
      arguments: ["run remote"],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      dependencies: {
        runDeterministic: runCurrentDeterministicDemo,
        environment: context.environment,
        currentWorkingDirectory: () => context.workspace,
        async runOllama() {
          providerCalls += 1;
          return { status: "failed", code: "unexpected", events: [] };
        },
      },
    });
    assert.equal(runCode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /remote endpoint not authorized/);
    assert.equal(providerCalls, 0);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("doctor succeeds for deterministic config and reports Node failures", async () => {
  const context = await makeContext("prism-doctor-deterministic-");
  try {
    let stdout = "";
    let stderr = "";
    const success = await doctorCommand({
      arguments: [],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      workspace: context.workspace,
      environment: context.environment,
      dependencies: { nodeVersion: "26.8.1" },
    });
    assert.equal(success, 0);
    assert.equal(stderr, "");
    assert.match(stdout, /^Prism doctor: ok\n/);
    assert.match(stdout, /Provider: deterministic\n/);

    stdout = "";
    stderr = "";
    const wrongNode = await doctorCommand({
      arguments: [],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      workspace: context.workspace,
      environment: context.environment,
      dependencies: { nodeVersion: "22.21.0" },
    });
    assert.equal(wrongNode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /Node 26\.8\.1 or newer within major 26 is required/);

    stdout = "";
    stderr = "";
    const unwritable = await doctorCommand({
      arguments: [],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      workspace: context.workspace,
      environment: context.environment,
      dependencies: {
        nodeVersion: "26.8.1",
        async checkWritableDirectory() {
          throw new Error("config location is not writable");
        },
      },
    });
    assert.equal(unwritable, 1);
    assert.equal(stdout, "");
    assert.equal(stderr, "config location is not writable\n");
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("doctor checks Ollama reachability and configured model through a bounded loopback stub", async () => {
  const context = await makeContext("prism-doctor-ollama-");
  let requests = 0;
  let redirectTargetRequests = 0;
  const redirectTarget = createServer((_request, response) => {
    redirectTargetRequests += 1;
    response.end(JSON.stringify({ models: [{ name: "present-model" }] }));
  });
  await new Promise<void>((resolvePromise) => redirectTarget.listen(0, "127.0.0.1", resolvePromise));
  const redirectAddress = redirectTarget.address();
  assert.notEqual(redirectAddress, null);
  assert.equal(typeof redirectAddress, "object");
  const redirectTargetOrigin = `http://127.0.0.1:${(redirectAddress as { port: number }).port}`;
  let responseMode: "valid" | "malformed" | "oversized" | "redirect" = "valid";
  const server = createServer((request, response) => {
    requests += 1;
    assert.equal(request.url, "/api/tags");
    response.setHeader("content-type", "application/json");
    if (responseMode === "redirect") {
      response.statusCode = 302;
      response.setHeader("location", `${redirectTargetOrigin}/api/tags`);
      response.end();
    } else if (responseMode === "malformed") {
      response.end("{");
    } else if (responseMode === "oversized") {
      response.write("x".repeat(600_000));
      response.end("x".repeat(600_000));
    } else {
      response.end(JSON.stringify({ models: [{ name: "present-model" }] }));
    }
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
    await writePrismConfig({
      workspace: context.workspace,
      environment: context.environment,
      scope: "project",
      config: {
        version: CONFIG_VERSION,
        provider: "ollama",
        model: "present-model",
        endpoint,
      },
    });
    const success = await execFileAsync(process.execPath, [binary, "doctor"], {
      cwd: context.workspace,
      env: context.environment,
    });
    assert.equal(success.stderr, "");
    assert.match(success.stdout, /^Prism doctor: ok\n/);
    assert.equal(requests, 1);

    await writePrismConfig({
      workspace: context.workspace,
      environment: context.environment,
      scope: "project",
      config: {
        version: CONFIG_VERSION,
        provider: "ollama",
        model: "missing-model",
        endpoint,
      },
    });
    await assert.rejects(execFileAsync(process.execPath, [binary, "doctor"], {
      cwd: context.workspace,
      env: context.environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stdout"), "");
      assert.equal(Reflect.get(error as object, "stderr"), "model not found; run ollama pull missing-model\n");
      return true;
    });

    await assert.rejects(execFileAsync(process.execPath, [binary, "doctor", "--json"], {
      cwd: context.workspace,
      env: context.environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stderr"), "");
      const output = String(Reflect.get(error as object, "stdout"));
      assert.equal(output.trim().includes("\n"), false);
      const parsed = JSON.parse(output);
      assert.equal(parsed.status, "failed");
      assert.equal(parsed.error, "model not found; run ollama pull missing-model");
      return true;
    });

    responseMode = "oversized";
    await assert.rejects(execFileAsync(process.execPath, [binary, "doctor"], {
      cwd: context.workspace,
      env: context.environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.match(String(Reflect.get(error as object, "stderr")), /Ollama response exceeded 1048576 bytes/);
      return true;
    });

    responseMode = "malformed";
    await assert.rejects(execFileAsync(process.execPath, [binary, "doctor"], {
      cwd: context.workspace,
      env: context.environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.equal(Reflect.get(error as object, "stderr"), "Ollama returned malformed JSON\n");
      return true;
    });

    responseMode = "redirect";
    await assert.rejects(execFileAsync(process.execPath, [binary, "doctor"], {
      cwd: context.workspace,
      env: context.environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 1);
      assert.match(String(Reflect.get(error as object, "stderr")), /Ollama unreachable/);
      return true;
    });
    assert.equal(redirectTargetRequests, 0);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => server.close((error) => error === undefined ? resolvePromise() : rejectPromise(error)));
    await new Promise<void>((resolvePromise, rejectPromise) => redirectTarget.close((error) => error === undefined ? resolvePromise() : rejectPromise(error)));
    await rm(context.root, { recursive: true, force: true });
  }
});

test("doctor usage errors exit 2 without output on stdout", async () => {
  const context = await makeContext("prism-doctor-usage-");
  try {
    for (const arguments_ of [
      ["--yes"],
      ["--allow-remote-endpoint"],
      ["--allow-remote-endpoint", "https://example.com"],
      ["extra"],
    ]) {
      await assert.rejects(execFileAsync(process.execPath, [binary, "doctor", ...arguments_], {
        cwd: context.workspace,
        env: context.environment,
      }), (error: unknown) => {
        assert.equal(Reflect.get(error as object, "code"), 2);
        assert.equal(Reflect.get(error as object, "stdout"), "");
        return true;
      });
    }
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});
