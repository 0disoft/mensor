import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  parseRouteIndex,
  serializeRouteIndex,
} from "../packages/contract/dist/src/index.js";
import { checkProject } from "../packages/compiler/dist/src/index.js";
import { contentDigest } from "../packages/compiler/dist/src/route-index.js";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pilotDefinitions = [
  {
    target: "fixtures/valid/hono-static-tasks",
    featureContracts: ["src/features/tasks/feature.mensor.jsonc"],
    routeIndex: "mensor.route-index.json",
    routeSource: "src/features/tasks/routes/tasks.mjs",
    routeLiteral: "/tasks",
    fieldDrift: {
      file: "src/features/tasks/views/index.html",
      before: 'name="title"',
      after: 'name="summary"',
      description: "rename HTML field title to summary",
    },
    routeDrift: {
      before: 'app.post("/tasks"',
      after: 'app.post("/work-items"',
      affectedMethods: ["POST"],
      newPath: "/work-items",
      description: "change Hono POST route from /tasks to /work-items",
    },
  },
  {
    target: "fixtures/valid/node-static-rsvp",
    featureContracts: ["src/features/rsvp/feature.mensor.jsonc"],
    routeIndex: "mensor.route-index.json",
    routeSource: "src/features/rsvp/routes/rsvp.mjs",
    routeLiteral: "/rsvp",
    fieldDrift: {
      file: "src/features/rsvp/views/index.html",
      before: 'name="email"',
      after: 'name="contact"',
      description: "rename HTML field email to contact",
    },
    routeDrift: {
      before: 'url.pathname !== "/rsvp"',
      after: 'url.pathname !== "/responses"',
      affectedMethods: ["GET", "POST"],
      newPath: "/responses",
      description: "change Node route match from /rsvp to /responses",
    },
  },
];

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-adoption-"));
try {
  const pilots = [];
  for (const definition of pilotDefinitions) {
    pilots.push(await measurePilot(definition, temporaryRoot));
  }

  const fixedProjectContractLines = pilots.map(
    (pilot) => pilot.staticMetrics.projectContractNonEmptyLines,
  );
  const marginalFeatureContractLines = pilots.flatMap(
    (pilot) => pilot.staticMetrics.featureContractNonEmptyLines,
  );
  const routeDriftTargets = pilots.filter(
    (pilot) => pilot.applicationRouteDrift.compilerDetected,
  ).map((pilot) => pilot.target);

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 2,
    kind: "local-adoption-pilot",
    summary: {
      projectCount: pilots.length,
      featureCount: marginalFeatureContractLines.length,
      observedFalsePositiveCount: pilots.reduce(
        (count, pilot) => count + pilot.validCheck.diagnosticCodes.length,
        0,
      ),
      fixedProjectContractLines: summarize(fixedProjectContractLines),
      marginalFeatureContractLines: summarize(marginalFeatureContractLines),
      detectedRouteDriftTargets: routeDriftTargets,
      routeIndexDecision:
        routeDriftTargets.length === pilots.length
          ? "serialized-route-index-implemented"
          : "route-index-coverage-incomplete",
    },
    pilots,
  }, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function measurePilot(definition, temporaryRoot) {
  const fixtureRoot = path.join(repositoryRoot, ...definition.target.split("/"));
  const projectContractPath = path.join(fixtureRoot, "mensor.project.jsonc");
  const featureContractPaths = definition.featureContracts.map((file) =>
    path.join(fixtureRoot, ...file.split("/"))
  );
  const routeIndexPath = path.join(
    fixtureRoot,
    ...definition.routeIndex.split("/"),
  );
  const contractFiles = [projectContractPath, ...featureContractPaths];
  const applicationFiles = await collectApplicationFiles(path.join(fixtureRoot, "src"));
  const projectContractNonEmptyLines = await sumNonEmptyLines([projectContractPath]);
  const featureContractNonEmptyLines = await Promise.all(
    featureContractPaths.map(async (file) => sumNonEmptyLines([file])),
  );
  const contractNonEmptyLines =
    projectContractNonEmptyLines
    + featureContractNonEmptyLines.reduce((sum, count) => sum + count, 0);
  const applicationNonEmptyLines = await sumNonEmptyLines(applicationFiles);
  const routeIndexNonEmptyLines = await sumNonEmptyLines([routeIndexPath]);
  const valid = await measuredCheck(fixtureRoot);
  assertDiagnosticCodes(valid.result, []);

  const pilotTemporaryRoot = path.join(
    temporaryRoot,
    definition.target.replaceAll("/", "-"),
  );
  const fieldDriftRoot = path.join(pilotTemporaryRoot, "field-drift");
  await cp(fixtureRoot, fieldDriftRoot, { recursive: true });
  await replaceExactlyInFile(
    path.join(fieldDriftRoot, ...definition.fieldDrift.file.split("/")),
    definition.fieldDrift.before,
    definition.fieldDrift.after,
  );
  const fieldDriftSamples = [];
  let fieldDriftResult;
  for (let index = 0; index < 5; index += 1) {
    const measured = await measuredCheck(fieldDriftRoot);
    fieldDriftSamples.push(measured.durationMs);
    fieldDriftResult = measured.result;
  }
  assertDiagnosticCodes(fieldDriftResult, [
    "form.field_missing",
    "form.field_unexpected",
  ]);

  const routeDriftRoot = path.join(pilotTemporaryRoot, "route-drift");
  await cp(fixtureRoot, routeDriftRoot, { recursive: true });
  await replaceExactlyInFile(
    path.join(routeDriftRoot, ...definition.routeSource.split("/")),
    definition.routeDrift.before,
    definition.routeDrift.after,
  );
  const staleRouteDrift = await measuredCheck(routeDriftRoot);
  assertFailureCode(staleRouteDrift.result, "route_index.digest_mismatch");
  await refreshRouteIndex(routeDriftRoot, definition);
  const refreshedRouteDrift = await measuredCheck(routeDriftRoot);
  assertDiagnosticCodes(refreshedRouteDrift.result, ["route.missing"]);

  const featureContractSources = await Promise.all(
    featureContractPaths.map((file) => readFile(file, "utf8")),
  );
  const routeSource = await readFile(
    path.join(fixtureRoot, ...definition.routeSource.split("/")),
    "utf8",
  );

  return {
    target: definition.target,
    staticMetrics: {
      contractFileCount: contractFiles.length,
      projectContractNonEmptyLines,
      featureContractNonEmptyLines,
      contractNonEmptyLines,
      applicationFileCount: applicationFiles.length,
      applicationNonEmptyLines,
      routeIndexNonEmptyLines,
      contractToApplicationLineRatio: round(
        contractNonEmptyLines / applicationNonEmptyLines,
      ),
      featureContractToApplicationLineRatio: round(
        featureContractNonEmptyLines.reduce((sum, count) => sum + count, 0)
          / applicationNonEmptyLines,
      ),
      routeLiteralOccurrences: {
        featureContracts: featureContractSources.reduce(
          (count, source) => count + countOccurrences(source, definition.routeLiteral),
          0,
        ),
        applicationSource: countOccurrences(routeSource, definition.routeLiteral),
      },
    },
    validCheck: {
      durationMs: valid.durationMs,
      diagnosticCodes: diagnosticCodes(valid.result),
    },
    fieldDrift: {
      mutation: definition.fieldDrift.description,
      diagnosticCodes: diagnosticCodes(fieldDriftResult),
      durationMs: summarize(fieldDriftSamples),
    },
    applicationRouteDrift: {
      mutation: definition.routeDrift.description,
      staleIndexFailureCode: failureCode(staleRouteDrift.result),
      refreshedIndexDiagnosticCodes: diagnosticCodes(refreshedRouteDrift.result),
      durationMs: {
        staleIndex: staleRouteDrift.durationMs,
        refreshedIndex: refreshedRouteDrift.durationMs,
      },
      compilerDetected: true,
    },
  };
}

