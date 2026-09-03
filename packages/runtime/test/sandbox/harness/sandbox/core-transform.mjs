const deniedIdentifiers = new Map([
  ["Atomics", "__pnh_deny_Atomics"],
  ["console", "__pnh_deny_console"],
  ["crypto", "__pnh_deny_crypto"],
  ["Date", "__pnh_deny_Date"],
  ["eval", "__pnh_deny_eval"],
  ["fetch", "__pnh_deny_fetch"],
  ["FinalizationRegistry", "__pnh_deny_FinalizationRegistry"],
  ["Function", "__pnh_deny_Function"],
  ["global", "__pnh_global"],
  ["globalThis", "__pnh_global"],
  ["Intl", "__pnh_deny_Intl"],
  ["Math", "__pnh_math"],
  ["navigator", "__pnh_deny_navigator"],
  ["performance", "__pnh_deny_performance"],
  ["process", "__pnh_deny_process"],
  ["queueMicrotask", "__pnh_deny_queueMicrotask"],
  ["require", "__pnh_deny_require"],
  ["self", "__pnh_global"],
  ["setImmediate", "__pnh_deny_setImmediate"],
  ["setInterval", "__pnh_deny_setInterval"],
  ["setTimeout", "__pnh_deny_setTimeout"],
  ["SharedArrayBuffer", "__pnh_deny_SharedArrayBuffer"],
  ["WebAssembly", "__pnh_deny_WebAssembly"],
  ["WebSocket", "__pnh_deny_WebSocket"],
  ["WeakRef", "__pnh_deny_WeakRef"],
  ["window", "__pnh_global"],
]);

const preludeSource = `
const __pnh_fail = (name) => () => { throw new Error(\`PNH ambient denied: \${name}\`); };
const __pnh_deny = (name) => new Proxy(function () {}, {
  get: __pnh_fail(name), set: __pnh_fail(name), apply: __pnh_fail(name),
  construct: __pnh_fail(name), has: __pnh_fail(name),
});
const __pnh_math_descriptors = Object.getOwnPropertyDescriptors(Math);
__pnh_math_descriptors.random = {
  configurable: false,
  enumerable: false,
  value: __pnh_fail("Math.random"),
  writable: false,
};
const __pnh_math = Object.freeze(Object.create(null, __pnh_math_descriptors));
const __pnh_global = __pnh_deny("globalThis");
const __pnh_deny_Atomics = __pnh_deny("Atomics");
const __pnh_deny_console = __pnh_deny("console");
const __pnh_deny_crypto = __pnh_deny("crypto");
const __pnh_deny_Date = __pnh_deny("Date");
const __pnh_deny_eval = __pnh_deny("eval");
const __pnh_deny_fetch = __pnh_deny("fetch");
const __pnh_deny_FinalizationRegistry = __pnh_deny("FinalizationRegistry");
const __pnh_deny_Function = __pnh_deny("Function");
const __pnh_deny_Intl = __pnh_deny("Intl");
const __pnh_deny_navigator = __pnh_deny("navigator");
const __pnh_deny_performance = __pnh_deny("performance");
const __pnh_deny_process = __pnh_deny("process");
const __pnh_deny_queueMicrotask = __pnh_deny("queueMicrotask");
const __pnh_deny_require = __pnh_deny("require");
const __pnh_deny_setImmediate = __pnh_deny("setImmediate");
const __pnh_deny_setInterval = __pnh_deny("setInterval");
const __pnh_deny_setTimeout = __pnh_deny("setTimeout");
const __pnh_deny_SharedArrayBuffer = __pnh_deny("SharedArrayBuffer");
const __pnh_deny_WebAssembly = __pnh_deny("WebAssembly");
const __pnh_deny_WebSocket = __pnh_deny("WebSocket");
const __pnh_deny_WeakRef = __pnh_deny("WeakRef");
`;

function isPropertyName(ts, node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node)
  );
}

function makeSynthetic(ts, node) {
  ts.setTextRange(node, { pos: -1, end: -1 });
  ts.setEmitFlags(node, ts.EmitFlags.NoSourceMap);
  ts.forEachChild(node, (child) => makeSynthetic(ts, child));
}

function scanForbiddenSyntax(ts, sourceFile) {
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new Error("PNH core loader: dynamic import denied");
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      throw new Error("PNH core loader: require denied");
    }
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      throw new Error("PNH core loader: import.meta denied");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

export function transformCoreSource(ts, file, source) {
  const sourceFile = ts.createSourceFile(
    file.path,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  scanForbiddenSyntax(ts, sourceFile);

  const prelude = ts.createSourceFile(
    "pnh-core-prelude.ts",
    preludeSource,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of prelude.statements) makeSynthetic(ts, statement);

  return ts.transpileModule(source, {
    fileName: file.path,
    compilerOptions: {
      inlineSourceMap: true,
      inlineSources: true,
      module: ts.ModuleKind.ESNext,
      sourceRoot: file.path.slice(0, file.path.lastIndexOf("/")),
      target: ts.ScriptTarget.ES2022,
    },
    transformers: {
      before: [
        (context) => (fileNode) => {
          const visit = (node) => {
            if (
              ts.isIdentifier(node) &&
              !isPropertyName(ts, node) &&
              deniedIdentifiers.has(node.text)
            ) {
              return context.factory.createIdentifier(deniedIdentifiers.get(node.text));
            }
            return ts.visitEachChild(node, visit, context);
          };
          const visited = ts.visitNode(fileNode, visit);
          return context.factory.updateSourceFile(visited, [
            ...prelude.statements,
            ...visited.statements,
          ]);
        },
      ],
    },
  }).outputText;
}
