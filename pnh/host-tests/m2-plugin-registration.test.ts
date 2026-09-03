import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import type { Writable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDockerBrokerPluginContainer,
  createNodeStreamGatewayTransport,
} from "../../packages/runtime/src/adapters/docker-broker-plugin-container.ts";
import { admitPluginAuthority, type CoreAdmissionPort } from "../../packages/runtime/src/kernel/plugin-kernel.ts";
import { admitRegistryBytes } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  computePluginArtifactCommitments,
  createAdmittedPluginLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-launch-spec.ts";
import { registerAdmittedPlugins, runToolTask } from "../../packages/runtime/src/runtime/run-task.ts";
import { buildPluginImage } from "../../packages/runtime/test/support/build-plugin-image.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = resolve(pnhRoot, "..", "packages", "runtime", "src");
const pluginsRoot = resolve(pnhRoot, "host-tests", "fixtures", "registration-plugins");
const gatewayPath = resolve(runtimeRoot, "harness", "sandbox", "broker-gateway.mjs");
const pluginIds = ["memory-golden", "policy-golden", "provider-golden", "renderer-golden", "tool-golden"] as const;
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [{
    id: "allowed-hosts",
    limit: {
      schema: "string-set" as const,
      version: "pnh-capability-limit-v1" as const,
      values: ["api-a", "api-b"],
    },
  }],
};

const corePort: CoreAdmissionPort = {
  async deriveCapabilityGrant(input) {
    return {
      ok: true,
      grant: {
        parentGrantDigest: input.parentGrantDigest,
        taskDigest: input.taskDigest,
        pluginId: input.pluginId,
        pluginSetDigest: input.pluginSetDigest,
        catalogDigest: createHash("sha256").update(JSON.stringify(input.catalog)).digest("hex"),
        capabilities: input.requested,
      },
      digest: createHash("sha256").update(`grant:${input.pluginId}`).digest("hex"),
    };
  },
};

function token(): string {
  return randomBytes(32).toString("hex");
}

function dockerContainerIds(requestId: string): string {
  const result = spawnSync("docker", ["ps", "-aq", "--filter", `label=org.pnh.request-id=${requestId}`], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("M2 registers all five plugin kinds through real containers and the production codec", { timeout: 120_000 }, async () => {
  const artifactCommitments = Object.fromEntries(pluginIds.map((pluginId) => {
    const built = buildPluginImage({
      runtimeRoot,
      pluginsRoot,
      pluginId,
      imageReference: `pnh-${pluginId}:m2-registration`,
    });
    return [pluginId, computePluginArtifactCommitments({ runtimeRoot, imageDigest: built.imageDigest })];
  }));
  const generated = generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog,
    artifactCommitments,
  });
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  assert.equal(admitted.ok, true);
  if (!admitted.ok) return;
  const launches = admitted.ticket.plugins.map((plugin) =>
    createAdmittedPluginLaunchSpec({ ticket: admitted.ticket, pluginId: plugin.id, runtimeRoot }));

  const gatewayToken = token();
  const child = spawn(process.execPath, [gatewayPath], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  (child.stdio[3] as Writable).end(JSON.stringify({ v: 1, token: gatewayToken, plugins: launches }));
  const transport = createNodeStreamGatewayTransport(child.stdout, child.stdin);
  const port = createDockerBrokerPluginContainer({ ticket: admitted.ticket, token: gatewayToken, transport });
  const requestIds: string[] = [];

  try {
    const result = await registerAdmittedPlugins({
      ticket: admitted.ticket,
      containerPort: port,
      deadlineMs: Date.now() + 30_000,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.deepEqual(result.registrations, [
      { kind: "memory", pluginId: "memory-golden" },
      { kind: "policy", pluginId: "policy-golden" },
      { kind: "provider", pluginId: "provider-golden" },
      { kind: "renderer", pluginId: "renderer-golden" },
      { kind: "tool", pluginId: "tool-golden", operations: ["echo"] },
    ]);
    for (const receipt of result.receipts) {
      requestIds.push(receipt.requestId);
      assert.equal(receipt.exitCode, 0);
      assert.equal(receipt.oomKilled, false);
      assert.equal(receipt.confirmedAbsent, true);
      assert.deepEqual(receipt.cleanupErrors, []);
      assert.equal(dockerContainerIds(receipt.requestId), "");
    }

    const authority = await admitPluginAuthority({
      ticket: admitted.ticket,
      containerPort: port,
      parentGrantDigest: "a".repeat(64),
      taskDigest: "b".repeat(64),
      deadlineMs: Date.now() + 30_000,
      corePort,
    });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    if (!authority.ok) return;
    assert.equal(authority.authority.plugins.length, 5);
    assert.equal(authority.authority.policyReceipts.length, 1);
    const policyReceipt = authority.authority.policyReceipts[0];
    assert.ok(policyReceipt);
    requestIds.push(policyReceipt.requestId);
    assert.equal(policyReceipt.exitCode, 0);
    assert.equal(policyReceipt.oomKilled, false);
    assert.equal(policyReceipt.confirmedAbsent, true);
    assert.deepEqual(policyReceipt.cleanupErrors, []);
    assert.equal(dockerContainerIds(policyReceipt.requestId), "");

    const rejectedRequestId = `m2-widened-${randomBytes(8).toString("hex")}`;
    const intents: object[] = [];
    const rejected = await runToolTask({
      ticket: admitted.ticket,
      authority: authority.authority,
      containerPort: port,
      intentPort: { async append(intent) { intents.push(intent); } },
      pluginId: "tool-golden",
      operation: "echo",
      input: {
        capabilityId: "allowed-hosts",
        requested: {
          schema: "string-set",
          version: "pnh-capability-request-v1",
          values: ["api-a", "api-c"],
        },
      },
      deadlineMs: Date.now() + 30_000,
      requestId: rejectedRequestId,
    });
    assert.deepEqual(rejected, { ok: false, code: "request-widening" });
    assert.equal(intents.length, 0);
    assert.equal(dockerContainerIds(rejectedRequestId), "");

    const toolRequestId = `m2-tool-${randomBytes(8).toString("hex")}`;
    const toolResult = await runToolTask({
      ticket: admitted.ticket,
      authority: authority.authority,
      containerPort: port,
      intentPort: { async append(intent) { intents.push(intent); } },
      pluginId: "tool-golden",
      operation: "echo",
      input: {
        capabilityId: "allowed-hosts",
        requested: {
          schema: "string-set",
          version: "pnh-capability-request-v1",
          values: ["api-b", "api-a"],
        },
      },
      deadlineMs: Date.now() + 30_000,
      requestId: toolRequestId,
    });
    assert.equal(toolResult.ok, true, JSON.stringify(toolResult));
    if (!toolResult.ok) return;
    requestIds.push(toolResult.receipt.requestId);
    assert.equal(intents.length, 1);
    assert.equal(intents[0], toolResult.intent);
    assert.equal(Object.isFrozen(toolResult.intent), true);
    assert.deepEqual(toolResult.result, {
      capabilityId: "allowed-hosts",
      requested: {
        schema: "string-set",
        version: "pnh-capability-request-v1",
        values: ["api-a", "api-b"],
      },
    });
    assert.equal(toolResult.receipt.confirmedAbsent, true);
    assert.equal(dockerContainerIds(toolRequestId), "");
  } finally {
    child.stdin.end();
    const status = await new Promise<number | null>((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("close", resolvePromise);
    });
    assert.equal(status, 0, stderr);
    for (const requestId of requestIds) assert.equal(dockerContainerIds(requestId), "");
  }
});