async function refreshRouteIndex(root, definition) {
  const routeIndexFile = path.join(root, ...definition.routeIndex.split("/"));
  const parsed = parseRouteIndex(await readFile(routeIndexFile, "utf8"));
  if (!parsed.ok) {
    throw new Error("Maintained RouteIndex must parse before regeneration.");
  }
  const sourceFile = path.join(root, ...definition.routeSource.split("/"));
  const source = await readFile(sourceFile, "utf8");
  const digest = contentDigest(source);
  const affectedRange = lineRangeContaining(source, definition.routeDrift.after);
  const affectedMethods = new Set(definition.routeDrift.affectedMethods);
  const refreshed = {
    ...parsed.value,
    routes: parsed.value.routes.map((route) => ({
      ...route,
      path: affectedMethods.has(route.method)
        ? definition.routeDrift.newPath
        : route.path,
      source: route.source.file === definition.routeSource
        ? {
            ...route.source,
            contentDigest: digest,
            range: affectedMethods.has(route.method)
              ? affectedRange
              : route.source.range,
          }
        : route.source,
    })),
  };
  await writeFile(routeIndexFile, serializeRouteIndex(refreshed), "utf8");
}

function lineRangeContaining(source, needle) {
  const lines = source.split(/\r\n|\n|\r/u);
  const indexes = lines
    .map((line, index) => line.includes(needle) ? index : -1)
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new Error(`Expected one route declaration containing ${JSON.stringify(needle)}.`);
  }
  const line = lines[indexes[0]];
  return {
    start: { line: indexes[0], character: 0 },
    end: { line: indexes[0], character: line.length },
  };
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
    throw new Error(
      `Expected diagnostics ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function failureCode(result) {
  return result.ok ? undefined : result.failure.code;
}

function assertFailureCode(result, expected) {
  const actual = failureCode(result);
  if (actual !== expected) {
    throw new Error(`Expected failure ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function replaceExactlyInFile(file, before, after) {
  const source = await readFile(file, "utf8");
  const occurrences = countOccurrences(source, before);
  if (occurrences !== 1) {
    throw new Error(
      `Expected one occurrence in ${path.basename(file)}, received ${occurrences}.`,
    );
  }
  await writeFile(file, source.replace(before, after), "utf8");
}

async function collectApplicationFiles(root) {
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
