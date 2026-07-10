import {
  findNodeAtLocation,
  parseTree,
  type Node,
} from "jsonc-parser";

import type { SourcePosition, SourceRange } from "@mensor/contract";

const zeroRange: SourceRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

export function handlerFileRange(
  contractText: string,
  actionIndex: number,
): SourceRange {
  const root = parseTree(contractText);
  if (root === undefined) {
    return zeroRange;
  }
  const node = findNodeAtLocation(root, ["actions", actionIndex, "handler", "file"]);
  return node === undefined ? zeroRange : nodeRange(contractText, node);
}

export function actionSchemaPropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: string,
): SourceRange {
  const root = parseTree(contractText);
  if (root === undefined) {
    return zeroRange;
  }
  const properties = findNodeAtLocation(root, [
    "actions",
    actionIndex,
    "input",
    "schema",
    "properties",
  ]);
  if (properties?.type !== "object") {
    return zeroRange;
  }
  for (const property of properties.children ?? []) {
    const key = property.children?.[0];
    if (key?.type === "string" && key.value === propertyName) {
      return nodeRange(contractText, key);
    }
  }
  return zeroRange;
}

export function actionFormCodecPropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: string,
): SourceRange {
  const root = parseTree(contractText);
  if (root === undefined) {
    return zeroRange;
  }
  const node = findNodeAtLocation(root, [
    "actions",
    actionIndex,
    "input",
    "formCodec",
    propertyName,
  ]);
  return node === undefined ? zeroRange : nodeRange(contractText, node);
}

function nodeRange(text: string, node: Node): SourceRange {
  return {
    start: positionAt(text, node.offset),
    end: positionAt(text, node.offset + node.length),
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
