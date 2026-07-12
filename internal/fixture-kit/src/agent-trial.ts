import type { DiagnosticReport } from "@mensor/contract";

import {
  captureRepairBaseline,
  evaluateRepairInLeasedWorkspace,
} from "./repair-evaluation.js";
import {
  mutationCatalog,
  runMutationCheckInLeasedWorkspace,
  type MutationBaselineId,
  type MutationFileChange,
  type MutationId,
} from "./mutations.js";
import { withWorkspaceLease } from "./workspace-lease.js";
import {
  captureWorkspaceSnapshot,
  compareWorkspaceSnapshots,
  type WorkspaceSnapshotLimits,
} from "./workspace-snapshot.js";

export interface AgentTrialContext {
  readonly root: string;
  readonly mutationId: MutationId;
  readonly baselineId: MutationBaselineId;
  readonly diagnosticCodes: readonly string[];
  readonly diagnosticReport: DiagnosticReport;
}

export interface AgentTrialAdapterResult {
  readonly rounds: number;
}

export type AgentTrialAdapter = (
  context: AgentTrialContext,
) => AgentTrialAdapterResult | Promise<AgentTrialAdapterResult>;

export interface RunAgentTrialOptions {
  readonly trialId: string;
  readonly root: string;
  readonly mutationId: MutationId;
  readonly protectedFiles: readonly string[];
  readonly adapter: AgentTrialAdapter;
  readonly semanticCheck: () => boolean | Promise<boolean>;
  readonly snapshotLimits?: Partial<WorkspaceSnapshotLimits>;
}

export type AgentTrialFailureCategory =
  | "agent-error"
  | "check-failed"
  | "contract-weakened"
  | "diagnostic-not-produced"
  | "semantic-regression";

export const agentTrialFailureCategories = [
  "agent-error",
  "check-failed",
  "contract-weakened",
  "diagnostic-not-produced",
  "semantic-regression",
] as const satisfies readonly AgentTrialFailureCategory[];

export interface AgentTrialResult {
  readonly schemaVersion: 1;
  readonly trialId: string;
  readonly mutationId: MutationId;
  readonly baselineId: MutationBaselineId;
  readonly initialDiagnosticCodes: readonly string[];
  readonly detectionPassed: boolean;
  readonly adapterCompleted: boolean;
  readonly rounds: number;
  readonly repaired: boolean;
  readonly checkPassed: boolean;
  readonly protectedFilesChanged: readonly string[];
  readonly semanticCheckPassed: boolean;
  readonly repairChanges: readonly MutationFileChange[];
  readonly failureCategory: AgentTrialFailureCategory | null;
}

export interface AgentTrialMetricGroup {
  readonly mutationId: MutationId;
  readonly baselineId: MutationBaselineId;
  readonly trialCount: number;
  readonly repairedCount: number;
  readonly anyTrialRepaired: boolean;
  readonly allTrialsRepaired: boolean;
}

export interface AgentTrialReport {
  readonly schemaVersion: 1;
  readonly producerVersion: string;
  readonly trials: readonly AgentTrialResult[];
  readonly metrics: readonly AgentTrialMetricGroup[];
  readonly summary: {
    readonly trialCount: number;
    readonly repairedCount: number;
    readonly failedCount: number;
    readonly failureCounts: Readonly<Record<AgentTrialFailureCategory, number>>;
  };
}

export async function runAgentTrial(
  options: RunAgentTrialOptions,
): Promise<AgentTrialResult> {
  return withWorkspaceLease(options.root, () => runAgentTrialInLeasedWorkspace(options));
}

