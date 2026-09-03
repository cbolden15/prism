import assert from "node:assert/strict";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { conformsTo } from "../../assurance/constitution/contracts/conforms-to.ts";
import {
  admitRegistryBytes,
  isAdmissionTicket,
  resolveAdmittedPlugin,
} from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  admitPinnedRegistryBytes,
  isOwnerApprovedAdmissionTicket,
  type PinnedRegistryAdmissionResult,
} from "../../packages/runtime/src/runtime/pinned-admission.ts";
import { computeSpawnPluginArtifactCommitments } from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";
import { computeVersionDigest, generatePluginRegistry } from "@useprism/sdk/node/registry";

const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPAWN_RUNNER_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "entrypoint.mjs"],
  ["sdk", "protocol.ts"],
  ["sdk", "protocol", "resource-bounds.ts"],
  ["harness", "plugin-fault-cell.mjs"],
  ["harness", "plugin-resource-arbiter.mjs"],
  ["harness", "plugin-container-supervisor.mjs"],
  ["harness", "plugin-spawn-supervisor.mjs"],
];
const HARNESS_FILES: ReadonlyArray<readonly string[]> = [
  ["kernel", "plugin-runner", "spawn-profile.json"],
  ...SPAWN_RUNNER_FILES,
];

function fabricatePnhRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-root-"));
  for (const segments of HARNESS_FILES) {
    const target = resolve(root, ...segments);
    mkdirSync(dirname(target), { recursive: true });
    const [owner, ...relative] = segments;
    const source = owner === "sdk"
      ? resolve(REPOSITORY_ROOT, "packages", "sdk", "src", ...relative)
      : resolve(REPOSITORY_ROOT, "packages", "runtime", "src", ...segments);
    copyFileSync(source, target);
  }
  mkdirSync(resolve(root, "contracts"), { recursive: true });
  return root;
}

function artifactPaths(pnhRoot: string) {
  return {
    runtimeRoot: pnhRoot,
    sdkProtocolPath: resolve(pnhRoot, "sdk", "protocol.ts"),
    sdkResourceBoundsPath: resolve(pnhRoot, "sdk", "protocol", "resource-bounds.ts"),
  };
}

function manifestFor(id: string): string {
  return JSON.stringify({
    id,
    version: "1.0.0",
    apiVersion: 1,
    kind: "tool",
    compatibility: { kernelApiVersion: "pnh-kernel-v1" },
    entrypoint: "index.mjs",
    files: ["index.mjs"],
    dependencies: [],
    requestedCapabilities: [],
    license: { spdxId: "MIT", holder: "Prism Harness test fixture" },
  });
}

function generate(pnhRoot: string, ids: readonly string[]) {
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  for (const id of ids) {
    const pluginRoot = resolve(pluginsRoot, id);
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(resolve(pluginRoot, "manifest.json"), manifestFor(id));
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
  }
  const generated = generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog,
    artifactCommitments: Object.fromEntries(
      ids.map((id) => [
        id,
        computeSpawnPluginArtifactCommitments({
          ...artifactPaths(pnhRoot),
          pluginRoot: resolve(pluginsRoot, id),
        }),
      ]),
    ),
  });
  if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
  return { pluginsRoot, generated };
}

function pinsFor(generated: ReturnType<typeof generate>["generated"]) {
  return {
    version: "pnh-plugin-pins-v1",
    environment: "production",
    plugins: [...generated.registry.plugins].reverse().map((plugin) => ({
      id: plugin.id,
      manifestDigest: plugin.manifestDigest,
      sourceDigest: plugin.sourceDigest,
    })),
  };
}

interface Fixture {
  readonly pnhRoot: string;
  readonly pluginsRoot: string;
  readonly generated: ReturnType<typeof generate>["generated"];
  readonly admit: (bytes: Uint8Array, pins: unknown) => PinnedRegistryAdmissionResult;
}

