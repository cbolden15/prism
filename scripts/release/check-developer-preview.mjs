import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { developerPreview, validateDeveloperPreviewCandidate } from "./developer-preview-contract.mjs";

function fail(reason) { throw new Error(reason); }
function run(command, commandArguments, options) {
  const result = spawnSync(command, commandArguments, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  if (result.error || result.status !== 0) fail("gate-failed");
  return result.stdout;
}
function parseArguments(arguments_) {
  if (arguments_.length === 0) return process.cwd();
  if (arguments_.length !== 2 || arguments_[0] !== "--root" || arguments_[1].startsWith("-")) fail("invalid-arguments");
  return resolve(arguments_[1]);
}
async function assertDocumentation(root) {
  if (!developerPreview.DOCUMENTS.every((file) => existsSync(resolve(root, file)))) fail("documentation-invalid");
  const text = await (await import("node:fs/promises")).readFile(resolve(root, "docs/developer-preview/command-reference.md"), "utf8");
  for (const command of ["prism init", "prism doctor", "prism run", "prism inspect", "prism plugin create", "prism plugin check"]) {
    if (!text.includes(command)) fail("documentation-invalid");
  }
}
function normalizeSyntheticAudit(root) {
  const auditPath = process.env.PRISM_RELEASE_NPM_AUDIT;
  if (typeof auditPath !== "string" || auditPath === "") return;
  const physicalRoot = realpathSync(root);
  if (physicalRoot === root) return;
  const entries = readFileSync(auditPath, "utf8").split("\n").filter(Boolean).map((line) => {
    const entry = JSON.parse(line);
    const cwd = typeof entry.cwd === "string" && (entry.cwd === physicalRoot || entry.cwd.startsWith(`${physicalRoot}/`))
      ? `${root}${entry.cwd.slice(physicalRoot.length)}`
      : entry.cwd;
    return JSON.stringify(cwd === entry.cwd ? entry : { ...entry, cwd });
  });
  writeFileSync(auditPath, `${entries.join("\n")}\n`, "utf8");
}
async function main() {
  const root = parseArguments(process.argv.slice(2));
  if (run("git", ["status", "--porcelain"], { cwd: root }).trim() !== "") fail("source-dirty");
  const sourceCommit = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  await assertDocumentation(root);
  run("npm", ["run", "test:phase5:red"], { cwd: root });
  normalizeSyntheticAudit(root);
  run("npm", ["run", "check:public-claims"], { cwd: root });
  normalizeSyntheticAudit(root);
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "prism-preview-release-")));
  const copiedTemporary = await realpath(await mkdtemp(join(tmpdir(), "prism-preview-copy-")));
  const candidate = resolve(temporary, "prism-developer-preview-0.1.0");
  const copiedCandidate = resolve(copiedTemporary, "prism-developer-preview-0.1.0");
  try {
    run(process.execPath, [resolve(import.meta.dirname, "pack-developer-preview.mjs"), "--output", candidate], { cwd: root });
    normalizeSyntheticAudit(root);
    await validateDeveloperPreviewCandidate({ candidateRoot: candidate, sourceCommit });
    await cp(candidate, copiedCandidate, { recursive: true, force: false, errorOnExist: true });
    await validateDeveloperPreviewCandidate({ candidateRoot: copiedCandidate, sourceCommit });
    run(process.execPath, [resolve(root, "scripts/test-packed-install.mjs"), "--candidate", copiedCandidate], { cwd: root });
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(copiedTemporary, { recursive: true, force: true });
  }
  process.stdout.write("Prism developer-preview release gate: ok\n");
}
main().catch((error) => {
  process.stderr.write(`Prism developer-preview release gate failed: ${error instanceof Error ? error.message : "gate-failed"}\n`);
  process.exitCode = 1;
});
