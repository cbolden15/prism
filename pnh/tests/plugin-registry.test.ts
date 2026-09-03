import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
import { admitRegistryBytes, resolveAdmittedPlugin } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { generatePluginRegistry, generatePluginRegistryFromCapturedBytes } from "@useprism/sdk/node/registry";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(testsDirectory, "fixtures", "plugins");
const DIGESTS = {
  "tool-golden": {
    runnerDigest: "a".repeat(64),
    imageDigest: "b".repeat(64),
    profileDigest: "c".repeat(64),
  },
};
const CATALOG = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [{
    id: "tool-operation",
    limit: { schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled: true },
  }],
};

const LIMITED_CATALOG = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [
    {
      id: "model-calls",
      limit: { schema: "integer-max" as const, version: "pnh-capability-limit-v1" as const, max: 2 },
    },
  ],
};

function generate(pluginsRoot = fixturesRoot) {
  return generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog: CATALOG,
    artifactCommitments: DIGESTS,
  });
}

function capturedGolden() {
  const pluginRoot = join(fixturesRoot, "tool-golden");
  return {
    environment: "production" as const,
    capabilityCatalog: CATALOG,
    artifactCommitments: DIGESTS,
    plugins: [{
      pluginId: "tool-golden",
      manifestBytes: new Uint8Array(readFileSync(join(pluginRoot, "manifest.json"))),
      runtimeFiles: ["index.mjs", "tool.mjs"].map((name) => ({
        name,
        bytes: new Uint8Array(readFileSync(join(pluginRoot, name))),
      })),
    }],
  };
}

function mutableFixture(): { root: string; pluginsRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "pnh-plugin-registry-"));
  const pluginsRoot = join(root, "plugins");
  cpSync(fixturesRoot, pluginsRoot, { recursive: true });
  return { root, pluginsRoot };
}

function artifactCommitments(pluginIds: readonly string[]) {
  return Object.fromEntries(pluginIds.map((pluginId) => [pluginId, {
    runnerDigest: "a".repeat(64),
    imageDigest: "b".repeat(64),
    profileDigest: "c".repeat(64),
  }]));
}

function writeFixturePlugin(pluginsRoot: string, pluginId: string): void {
  const directory = join(pluginsRoot, pluginId);
  mkdirSync(directory);
  writeFileSync(join(directory, "index.mjs"), "export default true;\n");
  writeFileSync(join(directory, "manifest.json"), `${JSON.stringify({
    id: pluginId,
    version: "1.0.0",
    apiVersion: 1,
    kind: "tool",
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: [],
    license: { spdxId: "MIT", holder: "PNH" },
  }, null, 2)}\n`);
}

