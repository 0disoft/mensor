import { parseJsonc } from "@0disoft/mensor-contract";
import ts from "@typescript/typescript6";
import { TypeScriptTemplateFormIndexError } from "./template-source.js";

const rendererTags = new Set(["html", "head", "body", "meta", "title", "link", "div", "span", "main", "section", "header", "footer"]);

export function assertHonoJsxConfiguration(file: string, source: string): void {
  const result = parseJsonc(source);
  if (!result.ok || !isObject(result.value)) invalid(file, "Expected an unambiguous JSONC JSX configuration.");
  const value = result.value;
  const options = value["compilerOptions"];
  if (value["extends"] !== undefined || value["references"] !== undefined || !isObject(options)
    || !["react-jsx", "react-jsxdev"].includes(String(options["jsx"]))
    || options["jsxImportSource"] !== "hono/jsx"
    || ["jsxFactory", "jsxFragmentFactory", "reactNamespace", "plugins", "paths", "baseUrl"].some((key) => options[key] !== undefined)) {
    invalid(file, "Select a standalone automatic-JSX configuration with jsxImportSource hono/jsx and no inherited or custom transform settings.", "configuration_unsupported");
  }
}

export function assertHonoJsxBuild(file: string, source: string): void {
  const parsed = parseSource(file, source);
  const define = importedName(parsed, "vite", "defineConfig");
  const plugin = parsed.statements.find((node): node is ts.ImportDeclaration =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text === "honox/vite" && !node.importClause?.isTypeOnly);
  const exported = parsed.statements.find(ts.isExportAssignment);
  if (!define || !plugin?.importClause?.name || parsed.statements.length !== 3
    || !exported || exported.isExportEquals || !ts.isCallExpression(exported.expression)
    || !ts.isIdentifier(exported.expression.expression) || exported.expression.expression.text !== define
    || exported.expression.arguments.length !== 1) invalid(file, "Build configuration must directly export defineConfig with only the Vite and HonoX imports.");
  const config = objectProperties(exported.expression.arguments[0], file);
  if ([...config.keys()].some((key) => !["plugins", "esbuild", "build"].includes(key))) invalid(file, "Unsupported build override.");
  const plugins = config.get("plugins");
  const entry = plugins && ts.isArrayLiteralExpression(plugins) ? plugins.elements[0] : undefined;
  if (!plugins || !ts.isArrayLiteralExpression(plugins) || plugins.elements.length !== 1
    || !entry || !ts.isCallExpression(entry) || !ts.isIdentifier(entry.expression)
    || entry.expression.text !== plugin.importClause.name.text || entry.arguments.length !== 0) {
    invalid(file, "Build must activate only the default honox() plugin without options.", "build_plugin_unsupported", plugins ?? parsed);
  }
  const jsx = objectProperties(config.get("esbuild"), file);
  if (jsx.size !== 2 || literal(jsx.get("jsx")) !== "automatic" || literal(jsx.get("jsxImportSource")) !== "hono/jsx") {
    invalid(file, "Build JSX settings must explicitly select automatic hono/jsx.", "runtime_mismatch", config.get("esbuild") ?? parsed);
  }
  const build = config.get("build");
  if (build) assertStaticBuild(build, file);
}

function objectProperties(node: ts.Node | undefined, file: string): Map<string, ts.Expression> {
  if (!node || !ts.isObjectLiteralExpression(node)) invalid(file, "Expected static configuration properties.");
  const result = new Map<string, ts.Expression>();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      || result.has(property.name.text)) invalid(file, "Computed, spread, duplicate or shorthand settings are unsupported.");
    result.set(property.name.text, property.initializer);
  }
  return result;
}

function literal(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteral(node) ? node.text : undefined;
}

