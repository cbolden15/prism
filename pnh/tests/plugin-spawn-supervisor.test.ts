import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import {
  createPluginContainerSupervisor,
  systemClock,
  systemTimers,
} from "../../packages/runtime/src/harness/plugin-container-supervisor.mjs";
import {
  SPAWN_LAUNCH_ARGS_VERSION,
  createSpawnLifecyclePort,
  encodeSpawnLaunchSpec,
  toSupervisorStartupPlugin,
  type SpawnChildProcess,
  type SpawnLifecycleEvent,
} from "../../packages/runtime/src/harness/plugin-spawn-supervisor.mjs";
import type { PluginSpawnLaunchSpec } from "../../packages/runtime/src/runtime/plugin-spawn-launch-spec.ts";

const ARTIFACT_DIGEST = "a".repeat(64);
// Two variables reach a child regardless of the `env` option, because the
// spawn layer itself adds them after the caller's environment is applied:
// libuv adds `__CF_USER_TEXT_ENCODING` on darwin so CoreFoundation does not
// abort, and Node re-adds `NODE_V8_COVERAGE` so coverage collection is
// transitive across the process tree (the sandbox suite runs under c8).
// Neither is copied from the host environment, and Node exposes no way to
// suppress either, so the allowlist assertion names them instead of
// pretending they are absent. Both are keyed off the live condition so the
// assertion stays exact on hosts where they do not apply.
const RUNTIME_INJECTED_ENV_KEYS: readonly string[] = [
  ...(process.platform === "darwin" ? ["__CF_USER_TEXT_ENCODING"] : []),
  ...(typeof process.env.NODE_V8_COVERAGE === "string" ? ["NODE_V8_COVERAGE"] : []),
];
const UNASSUMABLE_UID = 10101;
const currentUid = process.getuid?.() ?? 0;
const currentGid = process.getgid?.() ?? 0;

const temporaryRoots: string[] = [];

function makeSpec(
  entrypointSource: string,
  overrides: Partial<PluginSpawnLaunchSpec> = {},
): PluginSpawnLaunchSpec {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "pnh-spawn-supervisor-")));
  temporaryRoots.push(root);
  const entrypointPath = resolve(root, "entrypoint.mjs");
  writeFileSync(entrypointPath, entrypointSource, "utf8");
  return Object.freeze({
    pluginId: "tool-golden",
    artifactDigest: ARTIFACT_DIGEST,
    entrypointPath,
    cwd: root,
    env: Object.freeze({ NODE_OPTIONS: "--disable-proto=throw" }),
    envAllowlist: Object.freeze(["HOME", "PATH"]),
    uid: UNASSUMABLE_UID,
    gid: UNASSUMABLE_UID,
    ...overrides,
  });
}

function cleanupRoots(): void {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}

function hostEnv(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { HOME: process.env.HOME ?? "/tmp", PATH: process.env.PATH ?? "", ...extra };
}

function createInput(spec: PluginSpawnLaunchSpec, requestId: string) {
  return {
    containerName: `pnh-plugin-${requestId}`,
    requestId,
    pluginId: spec.pluginId,
    imageDigest: spec.artifactDigest,
    createArgs: encodeSpawnLaunchSpec(spec),
  };
}

function collector(): {
  readonly handlers: { onStdout(bytes: Uint8Array): void; onStderr(bytes: Uint8Array): void; onClose(): void };
  stdout(): string;
  stderr(): string;
  closed(): boolean;
} {
  const out: Uint8Array[] = [];
  const error: Uint8Array[] = [];
  let isClosed = false;
  return {
    handlers: {
      onStdout: (bytes) => { out.push(bytes); },
      onStderr: (bytes) => { error.push(bytes); },
      onClose: () => { isClosed = true; },
    },
    stdout: () => Buffer.concat(out.map((chunk) => Buffer.from(chunk))).toString("utf8"),
    stderr: () => Buffer.concat(error.map((chunk) => Buffer.from(chunk))).toString("utf8"),
    closed: () => isClosed,
  };
}

