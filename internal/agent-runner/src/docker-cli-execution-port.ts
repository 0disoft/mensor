import { randomUUID } from "node:crypto";
import * as path from "node:path";

import {
  createDockerCliProcessRunner,
  type DockerCliCommandResult,
  type DockerCliFailureCategory,
  type DockerCliProcessRunner,
} from "./docker-cli-process.js";
import {
  dockerSandboxPlanDigest,
  type DockerSandboxPlan,
} from "./docker-sandbox-plan.js";
import type {
  DockerSandboxExecutionPort,
  DockerSandboxExecutionResult,
  DockerSandboxInspection,
} from "./docker-sandbox-runner.js";

const controlOutputLimitBytes = 262_144;
const cleanupTimeoutMs = 5_000;
const ownerLabel = "io.mensor.sandbox.owner";
const nonceLabel = "io.mensor.sandbox.nonce";
const planLabel = "io.mensor.sandbox.plan-sha256";
const ownerValue = "mensor-agent-runner";

const inspectTemplate = [
  "{",
  '"Id":{{json .Id}},',
  '"Image":{{json .Image}},',
  '"Config":{{json .Config}},',
  '"HostConfig":{{json .HostConfig}},',
  '"Mounts":{{json .Mounts}},',
  '"State":{{json .State}}',
  "}",
].join("");

const serverTemplate = "{{json .Server}}";

export interface DockerCliExecutionPortOptions {
  readonly environment?: Readonly<Record<string, string>>;
  readonly processRunner?: DockerCliProcessRunner;
  readonly nonceFactory?: () => string;
  readonly onDiagnostic?: (diagnostic: DockerCliDiagnostic) => void;
}

export interface DockerCliDiagnostic {
  readonly stage: "create";
  readonly termination: DockerCliCommandResult["termination"];
  readonly exitCode: number;
  readonly failureCategory: DockerCliFailureCategory;
}

interface OwnedContainer {
  readonly dockerExecutable: string;
  readonly name: string;
  readonly nonce: string;
  readonly planDigest: string;
  readonly plan: DockerSandboxPlan;
  inspected: boolean;
}

