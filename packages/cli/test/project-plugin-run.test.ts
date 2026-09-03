import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { computeToolRequestDigest, type AgentPolicyRequest } from "@useprism/runtime";
import type { ProviderRequest } from "@useprism/sdk/provider";
import { runCommand } from "../src/commands/run.ts";
import { runProjectPlugin, type ProjectPluginRunDependencies } from "../src/project-plugin-run.ts";
import {
  computeProjectPluginApprovalDigest,
  prepareProjectPluginApproval,
  ProjectPluginApprovalPreviewError,
} from "../src/project-plugin-approval-preview.ts";
import { publishFirstProjectPluginArtifact } from "../src/project-plugin-artifact.ts";
import { readProjectPluginApprovalState, revokeProjectPluginApprovalState, writeProjectPluginApprovalState } from "../src/project-plugin-approval-state.ts";
import { readRunRecord } from "../src/run-store.ts";

const digest = "a".repeat(64);
const goal = "Create a slug for release title: Preview First";

function policyRequest(overrides: Partial<Omit<AgentPolicyRequest, "requestDigest">> = {}): AgentPolicyRequest {
  const request = {
    tool: "release-slug",
    operation: "slugify",
    callCount: 1,
    input: { title: "Preview First" },
    ...overrides,
  };
  return { ...request, requestDigest: computeToolRequestDigest(request) };
}

function receipt() {
  return {
    v: 1 as const,
    requestId: "request",
    pluginId: "release-slug",
    containerId: null,
    trigger: "broker-stop",
    hardDeadlineAtMs: 200,
    daemonState: "absent",
    exitCode: 0,
    oomKilled: false,
    confirmedAbsent: true,
    cleanupErrors: [],
    settledAtMs: 150,
  };
}

function prepared() {
  const proposal = {
    version: "prism-project-plugin-approval-proposal-v1" as const,
    workspace: "/private/workspace",
    projectConfigDigest: digest,
    declaredPath: "prism-plugins/release-slug",
    canonicalPluginPath: "/private/workspace/prism-plugins/release-slug",
    operation: "slugify" as const,
    plugin: {
      id: "release-slug",
      manifestDigest: digest,
      sourceDigest: digest,
      registryDigest: digest,
      versionDigest: digest,
      runnerDigest: digest,
      imageDigest: digest,
      profileDigest: digest,
    },
    approvalDigest: digest,
    executionBoundary: "ambient-subprocess" as const,
    sandboxed: false as const,
    warning: "Plugin admission and approval are not safety or sandboxing; plugin execution has ambient host authority." as const,
  };
  return {
    proposal,
    capturedBytes: () => ({ manifestBytes: new Uint8Array(), runtimeFiles: [], registryBytes: new Uint8Array([1, 2, 3]) }),
    isFresh: async () => true,
  };
}

function dependencies(overrides: Partial<ProjectPluginRunDependencies> = {}): ProjectPluginRunDependencies {
  const value = prepared();
  return {
    async prepareProjectPluginApproval() { return value; },
    async readProjectPluginApprovalState() { return {} as never; },
    projectPluginApprovalRecordMatchesProposal() { return true; },
    async validateOrRepairActiveProjectPluginArtifact() {
      return {
        registryDigest: digest,
        root: "/private/artifact",
        registryPath: "/private/artifact/registry.json",
        pinPath: "/private/artifact/plugin-pins.json",
        pluginsRoot: "/private/artifact/plugins",
        pluginRoot: "/private/artifact/plugins/release-slug",
        reused: true,
      };
    },
    async readFile() { return new Uint8Array([1, 2, 3]); },
    admitPinnedRegistryBytes() {
      return {
        ok: true,
        ticket: {
          ticket: {
            registryDigest: digest,
            plugins: [{ id: "release-slug", manifestDigest: digest, sourceDigest: digest, versionDigest: digest, runnerDigest: digest, imageDigest: digest, profileDigest: digest }],
          },
          pinnedPluginIds: ["release-slug"],
        },
      } as never;
    },
    async withOwnerApprovedSpawnPlugin(input) {
      return input.run({ ticket: input.ticket.ticket, containerPort: {} as never });
    },
    async withProjectPluginApprovalLock(input) {
      return input.run();
    },
    async runToolOperation(input) {
      assert.equal(input.pluginId, "release-slug");
      assert.equal(input.operation, "slugify");
      assert.deepEqual(input.input, { title: "Preview First" });
      return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "preview-first" }, receipt: receipt() } as never;
    },
    nowMs: () => 100,
    ...overrides,
  };
}

