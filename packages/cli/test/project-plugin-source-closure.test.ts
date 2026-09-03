import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  createToolPluginScaffold,
} from "@useprism/sdk/authoring";
import { validateProjectPluginSourceClosure } from "../src/project-plugin-source-closure.ts";

const encoder = new TextEncoder();

function capturedPlugin(
  source: Readonly<Record<string, string>> = {
    "index.mjs": 'throw new Error("validator executed source"); export {};\n',
  },
  options: Readonly<Record<string, unknown>> = {},
): unknown {
  const scaffold = createToolPluginScaffold("release-slug");
  assert.ok(scaffold);
  const manifestFile = scaffold.find((file) => file.path === "manifest.json");
  assert.ok(manifestFile);
  const manifest = JSON.parse(manifestFile.contents) as Record<string, unknown>;
  Object.assign(manifest, options);
  manifest.files = Object.keys(source).sort();
  return {
    pluginId: "release-slug",
    manifestBytes: encoder.encode(JSON.stringify(manifest)),
    runtimeFiles: Object.entries(source).map(([name, contents]) => ({ name, bytes: encoder.encode(contents) })),
  };
}

function expectCode(input: unknown, code: string): void {
  const result = validateProjectPluginSourceClosure(input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}

function padWithSpaces(bytes: Uint8Array, byteLength: number): Uint8Array {
  assert.ok(bytes.byteLength <= byteLength);
  const padded = new Uint8Array(byteLength);
  padded.set(bytes);
  padded.fill(0x20, bytes.byteLength);
  return padded;
}

test("accepts a one-file runtime closure without executing source", () => {
  const result = validateProjectPluginSourceClosure(capturedPlugin());
  assert.deepEqual(result, {
    ok: true,
    graph: {
      pluginId: "release-slug",
      entrypoint: "index.mjs",
      files: ["index.mjs"],
      edges: [],
    },
  });
  assert.equal(validateProjectPluginSourceClosure(capturedPlugin({ "index.mjs": "" })).ok, true);
  assert.equal(validateProjectPluginSourceClosure(capturedPlugin({
    "index.mjs": "const letters = /[a-z]/v; export { letters };\n",
  })).ok, true);
  assert.equal(validateProjectPluginSourceClosure(capturedPlugin({
    "index.mjs": `const value = root${".a".repeat(20_000)}; export { value };\n`,
  })).ok, true);
});

test("builds a sorted, deduplicated, deeply frozen graph for imports, re-exports, and cycles", () => {
  const source = {
    "a.mjs": "export const a = 1;\n",
    "b.mjs": "export const b = 2;\n",
    "c.mjs": "import './d.mjs'; import './index.mjs'; export const c = 3;\n",
    "d.mjs": "export const d = 4;\n",
    "index.mjs": [
      'export { a } from "./a.mjs";',
      'export * from "./b.mjs";',
      'import "./c.mjs";',
      'import "./a.mjs";',
      'import "./a.mjs";',
      'const text = "import ./missing.mjs"; // import "./also-missing.mjs"',
    ].join("\n"),
  };
  const result = validateProjectPluginSourceClosure(capturedPlugin(source));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph, {
    pluginId: "release-slug",
    entrypoint: "index.mjs",
    files: ["a.mjs", "b.mjs", "c.mjs", "d.mjs", "index.mjs"],
    edges: [
      { from: "c.mjs", specifier: "./d.mjs", to: "d.mjs" },
      { from: "c.mjs", specifier: "./index.mjs", to: "index.mjs" },
      { from: "index.mjs", specifier: "./a.mjs", to: "a.mjs" },
      { from: "index.mjs", specifier: "./b.mjs", to: "b.mjs" },
      { from: "index.mjs", specifier: "./c.mjs", to: "c.mjs" },
    ],
  });
  assert.equal(Object.isFrozen(result.graph), true);
  assert.equal(Object.isFrozen(result.graph.files), true);
  assert.equal(Object.isFrozen(result.graph.edges), true);
  assert.equal(Object.isFrozen(result.graph.edges[0]), true);
  assert.equal(result.graph.edges.filter((edge) => edge.specifier === "./a.mjs").length, 1);
  assert.throws(() => { (result.graph.files as string[]).push("other.mjs"); }, TypeError);
  assert.throws(() => {
    (result.graph.edges as unknown as Array<{ from: string }>)[0]!.from = "other.mjs";
  }, TypeError);
});

