import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isJsonValue,
  parseDiagnosticReport,
  parseFeatureContract,
  parseJsonc,
  parseProjectContract,
} from "@mensor/contract";

const fixtureRoot = new URL("../../../fixtures/", import.meta.url);

test("parses the valid project, feature, and report fixtures", async () => {
  const project = parseProjectContract(
    await fixtureText("valid/tiny-tasks/mensor.project.jsonc"),
  );
  const feature = parseFeatureContract(
    await fixtureText(
      "valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
    ),
  );
  const report = parseDiagnosticReport(
    await fixtureText("valid/tiny-tasks/expected-report.json"),
  );

  assert.equal(project.ok, true);
  assert.equal(feature.ok, true);
  assert.equal(report.ok, true);
});

test("accepts comments but rejects trailing commas", () => {
  const withComment = parseJsonc('{\n  // owner\n  "value": 1\n}\n');
  const withTrailingComma = parseJsonc('{\n  "value": 1,\n}\n');

  assert.equal(withComment.ok, true);
  assert.equal(withTrailingComma.ok, false);
  if (!withTrailingComma.ok) {
    assert.equal(withTrailingComma.issues.length, 1);
    assert.deepEqual(
      withTrailingComma.issues.map((issue) => issue.code),
      ["jsonc.syntax"],
    );
  }
});

test("rejects duplicate keys at every object depth", () => {
  const result = parseJsonc(
    '{"version":1,"nested":{"id":"first","id":"second"}}',
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["jsonc.duplicate_key"],
    );
    assert.match(result.issues[0].message, /"id"/u);
  }
});

test("rejects unknown project keys and root-escaping paths", () => {
  const text = JSON.stringify({
    version: 1,
    sourceRoot: "../src",
    featureContracts: ["src/features/tasks/feature.mensor.jsonc"],
    unexpected: true,
  });
  const first = parseProjectContract(text);
  const second = parseProjectContract(text);

  assert.equal(first.ok, false);
  assert.deepEqual(first, second);
  if (!first.ok) {
    assert.ok(first.issues.every((issue) => issue.code === "schema.violation"));
    assert.ok(first.issues.length >= 2);
  }
});

test("rejects unsupported form codecs", async () => {
  const text = await fixtureText(
    "valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  );
  const value = JSON.parse(text);
  value.actions[0].input.formCodec.bindings[0].decode.kind = "checkbox";

  const result = parseFeatureContract(JSON.stringify(value));
  assert.equal(result.ok, false);
});

test("accepts a current-document form path and rejects non-route values", async () => {
  const text = await fixtureText(
    "valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  );
  const valid = parseFeatureContract(text);
  assert.equal(valid.ok, true);

  const value = JSON.parse(text);
  value.actions[0].form.documentPath = "/tasks?view=all";
  const invalid = parseFeatureContract(JSON.stringify(value));
  assert.equal(invalid.ok, false);
});

test("rejects non-HTML form templates before source parsing", async () => {
  const text = await fixtureText(
    "valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  );
  const value = JSON.parse(text);
  value.actions[0].form.template = "views/index.ts";

  const result = parseFeatureContract(JSON.stringify(value));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) =>
      issue.instancePath === "/actions/0/form/template"
    ));
  }
});

test("rejects form bindings that do not have one schema-owned identity", async () => {
  const text = await fixtureText(
    "valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc",
  );
  const value = JSON.parse(text);
  value.actions[0].input.formCodec.bindings.push({
    name: "nickname",
    path: ["ghost"],
    decode: { kind: "text", trim: true, empty: "allow" },
  });
  value.actions[0].input.formCodec.ignoredFields = [{
    name: "title",
    consumer: "guard",
  }];

  const result = parseFeatureContract(JSON.stringify(value));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.issues.map((issue) => issue.instancePath), [
      "/actions/0/input/formCodec/bindings/1/path",
      "/actions/0/input/formCodec/ignoredFields/0/name",
    ]);
  }
});

