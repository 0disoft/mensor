import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createDockerSandboxPlan,
  createDockerSandboxRuntimeAttestation,
  createSandboxExecutionDescriptor,
  parseSandboxExecutionDescriptor,
  runDockerSandboxConformance,
  sandboxExecutionFingerprint,
  serializeSandboxExecutionDescriptor,
  validateSandboxExecutionDescriptorBindings,
} from "../dist/src/index.js";

test("binds plan, attestation, and port conformance into descriptor v2", async () => {
  const evidence = await sandboxEvidence();
  const descriptor = createSandboxExecutionDescriptor(
    metadata(),
    evidence.plan,
    evidence.attestation,
    evidence.conformance,
  );
  const serialized = serializeSandboxExecutionDescriptor(descriptor);

  assert.equal(descriptor.schemaVersion, 2);
  assert.equal(descriptor.environment.runner, "docker-sandbox");
  assert.equal(descriptor.environment.evidenceLevel, "port-conformance-only");
  assert.match(descriptor.environment.planSha256, /^[a-f0-9]{64}$/);
  assert.match(sandboxExecutionFingerprint(descriptor), /^[a-f0-9]{64}$/);
  assert.deepEqual(parseSandboxExecutionDescriptor(serialized), descriptor);
  assert.equal(serialized.includes("C:\\workspace"), false);
  assert.equal(serialized.includes("container-1"), false);
});

test("rejects plan, collector, adapter, and conformance drift", async () => {
  const evidence = await sandboxEvidence();
  assert.throws(
    () => createSandboxExecutionDescriptor(
      metadata(),
      createDockerSandboxPlan({ ...planOptions(), memoryMiB: 1024 }),
      evidence.attestation,
      evidence.conformance,
    ),
    /does not bind the execution plan/,
  );
  assert.throws(
    () => createSandboxExecutionDescriptor(
      { ...metadata(), collector: artifact("other-collector", "v1", "f") },
      evidence.plan,
      evidence.attestation,
      evidence.conformance,
    ),
    /collector identity/,
  );
  assert.throws(
    () => createSandboxExecutionDescriptor(
      { ...metadata(), sandboxAdapter: artifact("other-port", "v1", "e") },
      evidence.plan,
      evidence.attestation,
      evidence.conformance,
    ),
    /adapter identity/,
  );

  const nonconformant = await runDockerSandboxConformance({
    ...conformanceOptions(evidence.plan),
    port: alwaysSuccessfulPort(),
  });
  assert.throws(
    () => createSandboxExecutionDescriptor(
      metadata(),
      evidence.plan,
      evidence.attestation,
      nonconformant,
    ),
    /requires a conformant port report/,
  );
});

test("requires bound evidence after standalone descriptor parsing", async () => {
  const evidence = await sandboxEvidence();
  const descriptor = createSandboxExecutionDescriptor(
    metadata(),
    evidence.plan,
    evidence.attestation,
    evidence.conformance,
  );
  const forged = parseSandboxExecutionDescriptor(JSON.stringify({
    ...descriptor,
    environment: {
      ...descriptor.environment,
      runtimeAttestationSha256: "0".repeat(64),
    },
  }));
  assert.throws(
    () => validateSandboxExecutionDescriptorBindings(
      forged,
      evidence.plan,
      evidence.attestation,
      evidence.conformance,
    ),
    /does not match its bound evidence/,
  );
});

test("keeps descriptor v2 schema aligned with canonical output", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../spec/agent-execution-descriptor-v2.schema.json",
    import.meta.url,
  ), "utf8"));
  const evidence = await sandboxEvidence();
  const descriptor = createSandboxExecutionDescriptor(
    metadata(),
    evidence.plan,
    evidence.attestation,
    evidence.conformance,
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);

  assert.equal(schema.$id, "agent-execution-descriptor-v2.schema.json");
  assert.equal(validate(descriptor), true, JSON.stringify(validate.errors));
});

async function sandboxEvidence() {
  const plan = createDockerSandboxPlan(planOptions());
  const attestation = createDockerSandboxRuntimeAttestation(plan, {
    collector: metadata().collector,
    ...inspection(),
  });
  const conformance = await runDockerSandboxConformance({
    ...conformanceOptions(plan),
    port: conformantPort(),
  });
  return { plan, attestation, conformance };
}

function conformanceOptions(plan) {
  return {
    adapter: metadata().sandboxAdapter,
    collector: metadata().collector,
    plan,
    workspaceRoot: "C:\\workspace",
    input: new TextEncoder().encode("input\n"),
    expectedSuccessOutput: successOutput(),
    cleanupTimeoutMs: 500,
  };
}

function conformantPort() {
  let nextHandle = 0;
  const modes = new Map();
  return {
    async create(plan) {
      const handle = `container-${nextHandle += 1}`;
      modes.set(handle, plan.agent.args.at(-1));
      return handle;
    },
    async inspect() {
      return inspection();
    },
    async start(handle, _input, signal) {
      const mode = modes.get(handle);
      if (mode === "timeout") {
        await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      if (mode === "output-limit") {
        return { termination: "output-limit", exitCode: 1, stdout: new Uint8Array(), combinedOutputBytes: 20_000 };
      }
      if (mode === "nonzero-exit") {
        return { termination: "exited", exitCode: 3, stdout: new Uint8Array(), combinedOutputBytes: 0 };
      }
      const stdout = successOutput();
      return { termination: "exited", exitCode: 0, stdout, combinedOutputBytes: stdout.byteLength };
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
      const stdout = successOutput();
      return { termination: "exited", exitCode: 0, stdout, combinedOutputBytes: stdout.byteLength };
    },
    async remove() {},
  };
}

function metadata() {
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

function planOptions() {
  return {
    dockerExecutable: "C:\\Program Files\\Docker\\docker.exe",
    image: `ghcr.io/0disoft/mensor-agent@sha256:${"a".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-agent",
    timeoutMs: 20,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  };
}

function inspection() {
  return {
    engineVersion: "28.3.2",
    architecture: "x86_64",
    imageId: `sha256:${"b".repeat(64)}`,
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

function successOutput() {
  return new TextEncoder().encode('{"schemaVersion":1,"rounds":1}\n');
}

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}
