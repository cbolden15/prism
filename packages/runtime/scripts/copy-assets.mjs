import { copyFileSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(packageRoot, "src");
const destinationRoot = resolve(packageRoot, "dist");
const assetPaths = Object.freeze([
  "harness/plugin-container-broker.d.mts",
  "harness/plugin-container-broker.mjs",
  "harness/plugin-container-supervisor.d.mts",
  "harness/plugin-container-supervisor.mjs",
  "harness/plugin-fault-cell.d.mts",
  "harness/plugin-fault-cell.mjs",
  "harness/plugin-resource-arbiter.d.mts",
  "harness/plugin-resource-arbiter.mjs",
  "harness/plugin-spawn-supervisor.d.mts",
  "harness/plugin-spawn-supervisor.mjs",
  "harness/sandbox/broker-gateway.d.mts",
  "harness/sandbox/broker-gateway.mjs",
  "kernel/plugin-runner/Containerfile",
  "kernel/plugin-runner/entrypoint.d.mts",
  "kernel/plugin-runner/entrypoint.mjs",
  "kernel/plugin-runner/image.lock.json",
  "kernel/plugin-runner/launch-profile.json",
  "kernel/plugin-runner/seccomp.json",
  "kernel/plugin-runner/spawn-profile.json",
]);

for (const assetPath of assetPaths) {
  const source = resolve(sourceRoot, assetPath);
  const destination = resolve(destinationRoot, assetPath);
  if (!existsSync(source) || !lstatSync(source).isFile()) {
    throw new Error(`runtime asset is missing or is not a file: ${assetPath}`);
  }
  if (existsSync(destination)) {
    throw new Error(`runtime asset collides with compiler output: ${assetPath}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

process.stdout.write(`copied ${assetPaths.length} explicit runtime assets\n`);
