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
  return createHash("sha256").update(JSON.stringify(validated), "utf8").digest("hex");
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
      "no-new-privileges:true",
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

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}
