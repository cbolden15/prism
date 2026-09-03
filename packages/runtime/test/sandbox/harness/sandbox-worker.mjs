import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadedCoreManifest } from "./sandbox/core-loader-preload.mjs";

function materialize(argument) {
  if (argument === null || typeof argument !== "object" || Array.isArray(argument)) {
    return argument;
  }
  if (argument.kind === undefined) return argument;
  if (argument.kind === "null-prototype-record") {
    return Object.assign(Object.create(null), argument.value);
  }
  if (argument.kind === "inherited-record") {
    return Object.assign(Object.create(argument.inherited), argument.own);
  }
  if (argument.kind === "accessor-record") {
    const record = { ...argument.value };
    Object.defineProperty(record, argument.key, {
      enumerable: true,
      get: () => argument.returns,
    });
    return record;
  }
  if (argument.kind === "non-enumerable-record") {
    const record = { ...argument.value };
    Object.defineProperty(record, argument.key, {
      enumerable: false,
      value: argument.hidden,
    });
    return record;
  }
  throw new Error("unknown sandbox local fixture");
}

function sha256Port(fixture) {
  if (fixture === "valid") {
    return (value) => createHash("sha256").update(value, "utf8").digest("hex");
  }
  if (fixture === "malformed") return () => "not-a-digest";
  throw new Error("unknown sandbox hash fixture");
}

function health() {
  return {
    date: typeof Date.now(),
    performance: typeof performance.now(),
    pid: String(process.pid),
    process: typeof process.env,
    timer: typeof setTimeout,
    uid: String(process.getuid()),
    manifest: typeof process.env.PNH_CORE_MANIFEST,
  };
}

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  if (request.kind === "health") {
    process.stdout.write(JSON.stringify({ ok: true, value: health() }));
  } else {
    const manifest = loadedCoreManifest();
    const file = manifest.files[request.entry];
    if (file === undefined || !manifest.entries.includes(request.entry)) {
      throw new Error("unlisted sandbox entry");
    }
    const args = request.args.map(materialize);
    if (request.port !== undefined) {
      const { argumentIndex, fixture, name } = request.port;
      if (
        name !== "sha256" ||
        !Number.isInteger(argumentIndex) ||
        argumentIndex < 0 ||
        argumentIndex > args.length
      ) {
        throw new Error("invalid sandbox port");
      }
      args.splice(argumentIndex, 0, sha256Port(fixture));
    }
    const namespace = await import(file.url);
    const exported = namespace[request.exportName];
    if (typeof exported !== "function") throw new Error("sandbox export is not a function");
    const value = await exported(...args);
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("sandbox result is not JSON-serializable");
    process.stdout.write(JSON.stringify({ ok: true, value: JSON.parse(serialized) }));
  }
} catch (error) {
  process.stderr.write(
    `sandbox worker error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
