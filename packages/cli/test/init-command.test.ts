import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { prismTrustPath } from "../src/trust.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const binary = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");

async function isolatedProcessTest(
  run: (context: {
    root: string;
    workspace: string;
    home: string;
    configHome: string;
    stateHome: string;
    environment: NodeJS.ProcessEnv;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "prism-init-"));
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const configHome = join(root, "xdg-config");
  const stateHome = join(root, "xdg-state");
  await Promise.all([workspace, home, configHome, stateHome].map(
    async (path) => mkdir(path, { recursive: true }),
  ));
  try {
    await run({
      root,
      workspace,
      home,
      configHome,
      stateHome,
      environment: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: configHome,
        XDG_STATE_HOME: stateHome,
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("init writes deterministic user config non-interactively inside isolated XDG config", async () => {
  await isolatedProcessTest(async ({ workspace, configHome, environment }) => {
    const execution = await execFileAsync(process.execPath, [
      binary,
      "init",
      "--provider",
      "deterministic",
      "--scope",
      "user",
      "--yes",
    ], { cwd: workspace, env: environment });

    assert.equal(execution.stderr, "");
    assert.match(execution.stdout, /^Initialized user config for deterministic\./);
    const path = join(configHome, "prism", "config.json");
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      version: "prism-config-v1",
      provider: "deterministic",
    });
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    await assert.rejects(access(join(workspace, ".prism", "config.json")));
  });
});

test("init writes normalized Ollama project config from explicit non-interactive inputs", async () => {
  await isolatedProcessTest(async ({ workspace, configHome, environment }) => {
    const execution = await execFileAsync(process.execPath, [
      binary,
      "init",
      "--provider",
      "ollama",
      "--model",
      "qwen2.5:0.5b",
      "--endpoint",
      "HTTP://LOCALHOST:11434/",
      "--scope",
      "project",
      "--yes",
    ], { cwd: workspace, env: environment });

    assert.equal(execution.stderr, "");
    assert.match(execution.stdout, /^Initialized project config for ollama\./);
    assert.deepEqual(JSON.parse(await readFile(
      join(workspace, ".prism", "config.json"),
      "utf8",
    )), {
      version: "prism-config-v1",
      provider: "ollama",
      model: "qwen2.5:0.5b",
      endpoint: "http://localhost:11434",
    });
    await assert.rejects(access(join(configHome, "prism", "config.json")));
  });
});

test("--yes remains restricted to explicit init", async () => {
  await isolatedProcessTest(async ({ workspace, environment }) => {
    await assert.rejects(execFileAsync(process.execPath, [
      binary,
      "run",
      "--yes",
      "Count the words in: one two three",
    ], { cwd: workspace, env: environment }), (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.equal(Reflect.get(error as object, "code"), 2);
      assert.equal(Reflect.get(error as object, "stdout"), "");
      assert.match(String(Reflect.get(error as object, "stderr")), /^Unknown option: --yes/);
      return true;
    });
  });
});

test("remote init requires exact valued authorization and persists scoped trust in user config", async () => {
  await isolatedProcessTest(async ({ workspace, environment }) => {
    const baseArguments = [
      binary,
      "init",
      "--provider",
      "ollama",
      "--model",
      "remote-model",
      "--endpoint",
      "https://ollama.example",
      "--scope",
      "project",
    ];
    await assert.rejects(execFileAsync(process.execPath, [...baseArguments, "--yes"], {
      cwd: workspace,
      env: environment,
    }), (error: unknown) => {
      assert.equal(Reflect.get(error as object, "code"), 2);
      assert.match(String(Reflect.get(error as object, "stderr")), /--allow-remote-endpoint/);
      return true;
    });

    const execution = await execFileAsync(process.execPath, [
      ...baseArguments,
      "--yes",
      "--allow-remote-endpoint",
      "https://ollama.example",
    ], { cwd: workspace, env: environment });
    assert.equal(execution.stderr, "");
    const trust = JSON.parse(await readFile(prismTrustPath({ environment }), "utf8"));
    assert.equal(trust.version, "prism-trust-v1");
    assert.deepEqual(trust.origins, []);
    assert.equal(trust.projects.length, 1);
    assert.equal(trust.projects[0].origin, "https://ollama.example");
    assert.match(trust.projects[0].configSha256, /^[0-9a-f]{64}$/);
  });
});

test("init invalid combinations fail closed with usage exit 2", async () => {
  await isolatedProcessTest(async ({ workspace, environment }) => {
    const cases = [
      ["--provider", "ollama", "--yes"],
      ["--provider", "ollama", "--model", ""],
      ["--provider", "ollama", "--model", "   "],
      ["--provider", "ollama", "--model", "line\nbreak"],
      ["--provider", "ollama", "--model", "x".repeat(257)],
      ["--provider", "deterministic", "--endpoint", "http://127.0.0.1:11434"],
      ["--scope", "project", "--scope", "user"],
      ["unexpected"],
    ];
    for (const arguments_ of cases) {
      await assert.rejects(execFileAsync(process.execPath, [binary, "init", ...arguments_], {
        cwd: workspace,
        env: environment,
      }), (error: unknown) => {
        assert.equal(Reflect.get(error as object, "code"), 2);
        assert.equal(Reflect.get(error as object, "stdout"), "");
        assert.match(String(Reflect.get(error as object, "stderr")), /Usage: prism init/);
        return true;
      });
    }
  });
});
