import {
  createAgentTrialReport,
  runAgentTrial,
  type RunAgentTrialOptions,
} from "@mensor/fixture-kit";

import {
  createAgentTrialEvidence,
  createCommandExecutionDescriptor,
  type AgentTrialEvidence,
  type CommandExecutionMetadata,
} from "./execution-descriptor.js";
import {
  createCommandAgentAdapter,
  type CommandAgentAdapterOptions,
} from "./command-adapter.js";

export interface RunCommandAgentTrialOptions {
  readonly execution: CommandExecutionMetadata;
  readonly command: CommandAgentAdapterOptions;
  readonly trial: Omit<RunAgentTrialOptions, "adapter">;
  readonly producerVersion: string;
}

export async function runCommandAgentTrial(
  options: RunCommandAgentTrialOptions,
): Promise<AgentTrialEvidence> {
  const adapter = createCommandAgentAdapter(options.command);
  const execution = createCommandExecutionDescriptor(
    options.execution,
    options.command,
  );
  createAgentTrialReport([], options.producerVersion);
  const trial = await runAgentTrial({
    ...options.trial,
    adapter,
  });
  return createAgentTrialEvidence(
    execution,
    createAgentTrialReport([trial], options.producerVersion),
  );
}
