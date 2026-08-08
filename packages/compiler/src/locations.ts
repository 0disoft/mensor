import {
  findNodeAtLocation,
  parseTree,
  type Node,
} from "jsonc-parser";

import type { SourcePosition, SourceRange } from "@0disoft/mensor-contract";

const zeroRange: SourceRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

export interface ContractLocator {
  readonly lineStarts: readonly number[];
  readonly root: Node | undefined;
  readonly text: string;
}

const locatorCache = new Map<string, ContractLocator>();
const maxCachedLocators = 16;

export function contractLocatorFor(text: string): ContractLocator {
  const cached = locatorCache.get(text);
  if (cached !== undefined) {
    locatorCache.delete(text);
    locatorCache.set(text, cached);
    return cached;
  }
  const locator = {
    lineStarts: lineStartsFor(text),
    root: parseTree(text),
    text,
  };
  locatorCache.set(text, locator);
  if (locatorCache.size > maxCachedLocators) {
    const oldest = locatorCache.keys().next().value;
    if (oldest !== undefined) {
      locatorCache.delete(oldest);
    }
  }
  return locator;
}

export function handlerFileRange(
  contractText: string,
  actionIndex: number,
): SourceRange {
  return rangeAt(contractText, ["actions", actionIndex, "handler", "file"]);
}

export function handlerExportRange(
  contractText: string,
  actionIndex: number,
): SourceRange {
  return rangeAt(contractText, [
    "actions",
    actionIndex,
    "handler",
    "export",
  ]);
}

export function actionSchemaPropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: string,
): SourceRange {
  const locator = contractLocatorFor(contractText);
  if (locator.root === undefined) {
    return zeroRange;
  }
  const properties = findNodeAtLocation(locator.root, [
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
      return nodeRange(locator, key);
    }
  }
  return zeroRange;
}

export function actionFormCodecPropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: string,
): SourceRange {
  return rangeAt(contractText, [
    "actions",
    actionIndex,
    "input",
    "formCodec",
    propertyName,
  ]);
}

export function actionRoutePropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: "method" | "path",
): SourceRange {
  return rangeAt(contractText, [
    "actions",
    actionIndex,
    "route",
    propertyName,
  ]);
}

export function actionFormPropertyRange(
  contractText: string,
  actionIndex: number,
  propertyName: "documentPath" | "id" | "template",
): SourceRange {
  return rangeAt(contractText, [
    "actions",
    actionIndex,
    "form",
    propertyName,
  ]);
}

export function actionBindingDecoderKindRange(
  contractText: string,
  actionIndex: number,
  bindingIndex: number,
): SourceRange {
  return rangeAt(contractText, [
    "actions",
    actionIndex,
    "input",
    "formCodec",
    "bindings",
    bindingIndex,
    "decode",
    "kind",
  ]);
}

export function projectBoundaryRange(
  contractText: string,
  boundaryIndex: number,
): SourceRange {
  return rangeAt(contractText, ["boundaries", boundaryIndex]);
}

export function projectOwnershipRuleRange(
  contractText: string,
  ruleIndex: number,
): SourceRange {
  return rangeAt(contractText, ["ownershipRules", ruleIndex]);
}

export function projectRouteIndexRange(contractText: string): SourceRange {
  return rangeAt(contractText, ["routeIndex"]);
}

function rangeAt(
  text: string,
  path: (string | number)[],
): SourceRange {
  const locator = contractLocatorFor(text);
  if (locator.root === undefined) {
    return zeroRange;
  }
  const node = findNodeAtLocation(locator.root, path);
  return node === undefined ? zeroRange : nodeRange(locator, node);
}

function nodeRange(locator: ContractLocator, node: Node): SourceRange {
  return {
    start: positionAt(locator, node.offset),
    end: positionAt(locator, node.offset + node.length),
  };
}

function positionAt(locator: ContractLocator, offset: number): SourcePosition {
  let low = 0;
  let high = locator.lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = locator.lineStarts[middle];
    if (lineStart !== undefined && lineStart <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const line = Math.max(0, low - 1);
  return {
    line,
    character: offset - (locator.lineStarts[line] ?? 0),
  };
}

function lineStartsFor(text: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (code === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}
