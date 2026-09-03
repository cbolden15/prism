import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import {
  createCodexProvider,
  type CodexSpawnOptions,
} from "@useprism/provider-codex";

class FakeCodexChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 424_242;
  killedWith: NodeJS.Signals | number | undefined;
  kill(signal?: NodeJS.Signals | number): boolean { this.killedWith = signal; return true; }
}

test("Codex execution uses an isolated ephemeral read-only CLI invocation", async () => {
  const child = new FakeCodexChild();
  let command = "";
  let args: readonly string[] = [];
  let options: CodexSpawnOptions | undefined;
  let stdin = "";
  child.stdin.on("data", (bytes) => { stdin += bytes.toString("utf8"); });

  const resultPromise = createCodexProvider({
    timeoutMs: 5_000,
    environment: { HOME: "/Users/test", PATH: "/usr/bin", NODE_OPTIONS: "--disable-proto=throw", SECRET: "no" },
    spawnProcess(executable, receivedArgs, receivedOptions) {
      command = executable;
      args = receivedArgs;
      options = receivedOptions;
      const outputIndex = receivedArgs.indexOf("--output-last-message");
      const outputPath = receivedArgs[outputIndex + 1];
      if (outputPath === undefined) throw new Error("missing output path");
      queueMicrotask(() => {
        writeFileSync(outputPath, "mocked Codex answer\n");
        child.emit("close", 0, null);
      });
      return child;
    },
  }).complete({ prompt: "Return a concise answer.", model: "gpt-5.4-mini" });
  const result = await resultPromise;

  assert.deepEqual(result, {
    providerId: "codex-chatgpt",
    model: "gpt-5.4-mini",
    text: "mocked Codex answer",
  });
  assert.equal(command, "codex");
  assert.ok(options !== undefined);
  assert.equal(typeof options.cwd, "string");
  assert.match(String(options.cwd), /prism-codex-/);
  assert.ok(args.includes("exec"));
  assert.ok(args.includes("--ephemeral"));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("--sandbox"));
  assert.ok(args.includes("read-only"));
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.ok(args.includes("--output-last-message"));
  assert.ok(args.includes("--model"));
  assert.ok(args.includes("gpt-5.4-mini"));
  assert.equal(args.at(-1), "-");
  assert.equal(stdin, "Return a concise answer.");
  assert.deepEqual(options.env, {
    HOME: "/Users/test",
    PATH: "/usr/bin",
    NODE_OPTIONS: "--disable-proto=throw",
  });
  assert.equal(child.killedWith, undefined);
});

test("Codex execution omits model selection when the subscription default is requested", async () => {
  const child = new FakeCodexChild();
  let args: readonly string[] = [];
  const result = await createCodexProvider({
    timeoutMs: 5_000,
    spawnProcess(_command, receivedArgs) {
      args = receivedArgs;
      const outputPath = receivedArgs[receivedArgs.indexOf("--output-last-message") + 1];
      if (outputPath === undefined) throw new Error("missing output path");
      queueMicrotask(() => {
        writeFileSync(outputPath, "default model answer");
        child.emit("close", 0, null);
      });
      return child;
    },
  }).complete({ prompt: "Use the account default.", model: null });
  assert.equal(result.text, "default model answer");
  assert.equal(args.includes("--model"), false);
});

test("Codex execution reports bounded CLI failure text without an output artifact", async () => {
  const child = new FakeCodexChild();
  await assert.rejects(
    createCodexProvider({
      timeoutMs: 5_000,
      spawnProcess() {
        queueMicrotask(() => {
          child.stderr.end("mock login failure");
          child.emit("close", 1, null);
        });
        return child;
      },
    }).complete({ prompt: "This will fail.", model: null }),
    /codex exec failed: mock login failure/,
  );
});
