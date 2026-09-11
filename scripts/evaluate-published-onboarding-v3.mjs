import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentAuthoredProjectArtifact, materializeAgentAuthoredProjectArtifact } from "../internal/agent-runner/src/agent-authored-artifact.ts";
import { prepareInput } from "./prepare-published-onboarding-v3.mjs";
import { isPackageManagerExecutable } from "./lib/package-manager-entrypoint.mjs";
import { assertPackageContract, assertReviewedInput, inputIdentity, runBounded, sha256 } from "./lib/onboarding-v3-evaluation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = await prepareInput();
const profile = input.profile;
const raw = await readFile(path.join(root, profile.rawResponsePath), "utf8");
const receipt = JSON.parse(await readFile(path.join(root, "dist/agent-onboarding/published-v3/review.json"), "utf8"));
assertReviewedInput(receipt, input, raw);
const artifact = parseAgentAuthoredProjectArtifact(raw);
const entrypoint = process.env.npm_execpath;
assert.ok(entrypoint, "Run through the configured pnpm intent");
const outputFile = path.join(root, profile.observationPath);
await mkdir(path.dirname(outputFile), { recursive: true });
// Exclusive creation prevents retries from replacing any previous trial verdict.
const output = await open(outputFile, "wx");
let temporaryRoot;
const observation = {
  schemaVersion: 1, kind: "published-onboarding-v3-evaluation", cohortId: profile.cohortId,
  classification: profile.classification, baselineCommit: receipt.baselineCommit,
  identity: receipt.identity, agentId: receipt.agentId, input: inputIdentity(input),
  responseSha256: sha256(raw), generatedFiles: artifact.files.map((file) => file.path),
  correctionCount: 0, phase: "package-contract", success: false,
  packageContract: "not-run", install: "not-run", semantic: "not-run", mensor: "not-run",
};
try {
  assertPackageContract(artifact);
  observation.packageContract = "passed";
  temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-onboarding-v3-"));
  const project = path.join(temporaryRoot, "project");
  await mkdir(project);
  await materializeAgentAuthoredProjectArtifact(project, artifact);
  const config = path.join(temporaryRoot, "empty.npmrc");
  const configHandle = await open(config, "wx");
  await configHandle.close();
  const env = { CI: "1", NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: config };
  for (const name of ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  const native = isPackageManagerExecutable(entrypoint);
  observation.phase = "install";
  const installed = runBounded(native ? entrypoint : process.execPath, [
    ...(native ? [] : [entrypoint]), "install", "--ignore-scripts", "--lockfile=false",
    `--registry=${profile.registry}`, `--store-dir=${path.join(temporaryRoot, "store")}`,
  ], project, env, profile.executionLimits.installSeconds * 1000);
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
  assertReviewedInput(receipt, await prepareInput(), raw);
  observation.phase = "semantic";
  const semantic = runBounded(process.execPath, ["--test", path.join(root, profile.oracle)], project, {}, profile.executionLimits.semanticSeconds * 1000);
  observation.semantic = { outcome: semantic.outcome, exitCode: semantic.code, passed: semantic.outcome === "completed" && semantic.code === 0 };
  observation.phase = "mensor";
  const checked = runBounded(process.execPath, [
    path.join(project, "node_modules/@0disoft/mensor-cli/dist/src/bin.js"), "check", ".", "--json", "--report-version", "2",
  ], project, {}, profile.executionLimits.checkSeconds * 1000);
  let report;
  try { report = JSON.parse(checked.stdout); } catch { report = null; }
  observation.mensor = {
    outcome: checked.outcome, exitCode: checked.code,
    passed: checked.outcome === "completed" && checked.code === 0 && report?.status === "passed",
    diagnosticCodes: report?.diagnostics?.map((item) => item.code) ?? [],
    failureCode: report?.failure?.code ?? null, inspection: report?.inspection ?? null,
  };
  observation.success = observation.semantic.passed && observation.mensor.passed;
  observation.phase = "complete";
  if (!observation.semantic.passed) process.stderr.write(semantic.stdout.slice(0, 65536));
  if (!observation.mensor.passed) process.stderr.write(checked.stdout.slice(0, 65536));
} catch (error) {
  observation.failure = error.code ?? error.name;
  process.stderr.write(`Evaluation stopped in ${observation.phase}: ${error.message}\n`);
} finally {
  try {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  } finally {
    await output.writeFile(`${JSON.stringify(observation, null, 2)}\n`);
    await output.close();
  }
}
process.stdout.write(`${JSON.stringify(observation, null, 2)}\n`);
process.exitCode = observation.success ? 0 : 1;
