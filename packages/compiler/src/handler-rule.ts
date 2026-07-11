import * as path from "node:path";

import type {
  Diagnostic,
  FeatureContract,
  HandlerExportMissingDiagnostic,
} from "@mensor/contract";

import { readProjectFile } from "./filesystem.js";
import { handlerExportRange } from "./locations.js";
import {
  assertRelativePosixPath,
  InputFailure,
  joinProjectPath,
} from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

export async function checkFeatureHandlers(options: {
  readonly root: string;
  readonly featureContractPath: string;
  readonly featureText: string;
  readonly feature: FeatureContract;
  readonly discovered: ReadonlySet<string>;
  readonly maxFileBytes: number;
}): Promise<readonly Diagnostic[]> {
  const featureRoot = path.posix.dirname(options.featureContractPath);
  const moduleCache = new Map<string, ModuleFact>();
  const diagnostics: HandlerExportMissingDiagnostic[] = [];

  for (let actionIndex = 0; actionIndex < options.feature.actions.length; actionIndex += 1) {
    const action = options.feature.actions[actionIndex];
    if (action === undefined) {
      continue;
    }
    const handlerFile = assertRelativePosixPath(action.handler.file, "handler file");
    const projectFile = joinProjectPath(featureRoot, handlerFile);
    if (!options.discovered.has(projectFile)) {
      continue;
    }
    let module = moduleCache.get(projectFile);
    if (module === undefined) {
      const sourceText = await readProjectFile(
        options.root,
        projectFile,
        options.maxFileBytes,
      );
      module = extractModuleFact(sourceText, projectFile);
      moduleCache.set(projectFile, module);
    }
    if (module.syntaxErrors.length > 0) {
      throw new InputFailure(
        "configuration",
        "typescript.syntax_invalid",
        `Handler source ${JSON.stringify(projectFile)} contains unsupported syntax: ${module.syntaxErrors[0]}`,
        projectFile,
      );
    }
    if (module.exports.some((entry) => entry.name === action.handler.export)) {
      continue;
    }
    if (module.hasExportStar) {
      throw new InputFailure(
        "configuration",
        "typescript.export_star_unsupported",
        `Handler source ${JSON.stringify(projectFile)} must explicitly re-export ${JSON.stringify(action.handler.export)} instead of relying on export *.`,
        projectFile,
      );
    }
    diagnostics.push(
      missingExportDiagnostic({
        actionId: action.id,
        actionIndex,
        exportName: action.handler.export,
        handlerFile,
        projectFile,
        featureContractPath: options.featureContractPath,
        featureText: options.featureText,
      }),
    );
  }
  return diagnostics;
}

function missingExportDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly exportName: string;
  readonly handlerFile: string;
  readonly projectFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): HandlerExportMissingDiagnostic {
  return {
    code: "handler.export_missing",
    severity: "error",
    category: "project-structure",
    message: `Handler file ${JSON.stringify(options.handlerFile)} does not export ${JSON.stringify(options.exportName)}.`,
    file: options.projectFile,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    facts: {
      actionId: options.actionId,
      exportName: options.exportName,
      handlerFile: options.handlerFile,
    },
    related: [
      {
        role: "handler-export-declaration",
        message: "The action contract requires this named export.",
        file: options.featureContractPath,
        range: handlerExportRange(options.featureText, options.actionIndex),
      },
    ],
    repair: {
      strategy: "export-declared-handler",
      hint: `Export ${options.exportName} from ${options.handlerFile}.`,
      mustPreserve: [
        `action ${options.actionId}`,
        `handler file ${options.handlerFile}`,
        `handler export ${options.exportName}`,
      ],
      mustNot: [
        "change the contract to an unrelated export",
        "execute the handler during checking",
      ],
    },
  };
}
