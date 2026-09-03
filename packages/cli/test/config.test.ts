import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  CONFIG_VERSION,
  parsePrismConfig,
  prismConfigPaths,
  resolvePrismConfig,
} from "../src/config.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

test("config paths use the admitted workspace and isolated HOME/XDG inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-config-paths-"));
  try {
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const xdgConfigHome = join(root, "xdg-config");

    assert.deepEqual(prismConfigPaths({
      workspace,
      environment: { HOME: home, XDG_CONFIG_HOME: xdgConfigHome },
    }), {
      project: join(workspace, ".prism", "config.json"),
      user: join(xdgConfigHome, "prism", "config.json"),
    });

    assert.equal(prismConfigPaths({
      workspace,
      environment: { HOME: home },
    }).user, join(home, ".config", "prism", "config.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config resolution applies explicit flags, project, user, then deterministic defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-config-precedence-"));
  try {
    const workspace = join(root, "workspace");
    const environment = {
      HOME: join(root, "home"),
      XDG_CONFIG_HOME: join(root, "xdg-config"),
    };
    const paths = prismConfigPaths({ workspace, environment });
    const userConfig = {
      version: CONFIG_VERSION,
      provider: "ollama",
      model: "user-model",
      endpoint: "http://127.0.0.1:11434",
    } as const;
    const projectConfig = {
      version: CONFIG_VERSION,
      provider: "ollama",
      model: "project-model",
      endpoint: "http://localhost:11434",
    } as const;
    await writeJson(paths.user, userConfig);
    await writeJson(paths.project, projectConfig);

    const project = await resolvePrismConfig({ workspace, environment });
    assert.equal(project.source, "project");
    assert.equal(project.endpointSource, "project");
    assert.deepEqual(project.config, projectConfig);

    const explicitModel = await resolvePrismConfig({
      workspace,
      environment,
      explicit: { model: "flag-model" },
    });
    assert.equal(explicitModel.source, "explicit");
    assert.equal(explicitModel.endpointSource, "project");
    assert.deepEqual(explicitModel.config, { ...projectConfig, model: "flag-model" });

    const explicit = await resolvePrismConfig({
      workspace,
      environment,
      explicit: { provider: "deterministic" },
    });
    assert.equal(explicit.source, "explicit");
    assert.equal(explicit.endpointSource, null);
    assert.deepEqual(explicit.config, {
      version: CONFIG_VERSION,
      provider: "deterministic",
    });

    await unlink(paths.project);
    const user = await resolvePrismConfig({ workspace, environment });
    assert.equal(user.source, "user");
    assert.deepEqual(user.config, userConfig);

    await unlink(paths.user);
    const fallback = await resolvePrismConfig({ workspace, environment });
    assert.equal(fallback.source, "default");
    assert.deepEqual(fallback.config, {
      version: CONFIG_VERSION,
      provider: "deterministic",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config parsing rejects malformed, unknown-version, and extra-field data", () => {
  assert.throws(() => parsePrismConfig("{"), /malformed JSON/);
  assert.throws(() => parsePrismConfig(JSON.stringify({
    version: "prism-config-v2",
    provider: "deterministic",
  })), /unsupported config version/);
  assert.throws(() => parsePrismConfig(JSON.stringify({
    version: CONFIG_VERSION,
    provider: "deterministic",
    token: "must-not-be-stored",
  })), /unknown config field/);
  assert.throws(() => parsePrismConfig(JSON.stringify({
    version: CONFIG_VERSION,
    provider: "ollama",
    model: "",
    endpoint: "not-a-url",
  })), /model/);
});

test("config resolution rejects symlinked config files", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-config-symlink-"));
  try {
    const workspace = join(root, "workspace");
    const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config") };
    const paths = prismConfigPaths({ workspace, environment });
    const outside = join(root, "outside.json");
    await writeJson(outside, { version: CONFIG_VERSION, provider: "deterministic" });
    await mkdir(resolve(paths.project, ".."), { recursive: true });
    await symlink(outside, paths.project);
    await assert.rejects(resolvePrismConfig({ workspace, environment }), /config path is unsafe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config resolution rejects a symlinked project config directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-config-directory-symlink-"));
  try {
    const workspace = join(root, "workspace");
    const outside = join(root, "outside-prism");
    const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config") };
    await mkdir(workspace, { recursive: true });
    await writeJson(join(outside, "config.json"), { version: CONFIG_VERSION, provider: "deterministic" });
    await symlink(outside, join(workspace, ".prism"));
    await assert.rejects(resolvePrismConfig({ workspace, environment }), /project config directory is unsafe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
