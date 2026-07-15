# ADR-0003: Static HTML Form Facts

- Status: Accepted
- Owner: Maintainer
- Extended by: ADR-0030

## Context

The compiler must connect a form declared by template path and exact id to the
fields present in static HTML. HTML parsing includes tree correction and source
location semantics that should not be recreated with regular expressions or
string scanning.

The parser tree is third-party state and must not become a public compiler or
rule contract.

## Decision

- Use parse5 8.0.1 with source location information enabled.
- Convert parser nodes immediately into private `FormFact` values containing
  id, normalized method, a discriminated literal or `current-document` action,
  named field candidates, and start-tag range.
- Associate controls through either their nearest ancestor form or an explicit
  `form` attribute.
- Exclude disabled controls, buttons, file inputs, and submitter-only input
  types from required-field presence.
- Link an action to exactly one form by contract template path and form id.
- Emit `form.field_missing` when a required top-level schema property has an
  explicit codec binding but no matching named field candidate.
- Preserve the first source range for each unique wire field name and emit one
  `form.field_unexpected` when that name is neither bound nor explicitly
  ignored.
- Preserve method and action attribute ranges. Resolve `current-document`
  through the linked action form contract's explicit `documentPath`, then emit
  separate mismatch diagnostics against the linked action route.
- Reject a `current-document` form as invalid configuration when its action
  form contract omits `documentPath`; never substitute the expected action
  route as evidence of the page URL.
- Preserve normalized control kind, input type, multiplicity, and source range
  so scalar text bindings cannot hide checkbox or repeated-select semantics.
- Treat repeated radio controls with one form and wire name as one mutually
  exclusive scalar field, while mixed or other repeated controls remain
  incompatible with the scalar text decoder.
- Exclude inert `template` content from static form facts. Client-side cloning
  requires a future explicit contract rather than implicit activation.
- Limit every contract and template read to 1 MiB by default through
  `limits.maxFileBytes`.

## Consequences

- HTML tree correction and UTF-16 source ranges come from one proven parser.
- parse5 nodes and parser errors remain compiler-internal.
- The current fact model does not claim complete successful-control semantics
  for named submitters or every future codec family.
- Existing contracts with non-empty literal actions do not need
  `documentPath`; omitted and empty actions do.
- Additional decoder families and unsupported dynamic behavior require
  separate diagnostic slices.

## Reconsider When

- static HTML fixtures prove that full successful-control ownership is needed;
- template adapters provide equivalent normalized form indexes; or
- measured fixture sizes require a different default byte limit.
