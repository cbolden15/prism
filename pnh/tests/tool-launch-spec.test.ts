import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admitRegistryBytes } from "../../packages/runtime/src/runtime/admission-ticket.ts";
import {
  computePluginArtifactCommitments,
  createAdmittedPluginLaunchSpec,
} from "../../packages/runtime/src/runtime/plugin-launch-spec.ts";
import { generatePluginRegistry } from "@useprism/sdk/node/registry";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = resolve(pnhRoot, "..", "packages", "runtime", "src");
const pluginId = "tool-golden";
const capabilityCatalog = {
  version: "pnh-capability-catalog-v1" as const,
  capabilities: [{
    id: "tool-operation",
    limit: { schema: "boolean-gate" as const, version: "pnh-capability-limit-v1" as const, enabled: true },
  }],
};

function ticketFor(imageDigest: string) {
  const commitments = computePluginArtifactCommitments({ runtimeRoot, imageDigest });
  const generated = generatePluginRegistry({
    pluginsRoot: resolve(pnhRoot, "tests", "fixtures", "plugins"),
    environment: "production",
    capabilityCatalog,
    artifactCommitments: { [pluginId]: commitments },
  });
  if (!generated.ok) throw new Error("registry generation failed");
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error("registry admission failed");
  return { commitments, ticket: admitted.ticket };
}

function mismatchedTicket() {
  const generated = generatePluginRegistry({
    pluginsRoot: resolve(pnhRoot, "tests", "fixtures", "plugins"),
    environment: "production",
    capabilityCatalog,
    artifactCommitments: {
      [pluginId]: {
        runnerDigest: "c".repeat(64),
        imageDigest: "b".repeat(64),
        profileDigest: "d".repeat(64),
      },
    },
  });
  if (!generated.ok) throw new Error("registry generation failed");
  const admitted = admitRegistryBytes(generated.bytes, generated.registryDigest);
  if (!admitted.ok) throw new Error("registry admission failed");
  return admitted.ticket;
}

test("the committed plugin profile produces one ticket-bound Docker launch specification", () => {
  const imageDigest = "a".repeat(64);
  const { commitments, ticket } = ticketFor(imageDigest);
  const launch = createAdmittedPluginLaunchSpec({ ticket, pluginId, runtimeRoot });

  assert.equal(launch.pluginId, pluginId);
  assert.equal(launch.imageDigest, imageDigest);
  assert.equal(commitments.profileDigest, ticket.plugins[0]?.profileDigest);
  assert.equal(commitments.runnerDigest, ticket.plugins[0]?.runnerDigest);
  assert.deepEqual(launch.createArgs, [
    "--pull=never",
    "--log-driver=none",
    "--interactive",
    "--ipc=private",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    `--security-opt=seccomp=${resolve(runtimeRoot, "kernel", "plugin-runner", "seccomp.json")}`,
    "--pids-limit=64",
    "--memory=128m",
    "--cpus=0.5",
    "--user=10101:10101",
    "--workdir=/pnh/kernel/plugin-runner",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
    "--env=HOME=/tmp",
    "--env=NODE_OPTIONS=--disable-proto=throw",
    `sha256:${imageDigest}`,
  ]);
});

test("the plugin launch resolver rejects a ticket with a different committed runner", () => {
  assert.throws(
    () => createAdmittedPluginLaunchSpec({ ticket: mismatchedTicket(), pluginId, runtimeRoot }),
    /commitment mismatch/,
  );
});