export function createDockerCliExecutionPort(
  options: DockerCliExecutionPortOptions = {},
): DockerSandboxExecutionPort {
  const environment = validateEnvironment(options.environment ?? {});
  const processRunner = options.processRunner ?? createDockerCliProcessRunner();
  const nonceFactory = options.nonceFactory ?? defaultNonce;
  const owned = new Map<string, OwnedContainer>();

  return {
    async create(plan, workspaceRoot, signal) {
      const planDigest = dockerSandboxPlanDigest(plan);
      const root = validateWorkspaceRoot(workspaceRoot);
      const nonce = validateNonce(nonceFactory());
      const name = `mensor-${nonce}`;
      const command = createCommand(plan, root, name, nonce, planDigest);
      let result: DockerCliCommandResult;
      try {
        result = await processRunner({
          executable: plan.dockerExecutable,
          args: command,
          environment,
          input: new Uint8Array(),
          signal,
          maxOutputBytes: controlOutputLimitBytes,
        });
      } catch {
        options.onDiagnostic?.({
          stage: "create",
          termination: "timeout",
          exitCode: 1,
          failureCategory: "process-spawn-failed",
        });
        await bestEffortRemoveUnknown(
          processRunner,
          environment,
          plan.dockerExecutable,
          name,
          nonce,
          planDigest,
        );
        throw new Error("Docker CLI create failed.");
      }
      if (!isSuccessful(result)) {
        options.onDiagnostic?.({
          stage: "create",
          termination: result.termination,
          exitCode: result.exitCode,
          failureCategory: result.failureCategory ?? "other",
        });
        await bestEffortRemoveUnknown(
          processRunner,
          environment,
          plan.dockerExecutable,
          name,
          nonce,
          planDigest,
        );
        throw new Error("Docker CLI create failed.");
      }
      const handle = decodeText(result.stdout).trim();
      if (!/^[a-f0-9]{64}$/.test(handle)) {
        await bestEffortRemoveUnknown(
          processRunner,
          environment,
          plan.dockerExecutable,
          name,
          nonce,
          planDigest,
        );
        throw new Error("Docker CLI create returned an invalid handle.");
      }
      owned.set(handle, {
        dockerExecutable: plan.dockerExecutable,
        name,
        nonce,
        planDigest,
        plan,
        inspected: false,
      });
      return handle;
    },

    async inspect(handle, signal) {
      const container = requireOwned(owned, handle);
      const snapshot = await inspectOwned(
        processRunner,
        environment,
        container,
        handle,
        signal,
      );
      if (snapshot.state.status !== "created") {
        throw new Error("Docker CLI container is not ready for inspection.");
      }
      const server = await readServer(
        processRunner,
        environment,
        container.dockerExecutable,
        signal,
      );
      container.inspected = true;
      return normalizeInspection(snapshot, server, container.plan);
    },

    async start(handle, input, signal) {
      const container = requireOwned(owned, handle);
      if (!container.inspected) {
        throw new Error("Docker CLI container must be inspected before start.");
      }
      const ready = await inspectOwned(
        processRunner,
        environment,
        container,
        handle,
        signal,
      );
      if (ready.state.status !== "created") {
        throw new Error("Docker CLI container is not ready to start.");
      }
      const execution = await processRunner({
        executable: container.dockerExecutable,
        args: ["container", "start", "--attach", "--interactive", handle],
        environment,
        input,
        signal,
        maxOutputBytes: container.plan.limits.maxOutputBytes,
      });
      if (execution.termination !== "exited") {
        return toExecutionResult(execution, execution.exitCode);
      }
      const snapshot = await inspectOwned(
        processRunner,
        environment,
        container,
        handle,
        signal,
      );
      if (
        snapshot.state.status !== "exited" &&
        snapshot.state.status !== "dead"
      ) {
        throw new Error("Docker CLI container did not reach a final state.");
      }
      return toExecutionResult(execution, snapshot.state.exitCode);
    },

    async remove(handle, signal) {
      const container = requireOwned(owned, handle);
      await inspectOwned(
        processRunner,
        environment,
        container,
        handle,
        signal,
      );
      await runControl(
        processRunner,
        environment,
        container.dockerExecutable,
        ["container", "rm", "--force", handle],
        signal,
      );
      owned.delete(handle);
    },
  };
}

function createCommand(
  plan: DockerSandboxPlan,
  workspaceRoot: string,
  name: string,
  nonce: string,
  planDigest: string,
): string[] {
  return [
    "container",
    "create",
    "--pull=never",
    "--interactive",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges=true",
    "--pids-limit",
    String(plan.limits.pidsLimit),
    "--memory",
    `${plan.limits.memoryMiB}m`,
    "--cpus",
    String(plan.limits.cpuCount),
    "--user",
    plan.security.user,
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--mount",
    `type=bind,src=${workspaceRoot},dst=/workspace,rw`,
    "--workdir",
    "/workspace",
    "--name",
    name,
    "--label",
    `${ownerLabel}=${ownerValue}`,
    "--label",
    `${nonceLabel}=${nonce}`,
    "--label",
    `${planLabel}=${planDigest}`,
    plan.image,
    plan.agent.executable,
    ...plan.agent.args,
  ];
}

