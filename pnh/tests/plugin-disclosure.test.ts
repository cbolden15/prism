import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AdmissionTicket } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  type OwnerApprovedAdmissionTicket,
} from "../../packages/runtime/src/runtime/pinned-admission.ts";
import {
  describeAdmittedPluginSet,
  renderPluginDisclosureLines,
  type PluginDisclosureRecord,
} from "../../packages/runtime/src/runtime/plugin-disclosure.ts";
import { computeSpawnPluginArtifactCommitments } from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";
import type { RegistryCapability, RegistryCapabilityCatalog } from "@useprism/sdk/manifest";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const CAP: RegistryCapability = {
  id: "clock-read",
  limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true },
};
const capabilityCatalog: RegistryCapabilityCatalog = {
  version: "pnh-capability-catalog-v1",
  capabilities: [CAP],
};
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HARNESS_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "spawn-profile.json"],
  ["kernel", "plugin-runner", "entrypoint.mjs"],
  ["sdk", "protocol.ts"],
  ["sdk", "protocol", "resource-bounds.ts"],
  ["harness", "plugin-fault-cell.mjs"],
  ["harness", "plugin-resource-arbiter.mjs"],
  ["harness", "plugin-container-supervisor.mjs"],
  ["harness", "plugin-spawn-supervisor.mjs"],
];

function artifactPaths(pnhRoot: string) {
  return {
    runtimeRoot: pnhRoot,
    sdkProtocolPath: resolve(pnhRoot, "sdk", "protocol.ts"),
    sdkResourceBoundsPath: resolve(pnhRoot, "sdk", "protocol", "resource-bounds.ts"),
  };
}

function admittedTicket(askingCapabilities: readonly RegistryCapability[]): {
  ticket: OwnerApprovedAdmissionTicket;
  cleanup: () => void;
} {
  const pnhRoot = mkdtempSync(resolve(tmpdir(), "pnh-plugin-disclosure-root-"));
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-plugin-disclosure-"));
  const cleanup = () => {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  };
  try {
    for (const segments of HARNESS_FILES) {
      const target = resolve(pnhRoot, ...segments);
      mkdirSync(dirname(target), { recursive: true });
      const [owner, ...relative] = segments;
      const source = owner === "sdk"
        ? resolve(REPOSITORY_ROOT, "packages", "sdk", "src", ...relative)
        : resolve(REPOSITORY_ROOT, "packages", "runtime", "src", ...segments);
      copyFileSync(source, target);
    }
    mkdirSync(resolve(pnhRoot, "contracts"), { recursive: true });

    const writePlugin = (id: string, requestedCapabilities: readonly RegistryCapability[]) => {
      const pluginRoot = resolve(pluginsRoot, id);
      mkdirSync(pluginRoot, { recursive: true });
      writeFileSync(resolve(pluginRoot, "manifest.json"), JSON.stringify({
        id,
        version: "1.0.0",
        apiVersion: 1,
        kind: "tool",
        compatibility: { kernelApiVersion: "pnh-kernel-v1" },
        entrypoint: "index.mjs",
        files: ["index.mjs"],
        dependencies: [],
        requestedCapabilities,
        license: { spdxId: "MIT", holder: "Prism Harness test fixture" },
      }));
      writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
    };
    writePlugin("quiet", []);
    writePlugin("asking", askingCapabilities);

    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: Object.fromEntries(
        ["quiet", "asking"].map((id) => [
          id,
          computeSpawnPluginArtifactCommitments({
            ...artifactPaths(pnhRoot),
            pluginRoot: resolve(pluginsRoot, id),
          }),
        ]),
      ),
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);

    writeFileSync(resolve(pnhRoot, "contracts", "plugin-pins.json"), JSON.stringify({
      version: "pnh-plugin-pins-v1",
      environment: "production",
      plugins: generated.registry.plugins.map((plugin) => ({
        id: plugin.id,
        manifestDigest: plugin.manifestDigest,
        sourceDigest: plugin.sourceDigest,
      })),
    }));
    const admitted = admitPinnedRegistryBytes({
      bytes: generated.bytes,
      pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
      pluginsRoot,
      ...artifactPaths(pnhRoot),
    });
    if (!admitted.ok) throw new Error(`pinned admission failed: ${admitted.code}`);
    return { ticket: admitted.ticket, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

test("records are sorted, deterministic, immutable, and carry pin identity", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const first = describeAdmittedPluginSet(ticket);
    assert.deepEqual(first, describeAdmittedPluginSet(ticket));
    assert.deepEqual(first.map((record) => record.pluginId), ["asking", "quiet"]);
    assert.ok(Object.isFrozen(first));
    for (const record of first) {
      assert.match(record.manifestDigest, /^[0-9a-f]{64}$/);
      assert.match(record.sourceDigest, /^[0-9a-f]{64}$/);
      assert.equal(record.ownerApproved, true);
      assert.ok(Object.isFrozen(record));
    }
    const [asking, quiet] = first;
    assert.ok(asking !== undefined && quiet !== undefined);
    assert.deepEqual(asking.requestedBrokerCapabilities, [CAP]);
    assert.deepEqual(quiet.requestedBrokerCapabilities, []);
  } finally {
    cleanup();
  }
});

