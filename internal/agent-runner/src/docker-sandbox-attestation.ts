import { createHash } from "node:crypto";

import {
  dockerSandboxPlanDigest,
  type DockerSandboxPlan,
} from "./docker-sandbox-plan.js";

export interface DockerSandboxRuntimeObservation {
  readonly collector: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly engineVersion: string;
  readonly architecture: string;
  readonly imageId: string;
  readonly networkMode: "none";
  readonly readOnlyRootFilesystem: true;
  readonly user: "65532:65532";
  readonly capabilities: readonly [];
  readonly noNewPrivileges: true;
  readonly workspaceMount: {
    readonly destination: "/workspace";
    readonly mode: "read-write";
    readonly propagation: "rprivate";
  };
  readonly temporaryFilesystem: {
    readonly destination: "/tmp";
    readonly inMemory: true;
    readonly executable: false;
    readonly setuid: false;
    readonly sizeMiB: 64;
  };
  readonly credentialInjection: "none";
  readonly memoryMiB: number;
  readonly cpuCount: number;
  readonly pidsLimit: number;
}

export interface DockerSandboxRuntimeAttestation {
  readonly schemaVersion: 1;
  readonly kind: "docker-networkless-runtime";
  readonly planSha256: string;
  readonly collector: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
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
  readonly security: {
    readonly network: "none";
    readonly rootFilesystem: "read-only";
    readonly workspaceMount: "read-write-only";
    readonly capabilities: "none";
    readonly privilegeEscalation: "disabled";
    readonly credentials: "none";
    readonly user: "65532:65532";
    readonly temporaryFilesystem: "memory-only-noexec-nosuid";
  };
  readonly limits: {
    readonly memoryMiB: number;
    readonly cpuCount: number;
    readonly pidsLimit: number;
  };
}

export function createDockerSandboxRuntimeAttestation(
  plan: DockerSandboxPlan,
  observation: DockerSandboxRuntimeObservation,
): DockerSandboxRuntimeAttestation {
  const planSha256 = dockerSandboxPlanDigest(plan);
  const collector = validateCollector(observation.collector);
  requireName(observation.engineVersion, "engineVersion");
  requireName(observation.architecture, "architecture");
  requireImageId(observation.imageId);
  requireConstant(observation.networkMode, "none", "networkMode");
  requireConstant(observation.readOnlyRootFilesystem, true, "readOnlyRootFilesystem");
  requireConstant(observation.user, plan.security.user, "user");
  if (!Array.isArray(observation.capabilities) || observation.capabilities.length !== 0) {
    throw new Error("capabilities must be an empty array.");
  }
  requireConstant(observation.noNewPrivileges, true, "noNewPrivileges");
  requireExactRecord(observation.workspaceMount, {
    destination: "/workspace",
    mode: "read-write",
    propagation: "rprivate",
  }, "workspaceMount");
  requireExactRecord(observation.temporaryFilesystem, {
    destination: "/tmp",
    inMemory: true,
    executable: false,
    setuid: false,
    sizeMiB: 64,
  }, "temporaryFilesystem");
  requireConstant(observation.credentialInjection, "none", "credentialInjection");
  requireConstant(observation.memoryMiB, plan.limits.memoryMiB, "memoryMiB");
  requireConstant(observation.cpuCount, plan.limits.cpuCount, "cpuCount");
  requireConstant(observation.pidsLimit, plan.limits.pidsLimit, "pidsLimit");

  return {
    schemaVersion: 1,
    kind: "docker-networkless-runtime",
    planSha256,
    collector,
    engine: {
      name: "docker",
      version: observation.engineVersion,
      operatingSystem: "linux",
      architecture: observation.architecture,
    },
    image: { reference: plan.image, id: observation.imageId },
    security: {
      network: "none",
      rootFilesystem: "read-only",
      workspaceMount: "read-write-only",
      capabilities: "none",
      privilegeEscalation: "disabled",
      credentials: "none",
      user: "65532:65532",
      temporaryFilesystem: "memory-only-noexec-nosuid",
    },
    limits: {
      memoryMiB: plan.limits.memoryMiB,
      cpuCount: plan.limits.cpuCount,
      pidsLimit: plan.limits.pidsLimit,
    },
  };
}