test("the exact release-title goal runs one frozen admitted slugify tool through Runtime", async () => {
  let sealed: unknown;
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runAgent(input) {
      sealed = input;
      return (await import("@useprism/runtime")).runAgent(input);
    },
  }));

  assert.equal(result.kind, "admitted");
  if (result.kind !== "admitted") return;
  assert.equal(result.result.status, "completed", JSON.stringify(result.result));
  assert.equal(result.result.status === "completed" ? result.result.answer : "", "preview-first");
  assert.equal(result.receipt?.pluginId, "release-slug");
  const input = sealed as { readonly limits: unknown; readonly ports: { readonly provider: unknown; readonly tools: readonly unknown[]; readonly policy: unknown } };
  assert.deepEqual(input.limits, { providerTurns: 2, toolCalls: 1, totalBytes: 2_000_000, perToolBytes: 500_000, deadlineMs: 60_000 });
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.ports), true);
  assert.equal(Object.isFrozen(input.ports.provider), true);
  assert.equal(Object.isFrozen(input.ports.policy), true);
  assert.equal(Object.isFrozen(input.ports.tools), true);
  assert.equal(input.ports.tools.length, 1);
  assert.equal(Object.isFrozen(input.ports.tools[0]), true);
});

test("every Runtime descriptor commitment mismatch fails before owner-approved spawn", async () => {
  for (const field of ["id", "manifestDigest", "sourceDigest", "versionDigest", "runnerDigest", "imageDigest", "profileDigest"] as const) {
    let spawns = 0;
    const execution = runProjectPlugin({
      workspace: "/private/workspace",
      environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
      goal,
      provider: { name: "deterministic", model: null },
    }, dependencies({
      admitPinnedRegistryBytes() {
        const plugin = { id: "release-slug", manifestDigest: digest, sourceDigest: digest, versionDigest: digest, runnerDigest: digest, imageDigest: digest, profileDigest: digest };
        Object.assign(plugin, { [field]: field === "id" ? "other-plugin" : "b".repeat(64) });
        return { ok: true, ticket: { ticket: { registryDigest: digest, plugins: [plugin] }, pinnedPluginIds: ["release-slug"] } } as never;
      },
      async withOwnerApprovedSpawnPlugin() { spawns += 1; throw new Error("must not spawn"); },
    }));
    await assert.rejects(execution, { code: "project-plugin-commitment-mismatch" });
    assert.equal(spawns, 0, field);
  }
});

test("the sealed policy binds exact input and denies wrong, second, mismatched, and malformed requests", async () => {
  let operations = 0;
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runAgent(input) {
      const context = { signal: new AbortController().signal, deadlineAtMs: 1_000 };
      const allowed = policyRequest();
      const admitted = await input.ports.policy(allowed, context);
      assert.equal(admitted.decision, "restrict");
      if (admitted.decision === "restrict") {
        assert.deepEqual(admitted.catalog.capabilities[1], {
          id: "request-digests",
          limit: { schema: "string-set", version: "pnh-capability-limit-v1", values: [allowed.requestDigest] },
        });
      }
      assert.deepEqual(await input.ports.policy(policyRequest({ tool: "other" }), context), { decision: "deny" });
      assert.deepEqual(await input.ports.policy(policyRequest({ callCount: 2 }), context), { decision: "deny" });
      assert.deepEqual(await input.ports.policy(policyRequest({ input: { title: "Disallowed" } }), context), { decision: "deny" });
      assert.deepEqual(await input.ports.policy({ ...allowed, requestDigest: "0".repeat(64) }, context), { decision: "deny" });
      const tool = input.ports.tools[0];
      assert.ok(tool);
      await assert.rejects(tool.invoke({ operation: "slugify", input: { title: "Preview First", extra: true } } as never, context));
      return { status: "failed", code: "policy-denied", limits: input.limits, usage: { providerTurns: 0, toolCalls: 0, totalBytes: 0 }, toolCalls: [], events: [] } as never;
    },
    async runToolOperation() { operations += 1; throw new Error("must not run"); },
  }));
  assert.equal(result.kind, "admitted");
  assert.equal(operations, 0);
});

