import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";

import {
  serializeRouteIndex,
  type IndexedRoute,
  type RouteIndex,
} from "@0disoft/mensor-contract";
import ts from "@typescript/typescript6";

const maxSourceBytes = 1_048_576;
const maxSourceStructuralDepth = 1_024;
const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

export class HonoRouteIndexError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly file?: string,
  ) {
    super(message);
    this.name = "HonoRouteIndexError";
  }
}

export interface ProduceHonoRouteIndexOptions {
  readonly root: string;
  readonly sources: readonly string[];
  readonly receivers: readonly string[];
  readonly producerVersion: string;
}

export interface ProducedHonoRouteIndex {
  readonly value: RouteIndex;
  readonly text: string;
}

export async function produceHonoRouteIndex(
  options: ProduceHonoRouteIndexOptions,
): Promise<ProducedHonoRouteIndex> {
  if (options.sources.length === 0) {
    throw new HonoRouteIndexError(
      "route_indexer.source_required",
      "At least one root-relative Hono source file is required.",
    );
  }
  if (options.receivers.length === 0) {
    throw new HonoRouteIndexError(
      "route_indexer.receiver_required",
      "At least one Hono receiver identifier is required.",
    );
  }
  const receivers = new Set<string>();
  for (const receiver of options.receivers) {
    if (!identifierPattern.test(receiver)) {
      throw new HonoRouteIndexError(
        "route_indexer.receiver_invalid",
        `Hono receiver ${JSON.stringify(receiver)} must be a JavaScript identifier.`,
      );
    }
    receivers.add(receiver);
  }

  const root = await realpath(options.root).catch(() => {
    throw new HonoRouteIndexError(
      "route_indexer.root_invalid",
      "The selected project root could not be resolved.",
    );
  });
  const routes: IndexedRoute[] = [];
  const sourcePaths = [...new Set(options.sources.map(normalizeSourcePath))].sort(compareText);
  for (const sourcePath of sourcePaths) {
    const source = await readSource(root, sourcePath);
    routes.push(...extractHonoRoutes(sourcePath, source.text, source.digest, receivers));
  }
  if (routes.length === 0) {
    throw new HonoRouteIndexError(
      "route_indexer.no_routes",
      "No static GET or POST calls were found for the selected Hono receivers.",
    );
  }

  const value: RouteIndex = {
    schemaVersion: 1,
    producer: {
      name: "mensor-hono-route-indexer",
      version: options.producerVersion,
    },
    routes,
  };
  let text: string;
  try {
    text = serializeRouteIndex(value);
  } catch (error) {
    throw new HonoRouteIndexError(
      "route_indexer.output_invalid",
      error instanceof Error ? error.message : "The produced RouteIndex is invalid.",
    );
  }
  return { value, text };
}

function extractHonoRoutes(
  file: string,
  sourceText: string,
  digest: `sha256:${string}`,
  receivers: ReadonlySet<string>,
): readonly IndexedRoute[] {
  if (sourceStructuralDepthExceeds(sourceText, maxSourceStructuralDepth)) {
    throw new HonoRouteIndexError(
      "route_indexer.source_too_deep",
      `Hono source structural depth exceeds ${maxSourceStructuralDepth}.`,
      file,
    );
  }
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind(file),
  );
  const diagnostics = sourceFileSyntaxDiagnostics(sourceFile, sourceText, file)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new HonoRouteIndexError(
      "route_indexer.source_syntax_invalid",
      "Hono source contains syntax errors and cannot be indexed.",
      file,
    );
  }

  const routes: IndexedRoute[] = [];
  const nodes: ts.Node[] = [sourceFile];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (node === undefined) {
      continue;
    }
    if (ts.isCallExpression(node)) {
      const route = routeCall(node, sourceFile, file, digest, receivers);
      if (route !== undefined) {
        routes.push(route);
      }
    }
    node.forEachChild((child) => {
      nodes.push(child);
    });
  }
  return routes;
}

