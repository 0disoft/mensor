import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  materializeAgentAuthoredProjectArtifact,
  parseAgentAuthoredProjectArtifact,
  serializeAgentAuthoredProjectArtifact,
  validateAgentAuthoredProjectArtifact,
} from "../dist/src/index.js";

const schemaFile = fileURLToPath(new URL(
  "../spec/agent-authored-project-artifact-v1.schema.json",
  import.meta.url,
));
const transportBriefFile = fileURLToPath(new URL(
  "../briefs/response-artifact-v1.md",
  import.meta.url,
));
const responseCohortFile = fileURLToPath(new URL(
  "../cohorts/codex-subagents-response-v1.json",
  import.meta.url,
));
const responseReplayCohortFile = fileURLToPath(new URL(
  "../cohorts/codex-subagents-response-v1-oracle-v3-replay.json",
  import.meta.url,
));
const rsvpResponseCohortFile = fileURLToPath(new URL(
  "../cohorts/codex-subagents-rsvp-response-v1.json",
  import.meta.url,
));

test("canonicalizes and materializes one bounded response artifact", async () => {
  const artifact = validateAgentAuthoredProjectArtifact({
    schemaVersion: 1,
    kind: "agent-authored-project-artifact",
    files: [
      { path: "src/app.mjs", content: "export const value = 1;\n" },
      { path: "package.json", content: "{\"type\":\"module\"}\n" },
    ],
  });
  assert.deepEqual(artifact.files.map((file) => file.path), [
    "package.json",
    "src/app.mjs",
  ]);
  const serialized = serializeAgentAuthoredProjectArtifact(artifact);
  assert.ok(serialized.endsWith("\n"));
  assert.deepEqual(parseAgentAuthoredProjectArtifact(serialized), artifact);

  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(artifact), true, JSON.stringify(validate.errors));

  const root = await mkdtemp(path.join(tmpdir(), "mensor-artifact-"));
  try {
    assert.deepEqual(
      await materializeAgentAuthoredProjectArtifact(root, artifact),
      ["package.json", "src/app.mjs"],
    );
    assert.equal(
      await readFile(path.join(root, "src", "app.mjs"), "utf8"),
      "export const value = 1;\n",
    );
  } finally {
    await rm(root, { recursive: true, force: false });
  }
});

test("rejects path ambiguity and non-canonical text before writing", () => {
  for (const files of [
    [{ path: "../outside", content: "x\n" }],
    [
      { path: "A.txt", content: "a\n" },
      { path: "a.txt", content: "b\n" },
    ],
    [
      { path: "src", content: "file\n" },
      { path: "src/app.mjs", content: "nested\n" },
    ],
    [{ path: "bad.txt", content: "crlf\r\n" }],
    [{ path: "bad.txt", content: "no final newline" }],
  ]) {
    assert.throws(
      () => validateAgentAuthoredProjectArtifact({
        schemaVersion: 1,
        kind: "agent-authored-project-artifact",
        files,
      }),
    );
  }
});

test("fails closed on limits, unknown fields, and a non-empty root", async () => {
  assert.throws(
    () => validateAgentAuthoredProjectArtifact({
      schemaVersion: 1,
      kind: "agent-authored-project-artifact",
      files: [{ path: "large.txt", content: "abcd\n" }],
    }, { maxFileBytes: 4 }),
    /exceeds 4 bytes/,
  );
  assert.throws(
    () => validateAgentAuthoredProjectArtifact({
      schemaVersion: 1,
      kind: "agent-authored-project-artifact",
      files: [{ path: "a.txt", content: "a\n", mode: "executable" }],
    }),
    /unknown or missing fields/,
  );

  const root = await mkdtemp(path.join(tmpdir(), "mensor-artifact-nonempty-"));
  try {
    await writeFile(path.join(root, "existing.txt"), "user-owned\n", "utf8");
    await assert.rejects(
      materializeAgentAuthoredProjectArtifact(root, {
        schemaVersion: 1,
        kind: "agent-authored-project-artifact",
        files: [{ path: "new.txt", content: "new\n" }],
      }),
      /must be empty/,
    );
    assert.equal(
      await readFile(path.join(root, "existing.txt"), "utf8"),
      "user-owned\n",
    );
  } finally {
    await rm(root, { recursive: true, force: false });
  }
});

test("pins the no-write response cohort without claiming tool enforcement", async () => {
  const brief = await readFile(transportBriefFile, "utf8");
  assert.match(
    brief,
    /must not call filesystem, shell,\s+network, browser, or repository tools/,
  );
  assert.match(brief, /Return one JSON document and no Markdown fence/);
  assert.match(brief, /does not prove tool disablement/);

  const cohort = JSON.parse(await readFile(responseCohortFile, "utf8"));
  assert.equal(cohort.cohortId, "codex-subagents-response-v1");
  assert.equal(cohort.toolPolicy, "instruct-no-tools-not-host-enforced");
  assert.deepEqual(
    cohort.models.map(({ modelId }) => modelId),
    [
      "umans/umans-glm-5.2",
      "umans/umans-kimi-k2.7",
      "opencode-go/minimax-m3",
      "opencode-go/deepseek-v4-flash",
    ],
  );
});

test("pins corrected replay to response bytes and semantic oracle v3", async () => {
  const cohort = JSON.parse(await readFile(responseReplayCohortFile, "utf8"));
  assert.equal(
    cohort.cohortId,
    "codex-subagents-response-v1-oracle-v3-replay",
  );
  assert.equal(cohort.generationCohortId, "codex-subagents-response-v1");
  assert.equal(cohort.evaluationMode, "replay-pinned-response-artifact");
  assert.deepEqual(cohort.semanticOracle, {
    id: "guestbook-semantic-oracle",
    revision: "v3",
  });
});

test("pins three fresh RSVP response trials per requested model", async () => {
  const cohort = JSON.parse(await readFile(rsvpResponseCohortFile, "utf8"));
  assert.equal(cohort.cohortId, "codex-subagents-rsvp-response-v1");
  assert.equal(cohort.evaluationMode, "fresh-response-artifact");
  assert.equal(cohort.trialsPerModel, 3);
  assert.deepEqual(cohort.applicationBrief, { id: "rsvp", revision: "v2" });
  assert.deepEqual(cohort.semanticOracle, {
    id: "rsvp-semantic-oracle",
    revision: "v2",
  });
  assert.deepEqual(
    cohort.models.map(({ modelId }) => modelId),
    [
      "umans/umans-glm-5.2",
      "umans/umans-kimi-k2.7",
      "opencode-go/minimax-m3",
      "opencode-go/deepseek-v4-flash",
    ],
  );
});
