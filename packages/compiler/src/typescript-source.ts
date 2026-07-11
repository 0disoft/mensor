import ts from "@typescript/typescript6";

import type { SourcePosition, SourceRange } from "@mensor/contract";

import { compareText } from "./paths.js";

export interface ModuleExportFact {
  readonly name: string;
  readonly range: SourceRange;
}

export interface ModuleFact {
  readonly exports: readonly ModuleExportFact[];
  readonly hasExportStar: boolean;
  readonly syntaxErrors: readonly string[];
}

export function extractModuleFact(
  sourceText: string,
  fileName: string,
): ModuleFact {
  const diagnostics = ts.transpileModule(sourceText, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).diagnostics ?? [];
  const syntaxErrors = diagnostics
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    )
    .sort(compareText);

  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind(fileName),
  );
  const exports: ModuleExportFact[] = [];
  let hasExportStar = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) {
      hasExportStar = true;
    }
    collectStatementExports(statement, sourceFile, sourceText, exports);
  }
  return {
    exports: uniqueExports(exports),
    hasExportStar,
    syntaxErrors,
  };
}

function collectStatementExports(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  sourceText: string,
  exports: ModuleExportFact[],
): void {
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    exports.push({ name: "default", range: nodeRange(statement, sourceFile, sourceText) });
    return;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exports.push({
          name: element.name.text,
          range: nodeRange(element.name, sourceFile, sourceText),
        });
      }
    } else if (
      statement.exportClause !== undefined &&
      ts.isNamespaceExport(statement.exportClause)
    ) {
      exports.push({
        name: statement.exportClause.name.text,
        range: nodeRange(statement.exportClause.name, sourceFile, sourceText),
      });
    }
    return;
  }
  if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
    return;
  }
  if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
    exports.push({ name: "default", range: nodeRange(statement, sourceFile, sourceText) });
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, sourceFile, sourceText, exports);
    }
    return;
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    exports.push({
      name: statement.name.text,
      range: nodeRange(statement.name, sourceFile, sourceText),
    });
  }
}

function collectBindingNames(
  name: ts.BindingName,
  sourceFile: ts.SourceFile,
  sourceText: string,
  exports: ModuleExportFact[],
): void {
  if (ts.isIdentifier(name)) {
    exports.push({ name: name.text, range: nodeRange(name, sourceFile, sourceText) });
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, sourceFile, sourceText, exports);
    }
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
    if (!byName.has(entry.name)) {
      byName.set(entry.name, entry);
    }
  }
  return [...byName.values()].sort((left, right) => compareText(left.name, right.name));
}

function nodeRange(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  sourceText: string,
): SourceRange {
  return {
    start: positionAt(sourceText, node.getStart(sourceFile)),
    end: positionAt(sourceText, node.getEnd()),
  };
}

function positionAt(text: string, offset: number): SourcePosition {
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, character: offset - lineStart };
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
