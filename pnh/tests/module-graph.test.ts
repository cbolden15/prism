import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkModuleGraph,
  checkTestCoreImports,
  createCoreManifest,
} from "../../packages/runtime/scripts/check-module-graph.ts";

function fixture(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "pnh-graph-"));
  for (const [relativePath, source] of Object.entries(files)) {
    const path = join(directory, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  return directory;
}

test("clean core-only relative imports pass and become manifest edges", () => {
  const directory = fixture({
    "a.ts": 'import { b } from "./b.ts";\nexport const a = b + 1;\n',
    "b.ts": "export const b = 1;\n",
  });
  try {
    assert.deepEqual(checkModuleGraph(directory), []);
    const manifest = createCoreManifest(directory);
    assert.deepEqual(Object.keys(manifest.files).sort(), ["a.ts", "b.ts"]);
    assert.deepEqual(manifest.entries.sort(), ["a.ts", "b.ts"]);
    assert.equal(manifest.edges.length, 1);
    assert.equal(manifest.edges[0]?.specifier, "./b.ts");
    assert.match(manifest.files["a.ts"]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("node and bare package imports are violations", () => {
  const directory = fixture({
    "node.ts": 'import { readFileSync } from "node:fs";\nvoid readFileSync;\n',
    "package.ts": 'import value from "lodash";\nvoid value;\n',
  });
  try {
    assert.deepEqual(
      checkModuleGraph(directory).map((violation) => violation.reason).sort(),
      ["external-specifier", "external-specifier"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("escaping and unresolved relative imports fail closed", () => {
  const escaping = fixture({ "a.ts": 'import { x } from "../outside.ts";\nvoid x;\n' });
  const unresolved = fixture({ "a.ts": 'import { x } from "./missing.ts";\nvoid x;\n' });
  try {
    assert.equal(checkModuleGraph(escaping)[0]?.reason, "escapes-core");
    assert.equal(checkModuleGraph(unresolved)[0]?.reason, "unresolved");
  } finally {
    rmSync(escaping, { recursive: true, force: true });
    rmSync(unresolved, { recursive: true, force: true });
  }
});

test("dynamic import and direct require are violations", () => {
  const directory = fixture({
    "dynamic.ts": 'export async function load(path: string) { return import(path); }\n',
    "require.ts": 'declare const require: (path: string) => unknown;\nexport const fs = require("fs");\n',
  });
  try {
    assert.deepEqual(
      checkModuleGraph(directory).map((violation) => violation.reason).sort(),
      ["dynamic-import", "require-call"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("export-from and import-equals are checked", () => {
  const directory = fixture({
    "export.ts": 'export { createHash } from "node:crypto";\n',
    "equals.ts": 'import fs = require("node:fs");\nexport const value = fs;\n',
  });
  try {
    assert.deepEqual(
      checkModuleGraph(directory).map((violation) => violation.reason).sort(),
      ["external-specifier", "external-specifier"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sidecars, symlinks, and triple-slash references fail closed", () => {
  const sidecar = fixture({
    "a.ts": 'export * from "./sidecar.mts";\n',
    "sidecar.mts": 'import "node:fs";\n',
    "ambient.d.ts": "declare const host: unknown;\n",
  });
  const reference = fixture({
    "a.ts": '/// <reference path="../outside.d.ts" />\nexport {};\n',
  });
  const linkRoot = mkdtempSync(join(tmpdir(), "pnh-graph-link-"));
  const linkCore = join(linkRoot, "core");
  mkdirSync(linkCore);
  const outside = join(linkRoot, "outside.ts");
  writeFileSync(outside, 'import "node:fs";\n');
  symlinkSync(outside, join(linkCore, "link.ts"));
  try {
    const sidecarReasons = checkModuleGraph(sidecar).map((violation) => violation.reason);
    assert.equal(sidecarReasons.includes("unsupported-file"), true);
    assert.equal(checkModuleGraph(reference)[0]?.reason, "reference-directive");
    assert.equal(checkModuleGraph(linkCore)[0]?.reason, "symlink");
  } finally {
    rmSync(sidecar, { recursive: true, force: true });
    rmSync(reference, { recursive: true, force: true });
    rmSync(linkRoot, { recursive: true, force: true });
  }
});

test("checkModuleGraph fails closed on the public core and on consumer-specific dependencies", () => {
  const coreDirectory = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "packages",
    "runtime",
    "src",
    "core",
  );
  assert.deepEqual(checkModuleGraph(coreDirectory), []);

  // Inject the failure this checker exists to catch: a core module reaching
  // out to a consumer-specific package and to a file outside the core tree.
  const injected = fixture({
    "grant.ts": [
      'import { config } from "homelab-consumer";',
      'import { helper } from "../consumer/helper.ts";',
      "export const grant = { config, helper };",
    ].join("\n") + "\n",
  });
  try {
    assert.deepEqual(
      checkModuleGraph(injected).map((violation) => violation.reason).sort(),
      ["escapes-core", "external-specifier"],
    );
  } finally {
    rmSync(injected, { recursive: true, force: true });
  }
});

test("runtime test imports of core are rejected while type-only imports are allowed", () => {
  const root = mkdtempSync(join(tmpdir(), "pnh-test-import-"));
  const core = join(root, "core");
  const tests = join(root, "tests");
  mkdirSync(core);
  mkdirSync(tests);
  writeFileSync(join(core, "value.ts"), "export const value = 1;\n");
  writeFileSync(join(tests, "runtime.test.ts"), 'import { value } from "../core/value.ts";\nvoid value;\n');
  writeFileSync(join(tests, "type-only.test.ts"), 'import type { value } from "../core/value.ts";\ntype Value = typeof value;\n');
  writeFileSync(join(tests, "re-export.test.ts"), 'export { value } from "../core/value.ts";\n');
  writeFileSync(join(tests, "require.test.ts"), 'import value = require("../core/value.ts");\nvoid value;\n');
  writeFileSync(join(tests, "runtime.test.mjs"), 'import { value } from "../core/value.ts";\nvoid value;\n');
  writeFileSync(join(root, "helper.ts"), 'export { value } from "./core/value.ts";\n');
  writeFileSync(join(tests, "transitive.test.ts"), 'import { value } from "../helper.ts";\nvoid value;\n');
  try {
    assert.deepEqual(
      checkTestCoreImports(tests).map((violation) => [basename(violation.file), violation.reason]),
      [
        ["helper.ts", "core-import"],
        ["re-export.test.ts", "core-import"],
        ["require.test.ts", "core-import"],
        ["runtime.test.mjs", "core-import"],
        ["runtime.test.ts", "core-import"],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
