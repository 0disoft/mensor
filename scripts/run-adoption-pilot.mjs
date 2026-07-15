import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { checkProject } from "../packages/compiler/dist/src/index.js";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = path.join(repositoryRoot, "fixtures", "valid", "hono-static-tasks");
const featureContractPath = path.join(
  fixtureRoot,
  "src",
  "features",
  "tasks",
  "feature.mensor.jsonc",
);
const projectContractPath = path.join(fixtureRoot, "mensor.project.jsonc");
const routePath = path.join(
  fixtureRoot,
  "src",
  "features",
  "tasks",
  "routes",
  "tasks.mjs",
);
const templateRelativePath = path.join(
  "src",
  "features",
  "tasks",
  "views",
  "index.html",
);

const contractFiles = [projectContractPath, featureContractPath];
const applicationFiles = await collectApplicationFiles(path.join(fixtureRoot, "src"));
const contractNonEmptyLines = await sumNonEmptyLines(contractFiles);
const featureContractNonEmptyLines = await sumNonEmptyLines([featureContractPath]);
const applicationNonEmptyLines = await sumNonEmptyLines(applicationFiles);
const valid = await measuredCheck(fixtureRoot);
assertDiagnosticCodes(valid.result, []);

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-adoption-"));
try {
  const fieldDriftRoot = path.join(temporaryRoot, "field-drift");
  await cp(fixtureRoot, fieldDriftRoot, { recursive: true });
  const fieldTemplate = path.join(fieldDriftRoot, templateRelativePath);
  await replaceExactlyInFile(fieldTemplate, 'name="title"', 'name="summary"');
  const fieldDriftSamples = [];
  let fieldDriftResult;
  for (let index = 0; index < 5; index += 1) {
    const measured = await measuredCheck(fieldDriftRoot);
    fieldDriftSamples.push(measured.durationMs);
    fieldDriftResult = measured.result;
  }
  assertDiagnosticCodes(fieldDriftResult, ["form.field_missing", "form.field_unexpected"]);

  const routeDriftRoot = path.join(temporaryRoot, "route-drift");
  await cp(fixtureRoot, routeDriftRoot, { recursive: true });
  const driftedRoute = path.join(
    routeDriftRoot,
    "src",
    "features",
    "tasks",
    "routes",
    "tasks.mjs",
  );
  await replaceExactlyInFile(
    driftedRoute,
    'app.post("/tasks"',
    'app.post("/work-items"',
  );
  const routeDrift = await measuredCheck(routeDriftRoot);
  assertDiagnosticCodes(routeDrift.result, []);

  const featureContract = await readFile(featureContractPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    kind: "local-adoption-pilot",
    target: "fixtures/valid/hono-static-tasks",
    staticMetrics: {
      contractFileCount: contractFiles.length,
      contractNonEmptyLines,
      featureContractNonEmptyLines,
      applicationFileCount: applicationFiles.length,
      applicationNonEmptyLines,
      contractToApplicationLineRatio: round(contractNonEmptyLines / applicationNonEmptyLines),
      routeLiteralOccurrences: {
        featureContract: countOccurrences(featureContract, "/tasks"),
        applicationSource: countOccurrences(routeSource, "/tasks"),
      },
    },
    validCheck: {
      durationMs: valid.durationMs,
      diagnosticCodes: diagnosticCodes(valid.result),
    },
    fieldDrift: {
      mutation: "rename HTML field title to summary",
      diagnosticCodes: diagnosticCodes(fieldDriftResult),
      durationMs: summarize(fieldDriftSamples),
    },
    frameworkRouteDrift: {
      mutation: "change Hono POST route from /tasks to /work-items",
      diagnosticCodes: diagnosticCodes(routeDrift.result),
      durationMs: routeDrift.durationMs,
      compilerDetected: false,
    },
  }, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function measuredCheck(root) {
  const startedAt = performance.now();
  const result = await checkProject({ root, producerVersion: "0.0.0-adoption" });
  return { result, durationMs: round(performance.now() - startedAt) };
}

function diagnosticCodes(result) {
  if (!result.ok) {
    throw new Error(`Adoption fixture check failed: ${result.failure.code}`);
  }
  return result.report.diagnostics.map((diagnostic) => diagnostic.code);
}

function assertDiagnosticCodes(result, expected) {
  const actual = diagnosticCodes(result);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected diagnostics ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function replaceExactlyInFile(file, before, after) {
  const source = await readFile(file, "utf8");
  const occurrences = countOccurrences(source, before);
  if (occurrences !== 1) {
    throw new Error(`Expected one occurrence in ${path.basename(file)}, received ${occurrences}.`);
  }
  await writeFile(file, source.replace(before, after), "utf8");
}

async function collectApplicationFiles(root) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectApplicationFiles(entryPath));
    } else if (
      entry.isFile()
      && !entry.name.endsWith(".mensor.jsonc")
      && (entry.name.endsWith(".mjs") || entry.name.endsWith(".html"))
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

async function sumNonEmptyLines(files) {
  let total = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    total += source.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
  }
  return total;
}

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    sampleCount: sorted.length,
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted[sorted.length - 1],
  };
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
