# RuntimeManifest v1

- Status: Active

RuntimeManifest v1 is the serializable boundary between a clean compiler check
and a runtime consumer. `compileProject` emits no manifest when diagnostics or
compiler failures remain.

## Contents

- `pages`: exact GET routes with compiled static HTML;
- `actions`: exact POST routes, stable handler ids, and form input contracts;
- producer identity and manifest version.

The manifest contains no project root, source path, template path, export name,
AST node, parser object, filesystem handle, timestamp, or random identifier.
Handlers remain executable host values and are injected separately by id.

## Canonical Form

Pages and actions are sorted by path and id. Object-schema properties,
required names, bindings, and ignored fields are canonicalized. The parser
accepts only the exact two-space, LF-terminated serialization produced by
`serializeRuntimeManifest`.

Route and id collisions fail closed. Multiple actions may share one static GET
page only when its path and HTML bytes agree.

## Reference Consumer

`examples/runtime-manifest-consumer` is the first source-free consumer of this
artifact. It is an executable boundary proof, not a published package or a
production framework.

The consumer accepts a validated RuntimeManifest value, a host-owned handler
registry, optional host services, and bounded request limits. It maps exact
static GET pages and POST actions to standard `Request` and `Response` values.
POST processing reads the body through a byte limit, accepts only URL-encoded
UTF-8 form data, rejects unknown fields and duplicate scalar values, applies all
current decoder families, checks schema constraints, and invokes the selected
handler by `handlerId`.

Ignored form fields remain separate from decoded action input. This allows a
host to verify values such as CSRF tokens without treating them as application
schema properties. Handler exceptions are contained behind a generic response
and may be reported through a host callback without returning exception text to
the client.

The example intentionally does not own authentication, authorization, CSRF
policy, sessions, persistence, transactions, rate limiting, response security
policy, deployment, or observability. A future runtime package requires a real
consumer and a separate public-API decision; the example alone creates no
compatibility promise.

## Trust Boundary

Compilation reads through the same bounded verified source cache as static
checking. It does not rescan the source tree, execute application modules, load
framework configuration, or discover handlers. Runtime authentication, CSRF,
session, persistence, and deployment decisions remain host-owned.

A deployment should serialize the manifest at build time and validate that
serialized artifact with `parseRuntimeManifest` when loading it. It should not
run `compileProject`, inspect source files, or resolve application exports in a
request-serving process.
