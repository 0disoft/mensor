import ts from "@typescript/typescript6";

import type { SourceRange } from "@0disoft/mensor-contract";

import { compareText } from "./paths.js";

export interface ModuleExportFact {
  readonly kind: "type" | "value";
  readonly name: string;
  readonly range: SourceRange;
}

export interface ModuleFact {
  readonly exports: readonly ModuleExportFact[];
  readonly hasExportStar: boolean;
  readonly imports: readonly ModuleImportFact[];
  readonly unsupportedDynamicImports: readonly SourceRange[];
  readonly syntaxErrors: readonly string[];
}

export interface ModuleImportFact {
  readonly edgeKind: "runtime" | "type";
  readonly specifier: string;
  readonly range: SourceRange;
}

export function extractModuleFact(
  sourceText: string,
  fileName: string,
): ModuleFact {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind(fileName),
  );
  const syntaxErrors = sourceFileSyntaxDiagnostics(sourceFile, sourceText, fileName)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
    .sort(compareText);
  const exports: ModuleExportFact[] = [];
  const imports: ModuleImportFact[] = [];
  const unsupportedDynamicImports: SourceRange[] = [];
  const scopeBindings = collectRequireBindings(sourceFile);
  let hasExportStar = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) {
      hasExportStar = true;
    }
    collectStatementExports(statement, sourceFile, exports);
    collectStaticImport(statement, sourceFile, imports);
  }
  collectRuntimeCalls(
    sourceFile,
    sourceFile,
    imports,
    unsupportedDynamicImports,
    scopeBindings,
    scopeBindings.get(sourceFile) === true,
  );
  return {
    exports: uniqueExports(exports),
    hasExportStar,
    imports: uniqueImports(imports),
    unsupportedDynamicImports,
    syntaxErrors,
  };
}

export function sourceFileSyntaxDiagnostics(
  sourceFile: ts.SourceFile,
  sourceText: string,
  fileName: string,
): readonly ts.Diagnostic[] {
  const diagnostics = (sourceFile as ts.SourceFile & {
    readonly parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  if (diagnostics !== undefined) {
    return diagnostics;
  }

  return ts.transpileModule(sourceText, {
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  }).diagnostics ?? [];
}

function collectStaticImport(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  imports: ModuleImportFact[],
): void {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    imports.push({
      edgeKind: importDeclarationIsTypeOnly(statement) ? "type" : "runtime",
      specifier: statement.moduleSpecifier.text,
      range: nodeRange(statement.moduleSpecifier, sourceFile),
    });
    return;
  }
  if (
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    imports.push({
      edgeKind: statement.isTypeOnly ? "type" : "runtime",
      specifier: statement.moduleSpecifier.text,
      range: nodeRange(statement.moduleSpecifier, sourceFile),
    });
    return;
  }
  if (
    ts.isImportEqualsDeclaration(statement) &&
    ts.isExternalModuleReference(statement.moduleReference) &&
    statement.moduleReference.expression !== undefined &&
    ts.isStringLiteral(statement.moduleReference.expression)
  ) {
    imports.push({
      edgeKind: statement.isTypeOnly ? "type" : "runtime",
      specifier: statement.moduleReference.expression.text,
      range: nodeRange(statement.moduleReference.expression, sourceFile),
    });
  }
}

function collectRuntimeCalls(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  imports: ModuleImportFact[],
  unsupported: SourceRange[],
  scopeBindings: ReadonlyMap<ts.Node, boolean>,
  requireShadowed: boolean,
): void {
  const nestedRequireShadowed =
    requireShadowed || (node !== sourceFile && scopeBindings.get(node) === true);
  if (
    ts.isCallExpression(node) &&
    isRuntimeImportCall(node, nestedRequireShadowed)
  ) {
    const argument = node.arguments[0];
    if (argument !== undefined && ts.isStringLiteralLike(argument)) {
      imports.push({
        edgeKind: "runtime",
        specifier: argument.text,
        range: nodeRange(argument, sourceFile),
      });
    } else {
      unsupported.push(nodeRange(node, sourceFile));
    }
  }
  node.forEachChild((child) =>
    collectRuntimeCalls(
      child,
      sourceFile,
      imports,
      unsupported,
      scopeBindings,
      nestedRequireShadowed,
    ),
  );
}

function isRuntimeImportCall(
  node: ts.CallExpression,
  requireShadowed: boolean,
): boolean {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  if (
    !requireShadowed &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require"
  ) {
    return true;
  }
  return (
    !requireShadowed &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "require" &&
    node.expression.name.text === "resolve"
  );
}

function collectRequireBindings(sourceFile: ts.SourceFile): ReadonlyMap<ts.Node, boolean> {
  const bindings = new Map<ts.Node, boolean>();
  visitBindingScopes(sourceFile, bindings);
  return bindings;
}

function visitBindingScopes(node: ts.Node, bindings: Map<ts.Node, boolean>): void {
  if (isBindingScope(node)) {
    bindings.set(node, scopeDeclaresRequire(node));
  }
  node.forEachChild((child) => visitBindingScopes(child, bindings));
}

function isBindingScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    isFunctionScope(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node)
  );
}

