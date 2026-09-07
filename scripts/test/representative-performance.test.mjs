import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkProjectWithMetrics } from "../../packages/compiler/dist/src/check-project.js";
import { createPerformanceProject, scenarios } from "../lib/performance-projects.mjs";

test("representative projects cover multiple forms and import chains and detect drift", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "mensor-shapes-test-"));
  try {
    for (const shape of scenarios) {
      const root = path.join(temporary, shape.name);
      const metadata = await createPerformanceProject(root, { ...shape, features: 2, actions: 2, modules: 4 });
      assert.equal(metadata.sourceFileCount, 18);
      const baseline = await checkProjectWithMetrics({ root }, 1);
      assert.equal(baseline.result.ok, true);
      assert.deepEqual(baseline.result.report.diagnostics, []);
      assert.equal(baseline.metrics.templateDocumentCount, 4);
      for (const concurrency of [4, 8]) {
        assert.deepEqual((await checkProjectWithMetrics({ root }, concurrency)).result, baseline.result);
      }
      const file = path.join(root, metadata.firstTemplate);
      await writeFile(file, (await readFile(file, "utf8")).replace('name="title"', 'name="subject"'));
      const drift = await checkProjectWithMetrics({ root }, 1);
      assert.equal(drift.result.ok, true);
      assert.deepEqual(drift.result.report.diagnostics.map(diagnostic => diagnostic.code).sort(), ["form.field_missing", "form.field_unexpected"]);
      for (const concurrency of [4, 8]) {
        assert.deepEqual((await checkProjectWithMetrics({ root }, concurrency)).result, drift.result);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
