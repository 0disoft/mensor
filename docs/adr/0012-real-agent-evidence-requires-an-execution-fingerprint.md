# ADR 0012: Real-Agent Evidence Requires an Execution Fingerprint

- Status: Accepted
- Date: 2026-07-11

## Context

A canonical trial report proves final-state checks but does not identify which
model, prompt, toolset, dataset, adapter, host runtime, or resource limits
produced it. Combining reports from different execution contracts creates a
repair-rate number with no stable meaning.

Raw prompts, command arguments, executable paths, environment values, provider
output, and credentials must not be copied into benchmark artifacts merely to
make runs reproducible.

## Decision

The private agent runner owns `agent-execution-descriptor/v1` and
`agent-trial-evidence/v1`. A descriptor records bounded identifiers, revisions,
and SHA-256 references for the model-facing artifacts plus platform,
architecture, Node version, process isolation, network-control truth, and
enforced command limits.

Canonical descriptor bytes produce an execution fingerprint. Trial evidence
embeds one descriptor and one validated trial report and derives the
fingerprint again. A stale or caller-supplied aggregate cannot override either
artifact.

The local command runner always records `isolation: process-only` and
`networkControl: not-enforced`. It cannot claim external sandbox controls that
it does not implement.

## Consequences

- Reports from different fingerprints must not be merged into one metric.
- Cohort aggregation revalidates evidence and derives metrics from unique trial
  records instead of accepting caller-supplied totals.
- A missing model revision remains explicit as `null` instead of being guessed.
- Hashes identify reviewed artifacts but do not prove their contents are safe,
  secret-free, or available for audit.
- Supporting an externally enforced sandbox requires a new runner contract or
  schema revision rather than changing these fields optimistically.