test("an invalid plugin result is recorded as an agent failure only after its receipt is captured", async () => {
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runToolOperation() {
      return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "not a slug" }, receipt: receipt() } as never;
    },
  }));
  assert.equal(result.kind, "admitted");
  if (result.kind !== "admitted") return;
  assert.equal(result.result.status, "failed");
  assert.equal(result.receipt?.pluginId, "release-slug");
});

test("a started lifecycle without its authoritative receipt fails closed", async () => {
  const execution = runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runToolOperation() {
      return { ok: false, code: "protocol" } as never;
    },
  }));
  await assert.rejects(execution, { code: "project-plugin-lifecycle-receipt-missing" });
});

test("a declaration observed by the command cannot disappear into a legacy fallback", async () => {
  const execution = runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async prepareProjectPluginApproval() { throw new ProjectPluginApprovalPreviewError("declaration-missing"); },
  }));
  await assert.rejects(execution, { code: "project-plugin-admission-failed" });
});

test("approval revocation after Runtime admission prevents owner-approved spawn", async () => {
  let active = true;
  let spawns = 0;
  const base = prepared();
  const execution = runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async prepareProjectPluginApproval() { return base; },
    async readProjectPluginApprovalState() { return active ? {} as never : undefined; },
    projectPluginApprovalRecordMatchesProposal() { return true; },
    admitPinnedRegistryBytes(input) {
      active = false;
      return dependencies().admitPinnedRegistryBytes!(input);
    },
    async withOwnerApprovedSpawnPlugin() { spawns += 1; throw new Error("must not spawn"); },
  }));
  await assert.rejects(execution, { code: "project-plugin-approval-mismatch" });
  assert.equal(spawns, 0);
});

test("the final approval recheck and plugin lifecycle share the revocation lock", async () => {
  let lockHeld = false;
  let checkedWhileLocked = false;
  let approvalReads = 0;
  let operations = 0;
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async withProjectPluginApprovalLock(input) {
      assert.equal(lockHeld, false);
      lockHeld = true;
      try {
        return await input.run();
      } finally {
        lockHeld = false;
      }
    },
    async readProjectPluginApprovalState() {
      approvalReads += 1;
      if (lockHeld) checkedWhileLocked = true;
      return {} as never;
    },
    async runToolOperation() {
      assert.equal(lockHeld, true);
      operations += 1;
      return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "preview-first" }, receipt: receipt() } as never;
    },
  }));
  assert.equal(result.result.status, "completed");
  assert.equal(checkedWhileLocked, true);
  assert.equal(approvalReads, 2);
  assert.equal(operations, 1);
  assert.equal(lockHeld, false);
});