async function runAgentTrialInLeasedWorkspace(
  options: RunAgentTrialOptions,
): Promise<AgentTrialResult> {
  assertIdentifier("trialId", options.trialId);
  const baseline = await captureRepairBaseline({
    root: options.root,
    protectedFiles: options.protectedFiles,
  });
  const checkedMutation = await runMutationCheckInLeasedWorkspace(
    options.root,
    options.mutationId,
  );
  const mutation = checkedMutation.benchmarkCase;
  const mutatedSnapshot = await captureWorkspaceSnapshot(options.root, options.snapshotLimits);

  let adapterCompleted = false;
  let rounds = 0;
  if (mutation.detectionPassed) {
    if (checkedMutation.diagnosticReport === null) {
      throw new Error("A detected mutation must have a diagnostic report.");
    }
    try {
      const adapterResult = await options.adapter({
        root: options.root,
        mutationId: mutation.mutationId,
        baselineId: mutation.baselineId,
        diagnosticCodes: mutation.actualDiagnosticCodes,
        diagnosticReport: checkedMutation.diagnosticReport,
      });
      assertRounds(adapterResult.rounds);
      rounds = adapterResult.rounds;
      adapterCompleted = true;
    } catch {
      adapterCompleted = false;
    }
  }

  const agentSnapshot = await captureWorkspaceSnapshot(options.root, options.snapshotLimits);
  const repairChanges = compareWorkspaceSnapshots(mutatedSnapshot, agentSnapshot);
  const evaluation = await evaluateRepairInLeasedWorkspace({
    root: options.root,
    baseline,
    semanticCheck: options.semanticCheck,
    ...(options.snapshotLimits === undefined ? {} : { snapshotLimits: options.snapshotLimits }),
  });
  const failureCategory = classifyFailure({
    detectionPassed: mutation.detectionPassed,
    adapterCompleted,
    checkPassed: evaluation.checkPassed,
    protectedFilesChanged: evaluation.protectedFilesChanged,
    semanticCheckPassed: evaluation.semanticCheckPassed,
  });

  return {
    schemaVersion: 1,
    trialId: options.trialId,
    mutationId: mutation.mutationId,
    baselineId: mutation.baselineId,
    initialDiagnosticCodes: mutation.actualDiagnosticCodes,
    detectionPassed: mutation.detectionPassed,
    adapterCompleted,
    rounds,
    repaired: failureCategory === null,
    checkPassed: evaluation.checkPassed,
    protectedFilesChanged: evaluation.protectedFilesChanged,
    semanticCheckPassed: evaluation.semanticCheckPassed,
    repairChanges,
    failureCategory,
  };
}

export function createAgentTrialReport(
  trials: readonly AgentTrialResult[],
  producerVersion: string,
): AgentTrialReport {
  assertIdentifier("producerVersion", producerVersion);
  const sortedTrials = [...trials].sort((left, right) =>
    compareText(left.trialId, right.trialId),
  );
  const seenTrialIds = new Set<string>();
  for (const trial of sortedTrials) {
    if (seenTrialIds.has(trial.trialId)) {
      throw new Error(`Duplicate agent trial ID: ${trial.trialId}`);
    }
    seenTrialIds.add(trial.trialId);
  }

  const grouped = new Map<string, AgentTrialResult[]>();
  for (const trial of sortedTrials) {
    const key = `${trial.baselineId}\u0000${trial.mutationId}`;
    const group = grouped.get(key) ?? [];
    group.push(trial);
    grouped.set(key, group);
  }
  const metrics = [...grouped.values()]
    .map((group): AgentTrialMetricGroup => {
      const first = group[0];
      if (first === undefined) {
        throw new Error("Agent trial metric group must not be empty.");
      }
      const repairedCount = group.filter((trial) => trial.repaired).length;
      return {
        mutationId: first.mutationId,
        baselineId: first.baselineId,
        trialCount: group.length,
        repairedCount,
        anyTrialRepaired: repairedCount > 0,
        allTrialsRepaired: repairedCount === group.length,
      };
    })
    .sort((left, right) => compareText(left.mutationId, right.mutationId));
  const repairedCount = sortedTrials.filter((trial) => trial.repaired).length;
  const failureCounts = Object.fromEntries(
    agentTrialFailureCategories.map((category) => [
      category,
      sortedTrials.filter((trial) => trial.failureCategory === category).length,
    ]),
  ) as Record<AgentTrialFailureCategory, number>;
  return {
    schemaVersion: 1,
    producerVersion,
    trials: sortedTrials,
    metrics,
    summary: {
      trialCount: sortedTrials.length,
      repairedCount,
      failedCount: sortedTrials.length - repairedCount,
      failureCounts,
    },
  };
}

