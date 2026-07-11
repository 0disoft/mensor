import * as path from "node:path";

import {
  parseFeatureContract,
  parseProjectContract,
  type ContractIssue,
  type Diagnostic,
  type DiagnosticReport,
  type FeatureContract,
  type FileRoleContract,
} from "@mensor/contract";

import {
  assertProjectRoot,
  discoverProjectFiles,
  readProjectFile,
} from "./filesystem.js";
import { checkFeatureForms } from "./form-rule.js";
import { checkFeatureHandlers } from "./handler-rule.js";
import { handlerFileRange } from "./locations.js";
import { checkImportBoundaries } from "./module-boundary-rule.js";
import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
  joinProjectPath,
} from "./paths.js";
import type {
  CheckProjectOptions,
  CheckProjectResult,
  CompilerFailure,
} from "./types.js";

const defaultConfigFile = "mensor.project.jsonc";
const defaultMaxFiles = 10_000;
const defaultMaxFileBytes = 1_048_576;
const defaultProducerVersion = "0.0.0";

export async function checkProject(
  options: CheckProjectOptions,
): Promise<CheckProjectResult> {
  try {
    const producerVersion = options.producerVersion ?? defaultProducerVersion;
    if (producerVersion.length === 0) {
      return failure({
        kind: "configuration",
        code: "producer.version_invalid",
        message: "producerVersion must not be empty.",
      });
    }
    const maxFiles = options.limits?.maxFiles ?? defaultMaxFiles;
    const maxFileBytes = options.limits?.maxFileBytes ?? defaultMaxFileBytes;
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) {
      return failure({
        kind: "configuration",
        code: "limits.max_files_invalid",
        message: "limits.maxFiles must be a positive safe integer.",
      });
    }
    if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) {
      return failure({
        kind: "configuration",
        code: "limits.max_file_bytes_invalid",
        message: "limits.maxFileBytes must be a positive safe integer.",
      });
    }
    const root = await assertProjectRoot(options.root);
    const configFile = assertRelativePosixPath(
      options.configFile ?? defaultConfigFile,
      "configFile",
    );
    const projectText = await readProjectFile(root, configFile, maxFileBytes);
    const projectResult = parseProjectContract(projectText);
    if (!projectResult.ok) {
      return contractFailure(configFile, projectResult.issues);
    }

    const project = projectResult.value;
    validateFileRoles(project.fileRoles);
    const discoveredFiles = await discoverProjectFiles(
      root,
      project.sourceRoot,
      maxFiles,
    );
    const discovered = new Set(discoveredFiles);
    const diagnostics: Diagnostic[] = [];

    for (const featureContractPath of [...project.featureContracts].sort(compareText)) {
      const safeFeatureContractPath = assertRelativePosixPath(
        featureContractPath,
        "feature contract path",
      );
      if (!discovered.has(safeFeatureContractPath)) {
        throw new InputFailure(
          "configuration",
          "feature_contract.not_discovered",
          `Feature contract ${JSON.stringify(safeFeatureContractPath)} is not a discovered source file.`,
          safeFeatureContractPath,
        );
      }
      const featureText = await readProjectFile(
        root,
        safeFeatureContractPath,
        maxFileBytes,
      );
      const featureResult = parseFeatureContract(featureText);
      if (!featureResult.ok) {
        return contractFailure(safeFeatureContractPath, featureResult.issues);
      }
      diagnostics.push(
        ...checkFeaturePlacement(
          safeFeatureContractPath,
          featureText,
          featureResult.value,
          project.fileRoles,
          discovered,
        ),
      );
      diagnostics.push(
        ...(await checkFeatureHandlers({
          root,
          featureContractPath: safeFeatureContractPath,
          featureText,
          feature: featureResult.value,
          discovered,
          maxFileBytes,
        })),
      );
      diagnostics.push(
        ...(await checkFeatureForms({
          root,
          featureContractPath: safeFeatureContractPath,
          featureText,
          feature: featureResult.value,
          discovered,
          maxFileBytes,
        })),
      );
    }

    diagnostics.push(
      ...(await checkImportBoundaries({
        root,
        projectContractPath: configFile,
        projectText,
        featureContractPaths: project.featureContracts,
        fileRoles: project.fileRoles,
        boundaries: project.boundaries ?? [],
        discoveredFiles,
        maxFileBytes,
      })),
    );

    diagnostics.sort(compareDiagnostics);
    return {
      ok: true,
      report: createReport(
        producerVersion,
        diagnostics,
      ),
    };
  } catch (error) {
    if (error instanceof InputFailure) {
      return failure({
        kind: error.kind,
        code: error.code,
        message: error.message,
        ...(error.file === undefined ? {} : { file: error.file }),
      });
    }
    return failure({
      kind: "internal",
      code: "compiler.unexpected_failure",
      message: "The compiler failed unexpectedly.",
    });
  }
}

