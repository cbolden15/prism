import assert from "node:assert/strict";
import { test } from "node:test";
import { sandboxCall } from "../../packages/runtime/src/harness/sandbox.ts";

async function parseUtcMs(value: string): Promise<number | null> {
  return sandboxCall<number | null>({
    args: [value],
    entry: "timestamp.ts",
    exportName: "parseUtcMs",
  });
}

test("parses reference dates to exact epoch milliseconds", async () => {
  const cases: Array<[string, number]> = [
    ["1970-01-01T00:00:00.000Z", Date.UTC(1970, 0, 1, 0, 0, 0, 0)],
    ["2026-08-19T12:34:56.789Z", Date.UTC(2026, 7, 19, 12, 34, 56, 789)],
    ["2000-02-29T23:59:59.999Z", Date.UTC(2000, 1, 29, 23, 59, 59, 999)],
    ["2024-02-29T00:00:00.000Z", Date.UTC(2024, 1, 29, 0, 0, 0, 0)],
    ["1999-12-31T23:59:59.000Z", Date.UTC(1999, 11, 31, 23, 59, 59, 0)],
    ["2038-01-19T03:14:07.000Z", Date.UTC(2038, 0, 19, 3, 14, 7, 0)],
    ["2100-01-01T00:00:00.000Z", Date.UTC(2100, 0, 1, 0, 0, 0, 0)],
    ["1970-03-01T00:00:00.000Z", Date.UTC(1970, 2, 1, 0, 0, 0, 0)],
  ];

  for (const [input, expected] of cases) {
    assert.equal(await parseUtcMs(input), expected, input);
  }
});

test("rejects malformed and out-of-range timestamps", async () => {
  const invalid = [
    "2026-08-19T12:34:56.789+00:00",
    "2026-08-19 12:34:56.789Z",
    "2026-8-19T12:34:56.789Z",
    "2026-13-01T00:00:00.000Z",
    "2026-00-10T00:00:00.000Z",
    "2026-02-29T00:00:00.000Z",
    "2100-02-29T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z",
    "2026-08-00T00:00:00.000Z",
    "2026-08-19T24:00:00.000Z",
    "2026-08-19T12:60:00.000Z",
    "2026-08-19T12:00:60.000Z",
    "2026-08-19T12:00:00.00Z",
    "2026-08-19T12:00:00.0000Z",
    "",
    "x2026-08-19T12:00:00.000Z",
    "2026-08-19T12:00:00.000Zx",
  ];

  for (const input of invalid) {
    assert.equal(await parseUtcMs(input), null, input);
  }
});
