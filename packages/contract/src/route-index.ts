import { parseJsonc } from "./jsonc.js";
import { schemaIssues, validateRouteIndex } from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  IndexedRoute,
  RouteIndex,
  SourcePosition,
  SourceRange,
} from "./types.js";

const windowsReservedName = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function parseRouteIndex(text: string): ContractResult<RouteIndex> {
  const parsed = parseJsonc(text);
  if (!parsed.ok) {
    return parsed;
  }
  if (!validateRouteIndex(parsed.value)) {
    return { ok: false, issues: schemaIssues(validateRouteIndex) };
  }

  const issues = routeIndexSemanticIssues(parsed.value);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const canonical = canonicalRouteIndex(parsed.value);
  if (serializeRouteIndex(canonical) !== text) {
    return {
      ok: false,
      issues: [semanticIssue("", "RouteIndex must use canonical JSON encoding.")],
    };
  }
  return { ok: true, value: canonical };
}

export function serializeRouteIndex(value: unknown): string {
  if (!validateRouteIndex(value)) {
    const issue = schemaIssues(validateRouteIndex)[0];
    throw new TypeError(
      `RouteIndex cannot be serialized: ${issue?.message ?? "schema validation failed"}`,
    );
  }
  const issues = routeIndexSemanticIssues(value);
  if (issues.length > 0) {
    throw new TypeError(`RouteIndex cannot be serialized: ${issues[0]?.message}`);
  }
  return `${JSON.stringify(canonicalRouteIndex(value), null, 2)}\n`;
}

function canonicalRouteIndex(value: RouteIndex): RouteIndex {
  return {
    schemaVersion: 1,
    producer: {
      name: value.producer.name,
      version: value.producer.version,
    },
    routes: [...value.routes]
      .sort(compareRoutes)
      .map((route) => ({
        method: route.method,
        path: route.path,
        source: {
          file: route.source.file,
          contentDigest: route.source.contentDigest,
          range: {
            start: {
              line: route.source.range.start.line,
              character: route.source.range.start.character,
            },
            end: {
              line: route.source.range.end.line,
              character: route.source.range.end.character,
            },
          },
        },
      })),
  };
}

function routeIndexSemanticIssues(value: RouteIndex): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const routeKeys = new Set<string>();
  value.routes.forEach((route, index) => {
    if (!portableSourcePath(route.source.file)) {
      issues.push(semanticIssue(
        `/routes/${index}/source/file`,
        "Route source file must be a portable project-relative POSIX path.",
      ));
    }
    if (!rangeIsOrdered(route.source.range)) {
      issues.push(semanticIssue(
        `/routes/${index}/source/range`,
        "Route source range start must not follow its end.",
      ));
    }
    const key = `${route.method}\u0000${route.path}`;
    if (routeKeys.has(key)) {
      issues.push(semanticIssue(
        `/routes/${index}`,
        "Route method and path pairs must be unique.",
      ));
    }
    routeKeys.add(key);
  });
  return issues;
}

function portableSourcePath(value: string): boolean {
  return value.split("/").every((segment) =>
    segment.length > 0
    && segment !== "."
    && segment !== ".."
    && !segment.includes(":")
    && !segment.endsWith(".")
    && !segment.endsWith(" ")
    && !windowsReservedName.test(segment)
  );
}

function compareRoutes(left: IndexedRoute, right: IndexedRoute): number {
  return compareText(left.method, right.method)
    || compareText(left.path, right.path)
    || compareText(left.source.file, right.source.file)
    || compareRanges(left.source.range, right.source.range);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRanges(left: SourceRange, right: SourceRange): number {
  return comparePositions(left.start, right.start)
    || comparePositions(left.end, right.end);
}

function comparePositions(left: SourcePosition, right: SourcePosition): number {
  return left.line - right.line || left.character - right.character;
}

function rangeIsOrdered(range: SourceRange): boolean {
  return comparePositions(range.start, range.end) <= 0;
}

function semanticIssue(instancePath: string, message: string): ContractIssue {
  return {
    code: "schema.violation",
    message,
    instancePath,
    schemaPath: "#/$semantic",
    keyword: "semantic",
  };
}
