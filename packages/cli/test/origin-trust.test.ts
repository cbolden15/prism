import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { CONFIG_VERSION, prismConfigPaths, writePrismConfig } from "../src/config.ts";
import { isLoopbackOrigin, normalizeOrigin } from "../src/origin.ts";
import {
  TRUST_VERSION,
  authorizeEndpoint,
  grantEndpointTrust,
  prismTrustPath,
} from "../src/trust.ts";

test("origin normalization is exact and loopback classification never relies on DNS", () => {
  assert.equal(normalizeOrigin("HTTP://LOCALHOST:80/"), "http://localhost");
  assert.equal(normalizeOrigin("http://127.1:11434"), "http://127.0.0.1:11434");
  assert.equal(normalizeOrigin("https://EXAMPLE.com:443/"), "https://example.com");
  assert.equal(isLoopbackOrigin("http://localhost:11434"), true);
  assert.equal(isLoopbackOrigin("http://api.localhost:11434"), true);
  assert.equal(isLoopbackOrigin("http://127.255.255.254:11434"), true);
  assert.equal(isLoopbackOrigin("http://[::1]:11434"), true);
  assert.equal(isLoopbackOrigin("http://169.254.169.254"), false);
  assert.equal(isLoopbackOrigin("http://metadata.google.internal"), false);
  assert.equal(isLoopbackOrigin("http://ollama.internal:11434"), false);

  for (const invalid of [
    "not-a-url",
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com/api",
    "https://example.com?query=1",
    "https://example.com/#fragment",
    "http://localhost.:11434",
  ]) {
    assert.throws(() => normalizeOrigin(invalid), /HTTP\(S\) origin/);
  }
});

test("remote authorization requires the exact normalized valued flag", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-origin-flag-"));
  try {
    const workspace = await realpath(root);
    const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config") };
    const base = {
      environment,
      endpoint: "https://example.com",
      workspace,
      endpointSource: "explicit" as const,
    };
    await assert.rejects(authorizeEndpoint(base), /remote endpoint not authorized/);
    assert.equal((await authorizeEndpoint({
      ...base,
      allowRemoteEndpoint: "https://example.com",
    })).method, "flag");
    await assert.rejects(authorizeEndpoint({
      ...base,
      allowRemoteEndpoint: "https://EXAMPLE.com:443",
    }), /must equal the normalized origin/);
    await assert.rejects(authorizeEndpoint({
      ...base,
      allowRemoteEndpoint: "https://other.example",
    }), /remote endpoint not authorized/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project trust binds workspace and exact config bytes; user trust binds origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-trust-scope-"));
  try {
    const workspace = join(root, "workspace");
    const otherWorkspace = join(root, "other-workspace");
    await Promise.all([workspace, otherWorkspace].map(async (path) => mkdir(path, { recursive: true })));
    const canonicalWorkspace = await realpath(workspace);
    const canonicalOther = await realpath(otherWorkspace);
    const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config") };
    const config = {
      version: CONFIG_VERSION,
      provider: "ollama" as const,
      model: "qwen2.5:0.5b",
      endpoint: "https://ollama.example",
    };
    const projectConfigPath = await writePrismConfig({
      workspace: canonicalWorkspace,
      environment,
      scope: "project",
      config,
    });
    await grantEndpointTrust({
      environment,
      scope: "project",
      origin: config.endpoint,
      workspace: canonicalWorkspace,
      projectConfigPath,
    });
    assert.equal((await authorizeEndpoint({
      environment,
      endpoint: config.endpoint,
      workspace: canonicalWorkspace,
      endpointSource: "project",
      projectConfigPath,
    })).method, "project-trust");

    const otherProjectConfigPath = await writePrismConfig({
      workspace: canonicalOther,
      environment,
      scope: "project",
      config,
    });
    await assert.rejects(authorizeEndpoint({
      environment,
      endpoint: config.endpoint,
      workspace: canonicalOther,
      endpointSource: "project",
      projectConfigPath: otherProjectConfigPath,
    }), /remote endpoint not authorized/);
    await writeFile(projectConfigPath, `${await readFile(projectConfigPath, "utf8")} `, "utf8");
    await assert.rejects(authorizeEndpoint({
      environment,
      endpoint: config.endpoint,
      workspace: canonicalWorkspace,
      endpointSource: "project",
      projectConfigPath,
    }), /remote endpoint not authorized/);

    await grantEndpointTrust({ environment, scope: "user", origin: config.endpoint });
    assert.equal((await authorizeEndpoint({
      environment,
      endpoint: config.endpoint,
      workspace: canonicalOther,
      endpointSource: "project",
      projectConfigPath: otherProjectConfigPath,
    })).method, "user-trust");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown trust versions fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-trust-version-"));
  try {
    const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config") };
    const path = prismTrustPath({ environment });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ version: "prism-trust-v2", origins: [], projects: [] })}\n`, "utf8");
    await assert.rejects(authorizeEndpoint({
      environment,
      endpoint: "https://example.com",
      workspace: root,
      endpointSource: "user",
    }), /unsupported trust version/);
    assert.equal(TRUST_VERSION, "prism-trust-v1");
    assert.equal(prismConfigPaths({ workspace: root, environment }).user, join(environment.XDG_CONFIG_HOME, "prism", "config.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
