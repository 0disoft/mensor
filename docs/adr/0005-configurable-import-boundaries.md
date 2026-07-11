# ADR-0005: Configurable Import Boundaries

- Status: Accepted
- Owner: Maintainer

## Context

Browser reachability and route layering are different graph questions. A
browser module remains unsafe when it reaches server code through shared
modules, while a route module may legitimately call a server handler that later
uses a repository.

## Decision

- Add optional project-owned boundary declarations using role names.
- Support `direct` and `transitive` modes rather than hard-coding role meaning.
- Treat runtime, re-export, literal dynamic, and type-only imports as graph
  edges.
- Resolve local ESM-style `.js` specifiers to discovered TypeScript source
  without loading modules or invoking project configuration.
- Treat external package imports and non-source assets as graph leaves.
- Emit a stable import chain for transitive violations.
- Emit an explicit diagnostic for non-literal dynamic imports reached by an
  active boundary.

## Consequences

- Browser and route policies share one fact graph without sharing semantics.
- Projects without `boundaries` retain placement and form checking only.
- Relative source imports that cannot resolve fail closed.
- Type-only coupling must move to an allowed shared role rather than bypassing
  architectural policy.

## Reconsider When

- tsconfig path aliases or package exports become a required local edge source;
- framework adapters provide a normalized module index; or
- measured graph size requires incremental caching.
