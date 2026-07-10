import {
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";

import type { ContractIssue, ContractResult, JsonValue } from "./types.js";

const parseOptions = {
  allowEmptyContent: false,
  allowTrailingComma: false,
  disallowComments: false,
} as const;

export function parseJsonc(text: string): ContractResult<JsonValue> {
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

  const value: unknown = getNodeValue(root);
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

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value !== "object") {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
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
  visitNode(root, issues);
  return issues;
}

function visitNode(node: Node, issues: ContractIssue[]): void {
  if (node.type === "object") {
    const seen = new Set<string>();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
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

      if (valueNode !== undefined) {
        visitNode(valueNode, issues);
      }
    }
    return;
  }

  if (node.type === "array") {
    for (const child of node.children ?? []) {
      visitNode(child, issues);
    }
  }
}

function sortIssues(issues: readonly ContractIssue[]): ContractIssue[] {
  return [...issues].sort((left, right) => {
    const offsetOrder = (left.offset ?? 0) - (right.offset ?? 0);
    return (
      offsetOrder ||
      (left.length ?? 0) - (right.length ?? 0) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message)
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
