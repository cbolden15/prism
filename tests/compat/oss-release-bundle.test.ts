import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createReleaseBundle,
  verifyReleaseBundle,
} from "../../scripts/release/prepare-oss-release-bundle.mjs";

const SOURCE_COMMIT = "a".repeat(40);

async function fixture(): Promise<{
  readonly root: string;
  readonly candidate: string;
  readonly sbom: string;
  readonly licenseReport: string;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "prism-oss-bundle-test-"));
  const candidate = resolve(root, "candidate");
  await mkdir(resolve(candidate, "packages"), { recursive: true });
  await writeFile(resolve(candidate, "candidate.json"), "candidate\n");
  await writeFile(resolve(candidate, "packages", "useprism-sdk-0.1.0.tgz"), "sdk\n");
  const sbom = resolve(root, "input.spdx.json");
  const licenseReport = resolve(root, "input-licenses.json");
  await writeFile(sbom, "{\"spdx\":true}\n");
  await writeFile(licenseReport, "{\"licenses\":true}\n");
  return { root, candidate, sbom, licenseReport };
}

test("creates and revalidates a deterministic closed release artifact", async () => {
  const input = await fixture();
  const first = resolve(input.root, "bundle-one");
  const second = resolve(input.root, "bundle-two");
  const validations: string[] = [];
  const validateCandidate = async ({ candidateRoot, sourceCommit }: {
    readonly candidateRoot: string;
    readonly sourceCommit: string;
  }) => {
    assert.equal(sourceCommit, SOURCE_COMMIT);
    validations.push(candidateRoot);
  };
  try {
    await createReleaseBundle({
      candidateRoot: input.candidate,
      sbomPath: input.sbom,
      licenseReportPath: input.licenseReport,
      outputPath: first,
      sourceCommit: SOURCE_COMMIT,
      validateCandidate,
    });
    await createReleaseBundle({
      candidateRoot: input.candidate,
      sbomPath: input.sbom,
      licenseReportPath: input.licenseReport,
      outputPath: second,
      sourceCommit: SOURCE_COMMIT,
      validateCandidate,
    });
    const verified = await verifyReleaseBundle({
      bundleRoot: first,
      sourceCommit: SOURCE_COMMIT,
      validateCandidate,
    });

    assert.deepEqual(verified.files.map(({ path }) => path), [
      "candidate/candidate.json",
      "candidate/packages/useprism-sdk-0.1.0.tgz",
      "prism-0.1.0-licenses.json",
      "prism-0.1.0.spdx.json",
    ]);
    assert.equal(
      await readFile(resolve(first, "release-bundle.json"), "utf8"),
      await readFile(resolve(second, "release-bundle.json"), "utf8"),
    );
    assert.equal(validations.length, 5, "source, copied candidates, and downloaded candidate must validate");
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});

test("rejects extra or digest-mismatched files after artifact download", async () => {
  const input = await fixture();
  const output = resolve(input.root, "bundle");
  const validateCandidate = async () => {};
  try {
    await createReleaseBundle({
      candidateRoot: input.candidate,
      sbomPath: input.sbom,
      licenseReportPath: input.licenseReport,
      outputPath: output,
      sourceCommit: SOURCE_COMMIT,
      validateCandidate,
    });
    await writeFile(resolve(output, "unexpected.txt"), "unexpected\n");
    await assert.rejects(
      verifyReleaseBundle({ bundleRoot: output, sourceCommit: SOURCE_COMMIT, validateCandidate }),
      /release-bundle-file-set-mismatch/u,
    );
    await rm(resolve(output, "unexpected.txt"));
    await writeFile(resolve(output, "prism-0.1.0.spdx.json"), "tampered\n");
    await assert.rejects(
      verifyReleaseBundle({ bundleRoot: output, sourceCommit: SOURCE_COMMIT, validateCandidate }),
      /release-bundle-digest-mismatch:prism-0.1.0\.spdx\.json/u,
    );
  } finally {
    await rm(input.root, { recursive: true, force: true });
  }
});
