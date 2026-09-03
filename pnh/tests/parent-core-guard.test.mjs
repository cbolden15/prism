import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createParentCoreGuard } from "../../packages/runtime/test/sandbox/harness/sandbox/parent-core-guard-policy.mjs";

test("resolved parent guard rejects direct, transitive, computed, and symlinked core URLs", () => {
  const root = mkdtempSync(join(tmpdir(), "pnh-parent-guard-"));
  const core = join(root, "core");
  const helper = join(root, "helper.ts");
  const coreFile = join(core, "value.ts");
  const alias = join(root, "alias.ts");
  mkdirSync(core);
  writeFileSync(coreFile, "export const value = 1;\n");
  writeFileSync(helper, "export const helper = 1;\n");
  symlinkSync(coreFile, alias);

  try {
    const guard = createParentCoreGuard(realpathSync.native(core));
    const coreResult = { url: pathToFileURL(coreFile).href };
    const aliasResult = { url: pathToFileURL(alias).href };
    const context = { parentURL: pathToFileURL(helper).href };
    for (const specifier of ["./core/value.ts", "computed-value", "./alias.ts"]) {
      assert.throws(
        () => guard.resolve(
          specifier,
          context,
          () => specifier === "./alias.ts" ? aliasResult : coreResult,
        ),
        /parent test import of core denied/,
      );
    }
    assert.deepEqual(
      guard.resolve("./helper.ts", context, () => ({ url: pathToFileURL(helper).href })),
      { url: pathToFileURL(helper).href },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
