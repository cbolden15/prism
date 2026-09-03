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
import { runToolTask } from "../../packages/runtime/src/runtime/run-task.ts";
import {
  computePluginArtifactCommitments,
  createAdmittedPluginLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-launch-spec.ts";
import { buildPluginImage } from "../../packages/runtime/test/support/build-plugin-image.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = resolve(pnhRoot, "..", "packages", "runtime", "src");
const pluginsRoot = resolve(pnhRoot, "tests", "fixtures", "plugins");
const gatewayPath = resolve(runtimeRoot, "harness", "sandbox", "broker-gateway.mjs");
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [{
    id: "tool-operation",
    limit: { schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled: true },
  }],
};
const operationInput = {
  capabilityId: "tool-operation",
  requested: { schema: "boolean-gate" as const, version: "pnh-capability-request-v1" as const, enabled: true },
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

test("M1 launches the committed Tool and runs registration plus operation through Runtime", { timeout: 60_000 }, async () => {
  const built = buildPluginImage({ runtimeRoot, pluginsRoot, pluginId: "tool-golden" });
  const commitments = computePluginArtifactCommitments({ runtimeRoot, imageDigest: built.imageDigest });
  const generated = generatePluginRegistry({
    pluginsRoot,
    environment: "production",
    capabilityCatalog,
    artifactCommitments: { "tool-golden": commitments },
  });
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  assert.equal(admitted.ok, true);
  if (!admitted.ok) return;
  const launch = createAdmittedPluginLaunchSpec({
    ticket: admitted.ticket,
    pluginId: "tool-golden",
    runtimeRoot,
  });

  const gatewayToken = token();
  const child = spawn(process.execPath, [gatewayPath], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  (child.stdio[3] as Writable).end(JSON.stringify({ v: 1, token: gatewayToken, plugins: [launch] }));
  const transport = createNodeStreamGatewayTransport(child.stdout, child.stdin);
  const port = createDockerBrokerPluginContainer({ ticket: admitted.ticket, token: gatewayToken, transport });
  const requestId = `m1-${randomBytes(8).toString("hex")}`;

  try {
    const authority = await admitPluginAuthority({
      ticket: admitted.ticket,
      containerPort: port,
      parentGrantDigest: "a".repeat(64),
      taskDigest: "b".repeat(64),
      deadlineMs: Date.now() + 15_000,
      corePort,
    });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    if (!authority.ok) return;
    const intents: object[] = [];
    const result = await runToolTask({
      ticket: admitted.ticket,
      authority: authority.authority,
      containerPort: port,
      intentPort: { async append(intent) { intents.push(intent); } },
      pluginId: "tool-golden",
      operation: "echo",
      input: operationInput,
      deadlineMs: Date.now() + 15_000,
      requestId,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(intents.length, 1);
    assert.equal(intents[0], result.intent);
    assert.deepEqual(result.registration, { kind: "tool", operations: ["echo"], pluginId: "tool-golden" });
    assert.deepEqual(result.result, { echoed: operationInput });
    assert.equal(result.receipt.exitCode, 0);
    assert.equal(result.receipt.oomKilled, false);
    assert.equal(result.receipt.confirmedAbsent, true);
    assert.deepEqual(result.receipt.cleanupErrors, []);
    assert.equal(dockerContainerIds(requestId), "");
  } finally {
    child.stdin.end();
    const status = await new Promise<number | null>((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("close", resolvePromise);
    });
    assert.equal(status, 0, stderr);
    assert.equal(dockerContainerIds(requestId), "");
  }
});
