import { createHash } from "node:crypto";

import {
  dockerSandboxRuntimeAttestationDigest,
  validateDockerSandboxRuntimeAttestation,
  validateDockerSandboxRuntimeAttestationBindings,
  type DockerSandboxCollectorRef,
  type DockerSandboxRuntimeAttestation,
} from "./docker-sandbox-attestation.js";
import {
  dockerSandboxConformanceReportDigest,
  validateDockerSandboxConformanceReport,
  validateDockerSandboxConformanceReportBindings,
  type DockerSandboxConformanceReport,
} from "./docker-sandbox-conformance.js";
import {
  createDockerSandboxPlanCommitment,
  dockerSandboxPlanCommitmentDigest,
  dockerSandboxPlanDigest,
  validateDockerSandboxPlanCommitment,
  type DockerSandboxPlan,
  type DockerSandboxPlanCommitment,
} from "./docker-sandbox-plan.js";
import type { AgentExecutionArtifactRef } from "./execution-descriptor.js";

export interface SandboxExecutionMetadata {
  readonly descriptorId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelRevision: string | null;
  readonly adapter: AgentExecutionArtifactRef;
  readonly prompt: AgentExecutionArtifactRef;
  readonly toolset: AgentExecutionArtifactRef;
  readonly dataset: AgentExecutionArtifactRef;
  readonly sandboxAdapter: AgentExecutionArtifactRef;
  readonly collector: DockerSandboxCollectorRef;
}

export interface SandboxExecutionDescriptor {
  readonly schemaVersion: 2;
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
    readonly sandboxAdapter: AgentExecutionArtifactRef;
    readonly collector: DockerSandboxCollectorRef;
  };
  readonly environment: {
    readonly runner: "docker-sandbox";
    readonly planSha256: string;
    readonly runtimeAttestationSha256: string;
    readonly portConformanceSha256: string;
    readonly engine: {
      readonly name: "docker";
      readonly version: string;
      readonly operatingSystem: "linux";
      readonly architecture: string;
    };
    readonly image: {
      readonly reference: string;
      readonly id: string;
    };
    readonly isolation: "container-observed";
    readonly networkControl: "observed-none";
    readonly evidenceLevel: "port-conformance-only";
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

export function createSandboxExecutionDescriptor(
  metadata: SandboxExecutionMetadata,
  plan: DockerSandboxPlan,
  attestation: DockerSandboxRuntimeAttestation,
  conformance: DockerSandboxConformanceReport,
): SandboxExecutionDescriptor {
  const validatedAttestation = validateDockerSandboxRuntimeAttestation(attestation);
  const validatedConformance = validateDockerSandboxConformanceReport(conformance);
  const descriptor: SandboxExecutionDescriptor = {
    schemaVersion: 2,
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
      sandboxAdapter: validateArtifactRef(metadata.sandboxAdapter, "sandboxAdapter"),
      collector: validateArtifactRef(metadata.collector, "collector"),
    },
    environment: {
      runner: "docker-sandbox",
      planSha256: dockerSandboxPlanDigest(plan),
      runtimeAttestationSha256: dockerSandboxRuntimeAttestationDigest(validatedAttestation),
      portConformanceSha256: dockerSandboxConformanceReportDigest(validatedConformance),
      engine: validatedAttestation.engine,
      image: validatedAttestation.image,
      isolation: "container-observed",
      networkControl: "observed-none",
      evidenceLevel: "port-conformance-only",
    },
    limits: { ...plan.limits },
  };
  return validateSandboxExecutionDescriptorBindings(
    descriptor,
    plan,
    validatedAttestation,
    validatedConformance,
  );
}

export function validateSandboxExecutionDescriptorBindings(
  descriptor: SandboxExecutionDescriptor,
  plan: DockerSandboxPlan,
  attestation: DockerSandboxRuntimeAttestation,
  conformance: DockerSandboxConformanceReport,
): SandboxExecutionDescriptor {
  const planSha256 = dockerSandboxPlanDigest(plan);
  const commitment = createDockerSandboxPlanCommitment(plan);
  const validated = validateSandboxExecutionDescriptorEvidenceBindings(
    descriptor,
    commitment,
    attestation,
    conformance,
  );
  if (validated.environment.planSha256 !== planSha256) {
    throw new Error("Sandbox runtime attestation does not bind the execution plan.");
  }
  return validated;
}

