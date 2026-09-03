import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import {
  sandboxCall,
  sandboxSupervisorHealth,
  sandboxWorkerHealth,
} from "../../packages/runtime/src/harness/sandbox.ts";

test("worker globals remain usable before core import", async () => {
  const first = await sandboxWorkerHealth();
  const second = await sandboxWorkerHealth();
  const { pid: firstPid, ...firstHealth } = first;
  const { pid: secondPid } = second;
  assert.deepEqual(firstHealth, {
    date: "number",
    performance: "number",
    process: "object",
    timer: "function",
    uid: "10001",
    manifest: "undefined",
  });
  assert.notEqual(firstPid, secondPid);
  assert.deepEqual(await sandboxSupervisorHealth(), {
    manifestTransport: "fd-memory",
    uid: "10001",
  });
  assert.equal(readdirSync("/tmp").some((name) => name.startsWith("pnh-core-manifest-")), false);
});

test("parent loader rejects computed and transitive core imports", async () => {
  const coreUrl = "file:///sandbox/packages/runtime/src/core/timestamp.ts";
  await assert.rejects(import(coreUrl), /parent test import of core denied/);

  const helperUrl = `data:text/javascript,${encodeURIComponent(`import ${JSON.stringify(coreUrl)};`)}`;
  await assert.rejects(import(helperUrl), /parent test import of core denied/);
});

test("unlisted core entries fail closed", async () => {
  await assert.rejects(
    sandboxCall({ args: [], entry: "missing.ts", exportName: "missing" }),
    /unlisted sandbox entry/,
  );
  await assert.rejects(
    sandboxCall({
      args: [],
      entry: "timestamp.ts",
      exportName: "parseUtcMs",
      port: { argumentIndex: -1, fixture: "valid", name: "sha256" },
    }),
    /sandbox port is invalid/,
  );
});

test("outer Docker boundary has no host authority", async () => {
  assert.equal(process.env.PNH_HOST_SENTINEL, undefined);
  assert.equal(existsSync("/var/run/docker.sock"), false);
  assert.throws(() => writeFileSync("/sandbox/pnh/.pnh-write-check", "blocked"));
  assert.throws(() => writeFileSync("/etc/pnh-write-check", "blocked"));
  await assert.rejects(fetch("http://example.invalid"));
});
