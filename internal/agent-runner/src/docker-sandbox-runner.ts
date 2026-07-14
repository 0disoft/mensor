import * as path from "node:path";

import {
  createDockerSandboxRuntimeAttestation,
  validateDockerSandboxCollectorRef,
  type DockerSandboxCollectorRef,
  type DockerSandboxRuntimeAttestation,
  type DockerSandboxRuntimeObservation,
} from "./docker-sandbox-attestation.js";
import {
  dockerSandboxPlanDigest,
  type DockerSandboxPlan,
} from "./docker-sandbox-plan.js";

export type DockerSandboxInspection = Omit<
  DockerSandboxRuntimeObservation,
  "collector"
>;

export interface DockerSandboxExecutionResult {
  readonly termination: "exited" | "timeout" | "output-limit";
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly combinedOutputBytes: number;
}

export interface DockerSandboxExecutionPort {
  readonly create: (
    plan: DockerSandboxPlan,
    workspaceRoot: string,
    signal: AbortSignal,
  ) => Promise<string>;
  readonly inspect: (
    handle: string,
    signal: AbortSignal,
  ) => Promise<DockerSandboxInspection>;
  readonly start: (
    handle: string,
    input: Uint8Array,
    signal: AbortSignal,
  ) => Promise<DockerSandboxExecutionResult>;
  readonly remove: (handle: string, signal: AbortSignal) => Promise<void>;
}

export interface RunDockerSandboxOptions {
  readonly plan: DockerSandboxPlan;
  readonly collector: DockerSandboxCollectorRef;
  readonly workspaceRoot: string;
  readonly input: Uint8Array;
  readonly port: DockerSandboxExecutionPort;
  readonly cleanupTimeoutMs?: number;
}

export interface DockerSandboxRunResult {
  readonly attestation: DockerSandboxRuntimeAttestation;
  readonly stdout: Uint8Array;
}

export async function runDockerSandbox(
  options: RunDockerSandboxOptions,
): Promise<DockerSandboxRunResult> {
  dockerSandboxPlanDigest(options.plan);
  const collector = validateDockerSandboxCollectorRef(options.collector);
  const workspaceRoot = validateDockerSandboxWorkspaceRoot(options.workspaceRoot);
  const input = validateInput(options.input, options.plan.limits.maxInputBytes);
  validateDockerSandboxExecutionPort(options.port);
  const cleanupTimeoutMs = validateDockerSandboxCleanupTimeout(
    options.cleanupTimeoutMs ?? 10_000,
  );

  const executionController = new AbortController();
  const executionTimeout = setTimeout(
    () => executionController.abort(),
    options.plan.limits.timeoutMs,
  );
  let handle: string | null = null;
  let executionFailed = false;

  try {
    const createdHandle = await runExecutionStage(
      "create",
      options.port.create(options.plan, workspaceRoot, executionController.signal),
      executionController.signal,
    );
    if (typeof createdHandle !== "string") {
      throw new Error("Docker sandbox create returned an invalid handle.");
    }
    handle = createdHandle;
    validateHandle(handle);
    const inspection = await runExecutionStage(
      "inspect",
      options.port.inspect(handle, executionController.signal),
      executionController.signal,
    );
    let attestation: DockerSandboxRuntimeAttestation;
    try {
      attestation = createDockerSandboxRuntimeAttestation(options.plan, {
        ...inspection,
        collector,
      });
    } catch {
      throw new Error("Docker sandbox inspection did not match its plan.");
    }
    const execution = validateExecutionResult(await runExecutionStage(
      "start",
      options.port.start(handle, input, executionController.signal),
      executionController.signal,
    ), options.plan.limits.maxOutputBytes);
    return {
      attestation,
      stdout: new Uint8Array(execution.stdout),
    };
  } catch (error) {
    executionFailed = true;
    throw error;
  } finally {
    clearTimeout(executionTimeout);
    if (handle !== null) {
      try {
        await removeWithTimeout(options.port, handle, cleanupTimeoutMs);
      } catch {
        throw new Error(executionFailed
          ? "Docker sandbox cleanup failed after an execution failure."
          : "Docker sandbox cleanup failed.");
      }
    }
  }
}

async function runExecutionStage<T>(
  stage: "create" | "inspect" | "start",
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  try {
    return await Promise.race([
      operation,
      aborted(signal),
    ]);
  } catch {
    if (signal.aborted) {
      throw new Error("Docker sandbox execution exceeded its timeout.");
    }
    throw new Error(`Docker sandbox ${stage} failed.`);
  }
}

async function removeWithTimeout(
  port: DockerSandboxExecutionPort,
  handle: string,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.race([
      port.remove(handle, controller.signal),
      aborted(controller.signal),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

function validateExecutionResult(
  value: DockerSandboxExecutionResult,
  maxOutputBytes: number,
): DockerSandboxExecutionResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Docker sandbox execution result must be an object.");
  }
  const keys = Object.keys(value).sort(compareText);
  if (JSON.stringify(keys) !== JSON.stringify([
    "combinedOutputBytes", "exitCode", "stdout", "termination",
  ])) {
    throw new Error("Docker sandbox execution result contains unsupported fields.");
  }
  if (!(value.stdout instanceof Uint8Array)) {
    throw new Error("Docker sandbox stdout must be bytes.");
  }
  if (
    !Number.isSafeInteger(value.combinedOutputBytes) ||
    value.combinedOutputBytes < value.stdout.byteLength
  ) {
    throw new Error("Docker sandbox combined output size is invalid.");
  }
  if (value.termination === "timeout") {
    throw new Error("Docker sandbox execution exceeded its timeout.");
  }
  if (value.termination === "output-limit" || value.combinedOutputBytes > maxOutputBytes) {
    throw new Error("Docker sandbox execution exceeded its output limit.");
  }
  if (value.termination !== "exited" || !Number.isSafeInteger(value.exitCode)) {
    throw new Error("Docker sandbox execution result is invalid.");
  }
  if (value.exitCode !== 0) {
    throw new Error("Docker sandbox execution exited unsuccessfully.");
  }
  return value;
}

function validateInput(value: Uint8Array, maxInputBytes: number): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error("Docker sandbox input must be bytes.");
  }
  if (value.byteLength > maxInputBytes) {
    throw new Error("Docker sandbox input exceeded its input limit.");
  }
  return new Uint8Array(value);
}

export function validateDockerSandboxWorkspaceRoot(value: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) {
    throw new Error("Docker sandbox workspace root must be an absolute path without NUL.");
  }
  return path.resolve(value);
}

function validateHandle(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error("Docker sandbox handle must be a bounded opaque identifier.");
  }
}

export function validateDockerSandboxCleanupTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 30_000) {
    throw new Error("Docker sandbox cleanup timeout must be an integer from 100 to 30000 milliseconds.");
  }
  return value;
}

export function validateDockerSandboxExecutionPort(
  value: DockerSandboxExecutionPort,
): DockerSandboxExecutionPort {
  if (
    typeof value !== "object" || value === null ||
    typeof value.create !== "function" ||
    typeof value.inspect !== "function" ||
    typeof value.start !== "function" ||
    typeof value.remove !== "function"
  ) {
    throw new Error("Docker sandbox execution port is incomplete.");
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
