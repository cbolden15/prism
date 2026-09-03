import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approvalRecordFromProposal,
  parseProjectPluginApprovalRecord,
  projectPluginApprovalRecordMatchesProposal,
  readProjectPluginApprovalState,
  revokeProjectPluginApprovalState,
  withProjectPluginApprovalLock,
  writeProjectPluginApprovalState,
} from "../src/project-plugin-approval-state.ts";
import { projectPluginPrivateStatePaths } from "../src/project-plugin-private-state.ts";
import { computeProjectPluginApprovalDigest } from "../src/project-plugin-approval-preview.ts";

const proposal = Object.freeze({
  version: "prism-project-plugin-approval-proposal-v1" as const,
  workspace: "/canonical/workspace",
  projectConfigDigest: "1".repeat(64),
  declaredPath: "prism-plugins/release-slug",
  canonicalPluginPath: "/canonical/workspace/prism-plugins/release-slug",
  operation: "slugify" as const,
  plugin: Object.freeze({
    id: "release-slug",
    manifestDigest: "2".repeat(64),
    sourceDigest: "3".repeat(64),
    registryDigest: "4".repeat(64),
    versionDigest: "5".repeat(64),
    runnerDigest: "6".repeat(64),
    imageDigest: "7".repeat(64),
    profileDigest: "8".repeat(64),
  }),
  approvalDigest: createHash("sha256").update(JSON.stringify([
    "prism-project-plugin-approval-digest-v1",
    "/canonical/workspace",
    "1".repeat(64),
    "prism-plugins/release-slug",
    "/canonical/workspace/prism-plugins/release-slug",
    "slugify",
    "release-slug",
    "2".repeat(64),
    "3".repeat(64),
    "4".repeat(64),
    "5".repeat(64),
    "6".repeat(64),
    "7".repeat(64),
    "8".repeat(64),
  ])).digest("hex"),
  executionBoundary: "ambient-subprocess" as const,
  sandboxed: false as const,
  warning: "Plugin admission and approval are not safety or sandboxing; plugin execution has ambient host authority." as const,
});

test("approval records retain only the exact proposal authority fields and rederive their digest", () => {
  const record = approvalRecordFromProposal(proposal);
  const parsed = parseProjectPluginApprovalRecord(JSON.stringify(record));
  assert.deepEqual(parsed, record);
  assert.deepEqual(parseProjectPluginApprovalRecord(`\n  ${JSON.stringify(record, null, 2)}\n`), record);
  assert.equal(projectPluginApprovalRecordMatchesProposal(parsed, proposal), true);
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({ ...record, unexpected: true })));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({ ...record, approvalDigest: "0".repeat(64) })));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({ ...record }).replace("{", '{"version":"prism-project-plugin-approval-v1",')));
  const { operation: _operation, ...withoutOperation } = record;
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify(withoutOperation)));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({ ...record, operation: "other" })));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({
    ...record,
    plugin: { ...record.plugin, extra: true },
  })));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify({
    ...record,
    plugin: { ...record.plugin, runnerDigest: true },
  })));
  assert.throws(() => parseProjectPluginApprovalRecord(JSON.stringify(record).replace(
    `"manifestDigest":"${record.plugin.manifestDigest}"`,
    `"manifestDigest":"${record.plugin.manifestDigest}","manifestDigest":"${record.plugin.manifestDigest}"`,
  )));
  assert.equal(projectPluginApprovalRecordMatchesProposal(parsed, { ...proposal, declaredPath: "other" }), false);

  const invalidContexts: readonly Record<string, unknown>[] = [
    { workspace: "relative", canonicalPluginPath: "relative/prism-plugins/release-slug" },
    { declaredPath: "../release-slug", canonicalPluginPath: "/canonical/release-slug" },
    { canonicalPluginPath: "/canonical/workspace/other/release-slug" },
    { plugin: { ...proposal.plugin, id: "Release-Slug" } },
  ];
  for (const invalid of invalidContexts) {
    const identity = {
      ...proposal,
      ...invalid,
      plugin: invalid.plugin ?? proposal.plugin,
    } as typeof proposal;
    const candidate = { ...identity, approvalDigest: computeProjectPluginApprovalDigest(identity) };
    assert.throws(
      () => approvalRecordFromProposal(candidate),
      { code: "project-plugin-approval-record-invalid" },
      JSON.stringify(invalid),
    );
  }
});

