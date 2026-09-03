import assert from "node:assert/strict";
import { test } from "node:test";
import { OSS_RELEASE_PACKAGES } from "../../scripts/release/oss-release-contract.mjs";
import { promoteReleaseTags } from "../../scripts/release/promote-oss-release.mjs";

const REGISTRY = "https://registry.npmjs.org";

test("promotes the closed next set to latest in dependency order and verifies it", () => {
  const tags = new Map<string, { next: string; latest?: string }>(
    OSS_RELEASE_PACKAGES.map(({ name }) => [name, { next: "0.1.0" }]),
  );
  const calls: string[][] = [];
  const results = promoteReleaseTags({
    version: "0.1.0",
    runNpm(arguments_: readonly string[]) {
      calls.push([...arguments_]);
      if (arguments_[0] === "view") {
        return { status: 0, stdout: JSON.stringify(tags.get(arguments_[2] as string)), stderr: "" };
      }
      const [name] = (arguments_[2] as string).split("@").slice(0, -1).join("@").split("\0");
      const state = tags.get(name!);
      assert.ok(state);
      tags.set(name!, { ...state, latest: "0.1.0" });
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.deepEqual(results, OSS_RELEASE_PACKAGES.map(({ name }) => ({ name, status: "promoted" })));
  assert.deepEqual(
    calls.filter(([command]) => command === "dist-tag"),
    OSS_RELEASE_PACKAGES.map(({ name }) => [
      "dist-tag",
      "add",
      `${name}@0.1.0`,
      "latest",
      "--registry",
      REGISTRY,
    ]),
  );
  assert.equal(calls.some((arguments_) => arguments_.join(" ").includes("provider-codex")), false);
});

test("refuses an incomplete next set before mutating latest", () => {
  let mutations = 0;
  assert.throws(() => promoteReleaseTags({
    version: "0.1.0",
    runNpm(arguments_: readonly string[]) {
      if (arguments_[0] === "dist-tag") mutations += 1;
      const name = arguments_[2];
      return {
        status: 0,
        stdout: JSON.stringify(name === "@useprism/cli" ? {} : { next: "0.1.0" }),
        stderr: "",
      };
    },
  }), /next-tag-mismatch:@useprism\/cli/u);
  assert.equal(mutations, 0);
});

test("refuses to replace a conflicting latest tag and skips an already complete promotion", () => {
  let mutations = 0;
  assert.throws(() => promoteReleaseTags({
    version: "0.1.0",
    runNpm(arguments_: readonly string[]) {
      if (arguments_[0] === "dist-tag") mutations += 1;
      return {
        status: 0,
        stdout: JSON.stringify({ next: "0.1.0", latest: "0.0.9" }),
        stderr: "",
      };
    },
  }), /latest-tag-conflict:@useprism\/sdk/u);
  assert.equal(mutations, 0);

  const complete = promoteReleaseTags({
    version: "0.1.0",
    runNpm(arguments_: readonly string[]) {
      if (arguments_[0] === "dist-tag") mutations += 1;
      return {
        status: 0,
        stdout: JSON.stringify({ next: "0.1.0", latest: "0.1.0" }),
        stderr: "",
      };
    },
  });
  assert.deepEqual(complete, OSS_RELEASE_PACKAGES.map(({ name }) => ({ name, status: "already-latest" })));
  assert.equal(mutations, 0);
});

test("rolls back only latest tags added by this invocation when promotion fails", () => {
  const tags = new Map<string, { next: string; latest?: string }>(
    OSS_RELEASE_PACKAGES.map(({ name }, index) => [
      name,
      index === 0 ? { next: "0.1.0", latest: "0.1.0" } : { next: "0.1.0" },
    ]),
  );
  const mutations: string[][] = [];

  assert.throws(() => promoteReleaseTags({
    version: "0.1.0",
    runNpm(arguments_: readonly string[]) {
      if (arguments_[0] === "view") {
        return { status: 0, stdout: JSON.stringify(tags.get(arguments_[2] as string)), stderr: "" };
      }
      mutations.push([...arguments_]);
      if (arguments_[1] === "add") {
        const specification = arguments_[2] as string;
        const name = specification.slice(0, specification.lastIndexOf("@"));
        if (name === "@useprism/provider-ollama") {
          return { status: 1, stdout: "", stderr: "simulated failure" };
        }
        tags.set(name, { ...tags.get(name)!, latest: "0.1.0" });
        return { status: 0, stdout: "", stderr: "" };
      }
      const name = arguments_[2] as string;
      const state = { ...tags.get(name)! };
      delete state.latest;
      tags.set(name, state);
      return { status: 0, stdout: "", stderr: "" };
    },
  }), /dist-tag-promotion-failed:@useprism\/provider-ollama/u);

  assert.deepEqual(mutations, [
    ["dist-tag", "add", "@useprism/runtime@0.1.0", "latest", "--registry", REGISTRY],
    ["dist-tag", "add", "@useprism/provider-ollama@0.1.0", "latest", "--registry", REGISTRY],
    ["dist-tag", "rm", "@useprism/runtime", "latest", "--registry", REGISTRY],
  ]);
  assert.equal(tags.get("@useprism/sdk")?.latest, "0.1.0", "pre-existing latest must remain");
  for (const name of OSS_RELEASE_PACKAGES.slice(1).map(({ name }) => name)) {
    assert.equal(tags.get(name)?.latest, undefined, `${name} must be rolled back or untouched`);
  }
  assert.equal(mutations.some((arguments_) => arguments_.join(" ").includes("provider-codex")), false);
});
