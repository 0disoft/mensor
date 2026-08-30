# FormIndex v1

- Status: Public contract and compiler ingestion implemented
- Authority: ADR-0039
- Schema: `packages/contract/spec/form-index-v1.schema.json`

FormIndex v1 is the only serialized boundary from a template extractor to
Mensor form rules. It contains producer metadata and source-bound documents;
each document records a project-relative path, SHA-256 digest, source kind,
inspection completeness, forms, controls, and UTF-16 source ranges.

Evidence is one of `known`, `absent`, `dynamic`, or `unsupported`. Dynamic and
unsupported reason identifiers are closed by revision 1. Producers cannot add
raw source, expressions, AST nodes, callbacks, runtime objects, host paths,
timestamps, or arbitrary attributes.

Documents are canonicalized by path, forms and controls by range, and JSON by
fixed object-key order with two-space indentation, LF, and one final newline.
Duplicate or case-colliding paths and duplicate ranges fail validation.

Projects opt in with:

```json
{
  "version": 1,
  "sourceRoot": "src",
  "featureContracts": ["src/features/tasks/feature.mensor.jsonc"],
  "fileRoles": [{ "role": "server", "withinFeature": "server" }],
  "formIndex": "mensor.form-index.json"
}
```

Before using the artifact, the compiler requires every indexed source to be a
discovered file, recomputes its digest from current bytes, checks all ranges,
and requires every linked `form.template` document to be present. Extra fresh
documents are allowed. A producer version or name never bypasses these checks.

When `formIndex` is omitted, the compiler constructs the same revision in
memory through its built-in static HTML provider and continues to reject
non-`.html` template paths. The compiler never runs a producer.

Version 0.8.0 adds one separate explicit producer, `mensor index-ts-forms`, for
caller-selected TypeScript or JavaScript tagged templates. It emits this same
artifact and receives no compiler hook or discovery authority. See
`typescript-template-form-index-producer-v1.md` for its deliberately narrow
syntax and incomplete-interpolation behavior.