test("a forged ticket-shaped object is rejected by both admission brands", () => {
  assert.throws(
    () => describeAdmittedPluginSet({ plugins: [] } as unknown as AdmissionTicket),
    /unverified admission ticket/,
  );
});

test("a genuine unpinned ticket is described as ownerApproved=false", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const records = describeAdmittedPluginSet(ticket.ticket);
    assert.deepEqual(records.map((record) => record.pluginId), ["asking", "quiet"]);
    assert.ok(records.every((record) => record.ownerApproved === false));
    assert.deepEqual(
      records.map((record) => record.manifestDigest),
      describeAdmittedPluginSet(ticket).map((record) => record.manifestDigest),
    );
  } finally {
    cleanup();
  }
});

test("rendered lines are advisory and name every plugin and requested capability", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const [header, caveat, askingLine, quietLine] = renderPluginDisclosureLines(ticket);
    assert.ok(header !== undefined && caveat !== undefined && askingLine !== undefined && quietLine !== undefined);
    assert.match(header, /advisory/);
    assert.match(header, /enforces nothing/);
    assert.match(header, /ownerApproved=true/);
    assert.match(caveat, /broker-requested capabilities only/);
    assert.match(caveat, /ambient executor authority/);
    assert.match(askingLine, /^plugin disclosure: asking@1\.0\.0 kind=tool manifest=[0-9a-f]{64} source=[0-9a-f]{64} ownerApproved=true brokerCapabilities=clock-read/);
    assert.match(quietLine, /brokerCapabilities=none$/);
  } finally {
    cleanup();
  }
});

test("an unpinned ticket marks every rendered plugin line ownerApproved=false", () => {
  const { ticket, cleanup } = admittedTicket([CAP]);
  try {
    const [header, , askingLine, quietLine] = renderPluginDisclosureLines(ticket.ticket);
    assert.ok(header !== undefined && askingLine !== undefined && quietLine !== undefined);
    assert.match(header, /ownerApproved=false/);
    assert.match(askingLine, /ownerApproved=false/);
    assert.match(quietLine, /ownerApproved=false/);
  } finally {
    cleanup();
  }
});

test("the ambient-authority caveat remains when no broker capability was requested", () => {
  const { ticket, cleanup } = admittedTicket([]);
  try {
    const [, caveat] = renderPluginDisclosureLines(ticket);
    assert.ok(caveat !== undefined);
    assert.match(caveat, /ambient executor authority \(e\.g\. spawn-path host filesystem\/network access\) is not reflected here/);
  } finally {
    cleanup();
  }
});

test("hand-built disclosure records cannot be rendered", () => {
  const forged: readonly PluginDisclosureRecord[] = [{
    pluginId: "asking",
    version: "1.0.0",
    kind: "tool",
    manifestDigest: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    ownerApproved: true,
    requestedBrokerCapabilities: [],
  }];
  assert.throws(
    () => renderPluginDisclosureLines(forged as unknown as OwnerApprovedAdmissionTicket),
    /unverified admission ticket/,
  );
});
