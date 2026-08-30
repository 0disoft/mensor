# ADR-0038: The CLI Hosts One Explicit Hono Route Producer

- Status: Accepted
- Date: 2026-08-30

## Context

ADR-0033 established RouteIndex as a serialized boundary and rejected an
in-process producer lifecycle. Subsequent agent-authored onboarding produced
hand-maintained, omitted, and invalid RouteIndexes. The public serializer was
available, but users still had to calculate source digests and ranges and keep
canonical output synchronized.

Adding a generic plugin API or inferring Node request branches would exceed the
evidence. Hono direct route calls have one bounded static shape already present
in a maintained fixture and can be extracted without running source.

## Decision

The public CLI adds the explicit `index-hono-routes` command.

- Source files and receiver identifiers are supplied directly by the caller.
- The command parses source without importing it or resolving modules.
- Only direct or chained static `get` and `post` calls are accepted.
- Unsupported composition and dynamic evidence fail closed.
- Output is canonical RouteIndex v1 and uses the CLI's atomic artifact writer.
- `check` and `compile` do not discover or execute the producer.

This amends ADR-0033 only by authorizing one out-of-process producer command.
Its serialized compiler boundary and rejection of generic plugins remain.

## Consequences

- Hono users no longer hand-calculate RouteIndex digests and ranges for the
  supported syntax.
- The CLI gains a direct TypeScript parser dependency.
- Receiver identity is syntactic rather than type-checked, so dedicated route
  modules and focused receiver selection remain important.
- Node request branches, mounted routers, dynamic prefixes, and other
  frameworks remain unsupported.
