import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeJsonAtomically(input: {
  readonly path: string;
  readonly value: unknown;
  readonly directoryMode: number;
  readonly fileMode: number;
}): Promise<void> {
  const directory = dirname(input.path);
  await mkdir(directory, { recursive: true, mode: input.directoryMode });
  const directoryStat = await lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`atomic JSON directory is unsafe: ${directory}`);
  }
  await chmod(directory, input.directoryMode);
  try {
    const targetStat = await lstat(input.path);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`atomic JSON target is unsafe: ${input.path}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("atomic JSON target is unsafe:")) throw error;
    if (typeof error !== "object" || error === null || Reflect.get(error, "code") !== "ENOENT") throw error;
  }

  const temporaryPath = join(
    directory,
    `.${basename(input.path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", input.fileMode);
    await handle.writeFile(`${JSON.stringify(input.value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporaryPath, input.fileMode);
    await rename(temporaryPath, input.path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
