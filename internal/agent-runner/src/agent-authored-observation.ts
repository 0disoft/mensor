import type {
  AgentAuthoredBuildAdapterIdentity,
  AgentAuthoredMensorCheckResult,
} from "./agent-authored-build.js";

export interface AgentAuthoredBuildExploratoryObservationInput {
  readonly observationId: string;
  readonly producerVersion: string;
  readonly baselineCommit: string;
  readonly identity: AgentAuthoredBuildAdapterIdentity;
  readonly brief: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly semanticOracle: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly outputTransport: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly artifact: {
    readonly completed: boolean;
    readonly accepted: boolean;
  };
  readonly semanticTest: {
    readonly completed: boolean;
    readonly passed: boolean;
  };
  readonly mensorCheck: AgentAuthoredMensorCheckResult;
  readonly generatedFiles: readonly string[];
}

export interface AgentAuthoredBuildExploratoryObservation {
  readonly schemaVersion: 3;
  readonly kind: "agent-authored-build-exploratory-observation";
  readonly observationId: string;
  readonly producerVersion: string;
  readonly baselineCommit: string;
  readonly identity: AgentAuthoredBuildAdapterIdentity;
  readonly brief: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly semanticOracle: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly outputTransport: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly environment: {
    readonly workspaceIsolation: "prompt-restricted-not-enforced";
    readonly repositoryVisibility: "not-enforced";
    readonly networkControl: "not-enforced";
    readonly toolControl: "not-enforced";
    readonly conversationInheritance: "none-declared";
  };
  readonly finalState: {
    readonly artifactCompleted: boolean;
    readonly artifactAccepted: boolean;
    readonly semanticTestCompleted: boolean;
    readonly semanticTestsPassed: boolean;
    readonly mensorCheckCompleted: boolean;
    readonly mensorCheckPassed: boolean;
    readonly diagnosticCodes: readonly string[];
    readonly generatedFiles: readonly string[];
  };
  readonly success: boolean;
  readonly claimLevel: "exploratory-only";
}

export function createAgentAuthoredBuildExploratoryObservation(
  input: AgentAuthoredBuildExploratoryObservationInput,
): AgentAuthoredBuildExploratoryObservation {
  const artifactCompleted = requireBoolean(
    input.artifact.completed,
    "artifact.completed",
  );
  const artifactAccepted = requireBoolean(
    input.artifact.accepted,
    "artifact.accepted",
  );
  if (!artifactCompleted && artifactAccepted) {
    throw new Error("An incomplete response artifact cannot be accepted.");
  }
  const semanticTestCompleted = requireBoolean(
    input.semanticTest.completed,
    "semanticTest.completed",
  );
  const semanticTestsPassed = requireBoolean(
    input.semanticTest.passed,
    "semanticTest.passed",
  );
  if (!semanticTestCompleted && semanticTestsPassed) {
    throw new Error("An incomplete semantic test cannot pass.");
  }
  const mensorCheckCompleted = requireBoolean(
    input.mensorCheck.completed,
    "mensorCheck.completed",
  );
  const mensorCheckPassed = requireBoolean(
    input.mensorCheck.passed,
    "mensorCheck.passed",
  );
  const diagnosticCodes = canonicalDiagnosticCodes(
    input.mensorCheck.diagnosticCodes,
  );
  if (!mensorCheckCompleted && (mensorCheckPassed || diagnosticCodes.length > 0)) {
    throw new Error("An incomplete Mensor check cannot pass or report diagnostics.");
  }
  if (mensorCheckCompleted && mensorCheckPassed !== (diagnosticCodes.length === 0)) {
    throw new Error("Mensor check pass state must match diagnostic codes.");
  }
  const generatedFiles = canonicalGeneratedFiles(input.generatedFiles);
  if (
    !artifactAccepted
    && (
      semanticTestCompleted
      || mensorCheckCompleted
      || generatedFiles.length > 0
    )
  ) {
    throw new Error(
      "A rejected response artifact cannot produce evaluated project state.",
    );
  }
  const identity = validateIdentity(input.identity);
  return {
    schemaVersion: 3,
    kind: "agent-authored-build-exploratory-observation",
    observationId: requireIdentifier(input.observationId, "observationId"),
    producerVersion: requireIdentifier(input.producerVersion, "producerVersion"),
    baselineCommit: requireCommit(input.baselineCommit),
    identity,
    brief: {
      id: requireIdentifier(input.brief.id, "brief.id"),
      revision: requireIdentifier(input.brief.revision, "brief.revision"),
      sha256: requireDigest(input.brief.sha256, "brief.sha256"),
    },
    semanticOracle: {
      id: requireIdentifier(input.semanticOracle.id, "semanticOracle.id"),
      revision: requireIdentifier(
        input.semanticOracle.revision,
        "semanticOracle.revision",
      ),
      sha256: requireDigest(
        input.semanticOracle.sha256,
        "semanticOracle.sha256",
      ),
    },
    outputTransport: {
      id: requireIdentifier(input.outputTransport.id, "outputTransport.id"),
      revision: requireIdentifier(
        input.outputTransport.revision,
        "outputTransport.revision",
      ),
      sha256: requireDigest(
        input.outputTransport.sha256,
        "outputTransport.sha256",
      ),
    },
    environment: {
      workspaceIsolation: "prompt-restricted-not-enforced",
      repositoryVisibility: "not-enforced",
      networkControl: "not-enforced",
      toolControl: "not-enforced",
      conversationInheritance: "none-declared",
    },
    finalState: {
      artifactCompleted,
      artifactAccepted,
      semanticTestCompleted,
      semanticTestsPassed,
      mensorCheckCompleted,
      mensorCheckPassed,
      diagnosticCodes,
      generatedFiles,
    },
    success: artifactCompleted
      && artifactAccepted
      && semanticTestCompleted
      && semanticTestsPassed
      && mensorCheckCompleted
      && mensorCheckPassed,
    claimLevel: "exploratory-only",
  };
}

