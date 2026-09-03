import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { computeSpawnPluginArtifactCommitments } from "@useprism/runtime";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

export const deterministicAssetsRoot = resolve(import.meta.dirname, "..", "..", "assets", "deterministic");
export const deterministicPluginsRoot = resolve(deterministicAssetsRoot, "plugins");
export const deterministicPinPath = resolve(deterministicAssetsRoot, "plugin-pins.json");

export function generateDeterministicPluginRegistry() {
  const pluginIds = readdirSync(deterministicPluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
  return generatePluginRegistry({
    pluginsRoot: deterministicPluginsRoot,
    environment: "production",
    capabilityCatalog: { version: "pnh-capability-catalog-v1", capabilities: [] },
    artifactCommitments: Object.fromEntries(pluginIds.map((pluginId) => [
      pluginId,
      computeSpawnPluginArtifactCommitments({
        pluginRoot: resolve(deterministicPluginsRoot, pluginId),
      }),
    ])),
  });
}
