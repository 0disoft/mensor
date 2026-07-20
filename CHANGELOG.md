# Changelog

All notable changes to Mensor are documented in this file.

## [0.1.0] - 2026-07-19

### Added

- Deterministic contract checking for static HTML forms and TypeScript or
  JavaScript handler, ownership, placement, and import boundaries.
- Canonical JSON diagnostics with stable codes, source locations, facts,
  related locations, and repair constraints.
- Public RouteIndex v1 schema and parser for source-bound static GET and POST
  route facts.
- Isolated package-consumer, application-semantic, mutation, adoption, and
  compiler-performance validation.
- Public Apache-2.0 packages under the `@0disoft/mensor-*` scope and a
  diagnostic-first `mensor check` CLI.

### Security

- The compiler does not execute project source or configuration and does not
  access the network.
- Canonical reports exclude absolute paths, source snippets, timestamps,
  environment values, and random identifiers.
- Post-bootstrap releases use an npm stage-only trusted publisher without a
  long-lived npm token.
- The private Docker evaluation runner rejects workspace paths containing the
  `--mount` option delimiter, classifies lifecycle failures by typed stage, and
  invalidates trial evidence when container cleanup fails.

### Compatibility

- This is the first public preview. Public diagnostic and schema compatibility
  begins with this release; no compatibility is claimed for earlier private
  workspace package names or unpublished artifacts.
