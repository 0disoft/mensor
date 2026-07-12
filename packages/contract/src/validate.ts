import { parseJsonc } from "./jsonc.js";
import type { ValidateFunction } from "ajv";
import {
  schemaIssues,
  validateDiagnosticReport,
  validateFeatureContract,
  validateProjectContract,
} from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  DiagnosticReport,
  FeatureContract,
  ProjectContract,
} from "./types.js";

export function parseProjectContract(
  text: string,
): ContractResult<ProjectContract> {
  return parseAndValidate(text, validateProjectContract);
}

export function parseFeatureContract(
  text: string,
): ContractResult<FeatureContract> {
  const result = parseAndValidate(text, validateFeatureContract);
  return result.ok ? applySemanticIssues(result.value, featureSemanticIssues(result.value)) : result;
}

export function parseDiagnosticReport(
  text: string,
): ContractResult<DiagnosticReport> {
  const result = parseAndValidate(text, validateDiagnosticReport);
  return result.ok ? applySemanticIssues(result.value, reportSemanticIssues(result.value)) : result;
}

function parseAndValidate<T>(
  text: string,
  validate: ValidateFunction<T>,
): ContractResult<T> {
  const parsed = parseJsonc(text);
  if (!parsed.ok) {
    return parsed;
  }

  if (!validate(parsed.value)) {
    return { ok: false, issues: schemaIssues(validate) };
  }

  return { ok: true, value: parsed.value };
}

function applySemanticIssues<T>(
  value: T,
  issues: readonly ContractIssue[],
): ContractResult<T> {
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

function featureSemanticIssues(feature: FeatureContract): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  feature.actions.forEach((action, actionIndex) => {
    const bindingNames = new Set<string>();
    const bindingPaths = new Set<string>();
    action.input.formCodec.bindings.forEach((binding, bindingIndex) => {
      const base = `/actions/${actionIndex}/input/formCodec/bindings/${bindingIndex}`;
      const pathKey = binding.path.join("\u0000");
      if (
        binding.path.length !== 1 ||
        !Object.hasOwn(action.input.schema.properties, binding.path[0] ?? "")
      ) {
        issues.push(semanticIssue(
          `${base}/path`,
          "Form binding path must identify exactly one declared input schema property.",
        ));
      }
      if (bindingNames.has(binding.name)) {
        issues.push(semanticIssue(`${base}/name`, "Form binding names must be unique."));
      }
      if (bindingPaths.has(pathKey)) {
        issues.push(semanticIssue(`${base}/path`, "Form binding paths must be unique."));
      }
      bindingNames.add(binding.name);
      bindingPaths.add(pathKey);
    });
    const ignoredNames = new Set<string>();
    (action.input.formCodec.ignoredFields ?? []).forEach((field, fieldIndex) => {
      const instancePath = `/actions/${actionIndex}/input/formCodec/ignoredFields/${fieldIndex}/name`;
      if (bindingNames.has(field.name)) {
        issues.push(semanticIssue(
          instancePath,
          "A form field name cannot be both bound and ignored.",
        ));
      }
      if (ignoredNames.has(field.name)) {
        issues.push(semanticIssue(instancePath, "Ignored form field names must be unique."));
      }
      ignoredNames.add(field.name);
    });
  });
  return issues;
}

function reportSemanticIssues(report: DiagnosticReport): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const severities = report.diagnostics.map((item): string => item.severity);
  const errorCount = severities.filter((severity) => severity === "error").length;
  const warningCount = severities.filter((severity) => severity === "warning").length;
  const expectedStatus = errorCount === 0 ? "passed" : "failed";
  if (report.status !== expectedStatus) {
    issues.push(semanticIssue("/status", "Diagnostic report status must be derived from errors."));
  }
  if (report.summary.errorCount !== errorCount) {
    issues.push(semanticIssue(
      "/summary/errorCount",
      "Diagnostic report errorCount must equal the number of error diagnostics.",
    ));
  }
  if (report.summary.warningCount !== warningCount) {
    issues.push(semanticIssue(
      "/summary/warningCount",
      "Diagnostic report warningCount must equal the number of warning diagnostics.",
    ));
  }
  report.diagnostics.forEach((diagnostic, diagnosticIndex) => {
    if (!rangeIsOrdered(diagnostic.range)) {
      issues.push(semanticIssue(
        `/diagnostics/${diagnosticIndex}/range`,
        "Diagnostic range start must not follow its end.",
      ));
    }
    diagnostic.related.forEach((related, relatedIndex) => {
      if (!rangeIsOrdered(related.range)) {
        issues.push(semanticIssue(
          `/diagnostics/${diagnosticIndex}/related/${relatedIndex}/range`,
          "Related range start must not follow its end.",
        ));
      }
    });
  });
  return issues;
}

function rangeIsOrdered(range: DiagnosticReport["diagnostics"][number]["range"]): boolean {
  return range.start.line < range.end.line || (
    range.start.line === range.end.line &&
    range.start.character <= range.end.character
  );
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
