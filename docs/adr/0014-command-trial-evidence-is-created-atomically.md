# ADR 0014: Command Trial Evidence Is Created Atomically

- Status: Accepted
- Date: 2026-07-11

## Context

The command adapter and execution descriptor can be constructed separately.
A caller could accidentally execute with one timeout or byte limit and attach a
descriptor produced from different options. Valid JSON would then describe an
execution that never happened.

Invalid command configuration discovered after mutation would also leave a
trial workspace changed even though no agent attempt began.

## Decision

`runCommandAgentTrial` is the evidence-producing entrypoint. It accepts one
command-options object, validates and snapshots the adapter and descriptor before
mutation, runs one provider-neutral trial, derives its report, and binds the
report to that descriptor in one operation.

Lower-level adapter and descriptor constructors remain available for protocol
tests and composition, but their independently assembled output is not
authoritative command-trial evidence.

## Consequences

- Descriptor limits and actual process limits share one validated source.
- Invalid executable, argument, environment, limit, or execution metadata fails
  before the mutation is applied.
- The returned evidence has one execution fingerprint and one derived trial
  report without a caller-owned assembly step.
- Multi-trial evaluation still creates isolated single-trial evidence first and
  then uses the same-fingerprint cohort merger.
