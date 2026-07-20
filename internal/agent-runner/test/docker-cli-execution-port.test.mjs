import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import {
  createDockerCliExecutionPort,
  createDockerSandboxPlan,
  dockerSandboxPlanDigest,
} from "../dist/src/index.js";

const handle = "a".repeat(64);
const nonce = "b".repeat(32);
const ownerLabel = "io.mensor.sandbox.owner";
const nonceLabel = "io.mensor.sandbox.nonce";
const planLabel = "io.mensor.sandbox.plan-sha256";

test("maps one owned Docker container through create, inspect, start, and remove", async () => {
  const plan = sandboxPlan();
  const fake = fakeDocker(plan);
  const workspaceRoot = path.resolve("workspace with spaces");
  const port = createDockerCliExecutionPort({
    environment: { DOCKER_HOST: "unix:///controlled.sock" },
    processRunner: fake.runner,
    nonceFactory: () => nonce,
  });
  const signal = new AbortController().signal;

  assert.equal(await port.create(plan, workspaceRoot, signal), handle);
  const inspection = await port.inspect(handle, signal);
  const result = await port.start(
    handle,
    new TextEncoder().encode("input\n"),
    signal,
  );
  await port.remove(handle, signal);

  assert.deepEqual(inspection, expectedInspection());
  assert.equal(result.termination, "exited");
  assert.equal(result.exitCode, 0);
  assert.equal(new TextDecoder().decode(result.stdout), "output\n");
  assert.deepEqual(fake.events, [
    "create",
    "inspect",
    "version",
    "inspect",
    "start",
    "inspect",
    "inspect",
    "remove",
  ]);
  assert.equal(fake.calls.every((call) =>
    call.environment.DOCKER_HOST === "unix:///controlled.sock"), true);

  const create = fake.calls[0];
  assert.deepEqual(create.args.slice(0, 4), [
    "container", "create", "--pull=never", "--interactive",
  ]);
  assert.equal(create.args.includes("--rm"), false);
  assert.equal(create.args.includes("--network"), true);
  assert.equal(create.args.includes("none"), true);
  assert.equal(create.args.includes(`${ownerLabel}=mensor-agent-runner`), true);
  assert.equal(create.args.includes(`${nonceLabel}=${nonce}`), true);
  assert.equal(
    create.args.includes(`${planLabel}=${dockerSandboxPlanDigest(plan)}`),
    true,
  );
  assert.equal(
    create.args.includes(`type=bind,src=${workspaceRoot},dst=/workspace`),
    true,
  );
});

test("rejects Docker mount delimiter syntax in the workspace path", async () => {
  const plan = sandboxPlan();
  const fake = fakeDocker(plan);
  const port = createDockerCliExecutionPort({
    processRunner: fake.runner,
    nonceFactory: () => nonce,
  });

  await assert.rejects(
    port.create(
      plan,
      path.resolve("workspace,with-extra-mount-syntax"),
      new AbortController().signal,
    ),
    /without NUL or comma/,
  );
  assert.deepEqual(fake.calls, []);
});

test("refuses foreign ownership before starting or deleting a container", async () => {
  const plan = sandboxPlan();
  const fake = fakeDocker(plan, { foreignOwner: true });
  const port = createDockerCliExecutionPort({
    processRunner: fake.runner,
    nonceFactory: () => nonce,
  });
  const signal = new AbortController().signal;

  await port.create(plan, path.resolve("workspace"), signal);
  await assert.rejects(
    port.inspect(handle, signal),
    /ownership did not match/,
  );
  await assert.rejects(
    port.remove(handle, signal),
    /ownership did not match/,
  );
  assert.equal(fake.events.includes("start"), false);
  assert.equal(fake.events.includes("remove"), false);
});

