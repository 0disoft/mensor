# Reference Runtime v1

- Status: Active

`@0disoft/mensor-reference-runtime` is the bounded executable consumer of a
validated RuntimeManifest v1 value. It proves the compiler-runtime artifact
boundary without becoming an application framework.

## Startup Contract

`createReferenceRuntime` canonicalizes and validates the manifest, requires an
exact action handler registry, validates positive resource limits, and requires
an `actionGuard` whenever actions exist. Missing and extra handlers fail before
the first request.

## Request Contract

- Exact manifest GET paths return embedded HTML.
- Exact manifest POST paths accept only URL-encoded bodies.
- Other paths return 404; known paths with another method return 405 and `Allow`.
- Body bytes, field count, field-name bytes, and value bytes are bounded.
- Unknown fields, duplicate scalar values, unsafe property names, malformed
  scalar values, and schema violations return generic client errors.
- Every Feature Contract v1 codec is decoded without schema coercion magic.

The guard receives immutable request metadata and bounded raw form fields. It
returns only allow/deny plus an optional serializable security context. The
handler receives validated input and cannot run before the guard succeeds.

## Response Contract

Handlers return HTML or a 303 root-relative redirect. HTML status and header
values are validated. Content type, content length, cookies, location, and
hop-by-hop transport headers are runtime-owned and cannot be overridden by a
handler. Host exceptions are never copied into the response.

## Non-ownership

The package does not discover or import handlers, read source files, implement
authentication or CSRF policy, parse sessions or cookies, persist data, escape
handler HTML, expose telemetry, or provide deployment infrastructure.
