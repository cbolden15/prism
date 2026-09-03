import { runPluginLoop } from "@useprism/runtime/plugin-runner";

const GOAL_PREFIX = "Count the words in: ";

function exactRecord(value, keys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Object.keys(value);
  return (
    ownKeys.length === keys.length &&
    ownKeys.every((key) => keys.includes(key)) &&
    Reflect.ownKeys(value).every((key) => typeof key === "string" && ownKeys.includes(key)) &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && descriptor.get === undefined && descriptor.set === undefined;
    })
  );
}

function providerRequest(value) {
  if (!exactRecord(value, ["prompt", "model"])) return null;
  if (typeof value.prompt !== "string" || value.prompt.length === 0 || value.model !== null) return null;
  return value;
}

function textStats(value) {
  if (!exactRecord(value, ["text", "characters", "words", "lines"])) return null;
  if (
    typeof value.text !== "string" ||
    !Number.isSafeInteger(value.characters) || value.characters < 0 ||
    !Number.isSafeInteger(value.words) || value.words < 0 ||
    !Number.isSafeInteger(value.lines) || value.lines < 0
  ) return null;
  return value;
}

function turnRequest(prompt) {
  let value;
  try {
    value = JSON.parse(prompt);
  } catch {
    return null;
  }
  if (value?.turn === 1) {
    if (!exactRecord(value, ["goal", "turn"]) || typeof value.goal !== "string") return null;
    if (!value.goal.startsWith(GOAL_PREFIX) || value.goal.length === GOAL_PREFIX.length) return null;
    return { goal: value.goal, input: value.goal.slice(GOAL_PREFIX.length), turn: 1 };
  }
  if (value?.turn !== 2 || !exactRecord(value, ["goal", "turn", "toolResult"])) return null;
  if (typeof value.goal !== "string" || !value.goal.startsWith(GOAL_PREFIX)) return null;
  const result = textStats(value.toolResult);
  return result === null ? null : { goal: value.goal, toolResult: result, turn: 2 };
}

const plugin = {
  async handle(request) {
    if (request.phase === "register") {
      return { kind: "provider", pluginId: "local-scripted" };
    }
    if (request.phase !== "operate" || request.payload.operation !== "complete") {
      throw new Error("unsupported local-scripted request");
    }
    const provider = providerRequest(request.payload.input);
    if (provider === null) throw new TypeError("invalid local-scripted provider request");
    const turn = turnRequest(provider.prompt);
    if (turn === null) throw new TypeError("invalid local-scripted turn request");
    const decision = turn.turn === 1
      ? { kind: "tool", tool: "text-stats", operation: "analyze-text", input: turn.input }
      : { kind: "final", answer: `${turn.toolResult.words} words` };
    return { providerId: "local-scripted", model: null, text: JSON.stringify(decision) };
  },
};

await runPluginLoop({ input: process.stdin, output: process.stdout, plugin });
