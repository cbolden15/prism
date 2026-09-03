import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admitRegistryBytes } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  type OwnerApprovedAdmissionTicket,
} from "../../packages/runtime/src/runtime/pinned-admission.ts";
import {
  assertOwnerApprovedLaunchSpecUnchanged,
  createOwnerApprovedPluginSpawnLaunchSpec,
} from "../../packages/runtime/src/runtime/pinned-spawn-launch.ts";
import { computeSpawnPluginArtifactCommitments } from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

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
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

interface Fixture {
  readonly pnhRoot: string;
  readonly pluginsRoot: string;
  readonly pluginRoot: string;
  readonly elsewhere: string;
  readonly registryBytes: Uint8Array;
  readonly registryDigest: string;
  readonly ticket: OwnerApprovedAdmissionTicket;
}

function artifactPaths(pnhRoot: string) {
  return {
    runtimeRoot: pnhRoot,
    sdkProtocolPath: resolve(pnhRoot, "sdk", "protocol.ts"),
    sdkResourceBoundsPath: resolve(pnhRoot, "sdk", "protocol", "resource-bounds.ts"),
  };
}

function withFixture<T>(body: (fixture: Fixture) => T): T {
  const pnhRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-root-"));
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-plugins-"));
  const elsewhere = mkdtempSync(resolve(tmpdir(), "pnh-pinned-launch-elsewhere-"));
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

    const pluginRoot = resolve(pluginsRoot, "alpha");
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(
      resolve(pluginRoot, "manifest.json"),
      JSON.stringify({
        id: "alpha",
        version: "1.0.0",
        apiVersion: 1,
        kind: "tool",
        compatibility: { kernelApiVersion: "pnh-kernel-v1" },
        entrypoint: "index.mjs",
        files: ["index.mjs", "lib.mjs"],
        dependencies: [],
        requestedCapabilities: [],
        license: { spdxId: "MIT", holder: "Prism Harness test fixture" },
      }),
    );
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export * from './lib.mjs';\n");
    writeFileSync(resolve(pluginRoot, "lib.mjs"), "export async function handle() { return 1; }\n");

    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({ ...artifactPaths(pnhRoot), pluginRoot }),
      },
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);

    const plugin = generated.registry.plugins[0];
    if (plugin === undefined) throw new Error("expected one generated plugin");
    writeFileSync(
      resolve(pnhRoot, "contracts", "plugin-pins.json"),
      JSON.stringify({
        version: "pnh-plugin-pins-v1",
        environment: "production",
        plugins: [{
          id: plugin.id,
          manifestDigest: plugin.manifestDigest,
          sourceDigest: plugin.sourceDigest,
        }],
      }),
    );

    const admitted = admitPinnedRegistryBytes({
      bytes: generated.bytes,
      pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
      pluginsRoot,
      ...artifactPaths(pnhRoot),
    });
    if (!admitted.ok) throw new Error(`fixture admission failed: ${admitted.code}`);
    return body({
      pnhRoot,
      pluginsRoot,
      pluginRoot,
      elsewhere,
      registryBytes: generated.bytes,
      registryDigest: generated.registryDigest,
      ticket: admitted.ticket,
    });
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
}

test("matching owner-approved bytes build a spawn spec on the caller's root", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pluginRoot,
      ...artifactPaths(pnhRoot),
    });
    assert.equal(spec.pluginId, "alpha");
    assert.equal(spec.cwd, resolve(pluginRoot));
    assert.equal(spec.entrypointPath, resolve(pluginRoot, "index.mjs"));
  });
});

test("an ordinary admission ticket is refused because integrity is not owner approval", () => {
  withFixture(({ registryBytes, registryDigest, pluginRoot, pnhRoot }) => {
    const raw = admitRegistryBytes(registryBytes, registryDigest);
    assert.equal(raw.ok, true);
    if (raw.ok) {
      assert.throws(
        () => createOwnerApprovedPluginSpawnLaunchSpec({
          ticket: raw.ticket as unknown as OwnerApprovedAdmissionTicket,
          pluginId: "alpha",
          ...artifactPaths(pnhRoot),
          pluginRoot,
        }),
        /unverified owner-approved admission ticket/,
      );
    }
  });
});