export function parseAgentTrialReport(text: string): AgentTrialReport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Agent trial report must contain valid JSON.");
  }
  return validateAgentTrialReport(value);
}

export function serializeAgentTrialReport(report: AgentTrialReport): string {
  const validated = validateAgentTrialReport(report);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function validateAgentTrialReport(value: unknown): AgentTrialReport {
  const record = requireRecord(value, "report");
  requireExactKeys(record, ["schemaVersion", "producerVersion", "trials", "metrics", "summary"], "report");
  if (record["schemaVersion"] !== 1) {
    throw new Error("Agent trial report schemaVersion must be 1.");
  }
  const producerVersion = requireIdentifier(record["producerVersion"], "producerVersion");
  if (!Array.isArray(record["trials"])) {
    throw new Error("Agent trial report trials must be an array.");
  }
  const trials = record["trials"].map((trial, index) => validateTrial(trial, index));
  const canonical = createAgentTrialReport(trials, producerVersion);
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Agent trial report must match its canonical derived metrics and ordering.");
  }
  return canonical;
}

interface TrialState {
  readonly detectionPassed: boolean;
  readonly adapterCompleted: boolean;
  readonly checkPassed: boolean;
  readonly protectedFilesChanged: readonly string[];
  readonly semanticCheckPassed: boolean;
}

function classifyFailure(state: TrialState): AgentTrialFailureCategory | null {
  if (!state.detectionPassed) {
    return "diagnostic-not-produced";
  }
  if (state.protectedFilesChanged.length > 0) {
    return "contract-weakened";
  }
  if (!state.adapterCompleted) {
    return state.checkPassed && !state.semanticCheckPassed
      ? "semantic-regression"
      : "agent-error";
  }
  if (!state.semanticCheckPassed) {
    return "semantic-regression";
  }
  if (!state.checkPassed) {
    return "check-failed";
  }
  return null;
}

function assertRounds(rounds: number): void {
  if (!Number.isSafeInteger(rounds) || rounds < 1) {
    throw new Error("Agent trial rounds must be a positive safe integer.");
  }
}

