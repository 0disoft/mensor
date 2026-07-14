import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve("workspace");

import {
  createDockerSandboxPlan,
  dockerSandboxPlanDigest,
  runDockerSandbox,
} from "../dist/src/index.js";

test("runs create, inspect, start, and cleanup as one bounded lifecycle", async () => {
  const events = [];
  const port = successfulPort(events);
  const result = await runDockerSandbox({
    plan: sandboxPlan(),
    collector: collector(),
    workspaceRoot,
    input: new TextEncoder().encode('{"schemaVersion":1}\n'),
    port,
  });

  assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
  assert.equal(result.attestation.planSha256, dockerSandboxPlanDigest(sandboxPlan()));
  assert.equal(new TextDecoder().decode(result.stdout), '{"schemaVersion":1,"rounds":1}\n');
});

test("fails closed before start when inspection contradicts the plan", async () => {
  const events = [];
  const port = successfulPort(events);
  port.inspect = async () => {
    events.push("inspect");
    return { ...inspection(), networkMode: "bridge" };
  };

  await assert.rejects(
    runDockerSandbox(runOptions(port)),
    /inspection did not match its plan/,
  );
  assert.deepEqual(events, ["create", "inspect", "remove"]);
});

test("cleans up after start failure and hides port error details", async () => {
  const events = [];
  const port = successfulPort(events);
  port.start = async () => {
    events.push("start");
    throw new Error("provider stderr with secret-shaped text");
  };

  await assert.rejects(
    runDockerSandbox(runOptions(port)),
    (error) => error.message === "Docker sandbox start failed.",
  );
  assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
});

test("aborts a timed-out stage and still removes the container", async () => {
  const events = [];
  const port = successfulPort(events);
  port.start = async (_handle, _input, signal) => {
    events.push("start");
    await new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };

  await assert.rejects(
    runDockerSandbox({ ...runOptions(port), plan: sandboxPlan({ timeoutMs: 20 }) }),
    /exceeded its timeout/,
  );
  assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
});

test("does not report success when cleanup fails", async () => {
  const events = [];
  const port = successfulPort(events);
  port.remove = async () => {
    events.push("remove");
    throw new Error("daemon detail");
  };

  await assert.rejects(
    runDockerSandbox(runOptions(port)),
    (error) => error.message === "Docker sandbox cleanup failed.",
  );
  assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
});

test("aborts cleanup that exceeds its separate deadline", async () => {
  const events = [];
  const port = successfulPort(events);
  port.remove = async (_handle, signal) => {
    events.push("remove");
    await new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };

  await assert.rejects(
    runDockerSandbox({ ...runOptions(port), cleanupTimeoutMs: 100 }),
    (error) => error.message === "Docker sandbox cleanup failed.",
  );
  assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
});

test("rejects unsuccessful and oversized execution results before cleanup", async () => {
  for (const result of [
    { termination: "exited", exitCode: 1, stdout: new Uint8Array(), combinedOutputBytes: 0 },
    { termination: "output-limit", exitCode: 1, stdout: new Uint8Array(), combinedOutputBytes: 20_000 },
    { termination: "timeout", exitCode: 1, stdout: new Uint8Array(), combinedOutputBytes: 0 },
  ]) {
    const events = [];
    const port = successfulPort(events);
    port.start = async () => {
      events.push("start");
      return result;
    };
    await assert.rejects(runDockerSandbox(runOptions(port)));
    assert.deepEqual(events, ["create", "inspect", "start", "remove"]);
  }
});

test("returns an invalid created handle to the owning port for cleanup", async () => {
  const events = [];
  const port = successfulPort(events);
  port.create = async () => {
    events.push("create");
    return "invalid handle";
  };
  port.remove = async (handle) => {
    events.push(`remove:${handle}`);
  };

  await assert.rejects(runDockerSandbox(runOptions(port)), /bounded opaque identifier/);
  assert.deepEqual(events, ["create", "remove:invalid handle"]);
});

test("rejects invalid configuration before creating a container", async () => {
  const events = [];
  const port = successfulPort(events);
  await assert.rejects(
    runDockerSandbox({ ...runOptions(port), workspaceRoot: "relative" }),
    /absolute path/,
  );
  await assert.rejects(
    runDockerSandbox({ ...runOptions(port), collector: { ...collector(), sha256: "bad" } }),
    /SHA-256/,
  );
  await assert.rejects(
    runDockerSandbox({
      ...runOptions(port),
      input: new Uint8Array(sandboxPlan().limits.maxInputBytes + 1),
    }),
    /input limit/,
  );
  assert.deepEqual(events, []);
});

function runOptions(port) {
  return {
    plan: sandboxPlan(),
    collector: collector(),
    workspaceRoot,
    input: new TextEncoder().encode("input\n"),
    port,
    cleanupTimeoutMs: 500,
  };
}

function successfulPort(events) {
  return {
    async create(_plan, workspaceRoot) {
      events.push("create");
      assert.equal(workspaceRoot, path.resolve("workspace"));
      return "container-1";
    },
    async inspect() {
      events.push("inspect");
      return inspection();
    },
    async start(_handle, input) {
      events.push("start");
      assert.ok(input instanceof Uint8Array);
      const stdout = new TextEncoder().encode('{"schemaVersion":1,"rounds":1}\n');
      return {
        termination: "exited",
        exitCode: 0,
        stdout,
        combinedOutputBytes: stdout.byteLength,
      };
    },
    async remove() {
      events.push("remove");
    },
  };
}

function sandboxPlan(overrides = {}) {
  return createDockerSandboxPlan({
    dockerExecutable: path.resolve("docker"),
    image: `ghcr.io/0disoft/mensor-agent@sha256:${"a".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-agent",
    timeoutMs: overrides.timeoutMs ?? 30_000,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  });
}

function collector() {
  return { id: "docker-inspect-normalizer", revision: "v1", sha256: "b".repeat(64) };
}

function inspection() {
  return {
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
