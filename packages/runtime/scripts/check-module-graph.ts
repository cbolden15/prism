import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as TypeScript from "typescript";

const ts = createRequire(process.env.PNH_RUNNER_PACKAGE ?? import.meta.url)(
  "typescript",
) as typeof TypeScript;

export interface GraphViolation {
  file: string;
  specifier: string;
  reason:
    | "dynamic-import"
    | "escapes-core"
    | "external-specifier"
    | "import-meta"
    | "reference-directive"
    | "require-call"
    | "symlink"
    | "unresolved"
    | "unsupported-file";
}

export interface CoreManifestFile {
  path: string;
  sha256: string;
  url: string;
}

export interface CoreManifestEdge {
  parent: string;
  specifier: string;
  target: string;
}

export interface CoreManifest {
  coreRoot: string;
  edges: CoreManifestEdge[];
  entries: string[];
  files: Record<string, CoreManifestFile>;
}

export interface TestCoreImportViolation {
  file: string;
  reason: "core-import" | "dynamic-import" | "require-call";
  specifier: string;
}

interface ResolvedEdge {
  parent: string;
  specifier: string;
  target: string;
}

interface AnalyzedGraph {
  edges: ResolvedEdge[];
  files: string[];
  root: string;
  violations: GraphViolation[];
}

const compilerOptions: TypeScript.CompilerOptions = {
  allowImportingTsExtensions: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
};

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function scanCoreTree(
  directory: string,
  files: string[],
  violations: GraphViolation[],
): void {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      violations.push({ file: path, specifier: path, reason: "symlink" });
    } else if (stat.isDirectory()) {
      scanCoreTree(path, files, violations);
    } else if (!stat.isFile() || !path.endsWith(".ts") || path.endsWith(".d.ts")) {
      violations.push({ file: path, specifier: path, reason: "unsupported-file" });
    } else {
      files.push(realpathSync.native(path));
    }
  }
}

function listTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listTestFiles(path);
      return entry.isFile() && /\.test\.(?:mjs|ts)$/.test(entry.name)
        ? [path]
        : [];
    })
    .sort();
}

