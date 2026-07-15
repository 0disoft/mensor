# Project Invariants

- Status: Proposed
- Owner: Maintainer

These rules must remain aligned across implementation, tests, fixtures,
configuration, documentation, and release behavior.

## Safety

1. Checking a project never executes project source or configuration.
2. Checking a project performs no network access and spawns no project tools.
3. Paths cannot escape the selected project root, including through symlinks.
4. Canonical diagnostics do not expose absolute paths, environment values,
   source snippets, timestamps, or random identifiers.

## Determinism

5. Identical input and tool version produce byte-identical canonical JSON.
6. Files, forms, edges, related locations, and diagnostics have explicit stable
   sort orders independent of filesystem enumeration.
7. Public source locations use project-relative POSIX paths and 0-based UTF-16
   ranges.

## Architecture

8. Public and cross-package contracts are plain serializable values.
9. Parser AST nodes, class instances, file handles, functions, ORM objects, and
   framework objects do not cross the compiler contract boundary.
10. Rules consume normalized facts rather than parser-specific trees.
11. Dependency direction is contract to compiler to CLI; reverse edges fail
    review.
12. A general plugin lifecycle is not introduced before role-specific adapter
    contracts are proven.

## Product Discipline

13. Mensor checks an existing application architecture; it does not invent a
    mandatory web framework architecture.
14. Inferable source facts are extracted rather than duplicated in contracts.
15. A repair that weakens a boundary, edits protected contracts, or deletes the
    tested feature is not successful.
16. Unsupported syntax fails explicitly rather than silently reducing analysis
    coverage.
17. Runtime, manifest, IDE, and cloud surfaces remain deferred until a measured
    use case justifies their maintenance cost.
18. External dogfood and contract adoption evidence precede additional agent
    attestation layers or public repair-rate work.

## Merge Evidence

Changes to any invariant require a focused fixture, synchronized source-of-truth
documents, compatibility classification, and an explicit maintainer decision.
The stable validation names are defined in `VALIDATION.md`.
