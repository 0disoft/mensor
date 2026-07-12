import {
  createAgentTrialReport,
  mutationCatalog,
  type MutationBaselineId,
  type MutationId,
  type WorkspaceSnapshotLimits,
} from "@mensor/fixture-kit";

import type { CommandAgentAdapterOptions } from "./command-adapter.js";
import { runCommandAgentTrial } from "./command-trial.js";
import {
  createCommandExecutionDescriptor,
  mergeAgentTrialEvidence,
  type AgentTrialEvidence,
  type CommandExecutionMetadata,
} from "./execution-descriptor.js";

export interface CommandAgentSuiteCase {
  readonly mutationId: MutationId;
  readonly repetitions: number;
  readonly protectedFiles: readonly string[];
  readonly semanticCheck: (root: string) => boolean | Promise<boolean>;
}

export interface AgentSuiteWorkspaceProvider {
  readonly create: (
    baselineId: MutationBaselineId,
    mutationId: MutationId,
    trialId: string,
  ) => Promise<string>;
  readonly dispose: (root: string) => Promise<void>;
}

export interface RunCommandAgentSuiteOptions {
  readonly suiteId: string;
  readonly execution: CommandExecutionMetadata;
  readonly command: CommandAgentAdapterOptions;
  readonly cases: readonly CommandAgentSuiteCase[];
  readonly workspace: AgentSuiteWorkspaceProvider;
  readonly producerVersion: string;
  readonly snapshotLimits?: Partial<WorkspaceSnapshotLimits>;
}

export async function runCommandAgentSuite(
  options: RunCommandAgentSuiteOptions,
): Promise<AgentTrialEvidence> {
  const plans = validateAndExpandPlans(options);

  // Complete descriptor and report validation before the first mutable workspace exists.
  createCommandExecutionDescriptor(options.execution, options.command);
  createAgentTrialReport([], options.producerVersion);

  const evidence: AgentTrialEvidence[] = [];
  for (const plan of plans) {
    const root = await options.workspace.create(
      plan.baselineId,
      plan.mutationId,
      plan.trialId,
    );
    try {
      evidence.push(await runCommandAgentTrial({
        execution: options.execution,
        command: options.command,
        producerVersion: options.producerVersion,
        trial: {
          trialId: plan.trialId,
          root,
          mutationId: plan.mutationId,
          protectedFiles: plan.protectedFiles,
          semanticCheck: () => plan.semanticCheck(root),
          ...(options.snapshotLimits === undefined
            ? {}
            : { snapshotLimits: options.snapshotLimits }),
        },
      }));
    } finally {
      await options.workspace.dispose(root);
    }
  }
  return mergeAgentTrialEvidence(evidence);
}

interface ExpandedPlan extends CommandAgentSuiteCase {
  readonly trialId: string;
  readonly baselineId: MutationBaselineId;
}

function validateAndExpandPlans(
  options: RunCommandAgentSuiteOptions,
): readonly ExpandedPlan[] {
  assertIdentifier("suiteId", options.suiteId);
  if (options.cases.length === 0) {
    throw new Error("Command agent suite must contain at least one case.");
  }
  const seenMutationIds = new Set<MutationId>();
  const sortedCases = [...options.cases].sort((left, right) =>
    compareText(left.mutationId, right.mutationId),
  );
  const plans: ExpandedPlan[] = [];
  for (const suiteCase of sortedCases) {
    if (seenMutationIds.has(suiteCase.mutationId)) {
      throw new Error(`Command agent suite repeats mutation ${suiteCase.mutationId}.`);
    }
    seenMutationIds.add(suiteCase.mutationId);
    if (!Number.isSafeInteger(suiteCase.repetitions) || suiteCase.repetitions < 1) {
      throw new Error("Command agent suite repetitions must be a positive safe integer.");
    }
    if (suiteCase.protectedFiles.length === 0) {
      throw new Error("Command agent suite cases must protect at least one contract file.");
    }
    const definition = mutationCatalog.find((item) => item.id === suiteCase.mutationId);
    if (definition === undefined) {
      throw new Error(`Unsupported command agent suite mutation: ${suiteCase.mutationId}`);
    }
    for (let attempt = 1; attempt <= suiteCase.repetitions; attempt += 1) {
      plans.push({
        ...suiteCase,
        baselineId: definition.baselineId,
        trialId: `${options.suiteId}.${suiteCase.mutationId}.${attempt}`,
      });
    }
  }
  return plans;
}

function assertIdentifier(label: string, value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded identifier.`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
