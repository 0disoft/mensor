# ADR 0024: Plan commitments hide host paths and agent arguments

## Status

Accepted.

## Context

The canonical Docker plan contains the absolute host Docker executable path and
the raw container-agent argument list. Those values are required to materialize
an execution command but should not be copied into portable trial evidence.
Hashing the complete private plan gives it a stable identity, but does not
provide a safe artifact that a later evidence envelope can embed and revalidate.

## Decision

The runner derives `docker-sandbox-plan-commitment/v1` from the validated plan.
The commitment retains the immutable image, container executable, derived
security settings, and bounded limits. It replaces the host Docker executable
path and complete agent argument list with separate SHA-256 commitments.

The canonical plan digest is the digest of this commitment. Runtime
attestations, conformance reports, and execution descriptor v2 therefore bind
the same publish-safe plan identity. The raw plan remains an in-process command
materialization input and is not an evidence-envelope field.

## Consequences

- Portable evidence can expose plan structure without copying host paths or
  agent arguments.
- Path or argument drift still starts a new execution cohort.
- SHA-256 is an equality commitment, not encryption. Guessable low-entropy
  paths or arguments must still be treated as potentially discoverable.
- A consumer needs the original private plan to prove which raw path and
  arguments produced the commitment.
