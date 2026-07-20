import {
  createAgentTrialReport,
  runAgentTrial,
  validateAgentTrialReport,
  type AgentTrialReport,
  type AgentTrialResult,
  type RunAgentTrialOptions,
} from "@mensor/fixture-kit";

import {
  createAgentCommandInput,
  parseAgentCommandOutput,
} from "./command-adapter.js";
import {
  validateDockerSandboxCollectorRef,
  type DockerSandboxRuntimeAttestation,
} from "./docker-sandbox-attestation.js";
import {
  validateDockerSandboxConformanceReportBindings,
  type DockerSandboxConformanceReport,
} from "./docker-sandbox-conformance.js";
import {
  createDockerSandboxPlanCommitment,
  type DockerSandboxPlan,
  type DockerSandboxPlanCommitment,
} from "./docker-sandbox-plan.js";
import {
  dockerSandboxFailureStage,
  runDockerSandbox,
  validateDockerSandboxCleanupTimeout,
  validateDockerSandboxExecutionPort,
  validateDockerSandboxWorkspaceRoot,
  type DockerSandboxExecutionPort,
} from "./docker-sandbox-runner.js";
import {
  createSandboxExecutionDescriptor,
  validateSandboxExecutionMetadata,
  type SandboxExecutionMetadata,
} from "./sandbox-execution-descriptor.js";
import {
  createSandboxAgentTrialEvidence,
  validateSandboxAgentTrialEvidence,
  type SandboxAgentTrialEvidence,
} from "./sandbox-trial-evidence.js";

export const sandboxTrialFailureStages = [
  "prepare",
  "create",
  "inspect",
  "execute",
  "cleanup",
  "verify",
] as const;

export type SandboxTrialFailureStage = (typeof sandboxTrialFailureStages)[number];

export const sandboxTrialFailureCategories = [
  "invalid-configuration",
  "trial-setup-failed",
  "sandbox-create-failed",
  "sandbox-inspection-failed",
  "sandbox-execution-failed",
  "sandbox-cleanup-failed",
  "verification-failed",
] as const;

export type SandboxTrialFailureCategory =
  (typeof sandboxTrialFailureCategories)[number];

export interface SandboxAgentTrialSuccess {
  readonly schemaVersion: 1;
  readonly ok: true;
  readonly evidence: SandboxAgentTrialEvidence;
}

export interface SandboxAgentTrialFailure {
  readonly schemaVersion: 1;
  readonly ok: false;
  readonly stage: SandboxTrialFailureStage;
  readonly category: SandboxTrialFailureCategory;
  readonly report: AgentTrialReport | null;
}

export type SandboxAgentTrialOutcome =
  | SandboxAgentTrialSuccess
  | SandboxAgentTrialFailure;

export interface RunSandboxAgentTrialOptions {
  readonly execution: SandboxExecutionMetadata;
  readonly plan: DockerSandboxPlan;
  readonly portConformance: DockerSandboxConformanceReport;
  readonly port: DockerSandboxExecutionPort;
  readonly trial: Omit<RunAgentTrialOptions, "adapter">;
  readonly producerVersion: string;
  readonly cleanupTimeoutMs?: number;
}

interface SandboxTrialPreflight {
  readonly execution: SandboxExecutionMetadata;
  readonly planCommitment: DockerSandboxPlanCommitment;
  readonly portConformance: DockerSandboxConformanceReport;
  readonly cleanupTimeoutMs: number;
}

export async function runSandboxAgentTrial(
  options: RunSandboxAgentTrialOptions,
): Promise<SandboxAgentTrialOutcome> {
  let preflight: SandboxTrialPreflight;
  try {
    preflight = validatePreflight(options);
  } catch {
    return createFailure("prepare", "invalid-configuration", null);
  }

  const state: {
    runtimeAttestation: DockerSandboxRuntimeAttestation | null;
    executionFailure: SandboxAgentTrialFailure | null;
    currentStage: SandboxTrialFailureStage;
  } = {
    runtimeAttestation: null,
    executionFailure: null,
    currentStage: "prepare",
  };
  let trial: AgentTrialResult;
  try {
    trial = await runAgentTrial({
      ...options.trial,
      adapter: async (context) => {
        state.currentStage = "execute";
        try {
          const input = createAgentCommandInput(
            context,
            options.plan.limits.maxInputBytes,
          );
          const result = await runDockerSandbox({
            plan: options.plan,
            collector: preflight.execution.collector,
            workspaceRoot: context.root,
            input,
            port: options.port,
            cleanupTimeoutMs: preflight.cleanupTimeoutMs,
          });
          state.runtimeAttestation = result.attestation;
          state.currentStage = "verify";
          return parseAgentCommandOutput(result.stdout);
        } catch (error) {
          state.executionFailure = classifyExecutionFailure(error);
          throw error;
        }
      },
    });
  } catch {
    return createFailure(
      state.currentStage,
      state.currentStage === "prepare" ? "trial-setup-failed" : "verification-failed",
      null,
    );
  }

  const report = createAgentTrialReport([trial], options.producerVersion);
  if (state.runtimeAttestation === null) {
    return state.executionFailure === null
      ? createFailure("execute", "sandbox-execution-failed", report)
      : createFailure(
        state.executionFailure.stage,
        state.executionFailure.category,
        report,
      );
  }

  try {
    const descriptor = createSandboxExecutionDescriptor(
      preflight.execution,
      options.plan,
      state.runtimeAttestation,
      preflight.portConformance,
    );
    return {
      schemaVersion: 1,
      ok: true,
      evidence: createSandboxAgentTrialEvidence(
        descriptor,
        preflight.planCommitment,
        state.runtimeAttestation,
        preflight.portConformance,
        report,
      ),
    };
  } catch {
    return createFailure("verify", "verification-failed", report);
  }
}

