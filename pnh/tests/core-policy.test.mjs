import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createCorePolicy } from "../../packages/runtime/test/sandbox/harness/sandbox/core-policy.mjs";

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("manifest validation rejects out-of-core files and arbitrary edge targets", () => {
  const root = mkdtempSync(join(tmpdir(), "pnh-policy-"));
  const core = join(root, "core");
  const coreFile = join(core, "value.ts");
  const outsideFile = join(root, "outside.ts");
  mkdirSync(core);
  writeFileSync(coreFile, "export const value = 1;\n");
  writeFileSync(outsideFile, "export const value = 1;\n");

  const canonicalCore = realpathSync.native(core);
  const canonicalFile = realpathSync.native(coreFile);
  const fileUrl = pathToFileURL(canonicalFile).href;
  const valid = {
    coreRoot: canonicalCore,
    entries: ["value.ts"],
    files: {
      "value.ts": { path: canonicalFile, sha256: digest(coreFile), url: fileUrl },
    },
    edges: [],
  };

  try {
    assert.doesNotThrow(() => createCorePolicy({ manifest: valid, ts: {}, workerPath: join(root, "worker.mjs") }));
    assert.throws(
      () => createCorePolicy({
        manifest: {
          ...valid,
          files: {
            "outside.ts": {
              path: realpathSync.native(outsideFile),
              sha256: digest(outsideFile),
              url: pathToFileURL(realpathSync.native(outsideFile)).href,
            },
          },
          entries: ["outside.ts"],
        },
        ts: {},
        workerPath: join(root, "worker.mjs"),
      }),
      /outside core root/,
    );
    assert.throws(
      () => createCorePolicy({
        manifest: {
          ...valid,
          edges: [{ parent: fileUrl, specifier: "node:fs", target: "node:fs" }],
        },
        ts: {},
        workerPath: join(root, "worker.mjs"),
      }),
      /invalid manifest edge/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