test("the non-empty Tool fixture generates deterministic admissible registry bytes", () => {
  const first = generate();
  const second = generate();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(Buffer.from(first.bytes).equals(Buffer.from(second.bytes)), true);
  assert.equal(first.registryDigest, second.registryDigest);
  assert.deepEqual(first.registry.plugins.map((plugin) => plugin.id), ["tool-golden"]);

  const admitted = admitRegistryBytes(first.bytes, first.registryDigest);
  assert.equal(admitted.ok, true);
  if (!admitted.ok) return;
  const plugin = resolveAdmittedPlugin(admitted.ticket, "tool-golden");
  assert.ok(plugin);
  assert.deepEqual(plugin.files, ["index.mjs", "tool.mjs"]);
  assert.match(plugin.manifestDigest, /^[0-9a-f]{64}$/);
  assert.match(plugin.sourceDigest, /^[0-9a-f]{64}$/);
  assert.match(plugin.versionDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(plugin.compatibility, { kernelApiVersion: "pnh-kernel-v1" });
  assert.deepEqual(plugin.license, { spdxId: "MIT", holder: "PNH" });
});

test("captured plugin bytes generate the same immutable registry and reject a closed input set", () => {
  const disk = generate();
  const captured = { ...capturedGolden(), capabilityCatalog: structuredClone(CATALOG) };
  const pure = generatePluginRegistryFromCapturedBytes(captured);
  assert.deepEqual(pure, disk);
  assert.equal(pure.ok, true);
  if (!pure.ok) return;

  const plugin = pure.registry.plugins[0];
  assert.ok(plugin);
  assert.equal(plugin.manifestDigest, "fe9783007cef66f8cd7ff2fb7a3160f1237244cce4ea3d5acf6ba4277cabf6fb");
  assert.equal(plugin.sourceDigest, "0cc59ea7f1a889edc71a6a3a81cba031e35fdb947656967fbde7407c99b4c600");
  assert.equal(plugin.versionDigest, "c2e53d24bfe4bc4ddc4c76569a145a1335e72f580b20bc1067ae02c7771ce561");
  assert.equal(pure.registryDigest, "4e4c7580711017807691abb4e29014f1aa1438b5a04d89627233ba1f4b12785d");
  assert.equal(pure.bytes.byteLength, 1131);

  const expectedBytes = new Uint8Array(pure.bytes);
  captured.plugins[0]?.manifestBytes.fill(0);
  captured.plugins[0]?.runtimeFiles[0]?.bytes.fill(0);
  const capturedLimit = captured.capabilityCatalog.capabilities[0]?.limit;
  if (capturedLimit?.schema === "boolean-gate") capturedLimit.enabled = false;
  assert.deepEqual(pure.bytes, expectedBytes);
  assert.equal(pure.registry.capabilityCatalog.capabilities[0]?.limit.schema, "boolean-gate");
  assert.equal(
    pure.registry.capabilityCatalog.capabilities[0]?.limit.schema === "boolean-gate"
      ? pure.registry.capabilityCatalog.capabilities[0].limit.enabled
      : false,
    true,
  );

  const mutated = capturedGolden();
  mutated.plugins[0]?.runtimeFiles[1]?.bytes.set([mutated.plugins[0].runtimeFiles[1].bytes[0]! ^ 1]);
  const mutatedResult = generatePluginRegistryFromCapturedBytes(mutated);
  assert.equal(mutatedResult.ok, true);
  if (mutatedResult.ok) {
    assert.notEqual(mutatedResult.registry.plugins[0]?.sourceDigest, plugin.sourceDigest);
    assert.notEqual(mutatedResult.registryDigest, pure.registryDigest);
  }

  const duplicate = capturedGolden();
  duplicate.plugins.push(duplicate.plugins[0]!);
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(duplicate), {
    ok: false,
    error: { code: "registry-schema" },
  });

  const empty = capturedGolden();
  empty.plugins = [];
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(empty), {
    ok: false,
    error: { code: "empty-registry" },
  });

  const extraCommitment = {
    ...capturedGolden(),
    artifactCommitments: { ...DIGESTS, extra: DIGESTS["tool-golden"] },
  };
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(extraCommitment), {
    ok: false,
    error: { code: "registry-schema" },
  });

  const unorderedFiles = capturedGolden();
  unorderedFiles.plugins[0]?.runtimeFiles.reverse();
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(unorderedFiles), {
    ok: false,
    error: { code: "source-tree", pluginId: "tool-golden" },
  });

  const duplicateRuntime = capturedGolden();
  duplicateRuntime.plugins[0]?.runtimeFiles.push(duplicateRuntime.plugins[0].runtimeFiles[0]!);
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(duplicateRuntime), {
    ok: false,
    error: { code: "source-tree", pluginId: "tool-golden" },
  });

  const extraneousRuntime = capturedGolden();
  extraneousRuntime.plugins[0]!.runtimeFiles[1]!.name = "extra.mjs";
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(extraneousRuntime), {
    ok: false,
    error: { code: "source-tree", pluginId: "tool-golden" },
  });

  const malformedManifest = capturedGolden();
  malformedManifest.plugins[0]!.manifestBytes = new TextEncoder().encode("{}");
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(malformedManifest), {
    ok: false,
    error: { code: "manifest-shape", pluginId: "tool-golden" },
  });

  const mismatch = capturedGolden();
  mismatch.plugins[0]!.pluginId = "other";
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(mismatch), {
    ok: false,
    error: { code: "plugin-id-mismatch", pluginId: "other" },
  });

  const invalidPluginId = capturedGolden();
  invalidPluginId.plugins[0]!.pluginId = "Not Valid";
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(invalidPluginId), {
    ok: false,
    error: { code: "plugin-directory", pluginId: "Not Valid" },
  });

  const invalidCommitment = capturedGolden();
  invalidCommitment.artifactCommitments = {
    "tool-golden": { ...DIGESTS["tool-golden"], runnerDigest: "not-a-digest" },
  };
  assert.deepEqual(generatePluginRegistryFromCapturedBytes(invalidCommitment), {
    ok: false,
    error: { code: "artifact-commitment", pluginId: "tool-golden" },
  });
});