export function parseSandboxAgentTrialOutcome(text: string): SandboxAgentTrialOutcome {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Sandbox agent trial outcome must contain valid JSON.");
  }
  return validateSandboxAgentTrialOutcome(value);
}

export function serializeSandboxAgentTrialOutcome(
  outcome: SandboxAgentTrialOutcome,
): string {
  return `${JSON.stringify(validateSandboxAgentTrialOutcome(outcome), null, 2)}\n`;
}

export function validateSandboxAgentTrialOutcome(
  value: unknown,
): SandboxAgentTrialOutcome {
  const outcome = requireRecord(value, "sandbox agent trial outcome");
  if (outcome["ok"] === true) {
    requireKeys(outcome, ["schemaVersion", "ok", "evidence"]);
    if (outcome["schemaVersion"] !== 1) {
      throw new Error("Sandbox agent trial outcome schemaVersion must be 1.");
    }
    const canonical: SandboxAgentTrialSuccess = {
      schemaVersion: 1,
      ok: true,
      evidence: validateSandboxAgentTrialEvidence(outcome["evidence"]),
    };
    requireCanonical(value, canonical);
    return canonical;
  }
  if (outcome["ok"] === false) {
    requireKeys(outcome, ["schemaVersion", "ok", "stage", "category", "report"]);
    if (outcome["schemaVersion"] !== 1) {
      throw new Error("Sandbox agent trial outcome schemaVersion must be 1.");
    }
    const canonical: SandboxAgentTrialFailure = {
      schemaVersion: 1,
      ok: false,
      stage: requireCatalogValue(
        outcome["stage"],
        sandboxTrialFailureStages,
        "stage",
      ) as SandboxTrialFailureStage,
      category: requireCatalogValue(
        outcome["category"],
        sandboxTrialFailureCategories,
        "category",
      ) as SandboxTrialFailureCategory,
      report: outcome["report"] === null
        ? null
        : validateAgentTrialReport(outcome["report"]),
    };
    requireCanonical(value, canonical);
    return canonical;
  }
  throw new Error("Sandbox agent trial outcome ok must be boolean.");
}

function validatePreflight(
  options: RunSandboxAgentTrialOptions,
): SandboxTrialPreflight {
  const execution = validateSandboxExecutionMetadata(options.execution);
  const planCommitment = createDockerSandboxPlanCommitment(options.plan);
  const portConformance = validateDockerSandboxConformanceReportBindings(
    options.portConformance,
    planCommitment,
  );
  if (!portConformance.summary.conformant) {
    throw new Error("Sandbox agent trial requires a conformant execution port.");
  }
  validateDockerSandboxCollectorRef(execution.collector);
  validateDockerSandboxExecutionPort(options.port);
  validateDockerSandboxWorkspaceRoot(options.trial.root);
  createAgentTrialReport([], options.producerVersion);
  if (!sameArtifact(execution.sandboxAdapter, portConformance.adapter)) {
    throw new Error("Sandbox execution metadata does not match the conformance adapter.");
  }
  return {
    execution,
    planCommitment,
    portConformance,
    cleanupTimeoutMs: validateDockerSandboxCleanupTimeout(
      options.cleanupTimeoutMs ?? 10_000,
    ),
  };
}

function classifyExecutionFailure(error: unknown): SandboxAgentTrialFailure {
  const stage = dockerSandboxFailureStage(error);
  if (stage === "create") {
    return createFailure(stage, "sandbox-create-failed", null);
  }
  if (stage === "inspect") {
    return createFailure(stage, "sandbox-inspection-failed", null);
  }
  if (stage === "cleanup") {
    return createFailure(stage, "sandbox-cleanup-failed", null);
  }
  if (stage === "execute") {
    return createFailure(stage, "sandbox-execution-failed", null);
  }
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Agent command output")) {
    return createFailure("verify", "verification-failed", null);
  }
  return createFailure("execute", "sandbox-execution-failed", null);
}

function createFailure(
  stage: SandboxTrialFailureStage,
  category: SandboxTrialFailureCategory,
  report: AgentTrialReport | null,
): SandboxAgentTrialFailure {
  return {
    schemaVersion: 1,
    ok: false,
    stage,
    category,
    report: report === null ? null : validateAgentTrialReport(report),
  };
}

function sameArtifact(
  left: SandboxExecutionMetadata["sandboxAdapter"],
  right: DockerSandboxConformanceReport["adapter"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort(compareText))) {
    throw new Error("Sandbox agent trial outcome contains unsupported or missing fields.");
  }
}

function requireCatalogValue(
  value: unknown,
  catalog: readonly string[],
  label: string,
): string {
  if (typeof value !== "string" || !catalog.includes(value)) {
    throw new Error(`Sandbox agent trial outcome ${label} is unsupported.`);
  }
  return value;
}

function requireCanonical(value: unknown, canonical: SandboxAgentTrialOutcome): void {
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Sandbox agent trial outcome must use canonical bindings and ordering.");
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
