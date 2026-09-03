import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { admitPinnedRegistryBytes } from "@useprism/runtime";
import { createToolPluginScaffold } from "@useprism/sdk/authoring";
import { prepareProjectPluginApproval } from "../src/project-plugin-approval-preview.ts";
import {
  publishFirstProjectPluginArtifact,
  projectPluginArtifactPaths,
  validateOrRepairActiveProjectPluginArtifact,
} from "../src/project-plugin-artifact.ts";
import {
  readProjectPluginApprovalState,
  revokeProjectPluginApprovalState,
  writeProjectPluginApprovalState,
} from "../src/project-plugin-approval-state.ts";

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prism-project-plugin-artifact-")));
  const workspace = join(root, "workspace");
  const pluginRoot = join(workspace, "prism-plugins", "release-slug");
  await Promise.all([
    mkdir(join(workspace, ".prism"), { recursive: true }),
    mkdir(pluginRoot, { recursive: true }),
  ]);
  await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
  await writeFile(join(workspace, ".prism", "tool-plugin.json"), '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify"}\n');
  const scaffold = createToolPluginScaffold("release-slug");
  assert.ok(scaffold);
  await Promise.all(scaffold.map(({ path, contents }) => writeFile(join(pluginRoot, path), contents, "utf8")));
  const manifestPath = join(pluginRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: string[] };
  manifest.files = ["index.mjs", "helper.mjs"];
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest)}\n`),
    writeFile(join(pluginRoot, "helper.mjs"), "export {};\n"),
    writeFile(join(pluginRoot, "index.mjs"), `import "./helper.mjs";\n${await readFile(join(pluginRoot, "index.mjs"), "utf8")}`),
  ]);
  return { root, workspace, state: join(root, "state") };
}

async function publish(input: Parameters<typeof publishFirstProjectPluginArtifact>[0]) {
  return publishFirstProjectPluginArtifact({
    ...input,
    confirmedApprovalDigest: input.prepared.proposal.approvalDigest,
  });
}

test("first publication requires the exact confirmed digest before artifact state access", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    await assert.rejects(publishFirstProjectPluginArtifact({
      prepared,
      confirmedApprovalDigest: undefined,
      environment: { XDG_STATE_HOME: input.state },
    }), { code: "project-plugin-approval-digest-mismatch" });
    await assert.rejects(publishFirstProjectPluginArtifact({
      prepared,
      confirmedApprovalDigest: "0".repeat(64),
      environment: { XDG_STATE_HOME: input.state },
    }), { code: "project-plugin-approval-digest-mismatch" });
    await assert.rejects(lstat(input.state), { code: "ENOENT" });
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("the preview does not export the private artifact core or a Runtime ticket", async () => {
  const artifactModule = await import("../src/project-plugin-artifact.ts");
  assert.equal(Object.hasOwn(artifactModule, "materializeProjectPluginArtifact"), false);
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const artifact = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    assert.deepEqual(Object.keys(artifact).sort(), [
      "pinPath",
      "pluginRoot",
      "pluginsRoot",
      "registryDigest",
      "registryPath",
      "reused",
      "root",
    ]);
    assert.equal(Object.hasOwn(artifact, "ticket"), false);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("only an active exact approval can validate, reuse, or repair an artifact", async () => {
  const input = await fixture();
  const environment = { XDG_CONFIG_HOME: join(input.root, "config"), XDG_STATE_HOME: input.state };
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const artifact = await publish({ prepared, environment });
    await chmod(artifact.root, 0o755);
    await assert.rejects(validateOrRepairActiveProjectPluginArtifact({
      prepared,
      workspace: input.workspace,
      environment,
    }), { code: "project-plugin-approval-missing" });
    assert.equal((await lstat(artifact.root)).mode & 0o777, 0o755);

    await chmod(artifact.root, 0o700);
    await writeProjectPluginApprovalState({ proposal: prepared.proposal, environment });
    assert.equal((await validateOrRepairActiveProjectPluginArtifact({
      prepared,
      workspace: input.workspace,
      environment,
    })).reused, true);

    await writeFile(join(input.workspace, "prism-plugins", "release-slug", "index.mjs"), "import \"./helper.mjs\";\nexport const changed = true;\n");
    const changed = await prepareProjectPluginApproval({ workspace: input.workspace });
    await assert.rejects(validateOrRepairActiveProjectPluginArtifact({
      prepared,
      workspace: input.workspace,
      environment,
    }), { code: "project-plugin-approval-mismatch" });
    await assert.rejects(validateOrRepairActiveProjectPluginArtifact({
      prepared: changed,
      workspace: input.workspace,
      environment,
    }), { code: "project-plugin-approval-mismatch" });
    assert.equal((await lstat(artifact.root)).mode & 0o777, 0o700);

    await writeFile(
      join(input.workspace, "prism-plugins", "release-slug", "index.mjs"),
      prepared.capturedBytes().runtimeFiles.find((file) => file.name === "index.mjs")?.bytes ?? new Uint8Array(),
    );
    const restored = await prepareProjectPluginApproval({ workspace: input.workspace });
    await rm(artifact.root, { recursive: true });
    assert.equal((await validateOrRepairActiveProjectPluginArtifact({
      prepared: restored,
      workspace: input.workspace,
      environment,
    })).reused, false);
    assert.equal(await revokeProjectPluginApprovalState({ workspace: input.workspace, environment }), true);
    await assert.rejects(validateOrRepairActiveProjectPluginArtifact({
      prepared,
      workspace: input.workspace,
      environment,
    }), { code: "project-plugin-approval-missing" });
    assert.equal(await readProjectPluginApprovalState({ workspace: input.workspace, environment }), undefined);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("active approval rechecks captured source identity after artifact access", async () => {
  const input = await fixture();
  const environment = { XDG_CONFIG_HOME: join(input.root, "config"), XDG_STATE_HOME: input.state };
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    await publish({ prepared, environment });
    await writeProjectPluginApprovalState({ proposal: prepared.proposal, environment });
    await assert.rejects(validateOrRepairActiveProjectPluginArtifact({
      prepared,
      workspace: input.workspace,
      environment,
      dependencies: {
        afterLockAcquired: () => writeFile(
          join(input.workspace, "prism-plugins", "release-slug", "index.mjs"),
          "import \"./helper.mjs\";\nexport const changed = true;\n",
        ),
      },
    }), { code: "project-plugin-approval-mismatch" });
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("materializes the frozen approval snapshot as an exact private Runtime-admitted artifact", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const captured = prepared.capturedBytes();
    const artifact = await publishFirstProjectPluginArtifact({
      prepared,
      confirmedApprovalDigest: prepared.proposal.approvalDigest,
      environment: { XDG_STATE_HOME: input.state },
    });

    assert.equal(artifact.registryDigest, prepared.proposal.plugin.registryDigest);
    assert.equal(artifact.reused, false);
    assert.deepEqual(new Uint8Array(await readFile(artifact.registryPath)), captured.registryBytes);
    assert.deepEqual(new Uint8Array(await readFile(join(artifact.pluginRoot, "manifest.json"))), captured.manifestBytes);
    for (const file of captured.runtimeFiles) {
      assert.deepEqual(new Uint8Array(await readFile(join(artifact.pluginRoot, file.name))), file.bytes);
    }
    assert.deepEqual((await lstat(artifact.root)).mode & 0o777, 0o700);
    assert.deepEqual((await lstat(artifact.registryPath)).mode & 0o777, 0o600);
    assert.deepEqual((await lstat(artifact.pluginRoot)).mode & 0o777, 0o700);
    assert.deepEqual((await lstat(join(artifact.pluginRoot, "index.mjs"))).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(artifact.root)).sort(), ["plugin-pins.json", "plugins", "registry.json"]);
    assert.deepEqual((await readdir(artifact.pluginRoot)).sort(), ["helper.mjs", "index.mjs", "manifest.json"]);
    assert.equal(admitPinnedRegistryBytes({
      bytes: captured.registryBytes,
      pinPath: artifact.pinPath,
      pluginsRoot: artifact.pluginsRoot,
    }).ok, true);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("reuses a valid winner and quarantines one safe invalid destination before rebuilding it", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const first = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    assert.equal((await publish({ prepared, environment: { XDG_STATE_HOME: input.state } })).reused, true);

    const originalRoot = (await lstat(first.root)).ino;
    await writeFile(join(first.pluginRoot, "index.mjs"), "mutated");
    const rebuilt = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    assert.equal(rebuilt.reused, false);
    assert.notEqual((await lstat(rebuilt.root)).ino, originalRoot);
    assert.deepEqual(
      new Uint8Array(await readFile(join(rebuilt.pluginRoot, "index.mjs"))),
      prepared.capturedBytes().runtimeFiles.find((file) => file.name === "index.mjs")?.bytes,
    );
    assert.deepEqual(await readdir(dirname(rebuilt.root)), [prepared.proposal.plugin.registryDigest]);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("quarantines and rebuilds every safe artifact byte or listing mutation", async (context) => {
  const mutations = [
    ["registry bytes", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(artifact.registryPath, "mutated", { mode: 0o600 })],
    ["pin bytes", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(artifact.pinPath, "mutated", { mode: 0o600 })],
    ["manifest bytes", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(join(artifact.pluginRoot, "manifest.json"), "mutated", { mode: 0o600 })],
    ["runtime bytes", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(join(artifact.pluginRoot, "index.mjs"), "mutated", { mode: 0o600 })],
    ["root listing", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(join(artifact.root, "extra"), "mutated", { mode: 0o600 })],
    ["plugin listing", async (artifact: Awaited<ReturnType<typeof publish>>) => writeFile(join(artifact.pluginRoot, "extra.mjs"), "mutated", { mode: 0o600 })],
  ] as const;

  for (const [name, mutate] of mutations) {
    await context.test(name, async () => {
      const input = await fixture();
      try {
        const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
        const first = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
        const firstInode = (await lstat(first.root)).ino;
        await mutate(first);
        const rebuilt = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
        assert.equal(rebuilt.reused, false);
        assert.notEqual((await lstat(rebuilt.root)).ino, firstInode);
        assert.deepEqual(await readdir(dirname(rebuilt.root)), [prepared.proposal.plugin.registryDigest]);
        assert.equal(admitPinnedRegistryBytes({
          bytes: prepared.capturedBytes().registryBytes,
          pinPath: rebuilt.pinPath,
          pluginsRoot: rebuilt.pluginsRoot,
        }).ok, true);
      } finally {
        await rm(input.root, { recursive: true, force: true });
      }
    });
  }
});

test("serializes concurrent writers and makes the loser validate and reuse the winner", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    let entered!: () => void;
    let release!: () => void;
    const lockEntered = new Promise<void>((resolvePromise) => { entered = resolvePromise; });
    const releaseLock = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    const first = publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        afterLockAcquired: async () => {
          entered();
          await releaseLock;
        },
      },
    });
    await lockEntered;
    let secondSettled = false;
    const second = publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { lockTimeoutMs: 1_000, lockRetryMs: 1 },
    }).finally(() => { secondSettled = true; });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    assert.equal(secondSettled, false);
    release();
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map(({ reused }) => reused).sort(), [false, true]);
    assert.deepEqual(await readdir(dirname(results[0].root)), [prepared.proposal.plugin.registryDigest]);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("uses one replacement retry and removes every owned failed publication", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const attempts: number[] = [];
    const artifact = await publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        afterPublished: async ({ attempt, root }) => {
          attempts.push(attempt);
          if (attempt === 0) await writeFile(join(root, "registry.json"), "mutated", { mode: 0o600 });
        },
      },
    });
    assert.equal(artifact.reused, false);
    assert.deepEqual(attempts, [0, 1]);
    assert.deepEqual(await readdir(dirname(artifact.root)), [prepared.proposal.plugin.registryDigest]);

    const failedAttempts: number[] = [];
    await rm(artifact.root, { recursive: true });
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        afterPublished: async ({ attempt, root }) => {
          failedAttempts.push(attempt);
          await writeFile(join(root, "registry.json"), "mutated", { mode: 0o600 });
        },
      },
    }), { code: "project-plugin-artifact-invalid" });
    assert.deepEqual(failedAttempts, [0, 1]);
    assert.deepEqual(await readdir(dirname(artifact.root)), []);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("removes partial stages when validation hooks fail", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    let nextId = 0;
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        randomId: () => `forced-${nextId++}`,
        afterStageValidated: () => { throw new Error("forced stage failure"); },
      },
    }), /forced stage failure/u);
    const paths = projectPluginArtifactPaths({
      registryDigest: prepared.proposal.plugin.registryDigest,
      pluginId: prepared.proposal.plugin.id,
      environment: { XDG_STATE_HOME: input.state },
    });
    assert.deepEqual(await readdir(paths.version), []);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("never steals a bounded digest lock and refuses to quarantine an unsafe destination", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const artifact = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    const paths = projectPluginArtifactPaths({
      registryDigest: prepared.proposal.plugin.registryDigest,
      pluginId: prepared.proposal.plugin.id,
      environment: { XDG_STATE_HOME: input.state },
    });
    const handle = await open(paths.lockPath, "wx", 0o600);
    await handle.close();
    const waiting = publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { lockTimeoutMs: 100, lockRetryMs: 1 },
    });
    setTimeout(() => { void unlink(paths.lockPath); }, 10);
    assert.equal((await waiting).reused, true);

    const held = await open(paths.lockPath, "wx", 0o600);
    await held.close();
    await utimes(paths.lockPath, 0, 0);
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { lockTimeoutMs: 0 },
    }), { code: "project-plugin-artifact-lock-timeout" });
    assert.equal((await lstat(paths.lockPath)).isFile(), true);
    await unlink(paths.lockPath);

    await chmod(artifact.root, 0o755);
    await assert.rejects(publish({ prepared, environment: { XDG_STATE_HOME: input.state } }), {
      code: "project-plugin-artifact-unsafe",
    });
    assert.equal((await lstat(artifact.root)).mode & 0o777, 0o755);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("fails closed without quarantine, approval, or owned residue for every artifact component safety violation", async (context) => {
  const components = [
    { name: "root", directory: true, path: (artifact: Awaited<ReturnType<typeof publish>>) => artifact.root },
    { name: "plugins directory", directory: true, path: (artifact: Awaited<ReturnType<typeof publish>>) => artifact.pluginsRoot },
    { name: "plugin root", directory: true, path: (artifact: Awaited<ReturnType<typeof publish>>) => artifact.pluginRoot },
    { name: "registry", directory: false, path: (artifact: Awaited<ReturnType<typeof publish>>) => artifact.registryPath },
    { name: "pin", directory: false, path: (artifact: Awaited<ReturnType<typeof publish>>) => artifact.pinPath },
    { name: "manifest", directory: false, path: (artifact: Awaited<ReturnType<typeof publish>>) => join(artifact.pluginRoot, "manifest.json") },
    { name: "runtime file index.mjs", directory: false, path: (artifact: Awaited<ReturnType<typeof publish>>) => join(artifact.pluginRoot, "index.mjs") },
    { name: "runtime file helper.mjs", directory: false, path: (artifact: Awaited<ReturnType<typeof publish>>) => join(artifact.pluginRoot, "helper.mjs") },
  ] as const;
  const violations = [
    {
      name: "symlink",
      mutate: async (path: string) => {
        await rm(path, { recursive: true, force: true });
        await symlink(join(dirname(path), "outside"), path);
      },
    },
    {
      name: "wrong type",
      mutate: async (path: string, directory: boolean) => {
        await rm(path, { recursive: true, force: true });
        if (directory) await writeFile(path, "wrong type", { mode: 0o600 });
        else await mkdir(path, { mode: 0o700 });
      },
    },
    {
      name: "non-owner simulation",
      mutate: async () => undefined,
      simulateNonOwner: true,
    },
    {
      name: "group writable",
      mutate: async (path: string) => chmod(path, 0o770),
    },
    {
      name: "world writable",
      mutate: async (path: string) => chmod(path, 0o707),
    },
  ] as const;

  for (const component of components) {
    for (const violation of violations) {
      await context.test(`${component.name}: ${violation.name}`, async () => {
        const input = await fixture();
        const environment = { XDG_CONFIG_HOME: join(input.root, "config"), XDG_STATE_HOME: input.state };
        try {
          const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
          const artifact = await publish({ prepared, environment });
          const target = component.path(artifact);
          await violation.mutate(target, component.directory);
          const dependencies = "simulateNonOwner" in violation && violation.simulateNonOwner
            ? {
              lstat: (async (path: string) => {
                const stat = await lstat(path);
                return path === target
                  ? new Proxy(stat, {
                    get(source, property, receiver) {
                      return property === "uid" ? Number(source.uid) + 1 : Reflect.get(source, property, receiver);
                    },
                  })
                  : stat;
              }) as typeof lstat,
            }
            : undefined;
          await assert.rejects(publish({ prepared, environment, dependencies }), {
            code: "project-plugin-artifact-unsafe",
          });
          const paths = projectPluginArtifactPaths({
            registryDigest: prepared.proposal.plugin.registryDigest,
            pluginId: prepared.proposal.plugin.id,
            environment,
          });
          const entries = await readdir(paths.version);
          assert.equal(entries.some((entry) => entry.startsWith(".stage-") || entry.startsWith(".quarantine-") || entry.endsWith(".lock")), false);
          assert.equal(await readProjectPluginApprovalState({ workspace: input.workspace, environment }), undefined);
          await assert.rejects(lstat(join(environment.XDG_CONFIG_HOME, "prism")), { code: "ENOENT" });
        } finally {
          await rm(input.root, { recursive: true, force: true });
        }
      });
    }
  }
});

test("identity-tracks post-create locks and post-rename quarantines through cleanup failures", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    const paths = projectPluginArtifactPaths({
      registryDigest: prepared.proposal.plugin.registryDigest,
      pluginId: prepared.proposal.plugin.id,
      environment: { XDG_STATE_HOME: input.state },
    });
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { afterLockIdentityCaptured: () => { throw new Error("after lock identity"); } },
    }), /after lock identity/u);
    assert.deepEqual(await readdir(paths.version), []);

    const failedStageIdentities = new Set<string>();
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        lstat: (async (path) => {
          const pathText = String(path);
          if (basename(pathText).startsWith(".stage-") && !failedStageIdentities.has(pathText)) {
            failedStageIdentities.add(pathText);
            throw Object.assign(new Error("stage identity unavailable"), { code: "EIO" });
          }
          return lstat(path);
        }) as typeof lstat,
      },
    }), { code: "project-plugin-artifact-unsafe" });
    assert.equal(failedStageIdentities.size, 2);
    assert.deepEqual(await readdir(paths.version), []);

    const artifact = await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    await writeFile(artifact.registryPath, "mutated", { mode: 0o600 });
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { afterQuarantineRenamed: () => { throw new Error("after quarantine rename"); } },
    }), /after quarantine rename/u);
    assert.deepEqual(await readdir(paths.version), []);

    await publish({ prepared, environment: { XDG_STATE_HOME: input.state } });
    await writeFile(artifact.registryPath, "mutated", { mode: 0o600 });
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: {
        afterQuarantineRenamed: () => { throw new Error("after quarantine rename"); },
        rm: async (path, options) => {
          if (basename(String(path)).startsWith(".quarantine-")) throw new Error("cleanup must be reported safely");
          return rm(path, options);
        },
      },
    }), { code: "project-plugin-artifact-unsafe" });
    assert.equal((await readdir(paths.version)).some((entry) => entry.startsWith(".quarantine-")), true);
    assert.equal((await readdir(paths.version)).some((entry) => entry.endsWith(".lock")), false);
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("rejects Windows before resolving or creating artifact state", async () => {
  const input = await fixture();
  try {
    const prepared = await prepareProjectPluginApproval({ workspace: input.workspace });
    await assert.rejects(publish({
      prepared,
      environment: { XDG_STATE_HOME: input.state },
      dependencies: { platform: "win32" },
    }), { code: "project-plugin-unsupported-platform" });
    await assert.rejects(lstat(input.state), { code: "ENOENT" });
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});
