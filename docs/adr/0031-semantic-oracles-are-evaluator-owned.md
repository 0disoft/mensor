# ADR-0031: Semantic Oracles Are Evaluator-Owned

- Status: Accepted
- Date: 2026-07-18

## Context

The first agent-authored guestbook protocol required the coding agent to create
both the application and `test/semantic.test.mjs`. A Codex subagent produced an
application that kept a static HTML form for Mensor but reconstructed the form
in JavaScript at runtime. Its own six semantic tests passed because they did
not check that GET rendering used the static source.

A checker-clean result plus an agent-authored test is therefore not an
independent behavior oracle. The same actor can omit a requirement from both
the implementation and its tests.

## Decision

Agent-authored build trials use a versioned evaluator-owned semantic oracle.

- The oracle is loaded and SHA-256 validated before mutable workspace creation.
- It is copied into protected `input/` and included in the protected snapshot.
- The agent may not edit, replace, or generate the oracle.
- The generated application exposes a brief-owned stable interface that the
  oracle can invoke without framework-specific discovery.
- The guestbook v2 interface is `src/app.mjs` exporting
  `createGuestbookApp({ templateHtml }) -> { fetch, entries }`.
- The oracle injects an in-memory template sentinel so a JavaScript-recreated
  form cannot masquerade as use of the static HTML source.
- Agent-authored tests may remain as project smoke tests but never affect the
  evaluator verdict.

## Consequences

Brief revisions and oracle revisions become coupled evaluation inputs and must
both be recorded. A new app shape requires a new stable evaluator interface or
a different protected oracle. This adds brief authoring work, but it removes a
larger false-success path and keeps semantic behavior separate from Mensor's
diagnostic contract.

Version 1 guestbook cohort results cannot be upgraded after the fact. They are
historical exploratory evidence only.
