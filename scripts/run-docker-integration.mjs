import assert from "node:assert/strict";
import { access, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDockerCliExecutionPort,
  createDockerCliProcessRunner,
  createDockerSandboxPlan,
  runDockerSandbox,
} from "../internal/agent-runner/dist/src/index.js";

const image =
  "docker.io/library/alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce";
const ownerFilter = "label=io.mensor.sandbox.owner=mensor-agent-runner";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const dockerExecutable = await findDockerExecutable();
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-docker-integration-"));
const dockerConfig = path.join(temporaryRoot, "docker-config");
const workspaceRoot = path.join(temporaryRoot, "workspace");

try {
  await mkdir(dockerConfig, { recursive: true });
  await writeFile(path.join(dockerConfig, "config.json"), "{}\n", "utf8");
  await mkdir(workspaceRoot, { recursive: true });
  await chmod(workspaceRoot, 0o777);

  const environment = { DOCKER_CONFIG: dockerConfig };
  const processRunner = createDockerCliProcessRunner();
  await ensureImage(processRunner, dockerExecutable, environment);
  await requireNoOwnedContainers(
    processRunner,
    dockerExecutable,
    environment,
    "before integration",
  );

  const collector = await createCollector();
  const cases = [];

  cases.push(await runSuccessCase({
    collector,
    dockerExecutable,
    environment,
    processRunner,
    workspaceRoot,
  }));
  cases.push(await runFailureCase({
    id: "timeout",
    expectedMessage: "Docker sandbox execution exceeded its timeout.",
    command: "sleep 30",
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
    collector,
    dockerExecutable,
    environment,
    processRunner,
    workspaceRoot,
  }));
  cases.push(await runFailureCase({
    id: "output-limit",
    expectedMessage: "Docker sandbox execution exceeded its output limit.",
    command: "yes mensor",
    timeoutMs: 20_000,
    maxOutputBytes: 1_024,
    collector,
    dockerExecutable,
    environment,
    processRunner,
    workspaceRoot,
  }));
  cases.push(await runFailureCase({
    id: "nonzero-exit",
    expectedMessage: "Docker sandbox execution exited unsuccessfully.",
    command: "exit 7",
    timeoutMs: 20_000,
    maxOutputBytes: 4_096,
    collector,
    dockerExecutable,
    environment,
    processRunner,
    workspaceRoot,
  }));

  await requireNoOwnedContainers(
    processRunner,
    dockerExecutable,
    environment,
    "after integration",
  );

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    image,
    engineVersion: cases[0].engineVersion,
    architecture: cases[0].architecture,
    imageId: cases[0].imageId,
    cases: cases.map(({ id, outcome, cleanupVerified }) => ({
      id,
      outcome,
      cleanupVerified,
    })),
    cleanupVerified: true,
  }, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function runSuccessCase(options) {
  const marker = path.join(options.workspaceRoot, "probe.txt");
  const plan = createPlan(options.dockerExecutable, {
    command: [
      "set -eu",
      "test \"$(id -u)\" = \"65532\"",
      "if touch /mensor-rootfs-write 2>/dev/null; then exit 91; fi",
      "read value",
      "printf '%s' \"$value\" > /workspace/probe.txt",
      "printf 'probe=%s\\n' \"$value\"",
    ].join("; "),
    timeoutMs: 20_000,
    maxOutputBytes: 4_096,
  });
  const result = await runDockerSandbox({
    plan,
    collector: options.collector,
    workspaceRoot: options.workspaceRoot,
    input: encoder.encode("hello\n"),
    port: createDockerCliExecutionPort({
      environment: options.environment,
      processRunner: options.processRunner,
    }),
    cleanupTimeoutMs: 10_000,
  });

  assert.equal(decoder.decode(result.stdout), "probe=hello\n");
  assert.equal(await readFile(marker, "utf8"), "hello");
  await requireNoOwnedContainers(
    options.processRunner,
    options.dockerExecutable,
    options.environment,
    "after success case",
  );
  return {
    id: "success",
    outcome: "passed",
    cleanupVerified: true,
    engineVersion: result.attestation.engine.version,
    architecture: result.attestation.engine.architecture,
    imageId: result.attestation.image.id,
  };
}

async function runFailureCase(options) {
  const plan = createPlan(options.dockerExecutable, options);
  await assert.rejects(
    runDockerSandbox({
      plan,
      collector: options.collector,
      workspaceRoot: options.workspaceRoot,
      input: new Uint8Array(),
      port: createDockerCliExecutionPort({
        environment: options.environment,
        processRunner: options.processRunner,
      }),
      cleanupTimeoutMs: 10_000,
    }),
    (error) => error instanceof Error && error.message === options.expectedMessage,
  );
  await requireNoOwnedContainers(
    options.processRunner,
    options.dockerExecutable,
    options.environment,
    `after ${options.id} case`,
  );
  return {
    id: options.id,
    outcome: "rejected-as-expected",
    cleanupVerified: true,
  };
}

function createPlan(dockerExecutable, options) {
  return createDockerSandboxPlan({
    dockerExecutable,
    image,
    agentExecutable: "/bin/sh",
    agentArgs: ["-c", options.command],
    timeoutMs: options.timeoutMs,
    maxInputBytes: 1_024,
    maxOutputBytes: options.maxOutputBytes,
    memoryMiB: 128,
    cpuCount: 1,
    pidsLimit: 32,
  });
}

async function ensureImage(runner, executable, environment) {
  const inspect = await runCommand(runner, {
    executable,
    args: ["image", "inspect", image],
    environment,
    timeoutMs: 30_000,
    allowFailure: true,
  });
  if (inspect.exitCode === 0) {
    return;
  }
  await runCommand(runner, {
    executable,
    args: ["image", "pull", image],
    environment,
    timeoutMs: 120_000,
  });
  await runCommand(runner, {
    executable,
    args: ["image", "inspect", image],
    environment,
    timeoutMs: 30_000,
  });
}

async function requireNoOwnedContainers(runner, executable, environment, stage) {
  const result = await runCommand(runner, {
    executable,
    args: [
      "container",
      "ls",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      ownerFilter,
    ],
    environment,
    timeoutMs: 30_000,
  });
  if (decoder.decode(result.stdout).trim() !== "") {
    throw new Error(`Mensor-owned Docker containers remain ${stage}.`);
  }
}

async function runCommand(runner, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const result = await runner({
      executable: options.executable,
      args: options.args,
      environment: options.environment,
      input: new Uint8Array(),
      signal: controller.signal,
      maxOutputBytes: 1_048_576,
    });
    if (
      result.termination !== "exited" ||
      (!options.allowFailure && result.exitCode !== 0)
    ) {
      throw new Error("Docker integration control command failed.");
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function createCollector() {
  const source = await readFile(
    path.join(
      repositoryRoot,
      "internal",
      "agent-runner",
      "src",
      "docker-cli-execution-port.ts",
    ),
  );
  const { createHash } = await import("node:crypto");
  return {
    id: "docker-cli-inspect-normalizer",
    revision: "v1",
    sha256: createHash("sha256").update(source).digest("hex"),
  };
}

async function findDockerExecutable() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"]
    : process.platform === "darwin"
      ? [
          "/usr/local/bin/docker",
          "/opt/homebrew/bin/docker",
          "/Applications/Docker.app/Contents/Resources/bin/docker",
        ]
      : ["/usr/bin/docker", "/usr/local/bin/docker"];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return path.resolve(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("Docker integration requires Docker at an approved absolute path.");
}
