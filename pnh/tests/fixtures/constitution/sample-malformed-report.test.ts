import { appendFileSync } from "node:fs";
import { test } from "node:test";

test("malformed report fixture", (t) => {
  const report = process.env.PNH_CONSTITUTION_REPORT;
  if (report === undefined) {
    // Fixture: only meaningful under the executed-conformance runner, which
    // sets the report path. Plain suite discovery (the sandbox image runs
    // every pnh test file) must not fail on it.
    t.skip("no executed-conformance report path");
    return;
  }
  appendFileSync(report, "{malformed\n", "utf8");
});