export function validateAgentAuthoredBuildExploratoryObservation(
  value: unknown,
): AgentAuthoredBuildExploratoryObservation {
  const observation = requireRecord(value, "observation");
  requireExactKeys(
    observation,
    [
      "schemaVersion",
      "kind",
      "observationId",
      "producerVersion",
      "baselineCommit",
      "identity",
      "brief",
      "semanticOracle",
      "outputTransport",
      "environment",
      "finalState",
      "success",
      "claimLevel",
    ],
    "observation",
  );
  if (
    observation["schemaVersion"] !== 3
    || observation["kind"] !== "agent-authored-build-exploratory-observation"
    || observation["claimLevel"] !== "exploratory-only"
  ) {
    throw new Error("Unsupported exploratory observation contract.");
  }
  const brief = requireRecord(observation["brief"], "brief");
  requireExactKeys(brief, ["id", "revision", "sha256"], "brief");
  const semanticOracle = requireRecord(
    observation["semanticOracle"],
    "semanticOracle",
  );
  requireExactKeys(
    semanticOracle,
    ["id", "revision", "sha256"],
    "semanticOracle",
  );
  const outputTransport = requireRecord(
    observation["outputTransport"],
    "outputTransport",
  );
  requireExactKeys(
    outputTransport,
    ["id", "revision", "sha256"],
    "outputTransport",
  );
  const environment = requireRecord(observation["environment"], "environment");
  requireExactKeys(
    environment,
    [
      "workspaceIsolation",
      "repositoryVisibility",
      "networkControl",
      "toolControl",
      "conversationInheritance",
    ],
    "environment",
  );
  if (
    environment["workspaceIsolation"] !== "prompt-restricted-not-enforced"
    || environment["repositoryVisibility"] !== "not-enforced"
    || environment["networkControl"] !== "not-enforced"
    || environment["toolControl"] !== "not-enforced"
    || environment["conversationInheritance"] !== "none-declared"
  ) {
    throw new Error("Exploratory observation environment claims are fixed.");
  }
  const finalState = requireRecord(observation["finalState"], "finalState");
  requireExactKeys(
    finalState,
    [
      "artifactCompleted",
      "artifactAccepted",
      "semanticTestCompleted",
      "semanticTestsPassed",
      "mensorCheckCompleted",
      "mensorCheckPassed",
      "diagnosticCodes",
      "generatedFiles",
    ],
    "finalState",
  );
  const canonical = createAgentAuthoredBuildExploratoryObservation({
    observationId: requireString(observation["observationId"], "observationId"),
    producerVersion: requireString(observation["producerVersion"], "producerVersion"),
    baselineCommit: requireString(observation["baselineCommit"], "baselineCommit"),
    identity: parseIdentity(observation["identity"]),
    brief: {
      id: requireString(brief["id"], "brief.id"),
      revision: requireString(brief["revision"], "brief.revision"),
      sha256: requireString(brief["sha256"], "brief.sha256"),
    },
    semanticOracle: {
      id: requireString(semanticOracle["id"], "semanticOracle.id"),
      revision: requireString(
        semanticOracle["revision"],
        "semanticOracle.revision",
      ),
      sha256: requireString(
        semanticOracle["sha256"],
        "semanticOracle.sha256",
      ),
    },
    outputTransport: {
      id: requireString(outputTransport["id"], "outputTransport.id"),
      revision: requireString(
        outputTransport["revision"],
        "outputTransport.revision",
      ),
      sha256: requireString(
        outputTransport["sha256"],
        "outputTransport.sha256",
      ),
    },
    artifact: {
      completed: requireBoolean(
        finalState["artifactCompleted"],
        "artifactCompleted",
      ),
      accepted: requireBoolean(
        finalState["artifactAccepted"],
        "artifactAccepted",
      ),
    },
    semanticTest: {
      completed: requireBoolean(
        finalState["semanticTestCompleted"],
        "semanticTestCompleted",
      ),
      passed: requireBoolean(
        finalState["semanticTestsPassed"],
        "semanticTestsPassed",
      ),
    },
    mensorCheck: {
      completed: requireBoolean(
        finalState["mensorCheckCompleted"],
        "mensorCheckCompleted",
      ),
      passed: requireBoolean(
        finalState["mensorCheckPassed"],
        "mensorCheckPassed",
      ),
      diagnosticCodes: requireStringArray(
        finalState["diagnosticCodes"],
        "diagnosticCodes",
      ),
    },
    generatedFiles: requireStringArray(
      finalState["generatedFiles"],
      "generatedFiles",
    ),
  });
  if (observation["success"] !== canonical.success) {
    throw new Error("Exploratory observation success must be derived.");
  }
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Exploratory observation must use canonical field ordering.");
  }
  return canonical;
}

