# ADR-0007: Repair Evaluation Requires Three Independent Gates

- Status: Accepted
- Date: 2026-07-11

## Context

A coding agent can make a checker pass without repairing the application. It
can weaken a project contract, remove a boundary, or delete the behavior that
the failing feature was meant to provide. Compiler success alone therefore
does not establish repair success.

## Decision

The internal repair evaluator accepts a repair only when all of these gates
pass independently:

1. the compiler completes with no error diagnostics;
2. every explicitly protected contract file has the same SHA-256 digest as the
   captured baseline; and
3. a trusted application-owned semantic check passes.

Protected paths are root-relative POSIX paths and are sorted before capture and
comparison. Evaluation results contain only serializable booleans, diagnostic
codes, and changed protected paths. The fixture kit remains private and does
not become part of a published runtime dependency graph.

## Consequences

- Contract weakening is rejected even when the compiler report is clean.
- Deleting or hollowing out feature behavior is rejected by the semantic gate.
- Each evaluated application must supply a meaningful semantic check; the
  fixture kit cannot infer product behavior from source text.
- The evaluator does not claim sandboxing or agent-process orchestration. Those
  concerns belong to a future benchmark harness if one is justified.
