import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createDockerSandboxPlan,
  parseDockerSandboxConformanceReport,
  runDockerSandboxConformance,
  serializeDockerSandboxConformanceReport,
} from "../dist/src/index.js";

const successOutput = new TextEncoder().encode('{"schemaVersion":1,"rounds":1}\n');

test("runs every required port probe and emits a canonical conformant report", async () => {
  const report = await runDockerSandboxConformance(options(conformantPort()));
  const serialized = serializeDockerSandboxConformanceReport(report);

  assert.deepEqual(report.cases.map((item) => item.id), [
    "success",
    "timeout",
    "output-limit",
    "nonzero-exit",
  ]);
  assert.deepEqual(report.summary, {
    caseCount: 4,
    passedCount: 4,
    failedCount: 0,
    conformant: true,
  });
  assert.deepEqual(parseDockerSandboxConformanceReport(serialized), report);
  assert.equal(serialized.includes("C:\\workspace"), false);
  assert.equal(serialized.includes("container-"), false);
  assert.equal(serialized.includes("provider detail"), false);
});

test("does not certify a port that reports success for failure probes", async () => {
  const report = await runDockerSandboxConformance(options(alwaysSuccessfulPort()));
  assert.deepEqual(report.cases.map((item) => item.passed), [true, false, false, false]);
  assert.deepEqual(report.summary, {
    caseCount: 4,
    passedCount: 1,
    failedCount: 3,
    conformant: false,
  });
});

test("rejects forged summaries, case order, and extra report fields", async () => {
  const report = await runDockerSandboxConformance(options(conformantPort()));
  assert.throws(
    () => parseDockerSandboxConformanceReport(JSON.stringify({
      ...report,
      summary: { ...report.summary, failedCount: 4 },
    })),
    /canonical derived fields/,
  );
  assert.throws(
    () => parseDockerSandboxConformanceReport(JSON.stringify({
      ...report,
      cases: [...report.cases].reverse(),
    })),
    /unsupported value/,
  );
  assert.throws(
    () => parseDockerSandboxConformanceReport(JSON.stringify({ ...report, trusted: true })),
    /unsupported or missing fields/,
  );
});

test("keeps the conformance schema aligned with canonical reports", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../spec/docker-sandbox-conformance-report-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const report = await runDockerSandboxConformance(options(conformantPort()));
  const validate = new Ajv2020({ strict: true }).compile(schema);

  assert.equal(schema.$id, "docker-sandbox-conformance-report-v1.schema.json");
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

function options(port) {
  return {
    adapter: artifact("docker-port", "v1", "a"),
    collector: artifact("docker-inspect-normalizer", "v1", "b"),
    plan: basePlan(),
    workspaceRoot: "C:\\workspace",
    input: new TextEncoder().encode("input\n"),
    expectedSuccessOutput: successOutput,
    port,
    cleanupTimeoutMs: 500,
  };
}

function conformantPort() {
  let nextHandle = 0;
  const modes = new Map();
  return {
    async create(plan) {
      const id = plan.agent.args.at(-1);
      const handle = `container-${nextHandle += 1}`;
      modes.set(handle, id);
      return handle;
    },
    async inspect() {
      return inspection();
    },
    async start(handle, _input, signal) {
      const mode = modes.get(handle);
      if (mode === "timeout") {
        await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("provider detail")), { once: true });
        });
      }
      if (mode === "output-limit") {
        return {
          termination: "output-limit",
          exitCode: 1,
          stdout: new Uint8Array(),
          combinedOutputBytes: 20_000,
        };
      }
      if (mode === "nonzero-exit") {
        return {
          termination: "exited",
          exitCode: 7,
          stdout: new Uint8Array(),
          combinedOutputBytes: 0,
        };
      }
      return successfulExecution();
    },
    async remove(handle) {
      modes.delete(handle);
    },
  };
}

function alwaysSuccessfulPort() {
  return {
    async create() {
      return "container-success";
    },
    async inspect() {
      return inspection();
    },
    async start() {
      return successfulExecution();
    },
    async remove() {},
  };
}

function successfulExecution() {
  return {
    termination: "exited",
    exitCode: 0,
    stdout: successOutput,
    combinedOutputBytes: successOutput.byteLength,
  };
}

function basePlan() {
  return createDockerSandboxPlan({
    dockerExecutable: "C:\\Program Files\\Docker\\docker.exe",
    image: `ghcr.io/0disoft/mensor-conformance@sha256:${"c".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-conformance",
    timeoutMs: 20,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  });
}

function inspection() {
  return {
    engineVersion: "28.3.2",
    architecture: "x86_64",
    imageId: `sha256:${"d".repeat(64)}`,
    networkMode: "none",
    readOnlyRootFilesystem: true,
    user: "65532:65532",
    capabilities: [],
    noNewPrivileges: true,
    workspaceMount: { destination: "/workspace", mode: "read-write", propagation: "rprivate" },
    temporaryFilesystem: {
      destination: "/tmp",
      inMemory: true,
      executable: false,
      setuid: false,
      sizeMiB: 64,
    },
    credentialInjection: "none",
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  };
}

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}