async function inspectOwned(
  runner: DockerCliProcessRunner,
  environment: Readonly<Record<string, string>>,
  container: OwnedContainer,
  handle: string,
  signal: AbortSignal,
): Promise<ContainerSnapshot> {
  const result = await runControl(
    runner,
    environment,
    container.dockerExecutable,
    ["container", "inspect", "--format", inspectTemplate, handle],
    signal,
  );
  const snapshot = parseSnapshot(result.stdout);
  if (
    snapshot.id !== handle ||
    snapshot.labels[ownerLabel] !== ownerValue ||
    snapshot.labels[nonceLabel] !== container.nonce ||
    snapshot.labels[planLabel] !== container.planDigest
  ) {
    throw new Error("Docker CLI container ownership did not match the execution port.");
  }
  return snapshot;
}

async function readServer(
  runner: DockerCliProcessRunner,
  environment: Readonly<Record<string, string>>,
  executable: string,
  signal: AbortSignal,
): Promise<ServerSnapshot> {
  const result = await runControl(
    runner,
    environment,
    executable,
    ["version", "--format", serverTemplate],
    signal,
  );
  const record = parseJsonRecord(result.stdout, "Docker CLI server response");
  return {
    version: requireString(record["Version"], "server.Version"),
    architecture: normalizeArchitecture(
      requireString(record["Arch"], "server.Arch"),
    ),
  };
}

