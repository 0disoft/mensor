import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createAgentTrialReport,
  mutationCatalog,
  parseAgentTrialReport,
  runAgentTrial,
} from "@mensor/fixture-kit";
import {
  createAgentTrialEvidence,
  createCommandAgentAdapter,
  createCommandExecutionDescriptor,
  executionFingerprint,
  mergeAgentTrialEvidence,
  parseAgentExecutionDescriptor,
  parseAgentTrialEvidence,
  runCommandAgentTrial,
  runCommandAgentSuite,
  serializeAgentExecutionDescriptor,
  serializeAgentTrialEvidence,
} from "../dist/src/index.js";

const fixture = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);
const fakeAgent = fileURLToPath(new URL("./fake-agent.mjs", import.meta.url));
const protectedFiles = [
  "mensor.project.jsonc",
  "src/features/tasks/feature.mensor.jsonc",
];
const diagnosticReport = JSON.parse(await readFile(new URL(
  "../../../fixtures/invalid/form-field-missing/expected-report.json",
  import.meta.url,
), "utf8"));
const passingReport = JSON.parse(await readFile(new URL(
  "../../../fixtures/valid/tiny-tasks/expected-report.json",
  import.meta.url,
), "utf8"));

test("repairs a mutation through the bounded command protocol", async () => {
  await withFixture(async (root) => {
    const evidence = await runCommandAgentTrial({
      execution: metadata(),
      command: commandOptions(),
      producerVersion: "0.0.0-test",
      trial: {
        trialId: "command-success-1",
        root,
        mutationId: "form-field-missing",
        protectedFiles,
        semanticCheck: () => semanticFeaturePresent(root),
      },
    });
    const result = evidence.report.trials[0];

    assert.equal(result?.repaired, true);
    assert.equal(result?.adapterCompleted, true);
    assert.equal(result?.rounds, 1);
    assert.equal(
      evidence.executionFingerprint,
      executionFingerprint(evidence.execution),
    );
    assert.deepEqual(evidence.execution.limits, {
      timeoutMs: commandOptions().timeoutMs,
      maxInputBytes: commandOptions().maxInputBytes,
      maxOutputBytes: commandOptions().maxOutputBytes,
    });
  });
});

test("runs repeated command trials in fresh workspaces and merges one cohort", async () => {
  const created = [];
  const disposed = [];
  const evidence = await runCommandAgentSuite({
    suiteId: "repair-suite",
    execution: metadata(),
    command: commandOptions(),
    producerVersion: "0.0.0-test",
    cases: [{
      mutationId: "form-field-missing",
      repetitions: 2,
      protectedFiles,
      semanticCheck: semanticFeaturePresent,
    }],
    workspace: {
      async create(baselineId, mutationId, trialId) {
        assert.equal(baselineId, "tiny-tasks");
        assert.equal(mutationId, "form-field-missing");
        const root = await mkdtemp(path.join(tmpdir(), "mensor-command-suite-"));
        await cp(fixture, root, { recursive: true });
        created.push({ root, trialId });
        return root;
      },
      async dispose(root) {
        disposed.push(root);
        await rm(root, { recursive: true, force: true });
      },
    },
  });

  assert.deepEqual(evidence.report.trials.map((trial) => trial.trialId), [
    "repair-suite.form-field-missing.1",
    "repair-suite.form-field-missing.2",
  ]);
  assert.equal(evidence.report.summary.repairedCount, 2);
  assert.equal(created.length, 2);
  assert.deepEqual(disposed, created.map((item) => item.root));
  assert.notEqual(created[0].root, created[1].root);
  await Promise.all(created.map(({ root }) => assertFileMissing(root)));
});

test("validates a command suite before creating mutable workspaces", async () => {
  let createCount = 0;
  const base = {
    suiteId: "invalid-suite",
    execution: metadata(),
    command: commandOptions(),
    producerVersion: "0.0.0-test",
    workspace: {
      async create() {
        createCount += 1;
        throw new Error("must not create a workspace");
      },
      async dispose() {},
    },
  };
  await assert.rejects(
    runCommandAgentSuite({ ...base, cases: [] }),
    /at least one case/,
  );
  await assert.rejects(
    runCommandAgentSuite({
      ...base,
      cases: [{
        mutationId: "form-field-missing",
        repetitions: 0,
        protectedFiles,
        semanticCheck: () => true,
      }],
    }),
    /positive safe integer/,
  );
  assert.equal(createCount, 0);
});

