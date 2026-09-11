import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentAuthoredProjectArtifact, materializeAgentAuthoredProjectArtifact } from "../internal/agent-runner/src/agent-authored-artifact.ts";
import { isPackageManagerExecutable } from "./lib/package-manager-entrypoint.mjs";
import { assertPackageContract, assertReviewedInput, runBounded, sha256 } from "./lib/onboarding-v3-evaluation.mjs";
import { assertAllowedCorrection } from "./lib/onboarding-v3-correction.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const staging = "dist/agent-onboarding/published-v3";
const originalFile = "internal/agent-runner/observations/published-onboarding-v3/trial-1.json";
const originalText = await readFile(path.join(root, originalFile), "utf8");
const original = JSON.parse(originalText);
const before = await readFile(path.join(root, staging, "raw/trial-1.txt"), "utf8");
const raw = await readFile(path.join(root, staging, "raw/correction-1.txt"), "utf8");
const originalReview = JSON.parse(await readFile(path.join(root, staging, "review.json"), "utf8"));
const review = JSON.parse(await readFile(path.join(root, staging, "correction-1-review.json"), "utf8"));
assertReviewedInput(originalReview, original.input, before);
assert.equal(review.executionReview, "approved-no-external-effects");
assert.equal(review.correctionCount, 1);
assert.equal(review.originalObservationSha256, sha256(originalText));
assert.equal(review.originalResponseSha256, original.responseSha256);
assert.equal(review.originalResponseSha256, sha256(before));
assert.equal(review.correctedResponseSha256, sha256(raw));
assert.equal(review.agentId, original.agentId);
const promptFile = "internal/agent-runner/briefs/published-onboarding-v3-correction-1.md";
assert.equal(review.correctionPromptSha256, sha256(await readFile(path.join(root, promptFile))));
const oracleFiles = ["internal/agent-runner/oracles/published-rsvp-onboarding-v4.test.mjs", "internal/agent-runner/oracles/rsvp-v3.test.mjs", "scripts/lib/rsvp-response-content.mjs", "pnpm-lock.yaml"];
assert.deepEqual(review.oracleInputs.map((entry) => entry.file), oracleFiles);
async function verifyInputs() {
  for (const entry of review.oracleInputs) assert.equal(sha256(await readFile(path.join(root, entry.file))), entry.sha256);
  assert.equal(sha256(await readFile(path.join(root, originalFile))), sha256(originalText));
}
await verifyInputs();
const artifact = parseAgentAuthoredProjectArtifact(raw);
const originalArtifact = parseAgentAuthoredProjectArtifact(before);
const entrypoint = process.env.npm_execpath;
assert.ok(entrypoint, "Run through the configured pnpm script");
const output = await open(path.join(root, "internal/agent-runner/observations/published-onboarding-v3/correction-1.json"), "wx");
const observation = {
  schemaVersion: 1, kind: "published-onboarding-v3-correction",
  independentSample: false, correctionCount: 1, furtherCorrectionsAllowed: false,
  agentId: review.agentId, identity: original.identity,
  originalObservation: { file: originalFile, sha256: sha256(originalText) },
  originalResponseSha256: sha256(before), correctedResponseSha256: sha256(raw),
  correctionInput: { file: promptFile, sha256: review.correctionPromptSha256, guidance: "diagnostic-plus-updated-public-enum-documentation" },
  oracleInputs: review.oracleInputs, changedFiles: [], runtimeAndTemplateUnchanged: false,
  phase: "change-review", success: false, packageContract: "not-run", install: "not-run", semantic: "not-run", mensor: "not-run",
};
let temporaryRoot;
try {
  observation.changedFiles = assertAllowedCorrection(originalArtifact, artifact);
  observation.runtimeAndTemplateUnchanged = true;
  observation.phase = "package-contract";
  assertPackageContract(artifact);
  observation.packageContract = "passed";
  temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-correction-1-"));
  const project = path.join(temporaryRoot, "project");
  await mkdir(project);
  await materializeAgentAuthoredProjectArtifact(project, artifact);
  const config = path.join(temporaryRoot, "empty.npmrc");
  await (await open(config, "wx")).close();
  const env = { CI: "1", NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: config };
  for (const name of ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  observation.phase = "install";
  const native = isPackageManagerExecutable(entrypoint);
  const installed = runBounded(native ? entrypoint : process.execPath, [
    ...(native ? [] : [entrypoint]), "install", "--ignore-scripts", "--lockfile=false",
    "--registry=https://registry.npmjs.org/", `--store-dir=${path.join(temporaryRoot, "store")}`,
  ], project, env, 120000);
  observation.install = { outcome: installed.outcome, exitCode: installed.code };
  assert.equal(installed.outcome, "completed");
  assert.equal(installed.code, 0, "Public package installation failed");
  for (const name of ["cli", "compiler", "contract", "reference-runtime"]) {
    const packageRoot = path.join(project, "node_modules/@0disoft", `mensor-${name}`);
    const relative = path.relative(temporaryRoot, await realpath(packageRoot));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(metadata.name, `@0disoft/mensor-${name}`);
    assert.equal(metadata.version, "0.10.0");
  }
  await verifyInputs();
  observation.phase = "semantic";
  const semantic = runBounded(process.execPath, ["--test", "--test-reporter=tap", path.join(root, oracleFiles[0])], project, {}, 30000);
  observation.semantic = {
    outcome: semantic.outcome, exitCode: semantic.code,
    tests: Number(semantic.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? 0),
    passed: Number(semantic.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? 0),
  };
  observation.phase = "mensor";
  const checked = runBounded(process.execPath, [path.join(project, "node_modules/@0disoft/mensor-cli/dist/src/bin.js"), "check", ".", "--json", "--report-version", "2"], project, {}, 30000);
  let report;
  try { report = JSON.parse(checked.stdout); } catch { report = null; }
  observation.mensor = {
    outcome: checked.outcome, exitCode: checked.code,
    passed: checked.outcome === "completed" && checked.code === 0 && report?.status === "passed",
    diagnosticCodes: report?.diagnostics?.map((item) => item.code) ?? [], failureCode: report?.failure?.code ?? null,
    inspection: report?.inspection ?? null,
  };
  observation.success = semantic.outcome === "completed" && semantic.code === 0
    && observation.semantic.tests === 7 && observation.semantic.passed === 7
    && observation.mensor.passed && report?.inspection?.forms?.state === "checked" && report?.inspection?.handlers?.state === "checked";
  await verifyInputs();
  observation.phase = "complete";
  if (semantic.code !== 0) process.stderr.write(semantic.stdout + semantic.stderr);
  if (!observation.mensor.passed) process.stderr.write(checked.stdout + checked.stderr);
} catch (error) {
  observation.success = false;
  observation.failure = error.code ?? error.name;
  process.stderr.write(`${observation.phase}: ${error.message}\n`);
} finally {
  try {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    observation.success = false;
    observation.failure = "cleanup-failed";
    process.stderr.write(`${error.message}\n`);
  } finally {
    await output.writeFile(`${JSON.stringify(observation, null, 2)}\n`);
    await output.close();
  }
}
process.stdout.write(`${JSON.stringify(observation, null, 2)}\n`);
process.exitCode = observation.success ? 0 : 1;
