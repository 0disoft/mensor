# Contract Specifications

- Status: Active

This directory owns Mensor's machine-readable contract surfaces. Schemas use
JSON Schema Draft 2020-12. Authoring files may use JSONC syntax, but comments are
removed before schema validation and never become part of the parsed data
model.

## Validation Layers

### Explicit FormIndex Evidence

`ProjectContract.formIndexEvidence` optionally names 1-16 unique root-relative
files used only as FormIndex freshness evidence. It requires `formIndex`.
Every listed file must have a complete index document with no forms. Files
outside `sourceRoot` are snapshotted under the same file-count, byte, depth,
identity and symlink constraints, but do not become application sources for
form linkage, handler resolution, route checks or module boundaries. Omit the
field to retain the original discovered-source-only behavior.

### Layer Order

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
- `form-index-v1.schema.json`: canonical source-bound template form facts
- `route-index-v1.schema.json`: canonical source-bound application route facts
- `runtime-manifest-v1.schema.json`: source-free GET page and POST action runtime artifact
- `check-output-v2.schema.json`: opt-in reports and pre-report error envelopes
  with compiler-derived inspection states

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

Path bases are explicit and do not inherit from `sourceRoot`:

| Field | Path base |
| --- | --- |
| `sourceRoot` | project root |
| `featureContracts[]` | project root |
| `formIndex` | project root |
| `routeIndex` | project root |
| `fileRoles[].withinFeature` | directory containing the feature contract |
| action `form.template` | directory containing the feature contract |
| action `handler.file` | directory containing the feature contract |

Therefore, `featureContracts` must contain
`src/features/guestbook/feature.mensor.jsonc`, not
`features/guestbook/feature.mensor.jsonc`, when `sourceRoot` is `src`. The
optional `$schema` property is only an editor hint; its path depends on the
consumer's installation layout and is not required by Mensor.

After every feature contract parses independently, the compiler requires
project-wide unique feature ids and exactly one feature contract per root
directory. Nested roots remain valid and use longest-root ownership.

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

An action links to a template through its feature-relative path and exact form
id. Without project `formIndex`, the compiler requires `.html` and uses its
built-in static HTML provider. With `formIndex`, it verifies the canonical
artifact against discovered source bytes and uses its indexed facts. The compiler uses
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

Feature contract v1 supports these schema and decoder pairs:

| Schema | Decoder | Wire shape |
| --- | --- | --- |
| `string` | `text` | one scalar control or one radio group |
| `integer` | `integer-base10` | one scalar control or one radio group |
| `number` | `decimal` | one scalar control or one radio group |
| `boolean` | `checkbox` | one checkbox |
| `enum` | `enum` | one scalar control or one radio group |
| `array` | `repeat` | one or more values, including `select[multiple]` |

Checkbox decoders explicitly declare `trueValues` and the boolean produced when
the field is missing. Repeat decoders contain one scalar item decoder. Enum
decoder values must match the enum schema in the same canonical order.

Named file inputs, named submitters, and submitter-specific method or action
overrides are represented as unsupported control facts and emit
`form.control_unsupported`. Handler source is parsed without execution; a
missing explicit runtime value export emits `handler.export_missing`. Type-only
and ambient declarations do not satisfy a handler contract.

### Enum Authoring

Use the following complete action `input` object for one required attendance
radio group. Its controls share `name="attendance"` and use the literal values
`yes`, `no`, and `maybe`.

```json
{
  "schema": {
    "kind": "object",
    "properties": {
      "attendance": {
        "kind": "enum",
        "values": ["yes", "no", "maybe"]
      }
    },
    "required": ["attendance"]
  },
  "formCodec": {
    "encoding": "urlencoded",
    "unknownFields": "reject",
    "bindings": [
      {
        "name": "attendance",
        "path": ["attendance"],
        "decode": {
          "kind": "enum",
          "values": ["yes", "no", "maybe"]
        }
      }
    ]
  }
}
```

An enum decoder accepts exactly `kind` and `values`. Its values must match the
enum schema in the same order. Do not copy `trim` or `empty` from a text decoder:
neither property is accepted by an enum decoder. For example,
`{"kind":"enum","values":["yes","no","maybe"],"trim":true}` is invalid,
as is adding `"empty":"reject"`. Unknown decoder properties cause
`contract.invalid` before the compiler can emit an inspection report.

These are the existing revision-1 rules, not newly supported decoder options.

#### Check, Correct, And Recheck

Run these commands from your application's project root with its existing
project and feature contracts. The snippets below edit only the attendance
binding's `decode` object from the complete example above; they are not complete
feature contracts.

