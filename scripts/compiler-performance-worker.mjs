import { checkProjectWithMetrics } from "../packages/compiler/dist/src/check-project.js";

const root = process.argv[2];
if (root === undefined) {
  throw new Error("Expected a project root argument.");
}

const { result, metrics } = await checkProjectWithMetrics({
  root,
  producerVersion: "0.0.0-performance",
});
if (!result.ok) {
  throw new Error(`Compiler performance fixture failed: ${result.failure.code}`);
}
if (result.report.diagnostics.length !== 0) {
  throw new Error("Compiler performance fixture emitted diagnostics.");
}

process.stdout.write(`${JSON.stringify({
  durationMs: round(metrics.totalDurationMs),
  phaseDurationMs: Object.fromEntries(
    Object.entries(metrics.phaseDurationMs).map(([phase, duration]) => [
      phase,
      round(duration),
    ]),
  ),
  templateDocumentCount: metrics.templateDocumentCount,
  templateBytes: metrics.templateBytes,
  peakRssBytes: process.resourceUsage().maxRSS * 1024,
})}\n`);

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