function assertIdentifier(label: string, value: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${label} must use only letters, digits, dot, underscore, or hyphen.`);
  }
}

function validateTrial(value: unknown, index: number): AgentTrialResult {
  const label = `trials[${index}]`;
  const trial = requireRecord(value, label);
  requireExactKeys(trial, [
    "schemaVersion",
    "trialId",
    "mutationId",
    "baselineId",
    "initialDiagnosticCodes",
    "detectionPassed",
    "adapterCompleted",
    "rounds",
    "repaired",
    "checkPassed",
    "protectedFilesChanged",
    "semanticCheckPassed",
    "repairChanges",
    "failureCategory",
  ], label);
  if (trial["schemaVersion"] !== 1) {
    throw new Error(`${label}.schemaVersion must be 1.`);
  }
  const mutationId = requireCatalogValue(
    trial["mutationId"],
    mutationCatalogIds,
    `${label}.mutationId`,
  ) as MutationId;
  const baselineId = requireCatalogValue(
    trial["baselineId"],
    mutationBaselineIds,
    `${label}.baselineId`,
  ) as MutationBaselineId;
  const failureCategory = trial["failureCategory"] === null
    ? null
    : requireCatalogValue(
      trial["failureCategory"],
      agentTrialFailureCategories,
      `${label}.failureCategory`,
    ) as AgentTrialFailureCategory;
  const result: AgentTrialResult = {
    schemaVersion: 1,
    trialId: requireIdentifier(trial["trialId"], `${label}.trialId`),
    mutationId,
    baselineId,
    initialDiagnosticCodes: requireStringArray(
      trial["initialDiagnosticCodes"],
      `${label}.initialDiagnosticCodes`,
    ),
    detectionPassed: requireBoolean(trial["detectionPassed"], `${label}.detectionPassed`),
    adapterCompleted: requireBoolean(trial["adapterCompleted"], `${label}.adapterCompleted`),
    rounds: requireRounds(trial["rounds"], `${label}.rounds`),
    repaired: requireBoolean(trial["repaired"], `${label}.repaired`),
    checkPassed: requireBoolean(trial["checkPassed"], `${label}.checkPassed`),
    protectedFilesChanged: requireRelativePathArray(
      trial["protectedFilesChanged"],
      `${label}.protectedFilesChanged`,
    ),
    semanticCheckPassed: requireBoolean(
      trial["semanticCheckPassed"],
      `${label}.semanticCheckPassed`,
    ),
    repairChanges: validateRepairChanges(trial["repairChanges"], `${label}.repairChanges`),
    failureCategory,
  };
  const definition = mutationCatalog.find((item) => item.id === mutationId);
  if (definition === undefined || definition.baselineId !== baselineId) {
    throw new Error(`${label}.baselineId does not match its mutation definition.`);
  }
  const expectedDetection = sameStrings(
    definition.expectedDiagnosticCodes,
    result.initialDiagnosticCodes,
  );
  if (result.detectionPassed !== expectedDetection) {
    throw new Error(`${label}.detectionPassed does not match its diagnostic codes.`);
  }
  const expectedFailure = classifyFailure(result);
  if (result.failureCategory !== expectedFailure || result.repaired !== (expectedFailure === null)) {
    throw new Error(`${label} repair outcome does not match its final-state evidence.`);
  }
  if ((!result.adapterCompleted && result.rounds !== 0) || (result.adapterCompleted && result.rounds < 1)) {
    throw new Error(`${label}.rounds does not match adapter completion.`);
  }
  return result;
}

function validateRepairChanges(value: unknown, label: string): readonly MutationFileChange[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const changes = value.map((item, index): MutationFileChange => {
    const change = requireRecord(item, `${label}[${index}]`);
    requireExactKeys(change, ["file", "beforeSha256", "afterSha256"], `${label}[${index}]`);
    return {
      file: requireRelativePath(change["file"], `${label}[${index}].file`),
      beforeSha256: requireDigestOrNull(change["beforeSha256"], `${label}[${index}].beforeSha256`),
      afterSha256: requireDigestOrNull(change["afterSha256"], `${label}[${index}].afterSha256`),
    };
  });
  const sorted = [...changes].sort((left, right) => compareText(left.file, right.file));
  if (JSON.stringify(changes) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must use canonical file ordering.`);
  }
  return changes;
}

const mutationCatalogIds = mutationCatalog.map((definition) => definition.id);
const mutationBaselineIds = ["layered-tasks", "tiny-tasks"] as const;

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
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string identifier.`);
  }
  assertIdentifier(label, value);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function requireRounds(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value as string[];
}

function requireRelativePathArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const paths = value.map((item, index) => requireRelativePath(item, `${label}[${index}]`));
  const sorted = [...paths].sort(compareText);
  if (JSON.stringify(paths) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must use canonical path ordering.`);
  }
  return paths;
}

function requireRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a root-relative POSIX path.`);
  }
  return value;
}

function requireDigestOrNull(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest or null.`);
  }
  return value;
}

function requireCatalogValue(
  value: unknown,
  catalog: readonly string[],
  label: string,
): string {
  if (typeof value !== "string" || !catalog.includes(value)) {
    throw new Error(`${label} is not supported.`);
  }
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
