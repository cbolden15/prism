import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createToolPluginScaffold } from "@useprism/sdk/authoring";
import { pluginCreateCommand } from "../src/commands/plugin-create.ts";
import {
  AUTHORING_ROOT_MARKER_CONTENTS,
  AUTHORING_ROOT_MARKER_NAME,
  DEFAULT_AUTHORING_ROOT_BASENAME,
  NativeAuthoringFailure,
  type ManagedPluginCreateInput,
} from "../src/native-authoring.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliBin = resolve(repositoryRoot, "packages", "cli", "dist", "bin.js");

async function setup(): Promise<{
  root: string;
  cwd: string;
  outside: string;
  environment: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-plugin-create-")));
  const cwd = join(root, "work");
  const outside = join(root, "outside.txt");
  const home = join(root, "home");
  const config = join(root, "config");
  const state = join(root, "state");
  await Promise.all([cwd, home, config, state].map((path) => mkdir(path, { mode: 0o700 })));
  await writeFile(outside, "outside-sentinel\n", { encoding: "utf8", mode: 0o600 });
  return {
    root,
    cwd,
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

function invoke(arguments_: readonly string[], cwd: string, environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [cliBin, ...arguments_], {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 10_000,
  });
}

async function invokeAsync(arguments_: readonly string[], cwd: string, environment: NodeJS.ProcessEnv) {
  return new Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliBin, ...arguments_], {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

async function assertScaffold(authoringRoot: string, pluginId: string): Promise<void> {
  const expected = createToolPluginScaffold(pluginId);
  assert.ok(expected);
  const pluginRoot = join(authoringRoot, pluginId);
  assert.deepEqual((await readdir(pluginRoot)).sort(), expected.map(({ path }) => path));
  for (const file of expected) {
    const path = join(pluginRoot, file.path);
    assert.equal(await readFile(path, "utf8"), file.contents);
    assert.equal((await stat(path)).mode & 0o777, 0o644);
  }
}

async function assertManagedRoot(authoringRoot: string, pluginIds: readonly string[]): Promise<void> {
  assert.equal((await stat(authoringRoot)).mode & 0o777, 0o700);
  const markerPath = join(authoringRoot, AUTHORING_ROOT_MARKER_NAME);
  assert.equal(await readFile(markerPath, "utf8"), AUTHORING_ROOT_MARKER_CONTENTS);
  assert.equal((await stat(markerPath)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(authoringRoot)).sort(), [AUTHORING_ROOT_MARKER_NAME, ...pluginIds].sort());
  for (const pluginId of pluginIds) await assertScaffold(authoringRoot, pluginId);
}

test("plugin create grammar fails closed with usage exit 2", async (context) => {
  const fixture = await setup();
  try {
    const cases: readonly [string, readonly string[], RegExp][] = [
      ["missing plugin subcommand", ["plugin"], /^Missing plugin subcommand/],
      ["unknown plugin subcommand", ["plugin", "publish"], /^Unknown plugin subcommand: publish/],
      ["missing name", ["plugin", "create"], /^Missing plugin name/],
      ["invalid name", ["plugin", "create", "@scope/tool"], /^Invalid plugin name/],
      ["absolute name", ["plugin", "create", "/tmp/tool"], /^Invalid plugin name/],
      ["traversal name", ["plugin", "create", "../tool"], /^Invalid plugin name/],
      ["nested name", ["plugin", "create", "nested/tool"], /^Invalid plugin name/],
      ["missing directory", ["plugin", "create", "my-tool", "--directory"], /^Option --directory requires a value/],
      ["duplicate directory", ["plugin", "create", "my-tool", "--directory", ".", "--directory", "."], /^Option --directory may only be specified once/],
      ["unknown option", ["plugin", "create", "my-tool", "--force"], /^Unknown option: --force/],
      ["extra positional", ["plugin", "create", "my-tool", "extra"], /^Unexpected argument: extra/],
    ];
    for (const [name, arguments_, expected] of cases) {
      await context.test(name, () => {
        const result = invoke(arguments_, fixture.cwd, fixture.environment);
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, expected);
        assert.match(result.stderr, /Usage: prism plugin create/);
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create preserves the shared double-dash option terminator", async () => {
  const fixture = await setup();
  try {
    const result = invoke(["plugin", "create", "--", "double-dash-tool"], fixture.cwd, fixture.environment);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "Created tool plugin: double-dash-tool\n");
    assert.equal(result.stderr, "");
    await assertManagedRoot(join(fixture.cwd, DEFAULT_AUTHORING_ROOT_BASENAME), ["double-dash-tool"]);
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create initializes the default or explicit managed root with the exact scaffold", async () => {
  const fixture = await setup();
  try {
    const defaultResult = invoke(["plugin", "create", "my-tool"], fixture.cwd, fixture.environment);
    assert.equal(defaultResult.status, 0);
    assert.equal(defaultResult.stdout, "Created tool plugin: my-tool\n");
    assert.equal(defaultResult.stderr, "");
    await assertManagedRoot(join(fixture.cwd, DEFAULT_AUTHORING_ROOT_BASENAME), ["my-tool"]);

    const explicitRoot = join(fixture.root, "explicit-authoring-root");
    const explicitResult = invoke([
      "plugin",
      "create",
      "other-tool",
      "--directory",
      explicitRoot,
    ], fixture.cwd, fixture.environment);
    assert.equal(explicitResult.status, 0);
    assert.equal(explicitResult.stdout, "Created tool plugin: other-tool\n");
    assert.equal(explicitResult.stderr, "");
    await assertManagedRoot(explicitRoot, ["other-tool"]);
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create reuses only an existing valid managed root", async () => {
  const fixture = await setup();
  try {
    const authoringRoot = join(fixture.root, "managed");
    assert.equal(invoke(["plugin", "create", "one-tool", "--directory", authoringRoot], fixture.cwd, fixture.environment).status, 0);
    assert.equal(invoke(["plugin", "create", "two-tool", "--directory", authoringRoot], fixture.cwd, fixture.environment).status, 0);
    await assertManagedRoot(authoringRoot, ["one-tool", "two-tool"]);
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create rejects unmarked and invalid managed roots without claiming them", async (context) => {
  const fixture = await setup();
  try {
    const emptyRoot = join(fixture.root, "empty");
    const populatedRoot = join(fixture.root, "populated");
    await mkdir(emptyRoot, { mode: 0o700 });
    await mkdir(populatedRoot, { mode: 0o700 });
    await writeFile(join(populatedRoot, "keep.txt"), "keep\n", "utf8");
    for (const [name, root] of [["empty", emptyRoot], ["populated", populatedRoot]] as const) {
      await context.test(name, () => {
        const result = invoke(["plugin", "create", "my-tool", "--directory", root], fixture.cwd, fixture.environment);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "Prism plugin create failed: root-unmanaged\n");
      });
    }
    assert.deepEqual(await readdir(emptyRoot), []);
    assert.equal(await readFile(join(populatedRoot, "keep.txt"), "utf8"), "keep\n");

    const managedRoot = join(fixture.root, "managed");
    assert.equal(invoke(["plugin", "create", "seed-tool", "--directory", managedRoot], fixture.cwd, fixture.environment).status, 0);
    await chmod(managedRoot, 0o755);
    const wrongMode = invoke(["plugin", "create", "mode-tool", "--directory", managedRoot], fixture.cwd, fixture.environment);
    assert.equal(wrongMode.status, 1);
    assert.equal(wrongMode.stderr, "Prism plugin create failed: root-invalid\n");
    await chmod(managedRoot, 0o700);
    await writeFile(join(managedRoot, AUTHORING_ROOT_MARKER_NAME), "changed\n", "utf8");
    const changedMarker = invoke(["plugin", "create", "marker-tool", "--directory", managedRoot], fixture.cwd, fixture.environment);
    assert.equal(changedMarker.status, 1);
    assert.equal(changedMarker.stderr, "Prism plugin create failed: root-invalid\n");
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create rejects missing, non-directory, and symlinked root parents", async (context) => {
  const fixture = await setup();
  try {
    const realParent = join(fixture.root, "real-parent");
    const linkedParent = join(fixture.root, "linked-parent");
    const finalLink = join(fixture.root, "final-link");
    await mkdir(realParent, { mode: 0o700 });
    await symlink(realParent, linkedParent);
    await symlink(realParent, finalLink);
    const cases: readonly [string, string, string][] = [
      ["missing parent", join(fixture.root, "missing", "managed"), "root-parent-missing"],
      ["non-directory parent", join(fixture.outside, "managed"), "root-parent-not-directory"],
      ["symlinked parent", join(linkedParent, "managed"), "root-parent-symlink"],
      ["symlinked final root", finalLink, "root-parent-symlink"],
    ];
    for (const [name, authoringRoot, code] of cases) {
      await context.test(name, () => {
        const result = invoke(["plugin", "create", "my-tool", "--directory", authoringRoot], fixture.cwd, fixture.environment);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, `Prism plugin create failed: ${code}\n`);
      });
    }
    assert.deepEqual(await readdir(realParent), []);
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create refuses every existing destination type and never overwrites", async (context) => {
  const fixture = await setup();
  try {
    const authoringRoot = join(fixture.root, "managed");
    assert.equal(invoke(["plugin", "create", "seed-tool", "--directory", authoringRoot], fixture.cwd, fixture.environment).status, 0);
    await writeFile(join(authoringRoot, "file-tool"), "keep-file\n", "utf8");
    await mkdir(join(authoringRoot, "directory-tool"));
    await symlink(fixture.outside, join(authoringRoot, "symlink-tool"));
    for (const pluginId of ["file-tool", "directory-tool", "symlink-tool"] as const) {
      await context.test(pluginId, () => {
        const result = invoke(["plugin", "create", pluginId, "--directory", authoringRoot], fixture.cwd, fixture.environment);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "Prism plugin create failed: destination-exists\n");
      });
    }
    assert.equal(await readFile(join(authoringRoot, "file-tool"), "utf8"), "keep-file\n");
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("the generated scaffold test passes without package installation or checkout imports", async () => {
  const fixture = await setup();
  try {
    const created = invoke(["plugin", "create", "my-tool"], fixture.cwd, fixture.environment);
    assert.equal(created.status, 0);
    const pluginRoot = join(fixture.cwd, DEFAULT_AUTHORING_ROOT_BASENAME, "my-tool");
    const generated = spawnSync(process.execPath, ["--test", "index.test.mjs"], {
      cwd: pluginRoot,
      env: { ...fixture.environment, NODE_PATH: "", NODE_TEST_CONTEXT: undefined },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
    assert.match(generated.stdout, /pass 1/u);
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create passes only the frozen scaffold and managed-root identity to the native operation", async () => {
  const fixture = await setup();
  try {
    let received: ManagedPluginCreateInput | undefined;
    let stdout = "";
    let stderr = "";
    const result = await pluginCreateCommand({
      arguments: ["my-tool"],
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
      currentWorkingDirectory: fixture.cwd,
      dependencies: {
        createManagedPlugin: (input) => { received = input; },
      },
    });
    assert.equal(result, 0);
    assert.equal(stdout, "Created tool plugin: my-tool\n");
    assert.equal(stderr, "");
    assert.deepEqual(received, {
      rootPath: join(fixture.cwd, DEFAULT_AUTHORING_ROOT_BASENAME),
      pluginId: "my-tool",
      scaffold: createToolPluginScaffold("my-tool"),
    });
    assert.deepEqual(await readdir(fixture.cwd), []);
  } finally {
    await fixture.cleanup();
  }
});

test("plugin create emits only closed native failure classes and redacts unknown errors", async (context) => {
  const fixture = await setup();
  try {
    const codes = [
      "root-parent-missing",
      "root-parent-not-directory",
      "root-parent-symlink",
      "root-unmanaged",
      "root-invalid",
      "root-busy",
      "root-changed",
      "destination-exists",
      "native-unavailable",
      "native-integrity",
      "create-failed",
      "cleanup-failed",
    ] as const;
    for (const code of codes) {
      await context.test(code, async () => {
        let stdout = "";
        let stderr = "";
        const result = await pluginCreateCommand({
          arguments: ["my-tool"],
          stdout: { write: (value) => { stdout += value; } },
          stderr: { write: (value) => { stderr += value; } },
          currentWorkingDirectory: fixture.cwd,
          dependencies: {
            createManagedPlugin: () => { throw new NativeAuthoringFailure(code); },
          },
        });
        assert.equal(result, 1);
        assert.equal(stdout, "");
        assert.equal(stderr, `Prism plugin create failed: ${code}\n`);
      });
    }
    let unknownStderr = "";
    const unknown = await pluginCreateCommand({
      arguments: ["my-tool"],
      stdout: { write: () => undefined },
      stderr: { write: (value) => { unknownStderr += value; } },
      currentWorkingDirectory: fixture.cwd,
      dependencies: {
        createManagedPlugin: () => { throw new Error(`${fixture.outside}: private failure`); },
      },
    });
    assert.equal(unknown, 1);
    assert.equal(unknownStderr, "Prism plugin create failed: create-failed\n");
    assert.equal(unknownStderr.includes(fixture.root), false);
  } finally {
    await fixture.cleanup();
  }
});

test("concurrent creates publish one complete destination without partial or outside writes", async () => {
  const fixture = await setup();
  try {
    const authoringRoot = join(fixture.root, "managed");
    const results = await Promise.all(Array.from({ length: 8 }, () => invokeAsync([
      "plugin",
      "create",
      "race-tool",
      "--directory",
      authoringRoot,
    ], fixture.cwd, fixture.environment)));
    const successes = results.filter(({ status }) => status === 0);
    assert.equal(successes.length, 1);
    assert.equal(successes[0]?.stdout, "Created tool plugin: race-tool\n");
    assert.equal(successes[0]?.stderr, "");
    for (const failure of results.filter(({ status }) => status !== 0)) {
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr, /^Prism plugin create failed: (?:destination-exists|root-busy)\n$/u);
    }
    await assertManagedRoot(authoringRoot, ["race-tool"]);
    assert.equal(await readFile(fixture.outside, "utf8"), "outside-sentinel\n");
  } finally {
    await fixture.cleanup();
  }
});