test("a forged ticket-shaped object is refused", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const forged = { ticket: ticket.ticket, pinnedPluginIds: ["alpha"] } as unknown as OwnerApprovedAdmissionTicket;
    assert.throws(
      () => createOwnerApprovedPluginSpawnLaunchSpec({
        ticket: forged,
        pluginId: "alpha",
        pluginRoot,
        ...artifactPaths(pnhRoot),
      }),
      /unverified owner-approved admission ticket/,
    );
  });
});

test("an unknown plugin id is refused", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    assert.throws(
      () => createOwnerApprovedPluginSpawnLaunchSpec({
        ticket,
        pluginId: "zeta",
        pluginRoot,
        ...artifactPaths(pnhRoot),
      }),
      /admitted plugin not found/,
    );
  });
});

test("a changed declared helper file is refused even where imageDigest cannot see it", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    const tampered = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, tampered, { recursive: true });
    writeFileSync(resolve(tampered, "lib.mjs"), "export async function handle() { return 2; }\n");
    assert.throws(
      () => createOwnerApprovedPluginSpawnLaunchSpec({
        ticket,
        pluginId: "alpha",
        pluginRoot: tampered,
        ...artifactPaths(pnhRoot),
      }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("a changed manifest is refused even though sourceDigest covers only declared files", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    const restamped = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, restamped, { recursive: true });
    const manifest = JSON.parse(readFileSync(resolve(restamped, "manifest.json"), "utf8"));
    manifest.version = "9.9.9";
    writeFileSync(resolve(restamped, "manifest.json"), JSON.stringify(manifest));
    assert.throws(
      () => createOwnerApprovedPluginSpawnLaunchSpec({
        ticket,
        pluginId: "alpha",
        pluginRoot: restamped,
        ...artifactPaths(pnhRoot),
      }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("a digest-identical copy at a different path is accepted", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    const copy = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, copy, { recursive: true });
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pluginRoot: copy,
      ...artifactPaths(pnhRoot),
    });
    assert.equal(spec.cwd, resolve(copy));
    assert.notEqual(spec.cwd, resolve(pluginRoot));
  });
});

test("a tree edited after spec creation is caught by the pre-spawn re-check", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pluginRoot,
      ...artifactPaths(pnhRoot),
    });
    assert.doesNotThrow(() => assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }));
    writeFileSync(resolve(pluginRoot, "lib.mjs"), "export async function handle() { return 3; }\n");
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("the pre-spawn re-check follows the spec's cwd", () => {
  withFixture(({ pluginRoot, elsewhere, ticket, pnhRoot }) => {
    const copy = resolve(elsewhere, "alpha");
    cpSync(pluginRoot, copy, { recursive: true });
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pluginRoot: copy,
      ...artifactPaths(pnhRoot),
    });
    writeFileSync(resolve(copy, "lib.mjs"), "export async function handle() { return 4; }\n");
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket, pluginId: "alpha", spec }),
      /owner-approved plugin tree changed after launch spec creation/,
    );
  });
});

test("the pre-spawn re-check refuses an unbranded ticket", () => {
  withFixture(({ pluginRoot, ticket, pnhRoot }) => {
    const spec = createOwnerApprovedPluginSpawnLaunchSpec({
      ticket,
      pluginId: "alpha",
      pluginRoot,
      ...artifactPaths(pnhRoot),
    });
    const forged = { ticket: ticket.ticket, pinnedPluginIds: ["alpha"] } as unknown as OwnerApprovedAdmissionTicket;
    assert.throws(
      () => assertOwnerApprovedLaunchSpecUnchanged({ ticket: forged, pluginId: "alpha", spec }),
      /unverified owner-approved admission ticket/,
    );
  });
});