function routeCall(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  file: string,
  digest: `sha256:${string}`,
  receivers: ReadonlySet<string>,
): IndexedRoute | undefined {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    receiverState(call.expression.expression, receivers) === "none"
  ) {
    return undefined;
  }
  const state = receiverState(call.expression.expression, receivers);
  const methodText = call.expression.name.text;
  if (
    state === "unsupported" ||
    call.questionDotToken !== undefined ||
    call.expression.questionDotToken !== undefined ||
    ["all", "on", "route"].includes(methodText)
  ) {
    throw new HonoRouteIndexError(
      "route_indexer.composed_receiver_unsupported",
      "Selected Hono receivers may use only direct or chained static get and post calls.",
      file,
    );
  }
  if (methodText !== "get" && methodText !== "post") {
    return undefined;
  }
  const pathArgument = call.arguments[0];
  if (
    pathArgument === undefined ||
    (!ts.isStringLiteral(pathArgument) && !ts.isNoSubstitutionTemplateLiteral(pathArgument))
  ) {
    throw new HonoRouteIndexError(
      "route_indexer.dynamic_path_unsupported",
      `Hono ${methodText.toUpperCase()} route on a selected receiver must use one static string path.`,
      file,
    );
  }
  if (!/^\/[^?#]*$/u.test(pathArgument.text)) {
    throw new HonoRouteIndexError(
      "route_indexer.path_invalid",
      `Hono route path ${JSON.stringify(pathArgument.text)} must be one static absolute path without query or fragment syntax.`,
      file,
    );
  }
  const start = sourceFile.getLineAndCharacterOfPosition(call.expression.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(pathArgument.getEnd());
  return {
    method: methodText === "get" ? "GET" : "POST",
    path: pathArgument.text,
    source: {
      file,
      contentDigest: digest,
      range: {
        start: { line: start.line, character: start.character },
        end: { line: end.line, character: end.character },
      },
    },
  };
}

function receiverState(
  expression: ts.Expression,
  receivers: ReadonlySet<string>,
): "none" | "selected" | "unsupported" {
  if (ts.isIdentifier(expression)) {
    return receivers.has(expression.text) ? "selected" : "none";
  }
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return "none";
  }
  const parentState = receiverState(expression.expression.expression, receivers);
  if (parentState === "none" || parentState === "unsupported") {
    return parentState;
  }
  const method = expression.expression.name.text;
  const routePath = expression.arguments[0];
  return (
    (method === "get" || method === "post") &&
    expression.questionDotToken === undefined &&
    expression.expression.questionDotToken === undefined &&
    routePath !== undefined &&
    (ts.isStringLiteral(routePath) || ts.isNoSubstitutionTemplateLiteral(routePath)) &&
    /^\/[^?#]*$/u.test(routePath.text)
  ) ? "selected" : "unsupported";
}

async function readSource(
  root: string,
  relativePath: string,
): Promise<{ readonly text: string; readonly digest: `sha256:${string}` }> {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (!isWithin(root, absolutePath)) {
    throw new HonoRouteIndexError(
      "route_indexer.source_outside_root",
      "Hono source must stay inside the selected project root.",
      relativePath,
    );
  }
  await assertSafeSourcePath(root, absolutePath, relativePath);
  let handle: FileHandle | undefined;
  try {
    handle = await open(absolutePath, "r");
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxSourceBytes) {
      throw new HonoRouteIndexError(
        "route_indexer.source_size_invalid",
        `Hono source must be a regular file no larger than ${maxSourceBytes} bytes.`,
        relativePath,
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length > maxSourceBytes || !sameIdentity(before, after)) {
      throw new HonoRouteIndexError(
        "route_indexer.source_changed",
        "Hono source changed while it was being indexed.",
        relativePath,
      );
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new HonoRouteIndexError(
        "route_indexer.source_encoding_invalid",
        "Hono source must contain valid UTF-8.",
        relativePath,
      );
    }
    return {
      text,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  } catch (error) {
    if (error instanceof HonoRouteIndexError) {
      throw error;
    }
    throw new HonoRouteIndexError(
      "route_indexer.source_read_failed",
      "Hono source could not be read safely.",
      relativePath,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertSafeSourcePath(
  root: string,
  target: string,
  relativePath: string,
): Promise<void> {
  const relative = path.relative(root, target);
  let current = root;
  const segments = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }
    current = path.join(current, segment);
    let entry;
    try {
      entry = await lstat(current);
    } catch {
      throw new HonoRouteIndexError(
        "route_indexer.source_read_failed",
        "Hono source path could not be inspected.",
        relativePath,
      );
    }
    if (entry.isSymbolicLink()) {
      throw new HonoRouteIndexError(
        "route_indexer.source_symlink_unsupported",
        "Hono source paths must not contain symbolic links.",
        relativePath,
      );
    }
    const final = index === segments.length - 1;
    if ((final && !entry.isFile()) || (!final && !entry.isDirectory())) {
      throw new HonoRouteIndexError(
        "route_indexer.source_type_invalid",
        "Hono source path must contain directories followed by one regular file.",
        relativePath,
      );
    }
  }
}

function normalizeSourcePath(value: string): string {
  if (
    value.length === 0 ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new HonoRouteIndexError(
      "route_indexer.source_not_relative",
      "Hono source paths must be relative to the selected project root.",
      value,
    );
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    !/\.(?:[cm]?[jt]s|[jt]sx)$/u.test(normalized)
  ) {
    throw new HonoRouteIndexError(
      "route_indexer.source_not_canonical",
      "Hono source must be one canonical root-relative JavaScript or TypeScript path.",
      value,
    );
  }
  return normalized;
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

function sourceFileSyntaxDiagnostics(
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

function scriptKind(fileName: string): ts.ScriptKind {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function sameIdentity(before: Stats, after: Stats): boolean {
  return before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
