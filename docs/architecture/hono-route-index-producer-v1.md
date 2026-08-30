# Hono RouteIndex Producer v1

- Status: Implemented explicit producer
- Authority: ADR-0038
- Output: RouteIndex v1

## Purpose

`mensor index-hono-routes` converts a deliberately narrow Hono source shape
into a canonical, source-bound RouteIndex without importing or executing the
application. It is an explicit CLI operation, not part of `check` or `compile`.

## Inputs

- one project root;
- one or more root-relative JavaScript or TypeScript source paths; and
- one or more JavaScript identifier names used as Hono receivers.

Sources are read as bounded UTF-8 regular files. Absolute, escaping,
non-canonical, oversized, changing, or symbolic-link paths fail closed.

## Supported Syntax

The producer recognizes direct and chained calls whose receiver is explicitly
selected and whose first argument is a string literal or no-substitution
template literal:

```ts
app.get("/tasks", listTasks).post("/tasks", createTask);
```

Only `GET` and `POST` are emitted. Paths must be static absolute paths without
query or fragment syntax. Source ranges cover the receiver method through the
path literal, and digests bind the artifact to the complete source bytes.

## Failure Boundary

Dynamic paths, mounted or composed routers, `on`, `all`, `route`, optional
chains, syntax errors, duplicate method/path pairs, and zero extracted routes
fail before output replacement. These cases are not represented as an empty or
partial successful index.

Receiver names are explicit file-wide syntactic identities, not type-checked
Hono instances. A selected identifier shadowed by unrelated code can still be
misclassified. Keep route registration in dedicated modules and select the
smallest source and receiver set. This preview does not resolve imported route
groups, `basePath`, runtime prefixes, framework extensions, or Node request
branches.

## Trust Boundary

The producer proves canonical shape, current source binding, and conformance to
its narrow syntax. It does not prove runtime registration, middleware order,
mount behavior, authentication, or application semantics. Semantic application
tests remain required. The compiler still consumes only the serialized
RouteIndex and never discovers or launches this producer.
