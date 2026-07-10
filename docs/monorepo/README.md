# Monorepo

- Status: Proposed

Mensor starts as one public repository because contracts, compiler behavior,
diagnostics, fixtures, and CLI output must change atomically while the model is
still forming.

Packages are separate ownership and dependency boundaries, not separate
repositories. See `workspace-boundaries.md` for the normative package graph.

A repository may be split only when it has a different language toolchain,
release cadence, maintainer group, security boundary, or independently useful
product surface. A private evaluation repository may consume public packages,
but public releases must never depend on it.
