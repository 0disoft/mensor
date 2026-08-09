# ADR 0015: Agent Evaluation Workspaces Are Leased and Snapshotted

- Status: Accepted
- Date: 2026-07-12

## Context

Mutation and trial APIs modified caller-owned roots directly. Concurrent calls
inside one process could observe each other's mutations. Repair verification
also ran compiler, protected-file, and semantic checks against different points
in time, while unbounded whole-file reads made snapshots an uncontrolled
resource surface.

## Decision

Every mutating evaluation entrypoint acquires an exclusive in-process lease for
its canonical root. Parent and descendant roots conflict in either acquisition
order; sibling roots remain independent. A trial snapshots the mutated state,
the post-agent state, the semantic-check boundaries, and the final verified
state with streaming hashes and explicit file, byte, aggregate-byte, and depth
limits. Each file is tied to one open handle with identity checks before and
after hashing plus a final path-identity check, so observed replacement or
same-size modification fails closed.

Agent repair changes are derived before semantic evaluation. A semantic oracle
that mutates the workspace fails, and compiler plus protected-file checks run on
the state after that oracle. The workspace must remain unchanged through the
verification pass.

## Consequences

- Concurrent mutation or trial calls for the same, ancestor, or descendant root
  fail instead of contaminating each other's evidence.
- Semantic-check side effects cannot produce a successful repair result.
- Large or deeply generated workspaces fail closed during evidence capture.
- Snapshot identity checks detect observed file drift but do not freeze the
  caller-owned filesystem into a globally atomic image.
- The lease is process-local. Cross-process ownership and escaped descendants
  still require an external sandbox or scheduler that gives each trial an
  isolated root.