1. **Identify the configuration error.** An enum decoder copied from a text
   binding might incorrectly contain these properties:

   ```json
   { "kind": "enum", "values": ["yes", "no", "maybe"], "trim": true, "empty": "reject" }
   ```

   Run `pnpm exec mensor check .`. It exits `2` with `contract.invalid`,
   naming the invalid feature contract. In the unpublished `0.10.1` candidate,
   an otherwise-valid enum decoder also produces this hint when it is the
   first binding of the first action:

   ```text
     hint: /actions/0/input/formCodec/bindings/0/decode: enum decoders accept only "kind" and "values"; "trim" and "empty" are text-decoder options.
   ```

   The numbers are zero-based array indexes. Follow this path in the feature
   contract named on the error line. On `0.10.0`, use
   `pnpm exec mensor check . --json` and inspect `failure.file` and
   `failure.issues[].instancePath` instead. JSON includes errors from other
   decoder candidates too; not every candidate error describes your decoder.

2. **Remove only the unsupported properties.** Replace that decoder with:

   ```json
   { "kind": "enum", "values": ["yes", "no", "maybe"] }
   ```

   Keep the enum schema, its value order, required field and form controls
   unchanged. Do not switch to a text decoder or weaken the contract just to
   silence the error. If your application needs whitespace normalization,
   handle that as a separate runtime design decision, not an enum option.

3. **Recheck the complete project.** Run
   `pnpm exec mensor check . --json --report-version 2`. Correcting this decoder
   removes this configuration failure; it does not guarantee a passing project.
   Exit `0` means the configured checks passed. Exit `1` means contract
   diagnostics remain; inspect `diagnostics`. Exit `2` means a configuration
   failure remains; inspect `failure`. A completed revision-2 report also lists
   `inspection` states so you can see which checks were configured.

Run the application's own tests separately. A passing Mensor report does not
prove request handling, persistence or other runtime behavior. Human hints are
for people; automation should continue consuming the JSON envelope.

`ProjectContract.boundaries` declares project-owned role policies. `direct`
checks only edges originating in a configured role; `transitive` follows the
normalized local module graph. ESM and literal CommonJS edges are included,
as are type-only imports. Violations emit `module.boundary_violation`, while
computed runtime imports emit
`module.dynamic_import_unsupported` when reached by an active boundary.

Scalar bindings own exactly one schema property and one successful wire value
producer, except that repeated radio controls form one mutually exclusive
scalar field. Duplicate controls and repeated-value shapes require a `repeat`
decoder; checkbox shapes require a `checkbox` decoder. Binding or ignored-field
ownership conflicts fail closed. Controls disabled by a fieldset are excluded,
except for descendants of its first legend.

Feature parsing also rejects duplicate action ids, required names that are not
declared properties, inverted string length bounds, and schema properties that
do not have an explicit form binding. These are contract contradictions rather
than source diagnostics and fail before compiler rules run.

Diagnostic reports are semantically validated after schema validation. Status,
summary counts, and ordered source ranges must agree with their diagnostics.
`DiagnosticReport` and `parseDiagnosticReport` remain revision-1 compatibility
names. Revision-2 consumers use `DiagnosticReportV2`, `CheckOutputV2`,
`parseDiagnosticReportV2`, or `parseCheckOutputV2`. Check Output v2 adds a
closed `inspection` declaration but reuses the revision-1 diagnostic
definitions rather than maintaining a second diagnostic catalog.

`ProjectContract.ownershipRules` maps explicit filename suffixes to a test or
i18n slot inside each feature. The compiler emits `file.ownership_mismatch` for
files in the wrong slot and for matching files with no declared feature owner.

## RouteIndex Slice

`ProjectContract.routeIndex` optionally selects a project-root-relative strict
JSON RouteIndex. The artifact records static `GET` and `POST` method/path pairs
with their source file, SHA-256 digest, and UTF-16 range. It is parsed and
canonicalized by `@0disoft/mensor-contract`; the compiler verifies freshness against
discovered source before using it.

A stale digest, missing source, or out-of-bounds range is a configuration
failure. A fresh index that lacks an action's exact `POST` route emits
`route.missing`. Extra routes are allowed. The compiler never executes or
loads an index producer, and producer identity is not a trust grant.

When `routeIndex` is omitted, route facts are unavailable and Mensor does not
run `route.missing`. A zero-diagnostic report must not be interpreted as route
coverage in that configuration.

HTML parser nodes are not contract values. Source ranges, field names, method,
and action are normalized compiler facts before any rule runs.

Version `1` project, feature, diagnostic, and RouteIndex contracts became
public preview surfaces in `0.1.0`. FormIndex v1 became public in `0.7.0`.
Check Output v2 is additive and does not change those revision-1 schemas.
