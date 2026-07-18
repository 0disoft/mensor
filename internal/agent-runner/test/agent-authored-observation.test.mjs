import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    "../spec/agent-authored-build-exploratory-observation-v2.schema.json",
    import.meta.url,
  ),
);

test("creates a bounded exploratory-only observation", async () => {
  const observation = createObservation();
  assert.equal(observation.success, true);
  assert.equal(observation.claimLevel, "exploratory-only");
  assert.equal(observation.environment.repositoryVisibility, "not-enforced");
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

function createObservation(overrides = {}) {
  return createAgentAuthoredBuildExploratoryObservation({
    observationId: "guestbook.glm-5.2.1",
    producerVersion: "0.0.56",
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
    semanticTest: { completed: true, passed: true },
    mensorCheck: { completed: true, passed: true, diagnosticCodes: [] },
    generatedFiles: [
      "src/features/guestbook/feature.mensor.jsonc",
      "mensor.project.jsonc",
    ],
    ...overrides,
  });
}
