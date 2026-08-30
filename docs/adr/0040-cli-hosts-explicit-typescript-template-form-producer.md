# ADR-0040: CLI Hosts an Explicit TypeScript Template Form Producer

- Status: Accepted
- Date: 2026-08-30

## Context

FormIndex v1 made template facts a public serialized input, but version 0.7.0
provided only the built-in static `.html` provider. A first non-HTML producer
is needed to prove that the boundary works without opening compiler plugins or
executing application code.

## Decision

The CLI adds `index-ts-forms`. The command accepts explicit root-relative
`--source` paths and explicit identifier `--tag` values, parses TypeScript or
JavaScript without loading it, and atomically writes canonical FormIndex v1.

Only no-substitution tagged templates produce static forms. Any interpolation
marks the source document incomplete. Every explicit source must contain a
selected template. Tag matching remains syntactic; the producer does not use a
type checker or resolve the tag's binding.

The compiler exports its pure static HTML document extractor so the producer
and built-in provider share HTML semantics. This helper accepts source text and
returns serializable facts; it has no filesystem, network, or execution
authority.

## Consequences

- A TypeScript template project can generate and then opt into FormIndex v1.
- `check` and `compile` still never launch producers.
- Interpolation, alias resolution, framework transforms, and arbitrary plugin
  lifecycles remain outside this producer.
- A future syntax producer must justify its own bounded command and emit the
  existing public artifact rather than extend compiler authority.