function assertStaticBuild(node: ts.Node, file: string): void {
  const properties = objectProperties(node, file);
  const allowed = new Set(["outDir", "emptyOutDir", "ssr"]);
  for (const [key, value] of properties) {
    if (key === "rollupOptions") {
      const rollup = objectProperties(value, file);
      if (rollup.size !== 1 || !rollup.has("output")) invalid(file, "Only static Rollup output filenames are supported.", "build_settings_unsupported", value);
      const output = objectProperties(rollup.get("output"), file);
      for (const [name, setting] of output) {
        if (!["entryFileNames", "chunkFileNames", "assetFileNames"].includes(name) || !ts.isStringLiteral(setting)) {
          invalid(file, "Rollup output accepts only literal entryFileNames, chunkFileNames and assetFileNames.", "build_settings_unsupported", setting);
        }
      }
      continue;
    }
    if (!allowed.has(key) || (!ts.isStringLiteral(value) && value.kind !== ts.SyntaxKind.TrueKeyword
      && value.kind !== ts.SyntaxKind.FalseKeyword)) invalid(file, "Custom bundler transforms and build settings are unsupported.", "build_settings_unsupported", value);
  }
}

export function assertHonoJsxRoute(file: string, source: string): void {
  const parsed = parseSource(file, source);
  const factory = importedName(parsed, "honox/factory", "createRoute");
  const exported = parsed.statements.find(ts.isExportAssignment);
  if (!factory || !exported || exported.isExportEquals || !ts.isCallExpression(exported.expression)
    || !ts.isIdentifier(exported.expression.expression) || exported.expression.expression.text !== factory
    || exported.expression.arguments.length !== 1) {
    invalid(file, "Each selected route must directly default-export createRoute imported from honox/factory.");
  }
  const handler = exported.expression.arguments[0];
  if (!handler || !ts.isArrowFunction(handler) || handler.modifiers?.length || handler.parameters.length !== 1
    || !ts.isIdentifier(handler.parameters[0]!.name) || handler.parameters[0]!.initializer) {
    invalid(file, "Route must use one synchronous context callback without middleware.");
  }
  let body: ts.Node = handler.body;
  if (ts.isBlock(body)) {
    const returned = body.statements[0];
    if (body.statements.length !== 1 || !returned || !ts.isReturnStatement(returned) || !returned.expression) {
      invalid(file, "Route callback must directly return context.render(JSX); preceding statements may change rendering and cannot be ignored.", "route_prelude_unsupported", returned ?? body);
    }
    body = returned.expression;
  }
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  if (!ts.isCallExpression(body) || body.questionDotToken || !ts.isPropertyAccessExpression(body.expression)
    || body.expression.questionDotToken || !ts.isIdentifier(body.expression.expression)
    || body.expression.expression.text !== handler.parameters[0]!.name.text
    || body.expression.name.text !== "render" || body.arguments.length !== 1) {
    invalid(file, "Route callback must directly return context.render(JSX).");
  }
  let rendered: ts.Node = body.arguments[0]!;
  while (ts.isParenthesizedExpression(rendered)) rendered = rendered.expression;
  if (!ts.isJsxElement(rendered) && !ts.isJsxFragment(rendered) && !ts.isJsxSelfClosingElement(rendered)) {
    invalid(file, "Route render argument must be direct JSX, not a variable or helper result.");
  }
  const pending: ts.Node[] = [parsed];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || node === rendered) continue;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) {
      invalid(file, "JSX outside the selected route render argument is unsupported.");
    }
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
}