function analyzeCoreGraph(coreDirectory: string): AnalyzedGraph {
  const requestedRoot = resolve(coreDirectory);
  if (lstatSync(requestedRoot).isSymbolicLink()) {
    return {
      edges: [],
      files: [],
      root: requestedRoot,
      violations: [{ file: requestedRoot, specifier: requestedRoot, reason: "symlink" }],
    };
  }

  const root = realpathSync.native(requestedRoot);
  const files: string[] = [];
  const violations: GraphViolation[] = [];
  scanCoreTree(root, files, violations);
  const fileSet = new Set(files);
  const edges: ResolvedEdge[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );
    const addSpecifier = (specifier: string): void => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        violations.push({ file, specifier, reason: "external-specifier" });
        return;
      }
      if (!specifier.endsWith(".ts") || specifier.endsWith(".d.ts")) {
        violations.push({ file, specifier, reason: "unsupported-file" });
        return;
      }
      const lexicalTarget = resolve(dirname(file), specifier);
      if (!isInside(root, lexicalTarget)) {
        violations.push({ file, specifier, reason: "escapes-core" });
        return;
      }
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        compilerOptions,
        ts.sys,
      ).resolvedModule;
      if (resolved === undefined) {
        violations.push({ file, specifier, reason: "unresolved" });
        return;
      }
      let target: string;
      try {
        target = realpathSync.native(resolved.resolvedFileName);
      } catch {
        violations.push({ file, specifier, reason: "unresolved" });
        return;
      }
      if (!isInside(root, target)) {
        violations.push({ file, specifier, reason: "escapes-core" });
        return;
      }
      if (!fileSet.has(target)) {
        violations.push({ file, specifier, reason: "unsupported-file" });
        return;
      }
      edges.push({ parent: file, specifier, target });
    };

    for (const reference of [
      ...source.referencedFiles,
      ...source.typeReferenceDirectives,
      ...source.libReferenceDirectives,
    ]) {
      violations.push({
        file,
        specifier: reference.fileName,
        reason: "reference-directive",
      });
    }

    const visit = (node: TypeScript.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        addSpecifier(node.moduleSpecifier.text);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        const expression = node.moduleReference.expression;
        if (expression !== undefined && ts.isStringLiteral(expression)) {
          addSpecifier(expression.text);
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        violations.push({
          file,
          specifier: node.getText(source),
          reason: "dynamic-import",
        });
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        violations.push({
          file,
          specifier: node.getText(source),
          reason: "require-call",
        });
      } else if (
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        violations.push({ file, specifier: node.getText(source), reason: "import-meta" });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { edges, files, root, violations };
}

export function checkModuleGraph(coreDirectory: string): GraphViolation[] {
  return analyzeCoreGraph(coreDirectory).violations;
}

export function createCoreManifest(coreDirectory: string): CoreManifest {
  const graph = analyzeCoreGraph(coreDirectory);
  if (graph.violations.length > 0) {
    throw new Error(
      `PNH core graph is invalid: ${graph.violations
        .map((violation) => `${violation.reason}: ${violation.specifier}`)
        .join(", ")}`,
    );
  }

  const files = Object.fromEntries(
    graph.files
      .map((path) => {
        const relativePath = relative(graph.root, path).split(sep).join("/");
        return [
          relativePath,
          {
            path,
            sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
            url: pathToFileURL(path).href,
          },
        ] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const byPath = new Map(
    Object.values(files).map((file) => [file.path, file] as const),
  );

  return {
    coreRoot: graph.root,
    entries: Object.keys(files),
    files,
    edges: graph.edges.map((edge) => ({
      parent: byPath.get(edge.parent)!.url,
      specifier: edge.specifier,
      target: byPath.get(edge.target)!.url,
    })),
  };
}

export function checkTestCoreImports(
  testDirectory: string,
  options: {
    readonly coreDirectory?: string;
    readonly traversalDirectory?: string;
  } = {},
): TestCoreImportViolation[] {
  const testsRoot = realpathSync.native(resolve(testDirectory));
  const traversalRoot = realpathSync.native(resolve(options.traversalDirectory ?? resolve(testsRoot, "..")));
  const coreRoot = realpathSync.native(resolve(options.coreDirectory ?? resolve(traversalRoot, "core")));
  const violations: TestCoreImportViolation[] = [];
  const pending = listTestFiles(testsRoot);
  const seen = new Set<string>();

  while (pending.length > 0) {
    const requestedFile = pending.shift() as string;
    const file = realpathSync.native(requestedFile);
    if (seen.has(file)) continue;
    seen.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
      file.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );
    const followRelativeImport = (specifier: string): void => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) return;
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        { ...compilerOptions, allowJs: true },
        ts.sys,
      ).resolvedModule;
      if (resolved === undefined) return;
      let target: string;
      try {
        target = realpathSync.native(resolved.resolvedFileName);
      } catch {
        return;
      }
      if (isInside(coreRoot, target)) {
        violations.push({ file, reason: "core-import", specifier });
      } else if (
        isInside(traversalRoot, target) &&
        /\.(?:mjs|ts)$/.test(target) &&
        !target.endsWith(".d.ts") &&
        !seen.has(target)
      ) {
        pending.push(target);
      }
    };
    const visit = (node: TypeScript.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        node.importClause?.isTypeOnly !== true &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        followRelativeImport(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        node.isTypeOnly !== true &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        followRelativeImport(node.moduleSpecifier.text);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression !== undefined &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        followRelativeImport(node.moduleReference.expression.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const argument = node.arguments[0];
        if (node.arguments.length === 1 && argument !== undefined && ts.isStringLiteral(argument)) {
          followRelativeImport(argument.text);
        }
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        const argument = node.arguments[0];
        if (node.arguments.length === 1 && argument !== undefined && ts.isStringLiteral(argument)) {
          followRelativeImport(argument.text);
        } else {
          violations.push({ file, reason: "require-call", specifier: node.getText(source) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) || left.specifier.localeCompare(right.specifier)
  );
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const coreDirectory = process.argv[2] ?? join(import.meta.dirname, "..", "src", "core");
  const violations = checkModuleGraph(coreDirectory);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.reason}: ${violation.specifier} in ${violation.file}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`module-graph closure ok: ${coreDirectory}`);
  }
}