test("disposes a command suite workspace when a trial setup fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-command-suite-failure-"));
  let disposed = false;
  await assert.rejects(
    runCommandAgentSuite({
      suiteId: "cleanup-suite",
      execution: metadata(),
      command: commandOptions(),
      producerVersion: "0.0.0-test",
      cases: [{
        mutationId: "form-field-missing",
        repetitions: 1,
        protectedFiles,
        semanticCheck: () => true,
      }],
      workspace: {
        async create() {
          return root;
        },
        async dispose(workspaceRoot) {
          disposed = true;
          await rm(workspaceRoot, { recursive: true, force: true });
        },
      },
    }),
  );
  assert.equal(disposed, true);
  await assertFileMissing(root);
});

test("validates command evidence configuration before mutating the trial", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      runCommandAgentTrial({
        execution: metadata(),
        command: { ...commandOptions(), executable: "node" },
        producerVersion: "0.0.0-test",
        trial: {
          trialId: "command-preflight-1",
          root,
          mutationId: "form-field-missing",
          protectedFiles,
          semanticCheck: () => semanticFeaturePresent(root),
        },
      }),
      /absolute path/,
    );
    await assert.rejects(
      runCommandAgentTrial({
        execution: metadata(),
        command: commandOptions(),
        producerVersion: "invalid producer version",
        trial: {
          trialId: "command-preflight-2",
          root,
          mutationId: "form-field-missing",
          protectedFiles,
          semanticCheck: () => semanticFeaturePresent(root),
        },
      }),
      /producerVersion must use only/,
    );
    assert.equal(await semanticFeaturePresent(root), true);
  });
});

test("passes only explicitly allowlisted environment values", async () => {
  await withFixture(async (root) => {
    const previous = process.env["FORBIDDEN"];
    process.env["FORBIDDEN"] = "ambient-value";
    try {
      const command = createCommandAgentAdapter({
        executable: process.execPath,
        args: [fakeAgent, "environment"],
        timeoutMs: 5_000,
        maxInputBytes: 4_096,
        maxOutputBytes: 4_096,
        environment: { ALLOWED: "yes" },
      });
      const result = await command(context(root));
      assert.deepEqual(result, { rounds: 1 });
    } finally {
      if (previous === undefined) {
        delete process.env["FORBIDDEN"];
      } else {
        process.env["FORBIDDEN"] = previous;
      }
    }
  });
});

test("creates a canonical execution descriptor without command or secret values", () => {
  const descriptor = createCommandExecutionDescriptor(metadata(), commandOptions());
  const serialized = serializeAgentExecutionDescriptor(descriptor);

  assert.deepEqual(parseAgentExecutionDescriptor(serialized), descriptor);
  assert.equal(descriptor.environment.platform, process.platform);
  assert.equal(descriptor.environment.architecture, process.arch);
  assert.equal(descriptor.environment.nodeVersion, process.versions.node);
  assert.equal(descriptor.environment.isolation, "process-only");
  assert.equal(descriptor.environment.networkControl, "not-enforced");
  assert.deepEqual(descriptor.limits, {
    timeoutMs: 5_000,
    maxInputBytes: 4_096,
    maxOutputBytes: 4_096,
  });
  assert.equal(serialized.includes(process.execPath), false);
  assert.equal(serialized.includes(fakeAgent), false);
  assert.equal(serialized.includes("sentinel-value"), false);
  assert.equal(serialized.endsWith("\n"), true);
});

