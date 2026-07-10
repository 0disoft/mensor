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
