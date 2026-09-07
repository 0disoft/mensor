import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProjectWithMetrics } from "../dist/src/check-project.js";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

test("read concurrency preserves reports and exclusive timing accounting", async () => {
  const options = { root: path.join(fixtureRoot, "valid/layered-tasks"), producerVersion: "0.0.0-performance-test" };
  const serial = await checkProjectWithMetrics(options, 1);
  assert.equal(serial.result.ok, true);
  for (const concurrency of [4, 8]) {
    const measured = await checkProjectWithMetrics(options, concurrency);
    assert.deepEqual(measured.result, serial.result);
    const total = Object.values(measured.metrics.phaseDurationMs).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - measured.metrics.totalDurationMs) < 0.001);
  }
});

test("separates FormIndex costs from rule evaluation without changing results", async () => {
  const measured = await checkProjectWithMetrics({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    producerVersion: "0.0.0-performance-test",
  });

  assert.equal(measured.result.ok, true);
  if (measured.result.ok) {
    assert.equal(measured.result.report.status, "passed");
  }
  assert.equal(measured.metrics.templateDocumentCount, 1);
  assert.ok(measured.metrics.templateBytes > 0);
  assert.ok(measured.metrics.totalDurationMs > 0);
  for (const duration of Object.values(measured.metrics.phaseDurationMs)) {
    assert.ok(Number.isFinite(duration));
    assert.ok(duration >= 0);
  }
  const phaseTotal = Object.values(measured.metrics.phaseDurationMs).reduce(
    (total, duration) => total + duration,
    0,
  );
  assert.ok(Math.abs(measured.metrics.totalDurationMs - phaseTotal) < 0.001);
});
