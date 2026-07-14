import { createHash } from "node:crypto";
import * as path from "node:path";

import type { CommandAgentAdapterOptions } from "./command-adapter.js";

export interface DockerSandboxPlanOptions {
  readonly dockerExecutable: string;
  readonly image: string;
  readonly agentExecutable: string;
  readonly agentArgs?: readonly string[];
  readonly timeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly memoryMiB: number;
  readonly cpuCount: number;
  readonly pidsLimit: number;
}

export interface DockerSandboxPlan {
  readonly schemaVersion: 1;
  readonly kind: "docker-networkless";
  readonly dockerExecutable: string;
  readonly image: string;
  readonly agent: {
    readonly executable: string;
    readonly args: readonly string[];
  };
  readonly security: {
    readonly network: "none";
    readonly rootFilesystem: "read-only";
    readonly workspaceMount: "read-write-only";
    readonly capabilities: "none";
    readonly privilegeEscalation: "disabled";
    readonly credentials: "none";
    readonly user: "65532:65532";
  };
  readonly limits: {
    readonly timeoutMs: number;
    readonly maxInputBytes: number;
    readonly maxOutputBytes: number;
    readonly memoryMiB: number;
    readonly cpuCount: number;
    readonly pidsLimit: number;
  };
}

export interface DockerSandboxPlanCommitment {
  readonly schemaVersion: 1;
  readonly kind: "docker-networkless-commitment";
  readonly dockerExecutableSha256: string;
  readonly image: string;
  readonly agent: {
    readonly executable: string;
    readonly argsSha256: string;
  };
  readonly security: DockerSandboxPlan["security"];
  readonly limits: DockerSandboxPlan["limits"];
}

export function createDockerSandboxPlan(
  options: DockerSandboxPlanOptions,
): DockerSandboxPlan {
  if (!path.isAbsolute(options.dockerExecutable) || options.dockerExecutable.includes("\0")) {
    throw new Error("Docker executable must be an absolute path without NUL.");
  }
  if (!/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(options.image)) {
    throw new Error("Docker image must use an immutable lowercase SHA-256 digest.");
  }
  if (!options.agentExecutable.startsWith("/") || options.agentExecutable.includes("\0")) {
    throw new Error("Container agent executable must be an absolute POSIX path without NUL.");
  }
  const args = [...(options.agentArgs ?? [])];
  if (args.some((argument) => argument.includes("\0"))) {
    throw new Error("Container agent arguments must not contain NUL.");
  }
  const plan: DockerSandboxPlan = {
    schemaVersion: 1,
    kind: "docker-networkless",
    dockerExecutable: options.dockerExecutable,
    image: options.image,
    agent: { executable: options.agentExecutable, args },
    security: {
      network: "none",
      rootFilesystem: "read-only",
      workspaceMount: "read-write-only",
      capabilities: "none",
      privilegeEscalation: "disabled",
      credentials: "none",
      user: "65532:65532",
    },
    limits: {
      timeoutMs: boundedInteger(options.timeoutMs, 1, 300_000, "timeoutMs"),
      maxInputBytes: boundedInteger(options.maxInputBytes, 1, 65_536, "maxInputBytes"),
      maxOutputBytes: boundedInteger(options.maxOutputBytes, 1, 1_048_576, "maxOutputBytes"),
      memoryMiB: boundedInteger(options.memoryMiB, 64, 16_384, "memoryMiB"),
      cpuCount: boundedInteger(options.cpuCount, 1, 16, "cpuCount"),
      pidsLimit: boundedInteger(options.pidsLimit, 16, 4_096, "pidsLimit"),
    },
  };
  return plan;
}

export function dockerSandboxPlanDigest(plan: DockerSandboxPlan): string {
  return dockerSandboxPlanCommitmentDigest(createDockerSandboxPlanCommitment(plan));
}

export function createDockerSandboxPlanCommitment(
  plan: DockerSandboxPlan,
): DockerSandboxPlanCommitment {
  const validated = validateDockerSandboxPlan(plan);
  return {
    schemaVersion: 1,
    kind: "docker-networkless-commitment",
    dockerExecutableSha256: sha256(validated.dockerExecutable),
    image: validated.image,
    agent: {
      executable: validated.agent.executable,
      argsSha256: sha256(JSON.stringify(validated.agent.args)),
    },
    security: { ...validated.security },
    limits: { ...validated.limits },
  };
}

export function parseDockerSandboxPlanCommitment(
  text: string,
): DockerSandboxPlanCommitment {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Docker sandbox plan commitment must contain valid JSON.");
  }
  return validateDockerSandboxPlanCommitment(value);
}

export function serializeDockerSandboxPlanCommitment(
  commitment: DockerSandboxPlanCommitment,
): string {
  return `${JSON.stringify(validateDockerSandboxPlanCommitment(commitment), null, 2)}\n`;
}

export function dockerSandboxPlanCommitmentDigest(
  commitment: DockerSandboxPlanCommitment,
): string {
  return sha256(JSON.stringify(validateDockerSandboxPlanCommitment(commitment)));
}