test("a concurrent revoke cannot pass the final check-to-cleanup operation lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-project-run-revoke-race-"));
  const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state") };
  try {
    await mkdir(environment.XDG_CONFIG_HOME, { recursive: true });
    const fixture = prepared();
    const base = {
      ...fixture,
      proposal: {
        ...fixture.proposal,
        approvalDigest: computeProjectPluginApprovalDigest(fixture.proposal),
      },
    };
    await writeProjectPluginApprovalState({ proposal: base.proposal, environment });
    let blockedRevocation = false;
    const injected = dependencies({
      async prepareProjectPluginApproval() { return base; },
      async runToolOperation() {
        await assert.rejects(revokeProjectPluginApprovalState({
          workspace: base.proposal.workspace,
          environment,
          dependencies: { lockTimeoutMs: 0, lockRetryMs: 0 },
        }), { code: "project-plugin-approval-lock-timeout" });
        blockedRevocation = true;
        return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "preview-first" }, receipt: receipt() } as never;
      },
    });
    const {
      readProjectPluginApprovalState: _read,
      projectPluginApprovalRecordMatchesProposal: _matches,
      withProjectPluginApprovalLock: _lock,
      ...realApprovalDependencies
    } = injected;
    const result = await runProjectPlugin({
      workspace: base.proposal.workspace,
      environment,
      goal,
      provider: { name: "deterministic", model: null },
    }, realApprovalDependencies);
    assert.equal(result.result.status, "completed");
    assert.equal(blockedRevocation, true);
    assert.equal(await revokeProjectPluginApprovalState({ workspace: base.proposal.workspace, environment }), true);
    assert.equal(await readProjectPluginApprovalState({ workspace: base.proposal.workspace, environment }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source freshness changing after wrapper entry prevents the tool operation", async () => {
  let fresh = true;
  let operations = 0;
  const base = prepared();
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async prepareProjectPluginApproval() { return { ...base, isFresh: async () => fresh }; },
    async runAgent(input) {
      fresh = false;
      return (await import("@useprism/runtime")).runAgent(input);
    },
    async runToolOperation() { operations += 1; throw new Error("must not run"); },
  }));
  assert.equal(result.kind, "admitted");
  assert.equal(result.result.status, "failed");
  assert.equal(operations, 0);
});

test("malformed exact tool input is denied by policy before launch", async () => {
  let operations = 0;
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runAgent(input) {
      const provider = {
        id: "malformed-input",
        async complete() {
          return { providerId: "malformed-input", model: null, text: JSON.stringify({
            kind: "tool", tool: "release-slug", operation: "slugify", input: { title: "Preview First", extra: true },
          }) };
        },
      };
      return (await import("@useprism/runtime")).runAgent({
        ...input,
        ports: { ...input.ports, provider },
      });
    },
    async runToolOperation() { operations += 1; throw new Error("must not run"); },
  }));
  assert.equal(result.kind, "admitted");
  assert.equal(result.lifecycleStarted, false);
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.code, "policy-denied");
  assert.equal(result.result.events.some((event) => event.type === "policy.allowed"), false);
  assert.equal(result.result.events.some((event) => event.type === "tool.completed"), false);
  assert.equal(operations, 0);
});

test("the deterministic final answer is the adapter-validated slug from its Tool exchange", async () => {
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "deterministic", model: null },
  }, dependencies({
    async runToolOperation() {
      return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "other-valid-slug" }, receipt: receipt() } as never;
    },
  }));
  assert.equal(result.kind, "admitted");
  assert.equal(result.result.status, "completed");
  assert.equal(result.result.status === "completed" ? result.result.answer : "", "other-valid-slug");
});

test("the optional Ollama provider uses the same one-tool adapter and validated exchange", async () => {
  let turns = 0;
  let operations = 0;
  const result = await runProjectPlugin({
    workspace: "/private/workspace",
    environment: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config", XDG_STATE_HOME: "/tmp/state" },
    goal,
    provider: { name: "ollama", model: "test-model", endpoint: "http://127.0.0.1:11434" },
  }, dependencies({
    createOllamaProvider(options) {
      assert.equal(options.endpoint, "http://127.0.0.1:11434");
      return Object.freeze({
        id: "ollama",
        async complete(request: ProviderRequest) {
          turns += 1;
          assert.equal(request.model, "test-model");
          if (turns === 1) {
            return {
              providerId: "ollama",
              model: "test-model",
              text: JSON.stringify({ kind: "tool", tool: "release-slug", operation: "slugify", input: { title: "Preview First" } }),
            };
          }
          assert.match(request.prompt, /"slug":"preview-first"/u);
          return { providerId: "ollama", model: "test-model", text: JSON.stringify({ kind: "final", answer: "preview-first" }) };
        },
      });
    },
    async runToolOperation(input) {
      operations += 1;
      assert.deepEqual(input.input, { title: "Preview First" });
      return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "preview-first" }, receipt: receipt() } as never;
    },
  }));
  assert.equal(result.result.status, "completed", JSON.stringify(result.result));
  assert.equal(turns, 2);
  assert.equal(operations, 1);
});

