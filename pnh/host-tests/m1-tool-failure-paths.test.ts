import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { runToolTask, type RunToolTaskResult } from "../../packages/runtime/src/runtime/run-task.ts";
import {
  computePluginArtifactCommitments,
  createAdmittedPluginLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-launch-spec.ts";
import { buildPluginImage } from "../../packages/runtime/test/support/build-plugin-image.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = resolve(pnhRoot, "..", "packages", "runtime", "src");
const fixturePluginsRoot = resolve(pnhRoot, "host-tests", "fixtures", "plugins");
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

function waitForClose(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
}

async function runFailureFixture(options: {
  readonly pluginId: string;
  readonly expectedCode: "deadline" | "protocol";
  readonly deadlineMs: number;
}): Promise<void> {
  const registryRoot = mkdtempSync(resolve(tmpdir(), "pnh-tool-failure-registry-"));
  const requestId = `m1-${randomBytes(8).toString("hex")}`;
  let child: ChildProcessWithoutNullStreams | undefined;
  let stderr = "";
  try {
    cpSync(resolve(fixturePluginsRoot, options.pluginId), resolve(registryRoot, options.pluginId), { recursive: true });
    const built = buildPluginImage({
      runtimeRoot,
      pluginsRoot: fixturePluginsRoot,
      pluginId: options.pluginId,
      imageReference: `pnh-${options.pluginId}:m1`,
    });
    const commitments = computePluginArtifactCommitments({ runtimeRoot, imageDigest: built.imageDigest });
    const generated = generatePluginRegistry({
      pluginsRoot: registryRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments: { [options.pluginId]: commitments },
    });
    assert.equal(generated.ok, true);
    if (!generated.ok) return;
    const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
    assert.equal(admitted.ok, true);
    if (!admitted.ok) return;
    const launch = createAdmittedPluginLaunchSpec({
      ticket: admitted.ticket,
      pluginId: options.pluginId,
      runtimeRoot,
    });

    const gatewayToken = token();
    child = spawn(process.execPath, [gatewayPath], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    (child.stdio[3] as Writable).end(JSON.stringify({ v: 1, token: gatewayToken, plugins: [launch] }));
    const transport = createNodeStreamGatewayTransport(child.stdout, child.stdin);
    const port = createDockerBrokerPluginContainer({ ticket: admitted.ticket, token: gatewayToken, transport });

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

    let settlements = 0;
    const result: RunToolTaskResult = await runToolTask({
      ticket: admitted.ticket,
      authority: authority.authority,
      containerPort: port,
      intentPort: { async append() {} },
      pluginId: options.pluginId,
      operation: "echo",
      input: operationInput,
      deadlineMs: Date.now() + options.deadlineMs,
      requestId,
    }).then((value) => {
      settlements += 1;
      return value;
    });
    assert.equal(result.ok, false, JSON.stringify(result));
    if (result.ok) return;
    assert.equal(result.code, options.expectedCode, JSON.stringify(result));
    assert.equal(result.receipt?.confirmedAbsent, true);
    assert.equal(result.receipt?.oomKilled, false);
    assert.deepEqual(result.receipt?.cleanupErrors, []);
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    assert.equal(settlements, 1);
    assert.equal(dockerContainerIds(requestId), "");
  } finally {
    if (child !== undefined) {
      child.stdin.end();
      assert.equal(await waitForClose(child), 0, stderr);
    }
    assert.equal(dockerContainerIds(requestId), "");
    rmSync(registryRoot, { recursive: true, force: true });
  }
}

test("real Tool operation timeout settles once and leaves no container", { timeout: 60_000 }, async () => {
  await runFailureFixture({ pluginId: "tool-timeout", expectedCode: "deadline", deadlineMs: 4_000 });
});

test("real Tool invalid UTF-8 output settles once and leaves no container", { timeout: 60_000 }, async () => {
  await runFailureFixture({ pluginId: "tool-invalid-utf8", expectedCode: "protocol", deadlineMs: 15_000 });
});

test("real Tool duplicate extra output settles once and leaves no container", { timeout: 60_000 }, async () => {
  await runFailureFixture({ pluginId: "tool-extra-output", expectedCode: "protocol", deadlineMs: 15_000 });
});
