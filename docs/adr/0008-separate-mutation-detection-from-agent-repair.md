# ADR-0008: Separate Mutation Detection from Agent Repair

- Status: Accepted
- Date: 2026-07-11

## Context

A deterministic checker can detect an injected defect without proving that a
coding agent can repair it. Combining those measurements would turn fixture
coverage into a misleading agent-quality claim.

## Decision

Maintain two separate evaluation layers:

1. a deterministic golden mutation corpus that measures exact diagnostic
   detection; and
2. future repeated agent trials that measure final-state repair, protected
   contract integrity, semantic preservation, and trajectory safety.

Mutation reports contain hashes and structured facts rather than source text or
agent transcripts. Detection results may gate regression releases. Agent repair
metrics do not exist until an actual agent runner and repeated trials produce
observable evidence.

## Consequences

- A `6/6` mutation report means six defects were detected exactly, not repaired.
- Agent models, prompts, tools, and trial counts can change without changing the
  deterministic golden corpus.
- Dirty cases from real failures are quarantined until they become stable enough
  for the golden corpus.
