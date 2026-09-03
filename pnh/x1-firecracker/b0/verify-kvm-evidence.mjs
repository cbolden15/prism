#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

const evidencePath = process.argv[2];
if (!evidencePath) {
  process.stderr.write("B4-KVM-ENV-BLOCKED evidence-path-missing\n");
  process.exit(1);
}

const metadata = lstatSync(evidencePath);
if (!metadata.isFile() || metadata.isSymbolicLink()) {
  process.stderr.write("B4-KVM-ENV-BLOCKED unsafe-evidence-file\n");
  process.exit(1);
}
const bytes = readFileSync(evidencePath);
const digest = createHash("sha256").update(bytes).digest("hex");
let evidence;
try {
  evidence = JSON.parse(bytes.toString("utf8"));
} catch {
  process.stderr.write("B4-KVM-ENV-BLOCKED invalid-evidence-json\n");
  process.exit(1);
}

if (
  evidence.schemaVersion !== 1
  || evidence.gate !== "B4-KVM-ENV"
  || evidence.status !== "PASS"
  || evidence.sourceBundleSha256 !== process.env.B4_SOURCE_BUNDLE_SHA256
  || evidence.containment?.closedSourceBundleOnly !== true
  || evidence.containment?.credentialKeysVisible !== 0
  || evidence.containment?.runnerHostSourceExecution !== false
  || evidence.l1?.architecture !== "x86_64"
  || evidence.l1?.hostCpuExposed !== true
  || evidence.l1?.kvmForced !== true
  || evidence.l1?.tcgAllowed !== false
  || evidence.nestedKvm?.operation !== "KVM_CREATE_VM"
  || evidence.nestedKvm?.result !== "PASS"
) {
  process.stderr.write("B4-KVM-ENV-BLOCKED evidence-claim-mismatch\n");
  process.exit(1);
}

process.stdout.write(`B4-KVM-ENV-PASS evidence_sha256=${digest}\n`);
