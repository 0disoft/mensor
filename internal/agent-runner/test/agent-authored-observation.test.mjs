import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  createAgentAuthoredBuildExploratoryObservation,
  parseAgentAuthoredBuildExploratoryObservation,
  serializeAgentAuthoredBuildExploratoryObservation,
  validateAgentAuthoredBuildExploratoryObservation,
} from "../dist/src/index.js";

const schemaFile = fileURLToPath(
  new URL(
    "../spec/agent-authored-build-exploratory-observation-v4.schema.json",
    import.meta.url,
  ),
);
const responseObservationRoot = fileURLToPath(new URL(
  "../observations/codex-subagents-response-v1-oracle-v3-replay/",
  import.meta.url,
));
const responseBriefFile = fileURLToPath(new URL(
  "../briefs/guestbook-v2.md",
  import.meta.url,
));
const responseTransportFile = fileURLToPath(new URL(
  "../briefs/response-artifact-v1.md",
  import.meta.url,
));
const responseOracleFile = fileURLToPath(new URL(
  "../oracles/guestbook-v3.test.mjs",
  import.meta.url,
));
const rsvpObservationRoot = fileURLToPath(new URL(
  "../observations/codex-subagents-rsvp-response-v1/",
  import.meta.url,
));
const rsvpBriefFile = fileURLToPath(new URL(
  "../briefs/rsvp-v2.md",
  import.meta.url,
));
const rsvpOracleFile = fileURLToPath(new URL(
  "../oracles/rsvp-v2.test.mjs",
  import.meta.url,
));
const publishedOnboardingObservationRoot = fileURLToPath(new URL(
  "../observations/codex-subagents-published-onboarding-v1/",
  import.meta.url,
));
const publishedOnboardingBriefFile = fileURLToPath(new URL(
  "../briefs/published-rsvp-onboarding-v1.md",
  import.meta.url,
));
const publishedOnboardingOracleFile = fileURLToPath(new URL(
  "../oracles/published-rsvp-onboarding-v1.test.mjs",
  import.meta.url,
));

test("creates a bounded exploratory-only observation", async () => {
  const observation = createObservation();
  assert.equal(observation.success, true);
  assert.equal(observation.claimLevel, "exploratory-only");
  assert.equal(observation.environment.repositoryVisibility, "not-enforced");
  assert.equal(observation.environment.toolControl, "not-enforced");
  assert.equal(observation.finalState.artifactAccepted, true);
  assert.deepEqual(observation.finalState.generatedFiles, [
    "mensor.project.jsonc",
    "src/features/guestbook/feature.mensor.jsonc",
  ]);
  assert.equal(JSON.stringify(observation).includes("C:\\"), false);
  const serialized = serializeAgentAuthoredBuildExploratoryObservation(observation);
  assert.ok(serialized.endsWith("\n"));
  assert.deepEqual(parseAgentAuthoredBuildExploratoryObservation(serialized), observation);

  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(observation), true, JSON.stringify(validate.errors));
});

test("derives failure without allowing isolation upgrades", () => {
  const observation = createObservation({
    semanticTest: { completed: true, passed: false },
  });
  assert.equal(observation.success, false);
  const forged = {
    ...observation,
    environment: {
      ...observation.environment,
      workspaceIsolation: "sandboxed-workspace-only",
    },
  };
  assert.throws(
    () => validateAgentAuthoredBuildExploratoryObservation(forged),
    /environment claims are fixed/,
  );
});

test("does not evaluate a rejected response artifact", () => {
  assert.throws(
    () => createObservation({
      artifact: {
        completed: true,
        accepted: false,
        responseSha256: "e".repeat(64),
      },
    }),
    /cannot produce evaluated project state/,
  );
  const rejected = createObservation({
    artifact: {
      completed: true,
      accepted: false,
      responseSha256: "e".repeat(64),
    },
    semanticTest: { completed: false, passed: false },
    mensorCheck: { completed: false, passed: false, diagnosticCodes: [] },
    generatedFiles: [],
  });
  assert.equal(rejected.success, false);
});

test("rejects host paths and forged success while canonicalizing facts", () => {
  assert.throws(
    () => createObservation({ generatedFiles: ["C:\\secret.txt"] }),
    /root-relative POSIX paths/,
  );
  const observation = createObservation({
    mensorCheck: {
      completed: true,
      passed: false,
      diagnosticCodes: ["form.field_missing"],
    },
  });
  assert.throws(
    () => validateAgentAuthoredBuildExploratoryObservation({
      ...observation,
      success: true,
    }),
    /success must be derived/,
  );
  assert.deepEqual(
    createObservation({
      generatedFiles: ["z.txt", "a.txt", "z.txt"],
    }).finalState.generatedFiles,
    ["a.txt", "z.txt"],
  );
});