async function waitUntil(predicate: () => boolean, label: string, attempts = 400): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function waitUntilAsync(
  predicate: () => Promise<boolean>,
  label: string,
  attempts = 400,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Whether a pid still exists. `EPERM` means it exists but is not ours. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly pid = 4242;
  signals: string[] = [];

  kill(signal?: string): boolean {
    this.signals.push(signal ?? "SIGTERM");
    this.finish(null, signal ?? "SIGTERM");
    return true;
  }

  /** `exit` first, then the stdio close, exactly as `ChildProcess` orders them. */
  finish(code: number | null, signal: string | null = null): void {
    setTimeout(() => {
      this.emit("exit", code, signal);
      this.stdout.end();
      this.stderr.end();
      this.emit("close", code, signal);
    }, 0);
  }
}

/** A child that ignores every signal it is sent, SIGKILL included. */
class StubbornChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly pid = 987_654;

  kill(): boolean {
    return false;
  }
}

function privilegeError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`spawn ${code}`);
  error.code = code;
  return error;
}

test("the spawn lifecycle port satisfies the supervisor's lifecycle duck type", () => {
  const port = createSpawnLifecyclePort();
  const asRecord = port as unknown as Record<string, unknown>;
  for (const method of ["create", "startAttached", "inspect", "stop", "kill", "remove"]) {
    assert.equal(typeof asRecord[method], "function", `port is missing ${method}`);
  }
  const supervisor = createPluginContainerSupervisor({
    docker: port,
    clock: systemClock(),
    timers: systemTimers(),
    resolveLaunchSpec: () => undefined,
  });
  assert.equal(typeof supervisor.launch, "function");
});

test("an encoded spawn spec satisfies the supervisor's admitted launch specification shape", () => {
  const spec = makeSpec("process.exit(0);\n");
  const startupPlugin = toSupervisorStartupPlugin(spec);
  assert.deepEqual(Object.keys(startupPlugin).sort(), ["createArgs", "imageDigest", "pluginId"]);
  assert.equal(startupPlugin.imageDigest, spec.artifactDigest);
  assert.match(startupPlugin.imageDigest, /^[0-9a-f]{64}$/);
  assert.ok(startupPlugin.createArgs.length > 0);
  assert.equal(startupPlugin.createArgs[0], SPAWN_LAUNCH_ARGS_VERSION);
  for (const argument of startupPlugin.createArgs) {
    assert.equal(typeof argument, "string");
    assert.ok(argument.length > 0);
    assert.ok(!argument.includes("\0"));
    for (const owned of ["--name", "--label", "-l", "--cidfile", "--rm"]) {
      assert.ok(argument !== owned && !argument.startsWith(`${owned}=`));
    }
  }
  cleanupRoots();
});

test("create prepares a non-running process that startAttached then runs to completion", async () => {
  const spec = makeSpec("process.stdout.write('out');process.stderr.write('err');\n");
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv() });
  const input = createInput(spec, "req-lifecycle");
  assert.equal(await port.inspect(input.containerName), null);

  const containerId = await port.create(input);
  assert.equal(typeof containerId, "string");
  assert.ok(containerId.length > 0);

  const created = await port.inspect(containerId);
  assert.ok(created !== null);
  assert.equal(created.running, false);
  assert.equal(created.state, "created");
  assert.equal(created.containerId, containerId);
  assert.equal(created.requestId, "req-lifecycle");
  assert.equal(created.pluginId, spec.pluginId);
  assert.equal(created.imageDigest, spec.artifactDigest);

  const sink = collector();
  const stream = await port.startAttached(containerId, sink.handlers);
  assert.equal(typeof stream.write, "function");
  assert.equal(typeof stream.closeInput, "function");
  await stream.closeInput();
  await waitUntil(() => sink.closed(), "the spawned process to close");

  assert.equal(sink.stdout(), "out");
  assert.equal(sink.stderr(), "err");
  const exited = await port.inspect(containerId);
  assert.ok(exited !== null);
  assert.equal(exited.running, false);
  assert.equal(exited.state, "exited");
  assert.equal(exited.exitCode, 0);

  await port.remove(containerId);
  assert.equal(await port.inspect(containerId), null);
  assert.equal(await port.inspect(input.containerName), null);
  cleanupRoots();
});

