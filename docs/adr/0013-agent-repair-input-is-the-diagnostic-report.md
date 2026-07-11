# ADR 0013: Agent Repair Input Is the Diagnostic Report

- Status: Accepted
- Date: 2026-07-11

## Context

Diagnostic codes identify failure classes but do not tell a coding agent which
file, range, machine facts, related contract location, repair strategy, or
preservation constraint applies. A fake adapter can repair a hard-coded
mutation from its ID, but that does not demonstrate diagnostic-driven repair.

Passing source snippets, prompts, transcripts, or raw compiler logs would add
noise and disclosure risk instead of using the product contract already owned
by the compiler.

## Decision

The provider-neutral trial context carries the complete validated
`DiagnosticReport`. The bounded command protocol sends that report with only
the mutation and baseline identifiers needed by the evaluation harness.
Diagnostic codes remain an in-process convenience and must match the report;
they are not duplicated on the command wire.

The runner validates the report schema, requires a failing non-empty report,
checks code identity, applies the existing stdin byte limit, and rejects drift
before spawning the command. Command input and output have explicit JSON
Schemas.

## Consequences

- A command agent receives file, range, facts, related locations, and repair
  constraints without receiving source snippets or raw logs.
- Fake repair tests must consume diagnostic facts rather than only mutation IDs.
- Larger diagnostic sets may hit the configured input limit and fail closed.
- This protocol still does not prove that a real model follows repair
  constraints; final-state, protected-contract, and semantic checks remain the
  acceptance oracles.
