import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootFlag = process.argv.indexOf("--root");
const repositoryRoot = rootFlag === -1
  ? resolve(import.meta.dirname, "..")
  : resolve(process.argv[rootFlag + 1] ?? "");
const packagesRoot = resolve(repositoryRoot, "packages");
const sourceExtensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const runtimeExtensionImports = new Map([
  ["packages/cli/src/plugin-check-worker.ts", {
    argumentIdentifier: "entrypoint",
    packageName: "@useprism/cli",
    requiredCount: 1,
  }],
]);
const runtimeExtensionImportCounts = new Map(
  [...runtimeExtensionImports.keys()].map((path) => [path, 0]),
);

function isWithin(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function listProductionFiles(packageRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`package production tree contains symlink: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
    }
  };
  for (const name of ["src", "assets"]) {
    const directory = resolve(packageRoot, name);
    if (existsSync(directory)) visit(directory);
  }
  return files.sort();
}

function moduleArgument(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "URL" &&
    node.arguments !== undefined &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

function moduleSpecifiers(path) {
  const text = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  const failures = [];
  const repositoryPath = relative(repositoryRoot, path).split(sep).join("/");
  const runtimeExtensionRule = runtimeExtensionImports.get(repositoryPath);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isImportMetaResolve =
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "resolve" &&
        ts.isMetaProperty(node.expression.expression) &&
        node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword;
      if (isDynamicImport || isRequire || isImportMetaResolve) {
        const specifier = node.arguments[0] === undefined ? undefined : moduleArgument(node.arguments[0]);
        if (specifier !== undefined) {
          specifiers.push(specifier);
        } else if (
          isDynamicImport &&
          runtimeExtensionRule !== undefined &&
          node.arguments.length === 1 &&
          ts.isIdentifier(node.arguments[0]) &&
          node.arguments[0].text === runtimeExtensionRule.argumentIdentifier
        ) {
          runtimeExtensionImportCounts.set(
            repositoryPath,
            (runtimeExtensionImportCounts.get(repositoryPath) ?? 0) + 1,
          );
        } else {
          failures.push(`${path}: non-static module resolution is not graph-checkable`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { failures, specifiers };
}

function prismPackageName(specifier) {
  if (!specifier.startsWith("@useprism/")) return undefined;
  return specifier.split("/").slice(0, 2).join("/");
}

function allowedDependencies(packageName, allPackageNames) {
  if (packageName === "@useprism/sdk") return new Set();
  if (packageName === "@useprism/runtime") return new Set(["@useprism/sdk"]);
  if (packageName.startsWith("@useprism/provider-") || packageName.startsWith("@useprism/tool-")) {
    return new Set(["@useprism/sdk"]);
  }
  if (packageName === "@useprism/cli") {
    return new Set([...allPackageNames].filter((name) => (
      name === "@useprism/sdk" ||
      name === "@useprism/runtime" ||
      name.startsWith("@useprism/provider-") ||
      name.startsWith("@useprism/tool-")
    )));
  }
  throw new Error(`package graph has no dependency rule for ${packageName}`);
}

if (!existsSync(packagesRoot)) throw new Error(`packages directory not found: ${packagesRoot}`);

const packages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(resolve(packagesRoot, entry.name, "package.json")))
  .map((entry) => {
    const root = resolve(packagesRoot, entry.name);
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@useprism/")) {
      throw new Error(`workspace package has an invalid Prism name: ${root}`);
    }
    if (typeof manifest.version !== "string") throw new Error(`workspace package has no version: ${root}`);
    return { root, manifest, files: listProductionFiles(root) };
  })
  .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));

const packageNames = new Set(packages.map(({ manifest }) => manifest.name));
const versions = new Map(packages.map(({ manifest }) => [manifest.name, manifest.version]));
const failures = [];
let fileCount = 0;

for (const package_ of packages) {
  const { manifest, root } = package_;
  const allowed = allowedDependencies(manifest.name, packageNames);
  const declared = manifest.dependencies ?? {};
  for (const [dependency, version] of Object.entries(declared)) {
    if (!dependency.startsWith("@useprism/")) continue;
    if (!allowed.has(dependency)) failures.push(`${manifest.name}: forbidden dependency ${dependency}`);
    if (!packageNames.has(dependency)) failures.push(`${manifest.name}: unknown workspace dependency ${dependency}`);
    if (versions.get(dependency) !== version) {
      failures.push(`${manifest.name}: ${dependency} must use exact workspace version ${versions.get(dependency)}`);
    }
  }

  for (const path of package_.files) {
    fileCount += 1;
    const parsed = moduleSpecifiers(path);
    failures.push(...parsed.failures);
    for (const specifier of parsed.specifiers) {
      const dependency = prismPackageName(specifier);
      if (dependency !== undefined) {
        if (!allowed.has(dependency)) failures.push(`${path}: forbidden package import ${specifier}`);
        if (declared[dependency] === undefined) failures.push(`${path}: undeclared package import ${specifier}`);
        continue;
      }

      if (specifier.startsWith(".")) {
        const target = resolve(dirname(path), specifier);
        if (!isWithin(root, target)) failures.push(`${path}: relative import escapes its package: ${specifier}`);
        continue;
      }

      if (specifier.startsWith("file:")) {
        const target = fileURLToPath(specifier);
        if (isWithin(repositoryRoot, target)) failures.push(`${path}: file URL resolves into the source checkout`);
        continue;
      }

      if (isAbsolute(specifier)) {
        failures.push(`${path}: absolute module import is forbidden: ${specifier}`);
        continue;
      }

      if (["pnh/", "assurance/", "packages/", "scripts/"].some((prefix) => specifier.startsWith(prefix))) {
        failures.push(`${path}: repository-root module import is forbidden: ${specifier}`);
      }
    }
  }
}

for (const [path, rule] of runtimeExtensionImports) {
  if (!packageNames.has(rule.packageName)) continue;
  const count = runtimeExtensionImportCounts.get(path) ?? 0;
  if (count !== rule.requiredCount) {
    failures.push(
      `runtime extension import contract for ${path} requires exactly ${rule.requiredCount} `
      + `import(${rule.argumentIdentifier}); found ${count}`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(`package graph violations:\n${[...new Set(failures)].sort().join("\n")}`);
}

process.stdout.write(`package graph ok: ${packages.length} packages, ${fileCount} production modules\n`);
