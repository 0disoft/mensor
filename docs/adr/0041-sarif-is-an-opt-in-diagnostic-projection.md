# ADR-0041: SARIF Is an Opt-In Diagnostic Projection

- Status: Accepted
- Date: 2026-08-30

## Context

Mensor's deterministic diagnostic JSON carries product-specific facts,
inspection coverage, and repair constraints. Code-scanning systems commonly
consume SARIF, but making SARIF the source of truth would weaken Mensor's own
compatibility and repair contracts.

## Decision

The CLI adds `check --sarif`, and `@0disoft/mensor-cli` exports the pure
`formatDiagnosticReportSarif` function. Both emit SARIF 2.1.0 Plus Errata 01 as
a deterministic projection of an already completed diagnostic report.

Mensor codes map to sorted SARIF rules. Diagnostics map to results with
project-relative artifact URIs, one-based regions, related locations, facts,
and repair metadata. No host path, time, random ID, source snippet, or process
fact is added.

SARIF remains mutually exclusive with Mensor JSON and report revision
selection. Pre-report failures do not fabricate SARIF.

## Consequences

- CI and code-scanning consumers gain a standard format without changing
  compiler analysis.
- DiagnosticReport v1 and Check Output v2 remain normative Mensor contracts.
- Future SARIF enhancements must preserve deterministic output and cannot add
  environment-derived metadata by default.
