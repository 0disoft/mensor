import { readFile } from "node:fs/promises";

import { parseJsonc } from "../packages/contract/dist/src/index.js";

const schemaRoot = new URL("../packages/contract/spec/", import.meta.url);
const fixtures = [
  "../fixtures/valid/tiny-tasks/mensor.project.jsonc",
  "../fixtures/invalid/form-field-missing/mensor.project.jsonc",
  "../fixtures/valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/invalid/form-field-missing/src/features/tasks/feature.mensor.jsonc",
  "../fixtures/valid/tiny-tasks/expected-report.json",
  "../fixtures/invalid/form-field-missing/expected-report.json",
];

for (const file of [
  "project-contract-v1.schema.json",
  "feature-contract-v1.schema.json",
  "diagnostic-report-v1.schema.json",
]) {
  const schema = JSON.parse(await readFile(new URL(file, schemaRoot), "utf8"));
  if (schema.$id !== file) {
    throw new Error(`${file} must own matching $id, got ${schema.$id}.`);
  }
}

for (const fixture of fixtures) {
  const parsed = parseJsonc(
    await readFile(new URL(fixture, import.meta.url), "utf8"),
  );
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    throw new Error(`${fixture} must contain valid JSONC object data.`);
  }
  const value = parsed.value;
  const version = value.version ?? value.schemaVersion;
  if (version !== 1) {
    throw new Error(`${fixture} must use schema revision 1.`);
  }
}