test("approval state writes restrictive state, fails closed on a cloned context, and revokes lookup first", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-approval-state-"));
  const config = join(root, "config");
  const environment = { XDG_CONFIG_HOME: config, HOME: join(root, "home") };
  try {
    await mkdir(config, { mode: 0o700 });
    const record = await writeProjectPluginApprovalState({ proposal, environment });
    const paths = projectPluginPrivateStatePaths({ workspace: proposal.workspace, environment, platform: process.platform });
    for (const path of [paths.prism, paths.approvals, paths.version]) {
      assert.equal((await lstat(path)).mode & 0o777, 0o700);
    }
    assert.equal((await lstat(paths.record)).mode & 0o777, 0o600);
    assert.deepEqual(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment }), record);

    const clone = approvalRecordFromProposal({
      ...proposal,
      workspace: "/canonical/other-workspace",
      canonicalPluginPath: "/canonical/other-workspace/prism-plugins/release-slug",
      approvalDigest: createHash("sha256").update(JSON.stringify([
        "prism-project-plugin-approval-digest-v1", "/canonical/other-workspace", proposal.projectConfigDigest,
        proposal.declaredPath, "/canonical/other-workspace/prism-plugins/release-slug", proposal.operation, proposal.plugin.id,
        proposal.plugin.manifestDigest, proposal.plugin.sourceDigest, proposal.plugin.registryDigest, proposal.plugin.versionDigest,
        proposal.plugin.runnerDigest, proposal.plugin.imageDigest, proposal.plugin.profileDigest,
      ])).digest("hex"),
    });
    await writeFile(paths.record, `${JSON.stringify(clone)}\n`, { mode: 0o600 });
    await assert.rejects(readProjectPluginApprovalState({ workspace: proposal.workspace, environment }), { code: "project-plugin-approval-record-mismatch" });

    assert.equal(await readProjectPluginApprovalState({
      workspace: proposal.workspace,
      environment: { XDG_CONFIG_HOME: join(root, "second-user-config") },
    }), undefined);

    await writeProjectPluginApprovalState({ proposal, environment });
    await assert.rejects(revokeProjectPluginApprovalState({
      workspace: proposal.workspace,
      environment,
      dependencies: { rm: async () => { throw new Error("cleanup failed"); }, randomId: () => "test" },
    }), { code: "project-plugin-approval-cleanup-failed" });
    await assert.rejects(lstat(paths.record), { code: "ENOENT" });
    assert.equal(await revokeProjectPluginApprovalState({ workspace: proposal.workspace, environment }), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("revocation must acquire the active operation lock before removing approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-approval-lock-"));
  const config = join(root, "config");
  const environment = { XDG_CONFIG_HOME: config, HOME: join(root, "home") };
  try {
    await mkdir(config, { mode: 0o700 });
    await writeProjectPluginApprovalState({ proposal, environment });
    const paths = projectPluginPrivateStatePaths({ workspace: proposal.workspace, environment, platform: process.platform });

    await withProjectPluginApprovalLock({
      workspace: proposal.workspace,
      environment,
      dependencies: { lockTimeoutMs: 0, lockRetryMs: 0 },
      async run() {
        const lockEntries = (await readdir(paths.version)).filter((entry) => entry.endsWith(".lock"));
        assert.equal(lockEntries.length, 1);
        assert.equal((await lstat(join(paths.version, lockEntries[0] ?? "missing"))).mode & 0o777, 0o600);
        await assert.rejects(revokeProjectPluginApprovalState({
          workspace: proposal.workspace,
          environment,
          dependencies: { lockTimeoutMs: 0, lockRetryMs: 0 },
        }), { code: "project-plugin-approval-lock-timeout" });
        assert.deepEqual(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment }), approvalRecordFromProposal(proposal));
      },
    });

    assert.equal((await readdir(paths.version)).some((entry) => entry.endsWith(".lock")), false);
    assert.equal(await revokeProjectPluginApprovalState({ workspace: proposal.workspace, environment }), true);
    assert.equal(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval locks clean up failures and refuse identity-swapped release", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-approval-lock-identity-"));
  const config = join(root, "config");
  const environment = { XDG_CONFIG_HOME: config, HOME: join(root, "home") };
  try {
    await mkdir(config, { mode: 0o700 });
    await writeProjectPluginApprovalState({ proposal, environment });
    const paths = projectPluginPrivateStatePaths({ workspace: proposal.workspace, environment, platform: process.platform });

    await assert.rejects(withProjectPluginApprovalLock({
      workspace: proposal.workspace,
      environment,
      async run() { throw new Error("callback failed"); },
    }), /callback failed/u);
    assert.equal((await readdir(paths.version)).some((entry) => entry.endsWith(".lock")), false);

    await assert.rejects(withProjectPluginApprovalLock({
      workspace: proposal.workspace,
      environment,
      async run() {
        const entry = (await readdir(paths.version)).find((candidate) => candidate.endsWith(".lock"));
        assert.ok(entry);
        const path = join(paths.version, entry);
        await unlink(path);
        await writeFile(path, "replacement\n", { mode: 0o600, flag: "wx" });
      },
    }), { code: "project-plugin-approval-lock-unsafe" });
    const replacement = (await readdir(paths.version)).find((entry) => entry.endsWith(".lock"));
    assert.ok(replacement);
    await unlink(join(paths.version, replacement));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval freshness is rechecked while the write lock is held", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-approval-write-freshness-"));
  const config = join(root, "config");
  const environment = { XDG_CONFIG_HOME: config, HOME: join(root, "home") };
  try {
    await mkdir(config, { mode: 0o700 });
    let checks = 0;
    await assert.rejects(writeProjectPluginApprovalState({
      proposal,
      environment,
      async isFresh() { checks += 1; return false; },
    }), { code: "project-plugin-approval-changed" });
    assert.equal(checks, 1);
    assert.equal(await readProjectPluginApprovalState({ workspace: proposal.workspace, environment }), undefined);
    const paths = projectPluginPrivateStatePaths({ workspace: proposal.workspace, environment, platform: process.platform });
    assert.equal((await readdir(paths.version)).some((entry) => entry.endsWith(".lock")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows fails before approval-state filesystem access", async () => {
  let calls = 0;
  await assert.rejects(readProjectPluginApprovalState({
    workspace: proposal.workspace,
    environment: { XDG_CONFIG_HOME: "/not-read" },
    dependencies: { platform: "win32", lstat: async () => { calls += 1; throw new Error("must not run"); } },
  }), { code: "project-plugin-unsupported-platform" });
  assert.equal(calls, 0);
});
