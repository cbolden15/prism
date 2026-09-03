import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPluginPinRecord, PLUGIN_PIN_RECORD_VERSION } from "../../packages/runtime/src/runtime/plugin-pins.ts";

const pnhRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(pnhRoot, "..");

const ALPHA = { id: "alpha", manifestDigest: "a".repeat(64), sourceDigest: "b".repeat(64) };
const BETA = { id: "beta", manifestDigest: "c".repeat(64), sourceDigest: "d".repeat(64) };
const VALID = { version: "pnh-plugin-pins-v1", environment: "production", plugins: [ALPHA, BETA] };

const DUPLICATE_RECORD_MEMBER = `{
  "version": "pnh-plugin-pins-v1",
  "environment": "production",
  "plugins": [],
  "plugins": [${JSON.stringify(ALPHA)}]
}`;

const DUPLICATE_ENTRY_MEMBER = `{
  "version": "pnh-plugin-pins-v1",
  "environment": "production",
  "plugins": [
    {
      "id": "alpha",
      "manifestDigest": "${"a".repeat(64)}",
      "manifestDigest": "${"e".repeat(64)}",
      "sourceDigest": "${"b".repeat(64)}"
    }
  ]
}`;

function load(record: unknown) {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-plugin-pins-"));
  try {
    mkdirSync(resolve(root, "contracts"), { recursive: true });
    writeFileSync(
      resolve(root, "contracts", "plugin-pins.json"),
      typeof record === "string" ? record : JSON.stringify(record),
    );
    return loadPluginPinRecord(resolve(root, "contracts", "plugin-pins.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rejects(record: unknown): void {
  assert.throws(() => load(record), /invalid committed plugin pin record/);
}

test("a well-formed pin file loads and comes back frozen", () => {
  const record = load(VALID);
  assert.equal(record.plugins.length, 2);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.plugins));
  assert.ok(Object.isFrozen(record.plugins[0]));
});

test("an empty pin set is valid", () => {
  assert.deepEqual(load({ ...VALID, plugins: [] }).plugins, []);
});

test("entry order does not matter: an unsorted but well-formed pin set still loads", () => {
  const record = load({ ...VALID, plugins: [BETA, ALPHA] });
  assert.deepEqual(
    record.plugins.map((entry) => entry.id),
    ["beta", "alpha"],
  );
});

test("digit-leading ids are accepted, matching the registry's own id rule", () => {
  const record = load({ ...VALID, plugins: [{ ...ALPHA, id: "1password-tool" }, BETA] });
  assert.equal(record.plugins[0]?.id, "1password-tool");
});

test("rejects a wrong version, a wrong environment, and extra keys", () => {
  rejects({ ...VALID, version: "pnh-plugin-pins-v2" });
  rejects({ ...VALID, environment: "development" });
  rejects({ ...VALID, extra: true });
});

test("rejects entries with malformed digests, malformed ids, or extra keys", () => {
  rejects({ ...VALID, plugins: [{ ...ALPHA, manifestDigest: "xyz" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, sourceDigest: "A".repeat(64) }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, id: "" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, id: "-leading-dash" }] });
  rejects({ ...VALID, plugins: [{ ...ALPHA, note: "why" }] });
});

test("rejects duplicate ids", () => {
  rejects({ ...VALID, plugins: [ALPHA, ALPHA] });
});

test("rejects a duplicate member at the record level", () => {
  rejects(DUPLICATE_RECORD_MEMBER);
});

test("rejects a duplicate member at the entry level", () => {
  rejects(DUPLICATE_ENTRY_MEMBER);
});

test("the duplicate-member guard is scoped per object, not global", () => {
  assert.equal(load(VALID).plugins.length, 2);
});

test("rejects non-object roots, non-array plugins, and invalid JSON", () => {
  rejects(null);
  rejects([]);
  rejects({ ...VALID, plugins: {} });
  rejects("not json");
});

test("a missing pin file is rejected", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pnh-plugin-pins-"));
  try {
    assert.throws(
      () => loadPluginPinRecord(resolve(root, "contracts", "plugin-pins.json")),
      /invalid committed plugin pin record/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed pin file loads and validates", () => {
  const record = loadPluginPinRecord(
    resolve(repositoryRoot, "packages", "cli", "assets", "deterministic", "plugin-pins.json"),
  );
  assert.equal(record.version, PLUGIN_PIN_RECORD_VERSION);
  assert.equal(record.environment, "production");
  assert.ok(Array.isArray(record.plugins));
});
