# ADR-0036: Reference Runtime Is a Bounded Manifest Consumer

- Status: Accepted
- Date: 2026-08-30

## Context

RuntimeManifest v1 creates a source-free contract, but compiler-only emission
does not prove that the artifact contains enough information for a consumer to
serve a page, decode a form, validate input, and invoke the intended handler.
A general application runtime would pull routing, authentication, sessions,
persistence, and deployment into Mensor and turn the checker into a framework.

## Decision

Publish `@0disoft/mensor-reference-runtime` as a deliberately bounded consumer.

- It depends only on the contract package and Web `Request`/`Response` APIs.
- It serves exact manifest GET pages and dispatches exact POST actions.
- A host supplies an exact handler-id registry.
- A host-supplied `actionGuard` is mandatory when actions exist and owns
  authentication and CSRF decisions.
- The runtime bounds body, field, and value sizes; rejects unknown fields,
  duplicate scalar values, and unsafe property names; decodes every Feature
  Contract v1 codec; and validates the resulting schema before invocation.
- Handler and guard exceptions return generic failures. Redirects are
  root-relative and handlers cannot set transport-owned headers.
- The runtime never reads source, imports handler modules, discovers
  registries, persists data, or owns sessions, cookies, deployment, or logs.

## Consequences

- RuntimeManifest v1 has a real independent consumer without creating a second
  compiler or source scanner.
- Application frameworks can wrap one Request/Response handler while retaining
  ownership of security and persistence.
- The package is conformance evidence, not a production framework claim.
- Adding streaming, multipart, route parameters, sessions, or handler discovery
  requires a separate product decision.