test("stop terminates a running process and remove confirms its absence", async () => {
  const spec = makeSpec("setInterval(()=>{},1000);process.stdout.write('up');\n");
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv() });
  const input = createInput(spec, "req-stop");
  const containerId = await port.create(input);
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);
  await waitUntil(() => sink.stdout() === "up", "the spawned process to report readiness");

  const running = await port.inspect(containerId);
  assert.equal(running?.running, true);
  assert.equal(running?.state, "running");

  await port.stop(containerId);
  const stopped = await port.inspect(containerId);
  assert.equal(stopped?.running, false);

  await port.remove(containerId);
  assert.equal(await port.inspect(containerId), null);
  cleanupRoots();
});

test("kill terminates a process that ignores stop", async () => {
  const spec = makeSpec("process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('up');\n");
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv(), stopGraceMs: 200 });
  const input = createInput(spec, "req-kill");
  const containerId = await port.create(input);
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);
  await waitUntil(() => sink.stdout() === "up", "the spawned process to report readiness");

  await port.stop(containerId);
  assert.equal((await port.inspect(containerId))?.running, true);
  await port.kill(containerId);
  await waitUntil(() => sink.closed(), "the killed process to close");
  const killed = await port.inspect(containerId);
  assert.equal(killed?.running, false);
  assert.equal(killed?.exitCode, 128 + 9);

  await port.remove(containerId);
  assert.equal(await port.inspect(containerId), null);
  cleanupRoots();
});

test("the spawned process receives only allowlisted host variables, the fixed env, and the spec cwd", async () => {
  const spec = makeSpec(
    "process.stdout.write(JSON.stringify({cwd:process.cwd(),env:process.env}));\n",
    { uid: currentUid, gid: currentGid },
  );
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv({ PNH_SPAWN_TEST_SECRET: "must-not-leak", LANG: "C" }),
  });
  const containerId = await port.create(createInput(spec, "req-env"));
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);
  await waitUntil(() => sink.closed(), "the spawned process to close");

  const reported = JSON.parse(sink.stdout()) as { cwd: string; env: Record<string, string> };
  assert.deepEqual(
    Object.keys(reported.env).sort(),
    ["HOME", "NODE_OPTIONS", "PATH", ...RUNTIME_INJECTED_ENV_KEYS].sort(),
  );
  assert.equal(reported.env.NODE_OPTIONS, "--disable-proto=throw");
  assert.equal(reported.env.HOME, process.env.HOME ?? "/tmp");
  assert.equal(reported.env.PNH_SPAWN_TEST_SECRET, undefined);
  assert.equal(reported.env.LANG, undefined);
  assert.equal(realpathSync(reported.cwd), realpathSync(spec.cwd));

  await port.remove(containerId);
  cleanupRoots();
});

test("an unassumable uid falls back to the invoking user with a loud warning event", async (t) => {
  if (currentUid === 0) {
    t.skip("the invoking user is root, so the requested uid is assumable");
    return;
  }
  const spec = makeSpec("process.stdout.write(String(process.getuid())+':'+String(process.getgid()));\n");
  const events: SpawnLifecycleEvent[] = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    emitEvent: (event) => { events.push(event); },
  });
  const containerId = await port.create(createInput(spec, "req-eperm"));
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);
  await waitUntil(() => sink.closed(), "the spawned process to close");

  assert.equal(sink.stdout(), `${currentUid}:${currentGid}`);
  assert.equal((await port.inspect(containerId))?.exitCode, 0);

  const warning = events.find((event) => event.type === "warning");
  assert.ok(warning !== undefined, "no warning event was emitted");
  assert.equal(warning.v, 1);
  assert.equal(warning.code, "spawn-privilege-drop-failed");
  assert.equal(warning.requestId, "req-eperm");
  assert.equal(warning.pluginId, spec.pluginId);
  assert.equal(warning.requestedUid, UNASSUMABLE_UID);
  assert.equal(warning.requestedGid, UNASSUMABLE_UID);
  assert.equal(warning.actualUid, currentUid);
  assert.equal(warning.actualGid, currentGid);
  assert.equal(warning.errorCode, "EPERM");

  await port.remove(containerId);
  cleanupRoots();
});

