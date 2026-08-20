import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import diagnosticReportSchema from "../spec/diagnostic-report-v1.schema.json" with { type: "json" };
import checkOutputV2Schema from "../spec/check-output-v2.schema.json" with { type: "json" };
import featureContractSchema from "../spec/feature-contract-v1.schema.json" with { type: "json" };
import formIndexSchema from "../spec/form-index-v1.schema.json" with { type: "json" };
import projectContractSchema from "../spec/project-contract-v1.schema.json" with { type: "json" };
import routeIndexSchema from "../spec/route-index-v1.schema.json" with { type: "json" };
import runtimeManifestSchema from "../spec/runtime-manifest-v1.schema.json" with { type: "json" };

import { compareText } from "./compare.js";
import type {
  ContractIssue,
  CheckOutputV2,
  DiagnosticReport,
  FeatureContract,
  FormIndex,
  ProjectContract,
  RouteIndex,
  RuntimeManifest,
} from "./types.js";

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  messages: true,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
  validateFormats: false,
});

export const validateProjectContract = ajv.compile<ProjectContract>(
  projectContractSchema,
);

export const validateFeatureContract = ajv.compile<FeatureContract>(
  featureContractSchema,
);

export const validateFormIndex = ajv.compile<FormIndex>(formIndexSchema);

export const validateDiagnosticReport = ajv.compile<DiagnosticReport>(
  diagnosticReportSchema,
);

export const validateCheckOutputV2 = ajv.compile<CheckOutputV2>(
  checkOutputV2Schema,
);

export const validateRouteIndex = ajv.compile<RouteIndex>(routeIndexSchema);

export const validateRuntimeManifest = ajv.compile<RuntimeManifest>(
  runtimeManifestSchema,
);

export function schemaIssues(
  validator: ValidateFunction,
): readonly ContractIssue[] {
  return [...(validator.errors ?? [])]
    .sort(compareSchemaErrors)
    .map((error) => ({
      code: "schema.violation" as const,
      message: schemaErrorMessage(error),
      instancePath: error.instancePath,
      schemaPath: error.schemaPath,
      keyword: error.keyword,
    }));
}

function compareSchemaErrors(left: ErrorObject, right: ErrorObject): number {
  return (
    compareText(left.instancePath, right.instancePath) ||
    compareText(left.schemaPath, right.schemaPath) ||
    compareText(left.keyword, right.keyword) ||
    compareText(left.message ?? "", right.message ?? "")
  );
}

function schemaErrorMessage(error: ErrorObject): string {
  const location = error.instancePath === "" ? "/" : error.instancePath;
  return `${location} ${error.message ?? "does not satisfy the schema"}.`;
}