test("rejects malformed records, file-set mismatch, SDK byte bounds, and invalid manifests", () => {
  expectCode(null, "input-invalid");
  expectCode(Object.create({ pluginId: "release-slug" }), "input-invalid");

  const accessor = capturedPlugin() as Record<string, unknown>;
  Object.defineProperty(accessor, "pluginId", { enumerable: true, get: () => "release-slug" });
  expectCode(accessor, "input-invalid");

  const extraKey = capturedPlugin() as Record<string, unknown>;
  extraKey.extra = true;
  expectCode(extraKey, "input-invalid");

  const sparse = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array } | undefined> };
  sparse.runtimeFiles.length = 2;
  expectCode(sparse, "input-invalid");

  const fileAccessor = capturedPlugin() as { runtimeFiles: Array<Record<string, unknown>> };
  Object.defineProperty(fileAccessor.runtimeFiles[0], "bytes", {
    enumerable: true,
    get: () => encoder.encode("export {};"),
  });
  expectCode(fileAccessor, "input-invalid");

  const duplicate = capturedPlugin({ "dep.mjs": "export {};", "index.mjs": "import './dep.mjs';" }) as {
    runtimeFiles: Array<{ name: string; bytes: Uint8Array }>;
  };
  duplicate.runtimeFiles[1] = { ...duplicate.runtimeFiles[0]! };
  expectCode(duplicate, "runtime-files-invalid");

  const oversized = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  oversized.runtimeFiles[0] = { name: "index.mjs", bytes: new Uint8Array(MAX_PLUGIN_FILE_BYTES + 1) };
  expectCode(oversized, "input-invalid");

  let byteLengthAccesses = 0;
  const spoofedBytes = new Uint8Array(MAX_PLUGIN_FILE_BYTES + 1);
  Object.defineProperty(spoofedBytes, "byteLength", {
    configurable: true,
    get: () => {
      byteLengthAccesses += 1;
      return 1;
    },
  });
  const spoofed = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  spoofed.runtimeFiles[0] = { name: "index.mjs", bytes: spoofedBytes };
  expectCode(spoofed, "input-invalid");
  assert.equal(byteLengthAccesses, 0);

  const tooManyFiles = Object.fromEntries(Array.from({ length: 17 }, (_unused, index) => [
    index === 0 ? "index.mjs" : `file-${index}.mjs`,
    "export {};",
  ]));
  expectCode(capturedPlugin(tooManyFiles), "input-invalid");

  expectCode(capturedPlugin({ "README.md": "readme", "index.mjs": "export {};" }), "runtime-files-invalid");
  expectCode(capturedPlugin({
    "index.mjs": "import './index.test.mjs';",
    "index.test.mjs": "export {};",
  }), "runtime-files-invalid");
  expectCode(capturedPlugin({ "index.mjs": "export {};" }, { kind: "provider" }), "manifest-invalid");
  expectCode(capturedPlugin({ "index.mjs": "export {};" }, {
    dependencies: [{ pluginId: "other-tool", version: "1.0.0" }],
  }), "manifest-dependencies");
  expectCode(capturedPlugin({ "index.js": "export {};" }, { entrypoint: "index.js" }), "manifest-invalid");
  expectCode(capturedPlugin({ "index.mjs": "export {};" }, { entrypoint: undefined }), "manifest-invalid");

  const sidecar = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  sidecar.runtimeFiles.push({ name: "README.md", bytes: encoder.encode("sidecar") });
  expectCode(sidecar, "runtime-files-invalid");

  const reordered = capturedPlugin({
    "dep.mjs": "export {};",
    "index.mjs": "import './dep.mjs';",
  }) as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  reordered.runtimeFiles.reverse();
  expectCode(reordered, "runtime-files-invalid");

  const mismatch = capturedPlugin() as { pluginId: string };
  mismatch.pluginId = "other-tool";
  expectCode(mismatch, "plugin-id-mismatch");
});

