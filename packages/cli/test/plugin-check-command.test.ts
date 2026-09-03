import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_SCAFFOLD_BYTES,
  createToolPluginScaffold,
} from "@useprism/sdk/authoring";
import { pluginCheckCommand } from "../src/commands/plugin-check.ts";
import { inspectToolPlugin, staticIdentityUnchanged } from "../src/plugin-check-static.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliBin = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");
const warning = "Warning: plugin check executes plugin code with ambient host authority; it is not a sandbox.\n";

type CheckedPlugin = Extract<Awaited<ReturnType<typeof inspectToolPlugin>>, { readonly ok: true }>["value"];

async function runCheckedPlugin(
  plugin: CheckedPlugin,
  dependencies: { readonly afterTemporaryHomeCreate?: (root: string) => Promise<void> | void } = {},
) {
  const runner = await import("../dist/plugin-check-child-runner.js");
  return runner.runPluginCheckChild(plugin, dependencies);
}

async function setup(pluginId = "my-tool"): Promise<{
  root: string;
  pluginRoot: string;
  outside: string;
  environment: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "prism-plugin-check-"));
  const pluginRoot = join(root, pluginId);
  const outside = join(root, "outside.txt");
  const home = join(root, "home");
  const config = join(root, "config");
  const state = join(root, "state");
  await Promise.all([pluginRoot, home, config, state].map((path) => mkdir(path)));
  await writeFile(outside, "outside-sentinel\n", "utf8");
  const scaffold = createToolPluginScaffold(pluginId);
  assert.ok(scaffold);
  await Promise.all(scaffold.map(({ path, contents }) => writeFile(join(pluginRoot, path), contents, "utf8")));
  return {
    root,
    pluginRoot,
    outside,
    environment: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: config,
      XDG_STATE_HOME: state,
    },
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function invoke(arguments_: readonly string[], cwd: string, environment: NodeJS.ProcessEnv, timeout = 12_000) {
  return spawnSync(process.execPath, [cliBin, ...arguments_], {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout,
  });
}

async function replaceSource(pluginRoot: string, transform: (source: string) => string): Promise<void> {
  const path = join(pluginRoot, "index.mjs");
  await writeFile(path, transform(await readFile(path, "utf8")), "utf8");
}

async function assertAbsent(path: string): Promise<void> {
  await assert.rejects(access(path, constants.F_OK), (error: unknown) => (
    typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT"
  ));
}

async function writeStaticTreeAtTotal(pluginRoot: string, totalBytes: number): Promise<void> {
  const manifestPath = join(pluginRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = ["a.txt", "b.txt", "c.txt", "index.mjs"];
  manifest.files = files;
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestContents, "utf8");
  await Promise.all([
    rm(join(pluginRoot, "README.md")),
    rm(join(pluginRoot, "index.test.mjs")),
  ]);

  let remaining = totalBytes - Buffer.byteLength(manifestContents);
  assert.ok(remaining >= 0 && remaining <= files.length * MAX_PLUGIN_FILE_BYTES);
  for (const file of files) {
    const bytes = Math.min(remaining, MAX_PLUGIN_FILE_BYTES);
    await writeFile(join(pluginRoot, file), "x".repeat(bytes), "utf8");
    remaining -= bytes;
  }
  assert.equal(remaining, 0);
}

