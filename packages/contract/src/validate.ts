import { parseJsonc } from "./jsonc.js";
import type { ValidateFunction } from "ajv";
import {
  schemaIssues,
  validateDiagnosticReport,
  validateFeatureContract,
  validateProjectContract,
} from "./schemas.js";
import type {
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
  return parseAndValidate(text, validateFeatureContract);
}

export function parseDiagnosticReport(
  text: string,
): ContractResult<DiagnosticReport> {
  return parseAndValidate(text, validateDiagnosticReport);
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
