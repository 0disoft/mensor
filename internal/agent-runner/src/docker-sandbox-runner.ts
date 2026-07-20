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
import { validateDockerSandboxWorkspaceRoot } from "./docker-sandbox-workspace.js";

export { validateDockerSandboxWorkspaceRoot } from "./docker-sandbox-workspace.js";

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

export type DockerSandboxFailureStage = "create" | "inspect" | "execute" | "cleanup";

class DockerSandboxStageError extends Error {
  readonly stage: DockerSandboxFailureStage;

  constructor(stage: DockerSandboxFailureStage, message: string) {
    super(message);
    this.name = "DockerSandboxStageError";
    this.stage = stage;
  }
}

export function dockerSandboxFailureStage(
  error: unknown,
): DockerSandboxFailureStage | null {
  return error instanceof DockerSandboxStageError ? error.stage : null;
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
      throw stageError("create", "Docker sandbox create returned an invalid handle.");
    }
    handle = createdHandle;
    try {
      validateHandle(handle);
    } catch {
      throw stageError("create", "Docker sandbox handle must be a bounded opaque identifier.");
    }
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
      throw stageError("inspect", "Docker sandbox inspection did not match its plan.");
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
        throw stageError("cleanup", executionFailed
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
      throw stageError(
        stage === "start" ? "execute" : stage,
        "Docker sandbox execution exceeded its timeout.",
      );
    }
    throw stageError(
      stage === "start" ? "execute" : stage,
      `Docker sandbox ${stage} failed.`,
    );
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
    throw stageError("execute", "Docker sandbox execution result must be an object.");
  }
  const keys = Object.keys(value).sort(compareText);
  if (JSON.stringify(keys) !== JSON.stringify([
    "combinedOutputBytes", "exitCode", "stdout", "termination",
  ])) {
    throw stageError(
      "execute",
      "Docker sandbox execution result contains unsupported fields.",
    );
  }
  if (!(value.stdout instanceof Uint8Array)) {
    throw stageError("execute", "Docker sandbox stdout must be bytes.");
  }
  if (
    !Number.isSafeInteger(value.combinedOutputBytes) ||
    value.combinedOutputBytes < value.stdout.byteLength
  ) {
    throw stageError("execute", "Docker sandbox combined output size is invalid.");
  }
  if (value.termination === "timeout") {
    throw stageError("execute", "Docker sandbox execution exceeded its timeout.");
  }
  if (value.termination === "output-limit" || value.combinedOutputBytes > maxOutputBytes) {
    throw stageError("execute", "Docker sandbox execution exceeded its output limit.");
  }
  if (value.termination !== "exited" || !Number.isSafeInteger(value.exitCode)) {
    throw stageError("execute", "Docker sandbox execution result is invalid.");
  }
  if (value.exitCode !== 0) {
    throw stageError("execute", "Docker sandbox execution exited unsuccessfully.");
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

function validateHandle(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error("Docker sandbox handle must be a bounded opaque identifier.");
  }
}

function stageError(
  stage: DockerSandboxFailureStage,
  message: string,
): DockerSandboxStageError {
  return new DockerSandboxStageError(stage, message);
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
