import assert from "node:assert/strict";
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
    "../spec/agent-authored-build-exploratory-observation-v3.schema.json",
    import.meta.url,
  ),
);
const responseObservationRoot = fileURLToPath(new URL(
  "../observations/codex-subagents-response-v1/",
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
      artifact: { completed: true, accepted: false },
    }),
    /cannot produce evaluated project state/,
  );
  const rejected = createObservation({
    artifact: { completed: true, accepted: false },
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
  assert.deepEqual(observations.map(({ success }) => success), [false, true, true]);
  assert.ok(observations.every((observation) =>
    observation.claimLevel === "exploratory-only"
    && observation.environment.toolControl === "not-enforced"
    && observation.outputTransport.id === "response-artifact"
    && observation.outputTransport.revision === "v1"
  ));
  assert.equal(observations[0].finalState.artifactAccepted, false);
  assert.ok(observations.slice(1).every((observation) =>
    observation.finalState.artifactAccepted
    && observation.finalState.semanticTestsPassed
    && observation.finalState.mensorCheckPassed
  ));
});

function createObservation(overrides = {}) {
  return createAgentAuthoredBuildExploratoryObservation({
    observationId: "guestbook.glm-5.2.1",
    producerVersion: "0.0.57",
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
    artifact: { completed: true, accepted: true },
    semanticTest: { completed: true, passed: true },
    mensorCheck: { completed: true, passed: true, diagnosticCodes: [] },
    generatedFiles: [
      "src/features/guestbook/feature.mensor.jsonc",
      "mensor.project.jsonc",
    ],
    ...overrides,
  });
}
