import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentAuthoredBuildExploratoryObservation,
  materializeAgentAuthoredProjectArtifact,
  parseAgentAuthoredProjectArtifact,
  serializeAgentAuthoredBuildExploratoryObservation,
} from "../internal/agent-runner/dist/src/index.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const rawRoot = path.join(
  repositoryRoot,
  "dist",
  "agent-onboarding",
  "published-v1",
  "raw",
);
const stagingRoot = path.join(
  repositoryRoot,
  "dist",
  "agent-onboarding",
  "published-v1",
  "observations",
);
const outputRoot = path.join(
  repositoryRoot,
  "internal",
  "agent-runner",
  "observations",
  "codex-subagents-published-onboarding-v1",
);
const cohortFile = path.join(
  repositoryRoot,
  "internal",
  "agent-runner",
  "cohorts",
  "codex-subagents-published-onboarding-v1.json",
);
const briefFile = path.join(
  repositoryRoot,
  "internal",
  "agent-runner",
  "briefs",
  "published-rsvp-onboarding-v1.md",
);
const transportFile = path.join(
  repositoryRoot,
  "internal",
  "agent-runner",
  "briefs",
  "response-artifact-v1.md",
);
const oracleFile = path.join(
  repositoryRoot,
  "internal",
  "agent-runner",
  "oracles",
  "published-rsvp-onboarding-v1.test.mjs",
);
const registry = "https://registry.npmjs.org/";
const packageManagerEntrypoint = process.env.npm_execpath;

if (
  packageManagerEntrypoint === undefined
  || packageManagerEntrypoint.length === 0
) {
  throw new Error("The onboarding evaluator must run through pnpm.");
}

const cohort = JSON.parse(await readFile(cohortFile, "utf8"));
assert.equal(cohort.cohortId, "codex-subagents-published-onboarding-v1");
assert.equal(cohort.trialsPerModel, 1);
assert.equal(cohort.publishedPackage.name, "@0disoft/mensor-cli");
assert.equal(cohort.publishedPackage.version, "0.1.0");
assert.equal(cohort.publishedPackage.registry, registry);
assert.match(cohort.baselineCommit, /^[a-f0-9]{40}$/u);

await prepareOutputTarget(outputRoot);
await mkdir(stagingRoot, { recursive: true });

const [briefSha256, transportSha256, oracleSha256] = await Promise.all([
  digestFile(briefFile),
  digestFile(transportFile),
  digestFile(oracleFile),
]);
const summaries = [];

