# ADR-0033: RouteIndex Is a Source-Bound Artifact

- Status: Accepted
- Date: 2026-07-18

## Context

The maintained Hono task and dependency-free Node RSVP pilots both detected
static HTML field drift and both missed an application-only route rename. The
same blind spot appeared in two application shapes: feature contracts and
forms remained `/tasks` or `/rsvp`, while route source moved to another path.

Parsing Hono calls or Node request branches directly in the compiler would
couple the semantic rule to framework syntax. Executing application route
configuration would violate the compiler's untrusted-source boundary. A
generic plugin lifecycle would add code execution, loading, compatibility, and
resource authority before one external adapter exists.

## Decision

Mensor accepts an optional canonical serialized `RouteIndex v1` selected by
`ProjectContract.routeIndex`.

- The artifact contains static method, path, source file, SHA-256 digest, and
  source range facts.
- The compiler validates strict canonical JSON, portable paths, unique routes,
  current source digests, discovered files, and in-bounds ranges.
- Stale or malformed artifacts fail configuration before semantic rules.
- A fresh index missing an action contract's exact `POST` route emits the
  stable `route.missing` diagnostic.
- Extra application routes are allowed.
- `@0disoft/mensor-contract` owns the parser, serializer, schema, and serializable
  types.
- The compiler does not execute, discover, install, or load a producer.
- No Hono extractor, Node extractor, arbitrary hook, or generic plugin API is
  authorized.

The normative shape and failure model are recorded in
`docs/architecture/route-index-v1.md`.

## Consequences

- Route drift becomes visible without framework execution.
- Stale producer output cannot silently certify current source.
- Project authoring gains one optional path, while generated index artifacts
  add a separate maintenance and CI surface.
- Producer correctness remains outside the compiler's proof. A valid digest
  proves freshness, not faithful framework interpretation.
- Static HTML-only projects can continue without a RouteIndex and preserve
  existing behavior.

## Alternatives Rejected

### Parse framework routes in the compiler

This would make every framework syntax a compiler dependency and blur the
normalized-fact boundary.

### Execute application configuration

This creates an untrusted-code execution path in CI and makes output depend on
environment, dependencies, and runtime side effects.

### Trust an unbound route list

A plain method/path array cannot distinguish current evidence from a stale
artifact. It would replace one route-drift blind spot with another.

### Add a generic plugin interface

No stable lifecycle or external provider exists. Serialized input solves the
current problem without granting executable authority.

## Reconsider When

- a real consumer needs dynamic or parameterized route evidence;
- a separately maintained adapter cannot represent uncertainty safely;
- source digest validation becomes a measured material bottleneck; or
- more than static action-route presence is required by repeated projects.
