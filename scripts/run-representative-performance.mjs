import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPerformanceProject, scenarios } from "./lib/performance-projects.mjs";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--concurrency")) throw new Error("Expected --concurrency 1,4,8.");
const modes = args.length === 0 ? [1] : args[1].split(",").map(Number);
if (modes.length === 0 || modes.some(mode => ![1, 4, 8].includes(mode)) || new Set(modes).size !== modes.length) throw new Error("Invalid concurrency modes.");
const root = fileURLToPath(new URL("../", import.meta.url));
const worker = fileURLToPath(new URL("representative-performance-worker.mjs", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "mensor-representative-"));
const results = [];
try {
  for (const shape of scenarios) {
    const projectRoot = path.join(temporary, shape.name);
    const metadata = await createPerformanceProject(projectRoot, shape);
    const samples = [];
    for (let trial = 0; trial < 3; trial += 1) {
      for (const concurrency of trial % 2 === 0 ? modes : [...modes].reverse()) {
        const child = spawnSync(process.execPath, [worker, projectRoot, String(concurrency)], {
          cwd: root, env: {}, encoding: "utf8", timeout: 60_000, maxBuffer: 65_536, windowsHide: true,
        });
        if (child.status !== 0) throw new Error(child.stderr || child.error?.message || "Worker failed.");
        const sample = JSON.parse(child.stdout);
        if (sample.templateDocumentCount !== metadata.templateCount) throw new Error("Template coverage changed.");
        if (samples.length > 0 && samples[0].reportDigest !== sample.reportDigest) throw new Error("Diagnostic output changed across runs.");
        samples.push({ trial, concurrency, ...sample });
        console.log(`${shape.name}: concurrency=${concurrency}, trial=${trial + 1}, ${sample.durationMs.toFixed(1)} ms`);
      }
    }
    results.push({ ...metadata, samples, summary: modes.map(concurrency => {
      const selected = samples.filter(sample => sample.concurrency === concurrency);
      const times = selected.map(sample => sample.durationMs).sort((a, b) => a - b);
      return { concurrency, medianMs: times[1], minimumMs: times[0], maximumMs: times[2], peakRssBytes: Math.max(...selected.map(sample => sample.peakRssBytes)) };
    }) });
  }
  const report = {
    schemaVersion: 1, kind: "representative-compiler-performance",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model },
    method: { independentProcesses: true, osCacheFlushed: false, trialsPerMode: 3, alternateModeOrder: true },
    results,
  };
  const output = path.join(root, "dist/performance", modes.length === 1 ? "representative-baseline.json" : "representative-matrix.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(results.map(({ name, summary }) => ({ name, summary })), null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