try {
  for (const model of cohort.models) {
    const slug = model.modelId.split("/").at(-1);
    assert.match(model.responseFile, /^[a-z0-9][a-z0-9.-]*\.txt$/u);
    const rawFile = path.join(rawRoot, model.responseFile);
    const rawResponse = await readOptionalFile(rawFile);
    const result = await evaluateModel({
      model,
      slug,
      rawResponse,
      briefSha256,
      transportSha256,
      oracleSha256,
    });
    const outputFile = path.join(stagingRoot, `${slug}.json`);
    await writeFile(
      outputFile,
      serializeAgentAuthoredBuildExploratoryObservation(result.observation),
      "utf8",
    );
    summaries.push(result.summary);
  }
  await rename(stagingRoot, outputRoot);
} finally {
  await rm(path.dirname(rawRoot), { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  kind: "published-onboarding-evaluation",
  cohortId: cohort.cohortId,
  package: cohort.publishedPackage,
  results: summaries,
}, null, 2)}\n`);

async function evaluateModel({
  model,
  slug,
  rawResponse,
  briefSha256,
  transportSha256,
  oracleSha256,
}) {
  const completed = rawResponse.length > 0;
  const responseSha256 = completed ? digestText(rawResponse) : null;
  let artifact;
  try {
    artifact = completed
      ? parseAgentAuthoredProjectArtifact(rawResponse)
      : null;
  } catch {
    artifact = null;
  }

  let generatedFiles = [];
  let semanticTest = { completed: false, passed: false };
  let mensorCheck = {
    completed: false,
    passed: false,
    diagnosticCodes: [],
  };
  let packageContractPassed = false;

  if (artifact !== null) {
    const temporaryRoot = await mkdtemp(
      path.join(tmpdir(), `mensor-published-onboarding-${slug}-`),
    );
    const projectRoot = path.join(temporaryRoot, "project");
    const storeRoot = path.join(temporaryRoot, "pnpm-store");
    const npmUserConfig = path.join(temporaryRoot, "empty.npmrc");
    try {
      await mkdir(projectRoot);
      await writeFile(npmUserConfig, "", "utf8");
      generatedFiles = await materializeAgentAuthoredProjectArtifact(
        projectRoot,
        artifact,
      );
      packageContractPassed = await validatePackageContract(projectRoot);
      if (packageContractPassed) {
        const install = await runPackageManager(
          [
            "install",
            "--ignore-scripts",
            "--lockfile=false",
            "--prefer-offline=false",
            `--registry=${registry}`,
            `--store-dir=${storeRoot}`,
          ],
          projectRoot,
          npmUserConfig,
          120_000,
        );
        if (install.code === 0) {
          await verifyInstalledCli(projectRoot, temporaryRoot);
          const semantic = await capture(
            process.execPath,
            ["--test", oracleFile],
            projectRoot,
            {},
            30_000,
          );
          semanticTest = {
            completed: true,
            passed: semantic.code === 0,
          };
          mensorCheck = await runMensorCheck(projectRoot);
        }
      } else {
        semanticTest = { completed: true, passed: false };
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  const observation = createAgentAuthoredBuildExploratoryObservation({
    observationId: `published-onboarding.${slug}.1`,
    producerVersion: "0.1.0",
    baselineCommit: cohort.baselineCommit,
    identity: {
      runnerId: cohort.runnerId,
      providerId: model.providerId,
      modelId: model.modelId,
      reasoningEffort: model.reasoningEffort,
      cohortId: cohort.cohortId,
    },
    brief: {
      ...cohort.applicationBrief,
      sha256: briefSha256,
    },
    semanticOracle: {
      ...cohort.semanticOracle,
      sha256: oracleSha256,
    },
    outputTransport: {
      ...cohort.outputTransport,
      sha256: transportSha256,
    },
    artifact: {
      completed,
      accepted: artifact !== null,
      responseSha256,
    },
    semanticTest,
    mensorCheck,
    generatedFiles,
  });

  return {
    observation,
    summary: {
      modelId: model.modelId,
      artifactCompleted: completed,
      artifactAccepted: artifact !== null,
      packageContractPassed,
      semanticTestsPassed: semanticTest.passed,
      mensorCheckPassed: mensorCheck.passed,
      diagnosticCodes: mensorCheck.diagnosticCodes,
      success: observation.success,
    },
  };
}

async function validatePackageContract(projectRoot) {
  let packageJson;
  try {
    packageJson = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    );
  } catch {
    return false;
  }
  if (
    packageJson.private !== true
    || packageJson.type !== "module"
    || packageJson.packageManager !== "pnpm@11.11.0"
    || JSON.stringify(packageJson.devDependencies)
      !== JSON.stringify({ "@0disoft/mensor-cli": "0.1.0" })
    || Object.hasOwn(packageJson, "dependencies")
    || Object.hasOwn(packageJson, "workspaces")
    || Object.hasOwn(packageJson, "pnpm")
  ) {
    return false;
  }
  return !Object.keys(packageJson.scripts ?? {}).some((name) =>
    /^(?:pre|post)?(?:install|pack|publish|prepare)$/u.test(name)
  );
}

async function verifyInstalledCli(projectRoot, temporaryRoot) {
  const packageRoot = path.join(
    projectRoot,
    "node_modules",
    "@0disoft",
    "mensor-cli",
  );
  const installedRealPath = await realpath(packageRoot);
  assert.equal(isWithin(temporaryRoot, installedRealPath), true);
  const metadata = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(metadata.name, "@0disoft/mensor-cli");
  assert.equal(metadata.version, "0.1.0");
}

async function runMensorCheck(projectRoot) {
  const cliEntrypoint = path.join(
    projectRoot,
    "node_modules",
    "@0disoft",
    "mensor-cli",
    "dist",
    "src",
    "bin.js",
  );
  const result = await capture(
    process.execPath,
    [cliEntrypoint, "check", ".", "--json"],
    projectRoot,
    {},
    30_000,
  );
  if (result.code !== 0 && result.code !== 1) {
    return { completed: false, passed: false, diagnosticCodes: [] };
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return { completed: false, passed: false, diagnosticCodes: [] };
  }
  const diagnosticCodes = Array.isArray(report.diagnostics)
    ? report.diagnostics.map(({ code }) => code)
    : [];
  return {
    completed: true,
    passed: result.code === 0 && report.status === "passed",
    diagnosticCodes,
  };
}

function runPackageManager(args, cwd, npmUserConfig, timeoutMs) {
  const executable = path.extname(packageManagerEntrypoint).toLowerCase()
    === ".exe";
  return capture(
    executable ? packageManagerEntrypoint : process.execPath,
    [...(executable ? [] : [packageManagerEntrypoint]), ...args],
    cwd,
    minimalInstallEnvironment(npmUserConfig),
    timeoutMs,
  );
}

function minimalInstallEnvironment(npmUserConfig) {
  const environment = {
    CI: "1",
    NPM_CONFIG_USERCONFIG: npmUserConfig,
  };
  for (const name of [
    "PATH",
    "SystemRoot",
    "ComSpec",
    "PATHEXT",
    "TEMP",
    "TMP",
  ]) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function capture(command, args, cwd, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const collect = (target, chunk) => {
      const next = target + chunk;
      if (Buffer.byteLength(next, "utf8") > 1_048_576) {
        overflow = true;
        child.kill();
      }
      return next.slice(0, 1_048_576);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: overflow ? 1 : (code ?? 1),
        stdout,
        stderr,
      });
    });
  });
}

async function readOptionalFile(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function prepareOutputTarget(directory) {
  try {
    await access(directory);
  } catch {
    return;
  }
  if ((await readdir(directory)).length > 0) {
    throw new Error(`Evaluation output already exists: ${directory}`);
  }
  await rmdir(directory);
}

function digestFile(file) {
  return readFile(file).then((contents) =>
    createHash("sha256").update(contents).digest("hex")
  );
}

function digestText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative.length > 0
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}
