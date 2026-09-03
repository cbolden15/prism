import {
  CAPABILITY_CATALOG_VERSION,
  CAPABILITY_LIMIT_VERSION,
} from "@useprism/sdk/policy";
import { runAgent } from "@useprism/runtime";

const decisions = [
  { kind: "tool", tool: "repository", operation: "list", input: { path: "." } },
  { kind: "final", answer: "README.md is the first entry." },
];
let providerTurn = 0;

const provider = {
  id: "example",
  async complete(request) {
    const decision = decisions[providerTurn];
    providerTurn += 1;
    if (decision === undefined) throw new Error("unexpected provider turn");
    return {
      providerId: "example",
      model: request.model,
      text: JSON.stringify(decision),
    };
  },
};

const repositoryTool = {
  definition: {
    id: "repository",
    description: "List files in the example workspace.",
    operations: [
      { name: "list", description: "List one directory. Input: {path:string}." },
    ],
  },
  async invoke(request) {
    if (request.operation !== "list") throw new Error("unsupported operation");
    return { path: request.input.path, entries: ["README.md"] };
  },
};

async function policy(request) {
  return {
    decision: "restrict",
    catalog: {
      version: CAPABILITY_CATALOG_VERSION,
      capabilities: [
        {
          id: "operations",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.operation],
          },
        },
        {
          id: "request-digests",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.requestDigest],
          },
        },
        {
          id: "tool-calls",
          limit: {
            schema: "integer-max",
            version: CAPABILITY_LIMIT_VERSION,
            max: request.callCount,
          },
        },
        {
          id: "tools",
          limit: {
            schema: "string-set",
            version: CAPABILITY_LIMIT_VERSION,
            values: [request.tool],
          },
        },
      ],
    },
  };
}

const result = await runAgent({
  goal: "Find the first repository entry.",
  model: null,
  ports: { provider, policy, tools: [repositoryTool] },
});

if (result.status !== "completed") {
  throw new Error(`example failed: ${result.code}`);
}

process.stdout.write(`${JSON.stringify({
  status: result.status,
  answer: result.answer,
  events: result.events.map(({ type }) => type),
}, null, 2)}\n`);
