import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const image = "ghcr.io/mermaid-js/mermaid-cli/mermaid-cli:11.16.1@sha256:d98fe54c22e78e65335589fc17d5419f698f915cebca48ea21fee633aff8b258";
const diagramRoot = resolve(import.meta.dirname, "..", "..", "docs", "architecture", "diagrams");
const outputRoot = mkdtempSync(join(tmpdir(), "prism-mermaid-"));
const sources = readdirSync(diagramRoot).filter((file) => file.endsWith(".mmd")).sort();

if (sources.length !== 5) throw new Error(`expected 5 Mermaid sources, found ${sources.length}`);

try {
  for (const source of sources) {
    const output = `${source.slice(0, -4)}.svg`;
    const result = spawnSync("docker", [
      "run",
      "--rm",
      "--network=none",
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "--volume",
      `${diagramRoot}:/data:ro`,
      "--volume",
      `${outputRoot}:/output`,
      image,
      "--input",
      `/data/${source}`,
      "--output",
      `/output/${output}`,
      "--quiet",
    ], { encoding: "utf8", timeout: 120_000 });
    if (result.error !== undefined || result.status !== 0) {
      throw new Error([`failed to render ${source}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
    }
    const rendered = resolve(outputRoot, output);
    if (!existsSync(rendered) || statSync(rendered).size === 0) throw new Error(`empty render for ${source}`);
  }
  process.stdout.write(`Prism Mermaid render check: ${sources.length} diagrams ok\n`);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
