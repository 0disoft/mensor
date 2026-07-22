# Check Output v2 Inspection Contract

- Status: Implemented in 0.2.0
- Authority: ADR-0034
- Schema: `packages/contract/spec/check-output-v2.schema.json`

## Purpose

Check Output v2 makes Mensor's static inspection boundary machine-readable.
It answers which configured domains ran without pretending to measure runtime
behavior, framework correctness, or application test coverage.

Revision 1 remains the implemented default. Version `0.2.0` implements the
structures below as an explicit opt-in contract.

## Successful Output

```json
{
  "schemaVersion": 2,
  "producer": {
    "name": "mensor",
    "version": "0.2.0"
  },
  "status": "passed",
  "inspection": {
    "filePlacement": {
      "state": "checked",
      "basis": "file-roles"
    },
    "forms": {
      "state": "checked",
      "basis": "static-html-form-index"
    },
    "handlers": {
      "state": "checked",
      "basis": "static-module-facts"
    },
    "moduleBoundaries": {
      "state": "not-configured",
      "basis": "module-graph"
    },
    "ownership": {
      "state": "not-configured",
      "basis": "ownership-rules"
    },
    "routes": {
      "state": "not-configured",
      "basis": "route-index"
    },
    "runtimeSemantics": {
      "state": "out-of-scope",
      "basis": "none"
    }
  },
  "diagnostics": [],
  "summary": {
    "errorCount": 0,
    "warningCount": 0
  }
}
```

Canonical top-level key order is `schemaVersion`, `producer`, `status`,
`inspection`, `diagnostics`, `summary`. Inspection keys use the order shown
above. Every domain object contains `state` followed by `basis`. Unknown keys,
domains, states, and bases are rejected.

## Domain Derivation

| Domain | Basis | `checked` | Other state |
| --- | --- | --- | --- |
| `filePlacement` | `file-roles` | every contracted action was checked against file roles | none; revision 1 requires at least one action |
| `forms` | `static-html-form-index` | every contracted action form was indexed and its form rules ran | none; revision 1 requires at least one action |
| `handlers` | `static-module-facts` | every contracted action handler was parsed and its export rules ran | none; revision 1 requires at least one action |
| `moduleBoundaries` | `module-graph` | at least one project boundary was declared and all boundary rules ran | `not-configured` when no boundaries are declared |
| `ownership` | `ownership-rules` | at least one ownership rule was declared and all ownership rules ran | `not-configured` when no ownership rules are declared |
| `routes` | `route-index` | a configured RouteIndex passed canonical, freshness, and range validation and route rules ran | `not-configured` when `routeIndex` is omitted |
| `runtimeSemantics` | `none` | never | always `out-of-scope` |

`checked` means rule execution completed for all applicable configured subjects.
It does not mean the domain had zero diagnostics. The report's `status`,
`diagnostics`, and `summary` own the verdict.

## Fail-Closed Boundary

There is no `partial`, `unknown`, `skipped`, or `failed` inspection state.
Those labels would let incomplete analysis look like a completed report.

- Invalid project or feature contracts produce a configuration failure.
- A malformed, non-canonical, stale, or out-of-range RouteIndex produces a
  configuration failure.
- Missing handler or form source required by a contract produces a
  configuration failure.
- Unsupported source evidence that has an owned diagnostic remains a checked
  domain with that diagnostic.
- An unexpected parser, filesystem, or compiler failure produces an error
  envelope, not a diagnostic report.

## Error Output

`--report-version 2` also selects a revision-2 error envelope when no diagnostic
report can be constructed:

```json
{
  "schemaVersion": 2,
  "producer": {
    "name": "mensor",
    "version": "0.2.0"
  },
  "status": "error",
  "failure": {
    "kind": "configuration",
    "code": "contract.invalid",
    "message": "Contract file \"mensor.project.jsonc\" is invalid.",
    "file": "mensor.project.jsonc"
  }
}
```

Error envelopes do not include `inspection`. The compiler did not complete the
work required to derive it. Consumers first discriminate `status`; passed and
failed outputs contain inspection, while error outputs contain failure.
Rejected absolute, backslash-delimited, or root-escaping path values are not
copied into optional `failure.file`.

## API and CLI Migration

The CLI surface is:

```text
mensor check [root] [--config <path>] [--json] [--report-version <1|2>]
```

- `--report-version` requires `--json`.
- The default is revision 1.
- Revision 1 output remains byte-identical for the same input and producer
  version.
- Revision 2 is opt-in for both successful and error output.
- Human output does not change in this slice.

The compiler library uses typed overloads so an omitted `reportVersion` retains
the current revision-1 return type and `reportVersion: 2` returns the revision-2
type. The contract package exports explicit `DiagnosticReportV1`,
`DiagnosticReportV2`, `CheckOutputV2`, and parsers for each stable revision.
An unversioned alias must not hide a union from callers that require one exact
wire contract.

## Privacy and Determinism

Inspection contains only closed domain, state, and basis values. It excludes
counts, file paths, source names, snippets, absolute roots, timestamps,
durations, environment values, random identifiers, and producer-specific
messages. It is derived after validated discovery and sorted independently of
filesystem enumeration.

## Implemented Surfaces

1. `@0disoft/mensor-contract` owns revision-2 types, schema, semantic
   validation, and canonical fixtures without changing revision 1.
2. The compiler derives inspection from validated project and feature
   contracts, never from the final diagnostic list.
3. Typed compiler overloads and the CLI `--report-version` option select the
   requested output revision.
4. Revision-2 success and error CLI tests retain exact v1 byte snapshots.
5. Package exports, public API docs, migration notes, package smoke, and
   registry smoke cover both revisions.

## Acceptance Tests

- Revision-1 valid and invalid fixture bytes remain unchanged.
- A project without RouteIndex reports `inspection.routes.state` as
  `not-configured` in revision 2.
- A fresh RouteIndex reports `inspection.routes.state` as `checked`, including
  when `route.missing`
  is emitted.
- A stale RouteIndex fails before any inspection object is emitted.
- Projects without boundaries or ownership rules report `not-configured`.
- Runtime semantics always report `out-of-scope`.
- Inspection state cannot be supplied by project configuration.
- Revision-2 output is byte-identical across absolute roots and discovery
  order.
- CLI usage rejects `--report-version` without `--json` and unknown revisions.
- Package and isolated-consumer smoke cover both report revisions.
