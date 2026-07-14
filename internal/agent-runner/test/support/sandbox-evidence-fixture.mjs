import * as path from "node:path";

import {
  createDockerSandboxPlan,
  createDockerSandboxRuntimeAttestation,
  runDockerSandboxConformance,
} from "../../dist/src/index.js";

export async function sandboxEvidence(overrides = {}) {
  const plan = createDockerSandboxPlan(planOptions(overrides));
  const attestation = createDockerSandboxRuntimeAttestation(plan, {
    collector: metadata().collector,
    ...inspection(overrides),
  });
  const conformance = await runDockerSandboxConformance({
    ...conformanceOptions(plan),
    port: conformantPort(overrides),
  });
  return { plan, attestation, conformance };
}

export function conformanceOptions(plan) {
  return {
    adapter: metadata().sandboxAdapter,
    collector: metadata().collector,
    plan,
    workspaceRoot: testWorkspaceRoot(),
    input: new TextEncoder().encode("input\n"),
    expectedSuccessOutput: successOutput(),
    cleanupTimeoutMs: 500,
  };
}

export function conformantPort(overrides = {}) {
  let nextHandle = 0;
  const modes = new Map();
  return {
    async create(plan) {
      const handle = `container-${nextHandle += 1}`;
      modes.set(handle, plan.agent.args.at(-1));
      return handle;
    },
    async inspect() {
      return inspection(overrides);
    },
    async start(handle, _input, signal) {
      const mode = modes.get(handle);
      if (mode === "timeout") {
        await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
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
          exitCode: 3,
          stdout: new Uint8Array(),
          combinedOutputBytes: 0,
        };
      }
      const stdout = successOutput();
      return {
        termination: "exited",
        exitCode: 0,
        stdout,
        combinedOutputBytes: stdout.byteLength,
      };
    },
    async remove(handle) {
      modes.delete(handle);
    },
  };
}

export function alwaysSuccessfulPort() {
  return {
    async create() {
      return "container-success";
    },
    async inspect() {
      return inspection();
    },
    async start() {
      const stdout = successOutput();
      return {
        termination: "exited",
        exitCode: 0,
        stdout,
        combinedOutputBytes: stdout.byteLength,
      };
    },
    async remove() {},
  };
}

export function metadata() {
  return {
    descriptorId: "sandbox-eval-v2",
    providerId: "fake-provider",
    modelId: "fake/model",
    modelRevision: "2026-07-13",
    adapter: artifact("agent-adapter", "v1", "1"),
    prompt: artifact("repair-prompt", "v1", "2"),
    toolset: artifact("workspace-tools", "v1", "3"),
    dataset: artifact("golden-mutations", "v1", "4"),
    sandboxAdapter: artifact("docker-port", "v1", "5"),
    collector: artifact("docker-inspect-normalizer", "v1", "6"),
  };
}

export function planOptions(overrides = {}) {
  return {
    dockerExecutable: testDockerExecutable(),
    image: `ghcr.io/0disoft/mensor-agent@sha256:${"a".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-agent",
    agentArgs: ["private-agent-argument"],
    timeoutMs: 20,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
    ...overrides,
  };
}

export function testDockerExecutable() {
  return path.resolve("docker");
}

export function testWorkspaceRoot() {
  return path.resolve("workspace");
}

export function inspection(overrides = {}) {
  const options = planOptions(overrides);
  return {
    engineVersion: "28.3.2",
    architecture: "x86_64",
    imageId: `sha256:${"b".repeat(64)}`,
    networkMode: "none",
    readOnlyRootFilesystem: true,
    user: "65532:65532",
    capabilities: [],
    noNewPrivileges: true,
    workspaceMount: {
      destination: "/workspace",
      mode: "read-write",
      propagation: "rprivate",
    },
    temporaryFilesystem: {
      destination: "/tmp",
      inMemory: true,
      executable: false,
      setuid: false,
      sizeMiB: 64,
    },
    credentialInjection: "none",
    memoryMiB: options.memoryMiB,
    cpuCount: options.cpuCount,
    pidsLimit: options.pidsLimit,
  };
}

function successOutput() {
  return new TextEncoder().encode('{"schemaVersion":1,"rounds":1}\n');
}

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}
