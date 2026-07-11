# ADR 0011: Agent Trial Reports Are Canonical Derived Artifacts

- Status: Accepted
- Date: 2026-07-11

## Context

Agent trial results combine compiler diagnostics, protected-file evidence,
semantic checks, and adapter outcomes. A loosely shaped JSON log can contain
stale aggregate counts, host-specific data, or fields that make two equivalent
runs compare differently. Such output is not reliable benchmark evidence.

## Decision

The private fixture kit owns `agent-trial-report/v1`, its JSON Schema, strict
validator, and canonical serializer. Aggregate metrics and failure counts are
derived from validated trial records and are never accepted as independent
claims. Trial and metric ordering, failure-category keys, relative paths, and
the final newline are deterministic.

The report does not include timestamps, absolute paths, source text, prompts,
transcripts, raw provider output, or credentials. Reproducibility metadata for
real providers will require a separate versioned execution descriptor before
real-agent history is retained.

## Consequences

- Invalid, reordered, or internally inconsistent reports fail closed.
- Every failure category has an explicit count, including zero.
- The repository may retain synthetic golden reports but must not present them
  as real-agent measurements.
- Adding provider, model, tool, cost, or environment fields requires a schema
  revision and a documented privacy review.
