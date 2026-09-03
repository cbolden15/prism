import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  ALLOWED_RELEASE_LICENSES,
  assertAllowedDependencyLicenses,
  createDependencyLicenseReport,
  createReleaseSetSpdx,
  generateFullDependencySbom,
  normalizeSpdxSbom,
} from "../../scripts/release/generate-oss-sbom.mjs";
import { OSS_RELEASE_PACKAGES } from "../../scripts/release/oss-release-contract.mjs";

const CREATED = "2026-09-01T12:00:00.000Z";
const NAMESPACE = "https://github.com/useprism/prism/releases/tag/v0.1.0#sbom";

function spdx(packages: readonly Record<string, unknown>[]) {
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: "prism@0.1.0",
    documentNamespace: "https://example.invalid/random/namespace",
    creationInfo: {
      created: "2026-09-03T01:02:03.456Z",
      creators: ["Tool: npm/11.19.0"],
    },
    documentDescribes: packages.map((entry) => entry.SPDXID),
    packages,
    relationships: packages.map((entry) => ({
      spdxElementId: "SPDXRef-Package-root",
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: entry.SPDXID,
    })),
  };
}

const approvedPackages = Object.freeze([
  {
    SPDXID: "SPDXRef-Package-root",
    name: "prism",
    versionInfo: "0.1.0",
    licenseDeclared: "Apache-2.0",
    licenseConcluded: "NOASSERTION",
  },
  {
    SPDXID: "SPDXRef-Package-build-tool",
    name: "build-tool",
    versionInfo: "1.0.0",
    licenseDeclared: "MIT",
    licenseConcluded: "NOASSERTION",
  },
]);

function releaseSetInput() {
  const root = approvedPackages[0]!;
  const buildTool = approvedPackages[1]!;
  const releasePackages = OSS_RELEASE_PACKAGES.map((entry) => ({
    SPDXID: `SPDXRef-${entry.name.replaceAll(/[^A-Za-z0-9.-]/gu, ".")}`,
    name: entry.name,
    versionInfo: entry.version,
    licenseDeclared: "Apache-2.0",
    licenseConcluded: "NOASSERTION",
  }));
  const value = spdx([root, ...releasePackages, buildTool]);
  value.documentDescribes = [root.SPDXID];
  value.relationships = [
    {
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: root.SPDXID,
    },
    ...releasePackages.map((entry) => ({
      spdxElementId: entry.SPDXID,
      relationshipType: "DEPENDENCY_OF",
      relatedSpdxElement: root.SPDXID,
    })),
  ];
  return value;
}

test("normalizes npm SPDX output deterministically", () => {
  const first = spdx(approvedPackages);
  const second = spdx([...approvedPackages].reverse());
  second.documentNamespace = "https://example.invalid/another/random/namespace";
  second.creationInfo.created = "2026-09-04T04:05:06.789Z";
  second.creationInfo.creators.reverse();
  second.documentDescribes.reverse();
  second.relationships.reverse();

  assert.equal(
    normalizeSpdxSbom(first, { created: CREATED, namespace: NAMESPACE }),
    normalizeSpdxSbom(second, { created: CREATED, namespace: NAMESPACE }),
  );
});

test("the license gate fails an unapproved dev or build dependency", () => {
  assert.deepEqual([...ALLOWED_RELEASE_LICENSES].sort(), [
    "Apache-2.0",
    "BSD-3-Clause",
    "BlueOak-1.0.0",
    "ISC",
    "MIT",
  ]);
  const fullGraph = spdx([...approvedPackages, {
    SPDXID: "SPDXRef-Package-dev-only",
    name: "dev-only-build-tool",
    versionInfo: "9.0.0",
    licenseDeclared: "GPL-3.0-only",
    licenseConcluded: "NOASSERTION",
  }]);
  assert.throws(
    () => assertAllowedDependencyLicenses(fullGraph),
    /dependency-license-refused:dev-only-build-tool@9\.0\.0:GPL-3\.0-only/u,
  );
});

test("release-set SPDX describes only the four public package coordinates", () => {
  const releaseSet = createReleaseSetSpdx(releaseSetInput());
  const namesById = new Map(releaseSet.packages.map((entry) => [entry.SPDXID, entry.name]));
  assert.equal(releaseSet.name, "prism-oss-release-set@0.1.0");
  assert.deepEqual(
    releaseSet.documentDescribes.map((id) => namesById.get(id)),
    OSS_RELEASE_PACKAGES.map(({ name }) => name),
  );
  assert.equal(releaseSet.packages.some(({ name }) => name === "prism"), false);
  assert.equal(releaseSet.packages.some(({ name }) => name === "@useprism/provider-codex"), false);
  assert.deepEqual(
    releaseSet.relationships.filter(({ relationshipType }) => relationshipType === "DESCRIBES"),
    releaseSet.documentDescribes.map((relatedSpdxElement) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement,
    })),
  );
});

test("generates the gate SBOM from the full installed graph without omitting dev dependencies", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "prism-oss-sbom-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const outputPath = resolve(temporary, "prism-0.1.0.spdx.json");
  const licenseReportPath = resolve(temporary, "prism-0.1.0-licenses.json");
  const calls: string[][] = [];
  const fullGraph = spdx(approvedPackages);
  const releaseGraph = releaseSetInput();

  await generateFullDependencySbom({
    repositoryRoot: temporary,
    outputPath,
    licenseReportPath,
    created: CREATED,
    namespace: NAMESPACE,
    runNpm(arguments_: readonly string[]) {
      calls.push([...arguments_]);
      return arguments_[0] === "--version"
        ? { status: 0, stdout: "11.19.0\n", stderr: "" }
        : {
            status: 0,
            stdout: JSON.stringify(arguments_.includes("--workspace") ? releaseGraph : fullGraph),
            stderr: "",
          };
    },
  });

  assert.deepEqual(calls, [
    ["--version"],
    [
      "sbom",
      "--sbom-format", "spdx",
      "--sbom-type", "application",
      "--include", "dev",
      "--include", "optional",
      "--include", "peer",
    ],
    [
      "sbom",
      "--sbom-format", "spdx",
      "--sbom-type", "application",
      "--workspace", "packages/sdk",
      "--workspace", "packages/runtime",
      "--workspace", "packages/provider-ollama",
      "--workspace", "packages/cli",
      "--omit", "dev",
    ],
  ]);
  assert.equal(calls[1]?.some((value) => value.includes("omit")), false);
  assert.equal(
    await readFile(outputPath, "utf8"),
    normalizeSpdxSbom(createReleaseSetSpdx(releaseGraph), { created: CREATED, namespace: NAMESPACE }),
  );
  assert.equal(await readFile(licenseReportPath, "utf8"), createDependencyLicenseReport(fullGraph));
  const report = JSON.parse(await readFile(licenseReportPath, "utf8"));
  assert.equal(report.scope, "full-installed-dependency-graph-including-dev-build");
  assert.deepEqual(report.packages.map(({ name }: { readonly name: string }) => name), [
    "build-tool",
    "prism",
  ]);
});
