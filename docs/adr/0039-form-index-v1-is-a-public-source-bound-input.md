# ADR-0039: FormIndex v1 Is a Public Source-Bound Input

- Status: Accepted
- Owner: Maintainer

## Context

ADR-0030 established a private serializable boundary between template
extraction and semantic form rules. The built-in static HTML provider has since
proved canonical round trips, source digest and range validation, unchanged
diagnostics, and separately measured extraction cost. Keeping the artifact
private would force every future template producer into compiler internals.

## Decision

Mensor publishes FormIndex v1 from `@0disoft/mensor-contract` and accepts one
optional project-root-relative `ProjectContract.formIndex` artifact.

- The contract package owns its types, JSON Schema, parser, serializer,
  canonical ordering, and semantic validation.
- The compiler verifies every indexed document against discovered source bytes
  and rejects stale digests, missing source, invalid ranges, and missing linked
  template documents before semantic rules run.
- A configured FormIndex may bind non-HTML template paths. Without one, the
  built-in provider remains restricted to static `.html` documents.
- Producer identity is descriptive metadata, not execution authority or a
  trust grant.
- The compiler does not discover, load, import, execute, or spawn producers.
  Generic plugins and renderer execution remain forbidden.

## Consequences

External tools can produce one stable artifact without receiving in-process
compiler authority. Dynamic and unsupported evidence remains explicit and
causes linked checks to fail closed. Existing static HTML projects need no
configuration change and retain their previous diagnostic bytes.

This decision publishes the artifact and its ingestion boundary. It does not
claim compatibility with a template language until a separate explicit
producer exists and its supported syntax is documented.

ADR-0040 adds the first such bounded producer for caller-selected TypeScript
tagged templates without changing this compiler authority boundary.
