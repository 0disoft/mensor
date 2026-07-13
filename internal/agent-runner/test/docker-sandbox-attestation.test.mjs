import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createDockerSandboxPlan,
  createDockerSandboxRuntimeAttestation,
  dockerSandboxPlanDigest,
  dockerSandboxRuntimeAttestationDigest,
  parseDockerSandboxRuntimeAttestation,
  serializeDockerSandboxRuntimeAttestation,
} from "../dist/src/index.js";

test("creates canonical runtime evidence bound to one Docker plan", () => {
  const plan = sandboxPlan();
  const attestation = createDockerSandboxRuntimeAttestation(plan, observation());
  const serialized = serializeDockerSandboxRuntimeAttestation(attestation);

  assert.equal(attestation.planSha256, dockerSandboxPlanDigest(plan));
  assert.deepEqual(parseDockerSandboxRuntimeAttestation(serialized), attestation);
  assert.match(dockerSandboxRuntimeAttestationDigest(attestation), /^[a-f0-9]{64}$/);
  assert.equal(serialized.includes("C:\\workspace"), false);
  assert.equal(serialized.includes("docker.exe"), false);
  assert.equal(serialized.includes("--repair"), false);
  assert.equal(serialized.endsWith("\n"), true);
});

test("rejects observed security and resource drift", () => {
  const plan = sandboxPlan();
  const valid = observation();
  const invalid = [
    { ...valid, networkMode: "bridge" },
    { ...valid, readOnlyRootFilesystem: false },
    { ...valid, user: "0:0" },
    { ...valid, capabilities: ["NET_RAW"] },
    { ...valid, noNewPrivileges: false },
    { ...valid, workspaceMount: { ...valid.workspaceMount, mode: "read-only" } },
    { ...valid, temporaryFilesystem: { ...valid.temporaryFilesystem, executable: true } },
    { ...valid, credentialInjection: "environment" },
    { ...valid, memoryMiB: valid.memoryMiB + 1 },
    { ...valid, cpuCount: valid.cpuCount + 1 },
    { ...valid, pidsLimit: valid.pidsLimit + 1 },
  ];
  for (const candidate of invalid) {
    assert.throws(() => createDockerSandboxRuntimeAttestation(plan, candidate));
  }
});

test("rejects malformed and non-canonical attestation input", () => {
  const attestation = createDockerSandboxRuntimeAttestation(sandboxPlan(), observation());
  assert.throws(
    () => parseDockerSandboxRuntimeAttestation(JSON.stringify({ ...attestation, trusted: true })),
    /unsupported or missing fields/,
  );
  assert.throws(
    () => parseDockerSandboxRuntimeAttestation(JSON.stringify({
      kind: attestation.kind,
      schemaVersion: attestation.schemaVersion,
      planSha256: attestation.planSha256,
      collector: attestation.collector,
      engine: attestation.engine,
      image: attestation.image,
      security: attestation.security,
      limits: attestation.limits,
    })),
    /canonical field ordering/,
  );
});

test("keeps the runtime attestation schema aligned with canonical output", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../spec/docker-sandbox-runtime-attestation-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const attestation = createDockerSandboxRuntimeAttestation(sandboxPlan(), observation());
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(schema.$id, "docker-sandbox-runtime-attestation-v1.schema.json");
  assert.equal(validate(attestation), true, JSON.stringify(validate.errors));
});

function sandboxPlan() {
  return createDockerSandboxPlan({
    dockerExecutable: "C:\\Program Files\\Docker\\docker.exe",
    image: `ghcr.io/0disoft/mensor-agent@sha256:${"a".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-agent",
    agentArgs: ["--repair"],
    timeoutMs: 30_000,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  });
}

function observation() {
  return {
    collector: { id: "docker-inspect-normalizer", revision: "v1", sha256: "b".repeat(64) },
    engineVersion: "28.3.2",
    architecture: "x86_64",
    imageId: `sha256:${"c".repeat(64)}`,
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
