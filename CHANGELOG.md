# Changelog

All notable changes to Mensor are documented in this file.

## [0.2.0] - 2026-07-22

### Added

- Opt-in Check Output v2 with a required machine-readable `inspection` object
  for file placement, forms, handlers, module boundaries, ownership, routes,
  and deliberately excluded runtime semantics.
- Public `DiagnosticReportV1`, `DiagnosticReportV2`, `CheckOutputV2`,
  `parseDiagnosticReportV2`, and `parseCheckOutputV2` contract surfaces.
- Typed compiler `reportVersion: 2` overloads and CLI
  `--report-version <1|2>` selection for JSON output.

### Compatibility

- `mensor check --json` and compiler calls that omit `reportVersion` retain
  revision-1 output and return types.
- Revision 2 is additive and opt-in. It uses revision-2 success, diagnostic,
  and pre-report error envelopes without changing exit statuses.
- Invalid, stale, or incomplete evidence still fails before an `inspection`
  object can be emitted.

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

### Changed

- TypeScript syntax diagnostics now isolate the pinned parser fast path behind
  an official Compiler API fallback for compatible TS6 runtime changes.
- Release packing accepts the documented pnpm argument separator as forwarded
  by pnpm 11.
- The one-time local npm bootstrap explicitly disables cloud-only provenance;
  later trusted-publisher releases generate provenance through GitHub OIDC.

### Compatibility

- This is the first public preview. Public diagnostic and schema compatibility
  begins with this release; no compatibility is claimed for earlier private
  workspace package names or unpublished artifacts.
