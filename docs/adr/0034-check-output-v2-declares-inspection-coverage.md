# ADR-0034: Check Output v2 Declares Inspection Coverage

- Status: Accepted
- Date: 2026-07-22

## Context

`mensor check --json` revision 1 reports diagnostics and a derived pass or fail
status. It does not say which optional evidence and rules were active. A project
without `ProjectContract.routeIndex` can therefore return zero diagnostics even
though no application route declarations were inspected. The same ambiguity
exists when module boundaries or ownership rules are not configured.

The Hermes desktop onboarding run produced two checker-clean projects without
RouteIndex. One of them also violated an application requirement that its own
tests had redefined. These results do not make Mensor responsible for runtime
semantics, but they show that a bare `status: "passed"` invites a broader claim
than the checker owns.

Adding a `coverage` field directly to DiagnosticReport v1 is not compatible.
The v1 schema rejects unknown properties, canonical fixtures compare exact
bytes, and existing consumers may validate the immutable schema. Emitting a
warning when optional evidence is absent would also be wrong: absence is a
scope fact, not a contract violation or repair instruction.

## Decision

Mensor will add an opt-in Check Output v2 contract with a required
`inspection` object on successful diagnostic reports.

- DiagnosticReport v1 and its default CLI output remain byte-compatible.
- `mensor check --json --report-version 2` selects Check Output v2.
- `--report-version` is valid only with `--json` and accepts the closed values
  `1` and `2`.
- Omitting `--report-version` continues to emit revision 1.
- Library callers select revision 2 explicitly through a typed
  `reportVersion: 2` option; the existing call shape retains its revision-1
  result type.
- Check Output v2 covers both successful diagnostic reports and pre-report
  CLI failure envelopes so one invocation has one selected envelope revision.
- Human output remains unchanged until a separate user-facing format decision
  is justified.

The JSON field is named `inspection`, not `coverage`. It records which Mensor
inspection domains ran and which remained absent or outside the product. It is
not test coverage, a percentage, a confidence score, or a correctness proof.

## Inspection Contract

Revision 2 has seven fixed domains:

1. `filePlacement`
2. `forms`
3. `handlers`
4. `moduleBoundaries`
5. `ownership`
6. `routes`
7. `runtimeSemantics`

Every domain contains a closed `state` and `basis`. States are:

- `checked`: all applicable rules for the configured, supported evidence ran;
- `not-configured`: the optional contract or evidence source was absent;
- `out-of-scope`: Mensor deliberately does not inspect that domain.

`checked` is independent of the diagnostic verdict. A checked domain may have
errors. If configured evidence is malformed, stale, incomplete, or unsupported
in a way that prevents its rules from running, the compiler fails before
creating a diagnostic report. It must not downgrade that condition to
`not-configured` or a green partial report.

The compiler derives inspection state from validated contracts and normalized
facts. Users cannot declare, override, suppress, or promote it. Inspection
entries contain no paths, source snippets, counts, timestamps, durations,
environment values, or free-form messages.

The normative shape and derivation table live in
`docs/architecture/check-output-v2.md`.

## Compatibility

Revision 1 remains immutable and the default for existing automation. Revision
2 uses a new machine-readable schema and new exported TypeScript types. Parsers
must discriminate on `schemaVersion` and `status`, not on property presence.

Implementing the accepted design is an additive public capability and requires
a minor package release. It must not silently change the default report version
in that release. Making revision 2 the default, deprecating revision 1, or
removing revision 1 requires a separate compatibility decision and migration
evidence.

## Consequences

- Agents and CI can distinguish a clean configured check from an unconfigured
  inspection domain without scraping prose.
- Runtime semantics remain visibly outside Mensor instead of looking
  accidentally green.
- Optional evidence remains optional; missing RouteIndex is not converted into
  a warning or error.
- The compiler must derive and validate a second deterministic report shape.
- Package, CLI, fixture, parser, schema, and documentation tests must exercise
  both revisions until revision 1 is deliberately retired.

## Alternatives Rejected

### Add an optional field to DiagnosticReport v1

Strict v1 consumers and canonical snapshots reject or change bytes when the
producer starts emitting it. A schema revision must mean something.

### Emit warnings for missing optional checks

Warnings are diagnostics and invite repair. A missing optional RouteIndex is an
inspection boundary, not proof that the project contract is broken.

### Use percentages or confidence scores

Mensor has no honest denominator for arbitrary application behavior. A number
would mix configured static rules, unsupported framework semantics, and runtime
behavior into false precision.

### Treat every absent domain as `out-of-scope`

That erases the difference between an optional capability the project did not
configure and behavior Mensor never intends to execute or certify.

### Change `mensor check --json` to revision 2 immediately

That would break the public revision-1 output contract without an opt-in
migration window.

## Implementation Record

Version `0.2.0` implements synchronized v2 types, schema, validator, compiler
derivation, CLI option, success and failure fixtures, package exports,
migration documentation, and compatibility tests. No domain reports `checked`
merely because its implementation returned no diagnostics.
