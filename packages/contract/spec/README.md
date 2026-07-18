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

## Complete Authoring Example

The following pair is the smallest complete form-backed contract shape. Field
names are exact; aliases such as `schemaVersion`, `features`, `formRef`,
`templatePath`, `formId`, `exportName`, or `expectedRole` are not accepted.

Project contract at `mensor.project.jsonc`:

```json
{
  "version": 1,
  "sourceRoot": "src",
  "featureContracts": [
    "src/features/guestbook/feature.mensor.jsonc"
  ],
  "fileRoles": [
    {
      "role": "server",
      "withinFeature": "server"
    },
    {
      "role": "route",
      "withinFeature": "routes"
    },
    {
      "role": "view",
      "withinFeature": "views"
    }
  ]
}
```

Feature contract at `src/features/guestbook/feature.mensor.jsonc`:

```json
{
  "version": 1,
  "feature": {
    "id": "guestbook"
  },
  "actions": [
    {
      "id": "guestbook.create",
      "route": {
        "method": "POST",
        "path": "/guestbook"
      },
      "form": {
        "template": "views/index.html",
        "id": "create-entry",
        "documentPath": "/guestbook"
      },
      "handler": {
        "file": "server/create-entry.ts",
        "export": "createEntry",
        "role": "server"
      },
      "input": {
        "schema": {
          "kind": "object",
          "properties": {
            "author": {
              "kind": "string",
              "minLength": 1,
              "maxLength": 80
            }
          },
          "required": ["author"]
        },
        "formCodec": {
          "encoding": "urlencoded",
          "unknownFields": "reject",
          "bindings": [
            {
              "name": "author",
              "path": ["author"],
              "decode": {
                "kind": "text",
                "trim": true,
                "empty": "reject"
              }
            }
          ]
        }
      }
    }
  ]
}
```

`sourceRoot` and each `featureContracts` entry are project-root-relative.
`fileRoles[].withinFeature`, action template paths, and handler files are
relative to the directory containing that feature contract. The optional
`$schema` property is only an editor hint; its path depends on the consumer's
installation layout and is not required by Mensor.

The feature contract declares only the POST action. The application may serve
the GET page through its own framework or server; revision 1 has no GET page
contract.

## Placement Slice

`ProjectContract.fileRoles` maps role names to non-overlapping directories
relative to each feature contract. An action handler declares its file, export,
and expected role. The compiler compares the handler path with those declared
directories and emits `file.role_mismatch` when they disagree.

The first revision intentionally does not define glob precedence. Directory
slots keep classification deterministic while real projects prove whether a
more expressive matcher is needed.

## Form Slice

An action links to static HTML through its feature-relative `.html` template
path and exact form id. Contract validation rejects other extensions before the
compiler can parse TypeScript or another source kind as HTML. The compiler uses
the action schema and form codec to identify
required wire fields. When a required binding has no named field candidate in
the linked form, the diagnostic report contains `form.field_missing`.
When a named field candidate is absent from both codec bindings and explicit
ignored fields, the report contains one `form.field_unexpected` diagnostic for
that wire field name. Repeated controls with the same name share one wire field
diagnostic.

The compiler compares the normalized HTML method and resolved form action with
the linked action route. A non-empty literal action is used directly. An
omitted or empty action is preserved as `current-document` and resolves through
the action form contract's explicit `documentPath`; the compiler rejects that
case as invalid configuration when `documentPath` is absent. Method and path drift use separate
`form.method_mismatch` and `form.action_mismatch` diagnostics so repair agents
do not have to infer which route fact is wrong. Action mismatch facts identify
whether the observed path came from a literal or the current document.

The v1 codec currently owns only scalar text decoding. Checkbox controls and
`select[multiple]` have missing-value or repeated-value semantics that cannot be
silently coerced through that decoder, so the compiler emits
`form.control_codec_mismatch` until a matching serializable codec exists.

Named file inputs, named submitters, and submitter-specific method or action
overrides are represented as unsupported control facts and emit
`form.control_unsupported`. Handler source is parsed without execution; a
missing explicit runtime value export emits `handler.export_missing`. Type-only
and ambient declarations do not satisfy a handler contract.

`ProjectContract.boundaries` declares project-owned role policies. `direct`
checks only edges originating in a configured role; `transitive` follows the
normalized local module graph. ESM and literal CommonJS edges are included,
as are type-only imports. Violations emit `module.boundary_violation`, while
computed runtime imports emit
`module.dynamic_import_unsupported` when reached by an active boundary.

Scalar text bindings own exactly one schema property and one successful wire
value producer. Duplicate controls, checkbox or repeated-value shapes, and
binding or ignored-field ownership conflicts fail closed. Controls disabled by
a fieldset are excluded, except for descendants of its first legend.

Diagnostic reports are semantically validated after schema validation. Status,
summary counts, and ordered source ranges must agree with their diagnostics.

`ProjectContract.ownershipRules` maps explicit filename suffixes to a test or
i18n slot inside each feature. The compiler emits `file.ownership_mismatch` for
files in the wrong slot and for matching files with no declared feature owner.

HTML parser nodes are not contract values. Source ranges, field names, method,
and action are normalized compiler facts before any rule runs.

Version `1` is an internal design revision until the first preview release. It
may change while fixtures are still being reviewed.
