import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runConformance } from "../../assurance/constitution/contracts/coverage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

test("collects registrations from executed tests only", () => {
  const result = runConformance(
    ["pnh/tests/fixtures/constitution/sample-conforming.test.ts"],
    repoRoot,
  );
  assert.equal(result.exitCode, 0);
  assert.ok(result.legacyLabels.has("PNH-INV-01"));
  assert.ok(!result.legacyLabels.has("PNH-INV-02"));
  assert.deepEqual(result.structuredProofs, []);
  assert.deepEqual(result.parseErrors, []);
});

test("malformed JSONL fails the run with a stable parse error", () => {
  const result = runConformance(
    ["pnh/tests/fixtures/constitution/sample-malformed-report.test.ts"],
    repoRoot,
  );
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.legacyLabels, new Set());
  assert.deepEqual(result.structuredProofs, []);
  assert.deepEqual(result.parseErrors, [{
    line: 1,
    code: "invalid-json",
    message: "report line is not valid JSON",
  }]);
});