test("attempts bounded owned cleanup after an uncertain create failure", async () => {
  const plan = sandboxPlan();
  const fake = fakeDocker(plan, { createFails: true });
  const port = createDockerCliExecutionPort({
    processRunner: fake.runner,
    nonceFactory: () => nonce,
  });

  await assert.rejects(
    port.create(
      plan,
      path.resolve("workspace"),
      new AbortController().signal,
    ),
    /create failed/,
  );
  assert.deepEqual(fake.events, ["create", "inspect", "remove"]);
  assert.equal(fake.calls.at(-1).args.at(-1), `mensor-${nonce}`);
});

test("reports only a bounded create failure category", async () => {
  const plan = sandboxPlan();
  const fake = fakeDocker(plan, {
    createFails: true,
    createFailureCategory: "resource-unsupported",
  });
  const diagnostics = [];
  const port = createDockerCliExecutionPort({
    processRunner: fake.runner,
    nonceFactory: () => nonce,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });

  await assert.rejects(
    port.create(plan, path.resolve("workspace"), new AbortController().signal),
    /create failed/,
  );
  assert.deepEqual(diagnostics, [{
    stage: "create",
    termination: "exited",
    exitCode: 1,
    failureCategory: "resource-unsupported",
  }]);
});

function fakeDocker(plan, options = {}) {
  const calls = [];
  const events = [];
  let status = "created";
  const labels = {
    [ownerLabel]: options.foreignOwner ? "foreign" : "mensor-agent-runner",
    [nonceLabel]: nonce,
    [planLabel]: dockerSandboxPlanDigest(plan),
  };
  return {
    calls,
    events,
    async runner(command) {
      calls.push(command);
      const operation = command.args.slice(0, 2).join(" ");
      if (operation === "container create") {
        events.push("create");
        return {
          ...result(options.createFails ? 1 : 0, `${handle}\n`),
          ...(options.createFailureCategory === undefined
            ? {}
            : { failureCategory: options.createFailureCategory }),
        };
      }
      if (operation === "container inspect") {
        events.push("inspect");
        return result(0, JSON.stringify(snapshot(status, labels)));
      }
      if (operation === "version --format") {
        events.push("version");
        return result(0, JSON.stringify({ Version: "28.3.2", Arch: "amd64" }));
      }
      if (operation === "container start") {
        events.push("start");
        status = "exited";
        return {
          ...result(0, "output\n"),
          combinedOutputBytes: 7,
        };
      }
      if (operation === "container rm") {
        events.push("remove");
        return result(0, "");
      }
      throw new Error(`Unexpected fake Docker command: ${operation}`);
    },
  };
}

function snapshot(status, labels) {
  return {
    Id: handle,
    Image: `sha256:${"c".repeat(64)}`,
    Config: {
      Labels: labels,
      User: "65532:65532",
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapAdd: [],
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges=true"],
      Memory: 512 * 1024 * 1024,
      NanoCpus: 2_000_000_000,
      PidsLimit: 128,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
    },
    Mounts: [{ Destination: "/workspace", RW: true, Propagation: "rprivate" }],
    State: { Status: status, ExitCode: 0 },
  };
}

function sandboxPlan() {
  return createDockerSandboxPlan({
    dockerExecutable: path.resolve("docker"),
    image: `ghcr.io/0disoft/mensor-agent@sha256:${"d".repeat(64)}`,
    agentExecutable: "/usr/local/bin/mensor-agent",
    agentArgs: ["repair"],
    timeoutMs: 1_000,
    maxInputBytes: 8_192,
    maxOutputBytes: 16_384,
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  });
}

function result(exitCode, stdout) {
  const bytes = new TextEncoder().encode(stdout);
  return {
    termination: "exited",
    exitCode,
    stdout: bytes,
    combinedOutputBytes: bytes.byteLength,
  };
}

function expectedInspection() {
  return {
    engineVersion: "28.3.2",
    architecture: "x86_64",
    imageId: `sha256:${"c".repeat(64)}`,
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
    memoryMiB: 512,
    cpuCount: 2,
    pidsLimit: 128,
  };
}
