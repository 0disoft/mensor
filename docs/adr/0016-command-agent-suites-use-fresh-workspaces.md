# ADR 0016: Command Agent Suites Use Fresh Workspaces

- Status: Accepted

## Context

A single command-backed trial can prove one repair outcome, but a repair-rate
claim needs multiple mutations and repeated attempts. Reusing one mutable root
would let an earlier repair or failure contaminate later evidence. Starting
work before the complete suite is validated can also leave a partially mutated
dataset after a configuration error.

## Decision

The private agent runner owns a serial command-suite orchestrator. It expands a
validated, canonically ordered case list into deterministic trial IDs. A caller
must create a fresh workspace for every trial and dispose it afterward. The
orchestrator validates the execution descriptor, producer version, mutation
catalog membership, repetition counts, and protected-file presence before the
first workspace is requested.

Each isolated trial still passes through `runCommandAgentTrial`. Results are
combined only by the existing execution-fingerprint cohort merger. Workspace
disposal runs in a `finally` block even when mutation setup, the command, or an
oracle fails.

## Consequences

- A suite cannot accidentally merge results from different command, model,
  prompt, toolset, dataset, platform, or limit contracts.
- Repeated attempts cannot share repair state through the orchestrator.
- The caller remains responsible for producing genuinely fresh workspaces and
  for external process, filesystem, credential, and network isolation.
- Real-agent quality remains unmeasured until an explicitly configured command
  is run; fake-agent tests prove orchestration, not model capability.