function checkFeaturePlacement(
  featureContractPath: string,
  featureText: string,
  feature: FeatureContract,
  fileRoles: readonly FileRoleContract[],
  discovered: ReadonlySet<string>,
): readonly Diagnostic[] {
  const featureRoot = path.posix.dirname(featureContractPath);
  const diagnostics: Diagnostic[] = [];

  feature.actions.forEach((action, actionIndex) => {
    const handlerFile = assertRelativePosixPath(action.handler.file, "handler file");
    const projectFile = joinProjectPath(featureRoot, handlerFile);
    if (!discovered.has(projectFile)) {
      throw new InputFailure(
        "configuration",
        "handler.not_discovered",
        `Handler file ${JSON.stringify(projectFile)} is not a discovered source file.`,
        projectFile,
      );
    }
    const expectedSlot = fileRoles.find((entry) => entry.role === action.handler.role);
    if (expectedSlot === undefined) {
      throw new InputFailure(
        "configuration",
        "handler.role_unknown",
        `Handler role ${JSON.stringify(action.handler.role)} has no fileRoles declaration.`,
        featureContractPath,
      );
    }
    const actualRole = classifyRole(handlerFile, fileRoles) ?? "unclassified";
    if (actualRole === action.handler.role) {
      return;
    }

    diagnostics.push({
      code: "file.role_mismatch",
      severity: "error",
      category: "project-structure",
      message: `Action handler ${JSON.stringify(action.id)} must have role ${JSON.stringify(action.handler.role)}, but ${JSON.stringify(handlerFile)} is classified as ${JSON.stringify(actualRole)}.`,
      file: projectFile,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      facts: {
        actionId: action.id,
        actualRole,
        expectedRole: action.handler.role,
        expectedWithinFeature: expectedSlot.withinFeature,
        featureId: feature.feature.id,
        handlerFile,
      },
      related: [
        {
          role: "handler-declaration",
          message: "This action contract declares the handler path and expected role.",
          file: featureContractPath,
          range: handlerFileRange(featureText, actionIndex),
        },
      ],
      repair: {
        strategy: "move-handler-to-role",
        hint: `Move the handler into feature directory ${JSON.stringify(expectedSlot.withinFeature)}.`,
        mustPreserve: [
          `action ${action.id}`,
          `handler export ${action.handler.export}`,
          `expected role ${action.handler.role}`,
        ],
        mustNot: [
          `reclassify ${actualRole} files as ${action.handler.role}`,
          "remove the handler declaration",
        ],
      },
    });
  });

  return diagnostics;
}

function validateFileRoles(fileRoles: readonly FileRoleContract[]): void {
  for (let index = 0; index < fileRoles.length; index += 1) {
    const current = fileRoles[index];
    if (current === undefined) {
      continue;
    }
    assertRelativePosixPath(current.withinFeature, "fileRoles.withinFeature");
    for (let compareIndex = index + 1; compareIndex < fileRoles.length; compareIndex += 1) {
      const other = fileRoles[compareIndex];
      if (other === undefined) {
        continue;
      }
      if (current.role === other.role) {
        throw new InputFailure(
          "configuration",
          "file_roles.duplicate_role",
          `File role ${JSON.stringify(current.role)} is declared more than once.`,
        );
      }
      if (directoriesOverlap(current.withinFeature, other.withinFeature)) {
        throw new InputFailure(
          "configuration",
          "file_roles.overlap",
          `Feature directories ${JSON.stringify(current.withinFeature)} and ${JSON.stringify(other.withinFeature)} overlap.`,
        );
      }
    }
  }
}

function directoriesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function classifyRole(
  relativeFeatureFile: string,
  fileRoles: readonly FileRoleContract[],
): string | undefined {
  return fileRoles.find((entry) =>
    relativeFeatureFile.startsWith(`${entry.withinFeature}/`),
  )?.role;
}

function createReport(
  producerVersion: string,
  diagnostics: readonly Diagnostic[],
): DiagnosticReport {
  return {
    schemaVersion: 1,
    producer: { name: "mensor", version: producerVersion },
    status: diagnostics.length === 0 ? "passed" : "failed",
    diagnostics,
    summary: {
      errorCount: diagnostics.length,
      warningCount: 0,
    },
  };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    compareText(left.file, right.file) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character ||
    compareText(left.code, right.code)
  );
}

function contractFailure(
  file: string,
  issues: readonly ContractIssue[],
): CheckProjectResult {
  return failure({
    kind: "configuration",
    code: "contract.invalid",
    message: `Contract file ${JSON.stringify(file)} is invalid.`,
    file,
    issues,
  });
}

function failure(failureValue: CompilerFailure): CheckProjectResult {
  return { ok: false, failure: failureValue };
}
