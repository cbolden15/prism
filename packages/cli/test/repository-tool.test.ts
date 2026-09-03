import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";
import type { Tool, ToolRequest } from "@useprism/sdk/tool";
import {
  DEFAULT_REPOSITORY_TOOL_LIMITS,
  RepositoryToolError,
  createRepositoryTool,
} from "../src/repository-tool.ts";

async function fixture(): Promise<{
  root: string;
  workspace: string;
  outside: string;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "prism-repository-tool-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside.txt");
  await Promise.all([
    mkdir(join(workspace, "src"), { recursive: true }),
    mkdir(join(workspace, ".git"), { recursive: true }),
    writeFile(outside, "outside secret\n", "utf8"),
  ]);
  await Promise.all([
    writeFile(join(workspace, "README.md"), "Prism fact: indigo-orbit.\nSecond line.\n", "utf8"),
    writeFile(join(workspace, "src", "agent.ts"), "export const fact = 'indigo-orbit';\n", "utf8"),
    writeFile(join(workspace, "src", "other.ts"), "export const other = true;\n", "utf8"),
    writeFile(join(workspace, ".git", "config"), "indigo-orbit secret\n", "utf8"),
    writeFile(join(workspace, ".env"), "PASSWORD=indigo-orbit\n", "utf8"),
    writeFile(join(workspace, "id_rsa"), "indigo-orbit private key\n", "utf8"),
    writeFile(join(workspace, "binary.bin"), Buffer.from([0x61, 0x00, 0x62])),
    writeFile(join(workspace, "large.txt"), "x".repeat(128), "utf8"),
  ]);
  await symlink(outside, join(workspace, "escape.txt"));
  await symlink(join(workspace, "README.md"), join(workspace, "inside-link.txt"));
  return {
    root,
    workspace,
    outside,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function context(overrides: Partial<{ signal: AbortSignal; deadlineAtMs: number }> = {}) {
  return {
    signal: overrides.signal ?? new AbortController().signal,
    deadlineAtMs: overrides.deadlineAtMs ?? Date.now() + 5_000,
  };
}

async function invoke(tool: Tool, operation: string, input: unknown) {
  return tool.invoke({ operation, input } as ToolRequest, context());
}

function assertCode(code: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal(error instanceof RepositoryToolError, true);
    assert.equal((error as RepositoryToolError).code, code);
    return true;
  };
}

test("repository list, read, and search stay relative, sorted, bounded, and secret-excluding", async () => {
  const setup = await fixture();
  try {
    const tool = await createRepositoryTool({ workspaceRoot: setup.workspace });
    assert.deepEqual(tool.definition, {
      id: "repository",
      description: "Read and search files below the admitted workspace without modifying them.",
      operations: [
        { name: "list", description: "List one directory. Input: {path:string}." },
        { name: "read", description: "Read one UTF-8 text file. Input: {path:string}." },
        { name: "search", description: "Search UTF-8 files recursively. Input: {path:string,query:string}." },
      ],
    });

    const listed = await invoke(tool, "list", { path: "." }) as {
      path: string;
      entries: Array<{ path: string; type: string; bytes?: number }>;
      truncated: boolean;
    };
    assert.equal(listed.path, ".");
    assert.deepEqual(listed.entries.map(({ path }) => path), ["README.md", "binary.bin", "large.txt", "src"]);
    assert.equal(listed.entries.every(({ path }) => !isAbsolute(path)), true);
    assert.equal(listed.truncated, false);

    const read = await invoke(tool, "read", { path: "README.md" }) as {
      path: string;
      content: string;
      bytes: number;
    };
    assert.deepEqual(read, {
      path: "README.md",
      content: "Prism fact: indigo-orbit.\nSecond line.\n",
      bytes: Buffer.byteLength("Prism fact: indigo-orbit.\nSecond line.\n"),
    });

    const searched = await invoke(tool, "search", { path: ".", query: "indigo-orbit" }) as {
      path: string;
      matches: Array<{ path: string; line: number; text: string }>;
      filesSearched: number;
      truncated: boolean;
    };
    assert.equal(searched.path, ".");
    assert.deepEqual(searched.matches, [
      { path: "README.md", line: 1, text: "Prism fact: indigo-orbit." },
      { path: "src/agent.ts", line: 1, text: "export const fact = 'indigo-orbit';" },
    ]);
    assert.equal(searched.filesSearched > 0, true);
    assert.equal(searched.truncated, false);
    const serialized = JSON.stringify({ listed, searched });
    assert.equal(serialized.includes(".git"), false);
    assert.equal(serialized.includes(".env"), false);
    assert.equal(serialized.includes("id_rsa"), false);
    assert.equal(serialized.includes(setup.workspace), false);
    assert.equal(serialized.includes("outside secret"), false);
  } finally {
    await setup.cleanup();
  }
});

