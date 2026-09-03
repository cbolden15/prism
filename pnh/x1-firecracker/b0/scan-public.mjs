#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const b4Root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(b4Root, "../..");
const allowlist = JSON.parse(readFileSync(path.join(sourceRoot, ".b4/source-allowlist.json"), "utf8"));
const credentialAssignment = /(?:api_?key|auth|cookie|credential|password|private_?key|secret|session|token)\s*[:=]\s*["'][^"'\n]{8,}["']/i;
const operatorPath = /\/(?:Users|home)\/[A-Za-z0-9._-]+\/(?:Projects|\.ssh|\.config|Library)\//;
const privateEndpoint = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

function fail(code) {
  process.stderr.write(`B4-PUBLIC-SCAN-FAIL ${code}\n`);
  process.exit(1);
}

for (const entry of allowlist.entries) {
  const absolutePath = path.join(sourceRoot, ...entry.path.split("/"));
  const text = readFileSync(absolutePath, "utf8").replaceAll(/fixture-[A-Za-z0-9-]+/g, "FIXTURE");
  if (credentialAssignment.test(text)) fail(`credential-assignment:${entry.path}`);
  if (operatorPath.test(text)) fail(`operator-path:${entry.path}`);
  if (privateEndpoint.test(text)) fail(`private-endpoint:${entry.path}`);
}

process.stdout.write(`B4-PUBLIC-SCAN-PASS files=${allowlist.entries.length}\n`);
