import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("real-Docker host test commands run serially", () => {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  assert.equal(
    manifest.scripts["test:host:run"],
    "tsx --test --test-concurrency=1 pnh/host-tests/*.test.ts",
  );

  const harness = readFileSync(
    resolve(repositoryRoot, "packages/runtime/test/sandbox/harness/run-sandbox.mjs"),
    "utf8",
  );
  assert.match(
    harness,
    /run\(resolve\(repositoryRoot, "node_modules", "\.bin", "tsx"\), \[\n  "--test",\n  "--test-concurrency=1",/,
  );
});