export function validateSandboxExecutionDescriptorEvidenceBindings(
  descriptor: SandboxExecutionDescriptor,
  commitment: DockerSandboxPlanCommitment,
  attestation: DockerSandboxRuntimeAttestation,
  conformance: DockerSandboxConformanceReport,
): SandboxExecutionDescriptor {
  const validated = validateSandboxExecutionDescriptor(descriptor);
  const validatedCommitment = validateDockerSandboxPlanCommitment(commitment);
  const planSha256 = dockerSandboxPlanCommitmentDigest(validatedCommitment);
  const validatedAttestation = validateDockerSandboxRuntimeAttestationBindings(
    attestation,
    validatedCommitment,
  );
  const validatedConformance = validateDockerSandboxConformanceReportBindings(
    conformance,
    validatedCommitment,
  );
  if (!validatedConformance.summary.conformant) {
    throw new Error("Sandbox execution descriptor requires a conformant port report.");
  }
  if (!sameArtifact(validated.artifacts.sandboxAdapter, validatedConformance.adapter)) {
    throw new Error("Sandbox adapter identity does not match the conformance report.");
  }
  if (!sameArtifact(validated.artifacts.collector, validatedAttestation.collector)) {
    throw new Error("Sandbox collector identity does not match the runtime attestation.");
  }
  if (
    validated.environment.planSha256 !== planSha256 ||
    validated.environment.runtimeAttestationSha256 !==
      dockerSandboxRuntimeAttestationDigest(validatedAttestation) ||
    validated.environment.portConformanceSha256 !==
      dockerSandboxConformanceReportDigest(validatedConformance) ||
    JSON.stringify(validated.environment.engine) !== JSON.stringify(validatedAttestation.engine) ||
    JSON.stringify(validated.environment.image) !== JSON.stringify(validatedAttestation.image) ||
    JSON.stringify(validated.limits) !== JSON.stringify(validatedCommitment.limits)
  ) {
    throw new Error("Sandbox execution descriptor does not match its bound evidence.");
  }
  return validated;
}

export function sandboxExecutionFingerprint(
  descriptor: SandboxExecutionDescriptor,
): string {
  return createHash("sha256")
    .update(serializeSandboxExecutionDescriptor(descriptor), "utf8")
    .digest("hex");
}

export function parseSandboxExecutionDescriptor(text: string): SandboxExecutionDescriptor {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Sandbox execution descriptor must contain valid JSON.");
  }
  return validateSandboxExecutionDescriptor(value);
}

export function serializeSandboxExecutionDescriptor(
  descriptor: SandboxExecutionDescriptor,
): string {
  return `${JSON.stringify(validateSandboxExecutionDescriptor(descriptor), null, 2)}\n`;
}

