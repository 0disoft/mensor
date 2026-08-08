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

type BindingKind = "type" | "value";

const maxSourceStructuralDepth = 1_024;

export function extractModuleFact(
  sourceText: string,
  fileName: string,
): ModuleFact {
  if (sourceStructuralDepthExceeds(sourceText, maxSourceStructuralDepth)) {
    return {
      exports: [],
      hasExportStar: false,
      imports: [],
      unsupportedDynamicImports: [],
      syntaxErrors: [
        `Source structural depth exceeds the supported limit of ${maxSourceStructuralDepth}.`,
      ],
    };
  }
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
  const topLevelBindings = collectTopLevelBindings(sourceFile);
  let hasExportStar = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) {
      hasExportStar = true;
    }
    collectStatementExports(statement, sourceFile, exports, topLevelBindings);
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

function sourceStructuralDepthExceeds(sourceText: string, limit: number): boolean {
  const scanner = ts.createScanner(
    ts.ScriptTarget.ES2022,
    true,
    ts.LanguageVariant.JSX,
    sourceText,
  );
  let depth = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token === ts.SyntaxKind.OpenBraceToken ||
      token === ts.SyntaxKind.OpenBracketToken ||
      token === ts.SyntaxKind.OpenParenToken
    ) {
      depth += 1;
      if (depth > limit) {
        return true;
      }
    } else if (
      token === ts.SyntaxKind.CloseBraceToken ||
      token === ts.SyntaxKind.CloseBracketToken ||
      token === ts.SyntaxKind.CloseParenToken
    ) {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
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
  root: ts.Node,
  sourceFile: ts.SourceFile,
  imports: ModuleImportFact[],
  unsupported: SourceRange[],
  scopeBindings: ReadonlyMap<ts.Node, boolean>,
  requireShadowed: boolean,
): void {
  const stack: Array<{ node: ts.Node; requireShadowed: boolean }> = [
    { node: root, requireShadowed },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    const nestedRequireShadowed = current.requireShadowed ||
      (current.node !== sourceFile && scopeBindings.get(current.node) === true);
    if (
      ts.isCallExpression(current.node) &&
      isRuntimeImportCall(current.node, nestedRequireShadowed)
    ) {
      const argument = current.node.arguments[0];
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        imports.push({
          edgeKind: "runtime",
          specifier: argument.text,
          range: nodeRange(argument, sourceFile),
        });
      } else {
        unsupported.push(nodeRange(current.node, sourceFile));
      }
    }
    for (const child of childNodesInReverse(current.node)) {
      stack.push({ node: child, requireShadowed: nestedRequireShadowed });
    }
  }
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

function visitBindingScopes(root: ts.Node, bindings: Map<ts.Node, boolean>): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (isBindingScope(node)) {
      bindings.set(node, scopeDeclaresRequire(node));
    }
    stack.push(...childNodesInReverse(node));
  }
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
  const stack: ts.Node[] = [node];
  while (stack.length > 0) {
    const child = stack.pop();
    if (child === undefined || (child !== node && ts.isFunctionLike(child))) {
      continue;
    }
    if (
      ts.isVariableDeclarationList(child) &&
      (child.flags & ts.NodeFlags.BlockScoped) === 0 &&
      declarationListContainsRequire(child)
    ) {
      return true;
    }
    stack.push(...childNodesInReverse(child));
  }
  return false;
}

function declarationListContainsRequire(list: ts.VariableDeclarationList): boolean {
  return list.declarations.some((declaration) =>
    bindingNameContainsRequire(declaration.name),
  );
}

