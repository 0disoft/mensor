import { createHash } from "node:crypto";

import type {
  ContentDigest,
  RouteIndex,
  SourcePosition,
  SourceRange,
} from "@0disoft/mensor-contract";

import { compareText, InputFailure } from "./paths.js";
import type { SourceFactIndex } from "./source-fact-index.js";

export interface VerifiedRouteIndex {
  readonly postPaths: readonly string[];
  readonly routeKeys: ReadonlySet<string>;
  readonly value: RouteIndex;
}

export async function verifyRouteIndex(options: {
  readonly routeIndex: RouteIndex;
  readonly discovered: ReadonlySet<string>;
  readonly sourceFacts: SourceFactIndex;
}): Promise<VerifiedRouteIndex> {
  const routesByFile = new Map<string, RouteIndex["routes"][number][]>();
  for (const route of options.routeIndex.routes) {
    const routes = routesByFile.get(route.source.file);
    if (routes === undefined) {
      routesByFile.set(route.source.file, [route]);
    } else {
      routes.push(route);
    }
  }
  for (const file of [...routesByFile.keys()].sort(compareText)) {
    if (!options.discovered.has(file)) {
      throw new InputFailure(
        "configuration",
        "route_index.source_not_discovered",
        `RouteIndex source ${JSON.stringify(file)} is not a discovered source file.`,
        file,
      );
    }
    const source = await options.sourceFacts.source(file);
    const digest = contentDigest(source);
    const lines = source.split(/\r\n|\n|\r/u);
    for (const route of routesByFile.get(file) ?? []) {
      if (digest !== route.source.contentDigest) {
        throw new InputFailure(
          "configuration",
          "route_index.digest_mismatch",
          `RouteIndex source digest does not match ${JSON.stringify(file)}.`,
          file,
        );
      }
      assertRangeWithinLines(route.source.range, lines, file);
    }
  }
  return {
    postPaths: [...new Set(
      options.routeIndex.routes
        .filter((route) => route.method === "POST")
        .map((route) => route.path),
    )].sort(compareText),
    routeKeys: new Set(
      options.routeIndex.routes.map((route) => `${route.method}\u0000${route.path}`),
    ),
    value: options.routeIndex,
  };
}

export function contentDigest(source: string | Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function assertRangeWithinLines(
  range: SourceRange,
  lines: readonly string[],
  file: string,
): void {
  assertPositionWithinSource(range.start, lines, file);
  assertPositionWithinSource(range.end, lines, file);
}

function assertPositionWithinSource(
  position: SourcePosition,
  lines: readonly string[],
  file: string,
): void {
  const line = lines[position.line];
  if (line === undefined || position.character > line.length) {
    throw new InputFailure(
      "configuration",
      "route_index.range_invalid",
      `RouteIndex source range falls outside ${JSON.stringify(file)}.`,
      file,
    );
  }
}
