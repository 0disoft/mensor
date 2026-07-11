# Product Specification

- Status: Proposed
- Owner: Maintainer

## Product Contract

Mensor checks declared project contracts against facts extracted from a local
source tree. Contract failures are normal results, not internal exceptions.
The tool is deterministic, offline, and safe to run against an untrusted pull
request within the documented resource limits.

## MVP Input Boundary

- TypeScript and JavaScript source
- Static `.html` files
- One root-relative `mensor.project.jsonc` contract
- Static GET page and POST action declarations
- `application/x-www-form-urlencoded` form semantics
- A Mensor-owned, serializable schema subset
- File-level feature ownership and architectural roles

The compiler must not import source modules, execute configuration, spawn a
framework CLI, install packages, or access the network.

## Contract Authoring Rule

Source facts that can be extracted reliably must not be repeated in the project
contract. HTML owns form method, action, controls, and source positions.
TypeScript owns imports and exported symbols. The project contract owns facts
that source alone cannot prove, including feature identity, architectural role,
form-to-action linkage, field decoding, and enforced boundaries.

The current machine-readable contract is defined by
`packages/contract/spec/project-contract-v1.schema.json`,
`packages/contract/spec/feature-contract-v1.schema.json`, and
`packages/contract/spec/diagnostic-report-v1.schema.json`. The valid and invalid reference inputs
live under `fixtures/`.

## First Vertical Slice

The first implementation proves the project-structure pipeline before template
parsing is introduced:

```text
project contract
  -> deterministic discovery
  -> feature contract
  -> action handler linkage
  -> file-role classification
  -> file.role_mismatch diagnostic
  -> deterministic diagnostic report
```

The project contract declares non-overlapping feature-relative directories for
architectural roles. An action handler declares its source file, export name,
and expected role. The compiler reports a placement error when the discovered
file belongs to another role or no role. It parses the handler source without
executing it and reports a missing explicit named export. Wildcard re-exports
fail closed because their target cannot be proven without module resolution.

The second vertical slice connects one static HTML form to one action contract.
It extracts form identity, method, action, source range, and named field
candidates, then detects:

- a required action field has no matching form control;
- a named form control is neither bound nor explicitly ignored;
- form method does not match the linked action method; and
- form action does not match the linked action path; and
- checkbox or repeated select semantics are connected to the scalar text
  decoder.

Additional decoder families remain separate slices and are supported only when
their serializable schema and form semantics are defined.

For form comparison, the compiler normalizes an HTML form method to ASCII uppercase
and treats an omitted method as `GET`. The first schema accepts only a static,
root-relative action path without a query or fragment. URL resolution, route
parameters, named submitters, and per-button method or action overrides are
unsupported and must produce an explicit diagnostic when encountered.
Named file inputs are also explicit unsupported controls because multipart
transport is outside the MVP.

## MVP Rule Families

After the placement slice is stable, the same normalized-fact pipeline may add:

- browser-reachable imports of server, database, or internal modules;
- direct route imports of infrastructure when that policy is enabled; and
- test or translation files outside their declared feature owner.

Import and ownership policies are configurable project contracts, not universal
opinions baked into the compiler.

## Form Codec

HTML form input is a string multimap, not typed JSON. The contract must state
how a raw field becomes an action value. The first schema revision supports an
object containing string fields decoded by the text codec. Base-10 integer,
finite decimal, checkbox, enum, and repeated scalar codecs are planned
extensions and become supported only when their schemas and fixtures land.

The codec distinguishes a missing field from an empty string, rejects duplicate
scalar values, and rejects unknown fields unless they are explicitly listed as
host-consumed fields such as a CSRF token. Bracketed names are exact wire names;
nested object paths require an explicit binding.

Files, arbitrary transforms, recursive schemas, unions, regular-expression
refinements, and multipart bodies are outside the MVP.

## Diagnostic Contract

Each diagnostic contains:

- stable semantic `code`, `severity`, and `category`;
- project-relative POSIX `file` and a 0-based UTF-16 `range`;
- a human-readable `message`;
- code-specific serializable `facts`;
- zero or more `related` source locations; and
- a `repair` object with a strategy, hint, and constraints that must be
  preserved.

Diagnostic codes use brand-neutral semantic names such as
`form.field_missing`. Numeric or brand-prefixed codes are deferred until real
fixtures prove that they add value. A published code is never reused for a
different meaning.

## Deterministic Output

For identical source bytes, contract bytes, and tool version, JSON output must
be byte-identical. Canonical output uses relative `/` paths, LF newlines, stable
object and list ordering, two-space indentation, and one final newline.

Canonical output excludes absolute paths, timestamps, durations, random IDs,
hostnames, usernames, environment values, progress messages, and source
snippets. Debug information belongs on an explicitly non-canonical stderr path.

## MVP Acceptance

1. A valid placement fixture returns no error diagnostic.
2. A misplaced handler emits exactly the expected `file.role_mismatch` diagnostic.
3. Running a fixture from different absolute roots produces identical JSON.
4. Directory entries are sorted before recursive discovery.
5. A source module with an import-time sentinel is never executed.
6. Discovery fails closed at its configured file-count limit.
7. Contract and template reads fail closed at the configured byte limit.
8. A missing required form field emits the exact canonical
   `form.field_missing` diagnostic from different absolute roots.
9. An unknown named form field emits one exact canonical
   `form.field_unexpected` diagnostic per wire field name, even when multiple
   controls share that name.
10. A repair benchmark requires both a passing check and an unchanged semantic
   application test; contract weakening is a failed repair.
11. Form method and action mismatches emit separate exact diagnostics at the
    corresponding HTML attributes with the declared route as a related location.
12. A checkbox or `select[multiple]` bound to the scalar text decoder emits
    `form.control_codec_mismatch` at the incompatible control.
13. `mensor check --json` writes one JSON document and one LF to stdout and
    maps clean, diagnostic, configuration, and internal outcomes to exit codes
    `0`, `1`, `2`, and `3` without stdout contamination.
14. Named file inputs, named submitters, and submitter route overrides emit
    `form.control_unsupported` instead of disappearing from analysis.
15. A declared handler export missing from its source emits
    `handler.export_missing` without importing or executing that module.

## Deferred Decisions

- Runtime manifest and reference runtime: add only if a real consumer needs a
  compiled artifact beyond diagnostics.
- Dynamic template adapters: design only after the static HTML fact model is
  stable.
- IDE, SARIF, watch mode, caching, and cloud services: post-MVP integrations.
- Public diagnostic compatibility: begins with the first published preview,
  not with private pre-implementation drafts.