test("plugin check grammar fails closed with usage exit 2", async (context) => {
  const fixture = await setup();
  try {
    const cases: readonly [string, readonly string[], RegExp][] = [
      ["missing path", ["plugin", "check"], /^Missing plugin path/],
      ["unknown option", ["plugin", "check", fixture.pluginRoot, "--wat"], /^Unknown option: --wat/],
      ["duplicate json", ["plugin", "check", fixture.pluginRoot, "--json", "--json"], /^Option --json may only be specified once/],
      ["extra positional", ["plugin", "check", fixture.pluginRoot, "extra"], /^Unexpected argument: extra/],
    ];
    for (const [name, arguments_, expected] of cases) {
      await context.test(name, () => {
        const result = invoke(arguments_, fixture.root, fixture.environment);
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, expected);
        assert.match(result.stderr, /Usage: prism plugin check/);
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

test("plugin check reports one human result and warns before ambient code execution", async () => {
  const fixture = await setup();
  try {
    const before = await Promise.all(["README.md", "index.mjs", "index.test.mjs", "manifest.json"].map(
      (file) => readFile(join(fixture.pluginRoot, file), "utf8"),
    ));
    const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, warning);
    assert.equal(result.stdout, [
      "Plugin my-tool passed authoring checks.",
      "Fixture operation: echo",
      "Execution boundary: ambient subprocess (not a sandbox)",
      "Cleanup: original child process group confirmed absent",
      "Detached or re-parented descendants: not controlled",
      "",
    ].join("\n"));
    const after = await Promise.all(["README.md", "index.mjs", "index.test.mjs", "manifest.json"].map(
      (file) => readFile(join(fixture.pluginRoot, file), "utf8"),
    ));
    assert.deepEqual(after, before);
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("plugin check JSON is one closed value without paths or fixture values", async () => {
  const fixture = await setup();
  try {
    const result = invoke(["plugin", "check", fixture.pluginRoot, "--json"], fixture.root, fixture.environment);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, warning);
    assert.deepEqual(JSON.parse(result.stdout), {
      version: "prism-plugin-check-result-v1",
      status: "ok",
      pluginId: "my-tool",
      kind: "tool",
      operation: "echo",
      executionBoundary: "ambient-subprocess",
      sandboxed: false,
      cleanup: "original-process-group-confirmed",
      detachedDescendants: "not-controlled",
    });
    assert.equal(result.stdout.endsWith("\n"), true);
    assert.equal(result.stdout.split("\n").filter(Boolean).length, 1);
    assert.equal(result.stdout.includes(fixture.root), false);
    assert.equal(result.stdout.includes("Hello from Prism"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("static plugin inspection retains copied raw bytes for every captured file", async () => {
  const fixture = await setup();
  try {
    const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) return;
    for (const file of inspected.value.files) {
      assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes), file.contents);
    }
    const entrypoint = inspected.value.files.find((file) => file.path === "index.mjs");
    assert.ok(entrypoint);
    await writeFile(join(fixture.pluginRoot, "index.mjs"), "export {};\n", "utf8");
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(entrypoint.bytes), entrypoint.contents);
  } finally {
    await fixture.cleanup();
  }
});

test("invalid manifests and source trees fail before any child execution", async (context) => {
  await context.test("manifest mutation", async () => {
    const fixture = await setup();
    try {
      const importedMarker = join(fixture.root, "imported.txt");
      await replaceSource(fixture.pluginRoot, (source) => (
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(importedMarker)}, "imported");\n${source}`
      ));
      const manifestPath = join(fixture.pluginRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.apiVersion = 2;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: manifest-invalid\n");
      await assertAbsent(importedMarker);
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("undeclared file", async () => {
    const fixture = await setup();
    try {
      await writeFile(join(fixture.pluginRoot, "undeclared.mjs"), "export {};\n", "utf8");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: source-tree\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("missing declared file", async () => {
    const fixture = await setup();
    try {
      await rm(join(fixture.pluginRoot, "index.mjs"));
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: source-tree\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("symlinked entry", async () => {
    const fixture = await setup();
    try {
      await rm(join(fixture.pluginRoot, "README.md"));
      await symlink(fixture.outside, join(fixture.pluginRoot, "README.md"));
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: source-tree\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("symlinked path component", async () => {
    const fixture = await setup();
    try {
      const linkedRoot = join(fixture.root, "linked-root");
      await symlink(fixture.root, linkedRoot);
      const result = invoke(["plugin", "check", join(linkedRoot, "my-tool")], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: path-symlink\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("non-directory path", async () => {
    const fixture = await setup();
    try {
      const result = invoke(["plugin", "check", fixture.outside], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: plugin-path\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("directory and manifest ID mismatch", async () => {
    const fixture = await setup();
    try {
      const manifestPath = join(fixture.pluginRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.id = "other-tool";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: plugin-id-mismatch\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("invalid UTF-8 manifest", async () => {
    const fixture = await setup();
    try {
      await writeFile(join(fixture.pluginRoot, "manifest.json"), new Uint8Array([0xff]));
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: manifest-invalid\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("malformed JSON manifest", async () => {
    const fixture = await setup();
    try {
      await writeFile(join(fixture.pluginRoot, "manifest.json"), "{\"id\":", "utf8");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: manifest-invalid\n");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("unsupported plugin kind", async () => {
    const fixture = await setup();
    try {
      const manifestPath = join(fixture.pluginRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.kind = "provider";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Prism plugin check failed: unsupported-kind\n");
    } finally {
      await fixture.cleanup();
    }
  });
});

test("static plugin inspection enforces the complete scaffold byte boundary", async (context) => {
  for (const [name, totalBytes, expectedOk] of [
    ["boundary", MAX_PLUGIN_SCAFFOLD_BYTES, true],
    ["one beyond", MAX_PLUGIN_SCAFFOLD_BYTES + 1, false],
  ] as const) {
    await context.test(name, async () => {
      const fixture = await setup();
      try {
        await writeStaticTreeAtTotal(fixture.pluginRoot, totalBytes);
        const result = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
        assert.equal(result.ok, expectedOk);
        if (!expectedOk && !result.ok) assert.equal(result.code, "source-tree");
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test("static plugin inspection admits only fixed authoring sidecars outside the runtime closure", async (context) => {
  await context.test("new scaffold captures only its manifest and declared runtime file", async () => {
    const fixture = await setup();
    try {
      const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
      assert.equal(inspected.ok, true);
      if (!inspected.ok) return;
      assert.deepEqual(inspected.value.files.map(({ path }) => path), ["index.mjs", "manifest.json"]);
      assert.equal(await staticIdentityUnchanged(inspected.value), true);
      await writeFile(join(fixture.pluginRoot, "README.md"), "mutated sidecar\n", "utf8");
      assert.equal(await staticIdentityUnchanged(inspected.value), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("sidecars may be absent but arbitrary additions are rejected", async () => {
    const fixture = await setup();
    try {
      await Promise.all([
        rm(join(fixture.pluginRoot, "README.md")),
        rm(join(fixture.pluginRoot, "index.test.mjs")),
      ]);
      const runtimeOnly = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
      assert.equal(runtimeOnly.ok, true);
      if (!runtimeOnly.ok) return;
      assert.deepEqual(runtimeOnly.value.files.map(({ path }) => path), ["index.mjs", "manifest.json"]);
      await writeFile(join(fixture.pluginRoot, "README.md"), "new sidecar\n", "utf8");
      assert.equal(await staticIdentityUnchanged(runtimeOnly.value), false);
      const withSidecar = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
      assert.equal(withSidecar.ok, true);
      await writeFile(join(fixture.pluginRoot, "undeclared.mjs"), "export {};\n", "utf8");
      const added = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
      assert.equal(added.ok, false);
      if (!added.ok) assert.equal(added.code, "source-tree");
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("legacy declared sidecars remain captured", async () => {
    const fixture = await setup();
    try {
      const manifestPath = join(fixture.pluginRoot, "manifest.json");
      const legacyManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      legacyManifest.files = ["README.md", "index.mjs", "index.test.mjs"];
      await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
      const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
      assert.equal(inspected.ok, true);
      if (!inspected.ok) return;
      assert.deepEqual(inspected.value.files.map(({ path }) => path), [
        "index.mjs",
        "index.test.mjs",
        "manifest.json",
        "README.md",
      ]);
      const command = invoke(["plugin", "check", fixture.pluginRoot, "--json"], fixture.root, fixture.environment);
      assert.equal(command.status, 0, command.stderr);
      assert.equal(command.stderr, warning);
      assert.equal(JSON.parse(command.stdout).pluginId, "my-tool");
    } finally {
      await fixture.cleanup();
    }
  });
});

test("static plugin inspection rejects a path swapped around the opened file handle", async () => {
  const fixture = await setup();
  const manifestPath = join(fixture.pluginRoot, "manifest.json");
  const originalPath = join(fixture.root, "original-manifest.json");
  let swapped = false;
  try {
    const contents = await readFile(manifestPath);
    const result = await inspectToolPlugin(fixture.pluginRoot, fixture.root, {
      beforeFileOpen: async (path) => {
        if (path !== manifestPath || swapped) return;
        await rename(manifestPath, originalPath);
        await writeFile(manifestPath, contents);
        swapped = true;
      },
      afterFileOpen: async (path) => {
        if (path !== manifestPath || !swapped) return;
        await rm(manifestPath);
        await rename(originalPath, manifestPath);
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "path-changed");
  } finally {
    await fixture.cleanup();
  }
});

test("static plugin inspection rejects a symlink swapped immediately before a POSIX no-follow read", {
  skip: process.platform === "win32" || typeof constants.O_NOFOLLOW !== "number",
}, async () => {
  const fixture = await setup();
  const manifestPath = join(fixture.pluginRoot, "manifest.json");
  const originalPath = join(fixture.root, "original-manifest.json");
  try {
    const result = await inspectToolPlugin(fixture.pluginRoot, fixture.root, {
      beforeFileOpen: async (path) => {
        if (path !== manifestPath) return;
        await rename(manifestPath, originalPath);
        await symlink(originalPath, manifestPath);
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "manifest-invalid");
  } finally {
    await fixture.cleanup();
  }
});

test("static identity remains valid when an admitted ancestor gets an unrelated sibling", async () => {
  const fixture = await setup();
  try {
    const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) return;
    await mkdir(join(fixture.root, "unrelated-sibling"));
    assert.equal(await staticIdentityUnchanged(inspected.value), true);
  } finally {
    await fixture.cleanup();
  }
});

test("the child executes the exact statically admitted snapshot", async () => {
  const fixture = await setup();
  try {
    const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) return;
    await replaceSource(fixture.pluginRoot, () => "throw new Error('replacement source executed');\n");

    assert.deepEqual(await runCheckedPlugin(inspected.value), { ok: true, operation: "echo" });
  } finally {
    await fixture.cleanup();
  }
});

test("the verified snapshot excludes undeclared relative modules", async () => {
  const fixture = await setup();
  try {
    const entrypointPath = join(fixture.pluginRoot, "index.mjs");
    await writeFile(join(fixture.root, "outside-module.mjs"), await readFile(entrypointPath));
    await writeFile(
      entrypointPath,
      'export { handle, prismToolAuthoringFixture } from "../outside-module.mjs";\n',
      "utf8",
    );
    const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) return;

    assert.deepEqual(await runCheckedPlugin(inspected.value), { ok: false, code: "execution" });
  } finally {
    await fixture.cleanup();
  }
});

test("partial isolated HOME setup removes the allocated root", async () => {
  const fixture = await setup();
  let isolatedRoot: string | undefined;
  try {
    const inspected = await inspectToolPlugin(fixture.pluginRoot, fixture.root);
    assert.equal(inspected.ok, true);
    if (!inspected.ok) return;
    const result = await runCheckedPlugin(inspected.value, {
      afterTemporaryHomeCreate: async (root) => {
        isolatedRoot = root;
        await writeFile(join(root, "config"), "collision\n", "utf8");
      },
    });
    assert.deepEqual(result, { ok: false, code: "cleanup-failed" });
    assert.ok(isolatedRoot);
    await assertAbsent(isolatedRoot);
  } finally {
    await fixture.cleanup();
  }
});

test("registration and fixture drift fail with stable errors and no raw child output", async (context) => {
  const cases: readonly [string, (source: string) => string, string][] = [
    ["registration", (source) => source.replace('pluginId: "my-tool"', 'pluginId: "other-tool"'), "registration-invalid"],
    ["fixture version", (source) => source.replace("prism-tool-authoring-fixture-v1", "future-fixture"), "fixture-invalid"],
    ["fixture result", (source) => source.replace('expected: Object.freeze({ echoed: "Hello from Prism." })', 'expected: Object.freeze({ echoed: "different" })'), "fixture-mismatch"],
  ];
  for (const [name, transform, code] of cases) {
    await context.test(name, async () => {
      const fixture = await setup();
      try {
        await replaceSource(fixture.pluginRoot, transform);
        const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, `${warning}Prism plugin check failed: ${code}\n`);
        assert.equal(result.stderr.includes(fixture.pluginRoot), false);
        assert.equal(result.stderr.includes("Hello from Prism"), false);
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test("fixture expected values and child results enforce the JSON byte boundary", async (context) => {
  const exactStringLength = 65_536 - 2;
  const cases: readonly [string, number, number, number, string | null][] = [
    ["boundary", exactStringLength, exactStringLength, 0, null],
    ["fixture one beyond", exactStringLength + 1, exactStringLength + 1, 1, "fixture-invalid"],
    ["result one beyond", 0, exactStringLength + 1, 1, "result-invalid"],
  ];
  for (const [name, expectedLength, resultLength, status, code] of cases) {
    await context.test(name, async () => {
      const fixture = await setup();
      try {
        await replaceSource(fixture.pluginRoot, (source) => source
          .replace(
            'expected: Object.freeze({ echoed: "Hello from Prism." }),',
            expectedLength === 0 ? "expected: null," : `expected: "x".repeat(${expectedLength}),`,
          )
          .replace(
            "return { echoed: input.message };",
            resultLength === 0 ? "return null;" : `return "x".repeat(${resultLength});`,
          ));
        const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
        assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
        assert.equal(result.stdout, status === 0 ? [
          "Plugin my-tool passed authoring checks.",
          "Fixture operation: echo",
          "Execution boundary: ambient subprocess (not a sandbox)",
          "Cleanup: original child process group confirmed absent",
          "Detached or re-parented descendants: not controlled",
          "",
        ].join("\n") : "");
        assert.equal(result.stderr, code === null
          ? warning
          : `${warning}Prism plugin check failed: ${code}\n`);
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test("child stdout and stderr are rejected at the boundary and killed one byte beyond", async (context) => {
  const marker = "SENSITIVE-CHILD-MARKER";
  for (const stream of ["stdout", "stderr"] as const) {
    for (const [name, bytes, code] of [
      ["boundary", 65_536, "unexpected-output"],
      ["one beyond", 65_537, "output-limit"],
    ] as const) {
      await context.test(`${stream} ${name}`, async () => {
        const fixture = await setup();
        try {
          await replaceSource(fixture.pluginRoot, (source) => (
            `process.${stream}.write(${JSON.stringify(marker)} + "x".repeat(${bytes} - ${marker.length}));\n${source}`
          ));
          const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
          assert.equal(result.status, 1);
          assert.equal(result.stdout, "");
          assert.equal(result.stderr, `${warning}Prism plugin check failed: ${code}\n`);
          assert.equal(result.stderr.includes(marker), false);
        } finally {
          await fixture.cleanup();
        }
      });
    }
  }
});

test("the checker strips caller secrets and replaces HOME before import", async () => {
  const fixture = await setup();
  try {
    const callerHome = fixture.environment.HOME;
    await replaceSource(fixture.pluginRoot, (source) => `
if (process.env.PRISM_TEST_SECRET || process.env.HOME === ${JSON.stringify(callerHome)}) {
  throw new Error("SENSITIVE-ENV-MARKER");
}
${source}`);
    const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, {
      ...fixture.environment,
      PRISM_TEST_SECRET: "SENSITIVE-ENV-MARKER",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, warning);
    assert.equal(result.stdout.includes("SENSITIVE-ENV-MARKER"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("timeouts terminate the checker process group and confirm descendant cleanup", { timeout: 20_000 }, async () => {
  const fixture = await setup();
  let descendantPid: number | undefined;
  try {
    const pidPath = join(fixture.pluginRoot, "descendant.pid");
    await writeFile(join(fixture.pluginRoot, "index.mjs"), `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(${JSON.stringify(pidPath)}, String(descendant.pid));
await new Promise(() => {});
`, "utf8");
    const startedAt = Date.now();
    const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${warning}Prism plugin check failed: timeout\n`);
    assert.ok(Date.now() - startedAt >= 6_500 && Date.now() - startedAt < 10_000);
    descendantPid = Number(await readFile(pidPath, "utf8"));
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
    await assert.rejects(async () => process.kill(descendantPid!, 0), (error: unknown) => (
      typeof error === "object" && error !== null && Reflect.get(error, "code") === "ESRCH"
    ));
  } finally {
    if (descendantPid !== undefined) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fixture.cleanup();
  }
});

test("an exited child with undrained stdio fails closed", { timeout: 10_000 }, async () => {
  const fixture = await setup();
  const pidPath = join(fixture.pluginRoot, "detached.pid");
  let descendantPid: number | undefined;
  try {
    await replaceSource(fixture.pluginRoot, (source) => `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const detached = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], {
  detached: true,
  stdio: ["ignore", process.stdout, "ignore"],
});
detached.unref();
writeFileSync(${JSON.stringify(pidPath)}, String(detached.pid));
${source}`);
    const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment, 5_000);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${warning}Prism plugin check failed: cleanup-failed\n`);
    descendantPid = Number(await readFile(pidPath, "utf8"));
  } finally {
    if (descendantPid !== undefined) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fixture.cleanup();
  }
});

test("success qualifies cleanup when a detached descendant is not observable", { timeout: 10_000 }, async () => {
  const fixture = await setup();
  const pidPath = join(fixture.root, "detached-unobserved.pid");
  let descendantPid: number | undefined;
  try {
    await replaceSource(fixture.pluginRoot, (source) => `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const detached = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], {
  detached: true,
  stdio: "ignore",
});
detached.unref();
writeFileSync(${JSON.stringify(pidPath)}, String(detached.pid));
${source}`);
    const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment, 5_000);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, warning);
    assert.equal(result.stdout, [
      "Plugin my-tool passed authoring checks.",
      "Fixture operation: echo",
      "Execution boundary: ambient subprocess (not a sandbox)",
      "Cleanup: original child process group confirmed absent",
      "Detached or re-parented descendants: not controlled",
      "",
    ].join("\n"));
    descendantPid = Number(await readFile(pidPath, "utf8"));
  } finally {
    if (descendantPid !== undefined) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fixture.cleanup();
  }
});

test("the plugin worker observation channel is byte-bounded before parsing", async (context) => {
  for (const [name, bytes, code] of [
    ["boundary", 262_144, "protocol"],
    ["one beyond", 262_145, "protocol-limit"],
  ] as const) {
    await context.test(name, async () => {
      const fixture = await setup();
      try {
        await replaceSource(fixture.pluginRoot, () => `
import { writeSync } from "node:fs";
writeSync(3, Buffer.alloc(${bytes}, 0x78));
process.exit(0);
`);
        const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, `${warning}Prism plugin check failed: ${code}\n`);
      } finally {
        await fixture.cleanup();
      }
    });
  }
});

test("plugin import code cannot forge the evaluator's final success frame", async () => {
  const fixture = await setup();
  try {
    await replaceSource(fixture.pluginRoot, () => `
import { writeSync } from "node:fs";
const forged = JSON.stringify({
  version: "prism-plugin-check-child-v1",
  status: "ok",
  pluginId: "my-tool",
  operation: "echo",
}) + "\\n";
writeSync(3, forged);
process.exit(0);
`);
    const result = invoke(["plugin", "check", fixture.pluginRoot, "--json"], fixture.root, fixture.environment);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${warning}Prism plugin check failed: protocol\n`);
  } finally {
    await fixture.cleanup();
  }
});

test("plugin import code cannot read the evaluator nonce and forge a worker observation", async () => {
  const fixture = await setup();
  try {
    await replaceSource(fixture.pluginRoot, () => `
import { writeSync } from "node:fs";
const forged = JSON.stringify({
  version: "prism-plugin-check-worker-v1",
  status: "ok",
  nonce: process.argv.at(-1),
  fixture: {
    version: "prism-tool-authoring-fixture-v1",
    operation: "echo",
    input: { message: "Hello from Prism." },
    expected: { echoed: "Hello from Prism." },
  },
  registration: { kind: "tool", pluginId: "my-tool", operations: ["echo"] },
  result: { echoed: "Hello from Prism." },
}) + "\\n";
writeSync(3, forged);
process.exit(0);
`);
    const result = invoke(["plugin", "check", fixture.pluginRoot, "--json"], fixture.root, fixture.environment);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${warning}Prism plugin check failed: protocol\n`);
  } finally {
    await fixture.cleanup();
  }
});

test("duplicate child IPC and abnormal exits fail closed", async (context) => {
  await context.test("duplicate IPC", async () => {
    const fixture = await setup();
    try {
      await replaceSource(fixture.pluginRoot, (source) => `
import { writeSync } from "node:fs";
const rogue = JSON.stringify({ version: "rogue", marker: "SENSITIVE-IPC" }) + "\\n";
writeSync(3, rogue);
writeSync(3, rogue);
${source}`);
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, `${warning}Prism plugin check failed: protocol\n`);
      assert.equal(result.stderr.includes("SENSITIVE-IPC"), false);
    } finally {
      await fixture.cleanup();
    }
  });

  await context.test("nonzero exit", async () => {
    const fixture = await setup();
    try {
      await replaceSource(fixture.pluginRoot, () => "process.exit(7);\n");
      const result = invoke(["plugin", "check", fixture.pluginRoot], fixture.root, fixture.environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, `${warning}Prism plugin check failed: execution\n`);
    } finally {
      await fixture.cleanup();
    }
  });
});

test("plugin check command rejects invalid manifests directly before it can import source", async () => {
  const fixture = await setup();
  try {
    const importedMarker = join(fixture.root, "direct-imported.txt");
    await replaceSource(fixture.pluginRoot, (source) => (
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(importedMarker)}, "imported");\n${source}`
    ));
    await writeFile(join(fixture.pluginRoot, "manifest.json"), "{\"id\":", "utf8");
    const stdout: string[] = [];
    const stderr: string[] = [];
    const status = await pluginCheckCommand({
      arguments: [fixture.pluginRoot],
      stdout: { write: (value: string) => stdout.push(value) },
      stderr: { write: (value: string) => stderr.push(value) },
      currentWorkingDirectory: fixture.root,
      environment: fixture.environment,
    });
    assert.equal(status, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["Prism plugin check failed: manifest-invalid\n"]);
    await assertAbsent(importedMarker);
  } finally {
    await fixture.cleanup();
  }
});
