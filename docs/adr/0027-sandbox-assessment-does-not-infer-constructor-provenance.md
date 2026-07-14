# ADR 0027: Sandbox assessment does not infer constructor provenance

## Status

Accepted.

## Context

Trial evidence v2 binds its descriptor, plan commitment, runtime attestation,
port-conformance report, and trial report. The authoritative sandbox runner can
produce that envelope atomically inside one process. The same serializable
shape can still be assembled by another caller, so parsing a valid envelope
cannot prove which constructor produced it.

## Decision

`assessSandboxAgentTrialEvidence` validates every canonical v2 binding and emits
`sandbox-evidence-assessment/v2`. Its strongest claim is
`sandbox-artifact-integrity-only`, and it carries the descriptor's
`port-conformance-only` evidence level.

The assessment always records `atomicConstructionProven: false` and public
repair-rate eligibility false. Construction provenance, credential scope,
Docker daemon fidelity, and runtime-observation provenance remain fixed
blockers. Callers cannot override these fields or remove blockers while using
this assessment revision.

## Consequences

- Valid portable evidence proves internal artifact consistency, not its
  execution history.
- A hand-built envelope cannot be promoted merely by matching the authoritative
  runner's output shape.
- Future stronger claims require independently verifiable provenance rather
  than another self-asserted Boolean field.
