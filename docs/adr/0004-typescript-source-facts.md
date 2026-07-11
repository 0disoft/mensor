# ADR-0004: TypeScript Source Facts

- Status: Accepted
- Owner: Maintainer

## Context

Handler export and import-boundary checks require TypeScript and JavaScript
syntax facts, but checking an untrusted repository must never load or execute
its modules.

## Decision

- Use the pinned TypeScript 6 compiler API as a direct compiler dependency.
- Parse source text already bounded by `limits.maxFileBytes`.
- Convert syntax immediately into Mensor-owned export and future import facts.
- Support direct declarations, explicit named re-exports, namespace exports,
  default exports, and destructured variable exports.
- Fail closed on syntax errors and wildcard re-exports when a handler export
  cannot otherwise be proven.
- Never pass TypeScript nodes, symbols, programs, or source files across the
  extraction boundary.

## Consequences

- Handler export checking does not import project code or invoke its build.
- Explicit re-exports are deterministic without package resolution.
- Wildcard re-export resolution is deferred to the import-graph slice.
- Parser upgrades can change source ranges and therefore require fixture review.

## Reconsider When

- module resolution is implemented as normalized import-edge extraction;
- JavaScript CommonJS support becomes an explicit product requirement; or
- a language adapter can provide equivalent serialized module facts.
