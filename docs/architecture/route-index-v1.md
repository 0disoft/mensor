# RouteIndex v1

- Status: Implemented public artifact
- Authority: ADR-0033
- Schema: `packages/contract/spec/route-index-v1.schema.json`

## Purpose

`RouteIndex` is the serializable boundary between application- or
framework-specific route extraction and Mensor's route contract rule. It lets
the compiler compare action routes with application route facts without
executing source, importing framework configuration, or accepting an
in-process plugin.

The first revision intentionally contains only static `GET` and `POST` routes.
It does not describe parameters, middleware, authentication, hosts, query
strings, response types, handlers, or framework objects.

## Envelope

```ts
interface RouteIndex {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly routes: readonly IndexedRoute[];
}

interface IndexedRoute {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly source: {
    readonly file: string;
    readonly contentDigest: `sha256:${string}`;
    readonly range: SourceRange;
  };
}
```

`producer` identifies extraction semantics but does not authorize or launch the
producer. Mensor consumes only a pre-existing artifact selected by the optional
project-contract `routeIndex` path.

## Canonical Form

- Strict JSON only; comments and JSONC conveniences are rejected.
- UTF-8 text, LF, two-space indentation, and one final newline.
- Object keys use schema order.
- Routes sort by method, path, source file, then source range.
- Method and path pairs are unique.
- Paths are static route paths without query or fragment syntax.
- Source files are project-root-relative portable POSIX paths.
- Ranges use zero-based lines and zero-based UTF-16 characters.
- The artifact contains no timestamps, absolute paths, snippets, environment
  values, random IDs, AST nodes, callbacks, or runtime handles.

`parseRouteIndex` accepts only canonical input. `serializeRouteIndex` produces
the canonical representation. Package versions and `schemaVersion` advance
independently.

## Freshness

Before semantic rules run, the compiler:

1. verifies every indexed source is inside the discovered source root;
2. reads the source through the shared source cache;
3. recomputes its SHA-256 digest;
4. verifies the indexed range remains inside the current source; and
5. fails configuration when any check disagrees.

`route_index.digest_mismatch` means the artifact is stale and no semantic route
claim is made. `route_index.source_not_discovered` and
`route_index.range_invalid` likewise fail before diagnostics. These failures
are distinct from `route.missing`, which means a fresh, valid index does not
contain the action contract's exact method and path.

Project files are decoded as fatal UTF-8 with BOM bytes preserved for digest
reconstruction. Invalid UTF-8 fails as `file.encoding_invalid` before index
freshness can be trusted.

## Rule Semantics

Revision 1 checks each form-backed action's declared `POST` route. An exact
method and path match passes. A missing pair emits `route.missing` at the
feature contract's route path and includes sorted paths indexed for the same
method. Extra indexed routes are allowed because the feature contract does not
own GET pages, health routes, or unrelated application endpoints.

The rule does not infer that a similar route is the intended action. Repair may
change application source or the action contract, but it must regenerate the
source-bound index and preserve the form contract.

## Trust Boundary

Mensor validates shape, canonical encoding, freshness, and source location. It
does not prove that a producer interpreted a framework correctly. A malicious
or defective producer can still emit incorrect facts about current source.
Producer quality requires its own fixtures and semantic tests.

The compiler never executes an index producer. There is no provider discovery,
package loader, shell command, lifecycle callback, network access, or generic
plugin interface. The maintained Hono and Node indexes are synthetic fixture
artifacts, not framework support claims.

## Limits

- At most 10,000 routes per artifact.
- The existing compiler per-file byte limit applies to the index.
- Indexed source remains subject to discovery file, aggregate byte, depth, and
  per-file limits.
- Only static `GET` and `POST` paths are represented.

Dynamic path evidence, method uncertainty, partial inspection, and external
adapter execution need separate revisions rather than ambiguous empty routes.
