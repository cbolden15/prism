import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import {
  admitRegistryBytes,
  isAdmissionTicket,
  resolveAdmittedPlugin,
  resolveAdmittedPluginOrder,
} from "../../packages/runtime/src/runtime/admission-ticket.ts";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function registry(environment: "production" | "development" = "production") {
  return {
    version: "pnh-plugin-registry-v3",
    environment,
    capabilityCatalog: {
      version: "pnh-capability-catalog-v1",
      capabilities: [],
    },
    plugins: [
      {
        id: "tool-golden",
        version: "1.0.0",
        apiVersion: 1,
        kind: "tool",
        compatibility: { kernelApiVersion: "pnh-kernel-v1" },
        entrypoint: "index.mjs",
        files: ["index.mjs"],
        dependencies: [],
        requestedCapabilities: [],
        license: { spdxId: "MIT", holder: "PNH" },
        manifestDigest: "a".repeat(64),
        sourceDigest: "b".repeat(64),
        versionDigest: "c".repeat(64),
        runnerDigest: "d".repeat(64),
        imageDigest: "e".repeat(64),
        profileDigest: "f".repeat(64),
      },
    ],
  };
}

test("verified production bytes issue one opaque deeply-frozen ticket", () => {
  conformsTo("PNH-INV-29");
  const source = registry();
  const sourcePlugin = source.plugins[0];
  assert.ok(sourcePlugin);
  const bytes = Buffer.from(JSON.stringify(source));
  const result = admitRegistryBytes(bytes, digest(bytes));

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(isAdmissionTicket(result.ticket), true);
  assert.equal(Object.isFrozen(result.ticket), true);
  assert.equal(Object.isFrozen(result.ticket.plugins), true);
  assert.equal(Object.isFrozen(result.ticket.plugins[0]), true);
  assert.match(result.ticket.pluginSetDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(resolveAdmittedPlugin(result.ticket, "tool-golden"), sourcePlugin);

  sourcePlugin.kind = "policy";
  assert.equal(resolveAdmittedPlugin(result.ticket, "tool-golden")?.kind, "tool");
});

test("the verified ticket owns canonical dependency order and plugin-set identity", () => {
  const source = registry();
  const template = source.plugins[0];
  assert.ok(template);
  source.plugins = [
    {
      ...template,
      id: "a-dependent",
      dependencies: [{ pluginId: "z-base", version: "1.0.0" }],
      versionDigest: "1".repeat(64),
    },
    {
      ...template,
      id: "z-base",
      dependencies: [],
      versionDigest: "2".repeat(64),
    },
  ] as never[];
  const bytes = Buffer.from(JSON.stringify(source));
  const result = admitRegistryBytes(bytes, digest(bytes));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const order = resolveAdmittedPluginOrder(result.ticket);
  assert.deepEqual(order.map((plugin) => plugin.id), ["z-base", "a-dependent"]);
  const expectedIdentity = createHash("sha256").update(JSON.stringify([
    "pnh-plugin-set-v1",
    [["z-base", "2".repeat(64)], ["a-dependent", "1".repeat(64)]],
  ])).digest("hex");
  assert.equal(result.ticket.pluginSetDigest, expectedIdentity);
});

test("dependency cycles and exact-version drift fail before ticket issuance", () => {
  for (const secondVersion of ["1.0.0", "2.0.0"]) {
    const source = registry();
    const template = source.plugins[0];
    assert.ok(template);
    source.plugins = [
      {
        ...template,
        id: "plugin-a",
        dependencies: [{ pluginId: "plugin-b", version: "1.0.0" }],
      },
      {
        ...template,
        id: "plugin-b",
        version: secondVersion,
        dependencies: secondVersion === "1.0.0" ? [{ pluginId: "plugin-a", version: "1.0.0" }] : [],
      },
    ] as never[];
    const bytes = Buffer.from(JSON.stringify(source));
    assert.deepEqual(admitRegistryBytes(bytes, digest(bytes)), {
      ok: false,
      code: "registry-schema",
    });
  }
});

test("digest mismatch, development registry, and malformed bytes fail closed", () => {
  const productionBytes = Buffer.from(JSON.stringify(registry()));
  assert.deepEqual(admitRegistryBytes(productionBytes, "0".repeat(64)), {
    ok: false,
    code: "digest-mismatch",
  });

  const developmentBytes = Buffer.from(JSON.stringify(registry("development")));
  assert.deepEqual(admitRegistryBytes(developmentBytes, digest(developmentBytes)), {
    ok: false,
    code: "environment",
  });

  const invalidUtf8 = Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
  assert.deepEqual(admitRegistryBytes(invalidUtf8, digest(invalidUtf8)), {
    ok: false,
    code: "invalid-utf8",
  });
});

test("schema rejects unsorted, duplicate, and widened authority metadata", () => {
  const unsorted = registry();
  const unsortedPlugin = unsorted.plugins[0];
  assert.ok(unsortedPlugin);
  unsortedPlugin.files = ["z.mjs", "index.mjs"];
  const unsortedBytes = Buffer.from(JSON.stringify(unsorted));
  assert.deepEqual(admitRegistryBytes(unsortedBytes, digest(unsortedBytes)), {
    ok: false,
    code: "registry-schema",
  });

  const widened = registry();
  const widenedPlugin = widened.plugins[0];
  assert.ok(widenedPlugin);
  widenedPlugin.requestedCapabilities = ["unknown-capability"] as never[];
  const widenedBytes = Buffer.from(JSON.stringify(widened));
  assert.deepEqual(admitRegistryBytes(widenedBytes, digest(widenedBytes)), {
    ok: false,
    code: "registry-schema",
  });

  const overLimit = registry();
  overLimit.capabilityCatalog.capabilities = [
    {
      id: "model-calls",
      limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 2 },
    },
  ] as never[];
  const overLimitPlugin = overLimit.plugins[0];
  assert.ok(overLimitPlugin);
  overLimitPlugin.requestedCapabilities = [
    {
      id: "model-calls",
      limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 3 },
    },
  ] as never[];
  const overLimitBytes = Buffer.from(JSON.stringify(overLimit));
  assert.deepEqual(admitRegistryBytes(overLimitBytes, digest(overLimitBytes)), {
    ok: false,
    code: "registry-schema",
  });
});

test("caller-crafted objects cannot impersonate admission tickets", () => {
  const fake = {
    registryDigest: "a".repeat(64),
    pluginSetDigest: "b".repeat(64),
    environment: "production",
    capabilityCatalog: registry().capabilityCatalog,
    plugins: registry().plugins,
  };

  assert.equal(isAdmissionTicket(fake), false);
  assert.throws(
    () => resolveAdmittedPlugin(fake as never, "tool-golden"),
    /unverified admission ticket/,
  );
});
