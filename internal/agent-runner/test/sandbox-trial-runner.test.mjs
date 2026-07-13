import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  parseSandboxAgentTrialOutcome,
  runSandboxAgentTrial,
  serializeSandboxAgentTrialOutcome,
} from "../dist/src/index.js";
import {
  inspection,
  metadata,
  sandboxEvidence,
} from "./support/sandbox-evidence-fixture.mjs";

const fixture = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);
const protectedFiles = [
  "mensor.project.jsonc",
  "src/features/tasks/feature.mensor.jsonc",
];
let sandbox;

test.before(async () => {
  sandbox = await sandboxEvidence({ timeoutMs: 1_000 });
});

test("creates evidence from one atomic sandbox-backed repair trial", async () => {
  await withFixture(async (root) => {
    const events = [];
    const outcome = await runSandboxAgentTrial(options(root, repairPort(events)));

    assert.equal(outcome.ok, true);
    assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
    assert.equal(outcome.evidence.report.trials[0]?.repaired, true);
    assert.equal(outcome.evidence.report.trials[0]?.adapterCompleted, true);
    assert.equal(outcome.evidence.report.trials[0]?.rounds, 1);
    assert.deepEqual(
      parseSandboxAgentTrialOutcome(serializeSandboxAgentTrialOutcome(outcome)),
      outcome,
    );
    const serialized = serializeSandboxAgentTrialOutcome(outcome);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("private-agent-argument"), false);
    assert.equal(serialized.includes("container-1"), false);
  });
});

test("keeps an attested failed trial when agent output is invalid", async () => {
  await withFixture(async (root) => {
    const events = [];
    const outcome = await runSandboxAgentTrial(
      options(root, repairPort(events, "invalid-output")),
    );

    assert.equal(outcome.ok, true);
    assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
    assert.equal(outcome.evidence.report.trials[0]?.adapterCompleted, false);
    assert.equal(outcome.evidence.report.trials[0]?.repaired, false);
    assert.equal(outcome.evidence.report.trials[0]?.failureCategory, "agent-error");
  });
});

test("returns a redacted cleanup failure instead of evidence", async () => {
  await withFixture(async (root) => {
    const events = [];
    const outcome = await runSandboxAgentTrial(
      options(root, repairPort(events, "cleanup-failure")),
    );

    assert.deepEqual(outcome, {
      schemaVersion: 1,
      ok: false,
      stage: "cleanup",
      category: "sandbox-cleanup-failed",
      report: outcome.report,
    });
    assert.equal(outcome.report?.trials[0]?.adapterCompleted, false);
    assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
    assert.equal(
      serializeSandboxAgentTrialOutcome(outcome).includes("daemon cleanup secret"),
      false,
    );
  });
});

test("classifies lifecycle failures without exposing port errors", async () => {
  for (const [mode, stage, category, expectedEvents] of [
    ["create-failure", "create", "sandbox-create-failed", ["create"]],
    ["inspect-failure", "inspect", "sandbox-inspection-failed", ["create", "inspect", "remove"]],
    ["start-failure", "execute", "sandbox-execution-failed", ["create", "inspect", "start", "remove"]],
  ]) {
    await withFixture(async (root) => {
      const events = [];
      const outcome = await runSandboxAgentTrial(options(root, repairPort(events, mode)));

      assert.equal(outcome.ok, false);
      assert.equal(outcome.stage, stage);
      assert.equal(outcome.category, category);
      assert.deepEqual(events, expectedEvents);
      assert.equal(
        serializeSandboxAgentTrialOutcome(outcome).includes("private port failure"),
        false,
      );
    });
  }
});

test("fails preflight before mutation or container creation", async () => {
  await withFixture(async (root) => {
    const events = [];
    const target = path.join(root, "src/features/tasks/views/index.html");
    const before = await readFile(target, "utf8");
    const outcome = await runSandboxAgentTrial({
      ...options(root, repairPort(events)),
      execution: {
        ...metadata(),
        sandboxAdapter: {
          ...metadata().sandboxAdapter,
          sha256: "f".repeat(64),
        },
      },
    });

    assert.deepEqual(outcome, {
      schemaVersion: 1,
      ok: false,
      stage: "prepare",
      category: "invalid-configuration",
      report: null,
    });
    assert.deepEqual(events, []);
    assert.equal(await readFile(target, "utf8"), before);
  });
});

