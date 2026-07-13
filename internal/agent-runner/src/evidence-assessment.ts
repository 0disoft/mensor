import {
  validateAgentTrialEvidence,
  type AgentTrialEvidence,
} from "./execution-descriptor.js";

export const publicRepairRateBlockers = [
  "credential-scope-not-attested",
  "filesystem-isolation-not-attested",
  "network-control-not-enforced",
  "process-containment-not-enforced",
] as const;

export type PublicRepairRateBlocker = (typeof publicRepairRateBlockers)[number];

export interface AgentEvidenceAssessment {
  readonly schemaVersion: 1;
  readonly executionFingerprint: string;
  readonly claimLevel: "protocol-integrity-only";
  readonly eligibleForPublicRepairRate: false;
  readonly blockers: readonly PublicRepairRateBlocker[];
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
