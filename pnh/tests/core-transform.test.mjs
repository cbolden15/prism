import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { transformCoreSource } from "../../packages/runtime/test/sandbox/harness/sandbox/core-transform.mjs";

const ts = createRequire(process.env.PNH_RUNNER_PACKAGE ?? import.meta.url)("typescript");

function transform(source) {
  return transformCoreSource(
    ts,
    { path: "/sandbox/packages/runtime/src/core/probe.ts" },
    source,
  );
}

async function load(source) {
  const url = `data:text/javascript;base64,${Buffer.from(transform(source)).toString("base64")}`;
  return import(url);
}

test("ambient references are denied only in transformed core", async () => {
  const module = await load(`
    export const date = () => Date.now();
    export const globalProcess = () => globalThis["pro" + "cess"].env;
    export const random = () => Math.random();
    export const math = () => Math.floor(1.9);
  `);
  assert.throws(module.date, /PNH ambient denied: Date/);
  assert.throws(module.globalProcess, /PNH ambient denied: globalThis/);
  assert.throws(module.random, /PNH ambient denied: Math.random/);
  assert.equal(module.math(), 1);
});

test("forbidden dynamic source syntax fails before evaluation", () => {
  assert.throws(
    () => transform('export const dynamic = () => import("./peer.ts");'),
    /dynamic import denied/,
  );
  assert.throws(
    () => transform('declare const require: (value: string) => unknown; export const load = () => require("x");'),
    /require denied/,
  );
  assert.throws(
    () => transform("export const here = import.meta.url;"),
    /import.meta denied/,
  );
});

test("transform emits an inline map to the original TypeScript source", () => {
  const output = transform("export const value: number = 1;\n");
  const encoded = output.match(/sourceMappingURL=data:application\/json;base64,([^\n]+)/)?.[1];
  assert.notEqual(encoded, undefined);
  const map = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.deepEqual(map.sources, ["probe.ts"]);
  assert.equal(map.sourcesContent[0], "export const value: number = 1;\n");
});
