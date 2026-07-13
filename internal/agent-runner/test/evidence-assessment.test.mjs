import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import { parseAgentTrialReport } from "@mensor/fixture-kit";
import {
  assessAgentTrialEvidence,
  createAgentTrialEvidence,
  createCommandExecutionDescriptor,
  parseAgentEvidenceAssessment,
  publicRepairRateBlockers,
  serializeAgentEvidenceAssessment,
} from "../dist/src/index.js";

test("blocks local command evidence from public repair-rate claims", async () => {
  const assessment = assessAgentTrialEvidence(await evidence());
  assert.equal(assessment.claimLevel, "protocol-integrity-only");
  assert.equal(assessment.eligibleForPublicRepairRate, false);
  assert.deepEqual(assessment.blockers, publicRepairRateBlockers);
  assert.deepEqual(
    parseAgentEvidenceAssessment(serializeAgentEvidenceAssessment(assessment)),
    assessment,
  );
});

test("rejects a forged public eligibility claim", async () => {
  const assessment = assessAgentTrialEvidence(await evidence());
  assert.throws(
    () => parseAgentEvidenceAssessment(JSON.stringify({
      ...assessment,
      eligibleForPublicRepairRate: true,
      blockers: [],
    })),
    /invalid claim boundary/,
  );
});

test("keeps the assessment schema aligned with canonical output", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../spec/agent-evidence-assessment-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const assessment = assessAgentTrialEvidence(await evidence());
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(assessment), true, JSON.stringify(validate.errors));
  assert.deepEqual(schema.properties.blockers.const, publicRepairRateBlockers);
});

async function evidence() {
  const report = parseAgentTrialReport(await readFile(new URL(
    "../../fixture-kit/fixtures/agent-trial-report-v1.json",
    import.meta.url,
  ), "utf8"));
  const descriptor = createCommandExecutionDescriptor({
    descriptorId: "assessment-local-v1",
    providerId: "fake-provider",
    modelId: "fake/model",
    modelRevision: null,
    adapter: artifact("adapter", "v1", "a"),
    prompt: artifact("prompt", "v1", "b"),
    toolset: artifact("toolset", "v1", "c"),
    dataset: artifact("dataset", "v1", "d"),
  }, {
    executable: process.execPath,
    args: [],
    environment: {},
    timeoutMs: 1_000,
    maxInputBytes: 1_024,
    maxOutputBytes: 1_024,
  });
  return createAgentTrialEvidence(descriptor, report);
}

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}