test("license metadata participates in version and plugin-set identity", () => {
  const fixture = mutableFixture();
  try {
    const before = generate(fixture.pluginsRoot);
    assert.equal(before.ok, true);
    if (!before.ok) return;

    const manifestPath = join(fixture.pluginsRoot, "tool-golden", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.license = { spdxId: "Apache-2.0", holder: "PNH" };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const after = generate(fixture.pluginsRoot);
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.notEqual(after.registry.plugins[0]?.versionDigest, before.registry.plugins[0]?.versionDigest);

    const beforeTicket = admitRegistryBytes(before.bytes, before.registryDigest);
    const afterTicket = admitRegistryBytes(after.bytes, after.registryDigest);
    assert.equal(beforeTicket.ok, true);
    assert.equal(afterTicket.ok, true);
    if (beforeTicket.ok && afterTicket.ok) {
      assert.notEqual(afterTicket.ticket.pluginSetDigest, beforeTicket.ticket.pluginSetDigest);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("unsupported compatibility and malformed license metadata fail manifest generation", () => {
  const fixture = mutableFixture();
  try {
    const manifestPath = join(fixture.pluginsRoot, "tool-golden", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.compatibility = { kernelApiVersion: "pnh-kernel-v2" };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.deepEqual(generate(fixture.pluginsRoot), {
      ok: false,
      error: { code: "manifest-shape", pluginId: "tool-golden" },
    });

    manifest.compatibility = { kernelApiVersion: "pnh-kernel-v1" };
    manifest.license = { spdxId: "MIT OR Apache-2.0", holder: "PNH" };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.deepEqual(generate(fixture.pluginsRoot), {
      ok: false,
      error: { code: "manifest-shape", pluginId: "tool-golden" },
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("exact dependency and capability metadata participate in version and plugin-set identity", () => {
  const fixture = mutableFixture();
  try {
    writeFixturePlugin(fixture.pluginsRoot, "base-a");
    writeFixturePlugin(fixture.pluginsRoot, "base-b");
    const manifestPath = join(fixture.pluginsRoot, "tool-golden", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.dependencies = [{ pluginId: "base-a", version: "1.0.0" }];
    manifest.requestedCapabilities = [{
      id: "model-calls",
      limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 1 },
    }];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const options = {
      pluginsRoot: fixture.pluginsRoot,
      environment: "production" as const,
      capabilityCatalog: LIMITED_CATALOG,
      artifactCommitments: artifactCommitments(["base-a", "base-b", "tool-golden"]),
    };
    const baseline = generatePluginRegistry(options);
    assert.equal(baseline.ok, true);
    if (!baseline.ok) return;

    manifest.dependencies = [{ pluginId: "base-b", version: "1.0.0" }];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const dependencyChange = generatePluginRegistry(options);
    assert.equal(dependencyChange.ok, true);
    if (!dependencyChange.ok) return;

    manifest.dependencies = [{ pluginId: "base-a", version: "1.0.0" }];
    manifest.requestedCapabilities = [{
      id: "model-calls",
      limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 2 },
    }];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const capabilityChange = generatePluginRegistry(options);
    assert.equal(capabilityChange.ok, true);
    if (!capabilityChange.ok) return;

    const baselinePlugin = baseline.registry.plugins.find((plugin) => plugin.id === "tool-golden");
    const dependencyPlugin = dependencyChange.registry.plugins.find((plugin) => plugin.id === "tool-golden");
    const capabilityPlugin = capabilityChange.registry.plugins.find((plugin) => plugin.id === "tool-golden");
    assert.notEqual(dependencyPlugin?.versionDigest, baselinePlugin?.versionDigest);
    assert.notEqual(capabilityPlugin?.versionDigest, baselinePlugin?.versionDigest);

    const tickets = [baseline, dependencyChange, capabilityChange].map((generated) =>
      admitRegistryBytes(generated.bytes, generated.registryDigest));
    assert.equal(tickets.every((ticket) => ticket.ok), true);
    if (tickets.every((ticket) => ticket.ok)) {
      const digests = tickets.map((ticket) => ticket.ok ? ticket.ticket.pluginSetDigest : "");
      assert.equal(new Set(digests).size, 3);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("source mutation changes source, version, registry, and plugin-set identity", () => {
  const fixture = mutableFixture();
  try {
    const before = generate(fixture.pluginsRoot);
    assert.equal(before.ok, true);
    if (!before.ok) return;

    const sourcePath = join(fixture.pluginsRoot, "tool-golden", "tool.mjs");
    writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}\n// mutation\n`);
    const after = generate(fixture.pluginsRoot);
    assert.equal(after.ok, true);
    if (!after.ok) return;

    const beforePlugin = before.registry.plugins[0];
    const afterPlugin = after.registry.plugins[0];
    assert.ok(beforePlugin);
    assert.ok(afterPlugin);
    assert.notEqual(afterPlugin.sourceDigest, beforePlugin.sourceDigest);
    assert.notEqual(afterPlugin.versionDigest, beforePlugin.versionDigest);
    assert.notEqual(after.registryDigest, before.registryDigest);

    const beforeTicket = admitRegistryBytes(before.bytes, before.registryDigest);
    const afterTicket = admitRegistryBytes(after.bytes, after.registryDigest);
    assert.equal(beforeTicket.ok, true);
    assert.equal(afterTicket.ok, true);
    if (beforeTicket.ok && afterTicket.ok) {
      assert.notEqual(afterTicket.ticket.pluginSetDigest, beforeTicket.ticket.pluginSetDigest);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("undeclared sidecars fail registry generation", () => {
  const fixture = mutableFixture();
  try {
    writeFileSync(join(fixture.pluginsRoot, "tool-golden", "hidden.mjs"), "export default true;\n");
    assert.deepEqual(generate(fixture.pluginsRoot), {
      ok: false,
      error: { code: "source-tree", pluginId: "tool-golden" },
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("the Tool fixture implements registration and one real operation", async () => {
  const fixtureUrl = pathToFileURL(join(fixturesRoot, "tool-golden", "index.mjs")).href;
  const plugin = await import(fixtureUrl) as { handle(request: Record<string, unknown>): Promise<unknown> };
  assert.deepEqual(await plugin.handle({ phase: "register" }), {
    kind: "tool",
    pluginId: "tool-golden",
    operations: ["echo"],
  });
  assert.deepEqual(
    await plugin.handle({ phase: "operate", payload: { operation: "echo", input: "golden" } }),
    { echoed: "golden" },
  );
});
