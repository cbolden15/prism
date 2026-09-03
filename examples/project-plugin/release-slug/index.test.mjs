import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, prismToolAuthoringFixture, slugify } from "./index.mjs";

test("slugify handles the release title", async () => {
  assert.equal(slugify("Preview First"), "preview-first");
  assert.deepEqual(await handle({ phase: "register" }), {
    kind: "tool", operations: ["slugify"], pluginId: "release-slug",
  });
  assert.deepEqual(await handle({
    phase: "operate",
    payload: { operation: "slugify", input: prismToolAuthoringFixture.input },
  }), prismToolAuthoringFixture.expected);
});