test("fingerprints every declared execution contract", () => {
  const first = createCommandExecutionDescriptor(metadata(), commandOptions());
  const identical = createCommandExecutionDescriptor(metadata(), commandOptions());
  const second = createCommandExecutionDescriptor({
    ...metadata(),
    prompt: artifact("repair-prompt", "v2", "b"),
  }, commandOptions());

  assert.match(executionFingerprint(first), /^[a-f0-9]{64}$/);
  assert.equal(executionFingerprint(first), executionFingerprint(identical));
  assert.notEqual(executionFingerprint(first), executionFingerprint(second));

  const differentArgs = createCommandExecutionDescriptor(metadata(), {
    ...commandOptions(),
    args: [fakeAgent, "environment"],
  });
  const differentEnvironment = createCommandExecutionDescriptor(metadata(), {
    ...commandOptions(),
    environment: { EVAL_SENTINEL: "different-value" },
  });
  assert.notEqual(executionFingerprint(first), executionFingerprint(differentArgs));
  assert.notEqual(executionFingerprint(first), executionFingerprint(differentEnvironment));
  assert.notEqual(
    first.environment.commandSpecSha256,
    differentArgs.environment.commandSpecSha256,
  );
});

test("binds a canonical report to one execution fingerprint", async () => {
  const report = parseAgentTrialReport(await readFile(new URL(
    "../../fixture-kit/fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8"));
  const descriptor = createCommandExecutionDescriptor(metadata(), commandOptions());
  const evidence = createAgentTrialEvidence(descriptor, report);
  const serialized = serializeAgentTrialEvidence(evidence);

  assert.deepEqual(parseAgentTrialEvidence(serialized), evidence);
  assert.equal(evidence.executionFingerprint, executionFingerprint(descriptor));
  assert.throws(
    () => parseAgentTrialEvidence(JSON.stringify({
      ...evidence,
      executionFingerprint: "0".repeat(64),
    })),
    /canonical execution fingerprint/,
  );
});

test("merges repeated trials only inside one execution cohort", async () => {
  const report = await goldenReport();
  const descriptor = createCommandExecutionDescriptor(metadata(), commandOptions());
  const first = createAgentTrialEvidence(
    descriptor,
    reportWithTrialId(report, "cohort-2"),
  );
  const second = createAgentTrialEvidence(
    descriptor,
    reportWithTrialId(report, "cohort-1"),
  );

  const merged = mergeAgentTrialEvidence([first, second]);
  const reversed = mergeAgentTrialEvidence([second, first]);
  assert.equal(
    serializeAgentTrialEvidence(merged),
    serializeAgentTrialEvidence(reversed),
  );
  assert.deepEqual(merged.report.trials.map((trial) => trial.trialId), [
    "cohort-1",
    "cohort-2",
  ]);
  assert.deepEqual(merged.report.metrics, [{
    mutationId: "form-field-missing",
    baselineId: "tiny-tasks",
    trialCount: 2,
    repairedCount: 2,
    anyTrialRepaired: true,
    allTrialsRepaired: true,
  }]);
});

test("rejects mixed, duplicate, empty, and producer-drift cohorts", async () => {
  const report = await goldenReport();
  const descriptor = createCommandExecutionDescriptor(metadata(), commandOptions());
  const first = createAgentTrialEvidence(descriptor, reportWithTrialId(report, "cohort-1"));
  const differentExecution = createAgentTrialEvidence(
    createCommandExecutionDescriptor({
      ...metadata(),
      prompt: artifact("repair-prompt", "v2", "e"),
    }, commandOptions()),
    reportWithTrialId(report, "cohort-2"),
  );
  const differentProducer = createAgentTrialEvidence(
    descriptor,
    createAgentTrialReport([
      { ...report.trials[0], trialId: "cohort-3" },
    ], "0.0.1-test"),
  );
  const empty = createAgentTrialEvidence(
    descriptor,
    createAgentTrialReport([], report.producerVersion),
  );

  assert.throws(() => mergeAgentTrialEvidence([]), /at least one evidence item/);
  assert.throws(
    () => mergeAgentTrialEvidence([first, differentExecution]),
    /cannot mix execution fingerprints/,
  );
  assert.throws(
    () => mergeAgentTrialEvidence([first, differentProducer]),
    /cannot mix report producer versions/,
  );
  assert.throws(
    () => mergeAgentTrialEvidence([first, first]),
    /Duplicate agent trial ID/,
  );
  assert.throws(
    () => mergeAgentTrialEvidence([empty]),
    /at least one trial/,
  );
});

test("rejects descriptor drift and malformed metadata", () => {
  const descriptor = createCommandExecutionDescriptor(metadata(), commandOptions());
  assert.throws(
    () => parseAgentExecutionDescriptor(JSON.stringify({ ...descriptor, timestamp: "hidden" })),
    /must contain exactly/,
  );
  assert.throws(
    () => createCommandExecutionDescriptor({
      ...metadata(),
      prompt: artifact("repair-prompt", "v1", "not-a-digest"),
    }, commandOptions()),
    /SHA-256/,
  );
  assert.throws(
    () => createCommandExecutionDescriptor({
      ...metadata(),
      providerId: "provider with spaces",
    }, commandOptions()),
    /bounded artifact name/,
  );
});

test("keeps execution schema identifiers and references stable", async () => {
  const descriptorSchema = JSON.parse(await readFile(new URL(
    "../spec/agent-execution-descriptor-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const evidenceSchema = JSON.parse(await readFile(new URL(
    "../spec/agent-trial-evidence-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const reportSchema = JSON.parse(await readFile(new URL(
    "../../fixture-kit/spec/agent-trial-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));

  assert.equal(descriptorSchema.$id, "agent-execution-descriptor-v1.schema.json");
  assert.equal(evidenceSchema.$id, "agent-trial-evidence-v1.schema.json");
  assert.equal(
    evidenceSchema.properties.execution.$ref,
    "agent-execution-descriptor-v1.schema.json",
  );
  assert.equal(
    evidenceSchema.properties.report.$ref,
    "agent-trial-report-v1.schema.json",
  );

  const report = parseAgentTrialReport(await readFile(new URL(
    "../../fixture-kit/fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8"));
  const evidence = createAgentTrialEvidence(
    createCommandExecutionDescriptor(metadata(), commandOptions()),
    report,
  );
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(reportSchema);
  ajv.addSchema(descriptorSchema);
  const validateEvidence = ajv.compile(evidenceSchema);
  assert.equal(validateEvidence(evidence), true, JSON.stringify(validateEvidence.errors));
});

test("keeps the command protocol schemas aligned with diagnostic input", async () => {
  const inputSchema = JSON.parse(await readFile(new URL(
    "../spec/agent-command-input-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const outputSchema = JSON.parse(await readFile(new URL(
    "../spec/agent-command-output-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const diagnosticSchema = JSON.parse(await readFile(new URL(
    "../../../packages/contract/spec/diagnostic-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(diagnosticSchema);
  const validateInput = ajv.compile(inputSchema);
  const validateOutput = ajv.compile(outputSchema);

  assert.equal(inputSchema.$id, "agent-command-input-v1.schema.json");
  assert.equal(outputSchema.$id, "agent-command-output-v1.schema.json");
  assert.deepEqual(
    inputSchema.properties.mutationId.enum,
    mutationCatalog.map((definition) => definition.id),
  );
  assert.equal(validateInput({
    schemaVersion: 1,
    mutationId: "form-field-missing",
    baselineId: "tiny-tasks",
    diagnosticReport,
  }), true, JSON.stringify(validateInput.errors));
  assert.equal(
    validateOutput({ schemaVersion: 1, rounds: 1 }),
    true,
    JSON.stringify(validateOutput.errors),
  );
});

test("rejects relative executables before process creation", () => {
  assert.throws(
    () =>
      createCommandAgentAdapter({
        executable: "node",
        timeoutMs: 1_000,
        maxInputBytes: 1_024,
        maxOutputBytes: 1_024,
      }),
    /absolute path/,
  );
});

test("fails closed on timeout, output overflow, invalid output, and exit failure", async () => {
  await withFixture(async (root) => {
    await assert.rejects(adapter("hang", { timeoutMs: 100 })(context(root)), /timeout/);
    await assert.rejects(
      adapter("output-limit", { maxOutputBytes: 128 })(context(root)),
      /output limit/,
    );
    await assert.rejects(adapter("invalid-json")(context(root)), /valid UTF-8 JSON/);
    await assert.rejects(adapter("failure")(context(root)), /exited unsuccessfully/);
  });
});

test("does not wait for escaped descendants that retain command pipes", async () => {
  await withFixture(async (root) => {
    const startedAt = performance.now();
    await assert.rejects(
      adapter("escaped-pipe", { timeoutMs: 100 })(context(root)),
      /timeout/,
    );
    assert.ok(performance.now() - startedAt < 500);
  });
});

test("rejects oversized protocol input before running the command", async () => {
  await withFixture(async (root) => {
    const command = createCommandAgentAdapter({
      executable: process.execPath,
      args: [fakeAgent, "sentinel"],
      timeoutMs: 5_000,
      maxInputBytes: 1,
      maxOutputBytes: 4_096,
      environment: {},
    });
    await assert.rejects(command(context(root)), /input limit/);
    await assertFileMissing(path.join(root, "agent-started.marker"));
  });
});

test("rejects diagnostic report drift before process creation", async () => {
  await withFixture(async (root) => {
    const command = adapter("sentinel");
    await assert.rejects(
      command({ ...context(root), diagnosticCodes: ["form.field_unexpected"] }),
      /does not match its diagnostic codes/,
    );
    await assert.rejects(
      command({ ...context(root), diagnosticReport: passingReport, diagnosticCodes: [] }),
      /requires a failing diagnostic report/,
    );
    await assert.rejects(
      command({ ...context(root), diagnosticReport: { ...diagnosticReport, timestamp: "invalid" } }),
      /does not satisfy its contract/,
    );
    await assertFileMissing(path.join(root, "agent-started.marker"));
  });
});

test("trial results do not expose command stderr", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "command-failure-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: adapter("failure"),
      semanticCheck: () => semanticFeaturePresent(root),
    });
    assert.equal(result.failureCategory, "agent-error");
    assert.equal(JSON.stringify(result).includes("provider command failure details"), false);
  });
});

function adapter(mode, overrides = {}) {
  return createCommandAgentAdapter({
    executable: process.execPath,
    args: [fakeAgent, mode],
    timeoutMs: overrides.timeoutMs ?? 5_000,
    maxInputBytes: 4_096,
    maxOutputBytes: overrides.maxOutputBytes ?? 4_096,
    environment: {},
  });
}

function commandOptions() {
  return {
    executable: process.execPath,
    args: [fakeAgent, "repair"],
    timeoutMs: 5_000,
    maxInputBytes: 4_096,
    maxOutputBytes: 4_096,
    environment: { EVAL_SENTINEL: "sentinel-value" },
  };
}

function metadata() {
  return {
    descriptorId: "fake-agent-local-v1",
    providerId: "fake-provider",
    modelId: "fake/model",
    modelRevision: "2026-07-11",
    adapter: artifact("command-adapter", "v1", "a"),
    prompt: artifact("repair-prompt", "v1", "b"),
    toolset: artifact("workspace-tools", "v1", "c"),
    dataset: artifact("golden-mutations", "v1", "d"),
  };
}

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}

async function goldenReport() {
  return parseAgentTrialReport(await readFile(new URL(
    "../../fixture-kit/fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8"));
}

function reportWithTrialId(report, trialId) {
  return createAgentTrialReport(
    [{ ...report.trials[0], trialId }],
    report.producerVersion,
  );
}

function context(root) {
  return {
    root,
    mutationId: "form-field-missing",
    baselineId: "tiny-tasks",
    diagnosticCodes: ["form.field_missing"],
    diagnosticReport,
  };
}

async function semanticFeaturePresent(root) {
  const html = await readFile(
    path.join(root, "src", "features", "tasks", "views", "index.html"),
    "utf8",
  );
  const source = await readFile(
    path.join(root, "src", "features", "tasks", "server", "create-task.ts"),
    "utf8",
  );
  return html.includes('name="title"') && source.includes("Synthetic fixture handler");
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-command-agent-"));
  try {
    await cp(fixture, root, { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function assertFileMissing(file) {
  await assert.rejects(readFile(file), (error) => error?.code === "ENOENT");
}
