# Hono JSX FormIndex v1 Implementation Contract

- Status: Accepted fixture contract; extractor and CLI not implemented
- Output boundary: FormIndex v1, without a schema or public API change
- Fixtures: `fixtures/contracts/hono-jsx-v1/expectations.json`

## Scope

The next bounded Hono JSX producer remains explicit and parses source only.
It does not import or execute application modules, HonoX configuration, Vite
plugins or renderers. This contract does not enable TSX in the current compiler.

The first subset covers intrinsic forms, text/email/radio inputs, boolean
`required` and `disabled`, unnamed submit buttons, labels, fragments and
non-disabled fieldset/legend wrappers. Structural attributes are literal.
Disabled inputs and unnamed buttons are recorded but do not become submitted
fields. Radio controls sharing a name remain one mutually-exclusive field,
with every control preserved. `required` does not infer a validation schema.

Omitted and empty actions produce `current-document`; an explicit literal path
produces known action evidence. The existing feature contract must still name
the current document path. No route is inferred from a HonoX filename.

Dynamic siblings may be ignored only when their visible structure is entirely
intrinsic non-form content, such as a list of escaped text. This is not blanket
permission to skip siblings: custom components can create external controls,
and a literal `form` attribute can associate an outside control with this form.
Both are unsupported in v1. Expressions inside the form are not evaluated,
including apparently constant structural attribute expressions.

Disabled fieldset inheritance, other input kinds, select/textarea, nested
forms, external association, custom renderers, raw HTML, islands and client
submission semantics are outside this first subset. Add positive and failure
expectations before admitting any of these. Unrecognized syntax must not
silently become a complete empty document.

## Unsupported Evidence

Emit one incomplete document, an offending source range and no forms. Partial
form extraction is deferred. Existing consumers reject a linked incomplete
document with `form_index.inspection_incomplete`.

| Fixture | Existing FormIndex reason |
| --- | --- |
| `computed-attribute`, `spread-attribute` | `computed-attribute` |
| `conditional-control` | `conditional-presence` |
| `repeated-control` | `repeated-generation` |
| `custom-component`, `custom-sibling` | `custom-helper-semantics` |
| `external-association` | `unsupported-control-kind` |
| `file-input` | `file-input` |
| `named-submitter` | `named-submitter` |
| `route-override` | `submitter-route-override` |

For a repeated or conditional subtree, use its outer expression range rather
than a computed attribute inside it. For separate offending constructs, choose
the first in source order. Malformed source, invalid paths, resource limits and
unverified renderer activation remain explicit failures, never complete indices.

## Source And Canonicalization

- Use project-relative POSIX paths and SHA-256 of the exact UTF-8 source bytes.
- Reserve `mensor/hono-jsx` for the producer name and source kind. Fixtures use
  `0.0.0-fixture`, not a package release version.
- Ranges are zero-based UTF-16 line/character pairs with exclusive ends.
  Forms and controls use opening-element ranges, including self-closing tags.
- Explicit identity, method, action, name and type evidence uses its attribute
  range. Omitted actions and inferred boolean/multiplicity facts use the opening
  element. Explicit empty actions retain their attribute range.
- Preserve canonical FormIndex ordering and encoding. Input order and absolute
  checkout location must not change bytes. Do not emit host paths, timestamps,
  AST nodes, expressions or raw source.
- Preserve discovery, digest and range verification. Even a whitespace-only
  source edit invalidates an earlier index.

## Current Evidence

`packages/compiler/test/hono-jsx-contract.test.mjs` checks the hand-authored
expectations against the existing public schema, serializer, freshness checker
and semantic consumer. Supported ranges must match actual TypeScript JSX opening
nodes; a supplementary Unicode case distinguishes UTF-16 from code points.
Copies under two physical roots exercise canonical bytes, discovery rejection,
stale-source rejection and invalid ranges.

These tests validate the output oracle and consumer, not extraction. The actual
producer must process every fixture and match its complete expected output,
then repeat extraction under both roots. No placeholder or skipped extractor
tests are added. Normal compiler test discovery includes these contract tests.

## Separate Gates

The fixture contract and unchanged serialized boundary permit parser-level
implementation using the existing TypeScript dependency. CLI exposure still
requires tested explicit source selection, Hono renderer activation, malformed
source handling, path/size bounds and atomic output. Import spelling alone does
not prove the runtime selected by a project's JSX/build configuration.

Independent-agent provenance, exact model identity and access attestation govern
agent-evaluation claims, not deterministic parser correctness. Keep the local
trial's provenance limitations and never relabel it as attested. This removes
an irrelevant implementation blocker without weakening source-execution,
freshness, unsupported-syntax or renderer-activation boundaries.
