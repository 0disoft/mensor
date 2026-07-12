import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyMutation,
  createMutationBenchmarkReport,
  mutationCatalog,
  runMutationCheck,
  runMutationCase,
} from "../dist/src/index.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../fixtures/valid/", import.meta.url),
);

test("each mutation produces its one declared diagnostic", async () => {
  for (const mutation of mutationCatalog) {
    await withFixture(mutation.baselineId, async (root) => {
      const checked = await runMutationCheck(root, mutation.id);
      const application = checked.benchmarkCase;

      assert.notEqual(checked.diagnosticReport, null, mutation.id);
      assert.deepEqual(
        checked.diagnosticReport?.diagnostics.map((diagnostic) => diagnostic.code),
        mutation.expectedDiagnosticCodes,
        mutation.id,
      );
      assert.deepEqual(application.expectedDiagnosticCodes, mutation.expectedDiagnosticCodes);
      assert.deepEqual(
        application.changes.map((change) => change.file),
        mutation.changedFiles,
      );
      assert.ok(
        application.changes.every(
          (change) => change.beforeSha256 !== change.afterSha256,
        ),
      );
    });
  }
});

test("mutation applications are byte-identical across absolute roots", async () => {
  for (const mutation of mutationCatalog) {
    const roots = await Promise.all([
      copyFixture(mutation.baselineId),
      copyFixture(mutation.baselineId),
    ]);
    try {
      const applications = await Promise.all(
        roots.map((root) => applyMutation(root, mutation.id)),
      );
      assert.equal(
        `${JSON.stringify(applications[0], null, 2)}\n`,
        `${JSON.stringify(applications[1], null, 2)}\n`,
        mutation.id,
      );
    } finally {
      await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true })),
      );
    }
  }
});

test("rejects concurrent mutations against one workspace", async () => {
  await withFixture("tiny-tasks", async (root) => {
    const results = await Promise.allSettled([
      runMutationCheck(root, "form-field-missing"),
      runMutationCheck(root, "form-action-mismatch"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.match(String(rejected?.reason), /already in use/);
  });
});

test("builds a deterministic serializable benchmark report", async () => {
  const reports = [];
  for (let run = 0; run < 2; run += 1) {
    const cases = [];
    for (const mutation of [...mutationCatalog].reverse()) {
      await withFixture(mutation.baselineId, async (root) => {
        cases.push(await runMutationCase(root, mutation.id));
      });
    }
    reports.push(createMutationBenchmarkReport(cases, "0.0.0-test"));
  }

  assert.equal(
    `${JSON.stringify(reports[0], null, 2)}\n`,
    `${JSON.stringify(reports[1], null, 2)}\n`,
  );
  assert.deepEqual(reports[0].summary, {
    caseCount: 12,
    detectionPassedCount: 12,
    detectionFailedCount: 0,
  });
  assert.deepEqual(
    reports[0].cases.map((item) => item.mutationId),
    [...mutationCatalog].map((item) => item.id),
  );
});

async function copyFixture(baselineId) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-mutation-"));
  await cp(path.join(fixtureRoot, baselineId), root, { recursive: true });
  return root;
}

async function withFixture(baselineId, callback) {
  const root = await copyFixture(baselineId);
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