export function assertHonoJsxRenderer(file: string, source: string): void {
  const parsed = parseSource(file, source);
  const factory = importedName(parsed, "hono/jsx-renderer", "jsxRenderer");
  const statements = parsed.statements.filter((node) => !ts.isEmptyStatement(node));
  const exported = statements.find(ts.isExportAssignment);
  if (!factory || statements.length !== 2 || !exported || exported.isExportEquals
    || !ts.isCallExpression(exported.expression) || !ts.isIdentifier(exported.expression.expression)
    || exported.expression.expression.text !== factory || exported.expression.arguments.length !== 1) {
    invalid(file, "Renderer must contain only the Hono jsxRenderer import and one direct default factory call.");
  }
  const callback = exported.expression.arguments[0];
  if (!callback || !ts.isArrowFunction(callback) || callback.parameters.length !== 1 || callback.modifiers?.length) {
    invalid(file, "Renderer must use one synchronous children callback.");
  }
  const parameter = callback.parameters[0];
  if (!parameter || !ts.isObjectBindingPattern(parameter.name) || parameter.name.elements.length !== 1 || parameter.initializer) {
    invalid(file, "Renderer must receive only the children slot.");
  }
  const binding = parameter.name.elements[0];
  if (!binding || !ts.isIdentifier(binding.name) || binding.name.text !== "children"
    || binding.propertyName || binding.initializer || binding.dotDotDotToken) invalid(file, "Renderer children binding is unsupported.");
  let body: ts.Node = callback.body;
  if (ts.isBlock(body)) {
    const returned = body.statements[0];
    if (body.statements.length !== 1 || !returned || !ts.isReturnStatement(returned) || !returned.expression) {
      invalid(file, "Renderer may only return a transparent JSX wrapper.");
    }
    body = returned.expression;
  }
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  if (!ts.isJsxElement(body) && !ts.isJsxFragment(body)) invalid(file, "Renderer must return intrinsic JSX.");
  let slots = 0;
  const pending: ts.Node[] = [body];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) break;
    if (ts.isJsxExpression(node) && node.expression) {
      if (!ts.isIdentifier(node.expression) || node.expression.text !== "children") invalid(file, "Renderer contains dynamic content other than children.");
      for (let parent: ts.Node | undefined = node.parent; parent && parent !== callback; parent = parent.parent) {
        if (ts.isJsxElement(parent) && ["head", "title", "meta", "link"].includes(parent.openingElement.tagName.getText(parsed))) {
          invalid(file, "Renderer children must remain in body-content wrappers.");
        }
      }
      slots += 1;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!rendererTags.has(node.tagName.getText(parsed))) invalid(file, "Renderer contains a custom or form-bearing element.");
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute) || !attribute.initializer || !ts.isStringLiteral(attribute.initializer)
          || /^on|innerhtml|dangerously|^children$/iu.test(attribute.name.getText(parsed))) invalid(file, "Renderer attributes must be static and cannot attach behavior.");
      }
    }
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
  if (slots !== 1) invalid(file, "Renderer must preserve exactly one children slot.");
}

function parseSource(file: string, source: string): ts.SourceFile {
  let parsed: ts.SourceFile;
  try {
    parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  } catch {
    invalid(file, "Renderer activation source could not be parsed within supported limits.");
  }
  const diagnostics = (parsed as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics === undefined || diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error)) {
    invalid(file, "Renderer activation source contains syntax errors.");
  }
  const pending: ts.Node[] = [parsed];
  let count = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) break;
    if (++count > 100_000) invalid(file, "Renderer activation source exceeds the AST budget.");
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
  const prologue = source.slice(0, parsed.statements[0]?.getStart(parsed) ?? source.length);
  for (const match of prologue.matchAll(/@(jsxImportSource|jsxRuntime|jsxFrag|jsx)\s+([^\s*]+)/gu)) {
    if (!((match[1] === "jsxImportSource" && match[2] === "hono/jsx")
      || (match[1] === "jsxRuntime" && match[2] === "automatic"))) invalid(file, "JSX pragmas conflict with the selected Hono runtime.", "runtime_mismatch", parsed);
  }
  return parsed;
}

function importedName(file: ts.SourceFile, moduleName: string, exported: string): string | undefined {
  const matches: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleName || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && (element.propertyName ?? element.name).text === exported) matches.push(element.name.text);
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(file: string, message: string, reason = "activation_invalid", node?: ts.Node): never {
  const location = node ? node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()) : undefined;
  const prefix = location ? `Line ${location.line + 1}, column ${location.character + 1}: ` : "";
  throw new TypeScriptTemplateFormIndexError(`hono_jsx.${reason}`, prefix + message, file);
}
