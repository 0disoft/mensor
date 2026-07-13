import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createAgentTrialReport,
  parseAgentTrialReport,
} from "../../fixture-kit/dist/src/index.js";
import {
  createDockerSandboxPlanCommitment,
  createSandboxAgentTrialEvidence,
  createSandboxExecutionDescriptor,
  mergeSandboxAgentTrialEvidence,
  parseSandboxAgentTrialEvidence,
  serializeSandboxAgentTrialEvidence,
} from "../dist/src/index.js";
import {
  metadata,
  sandboxEvidence,
} from "./support/sandbox-evidence-fixture.mjs";

test("binds publish-safe sandbox artifacts and a trial report into evidence v2", async () => {
  const fixture = await boundFixture();
  const serialized = serializeSandboxAgentTrialEvidence(fixture.evidence);

  assert.equal(fixture.evidence.schemaVersion, 2);
  assert.deepEqual(parseSandboxAgentTrialEvidence(serialized), fixture.evidence);
  assert.equal(serialized.includes(fixture.artifacts.plan.dockerExecutable), false);
  assert.equal(serialized.includes("private-agent-argument"), false);
  assert.equal(serialized.includes("container-1"), false);
});

test("rejects runtime limits and conformance artifacts from another plan", async () => {
  const fixture = await boundFixture();
  const attestationDrift = {
    ...fixture.artifacts.attestation,
    limits: { ...fixture.artifacts.attestation.limits, memoryMiB: 1024 },
  };
  assert.throws(
    () => createSandboxAgentTrialEvidence(
      fixture.descriptor,
      fixture.commitment,
      attestationDrift,
      fixture.artifacts.conformance,
      fixture.report,
    ),
    /does not bind the plan commitment/,
  );

  const basePlanDrift = {
    ...fixture.artifacts.conformance,
    probe: {
      ...fixture.artifacts.conformance.probe,
      basePlanSha256: "0".repeat(64),
    },
  };
  assert.throws(
    () => createSandboxAgentTrialEvidence(
      fixture.descriptor,
      fixture.commitment,
      fixture.artifacts.attestation,
      basePlanDrift,
      fixture.report,
    ),
    /does not bind the base plan commitment/,
  );

  const casePlanDrift = {
    ...fixture.artifacts.conformance,
    cases: fixture.artifacts.conformance.cases.map((item, index) =>
      index === 0 ? { ...item, planSha256: "0".repeat(64) } : item),
  };
  assert.throws(
    () => createSandboxAgentTrialEvidence(
      fixture.descriptor,
      fixture.commitment,
      fixture.artifacts.attestation,
      casePlanDrift,
      fixture.report,
    ),
    /does not bind its probe plan/,
  );
});

test("rejects evidence fingerprint drift after standalone parsing", async () => {
  const fixture = await boundFixture();
  assert.throws(
    () => parseSandboxAgentTrialEvidence(JSON.stringify({
      ...fixture.evidence,
      executionFingerprint: "0".repeat(64),
    })),
    /canonical bindings and ordering/,
  );
});

test("merges only byte-identical sandbox evidence cohorts", async () => {
  const fixture = await boundFixture();
  const first = createSandboxAgentTrialEvidence(
    fixture.descriptor,
    fixture.commitment,
    fixture.artifacts.attestation,
    fixture.artifacts.conformance,
    reportWithTrialId(fixture.report, "sandbox-cohort-2"),
  );
  const second = createSandboxAgentTrialEvidence(
    fixture.descriptor,
    fixture.commitment,
    fixture.artifacts.attestation,
    fixture.artifacts.conformance,
    reportWithTrialId(fixture.report, "sandbox-cohort-1"),
  );
  const merged = mergeSandboxAgentTrialEvidence([first, second]);
  const reversed = mergeSandboxAgentTrialEvidence([second, first]);

  assert.equal(
    serializeSandboxAgentTrialEvidence(merged),
    serializeSandboxAgentTrialEvidence(reversed),
  );
  assert.deepEqual(merged.report.trials.map((trial) => trial.trialId), [
    "sandbox-cohort-1",
    "sandbox-cohort-2",
  ]);
  assert.throws(
    () => mergeSandboxAgentTrialEvidence([first, first]),
    /Duplicate agent trial ID/,
  );
  assert.throws(
    () => mergeSandboxAgentTrialEvidence([]),
    /at least one evidence item/,
  );

  const other = await boundFixture({ memoryMiB: 1024 });
  assert.throws(
    () => mergeSandboxAgentTrialEvidence([
      first,
      createSandboxAgentTrialEvidence(
        other.descriptor,
        other.commitment,
        other.artifacts.attestation,
        other.artifacts.conformance,
        reportWithTrialId(other.report, "sandbox-cohort-3"),
      ),
    ]),
    /cannot mix execution artifacts/,
  );
});

test("keeps evidence v2 schema references aligned with canonical output", async () => {
  const fixture = await boundFixture();
  const schemas = await Promise.all([
    "agent-trial-evidence-v2.schema.json",
    "agent-execution-descriptor-v2.schema.json",
    "docker-sandbox-plan-commitment-v1.schema.json",
    "docker-sandbox-runtime-attestation-v1.schema.json",
    "docker-sandbox-conformance-report-v1.schema.json",
  ].map(async (name) => JSON.parse(await readFile(new URL(`../spec/${name}`, import.meta.url), "utf8"))));
  const reportSchema = JSON.parse(await readFile(new URL(
    "../../fixture-kit/spec/agent-trial-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const [evidenceSchema, ...referencedSchemas] = schemas;
  const ajv = new Ajv2020({ strict: true });
  for (const schema of [...referencedSchemas, reportSchema]) {
    ajv.addSchema(schema);
  }
  const validate = ajv.compile(evidenceSchema);

  assert.equal(evidenceSchema.$id, "agent-trial-evidence-v2.schema.json");
  assert.equal(validate(fixture.evidence), true, JSON.stringify(validate.errors));
});

async function boundFixture(overrides = {}) {
  const artifacts = await sandboxEvidence(overrides);
  const commitment = createDockerSandboxPlanCommitment(artifacts.plan);
  const descriptor = createSandboxExecutionDescriptor(
    metadata(),
    artifacts.plan,
    artifacts.attestation,
    artifacts.conformance,
  );
  const report = parseAgentTrialReport(await readFile(new URL(
    "../../fixture-kit/fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8"));
  const evidence = createSandboxAgentTrialEvidence(
    descriptor,
    commitment,
    artifacts.attestation,
    artifacts.conformance,
    report,
  );
  return { artifacts, commitment, descriptor, report, evidence };
}

function reportWithTrialId(report, trialId) {
  return createAgentTrialReport([
    { ...report.trials[0], trialId },
  ], report.producerVersion);
}
