import ts from "@typescript/typescript6";
import type { SourceRange } from "@0disoft/mensor-contract";
import {
  createContentDigest, serializeFormIndex,
  type DocumentInspection, type DynamicReason, type FormDocumentFact,
  type IndexedControlFact, type IndexedEvidence, type IndexedFormFact,
  type UnsupportedReason,
} from "./form-index.js";
import { InputFailure } from "./paths.js";
import { sourceFileSyntaxDiagnostics } from "./typescript-source.js";

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
type MutableForm = Omit<IndexedFormFact, "controls"> & { controls: IndexedControlFact[] };
type Attribute = { value: string | true; node: ts.JsxAttribute };
type Work = {
  node: ts.Node;
  form?: MutableForm;
  textNames: ReadonlySet<string>;
  uncertainty?: { node: ts.Node; reason: DynamicReason };
};
const inertTags = new Set([
  "div", "span", "p", "ul", "ol", "li", "section", "main", "header", "footer",
  "h1", "h2", "h3", "strong", "em", "small", "br", "hr", "label", "legend",
]);
const booleanAttributes = new Set(["required", "disabled", "checked"]);
const maxSourceBytes = 1_048_576;
const maxNodes = 100_000;

// Internal syntax primitive. The caller must establish Hono renderer activation separately.
export function extractHonoJsxFormDocument(sourcePath: string, source: string): FormDocumentFact {
  const fail = (code: string, message: string): never => {
    throw new InputFailure("configuration", code, message, sourcePath);
  };
  if (!sourcePath.endsWith(".tsx")) fail("hono_jsx.source_kind", "Expected a TSX source path.");
  if (Buffer.byteLength(source) > maxSourceBytes) fail("hono_jsx.source_limit", "JSX source exceeds 1 MiB.");
  if (Buffer.from(source).toString("utf8") !== source) fail("hono_jsx.source_encoding", "Source contains invalid Unicode.");
  const base = {
    path: sourcePath, contentDigest: createContentDigest(source), sourceKind: "mensor/hono-jsx",
  };
  serializeFormIndex({ schemaVersion: 1, producer: { name: "mensor/hono-jsx", version: "0.0.0-internal" },
    documents: [{ ...base, inspection: { state: "complete" }, forms: [] }] });
  let file: ts.SourceFile;
  try {
    file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  } catch (error) {
    if (error instanceof RangeError) fail("hono_jsx.source_limit", "JSX nesting exceeds parser capacity.");
    throw error;
  }
  if (sourceFileSyntaxDiagnostics(file, source, sourcePath).some((entry) => entry.category === ts.DiagnosticCategory.Error)) {
    fail("hono_jsx.syntax_invalid", "JSX source contains syntax errors.");
  }
  const textArrays = literalTextArrays(file, () => fail("hono_jsx.source_limit", "JSX source exceeds the AST node budget."));
  const range = (node: ts.Node): SourceRange => ({
    start: file.getLineAndCharacterOfPosition(node.getStart(file)),
    end: file.getLineAndCharacterOfPosition(node.end),
  });
  const known = <T>(value: T, node: ts.Node): IndexedEvidence<T> => ({ state: "known", value, range: range(node) });
  const forms: MutableForm[] = [];
  let inspection: DocumentInspection = { state: "complete" };
  let firstUnsupportedOffset = Number.POSITIVE_INFINITY;
  const unsupported = (node: ts.Node, reason: DynamicReason | UnsupportedReason): void => {
    const offset = node.getStart(file);
    if (offset < firstUnsupportedOffset) {
      firstUnsupportedOffset = offset;
      inspection = { state: "incomplete", reason, range: range(node) };
    }
  };
  const attributes = (opening: Opening): Map<string, Attribute> => {
    const values = new Map<string, Attribute>();
    for (const attribute of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        unsupported(attribute, "computed-attribute");
        continue;
      }
      const name = attribute.name.getText(file);
      const value = attribute.initializer;
      if (values.has(name) || name !== name.toLowerCase() || /^on/iu.test(name)
        || ["dangerouslysetinnerhtml", "innerhtml"].includes(name)) {
        unsupported(attribute, "custom-helper-semantics");
        continue;
      }
      if (value && !ts.isStringLiteral(value)) {
        unsupported(attribute, "computed-attribute");
        continue;
      }
      if (value && /[&\r\n]/u.test(value.text)) {
        unsupported(attribute, "custom-helper-semantics");
        continue;
      }
      if (!value && !booleanAttributes.has(name)) {
        unsupported(attribute, "computed-attribute");
        continue;
      }
      values.set(name, { value: value?.text ?? true, node: attribute });
    }
    return values;
  };
  const evidence = (attrs: Map<string, Attribute>, name: string): IndexedEvidence<string> => {
    const attr = attrs.get(name);
    return attr && typeof attr.value === "string" ? known(attr.value, attr.node) : { state: "absent" };
  };
  const pending: Work[] = [{ node: file, textNames: new Set() }];
  let visited = 0;
  while (pending.length > 0 && inspection.state === "complete") {
    const current = pending.pop();
    if (!current) break;
    const { node, textNames } = current;
    let form = current.form;
    if (++visited > maxNodes) fail("hono_jsx.source_limit", "JSX source exceeds the AST node budget.");
    if (ts.isJsxExpression(node) && node.expression) {
      const expression = node.expression;
      if (form) {
        unsupported(node, expressionReason(expression));
        continue;
      }
      if (isText(expression, textNames)) continue;
      const map = textMap(expression, textArrays);
      if (map) {
        pending.push({ node: map.body, textNames: new Set([...textNames, map.parameter]) });
      } else {
        unsupported(node, expressionReason(expression));
      }
      continue;
    }
    const opening = ts.isJsxElement(node) ? node.openingElement
      : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening) {
      const tag = opening.tagName.getText(file);
      if (!/^[a-z]+$/u.test(tag)) {
        unsupported(opening, "custom-helper-semantics");
        continue;
      }
      const attrs = attributes(opening);
      if (current.uncertainty && ["form", "input", "button", "select", "textarea"].includes(tag)) {
        unsupported(current.uncertainty.node, current.uncertainty.reason);
      }
      const associated = attrs.get("form");
      if (associated) unsupported(associated.node, "unsupported-control-kind");
      const otherSemantics = attrs.get("multiple") ?? attrs.get("enctype") ?? attrs.get("formenctype");
      if (otherSemantics) unsupported(otherSemantics.node, "unsupported-control-kind");
      if (tag === "form") {
        if (form) {
          unsupported(opening, "unsupported-control-kind");
          continue;
        }
        const action = attrs.get("action");
        const identity = attrs.get("id");
        if (identity?.value === "") unsupported(identity.node, "unsupported-control-kind");
        form = {
          identity: evidence(attrs, "id"), method: evidence(attrs, "method"),
          action: !action || action.value === ""
            ? { state: "current-document", range: range(action?.node ?? opening) }
            : evidence(attrs, "action"),
          range: range(opening), controls: [],
        };
        forms.push(form);
      } else if (tag === "input" || tag === "button") {
        const override = attrs.get("formaction") ?? attrs.get("formmethod");
        const type = attrs.get("type");
        const inputType = type?.value ?? (tag === "input" ? "text" : "submit");
        if (override) unsupported(override.node, "submitter-route-override");
        if (inputType === "file") unsupported(type?.node ?? opening, "file-input");
        const name = attrs.get("name");
        if (tag === "button" && name) unsupported(name.node, "named-submitter");
        if (!form) {
          if (!associated) unsupported(opening, "unsupported-control-kind");
        } else if (!(tag === "button" ? inputType === "submit" : ["text", "email", "radio", "file"].includes(String(inputType)))) {
          unsupported(opening, "unsupported-control-kind");
        } else {
          form.controls.push({
            name: name?.value === "" ? { state: "absent", range: range(name.node) } : evidence(attrs, "name"),
            controlKind: known(tag, opening),
            inputType: evidence(attrs, "type"), multiple: known(false, opening),
            multiplicity: known(inputType === "radio" ? "mutually-exclusive" : "scalar", opening),
            successful: known(tag === "input" && !attrs.has("disabled") && name?.value !== "", opening), range: range(opening),
          });
        }
      } else if (tag === "fieldset" ? attrs.has("disabled") : !inertTags.has(tag)) {
        unsupported(opening, "unsupported-control-kind");
      }
      if (ts.isJsxElement(node)) {
        for (const child of [...node.children].reverse()) pending.push({ ...current, node: child, ...(form ? { form } : {}) });
      }
      continue;
    }
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => { children.push(child); });
    const reason = ts.isConditionalExpression(node) || isConditionalBinary(node) ? "conditional-presence"
      : ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)
        || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isArrayLiteralExpression(node)
        || isMapCall(node) ? "repeated-generation" : undefined;
    const uncertainty = current.uncertainty ?? (reason ? { node, reason } : undefined);
    for (const child of children.reverse()) pending.push({
      ...current, node: child, ...(uncertainty ? { uncertainty } : {}),
    });
  }
  const document = { ...base, inspection, forms: inspection.state === "complete" ? forms : [] };
  serializeFormIndex({ schemaVersion: 1, producer: { name: "mensor/hono-jsx", version: "0.0.0-internal" }, documents: [document] });
  return document;
}

