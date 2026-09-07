import { createHash } from "node:crypto";
import { checkProjectWithMetrics } from "../packages/compiler/dist/src/check-project.js";

const [root, concurrencyText] = process.argv.slice(2);
const concurrency = Number(concurrencyText);
if (root === undefined || ![1, 4, 8].includes(concurrency)) throw new Error("Invalid worker input.");
const cpuStart = process.cpuUsage();
const { result, metrics } = await checkProjectWithMetrics({ root, producerVersion: "0.0.0-representative" }, concurrency);
if (!result.ok || result.report.diagnostics.length !== 0) throw new Error(JSON.stringify(result));
const cpu = process.cpuUsage(cpuStart);
process.stdout.write(`${JSON.stringify({
  durationMs: metrics.totalDurationMs,
  phaseDurationMs: metrics.phaseDurationMs,
  cpuMs: (cpu.user + cpu.system) / 1000,
  peakRssBytes: process.resourceUsage().maxRSS * 1024,
  templateDocumentCount: metrics.templateDocumentCount,
  reportDigest: createHash("sha256").update(JSON.stringify(result.report)).digest("hex"),
})}\n`);
