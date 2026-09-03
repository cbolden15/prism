import { createHash } from "node:crypto";
import { runPluginLoop } from "@useprism/runtime/plugin-runner";

const TOOL_REQUEST_DIGEST_VERSION = "pnh-tool-request-v1";

function requestDigest(value) {
  return createHash("sha256").update(JSON.stringify([
    TOOL_REQUEST_DIGEST_VERSION,
    value.tool,
    value.operation,
    value.callCount,
    value.input,
  ])).digest("hex");
}

function exactRequest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 5 &&
    ["tool", "operation", "callCount", "input", "requestDigest"].every((key) => keys.includes(key)) &&
    Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
    value.tool === "text-stats" &&
    value.operation === "analyze-text" &&
    value.callCount === 1 &&
    value.input === "one two three" &&
    typeof value.requestDigest === "string" &&
    value.requestDigest === requestDigest(value)
  );
}

function catalog(requestDigest) {
  return {
    version: "pnh-capability-catalog-v1",
    capabilities: [
      {
        id: "operations",
        limit: {
          schema: "string-set",
          version: "pnh-capability-limit-v1",
          values: ["analyze-text"],
        },
      },
      {
        id: "request-digests",
        limit: {
          schema: "string-set",
          version: "pnh-capability-limit-v1",
          values: [requestDigest],
        },
      },
      {
        id: "tool-calls",
        limit: { schema: "integer-max", version: "pnh-capability-limit-v1", max: 1 },
      },
      {
        id: "tools",
        limit: {
          schema: "string-set",
          version: "pnh-capability-limit-v1",
          values: ["text-stats"],
        },
      },
    ],
  };
}

const plugin = {
  async handle(request) {
    if (request.phase === "register") {
      return { kind: "policy", pluginId: "allow-text-stats" };
    }
    if (request.phase !== "admit") throw new Error("unsupported allow-text-stats request");
    return exactRequest(request.payload)
      ? { decision: "restrict", catalog: catalog(request.payload.requestDigest) }
      : { decision: "deny" };
  },
};

await runPluginLoop({ input: process.stdin, output: process.stdout, plugin });
