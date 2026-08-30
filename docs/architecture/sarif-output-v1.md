# SARIF Output v1

- Status: Implemented
- Authority: ADR-0041
- Standard: SARIF 2.1.0 Plus Errata 01

`mensor check --sarif` projects a completed Mensor diagnostic report into one
SARIF 2.1.0 run. It does not replace DiagnosticReport v1 or Check Output v2;
those remain Mensor's normative machine contracts.

The root object uses the OASIS Errata 01 schema URI and `version: "2.1.0"`.
One Mensor diagnostic code becomes one `reportingDescriptor`, sorted by code.
Each diagnostic becomes one result with a stable `ruleIndex`, severity level,
message, project-relative artifact URI, one-based UTF-16 region, related
locations, category, machine facts, and repair instructions.

The projection deliberately omits absolute roots, timestamps, invocation IDs,
process metadata, source snippets, and environment values. Given the same
validated report and formatter version, output bytes are deterministic JSON
with two-space indentation, LF, and one final newline.

`--sarif` is valid only for `check` and is mutually exclusive with `--json`
and `--report-version`. A clean report emits a run with empty rules and
results. A report containing errors still emits SARIF and returns exit status
1. Configuration, filesystem, and internal failures that happen before a
report exists retain the CLI's normal stderr failure and exit status; Mensor
does not invent a successful SARIF invocation or analysis result.

Consumers should use Mensor JSON when they require exact facts-schema or
inspection-coverage compatibility. SARIF is the interoperability projection
for code-scanning systems.
