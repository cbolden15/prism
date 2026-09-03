import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { delimiter, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createCodexProvider } from "@useprism/provider-codex";

const execFileAsync = promisify(execFile);
const testRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testRoot, "..", "..", "..");
const mockBin = resolve(testRoot, "fixtures", "codex-bin");

test("the Codex provider runs end to end with a deterministic mocked CLI", { timeout: 30_000 }, async () => {
  const prompt = "Explain why provider contracts matter.";
  const { stdout } = await execFileAsync(
    "npm",
    ["run", "--silent", "prism:codex", "--", prompt],
    {
      cwd: repositoryRoot,
      env: { ...process.env, PATH: `${mockBin}${delimiter}${process.env.PATH ?? ""}` },
    },
  );
  assert.deepEqual(JSON.parse(stdout), {
    providerId: "codex-chatgpt",
    model: null,
    text: `MOCK_CODEX:${prompt}`,
  });
});

test(
  "the Codex provider completes one live request using the trusted Mac ChatGPT login",
  {
    timeout: 180_000,
    skip: process.env.PRISM_LIVE_CODEX !== "1",
  },
  async () => {
    const marker = "PRISM_CODEX_LIVE_OK";
    const result = await createCodexProvider().complete({
      prompt: `Reply with exactly ${marker} and no other text.`,
      model: null,
    });
    assert.equal(result.providerId, "codex-chatgpt");
    assert.equal(result.model, null);
    assert.match(result.text, new RegExp(marker));
  },
);