test("the privilege fallback retries once without uid or gid and preserves env and cwd", async () => {
  const spec = makeSpec("process.exit(0);\n");
  const attempts: Array<Record<string, unknown>> = [];
  const events: SpawnLifecycleEvent[] = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    emitEvent: (event) => { events.push(event); },
    spawnProcess: (command, args, options) => {
      attempts.push({ command, args, ...options });
      if (attempts.length === 1) throw privilegeError("EPERM");
      return new FakeChild() as unknown as SpawnChildProcess;
    },
  });
  const containerId = await port.create(createInput(spec, "req-retry"));
  await port.startAttached(containerId, collector().handlers);

  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.uid, UNASSUMABLE_UID);
  assert.equal(attempts[0]?.gid, UNASSUMABLE_UID);
  assert.equal(attempts[1]?.uid, undefined);
  assert.equal(attempts[1]?.gid, undefined);
  assert.equal(attempts[1]?.cwd, spec.cwd);
  assert.deepEqual(attempts[1]?.args, [spec.entrypointPath]);
  assert.equal((attempts[1]?.env as Record<string, string>).NODE_OPTIONS, "--disable-proto=throw");
  assert.equal(events.filter((event) => event.type === "warning").length, 1);
  cleanupRoots();
});

test("a successful privilege drop passes uid and gid through and warns about nothing", async () => {
  const spec = makeSpec("process.exit(0);\n");
  const attempts: Array<Record<string, unknown>> = [];
  const events: SpawnLifecycleEvent[] = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    emitEvent: (event) => { events.push(event); },
    spawnProcess: (command, args, options) => {
      attempts.push({ command, args, ...options });
      return new FakeChild() as unknown as SpawnChildProcess;
    },
  });
  const containerId = await port.create(createInput(spec, "req-drop"));
  await port.startAttached(containerId, collector().handlers);

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.uid, UNASSUMABLE_UID);
  assert.equal(attempts[0]?.gid, UNASSUMABLE_UID);
  assert.deepEqual(events, []);
  cleanupRoots();
});

test("a non-privilege spawn failure is not retried and is reported to the caller", async () => {
  const spec = makeSpec("process.exit(0);\n");
  const attempts: string[] = [];
  const events: SpawnLifecycleEvent[] = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    emitEvent: (event) => { events.push(event); },
    spawnProcess: () => {
      attempts.push("attempt");
      throw privilegeError("ENOENT");
    },
  });
  const containerId = await port.create(createInput(spec, "req-enoent"));
  await assert.rejects(() => port.startAttached(containerId, collector().handlers), /ENOENT/);
  assert.equal(attempts.length, 1);
  assert.deepEqual(events, []);
  cleanupRoots();
});

test("create rejects launch arguments whose payload disagrees with the admitted digest", async () => {
  const spec = makeSpec("process.exit(0);\n");
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv() });
  const input = createInput(spec, "req-mismatch");
  await assert.rejects(
    () => port.create({ ...input, imageDigest: "b".repeat(64) }),
    /artifact digest/i,
  );
  await assert.rejects(
    () => port.create({ ...input, pluginId: "tool-other" }),
    /plugin/i,
  );
  await assert.rejects(
    () => port.create({ ...input, createArgs: ["not-a-spawn-spec"] }),
    /spawn launch/i,
  );
  cleanupRoots();
});

