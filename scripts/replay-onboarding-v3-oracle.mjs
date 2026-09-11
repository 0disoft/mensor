import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentAuthoredProjectArtifact, materializeAgentAuthoredProjectArtifact } from "../internal/agent-runner/src/agent-authored-artifact.ts";
import { assertPackageContract, assertReviewedInput, runBounded, sha256 } from "./lib/onboarding-v3-evaluation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const originalFile = "internal/agent-runner/observations/published-onboarding-v3/trial-1.json";
const originalText = await readFile(path.join(root, originalFile), "utf8");
const original = JSON.parse(originalText);
const raw = await readFile(path.join(root, "dist/agent-onboarding/published-v3/raw/trial-1.txt"), "utf8");
const receipt = JSON.parse(await readFile(path.join(root, "dist/agent-onboarding/published-v3/review.json"), "utf8"));
assert.equal(original.kind, "published-onboarding-v3-evaluation");
assert.equal(original.phase, "complete");
assert.equal(original.responseSha256, sha256(raw));
assert.equal(original.agentId, receipt.agentId);
assertReviewedInput(receipt, original.input, raw);
for (const file of original.input.oracleDigests) {
  assert.equal(sha256(await readFile(path.join(root, file.file))), file.sha256, "Historical oracle changed");
}
const artifact = parseAgentAuthoredProjectArtifact(raw);
assertPackageContract(artifact);
const oracle = "internal/agent-runner/oracles/published-rsvp-onboarding-v4.test.mjs";
const files = [oracle, "internal/agent-runner/oracles/rsvp-v3.test.mjs", "scripts/lib/rsvp-response-content.mjs", "scripts/replay-onboarding-v3-oracle.mjs", "pnpm-lock.yaml"];
const inputs = [];
for (const file of files) inputs.push({ file, sha256: sha256(await readFile(path.join(root, file))) });
const outputFile = path.join(root, "internal/agent-runner/observations/published-onboarding-v3/oracle-v4-replay.json");
const output = await open(outputFile, "wx");
let temporaryRoot;
const observation = {
  schemaVersion: 1, kind: "published-onboarding-v3-oracle-replay",
  independentSample: false, artifactModified: false, correctionCount: 0,
  originalObservation: { file: originalFile, sha256: sha256(originalText) },
  responseSha256: sha256(raw), originalInput: original.input, oracleInputs: inputs,
  packageInstallation: "not-repeated", mensorCheck: "not-repeated",
  originalMensor: original.mensor, semanticPassed: false,
};
try {
  temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-oracle-v4-replay-"));
  const project = path.join(temporaryRoot, "project");
  await mkdir(project);
  await materializeAgentAuthoredProjectArtifact(project, artifact);
  const result = runBounded(process.execPath, ["--test", "--test-reporter=tap", path.join(root, oracle)], project, {}, 30000);
  observation.semanticPassed = result.outcome === "completed" && result.code === 0;
  observation.semantic = {
    outcome: result.outcome, exitCode: result.code,
    tests: Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? 0),
    passed: Number(result.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? 0),
    failed: Number(result.stdout.match(/^# fail (\d+)$/mu)?.[1] ?? 0),
  };
  assert.equal(observation.semantic.tests, 7, "Replay must execute the full revised oracle");
  assert.equal(sha256(await readFile(path.join(root, originalFile))), observation.originalObservation.sha256);
  for (const file of inputs) assert.equal(sha256(await readFile(path.join(root, file.file))), file.sha256, "Replay inputs changed");
  if (!observation.semanticPassed) process.stderr.write(result.stdout + result.stderr);
} catch (error) {
  observation.semanticPassed = false;
  observation.failure = error.code ?? error.name;
  process.stderr.write(`${error.message}\n`);
} finally {
  try {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  } finally {
    await output.writeFile(`${JSON.stringify(observation, null, 2)}\n`);
    await output.close();
  }
}
process.stdout.write(`${JSON.stringify(observation, null, 2)}\n`);
process.exitCode = observation.semanticPassed ? 0 : 1;
