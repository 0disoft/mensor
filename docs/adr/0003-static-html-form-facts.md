# ADR-0003: Static HTML Form Facts

- Status: Accepted
- Owner: Maintainer

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
  id, normalized method, action, named field candidates, and start-tag range.
- Associate controls through either their nearest ancestor form or an explicit
  `form` attribute.
- Exclude disabled controls, buttons, file inputs, and submitter-only input
  types from required-field presence.
- Link an action to exactly one form by contract template path and form id.
- Emit `form.field_missing` when a required top-level schema property has an
  explicit codec binding but no matching named field candidate.
- Limit every contract and template read to 1 MiB by default through
  `limits.maxFileBytes`.

## Consequences

- HTML tree correction and UTF-16 source ranges come from one proven parser.
- parse5 nodes and parser errors remain compiler-internal.
- The current fact model does not claim complete successful-control semantics
  for disabled fieldsets, named submitters, or codec compatibility.
- Unexpected controls, form route mismatch, decoder/control mismatch, and
  unsupported dynamic behavior require separate diagnostic slices.

## Reconsider When

- static HTML fixtures prove that full successful-control ownership is needed;
- template adapters provide equivalent normalized form indexes; or
- measured fixture sizes require a different default byte limit.
