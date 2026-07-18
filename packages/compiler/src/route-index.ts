import { createHash } from "node:crypto";

import type {
  ContentDigest,
  RouteIndex,
  SourcePosition,
  SourceRange,
} from "@mensor/contract";

import { InputFailure } from "./paths.js";
import type { SourceFactIndex } from "./source-fact-index.js";

export async function verifyRouteIndex(options: {
  readonly routeIndex: RouteIndex;
  readonly discovered: ReadonlySet<string>;
  readonly sourceFacts: SourceFactIndex;
}): Promise<RouteIndex> {
  for (const route of options.routeIndex.routes) {
    const file = route.source.file;
    if (!options.discovered.has(file)) {
      throw new InputFailure(
        "configuration",
        "route_index.source_not_discovered",
        `RouteIndex source ${JSON.stringify(file)} is not a discovered source file.`,
        file,
      );
    }
    const source = await options.sourceFacts.source(file);
    if (contentDigest(source) !== route.source.contentDigest) {
      throw new InputFailure(
        "configuration",
        "route_index.digest_mismatch",
        `RouteIndex source digest does not match ${JSON.stringify(file)}.`,
        file,
      );
    }
    assertRangeWithinSource(route.source.range, source, file);
  }
  return options.routeIndex;
}

export function contentDigest(source: string | Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function assertRangeWithinSource(
  range: SourceRange,
  source: string,
  file: string,
): void {
  const lines = source.split(/\r\n|\n|\r/u);
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
