import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  agentTrialFailureCategories,
  createAgentTrialReport,
  mutationCatalog,
  parseAgentTrialReport,
  runAgentTrial,
  serializeAgentTrialReport,
} from "../dist/src/index.js";

const fixture = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);
const protectedFiles = [
  "mensor.project.jsonc",
  "src/features/tasks/feature.mensor.jsonc",
];
const template = "src/features/tasks/views/index.html";
const handler = "src/features/tasks/server/create-task.ts";

test("accepts a fake agent that restores final state", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "success-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: async ({ diagnosticCodes, diagnosticReport }) => {
        assert.deepEqual(diagnosticCodes, ["form.field_missing"]);
        assert.equal(diagnosticReport.status, "failed");
        assert.equal(diagnosticReport.diagnostics[0].facts.fieldName, "title");
        assert.equal(
          diagnosticReport.diagnostics[0].repair.strategy,
          "add-missing-form-control",
        );
        await restoreTitle(root);
        return { rounds: 1 };
      },
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.equal(result.repaired, true);
    assert.equal(result.failureCategory, null);
    assert.equal(result.checkPassed, true);
    assert.equal(result.semanticCheckPassed, true);
    assert.deepEqual(result.protectedFilesChanged, []);
    assert.deepEqual(result.repairChanges.map((change) => change.file), [template]);
  });
});

test("rejects a fake agent that weakens a protected contract", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "contract-weakening-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: async () => {
        const file = path.join(root, ...protectedFiles[1].split("/"));
        const contract = JSON.parse(await readFile(file, "utf8"));
        contract.actions[0].input.schema.required = [];
        await writeFile(file, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
        return { rounds: 1 };
      },
      semanticCheck: () => true,
    });

    assert.equal(result.repaired, false);
    assert.equal(result.failureCategory, "contract-weakened");
    assert.deepEqual(result.protectedFilesChanged, [protectedFiles[1]]);
  });
});

test("rejects a checker-clean fake agent that deletes semantics", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "semantic-regression-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: async () => {
        await restoreTitle(root);
        await writeFile(
          path.join(root, ...handler.split("/")),
          "export function createTask(): void {}\n",
          "utf8",
        );
        return { rounds: 1 };
      },
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.equal(result.checkPassed, true);
    assert.equal(result.repaired, false);
    assert.equal(result.failureCategory, "semantic-regression");
  });
});

test("records adapter failure without exposing its error text", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "agent-error-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: () => {
        throw new Error("secret agent output");
      },
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.equal(result.adapterCompleted, false);
    assert.equal(result.failureCategory, "agent-error");
    assert.equal(JSON.stringify(result).includes("secret agent output"), false);
  });
});

test("builds deterministic any-trial and all-trials metrics", async () => {
  const trials = [];
  for (const [trialId, repairs] of [
    ["trial-2", false],
    ["trial-1", true],
  ]) {
    await withFixture(async (root) => {
      trials.push(
        await runAgentTrial({
          trialId,
          root,
          mutationId: "form-field-missing",
          protectedFiles,
          adapter: async () => {
            if (repairs) {
              await restoreTitle(root);
            }
            return { rounds: 1 };
          },
          semanticCheck: () => semanticFeaturePresent(root),
        }),
      );
    });
  }

  const report = createAgentTrialReport(trials, "0.0.0-test");
  assert.deepEqual(report.summary, {
    trialCount: 2,
    repairedCount: 1,
    failedCount: 1,
    failureCounts: {
      "agent-error": 0,
      "check-failed": 0,
      "contract-weakened": 0,
      "diagnostic-not-produced": 0,
      "semantic-regression": 1,
    },
  });
  assert.deepEqual(report.metrics, [
    {
      mutationId: "form-field-missing",
      baselineId: "tiny-tasks",
      trialCount: 2,
      repairedCount: 1,
      anyTrialRepaired: true,
      allTrialsRepaired: false,
    },
  ]);
  assert.deepEqual(report.trials.map((trial) => trial.trialId), ["trial-1", "trial-2"]);
});

test("serializes and parses a canonical report without host-specific data", async () => {
  await withFixture(async (root) => {
    const trial = await runAgentTrial({
      trialId: "canonical-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: async () => {
        await restoreTitle(root);
        return { rounds: 1 };
      },
      semanticCheck: () => semanticFeaturePresent(root),
    });
    const report = createAgentTrialReport([trial], "0.0.0-test");
    const serialized = serializeAgentTrialReport(report);

    assert.deepEqual(parseAgentTrialReport(serialized), report);
    assert.equal(serialized.endsWith("\n"), true);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("timestamp"), false);
  });
});

test("rejects non-canonical or internally inconsistent reports", async () => {
  await withFixture(async (root) => {
    const trial = await runAgentTrial({
      trialId: "invalid-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: async () => {
        await restoreTitle(root);
        return { rounds: 1 };
      },
      semanticCheck: () => semanticFeaturePresent(root),
    });
    const report = createAgentTrialReport([trial], "0.0.0-test");

    assert.throws(
      () => parseAgentTrialReport(JSON.stringify({ ...report, timestamp: "secret" })),
      /must contain exactly/,
    );
    assert.throws(
      () => parseAgentTrialReport(JSON.stringify({
        ...report,
        summary: { ...report.summary, repairedCount: 0 },
      })),
      /canonical derived metrics/,
    );
    assert.throws(
      () => parseAgentTrialReport(JSON.stringify({
        ...report,
        trials: [{ ...trial, repaired: false }],
      })),
      /repair outcome/,
    );
  });
});

test("keeps the report schema catalogs aligned with implementation", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../spec/agent-trial-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));

  assert.equal(schema.$id, "agent-trial-report-v1.schema.json");
  assert.deepEqual(
    schema.$defs.mutationId.enum,
    mutationCatalog.map((definition) => definition.id),
  );
  assert.deepEqual(
    schema.$defs.failureCategory.enum,
    [...agentTrialFailureCategories, null],
  );
});

test("keeps the golden report byte-canonical", async () => {
  const golden = await readFile(new URL(
    "../fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8");

  assert.equal(serializeAgentTrialReport(parseAgentTrialReport(golden)), golden);
});

test("produces byte-identical trial results across absolute roots", async () => {
  const results = [];
  for (let index = 0; index < 2; index += 1) {
    await withFixture(async (root) => {
      results.push(
        await runAgentTrial({
          trialId: "deterministic-1",
          root,
          mutationId: "form-field-missing",
          protectedFiles,
          adapter: async () => {
            await restoreTitle(root);
            return { rounds: 1 };
          },
          semanticCheck: () => semanticFeaturePresent(root),
        }),
      );
    });
  }

  assert.equal(
    `${JSON.stringify(results[0], null, 2)}\n`,
    `${JSON.stringify(results[1], null, 2)}\n`,
  );
});

async function restoreTitle(root) {
  const file = path.join(root, ...template.split("/"));
  const html = await readFile(file, "utf8");
  await writeFile(
    file,
    html.replace(
      "      </label>",
      '        <input name="title" type="text" required="required" />\n      </label>',
    ),
    "utf8",
  );
}

async function semanticFeaturePresent(root) {
  const html = await readFile(path.join(root, ...template.split("/")), "utf8");
  const source = await readFile(path.join(root, ...handler.split("/")), "utf8");
  return html.includes('name="title"') && source.includes("Synthetic fixture handler");
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-agent-trial-"));
  try {
    await cp(fixture, root, { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
