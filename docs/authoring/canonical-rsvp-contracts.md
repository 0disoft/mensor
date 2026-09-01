# Canonical RSVP Contracts

Use the maintained [project contract](rsvp/mensor.project.jsonc) and
[feature contract](rsvp/feature.mensor.jsonc) as the smallest complete
form-backed authoring example. Repository tests parse these files through the
public `@0disoft/mensor-contract` API, so documentation drift fails validation.

The project contract owns source discovery and architectural file roles. The
feature contract owns the action id, nested route, form identity, handler,
Mensor schema IR, and explicit form codec. Static checking proves only these
configured contracts. It does not prove application behavior, authorization,
persistence, deployment, or the evaluator-owned RSVP semantics.

## Common Invalid Shapes

The following alternatives are not aliases. Public parsers reject them with a
`schema.violation`; a configured project check reports the enclosing contract
as `contract.invalid`.

| Invalid shape | Required shape |
| --- | --- |
| top-level `"feature": "rsvp"` or `"id": "rsvp"` | `"feature": { "id": "rsvp" }` |
| action-level `"method"` and `"path"` | `"route": { "method": "POST", "path": "/rsvp" }` |
| JSON Schema `"type": "object"` and `"type": "string"` | Mensor IR `"kind": "object"` and `"kind": "string"` |
| bindings keyed by field name or missing `path` | a `bindings` array with one explicit `name`, `path`, and `decode` per property |

Do not weaken `unknownFields: "reject"` to make an invalid generated contract
pass. Correct the contract shape, then run the checker again.
