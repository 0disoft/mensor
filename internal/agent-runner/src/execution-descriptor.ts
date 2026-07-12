import { createHash } from "node:crypto";

import {
  createAgentTrialReport,
  validateAgentTrialReport,
  type AgentTrialReport,
} from "@mensor/fixture-kit";

import {
  commandSpecificationDigest,
  type CommandAgentAdapterOptions,
} from "./command-adapter.js";

export interface AgentExecutionArtifactRef {
  readonly id: string;
  readonly revision: string;
  readonly sha256: string;
}

export interface CommandExecutionMetadata {
  readonly descriptorId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelRevision: string | null;
  readonly adapter: AgentExecutionArtifactRef;
  readonly prompt: AgentExecutionArtifactRef;
  readonly toolset: AgentExecutionArtifactRef;
  readonly dataset: AgentExecutionArtifactRef;
}

export interface AgentExecutionDescriptor {
  readonly schemaVersion: 1;
  readonly descriptorId: string;
  readonly agent: {
    readonly providerId: string;
    readonly modelId: string;
    readonly modelRevision: string | null;
  };
  readonly artifacts: {
    readonly adapter: AgentExecutionArtifactRef;
    readonly prompt: AgentExecutionArtifactRef;
    readonly toolset: AgentExecutionArtifactRef;
    readonly dataset: AgentExecutionArtifactRef;
  };
  readonly environment: {
    readonly runner: "local-command";
    readonly platform: NodeJS.Platform;
    readonly architecture: string;
    readonly nodeVersion: string;
    readonly commandSpecSha256: string;
    readonly isolation: "process-only";
    readonly networkControl: "not-enforced";
  };
  readonly limits: {
    readonly timeoutMs: number;
    readonly maxInputBytes: number;
    readonly maxOutputBytes: number;
  };
}

export interface AgentTrialEvidence {
  readonly schemaVersion: 1;
  readonly executionFingerprint: string;
  readonly execution: AgentExecutionDescriptor;
  readonly report: AgentTrialReport;
}

export function createCommandExecutionDescriptor(
  metadata: CommandExecutionMetadata,
  command: CommandAgentAdapterOptions,
): AgentExecutionDescriptor {
  const descriptor: AgentExecutionDescriptor = {
    schemaVersion: 1,
    descriptorId: requireIdentifier(metadata.descriptorId, "descriptorId"),
    agent: {
      providerId: requireName(metadata.providerId, "providerId"),
      modelId: requireName(metadata.modelId, "modelId"),
      modelRevision: metadata.modelRevision === null
        ? null
        : requireName(metadata.modelRevision, "modelRevision"),
    },
    artifacts: {
      adapter: validateArtifactRef(metadata.adapter, "adapter"),
      prompt: validateArtifactRef(metadata.prompt, "prompt"),
      toolset: validateArtifactRef(metadata.toolset, "toolset"),
      dataset: validateArtifactRef(metadata.dataset, "dataset"),
    },
    environment: {
      runner: "local-command",
      platform: process.platform,
      architecture: requireName(process.arch, "architecture"),
      nodeVersion: requireName(process.versions.node, "nodeVersion"),
      commandSpecSha256: commandSpecificationDigest(command),
      isolation: "process-only",
      networkControl: "not-enforced",
    },
    limits: {
      timeoutMs: requireLimit(command.timeoutMs, 1, 300_000, "timeoutMs"),
      maxInputBytes: requireLimit(command.maxInputBytes, 1, 65_536, "maxInputBytes"),
      maxOutputBytes: requireLimit(command.maxOutputBytes, 1, 1_048_576, "maxOutputBytes"),
    },
  };
  return validateAgentExecutionDescriptor(descriptor);
}

export function executionFingerprint(descriptor: AgentExecutionDescriptor): string {
  return createHash("sha256")
    .update(serializeAgentExecutionDescriptor(descriptor), "utf8")
    .digest("hex");
}

export function createAgentTrialEvidence(
  execution: AgentExecutionDescriptor,
  report: AgentTrialReport,
): AgentTrialEvidence {
  const validatedExecution = validateAgentExecutionDescriptor(execution);
  const validatedReport = validateAgentTrialReport(report);
  return {
    schemaVersion: 1,
    executionFingerprint: executionFingerprint(validatedExecution),
    execution: validatedExecution,
    report: validatedReport,
  };
}

export function parseAgentExecutionDescriptor(text: string): AgentExecutionDescriptor {
  return validateAgentExecutionDescriptor(parseJson(text, "execution descriptor"));
}

export function serializeAgentExecutionDescriptor(
  descriptor: AgentExecutionDescriptor,
): string {
  const validated = validateAgentExecutionDescriptor(descriptor);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function parseAgentTrialEvidence(text: string): AgentTrialEvidence {
  return validateAgentTrialEvidence(parseJson(text, "agent trial evidence"));
}

export function validateAgentTrialEvidence(value: unknown): AgentTrialEvidence {
  const record = requireRecord(value, "evidence");
  requireExactKeys(
    record,
    ["schemaVersion", "executionFingerprint", "execution", "report"],
    "evidence",
  );
  if (record["schemaVersion"] !== 1) {
    throw new Error("Agent trial evidence schemaVersion must be 1.");
  }
  const execution = validateAgentExecutionDescriptor(record["execution"]);
  const report = validateAgentTrialReport(record["report"]);
  const canonical = createAgentTrialEvidence(execution, report);
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Agent trial evidence must match its canonical execution fingerprint and ordering.");
  }
  return canonical;
}

