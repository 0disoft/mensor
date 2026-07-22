import { readFile } from "node:fs/promises";

import {
  parseCheckOutputV2,
  parseDiagnosticReport,
  parseFeatureContract,
  parseProjectContract,
  parseRouteIndex,
} from "../packages/contract/dist/src/index.js";

const schemaRoot = new URL("../packages/contract/spec/", import.meta.url);
const fixtures = [
  "../fixtures/valid/tiny-tasks/mensor.project.jsonc",
  "../fixtures/valid/layered-tasks/mensor.project.jsonc",
  "../fixtures/valid/hono-static-tasks/mensor.project.jsonc",
  "../fixtures/valid/node-static-rsvp/mensor.project.jsonc",
  "../examples/dogfood-tasks/mensor.project.jsonc",
  "../fixtures/invalid/form-field-missing/mensor.project.jsonc",
  "../fixtures/invalid/form-field-unexpected/mensor.project.jsonc",
  "../fixtures/invalid/form-method-mismatch/mensor.project.jsonc",
  "../fixtures/invalid/form-action-mismatch/mensor.project.jsonc",
  "../fixtures/invalid/form-control-codec-mismatch/mensor.project.jsonc",
  "../fixtures/invalid/form-control-unsupported/mensor.project.jsonc",
  "../fixtures/invalid/handler-export-missing/mensor.project.jsonc",
  "../fixtures/invalid/module-boundary-transitive/mensor.project.jsonc",
  "../fixtures/invalid/module-boundary-direct/mensor.project.jsonc",
  "../fixtures/invalid/module-dynamic-import-unsupported/mensor.project.jsonc",
  "../fixtures/invalid/ownership-test-slot/mensor.project.jsonc",
  "../fixtures/invalid/ownership-i18n-unowned/mensor.project.jsonc",
  "../fixtures/invalid/file-role-mismatch/mensor.project.jsonc",
  "../fixtures/valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/valid/layered-tasks/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/valid/hono-static-tasks/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/valid/node-static-rsvp/src/features/rsvp/feature.mensor.jsonc",
  "../examples/dogfood-tasks/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-field-missing/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-field-unexpected/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-method-mismatch/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-action-mismatch/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-control-codec-mismatch/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-control-unsupported/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/handler-export-missing/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/module-boundary-transitive/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/module-boundary-direct/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/module-dynamic-import-unsupported/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/ownership-test-slot/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/ownership-i18n-unowned/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/file-role-mismatch/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/valid/tiny-tasks/expected-report.json",
  "../fixtures/valid/layered-tasks/expected-report.json",
  "../fixtures/valid/hono-static-tasks/expected-report.json",
  "../fixtures/valid/node-static-rsvp/expected-report.json",
  "../examples/dogfood-tasks/expected-report.json",
  "../fixtures/invalid/form-field-missing/expected-report.json",
  "../fixtures/invalid/form-field-unexpected/expected-report.json",
  "../fixtures/invalid/form-method-mismatch/expected-report.json",
  "../fixtures/invalid/form-action-mismatch/expected-report.json",
  "../fixtures/invalid/form-control-codec-mismatch/expected-report.json",
  "../fixtures/invalid/form-control-unsupported/expected-report.json",
  "../fixtures/invalid/handler-export-missing/expected-report.json",
  "../fixtures/invalid/module-boundary-transitive/expected-report.json",
  "../fixtures/invalid/module-boundary-direct/expected-report.json",
  "../fixtures/invalid/module-dynamic-import-unsupported/expected-report.json",
  "../fixtures/invalid/ownership-test-slot/expected-report.json",
  "../fixtures/invalid/ownership-i18n-unowned/expected-report.json",
  "../fixtures/invalid/file-role-mismatch/expected-report.json",
  "../fixtures/valid/hono-static-tasks/mensor.route-index.json",
  "../fixtures/valid/node-static-rsvp/mensor.route-index.json",
  "../packages/contract/test/fixtures/check-output-v2-passed.json",
  "../packages/contract/test/fixtures/check-output-v2-error.json",
];

for (const file of [
  "project-contract-v1.schema.json",
  "feature-contract-v1.schema.json",
  "diagnostic-report-v1.schema.json",
  "route-index-v1.schema.json",
  "check-output-v2.schema.json",
]) {
  const schema = JSON.parse(await readFile(new URL(file, schemaRoot), "utf8"));
  if (schema.$id !== file) {
    throw new Error(`${file} must own matching $id, got ${schema.$id}.`);
  }
}

for (const fixture of fixtures) {
  const text = await readFile(new URL(fixture, import.meta.url), "utf8");
  const parsed = fixture.includes("check-output-v2-")
    ? parseCheckOutputV2(text)
    : fixture.endsWith("expected-report.json")
    ? parseDiagnosticReport(text)
    : fixture.endsWith("mensor.route-index.json")
      ? parseRouteIndex(text)
    : fixture.endsWith("feature.mensor.jsonc")
      ? parseFeatureContract(text)
      : parseProjectContract(text);
  if (!parsed.ok) {
    throw new Error(`${fixture} must satisfy its declared parser contract.`);
  }
}
