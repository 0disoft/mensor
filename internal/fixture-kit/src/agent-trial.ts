import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

import {
  captureRepairBaseline,
  evaluateRepair,
} from "./repair-evaluation.js";
import {
  runMutationCase,
  type MutationBaselineId,
  type MutationFileChange,
  type MutationId,
} from "./mutations.js";

export interface AgentTrialContext {
  readonly root: string;
  readonly mutationId: MutationId;
  readonly baselineId: MutationBaselineId;
  readonly diagnosticCodes: readonly string[];
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
}

export type AgentTrialFailureCategory =
  | "agent-error"
  | "check-failed"
  | "contract-weakened"
  | "diagnostic-not-produced"
  | "semantic-regression";

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
  };
}

export async function runAgentTrial(
  options: RunAgentTrialOptions,
): Promise<AgentTrialResult> {
  assertIdentifier("trialId", options.trialId);
  const baseline = await captureRepairBaseline({
    root: options.root,
    protectedFiles: options.protectedFiles,
  });
  const mutation = await runMutationCase(options.root, options.mutationId);
  const mutatedSnapshot = await snapshotWorkspace(options.root);

  let adapterCompleted = false;
  let rounds = 0;
  if (mutation.detectionPassed) {
    try {
      const adapterResult = await options.adapter({
        root: options.root,
        mutationId: mutation.mutationId,
        baselineId: mutation.baselineId,
        diagnosticCodes: mutation.actualDiagnosticCodes,
      });
      assertRounds(adapterResult.rounds);
      rounds = adapterResult.rounds;
      adapterCompleted = true;
    } catch {
      adapterCompleted = false;
    }
  }

  const evaluation = await evaluateRepair({
    root: options.root,
    baseline,
    semanticCheck: options.semanticCheck,
  });
  const repairedSnapshot = await snapshotWorkspace(options.root);
  const repairChanges = compareSnapshots(mutatedSnapshot, repairedSnapshot);
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
  return {
    schemaVersion: 1,
    producerVersion,
    trials: sortedTrials,
    metrics,
    summary: {
      trialCount: sortedTrials.length,
      repairedCount,
      failedCount: sortedTrials.length - repairedCount,
    },
  };
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
  if (!state.adapterCompleted) {
    return "agent-error";
  }
  if (state.protectedFilesChanged.length > 0) {
    return "contract-weakened";
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

type WorkspaceSnapshot = Readonly<Record<string, string>>;

async function snapshotWorkspace(root: string): Promise<WorkspaceSnapshot> {
  const snapshot: Record<string, string> = {};
  await walk(root, "", snapshot);
  return snapshot;
}

async function walk(
  root: string,
  relativeDirectory: string,
  snapshot: Record<string, string>,
): Promise<void> {
  const directory = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name),
  );
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(root, relativePath, snapshot);
    } else if (entry.isFile()) {
      const bytes = await readFile(path.join(directory, entry.name));
      snapshot[relativePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

function compareSnapshots(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
): readonly MutationFileChange[] {
  const files = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareText);
  return files.flatMap((file) => {
    const beforeSha256 = before[file] ?? null;
    const afterSha256 = after[file] ?? null;
    return beforeSha256 === afterSha256
      ? []
      : [{ file, beforeSha256, afterSha256 }];
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
