import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createDockerSandboxPlan,
  createSandboxExecutionDescriptor,
  parseSandboxExecutionDescriptor,
  runDockerSandboxConformance,
  sandboxExecutionFingerprint,
  serializeSandboxExecutionDescriptor,
  validateSandboxExecutionDescriptorBindings,
} from "../dist/src/index.js";
import {
  alwaysSuccessfulPort,
  conformanceOptions,
  metadata,
  planOptions,
  sandboxEvidence,
} from "./support/sandbox-evidence-fixture.mjs";

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
  assert.equal(serialized.includes("private-agent-argument"), false);
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
    /does not bind the plan commitment/,
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

function artifact(id, revision, character) {
  return { id, revision, sha256: character.repeat(64) };
}