test("accepts exact manifest and aggregate byte limits and rejects one byte beyond", () => {
  const exactManifest = capturedPlugin() as { manifestBytes: Uint8Array };
  exactManifest.manifestBytes = padWithSpaces(exactManifest.manifestBytes, MAX_PLUGIN_MANIFEST_BYTES);
  assert.equal(validateProjectPluginSourceClosure(exactManifest).ok, true);

  const oversizedManifest = capturedPlugin() as { manifestBytes: Uint8Array };
  oversizedManifest.manifestBytes = padWithSpaces(oversizedManifest.manifestBytes, MAX_PLUGIN_MANIFEST_BYTES + 1);
  expectCode(oversizedManifest, "input-invalid");

  const aggregate = capturedPlugin({
    "a.mjs": "export const a = 1;\n",
    "b.mjs": "export const b = 2;\n",
    "c.mjs": "export const c = 3;\n",
    "index.mjs": "import './a.mjs'; import './b.mjs'; import './c.mjs';\n",
  }) as { manifestBytes: Uint8Array; runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  let remaining = MAX_PLUGIN_SCAFFOLD_BYTES
    - aggregate.manifestBytes.byteLength
    - aggregate.runtimeFiles.reduce((total, file) => total + file.bytes.byteLength, 0);
  for (const file of aggregate.runtimeFiles) {
    const added = Math.min(remaining, MAX_PLUGIN_FILE_BYTES - file.bytes.byteLength);
    file.bytes = padWithSpaces(file.bytes, file.bytes.byteLength + added);
    remaining -= added;
  }
  assert.equal(remaining, 0);
  assert.equal(
    aggregate.manifestBytes.byteLength
      + aggregate.runtimeFiles.reduce((total, file) => total + file.bytes.byteLength, 0),
    MAX_PLUGIN_SCAFFOLD_BYTES,
  );
  assert.equal(validateProjectPluginSourceClosure(aggregate).ok, true);

  const finalFile = aggregate.runtimeFiles.at(-1);
  assert.ok(finalFile);
  assert.ok(finalFile.bytes.byteLength < MAX_PLUGIN_FILE_BYTES);
  finalFile.bytes = padWithSpaces(finalFile.bytes, finalFile.bytes.byteLength + 1);
  expectCode(aggregate, "input-invalid");
});

test("rejects invalid UTF-8 and syntax before resolving imports", () => {
  const invalid = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  invalid.runtimeFiles[0] = { name: "index.mjs", bytes: new Uint8Array([0xff]) };
  expectCode(invalid, "encoding-invalid");

  const truncated = capturedPlugin() as { runtimeFiles: Array<{ name: string; bytes: Uint8Array }> };
  truncated.runtimeFiles[0] = { name: "index.mjs", bytes: new Uint8Array([0xe2, 0x82]) };
  expectCode(truncated, "encoding-invalid");
  expectCode(capturedPlugin({ "index.mjs": "export {" }), "parse-invalid");
});

test("rejects every disallowed module specifier class and unresolved targets", () => {
  const unsupported = [
    "package-name",
    "node:fs",
    "/tmp/a.mjs",
    "C:\\\\tmp\\\\a.mjs",
    "\\\\server\\\\a.mjs",
    "file:///tmp/a.mjs",
    "data:text/javascript,export{}",
    "https://example.test/a.mjs",
    "./dep.mjs?x=1",
    "./dep.mjs#fragment",
    "./dep.js",
    "./nested/dep.mjs",
    "./dep%2fmjs.mjs",
  ];
  for (const specifier of unsupported) {
    expectCode(capturedPlugin({ "index.mjs": `import ${JSON.stringify(specifier)};` }), "specifier-unsupported");
  }
  for (const specifier of ["../dep.mjs", "./../dep.mjs"]) {
    expectCode(capturedPlugin({ "index.mjs": `import ${JSON.stringify(specifier)};` }), "path-escape");
  }
  expectCode(capturedPlugin({ "index.mjs": 'import "./missing.mjs";' }), "unresolved-import");
});

test("rejects dynamic import, require, import.meta, and unreachable files anywhere in the AST", () => {
  for (const source of [
    'const value = import("./dep.mjs");',
    "const value = import(specifier);",
  ]) {
    expectCode(capturedPlugin({ "index.mjs": source }), "dynamic-import");
  }
  expectCode(capturedPlugin({ "index.mjs": 'function nested() { return [require("x")]; }' }), "require-call");
  expectCode(capturedPlugin({ "index.mjs": 'function nested() { return new require("x"); }' }), "require-call");
  expectCode(capturedPlugin({ "index.mjs": "class Nested { value = import.meta.url; }" }), "import-meta");
  expectCode(capturedPlugin({ "index.mjs": "export {};", "unused.mjs": "export {};" }), "unreachable-file");

  const failure = validateProjectPluginSourceClosure(capturedPlugin({
    "index.mjs": 'throw new Error("private source"); import "package-name";',
  }));
  assert.equal(failure.ok, false);
  if (!failure.ok) {
    assert.equal(Object.isFrozen(failure), true);
    assert.equal(Object.isFrozen(failure.error), true);
    assert.equal(JSON.stringify(failure).includes("private source"), false);
  }
});
