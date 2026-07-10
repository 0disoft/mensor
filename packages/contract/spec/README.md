# Contract Specifications

- Status: Proposed

This directory owns Mensor's machine-readable contract surfaces. Schemas use
JSON Schema Draft 2020-12. Authoring files may use JSONC syntax, but comments are
removed before schema validation and never become part of the parsed data
model.

## Validation Layers

1. Text parsing rejects malformed JSONC and duplicate object keys.
2. Schema validation rejects unknown keys, invalid types, and unsupported
   contract versions.
3. Semantic validation resolves paths and checks cross-field rules that JSON
   Schema cannot express.
4. Compiler rules compare validated contracts with normalized source facts.

Schemas describe accepted data; `default` annotations do not inject values.
The MVP schemas therefore avoid implicit defaults. Every behavior-affecting
value is explicit in the authoring contract.

## Files

- `project-contract-v1.schema.json`: project root and feature-contract inputs
- `feature-contract-v1.schema.json`: one feature and its form-backed actions
- `diagnostic-report-v1.schema.json`: canonical check output

## Placement Slice

`ProjectContract.fileRoles` maps role names to non-overlapping directories
relative to each feature contract. An action handler declares its file, export,
and expected role. The compiler compares the handler path with those declared
directories and emits `file.role_mismatch` when they disagree.

The first revision intentionally does not define glob precedence. Directory
slots keep classification deterministic while real projects prove whether a
more expressive matcher is needed.

## Form Slice

An action links to static HTML through its feature-relative template path and
exact form id. The compiler uses the action schema and form codec to identify
required wire fields. When a required binding has no named field candidate in
the linked form, the diagnostic report contains `form.field_missing`.

HTML parser nodes are not contract values. Source ranges, field names, method,
and action are normalized compiler facts before any rule runs.

Version `1` is an internal design revision until the first preview release. It
may change while fixtures are still being reviewed.