async function runControl(
  runner: DockerCliProcessRunner,
  environment: Readonly<Record<string, string>>,
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<DockerCliCommandResult> {
  let result: DockerCliCommandResult;
  try {
    result = await runner({
      executable,
      args,
      environment,
      input: new Uint8Array(),
      signal,
      maxOutputBytes: controlOutputLimitBytes,
    });
  } catch {
    throw new Error("Docker CLI control command failed.");
  }
  if (!isSuccessful(result)) {
    throw new Error("Docker CLI control command failed.");
  }
  return result;
}

async function bestEffortRemoveUnknown(
  runner: DockerCliProcessRunner,
  environment: Readonly<Record<string, string>>,
  executable: string,
  name: string,
  nonce: string,
  planDigest: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cleanupTimeoutMs);
  try {
    const inspected = await runner({
      executable,
      args: ["container", "inspect", "--format", inspectTemplate, name],
      environment,
      input: new Uint8Array(),
      signal: controller.signal,
      maxOutputBytes: controlOutputLimitBytes,
    });
    if (!isSuccessful(inspected)) {
      return;
    }
    const snapshot = parseSnapshot(inspected.stdout);
    if (
      snapshot.labels[ownerLabel] !== ownerValue ||
      snapshot.labels[nonceLabel] !== nonce ||
      snapshot.labels[planLabel] !== planDigest
    ) {
      return;
    }
    await runner({
      executable,
      args: ["container", "rm", "--force", name],
      environment,
      input: new Uint8Array(),
      signal: controller.signal,
      maxOutputBytes: controlOutputLimitBytes,
    });
  } catch {
    return;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeInspection(
  snapshot: ContainerSnapshot,
  server: ServerSnapshot,
  plan: DockerSandboxPlan,
): DockerSandboxInspection {
  if (
    snapshot.networkMode !== "none" ||
    snapshot.readOnlyRootFilesystem !== true ||
    snapshot.user !== plan.security.user ||
    snapshot.capabilitiesAdded.length !== 0 ||
    !snapshot.capabilitiesDropped.some((value) => value.toUpperCase() === "ALL") ||
    !snapshot.securityOptions.some((value) =>
      value === "no-new-privileges" ||
      value === "no-new-privileges=true" ||
      value === "no-new-privileges:true") ||
    snapshot.mounts.length !== 1 ||
    snapshot.mounts[0]?.destination !== "/workspace" ||
    snapshot.mounts[0]?.readWrite !== true ||
    snapshot.mounts[0]?.propagation !== "rprivate" ||
    snapshot.temporaryFilesystems.length !== 1 ||
    snapshot.temporaryFilesystems[0]?.destination !== "/tmp" ||
    snapshot.temporaryFilesystems[0]?.readWrite !== true ||
    snapshot.temporaryFilesystems[0]?.executable !== false ||
    snapshot.temporaryFilesystems[0]?.setuid !== false ||
    snapshot.temporaryFilesystems[0]?.sizeMiB !== 64 ||
    snapshot.memoryMiB !== plan.limits.memoryMiB ||
    snapshot.cpuCount !== plan.limits.cpuCount ||
    snapshot.pidsLimit !== plan.limits.pidsLimit
  ) {
    throw new Error("Docker CLI inspection did not satisfy the sandbox plan.");
  }
  return {
    engineVersion: server.version,
    architecture: server.architecture,
    imageId: snapshot.imageId,
    networkMode: "none",
    readOnlyRootFilesystem: true,
    user: plan.security.user,
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
    memoryMiB: plan.limits.memoryMiB,
    cpuCount: plan.limits.cpuCount,
    pidsLimit: plan.limits.pidsLimit,
  };
}

interface ContainerSnapshot {
  readonly id: string;
  readonly imageId: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly user: string;
  readonly networkMode: string;
  readonly readOnlyRootFilesystem: boolean;
  readonly capabilitiesAdded: readonly string[];
  readonly capabilitiesDropped: readonly string[];
  readonly securityOptions: readonly string[];
  readonly mounts: readonly {
    readonly destination: string;
    readonly readWrite: boolean;
    readonly propagation: string;
  }[];
  readonly temporaryFilesystems: readonly {
    readonly destination: string;
    readonly readWrite: boolean;
    readonly executable: boolean;
    readonly setuid: boolean;
    readonly sizeMiB: number;
  }[];
  readonly memoryMiB: number;
  readonly cpuCount: number;
  readonly pidsLimit: number;
  readonly state: {
    readonly status: string;
    readonly exitCode: number;
  };
}

interface ServerSnapshot {
  readonly version: string;
  readonly architecture: string;
}

function parseSnapshot(bytes: Uint8Array): ContainerSnapshot {
  const record = parseJsonRecord(bytes, "Docker CLI inspect response");
  const config = requireRecord(record["Config"], "inspect.Config");
  const host = requireRecord(record["HostConfig"], "inspect.HostConfig");
  const state = requireRecord(record["State"], "inspect.State");
  const labels = requireStringRecord(config["Labels"], "inspect.Config.Labels");
  const mounts = requireArray(record["Mounts"], "inspect.Mounts").map((value) => {
    const mount = requireRecord(value, "inspect.Mounts item");
    return {
      destination: requireString(mount["Destination"], "mount.Destination"),
      readWrite: requireBoolean(mount["RW"], "mount.RW"),
      propagation: requireString(mount["Propagation"], "mount.Propagation"),
    };
  });
  const tmpfs = requireStringRecord(host["Tmpfs"] ?? {}, "inspect.HostConfig.Tmpfs");
  return {
    id: requireString(record["Id"], "inspect.Id"),
    imageId: requireImageId(record["Image"]),
    labels,
    user: requireString(config["User"], "inspect.Config.User"),
    networkMode: requireString(host["NetworkMode"], "inspect.HostConfig.NetworkMode"),
    readOnlyRootFilesystem: requireBoolean(
      host["ReadonlyRootfs"],
      "inspect.HostConfig.ReadonlyRootfs",
    ),
    capabilitiesAdded: requireStringArray(host["CapAdd"] ?? [], "inspect.HostConfig.CapAdd"),
    capabilitiesDropped: requireStringArray(
      host["CapDrop"] ?? [],
      "inspect.HostConfig.CapDrop",
    ),
    securityOptions: requireStringArray(
      host["SecurityOpt"] ?? [],
      "inspect.HostConfig.SecurityOpt",
    ),
    mounts,
    temporaryFilesystems: Object.entries(tmpfs).map(([destination, value]) =>
      parseTemporaryFilesystem(destination, value)),
    memoryMiB: bytesToMiB(requireInteger(host["Memory"], "inspect.HostConfig.Memory")),
    cpuCount: requireInteger(host["NanoCpus"], "inspect.HostConfig.NanoCpus") / 1_000_000_000,
    pidsLimit: requireInteger(host["PidsLimit"], "inspect.HostConfig.PidsLimit"),
    state: {
      status: requireString(state["Status"], "inspect.State.Status"),
      exitCode: requireInteger(state["ExitCode"], "inspect.State.ExitCode"),
    },
  };
}

function parseTemporaryFilesystem(
  destination: string,
  options: string,
): ContainerSnapshot["temporaryFilesystems"][number] {
  const values = new Set(options.split(","));
  const size = [...values].find((value) => value.startsWith("size="));
  return {
    destination,
    readWrite: values.has("rw"),
    executable: !values.has("noexec"),
    setuid: !values.has("nosuid"),
    sizeMiB: parseTmpfsSize(size),
  };
}

function parseTmpfsSize(value: string | undefined): number {
  if (value === undefined) {
    throw new Error("Docker CLI tmpfs size is missing.");
  }
  const raw = value.slice("size=".length).toLowerCase();
  if (/^[0-9]+m$/.test(raw)) {
    return Number(raw.slice(0, -1));
  }
  if (/^[0-9]+$/.test(raw)) {
    return bytesToMiB(Number(raw));
  }
  throw new Error("Docker CLI tmpfs size is unsupported.");
}

function toExecutionResult(
  result: DockerCliCommandResult,
  exitCode: number,
): DockerSandboxExecutionResult {
  return {
    termination: result.termination,
    exitCode,
    stdout: new Uint8Array(result.stdout),
    combinedOutputBytes: result.combinedOutputBytes,
  };
}

function isSuccessful(result: DockerCliCommandResult): boolean {
  return result.termination === "exited" && result.exitCode === 0;
}

function requireOwned(
  owned: Map<string, OwnedContainer>,
  handle: string,
): OwnedContainer {
  const container = owned.get(handle);
  if (container === undefined) {
    throw new Error("Docker CLI handle is not owned by this execution port.");
  }
  return container;
}

function validateEnvironment(
  environment: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const canonical: Record<string, string> = {};
  for (const name of Object.keys(environment).sort(compareText)) {
    const value = environment[name];
    if (
      value === undefined ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      value.includes("\0")
    ) {
      throw new Error("Docker CLI environment is invalid.");
    }
    canonical[name] = value;
  }
  return canonical;
}

function validateWorkspaceRoot(value: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) {
    throw new Error("Docker CLI workspace root must be an absolute path without NUL.");
  }
  return path.resolve(value);
}

function validateNonce(value: string): string {
  if (!/^[a-f0-9]{32}$/.test(value)) {
    throw new Error("Docker CLI ownership nonce must be 32 lowercase hex characters.");
  }
  return value;
}

function defaultNonce(): string {
  return randomUUID().replaceAll("-", "");
}

function parseJsonRecord(bytes: Uint8Array, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decodeText(bytes));
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
  return requireRecord(value, label);
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Docker CLI output must be valid UTF-8.");
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty string without NUL.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean.`);
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, label).map((item) => requireString(item, `${label} item`));
}

function requireStringRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  const record = requireRecord(value, label);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    result[key] = requireString(item, `${label}.${key}`);
  }
  return result;
}

function requireImageId(value: unknown): string {
  const image = requireString(value, "inspect.Image");
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("inspect.Image must be a SHA-256 image ID.");
  }
  return image;
}

function bytesToMiB(value: number): number {
  const mebibytes = value / (1024 * 1024);
  if (!Number.isSafeInteger(mebibytes)) {
    throw new Error("Docker CLI byte limit must be an exact MiB value.");
  }
  return mebibytes;
}

function normalizeArchitecture(value: string): string {
  if (value === "amd64") {
    return "x86_64";
  }
  if (value === "arm64") {
    return "aarch64";
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
