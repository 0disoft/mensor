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
The implemented reference consumer is specified in
`docs/architecture/reference-runtime-v1.md`.

## Canonical Form

Pages and actions are sorted by path and id. Object-schema properties,
required names, bindings, and ignored fields are canonicalized. The parser
accepts only the exact two-space, LF-terminated serialization produced by
`serializeRuntimeManifest`.

Route and id collisions fail closed. Multiple actions may share one static GET
page only when its path and HTML bytes agree.

## Trust Boundary

Compilation reads through the same bounded verified source cache as static
checking. It does not rescan the source tree, execute application modules, load
framework configuration, or discover handlers. Runtime authentication, CSRF,
session, persistence, and deployment decisions remain host-owned.
