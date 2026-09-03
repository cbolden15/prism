import { test } from "node:test";
import { appendFileSync } from "node:fs";
import { conformsTo } from "../../../../assurance/constitution/contracts/conforms-to.ts";

test("PNH-INV-01 sample conformance", () => {
  conformsTo("PNH-INV-01");
});

test.skip("PNH-INV-02 skipped never registers", () => {
  conformsTo("PNH-INV-02");
});

test.skip("skipped structured proof never emits a record", () => {
  const reportPath = process.env.PNH_CONSTITUTION_REPORT;
  if (reportPath === undefined) throw new Error("missing report path");
  appendFileSync(reportPath, '{"record_type":"structured-proof-v1"}\n', "utf8");
});