export function mergeAgentTrialEvidence(
  evidenceItems: readonly AgentTrialEvidence[],
): AgentTrialEvidence {
  if (evidenceItems.length === 0) {
    throw new Error("Agent trial evidence cohort must contain at least one evidence item.");
  }
  const validated = evidenceItems.map((item) => validateAgentTrialEvidence(item));
  const first = validated[0];
  if (first === undefined) {
    throw new Error("Agent trial evidence cohort must contain a first item.");
  }
  const executionBytes = serializeAgentExecutionDescriptor(first.execution);
  const producerVersion = first.report.producerVersion;
  for (const item of validated.slice(1)) {
    if (
      item.executionFingerprint !== first.executionFingerprint ||
      serializeAgentExecutionDescriptor(item.execution) !== executionBytes
    ) {
      throw new Error("Agent trial evidence cohort cannot mix execution fingerprints.");
    }
    if (item.report.producerVersion !== producerVersion) {
      throw new Error("Agent trial evidence cohort cannot mix report producer versions.");
    }
  }
  const trials = validated.flatMap((item) => item.report.trials);
  if (trials.length === 0) {
    throw new Error("Agent trial evidence cohort must contain at least one trial.");
  }
  return createAgentTrialEvidence(
    first.execution,
    createAgentTrialReport(trials, producerVersion),
  );
}

export function serializeAgentTrialEvidence(evidence: AgentTrialEvidence): string {
  const canonical = validateAgentTrialEvidence(evidence);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function validateAgentExecutionDescriptor(value: unknown): AgentExecutionDescriptor {
  const descriptor = requireRecord(value, "execution descriptor");
  requireExactKeys(
    descriptor,
    ["schemaVersion", "descriptorId", "agent", "artifacts", "environment", "limits"],
    "execution descriptor",
  );
  if (descriptor["schemaVersion"] !== 1) {
    throw new Error("Agent execution descriptor schemaVersion must be 1.");
  }
  const agent = requireRecord(descriptor["agent"], "agent");
  requireExactKeys(agent, ["providerId", "modelId", "modelRevision"], "agent");
  const artifacts = requireRecord(descriptor["artifacts"], "artifacts");
  requireExactKeys(artifacts, ["adapter", "prompt", "toolset", "dataset"], "artifacts");
  const environment = requireRecord(descriptor["environment"], "environment");
  requireExactKeys(
    environment,
    ["runner", "platform", "architecture", "nodeVersion", "commandSpecSha256", "isolation", "networkControl"],
    "environment",
  );
  const limits = requireRecord(descriptor["limits"], "limits");
  requireExactKeys(limits, ["timeoutMs", "maxInputBytes", "maxOutputBytes"], "limits");

  const canonical: AgentExecutionDescriptor = {
    schemaVersion: 1,
    descriptorId: requireIdentifier(descriptor["descriptorId"], "descriptorId"),
    agent: {
      providerId: requireName(agent["providerId"], "providerId"),
      modelId: requireName(agent["modelId"], "modelId"),
      modelRevision: agent["modelRevision"] === null
        ? null
        : requireName(agent["modelRevision"], "modelRevision"),
    },
    artifacts: {
      adapter: validateArtifactRef(artifacts["adapter"], "adapter"),
      prompt: validateArtifactRef(artifacts["prompt"], "prompt"),
      toolset: validateArtifactRef(artifacts["toolset"], "toolset"),
      dataset: validateArtifactRef(artifacts["dataset"], "dataset"),
    },
    environment: {
      runner: requireConstant(environment["runner"], "local-command", "runner"),
      platform: requirePlatform(environment["platform"]),
      architecture: requireName(environment["architecture"], "architecture"),
      nodeVersion: requireName(environment["nodeVersion"], "nodeVersion"),
      commandSpecSha256: requireDigest(
        environment["commandSpecSha256"],
        "commandSpecSha256",
      ),
      isolation: requireConstant(environment["isolation"], "process-only", "isolation"),
      networkControl: requireConstant(
        environment["networkControl"],
        "not-enforced",
        "networkControl",
      ),
    },
    limits: {
      timeoutMs: requireLimit(limits["timeoutMs"], 1, 300_000, "timeoutMs"),
      maxInputBytes: requireLimit(limits["maxInputBytes"], 1, 65_536, "maxInputBytes"),
      maxOutputBytes: requireLimit(limits["maxOutputBytes"], 1, 1_048_576, "maxOutputBytes"),
    },
  };
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Agent execution descriptor must use canonical field ordering.");
  }
  return canonical;
}

function validateArtifactRef(value: unknown, label: string): AgentExecutionArtifactRef {
  const artifact = requireRecord(value, label);
  requireExactKeys(artifact, ["id", "revision", "sha256"], label);
  return {
    id: requireIdentifier(artifact["id"], `${label}.id`),
    revision: requireName(artifact["revision"], `${label}.revision`),
    sha256: requireDigest(artifact["sha256"], `${label}.sha256`),
  };
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} must contain exactly: ${sortedExpected.join(", ")}.`);
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded identifier.`);
  }
  return value;
}

function requireName(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded artifact name.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireLimit(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
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

function requirePlatform(value: unknown): NodeJS.Platform {
  const platforms: readonly NodeJS.Platform[] = [
    "aix",
    "android",
    "darwin",
    "freebsd",
    "haiku",
    "linux",
    "openbsd",
    "sunos",
    "win32",
    "cygwin",
    "netbsd",
  ];
  if (typeof value !== "string" || !platforms.includes(value as NodeJS.Platform)) {
    throw new Error("platform must be a supported Node.js platform identifier.");
  }
  return value as NodeJS.Platform;
}

function requireConstant<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return expected;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
