import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCorePolicy } from "./core-policy.mjs";

const requireFromRunner = createRequire("/runner/package.json");
const ts = requireFromRunner("typescript");
const manifest = JSON.parse(readFileSync(3, "utf8"));
const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "sandbox-worker.mjs");

registerHooks(createCorePolicy({ manifest, ts, workerPath }));

export function loadedCoreManifest() {
  return manifest;
}
