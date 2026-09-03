import { appendFileSync } from "node:fs";
import {
  LEGACY_CONFORMANCE_RECORD_TYPE,
  type LegacyConformanceRecord,
} from "./proof-report.ts";

export function conformsTo(id: string): void {
  const reportPath = process.env.PNH_CONSTITUTION_REPORT;
  if (reportPath === undefined || reportPath.length === 0) return;
  const record: LegacyConformanceRecord = {
    record_type: LEGACY_CONFORMANCE_RECORD_TYPE,
    invariant_id: id,
  };
  appendFileSync(reportPath, `${JSON.stringify(record)}\n`, "utf8");
}
