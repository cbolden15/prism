import { run } from "node:test";

// No top-level await: inside the sandbox image no package.json marks this tree
// as ESM, so tsx transforms this entrypoint as CJS, where top-level await is a
// transform error.
async function main(file: string): Promise<void> {
  const passed: string[] = [];
  const terminalNames = new Set<string>();
  let duplicateName = false;
  let summarySuccess = false;
  const stream = run({ files: [file], concurrency: false });
  for await (const event of stream) {
    if ((event.type === "test:pass" || event.type === "test:fail") &&
        event.data.name !== file) {
      if (terminalNames.has(event.data.name)) duplicateName = true;
      terminalNames.add(event.data.name);
    }
    if (event.type === "test:pass" && event.data.name !== file &&
        event.data.skip === undefined &&
        event.data.todo === undefined) {
      passed.push(event.data.name);
    }
    if (event.type === "test:summary") summarySuccess = event.data.success;
  }
  const success = summarySuccess && !duplicateName;
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    file,
    success,
    passed,
  })}\n`);
  if (!success) process.exitCode = 1;
}

const file = process.argv[2];
if (file === undefined || file.length === 0) {
  process.stderr.write("missing test file\n");
  process.exitCode = 2;
} else {
  main(file).catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