export function validateDockerSandboxPlanCommitment(
  value: unknown,
): DockerSandboxPlanCommitment {
  const commitment = requireRecord(value, "Docker sandbox plan commitment");
  requireKeys(commitment, [
    "schemaVersion", "kind", "dockerExecutableSha256", "image", "agent", "security", "limits",
  ], "Docker sandbox plan commitment");
  const agent = requireRecord(commitment["agent"], "agent");
  requireKeys(agent, ["executable", "argsSha256"], "agent");
  const security = requireRecord(commitment["security"], "security");
  requireKeys(security, [
    "network", "rootFilesystem", "workspaceMount", "capabilities",
    "privilegeEscalation", "credentials", "user",
  ], "security");
  const limits = requireRecord(commitment["limits"], "limits");
  requireKeys(limits, [
    "timeoutMs", "maxInputBytes", "maxOutputBytes", "memoryMiB", "cpuCount", "pidsLimit",
  ], "limits");

  const canonical: DockerSandboxPlanCommitment = {
    schemaVersion: requireConstant(commitment["schemaVersion"], 1, "schemaVersion"),
    kind: requireConstant(
      commitment["kind"],
      "docker-networkless-commitment",
      "kind",
    ),
    dockerExecutableSha256: requireDigest(
      commitment["dockerExecutableSha256"],
      "dockerExecutableSha256",
    ),
    image: requireImage(commitment["image"]),
    agent: {
      executable: requireAgentExecutable(agent["executable"]),
      argsSha256: requireDigest(agent["argsSha256"], "agent.argsSha256"),
    },
    security: {
      network: requireConstant(security["network"], "none", "security.network"),
      rootFilesystem: requireConstant(
        security["rootFilesystem"],
        "read-only",
        "security.rootFilesystem",
      ),
      workspaceMount: requireConstant(
        security["workspaceMount"],
        "read-write-only",
        "security.workspaceMount",
      ),
      capabilities: requireConstant(
        security["capabilities"],
        "none",
        "security.capabilities",
      ),
      privilegeEscalation: requireConstant(
        security["privilegeEscalation"],
        "disabled",
        "security.privilegeEscalation",
      ),
      credentials: requireConstant(
        security["credentials"],
        "none",
        "security.credentials",
      ),
      user: requireConstant(security["user"], "65532:65532", "security.user"),
    },
    limits: {
      timeoutMs: boundedInteger(limits["timeoutMs"], 1, 300_000, "limits.timeoutMs"),
      maxInputBytes: boundedInteger(
        limits["maxInputBytes"],
        1,
        65_536,
        "limits.maxInputBytes",
      ),
      maxOutputBytes: boundedInteger(
        limits["maxOutputBytes"],
        1,
        1_048_576,
        "limits.maxOutputBytes",
      ),
      memoryMiB: boundedInteger(limits["memoryMiB"], 64, 16_384, "limits.memoryMiB"),
      cpuCount: boundedInteger(limits["cpuCount"], 1, 16, "limits.cpuCount"),
      pidsLimit: boundedInteger(limits["pidsLimit"], 16, 4_096, "limits.pidsLimit"),
    },
  };
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Docker sandbox plan commitment must use canonical field ordering.");
  }
  return canonical;
}

function validateDockerSandboxPlan(plan: DockerSandboxPlan): DockerSandboxPlan {
  const validated = createDockerSandboxPlan({
    dockerExecutable: plan.dockerExecutable,
    image: plan.image,
    agentExecutable: plan.agent.executable,
    agentArgs: plan.agent.args,
    ...plan.limits,
  });
  if (JSON.stringify(plan) !== JSON.stringify(validated)) {
    throw new Error("Docker sandbox plan must use canonical derived security settings.");
  }
  return validated;
}

export function materializeDockerSandboxCommand(
  plan: DockerSandboxPlan,
  workspaceRoot: string,
): CommandAgentAdapterOptions {
  dockerSandboxPlanDigest(plan);
  const root = path.resolve(workspaceRoot);
  if (!path.isAbsolute(workspaceRoot) || workspaceRoot.includes("\0")) {
    throw new Error("Docker workspace root must be an absolute path without NUL.");
  }
  return {
    executable: plan.dockerExecutable,
    args: [
      "run",
      "--rm",
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
      `type=bind,src=${root},dst=/workspace,rw`,
      "--workdir",
      "/workspace",
      plan.image,
      plan.agent.executable,
      ...plan.agent.args,
    ],
    environment: {},
    timeoutMs: plan.limits.timeoutMs,
    maxInputBytes: plan.limits.maxInputBytes,
    maxOutputBytes: plan.limits.maxOutputBytes,
  };
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort(compareText))) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireImage(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("image must use an immutable lowercase SHA-256 digest.");
  }
  return value;
}

function requireAgentExecutable(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) {
    throw new Error("agent.executable must be an absolute POSIX path without NUL.");
  }
  return value;
}

function requireConstant<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} has an unsupported value.`);
  }
  return expected;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