function bindingNameContainsRequire(name: ts.BindingName): boolean {
  const stack: ts.BindingName[] = [name];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (ts.isIdentifier(current)) {
      if (current.text === "require") {
        return true;
      }
      continue;
    }
    for (let index = current.elements.length - 1; index >= 0; index -= 1) {
      const element = current.elements[index];
      if (element !== undefined && !ts.isOmittedExpression(element)) {
        stack.push(element.name);
      }
    }
  }
  return false;
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
  topLevelBindings: ReadonlyMap<string, BindingKind>,
): void {
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    exports.push({ kind: "value", name: "default", range: nodeRange(statement, sourceFile) });
    return;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const kind = statement.isTypeOnly || element.isTypeOnly
          ? "type"
          : statement.moduleSpecifier !== undefined
            ? "value"
            : topLevelBindings.get(element.propertyName?.text ?? element.name.text);
        if (kind === undefined) {
          continue;
        }
        exports.push({
          kind,
          name: element.name.text,
          range: nodeRange(element.name, sourceFile),
        });
      }
    } else if (
      statement.exportClause !== undefined &&
      ts.isNamespaceExport(statement.exportClause)
    ) {
      exports.push({
        kind: statement.isTypeOnly ? "type" : "value",
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
    const kind = declarationHasRuntimeValue(statement) ? "value" : "type";
    for (const declaration of statement.declarationList.declarations) {
      collectExportBindingNames(declaration.name, kind, sourceFile, exports);
    }
    return;
  }
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    exports.push({
      kind: declarationHasRuntimeValue(statement) ? "value" : "type",
      name: statement.name.text,
      range: nodeRange(statement.name, sourceFile),
    });
  }
}

function collectExportBindingNames(
  name: ts.BindingName,
  kind: BindingKind,
  sourceFile: ts.SourceFile,
  exports: ModuleExportFact[],
): void {
  const stack: ts.BindingName[] = [name];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (ts.isIdentifier(current)) {
      exports.push({ kind, name: current.text, range: nodeRange(current, sourceFile) });
      continue;
    }
    for (let index = current.elements.length - 1; index >= 0; index -= 1) {
      const element = current.elements[index];
      if (element !== undefined && !ts.isOmittedExpression(element)) {
        stack.push(element.name);
      }
    }
  }
}

function declarationHasRuntimeValue(statement: ts.Statement): boolean {
  if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
    return false;
  }
  if (ts.isFunctionDeclaration(statement)) {
    return statement.body !== undefined;
  }
  return !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement);
}

function collectTopLevelBindings(sourceFile: ts.SourceFile): ReadonlyMap<string, BindingKind> {
  const bindings = new Map<string, BindingKind>();
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const kind = declarationHasRuntimeValue(statement) ? "value" : "type";
      for (const declaration of statement.declarationList.declarations) {
        collectBindingKinds(declaration.name, kind, bindings);
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      addBinding(bindings, statement.name.text, declarationHasRuntimeValue(statement) ? "value" : "type");
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      addBinding(bindings, statement.name.text, statement.isTypeOnly ? "type" : "value");
      continue;
    }
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) {
      continue;
    }
    const clause = statement.importClause;
    if (clause.name !== undefined) {
      addBinding(bindings, clause.name.text, clause.isTypeOnly ? "type" : "value");
    }
    const namedBindings = clause.namedBindings;
    if (namedBindings === undefined) {
      continue;
    }
    if (ts.isNamespaceImport(namedBindings)) {
      addBinding(bindings, namedBindings.name.text, clause.isTypeOnly ? "type" : "value");
      continue;
    }
    for (const element of namedBindings.elements) {
      addBinding(
        bindings,
        element.name.text,
        clause.isTypeOnly || element.isTypeOnly ? "type" : "value",
      );
    }
  }
  return bindings;
}

function collectBindingKinds(
  name: ts.BindingName,
  kind: BindingKind,
  bindings: Map<string, BindingKind>,
): void {
  const stack: ts.BindingName[] = [name];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (ts.isIdentifier(current)) {
      addBinding(bindings, current.text, kind);
      continue;
    }
    for (let index = current.elements.length - 1; index >= 0; index -= 1) {
      const element = current.elements[index];
      if (element !== undefined && !ts.isOmittedExpression(element)) {
        stack.push(element.name);
      }
    }
  }
}

function childNodesInReverse(node: ts.Node): readonly ts.Node[] {
  const children: ts.Node[] = [];
  node.forEachChild((child) => {
    children.push(child);
  });
  children.reverse();
  return children;
}

function addBinding(
  bindings: Map<string, BindingKind>,
  name: string,
  kind: BindingKind,
): void {
  if (bindings.get(name) !== "value") {
    bindings.set(name, kind);
  }
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
