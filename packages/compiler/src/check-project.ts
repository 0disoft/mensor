import * as path from "node:path";
import { performance } from "node:perf_hooks";

import {
  parseFeatureContract,
  parseProjectContract,
  parseRouteIndex,
  type ContractIssue,
  type Diagnostic,
  type DiagnosticReport,
  type FeatureContract,
  type FileRoleContract,
  type RouteIndex,
} from "@0disoft/mensor-contract";

import {
  assertProjectRoot,
  discoverProjectFiles,
  readProjectFile,
} from "./filesystem.js";
import {
  CompilerTiming,
  type CompilerPerformanceMetrics,
  type CompilerPhase,
} from "./compiler-timing.js";
import { checkFeatureForms } from "./form-rule.js";
import { FormIndexFailure } from "./form-index.js";
import { checkFeatureHandlers } from "./handler-rule.js";
import { createStaticHtmlFormIndexProvider } from "./html-forms.js";
import { handlerFileRange } from "./locations.js";
import { checkImportBoundaries } from "./module-boundary-rule.js";
import { checkOwnershipRules, type FeatureOwnerFact } from "./ownership-rule.js";
import { verifyRouteIndex } from "./route-index.js";
import { checkFeatureRoutes } from "./route-rule.js";
import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
  joinProjectPath,
} from "./paths.js";
import { createSourceFactIndex } from "./source-fact-index.js";
import type {
  CheckProjectOptions,
  CheckProjectResult,
  CompilerFailure,
} from "./types.js";

const defaultConfigFile = "mensor.project.jsonc";
const defaultMaxFiles = 10_000;
const defaultMaxFileBytes = 1_048_576;
const defaultMaxTotalBytes = 67_108_864;
const defaultMaxDepth = 64;
const defaultProducerVersion = "0.0.0";

export async function checkProject(
  options: CheckProjectOptions,
): Promise<CheckProjectResult> {
  return checkProjectInternal(options);
}

export interface MeasuredCheckProjectResult {
  readonly result: CheckProjectResult;
  readonly metrics: CompilerPerformanceMetrics;
}

export async function checkProjectWithMetrics(
  options: CheckProjectOptions,
): Promise<MeasuredCheckProjectResult> {
  const timing = new CompilerTiming();
  const startedAt = performance.now();
  const result = await checkProjectInternal(options, timing);
  return {
    result,
    metrics: timing.snapshot(performance.now() - startedAt),
  };
}

