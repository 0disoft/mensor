# ADR-0036: FormIndex Is a Source-Bound Project Input

Status: Accepted

Date: 2026-08-20

## Context

ADR-0030 established FormIndex as the internal boundary between template
extraction and semantic form rules, but deliberately withheld public parsing and
project ingestion until freshness, trust, and resource behavior were specified.
The built-in static HTML provider has since proven that the index can preserve
existing diagnostics while round-tripping through canonical JSON.

Keeping the completed boundary private leaves external template extractors with
no supported way to provide facts. Adding each extractor to the compiler would
restore parser coupling and eventually invite framework configuration execution.

## Decision

FormIndex v1 becomes a public contract-package artifact and an optional
project-contract input.

The contract package owns the schema, immutable TypeScript values, canonical
parser, and canonical serializer. The project-level `formIndex` path selects one
pre-existing artifact. The compiler verifies every indexed document against its
bounded discovery snapshot before rules consume any fact.

External FormIndex input and the built-in static HTML provider feed the same
semantic translator. Check Output v2 reports `external-form-index` when the
project selected an artifact and retains `static-html-form-index` otherwise.

The feature contract may reference a non-HTML template only behind the external
FormIndex boundary. RuntimeManifest compilation remains static-HTML-only because
FormIndex contains structural facts rather than rendered page bytes.

The compiler does not execute or discover producers. A producer remains an
application-owned tool that writes canonical data through
`serializeFormIndex`.

## Consequences

External adapters can ship independently from Mensor and can advance on their
own package versions. Mensor keeps framework runtimes, parser-specific objects,
credentials, and network access outside its trusted compiler process.

A valid digest proves only that the artifact describes current bytes. It does
not prove that the producer understood those bytes correctly. Producer quality
still requires independent fixtures and semantic tests.

Project contracts gain one additive optional path. Existing projects retain
byte-identical revision-1 reports and the same built-in static HTML behavior.

Non-HTML projects can use `checkProject`, but `compileProject` cannot emit a GET
page until a separate rendered-page artifact is designed and source-bound.

## Rejected Alternatives

Embedding Hono, JSX, Astro, or Svelte extractors in the compiler would couple
rule compatibility to framework parsers and enlarge the source-execution attack
surface.

Loading arbitrary producer packages or commands from project configuration would
turn a data contract into executable plugin authority.

Trusting a canonical file without digest and range rebinding would permit stale
facts to produce a clean report after source changes.
