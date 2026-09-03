import { runAgent } from "@useprism/runtime";

let invoked = false;

const result = await runAgent({
  goal: "Try the blocked operation.",
  model: null,
  ports: {
    provider: {
      id: "example",
      async complete(request) {
        return {
          providerId: "example",
          model: request.model,
          text: JSON.stringify({
            kind: "tool",
            tool: "repository",
            operation: "list",
            input: { path: "." },
          }),
        };
      },
    },
    async policy() {
      return { decision: "deny" };
    },
    tools: [{
      definition: {
        id: "repository",
        description: "A tool that policy will block.",
        operations: [{ name: "list", description: "List a directory." }],
      },
      async invoke() {
        invoked = true;
        return [];
      },
    }],
  },
});

if (result.status !== "failed" || result.code !== "policy-denied" || invoked) {
  throw new Error("policy-denial example did not fail closed");
}

process.stdout.write(`${JSON.stringify({
  status: result.status,
  code: result.code,
  toolInvoked: invoked,
}, null, 2)}\n`);
