import { writeFileSync } from "node:fs";
import {
  checkTestCoreImports,
  createCoreManifest,
} from "../../../../scripts/check-module-graph.ts";

const outputPath = process.argv[2];
if (outputPath === undefined) {
  throw new Error("usage: write-core-manifest.ts <output-path>");
}

const testViolations = checkTestCoreImports("/sandbox/pnh/tests", {
  coreDirectory: "/sandbox/packages/runtime/src/core",
  traversalDirectory: "/sandbox",
});
if (testViolations.length > 0) {
  throw new Error(
    `runtime core imports are forbidden in tests: ${testViolations
      .map((violation) => `${violation.file}: ${violation.specifier}`)
      .join(", ")}`,
  );
}

const manifest = createCoreManifest("/sandbox/packages/runtime/src/core");
writeFileSync(outputPath, JSON.stringify(manifest));
