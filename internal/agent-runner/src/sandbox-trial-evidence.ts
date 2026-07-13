import {
  createAgentTrialReport,
  validateAgentTrialReport,
  type AgentTrialReport,
} from "@mensor/fixture-kit";

import {
  validateDockerSandboxRuntimeAttestation,
  type DockerSandboxRuntimeAttestation,
} from "./docker-sandbox-attestation.js";
import {
  validateDockerSandboxConformanceReport,
  type DockerSandboxConformanceReport,
} from "./docker-sandbox-conformance.js";
import {
  validateDockerSandboxPlanCommitment,
  type DockerSandboxPlanCommitment,
} from "./docker-sandbox-plan.js";
import {
  sandboxExecutionFingerprint,
  validateSandboxExecutionDescriptor,
  validateSandboxExecutionDescriptorEvidenceBindings,
  type SandboxExecutionDescriptor,
} from "./sandbox-execution-descriptor.js";

export interface SandboxAgentTrialEvidence {
  readonly schemaVersion: 2;
  readonly executionFingerprint: string;
  readonly execution: SandboxExecutionDescriptor;
  readonly artifacts: {
    readonly planCommitment: DockerSandboxPlanCommitment;
    readonly runtimeAttestation: DockerSandboxRuntimeAttestation;
    readonly portConformance: DockerSandboxConformanceReport;
  };
  readonly report: AgentTrialReport;
}

export function createSandboxAgentTrialEvidence(
  execution: SandboxExecutionDescriptor,
  planCommitment: DockerSandboxPlanCommitment,
  runtimeAttestation: DockerSandboxRuntimeAttestation,
  portConformance: DockerSandboxConformanceReport,
  report: AgentTrialReport,
): SandboxAgentTrialEvidence {
  const validatedExecution = validateSandboxExecutionDescriptorEvidenceBindings(
    execution,
    planCommitment,
    runtimeAttestation,
    portConformance,
  );
  const validatedPlanCommitment = validateDockerSandboxPlanCommitment(planCommitment);
  const validatedRuntimeAttestation = validateDockerSandboxRuntimeAttestation(
    runtimeAttestation,
  );
  const validatedPortConformance = validateDockerSandboxConformanceReport(portConformance);
  const validatedReport = validateAgentTrialReport(report);
  return {
    schemaVersion: 2,
    executionFingerprint: sandboxExecutionFingerprint(validatedExecution),
    execution: validatedExecution,
    artifacts: {
      planCommitment: validatedPlanCommitment,
      runtimeAttestation: validatedRuntimeAttestation,
      portConformance: validatedPortConformance,
    },
    report: validatedReport,
  };
}

export function parseSandboxAgentTrialEvidence(text: string): SandboxAgentTrialEvidence {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Sandbox agent trial evidence must contain valid JSON.");
  }
  return validateSandboxAgentTrialEvidence(value);
}

export function serializeSandboxAgentTrialEvidence(
  evidence: SandboxAgentTrialEvidence,
): string {
  return `${JSON.stringify(validateSandboxAgentTrialEvidence(evidence), null, 2)}\n`;
}

export function validateSandboxAgentTrialEvidence(
  value: unknown,
): SandboxAgentTrialEvidence {
  const evidence = requireRecord(value, "sandbox agent trial evidence");
  requireKeys(evidence, [
    "schemaVersion", "executionFingerprint", "execution", "artifacts", "report",
  ], "sandbox agent trial evidence");
  if (evidence["schemaVersion"] !== 2) {
    throw new Error("Sandbox agent trial evidence schemaVersion must be 2.");
  }
  const artifacts = requireRecord(evidence["artifacts"], "artifacts");
  requireKeys(artifacts, [
    "planCommitment", "runtimeAttestation", "portConformance",
  ], "artifacts");
  const canonical = createSandboxAgentTrialEvidence(
    validateSandboxExecutionDescriptor(evidence["execution"]),
    validateDockerSandboxPlanCommitment(artifacts["planCommitment"]),
    validateDockerSandboxRuntimeAttestation(artifacts["runtimeAttestation"]),
    validateDockerSandboxConformanceReport(artifacts["portConformance"]),
    validateAgentTrialReport(evidence["report"]),
  );
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error(
      "Sandbox agent trial evidence must match its canonical bindings and ordering.",
    );
  }
  return canonical;
}

export function mergeSandboxAgentTrialEvidence(
  evidenceItems: readonly SandboxAgentTrialEvidence[],
): SandboxAgentTrialEvidence {
  if (evidenceItems.length === 0) {
    throw new Error("Sandbox evidence cohort must contain at least one evidence item.");
  }
  const validated = evidenceItems.map((item) => validateSandboxAgentTrialEvidence(item));
  const first = validated[0];
  if (first === undefined) {
    throw new Error("Sandbox evidence cohort must contain a first item.");
  }
  const executionBytes = JSON.stringify(first.execution);
  const artifactBytes = JSON.stringify(first.artifacts);
  const producerVersion = first.report.producerVersion;
  for (const item of validated.slice(1)) {
    if (
      item.executionFingerprint !== first.executionFingerprint ||
      JSON.stringify(item.execution) !== executionBytes ||
      JSON.stringify(item.artifacts) !== artifactBytes
    ) {
      throw new Error("Sandbox evidence cohort cannot mix execution artifacts.");
    }
    if (item.report.producerVersion !== producerVersion) {
      throw new Error("Sandbox evidence cohort cannot mix report producer versions.");
    }
  }
  const trials = validated.flatMap((item) => item.report.trials);
  if (trials.length === 0) {
    throw new Error("Sandbox evidence cohort must contain at least one trial.");
  }
  return createSandboxAgentTrialEvidence(
    first.execution,
    first.artifacts.planCommitment,
    first.artifacts.runtimeAttestation,
    first.artifacts.portConformance,
    createAgentTrialReport(trials, producerVersion),
  );
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
