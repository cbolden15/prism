import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDockerBrokerPluginContainer,
  createNodeStreamGatewayTransport,
} from "../../packages/runtime/src/adapters/docker-broker-plugin-container.ts";
import { spawnGatewayChildren, runGatewayProcess } from "../../packages/runtime/src/harness/sandbox/broker-gateway.mjs";
import { toSupervisorStartupPlugin } from "../../packages/runtime/src/harness/plugin-spawn-supervisor.mjs";
import { admitRegistryBytes } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import { registerAdmittedPlugins } from "../../packages/runtime/src/runtime/run-task.ts";
import { runToolOperation } from "../../packages/runtime/src/runtime/internal/plugin-session.ts";
import {
  computeSpawnPluginArtifactCommitments,
  createAdmittedPluginSpawnLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(pnhRoot, "..");
const runtimeRoot = resolve(repositoryRoot, "packages", "runtime", "src");
const pluginsRoot = resolve(pnhRoot, "host-tests", "fixtures", "spawn-plugins");
const pluginId = "pid-reporter";
const pluginRoot = resolve(pluginsRoot, pluginId);
const supervisorPath = resolve(runtimeRoot, "harness", "plugin-spawn-supervisor.mjs");
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [],
};

function token(): string {
  return randomBytes(32).toString("hex");
}

/** Whether a pid still exists. `EPERM` means it exists but is not ours. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntil(predicate: () => boolean, label: string, attempts = 400): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

test(
  "the spawn executor leaks no processes on cleanup, end to end through the gateway",
  { timeout: 120_000 },
  async () => {
    const artifactCommitments = {
      [pluginId]: computeSpawnPluginArtifactCommitments({ runtimeRoot, pluginRoot }),
    };
    const generated = generatePluginRegistry({
      pluginsRoot,
      environment: "production",
      capabilityCatalog,
      artifactCommitments,
    });
    assert.equal(generated.ok, true, JSON.stringify(generated));
    if (!generated.ok) return;
    const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    if (!admitted.ok) return;

    const spec = createAdmittedPluginSpawnLaunchSpec({
      ticket: admitted.ticket,
      pluginId,
      runtimeRoot,
      pluginRoot,
    });
    const startupPlugin = toSupervisorStartupPlugin(spec);

    const brokerToken = token();
    const supervisorToken = token();
    const gatewayToken = token();

    const toGateway = new PassThrough();
    const fromGateway = new PassThrough();

    const children = spawnGatewayChildren({
      brokerToken,
      supervisorToken,
      plugins: [startupPlugin],
      supervisorPath,
    });
    const gatewayDone = runGatewayProcess({
      input: toGateway,
      output: fromGateway,
      token: gatewayToken,
      children,
      brokerToken,
      supervisorToken,
    });

    const transport = createNodeStreamGatewayTransport(fromGateway, toGateway);
    const port = createDockerBrokerPluginContainer({ ticket: admitted.ticket, token: gatewayToken, transport });

    let reportedPid: number | undefined;
    try {
      const result = await registerAdmittedPlugins({
        ticket: admitted.ticket,
        containerPort: port,
        deadlineMs: Date.now() + 30_000,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      if (!result.ok) return;
      assert.deepEqual(result.registrations, [
        { kind: "tool", pluginId, operations: ["report-pid"] },
      ]);
      const receipt = result.receipts[0];
      assert.ok(receipt);
      assert.equal(receipt.exitCode, 0);
      // The spawn executor has no cgroup memory verdict to report, so it
      // honestly reports `null` rather than asserting `false` (see
      // plugin-spawn-supervisor.mjs's observationFor). Not-OOM-killed here
      // means "not confirmed OOM-killed", i.e. anything but `true`.
      assert.notEqual(receipt.oomKilled, true);
      assert.equal(receipt.confirmedAbsent, true);
      assert.deepEqual(receipt.cleanupErrors, []);

      const toolResult = await runToolOperation({
        ticket: admitted.ticket,
        containerPort: port,
        pluginId,
        operation: "report-pid",
        input: null,
        deadlineMs: Date.now() + 30_000,
        requestId: `spawn-lifecycle-${randomBytes(8).toString("hex")}`,
      });
      assert.equal(toolResult.ok, true, JSON.stringify(toolResult));
      if (!toolResult.ok) return;
      const reported = toolResult.result as { pid: number };
      reportedPid = reported.pid;
      assert.equal(typeof reportedPid, "number");
      assert.ok(reportedPid > 1);
      // This is the core assertion: the receipt claims the process is
      // confirmed absent, so the OS-level probe must already agree by the
      // time we observe it — not eventually, immediately. Task 5 had a real
      // bug where `confirmedAbsent: true` was reported while the process
      // was still alive; this is the check that would have caught it.
      assert.equal(toolResult.receipt.confirmedAbsent, true);
      assert.equal(processAlive(reportedPid), false, "confirmedAbsent was true but the OS still sees the pid");
    } finally {
      toGateway.end();
      await gatewayDone;
      if (reportedPid !== undefined) {
        await waitUntil(() => !processAlive(reportedPid as number), "the spawned plugin process to be reaped");
      }
    }
  },
);