export function parseAgentAuthoredBuildExploratoryObservation(
  text: string,
): AgentAuthoredBuildExploratoryObservation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Exploratory observation must contain valid JSON.");
  }
  return validateAgentAuthoredBuildExploratoryObservation(value);
}

export function serializeAgentAuthoredBuildExploratoryObservation(
  observation: AgentAuthoredBuildExploratoryObservation,
): string {
  return `${JSON.stringify(
    validateAgentAuthoredBuildExploratoryObservation(observation),
    null,
    2,
  )}\n`;
}

function validateIdentity(
  identity: AgentAuthoredBuildAdapterIdentity,
): AgentAuthoredBuildAdapterIdentity {
  return {
    runnerId: requireIdentifier(identity.runnerId, "identity.runnerId"),
    providerId: requireIdentifier(identity.providerId, "identity.providerId"),
    modelId: requireModelId(identity.modelId),
    reasoningEffort: requireReasoningEffort(identity.reasoningEffort),
    cohortId: requireIdentifier(identity.cohortId, "identity.cohortId"),
  };
}

function parseIdentity(value: unknown): AgentAuthoredBuildAdapterIdentity {
  const identity = requireRecord(value, "identity");
  requireExactKeys(
    identity,
    ["runnerId", "providerId", "modelId", "reasoningEffort", "cohortId"],
    "identity",
  );
  return validateIdentity({
    runnerId: requireString(identity["runnerId"], "identity.runnerId"),
    providerId: requireString(identity["providerId"], "identity.providerId"),
    modelId: requireString(identity["modelId"], "identity.modelId"),
    reasoningEffort: requireReasoningEffort(identity["reasoningEffort"]),
    cohortId: requireString(identity["cohortId"], "identity.cohortId"),
  });
}

function canonicalDiagnosticCodes(value: readonly string[]): readonly string[] {
  return [...new Set(value.map((item) => {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(item)) {
      throw new Error("diagnosticCodes contains an invalid code.");
    }
    return item;
  }))].sort(compareText);
}

function canonicalGeneratedFiles(value: readonly string[]): readonly string[] {
  return [...new Set(value.map((item) => requireProjectPath(item)))].sort(compareText);
}

function requireProjectPath(value: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || value.includes("\\")
    || value.includes(":")
    || /[\u0000-\u001f\u007f]/u.test(value)
    || value.startsWith("/")
    || value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error("generatedFiles must contain root-relative POSIX paths.");
  }
  return value;
}

function requireCommit(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error("baselineCommit must be a full lowercase Git SHA-1.");
  }
  return value;
}

function requireModelId(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length > 255
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/u.test(value)
  ) {
    throw new Error("identity.modelId must be a namespaced model identifier.");
  }
  return value;
}

function requireReasoningEffort(
  value: unknown,
): AgentAuthoredBuildAdapterIdentity["reasoningEffort"] {
  const efforts = ["none", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
  if (typeof value !== "string" || !efforts.includes(
    value as AgentAuthoredBuildAdapterIdentity["reasoningEffort"],
  )) {
    throw new Error("identity.reasoningEffort is invalid.");
  }
  return value as AgentAuthoredBuildAdapterIdentity["reasoningEffort"];
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must be a bounded identifier.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value as string[];
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
