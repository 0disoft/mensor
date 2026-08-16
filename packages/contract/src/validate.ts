import { parseJsonc } from "./jsonc.js";
import { compareText } from "./compare.js";
import type { ValidateFunction } from "ajv";
import {
  schemaIssues,
  validateCheckOutputV2,
  validateDiagnosticReport,
  validateFeatureContract,
  validateProjectContract,
} from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  CheckOutputV2,
  DiagnosticReport,
  DiagnosticReportV2,
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

export function parseCheckOutputV2(
  text: string,
): ContractResult<CheckOutputV2> {
  const result = parseAndValidate(text, validateCheckOutputV2);
  if (!result.ok || result.value.status === "error") {
    return result;
  }
  return applySemanticIssues(
    result.value,
    reportSemanticIssues(result.value),
  );
}

export function parseDiagnosticReportV2(
  text: string,
): ContractResult<DiagnosticReportV2> {
  const result = parseCheckOutputV2(text);
  if (!result.ok) {
    return result;
  }
  if (result.value.status === "error") {
    return {
      ok: false,
      issues: [semanticIssue(
        "/status",
        "Diagnostic report v2 must have status passed or failed.",
      )],
    };
  }
  return { ok: true, value: result.value };
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
  const actionIds = new Set<string>();
  feature.actions.forEach((action, actionIndex) => {
    if (actionIds.has(action.id)) {
      issues.push(semanticIssue(
        `/actions/${actionIndex}/id`,
        "Feature action ids must be unique.",
      ));
    }
    actionIds.add(action.id);

    const schema = action.input.schema;
    schema.required.forEach((propertyName, requiredIndex) => {
      if (!Object.hasOwn(schema.properties, propertyName)) {
        issues.push(semanticIssue(
          `/actions/${actionIndex}/input/schema/required/${requiredIndex}`,
          "Required input properties must be declared in schema.properties.",
        ));
      }
    });
    for (const propertyName of Object.keys(schema.properties).sort(compareText)) {
      const property = schema.properties[propertyName];
      if (property === undefined) {
        continue;
      }
      const propertyPath = `/actions/${actionIndex}/input/schema/properties/${escapeJsonPointer(propertyName)}`;
      if (
        property.kind === "string" &&
        property.minLength !== undefined &&
        property.maxLength !== undefined &&
        property.minLength > property.maxLength
      ) {
        issues.push(semanticIssue(
          propertyPath,
          "String schema minLength must not exceed maxLength.",
        ));
      }
      if (
        (property.kind === "integer" || property.kind === "number") &&
        property.minimum !== undefined &&
        property.maximum !== undefined &&
        property.minimum > property.maximum
      ) {
        issues.push(semanticIssue(
          propertyPath,
          "Numeric schema minimum must not exceed maximum.",
        ));
      }
      if (
        property.kind === "array" &&
        property.minItems !== undefined &&
        property.maxItems !== undefined &&
        property.minItems > property.maxItems
      ) {
        issues.push(semanticIssue(
          propertyPath,
          "Array schema minItems must not exceed maxItems.",
        ));
      }
    }

    const bindingNames = new Set<string>();
    const bindingPaths = new Set<string>();
    const boundSchemaProperties = new Set<string>();
    action.input.formCodec.bindings.forEach((binding, bindingIndex) => {
      const base = `/actions/${actionIndex}/input/formCodec/bindings/${bindingIndex}`;
      const pathKey = binding.path.join("\u0000");
      const propertyName = binding.path[0] ?? "";
      const ownsSchemaProperty =
        binding.path.length === 1 &&
        Object.hasOwn(action.input.schema.properties, propertyName);
      if (!ownsSchemaProperty) {
        issues.push(semanticIssue(
          `${base}/path`,
          "Form binding path must identify exactly one declared input schema property.",
        ));
      } else {
        boundSchemaProperties.add(propertyName);
        const property = action.input.schema.properties[propertyName];
        if (property !== undefined && !decoderMatchesSchema(binding.decode, property)) {
          issues.push(semanticIssue(
            `${base}/decode`,
            `Form decoder ${JSON.stringify(binding.decode.kind)} is incompatible with schema kind ${JSON.stringify(property.kind)}.`,
          ));
        }
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
    for (const propertyName of Object.keys(schema.properties).sort(compareText)) {
      if (!boundSchemaProperties.has(propertyName)) {
        issues.push(semanticIssue(
          `/actions/${actionIndex}/input/schema/properties/${escapeJsonPointer(propertyName)}`,
          "Every input schema property must have exactly one form binding.",
        ));
      }
    }
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

function decoderMatchesSchema(
  decoder: FeatureContract["actions"][number]["input"]["formCodec"]["bindings"][number]["decode"],
  schema: FeatureContract["actions"][number]["input"]["schema"]["properties"][string],
): boolean {
  if (decoder.kind === "repeat") {
    return schema.kind === "array" && decoderMatchesSchema(decoder.items, schema.items);
  }
  if (decoder.kind === "text") {
    return schema.kind === "string";
  }
  if (decoder.kind === "integer-base10") {
    return schema.kind === "integer";
  }
  if (decoder.kind === "decimal") {
    return schema.kind === "number";
  }
  if (decoder.kind === "checkbox") {
    return schema.kind === "boolean";
  }
  return schema.kind === "enum" && arraysEqual(decoder.values, schema.values);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function reportSemanticIssues(
  report: DiagnosticReport | DiagnosticReportV2,
): readonly ContractIssue[] {
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

function rangeIsOrdered(
  range: DiagnosticReport["diagnostics"][number]["range"],
): boolean {
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