export function validateDockerSandboxRuntimeAttestation(
  value: unknown,
): DockerSandboxRuntimeAttestation {
  const record = requireRecord(value, "Docker sandbox runtime attestation");
  requireKeys(record, [
    "schemaVersion", "kind", "planSha256", "collector", "engine", "image", "security", "limits",
  ], "Docker sandbox runtime attestation");
  requireConstant(record["schemaVersion"], 1, "schemaVersion");
  requireConstant(record["kind"], "docker-networkless-runtime", "kind");
  const planSha256 = requireDigest(record["planSha256"], "planSha256");
  const collector = validateCollector(record["collector"]);
  const engine = requireRecord(record["engine"], "engine");
  requireKeys(engine, ["name", "version", "operatingSystem", "architecture"], "engine");
  const image = requireRecord(record["image"], "image");
  requireKeys(image, ["reference", "id"], "image");
  const security = requireRecord(record["security"], "security");
  requireKeys(security, [
    "network", "rootFilesystem", "workspaceMount", "capabilities", "privilegeEscalation",
    "credentials", "user", "temporaryFilesystem",
  ], "security");
  const limits = requireRecord(record["limits"], "limits");
  requireKeys(limits, ["memoryMiB", "cpuCount", "pidsLimit"], "limits");

  const canonical: DockerSandboxRuntimeAttestation = {
    schemaVersion: 1,
    kind: "docker-networkless-runtime",
    planSha256,
    collector,
    engine: {
      name: requireConstant(engine["name"], "docker", "engine.name"),
      version: requireName(engine["version"], "engine.version"),
      operatingSystem: requireConstant(engine["operatingSystem"], "linux", "engine.operatingSystem"),
      architecture: requireName(engine["architecture"], "engine.architecture"),
    },
    image: {
      reference: requireImageReference(image["reference"]),
      id: requireImageId(image["id"]),
    },
    security: {
      network: requireConstant(security["network"], "none", "security.network"),
      rootFilesystem: requireConstant(security["rootFilesystem"], "read-only", "security.rootFilesystem"),
      workspaceMount: requireConstant(security["workspaceMount"], "read-write-only", "security.workspaceMount"),
      capabilities: requireConstant(security["capabilities"], "none", "security.capabilities"),
      privilegeEscalation: requireConstant(security["privilegeEscalation"], "disabled", "security.privilegeEscalation"),
      credentials: requireConstant(security["credentials"], "none", "security.credentials"),
      user: requireConstant(security["user"], "65532:65532", "security.user"),
      temporaryFilesystem: requireConstant(
        security["temporaryFilesystem"],
        "memory-only-noexec-nosuid",
        "security.temporaryFilesystem",
      ),
    },
    limits: {
      memoryMiB: requireInteger(limits["memoryMiB"], 64, 16_384, "limits.memoryMiB"),
      cpuCount: requireInteger(limits["cpuCount"], 1, 16, "limits.cpuCount"),
      pidsLimit: requireInteger(limits["pidsLimit"], 16, 4_096, "limits.pidsLimit"),
    },
  };
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Docker sandbox runtime attestation must use canonical field ordering.");
  }
  return canonical;
}

export function parseDockerSandboxRuntimeAttestation(text: string): DockerSandboxRuntimeAttestation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Docker sandbox runtime attestation must contain valid JSON.");
  }
  return validateDockerSandboxRuntimeAttestation(value);
}

export function serializeDockerSandboxRuntimeAttestation(
  attestation: DockerSandboxRuntimeAttestation,
): string {
  return `${JSON.stringify(validateDockerSandboxRuntimeAttestation(attestation), null, 2)}\n`;
}

export function dockerSandboxRuntimeAttestationDigest(
  attestation: DockerSandboxRuntimeAttestation,
): string {
  return createHash("sha256")
    .update(serializeDockerSandboxRuntimeAttestation(attestation), "utf8")
    .digest("hex");
}

function validateCollector(value: unknown): DockerSandboxRuntimeAttestation["collector"] {
  const collector = requireRecord(value, "collector");
  requireKeys(collector, ["id", "revision", "sha256"], "collector");
  return {
    id: requireIdentifier(collector["id"], "collector.id"),
    revision: requireName(collector["revision"], "collector.revision"),
    sha256: requireDigest(collector["sha256"], "collector.sha256"),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort(compareText)) !== JSON.stringify([...keys].sort(compareText))) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
}

function requireExactRecord(value: object, expected: object, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match the enforced Docker sandbox plan.`);
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
    throw new Error("image.reference must use an immutable lowercase SHA-256 digest.");
  }
  return value;
}

function requireImageId(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("image.id must be a lowercase Docker SHA-256 image ID.");
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
    throw new Error(`${label} must be ${String(expected)}.`);
  }
  return expected;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
