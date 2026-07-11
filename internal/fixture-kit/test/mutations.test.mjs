import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "@mensor/compiler";
import {
  applyMutation,
  createMutationBenchmarkReport,
  mutationCatalog,
  runMutationCase,
} from "../dist/src/index.js";

const fixture = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);

test("each mutation produces its one declared diagnostic", async () => {
  for (const mutation of mutationCatalog) {
    await withFixture(async (root) => {
      const application = await applyMutation(root, mutation.id);
      const result = await checkProject({
        root,
        producerVersion: "0.0.0-mutation",
      });

      assert.equal(result.ok, true, mutation.id);
      if (result.ok) {
        assert.deepEqual(
          result.report.diagnostics.map((diagnostic) => diagnostic.code),
          mutation.expectedDiagnosticCodes,
          mutation.id,
        );
      }
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
    const roots = await Promise.all([copyFixture(), copyFixture()]);
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

test("builds a deterministic serializable benchmark report", async () => {
  const reports = [];
  for (let run = 0; run < 2; run += 1) {
    const cases = [];
    for (const mutation of [...mutationCatalog].reverse()) {
      await withFixture(async (root) => {
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
    caseCount: 6,
    detectionPassedCount: 6,
    detectionFailedCount: 0,
  });
  assert.deepEqual(
    reports[0].cases.map((item) => item.mutationId),
    [...mutationCatalog].map((item) => item.id),
  );
});

async function copyFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-mutation-"));
  await cp(fixture, root, { recursive: true });
  return root;
}

async function withFixture(callback) {
  const root = await copyFixture();
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