test("keeps response-cohort observations canonical and exploratory", async () => {
  const files = (await readdir(responseObservationRoot)).sort();
  assert.deepEqual(files, ["glm-5.2.json", "kimi-k2.7.json", "minimax-m3.json"]);
  const observations = await Promise.all(files.map(async (file) =>
    parseAgentAuthoredBuildExploratoryObservation(
      await readFile(path.join(responseObservationRoot, file), "utf8"),
    )
  ));
  const [briefSha256, transportSha256, oracleSha256] = await Promise.all([
    digestFile(responseBriefFile),
    digestFile(responseTransportFile),
    digestFile(responseOracleFile),
  ]);
  assert.deepEqual(observations.map(({ success }) => success), [false, false, true]);
  assert.ok(observations.every((observation) =>
    observation.claimLevel === "exploratory-only"
    && observation.environment.toolControl === "not-enforced"
    && observation.outputTransport.id === "response-artifact"
    && observation.outputTransport.revision === "v1"
    && observation.brief.sha256 === briefSha256
    && observation.outputTransport.sha256 === transportSha256
    && observation.semanticOracle.sha256 === oracleSha256
  ));
  assert.equal(observations[0].finalState.artifactAccepted, false);
  assert.equal(observations[1].finalState.semanticTestsPassed, false);
  assert.equal(observations[2].finalState.semanticTestsPassed, true);
  assert.ok(observations.slice(1).every((observation) =>
    observation.finalState.artifactAccepted
    && observation.finalState.mensorCheckPassed
    && observation.finalState.artifactResponseSha256 !== null
  ));
});

test("keeps every repeated RSVP response trial separate and canonical", async () => {
  const files = (await readdir(rsvpObservationRoot)).sort();
  assert.deepEqual(files, [
    "deepseek-v4-flash-trial-1.json",
    "deepseek-v4-flash-trial-2.json",
    "deepseek-v4-flash-trial-3.json",
    "glm-5.2-trial-1.json",
    "glm-5.2-trial-2.json",
    "glm-5.2-trial-3.json",
    "kimi-k2.7-trial-1.json",
    "kimi-k2.7-trial-2.json",
    "kimi-k2.7-trial-3.json",
    "minimax-m3-trial-1.json",
    "minimax-m3-trial-2.json",
    "minimax-m3-trial-3.json",
  ]);
  const observations = await Promise.all(files.map(async (file) => {
    const serialized = await readFile(path.join(rsvpObservationRoot, file), "utf8");
    const observation = parseAgentAuthoredBuildExploratoryObservation(serialized);
    assert.equal(
      serializeAgentAuthoredBuildExploratoryObservation(observation),
      serialized,
    );
    return observation;
  }));
  const [briefSha256, transportSha256, oracleSha256] = await Promise.all([
    digestFile(rsvpBriefFile),
    digestFile(responseTransportFile),
    digestFile(rsvpOracleFile),
  ]);
  assert.ok(observations.every((observation) =>
    observation.baselineCommit === "f4046e0f2f11f6f18df0aeb2998f45208d5dc2aa"
    && observation.identity.cohortId === "codex-subagents-rsvp-response-v1"
    && observation.claimLevel === "exploratory-only"
    && observation.environment.toolControl === "not-enforced"
    && observation.brief.sha256 === briefSha256
    && observation.outputTransport.sha256 === transportSha256
    && observation.semanticOracle.sha256 === oracleSha256
  ));

  const byModel = new Map();
  for (const observation of observations) {
    const modelTrials = byModel.get(observation.identity.modelId) ?? [];
    modelTrials.push(observation);
    byModel.set(observation.identity.modelId, modelTrials);
  }
  assert.deepEqual([...byModel.keys()].sort(), [
    "opencode-go/deepseek-v4-flash",
    "opencode-go/minimax-m3",
    "umans/umans-glm-5.2",
    "umans/umans-kimi-k2.7",
  ]);
  assert.ok([...byModel.values()].every((trials) => trials.length === 3));
  assert.deepEqual(
    byModel.get("umans/umans-kimi-k2.7").map((observation) => ({
      completed: observation.finalState.artifactCompleted,
      accepted: observation.finalState.artifactAccepted,
      semantic: observation.finalState.semanticTestsPassed,
      mensor: observation.finalState.mensorCheckPassed,
      success: observation.success,
    })),
    [
      { completed: true, accepted: true, semantic: false, mensor: true, success: false },
      { completed: true, accepted: false, semantic: false, mensor: false, success: false },
      { completed: true, accepted: true, semantic: false, mensor: true, success: false },
    ],
  );
  assert.ok(observations
    .filter(({ identity }) => identity.modelId !== "umans/umans-kimi-k2.7")
    .every((observation) =>
      !observation.finalState.artifactCompleted
      && observation.finalState.artifactResponseSha256 === null
      && observation.finalState.generatedFiles.length === 0
      && !observation.success
    ));
});

