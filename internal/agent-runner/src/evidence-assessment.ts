import {
  validateAgentTrialEvidence,
  type AgentTrialEvidence,
} from "./execution-descriptor.js";
import {
  validateSandboxAgentTrialEvidence,
  type SandboxAgentTrialEvidence,
} from "./sandbox-trial-evidence.js";

export const publicRepairRateBlockers = [
  "credential-scope-not-attested",
  "filesystem-isolation-not-attested",
  "network-control-not-enforced",
  "process-containment-not-enforced",
] as const;

export type PublicRepairRateBlocker = (typeof publicRepairRateBlockers)[number];

export const sandboxPublicRepairRateBlockers = [
  "atomic-construction-provenance-not-attested",
  "credential-scope-not-attested",
  "docker-daemon-fidelity-not-attested",
  "runtime-observation-provenance-not-attested",
] as const;

export type SandboxPublicRepairRateBlocker =
  (typeof sandboxPublicRepairRateBlockers)[number];

export interface AgentEvidenceAssessment {
  readonly schemaVersion: 1;
  readonly executionFingerprint: string;
  readonly claimLevel: "protocol-integrity-only";
  readonly eligibleForPublicRepairRate: false;
  readonly blockers: readonly PublicRepairRateBlocker[];
}

export interface SandboxEvidenceAssessment {
  readonly schemaVersion: 2;
  readonly executionFingerprint: string;
  readonly claimLevel: "sandbox-artifact-integrity-only";
  readonly evidenceLevel: "port-conformance-only";
  readonly atomicConstructionProven: false;
  readonly eligibleForPublicRepairRate: false;
  readonly blockers: readonly SandboxPublicRepairRateBlocker[];
}

export function assessAgentTrialEvidence(
  evidence: AgentTrialEvidence,
): AgentEvidenceAssessment {
  const validated = validateAgentTrialEvidence(evidence);
  return {
    schemaVersion: 1,
    executionFingerprint: validated.executionFingerprint,
    claimLevel: "protocol-integrity-only",
    eligibleForPublicRepairRate: false,
    blockers: publicRepairRateBlockers,
  };
}

export function assessSandboxAgentTrialEvidence(
  evidence: SandboxAgentTrialEvidence,
): SandboxEvidenceAssessment {
  const validated = validateSandboxAgentTrialEvidence(evidence);
  return {
    schemaVersion: 2,
    executionFingerprint: validated.executionFingerprint,
    claimLevel: "sandbox-artifact-integrity-only",
    evidenceLevel: "port-conformance-only",
    atomicConstructionProven: false,
    eligibleForPublicRepairRate: false,
    blockers: sandboxPublicRepairRateBlockers,
  };
}

export function parseAgentEvidenceAssessment(text: string): AgentEvidenceAssessment {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Agent evidence assessment must contain valid JSON.");
  }
  return validateAgentEvidenceAssessment(value);
}

export function serializeAgentEvidenceAssessment(
  assessment: AgentEvidenceAssessment,
): string {
  return `${JSON.stringify(validateAgentEvidenceAssessment(assessment), null, 2)}\n`;
}

export function validateAgentEvidenceAssessment(
  value: unknown,
): AgentEvidenceAssessment {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Agent evidence assessment must be an object.");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "blockers",
    "claimLevel",
    "eligibleForPublicRepairRate",
    "executionFingerprint",
    "schemaVersion",
  ];
  if (JSON.stringify(Object.keys(record).sort(compareText)) !== JSON.stringify(expectedKeys)) {
    throw new Error("Agent evidence assessment contains unsupported fields.");
  }
  if (
    record["schemaVersion"] !== 1 ||
    record["claimLevel"] !== "protocol-integrity-only" ||
    record["eligibleForPublicRepairRate"] !== false ||
    typeof record["executionFingerprint"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(record["executionFingerprint"])
  ) {
    throw new Error("Agent evidence assessment has an invalid claim boundary.");
  }
  if (JSON.stringify(record["blockers"]) !== JSON.stringify(publicRepairRateBlockers)) {
    throw new Error("Agent evidence assessment must contain every canonical blocker.");
  }
  return {
    schemaVersion: 1,
    executionFingerprint: record["executionFingerprint"],
    claimLevel: "protocol-integrity-only",
    eligibleForPublicRepairRate: false,
    blockers: publicRepairRateBlockers,
  };
}

export function parseSandboxEvidenceAssessment(
  text: string,
): SandboxEvidenceAssessment {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Sandbox evidence assessment must contain valid JSON.");
  }
  return validateSandboxEvidenceAssessment(value);
}

export function serializeSandboxEvidenceAssessment(
  assessment: SandboxEvidenceAssessment,
): string {
  return `${JSON.stringify(validateSandboxEvidenceAssessment(assessment), null, 2)}\n`;
}

export function validateSandboxEvidenceAssessment(
  value: unknown,
): SandboxEvidenceAssessment {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Sandbox evidence assessment must be an object.");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "atomicConstructionProven",
    "blockers",
    "claimLevel",
    "eligibleForPublicRepairRate",
    "evidenceLevel",
    "executionFingerprint",
    "schemaVersion",
  ];
  if (JSON.stringify(Object.keys(record).sort(compareText)) !== JSON.stringify(expectedKeys)) {
    throw new Error("Sandbox evidence assessment contains unsupported fields.");
  }
  if (
    record["schemaVersion"] !== 2 ||
    record["claimLevel"] !== "sandbox-artifact-integrity-only" ||
    record["evidenceLevel"] !== "port-conformance-only" ||
    record["atomicConstructionProven"] !== false ||
    record["eligibleForPublicRepairRate"] !== false ||
    typeof record["executionFingerprint"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(record["executionFingerprint"])
  ) {
    throw new Error("Sandbox evidence assessment has an invalid claim boundary.");
  }
  if (
    JSON.stringify(record["blockers"]) !==
    JSON.stringify(sandboxPublicRepairRateBlockers)
  ) {
    throw new Error("Sandbox evidence assessment must contain every canonical blocker.");
  }
  return {
    schemaVersion: 2,
    executionFingerprint: record["executionFingerprint"],
    claimLevel: "sandbox-artifact-integrity-only",
    evidenceLevel: "port-conformance-only",
    atomicConstructionProven: false,
    eligibleForPublicRepairRate: false,
    blockers: sandboxPublicRepairRateBlockers,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
