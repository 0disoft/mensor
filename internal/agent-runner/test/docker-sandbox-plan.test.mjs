import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  createDockerSandboxPlan,
  createDockerSandboxPlanCommitment,
  dockerSandboxPlanCommitmentDigest,
  dockerSandboxPlanDigest,
  materializeDockerSandboxCommand,
  parseDockerSandboxPlanCommitment,
  serializeDockerSandboxPlanCommitment,
  validateDockerSandboxPlanCommitment,
} from "../dist/src/index.js";

test("materializes a networkless least-privilege Docker command", () => {
  const plan = createDockerSandboxPlan(options());
  const command = materializeDockerSandboxCommand(plan, path.resolve("isolated-workspace"));
  assert.match(dockerSandboxPlanDigest(plan), /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.security, {
    network: "none",
    rootFilesystem: "read-only",
    workspaceMount: "read-write-only",
    capabilities: "none",
    privilegeEscalation: "disabled",
    credentials: "none",
    user: "65532:65532",
  });
  assert.deepEqual(command.environment, {});
  for (const required of [
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "no-new-privileges=true",
    "--pids-limit",
    "--memory",
    "--cpus",
    "--user",
  ]) {
    assert.ok(command.args.includes(required), required);
  }
  assert.ok(command.args.some((argument) => argument.includes("dst=/workspace,rw")));
});

test("rejects mutable images and unsafe executable paths", () => {
  assert.throws(
    () => createDockerSandboxPlan({ ...options(), image: "agent:latest" }),
    /immutable lowercase SHA-256/,
  );
  assert.throws(
    () => createDockerSandboxPlan({ ...options(), agentExecutable: "agent" }),
    /absolute POSIX path/,
  );
  assert.throws(
    () => materializeDockerSandboxCommand(
      createDockerSandboxPlan(options()),
      "relative-workspace",
    ),
    /absolute path/,
  );
});

test("rejects edited security claims and unbounded resources", () => {
  const plan = createDockerSandboxPlan(options());
  assert.throws(
    () => dockerSandboxPlanDigest({
      ...plan,
      security: { ...plan.security, network: "none", credentials: "none", user: "0:0" },
    }),
    /canonical derived security settings/,
  );
  assert.throws(
    () => createDockerSandboxPlan({ ...options(), memoryMiB: 32 }),
    /memoryMiB/,
  );
});

test("serializes a publish-safe plan commitment aligned with its schema", async () => {
  const plan = createDockerSandboxPlan(options());
  const commitment = createDockerSandboxPlanCommitment(plan);
  const serialized = serializeDockerSandboxPlanCommitment(commitment);
  const schema = JSON.parse(await readFile(new URL(
    "../spec/docker-sandbox-plan-commitment-v1.schema.json",
    import.meta.url,
  ), "utf8"));
  const validate = new Ajv2020({ strict: true }).compile(schema);

  assert.deepEqual(parseDockerSandboxPlanCommitment(serialized), commitment);
  assert.equal(validate(commitment), true, JSON.stringify(validate.errors));
  assert.equal(serialized.includes(plan.dockerExecutable), false);
  assert.equal(serialized.includes("repair"), false);
  assert.equal(dockerSandboxPlanDigest(plan), dockerSandboxPlanCommitmentDigest(commitment));
  assert.equal(schema.$id, "docker-sandbox-plan-commitment-v1.schema.json");
});

test("changes the plan digest when private path or argument inputs drift", () => {
  const baseline = createDockerSandboxPlan(options());
  const executableDrift = createDockerSandboxPlan({
    ...options(),
    dockerExecutable: path.resolve("docker-alternate"),
  });
  const argumentDrift = createDockerSandboxPlan({
    ...options(),
    agentArgs: ["verify"],
  });

  assert.notEqual(dockerSandboxPlanDigest(executableDrift), dockerSandboxPlanDigest(baseline));
  assert.notEqual(dockerSandboxPlanDigest(argumentDrift), dockerSandboxPlanDigest(baseline));
});

test("rejects forged or non-canonical plan commitments", () => {
  const commitment = createDockerSandboxPlanCommitment(createDockerSandboxPlan(options()));
  assert.throws(
    () => validateDockerSandboxPlanCommitment({
      ...commitment,
      security: { ...commitment.security, user: "0:0" },
    }),
    /unsupported value/,
  );
  assert.throws(
    () => parseDockerSandboxPlanCommitment("not-json"),
    /valid JSON/,
  );
});

function options() {
  return {
    dockerExecutable: path.resolve("docker"),
    image: `example/agent@sha256:${"a".repeat(64)}`,
    agentExecutable: "/usr/local/bin/agent",
    agentArgs: ["repair"],
    timeoutMs: 60_000,
    maxInputBytes: 65_536,
    maxOutputBytes: 65_536,
    memoryMiB: 512,
    cpuCount: 1,
    pidsLimit: 128,
  };
}