test("repository containment rejects traversal, absolute paths, symlinks, directories, and unsupported operations", async (context_) => {
  const setup = await fixture();
  try {
    const tool = await createRepositoryTool({ workspaceRoot: setup.workspace });
    for (const [name, operation, input, code] of [
      ["traversal", "read", { path: "../outside.txt" }, "invalid-path"],
      ["absolute", "read", { path: setup.outside }, "invalid-path"],
      ["symlink escape", "read", { path: "escape.txt" }, "symlink"],
      ["internal symlink", "read", { path: "inside-link.txt" }, "symlink"],
      ["directory read", "read", { path: "src" }, "not-file"],
      ["unknown operation", "write", { path: "README.md", content: "changed" }, "unsupported-operation"],
    ] as const) {
      await context_.test(name, async () => {
        await assert.rejects(invoke(tool, operation, input), assertCode(code));
      });
    }
    assert.equal(await readFile(join(setup.workspace, "README.md"), "utf8"), "Prism fact: indigo-orbit.\nSecond line.\n");

    const symlinkedRoot = join(setup.root, "workspace-link");
    await symlink(setup.workspace, symlinkedRoot);
    await assert.rejects(
      createRepositoryTool({ workspaceRoot: symlinkedRoot }),
      assertCode("workspace-not-canonical"),
    );
  } finally {
    await setup.cleanup();
  }
});

test("binary and oversized files fail closed at the byte boundary", async () => {
  const setup = await fixture();
  try {
    const defaultExactPath = join(setup.workspace, "default-exact.txt");
    const defaultBeyondPath = join(setup.workspace, "default-beyond.txt");
    await Promise.all([
      writeFile(defaultExactPath, Buffer.alloc(DEFAULT_REPOSITORY_TOOL_LIMITS.maxFileBytes, 0x61)),
      writeFile(defaultBeyondPath, Buffer.alloc(DEFAULT_REPOSITORY_TOOL_LIMITS.maxFileBytes + 1, 0x61)),
    ]);
    const defaults = await createRepositoryTool({ workspaceRoot: setup.workspace });
    const defaultExact = await invoke(defaults, "read", { path: "default-exact.txt" }) as { bytes: number };
    assert.equal(defaultExact.bytes, DEFAULT_REPOSITORY_TOOL_LIMITS.maxFileBytes);
    await assert.rejects(
      invoke(defaults, "read", { path: "default-beyond.txt" }),
      assertCode("file-too-large"),
    );
    await assert.rejects(
      createRepositoryTool({
        workspaceRoot: setup.workspace,
        limits: { maxFileBytes: DEFAULT_REPOSITORY_TOOL_LIMITS.maxFileBytes + 1 },
      }),
      assertCode("invalid-limits"),
    );

    const exact = await createRepositoryTool({
      workspaceRoot: setup.workspace,
      limits: { ...DEFAULT_REPOSITORY_TOOL_LIMITS, maxFileBytes: 128 },
    });
    const read = await invoke(exact, "read", { path: "large.txt" }) as { bytes: number };
    assert.equal(read.bytes, 128);

    const oneBeyond = await createRepositoryTool({
      workspaceRoot: setup.workspace,
      limits: { ...DEFAULT_REPOSITORY_TOOL_LIMITS, maxFileBytes: 127 },
    });
    await assert.rejects(invoke(oneBeyond, "read", { path: "large.txt" }), assertCode("file-too-large"));
    await assert.rejects(invoke(exact, "read", { path: "binary.bin" }), assertCode("binary-file"));
  } finally {
    await setup.cleanup();
  }
});

test("search applies maxEntries across the full directory traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-repository-traversal-"));
  const workspace = join(root, "workspace");
  try {
    await mkdir(join(workspace, "a", "b", "c"), { recursive: true });
    await writeFile(join(workspace, "a", "b", "c", "fact.txt"), "global-entry-bound\n", "utf8");
    const tool = await createRepositoryTool({
      workspaceRoot: workspace,
      limits: { ...DEFAULT_REPOSITORY_TOOL_LIMITS, maxEntries: 2 },
    });
    const result = await invoke(tool, "search", { path: ".", query: "global-entry-bound" }) as {
      matches: unknown[];
      filesSearched: number;
      truncated: boolean;
    };
    assert.deepEqual(result.matches, []);
    assert.equal(result.filesSearched, 0);
    assert.equal(result.truncated, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("result, work, abort, and deadline bounds stop safely", async () => {
  const setup = await fixture();
  try {
    const bounded = await createRepositoryTool({
      workspaceRoot: setup.workspace,
      limits: {
        ...DEFAULT_REPOSITORY_TOOL_LIMITS,
        maxResults: 1,
        maxFiles: 1,
      },
    });
    const listed = await invoke(bounded, "list", { path: "." }) as { entries: unknown[]; truncated: boolean };
    assert.equal(listed.entries.length, 1);
    assert.equal(listed.truncated, true);
    const searched = await invoke(bounded, "search", { path: ".", query: "indigo-orbit" }) as {
      matches: unknown[];
      filesSearched: number;
      truncated: boolean;
    };
    assert.equal(searched.matches.length <= 1, true);
    assert.equal(searched.filesSearched, 1);
    assert.equal(searched.truncated, true);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      bounded.invoke({ operation: "list", input: { path: "." } }, context({ signal: controller.signal })),
      assertCode("aborted"),
    );
    await assert.rejects(
      bounded.invoke({ operation: "list", input: { path: "." } }, context({ deadlineAtMs: Date.now() - 1 })),
      assertCode("deadline"),
    );
  } finally {
    await setup.cleanup();
  }
});
