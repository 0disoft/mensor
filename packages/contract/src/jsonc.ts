import {
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";

import { compareText } from "./compare.js";
import type { ContractIssue, ContractResult, JsonValue } from "./types.js";

const parseOptions = {
  allowEmptyContent: false,
  allowTrailingComma: false,
  disallowComments: false,
} as const;

const maxJsonStructuralDepth = 1_024;

export function parseJsonc(text: string): ContractResult<JsonValue> {
  if (jsonStructuralDepthExceeds(text, maxJsonStructuralDepth)) {
    return {
      ok: false,
      issues: [{
        code: "jsonc.syntax",
        message: `JSONC structural depth exceeds the supported limit of ${maxJsonStructuralDepth}.`,
        offset: 0,
        length: text.length,
      }],
    };
  }
  const parseErrors: ParseError[] = [];
  const root = parseTree(text, parseErrors, parseOptions);
  const syntaxIssues = deduplicateIssues(parseErrors.map(toSyntaxIssue));

  if (root === undefined) {
    return {
      ok: false,
      issues:
        syntaxIssues.length > 0
          ? sortIssues(syntaxIssues)
          : [
              {
                code: "jsonc.empty",
                message: "The JSONC document is empty.",
                offset: 0,
                length: 0,
              },
            ],
    };
  }

  const duplicateIssues = findDuplicateKeyIssues(root);
  const issues = sortIssues([...syntaxIssues, ...duplicateIssues]);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const value: unknown = materializeJsonValue(root);
  if (!isJsonValue(value)) {
    return {
      ok: false,
      issues: [
        {
          code: "jsonc.syntax",
          message: "The parsed document contains a non-JSON value.",
          offset: root.offset,
          length: root.length,
        },
      ],
    };
  }

  return { ok: true, value };
}

function jsonStructuralDepthExceeds(text: string, limit: number): boolean {
  let depth = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (character === "\n" || character === "\r") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      inLineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
    } else if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > limit) {
        return true;
      }
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}

function materializeJsonValue(root: Node): unknown {
  const values = new Map<Node, unknown>();
  const stack: Array<{ node: Node; visited: boolean }> = [
    { node: root, visited: false },
  ];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      continue;
    }
    const { node } = frame;
    if (node.type !== "object" && node.type !== "array") {
      values.set(node, node.value);
      continue;
    }
    if (!frame.visited) {
      stack.push({ node, visited: true });
      const children = node.type === "object"
        ? (node.children ?? []).flatMap((property) => property.children?.[1] ?? [])
        : (node.children ?? []);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) {
          stack.push({ node: child, visited: false });
        }
      }
      continue;
    }
    if (node.type === "array") {
      values.set(node, (node.children ?? []).map((child) => values.get(child)));
      continue;
    }
    const object: Record<string, unknown> = {};
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      if (typeof keyNode?.value === "string" && valueNode !== undefined) {
        Object.defineProperty(object, keyNode.value, {
          configurable: true,
          enumerable: true,
          value: values.get(valueNode),
          writable: true,
        });
      }
    }
    values.set(node, object);
  }
  return values.get(root);
}

export function isJsonValue(value: unknown): value is JsonValue {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      continue;
    }
    if (typeof current === "number") {
      if (Number.isFinite(current)) {
        continue;
      }
      return false;
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (typeof current !== "object") {
      return false;
    }
    const prototype: unknown = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    stack.push(...Object.values(current));
  }
  return true;
}

function toSyntaxIssue(error: ParseError): ContractIssue {
  return {
    code: "jsonc.syntax",
    message: `Invalid JSONC: ${printParseErrorCode(error.error)}.`,
    offset: error.offset,
    length: error.length,
  };
}

function findDuplicateKeyIssues(root: Node): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    visitNode(node, issues, stack);
  }
  return issues;
}

function visitNode(node: Node, issues: ContractIssue[], stack: Node[]): void {
  if (node.type === "object") {
    const seen = new Set<string>();
    const children = node.children ?? [];
    for (const property of children) {
      const keyNode = property.children?.[0];
      if (keyNode?.type !== "string" || typeof keyNode.value !== "string") {
        continue;
      }

      if (seen.has(keyNode.value)) {
        issues.push({
          code: "jsonc.duplicate_key",
          message: `Duplicate object key: ${JSON.stringify(keyNode.value)}.`,
          offset: keyNode.offset,
          length: keyNode.length,
        });
      } else {
        seen.add(keyNode.value);
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const property = children[index];
      const valueNode = property?.children?.[1];
      if (valueNode !== undefined) {
        stack.push(valueNode);
      }
    }
    return;
  }

  if (node.type === "array") {
    const children = node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
}

function sortIssues(issues: readonly ContractIssue[]): ContractIssue[] {
  return [...issues].sort((left, right) => {
    const offsetOrder = (left.offset ?? 0) - (right.offset ?? 0);
    return (
      offsetOrder ||
      (left.length ?? 0) - (right.length ?? 0) ||
      compareText(left.code, right.code) ||
      compareText(left.message, right.message)
    );
  });
}

function deduplicateIssues(
  issues: readonly ContractIssue[],
): ContractIssue[] {
  const unique = new Map<string, ContractIssue>();
  for (const issue of sortIssues(issues)) {
    const key = `${issue.code}\u0000${issue.offset ?? 0}\u0000${issue.length ?? 0}`;
    if (!unique.has(key)) {
      unique.set(key, issue);
    }
  }
  return [...unique.values()];
}