test("keeps the outcome schema aligned with success and failure values", async () => {
  let success;
  await withFixture(async (root) => {
    success = await runSandboxAgentTrial(options(root, repairPort([])));
  });
  const failure = {
    schemaVersion: 1,
    ok: false,
    stage: "prepare",
    category: "invalid-configuration",
    report: null,
  };
  const schemaNames = [
    "sandbox-agent-trial-outcome-v1.schema.json",
    "agent-trial-evidence-v2.schema.json",
    "agent-execution-descriptor-v2.schema.json",
    "docker-sandbox-plan-commitment-v1.schema.json",
    "docker-sandbox-runtime-attestation-v1.schema.json",
    "docker-sandbox-conformance-report-v1.schema.json",
  ];
  const schemas = await Promise.all(schemaNames.map(async (name) => JSON.parse(
    await readFile(new URL(`../spec/${name}`, import.meta.url), "utf8"),
  )));
  const reportSchema = JSON.parse(await readFile(new URL(
    "../../fixture-kit/spec/agent-trial-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const [outcomeSchema, ...referencedSchemas] = schemas;
  const ajv = new Ajv2020({ strict: true });
  for (const schema of [...referencedSchemas, reportSchema]) {
    ajv.addSchema(schema);
  }
  const validate = ajv.compile(outcomeSchema);

  assert.equal(outcomeSchema.$id, "sandbox-agent-trial-outcome-v1.schema.json");
  assert.equal(validate(success), true, JSON.stringify(validate.errors));
  assert.equal(validate(failure), true, JSON.stringify(validate.errors));
  assert.deepEqual(parseSandboxAgentTrialOutcome(JSON.stringify(failure)), failure);
});

function options(root, port) {
  return {
    execution: metadata(),
    plan: sandbox.plan,
    portConformance: sandbox.conformance,
    port,
    producerVersion: "0.0.0-test",
    cleanupTimeoutMs: 500,
    trial: {
      trialId: "sandbox-atomic-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      semanticCheck: () => semanticFeaturePresent(root),
    },
  };
}

function repairPort(events, mode = "success") {
  const roots = new Map();
  return {
    async create(_plan, root) {
      events.push("create");
      if (mode === "create-failure") {
        throw new Error("private port failure");
      }
      roots.set("container-1", root);
      return "container-1";
    },
    async inspect() {
      events.push("inspect");
      if (mode === "inspect-failure") {
        throw new Error("private port failure");
      }
      return inspection({ timeoutMs: 1_000 });
    },
    async start(handle, input) {
      events.push("start");
      if (mode === "start-failure") {
        throw new Error("private port failure");
      }
      const root = roots.get(handle);
      assert.equal(typeof root, "string");
      const request = JSON.parse(new TextDecoder().decode(input));
      const diagnostic = request.diagnosticReport.diagnostics[0];
      const target = path.join(root, ...diagnostic.facts.template.split("/"));
      const html = await readFile(target, "utf8");
      await writeFile(target, html.replace(
        "      </label>",
        `        <input name="${diagnostic.facts.fieldName}" type="text" required="required" />\n      </label>`,
      ), "utf8");
      const stdout = new TextEncoder().encode(mode === "invalid-output"
        ? "not-json"
        : '{"schemaVersion":1,"rounds":1}\n');
      return {
        termination: "exited",
        exitCode: 0,
        stdout,
        combinedOutputBytes: stdout.byteLength,
      };
    },
    async remove(handle) {
      events.push("remove");
      roots.delete(handle);
      if (mode === "cleanup-failure") {
        throw new Error("daemon cleanup secret");
      }
    },
  };
}

async function semanticFeaturePresent(root) {
  const html = await readFile(
    path.join(root, "src/features/tasks/views/index.html"),
    "utf8",
  );
  return html.includes('name="title"');
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-sandbox-trial-"));
  try {
    await cp(fixture, root, { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
