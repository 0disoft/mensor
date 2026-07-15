import { performance } from "node:perf_hooks";

import { checkProject } from "../packages/compiler/dist/src/index.js";

const root = process.argv[2];
if (root === undefined) {
  throw new Error("Expected a project root argument.");
}

const startedAt = performance.now();
const result = await checkProject({ root, producerVersion: "0.0.0-performance" });
const durationMs = performance.now() - startedAt;
if (!result.ok) {
  throw new Error(`Compiler performance fixture failed: ${result.failure.code}`);
}
if (result.report.diagnostics.length !== 0) {
  throw new Error("Compiler performance fixture emitted diagnostics.");
}

process.stdout.write(`${JSON.stringify({
  durationMs: round(durationMs),
  peakRssBytes: process.resourceUsage().maxRSS * 1024,
})}\n`);

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