function scopeDeclaresRequire(scope: ts.Node): boolean {
  if (ts.isSourceFile(scope)) {
    return (
      scope.statements.some(statementDeclaresRequire) ||
      containsFunctionScopedRequire(scope)
    );
  }
  if (isFunctionScope(scope)) {
    if (scope.parameters.some((parameter) => bindingNameContainsRequire(parameter.name))) {
      return true;
    }
    if (
      (ts.isFunctionExpression(scope) || ts.isFunctionDeclaration(scope)) &&
      scope.name?.text === "require"
    ) {
      return true;
    }
    return scope.body !== undefined && containsFunctionScopedRequire(scope.body);
  }
  if (ts.isCatchClause(scope)) {
    return scope.variableDeclaration !== undefined &&
      bindingNameContainsRequire(scope.variableDeclaration.name);
  }
  if (
    ts.isForStatement(scope) ||
    ts.isForInStatement(scope) ||
    ts.isForOfStatement(scope)
  ) {
    return scope.initializer !== undefined &&
      ts.isVariableDeclarationList(scope.initializer) &&
      declarationListContainsRequire(scope.initializer);
  }
  const statements = ts.isBlock(scope)
    ? scope.statements
    : ts.isCaseBlock(scope)
      ? scope.clauses.flatMap((clause) => [...clause.statements])
      : [];
  return statements.some(statementDeclaresRequire);
}

function isFunctionScope(node: ts.Node): node is
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function statementDeclaresRequire(statement: ts.Statement): boolean {
  if (ts.isVariableStatement(statement)) {
    return declarationListContainsRequire(statement.declarationList);
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement)) &&
    statement.name?.text === "require"
  ) {
    return true;
  }
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause?.name?.text === "require") {
      return true;
    }
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      return bindings.name.text === "require";
    }
    return bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((element) => element.name.text === "require");
  }
  return false;
}

function containsFunctionScopedRequire(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found || (child !== node && ts.isFunctionLike(child))) {
      return;
    }
    if (
      ts.isVariableDeclarationList(child) &&
      (child.flags & ts.NodeFlags.BlockScoped) === 0 &&
      declarationListContainsRequire(child)
    ) {
      found = true;
      return;
    }
    child.forEachChild(visit);
  };
  visit(node);
  return found;
}

function declarationListContainsRequire(list: ts.VariableDeclarationList): boolean {
  return list.declarations.some((declaration) =>
    bindingNameContainsRequire(declaration.name),
  );
}

function bindingNameContainsRequire(name: ts.BindingName): boolean {
  if (ts.isIdentifier(name)) {
    return name.text === "require";
  }
  return name.elements.some((element) =>
    !ts.isOmittedExpression(element) && bindingNameContainsRequire(element.name),
  );
}

function importDeclarationIsTypeOnly(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (clause?.isTypeOnly === true) {
    return true;
  }
  return (
    clause?.name === undefined &&
    clause?.namedBindings !== undefined &&
    ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function uniqueImports(imports: readonly ModuleImportFact[]): readonly ModuleImportFact[] {
  const byKey = new Map<string, ModuleImportFact>();
  for (const entry of imports) {
    const key = `${entry.edgeKind}\u0000${entry.specifier}\u0000${entry.range.start.line}\u0000${entry.range.start.character}`;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((left, right) =>
    compareText(left.specifier, right.specifier) ||
    compareText(left.edgeKind, right.edgeKind) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character,
  );
}

function collectStatementExports(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  exports: ModuleExportFact[],
): void {
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    exports.push({ kind: "value", name: "default", range: nodeRange(statement, sourceFile) });
    return;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exports.push({
          kind: statement.isTypeOnly || element.isTypeOnly ? "type" : "value",
          name: element.name.text,
          range: nodeRange(element.name, sourceFile),
        });
      }
    } else if (
      statement.exportClause !== undefined &&
      ts.isNamespaceExport(statement.exportClause)
    ) {
      exports.push({
        kind: "value",
        name: statement.exportClause.name.text,
        range: nodeRange(statement.exportClause.name, sourceFile),
      });
    }
    return;
  }
  if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
    return;
  }
  if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
    exports.push({
      kind: declarationHasRuntimeValue(statement) ? "value" : "type",
      name: "default",
      range: nodeRange(statement, sourceFile),
    });
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, sourceFile, exports);
    }
    return;
  }
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    exports.push({
      kind: declarationHasRuntimeValue(statement) ? "value" : "type",
      name: statement.name.text,
      range: nodeRange(statement.name, sourceFile),
    });
  }
}

function collectBindingNames(
  name: ts.BindingName,
  sourceFile: ts.SourceFile,
  exports: ModuleExportFact[],
): void {
  if (ts.isIdentifier(name)) {
    exports.push({ kind: "value", name: name.text, range: nodeRange(name, sourceFile) });
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, sourceFile, exports);
    }
  }
}

function declarationHasRuntimeValue(statement: ts.Statement): boolean {
  if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
    return false;
  }
  return !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
    : false;
}

function uniqueExports(exports: readonly ModuleExportFact[]): readonly ModuleExportFact[] {
  const byName = new Map<string, ModuleExportFact>();
  for (const entry of exports) {
    const existing = byName.get(entry.name);
    if (existing === undefined || (existing.kind === "type" && entry.kind === "value")) {
      byName.set(entry.name, entry);
    }
  }
  return [...byName.values()].sort((left, right) => compareText(left.name, right.name));
}

function nodeRange(node: ts.Node, sourceFile: ts.SourceFile): SourceRange {
  return {
    start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)),
    end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()),
  };
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (fileName.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
