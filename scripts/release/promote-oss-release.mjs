import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OSS_RELEASE_PACKAGES, OSS_RELEASE_VERSION } from "./oss-release-contract.mjs";

const NPM_REGISTRY = "https://registry.npmjs.org";

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultRunNpm(arguments_) {
  return spawnSync("npm", arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readTags(name, runNpm) {
  const result = runNpm([
    "view",
    "--json",
    name,
    "dist-tags",
    "--registry",
    NPM_REGISTRY,
  ]);
  if (result?.error || result?.status !== 0) fail(`dist-tags-query-failed:${name}`);
  let tags;
  try {
    tags = JSON.parse(result.stdout);
  } catch {
    fail(`dist-tags-response-invalid:${name}`);
  }
  if (!isRecord(tags)) fail(`dist-tags-response-invalid:${name}`);
  return tags;
}

export function promoteReleaseTags(input) {
  if (input.version !== OSS_RELEASE_VERSION) fail("release-version-refused");
  const runNpm = input.runNpm ?? defaultRunNpm;
  const states = [];
  for (const entry of OSS_RELEASE_PACKAGES) {
    const tags = readTags(entry.name, runNpm);
    if (tags.next !== OSS_RELEASE_VERSION) fail(`next-tag-mismatch:${entry.name}`);
    if (tags.latest !== undefined && tags.latest !== OSS_RELEASE_VERSION) {
      fail(`latest-tag-conflict:${entry.name}`);
    }
    states.push({ entry, alreadyLatest: tags.latest === OSS_RELEASE_VERSION });
  }

  const results = [];
  const attempted = [];
  try {
    for (const { entry, alreadyLatest } of states) {
      if (alreadyLatest) {
        results.push(Object.freeze({ name: entry.name, status: "already-latest" }));
        continue;
      }
      attempted.push(entry);
      const result = runNpm([
        "dist-tag",
        "add",
        `${entry.name}@${OSS_RELEASE_VERSION}`,
        "latest",
        "--registry",
        NPM_REGISTRY,
      ]);
      if (result?.error || result?.status !== 0) fail(`dist-tag-promotion-failed:${entry.name}`);
      results.push(Object.freeze({ name: entry.name, status: "promoted" }));
    }

    for (const entry of OSS_RELEASE_PACKAGES) {
      const tags = readTags(entry.name, runNpm);
      if (tags.next !== OSS_RELEASE_VERSION || tags.latest !== OSS_RELEASE_VERSION) {
        fail(`dist-tag-verification-failed:${entry.name}`);
      }
    }
  } catch (promotionError) {
    let rollbackError;
    for (const entry of attempted.toReversed()) {
      let tags;
      try {
        tags = readTags(entry.name, runNpm);
      } catch {
        rollbackError ??= `dist-tag-rollback-query-failed:${entry.name}`;
        continue;
      }
      if (tags.latest === undefined) continue;
      if (tags.latest !== OSS_RELEASE_VERSION) {
        rollbackError ??= `dist-tag-rollback-conflict:${entry.name}`;
        continue;
      }
      const result = runNpm([
        "dist-tag",
        "rm",
        entry.name,
        "latest",
        "--registry",
        NPM_REGISTRY,
      ]);
      if (result?.error || result?.status !== 0) {
        rollbackError ??= `dist-tag-rollback-failed:${entry.name}`;
      }
    }
    for (const { entry, alreadyLatest } of states) {
      let tags;
      try {
        tags = readTags(entry.name, runNpm);
      } catch {
        rollbackError ??= `dist-tag-rollback-query-failed:${entry.name}`;
        continue;
      }
      const expectedLatest = alreadyLatest ? OSS_RELEASE_VERSION : undefined;
      if (tags.next !== OSS_RELEASE_VERSION || tags.latest !== expectedLatest) {
        rollbackError ??= `dist-tag-rollback-verification-failed:${entry.name}`;
      }
    }
    if (rollbackError !== undefined) fail(rollbackError);
    throw promotionError;
  }
  return Object.freeze(results);
}

function parseArguments(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== "--version" || arguments_[1] === "") {
    fail("invalid-arguments");
  }
  return arguments_[1];
}

function main() {
  if (process.version !== "v26.8.1") fail("node-version-mismatch");
  const version = parseArguments(process.argv.slice(2));
  const npmVersion = defaultRunNpm(["--version"]);
  if (npmVersion.error || npmVersion.status !== 0 || npmVersion.stdout.trim() !== "11.19.0") {
    fail("npm-version-mismatch");
  }
  for (const result of promoteReleaseTags({ version })) {
    process.stdout.write(`${result.name}: ${result.status}\n`);
  }
}

const executedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (executedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Prism OSS promotion failed: ${error instanceof Error ? error.message : "promotion-failed"}\n`);
    process.exitCode = 1;
  }
}
