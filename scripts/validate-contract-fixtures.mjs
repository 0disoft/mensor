import { readFile } from "node:fs/promises";

import {
  parseDiagnosticReport,
  parseFeatureContract,
  parseProjectContract,
} from "../packages/contract/dist/src/index.js";

const fixtures = [
  "valid/tiny-tasks",
  "invalid/file-role-mismatch",
  "invalid/form-field-missing",
  "invalid/form-field-unexpected",
  "invalid/form-method-mismatch",
  "invalid/form-action-mismatch",
];
const fixtureRoot = new URL("../fixtures/", import.meta.url);

for (const fixture of fixtures) {
  assertSuccess(
    parseProjectContract(await text(`${fixture}/mensor.project.jsonc`)),
    `${fixture}/mensor.project.jsonc`,
  );
  assertSuccess(
    parseFeatureContract(
      await text(`${fixture}/src/features/tasks/feature.mensor.jsonc`),
    ),
    `${fixture}/src/features/tasks/feature.mensor.jsonc`,
  );
  assertSuccess(
    parseDiagnosticReport(await text(`${fixture}/expected-report.json`)),
    `${fixture}/expected-report.json`,
  );
}

function assertSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed validation: ${JSON.stringify(result.issues)}`);
  }
}

async function text(relativePath) {
  return readFile(new URL(relativePath, fixtureRoot), "utf8");
}