function withFixture<T>(ids: readonly string[], body: (fixture: Fixture) => T): T {
  const pnhRoot = fabricatePnhRoot();
  const { pluginsRoot, generated } = generate(pnhRoot, ids);
  try {
    return body({
      pnhRoot,
      pluginsRoot,
      generated,
      admit: (bytes, pins) => {
        writeFileSync(
          resolve(pnhRoot, "contracts", "plugin-pins.json"),
          typeof pins === "string" ? pins : JSON.stringify(pins),
        );
        return admitPinnedRegistryBytes({
          bytes,
          pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
          pluginsRoot,
          ...artifactPaths(pnhRoot),
        });
      },
    });
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
}

function forgedBytes(generated: { bytes: Uint8Array }, mutate: (doc: any) => void): Uint8Array {
  const doc = JSON.parse(new TextDecoder().decode(generated.bytes));
  mutate(doc);
  return new TextEncoder().encode(`${JSON.stringify(doc)}\n`);
}

const EMPTY_PINS = { version: "pnh-plugin-pins-v1", environment: "production", plugins: [] };

test("a registry whose plugin set exactly matches the pins admits, issuing an owner-approved ticket", () => {
  conformsTo("PNH-INV-29");
  withFixture(["alpha", "beta"], ({ generated, admit }) => {
    const result = admit(generated.bytes, pinsFor(generated));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(isOwnerApprovedAdmissionTicket(result.ticket));
      assert.ok(isAdmissionTicket(result.ticket.ticket));
      assert.ok(resolveAdmittedPlugin(result.ticket.ticket, "alpha"));
      assert.ok(resolveAdmittedPlugin(result.ticket.ticket, "beta"));
      assert.deepEqual([...result.ticket.pinnedPluginIds].sort(), ["alpha", "beta"]);
      assert.ok(Object.isFrozen(result.ticket));
      assert.ok(Object.isFrozen(result.ticket.pinnedPluginIds));
    }
  });
});

test("admitting the same plugin set twice succeeds, and neither run writes to disk", () => {
  conformsTo("PNH-INV-29");
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    const before = readdirSync(pluginsRoot).sort();
    const pins = pinsFor(generated);
    assert.equal(admit(generated.bytes, pins).ok, true);
    assert.equal(admit(generated.bytes, pins).ok, true);
    assert.deepEqual(readdirSync(pluginsRoot).sort(), before);
    assert.deepEqual(readdirSync(resolve(pluginsRoot, "alpha")).sort(), ["index.mjs", "manifest.json"]);
  });
});

test("a raw self-hashed registry's ticket is not owner-approved", () => {
  conformsTo("PNH-INV-29");
  withFixture(["alpha"], ({ generated }) => {
    const raw = admitRegistryBytes(generated.bytes, generated.registryDigest);
    assert.equal(raw.ok, true);
    if (raw.ok) {
      assert.ok(isAdmissionTicket(raw.ticket));
      assert.equal(isOwnerApprovedAdmissionTicket(raw.ticket), false);
    }
  });
});

test("an invalid pin file refuses admission", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    assert.deepEqual(admit(generated.bytes, { pins: [] }), { ok: false, code: "pin-record" });
  });
});

test("a missing pin file refuses admission", () => {
  const pnhRoot = fabricatePnhRoot();
  const { pluginsRoot, generated } = generate(pnhRoot, ["alpha"]);
  try {
    assert.deepEqual(admitPinnedRegistryBytes({
      bytes: generated.bytes,
      pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
      pluginsRoot,
      ...artifactPaths(pnhRoot),
    }), {
      ok: false,
      code: "pin-record",
    });
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("a registry plugin with no pin entry is refused as unpinned", () => {
  withFixture(["alpha", "beta"], ({ generated, admit }) => {
    const pins = pinsFor(generated);
    pins.plugins = pins.plugins.filter((entry) => entry.id !== "beta");
    assert.deepEqual(admit(generated.bytes, pins), { ok: false, code: "unpinned-plugin" });
  });
});

test("a pinned plugin missing from the registry is refused", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    const pins = pinsFor(generated);
    pins.plugins = [
      ...pins.plugins,
      { id: "zeta", manifestDigest: "e".repeat(64), sourceDigest: "f".repeat(64) },
    ];
    assert.deepEqual(admit(generated.bytes, pins), { ok: false, code: "pinned-plugin-missing" });
  });
});

test("changed plugin content is refused: the regenerated registry no longer matches the old pins", () => {
  withFixture(["alpha"], ({ pnhRoot, pluginsRoot, generated, admit }) => {
    const pins = pinsFor(generated);
    writeFileSync(resolve(pluginsRoot, "alpha", "index.mjs"), "export async function handle() { return null; }\n");
    const regenerated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({
          ...artifactPaths(pnhRoot),
          pluginRoot: resolve(pluginsRoot, "alpha"),
        }),
      },
    });
    if (!regenerated.ok) throw new Error("registry generation failed");
    assert.deepEqual(admit(regenerated.bytes, pins), { ok: false, code: "pin-digest-mismatch" });
  });
});

test("a forged descriptor that copies pinned digests over altered manifest fields is refused", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    const bytes = forgedBytes(generated, (doc) => {
      doc.plugins[0].version = "1.0.1";
    });
    assert.deepEqual(admit(bytes, pinsFor(generated)), {
      ok: false,
      code: "manifest-digest-derivation",
    });
  });
});