test("the normal run command composes real declaration, approval, artifact, registry, Runtime admission, and V3 persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-project-run-real-"));
  const workspace = join(root, "workspace");
  const plugin = join(workspace, "prism-plugins", "release-slug");
  const environment = { HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state") };
  try {
    await mkdir(join(workspace, ".prism"), { recursive: true });
    await mkdir(plugin, { recursive: true });
    await Promise.all(Object.values(environment).map(async (path) => mkdir(path, { recursive: true })));
    await writeFile(join(workspace, ".prism", "config.json"), '{"version":"prism-config-v1","provider":"deterministic"}\n');
    await writeFile(join(workspace, ".prism", "tool-plugin.json"), '{"version":"prism-project-tool-plugin-v1","path":"prism-plugins/release-slug","operation":"slugify"}\n');
    await writeFile(join(plugin, "manifest.json"), `${JSON.stringify({
      id: "release-slug", version: "1.0.0", apiVersion: 1, kind: "tool",
      compatibility: { kernelApiVersion: "pnh-kernel-v1" }, entrypoint: "index.mjs", files: ["index.mjs"], dependencies: [],
      requestedCapabilities: [{ id: "tool-operation", limit: { schema: "boolean-gate", version: "pnh-capability-limit-v1", enabled: true } }],
      license: { spdxId: "MIT", holder: "test" },
    })}\n`);
    await writeFile(join(plugin, "index.mjs"), "export const releaseSlug = true;\n");
    const prepared = await prepareProjectPluginApproval({ workspace });
    await publishFirstProjectPluginArtifact({
      prepared,
      confirmedApprovalDigest: prepared.proposal.approvalDigest,
      environment,
    });
    await writeProjectPluginApprovalState({ proposal: prepared.proposal, environment });
    const approvedWorkspace = prepared.proposal.workspace;
    assert.ok(await readProjectPluginApprovalState({ workspace: approvedWorkspace, environment }));

    let stdout = "";
    let stderr = "";
    let legacyCalls = 0;
    const runId = "423e4567-e89b-42d3-a456-426614174000";
    const code = await runCommand({
      arguments: [goal],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      dependencies: {
        async runDeterministic() {
          legacyCalls += 1;
          throw new Error("legacy deterministic path must not run");
        },
        environment,
        currentWorkingDirectory: () => approvedWorkspace,
        createRunId: () => runId,
        now: () => new Date("2026-09-02T10:00:00.000Z"),
        projectPluginDependencies: {
          async withOwnerApprovedSpawnPlugin(input) {
            return input.run({ ticket: input.ticket.ticket, containerPort: {} as never });
          },
          async runToolOperation() {
            return { ok: true, registration: { kind: "tool", pluginId: "release-slug", operations: ["slugify"] }, result: { slug: "preview-first" }, receipt: receipt() } as never;
          },
          nowMs: () => 100,
        },
      },
    });
    assert.equal(code, 0, stderr);
    assert.equal(stderr, "");
    assert.equal(stdout, `preview-first\nRun: ${runId}\n`);
    assert.equal(legacyCalls, 0);
    const record = await readRunRecord({ environment, runId });
    assert.equal(record.version, "prism-run-record-v3");
    assert.equal(record.terminal.status === "completed" ? record.terminal.answer : "", "preview-first");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
