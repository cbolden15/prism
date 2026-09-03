import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import {
  createDockerBrokerPluginContainer,
  createNodeStreamGatewayTransport,
} from "../adapters/docker-broker-plugin-container.ts";
import { toSupervisorStartupPlugin } from "../harness/plugin-spawn-supervisor.mjs";
import { runGatewayProcess, spawnGatewayChildren } from "../harness/sandbox/broker-gateway.mjs";
import type { PluginContainerPort } from "../kernel/plugin-container-port.ts";
import type { AdmissionTicket } from "./admission-ticket.ts";
import type { OwnerApprovedAdmissionTicket } from "./pinned-admission.ts";
import {
  assertOwnerApprovedLaunchSpecUnchanged,
  createOwnerApprovedPluginSpawnLaunchSpec,
} from "./pinned-spawn-launch.ts";
import {
  resolveRuntimeArtifactPaths,
  type RuntimeArtifactPathOverrides,
} from "./artifact-paths.ts";

function token(): string {
  return randomBytes(32).toString("hex");
}

export interface OwnerApprovedSpawnContext {
  readonly ticket: AdmissionTicket;
  readonly containerPort: PluginContainerPort;
}

export async function withOwnerApprovedSpawnPlugin<T>(options: RuntimeArtifactPathOverrides & {
  readonly ticket: OwnerApprovedAdmissionTicket;
  readonly pluginId: string;
  readonly pluginRoot: string;
  readonly run: (context: OwnerApprovedSpawnContext) => Promise<T>;
}): Promise<T> {
  const spec = createOwnerApprovedPluginSpawnLaunchSpec({
    ticket: options.ticket,
    pluginId: options.pluginId,
    pluginRoot: options.pluginRoot,
    runtimeRoot: options.runtimeRoot,
    sdkProtocolPath: options.sdkProtocolPath,
    sdkResourceBoundsPath: options.sdkResourceBoundsPath,
  });
  const startupPlugin = toSupervisorStartupPlugin(spec);
  const brokerToken = token();
  const supervisorToken = token();
  const gatewayToken = token();
  const toGateway = new PassThrough();
  const fromGateway = new PassThrough();

  assertOwnerApprovedLaunchSpecUnchanged({ ticket: options.ticket, pluginId: options.pluginId, spec });
  const { runtimeRoot } = resolveRuntimeArtifactPaths(options);
  const children = spawnGatewayChildren({
    brokerToken,
    supervisorToken,
    plugins: [startupPlugin],
    supervisorPath: resolve(runtimeRoot, "harness", "plugin-spawn-supervisor.mjs"),
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
  const containerPort = createDockerBrokerPluginContainer({
    ticket: options.ticket.ticket,
    token: gatewayToken,
    transport,
  });
  try {
    return await options.run({ ticket: options.ticket.ticket, containerPort });
  } finally {
    toGateway.end();
    await gatewayDone;
  }
}