test("rejects diagnostic reports with contradictory derived state", async () => {
  const passing = JSON.parse(
    await fixtureText("valid/tiny-tasks/expected-report.json"),
  );
  passing.summary.errorCount = 1;
  const inconsistent = parseDiagnosticReport(JSON.stringify(passing));
  assert.equal(inconsistent.ok, false);

  const failed = JSON.parse(
    await fixtureText("invalid/form-field-missing/expected-report.json"),
  );
  failed.status = "passed";
  failed.diagnostics[0].range = {
    start: { line: 2, character: 0 },
    end: { line: 1, character: 0 },
  };
  const invalidRange = parseDiagnosticReport(JSON.stringify(failed));
  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.deepEqual(invalidRange.issues.map((issue) => issue.instancePath), [
      "/status",
      "/diagnostics/0/range",
    ]);
  }
});

test("requires code-specific diagnostic facts", async () => {
  const text = await fixtureText(
    "invalid/form-field-missing/expected-report.json",
  );
  const value = JSON.parse(text);
  delete value.diagnostics[0].facts.fieldName;

  const result = parseDiagnosticReport(JSON.stringify(value));
  assert.equal(result.ok, false);
});

test("validates unexpected-field diagnostic facts independently", async () => {
  const text = await fixtureText(
    "invalid/form-field-unexpected/expected-report.json",
  );
  const value = JSON.parse(text);
  delete value.diagnostics[0].facts.unknownFieldsPolicy;

  const result = parseDiagnosticReport(JSON.stringify(value));
  assert.equal(result.ok, false);
});

test("validates route mismatch diagnostic facts independently", async () => {
  for (const fixture of [
    "invalid/form-method-mismatch/expected-report.json",
    "invalid/form-action-mismatch/expected-report.json",
  ]) {
    const value = JSON.parse(await fixtureText(fixture));
    delete value.diagnostics[0].facts.actionId;

    const result = parseDiagnosticReport(JSON.stringify(value));
    assert.equal(result.ok, false, fixture);
  }

  const actionMismatch = JSON.parse(
    await fixtureText("invalid/form-action-mismatch/expected-report.json"),
  );
  delete actionMismatch.diagnostics[0].facts.actualActionSource;
  assert.equal(
    parseDiagnosticReport(JSON.stringify(actionMismatch)).ok,
    false,
  );
});

test("validates control-codec diagnostic facts independently", async () => {
  const value = JSON.parse(
    await fixtureText(
      "invalid/form-control-codec-mismatch/expected-report.json",
    ),
  );
  delete value.diagnostics[0].facts.decoderKind;

  const result = parseDiagnosticReport(JSON.stringify(value));
  assert.equal(result.ok, false);
});

test("validates unsupported-control and handler-export facts independently", async () => {
  for (const fixture of [
    "invalid/form-control-unsupported/expected-report.json",
    "invalid/handler-export-missing/expected-report.json",
  ]) {
    const value = JSON.parse(await fixtureText(fixture));
    delete value.diagnostics[0].facts.actionId;

    const result = parseDiagnosticReport(JSON.stringify(value));
    assert.equal(result.ok, false, fixture);
  }
});

test("validates module-boundary diagnostic facts independently", async () => {
  for (const fixture of [
    "invalid/module-boundary-transitive/expected-report.json",
    "invalid/module-dynamic-import-unsupported/expected-report.json",
  ]) {
    const value = JSON.parse(await fixtureText(fixture));
    delete value.diagnostics[0].facts.boundaryId;

    const result = parseDiagnosticReport(JSON.stringify(value));
    assert.equal(result.ok, false, fixture);
  }
});

test("validates ownership diagnostic facts independently", async () => {
  const value = JSON.parse(
    await fixtureText("invalid/ownership-test-slot/expected-report.json"),
  );
  delete value.diagnostics[0].facts.ruleId;

  const result = parseDiagnosticReport(JSON.stringify(value));
  assert.equal(result.ok, false);
});

test("recognizes only finite JSON values and plain objects", () => {
  assert.equal(isJsonValue({ nested: [null, true, 1, "value"] }), true);
  assert.equal(isJsonValue(Number.NaN), false);
  assert.equal(isJsonValue(Number.POSITIVE_INFINITY), false);
  assert.equal(isJsonValue(new Date(0)), false);
});

async function fixtureText(relativePath) {
  return readFile(new URL(relativePath, fixtureRoot), "utf8");
}
