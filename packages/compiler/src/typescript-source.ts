import ts from "@typescript/typescript6";

import type { SourceRange } from "@mensor/contract";

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
  const parseDiagnostics = (sourceFile as ts.SourceFile & {
    readonly parseDiagnostics: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  const syntaxErrors = parseDiagnostics
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
    .sort(compareText);
  const exports: ModuleExportFact[] = [];
  const imports: ModuleImportFact[] = [];
  const unsupportedDynamicImports: SourceRange[] = [];
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
  );
  return {
    exports: uniqueExports(exports),
    hasExportStar,
    imports: uniqueImports(imports),
    unsupportedDynamicImports,
    syntaxErrors,
  };
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
): void {
  if (ts.isCallExpression(node) && isRuntimeImportCall(node)) {
    const argument = node.arguments[0];
    if (argument !== undefined && ts.isStringLiteral(argument)) {
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
    collectRuntimeCalls(child, sourceFile, imports, unsupported),
  );
}

function isRuntimeImportCall(node: ts.CallExpression): boolean {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
    return true;
  }
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "require" &&
    node.expression.name.text === "resolve"
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