async function checkProjectInternal(
  options: CheckProjectOptions,
  timing?: CompilerTiming,
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
    const maxTotalBytes = options.limits?.maxTotalBytes ?? defaultMaxTotalBytes;
    const maxDepth = options.limits?.maxDepth ?? defaultMaxDepth;
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
    if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1) {
      return failure({
        kind: "configuration",
        code: "limits.max_total_bytes_invalid",
        message: "limits.maxTotalBytes must be a positive safe integer.",
      });
    }
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
      return failure({
        kind: "configuration",
        code: "limits.max_depth_invalid",
        message: "limits.maxDepth must be a non-negative safe integer.",
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
    const discoveredFiles = await measure(
      timing,
      "discovery",
      () => discoverProjectFiles(
        root,
        project.sourceRoot,
        maxFiles,
        maxTotalBytes,
        maxDepth,
      ),
    );
    const discovered = new Set(discoveredFiles);
    const diagnostics: Diagnostic[] = [];
    const featureOwners: FeatureOwnerFact[] = [];
    const sourceFacts = createSourceFactIndex(
      (file) => readProjectFile(root, file, maxFileBytes),
      timing,
    );
    const formIndexProvider = createStaticHtmlFormIndexProvider({
      producerVersion,
      readSource: (file) => readProjectFile(root, file, maxFileBytes),
      ...(timing === undefined ? {} : { timing }),
    });
    let routeIndexPath: string | undefined;
    let routeIndex: RouteIndex | undefined;
    if (project.routeIndex !== undefined) {
      routeIndexPath = assertRelativePosixPath(
        project.routeIndex,
        "routeIndex path",
      );
      const routeIndexText = await readProjectFile(
        root,
        routeIndexPath,
        maxFileBytes,
      );
      const routeIndexResult = parseRouteIndex(routeIndexText);
      if (!routeIndexResult.ok) {
        return contractFailure(routeIndexPath, routeIndexResult.issues);
      }
      routeIndex = await verifyRouteIndex({
        routeIndex: routeIndexResult.value,
        discovered,
        sourceFacts,
      });
    }

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
      featureOwners.push({
        id: featureResult.value.feature.id,
        root: path.posix.dirname(safeFeatureContractPath),
      });
      diagnostics.push(
        ...measureSync(
          timing,
          "ruleEvaluation",
          () => checkFeaturePlacement(
            safeFeatureContractPath,
            featureText,
            featureResult.value,
            project.fileRoles,
            discovered,
          ),
        ),
      );
      diagnostics.push(
        ...(await measure(
          timing,
          "ruleEvaluation",
          () => checkFeatureHandlers({
            featureContractPath: safeFeatureContractPath,
            featureText,
            feature: featureResult.value,
            discovered,
            sourceFacts,
          }),
        )),
      );
      if (routeIndex !== undefined && routeIndexPath !== undefined) {
        diagnostics.push(
          ...measureSync(
            timing,
            "ruleEvaluation",
            () => checkFeatureRoutes({
              featureContractPath: safeFeatureContractPath,
              featureText,
              feature: featureResult.value,
              projectContractPath: configFile,
              projectText,
              routeIndexPath,
              routeIndex,
            }),
          ),
        );
      }
      const templatePaths = featureTemplatePaths(
        safeFeatureContractPath,
        featureResult.value,
        discovered,
      );
      const formIndex = await formIndexProvider.getIndex(templatePaths);
      diagnostics.push(
        ...measureSync(
          timing,
          "ruleEvaluation",
          () => checkFeatureForms({
            featureContractPath: safeFeatureContractPath,
            featureText,
            feature: featureResult.value,
            formIndex,
          }),
        ),
      );
    }

    diagnostics.push(
      ...(await measure(
        timing,
        "ruleEvaluation",
        () => checkImportBoundaries({
          projectContractPath: configFile,
          projectText,
          featureContractPaths: project.featureContracts,
          fileRoles: project.fileRoles,
          boundaries: project.boundaries ?? [],
          discoveredFiles,
          sourceFacts,
        }),
      )),
    );
    diagnostics.push(
      ...measureSync(
        timing,
        "ruleEvaluation",
        () => checkOwnershipRules({
          projectContractPath: configFile,
          projectText,
          features: featureOwners,
          rules: project.ownershipRules ?? [],
          discoveredFiles,
        }),
      ),
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
    if (error instanceof FormIndexFailure) {
      return failure({
        kind: "configuration",
        code: error.code,
        message: error.message,
      });
    }
    return failure({
      kind: "internal",
      code: "compiler.unexpected_failure",
      message: "The compiler failed unexpectedly.",
    });
  }
}

function featureTemplatePaths(
  featureContractPath: string,
  feature: FeatureContract,
  discovered: ReadonlySet<string>,
): readonly string[] {
  const featureRoot = path.posix.dirname(featureContractPath);
  const templates = new Set<string>();
  for (const action of feature.actions) {
    const templateFile = assertRelativePosixPath(
      action.form.template,
      "form template",
    );
    const projectTemplate = joinProjectPath(featureRoot, templateFile);
    if (!discovered.has(projectTemplate)) {
      throw new InputFailure(
        "configuration",
        "form.template_not_discovered",
        `Form template ${JSON.stringify(projectTemplate)} is not a discovered source file.`,
        projectTemplate,
      );
    }
    templates.add(projectTemplate);
  }
  return [...templates].sort(compareText);
}

function measure<T>(
  timing: CompilerTiming | undefined,
  phase: CompilerPhase,
  operation: () => Promise<T>,
): Promise<T> {
  return timing === undefined ? operation() : timing.measure(phase, operation);
}

function measureSync<T>(
  timing: CompilerTiming | undefined,
  phase: CompilerPhase,
  operation: () => T,
): T {
  return timing === undefined ? operation() : timing.measureSync(phase, operation);
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