export function validateSandboxExecutionDescriptor(value: unknown): SandboxExecutionDescriptor {
  const descriptor = requireRecord(value, "sandbox execution descriptor");
  requireKeys(descriptor, [
    "schemaVersion", "descriptorId", "agent", "artifacts", "environment", "limits",
  ], "sandbox execution descriptor");
  requireConstant(descriptor["schemaVersion"], 2, "schemaVersion");
  const agent = requireRecord(descriptor["agent"], "agent");
  requireKeys(agent, ["providerId", "modelId", "modelRevision"], "agent");
  const artifacts = requireRecord(descriptor["artifacts"], "artifacts");
  requireKeys(artifacts, [
    "adapter", "prompt", "toolset", "dataset", "sandboxAdapter", "collector",
  ], "artifacts");
  const environment = requireRecord(descriptor["environment"], "environment");
  requireKeys(environment, [
    "runner", "planSha256", "runtimeAttestationSha256", "portConformanceSha256",
    "engine", "image", "isolation", "networkControl", "evidenceLevel",
  ], "environment");
  const engine = requireRecord(environment["engine"], "environment.engine");
  requireKeys(engine, ["name", "version", "operatingSystem", "architecture"], "environment.engine");
  const image = requireRecord(environment["image"], "environment.image");
  requireKeys(image, ["reference", "id"], "environment.image");
  const limits = requireRecord(descriptor["limits"], "limits");
  requireKeys(limits, [
    "timeoutMs", "maxInputBytes", "maxOutputBytes", "memoryMiB", "cpuCount", "pidsLimit",
  ], "limits");

  const canonical: SandboxExecutionDescriptor = {
    schemaVersion: 2,
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
      sandboxAdapter: validateArtifactRef(artifacts["sandboxAdapter"], "sandboxAdapter"),
      collector: validateArtifactRef(artifacts["collector"], "collector"),
    },
    environment: {
      runner: requireConstant(environment["runner"], "docker-sandbox", "environment.runner"),
      planSha256: requireDigest(environment["planSha256"], "environment.planSha256"),
      runtimeAttestationSha256: requireDigest(
        environment["runtimeAttestationSha256"],
        "environment.runtimeAttestationSha256",
      ),
      portConformanceSha256: requireDigest(
        environment["portConformanceSha256"],
        "environment.portConformanceSha256",
      ),
      engine: {
        name: requireConstant(engine["name"], "docker", "environment.engine.name"),
        version: requireName(engine["version"], "environment.engine.version"),
        operatingSystem: requireConstant(
          engine["operatingSystem"],
          "linux",
          "environment.engine.operatingSystem",
        ),
        architecture: requireName(engine["architecture"], "environment.engine.architecture"),
      },
      image: {
        reference: requireImageReference(image["reference"]),
        id: requireImageId(image["id"]),
      },
      isolation: requireConstant(
        environment["isolation"],
        "container-observed",
        "environment.isolation",
      ),
      networkControl: requireConstant(
        environment["networkControl"],
        "observed-none",
        "environment.networkControl",
      ),
      evidenceLevel: requireConstant(
        environment["evidenceLevel"],
        "port-conformance-only",
        "environment.evidenceLevel",
      ),
    },
    limits: {
      timeoutMs: requireInteger(limits["timeoutMs"], 1, 300_000, "limits.timeoutMs"),
      maxInputBytes: requireInteger(limits["maxInputBytes"], 1, 65_536, "limits.maxInputBytes"),
      maxOutputBytes: requireInteger(limits["maxOutputBytes"], 1, 1_048_576, "limits.maxOutputBytes"),
      memoryMiB: requireInteger(limits["memoryMiB"], 64, 16_384, "limits.memoryMiB"),
      cpuCount: requireInteger(limits["cpuCount"], 1, 16, "limits.cpuCount"),
      pidsLimit: requireInteger(limits["pidsLimit"], 16, 4_096, "limits.pidsLimit"),
    },
  };
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Sandbox execution descriptor must use canonical field ordering.");
  }
  return canonical;
}

function validateArtifactRef(value: unknown, label: string): AgentExecutionArtifactRef {
  const artifact = requireRecord(value, label);
  requireKeys(artifact, ["id", "revision", "sha256"], label);
  return {
    id: requireIdentifier(artifact["id"], `${label}.id`),
    revision: requireName(artifact["revision"], `${label}.revision`),
    sha256: requireDigest(artifact["sha256"], `${label}.sha256`),
  };
}

function sameArtifact(left: AgentExecutionArtifactRef, right: AgentExecutionArtifactRef): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort(compareText)) !== JSON.stringify([...expected].sort(compareText))) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded identifier.`);
  }
  return value;
}

function requireName(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded name.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireImageReference(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("environment.image.reference must be immutable.");
  }
  return value;
}

function requireImageId(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("environment.image.id must be a Docker SHA-256 image ID.");
  }
  return value;
}

function requireInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function requireConstant<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} has an unsupported value.`);
  }
  return expected;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
