import * as path from "node:path";

import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
} from "./paths.js";
import { extractModuleFact } from "./typescript-source.js";

const exportNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

export interface DraftHandlerCandidate {
  readonly export: string;
  readonly file: string;
}

export async function discoverAndSelectHandler(
  featureFiles: readonly string[],
  readSource: (file: string) => Promise<string>,
  requested: { readonly file: string; readonly export: string } | undefined,
): Promise<DraftHandlerCandidate> {
  const candidates: DraftHandlerCandidate[] = [];
  const syntaxErrors = new Map<string, string>();
  for (const file of featureFiles.filter((entry) =>
    sourceExtensions.has(path.posix.extname(entry)),
  )) {
    const fact = extractModuleFact(await readSource(file), file);
    const firstError = fact.syntaxErrors[0];
    if (firstError !== undefined) {
      syntaxErrors.set(file, firstError);
      continue;
    }
    for (const exported of fact.exports) {
      if (
        exported.kind === "value" &&
        exported.name !== "default" &&
        exportNamePattern.test(exported.name)
      ) {
        candidates.push({ file, export: exported.name });
      }
    }
  }
  candidates.sort((left, right) =>
    compareText(left.file, right.file) || compareText(left.export, right.export),
  );

  if (requested !== undefined) {
    const file = assertRelativePosixPath(requested.file, "handler file");
    const syntaxError = syntaxErrors.get(file);
    if (syntaxError !== undefined) {
      throw new InputFailure(
        "configuration",
        "typescript.syntax_invalid",
        `Source ${JSON.stringify(file)} contains unsupported syntax: ${syntaxError}`,
        file,
      );
    }
    const candidate = candidates.find((entry) =>
      entry.file === file && entry.export === requested.export,
    );
    if (candidate === undefined) {
      throw new InputFailure(
        "configuration",
        "init.handler_not_found",
        `No explicit runtime export ${JSON.stringify(`${file}#${requested.export}`)} was discovered under featureRoot.`,
        file,
      );
    }
    return candidate;
  }
  if (candidates.length === 1 && candidates[0] !== undefined) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw new InputFailure(
      "configuration",
      "init.handler_not_found",
      "No explicit named runtime export was discovered under featureRoot.",
    );
  }
  throw new InputFailure(
    "configuration",
    "init.handler_ambiguous",
    `Multiple runtime exports were discovered: ${formatCandidates(candidates)}. Select one with --handler-file and --handler-export.`,
  );
}

function formatCandidates(candidates: readonly DraftHandlerCandidate[]): string {
  const visible = candidates.slice(0, 8).map((candidate) =>
    JSON.stringify(`${candidate.file}#${candidate.export}`),
  );
  const suffix = candidates.length > visible.length
    ? `, and ${candidates.length - visible.length} more`
    : "";
  return `${visible.join(", ")}${suffix}`;
}
