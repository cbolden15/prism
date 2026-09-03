import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const checker = resolve(repositoryRoot, "scripts", "check-package-graph.mjs");
const extensionPath = "packages/cli/src/plugin-check-worker.ts";

interface Execution {
  readonly code: string | number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runFixture(files: Readonly<Record<string, string>>): Promise<Execution> {
  const root = await mkdtemp(join(tmpdir(), "prism-package-graph-"));
  try {
    await mkdir(resolve(root, "packages", "cli", "src"), { recursive: true });
    await writeFile(
      resolve(root, "packages", "cli", "package.json"),
      JSON.stringify({ name: "@useprism/cli", version: "0.1.0", type: "module" }),
      "utf8",
    );
    for (const [path, source] of Object.entries(files)) {
      const destination = resolve(root, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, source, "utf8");
    }
    return await new Promise((resolvePromise) => {
      execFile(
        process.execPath,
        [checker, "--root", root],
        { cwd: repositoryRoot, env: process.env },
        (error, stdout, stderr) => resolvePromise({
          code: error?.code ?? null,
          stdout,
          stderr,
        }),
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("the package graph permits only the declared plugin-check worker entrypoint import", async () => {
  const result = await runFixture({
    [extensionPath]: "const entrypoint = process.argv[2];\nawait import(entrypoint);\n",
  });

  assert.equal(result.code, null);
  assert.match(result.stdout, /^package graph ok:/);
  assert.equal(result.stderr, "");
});

test("the package graph rejects the same runtime import outside the declared module", async () => {
  const result = await runFixture({
    [extensionPath]: "export {};\n",
    "packages/cli/src/other.ts": "const entrypoint = process.argv[2];\nawait import(entrypoint);\n",
  });

  assert.notEqual(result.code, null);
  assert.match(result.stderr, /other\.ts: non-static module resolution is not graph-checkable/);
});

test("the package graph rejects a different runtime import expression in the declared module", async () => {
  const result = await runFixture({
    [extensionPath]: "const candidate = process.argv[2];\nawait import(candidate);\n",
  });

  assert.notEqual(result.code, null);
  assert.match(result.stderr, /non-static module resolution is not graph-checkable/);
  assert.match(result.stderr, /requires exactly 1 import\(entrypoint\); found 0/);
});

test("the package graph rejects duplicate runtime entrypoint imports", async () => {
  const result = await runFixture({
    [extensionPath]: [
      "const entrypoint = process.argv[2];",
      "await import(entrypoint);",
      "await import(entrypoint);",
      "",
    ].join("\n"),
  });

  assert.notEqual(result.code, null);
  assert.match(result.stderr, /requires exactly 1 import\(entrypoint\); found 2/);
});

test("the package graph rejects a stale runtime extension rule", async () => {
  const result = await runFixture({ [extensionPath]: "export {};\n" });

  assert.notEqual(result.code, null);
  assert.match(result.stderr, /requires exactly 1 import\(entrypoint\); found 0/);
});