test("a swapped executor commitment is refused even when versionDigest is recomputed to match", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    const bytes = forgedBytes(generated, (doc) => {
      const plugin = doc.plugins[0];
      plugin.imageDigest = "f".repeat(64);
      plugin.versionDigest = computeVersionDigest(plugin.manifestDigest, plugin.sourceDigest, {
        runnerDigest: plugin.runnerDigest,
        imageDigest: plugin.imageDigest,
        profileDigest: plugin.profileDigest,
      });
    });
    assert.deepEqual(admit(bytes, pinsFor(generated)), { ok: false, code: "commitment-mismatch" });
  });
});

for (const segments of SPAWN_RUNNER_FILES) {
  test(`a byte change to transitive spawn runner source ${segments.join("/")} moves runnerDigest`, () => {
    withFixture(["alpha"], ({ pnhRoot, pluginsRoot, generated, admit }) => {
      const pluginRoot = resolve(pluginsRoot, "alpha");
      const before = computeSpawnPluginArtifactCommitments({ ...artifactPaths(pnhRoot), pluginRoot });
      appendFileSync(resolve(pnhRoot, ...segments), "\n// swapped\n");
      const after = computeSpawnPluginArtifactCommitments({ ...artifactPaths(pnhRoot), pluginRoot });
      assert.notEqual(after.runnerDigest, before.runnerDigest);
      assert.equal(after.profileDigest, before.profileDigest);
      assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
        ok: false,
        code: "commitment-mismatch",
      });
    });
  });
}

test("a source file swapped on disk after generation is refused via sourceDigest recomputation", () => {
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    writeFileSync(resolve(pluginsRoot, "alpha", "index.mjs"), "export async function handle() { return null; }\n");
    assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
      ok: false,
      code: "source-digest-derivation",
    });
  });
});

test("a source tree carrying a file the manifest does not declare is refused", () => {
  withFixture(["alpha"], ({ pluginsRoot, generated, admit }) => {
    writeFileSync(resolve(pluginsRoot, "alpha", "README.md"), "# stray\n");
    assert.deepEqual(admit(generated.bytes, pinsFor(generated)), {
      ok: false,
      code: "source-digest-derivation",
    });
  });
});

test("an on-disk manifest carrying a duplicate member is refused, as the pin file's is", () => {
  conformsTo("PNH-INV-29");
  const pnhRoot = fabricatePnhRoot();
  const pluginsRoot = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  try {
    const pluginRoot = resolve(pluginsRoot, "alpha");
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(resolve(pluginRoot, "manifest.json"), `{"entrypoint":"shadow.mjs",${manifestFor("alpha").slice(1)}`);
    writeFileSync(resolve(pluginRoot, "index.mjs"), "export async function handle(r) { return r; }\n");
    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: {
        alpha: computeSpawnPluginArtifactCommitments({ ...artifactPaths(pnhRoot), pluginRoot }),
      },
    });
    if (!generated.ok) throw new Error(`registry generation failed: ${JSON.stringify(generated.error)}`);
    writeFileSync(resolve(pnhRoot, "contracts", "plugin-pins.json"), JSON.stringify(pinsFor(generated)));
    assert.deepEqual(admitPinnedRegistryBytes({
      bytes: generated.bytes,
      pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
      pluginsRoot,
      ...artifactPaths(pnhRoot),
    }), {
      ok: false,
      code: "manifest-file",
    });
  } finally {
    rmSync(pluginsRoot, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("an inner admission failure propagates its own code", () => {
  const pnhRoot = fabricatePnhRoot();
  const spare = mkdtempSync(resolve(tmpdir(), "pnh-pinned-admission-"));
  try {
    writeFileSync(resolve(pnhRoot, "contracts", "plugin-pins.json"), JSON.stringify(EMPTY_PINS));
    assert.deepEqual(admitPinnedRegistryBytes({
      bytes: new TextEncoder().encode("not json"),
      pinPath: resolve(pnhRoot, "contracts", "plugin-pins.json"),
      pluginsRoot: spare,
      ...artifactPaths(pnhRoot),
    }), {
      ok: false,
      code: "invalid-json",
    });
  } finally {
    rmSync(spare, { recursive: true, force: true });
    rmSync(pnhRoot, { recursive: true, force: true });
  }
});

test("the empty pin set refuses every non-empty registry", () => {
  withFixture(["alpha"], ({ generated, admit }) => {
    assert.deepEqual(admit(generated.bytes, EMPTY_PINS), { ok: false, code: "unpinned-plugin" });
  });
});