test("the supervisor drives a real subprocess end to end through the spawn port", async () => {
  const spec = makeSpec("process.stdin.on('data',(b)=>{process.stdout.write(b);process.exit(0);});\n");
  const events: unknown[] = [];
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv() });
  const supervisor = createPluginContainerSupervisor({
    docker: port,
    clock: systemClock(),
    timers: systemTimers(),
    resolveLaunchSpec: (pluginId) =>
      pluginId === spec.pluginId ? toSupervisorStartupPlugin(spec) : undefined,
    emitEvent: (event) => { events.push(event); },
  });

  // deadlineMs is an absolute point on the supervisor's clock, not a duration.
  const launched = await supervisor.launch({
    requestId: "req-e2e",
    pluginId: spec.pluginId,
    deadlineMs: Date.now() + 30_000,
  });
  assert.equal(launched.status, "running");

  await supervisor.writeInput({
    requestId: "req-e2e",
    pluginId: spec.pluginId,
    seq: 1,
    bytes: Buffer.from("ping"),
  });

  const terminal = await waitForTerminal(events);
  assert.equal(terminal.receipt.confirmedAbsent, true);
  assert.equal(terminal.receipt.exitCode, 0);
  assert.deepEqual(terminal.receipt.cleanupErrors, []);
  const streamed = events
    .filter((event): event is { type: "stream"; dataBase64: string } =>
      (event as { type?: string }).type === "stream")
    .map((event) => Buffer.from(event.dataBase64, "base64").toString("utf8"))
    .join("");
  assert.equal(streamed, "ping");

  await supervisor.shutdown();
  cleanupRoots();
});

// A plugin that leaves a helper behind and exits. The helper is an ordinary
// child, so it inherits the plugin's process group and a group signal reaches
// it; nothing here calls `setsid`, which no process-group mechanism can follow.
const ORPHANING_PLUGIN = `import { spawn } from "node:child_process";
const helper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000);"], { stdio: "ignore" });
helper.unref();
process.stdout.write(String(helper.pid));
`;

// The same shape, except the helper inherits the plugin's stdout and stderr and
// so holds those pipes open for a minute after the plugin itself is gone.
const PIPE_HOLDING_PLUGIN = `import { spawn } from "node:child_process";
const helper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000);"], {
  stdio: ["ignore", "inherit", "inherit"],
});
helper.unref();
process.stdout.write("up");
`;

test("remove kills a descendant the exited plugin left behind", async () => {
  const spec = makeSpec(ORPHANING_PLUGIN, { uid: currentUid, gid: currentGid });
  const port = createSpawnLifecyclePort({ hostEnv: hostEnv(), killGraceMs: 2_000 });
  const containerId = await port.create(createInput(spec, "req-orphan"));
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);
  await waitUntil(() => sink.closed(), "the plugin to exit");

  const descendantPid = Number.parseInt(sink.stdout(), 10);
  assert.ok(Number.isInteger(descendantPid) && descendantPid > 1, "the plugin did not report its helper");
  const exited = await port.inspect(containerId);
  assert.equal(exited?.running, false);
  assert.equal(exited?.exitCode, 0);
  // The direct child is gone and its helper is not: exactly the state in which
  // signalling only the direct pid would report a live process as absent.
  assert.equal(processAlive(descendantPid), true, "the helper was expected to outlive its parent");

  await port.remove(containerId);
  assert.equal(await port.inspect(containerId), null);
  await waitUntil(() => !processAlive(descendantPid), "the helper to be reaped with its group");
  cleanupRoots();
});

test("a descendant holding stdio open does not delay the exit observation", async () => {
  const spec = makeSpec(PIPE_HOLDING_PLUGIN, { uid: currentUid, gid: currentGid });
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    drainGraceMs: 150,
    killGraceMs: 2_000,
  });
  const containerId = await port.create(createInput(spec, "req-pipe-holder"));
  const sink = collector();
  await port.startAttached(containerId, sink.handlers);

  // Two seconds against a helper that holds the pipes for sixty: this can only
  // pass if the exit transition is keyed on `exit` rather than on `close`.
  await waitUntilAsync(
    async () => (await port.inspect(containerId))?.state === "exited",
    "the plugin's exit to be observed while its pipes are still open",
    80,
  );
  const exited = await port.inspect(containerId);
  assert.equal(exited?.running, false);
  assert.equal(exited?.exitCode, 0);

  // `onClose` still arrives, on the bounded drain window rather than on the
  // pipes, so the supervisor's cleanup is never starved by a descendant.
  await waitUntil(() => sink.closed(), "onClose to arrive on the drain grace window", 80);
  assert.equal(sink.stdout(), "up");

  await port.remove(containerId);
  assert.equal(await port.inspect(containerId), null);
  cleanupRoots();
});