test("records the published package onboarding cohort without substituting models", async () => {
  const files = (await readdir(publishedOnboardingObservationRoot)).sort();
  assert.deepEqual(files, [
    "deepseek-v4-flash.json",
    "umans-glm-5.2.json",
    "umans-kimi-k2.7.json",
  ]);
  const observations = await Promise.all(files.map(async (file) =>
    parseAgentAuthoredBuildExploratoryObservation(
      await readFile(
        path.join(publishedOnboardingObservationRoot, file),
        "utf8",
      ),
    )
  ));
  const [briefSha256, transportSha256, oracleSha256] = await Promise.all([
    digestFile(publishedOnboardingBriefFile),
    digestFile(responseTransportFile),
    digestFile(publishedOnboardingOracleFile),
  ]);
  assert.ok(observations.every((observation) =>
    observation.baselineCommit === "12724813a9e0d63c9b65525df50ff9e02cc66f16"
    && observation.identity.cohortId
      === "codex-subagents-published-onboarding-v1"
    && observation.brief.sha256 === briefSha256
    && observation.outputTransport.sha256 === transportSha256
    && observation.semanticOracle.sha256 === oracleSha256
    && observation.claimLevel === "exploratory-only"
  ));
  const byModel = new Map(
    observations.map((observation) => [observation.identity.modelId, observation]),
  );
  assert.deepEqual([...byModel.keys()].sort(), [
    "opencode-go/deepseek-v4-flash",
    "umans/umans-glm-5.2",
    "umans/umans-kimi-k2.7",
  ]);
  for (const modelId of [
    "opencode-go/deepseek-v4-flash",
    "umans/umans-glm-5.2",
  ]) {
    const observation = byModel.get(modelId);
    assert.equal(observation.finalState.artifactCompleted, false);
    assert.equal(observation.finalState.artifactAccepted, false);
    assert.equal(observation.success, false);
  }
  const kimi = byModel.get("umans/umans-kimi-k2.7");
  assert.equal(kimi.finalState.artifactCompleted, true);
  assert.equal(kimi.finalState.artifactAccepted, true);
  assert.equal(kimi.finalState.semanticTestsPassed, false);
  assert.equal(kimi.finalState.mensorCheckPassed, true);
  assert.deepEqual(kimi.finalState.diagnosticCodes, []);
  assert.equal(kimi.success, false);
});

function createObservation(overrides = {}) {
  return createAgentAuthoredBuildExploratoryObservation({
    observationId: "guestbook.glm-5.2.1",
    producerVersion: "0.1.0",
    baselineCommit: "a".repeat(40),
    identity: {
      runnerId: "codex-subagent",
      providerId: "umans",
      modelId: "umans/umans-glm-5.2",
      reasoningEffort: "high",
      cohortId: "codex-subagents-v2",
    },
    brief: {
      id: "guestbook",
      revision: "v2",
      sha256: "b".repeat(64),
    },
    semanticOracle: {
      id: "guestbook-semantic-oracle",
      revision: "v2",
      sha256: "c".repeat(64),
    },
    outputTransport: {
      id: "response-artifact",
      revision: "v1",
      sha256: "d".repeat(64),
    },
    artifact: {
      completed: true,
      accepted: true,
      responseSha256: "e".repeat(64),
    },
    semanticTest: { completed: true, passed: true },
    mensorCheck: { completed: true, passed: true, diagnosticCodes: [] },
    generatedFiles: [
      "src/features/guestbook/feature.mensor.jsonc",
      "mensor.project.jsonc",
    ],
    ...overrides,
  });
}

async function digestFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}
