import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createDockerSandboxPlan,
  dockerSandboxPlanDigest,
  materializeDockerSandboxCommand,
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
    "no-new-privileges:true",
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