test("remove refuses to forget an allocation that survives SIGKILL", async () => {
  const spec = makeSpec("process.exit(0);\n", { uid: currentUid, gid: currentGid });
  const groupSignals: Array<number | string> = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    stopGraceMs: 50,
    killGraceMs: 50,
    spawnProcess: () => new StubbornChild() as unknown as SpawnChildProcess,
    // Never throws, so the group is permanently alive — and never reaches a
    // real host process group with the fake child's synthetic pid.
    signalGroup: (_pid, signal) => { groupSignals.push(signal); },
  });
  const containerId = await port.create(createInput(spec, "req-stubborn"));
  await port.startAttached(containerId, collector().handlers);

  await assert.rejects(() => port.remove(containerId), /did not exit/);
  const survivor = await port.inspect(containerId);
  assert.ok(survivor !== null, "remove forgot an allocation it could not confirm gone");
  assert.equal(survivor.running, true);
  assert.ok(groupSignals.includes("SIGKILL"), "remove did not escalate to SIGKILL");
  cleanupRoots();
});

test("remove refuses to confirm absence when an exited child leaves its group alive", async () => {
  const spec = makeSpec("process.exit(0);\n", { uid: currentUid, gid: currentGid });
  const child = new FakeChild();
  const groupSignals: Array<number | string> = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    killGraceMs: 50,
    spawnProcess: () => child as unknown as SpawnChildProcess,
    signalGroup: (_pid, signal) => { groupSignals.push(signal); },
  });
  const containerId = await port.create(createInput(spec, "req-orphan-group"));
  await port.startAttached(containerId, collector().handlers);
  child.finish(0);
  await waitUntilAsync(
    async () => (await port.inspect(containerId))?.state === "exited",
    "the direct child to be observed exiting",
    80,
  );

  // The reported failure verbatim: a zero exit code, an empty record, and a
  // group still running. Absence must not be asserted here.
  await assert.rejects(() => port.remove(containerId), /did not exit/);
  const survivor = await port.inspect(containerId);
  assert.ok(survivor !== null, "remove forgot an allocation whose group was still alive");
  assert.equal(survivor.state, "exited");
  assert.equal(survivor.exitCode, 0);
  assert.ok(groupSignals.includes("SIGKILL"), "remove did not signal the group of an exited child");
  cleanupRoots();
});

test("startAttached rejects unusable handlers before spawning anything", async () => {
  const spec = makeSpec("process.exit(0);\n", { uid: currentUid, gid: currentGid });
  const attempts: string[] = [];
  const port = createSpawnLifecyclePort({
    hostEnv: hostEnv(),
    spawnProcess: () => {
      attempts.push("spawned");
      return new FakeChild() as unknown as SpawnChildProcess;
    },
    signalGroup: () => undefined,
  });
  const containerId = await port.create(createInput(spec, "req-handlers"));
  const { handlers } = collector();
  const unusable: readonly unknown[] = [
    null,
    undefined,
    "nope",
    {},
    { onStdout: handlers.onStdout, onStderr: handlers.onStderr },
    { onStdout: handlers.onStdout, onStderr: handlers.onStderr, onClose: "not a function" },
    { onStdout: 1, onStderr: handlers.onStderr, onClose: handlers.onClose },
  ];
  for (const candidate of unusable) {
    await assert.rejects(
      () => port.startAttached(containerId, candidate as never),
      (error: unknown) => error instanceof TypeError && /handlers/.test(error.message),
    );
  }

  assert.equal(attempts.length, 0, "a rejected handler set still reached the spawn");
  assert.equal((await port.inspect(containerId))?.state, "created");
  cleanupRoots();
});

async function waitForTerminal(
  events: readonly unknown[],
): Promise<{ receipt: { confirmedAbsent: boolean; exitCode: number | null; cleanupErrors: readonly string[] } }> {
  await waitUntil(
    () => events.some((event) => (event as { type?: string }).type === "terminal"),
    "a terminal receipt",
  );
  return events.find((event) => (event as { type?: string }).type === "terminal") as {
    receipt: { confirmedAbsent: boolean; exitCode: number | null; cleanupErrors: readonly string[] };
  };
}