function expressionReason(expression: ts.Expression): DynamicReason {
  if (ts.isConditionalExpression(expression) || isConditionalBinary(expression)) return "conditional-presence";
  if (isMapCall(expression)) return "repeated-generation";
  return "dynamic-interpolation";
}

function isConditionalBinary(node: ts.Node): boolean {
  return ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind);
}

function isMapCall(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "map";
}

function isText(expression: ts.Expression, names: ReadonlySet<string>): boolean {
  return ts.isStringLiteral(expression) || ts.isNumericLiteral(expression)
    || ts.isNoSubstitutionTemplateLiteral(expression)
    || expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword
    || expression.kind === ts.SyntaxKind.NullKeyword
    || (ts.isIdentifier(expression) && names.has(expression.text));
}

// Only a local, otherwise-unused literal text array proves that map children are escaped text.
function textMap(expression: ts.Expression, arrays: ReadonlySet<string>): { body: ts.ConciseBody; parameter: string } | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)
    || expression.expression.name.text !== "map" || expression.arguments.length !== 1) return undefined;
  const receiver = expression.expression.expression;
  const callback = expression.arguments[0];
  if (!callback || !ts.isArrowFunction(callback) || callback.parameters.length !== 1
    || ts.isBlock(callback.body)) return undefined;
  const parameter = callback.parameters[0];
  if (!parameter || !ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) return undefined;
  if (!(ts.isIdentifier(receiver) ? arrays.has(receiver.text)
    : ts.isArrayLiteralExpression(receiver) && receiver.elements.every((node) => isText(node, new Set())))) return undefined;
  let body = callback.body;
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  if (!ts.isJsxElement(body) && !ts.isJsxFragment(body) && !ts.isJsxSelfClosingElement(body)
    && !isText(body, new Set([parameter.name.text]))) return undefined;
  const stack: ts.Node[] = [body];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && ["form", "input", "button", "select", "textarea"].includes(node.tagName.getText())) return undefined;
    ts.forEachChild(node, (child) => { stack.push(child); });
  }
  return { body: callback.body, parameter: parameter.name.text };
}

function literalTextArrays(file: ts.SourceFile, overBudget: () => never): ReadonlySet<string> {
  const counts = new Map<string, number>();
  const stack: ts.Node[] = [file];
  let visited = 0;
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if (++visited > maxNodes) overBudget();
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, (child) => { stack.push(child); });
  }
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && counts.get(declaration.name.text) === 2
        && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)
        && declaration.initializer.elements.every((node) => isText(node, new Set()))) names.add(declaration.name.text);
    }
  }
  return names;
}
